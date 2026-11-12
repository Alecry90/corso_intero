// Read-only deployment check; never prints credentials or changes cloud state.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getProjectDefaultAccount, getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');
const args = process.argv.slice(2);
const project = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !/^[a-z][a-z0-9-]{5,29}$/.test(project || '')) throw new Error('Specify --project explicitly.');
const account = getProjectDefaultAccount(process.cwd()) || getGlobalDefaultAccount();
if (!account) throw new Error('Firebase CLI login required.');
await requireAuth({ project, nonInteractive: true, ...account });
const client = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1' });
const result = await client.get(`/projects/${project}/databases/(default)/collectionGroups/products/indexes`);
const indexes = (result.body.indexes || []).map(index => ({ state: index.state, fields: index.fields.map(field => `${field.fieldPath}:${field.order || field.arrayConfig}`) }));
console.log(JSON.stringify({ project, indexes, ready: indexes.every(index => index.state === 'READY') }));
