// Read only. A deployment must never activate or require a billing account.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getProjectDefaultAccount, getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');
const args = process.argv.slice(2);
const project = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !/^[a-z][a-z0-9-]{5,29}$/.test(project || '') || project.startsWith('demo-')) throw new Error('Indica --project <Project ID reale>.');
const deadline = setTimeout(() => { console.error('Verifica del piano interrotta dopo 30 secondi.'); process.exit(1); }, 30000);
try {
  const account = getProjectDefaultAccount(process.cwd()) || getGlobalDefaultAccount();
  if (!account) throw new Error('Completa prima il login del Firebase CLI.');
  await requireAuth({ project, nonInteractive: true, ...account });
  const client = new Client({ urlPrefix: 'https://cloudbilling.googleapis.com', apiVersion: 'v1' });
  const info = (await client.get(`/projects/${project}/billingInfo`)).body;
  if (info.billingEnabled !== false) throw new Error('Pubblicazione bloccata: la fatturazione risulta attiva o non verificabile. Questo progetto deve restare sul piano gratuito Spark.');
  if (info.billingAccountName) {
    const linked = (await client.get(`/${info.billingAccountName}`)).body;
    if (linked.open !== false) throw new Error('Pubblicazione bloccata: è collegato un account di fatturazione aperto. Scegli Spark prima di procedere.');
  }
  console.log(JSON.stringify({ project, billingEnabled: false, deployment: 'Spark: Authentication, Firestore, Hosting; nessuna Functions o Storage' }));
} finally { clearTimeout(deadline); }
