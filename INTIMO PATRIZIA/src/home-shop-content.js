import './home-shop-content.css';
import { getBaseBusiness } from './shared.js';
import { loadPublicProductsByIds } from './firestore-catalog.js';
import { createCatalogImages } from './catalog-images.js';
import { getPublicShopSettings, listPublicCampaigns, visibleCampaigns, formatCampaignDates, mergeBusinessSettings, businessStructuredData, SHOP_DAYS } from './shop-content.js';
const node = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const campaignImages = new WeakMap();

function renderBusiness(container, business) {
  if (!container) return;
  container.replaceChildren();
  const hours = (business.hours || []).some(Boolean);
  const hasDetails = hours || business.whatsappNumber || business.legalName || business.address?.streetNumber;
  container.hidden = !hasDetails;
  if (!hasDetails) return;
  container.classList.add('home-business-details', 'section');
  container.setAttribute('aria-labelledby', 'shop-business-title');
  const intro = node('div', 'home-business-intro');
  const heading = node('h2', '', 'Ci trovi in negozio.'); heading.id = 'shop-business-title'; intro.append(heading);
  if (business.legalName) intro.append(node('p', '', business.legalName));
  const address = business.address || {};
  intro.append(node('p', '', `${[address.street, address.streetNumber].filter(Boolean).join(' ')}, ${[address.postalCode, address.city].filter(Boolean).join(' ')}`));
  if (business.whatsappNumber) {
    const whatsapp = node('a', 'button', 'Scrivici su WhatsApp');
    whatsapp.href = `https://wa.me/${business.whatsappNumber}`; whatsapp.target = '_blank'; whatsapp.rel = 'noopener noreferrer';
    intro.append(whatsapp, node('p', 'home-business-note', 'Si apre WhatsApp. Il messaggio parte solo quando lo invii tu.'));
  }
  container.append(intro);
  if (hours) {
    const group = node('div', 'shop-hours'); group.append(node('h3', '', 'Orari del negozio'));
    const list = node('dl');
    business.hours.forEach((value, index) => { if (!value) return; const row = node('div'); row.append(node('dt', '', SHOP_DAYS[index]), node('dd', '', value.replace(/-/g, '–'))); list.append(row); });
    group.append(list, node('p', 'home-business-note', 'Orari riferiti alla settimana ordinaria. Per festività e variazioni contattaci.')); container.append(group);
  }
}
function updateBusinessSeo(business) {
  if (business.seoTitle) document.title = business.seoTitle;
  if (business.seoDescription) {
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.append(meta); }
    meta.content = business.seoDescription;
  }
  let script = document.getElementById('shop-business-structured-data');
  if (!script) { script = document.createElement('script'); script.id = 'shop-business-structured-data'; script.type = 'application/ld+json'; document.head.append(script); }
  script.textContent = JSON.stringify(businessStructuredData(business, location.origin)).replace(/</g, '\\u003c');
}
async function renderCampaigns(container, records) {
  if (!container) return;
  let images = campaignImages.get(container);
  if (!images) { images = createCatalogImages(); campaignImages.set(container,images); }
  images.reset();
  const campaigns = visibleCampaigns(records).slice(0, 6);
  container.replaceChildren(); container.hidden = campaigns.length === 0;
  if (!campaigns.length) return;
  container.classList.add('home-campaigns', 'section'); container.setAttribute('aria-labelledby', 'shop-campaigns-title');
  const title = node('h2', '', 'Le novità del negozio.'); title.id = 'shop-campaigns-title'; container.append(title);
  const list = node('div', 'home-campaign-list'); container.append(list);
  for (const campaign of campaigns) {
    const article = node('article', 'home-campaign');
    if (campaign.image) { const image = node('img', 'home-campaign-image'); image.src = campaign.image; image.alt = campaign.imageAlt; image.loading = 'lazy'; image.width = 720; image.height = 540; article.append(image); }
    const copy = node('div', 'home-campaign-copy');
    const dates = formatCampaignDates(campaign);
    copy.append(node('h3', '', campaign.title));
    if (dates) copy.append(node('p', 'home-campaign-date', dates));
    copy.append(node('p', 'home-campaign-body', campaign.body));
    if (campaign.ctaPath) { const link = node('a', 'text-link', campaign.ctaLabel); link.href = campaign.ctaPath; copy.append(link); }
    else if (campaign.categoryId) { const link = node('a', 'text-link', 'Esplora la categoria'); link.href = `/catalogo.html?categoria=${encodeURIComponent(campaign.categoryId)}`; copy.append(link); }
    article.append(copy); list.append(article);
    // Names and photos are resolved through the public catalog rules. Draft or
    // removed references never become public content through a campaign.
    if (campaign.productIds.length) {
      const products = node('div', 'home-campaign-products'); copy.append(products);
      loadPublicProductsByIds({ ids: campaign.productIds }).then(items => {
        for (const item of items) {
          if (!products.isConnected) break;
          const link = node('a', 'home-campaign-product'); link.href = `/catalogo.html?prodotto=${encodeURIComponent(item.id)}`;
          if (item.image) { const photo = node('img'); photo.alt = item.imageAlt || item.name; photo.loading = 'lazy'; photo.width = 100; photo.height = 120; link.append(photo); images.show(photo, item.image); }
          link.append(node('span', '', item.name)); products.append(link);
        }
        if (!items.length) products.remove();
      }).catch(() => products.remove());
    }
  }
}

export async function initializeHomeShopContent({ campaignsContainer, businessContainer, business } = {}) {
  if (campaignsContainer?.dataset.initialized) return;
  if (campaignsContainer) campaignsContainer.dataset.initialized = 'true';
  if (campaignsContainer) campaignsContainer.hidden = true;
  if (businessContainer) businessContainer.hidden = true;
  const jobs = [];
  if (campaignsContainer) jobs.push(listPublicCampaigns({ visibleLimit: 6 }).then(records => renderCampaigns(campaignsContainer, records)).catch(() => { campaignsContainer.hidden = true; }));
  jobs.push(Promise.all([business ? Promise.resolve(business) : getBaseBusiness(), getPublicShopSettings().catch(() => null)]).then(([base, settings]) => {
    const merged = settings ? mergeBusinessSettings(base, settings) : mergeBusinessSettings(base);
    renderBusiness(businessContainer, merged); updateBusinessSeo(merged);
    return merged;
  }).catch(() => { if (businessContainer) businessContainer.hidden = true; }));
  await Promise.all(jobs);
  if (!campaignsContainer) return;
  let timer; let working = false; let changed = false; let disposed = false;
  const schedule = () => { clearTimeout(timer); if (!disposed && document.visibilityState !== 'hidden') timer = setTimeout(refresh,60000); };
  const refresh = async () => {
    if (disposed || document.visibilityState === 'hidden') return;
    if (working) { changed = true; return; }
    working = true;
    try { await renderCampaigns(campaignsContainer,await listPublicCampaigns({ visibleLimit: 6 })); } catch { /* Keep the last public content during a temporary outage. */ }
    finally { working = false; if (changed) { changed = false; queueMicrotask(refresh); } else schedule(); }
  };
  window.addEventListener('focus',refresh);
  window.addEventListener('shop-content-changed',refresh);
  document.addEventListener('visibilitychange',()=>document.visibilityState === 'hidden'?clearTimeout(timer):refresh());
  if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('intimo-shop-content'); channel.onmessage = event=>{if(event.data?.type==='changed')refresh();}; window.addEventListener('pagehide',event=>{if(!event.persisted)channel.close();}); }
  window.addEventListener('pagehide',event=>{clearTimeout(timer);if(!event.persisted){disposed=true;campaignImages.get(campaignsContainer)?.reset();}});
  window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
  schedule();
}
