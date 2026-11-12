import './admin-shop-content.css';
import { loadManagerCatalogPage } from './firestore-catalog.js';
import { getBusiness } from './shared.js';
import { getPublicShopSettings, saveShopSettings, listManagerCampaigns, saveCampaign, deleteCampaign, emptyShopSettings, SHOP_DAYS, fromRomeInput, toRomeInput, formatCampaignDates } from './shop-content.js';
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const blankCampaign = () => ({ kind: 'promotion', title: '', body: '', startAt: null, endAt: null, categoryId: '', productIds: [], ctaLabel: '', ctaPath: '', image: '', imageAlt: '', published: false });
function button(text, className = 'admin-button admin-button-quiet') { const node = element('button', className, text); node.type = 'button'; return node; }
function field(form, name, label, { type = 'text', max = 250, value = '', help = '', required = false, options } = {}) {
  const wrapper = element('div', 'admin-field');
  const input = element(options ? 'select' : type === 'textarea' ? 'textarea' : 'input');
  input.name = name; input.id = `shop-${name}`; if (!options && type !== 'textarea') input.type = type;
  if (!options) input.maxLength = max; input.required = required;
  if (options) for (const [id, text] of options) { const option = element('option', '', text); option.value = id; input.append(option); }
  input.value = value;
  const caption = element('label', '', label); caption.htmlFor = input.id;
  wrapper.append(caption, input);
  if (help) { const note = element('p', 'admin-field-help', help); note.id = `shop-${name}-help`; input.setAttribute('aria-describedby', note.id); wrapper.append(note); }
  form.append(wrapper); return input;
}

export function initializeAdminShopContent({ container, user } = {}) {
  if (!container || user?.emailVerified !== true || String(user.email || '').trim().toLowerCase() !== 'alessandroferrara01@libero.it') return () => {};
  let disposed = false, selectedId = null, campaignCursor = null, catalogCursor = null, working = false;
  let campaigns = [], products = [], categories = [], selectedProducts = new Set();
  const alive = () => !disposed && container.isConnected;
  container.hidden = false; container.inert = false; container.classList.add('admin-shop-content'); container.replaceChildren();
  const status = element('p', 'admin-form-feedback', 'Caricamento delle impostazioni e dei contenuti…'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const setStatus = (message, error = false) => { if (!alive()) return; status.textContent = message; status.dataset.state = error ? 'error' : 'normal'; };
  const settingsSection = element('section', 'shop-admin-section');
  settingsSection.append(element('h2', '', 'Dati e orari del negozio'), element('p', '', 'Pubblica solo dati confermati. I campi di contatto e gli orari lasciati vuoti mantengono i dati già presenti sul sito. WhatsApp resta assente finché non lo compili.'));
  const settingsForm = element('form', 'shop-settings-form'); const settingsFields = element('fieldset'); settingsFields.disabled = true;
  const settingsGrid = element('div', 'shop-settings-grid'); settingsFields.append(settingsGrid);
  const settingLabels = [
    ['legalName', 'Ragione sociale (facoltativa)', 160], ['streetNumber', 'Numero civico (facoltativo)', 20],
    ['street', 'Via', 160], ['postalCode', 'CAP', 12], ['city', 'Città', 80], ['province', 'Provincia', 30], ['country', 'Paese (due lettere)', 2],
    ['phoneDisplay', 'Telefono visibile', 40], ['phoneHref', 'Link telefono', 24], ['email', 'Email pubblica', 254], ['whatsappNumber', 'Numero WhatsApp (facoltativo)', 15],
    ['seoTitle', 'Titolo nei motori di ricerca (facoltativo)', 80], ['seoDescription', 'Descrizione nei motori di ricerca (facoltativa)', 200]
  ];
  for (const [name, label, max] of settingLabels) field(settingsGrid, name, label, { max, type: name === 'email' ? 'email' : name === 'seoDescription' ? 'textarea' : 'text', help: name === 'whatsappNumber' ? 'Solo cifre con prefisso internazionale. Inseriscilo solo se il negozio usa WhatsApp.' : name === 'phoneHref' ? 'Formato: tel:+390805794644' : '' });
  const hoursHeading = element('h3', '', 'Orari settimanali'); settingsFields.append(hoursHeading, element('p', 'admin-small', 'Fuso orario Europe/Rome. Formato 09:00-13:00, 16:00-20:00 oppure Chiuso. Un giorno lasciato vuoto mantiene l’orario già presente sul sito; se non è disponibile, resta senza orario.'));
  const hoursGrid = element('div', 'shop-settings-grid'); settingsFields.append(hoursGrid);
  SHOP_DAYS.forEach((day, index) => field(hoursGrid, `hours-${index}`, day, { max: 40 }));
  const settingsSave = button('Salva dati del negozio', 'admin-button admin-button-primary'); settingsSave.type = 'submit'; settingsFields.append(settingsSave); settingsForm.append(settingsFields); settingsSection.append(settingsForm);

  const campaignsSection = element('section', 'shop-admin-section');
  campaignsSection.append(element('h2', '', 'Promozioni, eventi e collezioni'), element('p', '', 'Le bozze sono riservate. La pubblicazione rende la scheda pubblica; il sito mostra promozioni e collezioni nel periodo indicato e gli eventi anche prima dell’inizio. La preparazione dell’email apre soltanto il modello da controllare.'));
  const list = element('div', 'shop-campaign-admin-list'); list.setAttribute('aria-label', 'Contenuti salvati');
  const more = button('Carica altri contenuti'); more.hidden = true;
  const newButton = button('Nuovo contenuto', 'admin-button admin-button-primary');
  const editHeading = element('h3', '', 'Nuovo contenuto');
  const campaignForm = element('form', 'shop-campaign-form'); const campaignFields = element('fieldset'); campaignFields.disabled = true;
  field(campaignFields, 'kind', 'Tipo di contenuto', { options: [['promotion', 'Promozione'], ['event', 'Evento'], ['collection', 'Collezione']] });
  field(campaignFields, 'title', 'Titolo', { max: 120, required: true });
  field(campaignFields, 'body', 'Descrizione e condizioni', { type: 'textarea', max: 3000, required: true, help: 'Inserisci le condizioni reali della promozione o le informazioni complete dell’evento.' });
  const dates = element('div', 'shop-settings-grid'); campaignFields.append(dates);
  field(dates, 'startAt', 'Inizio (Europe/Rome)', { type: 'datetime-local', help: 'Obbligatorio per gli eventi. Le promozioni e le collezioni iniziano a comparire in questa data.' });
  field(dates, 'endAt', 'Fine (Europe/Rome)', { type: 'datetime-local', help: 'Dopo la fine la scheda non compare più nella home.' });
  const categorySelect = field(campaignFields, 'categoryId', 'Categoria collegata (facoltativa)', { options: [['', 'Nessuna categoria']] });
  const productArea = element('div', 'shop-linked-products');
  const productLabel = element('h4', '', 'Prodotti collegati (massimo 12)');
  productArea.append(productLabel, element('p', 'admin-small', 'Sul sito compaiono solo prodotti reali pubblicati in categorie pubbliche.'));
  const productSearch = field(productArea, 'productSearch', 'Cerca tra i prodotti caricati', { max: 160 });
  const productChoices = element('div', 'shop-product-choices');
  const productCount = element('p', 'admin-small'); productCount.setAttribute('aria-live', 'polite');
  const moreProducts = button('Carica altri prodotti'); moreProducts.hidden = true;
  productArea.append(productChoices, productCount, moreProducts); campaignFields.append(productArea);
  field(campaignFields, 'ctaLabel', 'Testo del link (facoltativo)', { max: 80 });
  field(campaignFields, 'ctaPath', 'Pagina interna del link (facoltativa)', { max: 300, help: 'Per esempio /catalogo.html o /contatti.html. Compila anche il testo del link.' });
  field(campaignFields, 'image', 'Immagine del sito (facoltativa)', { max: 250, help: 'Percorso di una fotografia già disponibile, per esempio /assets/negozio.webp. Le foto dei prodotti si aggiungono collegando i prodotti sopra.' });
  field(campaignFields, 'imageAlt', 'Descrizione dell’immagine', { max: 250 });
  const publishedLabel = element('label', 'admin-check'); const published = element('input'); published.type = 'checkbox'; published.name = 'published'; publishedLabel.append(published, element('span', '', 'Pubblica la scheda sul sito')); campaignFields.append(publishedLabel);
  const actions = element('div', 'shop-admin-actions'); const save = button('Salva contenuto', 'admin-button admin-button-primary'); save.type = 'submit';
  const cancel = button('Chiudi modifica'); actions.append(save, cancel); campaignFields.append(actions); campaignForm.append(campaignFields);
  campaignsSection.append(newButton, list, more, editHeading, campaignForm); container.append(status, settingsSection, campaignsSection);
  const inputValue = name => campaignForm.elements.namedItem(name).value.trim();
  function setBusy(value) {
    working = value; if (!alive()) return;
    settingsFields.disabled = value; campaignFields.disabled = value;
    for (const control of [newButton, more, ...list.querySelectorAll('button')]) control.disabled = value;
  }
  function renderProducts() {
    productChoices.replaceChildren();
    const search = productSearch.value.trim().toLocaleLowerCase('it');
    for (const product of products.filter(item => !search || item.name.toLocaleLowerCase('it').includes(search))) {
      const label = element('label', 'admin-check'); const input = element('input'); input.type = 'checkbox'; input.value = product.id; input.checked = selectedProducts.has(product.id);
      input.addEventListener('change', () => { if (input.checked && selectedProducts.size >= 12) { input.checked = false; setStatus('Puoi collegare al massimo 12 prodotti.', true); return; } input.checked ? selectedProducts.add(product.id) : selectedProducts.delete(product.id); productCount.textContent = `${selectedProducts.size} prodotti collegati`; });
      label.append(input, element('span', '', `${product.name}${product.published ? '' : ' (bozza)'}`)); productChoices.append(label);
    }
    // Keep references which are outside the current page visible and removable.
    for (const id of selectedProducts) if (!products.some(item => item.id === id)) { const row = element('div', 'shop-unloaded-product'); row.append(element('span', '', `Prodotto collegato: ${id}`)); const remove = button('Rimuovi collegamento'); remove.addEventListener('click', () => { selectedProducts.delete(id); renderProducts(); }); row.append(remove); productChoices.append(row); }
    productCount.textContent = `${selectedProducts.size} prodotti collegati`; moreProducts.hidden = !catalogCursor;
  }
  function edit(record = blankCampaign()) {
    selectedId = record.id || null; selectedProducts = new Set(record.productIds || []); campaignForm.reset();
    for (const key of ['kind', 'title', 'body', 'categoryId', 'ctaLabel', 'ctaPath', 'image', 'imageAlt']) campaignForm.elements.namedItem(key).value = record[key] || '';
    campaignForm.elements.namedItem('startAt').value = toRomeInput(record.startAt); campaignForm.elements.namedItem('endAt').value = toRomeInput(record.endAt); published.checked = record.published === true;
    editHeading.textContent = selectedId ? 'Modifica contenuto' : 'Nuovo contenuto'; renderProducts();
  }
  function renderList() {
    list.replaceChildren();
    if (!campaigns.length) list.append(element('p', 'admin-small', 'Non hai ancora creato contenuti. Nessun esempio viene pubblicato automaticamente.'));
    for (const record of campaigns) {
      const row = element('article', 'shop-campaign-admin-row'); const info = element('div');
      info.append(element('h3', '', record.title), element('p', 'admin-small', `${record.published ? 'Pubblicato' : 'Bozza'}${formatCampaignDates(record) ? ` · ${formatCampaignDates(record)}` : ''}`));
      const rowActions = element('div', 'shop-admin-actions');
      const editButton = button('Modifica'); editButton.setAttribute('aria-label', `Modifica ${record.title}`); editButton.addEventListener('click', () => { edit(record); campaignForm.scrollIntoView({ block: 'start' }); campaignForm.elements.namedItem('title').focus({ preventScroll: true }); });
      const email = button('Prepara email'); email.setAttribute('aria-label', `Prepara email per ${record.title}`); email.addEventListener('click', () => {
        if (working || disposed) return;
        window.dispatchEvent(new CustomEvent('intimopatrizia:prepare-campaign-email', { detail: { campaignId: record.id, type: record.kind === 'collection' ? 'message' : record.kind, title: record.title, subject: record.title, body: record.body, eventDate: formatCampaignDates(record), ctaLabel: record.ctaLabel, ctaUrl: record.ctaPath } }));
        setStatus('Contenuto copiato nel modello email. Controlla l’anteprima prima di scaricarlo; nessuna email è stata inviata.');
      });
      const remove = button('Elimina', 'admin-button admin-delete-button'); remove.setAttribute('aria-label', `Elimina ${record.title}`); remove.addEventListener('click', async () => {
        if (working || disposed || !window.confirm(`Eliminare “${record.title}”? La scheda verrà rimossa dal sito. L’operazione non può essere annullata.`)) return;
        setBusy(true);
        try { await deleteCampaign(user, record.id); if (!alive()) return; campaigns = campaigns.filter(item => item.id !== record.id); if (selectedId === record.id) edit(); renderList(); setStatus('Contenuto eliminato.'); }
        catch (error) { setStatus(error.message, true); } finally { setBusy(false); }
      });
      rowActions.append(editButton, email, remove); row.append(info, rowActions); list.append(row);
    }
    more.hidden = !campaignCursor;
  }
  settingsForm.addEventListener('submit', async event => {
    event.preventDefault(); if (working || disposed || !settingsForm.reportValidity()) return;
    const values = emptyShopSettings(); for (const key of Object.keys(values)) if (key !== 'hours') values[key] = settingsForm.elements.namedItem(key).value.trim();
    values.hours = SHOP_DAYS.map((_, index) => settingsForm.elements.namedItem(`hours-${index}`).value.trim());
    setBusy(true);
    try { await saveShopSettings(user, values); setStatus('Dati del negozio salvati. Le pagine pubbliche li caricheranno alla prossima apertura.'); }
    catch (error) { setStatus(error.message, true); } finally { setBusy(false); }
  });
  campaignForm.addEventListener('submit', async event => {
    event.preventDefault(); if (working || disposed || !campaignForm.reportValidity()) return;
    setBusy(true);
    try {
      const values = { ...Object.fromEntries(['kind', 'title', 'body', 'categoryId', 'ctaLabel', 'ctaPath', 'image', 'imageAlt'].map(key => [key, inputValue(key)])), startAt: fromRomeInput(inputValue('startAt')), endAt: fromRomeInput(inputValue('endAt')), productIds: [...selectedProducts], published: published.checked };
      const record = await saveCampaign(user, selectedId, values); if (!alive()) return;
      const index = campaigns.findIndex(item => item.id === record.id); if (index < 0) campaigns.unshift(record); else campaigns[index] = record;
      renderList(); edit(record); setStatus(record.published ? 'Contenuto salvato e pubblicato. La home rispetta il periodo indicato.' : 'Bozza salvata. Solo il gestore può leggerla.');
    } catch (error) { setStatus(error.message, true); } finally { setBusy(false); }
  });
  newButton.addEventListener('click', () => { edit(); campaignForm.elements.namedItem('title').focus(); }); cancel.addEventListener('click', () => edit());
  productSearch.addEventListener('input', renderProducts);
  moreProducts.addEventListener('click', async () => {
    if (working || !catalogCursor) return; moreProducts.disabled = true;
    try { const next = await loadManagerCatalogPage({ cursor: catalogCursor, pageSize: 50 }); if (!alive()) return; products.push(...next.products); catalogCursor = next.nextCursor; renderProducts(); }
    catch (error) { setStatus(error.message, true); } finally { moreProducts.disabled = false; }
  });
  more.addEventListener('click', async () => {
    if (working || !campaignCursor) return; setBusy(true);
    try { const next = await listManagerCampaigns(user, { cursor: campaignCursor }); if (!alive()) return; const ids = new Set(campaigns.map(item => item.id)); campaigns.push(...next.records.filter(item => !ids.has(item.id))); campaignCursor = next.cursor; renderList(); }
    catch (error) { setStatus(error.message, true); } finally { setBusy(false); }
  });
  Promise.all([getPublicShopSettings(), listManagerCampaigns(user), loadManagerCatalogPage({ pageSize: 50 }), getBusiness().catch(() => null)]).then(([settings, saved, catalog, business]) => {
    if (!alive()) return;
    for (const [key, value] of Object.entries(settings)) if (key !== 'hours') settingsForm.elements.namedItem(key).value = value;
    settings.hours.forEach((value, index) => { settingsForm.elements.namedItem(`hours-${index}`).value = value; });
    if (business) { const fallback = { ...business.address, phoneDisplay: business.phoneDisplay, phoneHref: business.phoneHref, email: business.email }; for (const [key, value] of Object.entries(fallback)) { const control = settingsForm.elements.namedItem(key); if (control && typeof value === 'string') control.placeholder = value; } }
    campaigns = saved.records; campaignCursor = saved.cursor; categories = catalog.categories; products = catalog.products; catalogCursor = catalog.nextCursor;
    for (const category of categories) { const option = element('option', '', `${category.name}${category.published ? '' : ' (bozza)'}`); option.value = category.id; categorySelect.append(option); }
    renderList(); edit(); setBusy(false); setStatus('Impostazioni e contenuti pronti.');
  }).catch(error => { setStatus(error.message || 'I contenuti non sono disponibili. Ricarica la pagina per riprovare.', true); });
  return () => { disposed = true; container.hidden = true; container.inert = true; container.replaceChildren(); };
}
