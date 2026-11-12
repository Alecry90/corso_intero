import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import * as sdk from 'firebase/firestore';
import { variantRows, hasDetailedAvailability, productIsAvailable, matchesVariantSelection, variantSelectionStatus } from '../src/product-variants.js';

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (host && !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host)) throw new Error('Variant rules tests require an explicit loopback Firestore emulator.');
// Isolate overlapping focused/full-suite runs on the shared local emulator.
const projectId = `demo-intimo-variants-${randomUUID().slice(0, 8)}`;
const endpoint = host ? `http://${host}` : '';
const adapterSource = (await readFile(new URL('../src/firestore-catalog.js', import.meta.url), 'utf8'))
  .replace("import { initializeFirebaseApp } from './firebase-auth.js';", 'const initializeFirebaseApp = async () => null;')
  .replace("'./catalog-pager.js'", JSON.stringify(new URL('../src/catalog-pager.js', import.meta.url).href))
  .replace("'./product-variants.js'", JSON.stringify(new URL('../src/product-variants.js', import.meta.url).href));
const adapter = await import(`data:text/javascript;base64,${Buffer.from(adapterSource + '\nexport {deleteProduct}; export function useTestContext(ctx){contextPromise=Promise.resolve(ctx)}').toString('base64')}`);
const variants = { 'M|Blu': true, 'L|Blu': false, 'L|Nero': true };
const body = (overrides = {}) => ({ name: 'Pigiama', categoryId: 'a', description: '', price: 20, sizes: ['M', 'L'], colors: ['Blu', 'Nero'], material: 'Cotone', image: '', imageAlt: '', available: true, published: true, isDemo: false, order: 0, ...overrides });
const apps = [], databases = [];
function context(label, token) {
  const app = initializeApp({ projectId, apiKey: 'demo-only', appId: 'demo-only' }, `variants-${label}-${randomUUID()}`);
  const db = sdk.getFirestore(app);
  const [hostname, port] = host.split(':');
  sdk.connectFirestoreEmulator(db, hostname, Number(port), token ? { mockUserToken: token } : {});
  apps.push(app); databases.push(db);
  return { db, sdk };
}
const ref = (ctx, path) => sdk.doc(ctx.db, path);
const get = async (ctx, path) => (await sdk.getDocFromServer(ref(ctx, path))).data();
const denied = operation => assert.rejects(operation, error => error.code === 'permission-denied');

test('variant availability validates writes, preserves recovery flows and stays on existing documents in the local emulator', { timeout: 180000, skip: !host ? 'Set FIRESTORE_EMULATOR_HOST for explicit local rules checks; no cloud fallback.' : false }, async t => {
  sdk.setLogLevel('silent');
  const content = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  const deployed = await fetch(`${endpoint}/emulator/v1/projects/${projectId}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ignore_errors: false, rules: { files: [{ name: 'firestore.rules', content }] } }) });
  const deployedResult = await deployed.json();
  assert.equal(deployed.ok, true, JSON.stringify(deployedResult));
  assert.deepEqual((deployedResult.issues || []).filter(issue => issue.severity === 'ERROR'), [], JSON.stringify(deployedResult));
  const seed = context('seed', 'owner');
  const owner = context('owner', { sub: 'owner', email: 'alessandroferrara01@libero.it', email_verified: true });
  const anonymous = context('anonymous');
  const visitor = context('visitor', { sub: 'visitor', email: 'visitor@example.test', email_verified: true });
  const unverified = context('unverified', { sub: 'owner', email: 'alessandroferrara01@libero.it', email_verified: false });
  t.after(async () => { await Promise.all(databases.map(db => sdk.terminate(db))); await Promise.all(apps.map(app => deleteApp(app))); });
  t.beforeEach(async () => {
    const response = await fetch(`${endpoint}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    assert.equal(response.ok, true);
    const batch = sdk.writeBatch(seed.db);
    batch.set(ref(seed, 'categories/a'), { name: 'Reparto', slug: 'a', description: '', order: 0, published: true, image: '', productCount: 1, lastProductId: 'p', updatedAt: sdk.serverTimestamp() });
    batch.set(ref(seed, 'categorySlugs/a'), { categoryId: 'a' });
    batch.set(ref(seed, 'products/p'), { ...body(), variantAvailability: variants, updatedAt: sdk.serverTimestamp() });
    batch.set(ref(seed, 'catalogMeta/inventory'), { categoryCount: 1, productCount: 1, lastCategoryId: 'a', lastProductId: 'p', updatedAt: sdk.serverTimestamp() });
    batch.set(ref(seed, 'catalogMeta/revision'), { version: randomUUID() });
    await batch.commit();
    adapter.useTestContext(owner);
  });
  const directUpdate = async (overrides, { ctx = owner, omit = [] } = {}) => {
    const previous = await get(owner, 'products/p');
    const inventory = await get(owner, 'catalogMeta/inventory');
    const next = { ...previous, ...overrides, updatedAt: sdk.serverTimestamp() };
    for (const key of omit) delete next[key];
    const batch = sdk.writeBatch(ctx.db);
    batch.set(ref(ctx, 'products/p'), next);
    batch.set(ref(ctx, 'catalogMeta/inventory'), { ...inventory, updatedAt: sdk.serverTimestamp() });
    batch.set(ref(ctx, 'catalogMeta/revision'), { version: randomUUID() });
    await batch.commit();
  };

  await t.test('old SDK payloads preserve the map and explicit empty maps clear it atomically', async () => {
    const inventory = await get(owner, 'catalogMeta/inventory');
    const category = await get(owner, 'categories/a');
    const revision = await get(owner, 'catalogMeta/revision');
    const updated = await adapter.catalogRequest('products/p', 'PUT', body({ name: 'Nome aggiornato' }));
    assert.deepEqual(updated.product.variantAvailability, variants);
    assert.deepEqual((await get(owner, 'products/p')).variantAvailability, variants);
    assert.deepEqual(await get(owner, 'categories/a'), category);
    assert.equal((await get(owner, 'catalogMeta/inventory')).productCount, inventory.productCount);
    assert.notEqual((await get(owner, 'catalogMeta/revision')).version, revision.version);
    await denied(directUpdate({}, { omit: ['variantAvailability'] }));
    await adapter.catalogRequest('products/p', 'PUT', body({ sizes: ['XL'], colors: [], variantAvailability: {} }));
    assert.deepEqual((await get(owner, 'products/p')).variantAvailability, {});
    assert.equal(variantSelectionStatus((await adapter.loadManagerCatalogPage()).products[0]), 'legacy');
  });

  await t.test('resizing or renaming cannot strand preserved variants; SDK rejects foreign labels and normalized duplicates before writes', async () => {
    const previous = await get(owner, 'products/p');
    const revision = await get(owner, 'catalogMeta/revision');
    for (const extra of [
      { sizes: ['S', 'M'] }, { colors: ['Rosso'] }, { sizes: ['M', 'L', 'm'] }, { sizes: ['M', 'M', 'L'] },
      { variantAvailability: { 'XL|Blu': true } }, { variantAvailability: { 'M|Rosso': true } },
      { variantAvailability: { 'M|Blu': 'true' } }, { colors: ['Blu', 'Blù'], variantAvailability: { 'M|Blu': true } },
    ]) await assert.rejects(adapter.catalogRequest('products/p', 'PUT', body(extra)), { code: 'invalid-input', status: 400 });
    assert.deepEqual(await get(owner, 'products/p'), previous);
    assert.deepEqual(await get(owner, 'catalogMeta/revision'), revision);
    await adapter.catalogRequest('products/p', 'PUT', body({ sizes: ['S'], colors: ['Rosso'], variantAvailability: { 'S|Rosso': true } }));
    assert.deepEqual((await get(owner, 'products/p')).variantAvailability, { 'S|Rosso': true });
  });

  await t.test('rules reject malformed maps, values, ambiguous keys, oversized labels and illegal empty dimensions', async () => {
    const bad = [
      { variantAvailability: [] }, { variantAvailability: null }, { variantAvailability: 'all' },
      { variantAvailability: { 'M|Blu': 1 } }, { variantAvailability: { 'M|Blu': 'true' } }, { variantAvailability: { 'M|Blu': null } },
      { variantAvailability: { M: true } }, { variantAvailability: { 'M|Blu|extra': true } },
      { variantAvailability: { 'M|Blu~L|Blu': true } }, { variantAvailability: { ['M'.repeat(51) + '|Blu']: true } },
      { variantAvailability: { '|Blu': true } }, { variantAvailability: { 'M|': true } },
      { sizes: [], colors: [], variantAvailability: { '|': true } },
      { sizes: ['M~L'], variantAvailability: { 'M~L|Blu': true } },
      { sizes: ['M', 'M'], variantAvailability: { 'M|Blu': true } },
    ];
    for (const overrides of bad) await denied(directUpdate(overrides));
    assert.deepEqual((await get(owner, 'products/p')).variantAvailability, variants);
  });

  await t.test('a shape-valid direct SDK bypass cannot crash public helpers or advertise foreign pairs', async () => {
    // Exact label membership is enforced by production SDK validation, while
    // rules enforce bounded shape. Exercise the server-accepted bypass itself.
    await directUpdate({ variantAvailability: { 'XL|Blu': true } });
    adapter.useTestContext(anonymous);
    const item = (await adapter.loadPublicProductsByIds({ ids: ['p'] }))[0];
    assert.deepEqual(item.variantAvailability, { 'XL|Blu': true });
    assert.equal(hasDetailedAvailability(item), true);
    assert.deepEqual(variantRows(item), []);
    assert.equal(productIsAvailable(item), false);
    assert.equal(matchesVariantSelection(item), false);
    assert.equal(matchesVariantSelection(item, { size: 'XL', color: 'Blu', availableOnly: true }), false);
    assert.equal(variantSelectionStatus(item), 'not-offered');
    adapter.useTestContext(owner);
    await assert.rejects(adapter.catalogRequest('products/p', 'PUT', body()), { code: 'invalid-input', status: 400 });
    await adapter.catalogRequest('products/p', 'PUT', body({ variantAvailability: {} }));
    assert.equal(productIsAvailable(await get(anonymous, 'products/p')), true);
  });

  await t.test('rules and SDK accept exactly 100 combinations and rules reject 101', async () => {
    const sizes = Array.from({ length: 20 }, (_, i) => `T${i}`);
    const colors = Array.from({ length: 20 }, (_, i) => `C${i}`);
    const pairs = sizes.flatMap(size => colors.map(color => [`${size}|${color}`, true]));
    await adapter.catalogRequest('products/p', 'PUT', body({ sizes, colors, variantAvailability: Object.fromEntries(pairs.slice(0, 100)) }));
    assert.equal(Object.keys((await get(owner, 'products/p')).variantAvailability).length, 100);
    await denied(directUpdate({ sizes, colors, variantAvailability: Object.fromEntries(pairs.slice(0, 101)) }));
    assert.equal(Object.keys((await get(owner, 'products/p')).variantAvailability).length, 100);
  });

  await t.test('single-dimension availability and global unavailability survive public reads', async () => {
    await adapter.catalogRequest('products/p', 'PUT', body({ sizes: [], colors: ['Blu'], variantAvailability: { '|Blu': true } }));
    const colorOnly = await get(anonymous, 'products/p');
    assert.equal(variantSelectionStatus(colorOnly, { color: 'blu' }), 'available');
    await adapter.catalogRequest('products/p', 'PUT', body({ sizes: ['M'], colors: [], variantAvailability: { 'M|': true }, available: false }));
    const disabled = await get(anonymous, 'products/p');
    assert.deepEqual(disabled.variantAvailability, { 'M|': true });
    assert.equal(productIsAvailable(disabled), false);
    assert.equal(matchesVariantSelection(disabled, { size: 'M', availableOnly: true }), false);
    assert.equal(variantSelectionStatus(disabled, { size: 'M' }), 'unavailable');
    await adapter.catalogRequest('products/p', 'PUT', body({ variantAvailability: { 'M|Blu': false } }));
    assert.equal(productIsAvailable(await get(anonymous, 'products/p')), false);
  });

  await t.test('legacy records without maps remain readable and editable with general availability', async () => {
    await sdk.setDoc(ref(seed, 'products/p'), { ...body({ colors: ['Blu~Nero', 'blu~nero'] }), updatedAt: sdk.serverTimestamp() });
    const loaded = (await adapter.loadManagerCatalogPage()).products[0];
    assert.deepEqual(loaded.variantAvailability, {});
    assert.equal(variantSelectionStatus(loaded), 'legacy');
    await adapter.catalogRequest('products/p', 'PUT', body({ colors: ['Blu~Nero', 'blu~nero'] }));
    assert.deepEqual((await get(owner, 'products/p')).colors, ['Blu~Nero', 'blu~nero']);
    assert.deepEqual((await get(owner, 'products/p')).variantAvailability, {});
    await denied(directUpdate({ variantAvailability: { 'M|Blu~Nero': true } }));
  });

  await t.test('duplicate, trash, restore and missing-record backup restoration preserve every offered pair', async () => {
    const copy = (await adapter.catalogRequest('products/p/duplicate', 'POST')).product;
    assert.deepEqual(copy.variantAvailability, variants);
    assert.deepEqual((await get(owner, `products/${copy.id}`)).variantAvailability, variants);
    assert.equal(copy.published, false);
    await adapter.catalogRequest('products/p/archive', 'POST');
    assert.deepEqual((await get(owner, 'products/p')).variantAvailability, variants);
    await denied(sdk.getDocFromServer(ref(anonymous, 'products/p')));
    const restored = (await adapter.catalogRequest('products/p/restore', 'POST')).product;
    assert.deepEqual(restored.variantAvailability, variants);
    assert.equal(restored.published, false);
    const backupRecord = body({ variantAvailability: variants });
    await adapter.deleteProduct(seed, 'p');
    const result = await adapter.restoreCatalogBackupRecord({ kind: 'product', id: 'p', record: backupRecord });
    assert.deepEqual(result.product.variantAvailability, variants);
    assert.deepEqual((await get(owner, 'products/p')).variantAvailability, variants);
    assert.equal((await get(owner, 'products/p')).published, false);
  });

  await t.test('public data includes availability while drafts and writes stay protected for every outsider', async () => {
    assert.deepEqual((await get(anonymous, 'products/p')).variantAvailability, variants);
    for (const ctx of [anonymous, visitor, unverified]) {
      await denied(directUpdate({ variantAvailability: {} }, { ctx }));
      adapter.useTestContext(ctx);
      await assert.rejects(adapter.catalogRequest('products/p', 'PUT', body({ variantAvailability: variants })), error => error.status === 403);
    }
    adapter.useTestContext(owner);
    await adapter.catalogRequest('products/p', 'PUT', body({ published: false }));
    for (const ctx of [anonymous, visitor, unverified]) {
      await denied(sdk.getDocFromServer(ref(ctx, 'products/p')));
      await denied(sdk.getDocsFromServer(sdk.query(sdk.collection(ctx.db, 'products'), sdk.limit(10))));
    }
  });

  await t.test('availability adds no SDK document/query reads and creates no variant documents', async () => {
    const reads = [], writes = [];
    let queries = 0, documents = 0;
    const countingSdk = { ...sdk,
      getDocsFromServer: async query => { queries += 1; return sdk.getDocsFromServer(query); },
      getDocFromServer: async reference => { documents += 1; return sdk.getDocFromServer(reference); },
      runTransaction: (db, callback) => sdk.runTransaction(db, transaction => callback({
        get: reference => { reads.push(reference.path); return transaction.get(reference); },
        set: (reference, ...args) => { writes.push(reference.path); return transaction.set(reference, ...args); },
        update: (reference, ...args) => { writes.push(reference.path); return transaction.update(reference, ...args); },
        delete: reference => { writes.push(reference.path); return transaction.delete(reference); },
      })),
    };
    adapter.useTestContext({ db: owner.db, sdk: countingSdk });
    await adapter.catalogRequest('products/p', 'PUT', body({ variantAvailability: variants }));
    assert.deepEqual([...reads].sort(), ['products/p', 'categories/a', 'catalogMeta/inventory', 'productGalleryImages/p__1', 'productGalleryImages/p__2'].sort());
    assert.equal(queries, 0); assert.equal(documents, 0);
    assert.deepEqual([...new Set(writes)].sort(), ['products/p', 'productImages/p', 'catalogMeta/inventory', 'catalogMeta/revision'].sort());
    const selected = await adapter.loadPublicProductsByIds({ ids: ['p'] });
    assert.deepEqual(selected[0].variantAvailability, variants);
    assert.equal(queries, 1); assert.equal(documents, 1);
    const all = await sdk.getDocsFromServer(sdk.query(sdk.collection(seed.db, 'products'), sdk.limit(10)));
    assert.equal(all.size, 1);
  });
});
