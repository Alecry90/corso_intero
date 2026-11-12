import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { isolatedCatalog } from './catalog-fixture.js';

const seed = {
  'categories/intimo-donna': { name: 'Intimo donna', slug: 'intimo-donna', published: true, order: 0 },
  'products/cotone': { name: 'Canotta cotone', categoryId: 'intimo-donna' },
  'products/slip': { name: 'Slip cotone', categoryId: 'intimo-donna' },
};

test('optional login saves private preferences and favorites, restores them and deletes only the profile', async ({ page }) => {
  test.setTimeout(60000);
  const fixture = await isolatedCatalog(seed, { email: 'cliente@example.test', email_verified: false });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await fixture.route(page);
    await page.goto('/catalogo.html');
    await expect(page.locator('.product-card')).toHaveCount(2);
    await page.locator('.product-favorite').first().click();
    await expect(page.locator('#catalog-account-link')).toHaveAttribute('href', /accedi\.html/);
    expect(await fixture.inspect('customerProfiles/test-owner')).toBeUndefined();
    await page.goto('/accedi.html?ritorno=%2Fcatalogo.html%3Freparto%3Dintimo');
    await page.locator('#login-email').fill('cliente@example.test');
    await page.locator('#login-password').fill('test-password');
    await page.locator('#login-submit').click();
    await expect(page.locator('#customer-name')).toBeEnabled();
    await expect(page.locator('.header-visit')).toContainText('Il tuo account');
    await expect(page.locator('#manage-catalog')).toBeHidden();
    await expect(page.locator('#account-continue')).toHaveAttribute('href', '/catalogo.html?reparto=intimo');
    expect(await fixture.inspect('customerProfiles/test-owner')).toBeUndefined();
    await page.locator('#customer-name').fill('Ada <b>');
    await page.locator('input[name="customer-interest"][value="intimo"]').check();
    await page.locator('#customer-preferences-save').click();
    await expect(page.locator('#customer-interest-links a')).toHaveCount(1);
    await expect(page.locator('#customer-greeting')).toContainText('Ada <b>');
    await expect(page.locator('#customer-greeting b')).toHaveCount(0);
    await expect(page.locator('.header-visit')).toContainText('Ada <b>');
    await expect(page.locator('.header-visit b')).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.site-header').screenshot({ path: 'output/qa/header-nickname-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.header-visit')).toBeVisible();
    await page.locator('.site-header').screenshot({ path: 'output/qa/header-nickname-mobile.png' });
    await page.locator('.menu-toggle').click();
    await expect(page.locator('.mobile-account-link')).toBeVisible();
    await expect(page.locator('.mobile-account-link')).toContainText('Ada <b>');
    await expect(page.locator('.mobile-account-link b')).toHaveCount(0);
    await page.locator('[data-menu-close]').click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    const profile = await fixture.inspect('customerProfiles/test-owner');
    expect(profile.interests).toEqual(['intimo']);
    expect(profile.email).toBeUndefined();
    await expect(page.locator('#customer-preferences-save')).toBeEnabled();
    const axe = await new AxeBuilder({ page }).include('#account-signed-in').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations).toEqual([]);
    await page.goto('/catalogo.html?reparto=intimo');
    await expect(page.locator('.header-visit')).toContainText('Ada <b>');
    const heart = page.locator('[data-product-id="cotone"] .product-favorite');
    await expect(heart).toHaveAttribute('aria-disabled', 'false');
    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.locator('[data-product-id="cotone"] .product-favorite')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#catalog-favorites-filter').click();
    await expect(page.locator('.product-card')).toHaveCount(1);
    await expect(page).toHaveURL(/preferiti=1/);
    // Change the server profile independently of the current catalogue UI,
    // then return focus as when switching back from another tab.
    await page.evaluate(async () => {
      const { initializeFirebaseAuth } = await import('/src/firebase-auth.js');
      const { toggleCustomerFavorite } = await import('/src/customer-profile.js');
      await toggleCustomerFavorite((await initializeFirebaseAuth()).currentUser(), 'cotone');
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });
    await expect(page.locator('.product-card')).toHaveCount(0);
    await expect(page).toHaveURL(/preferiti=1/);
    await page.goto('/accedi.html?ritorno=https%3A%2F%2Fexample.org%2F');
    await expect(page.locator('#customer-name')).toHaveValue('Ada <b>');
    await expect(page.locator('#account-continue')).toHaveAttribute('href', '/catalogo.html');
    await expect(page.locator('#customer-favorites-link')).toContainText('0');
    const longName = 'AlessandroFerrara'.repeat(4).slice(0, 60);
    await page.locator('#customer-name').fill(longName);
    await page.locator('#customer-preferences-save').click();
    await expect(page.locator('.header-visit')).toContainText(longName);
    await expect(page.locator('.mobile-account-link')).toContainText(longName);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('.header-visit')).toBeVisible();
      const brand = await page.locator('.brand').boundingBox();
      const account = await page.locator('.header-visit').boundingBox();
      expect(account.x).toBeGreaterThanOrEqual(brand.x + brand.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    }
    await page.locator('#customer-preferences-delete').click();
    await page.locator('#customer-delete-confirm').click();
    await expect(page.locator('#customer-name')).toHaveValue('');
    await expect(page.locator('.header-visit [data-account-label]')).toHaveText('Il tuo account');
    await expect(page.locator('.mobile-account-link [data-account-label]')).toHaveText('Il tuo account');
    expect(await fixture.inspect('customerProfiles/test-owner')).toBeUndefined();
    await expect(page.locator('#account-signed-in')).toBeVisible();
    await page.locator('#account-logout').click();
    await expect(page.locator('#customer-preferences-form')).toBeHidden();
    await expect(page.locator('.header-visit')).toContainText('Accedi');
    await expect(page.locator('.mobile-account-link')).toContainText('Accedi');
    await page.goto('/catalogo.html?preferiti=1');
    await expect(page.locator('#catalog-account-link')).toHaveAttribute('href', /accedi\.html/);
    await expect(page.locator('.product-favorite[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator('#catalog-error')).toBeHidden();
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});

test('sign-in remains visible and public pages fit phone, tablet and desktop', async ({ page }) => {
  for (const width of [320, 390, 768, 1000, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/index.html');
    await expect(page.locator('.header-visit')).toBeVisible();
    const brand = await page.locator('.brand').boundingBox();
    const login = await page.locator('.header-visit').boundingBox();
    expect(login.x).toBeGreaterThanOrEqual(brand.x + brand.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  }
});
