import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { firebaseServices } from './firebase.js';
import { createApi } from './app.js';
import { FirestoreCatalogRepository } from './repository.js';

const { db, auth } = firebaseServices();
export const api = onRequest({
  region: 'europe-west1', memory: '512MiB', timeoutSeconds: 30,
  maxInstances: 4, minInstances: 0, concurrency: 4,
  serviceAccount: 'catalog-api@intimopatrizia-bari.iam.gserviceaccount.com',
  cors: false, invoker: 'public'
}, createApi({ repository: new FirestoreCatalogRepository(db), verifyIdToken: (token, checkRevoked) => auth.verifyIdToken(token, checkRevoked), logger }));
