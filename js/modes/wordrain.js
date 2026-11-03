/* ==========================================================================
   modes/wordrain.js  -  WORD RAIN
   Words fall from the sky. Type each word before it hits the ground to
   protect the city. You have 5 lives and 75 seconds.

   Graphics ideas used here
     - parallax stars + rain streaks (different speeds)
     - procedural city skyline (generated from a seeded random generator)
     - falling words speed up over time (difficulty ramp)
   ========================================================================== */

(function () {
  const { W, H } = KB;
  const U = KB.util, C = KB.COLORS;

  const GROUND = 432;                                   // y position of the ground line
  const FONT = 'bold 20px "Trebuchet MS", Arial, sans-serif';
  const PALETTE = [C.cyan, C.pink, C.yellow, C.green, C.purple, C.orange];
  // fall speed (pixels / second) and seconds between new words, per difficulty
  const CFG = { easy: { speed: 34, gap: 2.8 }, medium: { speed: 48, gap: 2.2 }, hard: { speed: 66, gap: 1.7 } };

  KB.modes.wordrain = class {
    constructor(opts) {
      this.diff = opts.difficulty;
      this.cfg = CFG[this.diff] || CFG.medium;
      this.targets = [];                                // words currently falling
      this.typer = new KB.TargetTyper();
      this.spawnT = 0.5;                                // time until the next word
      this.time = 0;
      this.lives = 5; this.maxLives = 5;
      this.timeLeft = 75;
      this.finished = false; this.won = false;
      this.stars = new KB.Starfield();

      // rain streaks
      this.rain = Array.from({ length: 60 }, () => ({
        x: U.rand(0, W), y: U.rand(0, GROUND), l: U.rand(8, 20), v: U.rand(250, 450)
      }));

      // city skyline: made once with a seeded RNG so it is always the same
      const rnd = KB.util.seeded(42);
      this.city = [];
      for (let i = 0; i < 18; i++) {
        const w = 40 + rnd() * 20, h = 30 + rnd() * 70, x = i * 54 - 8;
        const wins = [];
        for (let wy = GROUND - h + 8; wy < GROUND - 8; wy += 12)
          for (let wx = x + 6; wx < x + w - 8; wx += 11) wins.push({ x: wx, y: wy, on: rnd() > 0.45 });
        this.city.push({ x, w, h, wins });
      }
    }

    nextKey() {
      const a = this.typer.active;
      return a ? a.word[a.typed] : null;
    }

    /** Add a new falling word. */
    spawn() {
      // letters already used by words on screen are avoided
      const used = new Set(this.targets.filter(t => !t.dead).map(t => t.word[0]));
      const word = KB.words.pick(this.diff, used);
      const w = KB.measure(FONT, word);
      this.targets.push({
        word, typed: 0, dead: false, w,
        // starts just below the HUD and fades in (age goes 0 -> 1 in 0.4 s)
        x: U.rand(30, W - 30 - w), y: 70, age: 0,
        vy: this.cfg.speed * U.rand(0.85, 1.15),
        color: U.pick(PALETTE)
      });
    }

    update(dt) {
      this.time += dt;
      this.timeLeft -= dt;
      this.stars.update(dt, 0.5);
      for (const d of this.rain) { d.y += d.v * dt; if (d.y > GROUND) { d.y = -20; d.x = U.rand(0, W); } }

      // difficulty ramps up: words fall faster and appear more often
      const ramp = 1 + this.time / 90;
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawn(); this.spawnT = this.cfg.gap / ramp; }

      for (const t of this.targets) {
        t.age += dt;
        t.y += t.vy * ramp * dt;
        if (t.y >= GROUND && !t.dead) {                  // reached the ground
          t.dead = true;
          this.lives--;
          KB.game.stats.breakCombo();
          KB.fx.burst(t.x + t.w / 2, GROUND, { n: 26, speed: 260, colors: [C.red, C.orange, C.yellow] });
          KB.fx.shake(9);
          KB.audio.boom();
          KB.game.flash(0.35);
        }
      }
      this.targets = this.targets.filter(t => !t.dead);

      if (this.lives <= 0) { this.finished = true; this.won = false; this.resultTitle = 'The city fell!'; }
      else if (this.timeLeft <= 0) { this.finished = true; this.won = true; this.resultTitle = 'City saved!'; }
    }

    onKey(ch) {
      if (ch === ' ') return;
      // when several words start with the same letter, the lowest one wins
      const r = this.typer.key(ch, this.targets, (a, b) => b.y - a.y);
      KB.game.press(ch, r.ok);
      if (r.ok && r.done) {
        const t = r.target;
        t.dead = true;
        const pts = KB.game.stats.bonus(t.word.length * 8);
        KB.fx.burst(t.x + t.w / 2, t.y, { n: 22, speed: 220, colors: [t.color, '#fff'] });
        KB.fx.text(t.x + t.w / 2, t.y - 20, '+' + pts, C.yellow);
        KB.audio.word();
      }
    }

    draw(ctx) {
      KB.bg(ctx, '#0A1030', '#1B1450');
      this.stars.draw(ctx);

      // rain
      ctx.strokeStyle = 'rgba(150,190,255,.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const d of this.rain) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2, d.y + d.l); }
      ctx.stroke();

      // city skyline
      for (const b of this.city) {
        ctx.fillStyle = '#10163A';
        ctx.fillRect(b.x, GROUND - b.h, b.w, b.h);
        for (const w of b.wins) {
          ctx.fillStyle = w.on ? 'rgba(250,204,21,.75)' : 'rgba(255,255,255,.07)';
          ctx.fillRect(w.x, w.y, 6, 7);
        }
      }
      // ground
      ctx.fillStyle = '#080B1E';
      ctx.fillRect(-30, GROUND, W + 60, H - GROUND + 30);
      ctx.fillStyle = C.red;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(-30, GROUND, W + 60, 2);
      ctx.globalAlpha = 1;

      // falling words
      ctx.font = FONT;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      for (const t of this.targets) {
        const active = this.typer.active === t;
        const danger = t.y > GROUND - 90;
        const bx = t.x - 12, by = t.y - 17, bw = t.w + 24, bh = 34;
        ctx.save();
        ctx.globalAlpha = Math.min(1, t.age / 0.4);        // fade-in
        if (active) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 16; }
        ctx.fillStyle = 'rgba(10,16,40,.88)';
        U.rrect(ctx, bx, by, bw, bh, 17); ctx.fill();
        ctx.lineWidth = active ? 3 : 2;
        ctx.strokeStyle = danger ? C.red : (active ? '#fff' : t.color);
        ctx.stroke();
        // typed letters are green, remaining letters white
        const typed = t.word.slice(0, t.typed), rest = t.word.slice(t.typed);
        ctx.shadowBlur = 0;
        ctx.fillStyle = C.green;
        ctx.fillText(typed, t.x, t.y + 1);
        ctx.fillStyle = '#fff';
        ctx.fillText(rest, t.x + KB.measure(FONT, typed), t.y + 1);
        ctx.restore();
      }
    }
  };
})();
