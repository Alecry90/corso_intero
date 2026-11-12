import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { createApi } from '../src/app.js';
import { FirestoreCatalogRepository } from '../src/repository.js';
import { MAX_IMAGE_BYTES, validateImage } from '../src/validation.js';
import { ADMIN_EMAILS, normalizeEmail, isAllowedAdmin } from '../src/admin-access.js';
import { FakeFirestore } from './fake-firestore.js';

function fixture(seed = {}) {
  const db = new FakeFirestore(seed);
  const repository = new FirestoreCatalogRepository(db);
  const verified = [];
  const app = createApi({ repository, verifyIdToken: async (token, checkRevoked) => {
    verified.push(checkRevoked);
    if (token === 'admin-token') return { uid: 'owner', email: 'alessandroferrara01@libero.it', email_verified: true };
    if (token === 'user-token') return { uid: 'customer' };
    if (token === 'former-admin-token') return { uid: 'former-owner', admin: true, email: 'former-owner@example.test', email_verified: true };
    if (token === 'missing-email-token') return { uid: 'owner', admin: true, email_verified: true };
    if (token === 'unverified-email-token') return { uid: 'owner', admin: true, email: 'alessandroferrara01@libero.it', email_verified: false };
    if (token === 'missing-verification-token') return { uid: 'owner', admin: true, email: 'alessandroferrara01@libero.it' };
    if (token === 'allowed-email-without-claim-token') return { uid: 'owner', email: 'alessandroferrara01@libero.it', email_verified: true };
    if (token === 'nonboolean-admin-token') return { uid: 'owner', admin: 'true', email: 'alessandroferrara01@libero.it', email_verified: true };
    if (token === 'false-admin-token') return { uid: 'owner', admin: false, email: 'alessandroferrara01@libero.it', email_verified: true };
    if (token === 'nonboolean-verification-token') return { uid: 'owner', admin: true, email: 'alessandroferrara01@libero.it', email_verified: 'true' };
    if (token === 'normalized-admin-token') return { uid: 'owner', email: '  AlessandroFerrara01@Libero.IT  ', email_verified: true };
    throw new Error('Invalid token');
  }, logger: { error() {} } });
  return { db, repository, app, verified };
}
const admin = (req) => req.set('Authorization', 'Bearer admin-token');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function version(app) {
  const response = await request(app).get('/api/catalog/version');
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(Object.keys(response.body), ['version']);
  assert.equal(typeof response.body.version, 'string');
  return response.body.version;
}
async function category(app, overrides = {}) {
  const response = await admin(request(app).post('/api/admin/categories')).send({ name: 'Intimo donna', ...overrides });
  assert.equal(response.status, 201);
  return response.body.category;
}
async function product(app, categoryId, overrides = {}) {
  const response = await admin(request(app).post('/api/admin/products')).send({ name: 'Canotta', categoryId, price: 19.9, ...overrides });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.product;
}
test('admin API requires a valid non-revoked token and verified allowlisted email without a custom claim', async () => {
  const { app, verified, db } = fixture();
  for (const [token, expected] of [[null, 401], ['invalid', 401], ['user-token', 403]]) {
    const req = request(app).post('/api/admin/categories');
    if (token) req.set('Authorization', `Bearer ${token}`);
    const response = await req.send({ name: 'Test' });
    assert.equal(response.status, expected);
    assert.ok(response.body.error.code);
  }
  assert.equal(db.documents.size, 0);
  const response = await admin(request(app).get('/api/admin/catalog'));
  assert.equal(response.status, 200);
  assert.ok(verified.every(Boolean));
});

test('only the single verified owner can administer and all forbidden identities get the same response', async () => {
  assert.equal(Object.isFrozen(ADMIN_EMAILS), true);
  assert.deepEqual(ADMIN_EMAILS, ['alessandroferrara01@libero.it']);
  assert.equal(normalizeEmail('  AlessandroFerrara01@Libero.IT  '), ADMIN_EMAILS[0]);
  assert.equal(normalizeEmail(undefined), '');
  assert.equal(isAllowedAdmin(null), false);
  const { app, db, verified } = fixture();
  let forbiddenResponse;
  for (const token of ['user-token', 'former-admin-token', 'missing-email-token', 'unverified-email-token', 'missing-verification-token', 'nonboolean-verification-token']) {
    for (const [method, path, body] of [
      ['get', '/api/admin/catalog'],
      ['get', '/api/admin/images/missing'],
      ['post', '/api/admin/categories', { name: 'Forbidden category' }],
      ['put', '/api/admin/products/missing', { name: 'Forbidden product', categoryId: 'missing' }],
      ['delete', '/api/admin/products/missing'],
    ]) {
      const req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
      const response = await (body ? req.send(body) : req);
      assert.equal(response.status, 403, `${token}: ${method} ${path}`);
      forbiddenResponse ??= response.body;
      assert.deepEqual(response.body, forbiddenResponse);
      assert.equal(JSON.stringify(response.body).includes(ADMIN_EMAILS[0]), false);
    }
  }
  assert.equal(db.documents.size, 0);
  assert.ok(verified.every(Boolean));
  for (const token of ['normalized-admin-token', 'allowed-email-without-claim-token', 'nonboolean-admin-token', 'false-admin-token']) {
    assert.equal((await request(app).get('/api/admin/catalog').set('Authorization', `Bearer ${token}`)).status, 200);
  }
});

test('session accepts every valid account and exposes only catalogue management permission', async () => {
  const { app, db, verified } = fixture();
  for (const token of [null, 'invalid', 'revoked-token']) {
    const req = request(app).get('/api/session');
    if (token) req.set('Authorization', `Bearer ${token}`);
    const response = await req;
    assert.equal(response.status, 401);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.error.code, 'unauthenticated');
  }
  for (const token of ['user-token', 'former-admin-token', 'missing-email-token', 'unverified-email-token', 'missing-verification-token', 'nonboolean-verification-token']) {
    const response = await request(app).get('/api/session').set('Authorization', `Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(response.body, { canManageCatalog: false });
    const write = await request(app).post('/api/admin/categories').set('Authorization', `Bearer ${token}`).send({ name: 'Forbidden' });
    assert.equal(write.status, 403);
  }
  for (const token of ['admin-token', 'normalized-admin-token', 'allowed-email-without-claim-token', 'nonboolean-admin-token', 'false-admin-token']) {
    const response = await request(app).get('/api/session').set('Authorization', `Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(response.body, { canManageCatalog: true });
  }
  assert.equal(db.documents.size, 0);
  assert.ok(verified.every(Boolean));
  const verifiedBeforePublicRead = verified.length;
  assert.equal((await request(app).get('/api/catalog')).status, 200);
  assert.equal(verified.length, verifiedBeforePublicRead);
});

test('session and management routes both verify revocation on every authenticated request', async () => {
  const calls = [];
  let revoked = false;
  const app = createApi({ repository: new FirestoreCatalogRepository(new FakeFirestore()), verifyIdToken: async (token, checkRevoked) => {
    calls.push({ token, checkRevoked });
    if (revoked) throw new Error('Token revoked');
    return { uid: 'owner', email: 'alessandroferrara01@libero.it', email_verified: true };
  }, logger: { error() {} } });
  assert.equal((await admin(request(app).get('/api/session'))).status, 200);
  assert.equal((await admin(request(app).get('/api/admin/catalog'))).status, 200);
  revoked = true;
  for (const path of ['/api/session', '/api/admin/catalog']) {
    const response = await admin(request(app).get(path));
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'unauthenticated');
  }
  assert.deepEqual(calls, Array.from({ length: 4 }, () => ({ token: 'admin-token', checkRevoked: true })));
});
test('public catalogue hides demo products, drafts and products inside unpublished categories', async () => {
  const { app } = fixture();
  const visible = await category(app);
  const hidden = await category(app, { name: 'Bozza', published: false });
  await product(app, visible.id);
  await product(app, visible.id, { name: 'Bozza', published: false });
  await product(app, hidden.id, { name: 'Nascosto' });
  await product(app, visible.id, { name: 'Esempio', isDemo: true });
  const response = await request(app).get('/api/catalog');
  assert.equal(response.status, 200);
  assert.equal(response.body.categories.length, 1);
  assert.deepEqual(response.body.products.map((p) => p.name), ['Canotta']);
  assert.equal(response.body.demo, false);
  assert.equal(response.body.limits.products, 200);
  assert.equal((await admin(request(app).get('/api/admin/catalog'))).body.products.length, 4);
});

test('public version reads only inventory once and reveals no legacy metadata', async () => {
  const reads = [];
  let inventory;
  const db = { collection: (name) => ({ doc: (id) => ({ get: async () => {
    reads.push(`${name}/${id}`);
    return { exists: inventory !== undefined, data: () => inventory };
  } }) }) };
  const repository = new FirestoreCatalogRepository(db);
  const app = createApi({ repository, verifyIdToken: async () => { throw new Error('Public version must not verify identity'); } });
  for (inventory of [undefined, { categoryCount: 4, productCount: 12, updatedAt: 'private-timestamp', adminUid: 'private-owner' }, { revision: 'private-owner' }]) {
    const before = reads.length;
    assert.equal(await version(app), 'initial');
    assert.deepEqual(reads.slice(before), ['catalogMeta/inventory']);
  }
  inventory = { revision: '691c9c1e-f5b3-4588-8c3e-06a3652ed5ea', productCount: 12 };
  for (let index = 0; index < 2; index++) {
    const before = reads.length;
    assert.equal(await version(app), inventory.revision);
    assert.deepEqual(reads.slice(before), ['catalogMeta/inventory']);
  }
});

test('version changes atomically after every category and product CRUD while drafts stay private', async () => {
  const { app, db } = fixture({ 'catalogMeta/inventory': { categoryCount: 0, productCount: 0 } });
  const revisions = new Set(['initial']);
  const changed = async () => {
    const current = await version(app);
    assert.match(current, uuid);
    assert.equal(revisions.has(current), false);
    assert.equal(db.documents.get('catalogMeta/inventory').revision, current);
    assert.equal(await version(app), current);
    revisions.add(current);
  };
  assert.equal(await version(app), 'initial');
  const cat = await category(app, { published: false });
  await changed();
  assert.equal((await admin(request(app).put(`/api/admin/categories/${cat.id}`)).send({ name: 'Reparto riservato', published: false })).status, 200);
  await changed();
  const png = await sharp({ create: { width: 32, height: 40, channels: 3, background: '#d3a28b' } }).png().toBuffer();
  const item = await product(app, cat.id, { published: false, imageData: `data:image/png;base64,${png.toString('base64')}` });
  await changed();
  const hidden = await request(app).get('/api/catalog');
  assert.deepEqual(hidden.body.categories, []);
  assert.deepEqual(hidden.body.products, []);
  assert.equal((await request(app).get(item.image)).status, 404);
  assert.equal((await request(app).get(`/api/admin/images/${item.id}`)).status, 401);
  assert.equal((await admin(request(app).get('/api/admin/catalog'))).body.products.length, 1);
  assert.equal((await admin(request(app).get(`/api/admin/images/${item.id}`))).status, 200);
  assert.equal((await admin(request(app).put(`/api/admin/products/${item.id}`)).send({ name: 'Pubblicato in reparto nascosto', categoryId: cat.id, published: true })).status, 200);
  await changed();
  assert.deepEqual((await request(app).get('/api/catalog')).body.products, []);
  assert.equal((await request(app).get(item.image)).status, 404);
  assert.equal((await admin(request(app).put(`/api/admin/categories/${cat.id}`)).send({ name: 'Reparto pubblico', published: true })).status, 200);
  await changed();
  assert.equal((await request(app).get('/api/catalog')).body.products.length, 1);
  assert.equal((await request(app).get(item.image)).status, 200);
  assert.equal((await admin(request(app).delete(`/api/admin/products/${item.id}`))).status, 204);
  await changed();
  assert.equal(db.documents.has(`products/${item.id}`), false);
  assert.equal(db.documents.has(`productImages/${item.id}`), false);
  assert.equal((await admin(request(app).delete(`/api/admin/categories/${cat.id}`))).status, 204);
  await changed();
  assert.equal(db.documents.has(`categories/${cat.id}`), false);
});

test('rejected authorization, validation and transaction mutations preserve the version', async () => {
  const { app, db } = fixture();
  const cat = await category(app);
  const item = await product(app, cat.id);
  const initialVersion = await version(app);
  const inventory = db.documents.get('catalogMeta/inventory');
  const attempts = [
    [401, () => request(app).post('/api/admin/categories').send({ name: 'Unauthorized' })],
    [403, () => request(app).delete(`/api/admin/products/${item.id}`).set('Authorization', 'Bearer user-token')],
    [400, () => admin(request(app).put(`/api/admin/categories/${cat.id}`)).send({ name: cat.name, revision: 'forged' })],
    [409, () => admin(request(app).post('/api/admin/categories')).send({ name: 'Duplicato', slug: cat.slug })],
    [409, () => admin(request(app).delete(`/api/admin/categories/${cat.id}`))],
    [404, () => admin(request(app).put('/api/admin/categories/missing')).send({ name: 'Mancante' })],
    [400, () => admin(request(app).post('/api/admin/products')).send({ name: 'Orfano', categoryId: 'missing' })],
    [400, () => admin(request(app).put(`/api/admin/products/${item.id}`)).send({ name: 'Prezzo errato', categoryId: cat.id, price: 1.234 })],
    [404, () => admin(request(app).put('/api/admin/products/missing')).send({ name: 'Mancante', categoryId: cat.id })],
    [404, () => admin(request(app).delete('/api/admin/products/missing'))],
  ];
  for (const [expected, perform] of attempts) {
    assert.equal((await perform()).status, expected);
    assert.equal(await version(app), initialVersion);
    assert.deepEqual(db.documents.get('catalogMeta/inventory'), inventory);
  }
  db.documents.set('catalogMeta/inventory', { ...inventory, productCount: 200 });
  assert.equal((await admin(request(app).post('/api/admin/products')).send({ name: 'Oltre limite', categoryId: cat.id })).status, 409);
  assert.equal(await version(app), initialVersion);
});
test('category deletion cannot orphan products; moving and deleting maintains inventory', async () => {
  const { app, db } = fixture();
  const first = await category(app);
  const second = await category(app, { name: 'Pigiami' });
  const item = await product(app, first.id);
  const blocked = await admin(request(app).delete(`/api/admin/categories/${first.id}`));
  assert.equal(blocked.status, 409);
  const moved = await admin(request(app).put(`/api/admin/products/${item.id}`)).send({ name: 'Canotta', categoryId: second.id, price: 22 });
  assert.equal(moved.status, 200);
  assert.equal((await admin(request(app).delete(`/api/admin/categories/${first.id}`))).status, 204);
  assert.equal((await admin(request(app).delete(`/api/admin/products/${item.id}`))).status, 204);
  assert.equal((await admin(request(app).delete(`/api/admin/categories/${second.id}`))).status, 204);
  const inventory = db.documents.get('catalogMeta/inventory');
  assert.match(inventory.revision, uuid);
  assert.deepEqual({ ...inventory, updatedAt: undefined, revision: undefined }, { categoryCount: 0, productCount: 0, updatedAt: undefined, revision: undefined });
});

test('category slugs stay unique and a category can retain its own slug on update', async () => {
  const { app } = fixture();
  const cat = await category(app);
  assert.equal((await admin(request(app).post('/api/admin/categories')).send({name:'Diversa',slug:cat.slug})).status,409);
  assert.equal((await admin(request(app).put(`/api/admin/categories/${cat.id}`)).send({name:cat.name,slug:cat.slug})).status,200);
});
test('validation rejects unknown fields, bad money, orphan IDs, script paths and malformed JSON', async () => {
  const { app } = fixture();
  const cat = await category(app);
  for (const body of [
    { name: 'Test', categoryId: cat.id, price: 1.234 },
    { name: 'Test', categoryId: cat.id, admin: true },
    { name: 'Test', categoryId: cat.id, image: 'javascript:alert(1)' },
    { name: 'Test', categoryId: cat.id, image: '/assets/../secret.png' },
    { name: 'Test', categoryId: 'does-not-exist' },
    { name: 'Test', categoryId: cat.id, price: '22' }
  ]) assert.equal((await admin(request(app).post('/api/admin/products')).send(body)).status, 400);
  assert.equal((await admin(request(app).post('/api/admin/categories')).set('Content-Type', 'application/json').send('{')).status, 400);
  assert.equal((await admin(request(app).post('/api/admin/categories')).set('Content-Type', 'text/plain').send('test')).status, 415);
});
test('uploaded Base64 bitmap is validated, normalized, served as binary and removed with its product', async () => {
  const { app, db } = fixture();
  const cat = await category(app);
  const png = await sharp({ create: { width: 32, height: 40, channels: 3, background: '#d3a28b' } }).png().toBuffer();
  const item = await product(app, cat.id, { imageData: `data:image/png;base64,${png.toString('base64')}` });
  assert.match(item.image, /^\/api\/images\//);
  assert.ok(!JSON.stringify((await request(app).get('/api/catalog')).body).includes('base64'));
  const image = await request(app).get(item.image);
  assert.equal(image.status, 200);
  assert.match(image.headers['content-type'], /^image\/webp/);
  assert.equal((await request(app).get(item.image).set('If-None-Match', image.headers.etag)).status, 304);
  await admin(request(app).put(`/api/admin/categories/${cat.id}`)).send({ name: cat.name, published: false });
  assert.equal((await request(app).get(item.image)).status, 404);
  assert.equal((await request(app).get(`/api/admin/images/${item.id}`)).status, 401);
  assert.equal((await admin(request(app).get(`/api/admin/images/${item.id}`))).status, 200);
  await admin(request(app).put(`/api/admin/categories/${cat.id}`)).send({ name: cat.name, published: true });
  await admin(request(app).put(`/api/admin/products/${item.id}`)).send({ name: item.name, categoryId: cat.id, isDemo: true });
  assert.equal((await request(app).get('/api/catalog')).body.products.length, 0);
  assert.equal((await request(app).get(item.image)).status, 404);
  assert.equal((await admin(request(app).get(`/api/admin/images/${item.id}`))).status, 200);
  await admin(request(app).delete(`/api/admin/products/${item.id}`));
  assert.equal(db.documents.has(`productImages/${item.id}`), false);
});
test('image processing rejects MIME spoofing, truncated files, SVG, excessive dimensions and byte size', async () => {
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#fff' } }).png().toBuffer();
  const huge = await sharp({ create: { width: 4097, height: 16, channels: 3, background: '#fff' } }).png().toBuffer();
  for (const data of [
    `data:image/jpeg;base64,${png.toString('base64')}`,
    `data:image/png;base64,${png.subarray(0, 16).toString('base64')}`,
    `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
    `data:image/png;base64,${huge.toString('base64')}`,
    `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64')}`
  ]) await assert.rejects(() => validateImage(data), { status: 400 });
});
test('catalog hard limits reject extra products and response never silently claims completeness', async () => {
  const { app, db } = fixture();
  const cat = await category(app);
  db.documents.set('catalogMeta/inventory', { categoryCount: 1, productCount: 200 });
  assert.equal((await admin(request(app).post('/api/admin/products')).send({ name: 'Extra', categoryId: cat.id })).status, 409);
  for (let n = 0; n < 201; n++) db.documents.set(`products/p${n}`, { name: `P${n}`, categoryId: cat.id, published: true, order: n });
  const response = await request(app).get('/api/catalog');
  assert.equal(response.body.products.length, 200);
  assert.equal(response.body.truncated, true);
});
