import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import * as sdk from 'firebase/firestore';

// Production transactions and validation, with only the browser bootstrap replaced.
const sourceURL = new URL('../src/firestore-catalog.js', import.meta.url);
const source = (await readFile(sourceURL, 'utf8'))
  .replace("import { initializeFirebaseApp } from './firebase-auth.js';", 'const initializeFirebaseApp = async () => null;')
  .replace("'./catalog-pager.js'", JSON.stringify(new URL('../src/catalog-pager.js', import.meta.url).href))
  .replace("'./product-variants.js'", JSON.stringify(new URL("../src/product-variants.js", import.meta.url).href));
const adapter = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {deleteProduct}; export function useTestContext(ctx){contextPromise=Promise.resolve(ctx)}').toString('base64')}`);
const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (host && !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host)) throw new Error('Trash tests require a loopback Firestore emulator.');
const projectId = 'demo-intimo-catalog-trash';
const endpoint = host ? `http://${host}` : '';
const apps = [], dbs = [];
function context(label, token) {
  const app = initializeApp({ projectId, apiKey: 'demo-only', appId: 'demo-only' }, `trash-${label}-${randomUUID()}`);
  const db = sdk.getFirestore(app);
  const [hostname, port] = host.split(':');
  sdk.connectFirestoreEmulator(db, hostname, Number(port), token ? { mockUserToken: token } : {});
  apps.push(app); dbs.push(db); return { db, sdk };
}
const ref = (ctx, path) => sdk.doc(ctx.db, path);
const get = async (ctx, path) => (await sdk.getDocFromServer(ref(ctx, path))).data();
const denied = promise => assert.rejects(promise, error => error.code === 'permission-denied');
const photo = () => ({ base64: 'UklGRg==', mime: 'image/webp', bytes: 4, width: 32, height: 40, hash: 'a'.repeat(64), updatedAt: sdk.serverTimestamp() });
const product = () => ({ name: 'Pigiama', categoryId: 'a', description: '', price: 20, sizes: ['M'], colors: ['Blu'], material: 'Cotone', image: '/api/images/p', imageAlt: 'Vista frontale', available: true, published: true, isDemo: false, order: 0, gallerySlots: [1, 2], sku: 'P-1', updatedAt: sdk.serverTimestamp() });

test('recoverable trash uses actual transactions and rules on a local emulator only', { timeout: 180000, skip: !host ? 'Set FIRESTORE_EMULATOR_HOST for the explicit local rules checks.' : false }, async t => {
  sdk.setLogLevel('silent');
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  const deployed = await fetch(`${endpoint}/emulator/v1/projects/${projectId}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ignore_errors: false, rules: { files: [{ name: 'firestore.rules', content: rules }] } }) });
  assert.equal(deployed.ok, true, JSON.stringify(await deployed.json()));
  const seed = context('seed', 'owner');
  const owner = context('owner', { sub: 'owner', email: 'alessandroferrara01@libero.it', email_verified: true });
  const anonymous = context('anonymous');
  const visitor = context('visitor', { sub: 'visitor', email: 'other@example.test', email_verified: true });
  const unverified = context('unverified', { sub: 'owner', email: 'alessandroferrara01@libero.it', email_verified: false });
  t.after(async () => { await Promise.all(dbs.map(db => sdk.terminate(db))); await Promise.all(apps.map(app => deleteApp(app))); });
  t.beforeEach(async () => {
    const clear = await fetch(`${endpoint}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    assert.equal(clear.ok, true);
    const batch = sdk.writeBatch(seed.db);
    batch.set(ref(seed, 'categories/a'), { name: 'Reparto', slug: 'a', description: '', order: 0, published: true, image: '', productCount: 1, lastProductId: 'p', updatedAt: sdk.serverTimestamp() });
    batch.set(ref(seed, 'categorySlugs/a'), { categoryId: 'a' });
    batch.set(ref(seed, 'products/p'), product()); // Legacy record has no archive fields.
    batch.set(ref(seed, 'productImages/p'), photo());
    for (const slot of [1, 2]) batch.set(ref(seed, `productGalleryImages/p__${slot}`), { ...photo(), productId: 'p', slot, alt: `Dettaglio ${slot}` });
    batch.set(ref(seed, 'catalogMeta/inventory'), { categoryCount: 1, productCount: 1, lastCategoryId: 'a', lastProductId: 'p', updatedAt: sdk.serverTimestamp() });
    batch.set(ref(seed, 'catalogMeta/revision'), { version: randomUUID() });
    await batch.commit();
    adapter.useTestContext(owner);
  });

  await t.test('archive hides legacy product and all photographs without changing inventory or photos', async () => {
    const before = await get(owner, 'products/p');
    const category = await get(owner, 'categories/a');
    const inventory = await get(owner, 'catalogMeta/inventory');
    const revision = await get(owner, 'catalogMeta/revision');
    const photos = await Promise.all(['productImages/p', 'productGalleryImages/p__1', 'productGalleryImages/p__2'].map(path => get(owner, path)));
    assert.equal((await get(anonymous, 'products/p')).published, true);
    assert.ok(await get(anonymous, 'productImages/p'));
    const result = await adapter.catalogRequest('products/p/archive', 'POST');
    assert.equal(result.product.id, 'p'); assert.equal(result.product.archived, true); assert.equal(result.product.published, false);
    assert.match(result.product.archivedAt, /^\d{4}-\d{2}-\d{2}T/u);
    const saved = await get(owner, 'products/p');
    // An old client cannot remove archive metadata and republish the article.
    for (const explicitFlag of [true, false]) {
      const next = { ...saved, published: true, updatedAt: sdk.serverTimestamp() };
      if (explicitFlag) { next.archived = false; next.archivedAt = null; }
      else { delete next.archived; delete next.archivedAt; }
      const oldClient = sdk.writeBatch(owner.db);
      oldClient.set(ref(owner, 'products/p'), next);
      oldClient.set(ref(owner, 'catalogMeta/inventory'), { ...inventory, updatedAt: sdk.serverTimestamp() });
      oldClient.set(ref(owner, 'catalogMeta/revision'), { version: randomUUID() });
      await denied(oldClient.commit());
    }
    for (const key of Object.keys(before).filter(key => !['published', 'updatedAt'].includes(key))) assert.deepEqual(saved[key], before[key]);
    assert.deepEqual(await get(owner, 'categories/a'), category);
    const nextInventory = await get(owner, 'catalogMeta/inventory');
    for (const key of ['categoryCount', 'productCount', 'lastCategoryId', 'lastProductId']) assert.equal(nextInventory[key], inventory[key]);
    assert.notEqual((await get(owner, 'catalogMeta/revision')).version, revision.version);
    for (const [index, path] of ['productImages/p', 'productGalleryImages/p__1', 'productGalleryImages/p__2'].entries()) {
      assert.deepEqual(await get(owner, path), photos[index]);
      for (const ctx of [anonymous, visitor, unverified]) await denied(sdk.getDocFromServer(ref(ctx, path)));
    }
    await denied(sdk.getDocFromServer(ref(anonymous, 'products/p')));
    adapter.useTestContext(anonymous);
    const catalog = await adapter.loadPublicCatalogPage();
    assert.deepEqual(catalog.products, []);
    adapter.useTestContext(owner);
    const manager = await adapter.loadManagerCatalogPage();
    assert.equal(manager.products[0].archived, true);
  });

  await t.test('restore keeps same identity and photos, always returns a draft, and retries are no-ops', async () => {
    await adapter.catalogRequest('products/p/archive', 'POST', {});
    const archived = await get(owner, 'products/p');
    const revision = await get(owner, 'catalogMeta/revision');
    await adapter.catalogRequest('products/p/archive', 'POST');
    assert.deepEqual(await get(owner, 'products/p'), archived);
    assert.deepEqual(await get(owner, 'catalogMeta/revision'), revision);
    const result = await adapter.catalogRequest('products/p/restore', 'POST');
    assert.equal(result.product.id, 'p'); assert.equal(result.product.archived, false); assert.equal(result.product.archivedAt, null); assert.equal(result.product.published, false);
    assert.equal((await get(owner, 'catalogMeta/inventory')).productCount, 1);
    assert.equal((await get(owner, 'categories/a')).productCount, 1);
    assert.ok(await get(owner, 'productImages/p'));
    await denied(sdk.getDocFromServer(ref(anonymous, 'products/p')));
    const restored = await get(owner, 'products/p');
    await adapter.catalogRequest('products/p/restore', 'POST');
    assert.deepEqual(await get(owner, 'products/p'), restored);
    await adapter.catalogRequest('products/p', 'PUT', { name: 'Pigiama ripristinato', categoryId: 'a', imageAlt: 'Vista frontale', published: true });
    assert.equal((await get(anonymous, 'products/p')).name, 'Pigiama ripristinato');
  });

  await t.test('anonymous, unverified owner and other accounts cannot archive, restore or enumerate trash', async () => {
    for (const ctx of [anonymous, visitor, unverified]) {
      adapter.useTestContext(ctx);
      await assert.rejects(adapter.catalogRequest('products/p/archive', 'POST'), error => error.status === 403);
      await denied(sdk.getDocsFromServer(sdk.query(sdk.collection(ctx.db, 'products'), sdk.where('archived', '==', true), sdk.limit(10))));
    }
    adapter.useTestContext(owner);
    await adapter.catalogRequest('products/p/archive', 'POST');
    const before = await get(owner, 'products/p');
    for (const ctx of [anonymous, visitor, unverified]) {
      adapter.useTestContext(ctx);
      await assert.rejects(adapter.catalogRequest('products/p/restore', 'POST'), error => error.status === 403);
    }
    assert.deepEqual(await get(owner, 'products/p'), before);
  });

  await t.test('rules reject malformed or public archive records and direct creation as archived', async () => {
    const inventory = await get(owner, 'catalogMeta/inventory');
    for (const invalid of [{ archived: true, archivedAt: sdk.serverTimestamp(), published: true }, { archived: 'yes', published: false }, { archived: true, published: false }, { archived: false, archivedAt: sdk.serverTimestamp() }]) {
      const batch = sdk.writeBatch(owner.db);
      batch.update(ref(owner, 'products/p'), { ...invalid, updatedAt: sdk.serverTimestamp() });
      batch.set(ref(owner, 'catalogMeta/inventory'), { ...inventory, updatedAt: sdk.serverTimestamp() });
      batch.set(ref(owner, 'catalogMeta/revision'), { version: randomUUID() });
      await denied(batch.commit());
    }
    const batch = sdk.writeBatch(owner.db);
    batch.set(ref(owner, 'products/new'), { ...product(), image: '', imageAlt: '', gallerySlots: [], archived: true, archivedAt: sdk.serverTimestamp(), published: false });
    batch.update(ref(owner, 'categories/a'), { productCount: 2, lastProductId: 'new', updatedAt: sdk.serverTimestamp() });
    batch.set(ref(owner, 'catalogMeta/inventory'), { ...inventory, productCount: 2, lastProductId: 'new', updatedAt: sdk.serverTimestamp() });
    batch.set(ref(owner, 'catalogMeta/revision'), { version: randomUUID() });
    await denied(batch.commit());
    assert.equal((await get(owner, 'products/p')).published, true);
    assert.equal((await get(owner, 'catalogMeta/inventory')).productCount, 1);
  });

  await t.test('legacy DELETE archives safely and even a complete old-client deletion batch is forbidden', async () => {
    await assert.rejects(adapter.catalogRequest('products/p/archive', 'POST', { published: true }), { code: 'invalid-input' });
    const archived = await adapter.catalogRequest('products/p', 'DELETE');
    assert.equal(archived.product.archived, true); assert.equal(archived.product.published, false);
    await assert.rejects(adapter.catalogRequest('products/p', 'PUT', { name: 'Edizione', categoryId: 'a', imageAlt: 'Fronte' }), { code: 'product-archived' });
    await assert.rejects(adapter.catalogRequest('products/p/duplicate', 'POST'), { code: 'product-archived' });
    await assert.rejects(adapter.catalogRequest('products/p', 'PUT', { name: 'Edizione', categoryId: 'a', archived: false }), { code: 'invalid-input' });
    await assert.rejects(adapter.catalogRequest('categories/a', 'DELETE'), { code: 'category-not-empty' });
    const batch = sdk.writeBatch(owner.db);
    batch.delete(ref(owner, 'products/p')); batch.delete(ref(owner, 'productImages/p'));
    for (const slot of [1, 2]) batch.delete(ref(owner, `productGalleryImages/p__${slot}`));
    batch.update(ref(owner, 'categories/a'), { productCount: 0, lastProductId: 'p', updatedAt: sdk.serverTimestamp() });
    batch.set(ref(owner, 'catalogMeta/inventory'), { categoryCount: 1, productCount: 0, lastCategoryId: 'a', lastProductId: 'p', updatedAt: sdk.serverTimestamp() });
    batch.set(ref(owner, 'catalogMeta/revision'), { version: randomUUID() });
    await denied(batch.commit());
    await denied(sdk.deleteDoc(ref(owner, 'products/p')));
    assert.equal((await get(owner, 'products/p')).archived, true);
    assert.equal((await get(owner, 'catalogMeta/inventory')).productCount, 1);
    for (const path of ['productImages/p', 'productGalleryImages/p__1', 'productGalleryImages/p__2']) assert.ok(await get(owner, path));
    // Only the disposable emulator administrator simulates actual data loss.
    await adapter.deleteProduct(seed, 'p');
    assert.equal(await get(owner, 'products/p'), undefined);
    for (const path of ['productImages/p', 'productGalleryImages/p__1', 'productGalleryImages/p__2']) assert.equal(await get(owner, path), undefined);
    assert.equal((await get(owner, 'catalogMeta/inventory')).productCount, 0);
    assert.equal((await get(owner, 'categories/a')).productCount, 0);
  });

  await t.test('backup creates missing records under original IDs as drafts with atomic owned photos, never overwriting', async () => {
    const category = { name: 'Reparto recuperato', slug: 'reparto-recuperato', description: '', order: 2, published: true, image: '' };
    const restoredCategory = await adapter.restoreCatalogBackupRecord({ kind: 'category', id: 'original-category', record: category });
    assert.equal(restoredCategory.category.id, 'original-category');
    assert.equal((await get(owner, 'categories/original-category')).published, false);
    await assert.rejects(adapter.restoreCatalogBackupRecord({ kind: 'category', id: 'original-category', record: { ...category, name: 'Non sovrascrivere' } }), { code: 'already-exists' });
    assert.equal((await get(owner, 'categories/original-category')).name, 'Reparto recuperato');
    const { updatedAt, ...record } = product();
    record.categoryId = 'original-category'; record.image = '/api/images/original-product';
    const { updatedAt: ignored, ...rawPhoto } = photo();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(Buffer.from(rawPhoto.base64, 'base64'))));
    rawPhoto.hash = [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
    const images = [0, 1, 2].map(slot => ({ ...rawPhoto, productId: 'original-product', slot, alt: slot ? `Dettaglio ${slot}` : 'Fronte' }));
    const restored = await adapter.restoreCatalogBackupRecord({ kind: 'product', id: 'original-product', record, images });
    assert.equal(restored.product.id, 'original-product'); assert.equal(restored.product.published, false);
    const saved = await get(owner, 'products/original-product');
    assert.equal(saved.archived ?? false, false); assert.deepEqual(saved.gallerySlots, [1, 2]);
    assert.equal((await get(owner, 'productImages/original-product')).hash, rawPhoto.hash);
    for (const slot of [1, 2]) {
      const extra = await get(owner, `productGalleryImages/original-product__${slot}`);
      assert.equal(extra.productId, 'original-product'); assert.equal(extra.slot, slot); assert.equal(extra.alt, `Dettaglio ${slot}`);
    }
    assert.equal((await get(owner, 'categories/original-category')).productCount, 1);
    assert.equal((await get(owner, 'catalogMeta/inventory')).productCount, 2);
    assert.equal((await get(owner, 'catalogMeta/inventory')).categoryCount, 2);
    const before = await get(owner, 'products/original-product');
    const metadata = await get(owner, 'catalogMeta/inventory');
    await assert.rejects(adapter.restoreCatalogBackupRecord({ kind: 'product', id: 'original-product', record: { ...record, name: 'Non sovrascrivere' }, images }), { code: 'already-exists' });
    assert.deepEqual(await get(owner, 'products/original-product'), before);
    assert.deepEqual(await get(owner, 'catalogMeta/inventory'), metadata);
  });

  await t.test('backup rejects missing, corrupt, duplicate or foreign photos before any partial writes', async () => {
    const { updatedAt, ...record } = product(); record.image = '/api/images/recovery';
    const { updatedAt: ignored, ...raw } = photo();
    const hash = Buffer.from(await crypto.subtle.digest('SHA-256', Buffer.from(raw.base64, 'base64'))).toString('hex');
    const images = [0, 1, 2].map(slot => ({ ...raw, hash, productId: 'recovery', slot, alt: 'Dettaglio' }));
    const before = await get(owner, 'catalogMeta/inventory');
    for (const wrongImages of [images.slice(1), images.slice(0, 2), [...images, images[0]], images.map((image, index) => index ? image : { ...image, productId: 'foreign' }), images.map((image, index) => index ? image : { ...image, hash: 'b'.repeat(64) })]) {
      await assert.rejects(adapter.restoreCatalogBackupRecord({ kind: 'product', id: 'recovery', record, images: wrongImages }), { code: 'invalid-input' });
    }
    await assert.rejects(adapter.restoreCatalogBackupRecord({ kind: 'product', id: 'recovery', record: { ...record, archived: true }, images }), { code: 'invalid-input' });
    assert.equal(await get(owner, 'products/recovery'), undefined);
    assert.equal(await get(owner, 'productImages/recovery'), undefined);
    assert.deepEqual(await get(owner, 'catalogMeta/inventory'), before);
    adapter.useTestContext(visitor);
    await assert.rejects(adapter.restoreCatalogBackupRecord({ kind: 'product', id: 'recovery', record, images }), error => error.status === 403);
    assert.equal(await get(owner, 'products/recovery'), undefined);
  });

  await t.test('backup checks expected revision inside each transaction and returns the next revision for chaining', async () => {
    const originalRevision = (await get(owner, 'catalogMeta/revision')).version;
    await adapter.catalogRequest('products/p/archive', 'POST');
    const category = { name: 'Reparto con versione', slug: 'versionato', description: '', order: 1, published: true, image: '' };
    await assert.rejects(adapter.restoreCatalogBackupRecord({ kind: 'category', id: 'guarded-category', record: category, expectedRevision: originalRevision }), { code: 'catalog-changed', status: 409 });
    assert.equal(await get(owner, 'categories/guarded-category'), undefined);
    assert.equal((await get(owner, 'catalogMeta/inventory')).categoryCount, 1);

    const beforeCategory = (await get(owner, 'catalogMeta/revision')).version;
    const created = await adapter.restoreCatalogBackupRecord({ kind: 'category', id: 'guarded-category', record: category, expectedRevision: beforeCategory });
    assert.match(created.revision, /^[a-f0-9-]{36}$/u);
    assert.notEqual(created.revision, beforeCategory);
    assert.equal((await get(owner, 'catalogMeta/revision')).version, created.revision);

    const { updatedAt, ...record } = product();
    record.categoryId = 'guarded-category'; record.image = '/api/images/guarded-product';
    const { updatedAt: ignored, ...raw } = photo();
    const hash = Buffer.from(await crypto.subtle.digest('SHA-256', Buffer.from(raw.base64, 'base64'))).toString('hex');
    const images = [0, 1, 2].map(slot => ({ ...raw, hash, productId: 'guarded-product', slot, alt: 'Dettaglio' }));
    await adapter.catalogRequest('products/p/restore', 'POST'); // Concurrent change after preview.
    const metadata = await get(owner, 'catalogMeta/inventory');
    await assert.rejects(adapter.restoreCatalogBackupRecord({ kind: 'product', id: 'guarded-product', record, images, expectedRevision: created.revision }), { code: 'catalog-changed', status: 409 });
    assert.equal(await get(owner, 'products/guarded-product'), undefined);
    for (const path of ['productImages/guarded-product', 'productGalleryImages/guarded-product__1', 'productGalleryImages/guarded-product__2']) assert.equal(await get(owner, path), undefined);
    assert.deepEqual(await get(owner, 'catalogMeta/inventory'), metadata);

    const currentRevision = (await get(owner, 'catalogMeta/revision')).version;
    const restored = await adapter.restoreCatalogBackupRecord({ kind: 'product', id: 'guarded-product', record, images, expectedRevision: currentRevision });
    assert.equal(restored.product.published, false);
    assert.notEqual(restored.revision, currentRevision);
    assert.equal((await get(owner, 'catalogMeta/revision')).version, restored.revision);
    assert.equal((await get(owner, 'catalogMeta/inventory')).productCount, 2);
  });
});
