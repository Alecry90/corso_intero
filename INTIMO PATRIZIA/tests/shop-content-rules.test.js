import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import * as sdk from 'firebase/firestore';
import { emptyShopSettings } from '../src/shop-content-model.js';
const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (host && !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host)) throw new Error('Shop tests require an explicit loopback emulator.');
const projectId = 'demo-shop-content-rules';
const apps = [], databases = [], key = `shop-${randomUUID()}`;
const ownerUser = { uid: 'owner', email: 'alessandroferrara01@libero.it', emailVerified: true };
let owner, visitor, unverified, formerAdmin, api;
sdk.setLogLevel('silent');
function connection(uid, claims = {}) {
  const app = initializeApp({ projectId, apiKey: 'test-only', appId: 'test-only' }, randomUUID());
  const db = sdk.getFirestore(app);
  sdk.connectFirestoreEmulator(db, host.split(':')[0], Number(host.split(':')[1]), uid ? { mockUserToken: { sub: uid, ...claims } } : {});
  apps.push(app); databases.push(db); return db;
}
const at = (db, path) => sdk.doc(db, path);
const denied = promise => assert.rejects(promise, error => error.code === 'permission-denied');
const record = patch => ({ kind: 'promotion', title: 'Contenuto reale inserito dal negozio', body: 'Descrizione e condizioni reali.', startAt: null, endAt: null, categoryId: '', productIds: [], ctaLabel: '', ctaPath: '', image: '', imageAlt: '', published: false, ...patch });
before(async () => {
  if (!host) return;
  const result = await fetch(`http://${host}/emulator/v1/projects/${projectId}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ignore_errors: false, rules: { files: [{ name: 'firestore.rules', content: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') }] } }) });
  assert.equal(result.ok, true); const diagnostics = await result.json(); assert.deepEqual((diagnostics.issues || []).filter(issue => issue.severity === 'ERROR'), []);
  owner = connection('owner', { email: ownerUser.email, email_verified: true }); visitor = connection();
  unverified = connection('unverified', { email: ownerUser.email, email_verified: false });
  formerAdmin = connection('former', { email: 'former@example.test', email_verified: true, admin: true });
  globalThis[key] = { db: owner, sdk };
  const modelURL = new URL('../src/shop-content-model.js', import.meta.url).href;
  const source = (await readFile(new URL('../src/shop-content.js', import.meta.url), 'utf8'))
    .replace("import { getFirestoreContext } from './firestore-catalog.js';", `const getFirestoreContext = async () => globalThis[${JSON.stringify(key)}];`)
    .replaceAll("'./shop-content-model.js'", JSON.stringify(modelURL));
  api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
});
after(async () => { await Promise.all(databases.map(db => sdk.terminate(db))); await Promise.all(apps.map(app => deleteApp(app))); delete globalThis[key]; });
test('shop settings and campaigns use actual SDK and loopback security rules', { skip: !host, timeout: 120000 }, async t => {
  t.beforeEach(async () => { const response = await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' }); assert.equal(response.ok, true); globalThis[key] = { db: owner, sdk }; });
  await t.test('missing settings and campaigns stay absent until an explicit owner save', async () => {
    assert.deepEqual(await api.getPublicShopSettings(), emptyShopSettings());
    assert.deepEqual(await api.listPublicCampaigns(), []);
    assert.equal((await sdk.getDocFromServer(at(owner, 'storeSettings/public'))).exists(), false);
    assert.equal((await sdk.getDocsFromServer(sdk.query(sdk.collection(owner, 'storeCampaigns'), sdk.limit(50)))).size, 0);
  });
  await t.test('settings allow only the public singleton and minimal business fields', async () => {
    const settings = { ...emptyShopSettings(), whatsappNumber: '390805794644', hours: ['09:00-13:00', ...Array(5).fill(''), 'Chiuso'] };
    await api.saveShopSettings(ownerUser, settings);
    const stored = (await sdk.getDocFromServer(at(owner, 'storeSettings/public'))).data(); assert.ok(stored.updatedAt instanceof sdk.Timestamp);
    globalThis[key] = { db: visitor, sdk }; assert.deepEqual(await api.getPublicShopSettings(), settings);
    for (const db of [owner, visitor, unverified, formerAdmin]) {
      await denied(sdk.getDocsFromServer(sdk.query(sdk.collection(db, 'storeSettings'), sdk.limit(1))));
      await denied(sdk.getDocFromServer(at(db, 'storeSettings/private')));
      await denied(sdk.deleteDoc(at(db, 'storeSettings/public')));
    }
    for (const patch of [{ ownerEmail: ownerUser.email }, { customerEmails: [] }, { whatsappNumber: '+390805794644' }, { hours: [] }, { updatedAt: new Date(0) }, { phoneHref: 'javascript:alert(1)' }]) await denied(sdk.setDoc(at(owner, 'storeSettings/public'), { ...settings, updatedAt: sdk.serverTimestamp(), ...patch }));
  });
  await t.test('only verified owner writes or deletes, including direct SDK requests', async () => {
    for (const db of [visitor, unverified, formerAdmin]) {
      await denied(sdk.setDoc(at(db, 'storeSettings/public'), { ...emptyShopSettings(), updatedAt: sdk.serverTimestamp() }));
      await denied(sdk.setDoc(at(db, 'storeCampaigns/a'), { ...record({ published: true }), updatedAt: sdk.serverTimestamp() }));
      await denied(sdk.deleteDoc(at(db, 'storeCampaigns/a')));
    }
    await assert.rejects(api.saveCampaign({ ...ownerUser, emailVerified: false }, null, record()));
    await assert.rejects(api.saveShopSettings({ ...ownerUser, email: 'other@example.test' }, emptyShopSettings()));
  });
  await t.test('public queries exclude drafts even for the authenticated owner and require a bounded publication filter', async () => {
    const draft = await api.saveCampaign(ownerUser, 'draft', record());
    const published = await api.saveCampaign(ownerUser, 'live', record({ published: true, kind: 'event', startAt: new Date('2026-11-21T12:00:00Z'), endAt: new Date('2026-11-21T15:00:00Z') }));
    assert.equal(draft.published, false); assert.equal(published.startAt.toISOString(), '2026-11-21T12:00:00.000Z');
    assert.deepEqual((await api.listPublicCampaigns()).map(item => item.id), ['live']);
    assert.equal((await api.listManagerCampaigns(ownerUser)).records.length, 2);
    globalThis[key] = { db: visitor, sdk }; assert.deepEqual((await api.listPublicCampaigns()).map(item => item.id), ['live']);
    assert.equal((await sdk.getDocFromServer(at(visitor, 'storeCampaigns/live'))).exists(), true);
    await denied(sdk.getDocFromServer(at(visitor, 'storeCampaigns/draft')));
    await denied(sdk.getDocsFromServer(sdk.query(sdk.collection(visitor, 'storeCampaigns'), sdk.limit(50))));
    await denied(sdk.getDocsFromServer(sdk.query(sdk.collection(visitor, 'storeCampaigns'), sdk.where('published', '==', true))));
    await denied(sdk.getDocsFromServer(sdk.query(sdk.collection(visitor, 'storeCampaigns'), sdk.where('published', '==', true), sdk.limit(51))));
    await denied(sdk.getDocsFromServer(sdk.query(sdk.collection(owner, 'storeCampaigns'), sdk.limit(51))));
    await api.deleteCampaign(ownerUser, 'live').then(() => assert.fail('visitor backend cannot delete despite an owner-shaped UI argument'), error => assert.match(error.message, /autorizzata/));
    globalThis[key] = { db: owner, sdk }; await api.deleteCampaign(ownerUser, 'live');
  });
  await t.test('Home crosses expired pages, includes future events and stops after six visible public cards', async () => {
    const now = new Date('2026-10-21T12:00:00Z');
    const expired = { published: true, startAt: new Date('2026-01-01T08:00:00Z'), endAt: new Date('2026-01-02T08:00:00Z') };
    const currentIds = Array.from({ length: 5 }, (_, index) => `b-current-${index}`);
    const draftIds = ['a-draft', 'b-draft', 'z-draft'];
    const fixtures = [
      ...Array.from({ length: 50 }, (_, index) => [`a-expired-${String(index).padStart(3, '0')}`, record(expired)]),
      ...currentIds.map(id => [id, record({ published: true })]),
      ['b-future-event', record({ published: true, kind: 'event', startAt: new Date('2026-11-21T12:00:00Z'), endAt: new Date('2026-11-21T15:00:00Z') })],
      ['b-future-promotion', record({ published: true, startAt: new Date('2026-11-21T12:00:00Z') })],
      ...Array.from({ length: 50 }, (_, index) => [`z-expired-${String(index).padStart(3, '0')}`, record(expired)]),
      ...draftIds.map(id => [id, record()]),
    ];
    const batch = sdk.writeBatch(owner);
    for (const [id, values] of fixtures) batch.set(at(owner, `storeCampaigns/${id}`), { ...values, updatedAt: sdk.serverTimestamp() });
    await batch.commit();
    const publishedCount = fixtures.length - draftIds.length;
    const ownerRecords = await api.listPublicCampaigns();
    assert.equal(ownerRecords.length, publishedCount);
    assert.ok(ownerRecords.every(item => item.published && !draftIds.includes(item.id)));
    let pagesRead = 0;
    globalThis[key] = { db: visitor, sdk: { ...sdk, getDocsFromServer: query => { pagesRead++; return sdk.getDocsFromServer(query); } } };
    const homeRecords = await api.listPublicCampaigns({ visibleLimit: 6, now });
    assert.deepEqual(homeRecords.map(item => item.id), [...currentIds, 'b-future-event']);
    assert.equal(pagesRead, 2, 'Home stops before the remaining published page once its six visible cards are found');
    pagesRead = 0;
    const publicRecords = await api.listPublicCampaigns();
    assert.equal(publicRecords.length, publishedCount, 'the default API still returns the complete published list');
    assert.equal(pagesRead, 3);
    assert.ok(publicRecords.every(item => item.published && !draftIds.includes(item.id)));
    for (const id of draftIds) await denied(sdk.getDocFromServer(at(visitor, `storeCampaigns/${id}`)));
  });
  await t.test('server rejects malformed dates, excess references, external calls to action and private extensions', async () => {
    const invalid = [{ kind: 'event' }, { kind: 'event', startAt: new Date('1999-12-31') }, { startAt: new Date('2026-10-21'), endAt: new Date('2026-10-20') }, { productIds: Array(13).fill('p') }, { productIds: ['p', 'p'] }, { productIds: [7] }, { productIds: ['p|q'] }, { categoryId: 'private/id' }, { ctaLabel: 'Vai', ctaPath: 'https://external.test' }, { ctaLabel: 'Vai', ctaPath: '/admin.html' }, { ctaLabel: 'Vai', ctaPath: '/catalogo.html?x=%2Fexternal' }, { image: '/assets/test.webp', imageAlt: '' }, { ownerEmail: ownerUser.email }, { subscribers: [] }, { updatedAt: new Date(0) }];
    for (const patch of invalid) await denied(sdk.setDoc(at(owner, 'storeCampaigns/invalid'), { ...record(), updatedAt: sdk.serverTimestamp(), ...patch }));
    await api.saveCampaign(ownerUser, 'valid', record({ ctaLabel: 'Esplora', ctaPath: '/catalogo.html?prodotto=p', image: '/assets/test.webp', imageAlt: 'Foto fornita dal negozio', productIds: ['p'] }));
    await denied(sdk.setDoc(at(owner, 'storeCampaigns/valid/subscribers/alice'), { email: 'private@example.test' }));
  });
});
