# KeyBlaze - Typing Practice Arcade

A web-based typing practice game made for the **Computer Graphics and Animation** course.
Learn to type faster by playing games, and see your speed (WPM) and accuracy live.
Players **sign up / sign in** first, and their profile and game history are stored per user.

Made with plain **HTML5 Canvas + JavaScript**. No build step. Accounts use **Firebase** (free plan is enough).

---

## 1. Run it on your computer

Double-click `index.html`, or (recommended) run a tiny local server in this folder:

```bash
python -m http.server 8000      # then open http://localhost:8000
```

At the start you will see the **Sign in / Sign up** screen.
Until you connect Firebase (section 2) the game runs in **DEMO mode**: accounts are saved
only inside your own browser. That is perfect for testing, but not for a public website.

---

## 2. Turn on real accounts (Firebase) - about 10 minutes

You need a free Google account.

1. Go to <https://console.firebase.google.com> -> **Add project** -> give it a name (for example `keyblaze`). You can turn Google Analytics off.
2. **Turn on login**
   Build -> **Authentication** -> Get started -> **Sign-in method** tab ->
   enable **Email/Password** (and **Google** if you want the Google button; choose a support email).
3. **Create the database**
   Build -> **Firestore Database** -> Create database -> pick the region nearest to you
   (for Bangladesh, `asia-south1` Mumbai or `asia-southeast1` Singapore) -> start in **production mode**.
   Then open the **Rules** tab, replace everything with the content of `firestore.rules` from this folder, and press **Publish**.
4. **Get your config**
   Project settings (gear icon) -> *Your apps* -> click the **Web** icon `</>` -> register the app (name it anything)
   -> you will see a `firebaseConfig = { ... }` block. Copy the values into **`js/config.js`**:

   ```js
   firebase: {
     apiKey: 'AIza...',
     authDomain: 'keyblaze-xxxx.firebaseapp.com',
     projectId: 'keyblaze-xxxx',
     storageBucket: '...',
     messagingSenderId: '...',
     appId: '1:...'
   },
   ```
5. **Allow your live website** (do this after step 3 of section 3, when you know your link)
   Authentication -> **Settings** -> **Authorized domains** -> **Add domain** ->
   type your Netlify domain, e.g. `keyblaze.netlify.app` (without `https://`).
   `localhost` is already allowed for testing.

Done. Open the game again: the screen no longer says "Demo mode", and new users appear in
Firebase console -> Authentication -> Users, with their data in Firestore -> `users`.

**What is stored for each user** (in Firestore)

| Where | What |
|-------|------|
| `users/{uid}` | name, email, createdAt, lastLogin, totalGames, best WPM per mode, weak-key counters |
| `users/{uid}/sessions/{id}` | every finished game: mode, WPM, accuracy, score, best combo, won/lost, date |

Passwords are handled by Firebase Authentication. The game never sees or stores them.

> Is it OK to put the Firebase config in a public GitHub repository? Yes. It is not a secret
> (it only says which project to talk to). Your data is protected by `firestore.rules`.

---

## 3. Put it live (Netlify)

**A. Drag and drop (fastest, 1 minute)**
1. Go to <https://app.netlify.com/drop>
2. Drag this whole `keyblaze` folder onto the page.
3. You get a link like `https://random-name.netlify.app`. In *Site configuration -> Change site name* you can make it `keyblaze`.

**B. From GitHub (recommended: every `git push` updates the site automatically)**
1. Push the project to GitHub (section 4).
2. Netlify -> **Add new site** -> **Import an existing project** -> GitHub -> choose the repository.
3. Leave the build command empty and the publish directory as `.` (already set in `netlify.toml`) -> **Deploy**.

Then do step 5 of section 2 (authorize the domain), otherwise Google sign-in will say "unauthorized domain".

**Other free hosts that work the same way:** GitHub Pages (Settings -> Pages -> Deploy from branch `main` / root),
Cloudflare Pages, Vercel, Firebase Hosting. It is just a static site.

---

## 4. Submit on GitHub

Create an empty repository on <https://github.com/new> (for example `keyblaze`), then in a terminal inside this folder:

```bash
git init
git add .
git commit -m "KeyBlaze typing practice game"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/keyblaze.git
git push -u origin main
```

Tips for the submission: put the live link at the top of this README, add 2-3 screenshots, and mention which course it is for.

---

## How to play

1. Sign in or sign up, then pick a game mode (and difficulty / lesson).
2. Wait for the 3-2-1 countdown, then type. Only letters, digits and Space are used.
3. `Esc` pauses the game.

| Mode | What you do |
|------|-------------|
| Lesson Lab | Press the glowing key with the right finger. 5 lessons (home row, top row, bottom row, numbers, all letters) |
| Word Rain | Type falling words before they hit the ground. 5 lives, 75 s |
| Asteroid Blaster | Type the word under an asteroid to shoot it. 3 lives, 75 s |
| Turbo Racer | Your typing speed is your car speed. 12 correct keys in a row = NITRO. Beat the AI car |
| Boss Battle | Type sentences to damage the robot. Mistakes heal it. Beat the timer |
| Daily Challenge | 60 s typing test. The text is the same for everyone on the same day |

- WPM = (correct characters / 5) / minutes
- Accuracy = correct keystrokes / total keystrokes x 100
- Score = 10 points per correct key x combo multiplier (+0.5 per 10 combo, max x4) + bonuses
- Rank: Rookie (0-20), Skilled (20-40), Pro (40-60), Master (60+ WPM)

After every game you get a result screen with a weak-key heatmap. The menu has a **Progress** page with charts.

---

## Project structure

```
keyblaze/
|-- index.html           page: canvas + login / menu / result / pause / progress screens
|-- netlify.toml         Netlify settings (no build step)
|-- firestore.rules      database security rules (paste into Firebase console)
|-- css/style.css        styles for the HTML screens
`-- js/
    |-- config.js        <- put your Firebase keys here
    |-- auth.js          accounts: sign up / in / out, Firebase + demo back-ends, cloud save
    |-- authui.js        login screen and user bar
    |-- utils.js         helpers: easing, random, colours, rounded rectangles
    |-- audio.js         sound effects (Web Audio API, no sound files)
    |-- particles.js     particle system, floating text, screen shake
    |-- words.js         word lists, sentences, lessons, daily text
    |-- keyboard.js      on-screen keyboard (finger colours, highlight, heatmap)
    |-- stats.js         WPM / accuracy / combo / score + per-user local saving
    |-- common.js        shared parts: starfield, word targeting, text block
    |-- main.js          game loop, game states, input, HUD, menus, charts
    `-- modes/           lesson, wordrain, asteroid, racer, boss, challenge
```

Every game mode is a class with the same small interface (`update(dt)`, `draw(ctx)`, `onKey(ch)`, `nextKey()`),
so a new mode is easy to add.

---

## Computer graphics and animation concepts used (and where)

| Concept | Where in the code |
|---------|-------------------|
| Game loop + delta time (frame-rate independent animation) | `main.js` -> `loop()` |
| 2D transformations (translate / rotate / scale) | asteroid rotation and ship aiming (`asteroid.js`), floating tiles (`main.js` Backdrop), spinning wheels (`racer.js`), boss arms (`boss.js`) |
| Particle systems | `particles.js` (explosions, sparks, nitro flames, confetti) |
| Easing / tweening | `utils.js` `ease.*`; countdown pop-in, health bar, floating text, count-up numbers |
| Parallax scrolling | `common.js` Starfield, mountains and road poles in `racer.js` |
| Collision detection (circle vs circle) | `asteroid.js` -> `update()` |
| Gradients, alpha blending, glow, additive blending | backgrounds in every mode, `particles.js` (`'lighter'` blending) |
| Procedural graphics | city skyline (`wordrain.js`), asteroid shapes, boss robot drawn only from shapes (`boss.js`) |
| Sine-wave animation | boss bobbing, key highlight pulse, mountains |
| Camera effects | screen shake (`particles.js` + `main.js`), red damage flash |
| Frame animation | flickering engine / nitro flames, blinking cursor |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Login screen says "Demo mode" on the live site | `js/config.js` still has empty values, or you did not redeploy after editing it |
| "This website address is not authorised in Firebase" | Add your Netlify domain in Firebase -> Authentication -> Settings -> Authorized domains |
| "This sign-in method is not enabled" | Enable Email/Password (or Google) in Firebase -> Authentication -> Sign-in method |
| Menu shows "Cloud sync failed" | Firestore is not created yet, or the rules from `firestore.rules` are not published |
| Google pop-up does nothing | Your browser blocked the pop-up: allow pop-ups for the site |

## Ideas to extend it

- Online leaderboard (read the best WPM of all users; needs a public `leaderboard` collection and a rule for it)
- Punctuation and capital letters (Shift handling in `main.js` and `keyboard.js`)
- Music loop, more boss designs, WebGL bloom / CRT shader
