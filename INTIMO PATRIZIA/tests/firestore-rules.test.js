// Real Firestore Rules integration tests. Never connects to a cloud project.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, collection, query, where, limit, getDocFromServer, getDocsFromServer, writeBatch, serverTimestamp, terminate, setLogLevel } from 'firebase/firestore';

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
const enabled = Boolean(host);
if (enabled && !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host)) throw new Error('Rules tests require an explicit loopback Firestore emulator.');
const projectId = 'demo-intimopatrizia-rules';
const endpoint = host ? `http://${host}` : '';
const apps = [];
const databases = [];
let owner, admin, anonymous, visitor, unverified, formerAdmin, normalizedOwner;
setLogLevel('silent');
function context(label, token) {
  const app = initializeApp({ projectId, apiKey: 'demo-only', appId: 'demo-only' }, `rules-${label}-${randomUUID()}`);
  const db = getFirestore(app);
  const [hostname, port] = host.split(':');
  connectFirestoreEmulator(db, hostname, Number(port), token ? { mockUserToken: token } : {});
  apps.push(app); databases.push(db);
  return db;
}
const ref = (db, path) => doc(db, path);
const denied = operation => assert.rejects(operation, error => error.code === 'permission-denied');
const stamp = () => serverTimestamp();
const cat = (id, overrides = {}) => ({ name: 'Reparto ' + id, slug: id, description: '', order: 0, published: true, image: '', productCount: 0, lastProductId: '', updatedAt: stamp(), ...overrides });
const item = (id, categoryId = 'a', overrides = {}) => ({ name: 'Prodotto ' + id, categoryId, description: '', price: 12.5, sizes: ['S', 'M'], colors: ['Salvia'], material: '', image: '', imageAlt: '', available: true, published: true, isDemo: false, order: 0, updatedAt: stamp(), ...overrides });
const image = overrides => ({ base64: 'UklGRg==', mime: 'image/webp', bytes: 4, width: 32, height: 40, hash: 'a'.repeat(64), updatedAt: stamp(), ...overrides });
const inventory = overrides => ({ categoryCount: 0, productCount: 0, lastCategoryId: '', lastProductId: '', updatedAt: stamp(), ...overrides });
async function data(db, path) { return (await getDocFromServer(ref(db, path))).data(); }
function meta(batch, db, values) {
  batch.set(ref(db, 'catalogMeta/inventory'), { ...values, updatedAt: stamp() });
  batch.set(ref(db, 'catalogMeta/revision'), { version: randomUUID() });
}
async function seed(documents) {
  const batch = writeBatch(admin);
  for (const [path, values] of Object.entries(documents)) batch.set(ref(admin, path), values);
  await batch.commit();
}
async function seedBase({ photo = false, legacy = false } = {}) {
  const a = cat('a', { productCount: 1, lastProductId: 'p' });
  const inv = inventory({ categoryCount: 2, productCount: 1, lastCategoryId: 'b', lastProductId: 'p' });
  if (legacy) { delete a.lastProductId; delete inv.lastCategoryId; delete inv.lastProductId; inv.revision = randomUUID(); }
  await seed({
    'categories/a': a, 'categories/b': cat('b'),
    ...(legacy ? {} : { 'categorySlugs/a': { categoryId: 'a' }, 'categorySlugs/b': { categoryId: 'b' } }),
    'products/p': item('p', 'a', photo ? { image: '/api/images/p', imageAlt: 'Fotografia del prodotto' } : {}),
    ...(photo ? { 'productImages/p': image() } : {}),
    'catalogMeta/inventory': inv, 'catalogMeta/revision': { version: randomUUID() },
  });
}
async function createCategory(id, overrides = {}, db = owner) {
  const current = await data(owner, 'catalogMeta/inventory') || inventory();
  const batch = writeBatch(db);
  const record = cat(id, overrides);
  batch.set(ref(db, `categories/${id}`), record);
  batch.set(ref(db, `categorySlugs/${record.slug}`), { categoryId: id });
  meta(batch, db, { ...current, categoryCount: current.categoryCount + 1, lastCategoryId: id });
  await batch.commit();
}
async function editProduct(overrides = {}, options = {}) {
  const current = await data(owner, 'products/p');
  const currentInventory = await data(owner, 'catalogMeta/inventory');
  const batch = writeBatch(owner);
  const next = { ...current, ...overrides, updatedAt: stamp() };
  for (const key of options.omit || []) delete next[key];
  batch.set(ref(owner, 'products/p'), next);
  if (current.categoryId !== next.categoryId && options.parents !== false) {
    for (const [id, delta] of [[current.categoryId, -1], [next.categoryId, 1]]) {
      const parent = await data(owner, `categories/${id}`);
      if (parent) batch.update(ref(owner, `categories/${id}`), { productCount: parent.productCount + delta, lastProductId: 'p', updatedAt: stamp() });
    }
  }
  if (options.image) batch.set(ref(owner, 'productImages/p'), image(options.image));
  if (options.removeImage) batch.delete(ref(owner, 'productImages/p'));
  meta(batch, owner, { categoryCount: currentInventory.categoryCount, productCount: currentInventory.productCount, lastCategoryId: currentInventory.lastCategoryId || '', lastProductId: currentInventory.lastProductId || '' });
  await batch.commit();
}
async function createProduct(id, overrides = {}, photo) {
  const current = await data(owner, 'catalogMeta/inventory');
  const parent = await data(owner, 'categories/a');
  const batch = writeBatch(owner);
  batch.set(ref(owner, `products/${id}`), item(id, 'a', overrides));
  batch.update(ref(owner, 'categories/a'), { productCount: parent.productCount + 1, lastProductId: id, updatedAt: stamp() });
  if (photo) batch.set(ref(owner, `productImages/${id}`), image(photo));
  meta(batch, owner, { ...current, productCount: current.productCount + 1, lastProductId: id });
  await batch.commit();
}
before(async () => {
  if (!enabled) return;
  const content = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  const response = await fetch(`${endpoint}/emulator/v1/projects/${projectId}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ignore_errors: false, rules: { files: [{ name: 'firestore.rules', content }] } }) });
  const result = await response.json();
  assert.equal(response.ok, true, JSON.stringify(result));
  assert.deepEqual((result.issues || []).filter(issue => issue.severity === 'ERROR'), [], JSON.stringify(result));
  admin = context('seed-admin', 'owner');
  owner = context('owner', { sub: 'owner', email: 'alessandroferrara01@libero.it', email_verified: true });
  normalizedOwner = context('normalized-owner', { sub: 'owner-normalized', email: ' AlessandroFerrara01@Libero.IT ', email_verified: true });
  anonymous = context('anonymous');
  visitor = context('visitor', { sub: 'visitor', email: 'visitor@example.test', email_verified: true });
  unverified = context('unverified', { sub: 'unverified', email: 'alessandroferrara01@libero.it', email_verified: false, admin: true });
  formerAdmin = context('former-admin', { sub: 'former-admin', email: 'former@example.test', email_verified: true, admin: true });
});
beforeEach(async () => {
  if (!enabled) return;
  const response = await fetch(`${endpoint}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(response.ok, true);
});
after(async () => {
  await Promise.all(databases.map(db => terminate(db)));
  await Promise.all(apps.map(app => deleteApp(app)));
});

test('Firestore Security Rules integration against loopback emulator', { timeout: 180000, skip: !enabled ? 'Set FIRESTORE_EMULATOR_HOST after starting the local Firestore emulator; no cloud fallback.' : false }, async t => {
  t.beforeEach(async () => {
    const response = await fetch(`${endpoint}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    assert.equal(response.ok, true);
    await seedBase();
  });
  await t.test('only verified owner can probe missing permission marker; no client writes to marker', async () => {
    assert.equal((await getDocFromServer(ref(owner, 'catalogAccess/manager'))).exists(), false);
    assert.equal((await getDocFromServer(ref(normalizedOwner, 'catalogAccess/manager'))).exists(), false);
    for (const db of [anonymous, visitor, unverified, formerAdmin]) {
      await denied(getDocFromServer(ref(db, 'catalogAccess/manager')));
      const batch = writeBatch(db); batch.set(ref(db, 'catalogMeta/revision'), { version: randomUUID() }); await denied(batch.commit());
    }
    const batch = writeBatch(owner); batch.set(ref(owner, 'catalogAccess/manager'), { admin: true }); await denied(batch.commit());
  });
  await t.test('anonymous queries expose only public real products and public parent categories', async () => {
    await seedBase({ photo: true });
    await seed({ 'categories/hidden': cat('hidden', { published: false }), 'products/draft': item('draft', 'a', { published: false }), 'products/demo': item('demo', 'a', { isDemo: true }), 'products/hidden-parent': item('hidden-parent', 'hidden') });
    await seed({
      'products/demo': item('demo', 'a', { isDemo: true, image: '/api/images/demo', imageAlt: 'Esempio' }),
      'productImages/demo': image(),
      'products/hidden-parent': item('hidden-parent', 'hidden', { image: '/api/images/hidden-parent', imageAlt: 'Riservata' }),
      'productImages/hidden-parent': image(),
    });
    const categories = await getDocsFromServer(query(collection(anonymous, 'categories'), where('published', '==', true), limit(50)));
    assert.deepEqual(categories.docs.map(snapshot => snapshot.id).sort(), ['a', 'b']);
    const products = await getDocsFromServer(query(collection(anonymous, 'products'), where('categoryId', '==', 'a'), where('published', '==', true), where('isDemo', '==', false), limit(100)));
    assert.deepEqual(products.docs.map(snapshot => snapshot.id), ['p']);
    assert.equal((await getDocFromServer(ref(anonymous, 'productImages/p'))).data().mime, 'image/webp');
    for (const path of ['products/draft', 'products/demo', 'products/hidden-parent', 'productImages/demo', 'productImages/hidden-parent', 'categories/hidden', 'catalogMeta/inventory', 'categorySlugs/a']) await denied(getDocFromServer(ref(anonymous, path)));
    await denied(getDocsFromServer(query(collection(anonymous, 'products'), limit(100))));
    await denied(getDocsFromServer(query(collection(anonymous, 'categories'), limit(50))));
    await denied(getDocsFromServer(query(collection(anonymous, 'productImages'), limit(1))));
    await denied(getDocsFromServer(query(collection(anonymous, 'categories'), where('published', '==', true))));
    assert.equal((await getDocsFromServer(query(collection(owner, 'products'), limit(100)))).size, 4);
    assert.equal(Object.keys((await getDocFromServer(ref(anonymous, 'catalogMeta/revision'))).data()).join(), 'version');
  });
  await t.test('product lists accept current 100 and legacy 200 pages; larger pages and category lists above 50 are denied', async () => {
    for (const db of [anonymous, owner]) {
      const publicProducts = [where('categoryId', '==', 'a'), where('published', '==', true), where('isDemo', '==', false)];
      const publicCategories = [where('published', '==', true)];
      assert.equal((await getDocsFromServer(query(collection(db, 'products'), ...publicProducts, limit(100)))).size, 1);
      assert.equal((await getDocsFromServer(query(collection(db, 'products'), ...publicProducts, limit(200)))).size, 1);
      await denied(getDocsFromServer(query(collection(db, 'products'), ...publicProducts, limit(201))));
      await denied(getDocsFromServer(query(collection(db, 'products'), ...publicProducts)));
      assert.equal((await getDocsFromServer(query(collection(db, 'categories'), ...publicCategories, limit(50)))).size, 2);
      await denied(getDocsFromServer(query(collection(db, 'categories'), ...publicCategories, limit(51))));
      await denied(getDocsFromServer(query(collection(db, 'categories'), ...publicCategories)));
    }
    assert.equal((await getDocsFromServer(query(collection(owner, 'products'), limit(200)))).size, 1);
    await denied(getDocsFromServer(query(collection(owner, 'products'), limit(201))));
    await denied(getDocsFromServer(query(collection(owner, 'categories'), limit(51))));
  });
  await t.test('visitors cannot create, update, delete, grant roles or read draft photographs', async () => {
    await seedBase({ photo: true });
    await seed({ 'products/p': item('p', 'a', { published: false, image: '/api/images/p', imageAlt: 'Fotografia' }) });
    for (const db of [anonymous, visitor, unverified, formerAdmin]) {
      await denied(getDocFromServer(ref(db, 'products/p')));
      await denied(getDocFromServer(ref(db, 'productImages/p')));
      for (const action of ['set', 'update', 'delete']) {
        const batch = writeBatch(db);
        if (action === 'set') batch.set(ref(db, 'categories/new'), cat('new'));
        if (action === 'update') batch.update(ref(db, 'products/p'), { published: true });
        if (action === 'delete') batch.delete(ref(db, 'products/p'));
        await denied(batch.commit());
      }
      const batch = writeBatch(db); batch.set(ref(db, 'users/self'), { admin: true }); await denied(batch.commit());
    }
    assert.equal((await getDocFromServer(ref(owner, 'productImages/p'))).exists(), true);
  });
  await t.test('owner can create a fresh category atomically with unique slug, counters and revision', async () => {
    // Use a separate empty emulator state within this sequential suite.
    await fetch(`${endpoint}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    await createCategory('fresh');
    assert.equal((await data(owner, 'catalogMeta/inventory')).categoryCount, 1);
    assert.equal((await data(owner, 'categorySlugs/fresh')).categoryId, 'fresh');
    const before = (await data(owner, 'catalogMeta/revision')).version;
    await denied(createCategory('duplicate', { slug: 'fresh' }));
    assert.equal((await data(owner, 'catalogMeta/revision')).version, before);
  });
  await t.test('owner can edit and move products but cannot physically delete; privileged local recovery setup keeps counters consistent', async () => {
    await fetch(`${endpoint}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    await seedBase();
    await createProduct('new');
    await editProduct({ image: '/api/images/p', imageAlt: 'Fotografia' }, { image: {} });
    await editProduct({ categoryId: 'b' });
    assert.equal((await data(owner, 'categories/a')).productCount, 1);
    assert.equal((await data(owner, 'categories/b')).productCount, 1);
    await editProduct({ name: 'Nome aggiornato', published: false });
    await denied(getDocFromServer(ref(anonymous, 'productImages/p')));
    await editProduct({ image: '', imageAlt: '' }, { removeImage: true });
    const inv = await data(owner, 'catalogMeta/inventory');
    const batch = writeBatch(owner);
    batch.delete(ref(owner, 'products/p')); batch.delete(ref(owner, 'productImages/p'));
    batch.update(ref(owner, 'categories/b'), { productCount: 0, lastProductId: 'p', updatedAt: stamp() });
    meta(batch, owner, { ...inv, productCount: inv.productCount - 1, lastProductId: 'p' });
    await denied(batch.commit());
    assert.equal((await getDocFromServer(ref(owner, 'products/p'))).exists(), true);
    // Simulate accidental deletion by a privileged operator only in this
    // disposable emulator namespace; the website client is never allowed it.
    const accidental = writeBatch(admin);
    accidental.delete(ref(admin, 'products/p')); accidental.delete(ref(admin, 'productImages/p'));
    accidental.update(ref(admin, 'categories/b'), { productCount: 0, lastProductId: 'p', updatedAt: stamp() });
    meta(accidental, admin, { ...inv, productCount: inv.productCount - 1, lastProductId: 'p' });
    await accidental.commit();
    assert.equal((await getDocFromServer(ref(owner, 'products/p'))).exists(), false);
    const current = await data(owner, 'catalogMeta/inventory');
    const deletion = writeBatch(owner); deletion.delete(ref(owner, 'categories/b')); deletion.delete(ref(owner, 'categorySlugs/b'));
    meta(deletion, owner, { ...current, categoryCount: current.categoryCount - 1, lastCategoryId: 'b' }); await deletion.commit();
    assert.equal((await data(owner, 'catalogMeta/inventory')).productCount, 1);
  });
  await t.test('schema rejects unknown, missing, oversized and wrong-type product fields on updates', async () => {
    const invalid = [
      { extra: 'injected' }, { name: '' }, { name: 'x'.repeat(161) }, { categoryId: 'missing' }, { description: 'x'.repeat(3001) },
      { price: -1 }, { price: 1.234 }, { price: '12' }, { price: 100001 }, { sizes: Array(21).fill('S') }, { colors: [4] },
      { sizes: ['S|M'] }, { sizes: [''] }, { colors: ['x'.repeat(51)] }, { colors: [null] },
      { sizes: Array(19).fill('S').concat({ hidden: true }) }, { material: 'x'.repeat(201) }, { image: 'javascript:alert(1)' },
      { image: '/assets/../secret.svg' }, { image: '/api/images/other' }, { imageAlt: 'x'.repeat(251) },
      { available: 'true' }, { published: 1 }, { isDemo: 'false' }, { order: -1 }, { order: 1.5 }, { order: 10000 },
      { updatedAt: new Date(0) },
    ];
    // editProduct supplies a fresh timestamp; timestamp tampering tested separately.
    for (const patch of invalid.filter(patch => !('updatedAt' in patch))) await denied(editProduct(patch));
    for (const field of ['name','categoryId','description','price','sizes','colors','material','image','imageAlt','available','published','isDemo','order','updatedAt']) await denied(editProduct({}, { omit: [field] }));
    const batch = writeBatch(owner); batch.update(ref(owner, 'products/p'), { updatedAt: new Date(0) }); await denied(batch.commit());
    await editProduct({ sizes: Array.from({ length: 20 }, (_, index) => 'T' + index), colors: Array.from({ length: 20 }, (_, index) => 'C' + index), price: 19.99 });
  });
  await t.test('atomic product creation accepts counts above 200 through 5000 and rejects the next product', async () => {
    // Represent existing large inventories without seeding thousands of unrelated records.
    await seed({
      'categories/a': cat('a', { productCount: 200, lastProductId: 'p' }),
      'catalogMeta/inventory': inventory({ categoryCount: 2, productCount: 200, lastCategoryId: 'b', lastProductId: 'p' }),
    });
    await createProduct('above-200');
    assert.equal((await data(owner, 'categories/a')).productCount, 201);
    assert.equal((await data(owner, 'catalogMeta/inventory')).productCount, 201);
    await seed({
      'categories/a': cat('a', { productCount: 4999, lastProductId: 'above-200' }),
      'catalogMeta/inventory': inventory({ categoryCount: 2, productCount: 4999, lastCategoryId: 'b', lastProductId: 'above-200' }),
    });
    await createProduct('at-cap');
    assert.equal((await data(owner, 'categories/a')).productCount, 5000);
    assert.equal((await data(owner, 'catalogMeta/inventory')).productCount, 5000);
    const revision = (await data(owner, 'catalogMeta/revision')).version;
    await denied(createProduct('over-cap'));
    assert.equal((await getDocFromServer(ref(owner, 'products/over-cap'))).exists(), false);
    assert.equal((await data(owner, 'categories/a')).productCount, 5000);
    assert.equal((await data(owner, 'catalogMeta/inventory')).productCount, 5000);
    assert.equal((await data(owner, 'catalogMeta/revision')).version, revision);
  });
  await t.test('counters cannot be forged, replayed or decremented without the referenced mutation', async () => {
    const inv = await data(owner, 'catalogMeta/inventory');
    for (const patch of [{ categoryCount: inv.categoryCount - 1, lastCategoryId: 'a' }, { productCount: inv.productCount - 1, lastProductId: 'new' }, { productCount: 5001 }, { categoryCount: 51 }, { extra: true }]) {
      const batch = writeBatch(owner); meta(batch, owner, { ...inv, ...patch }); await denied(batch.commit());
    }
    const batch = writeBatch(owner); batch.update(ref(owner, 'categories/a'), { productCount: 0, lastProductId: 'new', updatedAt: stamp() }); meta(batch, owner, inv); await denied(batch.commit());
    const deletion = writeBatch(owner); deletion.delete(ref(owner, 'categories/a')); deletion.delete(ref(owner, 'categorySlugs/a')); meta(deletion, owner, { ...inv, categoryCount: inv.categoryCount - 1, lastCategoryId: 'a' }); await denied(deletion.commit());
    await denied(editProduct({ categoryId: 'b' }, { parents: false }));
  });
  await t.test('category validator, private metadata and opaque revision reject malformed writes', async () => {
    for (const patch of [{ name: '' }, { name: 'x'.repeat(101) }, { slug: 'INVALID' }, { description: 'x'.repeat(1501) }, { order: 1.5 }, { published: 'true' }, { image: '//external.test/x' }, { productCount: -1 }, { lastProductId: '/bad' }, { extra: true }]) {
      const existing = await data(owner, 'categories/a');
      const inv = await data(owner, 'catalogMeta/inventory');
      const batch = writeBatch(owner); batch.set(ref(owner, 'categories/a'), { ...existing, ...patch, updatedAt: stamp() }); meta(batch, owner, inv); await denied(batch.commit());
    }
    for (const values of [{ version: 'owner@example.test' }, { version: randomUUID(), ownerEmail: 'private@example.test' }]) {
      const batch = writeBatch(owner); batch.set(ref(owner, 'catalogMeta/revision'), values); await denied(batch.commit());
    }
    await denied(getDocsFromServer(query(collection(owner, 'catalogMeta'), limit(2))));
    await denied(getDocsFromServer(query(collection(owner, 'categorySlugs'), limit(2))));
    // The revision must advance atomically; a valid data write alone is rejected.
    const standalone = writeBatch(owner); standalone.update(ref(owner, 'products/p'), { name: 'Senza revisione', updatedAt: stamp() }); await denied(standalone.commit());
    const replay = writeBatch(owner); replay.set(ref(owner, 'catalogMeta/revision'), await data(owner, 'catalogMeta/revision')); await denied(replay.commit());
    const grant = writeBatch(owner); grant.set(ref(owner, 'users/owner'), { admin: true }); await denied(grant.commit());
    await denied(getDocFromServer(ref(owner, 'categories/a/private/secret')));
  });
  await t.test('image schema rejects bad base64, formats, size, dimensions and unknown fields', async () => {
    await editProduct({ image: '/api/images/p', imageAlt: 'Foto' }, { image: {} });
    for (const patch of [{ base64: '<svg/>' }, { mime: 'image/svg+xml' }, { mime: 'image/jpeg' }, { bytes: 307201, base64: 'A'.repeat(409604) }, { bytes: 0 }, { bytes: 3 }, { width: 15 }, { height: 4097 }, { width: '32' }, { hash: 'bad' }, { extra: 'data' }]) {
      const batch = writeBatch(owner); batch.set(ref(owner, 'productImages/p'), image(patch)); batch.set(ref(owner, 'catalogMeta/revision'), { version: randomUUID() }); await denied(batch.commit());
    }
    const detached = writeBatch(owner); detached.set(ref(owner, 'productImages/orphan'), image()); detached.set(ref(owner, 'catalogMeta/revision'), { version: randomUUID() }); await denied(detached.commit());
    // Rules validate encoded format/length only; they cannot decode a bitmap or verify SHA256.
    const upperBoundary = writeBatch(owner); upperBoundary.set(ref(owner, 'productImages/p'), image({ base64: 'A'.repeat(409600), bytes: 307200 })); upperBoundary.set(ref(owner, 'catalogMeta/revision'), { version: randomUUID() }); await upperBoundary.commit();
  });
  await t.test('legacy metadata normalizes on valid CRUD without requiring hidden migrations', async () => {
    await fetch(`${endpoint}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    await seedBase({ legacy: true });
    await editProduct({ name: 'Legacy aggiornato' });
    const inv = await data(owner, 'catalogMeta/inventory');
    assert.deepEqual(Object.keys(inv).sort(), ['categoryCount','lastCategoryId','lastProductId','productCount','updatedAt']);
    await createProduct('legacy-new');
    assert.equal((await data(owner, 'categories/a')).lastProductId, 'legacy-new');
  });
});
