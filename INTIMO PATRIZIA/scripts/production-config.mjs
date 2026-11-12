import { loadEnv } from 'vite';

const WEB_CONFIG_KEYS = Object.freeze([
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
]);

export function validateProductionConfig(project, env) {
  if (String(env.VITE_FIRESTORE_EMULATOR_HOST ?? '').trim()) {
    throw new Error('VITE_FIRESTORE_EMULATOR_HOST deve essere vuoto per pubblicare sul progetto reale.');
  }
  if (String(env.VITE_USE_EMULATORS ?? '').trim().toLowerCase() === 'true') {
    throw new Error('VITE_USE_EMULATORS deve essere false per pubblicare sul progetto reale.');
  }
  if (String(env.VITE_CATALOG_MODE ?? '').trim().toLowerCase() === 'demo') {
    throw new Error('VITE_CATALOG_MODE=demo non è consentito per la pubblicazione reale. Usa auto.');
  }

  // Match the four fields consumed by firebase-auth.js; do not print their values.
  const configured = WEB_CONFIG_KEYS.filter((key) => Boolean(env[key]));
  const malformed = configured.find((key) => typeof env[key] !== 'string' || env[key] !== env[key].trim());
  if (malformed) throw new Error(`${malformed} deve essere un testo senza spazi iniziali o finali.`);
  if (configured.length > 0 && configured.length < WEB_CONFIG_KEYS.length) {
    const missing = WEB_CONFIG_KEYS.filter((key) => !env[key]);
    throw new Error(`Configurazione Web Firebase incompleta. Completa ${missing.join(', ')} oppure lascia vuoti tutti e quattro i campi per usare la configurazione di Firebase Hosting.`);
  }
  if (configured.length && env.VITE_FIREBASE_PROJECT_ID !== project) {
    throw new Error('VITE_FIREBASE_PROJECT_ID non corrisponde al progetto indicato con --project.');
  }
  return { configSource: configured.length ? 'environment' : 'hosting' };
}

export function validateProductionEnvironment(project, root) {
  // Vite applies .env, .env.local, production files and process overrides in the
  // same order as the subsequent production build.
  return validateProductionConfig(project, loadEnv('production', root, 'VITE_'));
}
