/* ==========================================================================
   config.js  -  the ONLY file you need to edit to turn on real accounts.

   TWO MODES
   1. DEMO MODE (default): leave `apiKey` empty.
      Sign up / sign in works, but accounts live only inside this browser
      (localStorage). Good for testing and for opening index.html offline.

   2. FIREBASE MODE: paste your Firebase web-app config below.
      Accounts are real (Firebase Authentication) and every user's profile and
      game history is stored online (Cloud Firestore), so a player can log in
      from any device.
      Step-by-step setup is in README.md ("Turn on real accounts").

   Is it safe to put these values in a public GitHub repo?
   Yes. A Firebase web config is NOT a secret - it only tells the browser which
   project to talk to. Your data is protected by the Firestore rules in
   firestore.rules (each user can only read and write their own data).
   ========================================================================== */

window.KB_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyA7JlNGISZd_yfm5UaWquEQJxjC9i5qFMU',
    authDomain: 'key-blaze.firebaseapp.com',        // e.g. "my-project.firebaseapp.com"
    projectId: 'key-blaze',         // e.g. "my-project"
    storageBucket: 'key-blaze.firebasestorage.app',
    messagingSenderId: '621538542907',
    appId: '1:621538542907:web:892be86ee82792ca05e31e'
  },

  // false = players MUST sign in or sign up before playing (what the course
  // project asks for). Set to true to show a "Continue as guest" button.
  allowGuest: false
};
