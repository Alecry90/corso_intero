// REST transport integration. Explicit loopback emulator only; no SDK or cloud fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (host && !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host)) throw new Error('Transport tests require a loopback Firestore emulator.');
const project = 'demo-intimo-import-transport';
const base = host ? `http://${host}` : '';
const documents = `projects/${project}/databases/(default)/documents`;
const root = fileURLToPath(new URL('..', import.meta.url));
const script = fileURLToPath(new URL('../scripts/import-notes-catalog.mjs', import.meta.url));
const toValue = value => {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (value && typeof value === 'object') return { mapValue: { fields: toFields(value) } };
  throw new Error('Unsupported fixture value');
};
const toFields = fields => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, toValue(value)]));
const fromValue = value => 'stringValue' in value ? value.stringValue : 'integerValue' in value ? Number(value.integerValue) : 'doubleValue' in value ? value.doubleValue : 'booleanValue' in value ? value.booleanValue : 'nullValue' in value ? null : 'timestampValue' in value ? value.timestampValue : 'arrayValue' in value ? (value.arrayValue.values || []).map(fromValue) : 'mapValue' in value ? fromFields(value.mapValue.fields || {}) : (() => { throw new Error('Unexpected REST value'); })();
const fromFields = fields => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromValue(value)]));
async function request(path, body) {
  const response = await fetch(`${base}/v1/${path}`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  assert.equal(response.ok, true, JSON.stringify(result));
  return result;
}
async function queryCollection(name) {
  const rows = await request(`${documents}:runQuery`, { structuredQuery: { from: [{ collectionId: name }] } });
  return rows.filter(row => row.document).map(row => row.document).sort((a, b) => a.name.localeCompare(b.name));
}
async function snapshot() {
  const names = ['categories', 'products', 'productImages', 'categorySlugs', 'catalogMeta'];
  const values = await Promise.all(names.map(queryCollection));
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}
function objects(output) {
  const result = [];
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let index = 0; index < output.length; index++) {
    const character = output[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') { if (!depth) start = index; depth++; }
    else if (character === '}') { depth--; if (!depth) result.push(JSON.parse(output.slice(start, index + 1))); }
  }
  return result;
}
async function runImport(extra = []) {
  const args = [script, '--project', project, '--emulator', ...extra];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, FIRESTORE_EMULATOR_HOST: host }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Import transport test timed out')); }, 45000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`Import exited ${code}: ${stderr}\n${stdout}`));
      else resolve({ stdout, stderr, messages: objects(stdout) });
    });
  });
}
const decoded = docs => docs.map(document => ({ id: document.name.split('/').at(-1), ...fromFields(document.fields || {}) }));

test('Notes import REST transport previews, commits atomically and remains idempotent without changing products or photos', { timeout: 120000, skip: !host ? 'Set FIRESTORE_EMULATOR_HOST to run against the explicit loopback emulator.' : false }, async () => {
  // The only cleanup is the dedicated demo namespace; no other test project is touched.
  const cleared = await fetch(`${base}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE', signal: AbortSignal.timeout(15000) });
  assert.equal(cleared.ok, true);
  const fixture = JSON.parse(await readFile(new URL('../public/data/demo-catalog.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('../catalog/notes-categories.json', import.meta.url), 'utf8'));
  const writes = [];
  for (const { id, ...fields } of fixture.categories) {
    const productCount = fixture.products.filter(product => product.categoryId === id).length;
    writes.push({ update: { name: `${documents}/categories/${id}`, fields: toFields({ ...fields, productCount }) } });
  }
  for (const { id, ...fields } of fixture.products) {
    const values = { ...fields, preservedCustom: { nested: ['sentinel', null, true, 1.25], original: id } };
    writes.push({ update: { name: `${documents}/products/${id}`, fields: toFields(values) } });
  }
  writes.push({ update: { name: `${documents}/productImages/photo-sentinel`, fields: {
    ...toFields({ mime: 'image/webp', base64: 'UklGRg==', bytes: 4, ownerOnlySentinel: 'must remain byte for byte' }),
    extraBytes: { bytesValue: 'AAECAw==' },
  } } });
  writes.push({ update: { name: `${documents}/catalogMeta/inventory`, fields: toFields({ categoryCount: 4, productCount: 12, revision: 'legacy-extra-kept-until-real-change' }) } });
  await request(`${documents}:commit`, { writes });
  const before = await snapshot();

  const preview = await runImport();
  assert.equal(preview.messages.length, 1);
  assert.deepEqual(preview.messages[0].counts, { beforeCategories: 4, afterCategories: 25, products: 12 });
  assert.equal(preview.messages[0].changed, true);
  assert.equal(preview.messages[0].mode, 'preview');
  assert.equal(preview.messages[0].productImport, false);
  assert.equal(preview.messages[0].creates.length, 21);
  assert.deepEqual(await snapshot(), before, 'Preview must not write any database document');

  const applied = await runImport(['--apply', '--confirm-project', project]);
  assert.equal(applied.messages.find(message => message.committed)?.committed, true);
  assert.equal(applied.messages.find(message => message.committed)?.productWrites, 0);
  assert.equal(applied.messages.find(message => message.committed)?.imageWrites, 0);
  assert.equal(applied.messages.find(message => message.verified)?.productsPreserved, true);
  assert.equal(applied.messages.find(message => message.verified)?.idempotent, true);
  const after = await snapshot();
  assert.deepEqual(after.products, before.products, 'Every product field and document timestamp must remain unchanged');
  assert.deepEqual(after.productImages, before.productImages, 'Photo documents, bytes and timestamps must remain unchanged');
  const categories = decoded(after.categories);
  assert.equal(categories.length, 25);
  const oldCategories = new Map(decoded(before.categories).map(category => [category.id, category]));
  for (const baseline of fixture.categories) {
    const current = categories.find(category => category.id === baseline.id);
    assert.equal(current.published, false);
    assert.equal(current.productCount, 3);
    const { published: oldPublished, ...oldFields } = oldCategories.get(baseline.id);
    const { published, updatedAt, ...currentFields } = current;
    assert.deepEqual(currentFields, oldFields, 'Legacy patch must preserve every field except publication and updatedAt');
    assert.equal(typeof updatedAt, 'string');
  }
  for (const expected of manifest.categories) {
    const current = categories.find(category => category.id === expected.id);
    assert.equal(current.name, expected.name);
    assert.equal(current.slug, expected.slug);
    assert.equal(current.order, expected.order);
    assert.equal(current.published, true);
    assert.equal(current.productCount, 0);
    assert.equal(current.lastProductId, '');
    assert.equal(typeof current.updatedAt, 'string');
    assert.equal('sourceTitle' in current, false);
    assert.equal('products' in current, false);
  }
  assert.equal(categories.filter(category => category.published === true).length, 21);
  const reservations = decoded(after.categorySlugs);
  assert.equal(reservations.length, 21);
  for (const expected of manifest.categories) assert.deepEqual(reservations.find(reservation => reservation.id === expected.slug), { id: expected.slug, categoryId: expected.id });
  const meta = decoded(after.catalogMeta);
  const inventory = meta.find(record => record.id === 'inventory');
  assert.equal(inventory.categoryCount, 25);
  assert.equal(inventory.productCount, 12);
  assert.equal(inventory.lastCategoryId, manifest.categories.at(-1).id);
  assert.equal(inventory.lastProductId, '');
  assert.equal('revision' in inventory, false);
  assert.equal(typeof inventory.updatedAt, 'string');
  const revision = meta.find(record => record.id === 'revision');
  assert.deepEqual(Object.keys(revision).sort(), ['id', 'version']);
  assert.match(revision.version, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  const repeated = await runImport(['--apply', '--confirm-project', project]);
  assert.equal(repeated.messages.length, 1, 'No-op import must not commit or generate a new revision');
  assert.equal(repeated.messages[0].changed, false);
  assert.deepEqual(repeated.messages[0].creates, []);
  assert.deepEqual(repeated.messages[0].hidesLegacy, []);
  assert.deepEqual(repeated.messages[0].reservations, []);
  assert.deepEqual(await snapshot(), after, 'Second apply must leave even document timestamps and revision unchanged');
});

test('Notes transport reads all 5000 products with cursors, keeps the final product intact and rejects 5001', { timeout: 120000, skip: !host ? 'Set FIRESTORE_EMULATOR_HOST to run against the explicit loopback emulator.' : false }, async () => {
  const cleared = await fetch(`${base}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE', signal: AbortSignal.timeout(15000) });
  assert.equal(cleared.ok, true);
  const fixture = JSON.parse(await readFile(new URL('../public/data/demo-catalog.json', import.meta.url), 'utf8'));
  const categoryId = fixture.categories[0].id;
  const writes = [
    { update: { name: `${documents}/categories/${categoryId}`, fields: toFields({ name: 'Reparto reale', slug: 'reparto-reale', order: 0, published: true, description: '', image: '', productCount: 5000, lastProductId: 'large-4999' }) } },
  ];
  // This test namespace is populated through the emulator's explicit owner
  // transport. Product writes belong to fixtures, never to the import itself.
  for (let index = 0; index < 5000; index++) {
    const id = `large-${String(index).padStart(4, '0')}`;
    writes.push({ update: { name: `${documents}/products/${id}`, fields: toFields({ name: `Articolo ${index}`, categoryId, published: true, isDemo: false, order: index, preserved: { index, marker: index === 4999 ? 'final-document' : 'fixture' } }) } });
  }
  writes.push({ update: { name: `${documents}/catalogMeta/inventory`, fields: toFields({ categoryCount: 1, productCount: 5000, lastCategoryId: categoryId, lastProductId: 'large-4999' }) } });
  for (let start = 0; start < writes.length; start += 400) await request(`${documents}:commit`, { writes: writes.slice(start, start + 400) });
  const before = await snapshot();
  const preview = await runImport();
  assert.equal(preview.messages[0].counts.products, 5000);
  assert.deepEqual(await snapshot(), before);
  const applied = await runImport(['--apply', '--confirm-project', project]);
  assert.equal(applied.messages.find(message => message.verified)?.productsPreserved, true);
  const after = await snapshot();
  assert.deepEqual(after.products, before.products);
  assert.equal(decoded(after.products).find(product => product.id === 'large-4999').preserved.marker, 'final-document');
  await request(`${documents}:commit`, { writes: [
    { update: { name: `${documents}/products/large-5000`, fields: toFields({ name: 'Fuori limite', categoryId, isDemo: false }) } },
    { update: { name: `${documents}/categories/${categoryId}`, fields: toFields({ productCount: 5001 }) }, updateMask: { fieldPaths: ['productCount'] } },
    { update: { name: `${documents}/catalogMeta/inventory`, fields: toFields({ productCount: 5001 }) }, updateMask: { fieldPaths: ['productCount'] } },
  ] });
  const oversized = await snapshot();
  await assert.rejects(runImport(), /Conteggio non valido|Inventario prodotti/i);
  assert.deepEqual(await snapshot(), oversized, 'An oversized catalog must be rejected without writes');
});
