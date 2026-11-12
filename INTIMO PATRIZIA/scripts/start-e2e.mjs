// Keep browser tests isolated from the real Firebase configuration in .env.local.
import { createServer } from 'vite';
for (const key of ['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID']) process.env[key]='';
process.env.VITE_USE_EMULATORS='false';
// Browser CRUD uses the actual SDK against a separately managed local emulator.
// Auth remains a local Playwright fixture; it never contacts an account service.
process.env.VITE_FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.VITE_CATALOG_MODE='auto';
delete process.env.INTIMO_API_PROXY;
const server=await createServer({mode:'e2e',server:{host:'127.0.0.1',port:5174,strictPort:true}});
await server.listen();
