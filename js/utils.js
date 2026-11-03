/* ==========================================================================
   utils.js
   Shared helpers used by every other file.

   Everything in the game lives inside one global object called KB
   ("KeyBlaze"), e.g. KB.audio, KB.fx, KB.keyboard, KB.game.
   We use plain scripts instead of ES modules so the game runs even when you
   open index.html directly from the file system.
   ========================================================================== */

window.KB = window.KB || {};

// Logical canvas size. The canvas is always drawn at 960 x 600 and
// scaled by CSS, so game code never needs to care about the real screen size.
KB.W = 960;
KB.H = 600;

// Registry where every game mode registers itself: KB.modes.wordrain = class {...}
KB.modes = {};

// Colour palette (same colours as the proposal PDF)
KB.COLORS = {
  cyan: '#22D3EE', pink: '#F472B6', yellow: '#FACC15', green: '#4ADE80',
  purple: '#A78BFA', orange: '#FB923C', red: '#F87171', navy: '#0B1020'
};

KB.util = {
  /** Keep v between a and b. */
  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },

  /** Linear interpolation: t = 0 gives a, t = 1 gives b. */
  lerp(a, b, t) { return a + (b - a) * t; },

  /** Random float in [a, b). */
  rand(a, b) { return a + Math.random() * (b - a); },

  /** Random integer in [a, b] (both included). */
  randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },

  /** Random element of an array. */
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

  /** Distance between two points. */
  dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },

  /**
   * Easing functions: they take t in [0,1] and return a "curved" value in
   * about [0,1]. Used for tweening (smooth animation) of UI and effects.
   */
  ease: {
    linear: t => t,
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    // outBack overshoots a little and settles: great for "pop" animations
    outBack: t => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
  },

  /**
   * Seeded random number generator (mulberry32). The same seed always gives
   * the same sequence, which we use for the Daily Challenge text and for the
   * fixed city skyline.
   */
  seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  /** '#RRGGBB' -> [r, g, b] */
  hex(c) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },

  /** Blend two hex colours. t = 0 -> c1, t = 1 -> c2. Returns 'rgb(...)'. */
  mix(c1, c2, t) {
    const a = KB.util.hex(c1), b = KB.util.hex(c2);
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
  },

  /** Hex colour + alpha -> 'rgba(...)'. */
  alpha(c, a) {
    const [r, g, b] = KB.util.hex(c);
    return `rgba(${r},${g},${b},${a})`;
  },

  /** Adds a rounded rectangle path to the context (does not fill it). */
  rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
};

// A hidden canvas context used only to measure text width.
const _measureCtx = document.createElement('canvas').getContext('2d');

/** Width in pixels of `text` drawn with the CSS font string `font`. */
KB.measure = function (font, text) {
  _measureCtx.font = font;
  return _measureCtx.measureText(text).width;
};
