import { test, expect } from '@playwright/test';
import { isolatedCatalog } from './catalog-fixture.js';

const seed = {
  'categories/one': { name: 'Primo reparto', slug: 'primo', order: 0, published: true },
  'categories/two': { name: 'Secondo reparto', slug: 'secondo', order: 1, published: true },
  'categories/private': { name: 'Reparto riservato', slug: 'riservato', order: 2, published: false },
};
for (let index = 0; index < 263; index++) {
  const number = String(index).padStart(3, '0');
  seed[`products/p${number}`] = { name: `Articolo ${number}`, categoryId: index % 2 ? 'one' : 'two', order: index, price: index === 262 ? null : 300 - index, description: index === 251 ? 'Raro cotone oltre duecento prodotti' : 'Assortimento del test' };
}
seed['products/draft'] = { name: 'Bozza riservata', categoryId: 'one', published: false, order: 0 };
seed['products/sample'] = { name: 'Esempio fittizio', categoryId: 'one', isDemo: true, order: 0 };
seed['products/private'] = { name: 'Prodotto nascosto', categoryId: 'private', order: 0 };

test('public cursor pages cross the former 200-item limit, search the whole catalog and sort prices globally', async ({ page }) => {
  test.setTimeout(120000);
  const backend = await isolatedCatalog(seed);
  try {
    await backend.route(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/catalogo.html');
    await expect(page.locator('.product-card')).toHaveCount(24);
    await expect(page.locator('.product-card h2').first()).toHaveText('Articolo 000');
    await expect(page.locator('#catalog-count')).toContainText('Altre proposte disponibili');
    for (let index = 0; index < 8; index++) {
      await page.locator('#catalog-page-next').click();
      await expect(page.locator('#catalog-page-status')).toHaveText(`Pagina ${index + 2}`);
    }
    await expect(page.locator('.product-card h2').first()).toHaveText('Articolo 192');
    await expect(page.locator('.product-card h2').last()).toHaveText('Articolo 215');
    await expect(page).toHaveURL(/pagina=9/);
    await page.reload();
    await expect(page.locator('.product-card h2').first()).toHaveText('Articolo 192');
    await page.locator('#catalog-page-previous').click();
    await expect(page.locator('.product-card h2').first()).toHaveText('Articolo 168');
    await page.locator('#catalog-search').fill('raro cotone');
    await expect(page.locator('#catalog-count')).toContainText('1 proposta', { timeout: 30000 });
    await expect(page.locator('.product-card h2')).toHaveText('Articolo 251');
    await page.locator('#catalog-reset').click();
    await page.locator('#catalog-sort').selectOption('price-asc');
    await expect(page.locator('.product-card h2').first()).toHaveText('Articolo 261');
    await page.locator('#catalog-sort').selectOption('price-desc');
    await expect(page.locator('.product-card h2').first()).toHaveText('Articolo 000');
    await page.getByRole('button', { name: 'Primo reparto', exact: true }).click();
    await expect(page.locator('.product-card h2').first()).toHaveText('Articolo 001');
    await expect(page.locator('.product-card')).toHaveCount(24);
    await page.goto('/catalogo.html?categoria=primo&pagina=3');
    await expect(page.locator('#catalog-page-status')).toHaveText('Pagina 3');
    await expect(page.locator('.product-card h2').first()).toHaveText('Articolo 097');
    await page.evaluate(() => { history.pushState(null, '', '/catalogo.html?categoria=secondo&pagina=4'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.locator('#catalog-page-status')).toHaveText('Pagina 4');
    await expect(page.locator('.product-card h2').first()).toHaveText('Articolo 144');
    expect(errors).toEqual([]);
  } finally { await backend.close(); }
});

test('home preview is bounded, manager pages and counters remain complete, and ID reads hide drafts even for the owner', async ({ page }) => {
  test.setTimeout(120000);
  const backend = await isolatedCatalog(seed);
  try {
    await backend.route(page);
    await page.goto('/admin.html');
    await page.locator('#login-email').fill('alessandroferrara01@libero.it');
    await page.locator('#login-password').fill('test-password');
    await page.locator('#login-submit').click();
    await expect(page.locator('#new-product')).toBeEnabled();
    await expect(page.locator('#product-list > li')).toHaveCount(50);
    await expect(page.locator('#products-count')).toHaveText('266');
    await page.locator('#admin-page-next').click();
    await expect(page.locator('#admin-page-status')).toHaveText('Pagina 2');
    await page.locator('#product-search').fill('raro cotone');
    await expect(page.locator('#product-results')).toHaveText('1 prodotto caricato per “raro cotone”', { timeout: 30000 });
    await expect(page.locator('#product-list h3')).toHaveText('Articolo 251');
    const result = await page.evaluate(async () => {
      const api = await import('/src/firestore-catalog.js?actual');
      const preview = await api.loadPublicCatalogPreview({ pageSize: 6 });
      const products = await api.loadPublicProductsByIds({ ids: ['p251', 'draft', 'sample', 'private'] });
      return { count: preview.products.length, categories: preview.categories.map(category => category.id), buffered: preview.nextCursor.streams.reduce((sum, stream) => sum + stream.buffer.length, 0), ids: products.map(product => product.id) };
    });
    expect(result.count).toBe(6);
    expect(result.buffered).toBeLessThanOrEqual(8);
    expect(result.categories.sort()).toEqual(['one', 'two']);
    expect(result.ids).toEqual(['p251']);
  } finally { await backend.close(); }
});

test('manager page boundaries keep the server text order for accented names', async ({ page }) => {
  const records = { 'categories/one': seed['categories/one'] };
  for (let index = 0; index < 50; index++) records[`products/plain-${index}`] = { name: `Articolo ${String(index).padStart(3, '0')}`, categoryId: 'one', order: 0 };
  records['products/last-lowercase'] = { name: 'zero', categoryId: 'one', order: 0 };
  records['products/last-accented'] = { name: 'Àccento', categoryId: 'one', order: 0 };
  const backend = await isolatedCatalog(records);
  try {
    await backend.route(page);
    await page.goto('/admin.html');
    await page.locator('#login-email').fill('alessandroferrara01@libero.it');
    await page.locator('#login-password').fill('test-password');
    await page.locator('#login-submit').click();
    await expect(page.locator('#new-product')).toBeEnabled();
    await expect(page.locator('#product-list h3').first()).toHaveText('Articolo 000');
    await expect(page.locator('#product-list h3').last()).toHaveText('Articolo 049');
    await page.locator('#admin-page-next').click();
    await expect(page.locator('#product-list h3')).toHaveText(['zero', 'Àccento']);
  } finally { await backend.close(); }
});
