import { normalizeVariantAvailability } from './product-variants.js';

// Catalogue-only files. Authentication, customer profiles and service credentials
// deliberately have no representation in this format.
export const CATALOG_BACKUP_LIMITS = Object.freeze({ categories: 50, products: 5000, images: 15000, fileBytes: 128 * 1024 * 1024, imageBytes: 300 * 1024 });
const FORMAT = 'intimo-patrizia-catalog';
const VERSION = 2;
const DEFAULT_PROJECT = 'intimopatrizia-bari';
const categoryKeys = ['id', 'name', 'slug', 'description', 'order', 'published', 'image'];
const productKeys = ['id', 'name', 'categoryId', 'description', 'price', 'sizes', 'colors', 'material', 'image', 'imageAlt', 'available', 'published', 'isDemo', 'order', 'sku', 'brand', 'featured', 'newArrival', 'gallerySlots', 'archived', 'variantAvailability'];
const imageKeys = ['productId', 'slot', 'base64', 'mime', 'bytes', 'width', 'height', 'hash', 'alt'];
const fail = message => { throw new Error(message); };
const codeKey = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('it');
const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));

function plain(value, label, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label}: oggetto non valido.`);
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${label}: campo non consentito. Il file può contenere soltanto dati del catalogo.`);
}
function text(value, label, maximum, minimum = 0) {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || (minimum && !value.trim())) fail(`${label}: testo non valido.`);
  return value;
}
function id(value, label = 'Identificativo') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/u.test(value)) fail(`${label}: identificativo non valido.`);
  return value;
}
function bool(value, fallback, label) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail(`${label}: valore non valido.`);
  return value;
}
function integer(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) fail(`${label}: numero non valido.`);
  return value;
}
function asset(value = '') {
  if (typeof value !== 'string' || (value && !/^\/assets\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:png|jpe?g|webp|avif|svg)$/u.test(value))) fail('Immagine: percorso non valido.');
  return value;
}
function list(value = [], label) {
  if (!Array.isArray(value) || value.length > 20 || new Set(value).size !== value.length) fail(`${label}: elenco non valido.`);
  return value.map(item => {
    text(item, label, 50, 1);
    if (item.includes('|')) fail(`${label}: separatore non valido.`);
    return item;
  });
}
function category(value) {
  plain(value, 'Reparto', categoryKeys);
  const slug = text(value.slug, 'Identificativo reparto', 100, 1);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) fail('Identificativo reparto non valido.');
  return { id: id(value.id), name: text(value.name, 'Nome reparto', 100, 1), slug,
    description: text(value.description ?? '', 'Descrizione reparto', 1500), order: integer(value.order ?? 0, 0, 9999, 'Ordine'),
    published: bool(value.published, false, 'Pubblicazione reparto'), image: asset(value.image) };
}
function product(value) {
  plain(value, 'Prodotto', productKeys);
  const productId = id(value.id);
  const image = value.image === `/api/images/${productId}` ? value.image : asset(value.image);
  const price = value.price ?? null;
  if (price !== null && (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 100000 || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001)) fail('Prezzo prodotto non valido.');
  const slots = value.gallerySlots ?? [];
  if (!Array.isArray(slots) || slots.length > 2 || new Set(slots).size !== slots.length || slots.some(slot => ![1, 2].includes(slot))) fail('Posizioni delle foto aggiuntive non valide.');
  const archived = bool(value.archived, false, 'Cestino');
  const published = bool(value.published, false, 'Pubblicazione prodotto');
  if (archived && published) fail('Un prodotto nel cestino non può essere pubblicato.');
  const sizes = list(value.sizes, 'Taglie'), colors = list(value.colors, 'Colori');
  const variantAvailability = normalizeVariantAvailability(value.variantAvailability, { sizes, colors }) ?? {};
  return { id: productId, name: text(value.name, 'Nome prodotto', 160, 1), categoryId: id(value.categoryId, 'Reparto prodotto'),
    description: text(value.description ?? '', 'Descrizione prodotto', 3000), price, sizes, colors, variantAvailability,
    material: text(value.material ?? '', 'Tessuto', 200), image, imageAlt: text(value.imageAlt ?? '', 'Descrizione foto', 250, image ? 1 : 0),
    available: bool(value.available, true, 'Disponibilità'), published, isDemo: bool(value.isDemo, false, 'Esempio'),
    order: integer(value.order ?? 0, 0, 9999, 'Ordine'), sku: text(value.sku ?? '', 'Codice articolo', 80), brand: text(value.brand ?? '', 'Marca', 80),
    featured: bool(value.featured, false, 'In evidenza'), newArrival: bool(value.newArrival, false, 'Novità'), gallerySlots: [...slots].sort(), archived };
}
function decodeImage(value) {
  if (typeof value !== 'string' || !value.length || value.length > CATALOG_BACKUP_LIMITS.imageBytes * 4 / 3 || value.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) fail('Contenuto della foto non valido.');
  let raw;
  try { raw = atob(value); } catch { fail('Contenuto della foto non leggibile.'); }
  if (btoa(raw) !== value || !raw.length || raw.length > CATALOG_BACKUP_LIMITS.imageBytes) fail('Contenuto della foto non valido.');
  const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
  if (raw.slice(0, 4) !== 'RIFF' || raw.slice(8, 12) !== 'WEBP') fail('La foto non contiene un file WebP.');
  return bytes;
}
function image(value) {
  plain(value, 'Fotografia', imageKeys);
  const slot = integer(value.slot, 0, 2, 'Posizione foto');
  const bytes = decodeImage(value.base64);
  if (value.mime !== 'image/webp' || value.bytes !== bytes.length || !/^[a-f0-9]{64}$/u.test(value.hash || '')) fail('Metadati della fotografia non validi.');
  if (slot === 0 && value.alt !== undefined) fail('La descrizione della foto principale appartiene alla scheda prodotto.');
  return { productId: id(value.productId), slot, base64: value.base64, mime: 'image/webp', bytes: bytes.length,
    width: integer(value.width, 16, 4096, 'Larghezza foto'), height: integer(value.height, 16, 4096, 'Altezza foto'), hash: value.hash,
    ...(slot ? { alt: text(value.alt, 'Descrizione foto aggiuntiva', 250, 1) } : {}) };
}
function boundedArray(value, maximum, label) {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label}: quantità non valida o limite superato.`);
  return value;
}
function unique(values, getKey, label) {
  const keys = values.map(getKey);
  if (new Set(keys).size !== keys.length) fail(`${label}: identificativo duplicato.`);
}
function fileSize(source) {
  if (source.length > CATALOG_BACKUP_LIMITS.fileBytes || new TextEncoder().encode(source).byteLength > CATALOG_BACKUP_LIMITS.fileBytes) fail('La copia supera il limite di 128 MiB per file.');
}

export function parseCatalogBackup(input, { projectId = DEFAULT_PROJECT } = {}) {
  let value = input;
  if (typeof input === 'string') {
    fileSize(input);
    try { value = JSON.parse(input); } catch { fail('Il file non contiene una copia JSON leggibile.'); }
  }
  plain(value, 'Copia del catalogo', ['format', 'version', 'projectId', 'createdAt', 'categories', 'products', 'images']);
  if (value.format !== FORMAT || ![1, VERSION].includes(value.version)) fail('Formato o versione della copia non supportati.');
  if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{5,29}$/u.test(projectId) || value.projectId !== projectId) fail('Questa copia appartiene a un progetto diverso.');
  if (typeof value.createdAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt))) fail('Data della copia non valida.');
  const categories = boundedArray(value.categories, CATALOG_BACKUP_LIMITS.categories, 'Reparti').map(category);
  const products = boundedArray(value.products, CATALOG_BACKUP_LIMITS.products, 'Prodotti').map(product);
  const images = boundedArray(value.images, CATALOG_BACKUP_LIMITS.images, 'Fotografie').map(image);
  unique(categories, record => record.id, 'Reparti'); unique(categories, record => record.slug, 'Identificativi reparti');
  unique(products, record => record.id, 'Prodotti'); unique(images, record => `${record.productId}:${record.slot}`, 'Fotografie');
  const categoryIds = new Set(categories.map(record => record.id));
  const byProduct = new Map(products.map(record => [record.id, record]));
  const byImage = new Set(images.map(record => `${record.productId}:${record.slot}`));
  for (const record of products) {
    if (!categoryIds.has(record.categoryId)) fail(`Il reparto del prodotto ${record.id} manca nella copia.`);
    if (record.image === `/api/images/${record.id}` && !byImage.has(`${record.id}:0`)) fail(`La foto principale di ${record.id} manca nella copia.`);
    if (record.gallerySlots.some(slot => !byImage.has(`${record.id}:${slot}`))) fail(`Una foto aggiuntiva di ${record.id} manca nella copia.`);
  }
  for (const record of images) {
    const owner = byProduct.get(record.productId);
    if (!owner || (record.slot === 0 ? owner.image !== `/api/images/${owner.id}` : !owner.gallerySlots.includes(record.slot))) fail('La copia contiene una fotografia senza prodotto o senza collegamento.');
  }
  const result = { format: FORMAT, version: VERSION, projectId, createdAt: value.createdAt, categories, products, images };
  if (typeof input !== 'string') fileSize(JSON.stringify(result));
  return result;
}

export function createCatalogBackup({ projectId = DEFAULT_PROJECT, categories = [], products = [], images = [], createdAt = new Date().toISOString() } = {}) {
  // SDK timestamps, technical counters and future customer fields are not copied.
  const select = (records, keys, label) => boundedArray(records, CATALOG_BACKUP_LIMITS[label], label).map(record => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) fail(`${label}: record non valido.`);
    return pick(record, keys);
  });
  return parseCatalogBackup({ format: FORMAT, version: VERSION, projectId, createdAt,
    categories: select(categories, categoryKeys, 'categories'), products: select(products, productKeys, 'products'), images: select(images, imageKeys, 'images') }, { projectId });
}

// Call before executing a restore. Parsing checks structure and byte counts;
// this separate asynchronous check verifies every stored photo digest.
export async function verifyCatalogBackupImages(backup) {
  const parsed = parseCatalogBackup(backup, { projectId: backup?.projectId });
  if (!globalThis.crypto?.subtle) fail('Il browser non può verificare l’integrità delle fotografie.');
  for (const record of parsed.images) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', decodeImage(record.base64)));
    const hash = [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== record.hash) fail(`La fotografia ${record.productId}, posizione ${record.slot}, è danneggiata o modificata.`);
  }
  return parsed;
}

export function planCatalogRestore(input, { categories = [], products = [], projectId = DEFAULT_PROJECT } = {}) {
  const backup = parseCatalogBackup(input, { projectId });
  const currentCategories = boundedArray(categories, CATALOG_BACKUP_LIMITS.categories, 'Reparti esistenti').map(record => category(pick(record, categoryKeys)));
  const currentProducts = boundedArray(products, CATALOG_BACKUP_LIMITS.products, 'Prodotti esistenti').map(record => product(pick(record, productKeys)));
  unique(currentCategories, record => record.id, 'Reparti esistenti'); unique(currentCategories, record => record.slug, 'Identificativi reparti esistenti');
  unique(currentProducts, record => record.id, 'Prodotti esistenti');
  const categoryById = new Map(currentCategories.map(record => [record.id, record]));
  const categoryBySlug = new Map(currentCategories.map(record => [record.slug, record]));
  const productById = new Map(currentProducts.map(record => [record.id, record]));
  const codes = new Map(currentProducts.filter(record => codeKey(record.sku)).map(record => [codeKey(record.sku), record.id]));
  const categoriesToCreate = []; const productsToCreate = []; const skippedCategoryIds = []; const skippedProductIds = []; const warnings = [];
  for (const record of backup.categories) {
    const existing = categoryById.get(record.id);
    if (existing) {
      if (existing.slug !== record.slug) fail(`Il reparto ${record.id} esiste con un identificativo diverso. Il ripristino non modifica i reparti esistenti.`);
      skippedCategoryIds.push(record.id); continue;
    }
    if (categoryBySlug.has(record.slug)) fail(`L’identificativo ${record.slug} appartiene già a un altro reparto.`);
    categoriesToCreate.push({ ...record, published: false });
  }
  for (const record of backup.products) {
    if (productById.has(record.id)) {
      skippedProductIds.push(record.id);
      if (productById.get(record.id).categoryId !== record.categoryId) warnings.push(`Il prodotto ${record.id} appartiene ora a un altro reparto e non verrà modificato.`);
      continue;
    }
    const code = codeKey(record.sku);
    if (code && codes.has(code)) fail(`Il codice articolo ${record.sku} è già usato dal prodotto ${codes.get(code)}. Nessun prodotto esistente viene sovrascritto.`);
    if (code) codes.set(code, record.id);
    productsToCreate.push({ ...record, sizes: [...record.sizes], colors: [...record.colors], gallerySlots: [...record.gallerySlots], published: false, archived: false });
  }
  if (currentCategories.length + categoriesToCreate.length > CATALOG_BACKUP_LIMITS.categories || currentProducts.length + productsToCreate.length > CATALOG_BACKUP_LIMITS.products) fail('Il ripristino supererebbe i limiti del catalogo.');
  const newIds = new Set(productsToCreate.map(record => record.id));
  const imagesToCreate = backup.images.filter(record => newIds.has(record.productId)).map(record => ({ ...record }));
  return { categoriesToCreate, productsToCreate, imagesToCreate, skippedCategoryIds, skippedProductIds, warnings,
    counts: { categoriesToCreate: categoriesToCreate.length, productsToCreate: productsToCreate.length, imagesToCreate: imagesToCreate.length, skippedCategories: skippedCategoryIds.length, skippedProducts: skippedProductIds.length } };
}
