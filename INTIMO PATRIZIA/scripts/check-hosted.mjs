// Read-only production smoke check. No sign-in, email, upload or data mutation.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const base = 'https://intimopatrizia-bari.web.app';
const root = await fetch(base);
assert.equal(root.status, 200, 'Hosting must serve the site.');
assert.match(root.headers.get('content-security-policy') || '', /https:\/\/firestore\.googleapis\.com/);
assert.equal(root.headers.get('x-content-type-options'), 'nosniff');
const configResponse = await fetch(`${base}/__/firebase/init.json`);
assert.equal(configResponse.status, 200);
const config = await configResponse.json();
assert.equal(config.projectId, 'intimopatrizia-bari');
const privateResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/catalogMeta/inventory?key=${encodeURIComponent(config.apiKey)}`);
assert.ok([401, 403].includes(privateResponse.status), 'Private inventory must reject anonymous reads.');
for (const path of ['customerProfiles/anonymous-check', 'customerProfiles']) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/${path}?key=${encodeURIComponent(config.apiKey)}`);
  assert.ok([401, 403].includes(response.status), 'Customer profiles must reject anonymous reads and lists.');
}
const output = new URL('../output/qa/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/catalogo.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /^\d/.test(document.querySelector('#catalog-count')?.textContent || '') && document.querySelector('#catalog-products')?.getAttribute('aria-busy') === 'false', { timeout: 30000 });
  assert.equal(await page.locator('#catalog-error').isVisible(), false, 'Public catalogue must load.');
  assert.equal(await page.locator('#catalog-demo').isVisible(), false, 'Production must not be in demo mode.');
  assert.equal(await page.locator('.sample-label').count(), 0, 'Sample products must not be public.');
  const products = await page.locator('.product-card').count();
  const departments = await page.locator('#catalog-groups button[data-group-id]:not([data-group-id=""])').count();
  assert.equal(departments, 6, 'The catalogue must show six departments.');
  const categoryIds = new Set();
  const groupIds = await page.locator('#catalog-groups button[data-group-id]:not([data-group-id=""])').evaluateAll(buttons => buttons.map(button => button.dataset.groupId));
  for (const groupId of groupIds) {
    await page.locator(`#catalog-groups button[data-group-id="${groupId}"]`).click();
    for (const id of await page.locator('#catalog-categories button[data-category-id]:not([data-category-id=""])').evaluateAll(buttons => buttons.map(button => button.dataset.categoryId))) categoryIds.add(id);
  }
  const manifest = JSON.parse(await readFile(new URL('../catalog/notes-categories.json', import.meta.url), 'utf8'));
  assert.deepEqual([...categoryIds].sort(), manifest.categories.map(category => category.id).sort());
  await page.locator('#catalog-groups button[data-group-id=""]').click();
  await page.screenshot({ path: fileURLToPath(new URL('online-catalog-desktop.png', output)), fullPage: true });
  await page.goto(`${base}/accedi.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#account-content[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('#account-access').isVisible(), true, 'Optional sign-in must initialize.');
  assert.equal(await page.locator('#login-submit').isEnabled(), true);
  assert.equal(await page.locator('#account-unavailable').isVisible(), false);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('.header-visit').isVisible(), true, 'Sign-in must remain visible on mobile.');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: fileURLToPath(new URL('online-home-mobile.png', output)) });
  assert.deepEqual(errors, [], 'Hosted pages must not have JavaScript or CSP errors.');
  console.log(JSON.stringify({ base, hosting: 'ok', publicCatalog: 'ok', departments, sections: categoryIds.size, products, optionalLogin: 'ready', privateInventory: 'denied', privateProfiles: 'denied', mobile: 'ok', errors: 0 }));
} finally { await browser.close(); }
