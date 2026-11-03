/* ==========================================================================
   particles.js
   KB.fx = the visual effects system:
     - particle bursts (explosions, sparks, confetti)
     - floating score text ("+50")
     - screen shake

   PARTICLE SYSTEM: every particle is a tiny object with its own position,
   velocity, life time and colour. Each frame we move it, shrink / fade it,
   and delete it when its life reaches zero.
   ========================================================================== */

KB.fx = {
  parts: [],        // active particles
  texts: [],        // active floating texts
  shakeMag: 0,      // current screen-shake strength in pixels

  /** Remove everything (called when a new game starts). */
  reset() {
    this.parts.length = 0;
    this.texts.length = 0;
    this.shakeMag = 0;
  },

  /**
   * Emit a burst of particles from (x, y).
   * Options: n (count), speed, life (seconds), size, gravity, colors[]
   */
  burst(x, y, o = {}) {
    const U = KB.util;
    const n = o.n || 18;
    const cols = o.colors || [KB.COLORS.yellow, KB.COLORS.orange, KB.COLORS.pink];
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, Math.PI * 2);               // random direction
      const s = U.rand(0.3, 1) * (o.speed || 200);    // random speed
      const life = U.rand(0.5, 1) * (o.life || 0.7);
      this.parts.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life, max: life,
        size: U.rand(0.6, 1.4) * (o.size || 3),
        color: U.pick(cols),
        g: o.gravity || 0
      });
    }
    // safety limit so the game never slows down
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
  },

  /** Show a floating text that rises and fades (e.g. "+120", "COMBO x10!"). */
  text(x, y, str, color = '#fff', size = 22) {
    this.texts.push({ x, y, str, color, size, t: 0, life: 0.9 });
  },

  /** Start / strengthen a screen shake. */
  shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); },

  /** Random camera offset for this frame (zero when no shake). */
  shakeOffset() {
    const m = this.shakeMag;
    if (m < 0.3) return [0, 0];
    return [(Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m];
  },

  /** Advance all effects by dt seconds. */
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += p.g * dt;                 // gravity
      p.vx *= 1 - dt * 1.2;             // air drag
      p.vy *= 1 - dt * 1.2;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t >= t.life) this.texts.splice(i, 1);
    }
    // shake fades out exponentially (smooth, frame-rate independent)
    this.shakeMag *= Math.exp(-8 * dt);
  },

  /** Draw all effects. */
  draw(ctx) {
    // Particles use ADDITIVE blending ('lighter'): overlapping particles
    // add their colours together, which makes a glowing fire / spark look.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const k = p.life / p.max;                       // 1 -> 0 over the life time
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.3, p.size * (0.4 + 0.6 * k)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Floating texts: rise with an ease-out curve and fade near the end.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.t / t.life;
      const y = t.y - 50 * KB.util.ease.outCubic(k);
      ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      ctx.font = `bold ${t.size}px "Trebuchet MS", Arial, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.strokeText(t.str, t.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, y);
    }
    ctx.restore();
  }
};
