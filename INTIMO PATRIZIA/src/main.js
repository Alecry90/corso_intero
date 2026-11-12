import './styles.css';
import './boutique.css';
import './newsletter.js';
import { initializeHomeAccount } from './home-account.js';
import { initializeShell, icons, getBusiness, escapeHTML, openDialog } from './shared.js';
import { CATALOG_GROUPS } from './catalog-taxonomy.js';
import notesCatalog from '../catalog/notes-categories.json';
import { initializeHomeMerchandising } from './home-merchandising.js';
import { initializeHomeShopContent } from './home-shop-content.js';
import { SHOP_DAYS } from './shop-content-model.js';

const page = document.body.dataset.page;
initializeShell({active:page});

if(page==='home') {
  initializeHomeAccount();
  initializeHomeMerchandising();
  initializeHomeShopContent({ campaignsContainer:document.getElementById('home-campaigns'), businessContainer:document.getElementById('home-business-details') });
  const descriptions = {
    intimo:'Le basi di ogni giornata, per tutta la famiglia. Scegli la sezione dedicata a donna, uomo, bambini o neonato.',
    'pigiami-e-relax':'Dal riposo ai momenti in casa: pigiami, vestaglie, tute e giacche da camera, nelle sezioni per adulti e bambini.',
    'biancheria-casa':'Ogni stanza ha i suoi tessuti. Trova la sezione per il letto, il bagno o la cucina.',
    'bebe-e-maternita':'I preparativi per un nuovo arrivo: accessori per bebè e una sezione dedicata alla valigia per il parto.',
    'stagioni-e-occasioni':'Un posto per ogni momento dell’anno: estate, ritorno a scuola e Natale, raccolti in sezioni dedicate.',
    profumi:'La sezione dedicata ai profumi: uno spazio da esplorare quando il negozio pubblicherà le sue proposte.'
  };
  const homeCategories = CATALOG_GROUPS.map(group => ({
    ...group,
    description:descriptions[group.id],
    categories:notesCatalog.categories.filter(category=>group.categoryIds.includes(category.id)).sort((a,b)=>a.order-b.order)
  }));
  document.querySelector('.category-rail').innerHTML=homeCategories.map(item=>`<a href="/catalogo.html?reparto=${item.id}">${escapeHTML(item.name)} <span aria-hidden="true">↗</span></a>`).join('');
  document.querySelector('.category-tabs').innerHTML=homeCategories.map((item,index)=>`<button type="button" data-category-choice aria-pressed="${index===0}" aria-controls="category-details category-sections">${escapeHTML(item.name)}</button>`).join('');
  const choose = index => {
    const item=homeCategories[index];
    document.querySelectorAll('[data-category-choice]').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
    document.querySelector('#category-name').textContent=item.name;
    document.querySelector('#category-description').textContent=item.description;
    const sections=document.querySelector('#category-sections');
    sections.setAttribute('aria-label',`Sezioni di ${item.name}`);
    sections.querySelector('ul').innerHTML=item.categories.map(category=>`<li><a href="/catalogo.html?categoria=${category.slug}">${escapeHTML(category.name)} <span aria-hidden="true">↗</span></a></li>`).join('');
    document.querySelector('#category-link').href=`/catalogo.html?reparto=${item.id}`;
    document.querySelector('#category-link').innerHTML=`Esplora ${escapeHTML(item.name)} <span aria-hidden="true">↗</span>`;
  };
  document.querySelectorAll('[data-category-choice]').forEach((button,index)=>button.addEventListener('click',()=>choose(index)));
  choose(0);
  const control=document.querySelector('.hero-motion-control');
  control?.addEventListener('click',()=> {
    const paused=document.documentElement.classList.toggle('motion-paused');
    control.setAttribute('aria-pressed',String(paused));control.textContent=paused?'Attiva movimento':'Riduci movimento';
  });
}

if(page==='gallery') {
  const dialog=document.querySelector('#gallery-dialog');
  document.querySelectorAll('[data-gallery-open]').forEach(button=>button.addEventListener('click',()=> {
    const img=button.querySelector('img');
    dialog.querySelector('img').src=img.src;
    dialog.querySelector('img').alt=img.alt;
    dialog.querySelector('#gallery-dialog-title').textContent=button.dataset.title;
    openDialog(dialog,button);
  }));
  dialog?.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
  dialog?.addEventListener('click',event=> {if(event.target===dialog)dialog.close();});
}

if(page==='contact') {
  initializeHomeShopContent({});
  getBusiness().then(business=> {
    document.querySelector('#business-address').textContent=`${[business.address.street, business.address.streetNumber].filter(Boolean).join(' ')}, ${business.address.postalCode} ${business.address.city}`;
    const phone=document.querySelector('#business-phone');phone.href=business.phoneHref;phone.textContent=business.phoneDisplay;
    const email=document.querySelector('#business-email');email.href=`mailto:${business.email}`;email.textContent=business.email;
    document.querySelectorAll('[data-maps-link]').forEach(link=>link.href=business.mapsUrl);
    const links=document.querySelector('#business-social');
    links.innerHTML=[['Facebook',business.facebook],['Instagram',business.instagram],['TikTok',business.tiktok],['WhatsApp',business.whatsappNumber?`https://wa.me/${business.whatsappNumber}`:null]].filter(([,url])=>url).map(([name,url])=>`<a class="text-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${name} ${icons.arrow}</a>`).join('');
    const hours=document.querySelector('#business-hours');
    if (hours && business.hours?.some(Boolean)) {
      const groups=[];
      business.hours.forEach((value,index)=> {
        if (!value) return;
        const last=groups.at(-1);
        if (last?.value===value && last.end===index-1) last.end=index;
        else groups.push({start:index,end:index,value});
      });
      hours.innerHTML=groups.map(({start,end,value})=>`<div><dt>${escapeHTML(SHOP_DAYS[start])}${end>start?` – ${escapeHTML(SHOP_DAYS[end])}`:''}</dt><dd>${value.split(', ').map(range=>`<span>${escapeHTML(range.replace(/-/g,' – '))}</span>`).join('')}</dd></div>`).join('');
    }
  }).catch(()=> {document.querySelector('#contact-status').hidden=false;});
}

document.querySelectorAll('[data-contact-email]').forEach(link=>getBusiness().then(business=> {
  link.href=`mailto:${business.email}`;link.textContent=business.email;
}).catch(()=>{}));
