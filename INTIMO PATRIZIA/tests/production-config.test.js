import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateProductionConfig, validateProductionEnvironment } from '../scripts/production-config.mjs';

const project = 'intimopatrizia-test';
const webConfig = {
  VITE_FIREBASE_API_KEY: 'public-test-key',
  VITE_FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: project,
  VITE_FIREBASE_APP_ID: 'public-test-app',
};
const envKeys = [...Object.keys(webConfig), 'VITE_USE_EMULATORS', 'VITE_FIRESTORE_EMULATOR_HOST', 'VITE_CATALOG_MODE'];

function envDirectory(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'intimo-production-config-'));
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(root, name), contents);
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  t.after(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    for (const name of Object.keys(files)) unlinkSync(join(root, name));
    rmdirSync(root);
  });
  return root;
}

test('production supports complete matching Web config or the Hosting config fallback', () => {
  assert.equal(validateProductionConfig(project, webConfig).configSource, 'environment');
  assert.equal(validateProductionConfig(project, {}).configSource, 'hosting');
  assert.equal(validateProductionConfig(project, Object.fromEntries(Object.keys(webConfig).map((key) => [key, '']))).configSource, 'hosting');
});

test('production rejects emulator and demonstration settings before deployment', () => {
  for (const value of ['true', ' TRUE ']) {
    assert.throws(() => validateProductionConfig(project, { VITE_USE_EMULATORS: value }), /VITE_USE_EMULATORS/);
  }
  assert.throws(() => validateProductionConfig(project, { VITE_CATALOG_MODE: 'demo' }), /VITE_CATALOG_MODE/);
  assert.throws(() => validateProductionConfig(project, { VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }), /VITE_FIRESTORE_EMULATOR_HOST/);
  assert.doesNotThrow(() => validateProductionConfig(project, { VITE_USE_EMULATORS: 'false', VITE_CATALOG_MODE: 'auto' }));
});

test('partial or mismatching Web config cannot silently select another Firebase app', () => {
  const partial = { VITE_FIREBASE_API_KEY: webConfig.VITE_FIREBASE_API_KEY };
  assert.throws(() => validateProductionConfig(project, partial), (error) => {
    assert.match(error.message, /incompleta/);
    assert.match(error.message, /VITE_FIREBASE_PROJECT_ID/);
    assert.ok(!error.message.includes(webConfig.VITE_FIREBASE_API_KEY));
    return true;
  });
  assert.throws(() => validateProductionConfig(project, { ...webConfig, VITE_FIREBASE_PROJECT_ID: 'another-project' }), /non corrisponde/);
  assert.throws(() => validateProductionConfig(project, { ...webConfig, VITE_FIREBASE_API_KEY: '   ' }), /VITE_FIREBASE_API_KEY/);
});

test('production preflight reads .env.local rather than ignoring local emulator settings', (t) => {
  const root = envDirectory(t, { '.env.local': 'VITE_USE_EMULATORS=true\n' });
  assert.throws(() => validateProductionEnvironment(project, root), /VITE_USE_EMULATORS/);
});

test('production preflight follows Vite mode and file precedence', (t) => {
  const root = envDirectory(t, {
    '.env.local': 'VITE_USE_EMULATORS=true\nVITE_CATALOG_MODE=demo\n',
    '.env.production': 'VITE_USE_EMULATORS=false\nVITE_CATALOG_MODE=auto\n',
    '.env.production.local': Object.entries(webConfig).map(([key, value]) => `${key}=${value}`).join('\n'),
    '.env.development.local': 'VITE_USE_EMULATORS=true\n',
  });
  assert.equal(validateProductionEnvironment(project, root).configSource, 'environment');
});

test('process overrides cannot bypass the same production settings used by Vite build', (t) => {
  const root = envDirectory(t, { '.env.production': 'VITE_CATALOG_MODE=auto\n' });
  process.env.VITE_CATALOG_MODE = 'demo';
  assert.throws(() => validateProductionEnvironment(project, root), /VITE_CATALOG_MODE/);
});
