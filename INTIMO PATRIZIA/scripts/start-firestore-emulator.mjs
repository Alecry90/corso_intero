// Free local tools live outside the project. This script never downloads them.
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const toolkit=process.env.INTIMO_TEST_TOOLS||join(homedir(),'.cache','intimo-test-tools');
const javaRoot=join(toolkit,'java21');
const javaName=process.platform==='win32'?'java.exe':'java';
const java=process.env.INTIMO_TEST_JAVA||(existsSync(javaRoot)?readdirSync(javaRoot).map(name=>join(javaRoot,name,'bin',javaName)).find(existsSync):undefined);
const jar=join(toolkit,'cloud-firestore-emulator-v1.22.0.jar');
if(!java||!existsSync(java)||!existsSync(jar))throw new Error('Install the free portable JDK21 and Firestore emulator in the external toolkit described in docs/TESTING.md. No download or system Java change is performed.');
const checksum=createHash('sha256').update(readFileSync(jar)).digest('hex');
if(checksum!=='9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c')throw new Error('The Firestore emulator SHA256 does not match the Firebase CLI manifest.');
const temporary=join(toolkit,'tmp');mkdirSync(temporary,{recursive:true});
const port=process.env.INTIMO_FIRESTORE_TEST_PORT||'8080';
if(!/^\d{2,5}$/.test(port)||Number(port)>65535)throw new Error('Choose a valid local test port.');
const child=spawn(java,[`-Djdk.net.unixdomain.tmpdir=${temporary}`,'-Duser.language=en','-Duser.country=US','-jar',jar,'--host','127.0.0.1','--port',port,'--project_id','demo-intimopatrizia-e2e','--rules',resolve('firestore.rules')],{stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??0;});
// Ctrl-C is forwarded to this process and its child by the interactive terminal.
// Termination is limited to this exact child; no process-wide taskkill is used.
process.on('SIGINT',()=>{if(!child.killed)child.kill('SIGINT');});
process.on('SIGTERM',()=>{if(!child.killed)child.kill('SIGTERM');});
