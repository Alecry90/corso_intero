// One-off, idempotent import of the observed Notes department names.
// It never reads Apple credentials, edits Notes, or creates/modifies products.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { planCatalogImport } from './catalog-import-plan.mjs';

const args = process.argv.slice(2);
const argument = name => { const index = args.indexOf(`--${name}`); return index < 0 ? undefined : args[index + 1]; };
const project = argument('project');
const emulator = args.includes('--emulator');
const apply = args.includes('--apply');
if (emulator ? !/^demo-[a-z0-9-]{3,50}$/.test(project || '') : project !== 'intimopatrizia-bari') throw new Error('Indica il progetto previsto con --project intimopatrizia-bari, oppure un progetto demo-* con --emulator.');
if (apply && argument('confirm-project') !== project) throw new Error('Per applicare il piano ripeti --confirm-project con lo stesso Project ID.');
if (!emulator && (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)) throw new Error('Rimuovi le variabili emulatore per il progetto reale.');
const manifest = JSON.parse(await readFile(new URL('../catalog/notes-categories.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(await readFile(new URL('../public/data/demo-catalog.json', import.meta.url), 'utf8'));
const databasePath = `/projects/${project}/databases/(default)`;
const documentsPath = `${databasePath}/documents`;
let request;

if (emulator) {
  const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  if (!/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host)) throw new Error('L’emulatore deve essere un indirizzo locale esplicito.');
  request = async (path, body) => {
    const response = await fetch(`http://${host}/v1${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    if (!response.ok) throw new Error(`Firestore locale: ${data.error?.message || response.status}`);
    return data;
  };
} else {
  const require = createRequire(import.meta.url);
  const { getProjectDefaultAccount, getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
  const { requireAuth } = require('firebase-tools/lib/requireAuth');
  const { Client } = require('firebase-tools/lib/apiv2');
  const account = getProjectDefaultAccount(process.cwd()) || getGlobalDefaultAccount();
  if (!account) throw new Error('Completa prima l’accesso del Firebase CLI.');
  await requireAuth({ project, nonInteractive: true, ...account });
  const billing = new Client({ urlPrefix: 'https://cloudbilling.googleapis.com', apiVersion: 'v1' });
  if ((await billing.get(`/projects/${project}/billingInfo`, { timeout: 30000 })).body.billingEnabled !== false) throw new Error('La fatturazione deve restare disabilitata. Nessuna attivazione viene eseguita.');
  const client = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1' });
  request = async (path, body) => (await client.post(path, body, { timeout: 30000 })).body;
}

function decode(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  throw new Error('Tipo di dato inatteso nel catalogo: importazione annullata.');
}
const decodeFields = fields => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
const record = document => ({ id: document.name.split('/').at(-1), ...decodeFields(document.fields || {}) });
const encode = value => typeof value === 'string' ? { stringValue: value } : typeof value === 'boolean' ? { booleanValue: value } : Number.isSafeInteger(value) ? { integerValue: String(value) } : (() => { throw new Error('Campo di importazione non supportato.'); })();
const encodeFields = fields => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encode(value)]));
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const fingerprint = documents => createHash('sha256').update(canonical([...documents].sort((a, b) => a.name.localeCompare(b.name)))).digest('hex');
async function snapshot(transaction) {
  const query = async (name, maximum) => {
    const documents = [];
    let lastName;
    while (documents.length < maximum) {
      const limit = Math.min(100, maximum - documents.length);
      const structuredQuery = { from: [{ collectionId: name }], orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit };
      if (lastName) structuredQuery.startAt = { values: [{ referenceValue: lastName }], before: false };
      const rows = await request(`${documentsPath}:runQuery`, { transaction, structuredQuery });
      const page = rows.filter(row => row.document).map(row => row.document);
      documents.push(...page);
      if (page.length < limit) break;
      lastName = page.at(-1).name;
    }
    return documents;
  };
  const [categories, products, reservations, meta] = await Promise.all([
    query('categories', 51), query('products', 5001), query('categorySlugs', 51),
    request(`${documentsPath}:batchGet`, { transaction, documents: ['inventory', 'revision'].map(id => `${documentsPath.slice(1)}/catalogMeta/${id}`) }),
  ]);
  if (reservations.length >= 51) throw new Error('Troppe prenotazioni slug per una lettura completa e sicura: verificare prima di importare.');
  const inventory = meta.find(row => row.found?.name.endsWith('/inventory'))?.found;
  if (!inventory) throw new Error('Inventario assente: fermarsi e verificare il catalogo esistente.');
  const revision = meta.find(row => row.found?.name.endsWith('/revision'))?.found;
  return { categories, products, reservations, inventory, revision };
}
const planFor = state => planCatalogImport({ manifest, categories: state.categories.map(record), products: state.products.map(record), inventory: decodeFields(state.inventory.fields), reservations: state.reservations.map(record), legacyCategories: fixture.categories });
const begin = async () => (await request(`${documentsPath}:beginTransaction`, { options: { readWrite: {} } })).transaction;
const rollback = transaction => request(`${documentsPath}:rollback`, { transaction });
const timestamp = { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' };

let transaction = await begin();
try {
  const state = await snapshot(transaction);
  const plan = planFor(state);
  const summary = { project, mode: apply ? 'apply' : 'preview', changed: plan.changed, counts: plan.counts, creates: plan.creates.map(({ id, fields }) => ({ id, name: fields.name })), hidesLegacy: plan.patches.map(({ id }) => id), reservations: plan.reservations.map(({ id }) => id), preservedLegacy: plan.preservedLegacy, productImport: false };
  console.log(JSON.stringify(summary, null, 2));
  await mkdir(new URL('../output/catalog/', import.meta.url), { recursive: true });
  await writeFile(new URL('../output/catalog/notes-import-plan.json', import.meta.url), JSON.stringify(summary, null, 2) + '\n');
  if (apply && plan.changed) {
    const writes = [];
    const oldCategories = new Map(state.categories.map(document => [record(document).id, document]));
    for (const { id, fields } of plan.creates) writes.push({ update: { name: `${documentsPath.slice(1)}/categories/${id}`, fields: encodeFields(fields) }, currentDocument: { exists: false }, updateTransforms: [timestamp] });
    for (const { id, fields } of plan.patches) writes.push({ update: { name: `${documentsPath.slice(1)}/categories/${id}`, fields: encodeFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: oldCategories.get(id).updateTime }, updateTransforms: [timestamp] });
    for (const { id, fields } of plan.reservations) writes.push({ update: { name: `${documentsPath.slice(1)}/categorySlugs/${id}`, fields: encodeFields(fields) }, currentDocument: { exists: false } });
    writes.push({ update: { name: state.inventory.name, fields: encodeFields(plan.inventory) }, currentDocument: { updateTime: state.inventory.updateTime }, updateTransforms: [timestamp] });
    writes.push({ update: { name: `${documentsPath.slice(1)}/catalogMeta/revision`, fields: encodeFields({ version: randomUUID() }) }, currentDocument: state.revision ? { updateTime: state.revision.updateTime } : { exists: false } });
    // The transport cannot write products, photos, roles, billing or any other collection.
    const prefix = `${documentsPath.slice(1)}/`;
    if (writes.some(write => !write.update.name.startsWith(prefix) || !/^(categories\/[A-Za-z0-9_-]+|categorySlugs\/[a-z0-9-]+|catalogMeta\/(inventory|revision))$/.test(write.update.name.slice(prefix.length)))) throw new Error('Percorso di scrittura non consentito.');
    await request(`${documentsPath}:commit`, { transaction, writes });
    transaction = null;
    console.log(JSON.stringify({ project, committed: true, writes: writes.length, productWrites: 0, imageWrites: 0 }));
    transaction = await begin();
    const after = await snapshot(transaction);
    await rollback(transaction);
    transaction = null;
    if (fingerprint(after.products) !== fingerprint(state.products)) throw new Error('Il commit è riuscito, ma sono state rilevate modifiche concorrenti ai prodotti: verificare senza ripetere o annullare automaticamente.');
    const second = planFor(after);
    if (second.changed) throw new Error('Il commit è riuscito ma la verifica di idempotenza richiede controllo manuale.');
    console.log(JSON.stringify({ project, verified: true, counts: second.counts, productsPreserved: true, idempotent: true }));
  }
} finally {
  if (transaction) await rollback(transaction).catch(() => {});
}
