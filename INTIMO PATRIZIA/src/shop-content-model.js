export const SHOP_CONTENT_LIMITS = Object.freeze({ campaigns: 50, products: 12 });
export const SHOP_DAYS = Object.freeze(['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']);
const settingLimits = Object.freeze({ legalName: 160, streetNumber: 20, street: 160, postalCode: 12, city: 80, province: 30, country: 2, phoneDisplay: 40, phoneHref: 24, email: 254, whatsappNumber: 15, seoTitle: 80, seoDescription: 200 });
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const time = '(?:[01][0-9]|2[0-3]):[0-5][0-9]';
const hoursPattern = new RegExp(`^(?:|Chiuso|${time}-${time}(?:, ${time}-${time})?)$`);
export const emptyShopSettings = () => ({ ...Object.fromEntries(Object.keys(settingLimits).map(key => [key, ''])), hours: Array(7).fill('') });
function text(value, label, max, required = false, multiline = false) {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || (!multiline && /[\r\n\u2028\u2029]/u.test(value))) throw new TypeError(`${label}: inserisci un testo valido.`);
  const normalized = value.trim();
  if (normalized.length > max || (required && !normalized)) throw new TypeError(`${label}: ${required ? 'campo obbligatorio, ' : ''}massimo ${max} caratteri.`);
  return normalized;
}
export function normalizeShopSettings(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(key => ![...Object.keys(settingLimits), 'hours'].includes(key))) throw new TypeError('Le impostazioni contengono campi non consentiti.');
  const result = Object.fromEntries(Object.entries(settingLimits).map(([key, maximum]) => [key, text(values[key] ?? '', key, maximum)]));
  if (result.phoneHref && !/^tel:\+[0-9]{8,15}$/.test(result.phoneHref)) throw new TypeError('Telefono: usa il formato tel:+390805794644.');
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new TypeError('Inserisci un indirizzo email valido.');
  if (result.whatsappNumber && !/^[0-9]{8,15}$/.test(result.whatsappNumber)) throw new TypeError('WhatsApp: inserisci solo cifre, incluso il prefisso internazionale.');
  if (result.country && !/^[A-Z]{2}$/.test(result.country)) throw new TypeError('Paese: usa due lettere maiuscole, per esempio IT.');
  if (!Array.isArray(values.hours) || values.hours.length !== 7) throw new TypeError('Inserisci i sette giorni della settimana.');
  result.hours = values.hours.map(value => text(value, 'Orari', 40).replace(/[–—]/g, '-'));
  for (const value of result.hours) {
    if (!hoursPattern.test(value)) throw new TypeError('Orari: usa 09:00-13:00, 16:00-20:00 oppure Chiuso. Lascia vuoto un giorno non confermato.');
    if (value && value !== 'Chiuso') {
      const ranges = value.split(', ').map(range => range.split('-'));
      if (ranges.some(([from, to]) => from >= to) || (ranges.length === 2 && ranges[0][1] > ranges[1][0])) throw new TypeError('Gli intervalli degli orari devono essere ordinati, senza sovrapposizioni.');
    }
  }
  return result;
}
export function mergeBusinessSettings(business, settings = emptyShopSettings()) {
  const address = { ...business.address };
  for (const field of ['street', 'postalCode', 'city', 'province', 'country']) if (settings[field]) address[field] = settings[field];
  if (settings.streetNumber) address.streetNumber = settings.streetNumber;
  const contact = Object.fromEntries(['phoneDisplay', 'phoneHref', 'email'].filter(key => settings[key]).map(key => [key, settings[key]]));
  const hours = SHOP_DAYS.map((_, index) => settings.hours?.[index] || business.hours?.[index] || '');
  const addressChanged = Object.keys(address).some(key => address[key] !== business.address?.[key]);
  const mapsQuery = [business.name, [address.street, address.streetNumber].filter(Boolean).join(' '), [address.postalCode, address.city, address.province, address.country].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const maps = addressChanged ? { mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` } : {};
  return { ...business, ...contact, ...maps, address, legalName: settings.legalName || '', whatsappNumber: settings.whatsappNumber || '', hours, seoTitle: settings.seoTitle || '', seoDescription: settings.seoDescription || '' };
}
export function safeCampaignPath(value) {
  // Restrict calls to action to actual visitor pages and simple internal query/fragment values.
  return typeof value === 'string' && /^(?:\/(?:index|catalogo|contatti|chi-siamo|gallery)\.html)(?:\?[A-Za-z0-9_=%&.,+-]*)?(?:#[A-Za-z0-9_-]*)?$/.test(value) && !/%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i.test(value);
}
export function campaignDate(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? new Date(value) : typeof value?.toDate === 'function' ? value.toDate() : typeof value === 'string' ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) throw new TypeError('Inserisci una data valida tra il 2000 e il 2100.');
  return date;
}
export function normalizeCampaign(values) {
  const allowed = ['kind', 'title', 'body', 'startAt', 'endAt', 'categoryId', 'productIds', 'ctaLabel', 'ctaPath', 'image', 'imageAlt', 'published'];
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(key => !allowed.includes(key))) throw new TypeError('Il contenuto contiene campi non consentiti.');
  if (!['promotion', 'event', 'collection'].includes(values.kind)) throw new TypeError('Scegli promozione, evento o collezione.');
  const result = { kind: values.kind, title: text(values.title, 'Titolo', 120, true), body: text(values.body, 'Descrizione', 3000, true, true), startAt: campaignDate(values.startAt), endAt: campaignDate(values.endAt), categoryId: text(values.categoryId ?? '', 'Categoria', 80), productIds: values.productIds ?? [], ctaLabel: text(values.ctaLabel ?? '', 'Testo del link', 80), ctaPath: text(values.ctaPath ?? '', 'Link', 300), image: text(values.image ?? '', 'Immagine', 250), imageAlt: text(values.imageAlt ?? '', 'Testo alternativo', 250), published: values.published };
  if (typeof result.published !== 'boolean') throw new TypeError('Indica se il contenuto è pubblicato.');
  if (result.kind === 'event' && !result.startAt) throw new TypeError('Per un evento indica data e ora di inizio.');
  if (result.startAt && result.endAt && result.endAt <= result.startAt) throw new TypeError('La fine deve essere successiva all’inizio.');
  if (result.categoryId && !validId(result.categoryId)) throw new TypeError('Categoria non valida.');
  if (!Array.isArray(result.productIds) || result.productIds.length > SHOP_CONTENT_LIMITS.products || new Set(result.productIds).size !== result.productIds.length || result.productIds.some(id => !validId(id))) throw new TypeError('Scegli al massimo 12 prodotti diversi.');
  if (Boolean(result.ctaLabel) !== Boolean(result.ctaPath) || (result.ctaPath && !safeCampaignPath(result.ctaPath))) throw new TypeError('Compila testo e link del pulsante usando una pagina pubblica interna del sito.');
  if (result.image && !/^\/assets\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:png|jpe?g|webp|avif|svg)$/.test(result.image)) throw new TypeError('Usa un’immagine presente negli assets del sito; puoi collegare sotto i prodotti con le loro foto.');
  if (result.image && !result.imageAlt) throw new TypeError('Descrivi l’immagine nel testo alternativo.');
  return { ...result, productIds: [...result.productIds] };
}
export function visibleCampaigns(records, now = new Date()) {
  return records.filter(record => record.published === true && (!record.endAt || campaignDate(record.endAt) > now) && (record.kind === 'event' || !record.startAt || campaignDate(record.startAt) <= now)).sort((a, b) => (campaignDate(a.startAt)?.getTime() ?? 0) - (campaignDate(b.startAt)?.getTime() ?? 0));
}
const dateFormatter = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export function formatCampaignDates(record) {
  const from = campaignDate(record.startAt), to = campaignDate(record.endAt);
  if (from && to) return `${dateFormatter.format(from)} – ${dateFormatter.format(to)}`;
  return from ? `${record.kind === 'event' ? '' : 'Dal '}${dateFormatter.format(from)}` : to ? `Fino al ${dateFormatter.format(to)}` : '';
}
const romeParts = date => Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
export function toRomeInput(value) {
  const date = campaignDate(value); if (!date) return '';
  const p = romeParts(date); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function fromRomeInput(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new TypeError('Inserisci una data e un’ora valide.');
  const base = new Date(`${value}:00Z`); let date = base;
  for (let iteration = 0; iteration < 4; iteration++) {
    const p = romeParts(date);
    const represented = new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    date = new Date(date.getTime() + base.getTime() - represented.getTime());
  }
  if (toRomeInput(date) !== value) throw new TypeError('Questa ora non esiste nel fuso Europe/Rome: scegli un altro orario.');
  return campaignDate(date);
}
export function businessStructuredData(business, origin) {
  const address = business.address || {};
  const data = { '@context': 'https://schema.org', '@type': 'ClothingStore', name: business.name || 'Intimo Patrizia', address: { '@type': 'PostalAddress', streetAddress: [address.street, address.streetNumber].filter(Boolean).join(' '), addressLocality: address.city, postalCode: address.postalCode, addressRegion: address.province, addressCountry: address.country } };
  for (const key of Object.keys(data.address)) if (data.address[key] === undefined || data.address[key] === '') delete data.address[key];
  if (business.legalName) data.legalName = business.legalName;
  if (business.phoneHref) data.telephone = business.phoneHref.replace(/^tel:/, '');
  if (business.email) data.email = business.email;
  if (/^https?:\/\//.test(origin || '')) data.url = new URL('/index.html', origin).href;
  const schemaDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hours = (business.hours || []).flatMap((value, index) => value && value !== 'Chiuso' ? value.split(', ').map(range => { const [opens, closes] = range.split('-'); return { '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${schemaDays[index]}`, opens, closes }; }) : value === 'Chiuso' ? [{ '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${schemaDays[index]}`, opens: '00:00', closes: '00:00' }] : []);
  if (hours.length) data.openingHoursSpecification = hours;
  return data;
}
