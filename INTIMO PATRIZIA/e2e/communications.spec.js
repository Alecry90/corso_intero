import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isolatedCatalog } from './catalog-fixture.js';

const output = new URL('../output/qa/', import.meta.url);
mkdirSync(output, { recursive: true });

async function signIn(page, email) {
  await page.goto('/admin.html');
  await expect(page.locator('#admin-access')).toBeVisible();
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill('test-password');
  await page.locator('#login-submit').click();
}

async function downloadContent(page, id) {
  const pending = page.waitForEvent('download');
  await page.locator(id).click();
  const download = await pending;
  return { filename: download.suggestedFilename(), content: readFileSync(await download.path(), 'utf8') };
}

test('owner composes all three safe Brevo models, retains catalog CRUD and fits phone and desktop', async ({ page }) => {
  test.setTimeout(60000);
  const api = await isolatedCatalog();
  const errors = [];
  const downloads = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('download', download => downloads.push(download));
  try {
    await api.route(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(page, 'alessandroferrara01@libero.it');
    await expect(page.locator('#new-category')).toBeEnabled();
    await expect(page.locator('#admin-communications')).toBeVisible();
    await expect(page.locator('#communication-test-sender')).toHaveText('alessandroferrara01@libero.it');
    await expect(page.locator('#communications-fields')).not.toHaveAttribute('disabled', '');
    await expect(page.locator('#communication-download-html')).toBeDisabled();
    await expect(page.locator('#communication-preview')).toHaveAttribute('sandbox', '');
    await expect(page.locator('#communication-preview')).toHaveAttribute('referrerpolicy', 'no-referrer');

    const attack = '<script>parent.__composerInjected=1</script> <img src=x onerror="parent.__composerInjected=2"> {{ params.EVIL }} {% if true %}';
    const sampleName = '<svg onload="parent.__composerInjected=3">';
    await page.locator('#communication-body').fill(attack);
    await page.locator('#communication-recipient-name').fill(sampleName);
    await page.locator('#communication-cta-label').fill('Guarda il catalogo');
    await page.locator('#communication-cta-url').fill('/catalogo.html?categoria=intimo&ordine=nome');

    for (const type of ['promotion', 'event', 'message']) {
      const title = `../../Novità ${type} <img src=x onerror="parent.__composerInjected=4">`;
      await page.locator('#communication-type').selectOption(type);
      await page.locator('#communication-title').fill(title);
      await expect(page.locator('#communication-promotion-fields')).toBeVisible({ visible: type === 'promotion' });
      await expect(page.locator('#communication-event-fields')).toBeVisible({ visible: type === 'event' });
      await expect(page.locator('#communication-promotion-details')).toBeEnabled({ enabled: type === 'promotion' });
      await expect(page.locator('#communication-event-date')).toBeEnabled({ enabled: type === 'event' });
      if (type === 'promotion') {
        await page.locator('#communication-promotion-details').fill('Dettagli di prova, da confermare.');
        await page.locator('#communication-promotion-conditions').fill('Condizioni di prova, da confermare.');
      }
      if (type === 'event') {
        await page.locator('#communication-event-date').fill('Data di prova da confermare');
        await page.locator('#communication-event-location').fill('Luogo di prova da confermare');
      }
      await expect(page.locator('#communication-download-html')).toBeEnabled();
      await expect(page.locator('#communication-preview-subject')).toHaveText(title);
      const preview = page.frameLocator('#communication-preview');
      await expect(preview.locator('h1')).toHaveText(title);
      await expect(preview.locator('body')).toContainText(attack);
      await expect(preview.locator('body')).toContainText(`Ciao ${sampleName},`);
      await expect(preview.locator('script, img, svg, iframe, a[href]')).toHaveCount(0);
      await expect(preview.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /script-src 'none'/);
      expect(await page.evaluate(() => window.__composerInjected)).toBeUndefined();

      const html = await downloadContent(page, '#communication-download-html');
      expect(html.filename).toBe(`intimo-patrizia-${type}.html`);
      expect(html.content).toContain('{% if contact.NOME %}Ciao {{ contact.NOME }}{% else %}Ciao{% endif %}');
      expect(html.content).toContain('href="{{ unsubscribe }}"');
      expect(html.content).toContain('href="https://intimopatrizia-bari.web.app/catalogo.html?categoria=intimo&amp;ordine=nome"');
      expect(html.content).toContain('&#123;&#123; params.EVIL &#125;&#125;');
      expect(html.content).not.toMatch(/<(?:script|img|svg)\b|\{\{ params\.EVIL \}\}/u);
      expect(html.content).not.toContain(sampleName);
      expect(html.content.includes('Dettagli di prova, da confermare.')).toBe(type === 'promotion');
      expect(html.content.includes('Data di prova da confermare')).toBe(type === 'event');
      const text = await downloadContent(page, '#communication-download-text');
      expect(text.filename).toBe(`intimo-patrizia-${type}.txt`);
      expect(text.content).toContain(`Oggetto: ${title}\n\n`);
      expect(text.content).toContain('Disiscriviti: {{ unsubscribe }}');
      expect(text.content).toContain('Ciao {{ contact.NOME }}');
      expect(text.content).not.toContain('{{ params.EVIL }}');
    }

    const downloaded = downloads.length;
    for (const invalid of ['javascript:alert(1)', 'https://example.test/', '//example.test/']) {
      await page.locator('#communication-cta-url').fill(invalid);
      await expect(page.locator('#communication-download-html')).toBeDisabled();
      await expect(page.locator('#communication-download-text')).toBeDisabled();
      await expect(page.locator('#communications-validation')).toContainText('Link del pulsante:');
      // The handler also revalidates when a synthetic event bypasses a disabled control.
      await page.locator('#communication-download-html').dispatchEvent('click');
      expect(downloads).toHaveLength(downloaded);
    }

    // An invalid communications draft must not prevent normal catalog operations.
    await page.locator('#show-categories').click();
    await page.locator('#new-category').click();
    await page.locator('#category-name').fill('Categoria comunicazioni QA');
    await page.locator('#category-save').click();
    await expect(page.locator('.admin-category-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Modifica categoria Categoria comunicazioni QA', exact: true }).click();
    await page.locator('#category-name').fill('Categoria QA aggiornata');
    await page.locator('#category-save').click();
    await expect(page.locator('.admin-category-row')).toContainText('Categoria QA aggiornata');
    await page.locator('#show-products').click();
    await page.locator('#new-product').click();
    await page.locator('#product-name').fill('Prodotto comunicazioni QA');
    await page.locator('#product-save').click();
    await expect(page.locator('.admin-product-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Modifica prodotto Prodotto comunicazioni QA', exact: true }).click();
    await page.locator('#product-name').fill('Prodotto QA aggiornato');
    await page.locator('#product-save').click();
    await expect(page.locator('.admin-product-info h3')).toHaveText('Prodotto QA aggiornato');
    await page.getByRole('button', { name: 'Elimina prodotto Prodotto QA aggiornato', exact: true }).click();
    await page.locator('#delete-confirm').click();
    await expect(page.locator('.admin-product-row')).toHaveCount(0);
    await page.locator('#show-categories').click();
    await page.getByRole('button', { name: 'Elimina categoria Categoria QA aggiornata', exact: true }).click();
    await page.locator('#delete-confirm').click();
    await expect(page.locator('.admin-category-row')).toHaveCount(0);
    expect(await api.list('products')).toHaveLength(0);
    expect(await api.list('categories')).toHaveLength(0);

    await page.locator('#communication-title').fill('Comunicazione di prova');
    await page.locator('#communication-body').fill('Contenuti di esempio per verificare il modello.');
    await page.locator('#communication-recipient-name').fill('Nome di prova');
    await page.locator('#communication-cta-url').fill('/catalogo.html');
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(async () => { await document.fonts.ready; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `admin at ${width}px`).toBe(true);
      const preview = page.frameLocator('#communication-preview');
      expect(await preview.locator('html').evaluate(node => node.scrollWidth <= innerWidth + 1), `preview at ${width}px`).toBe(true);
      await page.locator('#admin-communications').screenshot({ path: fileURLToPath(new URL(`communications-${width}.png`, output)) });
    }
    // Each edit navigates the sandboxed srcdoc frame. Wait for the current
    // preview before scrolling back to the account controls.
    await expect(page.frameLocator('#communication-preview').locator('body')).toContainText('Contenuti di esempio per verificare il modello.');
    await page.locator('#logout').focus();
    await page.locator('#logout').press('Enter');
    await expect(page.locator('#admin-communications')).toBeHidden();
    await expect(page.locator('#communications-fields')).toHaveAttribute('disabled', '');
    await expect(page.locator('#communication-title')).toHaveValue('');
    await expect(page.locator('#communication-test-sender')).toHaveText('Account del gestore');
    await expect(page.locator('#communication-preview')).not.toHaveAttribute('srcdoc');
    expect(errors).toEqual([]);
  } finally {
    await page.close();
    await api.close();
  }
});

test('anonymous and verified visitor sessions cannot see or enable the owner composer', async ({ page }) => {
  const api = await isolatedCatalog({}, { email: 'visitor@example.test', email_verified: true, admin: true });
  try {
    const metrics = await api.route(page);
    await page.goto('/admin.html');
    await expect(page.locator('#admin-access')).toBeVisible();
    expect(await page.content()).not.toContain('alessandroferrara01@libero.it');
    await expect(page.locator('#admin-communications')).toBeHidden();
    await expect(page.locator('#admin-communications')).toHaveAttribute('inert', '');
    await expect(page.locator('#communications-fields')).toHaveAttribute('disabled', '');
    await expect(page.locator('#communication-download-html')).toBeDisabled();
    await page.locator('#login-email').fill('visitor@example.test');
    await page.locator('#login-password').fill('test-password');
    await page.locator('#login-submit').click();
    await expect(page.locator('#admin-account')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__catalogTestPending || 0)).toBe(0);
    await expect(page.locator('#admin-communications')).toBeHidden();
    await expect(page.locator('#admin-communications')).toHaveAttribute('inert', '');
    await expect(page.locator('#communications-fields')).toHaveAttribute('disabled', '');
    await expect(page.locator('#communication-title')).toBeDisabled();
    await expect(page.locator('#communication-download-html')).toBeDisabled();
    await expect(page.locator('#communication-download-text')).toBeDisabled();
    await expect(page.locator('#communication-open-brevo')).toBeDisabled();
    await expect(page.locator('#communication-preview')).not.toHaveAttribute('srcdoc');
    await expect(page.locator('#new-product')).toBeDisabled();
    expect(metrics.admin).toBe(0);
  } finally {
    await page.close();
    await api.close();
  }
});
