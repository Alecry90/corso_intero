import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCatalogProducts, mergeCatalogPage } from '../src/catalog-pager.js';

test('cursor merge fetches a bounded first page and preserves all 5000 products across pages', async () => {
  const records = Array.from({ length: 5000 }, (_, index) => ({ id: `p${String(index).padStart(4, '0')}`, name: `Prodotto ${String(index).padStart(4, '0')}`, order: index, categoryId: String(index % 3) }));
  let readCount = 0;
  const read = async (stream, size) => {
    const matching = records.filter(product => product.categoryId === stream.categoryId);
    const items = matching.slice(stream.offset, stream.offset + size);
    readCount += items.length;
    stream.offset += items.length;
    stream.buffer.push(...items.map(product => ({ product })));
    stream.done = items.length < size;
  };
  const original = ['0', '1', '2'].map(categoryId => ({ categoryId, buffer: [], offset: 0, done: false }));
  let page = await mergeCatalogPage({ streams: original, read, pageSize: 24, compare: compareCatalogProducts });
  assert.equal(page.products.length, 24);
  assert.ok(readCount < 40, `first-page document reads: ${readCount}`);
  assert.equal(page.complete, false);
  assert.deepEqual(original.map(stream => stream.offset), [0, 0, 0], 'a page must not mutate the previous cursor');
  const seen = [...page.products];
  while (!page.complete) {
    page = await mergeCatalogPage({ streams: page.streams, read, pageSize: 100, compare: compareCatalogProducts });
    seen.push(...page.products);
  }
  assert.equal(seen.length, 5000);
  assert.equal(new Set(seen.map(product => product.id)).size, 5000);
  assert.deepEqual(seen.map(product => product.id), records.map(product => product.id));
});

test('global merge places prices without a value last in both directions and resolves duplicate names', async () => {
  const records = [
    { id: 'a', name: 'Uguale', price: 20, categoryId: 'one' },
    { id: 'b', name: 'Uguale', price: 20, categoryId: 'two' },
    { id: 'c', name: 'Economico', price: 0, categoryId: 'two' },
    { id: 'd', name: 'Senza prezzo', price: null, categoryId: 'one' },
  ];
  for (const sort of ['name', 'price-asc', 'price-desc']) {
    const compare = (a, b) => compareCatalogProducts(a, b, sort);
    const ordered = [...records].sort(compare);
    const read = async (stream, size) => {
      const items = ordered.filter(product => product.categoryId === stream.categoryId).slice(stream.offset, stream.offset + size);
      stream.offset += items.length;
      stream.buffer.push(...items.map(product => ({ product })));
      stream.done = items.length < size;
    };
    const page = await mergeCatalogPage({ streams: ['one', 'two'].map(categoryId => ({ categoryId, offset: 0, buffer: [], done: false })), read, pageSize: 10, compare });
    assert.deepEqual(page.products, ordered);
    if (sort.startsWith('price')) assert.equal(page.products.at(-1).id, 'd');
  }
});

test('aborting a page stops subsequent stream reads and leaves its cursor reusable', async () => {
  const controller = new AbortController();
  const streams = [{ buffer: [], done: false }];
  let reads = 0;
  await assert.rejects(mergeCatalogPage({ streams, pageSize: 24, compare: compareCatalogProducts, check: () => controller.signal.throwIfAborted(), read: async stream => { reads++; stream.buffer.push({ product: { id: 'p', name: 'Prodotto' } }); controller.abort(); } }), { name: 'AbortError' });
  assert.equal(reads, 1);
  assert.deepEqual(streams, [{ buffer: [], done: false }]);
});
