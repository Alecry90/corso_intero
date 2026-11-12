// Pure, deterministic import plan. This module never reads credentials or writes data.
const LIMITS = Object.freeze({ categories: 50, products: 5000 });
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function array(value, name) {
  if (!Array.isArray(value)) fail('invalid-input', `${name}: è richiesta una lista.`);
  return value;
}
function id(value, name = 'ID') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) fail('invalid-id', `${name} non valido.`);
  return value;
}
function slug(value) {
  if (typeof value !== 'string' || value.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) fail('invalid-slug', 'Slug del reparto non valido.');
  return value;
}
function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) fail('invalid-name', 'Nome del reparto non valido.');
  return value;
}
function uniqueRecords(records, label) {
  const result = new Map();
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) fail('invalid-input', `${label}: record non valido.`);
    id(record.id, `ID ${label}`);
    if (result.has(record.id)) fail('duplicate-id', `${label}: ID duplicato ${record.id}.`);
    result.set(record.id, record);
  }
  return result;
}
function count(value, maximum, label) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) fail('invalid-count', `${label}: conteggio non valido.`);
  return value;
}
function marker(value, label) {
  if (value === undefined || value === '') return '';
  return id(value, label);
}
export function planCatalogImport({ manifest, categories, products, inventory, reservations, legacyCategories }) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || manifest.productImport !== false) fail('product-import-forbidden', 'Questo import richiede productImport: false e non importa prodotti.');
  if (has(manifest, 'products') && (!Array.isArray(manifest.products) || manifest.products.length)) fail('product-import-forbidden', 'Il manifesto dei reparti non può contenere prodotti.');
  const targets = uniqueRecords(array(manifest.categories, 'Reparti del manifesto'), 'manifesto');
  if (!targets.size || targets.size > LIMITS.categories) fail('catalog-limit', 'Il manifesto deve contenere da 1 a 50 reparti.');
  const manifestSlugs = new Set();
  for (const record of targets.values()) {
    name(record.name); slug(record.slug);
    count(record.order, 9999, 'Ordine reparto');
    if (manifestSlugs.has(record.slug)) fail('slug-collision', `Il manifesto contiene più reparti con slug ${record.slug}.`);
    manifestSlugs.add(record.slug);
  }
  const existing = uniqueRecords(array(categories, 'Categorie esistenti'), 'categoria');
  const existingProducts = uniqueRecords(array(products, 'Prodotti esistenti'), 'prodotto');
  const baseline = uniqueRecords(array(legacyCategories, 'Categorie seed di riferimento'), 'seed');
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) fail('inventory-missing', 'Inventario mancante: import annullato.');
  count(inventory.categoryCount, LIMITS.categories, 'Inventario categorie');
  count(inventory.productCount, LIMITS.products, 'Inventario prodotti');
  if (existing.size !== inventory.categoryCount || existingProducts.size !== inventory.productCount) fail('inventory-mismatch', 'I conteggi dell’inventario non corrispondono ai documenti esistenti.');
  const productCounts = new Map([...existing.keys()].map(categoryId => [categoryId, 0]));
  const hasRealProducts = new Set();
  for (const record of existingProducts.values()) {
    id(record.categoryId, 'Reparto del prodotto');
    if (!existing.has(record.categoryId)) fail('orphan-product', `Il prodotto ${record.id} non ha un reparto esistente.`);
    productCounts.set(record.categoryId, productCounts.get(record.categoryId) + 1);
    if (record.isDemo !== true) hasRealProducts.add(record.categoryId);
  }
  for (const record of existing.values()) {
    name(record.name); slug(record.slug);
    count(record.productCount, LIMITS.products, 'Contatore reparto');
    if (record.productCount !== productCounts.get(record.id)) fail('category-count-mismatch', `Il conteggio del reparto ${record.id} non corrisponde ai prodotti.`);
  }
  const reservationMap = new Map();
  for (const reservation of array(reservations, 'Prenotazioni slug')) {
    if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation)) fail('invalid-input', 'Prenotazione slug non valida.');
    slug(reservation.id); id(reservation.categoryId, 'Reparto della prenotazione');
    if (reservationMap.has(reservation.id)) fail('duplicate-slug', `Prenotazione duplicata: ${reservation.id}.`);
    reservationMap.set(reservation.id, reservation);
  }
  const creates = [];
  const patches = [];
  const desiredReservations = [];
  const preservedLegacy = [];
  for (const target of targets.values()) {
    if (!existing.has(target.id)) {
      creates.push({ id: target.id, fields: { name: target.name, slug: target.slug, order: target.order, published: true, description: '', image: '', productCount: 0, lastProductId: '' } });
    }
  }
  if (existing.size + creates.length > LIMITS.categories) fail('catalog-limit', 'L’import supererebbe il limite di 50 reparti.');
  const finalCategories = [...existing.values(), ...creates.map(record => ({ id: record.id, ...record.fields }))];
  const slugOwners = new Map();
  for (const record of finalCategories) {
    if (slugOwners.has(record.slug) && slugOwners.get(record.slug) !== record.id) fail('slug-collision', `Lo slug ${record.slug} è già usato da un altro reparto.`);
    slugOwners.set(record.slug, record.id);
    const reservation = reservationMap.get(record.slug);
    if (reservation && reservation.categoryId !== record.id) fail('slug-collision', `La prenotazione ${record.slug} appartiene a un altro reparto.`);
  }
  for (const target of targets.values()) {
    const current = existing.get(target.id) || creates.find(record => record.id === target.id).fields;
    if (!reservationMap.has(current.slug)) desiredReservations.push({ id: current.slug, fields: { categoryId: target.id } });
  }
  for (const reference of baseline.values()) {
    const current = existing.get(reference.id);
    if (!current || targets.has(reference.id)) continue;
    if (current.name !== reference.name || current.slug !== reference.slug || hasRealProducts.has(current.id)) {
      preservedLegacy.push(current.id);
      continue;
    }
    if (current.published !== false) patches.push({ id: current.id, fields: { published: false } });
  }
  const changed = creates.length > 0 || patches.length > 0 || desiredReservations.length > 0;
  return {
    creates, patches, reservations: desiredReservations,
    inventory: {
      categoryCount: finalCategories.length, productCount: existingProducts.size,
      lastCategoryId: creates.length ? creates[creates.length - 1].id : marker(inventory.lastCategoryId, 'Ultimo reparto'),
      lastProductId: marker(inventory.lastProductId, 'Ultimo prodotto'),
    },
    changed,
    counts: { beforeCategories: existing.size, afterCategories: finalCategories.length, products: existingProducts.size },
    preservedLegacy,
  };
}
