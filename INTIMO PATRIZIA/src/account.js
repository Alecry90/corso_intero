import './styles.css';
import './boutique.css';
import './account.css';
import './newsletter.js';
import './account-preferences.js';
import './personalization-settings.js';
import { initializeShell } from './shared.js';
import { initializeFirebaseAuth } from './firebase-auth.js';
import { getCatalogSession } from './firestore-catalog.js';
import { describeAccountError as describeError, validateAccountPassword } from './account-validation.js';

initializeShell({ active: 'account' });
const $ = id => document.getElementById(id);
const state = { auth: null, user: null, busy: '', focusIntent: '', focusAfterBusy: '', sessionJob: 0, sessionController: null, sessionBusy: false, sessionPromise: null };
const actionLabels = {
  'google-login': ['Continua con Google', 'Apertura di Google…'],
  'login-submit': ['Accedi', 'Accesso in corso…'],
  'signup-submit': ['Crea account', 'Creazione dell’account…'],
  'password-reset': ['Hai dimenticato la password?', 'Invio delle istruzioni…'],
  'account-logout': ['Esci dall’account', 'Uscita in corso…'],
  'send-verification': ['Invia email di verifica', 'Invio in corso…'],
  'refresh-verification': ['Ho verificato l’email', 'Controllo in corso…'],
};
const resetMessage = 'Se l’indirizzo corrisponde a un account, riceverai un’email con le istruzioni per scegliere una nuova password. Controlla anche la cartella spam.';

function status(message, error = false) {
  $('account-status').textContent = message;
  $('account-status').dataset.state = error ? 'error' : 'info';
}

function updateControls() {
  const unavailable = state.auth?.status !== 'ready';
  $('account-fields').disabled = unavailable || Boolean(state.busy);
  document.querySelectorAll('#account-signed-in [data-auth-action]').forEach(button => {
    button.disabled = unavailable || Boolean(state.busy) || (button.id === 'session-retry' && state.sessionBusy);
  });
  Object.entries(actionLabels).forEach(([id, labels]) => { $(id).textContent = labels[state.busy === id ? 1 : 0]; });
  $('login-form').setAttribute('aria-busy', String(['login-submit', 'google-login', 'password-reset'].includes(state.busy)));
  $('signup-form').setAttribute('aria-busy', String(state.busy === 'signup-submit'));
}

function ready() { return state.auth?.status === 'ready' && !state.busy; }
function setBusy(action = '') {
  state.busy = action;
  updateControls();
  if (!action && state.focusAfterBusy) {
    $(state.focusAfterBusy)?.focus({ preventScroll: true });
    state.focusAfterBusy = '';
  }
}

function clearErrors(prefix) {
  const form = $(`${prefix}-form`);
  form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
  form.querySelectorAll('.account-field-error').forEach(error => { error.textContent = ''; error.hidden = true; });
  $(`${prefix}-errors`).replaceChildren();
  $(`${prefix}-errors`).hidden = true;
}

function showErrors(prefix, errors) {
  const summary = $(`${prefix}-errors`);
  const heading = document.createElement('p');
  heading.textContent = 'Controlla i campi indicati.';
  const list = document.createElement('ul');
  errors.forEach(([id, message]) => {
    const input = $(id);
    input.setAttribute('aria-invalid', 'true');
    $(`${id}-error`).textContent = message;
    $(`${id}-error`).hidden = false;
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${id}`;
    link.textContent = message;
    link.addEventListener('click', event => { event.preventDefault(); input.focus(); });
    item.append(link);
    list.append(item);
  });
  summary.replaceChildren(heading, list);
  summary.hidden = false;
  summary.focus();
}

function showFormError(prefix, error) {
  if (error?.code === 'auth/invalid-email') {
    showErrors(prefix, [[`${prefix}-email`, describeError(error, prefix)]]);
    return;
  }
  if (prefix === 'signup' && error?.code === 'auth/email-already-in-use') {
    showErrors(prefix, [['signup-email', describeError(error, prefix)]]);
    return;
  }
  if (prefix === 'signup' && ['auth/weak-password', 'auth/password-does-not-meet-requirements'].includes(error?.code)) {
    showErrors(prefix, [['signup-password', describeError(error, prefix)]]);
    return;
  }
  const summary = $(`${prefix}-errors`);
  const paragraph = document.createElement('p');
  paragraph.textContent = describeError(error, prefix);
  summary.replaceChildren(paragraph);
  summary.hidden = false;
  summary.focus();
}

function validate(prefix, emailOnly = false) {
  clearErrors(prefix);
  const errors = [];
  const email = $(`${prefix}-email`);
  email.value = email.value.trim();
  if (!email.value || !email.validity.valid || email.value.length > 254) errors.push([email.id, 'Inserisci un indirizzo email valido.']);
  if (!emailOnly) {
    const password = $(`${prefix}-password`);
    const passwordError = validateAccountPassword(password.value, { signup: prefix === 'signup' });
    if (passwordError) errors.push([password.id, passwordError]);
    if (prefix === 'signup') {
      const confirmation = $('signup-confirm');
      if (!confirmation.value) errors.push([confirmation.id, 'Conferma la password.']);
      else if (confirmation.value !== password.value) errors.push([confirmation.id, 'Le due password devono essere uguali.']);
    }
  }
  if (errors.length) showErrors(prefix, errors);
  return errors.length === 0;
}

function clearPasswords() {
  ['login-password', 'signup-password', 'signup-confirm'].forEach(id => { $(id).value = ''; $(id).type = 'password'; });
  document.querySelectorAll('[data-password-toggle]').forEach(button => { button.textContent = 'Mostra'; button.setAttribute('aria-pressed', 'false'); });
}

async function checkSession(user = state.user) {
  if (!user || !state.auth) return;
  state.sessionController?.abort();
  const job = ++state.sessionJob;
  const controller = new AbortController();
  state.sessionController = controller;
  state.sessionBusy = true;
  $('manage-catalog').hidden = true;
  $('session-retry').hidden = true;
  updateControls();
  status('Accesso effettuato. Controllo delle autorizzazioni…');
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const session = await getCatalogSession(controller.signal);
    if (typeof session?.canManageCatalog !== 'boolean') throw new Error('Sessione non valida.');
    if (job !== state.sessionJob) return;
    $('manage-catalog').hidden = session.canManageCatalog !== true;
    const message = session.canManageCatalog === true ? 'Accesso effettuato. Puoi gestire i prodotti del negozio.' : 'Accesso effettuato. Puoi consultare il catalogo.';
    $('account-description').textContent = message;
    status(message);
  } catch {
    if (job !== state.sessionJob) return;
    $('manage-catalog').hidden = true;
    $('session-retry').hidden = false;
    status('Accesso effettuato. Non è stato possibile verificare le autorizzazioni. Puoi continuare a consultare il catalogo o riprovare la verifica.', true);
  } finally {
    clearTimeout(timeout);
    if (job === state.sessionJob) { state.sessionController = null; state.sessionBusy = false; updateControls(); }
  }
}

async function onAuthChange(user) {
  state.sessionController?.abort();
  state.sessionJob++;
  state.sessionBusy = false;
  const focusIntent = state.focusIntent;
  state.focusIntent = '';
  const verificationHadFocus = $('account-verification').contains(document.activeElement);
  state.user = user;
  $('account-content').setAttribute('aria-busy', 'false');
  $('account-access').hidden = Boolean(user);
  $('account-signed-in').hidden = !user;
  $('manage-catalog').hidden = true;
  $('session-retry').hidden = true;
  $('account-verification').hidden = !user?.email || user.emailVerified === true;
  updateControls();
  if (!user) {
    state.sessionPromise = null;
    clearPasswords();
    status(focusIntent === 'signed-out' ? 'Hai effettuato l’uscita. Puoi continuare a consultare il catalogo.' : 'Puoi accedere oppure continuare a consultare il catalogo senza account.');
    if (focusIntent === 'signed-out') {
      if (state.busy) state.focusAfterBusy = 'login-email';
      else $('login-email').focus({ preventScroll: true });
    }
    return;
  }
  $('account-email').textContent = user.email || 'Account collegato';
  $('account-description').textContent = 'Accesso effettuato. Puoi consultare il catalogo.';
  clearPasswords();
  if (focusIntent === 'signed-in' || (verificationHadFocus && user.emailVerified === true)) $('account-title').focus({ preventScroll: true });
  state.sessionPromise = checkSession(user);
  await state.sessionPromise;
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!ready() || !validate('login')) return;
  setBusy('login-submit');
  state.focusIntent = 'signed-in';
  status('Accesso in corso…');
  try { await state.auth.signIn($('login-email').value, $('login-password').value); }
  catch (error) { state.focusIntent = ''; showFormError('login', error); status('Accesso non completato. Controlla il messaggio nel modulo.', true); }
  finally { setBusy(); }
});

$('google-login').addEventListener('click', async () => {
  if (!ready()) return;
  clearErrors('login');
  setBusy('google-login');
  state.focusIntent = 'signed-in';
  status('Completa l’accesso nella finestra Google.');
  try { await state.auth.signInWithGoogle(); }
  catch (error) { state.focusIntent = ''; showFormError('login', error); status('Accesso non completato. Puoi riprovare o usare email e password.', true); }
  finally { setBusy(); }
});

$('signup-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!ready() || !validate('signup')) return;
  setBusy('signup-submit');
  state.focusIntent = 'signed-in';
  status('Creazione dell’account in corso…');
  try { await state.auth.signUp($('signup-email').value, $('signup-password').value); }
  catch (error) { state.focusIntent = ''; showFormError('signup', error); status('Account non creato. Controlla il messaggio nel modulo.', true); }
  finally { setBusy(); }
});

$('password-reset').addEventListener('click', async () => {
  if (!ready() || !validate('login', true)) return;
  setBusy('password-reset');
  status('Invio delle istruzioni di recupero…');
  try { await state.auth.resetPassword($('login-email').value); status(resetMessage); }
  catch (error) {
    if (['auth/user-not-found', 'auth/user-disabled'].includes(error?.code)) status(resetMessage);
    else { showFormError('login', error); status('Non è stato possibile inviare le istruzioni. Puoi riprovare.', true); }
  } finally { setBusy(); }
});

$('account-logout').addEventListener('click', async () => {
  if (!ready()) return;
  setBusy('account-logout');
  state.focusIntent = 'signed-out';
  try { await state.auth.signOut(); }
  catch (error) { state.focusIntent = ''; status(describeError(error), true); }
  finally { setBusy(); }
});

$('send-verification').addEventListener('click', async () => {
  if (!ready() || !state.user) return;
  setBusy('send-verification');
  status('Invio dell’email di verifica…');
  try { await state.auth.verifyEmail(); status('Email di verifica inviata. Apri il link ricevuto e poi scegli “Ho verificato l’email”. Controlla anche la cartella spam.'); }
  catch (error) { status(describeError(error), true); }
  finally { setBusy(); }
});

$('refresh-verification').addEventListener('click', async () => {
  if (!ready() || !state.user) return;
  setBusy('refresh-verification');
  status('Controllo della verifica dell’email…');
  try {
    const previousJob = state.sessionJob;
    await state.auth.refreshUser();
    const user = state.auth.currentUser();
    if (state.sessionJob === previousJob) await onAuthChange(user);
    else await state.sessionPromise;
    if (user && user.emailVerified !== true) status('L’email non risulta ancora verificata. Apri il link ricevuto e poi riprova.');
  } catch (error) { status(describeError(error), true); }
  finally { setBusy(); }
});

$('session-retry').addEventListener('click', () => { if (ready() && !state.sessionBusy) checkSession(); });
document.querySelectorAll('[data-password-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    const show = button.getAttribute('aria-pressed') !== 'true';
    button.dataset.passwordToggle.split(' ').forEach(id => { $(id).type = show ? 'text' : 'password'; });
    button.setAttribute('aria-pressed', String(show));
    button.textContent = show ? 'Nascondi' : 'Mostra';
  });
});

async function initialize() {
  try {
    state.auth = await initializeFirebaseAuth();
    if (state.auth.status !== 'ready') throw new Error('Servizio non configurato.');
    status('Controllo della sessione…');
    state.auth.onChange(onAuthChange);
  } catch {
    $('account-unavailable').hidden = false;
    $('account-access').hidden = true;
    $('account-signed-in').hidden = true;
    $('account-content').setAttribute('aria-busy', 'false');
    status('Accesso non ancora disponibile. Puoi continuare a consultare il catalogo senza account.');
  }
  updateControls();
}

initialize();
