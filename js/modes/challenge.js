/* ==========================================================================
   modes/challenge.js  -  DAILY CHALLENGE
   A 60 second typing test. The text is generated from today's date, so every
   player gets the same text on the same day (and a new one tomorrow).
   Type as much as you can: speed and accuracy decide your rank.
   ========================================================================== */

(function () {
  const { W, H } = KB;
  const U = KB.util, C = KB.COLORS;

  KB.modes.challenge = class {
    constructor(opts) {
      const daily = KB.words.daily();
      this.dayKey = daily.key;
      this.block = new KB.TextBlock(daily.text, 50);
      this.duration = 60;
      this.timeLeft = this.duration;
      this.finished = false; this.won = true;
      this.stars = new KB.Starfield();
      this.kbd = undefined;                              // default keyboard position
    }

    nextKey() { return this.block.current(); }

    onKey(ch) {
      if (ch === this.block.current()) {
        KB.game.press(ch, true);
        this.block.advance();
        if (this.block.done()) { this.finished = true; this.resultTitle = 'Text completed!'; }
      } else {
        KB.game.press(ch, false);
        this.block.wrong();                               // you must type the right key to move on
      }
    }

    update(dt) {
      this.stars.update(dt, 0.3);
      this.block.update(dt);
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.finished = true; this.resultTitle = "Time's up!"; }
    }

    draw(ctx) {
      KB.bg(ctx, '#0B1030', '#2B1B5E');
      this.stars.draw(ctx);

      // title
      const d = this.dayKey;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = C.yellow;
      ctx.font = 'bold 26px "Trebuchet MS", Arial';
      ctx.fillText(`Daily Challenge  ${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, W / 2, 88);
      ctx.fillStyle = '#AEB7D6'; ctx.font = '14px Arial';
      ctx.fillText('Same text for everyone today. Beat your own best!', W / 2, 114);

      // text panel (3 visible lines, the current line stays in the middle)
      ctx.fillStyle = 'rgba(8,12,34,.8)';
      U.rrect(ctx, 50, 140, 860, 190, 18); ctx.fill();
      ctx.strokeStyle = C.yellow; ctx.lineWidth = 2; ctx.stroke();
      const cur = this.block.lineOfPos();
      const first = U.clamp(cur - 1, 0, Math.max(0, this.block.lines.length - 3));
      this.block.draw(ctx, W / 2, 196, { first, count: 3, lineH: 52 });

      // time bar
      const bx = 130, bw = 700, by = 360;
      const ratio = U.clamp(this.timeLeft / this.duration, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; U.rrect(ctx, bx, by, bw, 12, 6); ctx.fill();
      ctx.fillStyle = ratio > 0.3 ? C.cyan : C.red;
      U.rrect(ctx, bx, by, Math.max(8, bw * ratio), 12, 6); ctx.fill();

      // progress through the text
      ctx.fillStyle = '#AEB7D6'; ctx.font = '14px Arial';
      ctx.fillText(`${this.block.pos} / ${this.block.text.length} characters`, W / 2, 394);
    }
  };
})();
