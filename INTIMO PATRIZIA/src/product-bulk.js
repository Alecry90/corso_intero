import { initializeFirebaseAuth } from './firebase-auth.js';
import { loadManagerCatalogSnapshot } from './catalog-backup.js';
import { readPublicVersion, updateCatalogProductRecord } from './firestore-catalog.js';
import { exportProductCSV, parseProductUpdateCSV, planProductUpdates } from './product-bulk-model.js';

const preparedPlans = new WeakMap();
const check = signal => { if (signal?.aborted) throw new DOMException('Operazione interrotta.', 'AbortError'); };

async function owner(expectedUid) {
  const auth = await initializeFirebaseAuth();
  const user = auth.status === 'ready' ? auth.currentUser() : null;
  if (!user || user.emailVerified !== true || String(user.email).trim().toLowerCase() !== 'alessandroferrara01@libero.it' || expectedUid && user.uid !== expectedUid) {
    throw new Error('Accedi con l’account verificato del gestore per aggiornare i prodotti.');
  }
  return user.uid;
}

export async function exportProductUpdateCSV({ signal, onProgress } = {}) {
  const snapshot = await loadManagerCatalogSnapshot({ signal, onProgress });
  check(signal); await owner(snapshot.uid);
  const exported = exportProductCSV(snapshot);
  if (await readPublicVersion(signal) !== snapshot.revision) throw new Error('Il catalogo è cambiato durante l’esportazione. Riprova per ottenere un foglio aggiornato.');
  return exported;
}

export async function previewProductUpdates(text, { signal, onProgress } = {}) {
  check(signal);
  const rows = parseProductUpdateCSV(text);
  const snapshot = await loadManagerCatalogSnapshot({ signal, onProgress });
  const plan = planProductUpdates(rows, snapshot);
  check(signal); await owner(snapshot.uid);
  if (plan.changed > 0 && !plan.errors) preparedPlans.set(plan, { rows, revision: snapshot.revision, uid: snapshot.uid, unchanged: plan.unchanged });
  return { plan, items: plan.items, summary: { changed: plan.changed, unchanged: plan.unchanged, errors: plan.errors } };
}

export async function applyProductUpdates(plan, { signal, onProgress } = {}) {
  const prepared = preparedPlans.get(plan);
  if (!prepared) throw new Error('Controlla nuovamente il foglio prima di confermare gli aggiornamenti.');
  preparedPlans.delete(plan);
  const result = { updated: 0, unchanged: prepared.unchanged };
  try {
    const snapshot = await loadManagerCatalogSnapshot({ signal, onProgress, uid: prepared.uid });
    if (snapshot.revision !== prepared.revision) throw new Error('Il catalogo è cambiato dopo l’anteprima. Controlla nuovamente il foglio prima di procedere.');
    const current = planProductUpdates(prepared.rows, snapshot);
    if (current.errors || !current.changed) throw new Error('Il foglio richiede un nuovo controllo prima di salvare.');
    let expectedRevision = snapshot.revision;
    const originals = new Map(snapshot.products.map(product => [product.id, product]));
    for (const item of current.items) {
      if (item.unchanged || item.error) continue;
      if (signal?.aborted) return { ...result, stopped: true };
      await owner(prepared.uid);
      onProgress?.(`Aggiornamento ${result.updated + 1} di ${current.changed}: “${item.name}”…`);
      const saved = await updateCatalogProductRecord({ id: item.id, record: item.payload, expectedRevision,
        expectedProductVersion: originals.get(item.id)?.imageVersion || 'initial' });
      result.updated++;
      expectedRevision = saved.revision;
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError') return { ...result, stopped: true };
    error.partial = result;
    throw error;
  }
}
