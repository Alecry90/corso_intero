import { initializeFirebaseAuth } from './firebase-auth.js';
import { loadCustomerPersonalization, saveCustomerPersonalization, deleteCustomerPersonalization } from './customer-personalization.js';

const $ = id => document.getElementById(id);
const section = $('customer-personalization');
let authSession;
const state = { user: null, uid: null, job: 0, loaded: false, busy: false, failed: false };

function status(message, error = false) {
  $('personalization-status').textContent = message;
  $('personalization-status').dataset.state = error ? 'error' : 'info';
}

function controls() {
  section.setAttribute('aria-busy', String(state.busy));
  $('personalization-fields').disabled = !state.loaded || state.busy;
  $('personalization-delete').disabled = !state.loaded || state.busy;
  $('personalization-retry').hidden = !state.failed;
  $('personalization-retry').disabled = state.busy;
}

const current = (job, uid) => state.job === job && state.user?.uid === uid && authSession?.currentUser()?.uid === uid;

async function load() {
  if (!state.user || state.busy) return;
  const user = state.user;
  const job = ++state.job;
  state.loaded = false;
  state.busy = true;
  state.failed = false;
  $('personalization-enabled').checked = false;
  status('Caricamento della tua scelta…');
  controls();
  try {
    const saved = await loadCustomerPersonalization(user);
    if (!current(job, user.uid)) return;
    $('personalization-enabled').checked = saved.enabled;
    state.loaded = true;
    status(saved.enabled ? 'Personalizzazione attiva per questa sessione del browser.' : 'Personalizzazione disattivata. Le ricerche e i clic non vengono usati per i consigli.');
  } catch {
    if (!current(job, user.uid)) return;
    state.failed = true;
    status('Non è stato possibile verificare la scelta salvata. Riprova prima di modificarla.', true);
  } finally {
    if (current(job, user.uid)) { state.busy = false; controls(); }
  }
}

async function commit(remove = false) {
  if (!state.user || !state.loaded || state.busy) return;
  const user = state.user;
  const job = ++state.job;
  const enabled = $('personalization-enabled').checked;
  state.busy = true;
  status(remove ? 'Cancellazione della scelta…' : 'Salvataggio della scelta…');
  controls();
  try {
    if (remove) await deleteCustomerPersonalization(user);
    else await saveCustomerPersonalization(user, enabled);
    if (!current(job, user.uid)) return;
    if (remove) $('personalization-enabled').checked = false;
    status(remove ? 'Scelta cancellata. Personalizzazione disattivata e segnali di questa scheda eliminati.' : enabled ? 'Scelta salvata. Personalizzazione attiva per questa sessione del browser.' : 'Scelta salvata come disattivata. Segnali di questa scheda eliminati.');
  } catch {
    if (current(job, user.uid)) status('Non è stato possibile confermare la modifica. Riprova: la scelta sullo schermo non conferma il salvataggio.', true);
  } finally {
    if (current(job, user.uid)) { state.busy = false; controls(); }
  }
}

if (section) {
  $('personalization-form').addEventListener('submit', event => { event.preventDefault(); commit(); });
  $('personalization-delete').addEventListener('click', () => commit(true));
  $('personalization-retry').addEventListener('click', load);
  initializeFirebaseAuth().then(auth => {
    authSession = auth;
    if (auth.status !== 'ready') return;
    auth.onChange(user => {
      const uid = user?.uid || '';
      if (state.uid === uid) return;
      state.job++;
      state.user = user;
      state.uid = uid;
      state.loaded = false;
      state.busy = false;
      state.failed = false;
      $('personalization-enabled').checked = false;
      section.hidden = !user;
      status('Caricamento della tua scelta…');
      controls();
      if (user) load();
    });
  }).catch(() => { section.hidden = true; });
}
