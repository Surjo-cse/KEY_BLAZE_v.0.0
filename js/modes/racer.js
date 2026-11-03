/* ==========================================================================
   modes/racer.js  -  TURBO RACER
   Your typing speed IS the speed of your car.
     - every correct key gives the car a push
     - friction slowly slows it down, so you must keep typing
     - a wrong key makes you lose 40% of your speed
     - 12 correct keys in a row = NITRO (stronger boost + flames)
   Race against an AI car to the finish line.

   Computer graphics concepts used here
     - parallax scrolling: mountains, trees and road move at different speeds
     - frame animation: spinning wheels (rotation), flickering nitro flames
     - gradients for sky, sun and road
   ========================================================================== */

(function () {
  const { W, H } = KB;
  const U = KB.util, C = KB.COLORS;

  const TRACK = 9000;                                   // race length in world units
  const AI_SPEED = { easy: 175, medium: 240, hard: 320 };
  const ROAD_TOP = 300, ROAD_BOT = 436;

  /** positive modulo (so scrolling works for negative numbers too) */
  const mod = (a, n) => ((a % n) + n) % n;

  KB.modes.racer = class {
    constructor(opts) {
      this.diff = opts.difficulty;
      this.aiBase = AI_SPEED[this.diff] || AI_SPEED.medium;
      this.pd = 0; this.pv = 0;                          // player distance and speed
      this.ad = 0; this.av = 0;                          // AI distance and speed
      this.wheel = 0;                                    // wheel rotation angle
      this.scroll = 0;                                   // how far the scenery has scrolled
      this.time = 0;
      this.word = KB.words.pick(this.diff);
      this.pos = 0;
      this.queue = [KB.words.pick(this.diff), KB.words.pick(this.diff), KB.words.pick(this.diff)];
      this.finished = false; this.won = false;
      this.stars = new KB.Starfield([{ n: 50, speed: 0, size: 1.4, alpha: 0.6 }]);
    }

    nextKey() { return this.word[this.pos]; }
    get nitro() { return KB.game.stats.combo >= 12; }

    nextWord() {
      this.word = this.queue.shift();
      this.queue.push(KB.words.pick(this.diff));
      this.pos = 0;
    }

    update(dt) {
      this.time += dt;
      // friction: speed decays exponentially (frame-rate independent)
      this.pv *= Math.exp(-0.9 * dt);
      this.pd += this.pv * dt;
      this.wheel += this.pv * dt / 18;
      this.scroll += this.pv * dt;
      // AI keeps a roughly constant speed with a gentle wobble
      this.av = this.aiBase * (1 + 0.08 * Math.sin(this.time * 0.7));
      this.ad += this.av * dt;

      // nitro flames: emit orange particles behind the car
      if (this.nitro && Math.random() < 0.7)
        KB.fx.burst(235, ROAD_BOT - 56, { n: 2, speed: 120, life: 0.4, size: 3, colors: [C.orange, C.yellow, C.red] });

      if (this.ad >= TRACK) { this.finished = true; this.won = false; this.resultTitle = 'The rival won!'; }
      else if (this.pd >= TRACK) { this.finished = true; this.won = true; this.resultTitle = 'You won the race!'; KB.game.stats.bonus(200); }
    }

    onKey(ch) {
      if (ch === ' ') return;
      if (ch === this.word[this.pos]) {
        KB.game.press(ch, true);
        // boost: NITRO gives 50% more
        this.pv = Math.min(620, this.pv + 54 * (this.nitro ? 1.5 : 1));
        this.pos++;
        if (this.pos >= this.word.length) {
          const pts = KB.game.stats.bonus(this.word.length * 6);
          KB.fx.text(300, 190, '+' + pts, C.yellow, 22);
          KB.audio.word();
          this.nextWord();
        }
      } else {
        KB.game.press(ch, false);
        this.pv *= 0.6;                                   // mistake = lose speed
        KB.fx.shake(4);
      }
    }

    /** Car facing right. (x, y) = centre of the bottom of the car. */
    drawCar(ctx, x, y, color, nitro) {
      ctx.save();
      ctx.translate(x, y);
      // nitro flame
      if (nitro) {
        ctx.fillStyle = C.orange;
        ctx.beginPath(); ctx.moveTo(-46, -14); ctx.lineTo(-76 - Math.random() * 22, -9); ctx.lineTo(-46, -4); ctx.fill();
        ctx.fillStyle = C.yellow;
        ctx.beginPath(); ctx.moveTo(-46, -12); ctx.lineTo(-62 - Math.random() * 12, -9); ctx.lineTo(-46, -6); ctx.fill();
      }
      // body
      ctx.fillStyle = color;
      U.rrect(ctx, -46, -30, 92, 24, 9); ctx.fill();
      // cabin + window
      U.rrect(ctx, -20, -48, 46, 22, 9); ctx.fill();
      ctx.fillStyle = '#BDE9FF';
      U.rrect(ctx, -14, -44, 34, 14, 5); ctx.fill();
      // headlight
      ctx.fillStyle = '#FFF7B0';
      ctx.fillRect(40, -24, 6, 6);
      // wheels (rotating spokes)
      for (const wx of [-26, 26]) {
        ctx.save();
        ctx.translate(wx, -6);
        ctx.fillStyle = '#10142B';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, 6.28); ctx.fill();
        ctx.rotate(this.wheel);                           // ROTATION of the spokes
        ctx.strokeStyle = '#C9D2F0'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    draw(ctx) {
      // sky gradient (dark purple to warm sunset)
      const sky = ctx.createLinearGradient(0, 0, 0, ROAD_TOP);
      sky.addColorStop(0, '#1A0B45'); sky.addColorStop(0.6, '#6B21A8'); sky.addColorStop(1, '#F472B6');
      ctx.fillStyle = sky;
      ctx.fillRect(-30, -30, W + 60, ROAD_TOP + 30);

      // sun
      const sg = ctx.createRadialGradient(740, 270, 10, 740, 270, 110);
      sg.addColorStop(0, '#FFF3B0'); sg.addColorStop(0.4, 'rgba(250,204,21,.8)'); sg.addColorStop(1, 'rgba(250,204,21,0)');
      ctx.fillStyle = sg; ctx.fillRect(600, 140, 280, 180);

      // PARALLAX: two mountain layers that scroll at different speeds
      this.drawMountains(ctx, '#2A1068', 0.04, 60, 0.011, 250);
      this.drawMountains(ctx, '#170a45', 0.12, 45, 0.017, 285);

      // ground + road
      ctx.fillStyle = '#0D0A2A';
      ctx.fillRect(-30, ROAD_TOP - 10, W + 60, H);
      ctx.fillStyle = '#23224A';
      ctx.fillRect(-30, ROAD_TOP, W + 60, ROAD_BOT - ROAD_TOP);
      ctx.fillStyle = C.pink;                              // road edge lines
      ctx.fillRect(-30, ROAD_TOP, W + 60, 3);
      ctx.fillStyle = C.cyan;
      ctx.fillRect(-30, ROAD_BOT - 3, W + 60, 3);
      // dashed centre line scrolls with the car speed
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      const dashOff = mod(this.scroll, 90);
      for (let x = -dashOff; x < W + 40; x += 90) ctx.fillRect(x, (ROAD_TOP + ROAD_BOT) / 2 - 2, 46, 4);
      // roadside poles move fastest (closest to the camera)
      ctx.fillStyle = '#6B72A8';
      for (let i = 0; i < 8; i++) {
        const px = mod(i * 150 - this.scroll * 1.2, W + 150) - 50;
        ctx.fillRect(px, ROAD_TOP - 38, 5, 38);
        ctx.fillStyle = C.yellow; ctx.fillRect(px - 5, ROAD_TOP - 42, 15, 6); ctx.fillStyle = '#6B72A8';
      }

      // AI car is placed relative to the player: ahead = right, behind = left
      const aiX = U.clamp(300 + (this.ad - this.pd) * 0.6, -120, W + 120);
      this.drawCar(ctx, aiX, 372, C.orange, false);
      this.drawCar(ctx, 300, 418, C.cyan, this.nitro);

      this.drawPanels(ctx);
    }

    /** One layer of mountains: a sine-based polygon that scrolls horizontally. */
    drawMountains(ctx, color, speed, amp, freq, base) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-10, ROAD_TOP);
      const off = this.scroll * speed;
      for (let x = -10; x <= W + 10; x += 10) {
        const y = base - amp * (0.5 + 0.5 * Math.sin((x + off) * freq) * Math.sin((x + off) * freq * 2.3 + 1));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W + 10, ROAD_TOP);
      ctx.closePath(); ctx.fill();
    }

    /** Word display, progress bar and speed readout. */
    drawPanels(ctx) {
      // word panel
      ctx.fillStyle = 'rgba(8,12,34,.78)';
      U.rrect(ctx, 150, 66, 660, 108, 16); ctx.fill();
      ctx.strokeStyle = this.nitro ? C.orange : C.cyan; ctx.lineWidth = 2; ctx.stroke();

      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const big = 'bold 50px Consolas, "Courier New", monospace';
      ctx.font = big;
      const total = KB.measure(big, this.word);
      let x = W / 2 - total / 2;
      const cw = total / this.word.length;
      for (let i = 0; i < this.word.length; i++) {
        ctx.fillStyle = i < this.pos ? C.green : (i === this.pos ? '#fff' : '#9AA5CC');
        ctx.fillText(this.word[i], x + i * cw, 112);
        if (i === this.pos) { ctx.fillRect(x + i * cw, 138, cw * 0.9, 3); }   // cursor underline
      }
      // upcoming words
      ctx.font = 'bold 20px Consolas, monospace';
      ctx.fillStyle = '#6F7AA8'; ctx.textAlign = 'center';
      ctx.fillText(this.queue.join('   '), W / 2, 160);

      // race progress bar with both cars
      const bx = 110, bw = 740, by = 200;
      ctx.fillStyle = 'rgba(255,255,255,.15)'; U.rrect(ctx, bx, by - 4, bw, 8, 4); ctx.fill();
      ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(bx + bw * U.clamp(this.ad / TRACK, 0, 1), by, 8, 0, 6.28); ctx.fill();
      ctx.fillStyle = C.cyan;   ctx.beginPath(); ctx.arc(bx + bw * U.clamp(this.pd / TRACK, 0, 1), by, 8, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'left';
      ctx.fillText('FINISH', bx + bw + 8, by);

      // speed readout
      ctx.textAlign = 'left';
      ctx.fillStyle = this.nitro ? C.orange : '#fff';
      ctx.font = 'bold 22px "Trebuchet MS", Arial';
      ctx.fillText(Math.round(this.pv * 0.45) + ' km/h', 24, 246);
      if (this.nitro && Math.floor(performance.now() / 150) % 2 === 0) {
        ctx.fillStyle = C.yellow; ctx.fillText('NITRO!', 24, 272);
      }
    }
  };
})();
