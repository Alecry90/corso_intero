import { getPublicShopSettings, mergeBusinessSettings } from './shop-content.js';
import { initializeHeaderAccount } from './header-account.js';
import { initializeNavigationPersonalization } from './navigation-personalization.js';

export const icons = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7" stroke="currentColor" stroke-width="1.5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 3 4 5-3 3c2 3 3 4 6 6l3-3 5 4c-2 7-9 2-13-2S0 5 6 3Z" stroke="currentColor" stroke-width="1.5"/></svg>'
};

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const links = [['index.html','Home','home'],['chi-siamo.html','Chi siamo','about'],['gallery.html','Gallery','gallery'],['catalogo.html','Catalogo','catalog'],['contatti.html','Contatti','contact']];
let businessPromise;
export function getBaseBusiness() {
  return businessPromise ??= fetch('/data/business.json', { cache: 'no-cache' }).then(response => {
    if (!response.ok) throw new Error('Contatti non disponibili');
    return response.json();
  });
}
let publicSettingsPromise;
export function getBusiness() {
  publicSettingsPromise ??= getPublicShopSettings().catch(() => null);
  return Promise.all([getBaseBusiness(),publicSettingsPromise]).then(([business,settings])=>settings?mergeBusinessSettings(business,settings):business);
}

export async function initializeShell({ active = '', admin = false } = {}) {
  const header = document.querySelector('[data-site-header], #site-header');
  if (header) header.classList.add('site-header');
  if (header) header.innerHTML = `
    <a class="skip-link" href="${document.getElementById('main') ? '#main' : '#main-content'}">Vai al contenuto</a>
    <div class="header-inner"><a class="brand" href="/index.html" aria-label="Intimo Patrizia, Home">
      <img src="/assets/logo-clean.png" width="190" height="64" alt="Intimo Patrizia" class="brand-logo">
      <span class="brand-fallback" hidden>Intimo <span>Patrizia</span></span>
    </a><nav class="desktop-nav" aria-label="Navigazione principale">${links.map(([href,label,key])=>`<a href="/${href}" ${key===active?'aria-current="page"':''}>${label}</a>`).join('')}</nav>
    <a class="header-visit" href="/accedi.html" aria-label="Accedi o apri il tuo account"${active === 'account' ? ' aria-current="page"' : ''}><span data-account-label>Accedi</span>${icons.arrow}</a>
    <button class="menu-toggle" aria-expanded="false" aria-controls="mobile-menu"><span class="menu-lines" aria-hidden="true"></span><span class="menu-word">Menu</span></button></div>
    <dialog id="mobile-menu" class="mobile-menu"><div class="mobile-menu-head"><span>Intimo Patrizia</span><button class="icon-button" data-menu-close aria-label="Chiudi menu">${icons.close}</button></div>
    <nav aria-label="Navigazione mobile">${links.map(([href,label,key])=>`<a href="/${href}" ${key===active?'aria-current="page"':''}>${label}${icons.arrow}</a>`).join('')}<a class="mobile-account-link" href="/accedi.html"${active === 'account' ? ' aria-current="page"' : ''}><span><span data-account-label>Accedi</span><span class="mobile-account-description">Il tuo account</span></span>${icons.arrow}</a></nav><p>Intimo, biancheria e piccoli gesti di casa.<br>Bari, via Ettore Fieramosca 94.</p></dialog>`;
  initializeHeaderAccount(header);
  initializeNavigationPersonalization();
  const logo = header?.querySelector('.brand-logo');
  logo?.addEventListener('error', () => { logo.hidden=true; header.querySelector('.brand-fallback').hidden=false; },{once:true});
  const menu = header?.querySelector('#mobile-menu');
  const toggle = header?.querySelector('.menu-toggle');
  toggle?.addEventListener('click', () => { menu.showModal(); toggle.setAttribute('aria-expanded','true'); document.body.classList.add('modal-open'); });
  const closeMenu = () => menu?.close();
  menu?.querySelector('[data-menu-close]').addEventListener('click',closeMenu);
  menu?.addEventListener('click', event => { if(event.target===menu)closeMenu(); });
  menu?.addEventListener('close', () => { toggle.setAttribute('aria-expanded','false'); document.body.classList.remove('modal-open'); });
  matchMedia('(min-width: 1000px)').addEventListener('change', event=> { if(event.matches && menu?.open) closeMenu(); });
  initializeMotion();
  let business;
  try { business = await getBusiness(); } catch { business={name:'Intimo Patrizia',address:{street:'Via Ettore Fieramosca',streetNumber:'94',city:'Bari'},mapsUrl:'/contatti.html'}; }
  const footer = document.querySelector('[data-site-footer], #site-footer');
  if (footer) footer.classList.add('site-footer');
  const address = `${[business.address.street, business.address.streetNumber].filter(Boolean).join(' ')}, ${business.address.city}`;
  if (footer) footer.innerHTML = `<div class="footer-top"><div><p class="footer-invitation">Ci vediamo<br>in negozio.</p><a class="button button-light" href="${escapeHTML(business.mapsUrl)}" target="_blank" rel="noopener noreferrer">Come raggiungerci ${icons.arrow}</a></div><div class="footer-columns"><div><h2>Un po’ di casa</h2>${links.slice(1).map(([href,label])=>`<a href="/${href}">${label}</a>`).join('')}</div><div><h2>Intimo Patrizia</h2><p>${escapeHTML(address)}</p>${business.phoneHref?`<a href="${escapeHTML(business.phoneHref)}">${escapeHTML(business.phoneDisplay)}</a>`:''}${business.email?`<a href="mailto:${escapeHTML(business.email)}">${escapeHTML(business.email)}</a>`:''}${business.facebook?`<a href="${escapeHTML(business.facebook)}" target="_blank" rel="noopener noreferrer">Facebook</a>`:''}${business.instagram?`<a href="${escapeHTML(business.instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a>`:''}${business.tiktok?`<a href="${escapeHTML(business.tiktok)}" target="_blank" rel="noopener noreferrer">TikTok</a>`:''}</div></div></div>
    <div class="footer-wordmark" aria-hidden="true"><span>Intimo</span><span>Patrizia</span></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} Intimo Patrizia · Bari</span><nav aria-label="Informazioni del sito"><a href="/privacy.html">Privacy</a><a href="/cookie.html">Cookie</a><a href="/condizioni.html">Condizioni</a><a href="/admin.html"${admin?' aria-current="page"':''}>Area gestore</a></nav><button class="text-button motion-toggle" type="button" aria-pressed="false">Riduci animazioni</button></div>`;
  footer?.querySelector('.motion-toggle')?.addEventListener('click', event => {
    const reduced = document.documentElement.classList.toggle('motion-paused');
    event.currentTarget.setAttribute('aria-pressed',String(reduced));
    event.currentTarget.textContent = reduced ? 'Attiva animazioni' : 'Riduci animazioni';
  });
  document.dispatchEvent(new CustomEvent('shell-ready',{detail:business}));
  return business;
}

export function initializeMotion() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches) return;
  const observer = new IntersectionObserver(entries=> entries.forEach(entry=> {
    if(entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
  }),{threshold:.08});
  document.querySelectorAll('[data-reveal]').forEach(el => { el.classList.add('reveal-ready'); observer.observe(el); });
  let scheduled = false;
  const onScroll = () => {
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=> {
      const progress=Math.min(1,window.scrollY/Math.max(1,innerHeight));
      document.documentElement.style.setProperty('--scroll-progress',progress.toFixed(3));
      scheduled=false;
    });
  };
  addEventListener('scroll',onScroll,{passive:true});
}

export function openDialog(dialog, opener) {
  dialog.showModal(); document.body.classList.add('modal-open');
  dialog.addEventListener('close', () => { document.body.classList.remove('modal-open'); opener?.focus(); },{once:true});
}
