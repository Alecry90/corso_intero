import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isolatedCatalog, demoCatalog } from './catalog-fixture.js';

const pages=['index.html','chi-siamo.html','gallery.html','contatti.html','catalogo.html','accedi.html','admin.html','privacy.html','cookie.html','condizioni.html'];
const output=new URL('../output/qa/',import.meta.url);mkdirSync(output,{recursive:true});

const departments={
  'categories/lingerie':{name:'Lingerie',slug:'lingerie',published:true,order:0},
  'categories/pigiameria':{name:'Pigiameria',slug:'pigiameria',published:true,order:1}
};

async function loginOwner(page) {
  await page.goto('/admin.html');await expect(page.locator('#admin-access')).toBeVisible();
  await page.locator('#login-email').fill('alessandroferrara01@libero.it');await page.locator('#login-password').fill('test-password');await page.locator('#login-submit').click();
  await expect(page.locator('#new-product')).toBeEnabled();
}

async function tickCatalog(page,metrics) {
  const before=metrics.version;
  await page.clock.fastForward(15001);
  // Firestore has its own asynchronous queue and network timers. Let those run
  // normally after advancing the catalogue timer, then freeze the next interval.
  await page.clock.resume();
  await expect.poll(()=>metrics.version).toBeGreaterThan(before);
  await expect.poll(()=>page.evaluate(()=>window.__catalogTestPending||0)).toBe(0);
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+50));
}

test('all pages have one shared navigation and footer and fit phone, tablet and desktop',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await demoCatalog(page);
  for(const width of [320,375,768,1440]) {
    await page.setViewportSize({width,height:900});
    for(const file of pages) {
      await page.goto(`/${file}`);
      await expect(page.locator('.site-footer .footer-bottom')).toBeVisible();
      await expect(page.locator('h1')).toHaveCount(1);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      expect(overflow,`${file} width ${width}`).toBe(false);
      await expect(page.locator('.desktop-nav')).toBeVisible({visible:width>=1000});
    }
  }
  expect(errors).toEqual([]);
});

test('mobile menu traps focus, closes with Escape and returns focus',async({page})=>{
  await page.setViewportSize({width:375,height:812});await page.goto('/');
  const toggle=page.getByRole('button',{name:'Menu',exact:true});await toggle.click();
  await expect(page.locator('#mobile-menu')).toBeVisible();
  for(let n=0;n<9;n++)await page.keyboard.press('Tab');
  expect(await page.evaluate(()=>document.activeElement.closest('#mobile-menu')!==null)).toBe(true);
  await page.keyboard.press('Escape');await expect(toggle).toBeFocused();await expect(toggle).toHaveAttribute('aria-expanded','false');
});

test('catalog filters, URL state, price sorting, empty state and product details work',async({page})=>{
  await demoCatalog(page);
  await page.goto('/');await page.getByLabel('Cerca un articolo nel catalogo').fill('Slip');
  await page.getByRole('button',{name:'Avvia ricerca',exact:true}).click();
  await expect(page).toHaveURL(/cerca=Slip/);await expect(page.locator('.product-card')).toHaveCount(1);
  await page.goto('/catalogo.html');await expect(page.locator('.product-card')).toHaveCount(12);
  await page.getByRole('button',{name:'Pigiameria',exact:true}).click();await expect(page.locator('.product-card')).toHaveCount(3);expect(page.url()).toContain('categoria=pigiameria');
  await page.getByLabel('Cerca un articolo').fill('non-esiste');await expect(page.locator('#catalog-empty')).toBeVisible();
  await page.getByRole('button',{name:'Azzera i filtri'}).click();await expect(page.locator('.product-card')).toHaveCount(12);
  await page.getByLabel('Ordina per').selectOption('price-asc');await expect(page.locator('.product-card h2').first()).toHaveText('Slip comfort');
  await page.locator('.product-open').first().click();await expect(page.locator('#product-dialog')).toBeVisible();await expect(page.locator('.detail-demo')).toContainText('fittizio');
  await page.keyboard.press('Escape');await expect(page.locator('.product-open').first()).toBeFocused();
  await page.goto('/catalogo.html?categoria=neonato');await expect(page.locator('.product-card')).toHaveCount(3);
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled(document.getAnimations().map(a=>a.finished));});await page.screenshot({path:fileURLToPath(new URL('catalog-desktop.png',output)),fullPage:true});
});

test('gallery opens only real shop images; readonly admin never enables writes',async({page})=>{
  await page.goto('/gallery.html');await page.locator('[data-gallery-open]').first().click();await expect(page.locator('#gallery-dialog')).toBeVisible();await page.keyboard.press('Escape');
  await page.goto('/admin.html');await expect(page.locator('#admin-setup')).toBeVisible();await expect(page.locator('.admin-product-row')).toHaveCount(0);await expect(page.locator('#new-product')).toBeDisabled();
  await page.locator('#show-categories').click();await expect(page.locator('.admin-category-row')).toHaveCount(0);await expect(page.locator('#new-category')).toBeDisabled();
});

test('account is optional and a verified visitor can sign in and out without catalog write access',async({page})=>{
  const api=await isolatedCatalog({...departments,'products/real':{name:'Canotta Cotone',categoryId:'lingerie',published:true,order:0}},{email:'visitor@example.test',email_verified:true,admin:true});
  try {
    const metrics=await api.route(page);
    for(const [width,height,name] of [[1440,1000,'account-desktop'],[375,812,'account-mobile']]) {
      await page.setViewportSize({width,height});await page.goto('/accedi.html');await expect(page.locator('#account-access')).toBeVisible();
      await expect(page.locator('.account-catalog-link')).toBeVisible();await expect(page.locator('.account-privacy a')).toHaveAttribute('href','/privacy.html');
      if(width===375)await page.locator('#account-registration summary').click();
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled(document.getAnimations().map(animation=>animation.finished));document.activeElement?.blur();window.scrollTo({top:0,left:0,behavior:'instant'});});
      await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,output)),fullPage:true});
    }
    await page.locator('.account-catalog-link').click();await expect(page.locator('.product-card h2')).toHaveText(['Canotta Cotone']);
    expect(metrics.auth).toEqual([]);expect(metrics.session).toBe(0);expect(metrics.admin).toBe(0);
    await page.goto('/accedi.html');await expect(page.locator('#account-access')).toBeVisible();
    await page.locator('#login-email').fill('visitor@example.test');await page.locator('#login-password').fill('test-password');await page.locator('#login-submit').click();
    await expect(page.locator('#account-signed-in')).toBeVisible();await expect(page.locator('#account-description')).toContainText('Puoi consultare il catalogo');await expect(page.locator('#manage-catalog')).toBeHidden();
    await page.goto('/admin.html');await expect(page.locator('#admin-account')).toBeVisible();await expect(page.locator('#new-product')).toBeDisabled();await expect(page.locator('#new-category')).toBeDisabled();
    expect(metrics.admin).toBe(0);
    await page.goto('/accedi.html');await expect(page.locator('#account-signed-in')).toBeVisible();await page.locator('#account-logout').click();
    await expect(page.locator('#account-access')).toBeVisible();await expect(page.locator('#login-email')).toBeFocused();await expect(page.locator('#account-status')).toContainText('Hai effettuato');
    await page.locator('.account-catalog-link').click();await expect(page.locator('.product-card h2')).toHaveText(['Canotta Cotone']);expect(metrics.admin).toBe(0);
  } finally {await page.close();await api.close();}
});

test('the verified owner sees catalog management without an admin custom claim',async({page})=>{
  const api=await isolatedCatalog(departments);
  try {
    const metrics=await api.route(page);
    await page.goto('/accedi.html');await expect(page.locator('#account-access')).toBeVisible();
    await page.locator('#login-email').fill('alessandroferrara01@libero.it');await page.locator('#login-password').fill('test-password');await page.locator('#login-submit').click();
    await expect(page.locator('#manage-catalog')).toBeVisible();await expect(page.locator('#account-verification')).toBeHidden();
    await page.locator('#manage-catalog').click();await expect(page.locator('#new-product')).toBeEnabled();await expect(page.locator('#new-category')).toBeEnabled();
    expect(metrics.session).toBeGreaterThan(0);expect(metrics.admin).toBeGreaterThan(0);
  } finally {await page.close();await api.close();}
});

test('an unverified owner with an admin claim sees verification and never requests admin catalog data',async({page})=>{
  const api=await isolatedCatalog(departments,{email:'alessandroferrara01@libero.it',email_verified:false,admin:true});
  try {
    const metrics=await api.route(page);
    await page.goto('/accedi.html');await expect(page.locator('#account-access')).toBeVisible();
    await page.locator('#login-email').fill('alessandroferrara01@libero.it');await page.locator('#login-password').fill('test-password');await page.locator('#login-submit').click();
    await expect(page.locator('#account-verification')).toBeVisible();await expect(page.locator('#manage-catalog')).toBeHidden();
    await expect(page.locator('#account-description')).toContainText('Puoi consultare il catalogo');const sessions=metrics.session;
    await page.goto('/admin.html');await expect(page.locator('#admin-email-verification')).toBeVisible();await expect(page.locator('#admin-dashboard')).toBeHidden();
    await expect(page.locator('#new-product')).toBeDisabled();await expect(page.locator('#new-category')).toBeDisabled();
    expect(metrics.session).toBe(sessions);expect(metrics.admin).toBe(0);expect(metrics.auth).not.toContain('sendOobCode');
  } finally {await page.close();await api.close();}
});

test('optional signup validates confirmation and creates a visitor account without sending a real email',async({page})=>{
  const api=await isolatedCatalog(departments,{email:'new-visitor@example.test',email_verified:false});
  try {
    const metrics=await api.route(page);
    await page.goto('/accedi.html');await expect(page.locator('#account-access')).toBeVisible();await page.locator('#account-registration summary').click();
    await page.locator('#signup-email').fill('new-visitor@example.test');await page.locator('#signup-password').fill('Test-password');await page.locator('#signup-confirm').fill('different-password');await page.locator('#signup-submit').click();
    await expect(page.locator('#signup-errors')).toBeFocused();await expect(page.locator('#signup-confirm')).toHaveAttribute('aria-invalid','true');await expect(page.locator('#signup-password')).toHaveValue('Test-password');expect(metrics.auth).not.toContain('signUp');
    await page.locator('#signup-confirm').fill('Test-password');await page.locator('#signup-submit').click();
    await expect(page.locator('#account-signed-in')).toBeVisible();await expect(page.locator('#account-email')).toHaveText('new-visitor@example.test');await expect(page.locator('#account-verification')).toBeVisible();
    await expect(page.locator('#manage-catalog')).toBeHidden();await expect(page.locator('#account-description')).toContainText('Puoi consultare il catalogo');
    expect(metrics.auth.filter(action=>action==='signUp')).toHaveLength(1);expect(metrics.auth).not.toContain('sendOobCode');expect(metrics.admin).toBe(0);
    await page.locator('#account-signed-in a[href="/catalogo.html"]').click();await expect(page.locator('#catalog-empty')).toBeVisible();expect(metrics.admin).toBe(0);
  } finally {await page.close();await api.close();}
});

test('save real CRUD through the Firestore adapter and real rules emulator, including image upload',async({page})=>{
  test.setTimeout(45000);
  const api=await isolatedCatalog();let visitor;
  try {
    await api.route(page);
    await page.goto('/admin.html');await expect(page.locator('#admin-access')).toBeVisible();
    await page.locator('#login-email').fill('alessandroferrara01@libero.it');await page.locator('#login-password').fill('test-password');await page.locator('#login-submit').click();
    await page.locator('#show-categories').click();await expect(page.locator('#new-category')).toBeEnabled();await page.locator('#new-category').click();
    await page.locator('#category-name').fill('Categoria test');await page.locator('#category-save').click();await expect(page.locator('.admin-category-row')).toHaveCount(1);
    await page.locator('#show-products').click();await page.locator('#new-product').click();await page.locator('#product-name').fill('Prodotto test');await page.locator('#product-price').fill('12.5');await page.locator('#product-description').fill('Scheda usata solo dal test automatico.');
    const image=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=150;const drawing=canvas.getContext('2d');drawing.fillStyle='#dce1d3';drawing.fillRect(0,0,120,150);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
    await page.locator('#product-image').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:image});await expect(page.locator('#product-image-feedback')).toContainText('Pronta:');await page.locator('#product-image-alt').fill('Campione salvia del test');await page.locator('#product-save').click();
    await expect(page.locator('.admin-product-row')).toHaveCount(1);expect(await api.list('productImages')).toHaveLength(1);
    await expect.poll(()=>page.locator('.admin-product-image').evaluate(image=>image.naturalWidth)).toBeGreaterThan(0);
    visitor=await page.context().newPage();await api.route(visitor);await visitor.goto('/catalogo.html');
    const publicImage=visitor.locator('.product-card img');await publicImage.scrollIntoViewIfNeeded();await expect.poll(()=>publicImage.evaluate(image=>image.naturalWidth)).toBeGreaterThan(0);
    const originalSource=await publicImage.getAttribute('src');const originalImage=(await api.list('productImages'))[0];
    const replacement=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=150;const drawing=canvas.getContext('2d');drawing.fillStyle='#2846b4';drawing.fillRect(0,0,120,150);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
    await page.getByRole('button',{name:'Modifica prodotto Prodotto test',exact:true}).click();await page.locator('#product-image').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:replacement});await expect(page.locator('#product-image-feedback')).toContainText('Pronta:');await page.locator('#product-save').click();
    await expect(page.locator('#product-dialog')).toBeHidden();
    await expect(visitor.locator('.product-card h2')).toHaveText(['Prodotto test']);await expect(publicImage).toHaveAttribute('alt','Campione salvia del test');
    await expect.poll(()=>publicImage.getAttribute('src')).not.toBe(originalSource);await expect.poll(()=>publicImage.evaluate(image=>image.naturalWidth)).toBeGreaterThan(0);
    const pixel=await publicImage.evaluate(image=>{const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const drawing=canvas.getContext('2d');drawing.drawImage(image,0,0,1,1);return [...drawing.getImageData(0,0,1,1).data];});
    expect(pixel[2]).toBeGreaterThan(pixel[0]+80);expect((await api.list('productImages'))[0].hash).not.toBe(originalImage.hash);
    await page.getByRole('button',{name:'Modifica prodotto Prodotto test',exact:true}).click();await page.locator('#product-name').fill('Prodotto aggiornato');await page.locator('#product-published').uncheck();await page.locator('#product-save').click();await expect(page.locator('.admin-product-info h3')).toHaveText('Prodotto aggiornato');
    await expect.poll(()=>page.locator('.admin-product-image').evaluate(image=>image.naturalWidth)).toBeGreaterThan(0);
    expect((await api.request('GET','/api/catalog')).products).toHaveLength(0);
    await page.getByRole('button',{name:'Elimina prodotto Prodotto aggiornato',exact:true}).click();await page.locator('#delete-confirm').click();await expect(page.locator('.admin-product-row')).toHaveCount(0);
    await page.locator('#show-categories').click();await page.getByRole('button',{name:'Elimina categoria Categoria test',exact:true}).click();await page.locator('#delete-confirm').click();await expect(page.locator('.admin-category-row')).toHaveCount(0);
    expect((await api.inspect('catalogMeta/inventory')).productCount).toBe(0);
  } finally {if(visitor)await visitor.close();await page.close();await api.close();}
});

test('empty departments receive an admin product through polling without losing search, filters or focus',async({page,browser})=>{
  const api=await isolatedCatalog({...departments,'products/example':{name:'Esempio non pubblicabile',categoryId:'lingerie',published:true,isDemo:true,order:0}});
  // A separate visitor session cannot receive the admin's local BroadcastChannel message.
  // Its first update therefore has to arrive through the 15-second version check.
  const visitorContext=await browser.newContext({baseURL:test.info().project.use.baseURL});const visitor=await visitorContext.newPage();
  try {
    await api.route(page);const metrics=await api.route(visitor);
    await loginOwner(page);
    await visitor.clock.install();
    await visitor.goto('/catalogo.html');
    await expect(visitor.getByRole('button',{name:'Lingerie',exact:true})).toBeVisible();await expect(visitor.getByRole('button',{name:'Pigiameria',exact:true})).toBeVisible();
    await expect(visitor.locator('.product-card')).toHaveCount(0);await expect(visitor.locator('#catalog-empty')).toBeVisible();await expect(visitor.locator('#catalog-demo')).toBeHidden();
    await expect.poll(()=>metrics.version).toBeGreaterThan(0);
    await visitor.clock.pauseAt(new Date(Date.now()+100));
    await visitor.getByRole('button',{name:'Lingerie',exact:true}).click();await visitor.getByLabel('Ordina per').selectOption('price-desc');
    const search=visitor.getByLabel('Cerca un articolo',{exact:true});await search.fill('Cotone');await search.focus();await search.evaluate(input=>input.setSelectionRange(2,4));
    const url=visitor.url();const initialDownloads=metrics.catalog;
    await page.locator('#new-product').click();await page.locator('#product-name').fill('Canotta Cotone');await page.locator('#product-category').selectOption('lingerie');await page.locator('#product-price').fill('18.5');await page.locator('#product-save').click();
    await expect(page.locator('.admin-product-info h3',{hasText:'Canotta Cotone'})).toHaveCount(1);
    expect(metrics.catalog).toBe(initialDownloads);await expect(visitor.locator('.product-card')).toHaveCount(0);
    await tickCatalog(visitor,metrics);
    await expect(visitor.locator('.product-card h2')).toHaveText('Canotta Cotone');
    await expect(search).toHaveValue('Cotone');await expect(search).toBeFocused();
    expect(await search.evaluate(input=>[input.selectionStart,input.selectionEnd])).toEqual([2,4]);
    await expect(visitor.getByRole('button',{name:'Lingerie',exact:true})).toHaveAttribute('aria-pressed','true');await expect(visitor.getByLabel('Ordina per')).toHaveValue('price-desc');expect(visitor.url()).toBe(url);
    await expect(visitor.locator('#catalog-count')).toContainText('1 proposta');await expect(visitor.locator('#catalog-demo')).toBeHidden();
  } finally {await visitorContext.close();await page.close();await api.close();}
});

test('catalog sync skips unchanged downloads, survives a temporary version outage and receives drafts and deletions across tabs',async({page,context,browser})=>{
  const api=await isolatedCatalog(departments);let sender;
  const ownerContext=await browser.newContext({baseURL:test.info().project.use.baseURL});const owner=await ownerContext.newPage();
  try {
    await api.route(owner);const metrics=await api.route(page);await loginOwner(owner);
    const {product:first}=await api.request('POST','/api/admin/products',{name:'Canotta Cotone',categoryId:'lingerie',price:18.5});
    await page.clock.install();
    await page.goto('/catalogo.html');await expect(page.locator('.product-card h2')).toHaveText(['Canotta Cotone']);await expect.poll(()=>metrics.version).toBeGreaterThan(0);
    await page.clock.pauseAt(new Date(Date.now()+100));
    const initialDownloads=metrics.catalog;
    await tickCatalog(page,metrics);await tickCatalog(page,metrics);
    expect(metrics.catalog).toBe(initialDownloads);
    const {product:second}=await api.request('POST','/api/admin/products',{name:'Slip Cotone',categoryId:'lingerie',price:9.5});
    metrics.failNextVersion=true;
    await tickCatalog(page,metrics);expect(metrics.failedVersions).toBe(1);
    await expect(page.locator('.product-card h2')).toHaveText(['Canotta Cotone']);await expect(page.locator('#catalog-error')).toBeHidden();expect(metrics.catalog).toBe(initialDownloads);
    await tickCatalog(page,metrics);await expect(page.locator('.product-card')).toHaveCount(2);
    await expect(page.locator('.product-card h2')).toHaveText(['Canotta Cotone','Slip Cotone']);
    const recoveredDownloads=metrics.catalog;
    await tickCatalog(page,metrics);expect(metrics.catalog).toBe(recoveredDownloads);
    await page.clock.resume();
    sender=await context.newPage();await sender.goto('/privacy.html');
    const notify=()=>sender.evaluate(async()=>{const {notifyCatalogChanged}=await import('/src/catalog-sync.js');notifyCatalogChanged();});
    await api.request('PUT',`/api/admin/products/${second.id}`,{name:'Slip Cotone',categoryId:'lingerie',price:9.5,published:false});
    await notify();await expect(page.locator('.product-card h2')).toHaveText(['Canotta Cotone']);
    await api.request('DELETE',`/api/admin/products/${first.id}`);
    await notify();await expect(page.locator('.product-card')).toHaveCount(0);await expect(page.locator('#catalog-empty')).toBeVisible();
    await expect(page.getByRole('button',{name:'Lingerie',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Pigiameria',exact:true})).toBeVisible();
  } finally {if(sender)await sender.close();await ownerContext.close();await page.close();await api.close();}
});

test('home screenshots and reduced motion have no hidden content',async({page})=>{
  for(const [width,height,name] of [[1440,1000,'home-desktop'],[375,812,'home-mobile']]) {
    await page.setViewportSize({width,height});await page.goto('/');
    await page.locator('img[loading="lazy"]').evaluateAll(images=>Promise.allSettled(images.map(image=>{image.loading='eager';return image.decode();})));
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled(document.getAnimations().map(a=>a.finished));});await expect(page.locator('.brand-logo')).toBeVisible();await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,output)),fullPage:true});
    await page.screenshot({path:fileURLToPath(new URL(`${name}-fold.png`,output)),fullPage:false});
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');expect(await page.locator('.hero-thread path').evaluate(node=>getComputedStyle(node).animationName)).toBe('none');await expect(page.getByRole('heading',{level:1})).toBeVisible();
});
