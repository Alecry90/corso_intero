import test from 'node:test';
import assert from 'node:assert/strict';
import { BULK_CSV_HEADERS, BULK_CSV_LIMITS, exportProductCSV, parseProductUpdateCSV, planProductUpdates } from '../src/product-bulk-model.js';

const categories = [{ id: 'intimo', slug: 'intimo-donna', name: 'Intimo donna' }, { id: 'pigiami', slug: 'pigiami', name: 'Pigiami' }];
const product = (overrides = {}) => ({ id: 'p1', imageVersion: '100:42', name: 'Maglia', categoryId: 'intimo', sku: 'A-1', brand: 'Marca', description: 'Cotone morbido', price: 19.9,
  sizes: ['S', 'M'], colors: ['Blu, notte', 'Bianco'], material: 'Cotone', available: true, published: true, isDemo: false, order: 3, featured: false, newArrival: true,
  image: '/api/images/p1', imageAlt: 'Maglia blu', gallerySlots: [1, 2], ...overrides });
const context = (products = [product()]) => ({ categories, products });
const row = (overrides = {}) => ({ id: 'p1', versione: '100:42', ...overrides });
const plan = (overrides, products = [product()]) => planProductUpdates([row(overrides)], context(products));

test('export uses stable identities and versions, excludes trash, includes examples, and reimports as a no-op', () => {
  const products = [product(), product({ id: 'demo', isDemo: true, imageVersion: undefined }), product({ id: 'trash', archived: true })];
  const snapshot = JSON.stringify(products);
  const output = exportProductCSV(context(products));
  assert.equal(output.count, 2);
  assert.match(output.filename, /^intimo-patrizia-prodotti-\d{4}-\d{2}-\d{2}\.csv$/u);
  assert.equal(output.csv.charCodeAt(0), 0xfeff);
  assert.equal(output.csv.split('\r\n')[0].slice(1), BULK_CSV_HEADERS.join(';'));
  const rows = parseProductUpdateCSV(output.csv);
  assert.equal(rows[1].versione, 'initial');
  assert.equal(rows[0].reparto, 'intimo');
  assert.deepEqual(planProductUpdates(rows, context(products)), {
    items: [{ line: 2, id: 'p1', name: 'Maglia', changes: [], unchanged: true }, { line: 3, id: 'demo', name: 'Maglia', changes: [], unchanged: true }],
    changed: 0, unchanged: 2, errors: 0,
  });
  assert.equal(JSON.stringify(products), snapshot);
});

test('CSV quoting roundtrips commas, semicolons, escaped quotes and multiline text', () => {
  const source = product({ name: 'Maglia; "cotone"', description: 'Prima riga\r\nSeconda, "riga"\nTerza' });
  const rows = parseProductUpdateCSV(exportProductCSV(context([source])).csv);
  assert.equal(rows[0].nome, source.name);
  assert.equal(rows[0].descrizione, source.description);
  assert.equal(planProductUpdates(rows, context([source])).unchanged, 1);
  assert.deepEqual(parseProductUpdateCSV('\uFEFFid,versione,nome\r\np1,100:42,"Maglia, cotone"\r\n'), [row({ nome: 'Maglia, cotone' })]);
});

test('formula protection is reversible for formulas, whitespace, tabs, line breaks and leading apostrophes', () => {
  const values = ['=1+1', '+SUM(1)', '-test', '@nome', '  =1', '\tNome', '\rNome', '\nNome', "'Nome", "''Nome", "'=1", 'Nome normale'];
  for (const value of values) {
    const source = product({ name: value, description: value, sku: value, brand: value });
    const csv = exportProductCSV(context([source])).csv;
    const parsed = parseProductUpdateCSV(csv)[0];
    for (const key of ['nome', 'descrizione', 'codice', 'marca']) assert.equal(parsed[key], value, `${key}: ${JSON.stringify(value)}`);
    assert.equal(planProductUpdates([parsed], context([source])).unchanged, 1);
    if (value !== 'Nome normale') assert.ok(csv.includes("'"));
  }
  const manuallyEntered = parseProductUpdateCSV("id;versione;nome\np1;100:42;'Nome");
  assert.equal(manuallyEntered[0].nome, "'Nome", 'A legitimate apostrophe is not stripped.');
});

test('optional absent columns preserve all original fields, flags, examples and detailed availability', () => {
  const variantAvailability = { 'S|Blu, notte': true, 'M|Bianco': false };
  const source = product({ variantAvailability, isDemo: true, featured: true, published: false, available: false, customerEmail: 'private@example.test', updatedAt: { seconds: 100 } });
  const snapshot = JSON.stringify(source);
  const result = plan({ prezzo: '24,50' }, [source]);
  assert.equal(result.changed, 1); assert.equal(result.errors, 0);
  const { payload, changes } = result.items[0];
  assert.deepEqual(changes, [{ field: 'price', label: 'Prezzo', before: '19,90', after: '24,50' }]);
  for (const key of ['name', 'categoryId', 'description', 'material', 'imageAlt', 'available', 'published', 'isDemo', 'order', 'sku', 'brand', 'featured', 'newArrival']) assert.equal(payload[key], source[key]);
  assert.equal(payload.price, 24.5);
  assert.deepEqual(payload.sizes, source.sizes); assert.deepEqual(payload.colors, source.colors);
  assert.deepEqual(payload.variantAvailability, variantAvailability);
  assert.notEqual(payload.variantAvailability, variantAvailability);
  for (const key of ['id', 'image', 'gallerySlots', 'imageVersion', 'updatedAt', 'customerEmail', 'archived', 'removeImage', 'imageData']) assert.equal(Object.hasOwn(payload, key), false);
  assert.equal(JSON.stringify(source), snapshot);
});

test('initial versions and absent availability remain compatible without inventing variant maps', () => {
  const result = plan({ versione: 'initial', nome: 'Maglia nuova' }, [product({ imageVersion: undefined, sku: undefined, brand: undefined, featured: undefined, newArrival: undefined })]);
  assert.equal(result.changed, 1);
  assert.equal(Object.hasOwn(result.items[0].payload, 'variantAvailability'), false);
  assert.equal(result.items[0].payload.sku, ''); assert.equal(result.items[0].payload.featured, false);
});

test('Italian prices, null prices, category IDs/slugs and clearing optional text/lists are supported', () => {
  const result = plan({ prezzo: '', codice: '', marca: '', tessuto: '', descrizione: '', taglie: '', colori: '', reparto: 'pigiami', ordine: '9999', disponibile: 'no', pubblicato: 'sì', in_vetrina: 'true', novita: '0' });
  assert.equal(result.errors, 0);
  assert.deepEqual(result.items[0].payload, {
    name: 'Maglia', categoryId: 'pigiami', description: '', price: null, sizes: [], colors: [], material: '', imageAlt: 'Maglia blu', available: false, published: true, isDemo: false,
    order: 9999, sku: '', brand: '', featured: true, newArrival: false,
  });
  assert.equal(plan({ reparto: 'intimo-donna', prezzo: '19.90', ordine: '03', disponibile: '1' }).unchanged, 1);
  assert.equal(plan({ prezzo: '100000,00' }).items[0].payload.price, 100000);
});

test('edited text previews the same trimmed values that the persistence adapter saves', () => {
  const edits = { nome: '  Nuovo nome  ', descrizione: '\n\r\nPrima riga\nSeconda riga\n\t', tessuto: '  Lana  ', marca: '\tNuova marca ', codice: '  NEW-1  ' };
  const fieldMap = { nome: 'name', descrizione: 'description', tessuto: 'material', marca: 'brand', codice: 'sku' };
  const result = plan(edits);
  assert.equal(result.changed, 1); assert.equal(result.errors, 0);
  for (const [column, value] of Object.entries(edits)) {
    const field = fieldMap[column];
    assert.equal(result.items[0].payload[field], value.trim());
    assert.equal(result.items[0].changes.find(change => change.field === field).after, value.trim());
  }
  assert.equal(plan({ versione: '99:0', nome: '  Maglia  ', descrizione: '\nCotone morbido\n', codice: ' A-1 ' }).unchanged, 1, 'Whitespace-only edits normalize to no-ops even with an old version.');
  assert.equal(plan({ nome: `  ${'N'.repeat(120)}  ` }).changed, 1, 'Text limits apply after the same trimming as the adapter.');
  const legacy = product({ name: '  =Nome precedente', description: '\nTesto precedente\n' });
  const exported = parseProductUpdateCSV(exportProductCSV(context([legacy])).csv);
  assert.equal(planProductUpdates(exported, context([legacy])).unchanged, 1, 'An exact export retains legacy/formula whitespace as a no-op.');
});

test('list labels split only on pipes and preserve literal commas', () => {
  const result = plan({ colori: 'Blu, notte|Rosso, rubino', taglie: 'S|M|L' });
  assert.equal(result.errors, 0);
  assert.deepEqual(result.items[0].payload.colors, ['Blu, notte', 'Rosso, rubino']);
  assert.deepEqual(result.items[0].payload.sizes, ['S', 'M', 'L']);
  assert.throws(() => exportProductCSV(context([product({ colors: ['Blu|Nero'] })])), /senza il carattere \|/u);
});

test('stale changed rows block while genuinely unchanged rows ignore timestamp mismatches', () => {
  assert.equal(plan({ versione: '99:0', nome: 'Maglia' }).unchanged, 1);
  assert.equal(plan({ versione: '99:0', prezzo: '19,90' }).unchanged, 1);
  const result = plan({ versione: '99:0', nome: 'Maglia aggiornata' });
  assert.equal(result.errors, 1); assert.equal(result.changed, 0);
  assert.match(result.items[0].error, /file vecchio: esporta di nuovo/iu);
  assert.equal(Object.hasOwn(result.items[0], 'payload'), false);
});

test('stable IDs never match SKUs, missing/deleted and archived products block, and duplicate IDs invalidate both rows', () => {
  const missing = plan({ id: 'A-1', nome: 'Nuovo nome' });
  assert.equal(missing.errors, 1); assert.match(missing.items[0].error, /non trovato/u);
  assert.equal(plan({ nome: 'Nuovo' }, []).errors, 1);
  assert.match(plan({ nome: 'Nuovo' }, [product({ archived: true })]).items[0].error, /cestino/u);
  const duplicates = planProductUpdates([row({ nome: 'Uno' }), row({ nome: 'Due' })], context());
  assert.equal(duplicates.errors, 2); assert.equal(duplicates.changed, 0);
  assert.ok(duplicates.items.every(item => /ripetuto/u.test(item.error)));
  assert.equal(planProductUpdates([row({ nome: 'Uno' }), row({ id: 'p2', nome: 'Due' })], context([product(), product({ id: 'p2' })])).changed, 2, 'Duplicate SKUs do not change identity matching.');
});

test('merged dimensions validate existing detailed maps instead of erasing dangling combinations', () => {
  const source = product({ variantAvailability: { 'S|Blu, notte': true, 'M|Bianco': false } });
  const removed = plan({ taglie: 'M' }, [source]);
  assert.equal(removed.errors, 1); assert.match(removed.items[0].error, /Disponibilità per variante/u);
  assert.equal(Object.hasOwn(removed.items[0], 'payload'), false);
  const expanded = plan({ taglie: 'S|M|L' }, [source]);
  assert.equal(expanded.changed, 1); assert.deepEqual(expanded.items[0].payload.variantAvailability, source.variantAvailability);
  const corrupt = plan({ nome: 'Nuovo nome' }, [product({ variantAvailability: { 'XL|Bianco': true } })]);
  assert.equal(corrupt.errors, 1);
  assert.equal(plan({ nome: 'Nuovo nome' }, [product({ variantAvailability: {} })]).changed, 1);
  assert.equal(plan({ colori: 'Blu|blù' }, [product({ variantAvailability: { 'S|Blu, notte': true } })]).errors, 1);
});

test('changed SKUs reserve normalized current and proposed codes, including trash, without blocking legacy duplicates', () => {
  const products = [product(), product({ id: 'p2', sku: 'B-2', archived: true }), product({ id: 'p3', sku: 'A-1' })];
  assert.match(plan({ codice: ' ｂ-2 ' }, products).items[0].error, /Codice già usato/u);
  assert.equal(plan({ prezzo: '24,50' }, products).changed, 1, 'An unchanged legacy duplicate code permits a price edit.');
  assert.equal(plan({}, products).unchanged, 1);
  assert.equal(plan({ codice: '' }, products).changed, 1, 'Clearing a code releases this attribute.');
  const active = [product(), product({ id: 'p2', sku: 'B-2' })];
  const proposed = planProductUpdates([row({ codice: 'NEW' }), row({ id: 'p2', codice: ' ｎｅｗ ' })], context(active));
  assert.equal(proposed.errors, 2); assert.equal(proposed.changed, 0);
  const swap = planProductUpdates([row({ codice: 'B-2' }), row({ id: 'p2', codice: 'A-1' })], context(active));
  assert.equal(swap.errors, 2); assert.equal(swap.changed, 0);
});

test('CSV syntax rejects missing/unknown/duplicate headers, malformed quotes and inconsistent row lengths', () => {
  for (const csv of [
    'nome;versione\nMaglia;100:42', 'id;nome\np1;Maglia', 'id;versione;foto\np1;100:42;photo.webp', 'id;versione;isDemo\np1;100:42;false',
    'id;versione;nome;nome\np1;100:42;A;B', 'id;versione\np1', 'id;versione\np1;100:42;extra',
    'id;versione;nome\np1;100:42;"Non chiuso', 'id;versione;nome\np1;100:42;"Nome" x', 'id;versione;nome\np1;100:42;Mag"lia', 'id;versione\n',
  ]) assert.throws(() => parseProductUpdateCSV(csv), csv);
  assert.deepEqual(parseProductUpdateCSV('ID; VERSIONE; NOME\r\n\r\np1;100:42;Maglia\r\n'), [row({ nome: 'Maglia' })]);
});

test('validation bounds editable text, price, order, booleans, lists and mandatory values', () => {
  for (const value of [
    { id: '' }, { versione: '' }, { nome: '' }, { nome: 'N'.repeat(121) }, { descrizione: 'D'.repeat(3001) }, { codice: 'C'.repeat(81) }, { marca: 'M'.repeat(81) }, { tessuto: 'T'.repeat(201) },
    { nome: 'Nome\u0000non valido' }, { prezzo: '-1' }, { prezzo: '1.001' }, { prezzo: '1.000,00' }, { prezzo: '100000,01' }, { prezzo: 'Infinity' },
    { ordine: '-1' }, { ordine: '10000' }, { ordine: '1.5' }, { ordine: '' }, { disponibile: '' }, { pubblicato: 'forse' }, { in_vetrina: 'yes' },
    { taglie: Array.from({ length: 21 }, (_, i) => `T${i}`).join('|') }, { colori: 'X'.repeat(51) }, { taglie: 'M|M' }, { taglie: 'S||M' }, { reparto: '' }, { reparto: 'missing' }, { isDemo: 'true' },
  ]) assert.equal(plan(value).errors, 1, JSON.stringify(value));
  const valid = plan({ nome: 'N'.repeat(120), descrizione: 'D'.repeat(3000), codice: 'C'.repeat(80), marca: 'M'.repeat(80), tessuto: 'T'.repeat(200), taglie: Array.from({ length: 20 }, (_, i) => `T${i}`).join('|') });
  assert.equal(valid.changed, 1); assert.equal(valid.errors, 0);
});

test('5000 unchanged catalogue rows are practical, 50 changed pass and 51 changed prevent all payloads', () => {
  const products = Array.from({ length: BULK_CSV_LIMITS.products }, (_, index) => product({ id: `p${index}` }));
  const rows = parseProductUpdateCSV(exportProductCSV(context(products)).csv);
  assert.equal(planProductUpdates(rows, context(products)).unchanged, 5000);
  const fifty = rows.map((value, index) => index < 50 ? { ...value, prezzo: '20,00' } : value);
  const accepted = planProductUpdates(fifty, context(products));
  assert.equal(accepted.changed, 50); assert.equal(accepted.unchanged, 4950); assert.equal(accepted.errors, 0);
  fifty[50] = { ...fifty[50], prezzo: '20,00' };
  const rejected = planProductUpdates(fifty, context(products));
  assert.equal(rejected.changed, 0); assert.equal(rejected.errors, 51); assert.equal(rejected.unchanged, 4949);
  assert.ok(rejected.items.filter(item => item.error).every(item => !item.payload && /massimo 50/u.test(item.error)));
  assert.throws(() => parseProductUpdateCSV('id;versione\n' + Array(5001).fill('p1;100:42').join('\n')), /5000/u);
  assert.throws(() => planProductUpdates(Array(5001).fill(row()), context()), /5000/u);
  assert.throws(() => exportProductCSV(context([...products, product({ id: 'extra' })])), /5000/u);
});

test('file size is bounded in UTF-8 bytes and planners accept only plain string rows', () => {
  assert.equal(BULK_CSV_LIMITS.fileBytes, 32 * 1024 * 1024);
  assert.throws(() => parseProductUpdateCSV('a'.repeat(BULK_CSV_LIMITS.fileBytes + 1)), /32 MiB/u);
  assert.throws(() => parseProductUpdateCSV('è'.repeat(BULK_CSV_LIMITS.fileBytes / 2 + 1)), /32 MiB/u);
  assert.equal(planProductUpdates([row({ prezzo: 24.5 })], context()).errors, 1);
  assert.equal(planProductUpdates([null], context()).errors, 1);
  assert.throws(() => planProductUpdates([], context()), /1 a 5000/u);
});
