import { initializeFirebaseAuth } from './firebase-auth.js';
import { getFirestoreContext, loadManagerCatalogPage, readPublicVersion, restoreCatalogBackupRecord } from './firestore-catalog.js';
import { CATALOG_BACKUP_LIMITS, createCatalogBackup, parseCatalogBackup, planCatalogRestore } from './catalog-backup-model.js';

const PROJECT_ID = 'intimopatrizia-bari';
const preparedPlans = new WeakMap();
const check = signal => { if (signal?.aborted) throw new DOMException('Operazione interrotta.', 'AbortError'); };

async function owner(expectedUid) {
  const auth = await initializeFirebaseAuth();
  const user = auth.status === 'ready' ? auth.currentUser() : null;
  if (!user || user.emailVerified !== true || String(user.email).trim().toLowerCase() !== 'alessandroferrara01@libero.it' || expectedUid && user.uid !== expectedUid) {
    throw new Error('Accedi con l’account verificato del gestore per usare copie e cestino.');
  }
  return user.uid;
}

async function managerSnapshot({ signal, onProgress, uid } = {}) {
  const identity = await owner(uid);
  check(signal);
  const revision = await readPublicVersion(signal);
  const products = [];
  let categories = [], cursor;
  do {
    check(signal); await owner(identity);
    const page = await loadManagerCatalogPage({ signal, cursor, pageSize: 100 });
    categories = page.categories;
    products.push(...page.products);
    if (products.length > 5000) throw new Error('Il catalogo supera il limite previsto. Nessun dato è stato modificato.');
    cursor = page.nextCursor;
    onProgress?.(`Lettura delle schede: ${products.length} prodotti…`);
  } while (cursor);
  check(signal);
  const { db, sdk } = await getFirestoreContext();
  const inventory = await sdk.getDocFromServer(sdk.doc(db, 'catalogMeta', 'inventory'));
  if (inventory.exists() && (inventory.data().productCount !== products.length || inventory.data().categoryCount !== categories.length)) {
    throw new Error('Il catalogo è cambiato o i conteggi non corrispondono. Riprova prima di scaricare o ripristinare.');
  }
  if (await readPublicVersion(signal) !== revision) throw new Error('Il catalogo è cambiato durante la lettura. Riprova.');
  return { categories, products, revision, uid: identity };
}

export async function exportCatalogBackup({ signal, onProgress } = {}) {
  const snapshot = await managerSnapshot({ signal, onProgress });
  const { db, sdk } = await getFirestoreContext();
  const requests = snapshot.products.flatMap(product => [
    ...(product.image === `/api/images/${product.id}` ? [{ product, slot: 0 }] : []),
    ...(product.gallerySlots || []).map(slot => ({ product, slot })),
  ]);
  const images = [];
  let encodedBytes = 0;
  // Sequential reads keep both quota bursts and the in-memory copy bounded.
  for (const [index, { product, slot }] of requests.entries()) {
    check(signal); await owner(snapshot.uid);
    const ref = slot === 0 ? sdk.doc(db, 'productImages', product.id) : sdk.doc(db, 'productGalleryImages', `${product.id}__${slot}`);
    const image = await sdk.getDocFromServer(ref);
    if (!image.exists()) throw new Error(`La foto di “${product.name}” non è disponibile. La copia non è stata creata: riprova.`);
    const data = image.data();
    encodedBytes += typeof data.base64 === 'string' ? data.base64.length : 0;
    if (encodedBytes > 120 * 1024 * 1024) throw new Error('Questa copia supera 128 MB. Nessun dato è stato modificato; serve suddividere il catalogo prima di esportarlo.');
    images.push({ productId: product.id, slot, base64: data.base64, mime: data.mime, bytes: data.bytes, width: data.width, height: data.height, hash: data.hash, ...(slot ? { alt: data.alt } : {}) });
    await verifyPhotos([images.at(-1)], signal);
    onProgress?.(`Copia delle foto caricate: ${index + 1} di ${requests.length}…`);
  }
  check(signal); await owner(snapshot.uid);
  if (await readPublicVersion(signal) !== snapshot.revision) throw new Error('Il catalogo è cambiato mentre copiavo le foto. Riprova per ottenere una copia coerente.');
  const backup = createCatalogBackup({ projectId: PROJECT_ID, categories: snapshot.categories, products: snapshot.products, images, createdAt: new Date().toISOString() });
  return { backup, filename: `intimo-patrizia-catalogo-${backup.createdAt.replace(/[:.]/g, '-')}.json` };
}

async function verifyPhotos(images, signal) {
  for (const image of images) {
    check(signal);
    const bytes = Uint8Array.from(atob(image.base64), character => character.charCodeAt(0));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hash = [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== image.hash) throw new Error('Una fotografia nella copia è danneggiata. Nessun dato è stato modificato.');
  }
}

export async function previewCatalogRestore(text, { signal } = {}) {
  check(signal);
  const backup = parseCatalogBackup(text, { projectId: PROJECT_ID });
  const snapshot = await managerSnapshot({ signal });
  const plan = planCatalogRestore(backup, snapshot);
  await verifyPhotos(plan.imagesToCreate, signal);
  check(signal); await owner(snapshot.uid);
  preparedPlans.set(plan, { backup, revision: snapshot.revision, uid: snapshot.uid });
  return { plan, summary: { categories: plan.categoriesToCreate.length, products: plan.productsToCreate.length,
    skipped: plan.skippedCategoryIds.length + plan.skippedProductIds.length, warnings: plan.warnings || [] } };
}

export async function applyCatalogRestore(plan, { signal, onProgress } = {}) {
  const prepared = preparedPlans.get(plan);
  if (!prepared) throw new Error('Scegli la copia e controlla l’anteprima prima di ripristinare.');
  preparedPlans.delete(plan);
  const snapshot = await managerSnapshot({ signal, uid: prepared.uid });
  if (snapshot.revision !== prepared.revision) throw new Error('Il catalogo è cambiato dopo l’anteprima. Controlla nuovamente la copia prima di procedere.');
  const currentPlan = planCatalogRestore(prepared.backup, snapshot);
  const result = { categories: 0, products: 0, skipped: currentPlan.skippedCategoryIds.length + currentPlan.skippedProductIds.length };
  let expectedRevision = snapshot.revision;
  try {
    for (const category of currentPlan.categoriesToCreate) {
      if (signal?.aborted) return { ...result, stopped: true };
      await owner(prepared.uid);
      const { id, ...record } = category;
      onProgress?.(`Ripristino del reparto “${record.name}”…`);
      const saved = await restoreCatalogBackupRecord({ kind: 'category', id, record, expectedRevision });
      result.categories++; expectedRevision = saved.revision;
    }
    for (const product of currentPlan.productsToCreate) {
      if (signal?.aborted) return { ...result, stopped: true };
      await owner(prepared.uid);
      const { id, archived, archivedAt, ...record } = product;
      onProgress?.(`Ripristino come bozza: “${record.name}”…`);
      const saved = await restoreCatalogBackupRecord({ kind: 'product', id, record, images: currentPlan.imagesToCreate.filter(image => image.productId === id), expectedRevision });
      result.products++; expectedRevision = saved.revision;
    }
    return result;
  } catch (error) { error.partial = result; throw error; }
}

export async function loadCatalogTrash({ signal } = {}) {
  const snapshot = await managerSnapshot({ signal });
  const names = new Map(snapshot.categories.map(category => [category.id, category.name]));
  return snapshot.products.filter(product => product.archived === true).map(product => ({ ...product, categoryName: names.get(product.categoryId) || product.categoryId }));
}

export { CATALOG_BACKUP_LIMITS };
export { managerSnapshot as loadManagerCatalogSnapshot };
