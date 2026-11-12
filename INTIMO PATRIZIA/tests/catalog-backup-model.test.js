import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CATALOG_BACKUP_LIMITS, createCatalogBackup, parseCatalogBackup, planCatalogRestore, verifyCatalogBackupImages } from '../src/catalog-backup-model.js';

const projectId = 'intimopatrizia-bari';
const createdAt = '2026-10-23T12:00:00.000Z';
const category = (overrides = {}) => ({ id: 'intimo', name: 'Intimo', slug: 'intimo', description: '', image: '', order: 0, published: true, ...overrides });
const product = (overrides = {}) => ({ id: 'p1', name: 'Maglia', categoryId: 'intimo', sku: 'ART-1', price: 19.9, sizes: ['M'], colors: ['Blu'], published: true, image: '', ...overrides });
const photo = (slot = 0, overrides = {}) => {
  // A bounded RIFF/WebP container is enough for structural checks. Pixel decoding
  // remains the production image importer's responsibility.
  const bytes = Buffer.from('RIFF\u0004\u0000\u0000\u0000WEBP', 'binary');
  return { productId: 'p1', slot, base64: bytes.toString('base64'), mime: 'image/webp', bytes: bytes.length, width: 32, height: 40,
    hash: createHash('sha256').update(bytes).digest('hex'), ...(slot ? { alt: `Dettaglio ${slot}` } : {}), ...overrides };
};
const backup = (overrides = {}) => createCatalogBackup({ projectId, createdAt, categories: [category()], products: [product()], images: [], ...overrides });

test('a versioned backup roundtrips IDs, fields and three photos without SDK or private account metadata', async () => {
  const source = product({ image: '/api/images/p1', imageAlt: 'Maglia blu', gallerySlots: [1, 2], brand: 'Marca', featured: true,
    updatedAt: { seconds: 123 }, imageVersion: '123:0', customerEmail: 'never-copy@example.test', archived: false });
  const value = backup({ categories: [category({ productCount: 4, lastProductId: 'p1', updatedAt: 123 })], products: [source], images: [photo(), photo(1), photo(2)] });
  assert.equal(value.format, 'intimo-patrizia-catalog'); assert.equal(value.version, 2);
  assert.equal(value.products[0].sku, 'ART-1'); assert.deepEqual(value.products[0].gallerySlots, [1, 2]);
  assert.equal(value.images[1].alt, 'Dettaglio 1'); assert.equal(value.images[2].alt, 'Dettaglio 2');
  for (const field of ['updatedAt', 'imageVersion', 'customerEmail']) assert.equal(Object.hasOwn(value.products[0], field), false);
  assert.equal(Object.hasOwn(value.categories[0], 'productCount'), false);
  assert.deepEqual(parseCatalogBackup(JSON.stringify(value)), value);
  assert.deepEqual(await verifyCatalogBackupImages(value), value);
});

test('parser rejects unknown collections, credential-shaped fields, unsupported versions and another project', () => {
  const value = backup();
  for (const extra of [{ users: [] }, { customerProfiles: [] }, { auth: {} }, { password: 'never' }]) assert.throws(() => parseCatalogBackup({ ...value, ...extra }), /campo non consentito/u);
  assert.throws(() => parseCatalogBackup({ ...value, version: 99 }), /versione/u);
  assert.throws(() => parseCatalogBackup({ ...value, projectId: 'unrelated-project' }), /progetto diverso/u);
  assert.throws(() => parseCatalogBackup({ ...value, products: [{ ...value.products[0], email: 'private@example.test' }] }), /campo non consentito/u);
  assert.throws(() => parseCatalogBackup('{broken'), /JSON/u);
  assert.throws(() => parseCatalogBackup(JSON.parse(JSON.stringify(value).replace('"format":', '"__proto__":{},"format":'))), /campo non consentito/u);
});

test('version two preserves availability through export, JSON and restore; version one remains importable', () => {
  const variantAvailability = { 'M|Blu': true, 'L|Blu': false };
  const value = backup({ products: [product({ sizes: ['M', 'L'], variantAvailability })] });
  assert.deepEqual(parseCatalogBackup(JSON.stringify(value)).products[0].variantAvailability, variantAvailability);
  const plan = planCatalogRestore(value);
  assert.deepEqual(plan.productsToCreate[0].variantAvailability, variantAvailability);
  assert.equal(plan.productsToCreate[0].published, false);
  const old = backup(); old.version = 1; delete old.products[0].variantAvailability;
  const normalized = parseCatalogBackup(JSON.stringify(old));
  assert.equal(normalized.version, 2);
  assert.deepEqual(normalized.products[0].variantAvailability, {});
  for (const invalid of [{ 'XL|Blu': true }, { 'M|Blu': 'true' }, [], null]) {
    assert.throws(() => backup({ products: [product({ variantAvailability: invalid })] }), /Disponibilità per variante/u);
  }
});

test('referential integrity forbids duplicate IDs/slugs, missing categories, missing photos and orphan gallery files', () => {
  const value = backup();
  assert.throws(() => parseCatalogBackup({ ...value, products: [value.products[0], value.products[0]] }), /duplicato/u);
  assert.throws(() => backup({ categories: [category(), category({ id: 'second' })] }), /duplicato/u);
  assert.throws(() => backup({ products: [product({ categoryId: 'missing' })] }), /reparto.*manca/u);
  assert.throws(() => backup({ products: [product({ image: '/api/images/p1', imageAlt: 'Maglia' })] }), /foto principale.*manca/u);
  assert.throws(() => backup({ products: [product({ gallerySlots: [2] })] }), /foto aggiuntiva.*manca/u);
  assert.throws(() => backup({ images: [photo(1)] }), /senza prodotto o senza collegamento/u);
  assert.throws(() => backup({ products: [product({ image: 'https://external.example/photo.webp' })] }), /percorso/u);
  assert.throws(() => backup({ products: [product({ image: '/api/images/another', imageAlt: 'X' })] }), /percorso/u);
});

test('image validation rejects noncanonical base64, misleading byte counts, MIME, paths and missing alt text', async () => {
  const pictures = overrides => backup({ products: [product({ image: '/api/images/p1', imageAlt: 'Maglia' })], images: [photo(0, overrides)] });
  for (const overrides of [{ base64: 'notbase64' }, { bytes: 1 }, { mime: 'image/svg+xml' }, { hash: 'z'.repeat(64) }, { width: 5000 }, { base64: Buffer.from('<script>x</script>').toString('base64'), bytes: 18 }]) assert.throws(() => pictures(overrides));
  assert.throws(() => backup({ products: [product({ gallerySlots: [1] })], images: [photo(1, { alt: '' })] }), /Descrizione/u);
  assert.throws(() => pictures({ alt: 'wrong field' }), /foto principale/u);
  await assert.rejects(verifyCatalogBackupImages(pictures({ hash: '0'.repeat(64) })), /danneggiata o modificata/u);
});

test('restore adds missing records only, keeps stable photo references and always creates drafts outside the trash', () => {
  const value = backup({ products: [product({ image: '/api/images/p1', imageAlt: 'Maglia', gallerySlots: [1, 2], archived: true, published: false })], images: [photo(), photo(1), photo(2)] });
  const empty = planCatalogRestore(value);
  assert.deepEqual(empty.counts, { categoriesToCreate: 1, productsToCreate: 1, imagesToCreate: 3, skippedCategories: 0, skippedProducts: 0 });
  assert.equal(empty.categoriesToCreate[0].published, false);
  assert.equal(empty.productsToCreate[0].published, false); assert.equal(empty.productsToCreate[0].archived, false);
  assert.equal(empty.productsToCreate[0].id, 'p1'); assert.equal(empty.productsToCreate[0].image, '/api/images/p1');
  assert.deepEqual(empty.imagesToCreate.map(record => [record.productId, record.slot]), [['p1', 0], ['p1', 1], ['p1', 2]]);
  const current = { categories: [category({ name: 'Nome modificato' })], products: [product({ name: 'Articolo aggiornato', categoryId: 'different' })] };
  const snapshot = JSON.stringify(current);
  const existing = planCatalogRestore(value, current);
  assert.deepEqual(existing.categoriesToCreate, []); assert.deepEqual(existing.productsToCreate, []); assert.deepEqual(existing.imagesToCreate, []);
  assert.deepEqual(existing.skippedProductIds, ['p1']); assert.equal(existing.warnings.length, 1);
  assert.equal(JSON.stringify(current), snapshot, 'The current catalogue must never be mutated.');
});

test('restore rejects category reservations, current SKU collisions and missing-record SKU collisions before writes', () => {
  const value = backup();
  assert.throws(() => planCatalogRestore(value, { categories: [category({ slug: 'changed' })] }), /identificativo diverso/u);
  assert.throws(() => planCatalogRestore(value, { categories: [category({ id: 'different' })] }), /altro reparto/u);
  assert.throws(() => planCatalogRestore(value, { categories: [category()], products: [product({ id: 'other', sku: '  art-1  ' })] }), /già usato/u);
  const repeatedLegacy = backup({ products: [product(), product({ id: 'p2', sku: 'ART-1' })] });
  assert.throws(() => planCatalogRestore(repeatedLegacy), /già usato/u);
  assert.equal(planCatalogRestore(repeatedLegacy, { categories: [category()], products: [product(), product({ id: 'p2' })] }).counts.skippedProducts, 2);
});

test('bounded format rejects excess categories/products, invalid lists, prices and states', () => {
  assert.equal(CATALOG_BACKUP_LIMITS.fileBytes, 128 * 1024 * 1024);
  assert.throws(() => backup({ categories: Array.from({ length: 51 }, (_, index) => category({ id: `c${index}`, slug: `c${index}` })) }), /limite/u);
  assert.throws(() => backup({ products: Array.from({ length: 5001 }, (_, index) => product({ id: `p${index}` })) }), /limite/u);
  for (const extra of [{ price: -1 }, { price: 1.001 }, { sizes: Array(21).fill('M') }, { colors: ['Blu', 'Blu'] }, { archived: true, published: true }, { gallerySlots: [1, 1] }]) assert.throws(() => backup({ products: [product(extra)] }));
});

test('restore counts existing catalogue records before adding missing categories or products', () => {
  const value = backup();
  const fullCategories = Array.from({ length: 50 }, (_, index) => category({ id: `c${index}`, slug: `c${index}` }));
  assert.throws(() => planCatalogRestore(value, { categories: fullCategories }), /limiti del catalogo/u);
  const fullProducts = Array.from({ length: 5000 }, (_, index) => product({ id: `current${index}`, sku: `CURRENT-${index}` }));
  assert.throws(() => planCatalogRestore(value, { categories: [category()], products: fullProducts }), /limiti del catalogo/u);
});
