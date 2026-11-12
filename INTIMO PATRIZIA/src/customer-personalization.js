import { getFirestoreContext } from './firestore-catalog.js';

// Consent metadata only. Browsing signals stay in the current browser tab;
// a changed purpose or storage scope requires a new disclosure version.
export const CUSTOMER_PERSONALIZATION_POLICY_VERSION = '2026-10-20-session-v1';

export class CustomerPersonalizationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CustomerPersonalizationError';
    this.code = code;
  }
}

function customerId(user) {
  if (typeof user?.uid !== 'string' || !user.uid || user.uid.length > 128 || user.uid.includes('/')) {
    throw new CustomerPersonalizationError('unauthenticated', 'Accedi per gestire questa scelta.');
  }
  return user.uid;
}

function unavailable(error) {
  if (error instanceof CustomerPersonalizationError) return error;
  return new CustomerPersonalizationError(error?.code || 'unavailable', 'Non è stato possibile verificare la scelta. Controlla la connessione e riprova.');
}

function notifyChoice(uid, enabled) {
  if (typeof window === 'undefined') return;
  try { document.dispatchEvent(new CustomEvent('personalization-choice-changed', { detail: { uid, enabled } })); } catch { /* A notification cannot invalidate a completed save. */ }
  if (typeof BroadcastChannel === 'undefined') return;
  let channel;
  try {
    channel = new BroadcastChannel('intimo-personalization');
    channel.postMessage({ type: 'choice-changed', uid });
  } catch { /* Focus also rechecks the saved choice. */ }
  finally { try { channel?.close(); } catch { /* Optional notification. */ } }
}

export async function loadCustomerPersonalization(user) {
  try {
    const uid = customerId(user);
    const { db, sdk } = await getFirestoreContext();
    const snapshot = await sdk.getDocFromServer(sdk.doc(db, 'customerPersonalization', uid));
    if (!snapshot.exists()) return { enabled: false, policyVersion: CUSTOMER_PERSONALIZATION_POLICY_VERSION };
    const data = snapshot.data();
    if (typeof data.enabled !== 'boolean' || data.policyVersion !== CUSTOMER_PERSONALIZATION_POLICY_VERSION
      || Object.keys(data).length !== 3 || !data.updatedAt?.toDate) {
      throw new CustomerPersonalizationError('invalid-preference', 'La scelta salvata richiede una verifica. Riprova prima di modificarla.');
    }
    return { enabled: data.enabled, policyVersion: data.policyVersion };
  } catch (error) { throw unavailable(error); }
}

export async function saveCustomerPersonalization(user, enabled) {
  try {
    const uid = customerId(user);
    if (typeof enabled !== 'boolean') throw new CustomerPersonalizationError('invalid-preference', 'Scegli se attivare o disattivare questa preferenza.');
    const { db, sdk } = await getFirestoreContext();
    const result = { enabled, policyVersion: CUSTOMER_PERSONALIZATION_POLICY_VERSION };
    await sdk.setDoc(sdk.doc(db, 'customerPersonalization', uid), { ...result, updatedAt: sdk.serverTimestamp() });
    notifyChoice(uid, enabled);
    return result;
  } catch (error) { throw unavailable(error); }
}

export async function deleteCustomerPersonalization(user) {
  try {
    const uid = customerId(user);
    const { db, sdk } = await getFirestoreContext();
    await sdk.deleteDoc(sdk.doc(db, 'customerPersonalization', uid));
    notifyChoice(uid, false);
  } catch (error) { throw unavailable(error); }
}
