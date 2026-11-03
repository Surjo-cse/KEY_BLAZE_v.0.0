/* ==========================================================================
   main.js  -  THE GAME ENGINE
   This file connects everything:
     - the GAME LOOP (update + draw 60 times per second, using delta time)
     - the game STATE machine: menu -> countdown -> playing -> result
     - keyboard input
     - the HUD (WPM, accuracy, combo, score, lives, time)
     - the HTML overlays (menu, result, pause, progress charts)

   KB.game is the object the game modes talk to:
     KB.game.press(ch, ok)   register a key press (updates stats, sound, keyboard flash)
     KB.game.flash(a)        red screen flash (when the player gets hurt)
     KB.game.stats           the live Stats object
   ========================================================================== */

(function () {
  'use strict';
  const { W, H } = KB;
  const U = KB.util, C = KB.COLORS;
  const $ = id => document.getElementById(id);

  // Name, colour and a short tip for every mode
  const INFO = {
    lesson:    { name: 'Lesson Lab',       color: C.green,  tip: 'Press the glowing key with the right finger' },
    wordrain:  { name: 'Word Rain',        color: C.cyan,   tip: 'Type the words before they hit the ground' },
    asteroid:  { name: 'Asteroid Blaster', color: C.purple, tip: 'Type the word under each asteroid to shoot it' },
    racer:     { name: 'Turbo Racer',      color: C.orange, tip: 'Type fast to speed up. 12 in a row = NITRO' },
    boss:      { name: 'Boss Battle',      color: C.pink,   tip: 'Type the sentences. Mistakes heal the boss' },
    challenge: { name: 'Daily Challenge',  color: C.yellow, tip: 'Type as much of the text as you can in 60 seconds' }
  };

  // Where the on-screen keyboard is drawn when a mode does not set its own
  const DEFAULT_KBD = { x: 290, y: 452, w: 380, numbers: false, strip: true };

  /* ------------------------------------------------------------------
     Menu backdrop: floating key tiles + stars behind the menu.
     Each tile is moved, ROTATED and SCALED every frame.
     ------------------------------------------------------------------ */
  class Backdrop {
    constructor() {
      this.stars = new KB.Starfield();
      const cols = [C.cyan, C.pink, C.yellow, C.green, C.purple, C.orange];
      this.tiles = Array.from({ length: 22 }, () => ({
        ch: String.fromCharCode(97 + Math.floor(Math.random() * 26)),
        x: U.rand(0, W), y: U.rand(0, H),
        vy: U.rand(-40, -15), rot: U.rand(0, 6.28), vr: U.rand(-0.8, 0.8),
        s: U.rand(0.6, 1.3), color: U.pick(cols), a: U.rand(0.15, 0.4)
      }));
    }
    update(dt) {
      this.stars.update(dt, 0.6);
      for (const t of this.tiles) {
        t.y += t.vy * dt;
        t.rot += t.vr * dt;
        if (t.y < -50) { t.y = H + 50; t.x = U.rand(0, W); }
      }
    }
    draw(ctx) {
      KB.bg(ctx, '#0B1020', '#2A1068');
      this.stars.draw(ctx);
      for (const t of this.tiles) {
        ctx.save();
        ctx.translate(t.x, t.y);       // move
        ctx.rotate(t.rot);             // rotate
        ctx.scale(t.s, t.s);           // scale
        ctx.globalAlpha = t.a;
        ctx.fillStyle = t.color;
        U.rrect(ctx, -22, -22, 44, 44, 10); ctx.fill();
        ctx.fillStyle = C.navy;
        ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t.ch.toUpperCase(), 0, 2);
        ctx.restore();
      }
    }
  }

  /* ------------------------------------------------------------------
     The game object
     ------------------------------------------------------------------ */
  const game = KB.game = {
    canvas: null, ctx: null,
    state: 'menu',            // 'menu' | 'countdown' | 'playing' | 'paused' | 'result'
    mode: null, modeId: null, opts: {},
    stats: new KB.Stats(),
    cd: 0,                    // countdown seconds left
    cdLast: 0,
    flashA: 0,                // red flash strength
    last: 0,
    backdrop: null,

    init() {
      this.canvas = $('game');
      this.ctx = this.canvas.getContext('2d');
      this.backdrop = new Backdrop();
      this.bindUI();
      this.bindInput();
      window.addEventListener('resize', () => this.resize());
      this.resize();
      requestAnimationFrame(ts => { this.last = ts; this.loop(ts); });
      this.initAuth();
    },

    /* ============================ ACCOUNTS ============================ */

    /** Start the login system. The game stays locked until a user is signed in. */
    async initAuth() {
      KB.auth.onChange(u => this.onUser(u));
      try { await KB.auth.init(); } catch (e) { console.warn(e); }
      $('boot').classList.add('hidden');
      KB.auth.begin();                       // reports the current user (or null) -> onUser()
    },

    /**
     * Called whenever the logged-in user changes (login, logout, page reload).
     * user = null  -> show the sign in / sign up screen
     * user = {...} -> load this user's progress and show the menu
     */
    async onUser(user) {
      this.state = 'menu';
      this.mode = null;
      ['menu', 'result', 'pause', 'progress'].forEach(n => $(n).classList.add('hidden'));
      KB.authUI.setUser(user);
      KB.authUI.setSync('');

      if (!user) { KB.authUI.show(); return; }

      KB.authUI.hide();
      KB.store.setUser(user.uid);            // every user has their own saved progress
      const st = KB.store.load().settings;
      if (st.difficulty) $('difficulty').value = st.difficulty;
      if (st.lesson !== undefined) $('lesson').value = st.lesson;
      KB.audio.muted = !!st.muted;
      $('btnSound').textContent = 'Sound: ' + (KB.audio.muted ? 'Off' : 'On');
      $('menu').classList.remove('hidden');

      // Online accounts: download the saved history (works on any device)
      if (KB.auth.cloud && !user.guest) {
        KB.authUI.setSync('Syncing...');
        try {
          const c = await KB.auth.loadCloud();
          if (KB.auth.user !== user) return;                  // user changed while loading
          const d = KB.store.load();
          if (c && (c.sessions.length || !d.sessions.length)) {
            d.sessions = c.sessions;
            d.best = c.best;
            d.keyErr = c.keyErr;
            d.keyAtt = c.keyAtt;
            KB.store.save();
          }
          KB.authUI.setSync('Cloud sync on');
        } catch (e) {
          console.warn('Could not load from the cloud:', e);
          KB.authUI.setSync('Cloud sync failed');
        }
      }
    },

    /** Keep the 16:10 stage as big as possible inside the window. */
    resize() {
      const stage = $('stage');
      const w = Math.min(window.innerWidth, window.innerHeight * 1.6);
      stage.style.width = w + 'px';
      stage.style.height = (w / 1.6) + 'px';
      stage.style.fontSize = (w / 60) + 'px';    // 1em = 16px when the stage is 960px wide
    },

    /* ============================ GAME FLOW ============================ */

    /** Start a new game of the given mode. */
    start(id) {
      KB.audio.resume();
      this.modeId = id;
      this.opts = { difficulty: $('difficulty').value, lesson: +$('lesson').value };
      this.stats.reset();
      KB.fx.reset();
      KB.keyboard.pressed = null;
      this.flashA = 0;
      this.mode = new KB.modes[id](this.opts);
      this.state = 'countdown';
      this.cd = 3; this.cdLast = 4;
      ['menu', 'result', 'pause', 'progress'].forEach(n => $(n).classList.add('hidden'));
    },

    /** Called every time the player presses a key that counts. */
    press(ch, ok) {
      this.stats.key(ch, ok);
      KB.keyboard.press(ch, ok);
      if (ok) {
        KB.audio.key(this.stats.combo);
        // combo milestone every 10 correct keys
        if (this.stats.combo > 0 && this.stats.combo % 10 === 0) {
          KB.audio.combo();
          // shown at the right edge so it never covers the text the player is reading
          KB.fx.text(W - 95, 120, `COMBO x${this.stats.combo}!`, C.pink, 24);
          KB.fx.burst(W - 95, 120, { n: 24, speed: 240, colors: [C.pink, C.yellow, C.cyan] });
        }
      } else {
        KB.audio.wrong();
        this.flashA = Math.max(this.flashA, 0.18);
      }
    },

    /** Red flash over the screen (damage). */
    flash(a) { this.flashA = Math.max(this.flashA, a); },

    /** The game is over: save the result and show the result screen. */
    end() {
      if (this.state === 'result') return;
      this.state = 'result';
      const m = this.mode, s = this.stats;
      const wpm = s.wpm;
      const prevBest = KB.store.load().best[this.modeId] || 0;
      const session = {
        mode: this.modeId, date: Date.now(), wpm: +wpm.toFixed(1),
        acc: +s.accuracy.toFixed(1), score: s.score, combo: s.maxCombo, won: !!m.won
      };
      KB.store.addSession(session, s);                // saved on this device
      if (KB.auth.cloud && KB.auth.user && !KB.auth.user.guest) {
        KB.authUI.setSync('Saving...');               // and online (Firebase mode)
        KB.auth.saveSession(session, s).then(ok => KB.authUI.setSync(ok ? 'Cloud sync on' : 'Cloud sync failed'));
      }
      (m.won ? KB.audio.win : KB.audio.lose).call(KB.audio);
      this.showResult(session, wpm > prevBest, prevBest);
    },

    showResult(sess, isBest, prevBest) {
      const m = this.mode;
      $('resTitle').textContent = m.resultTitle || (m.won ? 'Mission Complete' : 'Game Over');
      const diffName = this.modeId === 'lesson' ? KB.lessons[this.opts.lesson].name : this.opts.difficulty;
      $('resMode').textContent = `${INFO[this.modeId].name}  -  ${diffName}`;
      $('resRank').textContent = KB.rankFor(sess.wpm);
      $('resBest').textContent = isBest && sess.wpm > 0
        ? (prevBest ? 'New personal best for this mode!' : 'First record saved!')
        : (prevBest ? `Your best in this mode: ${prevBest.toFixed(1)} WPM` : '');
      // numbers count up smoothly (tweening)
      countUp($('rWpm'), sess.wpm, 1000, 1);
      countUp($('rAcc'), sess.acc, 1000, 1, '%');
      countUp($('rScore'), sess.score, 1200, 0);
      countUp($('rCombo'), sess.combo, 900, 0);
      // heatmap of this session
      drawHeat($('heat'), KB.heatFrom(this.stats.errors, this.stats.attempts));
      $('result').classList.remove('hidden');
    },

    toMenu() {
      this.state = 'menu';
      this.mode = null;
      ['result', 'pause', 'progress'].forEach(n => $(n).classList.add('hidden'));
      $('menu').classList.remove('hidden');
    },

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      $('pause').classList.remove('hidden');
    },
    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      $('pause').classList.add('hidden');
    },

    /* ============================ INPUT ============================ */

    bindInput() {
      window.addEventListener('keydown', e => {
        KB.audio.resume();
        if (e.key === 'Escape') {
          if (this.state === 'playing') this.pause();
          else if (this.state === 'paused') this.resume();
          return;
        }
        if (this.state !== 'playing') return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;  // ignore shortcuts and held keys
        if (e.key.length !== 1) return;                               // ignore Shift, Enter, arrows...
        const ch = e.key.toLowerCase();
        if (!/^[a-z0-9 ]$/.test(ch)) return;                          // only letters, digits, space
        e.preventDefault();                                           // stop space from scrolling the page
        this.mode.onKey(ch);
      });
      // pause automatically when the player switches to another window
      window.addEventListener('blur', () => this.pause());
    },

    /* ============================ MENU / BUTTONS ============================ */

    bindUI() {
      // lesson dropdown
      const sel = $('lesson');
      KB.lessons.forEach((l, i) => sel.add(new Option(`${i + 1}. ${l.name}`, i)));

      // (saved settings are restored per user in onUser())
      const saveSettings = () => {
        const s = KB.store.load().settings;
        s.difficulty = $('difficulty').value; s.lesson = +sel.value; s.muted = KB.audio.muted;
        KB.store.save();
      };
      $('difficulty').addEventListener('change', saveSettings);
      sel.addEventListener('change', saveSettings);

      document.querySelectorAll('.card').forEach(b =>
        b.addEventListener('click', () => this.start(b.dataset.mode)));

      $('btnSound').addEventListener('click', () => {
        KB.audio.muted = !KB.audio.muted;
        $('btnSound').textContent = 'Sound: ' + (KB.audio.muted ? 'Off' : 'On');
        saveSettings();
      });
      $('btnAgain').addEventListener('click', () => this.start(this.modeId));
      $('btnMenu').addEventListener('click', () => this.toMenu());
      $('btnResume').addEventListener('click', () => this.resume());
      $('btnQuit').addEventListener('click', () => this.toMenu());
      $('btnProgress').addEventListener('click', () => this.showProgress());
      $('btnProgClose').addEventListener('click', () => { $('progress').classList.add('hidden'); $('menu').classList.remove('hidden'); });
      $('btnProgReset').addEventListener('click', () => {
        if (confirm('Delete all saved progress?')) { KB.store.reset(); this.showProgress(); }
      });
    },

    /** Progress dashboard: charts of earlier sessions + all-time heatmap. */
    showProgress() {
      const d = KB.store.load();
      const list = d.sessions.slice(-12);
      const best = Math.max(0, ...Object.values(d.best));
      $('progSummary').textContent = d.sessions.length
        ? `${d.sessions.length} sessions saved  -  best speed ${best.toFixed(1)} WPM`
        : 'No games played yet. Play a game and your progress will appear here.';
      drawLine($('chartWpm'), list.map(s => s.wpm), C.cyan, 'WPM');
      drawBars($('chartAcc'), list.map(s => s.acc), C.green);
      drawHeat($('heatAll'), KB.heatFrom(d.keyErr, d.keyAtt, 3));
      // online data lives in the cloud, so "Reset data" is only offered for local data
      $('btnProgReset').classList.toggle('hidden', KB.auth.cloud);
      $('menu').classList.add('hidden');
      $('progress').classList.remove('hidden');
    },

    /* ============================ MAIN LOOP ============================ */

    /**
     * The game loop. requestAnimationFrame calls this before every screen
     * refresh. `dt` is the time since the previous frame in SECONDS. All
     * movement is multiplied by dt, so the game runs at the same speed on a
     * 60 Hz and on a 144 Hz monitor (frame-rate independent animation).
     */
    loop(ts) {
      const dt = Math.min(0.05, (ts - this.last) / 1000);   // clamp: no huge jumps after tab switch
      this.last = ts;
      this.update(dt);
      this.draw();
      requestAnimationFrame(t => this.loop(t));
    },

    update(dt) {
      if (this.state === 'paused') return;
      KB.fx.update(dt);
      KB.keyboard.update(dt);
      this.flashA *= Math.exp(-5 * dt);

      if (this.state === 'menu' || this.state === 'result') { this.backdrop.update(dt); return; }

      if (this.state === 'countdown') {
        this.cd -= dt;
        const n = Math.ceil(this.cd);
        if (n !== this.cdLast && n > 0) { KB.audio.count(); this.cdLast = n; }
        if (this.cd <= 0) {
          this.state = 'playing';
          KB.audio.go();
          KB.fx.text(W / 2, H / 2 - 40, 'GO!', C.green, 64);
        }
        return;
      }

      if (this.state === 'playing') {
        this.mode.update(dt);
        this.stats.tick(dt);
        if (this.mode.finished) this.end();
      }
    },

    draw() {
      const ctx = this.ctx;
      if (this.state === 'paused') return;               // keep the last frame under the pause menu
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);

      if (this.state === 'menu' || this.state === 'result') { this.backdrop.draw(ctx); return; }

      ctx.save();
      const [sx, sy] = KB.fx.shakeOffset();               // SCREEN SHAKE = move the whole camera
      ctx.translate(sx, sy);

      this.mode.draw(ctx);

      // on-screen keyboard (shows which key to press next)
      const k = Object.assign({}, DEFAULT_KBD, this.mode.kbd || {});
      if (k.strip) {
        ctx.fillStyle = 'rgba(5,8,22,.7)';
        ctx.fillRect(-30, k.y - 8, W + 60, H - k.y + 40);
      }
      KB.keyboard.draw(ctx, k.x, k.y, k.w, {
        numbers: k.numbers,
        highlight: this.state === 'playing' && this.mode.nextKey ? this.mode.nextKey() : null
      });

      KB.fx.draw(ctx);
      this.drawHud(ctx);

      // red damage flash
      if (this.flashA > 0.01) {
        ctx.fillStyle = `rgba(248,113,113,${this.flashA})`;
        ctx.fillRect(-30, -30, W + 60, H + 60);
      }
      if (this.state === 'countdown') this.drawCountdown(ctx);
      ctx.restore();
    },

    /** "3 - 2 - 1": each number pops in with an overshoot (outBack easing). */
    drawCountdown(ctx) {
      ctx.fillStyle = 'rgba(5,8,22,.82)';             // strong dim so the text is easy to read
      ctx.fillRect(-30, -30, W + 60, H + 60);
      const n = Math.ceil(this.cd);
      const frac = 1 - (this.cd - Math.floor(this.cd));          // 0 -> 1 during each second
      const scale = U.lerp(2.4, 1, U.ease.outBack(U.clamp(frac * 1.6, 0, 1)));
      const alpha = 1 - U.clamp((frac - 0.7) / 0.3, 0, 1);
      const info = INFO[this.modeId];
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(W / 2, H / 2 - 20);
      ctx.scale(scale, scale);
      ctx.fillStyle = info.color;
      ctx.shadowColor = info.color; ctx.shadowBlur = 30;
      ctx.font = 'bold 130px "Trebuchet MS", Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(n), 0, 0);
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff'; ctx.font = 'bold 30px "Trebuchet MS", Arial';
      ctx.fillText(info.name, W / 2, 130);
      ctx.fillStyle = '#AEB7D6'; ctx.font = '18px Arial';
      ctx.fillText(info.tip, W / 2, 168);
    },

    /** Heads-up display: live stats on top of the screen. */
    drawHud(ctx) {
      const s = this.stats, m = this.mode;
      const panels = [
        ['WPM',   String(Math.round(s.wpm)),            C.cyan,   84],
        ['ACC',   Math.round(s.accuracy) + '%',          C.green,  92],
        ['COMBO', 'x' + s.combo,                         C.pink,   96],
        ['SCORE', s.score.toLocaleString(),              C.yellow, 140]
      ];
      let x = 14;
      for (const [label, val, col, w] of panels) {
        ctx.fillStyle = 'rgba(0,0,0,.5)'; U.rrect(ctx, x, 12, w, 34, 10); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillStyle = col; ctx.font = 'bold 10px Arial'; ctx.fillText(label, x + 8, 29);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 17px Arial'; ctx.textAlign = 'right';
        ctx.fillText(val, x + w - 8, 30);
        x += w + 8;
      }
      // time (if the mode has a timer)
      let rx = W - 14;
      if (m.timeLeft !== undefined) {
        const t = Math.max(0, Math.ceil(m.timeLeft));
        const txt = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
        const low = t <= 10;
        ctx.fillStyle = 'rgba(0,0,0,.5)'; U.rrect(ctx, rx - 80, 12, 80, 34, 10); ctx.fill();
        ctx.strokeStyle = low ? C.red : '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = low ? C.red : '#fff'; ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center'; ctx.fillText(txt, rx - 40, 30);
        rx -= 92;
      }
      // lives as hearts
      if (m.lives !== undefined) {
        for (let i = 0; i < m.maxLives; i++)
          KB.drawHeart(ctx, rx - 12 - i * 26, 29, 22, i < m.lives ? C.red : 'rgba(255,255,255,.18)');
      }
    }
  };

  /* ------------------------------------------------------------------
     Small drawing helpers for the result / progress screens
     ------------------------------------------------------------------ */

  /** Animate a number from 0 to `to` (ease-out). */
  function countUp(el, to, dur, dec, suffix) {
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const v = to * U.ease.outCubic(p);
      el.textContent = (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + (suffix || '');
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /** Keyboard heatmap on a small canvas. */
  function drawHeat(canvas, heat) {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    KB.keyboard.draw(g, 10, 6, canvas.width - 20, { numbers: true, heat });
  }

  /** Line chart (speed over sessions). */
  function drawLine(canvas, vals, color) {
    const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    g.clearRect(0, 0, w, h);
    if (!vals.length) { chartEmpty(g, w, h); return; }
    const max = Math.max(10, ...vals) * 1.15, px = 36, py = 18;
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = py + (h - 2 * py) * i / 4;
      g.beginPath(); g.moveTo(px, y); g.lineTo(w - 10, y); g.stroke();
      g.fillStyle = '#AEB7D6'; g.font = '10px Arial'; g.textAlign = 'right';
      g.fillText(Math.round(max * (1 - i / 4)), px - 5, y + 3);
    }
    const pts = vals.map((v, i) => [
      px + (vals.length === 1 ? (w - px - 10) / 2 : i * (w - px - 20) / (vals.length - 1)),
      h - py - (h - 2 * py) * v / max
    ]);
    g.strokeStyle = color; g.lineWidth = 3; g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.fillStyle = color;
    pts.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 4, 0, 6.28); g.fill(); });
  }

  /** Bar chart (accuracy over sessions). */
  function drawBars(canvas, vals, color) {
    const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    g.clearRect(0, 0, w, h);
    if (!vals.length) { chartEmpty(g, w, h); return; }
    const px = 20, py = 20, bw = Math.min(30, (w - 2 * px) / vals.length - 6);
    vals.forEach((v, i) => {
      const x = px + i * ((w - 2 * px) / vals.length) + 3;
      const bh = (h - 2 * py) * v / 100;
      g.globalAlpha = 0.5 + 0.5 * (i + 1) / vals.length;
      g.fillStyle = color; U.rrect(g, x, h - py - bh, bw, bh, 5); g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#fff'; g.font = 'bold 10px Arial'; g.textAlign = 'center';
      g.fillText(Math.round(v), x + bw / 2, h - py - bh - 4);
    });
  }

  function chartEmpty(g, w, h) {
    g.fillStyle = '#AEB7D6'; g.font = '14px Arial'; g.textAlign = 'center';
    g.fillText('No data yet', w / 2, h / 2);
  }

  // Start everything when the page has loaded
  window.addEventListener('load', () => game.init());
})();
