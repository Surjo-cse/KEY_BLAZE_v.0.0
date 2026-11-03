/* ==========================================================================
   keyboard.js
   The on-screen virtual keyboard, drawn on the canvas.

   Features
     - keys are colour-coded by FINGER (teaches touch typing)
     - the next key to press glows and pulses (highlight)
     - a pressed key shrinks and flashes green (correct) or red (wrong)
     - "heat" mode colours each key from green to red by mistake rate
       (used for the weak-key heatmap on the result screen)
   ========================================================================== */

(function () {
  const U = KB.util;
  const C = KB.COLORS;

  const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const OFFS = [0, 0.5, 0.75, 1.25];   // how far each row is shifted right (in key units)

  // Which finger types which key, with a colour for each finger group.
  const FINGERS = [
    { name: 'left pinky',   color: C.pink,   keys: '1qaz' },
    { name: 'left ring',    color: C.orange, keys: '2wsx' },
    { name: 'left middle',  color: C.yellow, keys: '3edc' },
    { name: 'left index',   color: C.green,  keys: '45rtfgvb' },
    { name: 'right index',  color: C.cyan,   keys: '67yuhjnm' },
    { name: 'right middle', color: C.yellow, keys: '8ik' },
    { name: 'right ring',   color: C.orange, keys: '9ol' },
    { name: 'right pinky',  color: C.pink,   keys: '0p' },
    { name: 'thumb',        color: C.purple, keys: ' ' }
  ];

  function fingerOf(ch) { return FINGERS.find(f => f.keys.includes(ch)); }
  function heatColor(v) {
    if (v === undefined) return '#2A3358';            // key never used
    return U.mix(C.green, C.red, U.clamp(v, 0, 1));   // green (good) -> red (many mistakes)
  }

  KB.keyboard = {
    pressed: null,   // last pressed key: { ch, ok, t }

    /** Tell the keyboard a key was pressed (starts the flash animation). */
    press(ch, ok) { this.pressed = { ch, ok, t: 0 }; },

    /** Advance the flash animation. */
    update(dt) {
      if (this.pressed) {
        this.pressed.t += dt;
        if (this.pressed.t > 0.25) this.pressed = null;
      }
    },

    /** Human readable finger name for a key (shown in Lesson Lab). */
    fingerName(ch) { const f = fingerOf(ch); return f ? f.name : ''; },

    /**
     * Draw the keyboard.
     * @param x,y,w   top-left corner and total width in pixels
     * @param o.numbers  also draw the number row
     * @param o.highlight  character that should glow (the next key)
     * @param o.heat     { char: 0..1 } mistake rate, switches to heat colours
     */
    draw(ctx, x, y, w, o = {}) {
      const u = w / 11;                    // size of one key slot
      const ks = u * 0.9;                  // key size (a little smaller = gap)
      const now = performance.now() / 1000;
      const rows = o.numbers ? [0, 1, 2, 3] : [1, 2, 3];

      rows.forEach((r, ri) => {
        const str = ROWS[r];
        for (let c = 0; c < str.length; c++) {
          const ch = str[c];
          const kx = x + (OFFS[r] + c) * u + 0.25 * u;
          const ky = y + ri * u;
          this._key(ctx, ch, kx, ky, ks, ks, o, now);
        }
      });
      // space bar
      this._key(ctx, ' ', x + 3 * u, y + rows.length * u, 5 * u - u * 0.1, ks, o, now);
    },

    /** Draw one key (private helper). */
    _key(ctx, ch, x, y, w, h, o, now) {
      const f = fingerOf(ch);
      const isHi = o.highlight === ch;
      const pr = this.pressed && this.pressed.ch === ch ? this.pressed : null;

      let fill = o.heat ? heatColor(o.heat[ch]) : (f ? f.color : '#888');
      let alpha = 0.92;
      if (!o.heat && o.highlight && !isHi) alpha = 0.45;   // dim the others

      ctx.save();
      // pressed keys shrink slightly toward their centre
      let inset = 0;
      if (pr) inset = Math.min(w, h) * 0.08 * (1 - pr.t / 0.25);
      if (isHi) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 8);
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 12 + 12 * pulse;
        fill = '#ffffff';
        alpha = 1;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      U.rrect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, h * 0.2);
      ctx.fill();

      // green / red flash on top of a pressed key
      if (pr) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.8 * (1 - pr.t / 0.25);
        ctx.fillStyle = pr.ok ? C.green : C.red;
        U.rrect(ctx, x, y, w, h, h * 0.2);
        ctx.fill();
      }

      // label
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.navy;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (ch === ' ') {
        ctx.font = `bold ${h * 0.34}px Arial`;
        ctx.fillText('SPACE', x + w / 2, y + h / 2);
      } else {
        ctx.font = `bold ${h * 0.46}px Arial`;
        ctx.fillText(ch.toUpperCase(), x + w / 2, y + h / 2 + 1);
      }
      ctx.restore();
    }
  };
})();
