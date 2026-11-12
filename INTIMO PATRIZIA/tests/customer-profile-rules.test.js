// Real Firestore Rules and customer-profile transactions. Loopback emulator only.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import * as sdk from 'firebase/firestore';
import { CATALOG_GROUPS } from '../src/catalog-taxonomy.js';

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
const enabled = Boolean(host);
if (enabled && !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host)) throw new Error('Customer profile tests require an explicit loopback Firestore emulator.');
const projectId = 'demo-customer-profiles';
const endpoint = host ? `http://${host}` : '';
const apps = [];
const databases = [];
const contextKeys = [];
const user = { uid: 'alice', email: 'not-copied@example.test', emailVerified: true };
let alice, bob, manager, unverified, anonymous, customer, secondCustomer, unverifiedCustomer;
sdk.setLogLevel('silent');

function context(label, token) {
  const app = initializeApp({ projectId, apiKey: 'demo-only', appId: 'demo-only' }, `customer-${label}-${randomUUID()}`);
  const db = sdk.getFirestore(app);
  const [hostname, port] = host.split(':');
  sdk.connectFirestoreEmulator(db, hostname, Number(port), token ? { mockUserToken: token } : {});
  apps.push(app);
  databases.push(db);
  return db;
}
const ref = (db, uid = user.uid) => sdk.doc(db, 'customerProfiles', uid);
const denied = operation => assert.rejects(operation, error => error.code === 'permission-denied');
const record = (patch = {}) => ({ displayName: '', interests: [], favoriteProductIds: [], updatedAt: sdk.serverTimestamp(), ...patch });

async function customerModule(db) {
  // Bind only the module's shared Firestore dependency to a real emulator SDK
  // connection with mockUserToken. The four production functions run unchanged,
  // without Vite configuration, Firebase Auth, a cloud project or test-only APIs.
  const key = `customer-profile-test-${randomUUID()}`;
  contextKeys.push(key);
  globalThis[key] = { db, sdk };
  const source = await readFile(new URL('../src/customer-profile.js', import.meta.url), 'utf8');
  assert.ok(source.includes("import { getFirestoreContext } from './firestore-catalog.js';"));
  assert.ok(source.includes("import { CATALOG_GROUPS } from './catalog-taxonomy.js';"));
  const bound = source
    .replace("import { getFirestoreContext } from './firestore-catalog.js';", `const getFirestoreContext = async () => globalThis[${JSON.stringify(key)}];`)
    .replace("import { CATALOG_GROUPS } from './catalog-taxonomy.js';", `import { CATALOG_GROUPS } from ${JSON.stringify(new URL('../src/catalog-taxonomy.js', import.meta.url).href)};`);
  return import(`data:text/javascript;base64,${Buffer.from(bound).toString('base64')}`);
}

before(async () => {
  if (!enabled) return;
  const content = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  const response = await fetch(`${endpoint}/emulator/v1/projects/${projectId}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ignore_errors: false, rules: { files: [{ name: 'firestore.rules', content }] } }),
  });
  const result = await response.json();
  assert.equal(response.ok, true, JSON.stringify(result));
  assert.deepEqual((result.issues || []).filter(issue => issue.severity === 'ERROR'), [], JSON.stringify(result));
  alice = context('alice', { sub: user.uid, email: user.email, email_verified: true });
  bob = context('bob', { sub: 'bob', email: 'bob@example.test', email_verified: true });
  manager = context('manager', { sub: 'manager', email: 'alessandroferrara01@libero.it', email_verified: true });
  unverified = context('unverified', { sub: 'unverified', email: 'unverified@example.test', email_verified: false });
  anonymous = context('anonymous');
  customer = await customerModule(alice);
  secondCustomer = await customerModule(context('alice-second-tab', { sub: user.uid, email_verified: true }));
  unverifiedCustomer = await customerModule(unverified);
});

after(async () => {
  await Promise.all(databases.map(db => sdk.terminate(db)));
  await Promise.all(apps.map(app => deleteApp(app)));
  for (const key of contextKeys) delete globalThis[key];
});

test('customer profiles are private, minimal and transaction-safe', {
  timeout: 180000,
  skip: !enabled ? 'Set FIRESTORE_EMULATOR_HOST after starting the local Firestore emulator; no cloud fallback.' : false,
}, async t => {
  t.beforeEach(async () => {
    const response = await fetch(`${endpoint}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    assert.equal(response.ok, true);
  });

  await t.test('reading an absent profile creates no document and saving copies no Auth metadata', async () => {
    assert.deepEqual(await customer.loadCustomerProfile(user), { displayName: '', interests: [], favoriteProductIds: [] });
    assert.equal((await sdk.getDocFromServer(ref(alice))).exists(), false);
    const saved = await customer.saveCustomerPreferences(user, { displayName: '  Patrizia  ', interests: ['intimo', 'profumi'] });
    assert.deepEqual(saved, { displayName: 'Patrizia', interests: ['intimo', 'profumi'], favoriteProductIds: [] });
    const snapshot = await sdk.getDocFromServer(ref(alice));
    assert.deepEqual(Object.keys(snapshot.data()).sort(), ['displayName', 'favoriteProductIds', 'interests', 'updatedAt']);
    assert.ok(snapshot.data().updatedAt instanceof sdk.Timestamp);
    assert.deepEqual(await customer.loadCustomerProfile(user), saved);
  });

  await t.test('unverified customers may create, read, update and delete their own profile', async () => {
    const customerUser = { uid: 'unverified', emailVerified: false };
    await unverifiedCustomer.saveCustomerPreferences(customerUser, { displayName: '', interests: [] });
    assert.deepEqual(await unverifiedCustomer.toggleCustomerFavorite(customerUser, 'product_123'), { displayName: '', interests: [], favoriteProductIds: ['product_123'] });
    assert.equal((await unverifiedCustomer.loadCustomerProfile(customerUser)).favoriteProductIds[0], 'product_123');
    await unverifiedCustomer.deleteCustomerProfile(customerUser);
    assert.equal((await sdk.getDocFromServer(ref(unverified, 'unverified'))).exists(), false);
  });

  await t.test('other users, anonymous visitors and the manager cannot access another customer profile', async () => {
    await sdk.setDoc(ref(alice), record());
    for (const db of [bob, anonymous, manager]) {
      await denied(sdk.getDocFromServer(ref(db)));
      await denied(sdk.setDoc(ref(db), record({ displayName: 'Changed' })));
      await denied(sdk.deleteDoc(ref(db)));
      await denied(sdk.setDoc(ref(db, 'alice-new'), record()));
    }
    await assert.rejects(customer.loadCustomerProfile({ uid: 'bob' }), error => error.code === 'permission-denied');
    await denied(sdk.getDocFromServer(sdk.doc(alice, 'customerProfiles/alice/private/hidden')));
  });

  await t.test('all collection listing is denied, including a query constrained to the caller UID', async () => {
    await sdk.setDoc(ref(alice), record());
    for (const db of [alice, bob, manager, unverified, anonymous]) {
      await denied(sdk.getDocsFromServer(sdk.query(sdk.collection(db, 'customerProfiles'), sdk.limit(1))));
    }
    await denied(sdk.getDocsFromServer(sdk.query(sdk.collection(alice, 'customerProfiles'), sdk.where(sdk.documentId(), '==', user.uid), sdk.limit(1))));
  });

  await t.test('unknown, omitted, wrongly typed fields and timestamp tampering are denied', async () => {
    const invalid = [
      { email: user.email }, { marketing: true }, { roles: ['manager'] }, { clickHistory: [] }, { extra: null },
      { displayName: null }, { displayName: 5 }, { displayName: 'n'.repeat(61) },
      { interests: 'intimo' }, { interests: ['invalid'] }, { interests: ['intimo', 'intimo'] },
      { interests: [null] }, { interests: [{ id: 'intimo' }] }, { interests: ['intimo', 'profumi', 2] },
      { favoriteProductIds: 'product' }, { updatedAt: new Date(0) }, { updatedAt: null }, { updatedAt: 'now' },
    ];
    for (const patch of invalid) await denied(sdk.setDoc(ref(alice), record(patch)));
    for (const key of ['displayName', 'interests', 'favoriteProductIds', 'updatedAt']) {
      const missing = record();
      delete missing[key];
      await denied(sdk.setDoc(ref(alice), missing));
    }
    await sdk.setDoc(ref(alice), record());
    await denied(sdk.updateDoc(ref(alice), { email: user.email, updatedAt: sdk.serverTimestamp() }));
    await denied(sdk.updateDoc(ref(alice), { displayName: 'Valid name', updatedAt: new Date(0) }));
    await sdk.setDoc(ref(alice), record({ displayName: 'n'.repeat(60), interests: CATALOG_GROUPS.map(group => group.id) }));
  });

  await t.test('favorite schema validates every entry, uniqueness, safe IDs and the 200-item boundary', async () => {
    const valid = Array.from({ length: 200 }, (_, index) => `product_${index}`);
    const invalid = [
      [''], ['unsafe/id'], ['space id'], ['dot.id'], ['a|b'], ['é'], ['x'.repeat(81)],
      ['a', 'a'], [null], [2], [true], [{ id: 'a' }],
      [...valid, 'product_200'], [...valid.slice(0, 199), null], [...valid.slice(0, 199), 'unsafe/id'],
    ];
    for (const favoriteProductIds of invalid) await denied(sdk.setDoc(ref(alice), record({ favoriteProductIds })));
    assert.throws(() => sdk.setDoc(ref(alice), record({ favoriteProductIds: [['a']] })), error => error.code === 'invalid-argument');
    await sdk.setDoc(ref(alice), record({ favoriteProductIds: ['A_b-9', 'x'.repeat(80), randomUUID()] }));
    await sdk.setDoc(ref(alice), record({ favoriteProductIds: valid }));
    assert.equal((await sdk.getDocFromServer(ref(alice))).data().favoriteProductIds.length, 200);
  });

  await t.test('concurrent tabs preserve favorites and preferences without lost updates', async () => {
    await customer.saveCustomerPreferences(user, { displayName: 'Prima', interests: ['intimo'] });
    await Promise.all([
      customer.saveCustomerPreferences(user, { displayName: 'Dopo', interests: ['profumi'] }),
      secondCustomer.toggleCustomerFavorite(user, 'first_product'),
      customer.toggleCustomerFavorite(user, 'second-product'),
    ]);
    const saved = await customer.loadCustomerProfile(user);
    assert.equal(saved.displayName, 'Dopo');
    assert.deepEqual(saved.interests, ['profumi']);
    assert.deepEqual(saved.favoriteProductIds.toSorted(), ['first_product', 'second-product']);
    await Promise.all([customer.toggleCustomerFavorite(user, 'same_product'), secondCustomer.toggleCustomerFavorite(user, 'same_product')]);
    assert.equal((await customer.loadCustomerProfile(user)).favoriteProductIds.includes('same_product'), false);
  });

  await t.test('favorite limit still allows removal and preferences preserve existing favorites', async () => {
    const favoriteProductIds = Array.from({ length: 200 }, (_, index) => `product_${index}`);
    await sdk.setDoc(ref(alice), record({ favoriteProductIds }));
    await assert.rejects(customer.toggleCustomerFavorite(user, 'one_too_many'), error => error.code === 'favorites-limit');
    assert.equal((await customer.toggleCustomerFavorite(user, 'product_0')).favoriteProductIds.length, 199);
    assert.equal((await customer.toggleCustomerFavorite(user, 'new_product')).favoriteProductIds.length, 200);
    const saved = await customer.saveCustomerPreferences(user, { displayName: '', interests: [] });
    assert.equal(saved.favoriteProductIds.length, 200);
    assert.equal(saved.favoriteProductIds.includes('new_product'), true);
  });

  await t.test('client rejects unsafe input before persistence and deletion affects only its own profile', async () => {
    for (const call of [
      () => customer.loadCustomerProfile(null),
      () => customer.saveCustomerPreferences(user, { displayName: 'n'.repeat(61), interests: [] }),
      () => customer.saveCustomerPreferences(user, { displayName: '', interests: ['intimo', 'intimo'] }),
      () => customer.saveCustomerPreferences(user, { displayName: '', interests: ['unknown'] }),
      () => customer.saveCustomerPreferences(user, { displayName: '', interests: [], email: user.email }),
      () => customer.toggleCustomerFavorite(user, '../unsafe'),
    ]) await assert.rejects(call, error => error.status === 400 || error.status === 401);
    assert.equal((await sdk.getDocFromServer(ref(alice))).exists(), false);
    await sdk.setDoc(ref(alice), record());
    await sdk.setDoc(ref(bob, 'bob'), record({ displayName: 'Bob' }));
    await customer.deleteCustomerProfile(user);
    assert.equal((await sdk.getDocFromServer(ref(alice))).exists(), false);
    assert.equal((await sdk.getDocFromServer(ref(bob, 'bob'))).data().displayName, 'Bob');
  });
});
