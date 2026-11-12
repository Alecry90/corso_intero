import { initializeFirebaseAuth } from './firebase-auth.js';
import { CATALOG_GROUPS } from './catalog-taxonomy.js';
import { loadCustomerProfile, saveCustomerPreferences, deleteCustomerProfile } from './customer-profile.js';

const $ = id => document.getElementById(id);
const state = { user: null, uid: '', job: 0, loaded: false, busy: '', loadFailed: false, profile: null };
const emptyProfile = () => ({ displayName: '', interests: [], favoriteProductIds: [] });

export function accountReturnPath(value, origin = window.location.origin) {
  try {
    if (typeof value !== 'string' || !value.trim()) return '/catalogo.html';
    const target = new URL(value, origin);
    if (target.origin !== origin || target.username || target.password || !['/catalogo.html', '/index.html'].includes(target.pathname)) return '/catalogo.html';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/catalogo.html';
  }
}

const returnPath = accountReturnPath(new URLSearchParams(window.location.search).get('ritorno'));

function profileStatus(message, error = false) {
  $('customer-profile-status').textContent = message;
  $('customer-profile-status').dataset.state = error ? 'error' : 'info';
}

function describeError(error, operation) {
  if (error?.code === 'invalid-profile') return error.message;
  if (['unauthenticated', 'permission-denied', 'firestore/unauthenticated', 'firestore/permission-denied'].includes(error?.code)) return 'Per gestire le preferenze, esci dall’account e accedi di nuovo.';
  if (operation === 'load') return 'Non è stato possibile caricare le preferenze. Riprova prima di modificarle: i dati salvati non sono stati cambiati.';
  if (operation === 'delete') return 'Non è stato possibile confermare la cancellazione. Controlla la connessione e riprova.';
  return 'Non è stato possibile salvare le preferenze. Le modifiche restano nel modulo: controlla la connessione e riprova.';
}

function updateControls() {
  const busy = Boolean(state.busy);
  $('customer-preferences').setAttribute('aria-busy', String(busy));
  $('customer-preferences-fields').disabled = busy || !state.loaded;
  $('customer-preferences-form').hidden = !state.loaded;
  $('customer-saved-choices').hidden = !state.loaded;
  $('customer-preferences-removal').hidden = !state.loaded;
  $('customer-profile-retry').hidden = !state.loadFailed;
  $('customer-profile-retry').disabled = busy;
  $('customer-preferences-delete').disabled = busy || !state.loaded;
  $('customer-delete-confirm').disabled = busy || !state.loaded;
  $('customer-delete-cancel').disabled = busy;
  $('customer-preferences-save').textContent = state.busy === 'save' ? 'Salvataggio…' : 'Salva preferenze';
  $('customer-delete-confirm').textContent = state.busy === 'delete' ? 'Cancellazione…' : 'Sì, cancella';
}

function isCurrent(job, uid) {
  return job === state.job && uid === state.user?.uid;
}

function renderProfile(profile) {
  state.profile = profile;
  state.loaded = true;
  state.loadFailed = false;
  $('customer-name').value = profile.displayName;
  $('customer-name').removeAttribute('aria-invalid');
  $('customer-greeting').textContent = profile.displayName ? `Ciao, ${profile.displayName}!` : 'Ciao!';
  document.dispatchEvent(new CustomEvent('customer-profile-changed', { detail: { uid: state.user.uid, displayName: profile.displayName } }));
  document.querySelectorAll('[name="customer-interest"]').forEach(input => { input.checked = profile.interests.includes(input.value); });
  $('customer-favorites-link').textContent = `I miei preferiti (${profile.favoriteProductIds.length})`;
  const interests = CATALOG_GROUPS.filter(group => profile.interests.includes(group.id));
  $('customer-interest-links').replaceChildren(...interests.map(group => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `/catalogo.html?reparto=${encodeURIComponent(group.id)}`;
    link.textContent = group.name;
    item.append(link);
    return item;
  }));
  $('customer-no-interests').hidden = interests.length > 0;
  updateControls();
}

async function loadProfile() {
  if (!state.user || state.busy) return;
  const user = state.user;
  const job = ++state.job;
  state.loaded = false;
  state.busy = 'load';
  state.loadFailed = false;
  profileStatus('Caricamento delle preferenze…');
  updateControls();
  try {
    const profile = await loadCustomerProfile(user);
    if (!isCurrent(job, user.uid)) return;
    renderProfile(profile);
    profileStatus('Scegli cosa ritrovare nel tuo account. Tutti i campi sono facoltativi.');
  } catch (error) {
    if (!isCurrent(job, user.uid)) return;
    state.loaded = false;
    state.loadFailed = true;
    profileStatus(describeError(error, 'load'), true);
  } finally {
    if (isCurrent(job, user.uid)) { state.busy = ''; updateControls(); }
  }
}

function onAuthChange(user) {
  if ((user?.uid || '') === state.uid) { state.user = user; return; }
  state.job++;
  state.user = user;
  state.uid = user?.uid || '';
  state.loaded = false;
  state.busy = '';
  state.loadFailed = false;
  state.profile = null;
  $('customer-preferences').hidden = !user;
  $('customer-delete-confirmation').hidden = true;
  $('customer-greeting').textContent = 'Ciao!';
  $('customer-name').value = '';
  $('customer-name').removeAttribute('aria-invalid');
  document.querySelectorAll('[name="customer-interest"]').forEach(input => { input.checked = false; });
  $('customer-interest-links').replaceChildren();
  $('customer-favorites-link').textContent = 'I miei preferiti (0)';
  updateControls();
  if (!user) return;
  $('account-continue').href = returnPath;
  $('account-continue').textContent = returnPath.split(/[?#]/)[0] === '/index.html' ? 'Torna alla Home' : 'Continua al catalogo';
  loadProfile();
}

$('customer-interest-options').replaceChildren(...CATALOG_GROUPS.map(group => {
  const label = document.createElement('label');
  label.className = 'customer-interest-option';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = 'customer-interest';
  input.value = group.id;
  const text = document.createElement('span');
  text.textContent = group.name;
  label.append(input, text);
  return label;
}));

$('customer-profile-retry').addEventListener('click', loadProfile);
$('customer-name').addEventListener('input', () => $('customer-name').removeAttribute('aria-invalid'));
$('customer-preferences-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.user || !state.loaded || state.busy) return;
  const displayName = $('customer-name').value.trim();
  if (displayName.length > 60 || /[\u0000-\u001f\u007f]/.test(displayName)) {
    $('customer-name').setAttribute('aria-invalid', 'true');
    profileStatus('Inserisci un nome di massimo 60 caratteri, oppure lascia il campo vuoto.', true);
    $('customer-name').focus();
    return;
  }
  const user = state.user;
  const job = ++state.job;
  const interests = [...document.querySelectorAll('[name="customer-interest"]:checked')].map(input => input.value);
  $('customer-delete-confirmation').hidden = true;
  state.busy = 'save';
  profileStatus('Salvataggio delle preferenze…');
  updateControls();
  try {
    const profile = await saveCustomerPreferences(user, { displayName, interests });
    if (!isCurrent(job, user.uid)) return;
    renderProfile(profile);
    profileStatus('Preferenze salvate. I tuoi reparti sono disponibili qui sopra.');
  } catch (error) {
    if (isCurrent(job, user.uid)) profileStatus(describeError(error, 'save'), true);
  } finally {
    if (isCurrent(job, user.uid)) { state.busy = ''; updateControls(); }
  }
});

$('customer-preferences-delete').addEventListener('click', () => {
  if (!state.user || !state.loaded || state.busy) return;
  $('customer-delete-confirmation').hidden = false;
  $('customer-delete-confirm').focus();
});
$('customer-delete-cancel').addEventListener('click', () => {
  if (state.busy) return;
  $('customer-delete-confirmation').hidden = true;
  $('customer-preferences-delete').focus();
});
$('customer-delete-confirm').addEventListener('click', async () => {
  if (!state.user || !state.loaded || state.busy || $('customer-delete-confirmation').hidden) return;
  const user = state.user;
  const job = ++state.job;
  state.busy = 'delete';
  let deleted = false;
  profileStatus('Cancellazione delle preferenze e dei preferiti…');
  updateControls();
  try {
    await deleteCustomerProfile(user);
    if (!isCurrent(job, user.uid)) return;
    renderProfile(emptyProfile());
    deleted = true;
    $('customer-delete-confirmation').hidden = true;
    profileStatus('Preferenze e preferiti cancellati. Il tuo account di accesso è ancora attivo.');
  } catch (error) {
    if (isCurrent(job, user.uid)) profileStatus(describeError(error, 'delete'), true);
  } finally {
    if (isCurrent(job, user.uid)) {
      state.busy = '';
      updateControls();
      if (deleted) $('customer-preferences-delete').focus();
    }
  }
});

initializeFirebaseAuth().then(auth => {
  if (auth.status === 'ready') auth.onChange(onAuthChange);
}).catch(() => { $('customer-preferences').hidden = true; });
