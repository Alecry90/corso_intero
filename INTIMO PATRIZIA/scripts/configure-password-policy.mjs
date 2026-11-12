// Applies only the requested password policy; never reads or exports user credentials.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { getProjectDefaultAccount, getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const { Client } = require('firebase-tools/lib/apiv2');
const args = process.argv.slice(2);
const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : '';
const project = value('--project');
if (project !== 'intimopatrizia-bari' || value('--confirm-project') !== project) {
  throw Error('Indica --project intimopatrizia-bari --confirm-project intimopatrizia-bari.');
}
const root = fileURLToPath(new URL('..', import.meta.url));
const policy = JSON.parse(await readFile(new URL('../config/auth-password-policy.json', import.meta.url), 'utf8'));
const strength = policy.passwordPolicyVersions?.[0]?.customStrengthOptions;
if (policy.passwordPolicyEnforcementState !== 'ENFORCE' || policy.forceUpgradeOnSignin !== true ||
    policy.passwordPolicyVersions.length !== 1 || strength?.minPasswordLength !== 8 ||
    strength?.maxPasswordLength !== 4096 || strength?.containsUppercaseCharacter !== true ||
    strength?.containsLowercaseCharacter !== false || strength?.containsNumericCharacter !== false ||
    strength?.containsNonAlphanumericCharacter !== false) {
  throw Error('Policy diversa dai requisiti autorizzati: almeno 8 caratteri e una maiuscola.');
}
const account = getProjectDefaultAccount(root) || getGlobalDefaultAccount();
if (!account) throw Error('Completa prima il login del Firebase CLI.');
await requireAuth({ project, nonInteractive: true, ...account });
const client = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'admin/v2' });
const path = `/projects/${project}/config`;
const before = (await client.get(path)).body;
if (before.signIn?.allowDuplicateEmails === true) throw Error('Verificare prima la configurazione di unicità email.');
await client.patch(path, { passwordPolicyConfig: policy }, { queryParams: { updateMask: 'passwordPolicyConfig' } });
const after = (await client.get(path)).body;
const actual = after.passwordPolicyConfig;
const actualStrength = actual?.passwordPolicyVersions?.[0]?.customStrengthOptions;
if (actual?.passwordPolicyEnforcementState !== 'ENFORCE' || actual?.forceUpgradeOnSignin !== true ||
    actual?.passwordPolicyVersions?.length !== 1 || actualStrength?.minPasswordLength !== 8 ||
    actualStrength?.maxPasswordLength !== 4096 || actualStrength?.containsUppercaseCharacter !== true ||
    Boolean(actualStrength?.containsLowercaseCharacter) || Boolean(actualStrength?.containsNumericCharacter) ||
    Boolean(actualStrength?.containsNonAlphanumericCharacter) ||
    Boolean(after.signIn?.allowDuplicateEmails) !== Boolean(before.signIn?.allowDuplicateEmails) ||
    JSON.stringify(after.emailPrivacyConfig) !== JSON.stringify(before.emailPrivacyConfig)) {
  throw Error('La verifica della policy o delle protezioni email non è riuscita.');
}
console.log(JSON.stringify({ project, passwordPolicyConfig: actual,
  allowDuplicateEmails: after.signIn?.allowDuplicateEmails === true,
  improvedEmailPrivacy: after.emailPrivacyConfig?.enableImprovedEmailPrivacy === true }));
