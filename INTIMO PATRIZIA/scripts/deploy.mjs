import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateProductionEnvironment } from './production-config.mjs';
const args=process.argv.slice(2);
const index=args.indexOf('--project');
const project=index<0?'':args[index+1];
if(!project || !/^[a-z][a-z0-9-]{4,62}$/.test(project) || project.startsWith('demo-')) {
  console.error('Indica esplicitamente un progetto Firebase reale: npm run firebase:deploy -- --project PROJECT_ID');
  process.exit(1);
}
const root=fileURLToPath(new URL('..',import.meta.url));
try {
  validateProductionEnvironment(project,root);
} catch(error) {
  console.error(`Pubblicazione annullata: ${error.message}`);
  process.exit(1);
}
for(const command of [
  ['scripts/assert-spark.mjs','--project',project],
  ['node_modules/vite/bin/vite.js','build','--mode','production'],
  ['node_modules/firebase-tools/lib/bin/firebase.js','deploy','--project',project,'--only','auth'],
  ['scripts/configure-auth-domains.mjs','--project',project,'--confirm-project',project],
  ['scripts/configure-password-policy.mjs','--project',project,'--confirm-project',project],
  ['node_modules/firebase-tools/lib/bin/firebase.js','deploy','--project',project,'--only','firestore,hosting']
]) {
  const result=spawnSync(process.execPath,command,{cwd:root,stdio:'inherit',shell:false});
  if(result.error)console.error(`Impossibile avviare il comando: ${result.error.message}`);
  if(result.status!==0)process.exit(result.status||1);
}
