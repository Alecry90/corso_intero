import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

async function fixture() {
  const product = (id, price) => ({ id, name: `Articolo ${id}`, categoryId: 'a', sku: id.toUpperCase(), price, description: '', sizes: ['M'], colors: ['Blu'], material: '', imageAlt: '', available: true, published: false, isDemo: false, order: 0, imageVersion: '100:1' });
  const state = { uid: 'owner', revision: '00000000-0000-4000-8000-000000000001', calls: [], products: [product('p', 10), product('q', 20)], categories: [{ id: 'a', slug: 'a', name: 'Reparto' }] };
  const user = () => state.uid ? { uid: state.uid, email: 'alessandroferrara01@libero.it', emailVerified: true } : null;
  const dependencies = {
    initializeFirebaseAuth: async () => ({ status: 'ready', currentUser: user }),
    loadManagerCatalogSnapshot: async ({ uid, signal } = {}) => {
      if (signal?.aborted) throw new DOMException('Fermato', 'AbortError');
      if (!state.uid || uid && uid !== state.uid) throw new Error('Gestore cambiato');
      return structuredClone({ categories: state.categories, products: state.products, revision: state.revision, uid: state.uid });
    },
    readPublicVersion: async () => state.revision,
    updateCatalogProductRecord: async request => {
      if (state.revision !== request.expectedRevision) throw new Error('Revisione cambiata');
      const current = state.products.find(product => product.id === request.id);
      assert.equal(request.expectedProductVersion, current.imageVersion);
      state.calls.push(structuredClone(request));
      Object.assign(current, request.record, { imageVersion: `101:${state.calls.length}` });
      const revision = randomUUID(); state.revision = revision;
      state.afterSave?.(request);
      return { product: current, revision };
    },
  };
  const key = `bulk-${randomUUID()}`; globalThis[key] = dependencies;
  const source = (await readFile(new URL('../src/product-bulk.js', import.meta.url), 'utf8'))
    .replace("import { initializeFirebaseAuth } from './firebase-auth.js';", `const {initializeFirebaseAuth} = globalThis[${JSON.stringify(key)}];`)
    .replace("import { loadManagerCatalogSnapshot } from './catalog-backup.js';", `const {loadManagerCatalogSnapshot} = globalThis[${JSON.stringify(key)}];`)
    .replace("import { readPublicVersion, updateCatalogProductRecord } from './firestore-catalog.js';", `const {readPublicVersion,updateCatalogProductRecord} = globalThis[${JSON.stringify(key)}];`)
    .replace("'./product-bulk-model.js'", JSON.stringify(new URL('../src/product-bulk-model.js', import.meta.url).href));
  const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  delete globalThis[key];
  return { state, api };
}

test('CSV preview and export do not write; confirmation rebuilds its private plan despite UI mutation', async () => {
  const { state, api } = await fixture();
  const exported = await api.exportProductUpdateCSV(); assert.equal(exported.count, 2);
  const { plan, summary } = await api.previewProductUpdates('id;versione;prezzo\np;100:1;9,90\nq;100:1;20');
  assert.deepEqual(summary, { changed: 1, unchanged: 1, errors: 0 }); assert.equal(state.calls.length, 0);
  plan.items[0].payload.price = 999; plan.items.length = 0;
  assert.deepEqual(await api.applyProductUpdates(plan), { updated: 1, unchanged: 1 });
  assert.equal(state.products[0].price, 9.9); assert.equal(state.products[1].price, 20);
  await assert.rejects(api.applyProductUpdates(plan), /Controlla nuovamente/u);
});

test('a catalog change after preview prevents every update', async () => {
  const { state, api } = await fixture();
  const { plan } = await api.previewProductUpdates('id;versione;prezzo\np;100:1;9');
  state.revision = randomUUID();
  await assert.rejects(api.applyProductUpdates(plan), error => error.partial.updated === 0 && /cambiato dopo/u.test(error.message));
  assert.equal(state.calls.length, 0);
});

test('an external edit between rows stops with an accurate partial count', async () => {
  const { state, api } = await fixture();
  const { plan } = await api.previewProductUpdates('id;versione;prezzo\np;100:1;9\nq;100:1;19');
  state.afterSave = () => { state.revision = randomUUID(); };
  await assert.rejects(api.applyProductUpdates(plan), error => error.partial.updated === 1);
  assert.equal(state.calls.length, 1); assert.equal(state.products[1].price, 20);
});

test('stop waits for the current row and invalidates the consumed plan', async () => {
  const { state, api } = await fixture(); const controller = new AbortController();
  const { plan } = await api.previewProductUpdates('id;versione;prezzo\np;100:1;9\nq;100:1;19');
  state.afterSave = () => controller.abort();
  assert.deepEqual(await api.applyProductUpdates(plan, { signal: controller.signal }), { updated: 1, unchanged: 0, stopped: true });
  assert.equal(state.calls.length, 1);
  await assert.rejects(api.applyProductUpdates(plan), /Controlla nuovamente/u);
});

test('identity changes, invalid previews and fabricated tokens cannot apply', async () => {
  const { state, api } = await fixture();
  await assert.rejects(api.applyProductUpdates({ items: [] }), /Controlla nuovamente/u);
  const invalid = await api.previewProductUpdates('id;versione;prezzo\np;100:1;meno dieci');
  assert.equal(invalid.summary.errors, 1);
  await assert.rejects(api.applyProductUpdates(invalid.plan), /Controlla nuovamente/u);
  const valid = await api.previewProductUpdates('id;versione;prezzo\np;100:1;9');
  state.uid = 'another-owner-session';
  await assert.rejects(api.applyProductUpdates(valid.plan), error => error.partial.updated === 0);
  assert.equal(state.calls.length, 0);
});
