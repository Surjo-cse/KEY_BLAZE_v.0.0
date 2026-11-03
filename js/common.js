/* ==========================================================================
   common.js
   Reusable building blocks shared by several game modes:

     KB.bg(...)          vertical gradient background
     KB.Starfield        parallax star layers (stars at different speeds = depth)
     KB.TargetTyper      decides which falling word the player is typing
     KB.TextBlock        a wrapped sentence/paragraph that is typed char by char
     KB.drawHeart(...)   heart icon for lives
   ========================================================================== */

(function () {
  const U = KB.util;
  const { W, H } = KB;

  /** Fill the whole canvas with a top->bottom gradient. */
  KB.bg = function (ctx, top, bottom) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    // slightly larger than the canvas so screen shake never shows empty edges
    ctx.fillRect(-30, -30, W + 60, H + 60);
  };

  /** Heart shape (used for lives in the HUD). */
  KB.drawHeart = function (ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 20, s / 20);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.bezierCurveTo(-14, -4, -8, -14, 0, -6);
    ctx.bezierCurveTo(8, -14, 14, -4, 0, 6);
    ctx.fill();
    ctx.restore();
  };

  /**
   * PARALLAX STARFIELD
   * Several layers of stars scroll downward at different speeds. Slow layers
   * look far away, fast layers look close, which creates a feeling of depth.
   */
  KB.Starfield = class {
    constructor(layers) {
      layers = layers || [
        { n: 40, speed: 12, size: 1,   alpha: 0.4 },
        { n: 25, speed: 30, size: 1.6, alpha: 0.7 },
        { n: 12, speed: 70, size: 2.2, alpha: 0.95 }
      ];
      this.layers = layers.map(l => Object.assign({}, l, {
        stars: Array.from({ length: l.n }, () => ({ x: U.rand(0, W), y: U.rand(0, H) }))
      }));
    }
    update(dt, mul = 1) {
      for (const l of this.layers) {
        for (const s of l.stars) {
          s.y += l.speed * mul * dt;
          if (s.y > H) { s.y -= H; s.x = U.rand(0, W); }
        }
      }
    }
    draw(ctx) {
      for (const l of this.layers) {
        ctx.fillStyle = `rgba(255,255,255,${l.alpha})`;
        for (const s of l.stars) ctx.fillRect(s.x, s.y, l.size, l.size);
      }
    }
  };

  /**
   * TARGET TYPER
   * Used by Word Rain and Asteroid Blaster where many words are visible at
   * once. Logic:
   *   1. If no word is "locked", the first key chooses a word that starts
   *      with that letter.
   *   2. After that, every key must match the next letter of the locked word.
   *   3. A wrong key counts as an error (the lock stays).
   *   4. When the last letter is typed, the word is finished and unlocked.
   * Targets are plain objects: { word, typed, dead, ... }
   */
  KB.TargetTyper = class {
    constructor() { this.active = null; }

    /** `sortFn` decides which word wins when several start with the same letter. */
    key(ch, targets, sortFn) {
      if (this.active && (this.active.dead || !targets.includes(this.active))) this.active = null;

      if (!this.active) {
        const cands = targets.filter(t => !t.dead && t.word[0] === ch);
        if (!cands.length) return { ok: false };         // no word starts with this key
        if (sortFn) cands.sort(sortFn);
        this.active = cands[0];
      }

      const t = this.active;
      if (t.word[t.typed] === ch) {
        t.typed++;
        if (t.typed >= t.word.length) {                  // word complete
          this.active = null;
          return { ok: true, done: true, target: t };
        }
        return { ok: true, done: false, target: t };
      }
      return { ok: false, target: t };                   // wrong letter
    }
  };

  /**
   * TEXT BLOCK
   * A sentence or paragraph, word-wrapped into lines, typed one character at
   * a time. Used by Boss Battle and Daily Challenge.
   */
  KB.TextBlock = class {
    constructor(text, maxChars) {
      this.text = text;
      this.pos = 0;            // index of the next character to type
      this.wrongT = 0;         // seconds left of the red "wrong" flash
      this.lines = [];         // [{ s: startIndex, e: endIndexExclusive }]

      // simple word wrap
      const words = text.split(' ');
      let idx = 0, line = null;
      for (const w of words) {
        if (line && (line.e - line.s + w.length) > maxChars) { this.lines.push(line); line = null; }
        if (!line) line = { s: idx, e: idx };
        line.e += w.length; idx += w.length;
        if (idx < text.length) { line.e += 1; idx += 1; }   // the space after the word
      }
      this.lines.push(line);
    }

    current() { return this.text[this.pos]; }
    advance() { this.pos++; }
    done() { return this.pos >= this.text.length; }
    wrong() { this.wrongT = 0.25; }
    update(dt) { if (this.wrongT > 0) this.wrongT -= dt; }

    /** Index of the line that contains the current character. */
    lineOfPos() {
      const p = Math.min(this.pos, this.text.length - 1);
      return Math.max(0, this.lines.findIndex(l => p >= l.s && p < l.e));
    }

    /**
     * Draw lines [first, first + count) centred around cx, starting at y.
     * Typed characters are green, the current one has a pulsing box.
     */
    draw(ctx, cx, y, o = {}) {
      const font = o.font || 'bold 26px Consolas, "Courier New", monospace';
      const lineH = o.lineH || 40;
      const first = o.first || 0;
      const count = o.count || this.lines.length;
      const cw = KB.measure(font, 'M');                  // monospace: every char has this width
      const now = performance.now() / 1000;

      ctx.save();
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let li = first; li < Math.min(this.lines.length, first + count); li++) {
        const line = this.lines[li];
        const str = this.text.slice(line.s, line.e).replace(/ $/, '');
        const x0 = cx - (str.length * cw) / 2;
        const ly = y + (li - first) * lineH;

        for (let k = 0; k < line.e - line.s; k++) {
          const i = line.s + k;
          const ch = this.text[i];
          const px = x0 + k * cw + cw / 2;

          if (i === this.pos) {
            // cursor box under the current character
            const bad = this.wrongT > 0;
            ctx.fillStyle = bad ? 'rgba(248,113,113,.65)' : `rgba(34,211,238,${0.28 + 0.15 * Math.sin(now * 8)})`;
            U.rrect(ctx, px - cw / 2 - 1, ly - lineH * 0.42, cw + 2, lineH * 0.84, 6);
            ctx.fill();
          }
          if (ch === ' ') continue;
          ctx.fillStyle = i < this.pos ? KB.COLORS.green : (i === this.pos ? '#ffffff' : '#C9D2F0');
          ctx.fillText(ch, px, ly + 1);
        }
      }
      ctx.restore();
    }
  };
})();
