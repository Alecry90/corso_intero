import { getFirestoreContext } from './firestore-catalog.js';
import { CATALOG_GROUPS } from './catalog-taxonomy.js';

export const CUSTOMER_PROFILE_LIMITS = Object.freeze({ displayName: 60, favorites: 200 });
const interestIds = new Set(CATALOG_GROUPS.map(group => group.id));
const safeProductId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const emptyProfile = () => ({ displayName: '', interests: [], favoriteProductIds: [] });

export class CustomerProfileError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'CustomerProfileError';
    this.status = status;
    this.code = code;
  }
}

function invalid(message) { throw new CustomerProfileError(400, 'invalid-profile', message); }
function customerId(user) {
  if (typeof user?.uid !== 'string' || !user.uid || user.uid.length > 128 || user.uid.includes('/')) {
    throw new CustomerProfileError(401, 'unauthenticated', 'Accedi per gestire le tue preferenze.');
  }
  return user.uid;
}
function displayName(value) {
  if (value === undefined) value = '';
  if (typeof value !== 'string') invalid('Il nome deve essere un testo di massimo 60 caratteri.');
  const name = value.trim();
  if (name.length > CUSTOMER_PROFILE_LIMITS.displayName || /[\u0000-\u001f\u007f]/.test(name)) invalid('Il nome deve essere un testo di massimo 60 caratteri.');
  return name;
}
function interests(values) {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > interestIds.size || new Set(values).size !== values.length || values.some(value => !interestIds.has(value))) {
    invalid('Scegli i tuoi interessi tra i reparti disponibili.');
  }
  return [...values];
}
function favorites(values) {
  if (!Array.isArray(values) || values.length > CUSTOMER_PROFILE_LIMITS.favorites || new Set(values).size !== values.length || values.some(value => !safeProductId(value))) {
    invalid('L’elenco dei preferiti non è valido.');
  }
  return [...values];
}
function profile(snapshot) {
  if (!snapshot.exists()) return emptyProfile();
  const data = snapshot.data();
  // Project only the data used by the customer area. Auth email, roles and
  // provider metadata never become part of a customer profile.
  return { displayName: displayName(data.displayName), interests: interests(data.interests), favoriteProductIds: favorites(data.favoriteProductIds) };
}
function publicError(error) {
  if (error instanceof CustomerProfileError) return error;
  if (['permission-denied', 'unauthenticated', 'firestore/permission-denied', 'firestore/unauthenticated'].includes(error?.code)) {
    return new CustomerProfileError(403, error.code, 'Accedi di nuovo per gestire le tue preferenze.');
  }
  return new CustomerProfileError(503, 'profile-unavailable', 'Le preferenze non sono disponibili in questo momento. Controlla la connessione e riprova.');
}

export async function loadCustomerProfile(user) {
  try {
    const uid = customerId(user);
    const { db, sdk } = await getFirestoreContext();
    // A missing profile remains absent until the customer explicitly saves or
    // adds a favorite; sign-in alone does not create a Firestore document.
    return profile(await sdk.getDocFromServer(sdk.doc(db, 'customerProfiles', uid)));
  } catch (error) { throw publicError(error); }
}

export async function saveCustomerPreferences(user, values) {
  try {
    const uid = customerId(user);
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(key => !['displayName', 'interests'].includes(key))) {
      invalid('Le preferenze contengono un campo non consentito.');
    }
    const preferences = { displayName: displayName(values.displayName), interests: interests(values.interests) };
    const { db, sdk } = await getFirestoreContext();
    const reference = sdk.doc(db, 'customerProfiles', uid);
    return await sdk.runTransaction(db, async transaction => {
      const current = profile(await transaction.get(reference));
      const next = { ...current, ...preferences };
      transaction.set(reference, { ...next, updatedAt: sdk.serverTimestamp() });
      return next;
    });
  } catch (error) { throw publicError(error); }
}

export async function toggleCustomerFavorite(user, productId) {
  try {
    const uid = customerId(user);
    if (!safeProductId(productId)) invalid('Questo prodotto non può essere aggiunto ai preferiti.');
    const { db, sdk } = await getFirestoreContext();
    const reference = sdk.doc(db, 'customerProfiles', uid);
    return await sdk.runTransaction(db, async transaction => {
      const current = profile(await transaction.get(reference));
      const removing = current.favoriteProductIds.includes(productId);
      if (!removing && current.favoriteProductIds.length >= CUSTOMER_PROFILE_LIMITS.favorites) {
        throw new CustomerProfileError(409, 'favorites-limit', 'Puoi salvare fino a 200 preferiti. Rimuovine uno prima di aggiungerne altri.');
      }
      const next = { ...current, favoriteProductIds: removing ? current.favoriteProductIds.filter(id => id !== productId) : [...current.favoriteProductIds, productId] };
      transaction.set(reference, { ...next, updatedAt: sdk.serverTimestamp() });
      return next;
    });
  } catch (error) { throw publicError(error); }
}

export async function deleteCustomerProfile(user) {
  try {
    const uid = customerId(user);
    const { db, sdk } = await getFirestoreContext();
    await sdk.deleteDoc(sdk.doc(db, 'customerProfiles', uid));
  } catch (error) { throw publicError(error); }
}
