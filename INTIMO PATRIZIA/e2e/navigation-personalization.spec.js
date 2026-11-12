import { test, expect } from '@playwright/test';
import { isolatedCatalog } from './catalog-fixture.js';

const identity = { email: 'cliente@example.test', email_verified: false };
const storageKey = 'intimo-navigation-v1:test-owner';
const seed = {
  'categories/intimo-donna': { name: 'Intimo donna', slug: 'intimo-donna', published: true, order: 0 },
  'categories/pigiami-donna': { name: 'Pigiami donna', slug: 'pigiami-donna', published: true, order: 1 },
  'categories/profumi': { name: 'Profumi', slug: 'profumi', published: true, order: 2 },
  'categories/biancheria-letto': { name: 'Biancheria letto', slug: 'biancheria-letto', published: true, order: 3 },
  'products/canotta': { name: 'Canotta cotone', categoryId: 'intimo-donna', order: 0 },
  'products/vestaglia': { name: 'Vestaglia riservata', categoryId: 'pigiami-donna', order: 1 },
  'products/profumo': { name: 'Profumo fresco', categoryId: 'profumi', order: 2 },
  'products/lenzuola': { name: 'Lenzuola di cotone', categoryId: 'biancheria-letto', order: 3 },
  'products/profumo-consultato': { name: 'Fragranza consultata', categoryId: 'profumi', order: 4 },
};

async function signIn(page) {
  await page.goto('/accedi.html');
  await page.locator('#login-email').fill(identity.email);
  await page.locator('#login-password').fill('test-password');
  await page.locator('#login-submit').click();
  await expect(page.locator('#personalization-enabled')).toBeEnabled();
}

async function signals(page) {
  return page.evaluate(async () => {
    const { initializeFirebaseAuth } = await import('/src/firebase-auth.js');
    const { getNavigationSignals } = await import('/src/navigation-personalization.js');
    return getNavigationSignals((await initializeFirebaseAuth()).currentUser());
  });
}

async function storedSignals(page) {
  return page.evaluate(key => sessionStorage.getItem(key), storageKey);
}

async function viewProduct(page, id) {
  await page.locator(`[data-product-id="${id}"] .product-open`).click();
  await expect(page.locator('#product-dialog')).toBeVisible();
  await page.locator('#product-close').click();
}

test('navigation is ignored until opt-in, then only session signals personalize the home', async ({ page }) => {
  test.setTimeout(60000);
  const fixture = await isolatedCatalog(seed, identity);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await fixture.route(page);
    await page.goto('/catalogo.html');
    await expect(page.locator('.product-card')).toHaveCount(5);
    await viewProduct(page, 'profumo-consultato');
    await page.locator('#catalog-search').fill('Vestaglia riservata');
    await expect(page.locator('.product-card')).toHaveCount(1);
    // Let the search debounce settle before asserting that recording stayed off.
    await page.waitForTimeout(1000);
    expect(await storedSignals(page)).toBeNull();
    expect(await fixture.inspect('customerPersonalization/test-owner')).toBeUndefined();

    await signIn(page);
    await expect(page.locator('#personalization-enabled')).not.toBeChecked();
    await page.goto('/catalogo.html');
    await expect(page.locator('.product-card')).toHaveCount(5);
    await viewProduct(page, 'profumo-consultato');
    await page.locator('#catalog-search').fill('Vestaglia riservata');
    await expect(page.locator('.product-card')).toHaveCount(1);
    await page.waitForTimeout(1000);
    expect(await storedSignals(page)).toBeNull();
    expect(await fixture.inspect('customerPersonalization/test-owner')).toBeUndefined();

    await page.goto('/accedi.html');
    await expect(page.locator('#personalization-enabled')).toBeEnabled();
    await page.locator('#personalization-enabled').check();
    await page.locator('#personalization-save').click();
    await expect(page.locator('#personalization-status')).toContainText('Scelta salvata');
    const choice = await fixture.inspect('customerPersonalization/test-owner');
    expect(Object.keys(choice).sort()).toEqual(['enabled', 'policyVersion', 'updatedAt']);
    expect(choice.enabled).toBe(true);
    expect(choice.policyVersion).toBe('2026-10-20-session-v1');

    await page.goto('/index.html');
    await page.locator('#home-search').fill('Vestaglia riservata');
    await page.locator('.home-catalog-search button[type="submit"]').click();
    await expect(page.locator('#catalog-search')).toHaveValue('Vestaglia riservata');
    await expect(page.locator('.product-card')).toHaveCount(1);
    await expect.poll(async () => (await signals(page)).groupScores['pigiami-e-relax'] || 0).toBeGreaterThan(0);

    await page.goto('/catalogo.html');
    await expect.poll(async () => (await signals(page)).enabled).toBe(true);
    await viewProduct(page, 'profumo-consultato');
    const previousSearchScore = (await signals(page)).groupScores['pigiami-e-relax'] || 0;
    await page.locator('#catalog-search').fill('Vestaglia riservata');
    await expect.poll(async () => (await signals(page)).groupScores['pigiami-e-relax'] || 0).toBeGreaterThan(previousSearchScore);
    const navigation = await signals(page);
    expect(navigation.recentProductIds).toContain('profumo-consultato');
    expect(navigation.groupScores.profumi).toBeGreaterThan(0);
    const saved = await storedSignals(page);
    expect(saved).not.toBeNull();
    for (const privateValue of ['Vestaglia riservata', 'Fragranza consultata', identity.email, 'updatedAt', 'timestamp', 'query']) {
      expect(saved).not.toContain(privateValue);
    }
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('intimo-navigation')))).toEqual([]);
    expect(await fixture.inspect('customerProfiles/test-owner')).toBeUndefined();

    await page.reload();
    await expect.poll(async () => (await signals(page)).enabled).toBe(true);
    expect((await signals(page)).recentProductIds).toContain('profumo-consultato');
    await page.goto('/index.html');
    await expect(page.locator('#home-recommendations')).toBeVisible();
    await expect(page.locator('#home-recommendations-list [data-product-id="profumo-consultato"]')).toBeVisible();
    await expect(page.locator('#home-recommendations-status')).toContainText(/sessione|consultat|ricerc/);
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});

test('revocation on return, deletion and logout clear session signals and close the recording gate', async ({ page }) => {
  test.setTimeout(60000);
  const fixture = await isolatedCatalog({
    ...seed,
    'customerPersonalization/test-owner': { enabled: true, policyVersion: '2026-10-20-session-v1', updatedAt: new Date() },
  }, identity);
  try {
    await fixture.route(page);
    await signIn(page);
    await page.goto('/catalogo.html');
    await expect.poll(async () => (await signals(page)).enabled).toBe(true);
    await viewProduct(page, 'profumo-consultato');
    await expect.poll(() => storedSignals(page)).not.toBeNull();

    // A server mutation without the page's change event models another tab.
    await page.evaluate(async () => {
      const { getFirestoreContext } = await import('/src/firestore-catalog.js');
      const { db, sdk } = await getFirestoreContext();
      await sdk.setDoc(sdk.doc(db, 'customerPersonalization', 'test-owner'), {
        enabled: false, policyVersion: '2026-10-20-session-v1', updatedAt: sdk.serverTimestamp(),
      });
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });
    await expect.poll(async () => (await signals(page)).enabled).toBe(false);
    expect(await storedSignals(page)).toBeNull();
    await viewProduct(page, 'profumo-consultato');
    expect(await storedSignals(page)).toBeNull();

    await page.goto('/accedi.html');
    await expect(page.locator('#personalization-enabled')).toBeEnabled();
    await expect(page.locator('#personalization-enabled')).not.toBeChecked();
    await page.locator('#personalization-enabled').check();
    await page.locator('#personalization-save').click();
    await expect(page.locator('#personalization-status')).toContainText('Scelta salvata');
    await expect.poll(async () => (await signals(page)).enabled).toBe(true);
    // Saving must update the gate in this document, without a page reload.
    await page.evaluate(async () => {
      const { recordProductView } = await import('/src/navigation-personalization.js');
      await recordProductView({ id: 'profumo-consultato', categoryId: 'profumi', published: true }, [{ id: 'profumi', published: true }]);
    });
    await expect.poll(() => storedSignals(page)).not.toBeNull();
    await page.locator('#personalization-enabled').uncheck();
    await page.locator('#personalization-save').click();
    await expect(page.locator('#personalization-status')).toContainText('disattivata');
    expect(await storedSignals(page)).toBeNull();
    expect((await signals(page)).enabled).toBe(false);
    expect((await fixture.inspect('customerPersonalization/test-owner')).enabled).toBe(false);

    await page.locator('#personalization-enabled').check();
    await page.locator('#personalization-save').click();
    await expect(page.locator('#personalization-status')).toContainText('Scelta salvata');
    await expect.poll(async () => (await signals(page)).enabled).toBe(true);
    await page.evaluate(async () => {
      const { recordProductView } = await import('/src/navigation-personalization.js');
      await recordProductView({ id: 'profumo-consultato', categoryId: 'profumi', published: true }, [{ id: 'profumi', published: true }]);
    });
    await expect.poll(() => storedSignals(page)).not.toBeNull();
    await page.locator('#personalization-delete').click();
    await expect(page.locator('#personalization-status')).toContainText('Scelta cancellata');
    expect(await storedSignals(page)).toBeNull();
    expect((await signals(page)).enabled).toBe(false);
    expect(await fixture.inspect('customerPersonalization/test-owner')).toBeUndefined();

    await page.locator('#personalization-enabled').check();
    await page.locator('#personalization-save').click();
    await expect(page.locator('#personalization-status')).toContainText('Scelta salvata');
    await expect.poll(async () => (await signals(page)).enabled).toBe(true);
    await page.evaluate(async () => {
      const { recordProductView } = await import('/src/navigation-personalization.js');
      await recordProductView({ id: 'canotta', categoryId: 'intimo-donna', published: true }, [{ id: 'intimo-donna', published: true }]);
    });
    await expect.poll(() => storedSignals(page)).not.toBeNull();
    await page.locator('#account-logout').click();
    await expect(page.locator('#account-access')).toBeVisible();
    expect(await storedSignals(page)).toBeNull();
    expect((await signals(page)).enabled).toBe(false);
  } finally { await fixture.close(); }
});
