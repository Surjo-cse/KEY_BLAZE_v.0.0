/* ==========================================================================
   auth.js  -  accounts: sign up, sign in, sign out, and saving user data

   KB.auth has ONE interface and TWO back-ends, chosen by js/config.js:

     FIREBASE mode  (config filled in)
        - Firebase Authentication: email + password, Google sign-in,
          password reset e-mail
        - Cloud Firestore stores, per user:
              users/{uid}                 name, email, createdAt, lastLogin,
                                          totalGames, best WPM per mode,
                                          weak-key counters
              users/{uid}/sessions/{id}   every finished game
        - Passwords are handled by Firebase. This game NEVER sees or stores them.

     DEMO mode      (config empty)
        - Accounts are kept in localStorage of this browser only.
        - Passwords are salted + hashed with PBKDF2 (Web Crypto) - never stored
          as plain text. Still, this is for testing only: anyone with access to
          the browser can read localStorage.

   The rest of the game only uses:
        KB.auth.init(), KB.auth.begin(), KB.auth.onChange(cb)
        KB.auth.signUp(f), signIn(f), signInGoogle(), signOut(), resetPassword(email)
        KB.auth.saveSession(session, stats), KB.auth.loadCloud()
   ========================================================================== */

(function () {
  'use strict';

  const CFG = window.KB_CONFIG || {};
  const FBCFG = CFG.firebase || {};
  const wantsFirebase = !!(FBCFG.apiKey && FBCFG.projectId);

  const USERS_KEY = 'keyblaze_users';        // demo mode: all accounts
  const CUR_KEY = 'keyblaze_current';        // demo mode: who is logged in
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

  /* ---------------- tiny localStorage helpers (never throw) ---------------- */
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };

  /* ---------------- input validation (same rules for both modes) ---------------- */
  function validate(kind, f) {
    const email = (f.email || '').trim();
    if (kind === 'signup' && (f.name || '').trim().length < 2) return 'Please enter your name (at least 2 characters).';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
    if (!f.password) return 'Please enter your password.';
    if (kind === 'signup') {
      if (f.password.length < 6) return 'Password must be at least 6 characters.';
      if (f.password !== f.confirm) return 'The two passwords do not match.';
    }
    return null;
  }

  /* ---------------- password hashing for DEMO mode ---------------- */
  const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const fromHex = hex => new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));
  const randomHex = n => toHex(crypto.getRandomValues(new Uint8Array(n)));

  /** PBKDF2-SHA256, 100 000 rounds. Falls back to a weak hash if Web Crypto is missing. */
  async function hashPassword(pw, saltHex) {
    try {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: fromHex(saltHex), iterations: 100000, hash: 'SHA-256' }, key, 256);
      return toHex(new Uint8Array(bits));
    } catch (e) {
      let h = 5381;
      const s = saltHex + pw;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      return 'weak' + (h >>> 0).toString(16);
    }
  }

  /* ======================================================================
     DEMO back-end (localStorage)
     ====================================================================== */
  const Local = {
    pub: u => ({ uid: u.uid, name: u.name, email: u.email, provider: 'demo' }),

    async signUp(f) {
      const users = lsGet(USERS_KEY) || {};
      const email = f.email.trim().toLowerCase();
      if (users[email]) throw new Error('An account with this email already exists. Try signing in.');
      const salt = randomHex(16);
      const u = {
        uid: 'u' + randomHex(8), name: f.name.trim(), email, salt,
        hash: await hashPassword(f.password, salt), createdAt: Date.now(), lastLogin: Date.now()
      };
      users[email] = u;
      if (!lsSet(USERS_KEY, users)) throw new Error('Could not save the account (browser storage is blocked).');
      lsSet(CUR_KEY, u.uid);
      return this.pub(u);
    },

    async signIn(f) {
      const users = lsGet(USERS_KEY) || {};
      const email = f.email.trim().toLowerCase();
      const u = users[email];
      // same message for "no such user" and "wrong password"
      if (!u || (await hashPassword(f.password, u.salt)) !== u.hash) throw new Error('Wrong email or password.');
      u.lastLogin = Date.now();
      lsSet(USERS_KEY, users);
      lsSet(CUR_KEY, u.uid);
      return this.pub(u);
    },

    /** The user that was logged in when the page was closed (or null). */
    current() {
      const uid = lsGet(CUR_KEY);
      const users = lsGet(USERS_KEY) || {};
      const u = Object.values(users).find(x => x.uid === uid);
      return u ? this.pub(u) : null;
    }
  };

  /* ======================================================================
     FIREBASE back-end
     ====================================================================== */

  /** Load a <script> and wait for it. */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  /** Firestore map keys cannot be a plain space, so we rename it. */
  const encKey = k => (k === ' ' ? 'space' : k);
  const decKey = k => (k === 'space' ? ' ' : k);
  const decMap = m => { const o = {}; for (const k in (m || {})) o[decKey(k)] = m[k]; return o; };

  /** Firebase error code -> a friendly message. */
  function friendly(e) {
    const map = {
      'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/user-not-found': 'Wrong email or password.',
      'auth/wrong-password': 'Wrong email or password.',
      'auth/invalid-credential': 'Wrong email or password.',
      'auth/invalid-login-credentials': 'Wrong email or password.',
      'auth/too-many-requests': 'Too many attempts. Please wait a minute and try again.',
      'auth/network-request-failed': 'Network problem. Check your internet connection.',
      'auth/popup-closed-by-user': 'The Google window was closed before finishing.',
      'auth/cancelled-popup-request': 'The Google window was closed before finishing.',
      'auth/popup-blocked': 'Your browser blocked the Google pop-up. Please allow pop-ups and try again.',
      'auth/unauthorized-domain': 'This website address is not authorised in Firebase. Add it under Authentication > Settings > Authorized domains.',
      'auth/operation-not-allowed': 'This sign-in method is not enabled in the Firebase console yet.'
    };
    return new Error(map[e && e.code] || (e && e.message) || 'Something went wrong. Please try again.');
  }

  const Cloud = {
    auth: null, db: null,

    init() {
      if (!firebase.apps.length) firebase.initializeApp(FBCFG);
      this.auth = firebase.auth();
      this.db = firebase.firestore();
    },

    ts() { return firebase.firestore.FieldValue.serverTimestamp(); },
    inc(n) { return firebase.firestore.FieldValue.increment(n); },

    /** Firebase user -> our small user object. */
    map(u) {
      if (!u) return null;
      return { uid: u.uid, name: u.displayName || (u.email || 'Player').split('@')[0], email: u.email, provider: 'firebase' };
    },

    /** Create the profile document on first login, update lastLogin every time. */
    async ensureProfile(u, name) {
      const ref = this.db.collection('users').doc(u.uid);
      const snap = await ref.get();
      const data = { name: name || u.displayName || (u.email || 'Player').split('@')[0], email: u.email, lastLogin: this.ts() };
      if (!snap.exists) { data.createdAt = this.ts(); data.totalGames = 0; }
      await ref.set(data, { merge: true });
    },

    async signUp(f) {
      try {
        const cred = await this.auth.createUserWithEmailAndPassword(f.email.trim(), f.password);
        const name = f.name.trim();
        await cred.user.updateProfile({ displayName: name });
        try { await this.ensureProfile(cred.user, name); } catch (e) { console.warn('Profile not saved:', e); }
        return { uid: cred.user.uid, name, email: cred.user.email, provider: 'firebase' };
      } catch (e) { throw friendly(e); }
    },

    async signIn(f) {
      try { await this.auth.signInWithEmailAndPassword(f.email.trim(), f.password); }
      catch (e) { throw friendly(e); }
    },

    async signInGoogle() {
      try { await this.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
      catch (e) { throw friendly(e); }
    },

    async resetPassword(email) {
      try { await this.auth.sendPasswordResetEmail(email.trim()); }
      catch (e) { throw friendly(e); }
    }
  };

  /* ======================================================================
     Public API used by the game
     ====================================================================== */
  KB.auth = {
    mode: 'demo',               // 'demo' | 'firebase'
    user: null,                 // { uid, name, email, provider } or null
    note: '',                   // message for the login screen
    allowGuest: !!CFG.allowGuest,
    _cbs: [],
    _busy: false,

    get cloud() { return this.mode === 'firebase'; },

    /** Register a function that is called whenever the logged-in user changes. */
    onChange(cb) { this._cbs.push(cb); },
    _emit(u) { this.user = u; this._cbs.forEach(cb => cb(u)); },

    /** Prepare the back-end. Call once, before begin(). */
    async init() {
      this.mode = 'demo';
      if (wantsFirebase) {
        try {
          if (!(window.firebase && firebase.initializeApp)) {
            await loadScript(SDK + 'firebase-app-compat.js');
            await loadScript(SDK + 'firebase-auth-compat.js');
            await loadScript(SDK + 'firebase-firestore-compat.js');
          }
          Cloud.init();
          this.mode = 'firebase';
        } catch (e) {
          console.warn(e);
          this.note = 'Could not reach Firebase, so demo mode is used (accounts stay in this browser).';
        }
      }
    },

    /** Start reporting the logged-in user (fires onChange right away). */
    begin() {
      if (this.cloud) {
        Cloud.auth.onAuthStateChanged(async u => {
          if (this._busy) return;                       // a sign-up is in progress, it will emit by itself
          if (u) { try { await Cloud.ensureProfile(u); } catch (e) { console.warn('Profile not saved:', e); } }
          this._emit(Cloud.map(u));
        });
      } else {
        this._emit(Local.current());
      }
    },

    async signUp(f) {
      const err = validate('signup', f);
      if (err) throw new Error(err);
      if (this.cloud) {
        this._busy = true;
        let u;
        try { u = await Cloud.signUp(f); } finally { this._busy = false; }
        this._emit(u);
      } else {
        this._emit(await Local.signUp(f));
      }
    },

    async signIn(f) {
      const err = validate('signin', f);
      if (err) throw new Error(err);
      if (this.cloud) await Cloud.signIn(f);            // onAuthStateChanged will emit
      else this._emit(await Local.signIn(f));
    },

    async signInGoogle() {
      if (!this.cloud) throw new Error('Google sign-in needs Firebase. See README.md.');
      await Cloud.signInGoogle();
    },

    async resetPassword(email) {
      if (!this.cloud) throw new Error('Password reset needs Firebase. See README.md.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim())) throw new Error('Type your email address first.');
      await Cloud.resetPassword(email);
    },

    /** Play without an account (only when allowGuest is true in config.js). */
    guest() { this._emit({ uid: 'guest', name: 'Guest', email: '', provider: 'guest', guest: true }); },

    async signOut() {
      if (this.cloud && this.user && !this.user.guest) await Cloud.auth.signOut();   // listener emits null
      else { lsDel(CUR_KEY); this._emit(null); }
    },

    /**
     * Save a finished game online. Resolves true when saved,
     * false when nothing had to be saved or saving failed.
     */
    async saveSession(sess, stats) {
      if (!this.cloud || !this.user || this.user.guest) return false;
      try {
        const db = Cloud.db;
        const ref = db.collection('users').doc(this.user.uid);
        const batch = db.batch();
        batch.set(ref.collection('sessions').doc(), Object.assign({}, sess, { createdAt: Cloud.ts() }));
        const keyErr = {}, keyAtt = {};
        for (const k in stats.errors) keyErr[encKey(k)] = Cloud.inc(stats.errors[k]);
        for (const k in stats.attempts) keyAtt[encKey(k)] = Cloud.inc(stats.attempts[k]);
        const best = {};
        best[sess.mode] = KB.store.load().best[sess.mode] || sess.wpm;
        batch.set(ref, { totalGames: Cloud.inc(1), lastPlayed: Cloud.ts(), best, keyErr, keyAtt }, { merge: true });
        await batch.commit();
        return true;
      } catch (e) {
        console.warn('Could not save to the cloud:', e);
        return false;
      }
    },

    /** Download the user's saved progress (FIREBASE mode only, otherwise null). */
    async loadCloud() {
      if (!this.cloud || !this.user || this.user.guest) return null;
      const ref = Cloud.db.collection('users').doc(this.user.uid);
      const snap = await ref.get();
      const d = snap.exists ? snap.data() : {};
      const qs = await ref.collection('sessions').orderBy('date', 'desc').limit(50).get();
      const sessions = [];
      qs.forEach(doc => {
        const s = doc.data();
        sessions.push({ mode: s.mode, date: s.date, wpm: s.wpm, acc: s.acc, score: s.score, combo: s.combo, won: s.won });
      });
      sessions.reverse();                               // oldest first, like the local list
      return { sessions, best: d.best || {}, keyErr: decMap(d.keyErr), keyAtt: decMap(d.keyAtt) };
    }
  };
})();
