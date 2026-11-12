import { initializeFirebaseAuth } from './firebase-auth.js';
import { loadCustomerPersonalization, CUSTOMER_PERSONALIZATION_POLICY_VERSION } from './customer-personalization.js';
import { categoryGroupId } from './catalog-taxonomy.js';
import { selectProducts, normalizeSearch } from './catalog-model.js';
import { sanitizeNavigationSignals } from './navigation-signals.js';

const prefix = 'intimo-navigation-v1:';
const empty = () => ({ enabled: false, groupScores: {}, recentProductIds: [] });
const state = { auth: null, uid: '', user: null, enabled: false, ready: false, job: 0, pending: null };
let initialization;
let returned = false;
let lastSearch = '';
let lastProduct = '';

function clear(uid = state.uid) {
  try { if (uid) sessionStorage.removeItem(prefix + uid); } catch { /* Storage can be unavailable. */ }
  lastSearch = ''; lastProduct = '';
}

function savedSignals(uid = state.uid) {
  try {
    const data = JSON.parse(sessionStorage.getItem(prefix + uid) || 'null');
    if (data?.policyVersion !== CUSTOMER_PERSONALIZATION_POLICY_VERSION) return sanitizeNavigationSignals(null);
    return sanitizeNavigationSignals(data);
  } catch { return sanitizeNavigationSignals(null); }
}

function persist(data, uid) {
  if (uid !== state.uid || !state.enabled || !state.ready || state.auth?.currentUser()?.uid !== uid) return;
  try {
    sessionStorage.setItem(prefix + uid, JSON.stringify({ policyVersion: CUSTOMER_PERSONALIZATION_POLICY_VERSION, ...sanitizeNavigationSignals(data) }));
  } catch { /* Catalog and explicit preferences still work without session storage. */ }
}

function verify() {
  if (!state.user || state.auth?.currentUser()?.uid !== state.uid) return Promise.resolve();
  const user = state.user;
  const job = ++state.job;
  state.enabled = false; state.ready = false;
  let timeout;
  const pending = Promise.race([
    loadCustomerPersonalization(user),
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Consent verification timeout')), 6000); }),
  ]).then(choice => {
    if (job !== state.job || state.auth.currentUser()?.uid !== user.uid) return;
    state.enabled = choice.enabled === true && choice.policyVersion === CUSTOMER_PERSONALIZATION_POLICY_VERSION;
    state.ready = true;
    if (!state.enabled) clear(user.uid);
  }).catch(() => {
    if (job !== state.job) return;
    state.enabled = false; state.ready = true; clear(user.uid);
  }).finally(() => {
    clearTimeout(timeout);
    if (state.pending === pending) state.pending = null;
  });
  state.pending = pending;
  return pending;
}

function changeUser(user) {
  const uid = user?.uid || '';
  if (uid === state.uid && state.user !== null) return;
  if (state.uid && state.uid !== uid) clear(state.uid);
  state.job++;
  state.user = user; state.uid = uid;
  state.enabled = false; state.ready = false; state.pending = null;
  lastSearch = ''; lastProduct = '';
  if (user) verify();
  else {
    // Remove leftovers before another account can use this tab.
    try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key); } catch { /* Optional storage. */ }
    state.ready = true;
  }
}

export function initializeNavigationPersonalization() {
  initialization ??= initializeFirebaseAuth().then(auth => {
    state.auth = auth;
    if (auth.status !== 'ready') return;
    auth.onChange(changeUser);
    document.addEventListener('personalization-choice-changed', event => {
      if (!state.uid || event.detail?.uid !== state.uid || auth.currentUser()?.uid !== state.uid) return;
      clear();
      verify();
    });
    const suspend = () => { returned = true; state.job++; state.ready = false; state.enabled = false; state.pending = null; };
    const resume = () => { if (returned) { returned = false; verify(); } };
    window.addEventListener('blur', suspend);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' ? suspend() : resume());
    window.addEventListener('pageshow', event => { if (event.persisted) verify(); });
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('intimo-personalization');
      channel.onmessage = event => {
        if (event.data?.type !== 'choice-changed' || event.data?.uid !== state.uid) return;
        clear(); suspend();
        if (document.visibilityState !== 'hidden') resume();
      };
      window.addEventListener('pagehide', event => { if (!event.persisted) channel.close(); });
    }
  }).catch(() => { state.enabled = false; state.ready = true; });
  return initialization;
}

async function permitted(user) {
  await initializeNavigationPersonalization();
  const currentUser = state.auth?.status === 'ready' ? state.auth.currentUser() : null;
  if (!currentUser || (user && currentUser.uid !== user.uid)) return '';
  if (state.uid !== currentUser.uid) changeUser(currentUser);
  const uid = currentUser.uid;
  const job = state.job;
  if (state.pending) await state.pending;
  return state.job === job && state.uid === uid && state.ready && state.enabled && state.auth.currentUser()?.uid === uid ? uid : '';
}

export async function getNavigationSignals(user) {
  const uid = await permitted(user);
  return uid && state.uid === uid && state.auth.currentUser()?.uid === uid ? { enabled: true, ...savedSignals(uid) } : empty();
}

function productGroup(product, categories) {
  const category = categories.find(item => item.id === product.categoryId);
  if (!category || category.published === false) return '';
  return categoryGroupId(product.categoryId) || categoryGroupId(category.slug);
}

export async function recordProductView(product, categories = []) {
  const customer = state.auth?.status === 'ready' ? state.auth.currentUser() : null;
  if (!customer || !product || product.published === false || product.isDemo === true || !/^[A-Za-z0-9_-]{1,80}$/.test(product.id || '')) return;
  const uid = await permitted(customer);
  if (!uid || state.uid !== uid || state.auth.currentUser()?.uid !== uid) return;
  if (!categories.some(category => category.id === product.categoryId && category.published === true)) return;
  if (lastProduct === product.id) return;
  lastProduct = product.id;
  const signals = savedSignals(uid);
  const group = productGroup(product, categories);
  if (group) signals.groupScores[group] = Math.min(1000, (signals.groupScores[group] || 0) + 3);
  signals.recentProductIds = [product.id, ...signals.recentProductIds.filter(id => id !== product.id)].slice(0, 20);
  persist(signals, uid);
}

export async function recordCatalogSearch(query, products = [], categories = []) {
  const normalized = normalizeSearch(query).slice(0, 150);
  const customer = state.auth?.status === 'ready' ? state.auth.currentUser() : null;
  if (!customer || normalized.length < 2) return;
  const uid = await permitted(customer);
  if (!uid || state.uid !== uid || state.auth.currentUser()?.uid !== uid || lastSearch === normalized) return;
  const matches = selectProducts(products, { query: normalized });
  const counts = new Map();
  for (const product of matches) {
    if (product.isDemo === true) continue;
    const group = productGroup(product, categories);
    if (group) counts.set(group, (counts.get(group) || 0) + 1);
  }
  if (!counts.size) return;
  lastSearch = normalized; // In memory only, never serialized or sent to Firestore.
  const signals = savedSignals(uid);
  for (const [group] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    signals.groupScores[group] = Math.min(1000, (signals.groupScores[group] || 0) + 1);
  }
  persist(signals, uid);
}
