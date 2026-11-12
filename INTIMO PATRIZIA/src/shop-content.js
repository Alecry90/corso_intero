import { getFirestoreContext } from './firestore-catalog.js';
import { SHOP_CONTENT_LIMITS, emptyShopSettings, normalizeShopSettings, normalizeCampaign, visibleCampaigns } from './shop-content-model.js';
export * from './shop-content-model.js';
const settingsRef = ({ db, sdk }) => sdk.doc(db, 'storeSettings', 'public');
function notifyShopContent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('shop-content-changed'));
  if (typeof BroadcastChannel === 'undefined') return;
  try { const channel = new BroadcastChannel('intimo-shop-content'); channel.postMessage({type:'changed'}); channel.close(); } catch { /* Public pages also refresh on return. */ }
}
const fields = ['kind', 'title', 'body', 'startAt', 'endAt', 'categoryId', 'productIds', 'ctaLabel', 'ctaPath', 'image', 'imageAlt', 'published'];
const isOwner = user => user?.emailVerified === true && String(user.email || '').trim().toLowerCase() === 'alessandroferrara01@libero.it';
function owner(user) { if (!isOwner(user)) throw new Error('Accedi con l’email verificata del gestore per modificare questi contenuti.'); }
function errorMessage(error) {
  if (['permission-denied', 'unauthenticated'].includes(error?.code)) return new Error('La sessione non è autorizzata. Accedi di nuovo con l’account verificato del gestore.');
  if (error instanceof TypeError || (error instanceof Error && !error.code)) return error;
  return new Error('I contenuti del negozio non sono disponibili in questo momento. Controlla la connessione e riprova.');
}
function campaignView(snapshot) {
  const data = snapshot.data();
  return { id: snapshot.id, ...normalizeCampaign(Object.fromEntries(fields.map(key => [key, data[key]]))) };
}
export async function getPublicShopSettings() {
  try {
    const ctx = await getFirestoreContext();
    const snapshot = await ctx.sdk.getDocFromServer(settingsRef(ctx));
    if (!snapshot.exists()) return emptyShopSettings();
    const raw = snapshot.data();
    return normalizeShopSettings(Object.fromEntries(Object.keys(emptyShopSettings()).map(key => [key, raw[key]])));
  } catch (error) { throw errorMessage(error); }
}
export async function saveShopSettings(user, values) {
  owner(user); const next = normalizeShopSettings(values);
  try {
    const ctx = await getFirestoreContext();
    await ctx.sdk.setDoc(settingsRef(ctx), { ...next, updatedAt: ctx.sdk.serverTimestamp() });
    notifyShopContent();
    return next;
  } catch (error) { throw errorMessage(error); }
}
export async function listPublicCampaigns({ visibleLimit = null, now = new Date() } = {}) {
  if (visibleLimit !== null && (!Number.isInteger(visibleLimit) || visibleLimit < 1)) throw new TypeError('Il limite dei contenuti visibili deve essere un intero positivo.');
  try {
    const { db, sdk } = await getFirestoreContext();
    const records = [];
    let cursor = null;
    do {
      const clauses = [sdk.where('published', '==', true), sdk.orderBy(sdk.documentId()), ...(cursor ? [sdk.startAfter(cursor)] : []), sdk.limit(SHOP_CONTENT_LIMITS.campaigns)];
      const snapshot = await sdk.getDocsFromServer(sdk.query(sdk.collection(db, 'storeCampaigns'), ...clauses));
      const page = snapshot.docs.map(campaignView);
      records.push(...(visibleLimit === null ? page : visibleCampaigns(page, now)));
      // Home can stop once its cards are filled; expired published records must
      // never prevent it from reaching visible content on a later page.
      if (visibleLimit !== null && records.length >= visibleLimit) return visibleCampaigns(records, now).slice(0, visibleLimit);
      cursor = snapshot.size === SHOP_CONTENT_LIMITS.campaigns ? snapshot.docs.at(-1).id : null;
    } while (cursor);
    return visibleLimit === null ? records : visibleCampaigns(records, now);
  } catch (error) { throw errorMessage(error); }
}
export async function listManagerCampaigns(user, { cursor = null } = {}) {
  owner(user);
  try {
    const { db, sdk } = await getFirestoreContext();
    const clauses = [sdk.orderBy(sdk.documentId()), ...(cursor ? [sdk.startAfter(cursor)] : []), sdk.limit(SHOP_CONTENT_LIMITS.campaigns)];
    const snapshot = await sdk.getDocsFromServer(sdk.query(sdk.collection(db, 'storeCampaigns'), ...clauses));
    return { records: snapshot.docs.map(campaignView), cursor: snapshot.size === SHOP_CONTENT_LIMITS.campaigns ? snapshot.docs.at(-1).id : null };
  } catch (error) { throw errorMessage(error); }
}
export async function saveCampaign(user, id, values) {
  owner(user); const next = normalizeCampaign(values);
  if (id && !/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new TypeError('Identificativo del contenuto non valido.');
  try {
    const { db, sdk } = await getFirestoreContext();
    const reference = id ? sdk.doc(db, 'storeCampaigns', id) : sdk.doc(sdk.collection(db, 'storeCampaigns'));
    await sdk.setDoc(reference, { ...next, updatedAt: sdk.serverTimestamp() });
    notifyShopContent();
    return { id: reference.id, ...next };
  } catch (error) { throw errorMessage(error); }
}
export async function deleteCampaign(user, id) {
  owner(user);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id || '')) throw new TypeError('Identificativo del contenuto non valido.');
  try { const { db, sdk } = await getFirestoreContext(); await sdk.deleteDoc(sdk.doc(db, 'storeCampaigns', id)); notifyShopContent(); }
  catch (error) { throw errorMessage(error); }
}
