import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import * as sdk from 'firebase/firestore';

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (host && !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host)) throw Error('Only a loopback emulator is permitted.');
const projectId = 'demo-intimo-backup-transport';
const adapterURL = new URL('../src/firestore-catalog.js', import.meta.url);
const adapterSource = (await readFile(adapterURL, 'utf8'))
  .replace("import { initializeFirebaseApp } from './firebase-auth.js';", 'const initializeFirebaseApp = async () => null;')
  .replace("'./catalog-pager.js'", JSON.stringify(new URL('../src/catalog-pager.js', import.meta.url).href))
  .replace("'./product-variants.js'", JSON.stringify(new URL("../src/product-variants.js", import.meta.url).href));
const adapter = await import(`data:text/javascript;base64,${Buffer.from(adapterSource + '\nexport {deleteProduct}; export function useTestContext(ctx){contextPromise=Promise.resolve(ctx)}').toString('base64')}`);

test('backup transport uses actual bounded reads and create-only restoration on the local rules emulator', { skip: !host, timeout: 120000 }, async t => {
  sdk.setLogLevel('silent');
  const reset = await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(reset.ok, true);
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  const response = await fetch(`http://${host}/emulator/v1/projects/${projectId}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ignore_errors: false, rules: { files: [{ name: 'firestore.rules', content: rules }] } }) });
  assert.equal(response.ok, true);
  const app = initializeApp({ projectId, apiKey: 'demo-only', appId: 'demo-only' }, `backup-${randomUUID()}`);
  const db = sdk.getFirestore(app);
  const [hostname, port] = host.split(':');
  sdk.connectFirestoreEmulator(db, hostname, Number(port), { mockUserToken: { sub: 'owner', email: 'alessandroferrara01@libero.it', email_verified: true } });
  const seedApp = initializeApp({ projectId, apiKey: 'demo-only', appId: 'demo-only' }, `backup-seed-${randomUUID()}`);
  const seedDb = sdk.getFirestore(seedApp);
  sdk.connectFirestoreEmulator(seedDb, hostname, Number(port), { mockUserToken: 'owner' });
  const seed = { db: seedDb, sdk };
  const ctx = { db, sdk };
  adapter.useTestContext(ctx);
  const key = `backup-test-${randomUUID()}`;
  const user = { uid: 'owner', email: 'alessandroferrara01@libero.it', emailVerified: true };
  const fixture = { adapter, user };
  globalThis[key] = fixture;
  const sourceURL = new URL('../src/catalog-backup.js', import.meta.url);
  const source = (await readFile(sourceURL, 'utf8'))
    .replace("import { initializeFirebaseAuth } from './firebase-auth.js';", `const initializeFirebaseAuth = async () => ({status:'ready', currentUser:()=>globalThis[${JSON.stringify(key)}].user});`)
    .replace("import { getFirestoreContext, loadManagerCatalogPage, readPublicVersion, restoreCatalogBackupRecord } from './firestore-catalog.js';", `const { getFirestoreContext,loadManagerCatalogPage,readPublicVersion,restoreCatalogBackupRecord }=globalThis[${JSON.stringify(key)}].adapter;`)
    .replace("'./catalog-backup-model.js'", JSON.stringify(new URL('../src/catalog-backup-model.js', import.meta.url).href));
  const backupApi = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  t.after(async () => { delete globalThis[key]; await sdk.terminate(db); await sdk.terminate(seedDb); await deleteApp(app); await deleteApp(seedApp); });
  const bytes = Buffer.from('RIFF\u0004\u0000\u0000\u0000WEBP', 'binary');
  const image = slot => ({ productId: 'original', slot, base64: bytes.toString('base64'), mime: 'image/webp', bytes: bytes.length,
    width: 32, height: 40, hash: createHash('sha256').update(bytes).digest('hex'), ...(slot ? { alt: 'Retro' } : {}) });
  await adapter.restoreCatalogBackupRecord({ kind: 'category', id: 'original-category', record: { name: 'Reparto', slug: 'original-category' } });
  await adapter.restoreCatalogBackupRecord({ kind: 'product', id: 'original', record: { name: 'Articolo', categoryId: 'original-category', image: '/api/images/original', imageAlt: 'Fronte', gallerySlots: [1], sku: 'ART-1' }, images: [image(0), image(1)] });
  let saved;
  await t.test('export includes original IDs and both photos, with no account data', async () => {
    saved = await backupApi.exportCatalogBackup();
    assert.equal(saved.backup.categories[0].id, 'original-category');
    assert.equal(saved.backup.products[0].id, 'original'); assert.equal(saved.backup.images.length, 2);
    assert.equal(JSON.stringify(saved.backup).includes(user.email), false);
    assert.match(saved.filename, /^intimo-patrizia-catalogo-.*\.json$/u);
  });
  await t.test('changed snapshots are rejected instead of downloading inconsistent data', async () => {
    let changed = false;
    adapter.useTestContext({ ...ctx, sdk: { ...sdk, getDocsFromServer: async query => {
      const snapshot = await sdk.getDocsFromServer(query);
      if (!changed) { changed = true; await sdk.setDoc(sdk.doc(db, 'catalogMeta', 'revision'), { version: randomUUID() }); }
      return snapshot;
    } } });
    try { await assert.rejects(backupApi.exportCatalogBackup(), /cambiato/u); }
    finally { adapter.useTestContext(ctx); }
    await assert.rejects(backupApi.exportCatalogBackup({ signal: AbortSignal.abort() }), error => error.name === 'AbortError');
  });
  await t.test('preview skips all existing records and cannot overwrite a changed product', async () => {
    const preview = await backupApi.previewCatalogRestore(JSON.stringify(saved.backup));
    assert.deepEqual(preview.summary, { categories: 0, products: 0, skipped: 2, warnings: [] });
    await adapter.catalogRequest('products/original/archive', 'POST', {});
    await assert.rejects(backupApi.applyCatalogRestore(preview.plan), /cambiato/u);
  });
  await t.test('a missing category and product are restored with IDs/photos intact as private drafts', async () => {
    await adapter.deleteProduct(seed, 'original');
    await adapter.catalogRequest('categories/original-category', 'DELETE');
    const preview = await backupApi.previewCatalogRestore(JSON.stringify(saved.backup));
    assert.equal(preview.summary.categories, 1); assert.equal(preview.summary.products, 1);
    const result = await backupApi.applyCatalogRestore(preview.plan);
    assert.deepEqual(result, { categories: 1, products: 1, skipped: 0 });
    const product = (await sdk.getDocFromServer(sdk.doc(db, 'products', 'original'))).data();
    assert.equal(product.published, false); assert.equal(product.sku, 'ART-1');
    assert.deepEqual(product.gallerySlots, [1]);
    assert.equal((await sdk.getDocFromServer(sdk.doc(db, 'productGalleryImages', 'original__1'))).data().hash, image(1).hash);
    assert.equal((await sdk.getDocFromServer(sdk.doc(db, 'catalogMeta', 'inventory'))).data().productCount, 1);
    await assert.rejects(backupApi.applyCatalogRestore(preview.plan), /anteprima/u);
  });
  await t.test('unverified/other identities cannot invoke export or trash and damaged photos block preview', async () => {
    fixture.user = { ...user, emailVerified: false };
    await assert.rejects(backupApi.exportCatalogBackup(), /gestore/u);
    fixture.user = { ...user, uid: 'other', email: 'other@example.test' };
    await assert.rejects(backupApi.loadCatalogTrash(), /gestore/u);
    fixture.user = user;
    const damaged = structuredClone(saved.backup); damaged.images[0].hash = 'b'.repeat(64);
    await adapter.deleteProduct(seed, 'original');
    await assert.rejects(backupApi.previewCatalogRestore(JSON.stringify(damaged)), /danneggiata/u);
    assert.equal((await sdk.getDocFromServer(sdk.doc(db, 'products', 'original'))).exists(), false);
  });
});
