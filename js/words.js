/* ==========================================================================
   words.js
   All text content of the game: word lists, sentences and the lessons.

   To add your own words, just add them to the lists below.
   Only lowercase letters (a-z) and spaces are used, so players do not need
   Shift or punctuation keys.
   ========================================================================== */

(function () {
  const U = KB.util;

  // One big word list. The difficulty is chosen by word LENGTH (see RANGE).
  const ALL = Array.from(new Set((
    // short words (3-4 letters)
    'cat dog sun map sky run star moon fish tree book lamp bird cake door fire gold hand iron ' +
    'king leaf milk nest open pink rain sand time wind zoo ant bee cow duck frog goat hill jazz ' +
    'kite lion nose owl pen quiz road ship toy van wolf yarn zip sad dad gas ask all fall flag ' +
    'hall lad has dash half type pipe port your were true wire quit poet pity ' +
    // medium words (5-6 letters)
    'planet rocket player orange purple silver yellow garden bridge castle dragon forest island ' +
    'jungle market mirror pencil rabbit shadow spring summer winter window animal button candle ' +
    'flower guitar hammer jacket glass flask salad shall power tower write route typing speedy ' +
    'quick brown jumps ' +
    // long words (7-10 letters)
    'keyboard computer graphics animation developer challenge accuracy adventure butterfly ' +
    'champion dinosaur elephant fireworks universe chocolate telescope mountain knowledge ' +
    'wonderful beautiful algorithm javascript framework creative practice progress'
  ).split(' ')));

  // Which word lengths belong to which difficulty
  const RANGE = { easy: [3, 4], medium: [5, 6], hard: [7, 10] };

  // Sentences for Boss Battle and Daily Challenge
  const SENTENCES = {
    easy: [
      'the sun is bright today', 'a small cat sat on the mat', 'we play games after school',
      'fast hands win the race', 'the red car is very fast', 'birds fly over the blue sea'
    ],
    medium: [
      'the quick brown fox jumps over the lazy dog',
      'practice makes every typist faster and better',
      'keep your eyes on the screen and fingers on the home row',
      'small steps every day lead to big progress',
      'a calm mind types faster than a rushed one'
    ],
    hard: [
      'pack my box with five dozen liquor jugs',
      'sphinx of black quartz judge my vow',
      'computer graphics turns simple numbers into moving pictures',
      'accuracy first then speed will follow naturally with practice',
      'every great developer once struggled with the keyboard too'
    ]
  };

  // Typing lessons: each one trains a group of keys
  KB.lessons = [
    { name: 'Home Row',    keys: 'asdfghjkl' },
    { name: 'Top Row',     keys: 'qwertyuiop' },
    { name: 'Bottom Row',  keys: 'zxcvbnm' },
    { name: 'Number Row',  keys: '1234567890' },
    { name: 'All Letters', keys: 'abcdefghijklmnopqrstuvwxyz' }
  ];

  KB.words = {
    /**
     * Pick a random word for the given difficulty.
     * `avoid` is an optional Set of first letters to avoid, so two words on
     * the screen never start with the same letter (otherwise the game could
     * not know which one the player means).
     */
    pick(diff, avoid) {
      const [lo, hi] = RANGE[diff] || RANGE.medium;
      const inRange = ALL.filter(w => w.length >= lo && w.length <= hi);
      const pool = avoid ? inRange.filter(w => !avoid.has(w[0])) : inRange;
      return U.pick(pool.length ? pool : inRange);
    },

    /** Random sentence of the given difficulty (not the same as `last`). */
    sentence(diff, last) {
      const list = SENTENCES[diff] || SENTENCES.medium;
      let s;
      do { s = U.pick(list); } while (s === last && list.length > 1);
      return s;
    },

    /**
     * The Daily Challenge passage. The date is the seed, so every player gets
     * the same text on the same day, and a different one tomorrow.
     */
    daily() {
      const d = new Date();
      const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      const rnd = U.seeded(key);
      const all = [].concat(SENTENCES.easy, SENTENCES.medium, SENTENCES.hard);
      // shuffle with the seeded random generator and take 6 sentences
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
      return { key: String(key), text: all.slice(0, 6).join(' ') };
    },

    /** One short practice string for a lesson (real word or random keys). */
    drill(keys) {
      const real = ALL.filter(w => w.length <= 6 && [...w].every(c => keys.includes(c)));
      if (real.length && Math.random() < 0.4) return U.pick(real);
      const len = U.randInt(3, 5);
      let s = '';
      while (s.length < len) {
        const c = U.pick(keys);
        // avoid three identical letters in a row
        if (s.length >= 2 && s[s.length - 1] === c && s[s.length - 2] === c) continue;
        s += c;
      }
      return s;
    }
  };
})();
