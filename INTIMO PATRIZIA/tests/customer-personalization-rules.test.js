import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import * as sdk from 'firebase/firestore';

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (host && !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host)) throw new Error('Use an explicit loopback emulator.');
const projectId = 'demo-customer-personalization';
const apps = [], connections = [];
const key = `personalization-${randomUUID()}`;
const user = { uid: 'alice' };
let alice, bob, manager, anonymous, module;
sdk.setLogLevel('silent');
function connection(uid, extra = {}) {
  const app = initializeApp({ projectId, apiKey: 'test-only', appId: 'test-only' }, randomUUID());
  const db = sdk.getFirestore(app);
  sdk.connectFirestoreEmulator(db, host.split(':')[0], Number(host.split(':')[1]), uid ? { mockUserToken: { sub: uid, email_verified: false, ...extra } } : {});
  apps.push(app); connections.push(db); return db;
}
const ref = (db, uid = user.uid) => sdk.doc(db, 'customerPersonalization', uid);
const record = patch => ({ enabled: true, policyVersion: '2026-10-20-session-v1', updatedAt: sdk.serverTimestamp(), ...patch });
const denied = promise => assert.rejects(promise, error => error.code === 'permission-denied');
before(async () => {
  if (!host) return;
  const response = await fetch(`http://${host}/emulator/v1/projects/${projectId}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ignore_errors: false, rules: { files: [{ name: 'firestore.rules', content: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') }] } }),
  });
  assert.equal(response.ok, true);
  const result = await response.json();
  assert.deepEqual((result.issues || []).filter(issue => issue.severity === 'ERROR'), []);
  alice = connection('alice'); bob = connection('bob'); anonymous = connection();
  manager = connection('manager', { email: 'alessandroferrara01@libero.it', email_verified: true });
  globalThis[key] = { db: alice, sdk };
  const source = (await readFile(new URL('../src/customer-personalization.js', import.meta.url), 'utf8'))
    .replace("import { getFirestoreContext } from './firestore-catalog.js';", `const getFirestoreContext = async () => globalThis[${JSON.stringify(key)}];`);
  module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
});
after(async () => {
  await Promise.all(connections.map(db => sdk.terminate(db)));
  await Promise.all(apps.map(app => deleteApp(app)));
  delete globalThis[key];
});

test('private preparatory choice: actual SDK and Firestore rules', { skip: !host, timeout: 120000 }, async t => {
  t.beforeEach(async () => {
    const result = await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    assert.equal(result.ok, true);
  });
  await t.test('missing choice stays absent, explicit save creates minimal server-dated record', async () => {
    assert.equal((await module.loadCustomerPersonalization(user)).enabled, false);
    assert.equal((await sdk.getDocFromServer(ref(alice))).exists(), false);
    await module.saveCustomerPersonalization(user, true);
    const saved = (await sdk.getDocFromServer(ref(alice))).data();
    assert.deepEqual(Object.keys(saved).sort(), ['enabled', 'policyVersion', 'updatedAt']);
    assert.equal(saved.enabled, true);
    assert.ok(saved.updatedAt instanceof sdk.Timestamp);
    assert.equal((await sdk.getDocFromServer(sdk.doc(alice, 'customerProfiles/alice'))).exists(), false);
  });
  await t.test('own unverified account may change and delete only its own choice', async () => {
    await module.saveCustomerPersonalization(user, true);
    assert.equal((await module.loadCustomerPersonalization(user)).enabled, true);
    await module.saveCustomerPersonalization(user, false);
    assert.equal((await module.loadCustomerPersonalization(user)).enabled, false);
    await module.deleteCustomerPersonalization(user);
    assert.equal((await sdk.getDocFromServer(ref(alice))).exists(), false);
    assert.equal((await module.loadCustomerPersonalization(user)).enabled, false);
  });
  await t.test('other users, visitors and store manager cannot read, alter or delete another choice', async () => {
    await module.saveCustomerPersonalization(user, true);
    for (const db of [bob, manager, anonymous]) {
      await denied(sdk.getDocFromServer(ref(db)));
      await denied(sdk.setDoc(ref(db), record({ enabled: false })));
      await denied(sdk.deleteDoc(ref(db)));
    }
    await denied(module.saveCustomerPersonalization({ uid: 'bob' }, true));
  });
  await t.test('no listing, nested paths or navigation event writes are allowed', async () => {
    for (const db of [alice, bob, manager, anonymous]) {
      await denied(sdk.getDocsFromServer(sdk.query(sdk.collection(db, 'customerPersonalization'), sdk.limit(1))));
    }
    for (const path of ['customerPersonalization/alice/events/click', 'customerSignals/alice', 'customerSearches/alice']) {
      await denied(sdk.setDoc(sdk.doc(alice, path), { click: 'product', query: 'pigiama' }));
    }
  });
  await t.test('schema rejects unknown fields, old policy, forged time and incomplete records', async () => {
    for (const patch of [{ enabled: 'yes' }, { policyVersion: 'other' }, { updatedAt: new Date(0) }, { email: 'x@example.test' }, { clicks: [] }]) {
      await denied(sdk.setDoc(ref(alice), record(patch)));
    }
    for (const field of ['enabled', 'policyVersion', 'updatedAt']) {
      const data = record(); delete data[field]; await denied(sdk.setDoc(ref(alice), data));
    }
  });
  await t.test('invalid application input cannot create a choice', async () => {
    for (const enabled of ['true', 1, null, {}]) await assert.rejects(module.saveCustomerPersonalization(user, enabled), error => error.code === 'invalid-preference');
    await assert.rejects(module.saveCustomerPersonalization({ uid: 'unsafe/id' }, true), error => error.code === 'unauthenticated');
    assert.equal((await sdk.getDocFromServer(ref(alice))).exists(), false);
  });
});
