// Read-only check of the existing Firebase deployment. Never prints credentials.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getProjectDefaultAccount, getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');

const args = process.argv.slice(2);
const project = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !/^[a-z][a-z0-9-]{5,29}$/.test(project || '') || project.startsWith('demo-')) {
  throw new Error('Indica --project <Project ID reale>.');
}
const deadline = setTimeout(() => {
  console.error('Verifica cloud interrotta: timeout di rete dopo 60 secondi.');
  process.exit(2);
}, 60_000);

try {
  const account = getProjectDefaultAccount(process.cwd()) || getGlobalDefaultAccount();
  console.log(JSON.stringify({ project, authenticated: Boolean(account), account: account?.user?.email || null }));
  if (!account) throw new Error('Completa prima il login del Firebase CLI.');
  await requireAuth({ project, nonInteractive: true, ...account });
  const billing = new Client({ urlPrefix: 'https://cloudbilling.googleapis.com', apiVersion: 'v1' });
  const functions = new Client({ urlPrefix: 'https://cloudfunctions.googleapis.com', apiVersion: 'v2' });
  const hosting = new Client({ urlPrefix: 'https://firebasehosting.googleapis.com', apiVersion: 'v1beta1' });
  const identity = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'v1' });
  const checks = await Promise.allSettled([
    (async () => {
      const info = (await billing.get(`/projects/${project}/billingInfo`)).body;
      let accountOpen = null;
      if (info.billingAccountName) accountOpen = (await billing.get(`/${info.billingAccountName}`)).body.open;
      return { service: 'billing', billingEnabled: info.billingEnabled, accountOpen };
    })(),
    (async () => {
      const response = (await functions.get(`/projects/${project}/locations/europe-west1/functions`)).body;
      return { service: 'functions', functions: (response.functions || []).map(fn => ({ name: fn.name, state: fn.state, uri: fn.serviceConfig?.uri })) };
    })(),
    (async () => {
      const response = (await hosting.get(`/sites/${project}/releases`, { queryParams: { pageSize: 1 } })).body;
      return { service: 'hosting', releases: (response.releases || []).map(release => ({ name: release.name, type: release.type, releaseTime: release.releaseTime, status: release.version?.status })) };
    })(),
    (async () => {
      const response = (await identity.post(`/projects/${project}/accounts:lookup`, { email: ['alessandroferrara01@libero.it'] })).body;
      const user = response.users?.[0];
      return { service: 'website-owner', exists: Boolean(user), emailVerified: user?.emailVerified === true, disabled: user?.disabled === true };
    })(),
  ]);
  let failed = false;
  for (let i = 0; i < checks.length; i++) {
    const result = checks[i];
    if (result.status === 'fulfilled') console.log(JSON.stringify(result.value));
    else {
      failed = true;
      console.error(JSON.stringify({ service: ['billing', 'functions', 'hosting', 'website-owner'][i], error: result.reason?.message || String(result.reason) }));
    }
  }
  if (failed) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
}
