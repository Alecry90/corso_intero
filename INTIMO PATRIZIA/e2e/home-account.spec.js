import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { isolatedCatalog } from './catalog-fixture.js';

const identity = { email: 'cliente@example.test', email_verified: false };
const profile = {
  displayName: 'Ada <b>',
  interests: ['intimo'],
  favoriteProductIds: ['favorite-pigiama'],
  updatedAt: new Date('2026-10-20T12:00:00Z'),
};
const seed = {
  'categories/intimo-donna': { name: 'Intimo donna', slug: 'intimo-donna', published: true, order: 0 },
  'categories/pigiami-donna': { name: 'Pigiami donna', slug: 'pigiami-donna', published: true, order: 1 },
  'categories/profumi': { name: 'Profumi', slug: 'profumi', published: true, order: 2 },
  'categories/nascosta': { name: 'Categoria nascosta', slug: 'nascosta', published: false, order: 3 },
  'products/favorite-pigiama': { name: 'Pigiama preferito', categoryId: 'pigiami-donna', order: 90 },
  'products/interesse-canotta': { name: 'Canotta di cotone', categoryId: 'intimo-donna', order: 0 },
  'products/affine-vestaglia': { name: 'Vestaglia morbida', categoryId: 'pigiami-donna', order: 1 },
  'products/estraneo-profumo': { name: 'Profumo', categoryId: 'profumi', order: 2 },
  'products/demo': { name: 'Esempio intimo', categoryId: 'intimo-donna', isDemo: true, order: -4 },
  'products/privato': { name: 'Prodotto non pubblicato', categoryId: 'intimo-donna', published: false, order: -3 },
  'products/esaurito': { name: 'Prodotto non disponibile', categoryId: 'intimo-donna', available: false, order: -2 },
  'products/categoria-privata': { name: 'Prodotto di categoria nascosta', categoryId: 'nascosta', order: -1 },
  'customerProfiles/test-owner': profile,
};

async function signIn(page) {
  await page.goto('/accedi.html');
  await page.locator('#login-email').fill(identity.email);
  await page.locator('#login-password').fill('test-password');
  await page.locator('#login-submit').click();
  await expect(page.locator('#customer-name')).toBeEnabled();
  await expect(page.locator('.header-visit')).toContainText(profile.displayName);
}

test('home replaces login with an ordered personal selection and handles logout and an empty catalog', async ({ page, browser, baseURL }) => {
  test.setTimeout(90000);
  const fixture = await isolatedCatalog(seed, identity);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let emptyFixture;
  let emptyContext;
  try {
    await fixture.route(page);
    await page.goto('/index.html');
    await expect(page.locator('#home-account-invitation')).toBeVisible();
    await expect(page.locator('#home-recommendations')).toBeHidden();
    await expect(page.locator('#home-account-invitation a[href="/accedi.html"]')).toBeVisible();

    await signIn(page);
    await page.goto('/index.html');
    await expect(page.locator('#home-recommendations')).toBeVisible();
    await expect(page.locator('#home-account-invitation')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Accedi', exact: true })).toHaveCount(0);
    await expect(page.locator('.header-visit')).toContainText(profile.displayName);
    await expect(page.locator('#home-recommendations-greeting')).toContainText('Ada <b>');
    await expect(page.locator('#home-recommendations-greeting b')).toHaveCount(0);
    const items = page.locator('#home-recommendations-list li[data-product-id]');
    await expect(items).toHaveCount(3);
    expect(await items.evaluateAll(nodes => nodes.map(node => node.dataset.productId))).toEqual([
      'favorite-pigiama', 'interesse-canotta', 'affine-vestaglia',
    ]);
    await expect(items.first().locator('a.home-recommendation-card')).toHaveAttribute('href', /catalogo\.html\?categoria=pigiami-donna&cerca=/);
    for (const [width, device] of [[1440, 'desktop'], [768, 'tablet'], [390, 'mobile']]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(items.first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      await page.locator('#home-recommendations').screenshot({ path: `output/qa/home-personal-${device}.png` });
    }
    const axe = await new AxeBuilder({ page }).include('#home-recommendations').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations).toEqual([]);
    const saved = await fixture.inspect('customerProfiles/test-owner');
    expect(saved.interests).toEqual(profile.interests);
    expect(saved.favoriteProductIds).toEqual(profile.favoriteProductIds);
    expect(Object.keys(saved).sort()).toEqual(Object.keys(profile).sort());

    await page.goto('/accedi.html');
    await page.locator('#account-logout').click();
    await expect(page.locator('#account-access')).toBeVisible();
    await page.goto('/index.html');
    await expect(page.locator('#home-account-invitation')).toBeVisible();
    await expect(page.locator('#home-recommendations')).toBeHidden();
    await expect(page.locator('#home-recommendations-list li[data-product-id]')).toHaveCount(0);
    expect(errors).toEqual([]);

    // A separate authenticated session exercises the real currently-empty store,
    // without replacing the catalog adapter or manufacturing demo products.
    emptyFixture = await isolatedCatalog({ 'customerProfiles/test-owner': { ...profile, favoriteProductIds: [] } }, identity);
    emptyContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const emptyPage = await emptyContext.newPage();
    emptyPage.on('pageerror', error => errors.push(error.message));
    await emptyFixture.route(emptyPage);
    await signIn(emptyPage);
    await emptyPage.goto('/index.html');
    await expect(emptyPage.locator('#home-recommendations')).toBeVisible();
    await expect(emptyPage.locator('#home-account-invitation')).toBeHidden();
    await expect(emptyPage.locator('#home-recommendations-status')).toContainText('Il catalogo si sta preparando');
    await expect(emptyPage.locator('#home-recommendations-list li[data-product-id]')).toHaveCount(0);
    await expect(emptyPage.locator('#home-recommendation-interests a[href*="reparto=intimo"]')).toBeVisible();
    expect(await emptyPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await emptyContext?.close();
    await emptyFixture?.close();
    await fixture.close();
  }
});
