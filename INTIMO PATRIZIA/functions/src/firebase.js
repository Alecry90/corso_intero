import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function loopback(host) { return /^(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(host || ''); }
export function firebaseServices({ projectId, emulator = false } = {}) {
  const hostsPresent = Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const functionsEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
  const cloudRuntime = Boolean(process.env.K_SERVICE || process.env.FUNCTION_TARGET);
  if (emulator && cloudRuntime && !functionsEmulator) throw new Error('Emulator mode is forbidden in Cloud Functions production.');
  if (hostsPresent && !(emulator || functionsEmulator)) throw new Error('Emulator hosts require explicit emulator mode.');
  if (emulator || functionsEmulator) {
    if (!loopback(process.env.FIRESTORE_EMULATOR_HOST) || !loopback(process.env.FIREBASE_AUTH_EMULATOR_HOST)) throw new Error('Both emulator hosts must explicitly point to loopback.');
    projectId ||= process.env.GCLOUD_PROJECT || 'demo-intimopatrizia';
    if (!projectId.startsWith('demo-')) throw new Error('Local development uses a demo-* project to avoid production writes.');
  }
  const app = getApps()[0] || initializeApp({ ...(projectId ? { projectId } : {}), ...(!(emulator || functionsEmulator) ? { credential: applicationDefault() } : {}) });
  return { app, db: getFirestore(app), auth: getAuth(app) };
}
