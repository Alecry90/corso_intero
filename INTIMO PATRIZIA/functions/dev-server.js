// Explicit local adapter; it cannot connect to real Firestore or bypass Firebase Auth.
import { firebaseServices } from './src/firebase.js';
import { createApi } from './src/app.js';
import { FirestoreCatalogRepository } from './src/repository.js';

if (process.env.INTIMO_USE_EMULATORS !== 'true') throw new Error('Set INTIMO_USE_EMULATORS=true and both loopback emulator hosts first.');
const { db, auth } = firebaseServices({ projectId: 'demo-intimopatrizia', emulator: true });
const app = createApi({ repository: new FirestoreCatalogRepository(db), verifyIdToken: (token, checkRevoked) => auth.verifyIdToken(token, checkRevoked) });
const port = Number(process.env.API_PORT || 8788);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port.');
app.listen(port, '127.0.0.1', () => console.log(`IntimoPatrizia API emulator adapter: http://127.0.0.1:${port}`));
