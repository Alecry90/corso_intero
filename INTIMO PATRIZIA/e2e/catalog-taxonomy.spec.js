import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isolatedCatalog } from './catalog-fixture.js';
import { CATALOG_GROUPS } from '../src/catalog-taxonomy.js';

const source=JSON.parse(readFileSync(new URL('../catalog/notes-categories.json',import.meta.url),'utf8'));
const categorySeed=Object.fromEntries(source.categories.map(({id,name,slug,order})=>[`categories/${id}`,{name,slug,order,published:true}]));
const output=new URL('../output/qa/',import.meta.url);mkdirSync(output,{recursive:true});
const groupButton=(page,id)=>page.locator(`#catalog-groups button[data-group-id="${id}"]`);
const leafButton=(page,id)=>page.locator(`#catalog-categories button[data-category-id="${id}"]`);
const urlParams=page=>new URL(page.url()).searchParams;

async function ownerSession(api,browser) {
  const context=await browser.newContext({baseURL:test.info().project.use.baseURL});const page=await context.newPage();
  await api.route(page);await page.goto('/admin.html');await expect(page.locator('#admin-access')).toBeVisible();
  await page.locator('#login-email').fill('alessandroferrara01@libero.it');await page.locator('#login-password').fill('test-password');await page.locator('#login-submit').click();
  await expect(page.locator('#new-category')).toBeEnabled();return context;
}
async function notificationTab(page) {
  const sender=await page.context().newPage();await sender.goto('/privacy.html');
  return {close:()=>sender.close(),notify:()=>sender.evaluate(async()=>{const {notifyCatalogChanged}=await import('/src/catalog-sync.js');notifyCatalogChanged();})};
}

test('all 21 source categories stay visible in six accessible groups without importing products',async({page})=>{
  test.setTimeout(45000);
  const api=await isolatedCatalog(categorySeed);
  try {
    await api.route(page);await page.goto('/catalogo.html');
    await expect(page.locator('#catalog-groups button')).toHaveCount(7);await expect(page.locator('#catalog-subdepartments')).toBeHidden();
    await expect(page.locator('.product-card')).toHaveCount(0);await expect(page.locator('#catalog-empty')).toBeVisible();await expect(page.locator('#catalog-demo')).toBeHidden();
    expect(await api.list('products')).toHaveLength(0);
    const reached=[];
    for(const group of CATALOG_GROUPS) {
      await groupButton(page,group.id).click();await expect(groupButton(page,group.id)).toHaveAttribute('aria-pressed','true');
      expect(urlParams(page).get('reparto')).toBe(group.id);expect(urlParams(page).has('categoria')).toBe(false);
      const members=source.categories.filter(category=>group.categoryIds.includes(category.id)).sort((a,b)=>a.order-b.order);
      await expect(page.locator('#catalog-categories button')).toHaveText(['Tutto il reparto',...members.map(category=>category.name)]);
      const ids=await page.locator('#catalog-categories button[data-category-id]').evaluateAll(buttons=>buttons.map(button=>button.dataset.categoryId).filter(Boolean));
      reached.push(...ids);
      for(const category of members) {
        await leafButton(page,category.id).click();await expect(leafButton(page,category.id)).toHaveAttribute('aria-pressed','true');
        expect(urlParams(page).get('reparto')).toBe(group.id);expect(urlParams(page).get('categoria')).toBe(category.slug);
      }
    }
    expect([...reached].sort()).toEqual(source.categories.map(category=>category.id).sort());
    await page.goto('/catalogo.html?categoria=pigiami-uomo');await expect(groupButton(page,'pigiami-e-relax')).toHaveAttribute('aria-pressed','true');await expect(leafButton(page,'pigiami-uomo')).toHaveAttribute('aria-pressed','true');
    for(const [slug,group,leaf] of [['intimo','intimo',''],['pigiameria','pigiami-e-relax',''],['biancheria-casa','biancheria-casa',''],['neonato','intimo','intimo-neonato']]) {
      await page.goto(`/catalogo.html?categoria=${slug}`);await expect(groupButton(page,group)).toHaveAttribute('aria-pressed','true');await expect(leafButton(page,leaf)).toHaveAttribute('aria-pressed','true');
    }
    await groupButton(page,'intimo').click();
    const violations=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations;
    expect(violations.map(violation=>({id:violation.id,targets:violation.nodes.map(node=>node.target)}))).toEqual([]);
    for(const [width,height,name] of [[1440,1000,'catalog-reparti-desktop'],[375,812,'catalog-reparti-mobile']]) {
      await page.setViewportSize({width,height});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
      await page.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur();window.scrollTo({top:0,left:0,behavior:'instant'});});
      await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,output)),fullPage:true});
    }
  } finally {await page.close();await api.close();}
});

test('macro filters include descendant categories and keep leaf, URL, search, sorting and focus through sync',async({page,browser})=>{
  test.setTimeout(45000);
  const api=await isolatedCatalog({...categorySeed,
    'products/uomo':{name:'Cotone uomo',categoryId:'intimo-uomo',price:20},
    'products/donna':{name:'Cotone donna',categoryId:'intimo-donna',price:10},
    'products/lino':{name:'Lino uomo',categoryId:'intimo-uomo',price:30},
    'products/pigiama':{name:'Cotone pigiama',categoryId:'pigiami-uomo',price:40},
  });
  let owner,notifications;
  try {
    owner=await ownerSession(api,browser);const metrics=await api.route(page);notifications=await notificationTab(page);
    await page.goto('/catalogo.html?reparto=intimo');await expect(page.locator('.product-card')).toHaveCount(3);
    await expect(groupButton(page,'intimo')).toHaveAttribute('aria-pressed','true');await expect(leafButton(page,'')).toHaveAttribute('aria-pressed','true');
    const search=page.getByLabel('Cerca un articolo',{exact:true});await search.fill('Cotone');await page.getByLabel('Ordina per').selectOption('price-asc');
    await expect(page.locator('.product-card h2')).toHaveText(['Cotone donna','Cotone uomo']);
    await leafButton(page,'intimo-uomo').click();await expect(page.locator('.product-card h2')).toHaveText(['Cotone uomo']);
    await search.focus();await search.evaluate(input=>input.setSelectionRange(2,4));const url=page.url();const downloads=metrics.catalog;
    await api.request('PUT','/api/admin/products/uomo',{name:'Cotone uomo aggiornato',categoryId:'intimo-uomo',price:20});await notifications.notify();
    await expect(page.locator('.product-card h2')).toHaveText(['Cotone uomo aggiornato']);expect(metrics.catalog).toBeGreaterThan(downloads);
    await expect(search).toHaveValue('Cotone');await expect(search).toBeFocused();expect(await search.evaluate(input=>[input.selectionStart,input.selectionEnd])).toEqual([2,4]);
    await expect(page.getByLabel('Ordina per')).toHaveValue('price-asc');await expect(groupButton(page,'intimo')).toHaveAttribute('aria-pressed','true');await expect(leafButton(page,'intimo-uomo')).toHaveAttribute('aria-pressed','true');expect(page.url()).toBe(url);
    const leaf=leafButton(page,'intimo-uomo');await leaf.focus();
    await api.request('PUT','/api/admin/categories/intimo-uomo',{name:'Intimo uomo aggiornato',slug:'intimo-uomo',order:20,published:true});await notifications.notify();
    await expect(leaf).toHaveText('Intimo uomo aggiornato');await expect(leaf).toBeFocused();await expect(leaf).toHaveAttribute('aria-pressed','true');expect(page.url()).toBe(url);
    await page.getByRole('button',{name:'Azzera i filtri'}).click();await expect(page.locator('.product-card')).toHaveCount(4);expect(urlParams(page).has('reparto')).toBe(false);expect(urlParams(page).has('categoria')).toBe(false);
  } finally {if(notifications)await notifications.close();if(owner)await owner.close();await page.close();await api.close();}
});

test('a newly created unmapped category appears under Altri reparti while existing selection stays intact',async({page,browser})=>{
  test.setTimeout(45000);
  const api=await isolatedCatalog(categorySeed);let owner,notifications;
  try {
    owner=await ownerSession(api,browser);await api.route(page);notifications=await notificationTab(page);
    await page.goto('/catalogo.html?reparto=intimo&categoria=intimo-uomo');await expect(leafButton(page,'intimo-uomo')).toHaveAttribute('aria-pressed','true');
    const search=page.getByLabel('Cerca un articolo',{exact:true});await search.fill('Cotone');await search.focus();const url=page.url();
    const {category}=await api.request('POST','/api/admin/categories',{name:'Nuovo reparto',slug:'nuovo-reparto',order:220,published:true});await notifications.notify();
    await expect(groupButton(page,'altri-reparti')).toBeVisible();await expect(groupButton(page,'intimo')).toHaveAttribute('aria-pressed','true');await expect(leafButton(page,'intimo-uomo')).toHaveAttribute('aria-pressed','true');await expect(search).toBeFocused();await expect(search).toHaveValue('Cotone');expect(page.url()).toBe(url);
    await groupButton(page,'altri-reparti').click();await expect(leafButton(page,category.id)).toHaveText('Nuovo reparto');await leafButton(page,category.id).click();
    expect(urlParams(page).get('reparto')).toBe('altri-reparti');expect(urlParams(page).get('categoria')).toBe('nuovo-reparto');await expect(page.locator('#catalog-empty')).toBeVisible();
    await page.goto('/catalogo.html?categoria=nuovo-reparto');await expect(groupButton(page,'altri-reparti')).toHaveAttribute('aria-pressed','true');await expect(leafButton(page,category.id)).toHaveAttribute('aria-pressed','true');
  } finally {if(notifications)await notifications.close();if(owner)await owner.close();await page.close();await api.close();}
});
