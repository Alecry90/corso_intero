import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import * as sdk from 'firebase/firestore';

// Load the production adapter with its browser-only Firebase bootstrap replaced.
// All validation and transaction functions below are the actual production code.
const sourceURL = new URL('../src/firestore-catalog.js', import.meta.url);
const source = (await readFile(sourceURL, 'utf8'))
  .replace("import { initializeFirebaseApp } from './firebase-auth.js';", 'const initializeFirebaseApp = async () => null;')
  .replace("'./catalog-pager.js'", JSON.stringify(new URL('../src/catalog-pager.js', import.meta.url).href))
  .replace("'./product-variants.js'", JSON.stringify(new URL("../src/product-variants.js", import.meta.url).href));
const adapter = await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {productInput,saveProduct,deleteProduct}; export function useTestContext(ctx){contextPromise=Promise.resolve(ctx)}').toString('base64')}`);
const body = (overrides = {}) => ({ name: 'Articolo', categoryId: 'a', image: '', ...overrides });

test('gallery input requires useful alt text, unique bounded slots and unambiguous operations', async () => {
  for (const galleryUploads of [[{ slot: 1, alt: '' }], [{ slot: 3, alt: 'Retro' }], [{ slot: 1, alt: 'A' }, { slot: 1, alt: 'B' }], [{ slot: 1, alt: 'A', url: 'https://example.test' }]]) {
    await assert.rejects(adapter.productInput(body({ galleryUploads }), 'p'), { code: 'invalid-input' });
  }
  await assert.rejects(adapter.productInput(body({ galleryUploads: [{ slot: 1, alt: 'Retro' }], galleryRemovals: [1] }), 'p'), { code: 'invalid-input' });
  await assert.rejects(adapter.productInput(body({ sku: 'x'.repeat(81) }), 'p'), { code: 'invalid-input' });
  await assert.rejects(adapter.productInput(body({ featured: 'true' }), 'p'), { code: 'invalid-input' });
  const input = await adapter.productInput(body({ sku: ' R-1 ', brand: ' Marchio ', featured: true, newArrival: false, galleryUploads: [{ slot: 2, alt: ' Dettaglio cuciture ' }] }), 'p');
  assert.equal(input.record.sku, 'R-1'); assert.equal(input.record.brand, 'Marchio');
  assert.deepEqual(input.galleryUploads, [{ slot: 2, alt: 'Dettaglio cuciture', imageDocument: null }]);
  const legacy = await adapter.productInput(body(), 'p');
  for (const field of ['sku', 'brand', 'featured', 'newArrival', 'gallerySlots']) assert.equal(Object.hasOwn(legacy.record, field), false, 'Omitted new fields must remain distinguishable from explicit resets.');
});

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (host && !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host)) throw new Error('Gallery tests require a loopback Firestore emulator.');
const projectId = 'demo-intimo-product-gallery';
const endpoint = host ? `http://${host}` : '';
const photo = (extra = {}) => ({ base64: 'UklGRg==', mime: 'image/webp', bytes: 4, width: 32, height: 40, hash: 'a'.repeat(64), ...extra });
const apps = [];
const dbs = [];
function context(label, token) {
  const app = initializeApp({ projectId, apiKey: 'demo-only', appId: 'demo-only' }, `gallery-${label}-${randomUUID()}`);
  const db = sdk.getFirestore(app);
  const [hostname, port] = host.split(':');
  sdk.connectFirestoreEmulator(db, hostname, Number(port), token ? { mockUserToken: token } : {});
  apps.push(app); dbs.push(db); return { db, sdk };
}
const ref = (ctx, path) => sdk.doc(ctx.db, path);
const get = async (ctx, path) => (await sdk.getDocFromServer(ref(ctx, path))).data();
const denied = promise => assert.rejects(promise, error => error.code === 'permission-denied');

test('gallery transactions, rules, duplication and SKU import use the local emulator only', { timeout: 180000, skip: !host ? 'Set FIRESTORE_EMULATOR_HOST for the explicit local rules checks.' : false }, async t => {
  sdk.setLogLevel('silent');
  const content = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  const deployed = await fetch(`${endpoint}/emulator/v1/projects/${projectId}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ignore_errors: false, rules: { files: [{ name: 'firestore.rules', content }] } }) });
  assert.equal(deployed.ok, true, JSON.stringify(await deployed.json()));
  const admin = context('seed', 'owner');
  const owner = context('owner', { sub: 'owner', email: 'alessandroferrara01@libero.it', email_verified: true });
  const visitor = context('visitor', { sub: 'visitor', email: 'other@example.test', email_verified: true });
  const unverified = context('unverified', { sub: 'owner', email: 'alessandroferrara01@libero.it', email_verified: false });
  const anonymous = context('anonymous');
  adapter.useTestContext(owner);
  t.after(async () => { await Promise.all(dbs.map(db => sdk.terminate(db))); await Promise.all(apps.map(app => deleteApp(app))); });
  t.beforeEach(async () => {
    const clear = await fetch(`${endpoint}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    assert.equal(clear.ok, true);
    const batch = sdk.writeBatch(admin.db);
    batch.set(ref(admin, 'categories/a'), { name: 'Reparto', slug: 'a', description: '', order: 0, published: true, image: '', productCount: 1, lastProductId: 'p', updatedAt: sdk.serverTimestamp() });
    batch.set(ref(admin, 'categorySlugs/a'), { categoryId: 'a' });
    const input = await adapter.productInput(body({ sku: 'ORIGINALE', brand: 'Marchio', featured: true, newArrival: true }), 'p');
    batch.set(ref(admin, 'products/p'), { ...input.record, gallerySlots: [], updatedAt: sdk.serverTimestamp() });
    batch.set(ref(admin, 'catalogMeta/inventory'), { categoryCount: 1, productCount: 1, lastCategoryId: 'a', lastProductId: 'p', updatedAt: sdk.serverTimestamp() });
    batch.set(ref(admin, 'catalogMeta/revision'), { version: randomUUID() });
    await batch.commit();
  });
  const addPhotos = async () => {
    const input = await adapter.productInput(body({ imageAlt: 'Vista frontale' }), 'p');
    input.imageDocument = photo(); input.record.image = '/api/images/p';
    input.galleryUploads = [1, 2].map(slot => ({ slot, alt: slot === 1 ? 'Vista posteriore' : 'Dettaglio tessuto', imageDocument: photo() }));
    return adapter.saveProduct(owner, 'p', input, false);
  };

  await t.test('main, extras, references and revision commit together; old client saves preserve new metadata', async () => {
    const revision = await get(owner, 'catalogMeta/revision');
    await addPhotos();
    const product = await get(owner, 'products/p');
    assert.deepEqual(product.gallerySlots, [1, 2]);
    assert.equal(product.sku, 'ORIGINALE'); assert.equal(product.brand, 'Marchio'); assert.equal(product.featured, true); assert.equal(product.newArrival, true);
    assert.notEqual((await get(owner, 'catalogMeta/revision')).version, revision.version);
    for (const slot of [1, 2]) assert.equal((await get(anonymous, `productGalleryImages/p__${slot}`)).productId, 'p');
    const input = await adapter.productInput(body({ imageAlt: 'Vista frontale aggiornata' }), 'p');
    const result = await adapter.saveProduct(owner, 'p', input, false);
    assert.deepEqual(result.product.gallerySlots, [1, 2]); assert.equal(result.product.sku, 'ORIGINALE');
    await adapter.catalogRequest('products/p', 'PUT', body({ imageAlt: 'Fronte', galleryUploads: [{ slot: 1, alt: 'Retro aggiornato' }] }));
    assert.equal((await get(owner, 'productGalleryImages/p__1')).alt, 'Retro aggiornato');
    await adapter.catalogRequest('categories', 'POST', {name:'Secondo reparto',slug:'secondo',description:'',order:1,published:true,image:''});
    const categories = await sdk.getDocsFromServer(sdk.query(sdk.collection(owner.db,'categories'),sdk.where('slug','==','secondo'),sdk.limit(1)));
    const moved = categories.docs[0].id;
    await adapter.catalogRequest('products/p','PUT',body({categoryId:moved,imageAlt:'Fronte'}));
    assert.equal((await get(owner,'products/p')).categoryId,moved);
    await adapter.catalogRequest('products/p','PUT',body({categoryId:'a',imageAlt:'Fronte'}));
  });
  await t.test('outsiders cannot read private extras, enumerate images or alter image metadata', async () => {
    await addPhotos();
    await denied(sdk.getDocsFromServer(sdk.query(sdk.collection(anonymous.db, 'productGalleryImages'), sdk.limit(2))));
    for (const ctx of [visitor, unverified, anonymous]) {
      await denied(sdk.setDoc(ref(ctx, 'productGalleryImages/p__1'), { ...photo(), productId: 'p', slot: 1, alt: 'Retro', updatedAt: sdk.serverTimestamp() }));
      await denied(sdk.deleteDoc(ref(ctx, 'productGalleryImages/p__1')));
    }
    await adapter.catalogRequest('products/p', 'PUT', body({ imageAlt: 'Fronte', published: false }));
    for (const ctx of [visitor, unverified, anonymous]) await denied(sdk.getDocFromServer(ref(ctx, 'productGalleryImages/p__1')));
    assert.equal((await get(owner, 'productGalleryImages/p__1')).slot, 1);
  });
  await t.test('missing files, dangling references and image-only writes fail without partial catalog changes', async () => {
    await addPhotos();
    const before = await get(owner, 'products/p');
    const revision = await get(owner, 'catalogMeta/revision');
    const batch = sdk.writeBatch(owner.db);
    batch.delete(ref(owner, 'productGalleryImages/p__1'));
    batch.set(ref(owner, 'catalogMeta/revision'), { version: randomUUID() });
    await denied(batch.commit());
    assert.deepEqual(await get(owner, 'products/p'), before); assert.deepEqual(await get(owner, 'catalogMeta/revision'), revision);
    const wrong = sdk.writeBatch(owner.db);
    wrong.set(ref(owner, 'productGalleryImages/p__1'), { ...photo(), productId: 'p', slot: 1, alt: 'Modifica isolata', updatedAt: sdk.serverTimestamp() });
    wrong.set(ref(owner, 'catalogMeta/revision'), { version: randomUUID() });
    await denied(wrong.commit());
    await adapter.catalogRequest('products/p', 'PUT', body({ imageAlt: 'Fronte', galleryRemovals: [1] }));
    assert.deepEqual((await get(owner, 'products/p')).gallerySlots, [2]);
    assert.equal(await get(owner, 'productGalleryImages/p__1'), undefined);
    await assert.rejects(adapter.catalogRequest('products/p', 'PUT', body({ imageAlt: 'Fronte', gallerySlots: [1, 2] })), { code: 'invalid-input' });
    assert.deepEqual((await get(owner, 'products/p')).gallerySlots, [2]);
  });
  await t.test('duplicate owns three copied photos as a draft and survives source deletion', async () => {
    await addPhotos();
    const result = await adapter.catalogRequest('products/p/duplicate', 'POST');
    const copy = result.product;
    assert.notEqual(copy.id, 'p'); assert.equal(copy.published, false); assert.equal(copy.sku, ''); assert.equal(copy.image, `/api/images/${copy.id}`);
    assert.deepEqual(copy.gallerySlots, [1, 2]);
    // Disposable emulator seed context simulates administrative data loss.
    await adapter.deleteProduct(admin, 'p');
    assert.equal(await get(owner, 'productImages/p'), undefined);
    for (const slot of [1, 2]) assert.equal(await get(owner, `productGalleryImages/p__${slot}`), undefined);
    assert.equal((await get(owner, `productImages/${copy.id}`)).base64, photo().base64);
    for (const slot of [1, 2]) assert.equal((await get(owner, `productGalleryImages/${copy.id}__${slot}`)).productId, copy.id);
    assert.equal((await get(owner, 'categories/a')).productCount, 1);
  });
  await t.test('SKU import is create-only, canonical and always a draft even across retries', async () => {
    const first = await adapter.catalogRequest('products/import', 'POST', body({ sku: ' AbC-123 ', published: true }));
    assert.match(first.product.id, /^import_[a-f0-9]{32}$/); assert.equal(first.product.published, false);
    const before = await get(owner, `products/${first.product.id}`);
    await assert.rejects(adapter.catalogRequest('products/import', 'POST', body({ sku: 'ａｂｃ-123', name: 'Retry' })), { code: 'already-exists' });
    assert.deepEqual(await get(owner, `products/${first.product.id}`), before);
    assert.equal((await get(owner, 'catalogMeta/inventory')).productCount, 2);
  });
  await t.test('legacy products without image documents can be edited and administrative removal keeps counters coherent', async () => {
    await adapter.catalogRequest('products/p', 'PUT', body({ name: 'Articolo aggiornato' }));
    await adapter.deleteProduct(admin, 'p');
    assert.equal(await get(owner, 'products/p'), undefined);
    assert.equal((await get(owner, 'catalogMeta/inventory')).productCount, 0);
  });
});
