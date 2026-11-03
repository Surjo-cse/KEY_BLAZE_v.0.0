/* ==========================================================================
   authui.js  -  the sign in / sign up screen and the small user bar

   Only deals with the HTML (forms, buttons, messages). The real work is done
   by KB.auth (auth.js). main.js calls:
       KB.authUI.show()          show the login screen
       KB.authUI.hide()          hide it
       KB.authUI.setUser(user)   fill in the user bar on the menu
       KB.authUI.setSync(text)   small status text ("Cloud sync on" ...)
   ========================================================================== */

(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  let kind = 'signin';                       // 'signin' | 'signup'

  /** Show a message under the form. ok = true makes it green. */
  function message(text, ok) {
    const el = $('authErr');
    el.textContent = text || '';
    el.classList.toggle('ok', !!ok);
  }

  /** Disable the form while waiting for the server. */
  function busy(on) {
    $('authSubmit').disabled = on;
    $('btnGoogle').disabled = on;
    $('authSubmit').textContent = on ? 'Please wait...' : (kind === 'signup' ? 'Create account' : 'Sign in');
  }

  /** Switch between the Sign in tab and the Sign up tab. */
  function setKind(k) {
    kind = k;
    $('tabIn').classList.toggle('active', k === 'signin');
    $('tabUp').classList.toggle('active', k === 'signup');
    $('aName').classList.toggle('hidden', k !== 'signup');
    $('aPass2').classList.toggle('hidden', k !== 'signup');
    $('btnForgot').classList.toggle('hidden', !(k === 'signin' && KB.auth.cloud));
    $('aPass').autocomplete = k === 'signup' ? 'new-password' : 'current-password';
    $('authSubmit').textContent = k === 'signup' ? 'Create account' : 'Sign in';
    message('');
  }

  async function submit(e) {
    e.preventDefault();
    message('');
    const f = {
      name: $('aName').value, email: $('aEmail').value,
      password: $('aPass').value, confirm: $('aPass2').value
    };
    busy(true);
    try {
      if (kind === 'signup') await KB.auth.signUp(f);
      else await KB.auth.signIn(f);
      // success: KB.auth fires onChange and main.js hides this screen
    } catch (ex) {
      message(ex.message || 'Something went wrong.');
    } finally {
      busy(false);
    }
  }

  async function google() {
    message('');
    busy(true);
    try { await KB.auth.signInGoogle(); }
    catch (ex) { message(ex.message); }
    finally { busy(false); }
  }

  async function forgot() {
    message('');
    try {
      await KB.auth.resetPassword($('aEmail').value);
      message('Password reset email sent. Check your inbox (and spam folder).', true);
    } catch (ex) { message(ex.message); }
  }

  KB.authUI = {
    show() {
      setKind('signin');
      ['aName', 'aPass', 'aPass2'].forEach(id => { $(id).value = ''; });
      $('btnGoogle').classList.toggle('hidden', !KB.auth.cloud);
      $('btnGuest').classList.toggle('hidden', !KB.auth.allowGuest);
      $('authNote').textContent = KB.auth.note || (KB.auth.cloud
        ? 'Your progress is saved to your account and follows you to any device.'
        : 'Demo mode: accounts are stored only in this browser. See README.md to turn on online accounts.');
      $('auth').classList.remove('hidden');
    },
    hide() { $('auth').classList.add('hidden'); },
    setUser(u) {
      $('userName').textContent = u ? u.name : '';
      $('userbar').classList.toggle('hidden', !u);
    },
    setSync(text) { $('syncStatus').textContent = text || ''; }
  };

  // ---- events ----
  $('tabIn').addEventListener('click', () => setKind('signin'));
  $('tabUp').addEventListener('click', () => setKind('signup'));
  $('authForm').addEventListener('submit', submit);
  $('btnGoogle').addEventListener('click', google);
  $('btnForgot').addEventListener('click', forgot);
  $('btnGuest').addEventListener('click', () => KB.auth.guest());
  $('btnLogout').addEventListener('click', () => KB.auth.signOut());
})();
