import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { isolatedCatalog } from './catalog-fixture.js';

async function signIn(page) {
  await page.goto('/accedi.html');
  await expect(page.locator('#customer-personalization')).toBeHidden();
  await page.locator('#login-email').fill('cliente@example.test');
  await page.locator('#login-password').fill('test-password');
  await page.locator('#login-submit').click();
  await expect(page.locator('#personalization-enabled')).toBeEnabled();
}

test('choice is opt-in, saved only by request, reversible and independent of profile', async ({ page }) => {
  const fixture = await isolatedCatalog({}, { email: 'cliente@example.test', email_verified: false });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await fixture.route(page);
    await signIn(page);
    await expect(page.locator('#personalization-enabled')).not.toBeChecked();
    expect(await fixture.inspect('customerPersonalization/test-owner')).toBeUndefined();
    await page.locator('#personalization-enabled').check();
    await page.locator('#personalization-save').click();
    await expect(page.locator('#personalization-status')).toContainText('Scelta salvata');
    expect((await fixture.inspect('customerPersonalization/test-owner')).enabled).toBe(true);
    expect(await fixture.inspect('customerProfiles/test-owner')).toBeUndefined();
    await page.goto('/index.html');
    await page.goto('/accedi.html');
    await expect(page.locator('#personalization-enabled')).toBeChecked();
    const axe = await new AxeBuilder({ page }).include('#customer-personalization').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations).toEqual([]);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      await page.locator('#customer-personalization').screenshot({ path: `output/qa/personalization-choice-${width}.png` });
    }
    await page.locator('#personalization-enabled').uncheck();
    await page.locator('#personalization-save').click();
    await expect(page.locator('#personalization-status')).toContainText('disattivata');
    expect((await fixture.inspect('customerPersonalization/test-owner')).enabled).toBe(false);
    await page.locator('#personalization-delete').click();
    await expect(page.locator('#personalization-status')).toContainText('Scelta cancellata');
    expect(await fixture.inspect('customerPersonalization/test-owner')).toBeUndefined();
    await page.locator('#account-logout').click();
    await expect(page.locator('#customer-personalization')).toBeHidden();
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});

test('an unreadable saved choice disables edits instead of overwriting it', async ({ page }) => {
  const fixture = await isolatedCatalog({
    'customerPersonalization/test-owner': { enabled: true, policyVersion: 'unknown-version', updatedAt: new Date() },
  }, { email: 'cliente@example.test', email_verified: false });
  try {
    await fixture.route(page);
    await page.goto('/accedi.html');
    await page.locator('#login-email').fill('cliente@example.test');
    await page.locator('#login-password').fill('test-password');
    await page.locator('#login-submit').click();
    await expect(page.locator('#personalization-status')).toContainText('Non è stato possibile verificare');
    await expect(page.locator('#personalization-enabled')).toBeDisabled();
    await expect(page.locator('#personalization-save')).toBeDisabled();
    await expect(page.locator('#personalization-retry')).toBeVisible();
    expect((await fixture.inspect('customerPersonalization/test-owner')).policyVersion).toBe('unknown-version');
  } finally { await fixture.close(); }
});
