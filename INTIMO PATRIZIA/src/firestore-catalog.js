import { initializeFirebaseApp } from './firebase-auth.js';
import { compareCatalogProducts, mergeCatalogPage } from './catalog-pager.js';
import { normalizeVariantAvailability } from './product-variants.js';

export const CATALOG_LIMITS = Object.freeze({ categories: 50, products: 5000, query: 100 });
const MAX_IMAGE_BYTES = 300 * 1024;
const categoryFields = ['name', 'slug', 'description', 'order', 'published', 'image'];
const productFields = ['name', 'categoryId', 'description', 'price', 'sizes', 'colors', 'material', 'image', 'imageAlt', 'available', 'published', 'isDemo', 'order', 'sku', 'brand', 'featured', 'newArrival', 'gallerySlots', 'variantAvailability'];
const bulkProductFields = productFields.filter(key => !['image', 'gallerySlots'].includes(key));
const extraProductDefaults = Object.freeze({ sku: '', brand: '', featured: false, newArrival: false, variantAvailability: Object.freeze({}) });
let contextPromise;

export class CatalogError extends Error {
  constructor(status, code, message) { super(message); this.name = 'CatalogError'; this.status = status; this.code = code; }
}
const invalid = message => { throw new CatalogError(400, 'invalid-input', message); };
const conflict = (code, message) => { throw new CatalogError(409, code, message); };
const missing = label => { throw new CatalogError(404, 'not-found', `${label} non trovato.`); };
const permissionError = error => ['permission-denied', 'unauthenticated', 'firestore/permission-denied', 'firestore/unauthenticated'].includes(error?.code);
const sorted = items => items.sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name), 'it'));
const view = (snapshot, fields) => {
  const data = snapshot.data();
  const imageVersion = fields === productFields && data.updatedAt
    ? `${data.updatedAt.seconds ?? 0}:${data.updatedAt.nanoseconds ?? 0}`
    : undefined;
  return { id: snapshot.id, ...(fields === productFields ? { ...extraProductDefaults, gallerySlots: [], archived: data.archived === true, archivedAt: data.archivedAt?.toDate?.().toISOString() || null } : {}), ...Object.fromEntries(fields.filter(key => data[key] !== undefined).map(key => [key, data[key]])), ...(fields === categoryFields && Number.isInteger(data.productCount) ? { productCount: data.productCount } : {}), ...(imageVersion ? { imageVersion } : {}) };
};

function publicError(error, browsing = false) {
  if (error instanceof CatalogError || error?.name === 'AbortError') return error;
  if (permissionError(error)) return new CatalogError(error.code?.includes('unauthenticated') ? 401 : 403, error.code, browsing ? 'Il catalogo non è disponibile in questo momento. Riprova tra poco.' : 'Questo account non è autorizzato a gestire il catalogo.');
  if (error?.code === 'resource-exhausted') return new CatalogError(429, error.code, 'Il catalogo ha raggiunto il limite di utilizzo disponibile. Riprova più tardi.');
  return new CatalogError(503, error?.code || 'catalog-unavailable', 'Il catalogo non è disponibile in questo momento. Controlla la connessione e riprova.');
}

export async function getFirestoreContext() {
  if (!contextPromise) contextPromise = (async () => {
    const [app, sdk] = await Promise.all([initializeFirebaseApp(), import('firebase/firestore')]);
    if (!app) throw new CatalogError(503, 'firebase-not-configured', 'Il servizio del catalogo non è ancora disponibile.');
    const db = sdk.getFirestore(app);
    // This loopback-only host lets the rules tests use Firestore without
    // replacing the separate authentication provider with an Auth emulator.
    const firestoreHost = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST;
    if (firestoreHost || import.meta.env.VITE_USE_EMULATORS === 'true') {
      const emulator = new URL(firestoreHost ? `http://${firestoreHost}` : import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_URL || 'http://127.0.0.1:8080');
      if (!['localhost', '127.0.0.1', '[::1]'].includes(emulator.hostname) || emulator.protocol !== 'http:') throw new CatalogError(503, 'invalid-emulator', 'L’emulatore del catalogo deve utilizzare un indirizzo locale.');
      sdk.connectFirestoreEmulator(db, emulator.hostname.replace(/^\[|\]$/g, ''), Number(emulator.port || 8080));
    }
    return { db, sdk };
  })().catch(error => { contextPromise = undefined; throw error; });
  return contextPromise;
}

const context = getFirestoreContext;

function checkSignal(signal) {
  if (signal?.aborted) throw signal.reason || new DOMException('Operazione interrotta.', 'AbortError');
}

// The SDK cannot cancel an already sent one-shot read. Stop waiting on abort,
// and check between queries so a hidden page never starts further reads.
function abortable(promise, signal) {
  if (!signal) return promise;
  checkSignal(signal);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException('Operazione interrotta.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function publicCategories(ctx, signal) {
  const { db, sdk } = ctx;
  const query = sdk.query(sdk.collection(db, 'categories'), sdk.where('published', '==', true), sdk.limit(CATALOG_LIMITS.categories));
  const snapshot = await abortable(sdk.getDocsFromServer(query), signal);
  return sorted(snapshot.docs.map(item => view(item, categoryFields)));
}

export async function loadPublicCatalogPage({ signal, categoryIds, sort = 'recommended', pageSize = 24, cursor } = {}) {
  try {
    checkSignal(signal);
    const ctx = await abortable(context(), signal);
    const { db, sdk } = ctx;
    checkSignal(signal);
    if (!['recommended', 'name', 'price-asc', 'price-desc'].includes(sort)) invalid('Ordinamento non valido.');
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > CATALOG_LIMITS.query) invalid('Dimensione della pagina non valida.');
    const categories = cursor?.categories || await publicCategories(ctx, signal);
    const selected = categories.filter(category => !categoryIds || categoryIds.includes(category.id));
    const key = JSON.stringify([selected.map(category => category.id).sort(), sort]);
    if (cursor && cursor.key !== key) invalid('Il cursore non corrisponde ai filtri del catalogo.');
    const streams = cursor?.streams || selected.map(category => ({ categoryId: category.id, buffer: [], last: null, done: false, nullPrices: false }));
    const read = async (stream, size) => {
      checkSignal(signal);
      // Public rules must be able to prove the parent category is published.
      const clauses = [sdk.where('categoryId', '==', stream.categoryId), sdk.where('published', '==', true), sdk.where('isDemo', '==', false)];
      const priceSort = sort === 'price-asc' || sort === 'price-desc';
      if (priceSort) {
        clauses.push(sdk.where('price', stream.nullPrices ? '==' : '>=', stream.nullPrices ? null : 0));
        if (!stream.nullPrices) clauses.push(sdk.orderBy('price', sort === 'price-desc' ? 'desc' : 'asc'));
      } else if (sort === 'recommended') clauses.push(sdk.orderBy('order', 'asc'));
      clauses.push(sdk.orderBy('name', 'asc'), sdk.orderBy(sdk.documentId(), 'asc'));
      if (stream.last) clauses.push(sdk.startAfter(stream.last));
      const snapshot = await abortable(sdk.getDocsFromServer(sdk.query(sdk.collection(db, 'products'), ...clauses, sdk.limit(size))), signal);
      stream.buffer.push(...snapshot.docs.map(item => ({ product: view(item, productFields), snapshot: item })));
      if (snapshot.docs.length) stream.last = snapshot.docs.at(-1);
      if (snapshot.size < size) {
        if (priceSort && !stream.nullPrices) {
          stream.nullPrices = true;
          stream.last = null;
          // Numeric products already buffered must be consumed before nulls.
          if (!stream.buffer.length) await read(stream, size);
        } else stream.done = true;
      }
    };
    const page = await mergeCatalogPage({ streams, read, pageSize, compare: (a, b) => compareCatalogProducts(a, b, sort), check: () => checkSignal(signal) });
    checkSignal(signal);
    return { categories, products: page.products, demo: false, limits: CATALOG_LIMITS, complete: page.complete, truncated: false, nextCursor: page.complete ? null : { key, categories, streams: page.streams } };
  } catch (error) { throw publicError(error, true); }
}

// Compatibility entry point now deliberately returns one bounded first page.
export const loadPublicCatalog = signal => loadPublicCatalogPage({ signal });
export const loadPublicCatalogPreview = ({ signal, categoryIds, pageSize = 6 } = {}) => loadPublicCatalogPage({ signal, categoryIds, pageSize: Math.min(12, pageSize) });

export async function loadPublicProductsByIds({ ids = [], signal } = {}) {
  try {
    checkSignal(signal);
    const ctx = await abortable(context(), signal);
    const categories = new Set((await publicCategories(ctx, signal)).map(category => category.id));
    const selected = [...new Set(ids)].slice(0, 12).filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id));
    const records = await Promise.all(selected.map(async id => {
      try {
        checkSignal(signal);
        const snapshot = await abortable(ctx.sdk.getDocFromServer(ctx.sdk.doc(ctx.db, 'products', id)), signal);
        if (!snapshot.exists()) return null;
        const product = view(snapshot, productFields);
        return product.published === true && product.isDemo === false && categories.has(product.categoryId) ? product : null;
      } catch (error) {
        if (permissionError(error)) return null;
        throw error;
      }
    }));
    return records.filter(Boolean);
  } catch (error) { throw publicError(error, true); }
}

export async function loadManagerCatalogPage({ signal, pageSize = 50, cursor } = {}) {
  try {
    checkSignal(signal);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > CATALOG_LIMITS.query) invalid('Dimensione della pagina non valida.');
    const { db, sdk } = await abortable(context(), signal);
    const categories = cursor?.categories || sorted((await abortable(sdk.getDocsFromServer(sdk.query(sdk.collection(db, 'categories'), sdk.limit(CATALOG_LIMITS.categories))), signal)).docs.map(item => view(item, categoryFields)));
    const clauses = [sdk.orderBy('order'), sdk.orderBy('name'), sdk.orderBy(sdk.documentId())];
    if (cursor?.last) clauses.push(sdk.startAfter(cursor.last));
    const snapshot = await abortable(sdk.getDocsFromServer(sdk.query(sdk.collection(db, 'products'), ...clauses, sdk.limit(pageSize))), signal);
    return { categories, products: snapshot.docs.map(item => view(item, productFields)), complete: snapshot.size < pageSize, nextCursor: snapshot.size < pageSize ? null : { categories, last: snapshot.docs.at(-1) }, demo: false, limits: CATALOG_LIMITS };
  } catch (error) { throw publicError(error); }
}

export async function readPublicVersion(signal) {
  try {
    checkSignal(signal);
    const { db, sdk } = await abortable(context(), signal);
    checkSignal(signal);
    const snapshot = await abortable(sdk.getDocFromServer(sdk.doc(db, 'catalogMeta', 'revision')), signal);
    return snapshot.exists() && typeof snapshot.data().version === 'string' ? snapshot.data().version : 'initial';
  } catch (error) { throw publicError(error, true); }
}

export async function getCatalogSession(signal) {
  try {
    checkSignal(signal);
    const { db, sdk } = await abortable(context(), signal);
    checkSignal(signal);
    // The rules allow this GET for the verified owner even if no marker exists.
    // Other accounts and anonymous visitors receive permission-denied.
    await abortable(sdk.getDocFromServer(sdk.doc(db, 'catalogAccess', 'manager')), signal);
    return { canManageCatalog: true };
  } catch (error) {
    if (permissionError(error)) return { canManageCatalog: false };
    throw publicError(error);
  }
}

function assertId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) invalid('Identificativo non valido.');
  return id;
}
function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Invia un oggetto di dati valido.');
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid('I dati contengono un campo non consentito.');
}
function text(value, label, maximum, required = false) {
  if (value === undefined) value = '';
  if (typeof value !== 'string') invalid(`${label}: usa un testo.`);
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cleaned)) invalid(`${label}: testo non valido (massimo ${maximum} caratteri).`);
  return cleaned;
}
function boolean(value, label, fallback = true) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') invalid(`${label}: usa vero o falso.`);
  return value;
}
function order(value) {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0 || value > 9999) invalid('Ordine: scegli un intero tra 0 e 9999.');
  return value;
}
function list(value, label, deduplicate = true) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) invalid(`${label}: massimo 20 valori.`);
  const entries = value.map(item => text(item, label, 50, true));
  const values = deduplicate ? [...new Set(entries)] : entries;
  if (values.some(item => item.includes('|'))) invalid(`${label}: separa le voci con una virgola e non usare il carattere |.`);
  return values;
}
function asset(value) {
  const path = text(value, 'Immagine', 250);
  if (path && !/^\/assets\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:png|jpe?g|webp|avif|svg)$/.test(path)) invalid('Immagine: scegli un file presente nel sito con estensione minuscola.');
  return path;
}
function categoryInput(body) {
  object(body, categoryFields);
  const name = text(body.name, 'Nome reparto', 100, true);
  const slug = body.slug === undefined ? name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : text(body.slug, 'Identificativo', 100, true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) invalid('Identificativo: usa lettere minuscole, numeri e trattini, fino a 100 caratteri.');
  return { name, slug, description: text(body.description, 'Descrizione', 1500), order: order(body.order), published: boolean(body.published, 'Pubblicato'), image: asset(body.image) };
}

function decodeBase64(base64) {
  const raw = atob(base64);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}
function encodeBase64(bytes) {
  let raw = '';
  for (let index = 0; index < bytes.length; index += 16384) raw += String.fromCharCode(...bytes.subarray(index, index + 16384));
  return btoa(raw);
}

async function normalizedImage(dataURL) {
  if (typeof dataURL !== 'string' || dataURL.length > MAX_IMAGE_BYTES * 4 / 3 + 100) invalid('La foto supera 300 KiB. Scegli una versione più leggera.');
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataURL);
  if (!match || match[2].length % 4 !== 0) invalid('Sono ammesse fotografie JPG, PNG o WebP valide.');
  let bytes;
  try { bytes = decodeBase64(match[2]); } catch { invalid('La fotografia non è leggibile.'); }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || encodeBase64(bytes) !== match[2]) invalid('La foto non è valida oppure supera 300 KiB.');
  const magic = String.fromCharCode(...bytes.subarray(0, 12));
  const actual = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpeg' : [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) ? 'png' : magic.slice(0, 4) === 'RIFF' && magic.slice(8, 12) === 'WEBP' ? 'webp' : '';
  if (actual !== match[1]) invalid('Il formato della fotografia non corrisponde al suo contenuto.');
  const source = new Blob([bytes], { type: `image/${actual}` });
  let bitmap;
  let sourceURL;
  try {
    if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(source);
    else {
      bitmap = new Image(); sourceURL = URL.createObjectURL(source); bitmap.src = sourceURL; await bitmap.decode();
    }
    const sourceWidth = bitmap.width || bitmap.naturalWidth;
    const sourceHeight = bitmap.height || bitmap.naturalHeight;
    if (!sourceWidth || !sourceHeight || sourceWidth < 16 || sourceHeight < 16 || sourceWidth > 4096 || sourceHeight > 4096) invalid('Usa una fotografia tra 16 e 4096 pixel per lato.');
    const canvas = document.createElement('canvas');
    let width = sourceWidth;
    let height = sourceHeight;
    let output;
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = width; canvas.height = height;
      const drawing = canvas.getContext('2d', { alpha: false });
      if (!drawing) invalid('Il browser non può elaborare la fotografia.');
      drawing.fillStyle = '#f9f6f0'; drawing.fillRect(0, 0, width, height); drawing.drawImage(bitmap, 0, 0, width, height);
      output = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', Math.max(.5, .82 - attempt * .06)));
      if (output?.type !== 'image/webp') invalid('Il browser non supporta il salvataggio delle foto. Usa un browser aggiornato.');
      if (output.size <= MAX_IMAGE_BYTES) break;
      width = Math.max(16, Math.round(width * .85)); height = Math.max(16, Math.round(height * .85));
    }
    if (!output || output.size > MAX_IMAGE_BYTES) invalid('La foto supera 300 KiB anche dopo la compressione. Scegli una versione più piccola.');
    const normalized = new Uint8Array(await output.arrayBuffer());
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', normalized));
    return { base64: encodeBase64(normalized), mime: 'image/webp', bytes: normalized.length, width, height, hash: [...digest].map(value => value.toString(16).padStart(2, '0')).join('') };
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    invalid('La fotografia non è leggibile. Esporta un nuovo JPG, PNG o WebP.');
  } finally { bitmap?.close?.(); if (sourceURL) URL.revokeObjectURL(sourceURL); }
}

function gallerySlots(value, label = 'Foto aggiuntive') {
  if (!Array.isArray(value) || value.length > 2 || value.some(slot => slot !== 1 && slot !== 2) || new Set(value).size !== value.length) invalid(`${label}: sono ammesse le posizioni 1 e 2, senza duplicati.`);
  return [...value].sort();
}

async function productInput(body, id) {
  object(body, [...productFields, 'imageData', 'removeImage', 'galleryUploads', 'galleryRemovals']);
  const categoryId = assertId(body.categoryId);
  const price = body.price ?? null;
  if (price !== null && (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 100000 || Math.abs(price * 100 - Math.round(price * 100)) > 1e-6)) invalid('Prezzo: usa un importo in euro con massimo due decimali, oppure lascia il campo vuoto.');
  const removeImage = boolean(body.removeImage, 'Rimuovi immagine', false);
  if (removeImage && body.imageData !== undefined) invalid('Scegli se caricare oppure rimuovere la fotografia.');
  const variantDimensions = { sizes: list(body.sizes, 'Taglie', false), colors: list(body.colors, 'Colori', false) };
  const record = {
    name: text(body.name, 'Nome prodotto', 160, true), categoryId, description: text(body.description, 'Descrizione', 3000), price,
    sizes: [...new Set(variantDimensions.sizes)], colors: [...new Set(variantDimensions.colors)], material: text(body.material, 'Tessuto', 200),
    imageAlt: text(body.imageAlt, 'Descrizione della fotografia', 250), available: boolean(body.available, 'Disponibile'),
    published: boolean(body.published, 'Pubblicato'), isDemo: boolean(body.isDemo, 'Esempio', false), order: order(body.order),
  };
  if (body.variantAvailability !== undefined) record.variantAvailability = checkedVariantAvailability(body.variantAvailability, variantDimensions);
  if (body.image !== undefined) record.image = body.image === `/api/images/${id}` ? body.image : asset(body.image);
  const imageDocument = body.imageData === undefined ? null : await normalizedImage(body.imageData);
  if (imageDocument) record.image = `/api/images/${id}`;
  if (removeImage) record.image = '';
  for (const key of ['sku', 'brand']) if (body[key] !== undefined) record[key] = text(body[key], key === 'sku' ? 'Codice articolo' : 'Marchio', 80);
  for (const key of ['featured', 'newArrival']) if (body[key] !== undefined) record[key] = boolean(body[key], key === 'featured' ? 'In evidenza' : 'Novità', false);
  if (body.gallerySlots !== undefined) record.gallerySlots = gallerySlots(body.gallerySlots);
  const galleryRemovals = gallerySlots(body.galleryRemovals ?? [], 'Foto da rimuovere');
  if (body.galleryUploads !== undefined && (!Array.isArray(body.galleryUploads) || body.galleryUploads.length > 2)) invalid('Puoi caricare al massimo due foto aggiuntive.');
  const uploadSlots = gallerySlots((body.galleryUploads || []).map(upload => upload?.slot));
  if (uploadSlots.some(slot => galleryRemovals.includes(slot))) invalid('Scegli se caricare oppure rimuovere ciascuna foto aggiuntiva.');
  const galleryUploads = await Promise.all((body.galleryUploads || []).map(async upload => {
    object(upload, ['slot', 'imageData', 'alt']);
    return { slot: upload.slot, alt: text(upload.alt, 'Descrizione della foto aggiuntiva', 250, true), imageDocument: upload.imageData === undefined ? null : await normalizedImage(upload.imageData) };
  }));
  return { record, imageDocument, removeImage, galleryUploads, galleryRemovals, variantDimensions };
}

function checkedVariantAvailability(value, dimensions) {
  try { return normalizeVariantAvailability(value, dimensions); }
  catch (error) { invalid(error.message); }
}

function inventoryCounts(snapshot, allowEmpty) {
  if (!snapshot.exists()) {
    if (!allowEmpty) throw new CatalogError(409, 'inventory-missing', 'I metadati del catalogo non sono inizializzati.');
    return { categoryCount: 0, productCount: 0, lastCategoryId: '', lastProductId: '' };
  }
  const { categoryCount, productCount } = snapshot.data();
  if (!Number.isInteger(categoryCount) || !Number.isInteger(productCount) || categoryCount < 0 || productCount < 0 || categoryCount > CATALOG_LIMITS.categories || productCount > CATALOG_LIMITS.products) conflict('invalid-inventory', 'I conteggi del catalogo non sono validi. Contatta chi amministra il sito.');
  const { lastCategoryId = '', lastProductId = '' } = snapshot.data();
  if ([lastCategoryId, lastProductId].some(id => typeof id !== 'string' || (id && !/^[A-Za-z0-9_-]{1,80}$/.test(id)))) conflict('invalid-inventory', 'I riferimenti dei conteggi del catalogo non sono validi.');
  return { categoryCount, productCount, lastCategoryId, lastProductId };
}

function categoryCount(snapshot) {
  const count = snapshot.data()?.productCount;
  if (!Number.isInteger(count) || count < 0 || count > CATALOG_LIMITS.products) conflict('invalid-inventory', 'Il conteggio dei prodotti del reparto non è valido. Contatta chi amministra il sito.');
  return count;
}

async function transactionWithInventory({ db, sdk }, callback) {
  const run = allowEmpty => sdk.runTransaction(db, transaction => callback(transaction, allowEmpty));
  try { return await run(false); }
  catch (error) {
    if (error?.code !== 'inventory-missing') throw error;
    const snapshots = await Promise.all(['categories', 'products'].map(name => sdk.getDocsFromServer(sdk.query(sdk.collection(db, name), sdk.limit(1)))));
    if (snapshots.some(snapshot => !snapshot.empty)) conflict('inventory-missing', 'Il catalogo esiste, ma i suoi metadati devono essere inizializzati dal responsabile del sito.');
    return run(true);
  }
}

function writeMeta(transaction, ctx, counts) {
  const version = crypto.randomUUID();
  transaction.set(ctx.sdk.doc(ctx.db, 'catalogMeta', 'inventory'), { ...counts, updatedAt: ctx.sdk.serverTimestamp() });
  transaction.set(ctx.sdk.doc(ctx.db, 'catalogMeta', 'revision'), { version });
  return version;
}

function checkExpectedRevision(snapshot, expectedRevision) {
  if (expectedRevision === undefined) return;
  const actual = snapshot?.exists() && typeof snapshot.data().version === 'string' ? snapshot.data().version : 'initial';
  if (actual !== expectedRevision) conflict('catalog-changed', 'Il catalogo è cambiato. Controlla nuovamente l’anteprima prima di continuare.');
}

async function saveCategory(ctx, id, record, createOnly = false, expectedRevision) {
  const { db, sdk } = ctx;
  const ref = id ? sdk.doc(db, 'categories', assertId(id)) : sdk.doc(sdk.collection(db, 'categories'));
  let revision;
  // Legacy categories predate slug reservations. Check them without making
  // hidden writes during catalogue reads; this CRUD creates its own reservation.
  const sameSlug = await sdk.getDocsFromServer(sdk.query(sdk.collection(db, 'categories'), sdk.where('slug', '==', record.slug), sdk.limit(2)));
  if (sameSlug.docs.some(snapshot => snapshot.id !== ref.id)) conflict('duplicate-slug', 'Questo identificativo è già usato da un altro reparto.');
  await transactionWithInventory(ctx, async (transaction, allowEmpty) => {
    const [old, inventory, reservation, currentRevision] = await Promise.all([
      transaction.get(ref), transaction.get(sdk.doc(db, 'catalogMeta', 'inventory')), transaction.get(sdk.doc(db, 'categorySlugs', record.slug)),
      expectedRevision === undefined ? Promise.resolve(null) : transaction.get(sdk.doc(db, 'catalogMeta', 'revision')),
    ]);
    checkExpectedRevision(currentRevision, expectedRevision);
    if (createOnly && old.exists()) conflict('already-exists', 'Questo reparto esiste già. La copia non lo sovrascrive.');
    if (id && !old.exists() && !createOnly) missing('Reparto');
    if (reservation.exists() && reservation.data().categoryId !== ref.id) conflict('duplicate-slug', 'Questo identificativo è già usato da un altro reparto.');
    const counts = inventoryCounts(inventory, allowEmpty);
    if (!old.exists() && counts.categoryCount >= CATALOG_LIMITS.categories) conflict('catalog-limit', `Limite di ${CATALOG_LIMITS.categories} reparti raggiunto.`);
    const oldSlug = old.exists() ? old.data().slug : '';
    const oldReservation = oldSlug && oldSlug !== record.slug ? await transaction.get(sdk.doc(db, 'categorySlugs', oldSlug)) : null;
    transaction.set(ref, { ...record, productCount: old.exists() ? categoryCount(old) : 0, lastProductId: old.exists() ? old.data().lastProductId || '' : '', updatedAt: sdk.serverTimestamp() });
    transaction.set(sdk.doc(db, 'categorySlugs', record.slug), { categoryId: ref.id });
    if (oldReservation?.exists() && oldReservation.data().categoryId === ref.id) transaction.delete(oldReservation.ref);
    revision = writeMeta(transaction, ctx, { ...counts, categoryCount: counts.categoryCount + (old.exists() ? 0 : 1), lastCategoryId: old.exists() ? counts.lastCategoryId : ref.id });
  });
  return { category: { id: ref.id, ...record }, ...(expectedRevision === undefined ? {} : { revision }) };
}

async function deleteCategory(ctx, id) {
  const { db, sdk } = ctx;
  const ref = sdk.doc(db, 'categories', assertId(id));
  await transactionWithInventory(ctx, async (transaction, allowEmpty) => {
    const [old, inventory] = await Promise.all([transaction.get(ref), transaction.get(sdk.doc(db, 'catalogMeta', 'inventory'))]);
    if (!old.exists()) missing('Reparto');
    if (categoryCount(old) !== 0) conflict('category-not-empty', 'Sposta o elimina prima i prodotti di questo reparto, compresi quelli nel cestino.');
    const counts = inventoryCounts(inventory, allowEmpty);
    if (!counts.categoryCount) conflict('invalid-inventory', 'Il conteggio dei reparti non è valido.');
    const reservation = await transaction.get(sdk.doc(db, 'categorySlugs', old.data().slug));
    transaction.delete(ref);
    if (reservation.exists() && reservation.data().categoryId === id) transaction.delete(reservation.ref);
    writeMeta(transaction, ctx, { ...counts, categoryCount: counts.categoryCount - 1, lastCategoryId: id });
  });
  return {};
}

async function saveProduct(ctx, id, input, create, expectedRevision, expectedProductVersion) {
  const { db, sdk } = ctx;
  const { record, imageDocument, removeImage, galleryUploads, galleryRemovals } = input;
  const ref = sdk.doc(db, 'products', assertId(id));
  let saved, revision;
  await transactionWithInventory(ctx, async (transaction, allowEmpty) => {
    const categoryRef = sdk.doc(db, 'categories', record.categoryId);
    const [old, category, inventory, currentRevision] = await Promise.all([transaction.get(ref), transaction.get(categoryRef), transaction.get(sdk.doc(db, 'catalogMeta', 'inventory')),
      expectedRevision === undefined ? Promise.resolve(null) : transaction.get(sdk.doc(db, 'catalogMeta', 'revision'))]);
    checkExpectedRevision(currentRevision, expectedRevision);
    if (!create && !old.exists()) missing('Prodotto');
    if (create && old.exists()) conflict('already-exists', 'Questo prodotto esiste già.');
    if (!category.exists()) invalid('Scegli un reparto esistente.');
    const previous = old.exists() ? old.data() : {};
    if (previous.archived === true) conflict('product-archived', 'Ripristina il prodotto dal cestino prima di modificarlo.');
    if (expectedProductVersion !== undefined) {
      const actual = previous.updatedAt ? `${previous.updatedAt.seconds ?? 0}:${previous.updatedAt.nanoseconds ?? 0}` : 'initial';
      if (actual !== expectedProductVersion) conflict('stale-product', 'Il prodotto è cambiato dopo l’anteprima. Controlla nuovamente i dati prima di continuare.');
      if (record.isDemo !== previous.isDemo) invalid('L’aggiornamento non può modificare lo stato di esempio del prodotto.');
    }
    const moved = old.exists() && previous.categoryId !== record.categoryId;
    const previousCategoryRef = moved ? sdk.doc(db, 'categories', assertId(previous.categoryId)) : null;
    const previousCategory = previousCategoryRef ? await transaction.get(previousCategoryRef) : null;
    if (moved && !previousCategory.exists()) conflict('invalid-category', 'Il reparto precedente non è disponibile.');
    const counts = inventoryCounts(inventory, allowEmpty);
    if (create && counts.productCount >= CATALOG_LIMITS.products) conflict('catalog-limit', `Limite di ${CATALOG_LIMITS.products} prodotti raggiunto.`);
    saved = { ...extraProductDefaults, ...Object.fromEntries(Object.keys(extraProductDefaults).filter(key => previous[key] !== undefined).map(key => [key, previous[key]])), ...record, image: record.image === undefined ? previous.image || '' : record.image };
    // Omitted maps survive older clients' full-document saves. Validate the
    // merged result before writes so changing labels cannot strand a pair.
    saved.variantAvailability = checkedVariantAvailability(saved.variantAvailability, input.variantDimensions || saved);
    const extraImages = await Promise.all([1, 2].map(slot => transaction.get(sdk.doc(db, 'productGalleryImages', `${id}__${slot}`))));
    const slots = new Set(record.gallerySlots ?? previous.gallerySlots ?? []);
    for (const slot of galleryRemovals) slots.delete(slot);
    for (const upload of galleryUploads) slots.add(upload.slot);
    saved.gallerySlots = gallerySlots([...slots]);
    for (const slot of saved.gallerySlots) {
      if (!galleryUploads.find(upload => upload.slot === slot)?.imageDocument && !extraImages[slot - 1].exists()) invalid('Carica la foto aggiuntiva prima di utilizzarla.');
    }
    if (saved.image && !saved.imageAlt) invalid('Descrivi la fotografia per chi utilizza un lettore di schermo.');
    const imageRef = sdk.doc(db, 'productImages', id);
    if (saved.image === `/api/images/${id}` && !imageDocument) {
      const image = await transaction.get(imageRef);
      if (!image.exists() || previous.image !== saved.image) invalid('Carica la fotografia prima di utilizzarla.');
    }
    const nextCount = categoryCount(category) + (create || moved ? 1 : 0);
    const previousCount = moved ? categoryCount(previousCategory) - 1 : 0;
    if (nextCount > CATALOG_LIMITS.products || previousCount < 0) conflict('invalid-inventory', 'Il conteggio dei prodotti del reparto non è valido.');
    transaction.set(ref, { ...saved, updatedAt: sdk.serverTimestamp() });
    if (create || moved) transaction.update(categoryRef, { productCount: nextCount, lastProductId: id, updatedAt: sdk.serverTimestamp() });
    if (moved) transaction.update(previousCategoryRef, { productCount: previousCount, lastProductId: id, updatedAt: sdk.serverTimestamp() });
    if (imageDocument) transaction.set(imageRef, { ...imageDocument, updatedAt: sdk.serverTimestamp() });
    else if (removeImage || (record.image !== undefined && record.image !== `/api/images/${id}`)) transaction.delete(imageRef);
    for (const slot of [1, 2]) {
      const galleryRef = sdk.doc(db, 'productGalleryImages', `${id}__${slot}`);
      const upload = galleryUploads.find(item => item.slot === slot);
      if (upload) {
        const photo = upload.imageDocument || storedImage(extraImages[slot - 1].data());
        transaction.set(galleryRef, { ...photo, productId: id, slot, alt: upload.alt, updatedAt: sdk.serverTimestamp() });
      } else if (!saved.gallerySlots.includes(slot) && extraImages[slot - 1].exists()) transaction.delete(galleryRef);
    }
    revision = writeMeta(transaction, ctx, { ...counts, productCount: counts.productCount + (create ? 1 : 0), lastProductId: create ? id : counts.lastProductId });
  });
  return { product: { id, ...saved }, ...(expectedRevision === undefined ? {} : { revision }) };
}

async function deleteProduct(ctx, id) {
  const { db, sdk } = ctx;
  const ref = sdk.doc(db, 'products', assertId(id));
  await transactionWithInventory(ctx, async (transaction, allowEmpty) => {
    const [old, inventory, ...extraImages] = await Promise.all([transaction.get(ref), transaction.get(sdk.doc(db, 'catalogMeta', 'inventory')), ...[1, 2].map(slot => transaction.get(sdk.doc(db, 'productGalleryImages', `${id}__${slot}`)))]);
    if (!old.exists()) missing('Prodotto');
    const categoryRef = sdk.doc(db, 'categories', assertId(old.data().categoryId));
    const category = await transaction.get(categoryRef);
    if (!category.exists()) conflict('invalid-category', 'Il reparto del prodotto non è disponibile.');
    const counts = inventoryCounts(inventory, allowEmpty);
    const count = categoryCount(category);
    if (!counts.productCount || !count) conflict('invalid-inventory', 'Il conteggio dei prodotti non è valido.');
    transaction.delete(ref);
    transaction.delete(sdk.doc(db, 'productImages', id));
    for (const slot of [1, 2]) if (extraImages[slot - 1].exists()) transaction.delete(sdk.doc(db, 'productGalleryImages', `${id}__${slot}`));
    transaction.update(categoryRef, { productCount: count - 1, lastProductId: id, updatedAt: sdk.serverTimestamp() });
    writeMeta(transaction, ctx, { ...counts, productCount: counts.productCount - 1, lastProductId: id });
  });
  return {};
}

// Trashed products keep their identity, photographs and bounded inventory slot.
// Only an explicit restore makes them editable again, always as an unpublished draft.
async function setProductArchived(ctx, id, archived) {
  const { db, sdk } = ctx;
  const ref = sdk.doc(db, 'products', assertId(id));
  await transactionWithInventory(ctx, async (transaction, allowEmpty) => {
    const [old, inventory] = await Promise.all([
      transaction.get(ref), transaction.get(sdk.doc(db, 'catalogMeta', 'inventory')),
    ]);
    if (!old.exists()) missing('Prodotto');
    const previous = old.data();
    if ((previous.archived === true) === archived) return;
    const counts = inventoryCounts(inventory, allowEmpty);
    transaction.update(ref, {
      archived, archivedAt: archived ? sdk.serverTimestamp() : null,
      published: false, updatedAt: sdk.serverTimestamp(),
    });
    writeMeta(transaction, ctx, counts);
  });
  return { product: view(await sdk.getDocFromServer(ref), productFields) };
}

// A duplicate owns its image documents. Hiding or deleting the source never
// changes the duplicate, and the new item starts as an unpublished draft.
async function duplicateProduct(ctx, sourceId, payload = {}) {
  object(payload, ['name']);
  const { db, sdk } = ctx;
  assertId(sourceId);
  const id = sdk.doc(sdk.collection(db, 'products')).id;
  let saved;
  await transactionWithInventory(ctx, async (transaction, allowEmpty) => {
    const [source, inventory] = await Promise.all([
      transaction.get(sdk.doc(db, 'products', sourceId)), transaction.get(sdk.doc(db, 'catalogMeta', 'inventory')),
    ]);
    if (!source.exists()) missing('Prodotto');
    const previous = source.data();
    if (previous.archived === true) conflict('product-archived', 'Ripristina il prodotto dal cestino prima di duplicarlo.');
    const categoryRef = sdk.doc(db, 'categories', assertId(previous.categoryId));
    const category = await transaction.get(categoryRef);
    if (!category.exists()) invalid('Scegli un reparto esistente.');
    const counts = inventoryCounts(inventory, allowEmpty);
    if (counts.productCount >= CATALOG_LIMITS.products) conflict('catalog-limit', `Limite di ${CATALOG_LIMITS.products} prodotti raggiunto.`);
    const ownImage = previous.image === `/api/images/${sourceId}`;
    const slots = gallerySlots(previous.gallerySlots || []);
    const [main, ...extras] = await Promise.all([
      ownImage ? transaction.get(sdk.doc(db, 'productImages', sourceId)) : Promise.resolve(null),
      ...slots.map(slot => transaction.get(sdk.doc(db, 'productGalleryImages', `${sourceId}__${slot}`))),
    ]);
    if (ownImage && !main.exists() || extras.some(snapshot => !snapshot.exists())) invalid('Una fotografia del prodotto originale non è disponibile.');
    const body = Object.fromEntries(productFields.filter(key => previous[key] !== undefined).map(key => [key, previous[key]]));
    saved = (await productInput({ ...body, ...extraProductDefaults, ...Object.fromEntries(Object.keys(extraProductDefaults).filter(key => previous[key] !== undefined).map(key => [key, previous[key]])),
      name: payload.name === undefined ? `${String(previous.name).slice(0, 152)} (copia)` : payload.name,
      sku: '', published: false, gallerySlots: slots, image: ownImage ? `/api/images/${id}` : previous.image || '',
    }, id)).record;
    saved.image ??= '';
    transaction.set(sdk.doc(db, 'products', id), { ...saved, updatedAt: sdk.serverTimestamp() });
    if (main) transaction.set(sdk.doc(db, 'productImages', id), { ...storedImage(main.data()), updatedAt: sdk.serverTimestamp() });
    for (const [index, slot] of slots.entries()) {
      const data = extras[index].data();
      transaction.set(sdk.doc(db, 'productGalleryImages', `${id}__${slot}`), { ...storedImage(data), productId: id, slot, alt: text(data.alt, 'Descrizione della foto aggiuntiva', 250, true), updatedAt: sdk.serverTimestamp() });
    }
    transaction.update(categoryRef, { productCount: categoryCount(category) + 1, lastProductId: id, updatedAt: sdk.serverTimestamp() });
    writeMeta(transaction, ctx, { ...counts, productCount: counts.productCount + 1, lastProductId: id });
  });
  return { product: { id, ...extraProductDefaults, ...saved } };
}

export async function catalogRequest(path, method = 'GET', payload) {
  try {
    const ctx = await context();
    const { db, sdk } = ctx;
    if (path === 'catalog' && method === 'GET') {
      return await loadManagerCatalogPage(payload || {});
    }
    if (path === 'products/import' && method === 'POST') {
      const sku = text(payload?.sku, 'Codice articolo', 80, true);
      const canonical = sku.normalize('NFKC').trim().toLocaleLowerCase('it');
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
      const id = `import_${[...digest].map(value => value.toString(16).padStart(2, '0')).join('').slice(0, 32)}`;
      return await saveProduct(ctx, id, await productInput({ ...payload, sku, published: false }, id), true);
    }
    const archive = /^products\/([A-Za-z0-9_-]{1,80})\/(archive|restore)$/.exec(path);
    if (archive && method === 'POST') {
      object(payload === undefined ? {} : payload, []);
      return await setProductArchived(ctx, archive[1], archive[2] === 'archive');
    }
    const duplicate = /^products\/([A-Za-z0-9_-]{1,80})\/duplicate$/.exec(path);
    if (duplicate && method === 'POST') return await duplicateProduct(ctx, duplicate[1], payload);
    const match = /^(categories|products)(?:\/([A-Za-z0-9_-]{1,80}))?$/.exec(path);
    if (!match) missing('Risorsa');
    const [, collectionName, id] = match;
    if (collectionName === 'categories') {
      if (method === 'POST' && !id) return await saveCategory(ctx, null, categoryInput(payload));
      if (method === 'PUT' && id) return await saveCategory(ctx, id, categoryInput(payload));
      if (method === 'DELETE' && id) return await deleteCategory(ctx, id);
    } else {
      if (method === 'POST' && !id) {
        const productId = sdk.doc(sdk.collection(db, 'products')).id;
        return await saveProduct(ctx, productId, await productInput(payload, productId), true);
      }
      if (method === 'PUT' && id) return await saveProduct(ctx, id, await productInput(payload, id), false);
      if (method === 'DELETE' && id) return await setProductArchived(ctx, id, true);
    }
    missing('Risorsa');
  } catch (error) { throw publicError(error); }
}

// CSV updates edit existing product data only. The two transaction guards keep
// a reviewed row from overwriting a newer catalog or product snapshot.
export async function updateCatalogProductRecord(payload) {
  try {
    object(payload, ['id', 'record', 'expectedRevision', 'expectedProductVersion']);
    const { record, expectedRevision, expectedProductVersion } = payload;
    const id = assertId(payload.id);
    if (typeof expectedRevision !== 'string' || !/^(initial|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/.test(expectedRevision)) invalid('La versione del catalogo da aggiornare non è valida.');
    const version = typeof expectedProductVersion === 'string' && /^(-?\d+):(\d{1,9})$/.exec(expectedProductVersion);
    if (expectedProductVersion !== 'initial' && (!version || !Number.isSafeInteger(Number(version[1])) || Number(version[1]) < -62135596800 || Number(version[1]) > 253402300799 || Number(version[2]) > 999999999)) invalid('La versione del prodotto da aggiornare non è valida.');
    object(record, bulkProductFields);
    const input = await productInput(record, id);
    return await saveProduct(await context(), id, input, false, expectedRevision, expectedProductVersion);
  } catch (error) { throw publicError(error); }
}

function storedImage(image) {
  if (!image || image.mime !== 'image/webp' || typeof image.base64 !== 'string' || image.base64.length > MAX_IMAGE_BYTES * 4 / 3 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)) invalid('La fotografia non è valida.');
  const bytes = decodeBase64(image.base64);
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || encodeBase64(bytes) !== image.base64 || image.bytes !== bytes.length
    || !Number.isInteger(image.width) || image.width < 16 || image.width > 4096 || !Number.isInteger(image.height) || image.height < 16 || image.height > 4096
    || typeof image.hash !== 'string' || !/^[a-f0-9]{64}$/.test(image.hash)) invalid('La fotografia non è valida.');
  return Object.fromEntries(['base64', 'mime', 'bytes', 'width', 'height', 'hash'].map(key => [key, image[key]]));
}

// Restore creates missing records only. All published/archive state is reset and
// existing IDs, including records in the trash, are never overwritten.
export async function restoreCatalogBackupRecord(payload) {
  try {
    object(payload, ['kind', 'id', 'record', 'images', 'expectedRevision']);
    const { kind, record, images = [], expectedRevision } = payload;
    if (expectedRevision !== undefined && (typeof expectedRevision !== 'string' || !/^(initial|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/.test(expectedRevision))) invalid('La versione della copia da ripristinare non è valida.');
    const id = assertId(payload.id);
    if (!Array.isArray(images) || images.length > 3) invalid('La copia può contenere al massimo tre foto per prodotto.');
    if (kind === 'category') {
      if (images.length) invalid('Un reparto non può contenere foto prodotto.');
      const input = categoryInput(record);
      return await saveCategory(await context(), id, { ...input, published: false }, true, expectedRevision);
    }
    if (kind !== 'product') invalid('Tipo di scheda della copia non valido.');
    object(record, productFields);
    if (typeof record.image === 'string' && record.image.startsWith('/api/images/') && record.image !== `/api/images/${id}`) invalid('La foto della copia appartiene a un altro prodotto.');
    const slots = new Set();
    const restored = [];
    for (const entry of images) {
      object(entry, ['productId', 'slot', 'base64', 'mime', 'bytes', 'width', 'height', 'hash', 'alt']);
      if (entry.productId !== id) invalid('La fotografia della copia appartiene a un altro prodotto.');
      if (![0, 1, 2].includes(entry.slot) || slots.has(entry.slot)) invalid('Le posizioni delle foto devono essere 0, 1 o 2 e non devono ripetersi.');
      slots.add(entry.slot);
      const image = storedImage(entry);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', decodeBase64(image.base64)));
      if ([...digest].map(value => value.toString(16).padStart(2, '0')).join('') !== image.hash) invalid('La fotografia della copia è danneggiata o modificata.');
      const alt = text(entry.alt, 'Descrizione della fotografia', 250, entry.slot !== 0);
      restored.push({ slot: entry.slot, imageDocument: image, alt });
    }
    const main = restored.find(entry => entry.slot === 0);
    if (Boolean(main) !== (record.image === `/api/images/${id}`)) invalid('La foto principale della copia non corrisponde alla scheda prodotto.');
    const extraSlots = restored.filter(entry => entry.slot !== 0).map(entry => entry.slot).sort();
    if (JSON.stringify(extraSlots) !== JSON.stringify(gallerySlots(record.gallerySlots ?? []))) invalid('Le foto aggiuntive della copia non corrispondono alla scheda prodotto.');
    const input = await productInput({
      ...record, published: false,
      image: main ? `/api/images/${id}` : record.image,
      gallerySlots: extraSlots,
    }, id);
    input.imageDocument = main?.imageDocument || null;
    input.galleryUploads = restored.filter(entry => entry.slot !== 0);
    return await saveProduct(await context(), id, input, true, expectedRevision);
  } catch (error) { throw publicError(error); }
}

async function readImageDocument(collectionName, id, { admin = false, signal } = {}) {
  try {
    checkSignal(signal);
    const { db, sdk } = await abortable(context(), signal);
    // Access to draft images is decided by the rules, never by this client flag.
    const snapshot = await abortable(sdk.getDocFromServer(sdk.doc(db, collectionName, id)), signal);
    if (!snapshot.exists()) missing('Immagine');
    const image = snapshot.data();
    const record = storedImage(image);
    return { blob: new Blob([decodeBase64(record.base64)], { type: record.mime }), data: image };
  } catch (error) { throw publicError(error, !admin); }
}

export async function getCatalogImage(id, options = {}) {
  assertId(id);
  return (await readImageDocument('productImages', id, options)).blob;
}

export async function getCatalogGalleryImage(id, slot, options = {}) {
  assertId(id);
  gallerySlots([slot]);
  const image = await readImageDocument('productGalleryImages', `${id}__${slot}`, options);
  if (image.data.productId !== id || image.data.slot !== slot) invalid('La foto aggiuntiva non corrisponde al prodotto.');
  return { blob: image.blob, alt: text(image.data.alt, 'Descrizione della foto aggiuntiva', 250, true) };
}

// Resolve photos only when the product detail opens. Call release on close to
// keep in-memory object URLs from outliving the visible gallery.
export async function loadProductGallery(product, options = {}) {
  const urls = [];
  const release = () => { for (const url of urls.splice(0)) URL.revokeObjectURL(url); };
  const toURL = blob => { checkSignal(options.signal); const url = URL.createObjectURL(blob); urls.push(url); return url; };
  try {
    assertId(product.id);
    checkSignal(options.signal);
    const images = [];
    if (product.image) {
      const main = product.image === `/api/images/${product.id}` ? toURL(await getCatalogImage(product.id, options)) : asset(product.image);
      images.push({ slot: 0, src: main, alt: text(product.imageAlt || product.name, 'Descrizione della fotografia', 250, true) });
    }
    const settled = await Promise.allSettled(gallerySlots(product.gallerySlots || []).map(async slot => {
      const image = await getCatalogGalleryImage(product.id, slot, options);
      return { slot, src: toURL(image.blob), alt: image.alt };
    }));
    const failed = settled.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    const extras = settled.map(result => result.value);
    checkSignal(options.signal);
    return { images: [...images, ...extras], release };
  } catch (error) { release(); throw error; }
}
