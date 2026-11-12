import { initializeFirebaseAuth } from './firebase-auth.js';
import { loadCustomerProfile } from './customer-profile.js';
import { loadPublicCatalogPreview, loadPublicProductsByIds, readPublicVersion } from './firestore-catalog.js';
import { CATALOG_GROUPS, categoryGroupId } from './catalog-taxonomy.js';
import { createCatalogImages } from './catalog-images.js';
import { isSafeImage } from './catalog-model.js';
import { productIsAvailable } from './product-variants.js';
import { getNavigationSignals, recordProductView } from './navigation-personalization.js';

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Explicit preferences are always available. Navigation signals are optional
// and remain inside the current browser tab after consent verification.
export function initializeHomeAccount() {
  const invitation = document.getElementById('home-account-invitation');
  const section = document.getElementById('home-recommendations');
  if (!invitation || !section || section.dataset.initialized) return;
  section.dataset.initialized = 'true';
  const greeting = document.getElementById('home-recommendations-greeting');
  const status = document.getElementById('home-recommendations-status');
  const list = document.getElementById('home-recommendations-list');
  const interests = document.getElementById('home-recommendation-interests');
  const retry = document.getElementById('home-recommendation-retry');
  const images = createCatalogImages();
  let auth;
  let user = null;
  let uid = null;
  let revision = 0;
  let cachedCatalog;
  let cachedVersion;
  let cachedSelection;
  let catalogRead;
  let pendingSelection;
  let controller;
  let refreshOnReturn = document.visibilityState === 'hidden';

  function clear() {
    images.reset();
    greeting.textContent = '';
    list.replaceChildren();
    list.hidden = true;
    interests.replaceChildren();
    interests.hidden = true;
    retry.hidden = true;
  }

  function catalog(profile, signals) {
    const groupIds = [...new Set([...profile.interests, ...Object.entries(signals.groupScores).sort((a, b) => b[1] - a[1]).map(([id]) => id)])];
    const categoryIds = [...new Set(groupIds.flatMap(id => CATALOG_GROUPS.find(group => group.id === id)?.categoryIds || []))];
    const ids = [...new Set([...profile.favoriteProductIds.slice(-8).reverse(), ...signals.recentProductIds])].slice(0, 12);
    const selection = JSON.stringify([categoryIds, ids]);
    if (catalogRead && pendingSelection === selection) return catalogRead;
    if (catalogRead) controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const pending = readPublicVersion(signal).then(async version => {
      if (cachedCatalog && cachedVersion === version && cachedSelection === selection) return cachedCatalog;
      const selected = await loadPublicProductsByIds({ signal, ids });
      const candidateCategories = [...new Set([...categoryIds, ...selected.map(product => product.categoryId)])];
      const data = await loadPublicCatalogPreview({ signal, categoryIds: candidateCategories.length ? candidateCategories : undefined, pageSize: 6 });
      data.products = [...new Map([...data.products, ...selected].map(product => [product.id, product])).values()];
      if (!signal.aborted) { cachedCatalog = data; cachedVersion = version; cachedSelection = selection; }
      return data;
    }).finally(() => { if (catalogRead === pending) catalogRead = undefined; });
    catalogRead = pending;
    pendingSelection = selection;
    return pending;
  }

  function current(job, customer) {
    return revision === job && uid === customer.uid && auth.currentUser()?.uid === customer.uid;
  }

  function renderInterests(profile) {
    const groups = CATALOG_GROUPS.filter(group => profile.interests.includes(group.id));
    interests.replaceChildren(...groups.map(group => {
      const item = element('li');
      const link = element('a', '', group.name);
      link.href = `/catalogo.html?reparto=${encodeURIComponent(group.id)}`;
      item.append(link);
      return item;
    }));
    interests.hidden = groups.length === 0;
  }

  function renderProducts(data, profile, signals) {
    const categories = new Map(data.categories.filter(category => category.published !== false).map(category => [category.id, category]));
    const products = data.products.filter(product => categories.has(product.categoryId) && product.published !== false && product.isDemo !== true && productIsAvailable(product));
    const favorites = new Set(profile.favoriteProductIds);
    const favoriteCategories = new Set(products.filter(product => favorites.has(product.id)).map(product => product.categoryId));
    const scored = products.map((product, index) => ({ product, index, score:
      (favorites.has(product.id) ? 100 : 0) +
      (profile.interests.includes(categoryGroupId(product.categoryId)) ? 20 : 0) +
      (favoriteCategories.has(product.categoryId) ? 10 : 0) +
      (signals.recentProductIds.includes(product.id) ? 40 + (20 - signals.recentProductIds.indexOf(product.id)) / 20 : 0) +
      Math.min(20, signals.groupScores[categoryGroupId(product.categoryId)] || 0)
    })).sort((a, b) => b.score - a.score || a.index - b.index);
    const matches = scored.filter(item => item.score > 0);
    const selected = (matches.length ? matches : scored).slice(0, 4);
    images.reset();
    list.replaceChildren(...selected.map(({ product }) => {
      const category = categories.get(product.categoryId);
      const item = element('li');
      item.dataset.productId = product.id;
      const link = element('a', 'home-recommendation-card');
      // The catalogue's existing search/category route brings the customer to
      // the actual article without introducing an unsupported product URL.
      link.href = `/catalogo.html?${new URLSearchParams({ categoria: category.slug, cerca: product.name })}`;
      link.addEventListener('click', () => { recordProductView(product, data.categories).catch(() => {}); });
      const photograph = element('div', 'home-recommendation-image');
      if (isSafeImage(product.image)) {
        const image = element('img');
        image.alt = product.imageAlt || product.name;
        image.width = 720;
        image.height = 900;
        image.loading = 'lazy';
        photograph.append(image);
        images.show(image, product.image);
      } else {
        photograph.append(element('span', 'home-recommendation-no-photo', 'Fotografia non disponibile'));
      }
      const copy = element('div', 'home-recommendation-copy');
      copy.append(element('p', 'home-recommendation-category', category.name));
      copy.append(element('h3', '', product.name));
      copy.append(element('p', 'home-recommendation-price', product.price === null || product.price === undefined ? 'Informazioni in negozio' : euro.format(product.price)));
      link.append(photograph, copy);
      item.append(link);
      return item;
    }));
    list.hidden = selected.length === 0;
    return { count: selected.length, personalized: matches.length > 0, behavioral: selected.some(({ product }) => signals.recentProductIds.includes(product.id) || (signals.groupScores[categoryGroupId(product.categoryId)] || 0) > 0) };
  }

  async function refresh() {
    if (!user) return;
    const customer = user;
    const job = ++revision;
    clear();
    section.dataset.state = 'loading';
    status.textContent = 'Caricamento delle tue scelte…';
    const [profileResult, signalsResult] = await Promise.allSettled([loadCustomerProfile(customer), getNavigationSignals(customer)]);
    if (!current(job, customer)) return;
    const profile = profileResult.status === 'fulfilled' ? profileResult.value : { displayName: '', interests: [], favoriteProductIds: [] };
    const signals = signalsResult.status === 'fulfilled' ? signalsResult.value : { enabled: false, groupScores: {}, recentProductIds: [] };
    let catalogResult;
    try { catalogResult = { status: 'fulfilled', value: await catalog(profile, signals) }; }
    catch { catalogResult = { status: 'rejected' }; }
    if (!current(job, customer)) return;
    greeting.textContent = profile.displayName ? `Ciao, ${profile.displayName}.` : 'Il tuo spazio, da Intimo Patrizia.';
    renderInterests(profile);
    if (catalogResult.status !== 'fulfilled') {
      section.dataset.state = 'error';
      status.textContent = 'I prodotti non sono disponibili in questo momento. Puoi riprovare o esplorare il catalogo.';
      retry.hidden = false;
      return;
    }
    const result = renderProducts(catalogResult.value, profile, signals);
    section.dataset.state = result.count ? 'ready' : 'empty';
    if (profileResult.status !== 'fulfilled') {
      status.textContent = 'Le tue preferenze non sono disponibili. Puoi riprovare; intanto esplora il catalogo.';
      retry.hidden = false;
    } else if (!result.count) {
      status.textContent = 'Il catalogo si sta preparando: appena il negozio pubblicherà i prodotti, qui troverai una selezione. Intanto esplora i tuoi reparti o scegli le tue preferenze.';
    } else {
      status.textContent = result.personalized
        ? signals.enabled && result.behavioral
          ? 'Una selezione dalle tue scelte e dalle consultazioni e ricerche di questa sessione.'
          : 'Una selezione dai reparti che hai scelto e dai tuoi preferiti.'
        : 'Esplora una selezione dal catalogo. Scegli i tuoi reparti e salva i preferiti per renderla più personale.';
    }
  }

  function changeCustomer(customer) {
    const nextUid = customer?.uid || '';
    if (nextUid === uid) return;
    uid = nextUid;
    user = customer;
    revision++;
    controller?.abort();
    catalogRead = undefined;
    cachedCatalog = undefined;
    cachedVersion = undefined;
    clear();
    invitation.hidden = Boolean(customer);
    section.hidden = !customer;
    if (customer) refresh();
  }

  retry.addEventListener('click', () => { cachedCatalog = undefined; refresh(); });
  document.addEventListener('customer-profile-changed', event => {
    if (user && event.detail?.uid === uid && auth?.currentUser()?.uid === uid) refresh();
  });
  document.addEventListener('personalization-choice-changed', event => {
    if (user && event.detail?.uid === uid && auth?.currentUser()?.uid === uid) refresh();
  });
  window.addEventListener('blur', () => { refreshOnReturn = true; });
  window.addEventListener('focus', () => {
    if (refreshOnReturn && user && document.visibilityState !== 'hidden') {
      refreshOnReturn = false;
      refresh();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') refreshOnReturn = true;
    else if (refreshOnReturn && user) { refreshOnReturn = false; refresh(); }
  });
  window.addEventListener('pageshow', event => { if (event.persisted && user) refresh(); });
  initializeFirebaseAuth().then(session => {
    auth = session;
    if (auth.status === 'ready') auth.onChange(changeCustomer);
    else changeCustomer(null);
  }).catch(() => changeCustomer(null));
}
