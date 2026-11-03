/* ==========================================================================
   stats.js
   - KB.Stats : live statistics of the current game (WPM, accuracy, combo, score)
   - KB.rankFor : converts WPM into a rank name
   - KB.store : saves sessions, best scores and weak keys in the browser
                (localStorage) so progress is kept between visits
   ========================================================================== */

/**
 * Live statistics for ONE game session.
 *
 *   WPM      = (correct characters / 5) / minutes   (a "word" = 5 characters)
 *   Accuracy = correct keystrokes / total keystrokes * 100
 *   Score    = 10 points per correct key * combo multiplier + bonuses
 */
KB.Stats = class {
  constructor() { this.reset(); }

  reset() {
    this.total = 0;        // all keystrokes
    this.correct = 0;      // correct keystrokes
    this.combo = 0;        // correct keys in a row
    this.maxCombo = 0;
    this.score = 0;
    this.elapsed = 0;      // seconds since the FIRST key press
    this.started = false;
    this.errors = {};      // per key: wrong presses
    this.attempts = {};    // per key: all presses
  }

  /** Called every frame. The timer only runs after the first key press. */
  tick(dt) { if (this.started) this.elapsed += dt; }

  /** Register one key press. */
  key(ch, ok) {
    this.started = true;
    this.total++;
    this.attempts[ch] = (this.attempts[ch] || 0) + 1;
    if (ok) {
      this.correct++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += Math.round(10 * this.multiplier);
    } else {
      this.errors[ch] = (this.errors[ch] || 0) + 1;
      this.combo = 0;
    }
  }

  /** Score multiplier: x1 at start, +0.5 for every 10 combo, max x4. */
  get multiplier() { return Math.min(4, 1 + Math.floor(this.combo / 10) * 0.5); }

  /** Add bonus points (multiplied by the combo multiplier). Returns the points added. */
  bonus(n) {
    const v = Math.round(n * this.multiplier);
    this.score += v;
    return v;
  }

  /** Reset the combo without counting a key press (e.g. a word hit the ground). */
  breakCombo() { this.combo = 0; }

  get wpm() {
    if (!this.started) return 0;
    // use at least 4 seconds so the first keys do not give a crazy huge WPM
    const minutes = Math.max(this.elapsed, 4) / 60;
    return this.correct / 5 / minutes;
  }

  get accuracy() { return this.total ? (this.correct / this.total) * 100 : 100; }
};

/** WPM -> rank name (same ranks as in the proposal). */
KB.rankFor = function (wpm) {
  if (wpm >= 60) return 'Master';
  if (wpm >= 40) return 'Pro';
  if (wpm >= 20) return 'Skilled';
  return 'Rookie';
};

/**
 * Persistent storage in the browser (localStorage).
 * Everything is wrapped in try/catch because localStorage can be blocked
 * (private mode etc.). The game still works, it just does not remember.
 */
KB.store = {
  KEY: 'keyblaze_v1_guest',     // every user gets their own key, see setUser()
  data: null,

  /** Switch to another user's saved data (called after login / logout). */
  setUser(uid) {
    this.KEY = 'keyblaze_v1_' + uid;
    this.data = null;
  },

  /** Load (or create) the saved data. */
  load() {
    if (this.data) return this.data;
    let d = null;
    try { d = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { /* ignore */ }
    if (!d || typeof d !== 'object') d = {};
    d.sessions = d.sessions || [];       // last 50 games
    d.best = d.best || {};               // best WPM per mode
    d.keyErr = d.keyErr || {};           // all-time wrong presses per key
    d.keyAtt = d.keyAtt || {};           // all-time presses per key
    d.settings = d.settings || {};
    this.data = d;
    return d;
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  },

  /** Store a finished game. */
  addSession(s, stats) {
    const d = this.load();
    d.sessions.push(s);
    if (d.sessions.length > 50) d.sessions.shift();
    d.best[s.mode] = Math.max(d.best[s.mode] || 0, s.wpm);
    for (const k in stats.attempts) d.keyAtt[k] = (d.keyAtt[k] || 0) + stats.attempts[k];
    for (const k in stats.errors) d.keyErr[k] = (d.keyErr[k] || 0) + stats.errors[k];
    this.save();
  },

  /** Delete all saved progress. */
  reset() {
    const settings = this.load().settings;
    this.data = null;
    try { localStorage.removeItem(this.KEY); } catch (e) { /* ignore */ }
    this.load().settings = settings;
    this.save();
  }
};

/**
 * Convert error / attempt counters into a heat map { key: 0..1 }.
 * A mistake rate of 33% or more is shown as fully red.
 */
KB.heatFrom = function (errors, attempts, minAttempts = 1) {
  const heat = {};
  for (const k in attempts) {
    if (attempts[k] >= minAttempts) heat[k] = Math.min(1, ((errors[k] || 0) / attempts[k]) * 3);
  }
  return heat;
};
