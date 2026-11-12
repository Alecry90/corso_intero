import { firebaseServices } from '../functions/src/firebase.js';

export function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
export function services() {
  const emulator = process.argv.includes('--emulator');
  const projectId = argument('project');
  if (!projectId || !/^[a-z][a-z0-9-]{4,62}$/.test(projectId)) throw new Error('Indica --project <Project ID>.');
  if (emulator) {
    if (!projectId.startsWith('demo-')) throw new Error('Usa --project demo-intimopatrizia per gli emulatori.');
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  } else {
    if (projectId.startsWith('demo-')) throw new Error('Il progetto demo è consentito solo con --emulator.');
    if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Rimuovi le variabili degli emulatori per un progetto reale.');
    if (argument('confirm-project') !== projectId) throw new Error('Per scrivere sul cloud ripeti il Project ID con --confirm-project <id>.');
  }
  return { ...firebaseServices({ projectId, emulator }), projectId, emulator };
}
