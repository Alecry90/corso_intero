import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { sanitizeNavigationSignals } from '../src/navigation-signals.js';

const allowedGroups = new Set(['intimo', 'pigiami-e-relax', 'biancheria-casa', 'bebe-e-maternita', 'stagioni-e-occasioni', 'profumi']);

test('session normalization retains only the bounded navigation signal schema', () => {
  const input = {
    groupScores: { intimo: 12, profumi: 7, unknown: 42 },
    recentProductIds: ['canotta', 'profumo-consultato'],
    query: 'dato privato', email: 'cliente@example.test', timestamp: Date.now(), rawProductName: 'Nome riservato',
  };
  const before = structuredClone(input);
  const result = sanitizeNavigationSignals(input);
  assert.deepEqual(result, { groupScores: { intimo: 12, profumi: 7 }, recentProductIds: ['canotta', 'profumo-consultato'] });
  assert.deepEqual(input, before, 'normalization must not alter the supplied record');
  assert.deepEqual(Object.keys(result).sort(), ['groupScores', 'recentProductIds']);
});

test('malformed or excessive scores cannot expand the six-group scope or weight bound', () => {
  const result = sanitizeNavigationSignals({
    groupScores: JSON.parse('{"intimo":1000000,"pigiami-e-relax":-3,"biancheria-casa":"17","bebe-e-maternita":null,"stagioni-e-occasioni":3.7,"profumi":5,"__proto__":{"polluted":true},"unknown":8}'),
    recentProductIds: [],
  });
  assert.ok(Object.keys(result.groupScores).every(key => allowedGroups.has(key)));
  assert.ok(Object.values(result.groupScores).every(score => Number.isInteger(score) && score >= 1 && score <= 1000));
  assert.equal(result.groupScores.profumi, 5);
  assert.equal({}.polluted, undefined);
});

test('recent IDs remain unique, safe and capped without carrying objects or names', () => {
  const result = sanitizeNavigationSignals({
    groupScores: {},
    recentProductIds: [
      'canotta', 'canotta', '', 'unsafe/path', 'with space', '<script>', 'a'.repeat(81), null, 7,
      { id: 'private', name: 'Nome privato' }, ...Array.from({ length: 25 }, (_, index) => `product-${index}`),
    ],
  });
  assert.equal(result.recentProductIds.length, 20);
  assert.equal(new Set(result.recentProductIds).size, 20);
  assert.equal(result.recentProductIds[0], 'canotta');
  assert.ok(result.recentProductIds.every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id)));
  assert.ok(!JSON.stringify(result).includes('Nome privato'));
});

test('untrusted stored values yield an empty signal set', () => {
  for (const value of [undefined, null, false, 7, 'query', [], { groupScores: [], recentProductIds: 'product' }]) {
    assert.deepEqual(sanitizeNavigationSignals(value), { groupScores: {}, recentProductIds: [] });
  }
});

// Exercise the actual collector while replacing only authentication and the
// consent server boundary. Catalog matching and signal normalization stay real.
async function collector(t, loadChoice) {
  const key = `navigation-test-${randomUUID()}`;
  const listeners = new Set();
  const state = { user: { uid: 'alice' } };
  const storage = {
    getItem(key) { return Object.hasOwn(this, key) ? this[key] : null; },
    setItem(key, value) { this[key] = String(value); },
    removeItem(key) { delete this[key]; },
  };
  const window = new EventTarget();
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const globals = { window, document, sessionStorage: storage, BroadcastChannel: undefined };
  const descriptors = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  globalThis[key] = {
    auth: { status: 'ready', currentUser: () => state.user, onChange(callback) { listeners.add(callback); callback(state.user); } },
    loadChoice,
  };
  t.after(() => {
    delete globalThis[key];
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const url = new URL('../src/navigation-personalization.js', import.meta.url);
  const source = (await readFile(url, 'utf8'))
    .replace("import { initializeFirebaseAuth } from './firebase-auth.js';", `const initializeFirebaseAuth = async () => globalThis[${JSON.stringify(key)}].auth;`)
    .replace("import { loadCustomerPersonalization, CUSTOMER_PERSONALIZATION_POLICY_VERSION } from './customer-personalization.js';", `const CUSTOMER_PERSONALIZATION_POLICY_VERSION = '2026-10-20-session-v1'; const loadCustomerPersonalization = user => globalThis[${JSON.stringify(key)}].loadChoice(user);`)
    .replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(path, url).href}'`);
  const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  await api.initializeNavigationPersonalization();
  return {
    api, storage, window, document,
    switchUser(user) { state.user = user; for (const callback of listeners) callback(user); },
  };
}

const choice = enabled => ({ enabled, policyVersion: '2026-10-20-session-v1' });
const view = id => ({ id, categoryId: 'intimo-donna', name: 'Nome privato', published: true });
const categories = [{ id: 'intimo-donna', published: true }];
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('private, demo, malformed and hidden-category product events cannot become session history', async t => {
  const harness = await collector(t, async () => choice(true));
  for (const product of [{ ...view('private'), published: false }, { ...view('demo'), isDemo: true }, view('unsafe/id')]) {
    await harness.api.recordProductView(product, categories);
  }
  await harness.api.recordProductView(view('missing-category'), []);
  await harness.api.recordProductView(view('hidden-category'), [{ id: 'intimo-donna', published: false }]);
  assert.equal(harness.storage.getItem('intimo-navigation-v1:alice'), null);
  assert.deepEqual((await harness.api.getNavigationSignals({ uid: 'alice' })).recentProductIds, []);
});

test('collector fails closed on unavailable consent and clears a prior session when consent is revoked', async t => {
  let permission = choice(true);
  const harness = await collector(t, async () => {
    if (permission instanceof Error) throw permission;
    return permission;
  });
  await harness.api.recordProductView(view('canotta'), categories);
  assert.deepEqual((await harness.api.getNavigationSignals({ uid: 'alice' })).recentProductIds, ['canotta']);
  permission = new Error('server unavailable');
  harness.window.dispatchEvent(new Event('blur'));
  harness.window.dispatchEvent(new Event('focus'));
  await harness.api.recordProductView(view('private-action'), categories);
  assert.equal(harness.storage.getItem('intimo-navigation-v1:alice'), null);
  assert.deepEqual(await harness.api.getNavigationSignals({ uid: 'alice' }), { enabled: false, groupScores: {}, recentProductIds: [] });
  permission = choice(false);
  harness.document.dispatchEvent(new CustomEvent('personalization-choice-changed', { detail: { uid: 'alice', enabled: false } }));
  await harness.api.recordProductView(view('another-action'), categories);
  assert.equal(harness.storage.getItem('intimo-navigation-v1:alice'), null);
});

test('an action or signal read pending for the previous UID cannot cross into the next account', async t => {
  const aliceRead = deferred();
  t.after(() => aliceRead.resolve(choice(false)));
  const harness = await collector(t, user => user.uid === 'alice' ? aliceRead.promise : Promise.resolve(choice(true)));
  const oldRead = harness.api.getNavigationSignals({ uid: 'alice' });
  const oldAction = harness.api.recordProductView(view('alice-private-action'), categories);
  // Let both calls capture Alice's pending permission before changing identity.
  await new Promise(setImmediate);
  assert.equal(harness.storage.getItem('intimo-navigation-v1:alice'), null, 'pending server verification must not permit recording');
  harness.switchUser({ uid: 'bob' });
  assert.equal((await harness.api.getNavigationSignals({ uid: 'bob' })).enabled, true);
  await harness.api.recordProductView(view('bob-product'), categories);
  aliceRead.resolve(choice(true));
  await oldAction;
  assert.deepEqual({
    oldRead: await oldRead,
    bobProductIds: (await harness.api.getNavigationSignals({ uid: 'bob' })).recentProductIds,
  }, {
    oldRead: { enabled: false, groupScores: {}, recentProductIds: [] },
    bobProductIds: ['bob-product'],
  });
  assert.equal(harness.storage.getItem('intimo-navigation-v1:alice'), null);
});
