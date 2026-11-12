import { argument, services } from './firebase-cli-common.mjs';
import { ADMIN_EMAILS, normalizeEmail } from '../functions/src/admin-access.js';

const uid = argument('uid');
if (!uid || uid.length > 128) throw new Error('Indica --uid <UID Firebase Authentication>.');
const grant = process.argv.includes('--grant');
const revoke = process.argv.includes('--revoke');
if (grant === revoke) throw new Error('Scegli esattamente uno fra --grant e --revoke.');
const { auth, projectId } = services();
const user = await auth.getUser(uid);
if (grant && !ADMIN_EMAILS.includes(normalizeEmail(user.email))) throw new Error('Questo indirizzo non è nell’elenco server degli amministratori autorizzati.');
const claims = { ...user.customClaims };
if (grant) claims.admin = true;
else delete claims.admin;
await auth.setCustomUserClaims(uid, claims);
if (revoke) await auth.revokeRefreshTokens(uid);
console.log(`Ruolo gestore ${grant ? 'assegnato' : 'revocato'} per UID ${uid}, progetto ${projectId}. Esegui nuovamente l’accesso.`);
