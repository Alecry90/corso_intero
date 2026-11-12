import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeVariantAvailability, variantRows, hasDetailedAvailability, productIsAvailable, matchesVariantSelection, variantSelectionStatus } from '../src/product-variants.js';

const dimensions = { sizes: ['M', 'L'], colors: ['Blu', 'Néro'] };
const variants = { 'M|Blu': true, 'L|Blu': false, 'L|Néro': true };
const product = (overrides = {}) => ({ ...dimensions, available: true, variantAvailability: { ...variants }, ...overrides });

test('omitted and empty availability retain legacy mode without inventing pairs', () => {
  assert.equal(normalizeVariantAvailability(undefined), undefined);
  assert.deepEqual(normalizeVariantAvailability({}), {});
  assert.deepEqual(normalizeVariantAvailability({}, { sizes: ['Old~label', 'OLD~LABEL'] }), {});
  for (const item of [product({ variantAvailability: undefined }), product({ variantAvailability: {} }), { available: true }]) {
    assert.equal(hasDetailedAvailability(item), false);
    assert.deepEqual(variantRows(item), []);
    assert.equal(productIsAvailable(item), true);
    assert.equal(variantSelectionStatus(item), 'legacy');
  }
});

test('validated maps are independent plain maps of exact offered keys and boolean values', () => {
  const input = { ...variants };
  const result = normalizeVariantAvailability(input, dimensions);
  assert.deepEqual(result, variants);
  assert.notEqual(result, input);
  const nullMap = Object.assign(Object.create(null), variants);
  assert.deepEqual(normalizeVariantAvailability(nullMap, dimensions), variants);
  for (const value of [null, [], true, new Date(), new Map(), { 'M|Blu': 'true' }, { 'M|Blu': 1 }, { 'M|Blu': null }, { 'M|Blu': undefined }]) {
    assert.throws(() => normalizeVariantAvailability(value, dimensions), /Disponibilità per variante/u);
  }
  for (const key of ['M', 'M|Blu|extra', 'M|Blu~L|Blu', '|', '|Blu', 'M|', 'XL|Blu', 'M|Rosso', 'm|Blu']) {
    assert.throws(() => normalizeVariantAvailability({ [key]: true }, dimensions), /Disponibilità per variante/u);
  }
});

test('managed labels reject separator ambiguity and normalized duplicates while legacy mode stays compatible', () => {
  for (const invalid of [
    { sizes: ['M', 'm'], colors: ['Blu'] },
    { sizes: ['M', ' M '], colors: ['Blu'] },
    { sizes: ['M', 'M'], colors: ['Blu'] },
    { sizes: ['M'], colors: ['Néro', 'Nero'] },
    { sizes: ['M|L'], colors: ['Blu'] },
    { sizes: ['M~L'], colors: ['Blu'] },
    { sizes: [''], colors: ['Blu'] },
    { sizes: [1], colors: ['Blu'] },
    { sizes: 'M', colors: ['Blu'] },
    { sizes: ['M'.repeat(51)], colors: ['Blu'] },
  ]) assert.throws(() => normalizeVariantAvailability({ 'M|Blu': true }, invalid), /Disponibilità per variante/u);
  assert.deepEqual(normalizeVariantAvailability({}, { sizes: ['M~L'], colors: ['Blu', 'blu'] }), {});
});

test('single-dimension products require the corresponding empty key part and both-empty products are forbidden', () => {
  assert.deepEqual(normalizeVariantAvailability({ 'M|': true }, { sizes: ['M'] }), { 'M|': true });
  assert.deepEqual(normalizeVariantAvailability({ '|Blu': false }, { colors: ['Blu'] }), { '|Blu': false });
  assert.throws(() => normalizeVariantAvailability({ '|': true }), /almeno una/u);
  assert.throws(() => normalizeVariantAvailability({ 'M|Blu': true }, { sizes: ['M'] }), /taglie e i colori/u);
  const sizeOnly = product({ sizes: ['M'], colors: [], variantAvailability: { 'M|': true } });
  assert.equal(variantSelectionStatus(sizeOnly), 'choose');
  assert.equal(variantSelectionStatus(sizeOnly, { size: 'm' }), 'available');
  assert.equal(matchesVariantSelection(sizeOnly, { size: 'M', color: 'Blu' }), false);
});

test('at most 100 offered combinations are accepted', () => {
  const sizes = Array.from({ length: 20 }, (_, i) => `T${i}`);
  const colors = Array.from({ length: 20 }, (_, i) => `C${i}`);
  const pairs = sizes.flatMap(size => colors.map(color => [`${size}|${color}`, true]));
  assert.equal(Object.keys(normalizeVariantAvailability(Object.fromEntries(pairs.slice(0, 100)), { sizes, colors })).length, 100);
  assert.throws(() => normalizeVariantAvailability(Object.fromEntries(pairs.slice(0, 101)), { sizes, colors }), /massimo 100/u);
});

test('rows and overall availability honor general unavailability and all-unavailable maps', () => {
  assert.deepEqual(variantRows(product()), [
    { key: 'M|Blu', size: 'M', color: 'Blu', available: true },
    { key: 'L|Blu', size: 'L', color: 'Blu', available: false },
    { key: 'L|Néro', size: 'L', color: 'Néro', available: true },
  ]);
  assert.equal(productIsAvailable(product()), true);
  assert.equal(productIsAvailable(product({ variantAvailability: { 'M|Blu': false } })), false);
  const disabled = product({ available: false });
  assert.ok(variantRows(disabled).every(row => row.available === false));
  assert.equal(productIsAvailable(disabled), false);
  assert.equal(matchesVariantSelection(disabled, { size: 'M', color: 'Blu', availableOnly: true }), false);
  assert.equal(variantSelectionStatus(disabled), 'unavailable');
  assert.equal(productIsAvailable(product({ available: false, variantAvailability: {} })), false);
});

test('filters require an actual pair, match normalized labels exactly, and keep unavailable offers when requested', () => {
  const item = product();
  assert.equal(matchesVariantSelection(item, { size: ' l ', color: 'nero', availableOnly: true }), true);
  assert.equal(matchesVariantSelection(item, { size: 'M', color: 'Nero' }), false);
  assert.equal(matchesVariantSelection(item, { size: 'L', color: 'Blu' }), true);
  assert.equal(matchesVariantSelection(item, { size: 'L', color: 'Blu', availableOnly: true }), false);
  assert.equal(matchesVariantSelection(item, { size: 'L', availableOnly: true }), true);
  assert.equal(matchesVariantSelection(item, { color: 'bl' }), false);
  assert.equal(matchesVariantSelection(item, { size: 'XL' }), false);
  const legacy = product({ variantAvailability: {} });
  assert.equal(matchesVariantSelection(legacy, { size: 'm', color: 'nero', availableOnly: true }), true);
  assert.equal(matchesVariantSelection(legacy, { size: 'XL' }), false);
  assert.equal(matchesVariantSelection(legacy, { color: 'bl' }), false);
});

test('selection states distinguish a required choice, unavailable offers and pairs not offered', () => {
  const item = product();
  assert.equal(variantSelectionStatus(item), 'choose');
  assert.equal(variantSelectionStatus(item, { size: 'M' }), 'choose');
  assert.equal(variantSelectionStatus(item, { color: 'Nero' }), 'choose');
  assert.equal(variantSelectionStatus(item, { size: 'M', color: 'Blu' }), 'available');
  assert.equal(variantSelectionStatus(item, { size: 'L', color: 'Blu' }), 'unavailable');
  assert.equal(variantSelectionStatus(item, { size: 'M', color: 'Nero' }), 'not-offered');
  assert.equal(variantSelectionStatus(item, { size: 'XL' }), 'not-offered');
  assert.equal(variantSelectionStatus(product({ variantAvailability: { 'M|Blu': false } }), { size: 'M' }), 'unavailable');
});

test('public helpers fail closed when direct SDK data bypasses referential validation', () => {
  for (const item of [
    product({ variantAvailability: { 'XL|Blu': true } }),
    product({ variantAvailability: { 'M|Rosso': true } }),
    product({ variantAvailability: { ...variants, 'XL|Blu': true } }),
    product({ sizes: ['M', 'm'], variantAvailability: { 'M|Blu': true } }),
  ]) {
    assert.equal(hasDetailedAvailability(item), true);
    assert.deepEqual(variantRows(item), []);
    assert.equal(productIsAvailable(item), false);
    assert.equal(matchesVariantSelection(item), false);
    assert.equal(matchesVariantSelection(item, { size: 'XL', color: 'Blu', availableOnly: true }), false);
    assert.equal(variantSelectionStatus(item), 'not-offered');
    assert.throws(() => normalizeVariantAvailability(item.variantAvailability, item), /Disponibilità per variante/u);
  }
});

const adapterURL = new URL('../src/firestore-catalog.js', import.meta.url);
const adapterSource = (await readFile(adapterURL, 'utf8'))
  .replace("import { initializeFirebaseApp } from './firebase-auth.js';", 'const initializeFirebaseApp = async () => null;')
  .replace("'./catalog-pager.js'", JSON.stringify(new URL('../src/catalog-pager.js', import.meta.url).href))
  .replace("'./product-variants.js'", JSON.stringify(new URL('../src/product-variants.js', import.meta.url).href));
const adapter = await import(`data:text/javascript;base64,${Buffer.from(adapterSource + '\nexport {productInput};').toString('base64')}`);

test('production input keeps omission distinct from an explicit clear and validates managed raw labels before deduplication', async () => {
  const body = { name: 'Pigiama', categoryId: 'a', ...dimensions };
  const omitted = await adapter.productInput(body, 'p');
  assert.equal(Object.hasOwn(omitted.record, 'variantAvailability'), false);
  assert.deepEqual((await adapter.productInput({ ...body, variantAvailability: {} }, 'p')).record.variantAvailability, {});
  assert.deepEqual((await adapter.productInput({ ...body, variantAvailability: variants }, 'p')).record.variantAvailability, variants);
  for (const extra of [
    { variantAvailability: { 'XL|Blu': true } },
    { variantAvailability: { 'M|Blu': 1 } },
    { sizes: ['M', 'M'], variantAvailability: { 'M|Blu': true } },
    { sizes: ['M', 'm'], variantAvailability: { 'M|Blu': true } },
    { colors: ['Blu~Nero'], variantAvailability: { 'M|Blu~Nero': true } },
  ]) await assert.rejects(adapter.productInput({ ...body, ...extra }, 'p'), { code: 'invalid-input', status: 400 });
  const legacy = await adapter.productInput({ ...body, colors: ['Blu~Nero', 'blu~nero'], sizes: ['M', 'M'] }, 'p');
  assert.deepEqual(legacy.record.sizes, ['M']);
  assert.deepEqual(legacy.record.colors, ['Blu~Nero', 'blu~nero']);
});
