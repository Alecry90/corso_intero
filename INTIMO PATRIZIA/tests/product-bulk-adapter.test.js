import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import * as sdk from 'firebase/firestore';

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (host && !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host)) throw Error('Bulk adapter tests require an explicit loopback Firestore emulator.');
const projectId = `demo-intimo-bulk-${randomUUID().slice(0, 8)}`;
const endpoint = host ? `http://${host}` : '';
const source = (await readFile(new URL('../src/firestore-catalog.js', import.meta.url), 'utf8'))
  .replace("import { initializeFirebaseApp } from './firebase-auth.js';", 'const initializeFirebaseApp = async () => null;')
  .replace("'./catalog-pager.js'", JSON.stringify(new URL('../src/catalog-pager.js', import.meta.url).href))
  .replace("'./product-variants.js'", JSON.stringify(new URL('../src/product-variants.js', import.meta.url).href));
const adapter = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport function useTestContext(ctx){contextPromise=Promise.resolve(ctx)}\n//# sourceURL=product-bulk-adapter-fixture.js').toString('base64')}`);
const variants = { 'M|Blu': true, 'L|Nero': false };
const record = (overrides = {}) => ({
  name: 'Pigiama', categoryId: 'a', description: 'Descrizione', price: 25.5,
  sizes: ['M', 'L'], colors: ['Blu', 'Nero'], material: 'Cotone', imageAlt: 'Fronte del pigiama',
  available: true, published: true, isDemo: false, order: 0, sku: 'P-01', brand: 'Marchio', featured: false, newArrival: false,
  ...overrides,
});
const apps = [], databases = [];
function context(label, token) {
  const app = initializeApp({ projectId, apiKey: 'demo-only', appId: 'demo-only' }, `bulk-${label}-${randomUUID()}`);
  const db = sdk.getFirestore(app);
  const [hostname, port] = host.split(':');
  sdk.connectFirestoreEmulator(db, hostname, Number(port), token ? { mockUserToken: token } : {});
  apps.push(app); databases.push(db);
  return { db, sdk };
}
const ref = (ctx, path) => sdk.doc(ctx.db, path);
const get = async (ctx, path) => (await sdk.getDocFromServer(ref(ctx, path))).data();
const version = product => product.updatedAt ? `${product.updatedAt.seconds}:${product.updatedAt.nanoseconds}` : 'initial';
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

test('bulk adapter rejects omitted guards, unrecognized fields and every photograph input before accessing Firestore', async () => {
  adapter.useTestContext({ get db() { throw Error('Validation must precede database access.'); }, sdk });
  const payload = { id: 'p', record: record(), expectedRevision: randomUUID(), expectedProductVersion: '1700000000:123456789' };
  const invalid = [undefined, null, [], {}, { ...payload, extra: true }, { ...payload, id: 'p/other' }, { ...payload, record: null }];
  for (const key of ['id', 'record', 'expectedRevision', 'expectedProductVersion']) {
    const omitted = { ...payload }; delete omitted[key]; invalid.push(omitted);
  }
  for (const expectedRevision of ['', 'revision', 1, null, '00000000-0000-1000-0000-000000000000']) invalid.push({ ...payload, expectedRevision });
  for (const expectedProductVersion of ['', 'not-a-version', null, 1, '1:-1', '1:1000000000', '253402300800:0', '-62135596801:0']) invalid.push({ ...payload, expectedProductVersion });
  for (const field of ['image', 'imageData', 'removeImage', 'gallerySlots', 'galleryUploads', 'galleryRemovals', 'archived', 'archivedAt', 'updatedAt', 'extra']) {
    invalid.push({ ...payload, record: { ...record(), [field]: field === 'image' ? '' : [] } });
  }
  for (const value of invalid) await assert.rejects(adapter.updateCatalogProductRecord(value), { code: 'invalid-input', status: 400 });
});

test('bulk updates use revision and product guards atomically with existing owner rules on the local emulator', {
  timeout: 180000, skip: !host ? 'Set FIRESTORE_EMULATOR_HOST for the explicit loopback rules emulator; no cloud fallback.' : false,
}, async t => {
  sdk.setLogLevel('silent');
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  const deployed = await fetch(`${endpoint}/emulator/v1/projects/${projectId}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ignore_errors: false, rules: { files: [{ name: 'firestore.rules', content: rules }] } }),
  });
  const deployedResult = await deployed.json();
  assert.equal(deployed.ok, true, JSON.stringify(deployedResult));
  assert.deepEqual((deployedResult.issues || []).filter(issue => issue.severity === 'ERROR'), []);
  const seed = context('seed', 'owner');
  const owner = context('owner', { sub: 'owner', email: 'alessandroferrara01@libero.it', email_verified: true });
  const customer = context('customer', { sub: 'customer', email: 'customer@example.test', email_verified: true });
  const anonymous = context('anonymous');
  const unverified = context('unverified', { sub: 'owner', email: 'alessandroferrara01@libero.it', email_verified: false });
  t.after(async () => {
    await Promise.all(databases.map(db => sdk.terminate(db)));
    await Promise.all(apps.map(app => deleteApp(app)));
  });
  const paths = ['products/p', 'products/q', 'categories/a', 'categories/b', 'catalogMeta/inventory', 'catalogMeta/revision', 'productImages/p', 'productGalleryImages/p__1', 'productGalleryImages/p__2'];
  const snapshot = async () => Object.fromEntries(await Promise.all(paths.map(async path => [path, await get(owner, path)])));
  const guards = async (id = 'p') => ({
    expectedRevision: (await get(owner, 'catalogMeta/revision'))?.version || 'initial',
    expectedProductVersion: version(await get(owner, `products/${id}`)),
  });
  const update = async (overrides = {}, guardOverrides = {}, id = 'p') => adapter.updateCatalogProductRecord({
    id, record: record(overrides), ...await guards(id), ...guardOverrides,
  });
  const bytes = Buffer.from('RIFF\u0004\u0000\u0000\u0000WEBP', 'binary');
  const photo = { base64: bytes.toString('base64'), mime: 'image/webp', bytes: bytes.length, width: 32, height: 40, hash: createHash('sha256').update(bytes).digest('hex') };
  const stamp = new sdk.Timestamp(1700000000, 123456789);
  const seedFixture = async () => {
    const reset = await fetch(`${endpoint}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    assert.equal(reset.ok, true);
    const batch = sdk.writeBatch(seed.db);
    for (const [id, productCount] of [['a', 2], ['b', 0]]) {
      batch.set(ref(seed, `categories/${id}`), { name: `Reparto ${id}`, slug: id, description: '', order: 0, published: true, image: '', productCount, lastProductId: productCount ? 'q' : '', updatedAt: stamp });
      batch.set(ref(seed, `categorySlugs/${id}`), { categoryId: id });
    }
    batch.set(ref(seed, 'products/p'), { ...record(), image: '/api/images/p', gallerySlots: [1, 2], variantAvailability: variants, updatedAt: stamp });
    batch.set(ref(seed, 'products/q'), { ...record({ name: 'Secondo articolo', sku: 'Q-01' }), image: '', gallerySlots: [], variantAvailability: {}, updatedAt: stamp });
    batch.set(ref(seed, 'productImages/p'), { ...photo, updatedAt: stamp });
    for (const slot of [1, 2]) batch.set(ref(seed, `productGalleryImages/p__${slot}`), { ...photo, productId: 'p', slot, alt: `Vista ${slot}`, updatedAt: stamp });
    batch.set(ref(seed, 'catalogMeta/inventory'), { categoryCount: 2, productCount: 2, lastCategoryId: 'b', lastProductId: 'q', updatedAt: stamp });
    batch.set(ref(seed, 'catalogMeta/revision'), { version: randomUUID() });
    await batch.commit();
    adapter.useTestContext(owner);
  };
  t.beforeEach(seedFixture);

  await t.test('successful rows return the exact revision chain and preserve omitted photos, gallery and variants', async () => {
    const before = await snapshot();
    const pGuards = await guards(), qGuards = await guards('q');
    const managerProduct = (await adapter.loadManagerCatalogPage()).products.find(item => item.id === 'p');
    assert.equal(managerProduct.imageVersion, pGuards.expectedProductVersion);
    const first = await adapter.updateCatalogProductRecord({ id: 'p', record: record({ name: 'Pigiama aggiornato', price: 30 }), ...pGuards });
    assert.deepEqual(Object.keys(first).sort(), ['product', 'revision']);
    assert.equal(first.product.id, 'p'); assert.equal(first.product.name, 'Pigiama aggiornato');
    assert.equal(first.product.image, '/api/images/p'); assert.deepEqual(first.product.gallerySlots, [1, 2]);
    assert.deepEqual(first.product.variantAvailability, variants); assert.match(first.revision, uuidPattern);
    assert.notEqual(first.revision, pGuards.expectedRevision);
    assert.equal((await get(owner, 'catalogMeta/revision')).version, first.revision);
    const second = await adapter.updateCatalogProductRecord({ id: 'q', record: record({ name: 'Secondo aggiornato', sku: 'Q-01' }), expectedProductVersion: qGuards.expectedProductVersion, expectedRevision: first.revision });
    assert.match(second.revision, uuidPattern); assert.notEqual(second.revision, first.revision);
    assert.equal((await get(owner, 'catalogMeta/revision')).version, second.revision);
    const after = await snapshot();
    for (const path of ['categories/a', 'categories/b', 'productImages/p', 'productGalleryImages/p__1', 'productGalleryImages/p__2']) assert.deepEqual(after[path], before[path], path);
    const { updatedAt, ...inventory } = after['catalogMeta/inventory'];
    const { updatedAt: previousStamp, ...previousInventory } = before['catalogMeta/inventory'];
    assert.deepEqual(inventory, previousInventory); assert.notDeepEqual(updatedAt, previousStamp);
    assert.deepEqual(after['products/p'].variantAvailability, variants);
  });

  await t.test('moving a guarded existing product updates both category counts without changing inventory or media', async () => {
    const before = await snapshot();
    await update({ categoryId: 'b' });
    const after = await snapshot();
    assert.equal(after['categories/a'].productCount, 1); assert.equal(after['categories/b'].productCount, 1);
    assert.equal(after['catalogMeta/inventory'].productCount, 2); assert.equal(after['catalogMeta/inventory'].categoryCount, 2);
    for (const path of ['productImages/p', 'productGalleryImages/p__1', 'productGalleryImages/p__2']) assert.deepEqual(after[path], before[path]);
  });

  await t.test('a move with all three photographs and the maximum 100 variant pairs stays within the rules budget', async () => {
    const sizes = Array.from({ length: 20 }, (_, i) => `T${i}`);
    const colors = Array.from({ length: 20 }, (_, i) => `C${i}`);
    const variantAvailability = Object.fromEntries(sizes.flatMap(size => colors.map(color => [`${size}|${color}`, true])).slice(0, 100));
    await sdk.updateDoc(ref(seed, 'products/p'), { sizes, colors, variantAvailability });
    const before = await snapshot();
    await update({ categoryId: 'b', sizes, colors });
    const after = await snapshot();
    assert.deepEqual(after['products/p'].variantAvailability, variantAvailability);
    assert.equal(after['categories/a'].productCount, 1); assert.equal(after['categories/b'].productCount, 1);
    for (const path of ['productImages/p', 'productGalleryImages/p__1', 'productGalleryImages/p__2']) assert.deepEqual(after[path], before[path]);
  });

  await t.test('rules still revalidate unchanged malformed variant maps when bypassing the adapter', async () => {
    for (const variantAvailability of [{ 'M|Blu': 'true' }, { malformed: true }, [], null]) {
      await sdk.updateDoc(ref(seed, 'products/p'), { variantAvailability });
      const before = await snapshot();
      const batch = sdk.writeBatch(owner.db);
      batch.set(ref(owner, 'products/p'), { ...before['products/p'], name: 'Modifica diretta', updatedAt: sdk.serverTimestamp() });
      batch.set(ref(owner, 'catalogMeta/inventory'), { ...before['catalogMeta/inventory'], updatedAt: sdk.serverTimestamp() });
      batch.set(ref(owner, 'catalogMeta/revision'), { version: randomUUID() });
      await assert.rejects(batch.commit(), { code: 'permission-denied' });
      assert.deepEqual(await snapshot(), before);
    }
  });

  await t.test('stale global revisions and stale product timestamps reject without any partial writes', async () => {
    const original = await guards();
    await adapter.catalogRequest('products/q', 'PUT', record({ name: 'Modifica concorrente' }));
    const afterOtherRow = await snapshot();
    await assert.rejects(update({ name: 'Dati precedenti' }, original), { code: 'catalog-changed', status: 409 });
    assert.deepEqual(await snapshot(), afterOtherRow);
    await adapter.catalogRequest('products/p', 'PUT', record({ name: 'Modifica prodotto' }));
    const current = await snapshot();
    await assert.rejects(update({ name: 'Sovrascrittura' }, { expectedProductVersion: original.expectedProductVersion }), { code: 'stale-product', status: 409 });
    assert.deepEqual(await snapshot(), current);
  });

  await t.test('both guards are rechecked when an overlapping write forces the transaction to retry', async () => {
    for (const race of ['revision', 'product']) {
      await seedFixture();
      const original = await guards();
      const before = await snapshot();
      let attempts = 0, raced = false;
      const racingRevision = randomUUID();
      const racingStamp = new sdk.Timestamp(1700000001, 1000);
      adapter.useTestContext({ db: owner.db, sdk: { ...sdk, runTransaction: (db, callback) => sdk.runTransaction(db, async transaction => {
        attempts++;
        const result = await callback(transaction);
        if (!raced) {
          raced = true;
          if (race === 'revision') await sdk.setDoc(ref(owner, 'catalogMeta/revision'), { version: racingRevision });
          else await sdk.updateDoc(ref(seed, 'products/p'), { name: 'Scrittura concorrente', updatedAt: racingStamp });
        }
        return result;
      }) } });
      try {
        await assert.rejects(adapter.updateCatalogProductRecord({ id: 'p', record: record({ name: 'Anteprima superata' }), ...original }), { code: race === 'revision' ? 'catalog-changed' : 'stale-product', status: 409 });
        assert.ok(attempts >= 2, 'The transaction must retry after the competing write.');
      } finally { adapter.useTestContext(owner); }
      const after = await snapshot();
      const expected = { ...before };
      if (race === 'revision') expected['catalogMeta/revision'] = { version: racingRevision };
      else expected['products/p'] = { ...before['products/p'], name: 'Scrittura concorrente', updatedAt: racingStamp };
      assert.deepEqual(after, expected, 'Only the competing write may survive.');
    }
  });

  await t.test('missing products stay missing and archived products cannot be changed or restored', async () => {
    const before = await snapshot();
    await assert.rejects(adapter.updateCatalogProductRecord({ id: 'missing', record: record(), expectedRevision: (await guards()).expectedRevision, expectedProductVersion: 'initial' }), { code: 'not-found', status: 404 });
    assert.equal((await sdk.getDocFromServer(ref(owner, 'products/missing'))).exists(), false);
    assert.deepEqual(await snapshot(), before);
    await adapter.catalogRequest('products/p/archive', 'POST', {});
    const archived = await snapshot();
    await assert.rejects(update({ name: 'Ripristino implicito' }), { code: 'product-archived', status: 409 });
    assert.deepEqual(await snapshot(), archived);
  });

  await t.test('the CSV entry point cannot change isDemo and keeps existing demonstration status', async () => {
    const before = await snapshot();
    await assert.rejects(update({ isDemo: true }), { code: 'invalid-input', status: 400 });
    assert.deepEqual(await snapshot(), before);
    await sdk.updateDoc(ref(seed, 'products/p'), { isDemo: true });
    const demo = await snapshot();
    await assert.rejects(update({ isDemo: false }), { code: 'invalid-input', status: 400 });
    assert.deepEqual(await snapshot(), demo);
    const result = await update({ name: 'Esempio aggiornato', isDemo: true });
    assert.equal(result.product.isDemo, true);
    assert.equal((await get(owner, 'products/p')).isDemo, true);
  });

  await t.test('initial guards support legacy products without a timestamp or catalog revision', async () => {
    await sdk.updateDoc(ref(seed, 'products/p'), { updatedAt: sdk.deleteField() });
    await sdk.deleteDoc(ref(seed, 'catalogMeta/revision'));
    const result = await update({ name: 'Articolo precedente aggiornato' }, { expectedRevision: 'initial', expectedProductVersion: 'initial' });
    assert.match(result.revision, uuidPattern);
    assert.equal((await get(owner, 'catalogMeta/revision')).version, result.revision);
    assert.notEqual(version(await get(owner, 'products/p')), 'initial');
  });

  await t.test('customer, anonymous and unverified accounts cannot write through the adapter', async () => {
    const before = await snapshot();
    const current = await guards();
    for (const ctx of [customer, anonymous, unverified]) {
      adapter.useTestContext(ctx);
      try { await assert.rejects(adapter.updateCatalogProductRecord({ id: 'p', record: record({ name: 'Non autorizzato' }), ...current }), { code: 'permission-denied', status: 403 }); }
      finally { adapter.useTestContext(owner); }
      assert.deepEqual(await snapshot(), before);
    }
  });
});
