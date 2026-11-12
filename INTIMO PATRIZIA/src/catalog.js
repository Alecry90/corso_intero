import './styles.css';
import './catalog.css';
import './boutique.css';
import { initializeShell, escapeHTML } from './shared.js';
import { selectProducts, visibleCatalog, isSafeImage, normalizeSearch } from './catalog-model.js';
import { createCatalogSync } from './catalog-sync.js';
import { loadPublicCatalogPage, loadPublicProductsByIds, readPublicVersion } from './firestore-catalog.js';
import { compareCatalogProducts } from './catalog-pager.js';
import { createCatalogImages } from './catalog-images.js';
import { catalogGroups } from './catalog-taxonomy.js';
import { initializeFirebaseAuth } from './firebase-auth.js';
import { loadCustomerProfile, toggleCustomerFavorite } from './customer-profile.js';
import { recordProductView, recordCatalogSearch } from './navigation-personalization.js';
import { mountProductGallery } from './product-gallery.js';
import { mountProductContact } from './product-contact.js';
import { matchesVariantSelection, productIsAvailable } from './product-variants.js';

initializeShell({ active: 'catalog' });
const $ = id => document.getElementById(id);
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const explicitDemo = import.meta.env.VITE_CATALOG_MODE === 'demo';
const params = new URLSearchParams(location.search);
let catalog = { categories: [], products: [] };
let catalogLoaded = false;
let loadedRealData = false;
let localPreview = false;
let activeCategory = '';
let activeGroup = '';
let catalogSignature = '';
let categoriesSignature = '';
let openProductId;
let detailSignature = '';
let dialogOpener;
let returnDialogFocus = true;
let detailProduct;
let detailGallery;
let detailContact;
let detailController;
let productLinkController;
let productLinkJob = 0;
let productLinkResolved = '';
let productLinkResume = false;
let preserveProductURLOnClose = false;
let catalogNotice = '';
let favoritesOnly = params.get('preferiti') === '1';
let customerAuth;
let customerUser = null;
let customerUID;
let customerProfileState = 'checking';
let favoriteProductIds = new Set();
let favoriteSaving = false;
let favoriteRequestVersion = 0;
let favoriteProfileRead = null;
let favoriteRefreshAfterSave = false;
let favoriteRefreshOnReturn = document.visibilityState === 'hidden';
const pageSize = 24;
const requestedPage = value => Math.max(0, Math.min(208, (Number.parseInt(value, 10) || 1) - 1));
let pageIndex = requestedPage(params.get('pagina'));
let catalogCursor = null;
let catalogComplete = true;
let remoteKey = '';
let remoteBusy = false;
let remoteController;
let remoteTimer;
let remoteJob = 0;
let searchSignalTimer;
let pendingSearchSignal = params.get('cerca')?.trim().slice(0, 150) || '';
let remoteResume = false;
const catalogImages = createCatalogImages();
const favoriteIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/></svg>';

function setFavoriteStatus(message = '') {
  const status = $('catalog-favorites-status');
  if (status.textContent !== message) status.textContent = message;
  status.hidden = !message;
}

function renderAccountState() {
  const signedIn = Boolean(customerUser);
  $('catalog-account-copy').textContent = signedIn
    ? 'Ritrova i prodotti che hai salvato nel tuo account.'
    : 'Accedi per salvare i preferiti. Puoi esplorare tutto il catalogo anche senza account.';
  const link = $('catalog-account-link');
  link.textContent = signedIn ? 'Il tuo account' : 'Accedi';
  link.href = `/accedi.html?${new URLSearchParams({ ritorno: `/catalogo.html${location.search}` })}`;
  $('catalog-favorites-filter').setAttribute('aria-pressed', String(favoritesOnly));
}

function updateFavoriteButton(button, product) {
  const saved = customerProfileState === 'ready' && favoriteProductIds.has(product.id);
  button.setAttribute('aria-pressed', String(saved));
  button.setAttribute('aria-label', `${saved ? 'Rimuovi' : 'Salva'} ${product.name} ${saved ? 'dai' : 'tra i'} preferiti`);
  button.setAttribute('aria-disabled', String(favoriteSaving || Boolean(favoriteProfileRead) || customerProfileState === 'loading' || customerProfileState === 'checking'));
  button.setAttribute('aria-busy', String(favoriteSaving));
}

function refreshFavoriteButtons() {
  $('catalog-products').querySelectorAll('.product-favorite').forEach(button => {
    const product = catalog.products.find(item => item.id === button.closest('[data-product-id]').dataset.productId);
    if (product) updateFavoriteButton(button, product);
  });
}

function inviteToSignIn() {
  setFavoriteStatus('Accedi per salvare i preferiti nel tuo account. L’accesso è facoltativo: puoi continuare a esplorare il catalogo.');
  renderAccountState();
  $('catalog-account-link').focus({ preventScroll: false });
}

async function saveFavorite(productId) {
  const currentUser = customerAuth?.currentUser?.() || null;
  if ((currentUser?.uid || '') !== (customerUser?.uid || '')) changeCustomer(currentUser);
  if (favoriteSaving || favoriteProfileRead || customerProfileState === 'loading' || customerProfileState === 'checking') return;
  if (!customerUser) { inviteToSignIn(); return; }
  if (customerProfileState !== 'ready') {
    setFavoriteStatus('I tuoi preferiti non sono disponibili. Apri il tuo account per riprovare; il catalogo resta consultabile.');
    return;
  }
  const user = customerUser;
  const request = favoriteRequestVersion;
  const product = catalog.products.find(item => item.id === productId);
  if (!product) return;
  favoriteSaving = true;
  setFavoriteStatus('Salvataggio del preferito…');
  refreshFavoriteButtons();
  try {
    const profile = await toggleCustomerFavorite(user, productId);
    if (request !== favoriteRequestVersion || customerAuth.currentUser()?.uid !== user.uid) return;
    favoriteProductIds = new Set(profile.favoriteProductIds);
    renderProducts(false);
    setFavoriteStatus(favoriteProductIds.has(productId) ? `${product.name} è stato salvato tra i preferiti.` : `${product.name} è stato rimosso dai preferiti.`);
  } catch (error) {
    if (request !== favoriteRequestVersion || customerAuth.currentUser()?.uid !== user.uid) return;
    const known = ['favorites-limit', 'invalid-profile', 'unauthenticated', 'permission-denied', 'profile-unavailable'];
    setFavoriteStatus(known.includes(error.code?.replace('firestore/', '')) ? error.message : 'Non è stato possibile aggiornare i preferiti. Riprova tra poco.');
  } finally {
    if (request === favoriteRequestVersion) {
      favoriteSaving = false;
      refreshFavoriteButtons();
      if (favoriteRefreshAfterSave) {
        favoriteRefreshAfterSave = false;
        readCustomerFavorites();
      }
    }
  }
}

function changeCustomer(user) {
  const uid = user?.uid || '';
  customerUser = user || null;
  if (uid === customerUID) return;
  customerUID = uid;
  ++favoriteRequestVersion;
  favoriteProfileRead = null;
  favoriteRefreshAfterSave = false;
  favoriteProductIds = new Set();
  favoriteSaving = false;
  customerProfileState = uid ? 'loading' : 'anonymous';
  setFavoriteStatus(uid ? 'Caricamento dei tuoi preferiti…' : '');
  renderAccountState();
  renderProducts(false);
  if (uid) readCustomerFavorites();
}

function readCustomerFavorites() {
  const user = customerUser;
  if (!user || favoriteProfileRead || favoriteSaving) return;
  const request = favoriteRequestVersion;
  const read = { uid: user.uid };
  favoriteProfileRead = read;
  if (customerProfileState === 'ready') setFavoriteStatus('Aggiornamento dei tuoi preferiti…');
  refreshFavoriteButtons();
  loadCustomerProfile(user).then(profile => {
    if (favoriteProfileRead !== read || request !== favoriteRequestVersion || customerAuth.currentUser()?.uid !== user.uid) return;
    favoriteProductIds = new Set(profile.favoriteProductIds);
    customerProfileState = 'ready';
    setFavoriteStatus();
    renderProducts(false);
  }).catch(() => {
    if (favoriteProfileRead !== read || request !== favoriteRequestVersion || customerAuth.currentUser()?.uid !== user.uid) return;
    favoriteProductIds = new Set();
    customerProfileState = 'error';
    setFavoriteStatus('Non riusciamo a caricare i tuoi preferiti. Puoi riprovare dal tuo account; il catalogo resta consultabile.');
    renderProducts(false);
  }).finally(() => {
    if (favoriteProfileRead !== read) return;
    favoriteProfileRead = null;
    refreshFavoriteButtons();
  });
}

function refreshReturningCustomer() {
  const user = customerAuth?.currentUser?.() || null;
  if ((user?.uid || '') !== (customerUser?.uid || '')) { changeCustomer(user); return; }
  if (!user) return;
  if (favoriteSaving) { favoriteRefreshAfterSave = true; return; }
  readCustomerFavorites();
}

addEventListener('blur', event => { if (event.target === window) favoriteRefreshOnReturn = true; });
addEventListener('focus', event => {
  if (event.target !== window || !favoriteRefreshOnReturn || document.visibilityState === 'hidden') return;
  favoriteRefreshOnReturn = false;
  refreshReturningCustomer();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { favoriteRefreshOnReturn = true; suspendRemoteSelection(); return; }
  resumeRemoteSelection();
  if (!favoriteRefreshOnReturn) return;
  favoriteRefreshOnReturn = false;
  refreshReturningCustomer();
});
addEventListener('pagehide', () => {
  suspendRemoteSelection();
  favoriteRefreshOnReturn = true;
  // A read started before leaving must not restore an outdated snapshot from bfcache.
  favoriteProfileRead = null;
});
addEventListener('pageshow', event => {
  if (!event.persisted) return;
  resumeRemoteSelection();
  favoriteRefreshOnReturn = false;
  refreshReturningCustomer();
});

function imageHTML(product, lazy = false) {
  if (!isSafeImage(product.image)) return '<div class="product-no-photo">Fotografia in arrivo</div>';
  const source = /^\/api\/images\//.test(product.image) ? 'data-catalog-image' : 'src';
  return `<img ${source}="${escapeHTML(product.image)}" alt="${escapeHTML(product.imageAlt || product.name)}" width="720" height="720"${lazy ? ' loading="lazy"' : ''}>`;
}
function hydrateImages(container) {
  container.querySelectorAll('[data-catalog-image]').forEach(image => catalogImages.show(image, image.dataset.catalogImage));
}

$('catalog-search').value = params.get('cerca')?.slice(0, 150) || '';
if (['recommended', 'price-asc', 'price-desc', 'name'].includes(params.get('ordine'))) $('catalog-sort').value = params.get('ordine');
const attributeFields = { taglia: 'catalog-size', colore: 'catalog-color', tessuto: 'catalog-material', 'prezzo-min': 'catalog-price-min', 'prezzo-max': 'catalog-price-max' };
function restoreAttributeFilters(current) {
  Object.entries(attributeFields).forEach(([name, id]) => {
    const input = $(id);
    const value = (current.get(name) || '').slice(0, input.maxLength > 0 ? input.maxLength : 12);
    input.value = input.type === 'number' ? /^\d{1,6}(?:\.\d{1,2})?$/.test(value) ? value : '' : value;
  });
}
restoreAttributeFilters(params);

function attributeFilters() {
  const price = id => $(id).value !== '' && $(id).validity.valid ? Number($(id).value) : null;
  return { size: normalizeSearch($('catalog-size').value), color: normalizeSearch($('catalog-color').value), material: normalizeSearch($('catalog-material').value), min: price('catalog-price-min'), max: price('catalog-price-max') };
}
function hasAttributeFilters(filters = attributeFilters()) {
  return Boolean(filters.size || filters.color || filters.material || filters.min !== null || filters.max !== null);
}
function validPriceRange(filters = attributeFilters()) {
  return filters.min === null || filters.max === null || filters.max >= filters.min;
}
function updateAttributeSuggestions() {
  const fields = [['size', 'sizes'], ['color', 'colors'], ['material', 'material']];
  fields.forEach(([input, key]) => {
    const values = [...new Set(departmentProducts().flatMap(product => Array.isArray(product[key]) ? product[key] : product[key] ? [product[key]] : []))].sort((a, b) => a.localeCompare(b, 'it'));
    const datalist = $(`catalog-${input}-values`);
    const signature = JSON.stringify(values);
    if (datalist.dataset.signature === signature) return;
    datalist.innerHTML = values.map(value => `<option value="${escapeHTML(value)}"></option>`).join('');
    datalist.dataset.signature = signature;
  });
}

function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function fetchJSON(url, signal) {
  const response = await fetch(url, { signal, cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw new Error('Catalogo momentaneamente non disponibile. Riprova oppure contattaci in negozio.');
  return response.json();
}

function setSyncStatus(message = '') {
  const status = $('catalog-sync-status');
  if (!status) return;
  if (status.textContent !== message) status.textContent = message;
  status.hidden = !message;
}

const localMessage = 'Anteprima locale: il servizio del catalogo non è attivo. I reparti e i prodotti pubblicati appariranno qui quando sarà disponibile.';

function activeDepartment() {
  return catalogGroups(catalog.categories).find(group => group.id === activeGroup);
}

function restoreSelection(search = location.search) {
  const current = new URLSearchParams(search);
  const groups = catalogGroups(catalog.categories);
  const requestedCategory = current.get('categoria');
  activeCategory = catalog.categories.find(category => category.slug === requestedCategory)?.id || '';
  if (!activeCategory && requestedCategory === 'neonato') activeCategory = catalog.categories.find(category => category.id === 'intimo-neonato')?.id || '';
  const legacyGroups = { intimo: 'intimo', pigiameria: 'pigiami-e-relax', 'biancheria-casa': 'biancheria-casa' };
  // Existing leaf-only links still work; a display-name change keeps its ID.
  activeGroup = activeCategory ? groups.find(group => group.categoryIds.includes(activeCategory))?.id || '' : (groups.find(group => group.id === current.get('reparto')) || groups.find(group => group.id === legacyGroups[requestedCategory]))?.id || '';
}

function departmentProducts() {
  const group = activeDepartment();
  if (!group) return catalog.products;
  const ids = new Set(group.categoryIds);
  return catalog.products.filter(product => ids.has(product.categoryId));
}

function catalogSelection() {
  const categoryIds = activeCategory ? [activeCategory] : activeDepartment()?.categoryIds;
  const query = $('catalog-search').value.trim();
  const sort = $('catalog-sort').value;
  const filters = attributeFilters();
  const key = JSON.stringify([categoryIds || [], query, sort, filters, favoritesOnly, favoritesOnly ? [...favoriteProductIds].sort() : []]);
  return { categoryIds, query, sort, filters, key, scan: Boolean(query) || favoritesOnly || hasAttributeFilters(filters) };
}

function suspendRemoteSelection() {
  clearTimeout(searchSignalTimer);
  pendingSearchSignal = '';
  suspendProductDetail();
  if (!remoteBusy) return;
  remoteResume = true;
  clearTimeout(remoteTimer);
  remoteController?.abort();
  ++remoteJob;
  remoteBusy = false;
  $('catalog-products').setAttribute('aria-busy', 'false');
}

function resumeRemoteSelection() {
  resumeProductDetail();
  if (!remoteResume || document.visibilityState === 'hidden') return;
  remoteResume = false;
  if (catalogLoaded && loadedRealData && !localPreview) requestSelection({ preservePage: true });
}

function recordReadySearch() {
  const query = $('catalog-search').value.trim();
  if (!pendingSearchSignal || pendingSearchSignal !== query || !customerAuth || customerProfileState === 'checking' || remoteBusy || !catalogComplete || document.visibilityState === 'hidden') return;
  pendingSearchSignal = '';
  if (loadedRealData && !localPreview && !catalog.demo) recordCatalogSearch(query, departmentProducts(), catalog.categories).catch(() => {});
}

function scheduleSearchSignal(immediate = false) {
  clearTimeout(searchSignalTimer);
  pendingSearchSignal = '';
  const query = $('catalog-search').value.trim();
  const ready = () => {
    if ($('catalog-search').value.trim() !== query) return;
    pendingSearchSignal = query;
    recordReadySearch();
  };
  if (immediate) ready();
  else searchSignalTimer = setTimeout(ready, 600);
}

async function readSelection(signal, { onProgress, pages = pageIndex + 1 } = {}) {
  let selection = catalogSelection();
  if (favoritesOnly) {
    const data = await loadPublicCatalogPage({ signal, categoryIds: selection.categoryIds, pageSize: 1 });
    if (!catalogLoaded) { catalog.categories = data.categories; restoreSelection(); selection = catalogSelection(); }
    const ids = customerProfileState === 'ready' ? [...favoriteProductIds] : [];
    const products = [];
    for (let start = 0; start < ids.length; start += 12) {
      products.push(...await loadPublicProductsByIds({ ids: ids.slice(start, start + 12), signal }));
      onProgress?.({ ...data, products: [...products], complete: false, selectionKey: selection.key });
    }
    return { ...data, products, complete: true, nextCursor: null, selectionKey: selection.key, favoriteSubset: true, coveredCategoryIds: null };
  }
  let data = await loadPublicCatalogPage({ signal, categoryIds: selection.categoryIds, sort: selection.sort, pageSize: selection.scan ? 100 : pageSize });
  if (!catalogLoaded) {
    catalog.categories = data.categories;
    restoreSelection();
    const restored = catalogSelection();
    if (restored.key !== selection.key) {
      selection = restored;
      data = await loadPublicCatalogPage({ signal, categoryIds: selection.categoryIds, sort: selection.sort, pageSize: selection.scan ? 100 : pageSize });
    }
  }
  const products = [...data.products];
  let count = 1;
  while (data.nextCursor && (selection.scan || count < pages)) {
    onProgress?.({ ...data, products: [...products], selectionKey: selection.key });
    data = await loadPublicCatalogPage({ signal, categoryIds: selection.categoryIds, sort: selection.sort, pageSize: selection.scan ? 100 : pageSize, cursor: data.nextCursor });
    products.push(...data.products);
    count++;
  }
  return { ...data, products, selectionKey: selection.key, favoriteSubset: false, coveredCategoryIds: selection.categoryIds || null };
}

function requestSelection({ preservePage = false } = {}) {
  clearTimeout(remoteTimer);
  remoteController?.abort();
  const job = ++remoteJob;
  const pages = preservePage ? pageIndex + 1 : 1;
  if (!preservePage) pageIndex = 0;
  remoteKey = catalogSelection().key;
  catalogComplete = false;
  catalogCursor = null;
  remoteBusy = true;
  $('catalog-products').setAttribute('aria-busy', 'true');
  $('catalog-empty').hidden = true;
  $('catalog-page-next').disabled = true;
  $('catalog-page-previous').disabled = true;
  $('catalog-page-status').textContent = 'Caricamento…';
  const selection = catalogSelection();
  $('catalog-count').textContent = selection.scan ? 'Ricerca nel catalogo completo…' : 'Caricamento delle proposte…';
  remoteTimer = setTimeout(async () => {
    const controller = new AbortController();
    remoteController = controller;
    try {
      const data = await readSelection(controller.signal, { pages, onProgress: partial => {
        if (job !== remoteJob) return;
        catalog = { ...catalog, ...partial };
        catalogComplete = false;
        renderProducts(false);
      } });
      if (job !== remoteJob) return;
      catalog = { ...catalog, ...data };
      catalogCursor = data.nextCursor;
      catalogComplete = data.complete === true;
      remoteBusy = false;
      renderProducts();
      setSyncStatus();
    } catch (error) {
      if (job !== remoteJob || controller.signal.aborted) return;
      remoteBusy = false;
      catalogComplete = false;
      catalogCursor = null;
      setSyncStatus('Non riusciamo a completare il caricamento. Riprova con “Aggiorna catalogo”.');
      $('catalog-error-text').textContent = 'Non è stato possibile completare il caricamento delle proposte.';
      $('catalog-error').hidden = false;
      renderProducts(false);
    } finally {
      if (job === remoteJob) $('catalog-products').setAttribute('aria-busy', 'false');
    }
  }, selection.query ? 250 : 0);
}

async function nextPage() {
  if (remoteBusy) return;
  const count = filteredProducts().length;
  if ((pageIndex + 1) * pageSize < count) { pageIndex++; renderProducts(); return; }
  if (!catalogCursor) return;
  const selection = catalogSelection();
  const job = ++remoteJob;
  remoteController?.abort();
  const controller = new AbortController();
  remoteController = controller;
  remoteBusy = true;
  renderProducts(false);
  $('catalog-products').setAttribute('aria-busy', 'true');
  try {
    const data = await loadPublicCatalogPage({ signal: controller.signal, categoryIds: selection.categoryIds, sort: selection.sort, pageSize, cursor: catalogCursor });
    if (job !== remoteJob) return;
    const existing = new Set(catalog.products.map(product => product.id));
    catalog.products.push(...data.products.filter(product => !existing.has(product.id)));
    catalogCursor = data.nextCursor;
    catalogComplete = data.complete;
    if (data.products.length) pageIndex++;
  } catch (error) {
    if (!controller.signal.aborted) setSyncStatus('La pagina successiva non è disponibile. Riprova tra poco.');
  } finally {
    if (job === remoteJob) { remoteBusy = false; renderProducts(); $('catalog-products').setAttribute('aria-busy', 'false'); }
  }
}

function filteredProducts() {
  const source = favoritesOnly ? departmentProducts().filter(product => customerProfileState === 'ready' && favoriteProductIds.has(product.id)) : departmentProducts();
  const filters = attributeFilters();
  const matches = selectProducts(source, { categoryId: activeCategory, query: $('catalog-search').value, sort: $('catalog-sort').value }).filter(product =>
    matchesVariantSelection(product, { size: filters.size, color: filters.color }) &&
    (!filters.material || normalizeSearch(product.material).includes(filters.material)) &&
    (filters.min === null || (typeof product.price === 'number' && product.price >= filters.min)) &&
    (filters.max === null || (typeof product.price === 'number' && product.price <= filters.max)) && validPriceRange(filters));
  if (loadedRealData && !localPreview && !catalogSelection().scan) matches.sort((a, b) => compareCatalogProducts(a, b, $('catalog-sort').value));
  return matches;
}

function applyCatalog({ data, source }, { initial }) {
  const visible = visibleCatalog(data);
  const next = {
    ...visible,
    demo: data.demo === true,
    products: visible.products.filter(product => data.demo === true || product.isDemo !== true),
  };
  const signature = stableJSON({ categories: next.categories, products: next.products, demo: next.demo, complete: next.complete, selectionKey: data.selectionKey });
  localPreview = source === 'local';
  if (source === 'api') loadedRealData = true;
  $('catalog-error').hidden = true;
  $('catalog-demo').hidden = !next.demo;
  if (signature === catalogSignature && catalogLoaded) return;

  const scroll = { left: window.scrollX, top: window.scrollY };
  const firstData = !catalogLoaded;
  catalog = next;
  catalogCursor = data.nextCursor || null;
  catalogComplete = data.complete !== false;
  remoteKey = data.selectionKey || '';
  if (firstData) restoreSelection();
  else {
    const groups = catalogGroups(catalog.categories);
    if (!catalog.categories.some(category => category.id === activeCategory)) activeCategory = '';
    if (activeCategory) activeGroup = groups.find(group => group.categoryIds.includes(activeCategory))?.id || '';
    else if (!groups.some(group => group.id === activeGroup)) activeGroup = '';
  }
  catalogImages.reset();
  catalogSignature = signature;
  catalogLoaded = true;
  renderCategories();
  updateAttributeSuggestions();
  renderProducts();
  synchronizeDetail();
  if (!initial && (window.scrollX !== scroll.left || window.scrollY !== scroll.top)) window.scrollTo({ ...scroll, behavior: 'instant' });
}

function renderFilterButtons(container, options, active, dataKey, onSelect) {
  const focused = container.contains(document.activeElement) ? document.activeElement : null;
  const existing = new Map([...container.children].map(button => [button.dataset[dataKey], button]));
  options.forEach((option, index) => {
    let button = existing.get(option.id);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset[dataKey] = option.id;
      button.addEventListener('click', () => onSelect(option.id));
    }
    if (button.textContent !== option.name) button.textContent = option.name;
    button.setAttribute('aria-pressed', String(active === option.id));
    if (container.children[index] !== button) container.insertBefore(button, container.children[index] || null);
    existing.delete(option.id);
  });
  existing.forEach(button => button.remove());
  if (focused && (!focused.isConnected || focused.closest('[hidden]') || document.activeElement === document.body)) {
    const fallback = container.closest('[hidden]') ? $('catalog-groups').querySelector('[aria-pressed=true]') : container.firstElementChild;
    (focused.isConnected && !focused.closest('[hidden]') ? focused : fallback || $('catalog-search'))?.focus({ preventScroll: true });
  }
}

function renderCategories() {
  const groups = catalogGroups(catalog.categories);
  const grouped = groups.length > 0;
  const group = groups.find(group => group.id === activeGroup);
  const signature = stableJSON([catalog.categories.map(({ id, name }) => ({ id, name })), groups.map(({ id, categoryIds }) => ({ id, categoryIds })), activeGroup, activeCategory]);
  if (signature === categoriesSignature) return;
  categoriesSignature = signature;
  $('catalog-departments').hidden = !grouped;
  $('catalog-groups').hidden = !grouped;
  $('catalog-subdepartments').hidden = grouped && !group;
  $('catalog-subdepartments').dataset.grouped = String(grouped);
  $('catalog-categories-label').hidden = !grouped;
  $('catalog-categories-label').textContent = group ? `Esplora ${group.name}` : 'Esplora il reparto';
  $('catalog-categories').setAttribute('aria-label', grouped ? 'Filtra per sottoreparto' : 'Filtra per reparto');
  renderFilterButtons($('catalog-groups'), grouped ? [{ id: '', name: 'Tutti i reparti' }, ...groups] : [], activeGroup, 'groupId', id => {
    activeGroup = id;
    activeCategory = '';
    renderCategories();
    renderProducts();
  });
  const options = grouped ? group ? [{ id: '', name: 'Tutto il reparto' }, ...group.categories] : [] : [{ id: '', name: 'Tutte le proposte' }, ...catalog.categories];
  renderFilterButtons($('catalog-categories'), options, activeCategory, 'categoryId', id => {
    activeCategory = id;
    renderCategories();
    renderProducts();
  });
}

function updateEmptyState(products, query) {
  $('catalog-empty').hidden = products.length > 0;
  if (products.length) return;
  let title;
  let text;
  const group = activeDepartment();
  const selectedProducts = departmentProducts();
  if (favoritesOnly && ['checking', 'loading'].includes(customerProfileState)) {
    title = 'Caricamento dei tuoi preferiti.';
    text = 'Puoi disattivare il filtro “I miei preferiti” per esplorare il catalogo completo.';
  } else if (favoritesOnly && !customerUser) {
    title = 'Accedi per ritrovare i preferiti.';
    text = 'L’account serve a salvare i prodotti che ti interessano. Puoi esplorare il catalogo anche senza accedere.';
  } else if (favoritesOnly && customerProfileState !== 'ready') {
    title = 'I preferiti non sono disponibili.';
    text = 'Puoi riprovare dal tuo account oppure disattivare il filtro per esplorare il catalogo completo.';
  } else if (favoritesOnly && !favoriteProductIds.size) {
    title = 'Non hai ancora salvato preferiti.';
    text = 'Usa il cuore accanto a un articolo per ritrovarlo qui. Disattiva il filtro per esplorare le proposte.';
  } else if (favoritesOnly && !catalog.products.some(product => favoriteProductIds.has(product.id))) {
    title = 'Nessun preferito nel catalogo attuale.';
    text = 'I tuoi preferiti compariranno qui se sono presenti nel catalogo pubblicato. Puoi esplorare le altre proposte.';
  } else if (favoritesOnly) {
    title = 'Nessun preferito con questi filtri.';
    text = 'Prova un altro reparto o un’altra parola, oppure azzera i filtri.';
  } else if (activeCategory && !selectedProducts.some(product => product.categoryId === activeCategory)) {
    title = 'Questo reparto non ha ancora prodotti.';
    text = 'I prodotti di questo reparto saranno visibili qui appena pubblicati. Puoi esplorare gli altri reparti.';
  } else if (group && !selectedProducts.length) {
    title = 'Questo reparto si sta preparando.';
    text = 'Non ci sono ancora prodotti pubblicati in questo reparto. Puoi esplorare le sue sezioni o scegliere un altro reparto.';
  } else if (!catalog.products.length) {
    title = 'Il catalogo si sta preparando.';
    text = 'Non ci sono ancora prodotti pubblicati. Torna a trovarci per scoprire le novità del negozio.';
  } else if (query.trim()) {
    title = 'Nessun prodotto trovato.';
    text = 'Non ci sono prodotti che corrispondono alla ricerca. Prova un’altra parola o azzera i filtri.';
  } else if (hasAttributeFilters()) {
    title = 'Nessun prodotto con questi filtri.';
    text = 'Prova un’altra taglia, un colore, un tessuto o una fascia di prezzo, oppure azzera i filtri.';
  } else {
    title = 'Nessun prodotto in questo reparto.';
    text = 'Puoi esplorare gli altri reparti o azzerare i filtri.';
  }
  const heading = $('catalog-empty-title') || $('catalog-empty').querySelector('h2');
  const paragraph = $('catalog-empty-text') || $('catalog-empty').querySelector('p');
  if (heading) heading.textContent = title;
  if (paragraph) paragraph.textContent = text;
}

function renderProducts(syncURL = true) {
  renderAccountState();
  if (!catalogLoaded) {
    if (syncURL) {
      const url = new URL(location.href);
      if (favoritesOnly) url.searchParams.set('preferiti', '1'); else url.searchParams.delete('preferiti');
      if (url.href !== location.href) history.replaceState(null, '', url);
      renderAccountState();
    }
    return;
  }
  const query = $('catalog-search').value;
  const sort = $('catalog-sort').value;
  const selection = catalogSelection();
  const validRange = validPriceRange(selection.filters);
  $('catalog-price-error').hidden = validRange;
  $('catalog-price-max').setAttribute('aria-invalid', String(!validRange));
  $('catalog-price-max').setAttribute('aria-describedby', validRange ? 'catalog-filters-help' : 'catalog-price-error');
  const selectionChanged = loadedRealData && !localPreview && remoteKey !== selection.key;
  if (selectionChanged && validRange) {
    const covered = !catalog.coveredCategoryIds || selection.categoryIds?.every(id => catalog.coveredCategoryIds.includes(id));
    if (catalogComplete && !remoteBusy && !catalog.favoriteSubset && !favoritesOnly && covered) { remoteKey = selection.key; pageIndex = 0; }
    else requestSelection();
  }
  const matches = filteredProducts();
  if (catalogComplete && !remoteBusy) pageIndex = Math.min(pageIndex, Math.max(0, Math.ceil(matches.length / pageSize) - 1));
  const searchPending = selection.scan && !catalogComplete;
  const products = searchPending ? [] : matches.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const range = matches.length ? `${pageIndex * pageSize + 1}–${pageIndex * pageSize + products.length}` : '0';
  const count = !validRange ? 'Controlla la fascia di prezzo.' : searchPending
    ? remoteBusy ? 'Ricerca in corso nel catalogo completo…' : 'Ricerca non completata. Riprova il caricamento.'
    : `${catalogComplete ? matches.length : range} ${matches.length === 1 ? 'proposta' : 'proposte'}${favoritesOnly ? ' nei tuoi preferiti' : ''}${query.trim() ? ` per “${query.trim()}”` : ''}${!catalogComplete ? ' · Altre proposte disponibili' : ''}`;
  if ($('catalog-count').textContent !== count) $('catalog-count').textContent = count;
  updateEmptyState(products, query);
  if (remoteBusy || searchPending || !validRange) $('catalog-empty').hidden = true;
  $('catalog-pagination').hidden = searchPending || !validRange || (!matches.length && !catalogCursor);
  $('catalog-page-previous').disabled = remoteBusy || pageIndex === 0;
  $('catalog-page-next').disabled = remoteBusy || ((pageIndex + 1) * pageSize >= matches.length && !catalogCursor);
  $('catalog-page-status').textContent = remoteBusy ? 'Caricamento…' : `Pagina ${pageIndex + 1}${catalogComplete && matches.length ? ` di ${Math.ceil(matches.length / pageSize)}` : ''}`;
  $('catalog-reset').hidden = !activeCategory && !activeGroup && !query && sort === 'recommended' && !favoritesOnly && !hasAttributeFilters();
  updateAttributeSuggestions();
  const container = $('catalog-products');
  const focused = container.contains(document.activeElement) ? document.activeElement : null;
  const focusedId = focused?.closest('[data-product-id]')?.dataset.productId;
  const existing = new Map([...container.children].map(article => [article.dataset.productId, article]));
  products.forEach((product, index) => {
    const category = catalog.categories.find(category => category.id === product.categoryId);
    const signature = stableJSON([product.name, product.categoryId, category?.name, product.image, product.imageVersion, product.imageAlt, product.price, product.available, product.variantAvailability, product.isDemo]);
    let article = existing.get(product.id);
    if (!article) {
      article = document.createElement('article');
      article.className = 'product-card';
      article.dataset.productId = product.id;
    }
    if (article.dataset.signature !== signature) {
      const image = imageHTML(product, true);
      article.innerHTML = `<button class="product-open" type="button" aria-label="Scopri ${escapeHTML(product.name)}"><div class="product-image">${image}${product.isDemo ? '<span class="sample-label">Esempio</span>' : ''}<span class="product-open-icon" aria-hidden="true">+</span></div><div class="product-card-info"><p class="product-category">${escapeHTML(category?.name)}</p><h2>${escapeHTML(product.name)}</h2><p class="product-price">${product.price === null || product.price === undefined ? 'Informazioni in negozio' : euro.format(product.price)}${product.isDemo ? ' <span>prezzo esempio</span>' : ''}</p>${!productIsAvailable(product) ? '<p class="product-availability">Al momento non disponibile</p>' : ''}</div></button><button class="product-favorite" type="button" aria-pressed="false">${favoriteIcon}</button>`;
      article.dataset.signature = signature;
      article.querySelector('.product-open').addEventListener('click', event => {
        const current = catalog.products.find(item => item.id === product.id);
        if (current) showProduct(current, event.currentTarget);
      });
      article.querySelector('.product-favorite').addEventListener('click', () => saveFavorite(product.id));
    }
    updateFavoriteButton(article.querySelector('.product-favorite'), product);
    if (container.children[index] !== article) container.insertBefore(article, container.children[index] || null);
    existing.delete(product.id);
  });
  existing.forEach(article => article.remove());
  hydrateImages(container);
  if (focused && (!focused.isConnected || document.activeElement === document.body)) {
    const replacement = [...container.children].find(article => article.dataset.productId === focusedId)?.querySelector(focused.matches('.product-favorite') ? '.product-favorite' : '.product-open');
    (replacement || $('catalog-search')).focus({ preventScroll: true });
  }
  if (syncURL) {
    const url = new URL(location.href);
    const category = catalog.categories.find(category => category.id === activeCategory);
    if (activeGroup) url.searchParams.set('reparto', activeGroup); else url.searchParams.delete('reparto');
    if (category) url.searchParams.set('categoria', category.slug); else url.searchParams.delete('categoria');
    if (query.trim()) url.searchParams.set('cerca', query.trim()); else url.searchParams.delete('cerca');
    if (sort !== 'recommended') url.searchParams.set('ordine', sort); else url.searchParams.delete('ordine');
    if (favoritesOnly) url.searchParams.set('preferiti', '1'); else url.searchParams.delete('preferiti');
    if (pageIndex) url.searchParams.set('pagina', String(pageIndex + 1)); else url.searchParams.delete('pagina');
    Object.entries(attributeFields).forEach(([name, id]) => { const value = $(id).value.trim(); if (value) url.searchParams.set(name, value); else url.searchParams.delete(name); });
    if (url.href !== location.href) history.replaceState(null, '', url);
    renderAccountState();
  }
  recordReadySearch();
}

function renderProductDetail(product) {
  const category = catalog.categories.find(category => category.id === product.categoryId);
  const signature = stableJSON([product, category?.name]);
  if (signature === detailSignature) return;
  destroyProductWidgets();
  detailSignature = signature;
  const detail = $('product-detail');
  const focused = detail.contains(document.activeElement) ? document.activeElement : null;
  const focusId = focused?.id;
  const scrollTop = $('product-dialog').scrollTop;
  const list = (label, values) => values?.length ? `<div><dt>${label}</dt><dd>${values.map(escapeHTML).join(', ')}</dd></div>` : '';
  detail.innerHTML = `<div class="product-detail-layout"><div class="product-detail-image" id="product-gallery"></div><div class="product-detail-copy"><p class="product-category">${escapeHTML(category?.name)}</p><h2 id="product-title">${escapeHTML(product.name)}</h2><p class="detail-price">${product.price === null || product.price === undefined ? 'Informazioni in negozio' : euro.format(product.price)}</p><p>${escapeHTML(product.description)}</p><dl>${product.sku ? `<div><dt>Codice</dt><dd>${escapeHTML(product.sku)}</dd></div>` : ''}${product.brand ? `<div><dt>Marca</dt><dd>${escapeHTML(product.brand)}</dd></div>` : ''}${list('Taglie', product.sizes)}${list('Colori', product.colors)}${product.material ? `<div><dt>Tessuto</dt><dd>${escapeHTML(product.material)}</dd></div>` : ''}</dl>${product.isDemo ? '<p class="detail-demo">Articolo fittizio. Illustrazione, informazioni e prezzo sono dimostrativi.</p>' : ''}${!productIsAvailable(product) ? '<p class="detail-demo">Al momento non disponibile.</p>' : ''}<div id="product-contact"></div></div></div>`;
  detailController = new AbortController();
  detailGallery = mountProductGallery($('product-gallery'), product, { signal: detailController.signal });
  if (!product.isDemo && loadedRealData && !localPreview && !catalog.demo) detailContact = mountProductContact($('product-contact'), product);
  if (focused && $('product-dialog').open && (!focused.isConnected || document.activeElement === document.body)) {
    ($(focusId) || $('product-close')).focus({ preventScroll: true });
  }
  $('product-dialog').scrollTop = scrollTop;
}

function destroyProductWidgets() {
  detailController?.abort();
  detailGallery?.destroy();
  detailContact?.destroy();
  detailController = detailGallery = detailContact = undefined;
}

function isPublicProduct(product) {
  return product?.published === true && product.isDemo === false && catalog.categories.some(category => category.id === product.categoryId && category.published !== false);
}

function setProductStatus(message = '') {
  $('catalog-product-status').textContent = message;
  $('catalog-product-status').hidden = !message;
}

function showProduct(product, opener, { record = true } = {}) {
  const publicProduct = loadedRealData && !localPreview && !catalog.demo && isPublicProduct(product);
  if (!publicProduct && !catalog.demo) return;
  if (record && publicProduct) recordProductView(product, catalog.categories).catch(() => {});
  productLinkController?.abort();
  ++productLinkJob;
  openProductId = product.id;
  detailProduct = product;
  if (opener) dialogOpener = opener;
  returnDialogFocus = true;
  if (publicProduct) {
    const url = new URL(location.href);
    url.searchParams.set('prodotto', product.id);
    history.replaceState(null, '', url);
    productLinkResolved = product.id;
  }
  setProductStatus();
  renderProductDetail(product);
  if (!$('product-dialog').open) $('product-dialog').showModal();
  document.body.classList.add('modal-open');
}

function closeProduct(automatic = false, keepURL = false) {
  const dialog = $('product-dialog');
  if (!dialog.open) return;
  preserveProductURLOnClose = keepURL;
  returnDialogFocus = !automatic || dialog.contains(document.activeElement);
  dialog.close();
}

async function requestLinkedProduct({ refresh = false } = {}) {
  const id = new URLSearchParams(location.search).get('prodotto') || '';
  if (!catalogLoaded || !loadedRealData || localPreview || catalog.demo || document.visibilityState === 'hidden') return;
  if (!id) {
    productLinkController?.abort();
    ++productLinkJob;
    productLinkResolved = '';
    if ($('product-dialog').open) closeProduct(true, true);
    setProductStatus();
    return;
  }
  if (!refresh && productLinkResolved === id) return;
  productLinkController?.abort();
  const job = ++productLinkJob;
  const controller = new AbortController();
  productLinkController = controller;
  if (openProductId && openProductId !== id) closeProduct(true, true);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) { productLinkResolved = id; setProductStatus('Questo link non identifica un prodotto disponibile nel catalogo pubblico.'); return; }
  setProductStatus('Apertura del prodotto…');
  try {
    // Always use the public ID adapter, including when an owner is signed in.
    const products = await loadPublicProductsByIds({ ids: [id], signal: controller.signal });
    if (job !== productLinkJob || controller.signal.aborted || new URLSearchParams(location.search).get('prodotto') !== id || document.visibilityState === 'hidden') return;
    productLinkResolved = id;
    const product = products.find(item => item.id === id && isPublicProduct(item));
    if (product) showProduct(product, undefined, { record: openProductId !== id });
    else {
      closeProduct(true, true);
      setProductStatus('Questo prodotto non è disponibile nel catalogo pubblico. Puoi esplorare le altre proposte o contattare il negozio.');
    }
  } catch (error) {
    if (job !== productLinkJob || controller.signal.aborted) return;
    setProductStatus('Non riusciamo ad aprire il prodotto. Riprova aggiornando il catalogo oppure contatta il negozio.');
  } finally {
    if (productLinkController === controller) productLinkController = undefined;
  }
}

function suspendProductDetail() {
  productLinkResume = Boolean(productLinkController || $('product-dialog').open);
  productLinkController?.abort();
  productLinkController = undefined;
  ++productLinkJob;
  destroyProductWidgets();
  detailSignature = '';
}

function resumeProductDetail() {
  if (document.visibilityState === 'hidden') return;
  if ($('product-dialog').open && detailProduct) renderProductDetail(detailProduct);
  if (productLinkResume) { productLinkResume = false; requestLinkedProduct({ refresh: true }); }
}

function synchronizeDetail() {
  if (catalog.demo && $('product-dialog').open && openProductId) {
    const product = catalog.products.find(product => product.id === openProductId);
    if (product) renderProductDetail(product); else closeProduct(true);
    return;
  }
  requestLinkedProduct({ refresh: true });
}

$('product-close').addEventListener('click', () => closeProduct());
$('product-dialog').addEventListener('click', event => { if (event.target === $('product-dialog')) closeProduct(); });
$('product-dialog').addEventListener('close', () => {
  document.body.classList.remove('modal-open');
  destroyProductWidgets();
  const id = openProductId;
  openProductId = undefined;
  detailProduct = undefined;
  detailSignature = '';
  if (!preserveProductURLOnClose) {
    productLinkController?.abort();
    ++productLinkJob;
    productLinkResolved = '';
    const url = new URL(location.href);
    url.searchParams.delete('prodotto');
    if (url.href !== location.href) history.replaceState(null, '', url);
  }
  preserveProductURLOnClose = false;
  if (!returnDialogFocus) return;
  const replacement = [...$('catalog-products').children].find(article => article.dataset.productId === id)?.querySelector('button');
  const target = dialogOpener?.isConnected ? dialogOpener : replacement || $('catalog-search');
  const active = document.activeElement;
  if (active === document.body || $('product-dialog').contains(active) || active === dialogOpener || active === target) target.focus({ preventScroll: true });
});
$('catalog-search-form').addEventListener('submit', event => { event.preventDefault(); renderProducts(); scheduleSearchSignal(true); });
$('catalog-page-next').addEventListener('click', nextPage);
$('catalog-page-previous').addEventListener('click', () => { if (!remoteBusy && pageIndex) { pageIndex--; renderProducts(); } });
$('catalog-search').addEventListener('input', () => { renderProducts(); scheduleSearchSignal(); });
$('catalog-sort').addEventListener('change', () => renderProducts());
Object.values(attributeFields).forEach(id => $(id).addEventListener('input', () => { pageIndex = 0; renderProducts(); }));
$('catalog-favorites-filter').addEventListener('click', () => {
  favoritesOnly = !favoritesOnly;
  renderProducts();
  if (favoritesOnly && !customerUser && customerProfileState !== 'checking') inviteToSignIn();
});
$('catalog-reset').addEventListener('click', () => {
  activeCategory = '';
  activeGroup = '';
  favoritesOnly = false;
  $('catalog-search').value = '';
  $('catalog-sort').value = 'recommended';
  Object.values(attributeFields).forEach(id => { $(id).value = ''; });
  pageIndex = 0;
  renderCategories();
  renderProducts();
});
addEventListener('popstate', () => {
  const current = new URLSearchParams(location.search);
  restoreSelection();
  favoritesOnly = current.get('preferiti') === '1';
  pageIndex = requestedPage(current.get('pagina'));
  $('catalog-search').value = current.get('cerca')?.slice(0, 150) || '';
  restoreAttributeFilters(current);
  $('catalog-sort').value = ['recommended', 'price-asc', 'price-desc', 'name'].includes(current.get('ordine')) ? current.get('ordine') : 'recommended';
  if (loadedRealData && !localPreview && (remoteKey !== catalogSelection().key || (catalogCursor && pageIndex * pageSize >= filteredProducts().length))) requestSelection({ preservePage: true });
  renderCategories();
  renderProducts(false);
  requestLinkedProduct();
});

const sync = createCatalogSync({
  readVersion: async signal => explicitDemo ? 'demo' : readPublicVersion(signal),
  readCatalog: async (signal, { initial }) => {
    if (explicitDemo) return { data: await fetchJSON('/data/demo-catalog.json', signal), source: 'demo' };
    clearTimeout(remoteTimer);
    remoteController?.abort();
    ++remoteJob;
    remoteBusy = false;
    try { return { data: await readSelection(signal), source: 'api' }; }
    catch (error) {
      if (signal.aborted || !import.meta.env.DEV || loadedRealData || !initial) throw error;
      return { data: await fetchJSON('/data/catalog.json', signal), source: 'local' };
    }
  },
  onData: applyCatalog,
  onStart: ({ initial }) => {
    if (!initial) return;
    $('catalog-error').hidden = true;
    $('catalog-count').textContent = catalogSelection().scan ? 'Ricerca in corso nel catalogo completo…' : 'Caricamento del catalogo…';
    $('catalog-products').setAttribute('aria-busy', 'true');
  },
  onSuccess: () => { setSyncStatus(localPreview ? localMessage : catalogNotice); catalogNotice = ''; },
  onError: (error, { initial }) => {
    if (!initial) {
      setSyncStatus(localPreview ? localMessage : 'Non riusciamo a verificare gli aggiornamenti. Il catalogo già caricato resta consultabile; riproviamo automaticamente tra poco.');
      return;
    }
    $('catalog-error-text').textContent = error.name === 'AbortError' ? 'La connessione impiega troppo tempo. Riprova tra poco.' : error.message;
    $('catalog-error').hidden = false;
    $('catalog-empty').hidden = true;
    $('catalog-count').textContent = 'Catalogo non disponibile';
  },
  onSettled: () => $('catalog-products').setAttribute('aria-busy', 'false'),
});
$('catalog-retry').addEventListener('click', () => sync.refresh());
sync.start();
renderAccountState();
initializeFirebaseAuth().then(auth => {
  customerAuth = auth;
  if (auth.status === 'ready') auth.onChange(changeCustomer);
  else {
    customerProfileState = 'unavailable';
    renderProducts(false);
  }
}).catch(() => {
  customerProfileState = 'unavailable';
  favoriteProductIds = new Set();
  setFavoriteStatus('L’accesso ai preferiti non è disponibile. Puoi continuare a esplorare tutto il catalogo.');
  renderProducts(false);
});
