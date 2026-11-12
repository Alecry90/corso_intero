// Firestore orders text by its UTF-8 representation. Keep the merge comparator
// aligned with the server; the document ID resolves duplicate names reliably.
const compareText = (a, b) => {
  const left = new TextEncoder().encode(String(a ?? ''));
  const right = new TextEncoder().encode(String(b ?? ''));
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
};

export function compareCatalogProducts(a, b, sort = 'recommended') {
  let value = 0;
  if (sort === 'price-asc' || sort === 'price-desc') {
    const left = typeof a.price === 'number' ? a.price : null;
    const right = typeof b.price === 'number' ? b.price : null;
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    value = left === null ? 0 : (left - right) * (sort === 'price-desc' ? -1 : 1);
  } else if (sort !== 'name') value = (a.order ?? 0) - (b.order ?? 0);
  return value || compareText(a.name, b.name) || compareText(a.id, b.id);
}

// A page consumes the lowest head across category streams. The cursor keeps
// only server snapshots and a small lookahead, never the complete inventory.
export async function mergeCatalogPage({ streams, read, compare, pageSize, check = () => {} }) {
  const working = streams.map(stream => ({ ...stream, buffer: [...stream.buffer] }));
  await Promise.all(working.map(async stream => {
    check();
    if (!stream.buffer.length && !stream.done) await read(stream, 1);
  }));
  const products = [];
  while (products.length < pageSize) {
    check();
    const available = working.filter(stream => stream.buffer.length);
    if (!available.length) break;
    const stream = available.reduce((first, item) => compare(item.buffer[0].product, first.buffer[0].product) < 0 ? item : first);
    products.push(stream.buffer.shift().product);
    if (!stream.buffer.length && !stream.done) await read(stream, Math.min(4, pageSize - products.length + 1));
  }
  return { products, streams: working, complete: working.every(stream => stream.done && !stream.buffer.length) };
}
