/* ==========================================================================
   modes/boss.js  -  BOSS BATTLE
   Type whole sentences to damage a giant robot before the timer runs out.
     - every correct letter hurts the boss
     - finishing a sentence gives a big bonus hit
     - every mistake HEALS the boss a little (so accuracy matters)

   Computer graphics concepts used here
     - the boss is drawn only with shapes (rectangles, circles, gradients)
     - idle animation with sine waves (bobbing, waving arms, pulsing core)
     - tweening: the health bar smoothly slides to its new value
     - hit reaction: scale "punch" + white flash; explosion when defeated
   ========================================================================== */

(function () {
  const { W, H } = KB;
  const U = KB.util, C = KB.COLORS;

  const CFG = { easy: { hp: 90, time: 80 }, medium: { hp: 100, time: 70 }, hard: { hp: 120, time: 60 } };

  KB.modes.boss = class {
    constructor(opts) {
      this.diff = opts.difficulty;
      const cfg = CFG[this.diff] || CFG.medium;
      this.max = cfg.hp;
      this.hp = cfg.hp;                                  // real health
      this.disp = cfg.hp;                                // displayed health (eases toward hp)
      this.timeLeft = cfg.time;
      this.t = 0;                                        // animation clock
      this.hit = 0;                                      // hit-flash timer
      this.dying = false; this.deathT = 0;
      this.finished = false; this.won = false;
      this.lastSentence = '';
      this.newSentence();
      this.stars = new KB.Starfield();
    }

    newSentence() {
      const s = KB.words.sentence(this.diff, this.lastSentence);
      this.lastSentence = s;
      this.block = new KB.TextBlock(s, 46);
    }

    nextKey() { return this.dying ? null : this.block.current(); }

    damage(n) {
      this.hp = Math.max(0, this.hp - n);
      if (this.hp <= 0 && !this.dying) { this.dying = true; this.deathT = 0; KB.audio.boom(); }
    }

    onKey(ch) {
      if (this.dying) return;
      if (ch === this.block.current()) {
        KB.game.press(ch, true);
        this.block.advance();
        this.damage(0.9);
        this.hit = 0.15;
        KB.fx.burst(W / 2 + U.rand(-60, 60), 190 + U.rand(-30, 30), { n: 4, speed: 140, life: 0.4, colors: [C.cyan, '#fff'] });
        if (this.block.done()) {                          // sentence finished = big hit
          const pts = KB.game.stats.bonus(60);
          this.damage(6);
          KB.fx.text(W / 2, 310, 'SENTENCE!  +' + pts, C.yellow, 26);
          KB.fx.shake(8);
          KB.audio.word();
          this.newSentence();
        }
      } else {
        KB.game.press(ch, false);
        this.block.wrong();
        this.hp = Math.min(this.max, this.hp + 1.5);      // the boss heals
      }
    }

    update(dt) {
      this.t += dt;
      this.stars.update(dt, 0.4);
      this.block.update(dt);
      if (this.hit > 0) this.hit -= dt;
      // TWEENING: the displayed bar moves a fraction of the way each frame
      this.disp += (this.hp - this.disp) * Math.min(1, dt * 6);

      if (this.dying) {
        this.deathT += dt;
        if (Math.random() < 0.5)
          KB.fx.burst(W / 2 + U.rand(-90, 90), 190 + U.rand(-70, 70), { n: 18, speed: 260, life: 0.8, size: 4, colors: [C.orange, C.yellow, C.pink, '#fff'] });
        if (this.deathT > 2) { this.finished = true; this.won = true; this.resultTitle = 'Boss defeated!'; }
        return;
      }
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.finished = true; this.won = false; this.resultTitle = "Time's up!"; }
    }

    /** The robot boss, drawn from simple shapes. */
    drawBoss(ctx) {
      const enraged = this.hp < this.max * 0.35;         // eyes turn red when almost defeated
      const bob = Math.sin(this.t * 2) * 6;               // idle bobbing (sine wave)
      let scale = 1 + (this.hit > 0 ? this.hit * 1.0 : 0);  // "punch" scale on hit
      let alpha = 1, jitter = 0;
      if (this.dying) {                                    // fall apart while exploding
        alpha = Math.max(0, 1 - this.deathT / 2);
        jitter = Math.sin(this.t * 60) * 5;
      }
      const flash = this.hit > 0 ? this.hit / 0.15 : 0;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(W / 2 + jitter, 212 + bob);
      ctx.scale(scale, scale);

      // arms wave (rotation animated with sin)
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * 105, -10);
        ctx.rotate(side * (0.25 + Math.sin(this.t * 3 + side) * 0.18));
        ctx.fillStyle = U.mix('#5B3FA8', '#ffffff', flash * 0.7);
        U.rrect(ctx, -14, 0, 28, 80, 12); ctx.fill();
        ctx.fillStyle = C.pink; ctx.beginPath(); ctx.arc(0, 86, 18, 0, 6.28); ctx.fill();
        ctx.restore();
      }
      // body
      const bg = ctx.createLinearGradient(0, -20, 0, 80);
      bg.addColorStop(0, U.mix('#7C3AED', '#ffffff', flash * 0.7));
      bg.addColorStop(1, U.mix('#3B1D8A', '#ffffff', flash * 0.7));
      ctx.fillStyle = bg;
      U.rrect(ctx, -95, -20, 190, 105, 22); ctx.fill();
      // glowing core in the chest
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 5);
      ctx.save();
      ctx.shadowColor = enraged ? C.red : C.cyan; ctx.shadowBlur = 20 * pulse;
      ctx.fillStyle = enraged ? C.red : C.cyan;
      ctx.beginPath(); ctx.arc(0, 38, 17 + pulse * 3, 0, 6.28); ctx.fill();
      ctx.restore();
      // head
      ctx.fillStyle = U.mix('#9F7AEA', '#ffffff', flash * 0.7);
      U.rrect(ctx, -68, -95, 136, 80, 20); ctx.fill();
      // antenna
      ctx.strokeStyle = '#C4B5FD'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, -95); ctx.lineTo(0, -122); ctx.stroke();
      ctx.fillStyle = C.yellow;
      ctx.beginPath(); ctx.arc(0, -126, 7 + Math.sin(this.t * 6) * 1.5, 0, 6.28); ctx.fill();
      // eyes follow a slow circle
      for (const ex of [-26, 26]) {
        ctx.fillStyle = '#0B1020';
        ctx.beginPath(); ctx.arc(ex, -58, 15, 0, 6.28); ctx.fill();
        ctx.fillStyle = enraged ? C.red : C.cyan;
        ctx.beginPath(); ctx.arc(ex + Math.cos(this.t) * 4, -58 + Math.sin(this.t) * 3, 8, 0, 6.28); ctx.fill();
      }
      // mouth grill
      ctx.fillStyle = '#0B1020';
      U.rrect(ctx, -30, -34, 60, 14, 5); ctx.fill();
      ctx.strokeStyle = '#7C3AED'; ctx.lineWidth = 2;
      for (let i = -20; i <= 20; i += 10) { ctx.beginPath(); ctx.moveTo(i, -34); ctx.lineTo(i, -20); ctx.stroke(); }
      ctx.restore();
    }

    draw(ctx) {
      KB.bg(ctx, '#12072E', '#2A1060');
      this.stars.draw(ctx);

      // glowing floor
      const fg = ctx.createRadialGradient(W / 2, 290, 10, W / 2, 290, 260);
      fg.addColorStop(0, 'rgba(167,139,250,.35)'); fg.addColorStop(1, 'rgba(167,139,250,0)');
      ctx.fillStyle = fg; ctx.fillRect(0, 200, W, 160);

      this.drawBoss(ctx);

      // health bar: the pale bar behind shows damage "draining" away
      const bx = 180, by = 54, bw = 600, bh = 18;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; U.rrect(ctx, bx, by, bw, bh, 10); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      U.rrect(ctx, bx, by, Math.max(2, bw * this.disp / this.max), bh, 10); ctx.fill();
      const ratio = this.hp / this.max;
      ctx.fillStyle = ratio > 0.5 ? C.green : (ratio > 0.25 ? C.yellow : C.red);
      U.rrect(ctx, bx, by, Math.max(2, bw * ratio), bh, 10); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; U.rrect(ctx, bx, by, bw, bh, 10); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('BOSS  GLITCH-9', W / 2, by + bh / 2 + 1);

      // sentence panel
      ctx.fillStyle = 'rgba(8,12,34,.8)';
      U.rrect(ctx, 80, 328, 800, 108, 18); ctx.fill();
      ctx.strokeStyle = C.pink; ctx.lineWidth = 2; ctx.stroke();
      const first = Math.min(this.block.lineOfPos(), Math.max(0, this.block.lines.length - 2));
      this.block.draw(ctx, W / 2, 362, { first, count: 2, lineH: 48 });
    }
  };
})();
