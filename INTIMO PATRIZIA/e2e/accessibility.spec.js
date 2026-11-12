import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demoCatalog } from './catalog-fixture.js';
test('WCAG automatic checks cover public pages and readonly admin',async({page})=> {
  await demoCatalog(page);
  for(const file of ['index.html','chi-siamo.html','gallery.html','contatti.html','catalogo.html','accedi.html','admin.html']) {
    await page.goto('/'+file);await page.locator('.footer-bottom').waitFor();
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled(document.getAnimations().map(animation=>animation.finished));});
    // IntersectionObserver can start the heading's fade after the initial
    // animation snapshot. Check the final text colour once its opacity is 1.
    for(const reveal of await page.locator('.page-heading [data-reveal]').all())await expect(reveal).toHaveCSS('opacity','1');
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),file).toEqual([]);
  }
});
