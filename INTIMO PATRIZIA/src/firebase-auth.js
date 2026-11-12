/** Firebase client configuration is public. Service-account credentials never belong here. */
const env = import.meta.env;
const configuredEnv = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

function isConfigured(config) {
  return Boolean(config?.apiKey && config?.authDomain && config?.projectId && config?.appId);
}

async function readConfig() {
  if (isConfigured(configuredEnv)) return configuredEnv;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch('/__/firebase/init.json', { signal: controller.signal, credentials: 'same-origin' });
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) return null;
    const config = await response.json();
    return isConfigured(config) ? config : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

let appPromise;
export function initializeFirebaseApp() {
  appPromise ??= (async () => {
    const config = await readConfig();
    if (!config) return null;
    const appSdk = await import('firebase/app');
    return appSdk.getApps().find((candidate) => candidate.name === 'intimo-patrizia-admin')
      || appSdk.initializeApp(config, 'intimo-patrizia-admin');
  })();
  return appPromise;
}

let authPromise;
export function initializeFirebaseAuth() {
  authPromise ??= createFirebaseAuth();
  return authPromise;
}

async function createFirebaseAuth() {
  const app = await initializeFirebaseApp();
  if (!app) return { status: 'missing' };
  const authSdk = await import('firebase/auth');
  const auth = authSdk.getAuth(app);
  auth.languageCode = 'it';
  if (env.VITE_USE_EMULATORS === 'true') {
    const emulatorUrl = env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
    const emulator = new URL(emulatorUrl);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(emulator.hostname)) {
      throw new Error('L’emulatore di accesso deve utilizzare un indirizzo locale.');
    }
    authSdk.connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
  }
  await authSdk.setPersistence(auth, authSdk.browserSessionPersistence);
  const googleProvider = new authSdk.GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  return {
    status: 'ready',
    onChange: (callback) => authSdk.onIdTokenChanged(auth, callback),
    signIn: (email, password) => authSdk.signInWithEmailAndPassword(auth, email, password),
    signUp: (email, password) => authSdk.createUserWithEmailAndPassword(auth, email, password),
    signInWithGoogle: () => authSdk.signInWithPopup(auth, googleProvider),
    signOut: () => authSdk.signOut(auth),
    resetPassword: (email) => authSdk.sendPasswordResetEmail(auth, email),
    verifyEmail: async () => {
      if (!auth.currentUser) throw new Error('Accedi prima di verificare la tua email.');
      if (!auth.currentUser.emailVerified) await authSdk.sendEmailVerification(auth.currentUser);
    },
    refreshUser: async () => {
      if (!auth.currentUser) throw new Error('Accedi per controllare la verifica della tua email.');
      await authSdk.reload(auth.currentUser);
      await auth.currentUser.getIdToken(true);
    },
    currentUser: () => auth.currentUser,
    getToken: async () => {
      if (!auth.currentUser) throw new Error('Accedi con l’account del gestore per continuare.');
      return auth.currentUser.getIdToken();
    },
  };
}
