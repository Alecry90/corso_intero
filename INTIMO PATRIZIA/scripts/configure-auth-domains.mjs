// firebase-tools 15.34 deploys providers but does not apply authorizedDomains.
// Use its authenticated client for this setup operation, which has no MCP tool.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const { requireAuth }=require('firebase-tools/lib/requireAuth');
const { getProjectDefaultAccount,getGlobalDefaultAccount }=require('firebase-tools/lib/auth');
const { Client }=require('firebase-tools/lib/apiv2');
const args=process.argv.slice(2);
const arg=name=>args[args.indexOf(`--${name}`)+1];
const project=arg('project');
if(!args.includes('--project')||!args.includes('--confirm-project')||typeof project!=='string'||!/^[a-z][a-z0-9-]{5,29}$/.test(project)||project!==arg('confirm-project')||project.startsWith('demo-')) throw Error('Ripeti il progetto reale con --project ID --confirm-project ID.');
const root=fileURLToPath(new URL('..',import.meta.url));
const config=JSON.parse(await readFile(new URL('../firebase.json',import.meta.url),'utf8'));
const domains=config.auth?.authorizedDomains;
if(!Array.isArray(domains)||!domains.length||domains.some(domain=>typeof domain!=='string'||!/^[a-z0-9.-]+$/.test(domain))) throw Error('Configura auth.authorizedDomains con nomi host validi.');
const account=getProjectDefaultAccount(root)||getGlobalDefaultAccount();
if(!account)throw Error('Completa prima il login del Firebase CLI.');
await requireAuth({project,nonInteractive:true,...account});
const client=new Client({urlPrefix:'https://identitytoolkit.googleapis.com',apiVersion:'admin/v2'});
const path=`/projects/${project}/config`;
const current=await client.get(path);
const authorizedDomains=[...new Set([...(current.body.authorizedDomains||[]),...domains])].sort();
if(JSON.stringify([...(current.body.authorizedDomains||[])].sort())!==JSON.stringify(authorizedDomains)) await client.patch(path,{authorizedDomains},{queryParams:{updateMask:'authorizedDomains'}});
console.log(JSON.stringify({project,authorizedDomains}));
