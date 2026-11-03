/* ==========================================================================
   modes/lesson.js  -  LESSON LAB
   Step-by-step practice of one group of keys (e.g. the home row).

   How it works
     - A short drill (3-5 keys) is shown as big tiles.
     - The key to press next glows on the big on-screen keyboard and the
       game tells you which finger to use.
     - Complete 15 drills to finish the lesson.

   Every game mode is a class with the same small "interface":
     constructor(opts)  set up the mode
     update(dt)         move things (dt = seconds since the last frame)
     draw(ctx)          draw the scene
     onKey(ch)          the player pressed a key
     nextKey()          which key should glow on the keyboard (or null)
     finished / won     set to true when the mode is over
   ========================================================================== */

KB.modes.lesson = class {
  constructor(opts) {
    const { W } = KB;
    this.lesson = KB.lessons[opts.lesson] || KB.lessons[0];
    this.total = 15;                         // drills needed to finish
    this.done = 0;                           // drills completed so far
    this.pos = 0;                            // position inside the current drill
    this.drill = KB.words.drill(this.lesson.keys);
    this.anim = 0;                           // 0 -> 1 slide-in animation of a new drill
    this.shakeT = 0;                         // tiles wobble after a wrong key
    this.stars = new KB.Starfield();
    this.finished = false;
    this.won = true;
    this.resultTitle = 'Lesson Complete!';
    // big keyboard with the number row, no dark strip behind it
    this.kbd = { x: (W - 520) / 2, y: 340, w: 520, numbers: true, strip: false };
  }

  nextKey() { return this.drill[this.pos]; }

  update(dt) {
    this.stars.update(dt);
    this.anim = Math.min(1, this.anim + dt * 3.5);
    if (this.shakeT > 0) this.shakeT -= dt;
  }

  onKey(ch) {
    const { W } = KB;
    const need = this.drill[this.pos];
    if (ch === need) {
      KB.game.press(ch, true);
      // small spark above the tile that was just typed
      const n = this.drill.length, tileW = 64, gap = 14;
      const x0 = W / 2 - (n * (tileW + gap) - gap) / 2;
      KB.fx.burst(x0 + this.pos * (tileW + gap) + tileW / 2, 200, { n: 10, speed: 140, colors: [KB.COLORS.green, '#fff'] });
      this.pos++;
      if (this.pos >= this.drill.length) {          // drill finished
        this.done++;
        const pts = KB.game.stats.bonus(30);
        KB.fx.text(W / 2, 140, '+' + pts, KB.COLORS.yellow, 28);
        KB.audio.word();
        if (this.done >= this.total) { this.finished = true; return; }
        this.drill = KB.words.drill(this.lesson.keys);
        this.pos = 0;
        this.anim = 0;                              // restart slide-in animation
      }
    } else {
      KB.game.press(ch, false);
      this.shakeT = 0.25;
    }
  }

  draw(ctx) {
    const { W, H } = KB;
    const U = KB.util, C = KB.COLORS;
    KB.bg(ctx, '#0B1030', '#1A1450');
    this.stars.draw(ctx);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // title + progress bar
    ctx.fillStyle = C.green;
    ctx.font = 'bold 26px "Trebuchet MS", Arial';
    ctx.fillText('Lesson: ' + this.lesson.name, W / 2, 84);
    const bw = 360, bx = W / 2 - bw / 2;
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    U.rrect(ctx, bx, 104, bw, 10, 5); ctx.fill();
    ctx.fillStyle = C.green;
    U.rrect(ctx, bx, 104, Math.max(10, bw * (this.done / this.total)), 10, 5); ctx.fill();
    ctx.fillStyle = '#AEB7D6';
    ctx.font = '13px Arial';
    ctx.fillText(`Drill ${Math.min(this.done + 1, this.total)} of ${this.total}`, W / 2, 128);

    // the drill tiles
    const n = this.drill.length, tw = 64, th = 76, gap = 14;
    const x0 = W / 2 - (n * (tw + gap) - gap) / 2;
    const slide = 1 - U.ease.outCubic(this.anim);       // new drills slide in from the right
    const now = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      let x = x0 + i * (tw + gap) + slide * 120;
      let y = 160;
      const isCur = i === this.pos;
      if (isCur) {
        y += Math.sin(now * 6) * 3;                      // current tile bobs
        if (this.shakeT > 0) x += Math.sin(now * 80) * 5; // and shakes on a mistake
      }
      ctx.save();
      ctx.globalAlpha = 1 - slide;
      if (i < this.pos) { ctx.fillStyle = C.green; }
      else if (isCur)   { ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 18; }
      else              { ctx.fillStyle = '#1C2547'; }
      U.rrect(ctx, x, y, tw, th, 14); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = i <= this.pos ? C.navy : '#9AA5CC';
      ctx.font = 'bold 40px Consolas, monospace';
      ctx.fillText(this.drill[i].toUpperCase(), x + tw / 2, y + th / 2 + 2);
      ctx.restore();
    }

    // finger hint
    const key = this.drill[this.pos];
    ctx.fillStyle = C.yellow;
    ctx.font = 'bold 18px "Trebuchet MS", Arial';
    ctx.fillText(`Press "${key.toUpperCase()}" with your ${KB.keyboard.fingerName(key)}`, W / 2, 286);
  }
};
