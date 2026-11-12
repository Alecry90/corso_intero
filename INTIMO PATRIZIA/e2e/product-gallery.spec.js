import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { isolatedCatalog } from './catalog-fixture.js';

async function blankGallery(page) {
  await page.route('**/gallery-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="it"><head><title>Galleria prodotti</title></head><body><main><h1>Fotografie prodotto</h1><div id="gallery"></div></main></body></html>' }));
  await page.goto('/gallery-test');
}

test('gallery supports thumbnails, keyboard navigation, accessible enlargement and cleanup', async ({ page }) => {
  await blankGallery(page);
  await page.evaluate(async () => {
    const { mountProductGallery } = await import('/src/product-gallery.js');
    window.testGallery = mountProductGallery(document.getElementById('gallery'), [
      { slot: 0, src: '/assets/intimo.svg', alt: 'Vista frontale' },
      { slot: 1, src: '/assets/intimo-2.svg', alt: 'Vista posteriore' },
      { slot: 2, src: '/assets/intimo-3.svg', alt: 'Dettaglio tessuto' },
    ], { label: 'Articolo' });
    await window.testGallery.ready;
  });
  const main = page.locator('.product-gallery__photo');
  await expect(main).toHaveAttribute('alt', 'Vista frontale');
  await page.getByRole('button', { name: 'Mostra fotografia 2 di 3: Vista posteriore', exact: true }).click();
  await expect(main).toHaveAttribute('alt', 'Vista posteriore');
  await page.keyboard.press('ArrowRight');
  await expect(main).toHaveAttribute('alt', 'Dettaglio tessuto');
  await page.keyboard.press('Home');
  await expect(main).toHaveAttribute('alt', 'Vista frontale');
  const zoom = page.getByRole('button', { name: 'Ingrandisci la fotografia di Articolo', exact: true });
  await zoom.click();
  await expect(page.getByRole('dialog', { name: 'Articolo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chiudi ingrandimento' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog').getByRole('img')).toHaveAttribute('alt', 'Vista posteriore');
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(report.violations.map(item => item.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(zoom).toBeFocused();
  await page.evaluate(() => window.testGallery.destroy());
  await expect(page.locator('.product-gallery,.product-gallery__lightbox')).toHaveCount(0);
});

test('gallery rejects remote or executable image sources and handles empty galleries', async ({ page }) => {
  await blankGallery(page);
  await page.evaluate(async () => {
    const { mountProductGallery } = await import('/src/product-gallery.js');
    const widget = mountProductGallery(document.getElementById('gallery'), [
      { src: 'javascript:alert(1)', alt: 'Non valida' },
      { src: 'https://example.test/tracking.jpg', alt: 'Remota' },
      { src: '/assets/../intimo.svg', alt: 'Percorso non valido' },
      { src: '/assets/intimo.svg', alt: '' },
    ]);
    await widget.ready;
  });
  await expect(page.getByRole('status')).toHaveText('Fotografia non disponibile.');
  await expect(page.locator('#gallery img')).toHaveCount(0);
});

test('real browser normalizes and saves three photos atomically, then releases all gallery object URLs', async ({ page }) => {
  const fixture = await isolatedCatalog({ 'categories/a': { name: 'Reparto', slug: 'a', order: 0, published: true } });
  try {
    await fixture.route(page);
    await page.goto('/admin.html');
    await page.locator('#login-email').fill('alessandroferrara01@libero.it');
    await page.locator('#login-password').fill('local-test-only');
    await page.locator('#login-submit').click();
    await expect(page.locator('#admin-dashboard')).toBeVisible();
    const product = await page.evaluate(async () => {
      const { initializeFirebaseAuth } = await import('/src/firebase-auth.js');
      const auth = await initializeFirebaseAuth();
      await auth.signIn('alessandroferrara01@libero.it', 'local-test-only');
      const { catalogRequest, getCatalogSession } = await import('/src/firestore-catalog.js');
      await getCatalogSession();
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 80;
      const drawing = canvas.getContext('2d'); drawing.fillStyle = '#a27560'; drawing.fillRect(0, 0, 64, 80);
      const imageData = canvas.toDataURL('image/png');
      try {
        return (await catalogRequest('products', 'POST', { name: 'Fotografie locali', categoryId: 'a', sku: 'LOCAL-1', imageData, imageAlt: 'Fronte', galleryUploads: [
          { slot: 1, imageData, alt: 'Retro' }, { slot: 2, imageData, alt: 'Tessuto' },
        ] })).product;
      } catch (error) { throw new Error(JSON.stringify({ code: error.code, status: error.status, message: error.message })); }
    });
    expect(product.gallerySlots).toEqual([1, 2]);
    for (const path of [`productImages/${product.id}`, `productGalleryImages/${product.id}__1`, `productGalleryImages/${product.id}__2`]) {
      const image = await fixture.inspect(path);
      expect(image.mime).toBe('image/webp'); expect(image.width).toBe(64); expect(image.height).toBe(80); expect(image.bytes).toBeLessThanOrEqual(307200);
    }
    await page.evaluate(async product => {
      const created = [], revoked = [];
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = blob => { const url = create(blob); created.push(url); return url; };
      URL.revokeObjectURL = url => { revoked.push(url); revoke(url); };
      window.galleryURLs = { created, revoked };
      const container = document.createElement('div'); container.id = 'gallery'; document.querySelector('main').append(container);
      const { mountProductGallery } = await import('/src/product-gallery.js');
      window.testGallery = mountProductGallery(document.getElementById('gallery'), product, { admin: true });
      await window.testGallery.ready;
    }, product);
    await expect(page.locator('.product-gallery__thumb')).toHaveCount(3);
    await expect(page.locator('.product-gallery__photo')).toHaveAttribute('alt', 'Fronte');
    expect(await page.evaluate(() => window.galleryURLs.created.length)).toBe(3);
    await page.evaluate(() => window.testGallery.destroy());
    expect(await page.evaluate(() => window.galleryURLs.created.every(url => window.galleryURLs.revoked.includes(url)))).toBe(true);
  } finally { await fixture.close(); }
});
