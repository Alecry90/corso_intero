import { escapeHTML, getBusiness, icons } from './shared.js';
import { getPublicShopSettings, mergeBusinessSettings } from './shop-content.js';
import { hasDetailedAvailability, variantRows, variantSelectionStatus } from './product-variants.js';

export function productURL(product, origin = location.origin) {
  const url = new URL('/catalogo.html', origin);
  url.searchParams.set('prodotto', product.id);
  return url.href;
}

export function productRequestMessage(product, { size = '', color = '', url = productURL(product) } = {}) {
  const status = variantSelectionStatus(product, { size, color });
  if (status === 'not-offered') return '';
  const complete = (!product.sizes?.length || Boolean(size)) && (!product.colors?.length || Boolean(color));
  const availability = status === 'available' ? 'Disponibilità indicata per la combinazione: disponibile.'
    : status === 'unavailable' ? complete ? 'Disponibilità indicata per la combinazione: esaurita.' : 'Disponibilità indicata per le varianti selezionate: esaurite.'
    : status === 'choose' ? 'Disponibilità della combinazione: da verificare dopo la scelta delle varianti.' : '';
  return ['Buongiorno, vorrei informazioni sulla disponibilità di questo articolo:', product.name,
    `Codice: ${product.sku || product.id}`, size ? `Taglia richiesta: ${size}` : '',
    color ? `Colore richiesto: ${color}` : '', availability, url, 'Grazie.'].filter(Boolean).join('\n');
}

// Links prepare a message in the visitor's own app. Nothing is submitted here.
export function productContactLinks(product, business, settings, selection = {}) {
  const message = productRequestMessage(product, selection);
  const email = typeof business.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(business.email) ? business.email : '';
  const phone = typeof business.phoneHref === 'string' && /^tel:\+?[0-9 ()-]{5,25}$/.test(business.phoneHref) ? business.phoneHref : '';
  const whatsapp = typeof settings.whatsappNumber === 'string' && /^[1-9][0-9]{7,14}$/.test(settings.whatsappNumber) ? settings.whatsappNumber : '';
  return {
    email: email && message ? `mailto:${email}?${new URLSearchParams({ subject: `Disponibilità · ${product.name}`, body: message }).toString().replace(/\+/g, '%20')}` : '',
    phone,
    whatsapp: whatsapp && message ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}` : '',
  };
}

export function mountProductContact(container, product) {
  let destroyed = false;
  let business;
  let settings;
  const url = productURL(product);
  const detailed = hasDetailedAvailability(product);
  const options = (id, label, values) => values?.length ? `<div><label for="${id}">${label} <span>(facoltativa)</span></label><select id="${id}"${detailed ? ' aria-describedby="product-variant-status"' : ''}><option value="">Da concordare</option>${values.map(value => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join('')}</select></div>` : '';
  const combinations = detailed ? `<details class="product-variant-list"><summary>Combinazioni proposte</summary><ul>${variantRows(product).map(row => `<li><span>${escapeHTML([row.size, row.color].filter(Boolean).join(' · ') || 'Articolo senza varianti')}</span><span>${row.available ? 'Disponibile' : 'Esaurita'}</span></li>`).join('')}</ul></details>` : '';
  container.innerHTML = `<div class="product-request"><h3>${detailed ? 'Chiedi informazioni' : 'Chiedi disponibilità'}</h3><p>${detailed ? 'Scegli le varianti per verificarne la disponibilità. Puoi anche chiedere informazioni senza una scelta completa.' : 'Scegli, se vuoi, taglia e colore da indicare al negozio.'}</p><div class="product-request-options">${options('product-request-size', 'Taglia', product.sizes)}${options('product-request-color', 'Colore', product.colors)}</div>${detailed ? '<p class="product-variant-status" id="product-variant-status" role="status" aria-live="polite" aria-atomic="true"></p>' : ''}${combinations}<div class="product-contact-actions"><a class="button" id="product-email" hidden>Prepara un’email</a><a class="button button-outline" id="product-whatsapp" target="_blank" rel="noopener noreferrer" hidden>Apri WhatsApp</a><a class="button button-outline" id="product-phone" href="/contatti.html">Chiedi in negozio ${icons.phone}</a></div><p class="detail-note">Disponibilità da confermare con il negozio. Puoi controllare il testo prima di inviarlo dalla tua app. Le scelte in questa scheda non vengono salvate.</p></div><div class="product-share"><button class="text-button" id="product-share" type="button">Copia link del prodotto</button><p id="product-share-status" role="status" aria-live="polite" aria-atomic="true"></p><div id="product-share-fallback" hidden><label for="product-share-url">Link del prodotto da copiare</label><input id="product-share-url" type="url" readonly value="${escapeHTML(url)}"><p>Seleziona il link e usa il comando Copia del tuo dispositivo.</p></div></div>`;
  const find = selector => container.querySelector(selector);
  const update = () => {
    if (destroyed) return;
    const selection = { size: find('#product-request-size')?.value || '', color: find('#product-request-color')?.value || '', url };
    if (detailed) {
      const status = variantSelectionStatus(product, selection);
      const complete = (!product.sizes?.length || Boolean(selection.size)) && (!product.colors?.length || Boolean(selection.color));
      const message = status === 'available' ? 'Combinazione disponibile. Chiedi conferma al negozio.'
        : status === 'unavailable' ? complete ? 'Combinazione esaurita. Puoi chiedere informazioni al negozio.' : 'Le combinazioni corrispondenti alla selezione sono esaurite. Puoi chiedere informazioni al negozio.'
        : status === 'not-offered' ? 'Questa combinazione non è proposta. Scegli una combinazione elencata per preparare un messaggio.'
        : 'Scegli le varianti per verificare la disponibilità della combinazione.';
      const statusNode = find('#product-variant-status');
      statusNode.dataset.state = status;
      if (statusNode.textContent !== message) statusNode.textContent = message;
    }
    if (!business || !settings) return;
    const links = productContactLinks(product, business, settings, selection);
    for (const key of ['email', 'whatsapp', 'phone']) {
      const link = find(`#product-${key}`);
      link.hidden = !links[key];
      if (links[key]) link.href = links[key];
      else link.removeAttribute('href');
    }
  };
  container.addEventListener('change', update);
  update();
  const share = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      if (!destroyed) find('#product-share-status').textContent = 'Link copiato. Puoi condividerlo dove preferisci.';
    } catch {
      if (destroyed) return;
      find('#product-share-status').textContent = 'Copia il link dal campo qui sotto.';
      find('#product-share-fallback').hidden = false;
      const field = find('#product-share-url');
      field.focus();
      field.select();
    }
  };
  find('#product-share').addEventListener('click', share);
  const ready = Promise.allSettled([getBusiness(), getPublicShopSettings()]).then(results => {
    if (destroyed) return;
    business = results[0].status === 'fulfilled' ? results[0].value : {};
    settings = results[1].status === 'fulfilled' ? results[1].value : {};
    business = mergeBusinessSettings(business, settings);
    update();
  });
  return { ready, destroy() { destroyed = true; container.removeEventListener('change', update); find('#product-share')?.removeEventListener('click', share); } };
}
