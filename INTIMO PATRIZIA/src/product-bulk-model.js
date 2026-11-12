import { normalizeVariantAvailability } from './product-variants.js';
import { productCodeKey } from './product-import.js';

export const BULK_CSV_HEADERS = Object.freeze(['id', 'versione', 'codice', 'nome', 'reparto', 'prezzo', 'taglie', 'colori', 'tessuto', 'descrizione', 'marca', 'disponibile', 'pubblicato', 'in_vetrina', 'novita', 'ordine']);
export const BULK_CSV_LIMITS = Object.freeze({ products: 5000, changed: 50, fileBytes: 32 * 1024 * 1024 });
const fail = message => { throw new Error(message); };
const own = (value, key) => Object.hasOwn(value, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalidControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const unsafeCell = value => value.startsWith("'") || /^[\t\r\n]/u.test(value) || /^\s*[=+\-@]/u.test(value);
const decodeCell = value => value.startsWith("'") && unsafeCell(value.slice(1)) ? value.slice(1) : value;
const version = product => product.imageVersion ?? 'initial';
const same = (before, after) => JSON.stringify(before) === JSON.stringify(after);
const priceText = value => value === null || value === undefined ? '' : Number(value).toFixed(2).replace('.', ',');
const booleanText = value => value ? 'si' : 'no';

function checkedText(value, maximum, label, required = false) {
  if (typeof value !== 'string') fail(`${label}: usa un testo.`);
  // Match productInput's normalization before previewing an edited cell. Exact
  // exported cells bypass this reader and remain genuine legacy no-ops.
  const cleaned = value.trim();
  if (cleaned.length > maximum || invalidControls.test(cleaned) || (required && !cleaned)) fail(`${label}: testo non valido (massimo ${maximum} caratteri).`);
  return cleaned;
}
function listText(values, label) {
  if (!Array.isArray(values) || values.length > 20 || values.some(value => typeof value !== 'string' || !value.trim() || value.length > 50 || invalidControls.test(value) || value.includes('|'))) fail(`${label}: massimo 20 voci di 50 caratteri, senza il carattere | nei nomi.`);
  if (new Set(values).size !== values.length) fail(`${label}: le voci devono essere distinte.`);
  return values.join('|');
}
function readList(value, label) {
  const values = value.trim() ? value.split('|').map(item => item.trim()) : [];
  listText(values, label);
  return values;
}
function readBoolean(value, label) {
  const cleaned = value.trim().toLocaleLowerCase('it');
  if (['si', 'sì', 'true', '1'].includes(cleaned)) return true;
  if (['no', 'false', '0'].includes(cleaned)) return false;
  fail(`${label}: usa si oppure no.`);
}
function readPrice(value) {
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/u.test(cleaned) || Number(cleaned.replace(',', '.')) > 100000) fail('Prezzo non valido: usa 19,90 oppure 19.90, massimo 100000 euro e due decimali.');
  return Number(cleaned.replace(',', '.'));
}
function readOrder(value) {
  if (!/^\d+$/u.test(value.trim()) || Number(value) > 9999) fail('Ordine: scegli un intero tra 0 e 9999.');
  return Number(value);
}
const fields = [
  ['codice', 'sku', 'Codice', value => checkedText(value, 80, 'Codice')],
  ['nome', 'name', 'Nome', value => checkedText(value, 120, 'Nome', true)],
  ['reparto', 'categoryId', 'Reparto', (value, categories) => {
    const category = categories.find(item => item.id === value.trim() || item.slug === value.trim());
    if (!category) fail('Reparto non riconosciuto: usa un identificativo di reparto esistente.');
    return category.id;
  }],
  ['prezzo', 'price', 'Prezzo', readPrice],
  ['taglie', 'sizes', 'Taglie', value => readList(value, 'Taglie')],
  ['colori', 'colors', 'Colori', value => readList(value, 'Colori')],
  ['tessuto', 'material', 'Tessuto', value => checkedText(value, 200, 'Tessuto')],
  ['descrizione', 'description', 'Descrizione', value => checkedText(value, 3000, 'Descrizione')],
  ['marca', 'brand', 'Marca', value => checkedText(value, 80, 'Marca')],
  ['disponibile', 'available', 'Disponibile', value => readBoolean(value, 'Disponibile')],
  ['pubblicato', 'published', 'Pubblicato', value => readBoolean(value, 'Pubblicato')],
  ['in_vetrina', 'featured', 'In vetrina', value => readBoolean(value, 'In vetrina')],
  ['novita', 'newArrival', 'Novità', value => readBoolean(value, 'Novità')],
  ['ordine', 'order', 'Ordine', readOrder],
];
function display(field, value) {
  if (field === 'price') return priceText(value);
  if (['available', 'published', 'featured', 'newArrival'].includes(field)) return booleanText(value);
  if (field === 'sizes' || field === 'colors') return listText(value, field === 'sizes' ? 'Taglie' : 'Colori');
  return String(value ?? '');
}
function productBody(product) {
  // A full editable body, deliberately excluding images, galleries, IDs and SDK
  // metadata. The persistence adapter retains the existing photographs.
  return { name: product.name ?? '', categoryId: product.categoryId ?? '', description: product.description ?? '', price: product.price ?? null,
    sizes: [...(product.sizes ?? [])], colors: [...(product.colors ?? [])], material: product.material ?? '', imageAlt: product.imageAlt ?? '',
    available: product.available ?? true, published: product.published ?? true, isDemo: product.isDemo ?? false, order: product.order ?? 0,
    sku: product.sku ?? '', brand: product.brand ?? '', featured: product.featured ?? false, newArrival: product.newArrival ?? false };
}
function quoteCell(value) {
  let text = String(value);
  if (unsafeCell(text)) text = `'${text}`;
  return /[";,\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function checkFileSize(source) {
  if (source.length > BULK_CSV_LIMITS.fileBytes || new TextEncoder().encode(source).byteLength > BULK_CSV_LIMITS.fileBytes) fail('Il CSV supera il limite di 32 MiB.');
}

export function exportProductCSV({ categories = [], products = [] } = {}) {
  if (!Array.isArray(categories) || !Array.isArray(products)) fail('Dati del catalogo non validi.');
  const active = products.filter(product => product?.archived !== true);
  if (active.length > BULK_CSV_LIMITS.products) fail('Puoi esportare al massimo 5000 prodotti.');
  const ids = new Set();
  const rows = active.map(product => {
    if (!/^[A-Za-z0-9_-]{1,80}$/u.test(product?.id ?? '') || ids.has(product.id)) fail('Identificativo prodotto non valido o duplicato.');
    ids.add(product.id);
    const body = productBody(product);
    return [product.id, version(product), ...fields.map(([, field]) => display(field, body[field]))].map(quoteCell).join(';');
  });
  const csv = `\uFEFF${[BULK_CSV_HEADERS.join(';'), ...rows].join('\r\n')}\r\n`;
  checkFileSize(csv);
  return { csv, count: active.length, filename: `intimo-patrizia-prodotti-${new Date().toISOString().slice(0, 10)}.csv` };
}

export function parseProductUpdateCSV(source) {
  if (typeof source !== 'string') fail('Scegli un file CSV UTF-8.');
  checkFileSize(source);
  const text = source.replace(/^\uFEFF/u, '');
  // Determine the separator from the first logical record, outside quotes.
  let inQuotes = false, delimiter = ',';
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '"') {
      if (inQuotes && text[index + 1] === '"') index++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && text[index] === ';') { delimiter = ';'; break; }
    else if (!inQuotes && /[\r\n]/u.test(text[index])) break;
  }
  const records = []; let record = [], cell = '', quoted = false, closed = false;
  const finishRecord = () => {
    record.push(cell);
    if (!(record.length === 1 && !record[0].trim())) records.push(record);
    if (records.length > BULK_CSV_LIMITS.products + 1) fail('Inserisci da 1 a 5000 prodotti nel CSV.');
    record = []; cell = ''; closed = false;
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (character === '"') { quoted = false; closed = true; }
      else cell += character;
    } else if (character === '"') {
      if (cell || closed) fail('Virgolette non valide nel CSV.');
      quoted = true;
    } else if (character === delimiter) {
      record.push(cell); cell = ''; closed = false;
    } else if (character === '\r' || character === '\n') {
      finishRecord();
      if (character === '\r' && text[index + 1] === '\n') index++;
    } else {
      if (closed) fail('Caratteri dopo le virgolette di chiusura nel CSV.');
      cell += character;
    }
  }
  if (quoted) fail('Una cella del CSV contiene virgolette non chiuse.');
  if (record.length || cell || closed) finishRecord();
  const headers = (records.shift() || []).map(value => value.trim().toLocaleLowerCase('it'));
  if (!headers.includes('id') || !headers.includes('versione')) fail('Servono le colonne id e versione: esporta i prodotti esistenti prima di modificarli.');
  if (new Set(headers).size !== headers.length || headers.some(header => !BULK_CSV_HEADERS.includes(header))) fail('Colonne duplicate o sconosciute: usa le intestazioni del CSV esportato.');
  if (!records.length || records.length > BULK_CSV_LIMITS.products) fail('Inserisci da 1 a 5000 prodotti nel CSV.');
  return records.map((values, index) => {
    if (values.length !== headers.length) fail(`Riga ${index + 2}: numero di colonne diverso dall’intestazione.`);
    return Object.fromEntries(headers.map((header, column) => [header, decodeCell(values[column])]));
  });
}

export function planProductUpdates(rows, { categories = [], products = [] } = {}) {
  if (!Array.isArray(rows) || !rows.length || rows.length > BULK_CSV_LIMITS.products) fail('Inserisci da 1 a 5000 prodotti nel CSV.');
  if (!Array.isArray(categories) || !Array.isArray(products)) fail('Dati del catalogo non validi.');
  const byId = new Map(products.map(product => [product.id, product]));
  const occurrences = new Map();
  for (const row of rows) if (typeof row?.id === 'string') occurrences.set(row.id, (occurrences.get(row.id) || 0) + 1);
  const items = rows.map((row, index) => {
    const item = { line: index + 2, id: typeof row?.id === 'string' ? row.id : '', name: '', changes: [] };
    try {
      if (!plain(row) || Object.entries(row).some(([header, value]) => !BULK_CSV_HEADERS.includes(header) || typeof value !== 'string')) fail('La riga contiene colonne sconosciute o valori non testuali.');
      if (!own(row, 'id') || !own(row, 'versione') || !/^[A-Za-z0-9_-]{1,80}$/u.test(row.id) || !row.versione) fail('Id e versione sono obbligatori e non vanno modificati.');
      if (occurrences.get(row.id) > 1) fail('Identificativo id ripetuto nel foglio.');
      const existing = byId.get(row.id);
      if (!existing) fail('Prodotto non trovato: potrebbe essere stato eliminato. Il CSV aggiorna soltanto prodotti esistenti.');
      item.name = String(existing.name ?? '');
      if (existing.archived === true) fail('Il prodotto è nel cestino: ripristinalo prima di modificarlo.');
      const payload = productBody(existing);
      for (const [column, field, label, read] of fields) {
        if (!own(row, column)) continue;
        const before = payload[field];
        // Exact exported cells preserve legacy whitespace and leave a fresh
        // export a genuine no-op, including formula-looking plain text.
        if (row[column] === display(field, before)) continue;
        const after = read(row[column], categories);
        if (!same(before, after)) {
          item.changes.push({ field, label, before: display(field, before), after: display(field, after) });
          payload[field] = after;
        }
      }
      if (!item.changes.length) { item.unchanged = true; return item; }
      if (row.versione !== version(existing)) fail('File vecchio: esporta di nuovo i prodotti prima di applicare le modifiche.');
      if (!categories.some(category => category.id === payload.categoryId)) fail('Il reparto del prodotto non esiste più: scegli un reparto esistente.');
      if (existing.variantAvailability !== undefined) payload.variantAvailability = normalizeVariantAvailability(existing.variantAvailability, { sizes: payload.sizes, colors: payload.colors });
      item.payload = payload;
      return item;
    } catch (error) {
      item.error = error.message;
      return item;
    }
  });
  // Codes are editable attributes, never lookup keys. Retain reservations from
  // the entire current catalogue (including the trash); swaps need separate
  // saves so a stale or partially applied file cannot reuse somebody's code.
  const proposedCodes = new Map();
  const skuChanges = items.filter(item => item.payload && item.changes.some(change => change.field === 'sku') && productCodeKey(item.payload.sku));
  for (const item of skuChanges) {
    const key = productCodeKey(item.payload.sku);
    proposedCodes.set(key, [...(proposedCodes.get(key) || []), item.id]);
  }
  for (const item of skuChanges) {
    const key = productCodeKey(item.payload.sku);
    if (products.some(product => product.id !== item.id && productCodeKey(product.sku) === key) || proposedCodes.get(key).length > 1) {
      item.error = 'Codice già usato da un altro prodotto o da un’altra riga: scegli un codice distinto.';
      delete item.payload;
    }
  }
  if (items.filter(item => item.payload).length > BULK_CSV_LIMITS.changed) {
    for (const item of items) if (item.payload) {
      item.error = 'Il file modifica più di 50 prodotti: suddividi le modifiche in gruppi di massimo 50.';
      delete item.payload;
    }
  }
  return { items, changed: items.filter(item => item.payload).length, unchanged: items.filter(item => item.unchanged).length, errors: items.filter(item => item.error).length };
}
