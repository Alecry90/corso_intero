import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planCatalogImport } from '../scripts/catalog-import-plan.mjs';

const manifest = JSON.parse(readFileSync(new URL('../catalog/notes-categories.json', import.meta.url), 'utf8'));
const demo = JSON.parse(readFileSync(new URL('../public/data/demo-catalog.json', import.meta.url), 'utf8'));
function fixture() {
  return {
    manifest: structuredClone(manifest),
    categories: demo.categories.map(category => ({ ...structuredClone(category), productCount: demo.products.filter(product => product.categoryId === category.id).length })),
    products: structuredClone(demo.products),
    inventory: { categoryCount: demo.categories.length, productCount: demo.products.length, revision: 'legacy-revision' },
    reservations: [],
    legacyCategories: structuredClone(demo.categories),
  };
}
const fails = (input, code) => assert.throws(() => planCatalogImport(input), error => error.code === code);
function applied(input, plan) {
  const result = structuredClone(input);
  for (const record of plan.creates) result.categories.push({ id: record.id, ...record.fields });
  for (const record of plan.patches) Object.assign(result.categories.find(category => category.id === record.id), record.fields);
  result.reservations.push(...plan.reservations.map(record => ({ id: record.id, ...record.fields })));
  result.inventory = { ...plan.inventory };
  return result;
}
function addRealProduct(input, categoryId, overrides = {}) {
  input.products.push({ id: 'real-preserved', categoryId, name: 'Articolo reale', published: false, image: '/api/images/real-preserved', ...overrides });
  input.categories.find(category => category.id === categoryId).productCount++;
  input.inventory.productCount++;
}

test('real 21-note manifest creates only categories and hides the four unchanged demo departments', () => {
  const source = fixture();
  const before = structuredClone(source);
  const plan = planCatalogImport(source);
  assert.equal(plan.creates.length, 21);
  assert.equal(plan.patches.length, 4);
  assert.equal(plan.reservations.length, 21);
  assert.equal(plan.changed, true);
  assert.deepEqual(plan.counts, { beforeCategories: 4, afterCategories: 25, products: 12 });
  assert.deepEqual(plan.preservedLegacy, []);
  assert.equal(plan.inventory.categoryCount, 25);
  assert.equal(plan.inventory.productCount, 12);
  assert.equal(plan.inventory.lastCategoryId, manifest.categories.at(-1).id);
  assert.equal(plan.inventory.lastProductId, '');
  for (const record of plan.creates) {
    assert.deepEqual(Object.keys(record.fields).sort(), ['description','image','lastProductId','name','order','productCount','published','slug']);
    assert.equal(record.fields.published, true);
    assert.equal(record.fields.productCount, 0);
    assert.equal(record.fields.description, '');
    assert.equal(record.fields.image, '');
  }
  for (const record of plan.patches) assert.deepEqual(record.fields, { published: false });
  assert.deepEqual(source, before);
  assert.equal(JSON.stringify(plan).includes('Lupetti'), false);
  assert.equal(JSON.stringify(plan).includes('Art.349'), false);
  assert.equal('products' in plan, false);
});

test('applying an import then planning again is a genuine no-op with no new writes', () => {
  const initial = fixture();
  const first = planCatalogImport(initial);
  const committed = applied(initial, first);
  committed.inventory.revision = 'irrelevant-legacy-extra';
  const second = planCatalogImport(committed);
  assert.equal(second.changed, false);
  assert.deepEqual(second.creates, []);
  assert.deepEqual(second.patches, []);
  assert.deepEqual(second.reservations, []);
  assert.deepEqual(second.counts, { beforeCategories: 25, afterCategories: 25, products: 12 });
  assert.deepEqual(committed.products, initial.products);
});

test('existing target IDs retain owner name, slug, order, visibility and every other field', () => {
  const source = fixture();
  const target = source.manifest.categories[0];
  const existing = { id: target.id, name: 'Nome scelto dal gestore', slug: 'gestore-personale', order: 999, published: false, description: 'Testo reale', image: '/assets/reale.webp', productCount: 0, lastProductId: '', customUntouched: 'conservare' };
  source.categories.push(existing);
  source.inventory.categoryCount++;
  const before = structuredClone(existing);
  const plan = planCatalogImport(source);
  assert.equal(plan.creates.length, 20);
  assert.equal(plan.patches.some(record => record.id === target.id), false);
  assert.ok(plan.reservations.some(record => record.id === 'gestore-personale' && record.fields.categoryId === target.id));
  assert.equal(plan.reservations.some(record => record.id === target.slug), false);
  assert.deepEqual(existing, before);
  assert.deepEqual(applied(source, plan).categories.find(record => record.id === target.id), before);
});

test('a real product, missing isDemo, false or nonboolean flag protects its legacy department', () => {
  for (const isDemo of [undefined, false, 'true', null]) {
    const source = fixture();
    addRealProduct(source, 'intimo', isDemo === undefined ? {} : { isDemo });
    const plan = planCatalogImport(source);
    assert.equal(plan.patches.some(record => record.id === 'intimo'), false);
    assert.ok(plan.preservedLegacy.includes('intimo'));
    assert.equal(plan.inventory.productCount, 13);
    assert.deepEqual(applied(source, plan).products, source.products);
  }
});

test('legacy names or slugs edited by the owner protect the entire department', () => {
  for (const edit of [{ name: 'Reparto del titolare' }, { slug: 'reparto-del-titolare' }]) {
    const source = fixture();
    Object.assign(source.categories.find(record => record.id === 'neonato'), edit);
    const plan = planCatalogImport(source);
    assert.equal(plan.patches.some(record => record.id === 'neonato'), false);
    assert.ok(plan.preservedLegacy.includes('neonato'));
  }
});

test('legacy ID that is a target is preserved, and already hidden qualifying legacy needs no patch', () => {
  const source = fixture();
  source.manifest.categories.push({ id: 'intimo', name: 'Titolo del manifesto', slug: 'altro-slug', order: 500 });
  source.categories.find(record => record.id === 'neonato').published = false;
  const plan = planCatalogImport(source);
  assert.equal(plan.patches.some(record => ['intimo', 'neonato'].includes(record.id)), false);
  assert.ok(plan.reservations.some(record => record.id === 'intimo' && record.fields.categoryId === 'intimo'));
});

test('slug conflicts with any existing category or reservation abort without touching data', () => {
  const collision = fixture();
  collision.categories[0].slug = collision.manifest.categories[0].slug;
  fails(collision, 'slug-collision');
  const reserved = fixture();
  reserved.reservations.push({ id: reserved.manifest.categories[0].slug, categoryId: 'elsewhere' });
  fails(reserved, 'slug-collision');
  const unrelatedConflict = fixture();
  unrelatedConflict.reservations.push({ id: 'intimo', categoryId: 'neonato' });
  fails(unrelatedConflict, 'slug-collision');
  const existingDuplicate = fixture();
  existingDuplicate.categories[1].slug = existingDuplicate.categories[0].slug;
  fails(existingDuplicate, 'slug-collision');
});

test('duplicate IDs, manifest slugs and reservation records are rejected', () => {
  const duplicateTarget = fixture();
  duplicateTarget.manifest.categories.push({ ...duplicateTarget.manifest.categories[0] });
  fails(duplicateTarget, 'duplicate-id');
  const duplicateSlug = fixture();
  duplicateSlug.manifest.categories[1].slug = duplicateSlug.manifest.categories[0].slug;
  fails(duplicateSlug, 'slug-collision');
  const duplicateReservation = fixture();
  duplicateReservation.reservations = [{ id: 'intimo', categoryId: 'intimo' }, { id: 'intimo', categoryId: 'intimo' }];
  fails(duplicateReservation, 'duplicate-slug');
  const duplicateProduct = fixture();
  duplicateProduct.products.push({ ...duplicateProduct.products[0] });
  fails(duplicateProduct, 'duplicate-id');
});

test('global counts and every parent count must match complete document reads', () => {
  for (const patch of [{ categoryCount: 3 }, { productCount: 11 }, { categoryCount: '4' }, { productCount: -1 }]) {
    const source = fixture(); Object.assign(source.inventory, patch);
    fails(source, typeof patch.categoryCount === 'string' || patch.productCount === -1 ? 'invalid-count' : 'inventory-mismatch');
  }
  const incorrectParent = fixture();
  incorrectParent.categories[0].productCount--;
  fails(incorrectParent, 'category-count-mismatch');
  const orphan = fixture();
  orphan.products[0].categoryId = 'missing';
  fails(orphan, 'orphan-product');
  const missingInventory = fixture(); missingInventory.inventory = null;
  fails(missingInventory, 'inventory-missing');
});

test('50/5000 hard limits cannot be bypassed by the migration', () => {
  const categories = fixture();
  for (let index = 0; index < 30; index++) categories.categories.push({ id: 'extra-' + index, name: 'Extra ' + index, slug: 'extra-' + index, productCount: 0, published: true });
  categories.inventory.categoryCount = categories.categories.length;
  fails(categories, 'catalog-limit');
  const products = fixture();
  products.inventory.productCount = 5001;
  fails(products, 'invalid-count');
});

test('existing product documents including images are preserved byte for byte across the plan', () => {
  const source = fixture();
  addRealProduct(source, 'intimo', { isDemo: false, description: 'Descrizione reale', sizes: ['S'], metadata: { untouched: true } });
  source.products.push({ id: 'another-draft', categoryId: 'neonato', isDemo: true, published: false, image: '/api/images/another-draft', nested: { value: ['A', 1] } });
  source.categories.find(category => category.id === 'neonato').productCount++;
  source.inventory.productCount++;
  const before = JSON.stringify(source.products);
  const plan = planCatalogImport(source);
  assert.equal(JSON.stringify(applied(source, plan).products), before);
  assert.equal(JSON.stringify(source.products), before);
  assert.equal(plan.inventory.productCount, 14);
});

test('product import switches and product payloads are rejected rather than interpreted as departments', () => {
  for (const value of [true, undefined, 'false']) {
    const source = fixture(); source.manifest.productImport = value;
    fails(source, 'product-import-forbidden');
  }
  const source = fixture(); source.manifest.products = [{ name: 'Lupetti Art.349' }];
  fails(source, 'product-import-forbidden');
});

test('matching reservation is not rewritten; opaque metadata is absent from output inventory', () => {
  const source = fixture();
  source.reservations.push({ id: source.manifest.categories[0].slug, categoryId: source.manifest.categories[0].id });
  source.inventory.lastProductId = 'intimo-1';
  source.inventory.ownerEmail = 'private@example.test';
  const plan = planCatalogImport(source);
  assert.equal(plan.reservations.length, 20);
  assert.deepEqual(Object.keys(plan.inventory).sort(), ['categoryCount','lastCategoryId','lastProductId','productCount']);
  assert.equal(plan.inventory.lastProductId, 'intimo-1');
  assert.equal(JSON.stringify(plan).includes('private@example.test'), false);
});

test('the pure planner is deterministic and never generates timestamps or revision IDs', () => {
  const source = fixture();
  const a = planCatalogImport(source);
  const b = planCatalogImport(source);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a).includes('updatedAt'), false);
  assert.equal(JSON.stringify(a).includes('version'), false);
});
