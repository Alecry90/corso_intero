import { test, expect } from '@playwright/test';
import { isolatedCatalog } from './catalog-fixture.js';

const departments = {
  'categories/one': { name: 'Primo reparto', slug: 'primo', published: true, order: 0 },
  'categories/two': { name: 'Secondo reparto', slug: 'secondo', published: true, order: 1 },
  'categories/private': { name: 'Reparto privato', slug: 'privato', published: false, order: 2 },
};

test('explicit filters scan beyond the first page and restore the whole selection from the URL', async ({ page }) => {
  test.setTimeout(120000);
  const seed = { ...departments };
  for (let index = 0; index < 224; index++) {
    seed[`products/p${String(index).padStart(3, '0')}`] = { name: `Articolo ${String(index).padStart(3, '0')}`, categoryId: 'one', order: index, price: index === 221 ? 45 : 20, sizes: index === 221 ? ['XL'] : ['S'], colors: index === 221 ? ['Blu'] : ['Bianco'], material: index === 221 ? 'Lino e cotone' : 'Cotone' };
  }
  seed['products/other'] = { name: 'Stesse caratteristiche altro reparto', categoryId: 'two', sizes: ['XL'], colors: ['Blu'], material: 'Lino', price: 45 };
  const backend = await isolatedCatalog(seed);
  try {
    await backend.route(page);
    await page.goto('/catalogo.html?categoria=primo');
    await expect(page.locator('.product-card')).toHaveCount(24);
    await page.getByLabel('Taglia', { exact: true }).fill('xl');
    await expect(page.locator('#catalog-count')).toHaveText('1 proposta', { timeout: 30000 });
    await expect(page.locator('.product-card h2')).toHaveText('Articolo 221');
    await page.getByLabel('Colore', { exact: true }).fill('blu');
    await page.getByLabel('Tessuto', { exact: true }).fill('lino');
    await page.getByLabel('Prezzo minimo (€)', { exact: true }).fill('40');
    await page.getByLabel('Prezzo massimo (€)', { exact: true }).fill('50');
    await expect(page.locator('.product-card h2')).toHaveText('Articolo 221');
    await expect(page).toHaveURL(/taglia=xl/);
    await expect(page).toHaveURL(/prezzo-min=40/);
    await page.reload();
    await expect(page.locator('.product-card h2')).toHaveText('Articolo 221', { timeout: 30000 });
    await expect(page.getByLabel('Taglia', { exact: true })).toHaveValue('xl');
    await expect(page.getByLabel('Tessuto', { exact: true })).toHaveValue('lino');
    await page.getByLabel('Prezzo massimo (€)', { exact: true }).fill('30');
    await expect(page.locator('#catalog-price-error')).toBeVisible();
    await expect(page.locator('#catalog-empty')).toBeHidden();
    await page.locator('#catalog-reset').click();
    await expect(page.getByLabel('Taglia', { exact: true })).toHaveValue('');
    await expect(page).not.toHaveURL(/taglia=/);
    await expect(page.locator('.product-card')).toHaveCount(24);
  } finally { await backend.close(); }
});

test('a public direct link opens outside the selected department, prepares contacts and offers a visible copy fallback', async ({ page }) => {
  const backend = await isolatedCatalog({
    ...departments,
    'products/first': { name: 'Primo articolo', categoryId: 'one' },
    'products/linked': { name: 'Pigiama da chiedere', categoryId: 'two', sku: 'PAT-42', brand: 'Marca confermata', sizes: ['M', 'L'], colors: ['Blu', 'Avorio'], price: 42 },
    'storeSettings/public': { email: 'negozio@example.test', phoneHref: 'tel:+390801234567', whatsappNumber: '393331234567', hours: Array(7).fill('') },
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await backend.route(page);
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } }));
    await page.goto('/catalogo.html?categoria=primo&prodotto=linked');
    await expect(page.locator('#product-title')).toHaveText('Pigiama da chiedere');
    await expect(page.locator('#product-detail')).toContainText('PAT-42');
    await expect(page.locator('#product-detail')).toContainText('Marca confermata');
    await expect(page.locator('#product-email')).toHaveAttribute('href', /^mailto:negozio@example.test\?/);
    await page.locator('#product-request-size').selectOption('L');
    await page.locator('#product-request-color').selectOption('Avorio');
    const email = new URL(await page.locator('#product-email').getAttribute('href'));
    expect(email.searchParams.get('body')).toContain('Codice: PAT-42');
    expect(email.searchParams.get('body')).toContain('Taglia richiesta: L');
    expect(email.searchParams.get('body')).toContain('Colore richiesto: Avorio');
    expect(email.searchParams.get('body')).toContain('/catalogo.html?prodotto=linked');
    await expect(page.locator('#product-phone')).toHaveAttribute('href', 'tel:+390801234567');
    await expect(page.locator('#product-whatsapp')).toHaveAttribute('href', /^https:\/\/wa.me\/393331234567\?text=/);
    await page.locator('#product-share').click();
    await expect(page.locator('#product-share-fallback')).toBeVisible();
    await expect(page.locator('#product-share-url')).toHaveValue('http://127.0.0.1:5174/catalogo.html?prodotto=linked');
    await expect(page.locator('#product-share-url')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#product-dialog')).not.toBeVisible();
    await expect(page).not.toHaveURL(/prodotto=/);
    await expect(page.locator('.product-card h2')).toHaveText('Primo articolo');
    expect(errors).toEqual([]);
  } finally { await backend.close(); }
});

test('direct links hide unpublished, sample and private-department products even for the signed-in owner', async ({ page }) => {
  const backend = await isolatedCatalog({
    ...departments,
    'products/public': { name: 'Articolo pubblico', categoryId: 'one' },
    'products/draft': { name: 'Bozza riservata', categoryId: 'one', published: false },
    'products/sample': { name: 'Campione riservato', categoryId: 'one', isDemo: true },
    'products/private': { name: 'Articolo reparto privato', categoryId: 'private' },
  });
  try {
    await backend.route(page);
    await page.goto('/accedi.html');
    await page.locator('#login-email').fill('alessandroferrara01@libero.it');
    await page.locator('#login-password').fill('test-password');
    await page.locator('#login-submit').click();
    await expect(page.locator('#account-signed-in')).toBeVisible();
    for (const id of ['draft', 'sample', 'private', 'missing']) {
      await page.goto(`/catalogo.html?prodotto=${id}`);
      await expect(page.locator('#catalog-product-status')).toContainText('non è disponibile nel catalogo pubblico');
      await expect(page.locator('#product-dialog')).not.toBeVisible();
      await expect(page.locator('.product-card h2')).toHaveText('Articolo pubblico');
    }
    await page.goto('/catalogo.html?prodotto=public');
    await expect(page.locator('#product-dialog')).toBeVisible();
    await expect(page.locator('#product-whatsapp')).toBeHidden();
  } finally { await backend.close(); }
});

test('a hidden page pauses full-catalog scans without publishing a partial empty result', async ({ page }) => {
  test.setTimeout(60000);
  const seed = { ...departments };
  for (let index = 0; index < 224; index++) seed[`products/a${index}`] = { name: `Articolo ${String(index).padStart(3, '0')}`, categoryId: 'one', order: index, sizes: index === 223 ? ['XXL'] : ['S'] };
  const backend = await isolatedCatalog(seed);
  try {
    await backend.route(page);
    await page.route(url => url.pathname === '/src/firestore-catalog.js' && !url.searchParams.has('actual'), route => route.fulfill({ contentType: 'application/javascript', body: `
      import * as real from '/src/firestore-catalog.js?actual';
      export * from '/src/firestore-catalog.js?actual';
      export async function loadPublicCatalogPage(options) {
        if (window.__holdCatalogCursor && options.cursor) {
          window.__heldCatalogCursor = true;
          await new Promise(resolve => setTimeout(resolve, 1300));
        }
        window.__catalogPageStarts = (window.__catalogPageStarts || 0) + 1;
        return real.loadPublicCatalogPage(options);
      }
    ` }));
    await page.goto('/catalogo.html?categoria=primo');
    await expect(page.locator('.product-card')).toHaveCount(24);
    await page.evaluate(() => { window.__holdCatalogCursor = true; });
    await page.locator('#catalog-size').fill('XXL');
    await expect.poll(() => page.evaluate(() => window.__heldCatalogCursor)).toBe(true);
    await expect(page.locator('#catalog-count')).toContainText('Ricerca in corso');
    await expect(page.locator('#catalog-empty')).toBeHidden();
    await expect(page.locator('.product-card')).toHaveCount(0);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    const reads = await page.evaluate(() => window.__catalogPageStarts);
    await page.waitForTimeout(1700);
    // The delayed SDK call may observe its aborted signal, but must never continue to a third page.
    expect(await page.evaluate(() => window.__catalogPageStarts)).toBeLessThanOrEqual(reads + 1);
    await expect(page.locator('#catalog-empty')).toBeHidden();
    await page.evaluate(() => { window.__holdCatalogCursor = false; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.locator('.product-card h2')).toHaveText('Articolo 223', { timeout: 30000 });
    await expect(page.locator('#catalog-count')).toHaveText('1 proposta');
  } finally { await backend.close(); }
});

test('a slow product link cannot replace a newer requested product', async ({ page }) => {
  const backend = await isolatedCatalog({ ...departments, 'products/slow': { name: 'Prodotto precedente', categoryId: 'one' }, 'products/current': { name: 'Prodotto richiesto', categoryId: 'two' } });
  try {
    await backend.route(page);
    await page.route(url => url.pathname === '/src/firestore-catalog.js' && !url.searchParams.has('actual'), route => route.fulfill({ contentType: 'application/javascript', body: `
      import * as real from '/src/firestore-catalog.js?actual';
      export * from '/src/firestore-catalog.js?actual';
      export async function loadPublicProductsByIds(options) {
        if (options.ids.includes('slow')) { window.__slowProductStarted = true; await new Promise(resolve => setTimeout(resolve, 1200)); }
        return real.loadPublicProductsByIds(options);
      }
    ` }));
    await page.goto('/catalogo.html?prodotto=slow');
    await expect.poll(() => page.evaluate(() => window.__slowProductStarted)).toBe(true);
    await page.evaluate(() => { history.pushState(null, '', '/catalogo.html?prodotto=current'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.locator('#product-title')).toHaveText('Prodotto richiesto');
    await page.waitForTimeout(1500);
    await expect(page.locator('#product-title')).toHaveText('Prodotto richiesto');
    await expect(page).toHaveURL(/prodotto=current/);
  } finally { await backend.close(); }
});
