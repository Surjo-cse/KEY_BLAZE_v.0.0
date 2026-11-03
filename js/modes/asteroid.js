/* ==========================================================================
   modes/asteroid.js  -  ASTEROID BLASTER
   Asteroids fly toward your spaceship. Every correct letter fires a laser
   at the asteroid you are typing; finish the word and it explodes.
   3 lives, 75 seconds.

   Computer graphics concepts used here
     - 2D transformations: asteroids ROTATE, the ship ROTATES to aim at its
       target (ctx.translate + ctx.rotate)
     - collision detection: circle vs circle (asteroid vs ship)
     - homing laser bullets
     - particle explosions + screen shake
     - parallax star layers
   ========================================================================== */

(function () {
  const { W, H } = KB;
  const U = KB.util, C = KB.COLORS;

  const FONT = 'bold 18px "Trebuchet MS", Arial, sans-serif';
  const SHIP = { x: W / 2, y: 405, r: 24 };             // ship position and collision radius
  const CFG = { easy: { speed: 30, gap: 3.2 }, medium: { speed: 42, gap: 2.6 }, hard: { speed: 58, gap: 2.1 } };

  KB.modes.asteroid = class {
    constructor(opts) {
      this.diff = opts.difficulty;
      this.cfg = CFG[this.diff] || CFG.medium;
      this.rocks = [];                                   // asteroids
      this.bullets = [];                                 // laser shots
      this.typer = new KB.TargetTyper();
      this.spawnT = 0.6; this.time = 0;
      this.lives = 3; this.maxLives = 3;
      this.timeLeft = 75;
      this.angle = 0;                                    // ship rotation (0 = pointing up)
      this.finished = false; this.won = false;
      // three parallax layers; the fast one is drawn "closer" to the camera
      this.stars = new KB.Starfield();
    }

    nextKey() {
      const a = this.typer.active;
      return a ? a.word[a.typed] : null;
    }

    spawn() {
      const used = new Set(this.rocks.filter(r => !r.dead).map(r => r.word[0]));
      const word = KB.words.pick(this.diff, used);
      const r = 22 + word.length * 2.5;                  // longer word = bigger rock
      // starts just below the HUD and fades in (age goes 0 -> 1 in 0.5 s)
      const x = U.rand(70, W - 70), y = 58 + r;
      // fly toward the ship (with a little random offset)
      const tx = SHIP.x + U.rand(-90, 90), ty = SHIP.y;
      const d = Math.hypot(tx - x, ty - y);
      const sp = this.cfg.speed * U.rand(0.85, 1.15);
      this.rocks.push({
        word, typed: 0, dead: false, x, y, r, age: 0,
        vx: (tx - x) / d * sp, vy: (ty - y) / d * sp,
        rot: U.rand(0, 6.28), vr: U.rand(-1, 1),         // rotation angle and rotation speed
        // irregular outline: 11 radius multipliers
        shape: Array.from({ length: 11 }, () => U.rand(0.82, 1.1)),
        craters: Array.from({ length: 3 }, () => ({ a: U.rand(0, 6.28), d: U.rand(0.1, 0.55), s: U.rand(0.1, 0.22) })),
        w: KB.measure(FONT, word)
      });
    }

    update(dt) {
      this.time += dt;
      this.timeLeft -= dt;
      const ramp = 1 + this.time / 90;
      this.stars.update(dt, 1.5);

      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawn(); this.spawnT = this.cfg.gap / ramp; }

      for (const a of this.rocks) {
        a.x += a.vx * ramp * dt;
        a.y += a.vy * ramp * dt;
        a.rot += a.vr * dt;
        a.age += dt;
        // COLLISION DETECTION: two circles touch when the distance between
        // their centres is smaller than the sum of their radii.
        if (!a.dead && U.dist(a.x, a.y, SHIP.x, SHIP.y) < a.r + SHIP.r) {
          a.dead = true;
          this.lives--;
          KB.game.stats.breakCombo();
          KB.fx.burst(a.x, a.y, { n: 36, speed: 300, life: 0.9, colors: [C.red, C.orange, C.yellow] });
          KB.fx.shake(14);
          KB.audio.boom();
          KB.game.flash(0.4);
        }
      }
      this.rocks = this.rocks.filter(a => !a.dead);

      // the ship smoothly turns toward the word being typed
      const tgt = this.typer.active;
      let want = 0;
      if (tgt && !tgt.dead) want = Math.atan2(tgt.x - SHIP.x, SHIP.y - tgt.y);
      this.angle += (want - this.angle) * Math.min(1, dt * 10);

      // laser bullets home in on their target
      for (const b of this.bullets) {
        const dx = b.t.x - b.x, dy = b.t.y - b.y, d = Math.hypot(dx, dy), step = 1100 * dt;
        if (d <= step) {
          b.hit = true;
          KB.fx.burst(b.t.x, b.t.y, { n: 8, speed: 160, life: 0.4, colors: [C.green, '#fff'] });
        } else { b.x += dx / d * step; b.y += dy / d * step; }
      }
      this.bullets = this.bullets.filter(b => !b.hit);

      if (this.lives <= 0) { this.finished = true; this.won = false; this.resultTitle = 'Ship destroyed!'; }
      else if (this.timeLeft <= 0) { this.finished = true; this.won = true; this.resultTitle = 'Sector cleared!'; }
    }

    onKey(ch) {
      if (ch === ' ') return;
      // when several words share a first letter, the closest asteroid to the ship wins
      const r = this.typer.key(ch, this.rocks, (a, b) => b.y - a.y);
      KB.game.press(ch, r.ok);
      if (!r.ok) return;
      const t = r.target;
      // fire a laser from the ship tip
      this.bullets.push({ x: SHIP.x + Math.sin(this.angle) * 30, y: SHIP.y - Math.cos(this.angle) * 30, t });
      if (r.done) {
        t.dead = true;
        const pts = KB.game.stats.bonus(t.word.length * 10);
        KB.fx.burst(t.x, t.y, { n: 40, speed: 280, life: 0.9, size: 3.5, colors: [C.orange, C.yellow, C.pink, '#fff'] });
        KB.fx.text(t.x, t.y - t.r - 10, '+' + pts, C.yellow, 24);
        KB.fx.shake(6);
        KB.audio.boom();
      }
    }

    /** Draw one asteroid with rotation (2D transformation). */
    drawRock(ctx, a) {
      ctx.save();
      ctx.translate(a.x, a.y);        // 1. move the origin to the asteroid centre
      ctx.rotate(a.rot);              // 2. rotate everything drawn after this
      const g = ctx.createRadialGradient(-a.r * 0.3, -a.r * 0.3, a.r * 0.1, 0, 0, a.r * 1.1);
      g.addColorStop(0, '#9B86C9');
      g.addColorStop(1, '#4A3B78');
      ctx.fillStyle = g;
      ctx.beginPath();
      a.shape.forEach((m, i) => {
        const ang = (i / a.shape.length) * Math.PI * 2;
        const px = Math.cos(ang) * a.r * m, py = Math.sin(ang) * a.r * m;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      for (const c of a.craters) {
        ctx.beginPath();
        ctx.arc(Math.cos(c.a) * a.r * c.d, Math.sin(c.a) * a.r * c.d, a.r * c.s, 0, 6.28);
        ctx.fill();
      }
      ctx.restore();
    }

    draw(ctx) {
      KB.bg(ctx, '#070B22', '#241468');
      this.stars.draw(ctx);

      const active = this.typer.active;
      for (const a of this.rocks) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, a.age / 0.5);         // fade-in
        this.drawRock(ctx, a);
        if (a === active) {                                // glow ring around the target
          ctx.strokeStyle = C.cyan; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(a.x, a.y, a.r + 8, 0, 6.28); ctx.stroke();
        }
        // word label under the asteroid
        const ly = a.y + a.r + 16;
        ctx.font = FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(8,12,34,.8)';
        U.rrect(ctx, a.x - a.w / 2 - 8, ly - 13, a.w + 16, 26, 13); ctx.fill();
        const typed = a.word.slice(0, a.typed);
        ctx.fillStyle = C.green; ctx.fillText(typed, a.x - a.w / 2, ly + 1);
        ctx.fillStyle = '#fff';  ctx.fillText(a.word.slice(a.typed), a.x - a.w / 2 + KB.measure(FONT, typed), ly + 1);
        ctx.restore();
      }

      // laser bullets (glowing line segments)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const b of this.bullets) {
        ctx.strokeStyle = C.green; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - (b.x - SHIP.x) * 0.06, b.y - (b.y - SHIP.y) * 0.06); ctx.stroke();
      }
      ctx.restore();

      // the ship (rotated to aim)
      ctx.save();
      ctx.translate(SHIP.x, SHIP.y);
      ctx.rotate(this.angle);
      // engine flame flickers randomly
      ctx.fillStyle = C.orange;
      ctx.beginPath(); ctx.moveTo(-7, 14); ctx.lineTo(0, 26 + Math.random() * 12); ctx.lineTo(7, 14); ctx.fill();
      const g = ctx.createLinearGradient(0, -30, 0, 18);
      g.addColorStop(0, '#7BE8FF'); g.addColorStop(1, '#168BA6');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -30); ctx.lineTo(19, 18); ctx.lineTo(0, 9); ctx.lineTo(-19, 18);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0B1020';
      ctx.beginPath(); ctx.arc(0, -4, 5, 0, 6.28); ctx.fill();
      ctx.restore();
    }
  };
})();
