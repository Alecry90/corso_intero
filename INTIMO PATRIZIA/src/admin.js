import { compressedImage } from './image-preparation.js';
import { createAdminGalleryEditor } from './admin-gallery-editor.js';
import { createAdminVariantEditor } from './admin-variant-editor.js';
import { initializeAdminProductTools } from './admin-product-tools.js';
import { initializeAdminBulkProducts } from './admin-bulk-products.js';
import { exportProductUpdateCSV, previewProductUpdates, applyProductUpdates } from './product-bulk.js';
import { initializeAdminCatalogSafety } from './admin-catalog-safety.js';
import { exportCatalogBackup, previewCatalogRestore, applyCatalogRestore, loadCatalogTrash, CATALOG_BACKUP_LIMITS } from './catalog-backup.js';
import { initializeAdminShopContent } from './admin-shop-content.js';
import './styles.css';
import './admin.css';
import './boutique.css';
import './admin-communications.js';
import { initializeShell } from './shared.js';
import { initializeFirebaseAuth } from './firebase-auth.js';
import { notifyCatalogChanged } from './catalog-sync.js';
import { visibleCatalog } from './catalog-model.js';
import { catalogRequest, getCatalogSession, loadPublicCatalogPage, loadManagerCatalogPage } from './firestore-catalog.js';
import { createCatalogImages } from './catalog-images.js';
import { compareCatalogProducts } from './catalog-pager.js';

initializeShell({ active: '', admin: true });

const $ = (id) => document.getElementById(id);
let cleanupProductTools = () => {};
let cleanupBulkProducts = () => {};
let cleanupCatalogSafety = () => {};
let cleanupShopContent = () => {};
const galleryEditor = createAdminGalleryEditor($('product-gallery-editor'), { compress: compressedImage, onDirty: () => { editorDirty = true; } });
const variantEditor = createAdminVariantEditor($('product-variant-editor'), { sizesInput: $('product-sizes'), colorsInput: $('product-colors'), onDirty: () => { editorDirty = true; } });
const state = { auth: null, categories: [], products: [], readOnly: true, demo: true, user: null, productId: null, categoryId: null, deleteTarget: null, selectedImage: null, savedImage: '', removeImage: false, processingImage: false, imageJob: 0, authJob: 0, authBusy: false, saving: false, slugTouched: false };
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const sorted = (items) => [...items].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name).localeCompare(String(b.name), 'it'));
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const slugify = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const safeImage = (source) => typeof source === 'string' && (/^\/(?!\/)/.test(source) || /^data:image\/(webp|jpeg|png);base64,/.test(source)) ? source : '';
const catalogImages = createCatalogImages();
const releaseImageURLs = () => catalogImages.reset();
const protectedImage = (source, image) => catalogImages.show(image, source, { admin: !state.readOnly });
const splitValues = (value) => [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
let managerCursor = null;
let managerComplete = true;
let managerLoading = false;
let managerLoadJob = 0;
let managerController;
const managerPageSize = 50;
let managerPageIndex = 0;

function status(message, error = false) {
  $('admin-status').textContent = message;
  $('admin-status').dataset.state = error ? 'error' : 'normal';
}

function feedback(id, message, error = false) {
  $(id).textContent = message;
  $(id).dataset.state = error ? 'error' : 'normal';
}

function describeError(error) {
  if (error?.name === 'AbortError') return 'La connessione sta impiegando troppo tempo. Riprova tra poco.';
  if (error?.status === 409) return error.message || 'La categoria contiene ancora prodotti oppure l’identificativo è già usato. Aggiorna i dati e riprova.';
  if (error?.status === 401) return 'La sessione è scaduta. Esci e accedi di nuovo per continuare.';
  if (error?.status === 403) return 'Questo account non è autorizzato a gestire il catalogo. Contatta chi amministra il progetto.';
  if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password' || error?.code === 'auth/user-not-found' || error?.code === 'auth/invalid-login-credentials') return 'Email o password non corrette. Controlla i dati e riprova.';
  if (error?.code === 'auth/too-many-requests') return 'Sono stati effettuati molti tentativi. Attendi qualche minuto prima di riprovare.';
  if (error?.code === 'auth/network-request-failed' || error instanceof TypeError) return 'Connessione non disponibile. Controlla la rete e riprova.';
  if (error?.code === 'auth/invalid-email') return 'Inserisci un indirizzo email valido.';
  if (['auth/weak-password', 'auth/password-does-not-meet-requirements'].includes(error?.code)) return 'La password deve avere almeno 8 caratteri e una maiuscola (A–Z). Per aggiornare quella del tuo account, inserisci la tua email e scegli “Hai dimenticato la password?”.';
  if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') return 'La finestra Google è stata chiusa prima di completare l’accesso. Puoi riprovare.';
  if (error?.code === 'auth/popup-blocked') return 'Il browser ha bloccato la finestra Google. Consenti i popup per questo sito e riprova, oppure usa email e password.';
  if (error?.code === 'auth/unauthorized-domain') return 'L’accesso Google non è ancora abilitato per questo indirizzo del sito. Contatta chi amministra il progetto.';
  if (error?.code === 'auth/operation-not-allowed') return 'Questo metodo di accesso non è ancora abilitato. Contatta chi amministra il progetto.';
  if (error?.code === 'auth/account-exists-with-different-credential') return 'Per questo account è già configurato un altro metodo di accesso. Usa email e password oppure contatta chi amministra il progetto.';
  if (error?.code === 'auth/user-disabled') return 'L’accesso di questo account è stato disabilitato. Contatta chi amministra il progetto.';
  if (error?.code?.startsWith('auth/')) return 'Accesso non disponibile. Controlla la configurazione Firebase o riprova più tardi.';
  return error?.message || 'L’operazione non è riuscita. Riprova tra poco.';
}

async function api(path, method = 'GET', payload) {
  if (!state.auth || !state.user || state.readOnly) throw new Error('Accedi con un account gestore autorizzato per modificare il catalogo.');
  return catalogRequest(path, method, payload);
}

function assertCatalog(data) {
  if (!Array.isArray(data?.categories) || !Array.isArray(data?.products)) throw new Error('Il catalogo ricevuto non è valido. Riprova o contatta chi amministra il sito.');
  return { categories: data.categories, products: data.products };
}

async function loadPreview(authJob = state.authJob) {
  ++managerLoadJob;
  managerController?.abort();
  managerLoading = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let data;
  const read = async (url) => {
    const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw new Error('Il catalogo non è disponibile. Riprova tra poco.');
    return response.json();
  };
  try {
    if (import.meta.env.VITE_CATALOG_MODE === 'demo') data = await read('/data/demo-catalog.json');
    else {
      try { data = await loadPublicCatalogPage({ signal: controller.signal, pageSize: managerPageSize }); }
      catch (error) { if (!import.meta.env.DEV) throw error; data = await read('/data/catalog.json'); }
    }
  } finally { clearTimeout(timer); }
  const preview = visibleCatalog(data);
  const records = assertCatalog(preview);
  if (authJob !== state.authJob) return;
  releaseImageURLs();
  state.categories = records.categories;
  state.products = records.products.filter((product) => data.demo === true || product.isDemo !== true);
  state.demo = data.demo === true;
  state.readOnly = true;
  managerCursor = data.nextCursor || null;
  managerComplete = data.complete !== false;
  managerPageIndex = 0;
  renderCatalog();
}

async function loadCatalog(authJob = state.authJob) {
  ++managerLoadJob;
  managerController?.abort();
  managerLoading = false;
  const response = await api('catalog');
  const data = assertCatalog(response);
  if (authJob !== state.authJob) return;
  releaseImageURLs();
  state.categories = data.categories;
  state.products = data.products;
  state.demo = false;
  managerCursor = response.nextCursor || null;
  managerComplete = response.complete !== false;
  managerPageIndex = 0;
  renderCatalog();
  if ($('product-search').value.trim() || $('category-filter').value) loadRemainingProducts();
}

async function loadRemainingProducts({ onePage = false } = {}) {
  if (managerLoading || managerComplete || !managerCursor) return;
  const authJob = state.authJob;
  const job = ++managerLoadJob;
  const controller = new AbortController();
  managerController = controller;
  managerLoading = true;
  renderProducts();
  try {
    do {
      const data = state.readOnly
        ? await loadPublicCatalogPage({ signal: controller.signal, pageSize: managerPageSize, cursor: managerCursor })
        : await loadManagerCatalogPage({ signal: controller.signal, pageSize: managerPageSize, cursor: managerCursor });
      if (job !== managerLoadJob || authJob !== state.authJob) return;
      const ids = new Set(state.products.map(product => product.id));
      state.products.push(...data.products.filter(product => !ids.has(product.id)));
      managerCursor = data.nextCursor;
      managerComplete = data.complete;
      renderProducts();
    } while (!onePage && !managerComplete);
    if (onePage) managerPageIndex++;
  } catch (error) {
    if (!controller.signal.aborted) status(`Caricamento incompleto. ${describeError(error)}`, true);
  } finally {
    if (job === managerLoadJob) { managerLoading = false; renderProducts(); }
  }
}

function managerFilterChanged() {
  managerPageIndex = 0;
  renderProducts();
  if ($('product-search').value.trim() || $('category-filter').value) loadRemainingProducts();
}

function categoryName(id) {
  return state.categories.find((category) => category.id === id)?.name || 'Categoria da assegnare';
}

function badge(text, variant = '') { return element('span', `admin-badge${variant ? ` admin-badge-${variant}` : ''}`, text); }

function actionButton(text, action, id, type, danger = false) {
  const button = element('button', `admin-button ${danger ? 'admin-delete-button' : 'admin-button-quiet'}`, text);
  button.type = 'button';
  button.dataset.action = action;
  button.dataset.id = id;
  button.dataset.type = type;
  button.disabled = state.readOnly;
  button.setAttribute('aria-label', `${text} ${type === 'products' ? 'prodotto' : 'categoria'} ${type === 'products' ? state.products.find((item) => item.id === id)?.name || '' : state.categories.find((item) => item.id === id)?.name || ''}`);
  if (state.readOnly) button.title = 'Disponibile dopo l’accesso con un account gestore autorizzato';
  return button;
}

function renderProducts() {
  const query = $('product-search').value.trim().toLocaleLowerCase('it');
  const categoryId = $('category-filter').value;
  const products = [...state.products].sort(compareCatalogProducts).filter((product) => product.archived !== true && (!categoryId || product.categoryId === categoryId) && (!query || `${product.name} ${product.description || ''} ${product.material || ''}`.toLocaleLowerCase('it').includes(query)));
  const fragment = document.createDocumentFragment();
  managerPageIndex = Math.min(managerPageIndex, Math.max(0, Math.ceil(products.length / managerPageSize) - 1));
  for (const product of products.slice(managerPageIndex * managerPageSize, (managerPageIndex + 1) * managerPageSize)) {
    const row = element('li', 'admin-product-row');
    const imageSource = safeImage(product.image);
    const image = imageSource ? element('img', 'admin-product-image') : element('div', 'admin-product-image');
    if (imageSource) { queueMicrotask(() => protectedImage(imageSource, image)); image.alt = ''; image.width = 90; image.height = 112; image.loading = 'lazy'; image.addEventListener('error', () => { image.removeAttribute('src'); image.alt = 'Fotografia non disponibile'; }, { once: true }); }
    else image.append(element('span', '', 'Senza fotografia'));
    const info = element('div', 'admin-product-info');
    info.append(element('p', 'admin-product-category', categoryName(product.categoryId)), element('h3', '', product.name || 'Prodotto senza nome'));
    if (product.description) info.append(element('p', 'admin-product-description', product.description));
    const badges = element('div', 'admin-row-badges');
    if (product.isDemo || state.demo) badges.append(badge('Esempio fittizio', 'demo'));
    badges.append(product.published === false ? badge('Bozza', 'draft') : badge('Pubblicato'));
    if (product.available === false) badges.append(badge('Non disponibile'));
    if (state.categories.find((item) => item.id === product.categoryId)?.published === false) badges.append(badge('Categoria nascosta', 'draft'));
    info.append(badges);
    const actions = element('div', 'admin-row-actions');
    actions.append(actionButton('Modifica', 'edit', product.id, 'products'), actionButton('Duplica', 'duplicate', product.id, 'products'), actionButton('Sposta nel cestino', 'delete', product.id, 'products', true));
    row.append(image, info, element('div', 'admin-product-price', product.price === null || product.price === undefined || product.price === '' ? 'Prezzo in negozio' : euro.format(Number(product.price))), actions);
    fragment.append(row);
  }
  $('product-list').replaceChildren(fragment);
  $('products-empty').hidden = managerLoading || products.length !== 0;
  const emptyTitle = $('admin-products-empty-title');
  const emptyText = $('admin-products-empty-text');
  if (emptyTitle && emptyText && !products.length) {
    emptyTitle.textContent = query ? 'Nessun risultato' : categoryId ? 'Nessun prodotto nel reparto' : 'Nessun prodotto';
    emptyText.textContent = query ? 'Prova un’altra parola o scegli un altro reparto.' : state.readOnly ? 'I prodotti aggiunti dal gestore compariranno qui.' : !state.categories.length ? 'Aggiungi prima un reparto nella sezione Categorie, poi inserisci i suoi prodotti.' : 'Usa “Aggiungi prodotto” per inserire una fotografia e le informazioni dell’articolo.';
  }
  $('product-results').textContent = `${products.length} ${products.length === 1 ? 'prodotto caricato' : 'prodotti caricati'}${query ? ` per “${$('product-search').value.trim()}”` : ''}${!managerComplete ? managerLoading ? ' · Ricerca in corso nel catalogo completo…' : ' · Altri prodotti da caricare' : ''}`;
  $('admin-pagination').hidden = !products.length && !managerCursor;
  $('admin-page-previous').disabled = managerLoading || managerPageIndex === 0;
  $('admin-page-next').disabled = managerLoading || ((managerPageIndex + 1) * managerPageSize >= products.length && !managerCursor);
  $('admin-page-status').textContent = managerLoading ? 'Caricamento…' : `Pagina ${managerPageIndex + 1}${managerComplete && products.length ? ` di ${Math.ceil(products.length / managerPageSize)}` : ''}`;
}

function renderCategories() {
  const fragment = document.createDocumentFragment();
  sorted(state.categories).forEach((category, index) => {
    const count = Number.isInteger(category.productCount) && !state.readOnly ? category.productCount : state.products.filter((product) => product.categoryId === category.id).length;
    const row = element('li', 'admin-category-row');
    const info = element('div', 'admin-category-info');
    info.append(element('h3', '', category.name || 'Categoria senza nome'));
    if (category.description) info.append(element('p', '', category.description));
    const metadata = element('div', 'admin-row-badges');
    metadata.append(element('span', 'admin-category-count', `${count} ${count === 1 ? 'prodotto' : 'prodotti'} · ordine ${Number(category.order) || 0}`));
    if (category.published === false) metadata.append(badge('Categoria nascosta', 'draft'));
    info.append(metadata);
    const actions = element('div', 'admin-row-actions');
    actions.append(actionButton('Modifica', 'edit', category.id, 'categories'), actionButton('Elimina', 'delete', category.id, 'categories', true));
    row.append(element('span', 'admin-category-index', String(index + 1).padStart(2, '0')), info, actions);
    fragment.append(row);
  });
  $('category-list').replaceChildren(fragment);
  $('categories-empty').hidden = state.categories.length !== 0;
}

function renderCatalog() {
  $('admin-dashboard').hidden = false;
  $('catalog-mode').textContent = state.demo ? 'Catalogo di esempio' : 'Il catalogo del negozio';
  $('readonly-explanation').hidden = !state.readOnly;
  $('readonly-explanation').textContent = state.demo ? 'Anteprima in sola lettura · i prodotti e i prezzi sono fittizi.' : 'Catalogo in sola lettura. Accedi con l’account gestore autorizzato per aggiungere, modificare o eliminare prodotti.';
  const totalProducts = state.readOnly ? state.products.length : state.categories.reduce((count, category) => count + (category.productCount || 0), 0);
  $('catalog-counts').textContent = `${state.categories.length} categorie · ${totalProducts} schede${state.readOnly ? '' : ' (compreso il cestino)'}${managerComplete ? '' : ' · caricamento a pagine'}`;
  $('products-count').textContent = String(totalProducts);
  $('categories-count').textContent = String(state.categories.length);
  $('new-product').disabled = state.readOnly || !state.categories.length;
  $('new-product').title = !state.categories.length ? 'Crea prima una categoria' : state.readOnly ? 'Accedi con un account gestore autorizzato' : '';
  $('new-category').disabled = state.readOnly;
  const filterValue = $('category-filter').value;
  const all = element('option', '', 'Tutte le categorie'); all.value = '';
  const categoryOptions = sorted(state.categories).map((category) => { const option = element('option', '', category.name); option.value = category.id; return option; });
  $('category-filter').replaceChildren(all, ...categoryOptions);
  if (state.categories.some((category) => category.id === filterValue)) $('category-filter').value = filterValue;
  renderProducts();
  renderCategories();
}

function clearErrors(prefix, form) {
  $( `${prefix}-errors`).replaceChildren();
  $( `${prefix}-errors`).hidden = true;
  for (const field of form.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
  for (const message of form.querySelectorAll('.admin-field-error')) { message.hidden = true; message.textContent = ''; }
  for (const field of form.querySelectorAll('input, textarea, select')) {
    if (!field.id) continue;
    const descriptions = (field.getAttribute('aria-describedby') || '').split(' ').filter((id) => id && id !== `${field.id}-error`);
    if (descriptions.length) field.setAttribute('aria-describedby', descriptions.join(' ')); else field.removeAttribute('aria-describedby');
  }
}

function validationErrors(prefix, form, extra = []) {
  clearErrors(prefix, form);
  const errors = [...extra];
  for (const field of form.querySelectorAll('input:not([type=file]),select,textarea')) {
    if (field.disabled || field.validity.valid || errors.some((error) => error.id === field.id)) continue;
    const label = form.querySelector(`label[for="${field.id}"]`)?.textContent.replace(' *', '') || 'Questo campo';
    let message = `${label}: controlla il valore inserito.`;
    if (field.validity.valueMissing) message = `${label}: questo campo è obbligatorio.`;
    else if (field.validity.typeMismatch) message = `${label}: inserisci un indirizzo email valido.`;
    else if (field.validity.patternMismatch) message = 'Identificativo: usa solo lettere minuscole, numeri e trattini tra le parole.';
    else if (field.validity.rangeUnderflow) message = `${label}: il valore minimo è ${field.min}.`;
    else if (field.validity.rangeOverflow) message = `${label}: il valore massimo è ${field.max}.`;
    else if (field.validity.stepMismatch) message = `${label}: usa ${field.step === '1' ? 'un numero intero' : 'al massimo due cifre decimali'}.`;
    errors.push({ id: field.id, message });
  }
  if (!errors.length) return true;
  const summary = $(`${prefix}-errors`);
  summary.append(element('p', '', 'Controlla questi campi prima di continuare:'));
  const list = element('ul');
  for (const error of errors) {
    const field = $(error.id);
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      const inline = $(`${error.id}-error`);
      if (inline) { inline.textContent = error.message; inline.hidden = false; field.setAttribute('aria-describedby', `${field.getAttribute('aria-describedby') || ''} ${inline.id}`.trim()); }
    }
    const item = element('li');
    const link = element('a', '', error.message); link.href = `#${error.id}`;
    link.addEventListener('click', (event) => { event.preventDefault(); field?.focus(); });
    item.append(link); list.append(item);
  }
  summary.append(list); summary.hidden = false; summary.focus();
  return false;
}

function showFormError(prefix, message) {
  const summary = $(`${prefix}-errors`); summary.replaceChildren(element('p', '', message)); summary.hidden = false; summary.focus();
}

let lastDialogOpener = null;
let editorDirty = false;
function openDialog(id, firstField) {
  editorDirty = false;
  lastDialogOpener = document.activeElement;
  $(id).showModal();
  requestAnimationFrame(() => firstField && $(firstField)?.focus());
}

function closeDialog(id) {
  if (state.saving) return;
  if (editorDirty && id !== 'delete-dialog' && !confirm('Vuoi chiudere senza salvare le modifiche?')) return;
  editorDirty = false;
  $(id).close();
}

function renderImagePreview() {
  const source = state.removeImage ? '' : state.selectedImage || safeImage(state.savedImage);
  if (source) { const image = element('img'); image.alt = 'Anteprima della fotografia del prodotto'; $('product-image-preview').replaceChildren(image); if (source.startsWith('/api/images/')) protectedImage(source, image); else image.src = source; }
  else $('product-image-preview').replaceChildren(element('span', '', 'Nessuna fotografia'));
  $('remove-product-image').hidden = !source;
  $('product-image-alt').required = Boolean(source);
}

function openProduct(id = null) {
  if (state.readOnly) return;
  const product = state.products.find((item) => item.id === id);
  if (id && !product) return;
  state.productId = id; state.selectedImage = null; state.savedImage = product?.image || ''; state.removeImage = false; state.processingImage = false; state.imageJob++;
  $('product-form').reset(); clearErrors('product', $('product-form'));
  feedback('product-save-feedback', ''); feedback('product-image-feedback', '');
  $('product-dialog-title').textContent = product ? 'Modifica prodotto' : 'Nuovo prodotto';
  const options = sorted(state.categories).map((category) => { const option = element('option', '', `${category.name}${category.published === false ? ' (nascosta)' : ''}`); option.value = category.id; return option; });
  $('product-category').replaceChildren(...options);
  for (const key of ['name', 'description', 'material', 'imageAlt']) $(`product-${key === 'imageAlt' ? 'image-alt' : key}`).value = product?.[key] || '';
  $('product-category').value = product?.categoryId || $('category-filter').value || sorted(state.categories)[0]?.id || '';
  $('product-price').value = product?.price ?? '';
  $('product-sizes').value = Array.isArray(product?.sizes) ? product.sizes.join(', ') : '';
  $('product-colors').value = Array.isArray(product?.colors) ? product.colors.join(', ') : '';
  $('product-order').value = product?.order ?? state.categories.reduce((total, category) => total + (category.productCount || 0), 0);
  $('product-published').checked = product?.published !== false;
  $('product-available').checked = product?.available !== false;
  $('product-demo').checked = Boolean(product?.isDemo);
  $('product-sku').value = product?.sku || '';
  $('product-brand').value = product?.brand || '';
  $('product-featured').checked = product?.featured === true;
  $('product-new-arrival').checked = product?.newArrival === true;
  galleryEditor.reset(product);
  variantEditor.reset(product);
  $('product-save').disabled = false;
  renderImagePreview(); openDialog('product-dialog', 'product-name');
}

function openCategory(id = null) {
  if (state.readOnly) return;
  const category = state.categories.find((item) => item.id === id);
  if (id && !category) return;
  state.categoryId = id; state.slugTouched = Boolean(category);
  $('category-form').reset(); clearErrors('category', $('category-form')); feedback('category-save-feedback', '');
  $('category-dialog-title').textContent = category ? 'Modifica categoria' : 'Nuova categoria';
  for (const key of ['name', 'slug', 'description']) $(`category-${key}`).value = category?.[key] || '';
  $('category-order').value = category?.order ?? state.categories.length;
  $('category-published').checked = category?.published !== false;
  openDialog('category-dialog', 'category-name');
}

function openDelete(type, id) {
  if (state.readOnly) return;
  const item = state[type].find((record) => record.id === id);
  if (!item) return;
  state.deleteTarget = { type, id, name: item.name };
  $('delete-title').textContent = type === 'products' ? 'Spostare il prodotto nel cestino?' : 'Eliminare la categoria?';
  const count = type === 'categories' ? Number(item.productCount) || state.products.filter((product) => product.categoryId === id).length : 0;
  $('delete-description').textContent = type === 'products' ? `“${item.name}” non sarà più visibile ai clienti. Scheda e fotografie rimarranno nel cestino, da cui potrai ripristinarlo come bozza.` : count ? `“${item.name}” contiene ancora ${count} ${count === 1 ? 'prodotto' : 'prodotti'}, compresi quelli nel cestino. Spostali in un’altra categoria prima di rimuovere questa categoria.` : `“${item.name}” verrà eliminata definitivamente. Scarica una copia del catalogo prima di rimuovere i reparti.`;
  $('delete-confirm').textContent = type === 'products' ? 'Sposta nel cestino' : 'Elimina categoria';
  $('delete-confirm').disabled = count > 0; feedback('delete-feedback', '');
  openDialog('delete-dialog');
}

function setSaving(prefix, saving, text) {
  state.saving = saving;
  const dialog = $(`${prefix}-dialog`);
  dialog.setAttribute('aria-busy', String(saving));
  for (const control of dialog.querySelectorAll('button, input, select, textarea')) control.disabled = saving;
  if (prefix === 'product' && !saving && state.processingImage) $('product-save').disabled = true;
  feedback(prefix === 'delete' ? 'delete-feedback' : `${prefix}-save-feedback`, saving ? text : '');
}

async function saveProduct(event) {
  event.preventDefault();
  if (state.readOnly || state.saving || state.processingImage) return;
  if (galleryEditor.busy()) { showFormError('product', 'Attendi la preparazione delle fotografie aggiuntive.'); return; }
  const extras = [];
  if (!state.categories.some((category) => category.id === $('product-category').value)) extras.push({ id: 'product-category', message: 'Scegli una categoria esistente.' });
  if (!$('product-name').value.trim()) extras.push({ id: 'product-name', message: 'Inserisci il nome del prodotto.' });
  if ($('product-image-alt').required && !$('product-image-alt').value.trim()) extras.push({ id: 'product-image-alt', message: 'Descrivi la fotografia per chi utilizza un lettore di schermo.' });
  for (const name of ['sizes', 'colors']) if (splitValues($(`product-${name}`).value).length > 20) extras.push({ id: `product-${name}`, message: 'Inserisci al massimo 20 voci, separate da una virgola.' });
  if (!validationErrors('product', $('product-form'), extras)) return;
  const payload = {
    name: $('product-name').value.trim(), categoryId: $('product-category').value,
    description: $('product-description').value.trim(), price: $('product-price').value === '' ? null : Number($('product-price').value),
    sizes: splitValues($('product-sizes').value), colors: splitValues($('product-colors').value), material: $('product-material').value.trim(),
    imageAlt: $('product-image-alt').value.trim(), order: Number($('product-order').value),
    published: $('product-published').checked, available: $('product-available').checked, isDemo: $('product-demo').checked,
    sku: $('product-sku').value.trim(), brand: $('product-brand').value.trim(), featured: $('product-featured').checked, newArrival: $('product-new-arrival').checked,
    ...(state.selectedImage ? { imageData: state.selectedImage } : {}), ...(state.removeImage ? { removeImage: true } : {}),
  };
  try { Object.assign(payload, galleryEditor.payload(), variantEditor.payload()); } catch (error) { showFormError('product', error.message); return; }
  const id = state.productId;
  setSaving('product', true, 'Salvataggio del prodotto…');
  let saved = false;
  try {
    await api(`products${id ? `/${encodeURIComponent(id)}` : ''}`, id ? 'PUT' : 'POST', payload);
    notifyCatalogChanged();
    saved = true; editorDirty = false;
    await loadCatalog();
    setSaving('product', false); closeDialog('product-dialog'); status(id ? 'Prodotto aggiornato.' : 'Prodotto aggiunto al catalogo.');
  } catch (error) {
    setSaving('product', false);
    if (saved) { closeDialog('product-dialog'); status('Il prodotto è stato salvato, ma non è stato possibile aggiornare l’elenco. Ricarica la pagina per vederlo.', true); }
    else showFormError('product', describeError(error));
  }
}

async function saveCategory(event) {
  event.preventDefault(); if (state.readOnly || state.saving) return;
  const extras = [];
  if (!$('category-name').value.trim()) extras.push({ id: 'category-name', message: 'Inserisci il nome della categoria.' });
  if (state.categories.some((category) => category.slug === $('category-slug').value && category.id !== state.categoryId)) extras.push({ id: 'category-slug', message: 'Questo identificativo è già usato. Scegline un altro.' });
  if (!validationErrors('category', $('category-form'), extras)) return;
  const existing = state.categories.find((category) => category.id === state.categoryId);
  const payload = { name: $('category-name').value.trim(), slug: $('category-slug').value.trim(), description: $('category-description').value.trim(), order: Number($('category-order').value), published: $('category-published').checked, ...(existing?.image ? { image: existing.image } : {}) };
  const id = state.categoryId;
  setSaving('category', true, 'Salvataggio della categoria…');
  let saved = false;
  try {
    await api(`categories${id ? `/${encodeURIComponent(id)}` : ''}`, id ? 'PUT' : 'POST', payload); notifyCatalogChanged(); saved = true; editorDirty = false; await loadCatalog();
    setSaving('category', false); closeDialog('category-dialog'); status(id ? 'Categoria aggiornata.' : 'Categoria aggiunta al catalogo.');
  } catch (error) {
    setSaving('category', false);
    if (saved) { closeDialog('category-dialog'); status('La categoria è stata salvata, ma non è stato possibile aggiornare l’elenco. Ricarica la pagina per vederla.', true); }
    else showFormError('category', describeError(error));
  }
}

async function deleteItem() {
  if (state.readOnly || state.saving || !state.deleteTarget) return;
  const target = { ...state.deleteTarget }; setSaving('delete', true, target.type === 'products' ? 'Spostamento nel cestino…' : 'Eliminazione in corso…'); let deleted = false;
  try {
    await api(`${target.type}/${encodeURIComponent(target.id)}${target.type === 'products' ? '/archive' : ''}`, target.type === 'products' ? 'POST' : 'DELETE', target.type === 'products' ? {} : undefined); notifyCatalogChanged(); deleted = true; await loadCatalog();
    setSaving('delete', false); closeDialog('delete-dialog'); status(target.type === 'products' ? `“${target.name}” è nel cestino. Puoi recuperarlo da “Copie di sicurezza e cestino”.` : `“${target.name}” è stata eliminata dal catalogo.`);
  } catch (error) {
    setSaving('delete', false);
    if (deleted) { closeDialog('delete-dialog'); status(target.type === 'products' ? 'Il prodotto è stato spostato nel cestino. Ricarica la pagina per aggiornare l’elenco.' : 'La categoria è stata eliminata. Ricarica la pagina per aggiornare l’elenco.', true); }
    else { feedback('delete-feedback', describeError(error), true); $('delete-feedback').tabIndex = -1; $('delete-feedback').focus(); }
  }
}

async function selectImage() {
  const file = $('product-image').files?.[0]; if (!file) return;
  const job = ++state.imageJob; state.processingImage = true; $('product-save').disabled = true;
  feedback('product-image-feedback', 'Preparazione e compressione della fotografia…');
  $('product-image').removeAttribute('aria-invalid');
  try {
    const result = await compressedImage(file); if (job !== state.imageJob) return;
    state.selectedImage = result.data; state.removeImage = false; renderImagePreview();
    feedback('product-image-feedback', `Pronta: ${Math.ceil(result.size / 1024)} KB, ${result.width} × ${result.height} px. La foto verrà salvata insieme al prodotto.`);
  } catch (error) {
    if (job !== state.imageJob) return;
    $('product-image').value = ''; $('product-image').setAttribute('aria-invalid', 'true');
    feedback('product-image-feedback', describeError(error), true);
  } finally {
    if (job === state.imageJob) { state.processingImage = false; $('product-save').disabled = state.saving; }
  }
}

async function onAuthChange(user) {
  cleanupProductTools(); cleanupBulkProducts(); cleanupShopContent(); cleanupCatalogSafety(); galleryEditor.reset(null);
  variantEditor.reset(null);
  cleanupProductTools = () => {}; cleanupBulkProducts = () => {}; cleanupShopContent = () => {}; cleanupCatalogSafety = () => {};
  releaseImageURLs();
  const job = ++state.authJob;
  state.user = user; state.readOnly = true;
  $('admin-dashboard').hidden = true;
  $('admin-email-verification').hidden = true;
  for (const dialog of document.querySelectorAll('.admin-dialog[open]')) dialog.close();
  $('admin-account').hidden = !user; $('admin-access').hidden = Boolean(user);
  if (!user) {
    try { await loadPreview(job); if (job === state.authJob) status('Accedi per aggiungere o eliminare prodotti. Il catalogo qui sotto è in sola lettura.'); } catch (error) { status(describeError(error), true); }
    return;
  }
  $('account-label').textContent = `Account: ${user.email || 'gestore'}`;
  status('Verifica dell’accesso e caricamento del catalogo…');
  try {
    if (user.emailVerified !== true) {
      $('admin-email-verification').hidden = false;
      status('Verifica il tuo indirizzo email prima di gestire il catalogo. Le modifiche sono disabilitate.');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let session;
    try {
      session = await getCatalogSession(controller.signal);
      if (typeof session.canManageCatalog !== 'boolean') throw new Error('Il servizio non ha confermato i permessi di questo account.');
    } finally { clearTimeout(timer); }
    if (job !== state.authJob) return;
    if (!session.canManageCatalog) {
      await loadPreview(job);
      if (job === state.authJob) status('Accesso effettuato. Puoi consultare il catalogo; le modifiche sono riservate al gestore.');
      return;
    }
    state.readOnly = false;
    await loadCatalog(job); if (job !== state.authJob) return;
    cleanupProductTools = initializeAdminProductTools({ container: $('admin-product-tools'), getState: () => state, request: api, refresh: async () => { notifyCatalogChanged(); await loadCatalog(); } });
    cleanupBulkProducts = initializeAdminBulkProducts($('admin-bulk-products'), {
      getState: () => state, exportCSV: exportProductUpdateCSV, preview: previewProductUpdates, apply: applyProductUpdates,
      refresh: async () => { notifyCatalogChanged(); await loadCatalog(); },
    });
    cleanupCatalogSafety = initializeAdminCatalogSafety($('admin-catalog-safety'), {
      exportBackup: exportCatalogBackup, previewRestore: previewCatalogRestore, applyRestore: applyCatalogRestore,
      listTrash: loadCatalogTrash, maxFileBytes: CATALOG_BACKUP_LIMITS.fileBytes,
      restoreProduct: id => api(`products/${encodeURIComponent(id)}/restore`, 'POST', {}),
      onChange: async () => { notifyCatalogChanged(); await loadCatalog(); },
    });
    cleanupShopContent = initializeAdminShopContent({ container: $('admin-shop-content'), user });
    status('Accesso riservato attivo. Puoi aggiornare prodotti e categorie.');
  } catch (error) {
    if (job !== state.authJob) return;
    state.readOnly = true; $('admin-dashboard').hidden = true;
    status(describeError(error), true);
  }
}

function setAuthBusy(busy, method = '') {
  state.authBusy = busy;
  for (const id of ['login-submit', 'login-google', 'password-reset']) $(id).disabled = busy;
  $('login-submit').textContent = busy && method === 'password' ? 'Accesso in corso…' : 'Accedi al catalogo →';
  $('login-google').textContent = busy && method === 'google' ? 'Attendi la finestra Google…' : 'Accedi con Google';
  $('login-form').setAttribute('aria-busy', String(busy));
}

async function login(event) {
  event.preventDefault(); if (!state.auth || state.auth.status !== 'ready' || state.authBusy) return;
  if (!validationErrors('login', $('login-form'))) return;
  setAuthBusy(true, 'password'); feedback('login-feedback', '');
  try { await state.auth.signIn($('login-email').value.trim(), $('login-password').value); $('login-password').value = ''; }
  catch (error) { showFormError('login', describeError(error)); }
  finally { setAuthBusy(false); }
}

async function loginWithGoogle() {
  if (!state.auth || state.auth.status !== 'ready' || state.authBusy) return;
  clearErrors('login', $('login-form'));
  feedback('login-feedback', 'Completa l’accesso nella finestra Google.');
  setAuthBusy(true, 'google');
  try { await state.auth.signInWithGoogle(); $('login-password').value = ''; feedback('login-feedback', ''); }
  catch (error) { feedback('login-feedback', ''); showFormError('login', describeError(error)); }
  finally { setAuthBusy(false); }
}

async function resetPassword() {
  if (!state.auth || state.auth.status !== 'ready' || state.authBusy) return;
  const email = $('login-email');
  if (!email.value.trim() || !email.validity.valid) { validationErrors('login', $('login-form'), [{ id: 'login-email', message: 'Per recuperare la password, inserisci prima un indirizzo email valido.' }]); return; }
  clearErrors('login', $('login-form')); setAuthBusy(true); feedback('login-feedback', 'Richiesta di recupero in corso…');
  try { await state.auth.resetPassword(email.value.trim()); feedback('login-feedback', 'Se l’indirizzo corrisponde a un account, riceverai un’email con le istruzioni per scegliere una nuova password. Controlla anche la cartella spam.'); }
  catch (error) { if (error?.code === 'auth/user-not-found') feedback('login-feedback', 'Se l’indirizzo corrisponde a un account, riceverai un’email con le istruzioni per scegliere una nuova password.'); else feedback('login-feedback', describeError(error), true); }
  finally { setAuthBusy(false); }
}

$('login-form').addEventListener('submit', login);
$('login-google').addEventListener('click', loginWithGoogle);
$('password-reset').addEventListener('click', resetPassword);
$('password-toggle').addEventListener('click', () => { const show = $('login-password').type === 'password'; $('login-password').type = show ? 'text' : 'password'; $('password-toggle').textContent = show ? 'Nascondi' : 'Mostra'; $('password-toggle').setAttribute('aria-pressed', String(show)); });
$('logout').addEventListener('click', async () => { $('logout').disabled = true; try { await state.auth.signOut(); } catch (error) { status(describeError(error), true); } finally { $('logout').disabled = false; } });
for (const [id, action, success] of [
  ['send-verification', 'verifyEmail', 'Email di verifica inviata. Apri il link ricevuto e poi scegli “Ho verificato l’email”.'],
  ['check-verification', 'refreshUser', 'Controllo dell’indirizzo email completato.'],
]) $(id).addEventListener('click', async () => {
  const button = $(id);
  if (button.disabled || !state.auth || !state.user) return;
  button.disabled = true;
  feedback('verification-feedback', action === 'verifyEmail' ? 'Invio dell’email di verifica…' : 'Controllo della verifica…');
  try {
    await state.auth[action]();
    feedback('verification-feedback', action === 'refreshUser' && state.auth.currentUser()?.emailVerified !== true ? 'L’email non risulta ancora verificata. Apri il link ricevuto e riprova.' : success);
  } catch (error) { feedback('verification-feedback', describeError(error), true); }
  finally { button.disabled = false; }
});
$('product-search').addEventListener('input', managerFilterChanged);
$('category-filter').addEventListener('change', managerFilterChanged);
$('admin-page-previous').addEventListener('click', () => { if (!managerLoading && managerPageIndex) { managerPageIndex--; renderProducts(); } });
$('admin-page-next').addEventListener('click', () => {
  if (managerLoading) return;
  const query = $('product-search').value.trim().toLocaleLowerCase('it');
  const categoryId = $('category-filter').value;
  const count = state.products.filter(product => (!categoryId || product.categoryId === categoryId) && (!query || `${product.name} ${product.description || ''} ${product.material || ''}`.toLocaleLowerCase('it').includes(query))).length;
  if ((managerPageIndex + 1) * managerPageSize < count) { managerPageIndex++; renderProducts(); }
  else loadRemainingProducts({ onePage: true });
});
$('new-product').addEventListener('click', () => openProduct());
$('new-category').addEventListener('click', () => openCategory());
$('product-form').addEventListener('submit', saveProduct);
$('category-form').addEventListener('submit', saveCategory);
$('delete-confirm').addEventListener('click', deleteItem);
$('product-image').addEventListener('change', selectImage);
$('remove-product-image').addEventListener('click', () => { state.imageJob++; state.selectedImage = null; state.removeImage = true; state.processingImage = false; $('product-image').value = ''; $('product-save').disabled = state.saving; feedback('product-image-feedback', 'La fotografia verrà rimossa al salvataggio del prodotto.'); renderImagePreview(); });
$('category-name').addEventListener('input', () => { if (!state.slugTouched) $('category-slug').value = slugify($('category-name').value); });
$('category-slug').addEventListener('input', () => { state.slugTouched = true; });
for (const section of ['products', 'categories']) {
  $(`show-${section}`).addEventListener('click', () => { for (const name of ['products', 'categories']) { $(`${name}-panel`).hidden = name !== section; $(`show-${name}`).setAttribute('aria-pressed', String(name === section)); } });
}
for (const listId of ['product-list', 'category-list']) $(listId).addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]'); if (!button || button.disabled) return;
  const { action, id, type } = button.dataset;
  if (action === 'delete') openDelete(type, id);
  else if (action === 'duplicate') {
    button.disabled = true; const job = state.authJob;
    try {
      const result = await api(`products/${encodeURIComponent(id)}/duplicate`, 'POST', {});
      notifyCatalogChanged(); await loadCatalog();
      if (job !== state.authJob || state.readOnly) return;
      const product = result.product;
      if (product && !state.products.some(item => item.id === product.id)) state.products.push(product);
      status('Copia creata come bozza: completa codice, varianti e fotografie prima di pubblicarla.');
      if (product) openProduct(product.id);
    } catch (error) { if (job === state.authJob) status(describeError(error), true); }
    finally { if (button.isConnected) button.disabled = state.readOnly; }
  } else if (type === 'products') openProduct(id); else openCategory(id);
});
for (const button of document.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => closeDialog(button.dataset.closeDialog));
for (const dialog of document.querySelectorAll('.admin-dialog')) {
  dialog.addEventListener('cancel', (event) => { if (state.saving || (editorDirty && dialog.id !== 'delete-dialog' && !confirm('Vuoi chiudere senza salvare le modifiche?'))) event.preventDefault(); else editorDirty = false; });
  dialog.addEventListener('close', () => { if (dialog.id === 'product-dialog') { state.imageJob++; state.processingImage = false; } const target = lastDialogOpener?.isConnected ? lastDialogOpener : $('show-products'); target?.focus(); });
}

for (const form of [$('product-form'), $('category-form')]) {
  form.addEventListener('input', () => { editorDirty = true; });
  form.addEventListener('change', () => { editorDirty = true; });
}
$('remove-product-image').addEventListener('click', () => { editorDirty = true; });
addEventListener('beforeunload', event => {
  if (editorDirty && document.querySelector('.admin-dialog[open]')) { event.preventDefault(); event.returnValue = ''; }
});

async function start() {
  try {
    state.auth = await initializeFirebaseAuth();
    if (state.auth.status === 'missing') { $('admin-setup').hidden = false; await loadPreview(); status('Catalogo in sola lettura. La gestione richiede il collegamento al servizio e l’accesso del gestore.'); }
    else { $('admin-access').hidden = false; $('google-signin-option').hidden = false; state.auth.onChange(onAuthChange); }
  } catch (error) {
    $('admin-setup').hidden = false;
    try { await loadPreview(); } catch { /* The primary configuration error remains visible. */ }
    status(`L’area riservata non è ancora disponibile. ${describeError(error)}`, true);
  }
}
start();
