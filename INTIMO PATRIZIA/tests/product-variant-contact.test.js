import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Replace only browser bootstraps. The message builders and availability helper
// below are the production code; these tests never contact a service or send text.
const source = (await readFile(new URL('../src/product-contact.js', import.meta.url), 'utf8'))
  .replace("import { escapeHTML, getBusiness, icons } from './shared.js';", 'const escapeHTML = String, getBusiness = async () => ({}), icons = {};')
  .replace("import { getPublicShopSettings, mergeBusinessSettings } from './shop-content.js';", 'const getPublicShopSettings = async () => ({}), mergeBusinessSettings = business => business;')
  .replace("'./product-variants.js'", JSON.stringify(new URL('../src/product-variants.js', import.meta.url).href));
const { productRequestMessage, productContactLinks, productURL } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const product = {
  id: 'prodotto-1', name: 'Articolo blu & nero', sku: 'A-1', available: true,
  sizes: ['M', 'L'], colors: ['Blu', 'Nero'],
  variantAvailability: { 'M|Blu': true, 'L|Nero': false },
};
const business = { email: 'info@example.test', phoneHref: 'tel:+39000000000' };
const settings = { whatsappNumber: '39000000000' };
const url = productURL(product, 'https://example.test');
const messageFromEmail = value => new URL(value).searchParams.get('body');
const messageFromWhatsApp = value => new URL(value).searchParams.get('text');

test('prepared messages identify the actual available pair and preserve the product deep link', () => {
  const selection = { size: 'M', color: 'Blu', url };
  const message = productRequestMessage(product, selection);
  assert.match(message, /Taglia richiesta: M\nColore richiesto: Blu/);
  assert.match(message, /Disponibilità indicata per la combinazione: disponibile\./);
  assert.match(message, /https:\/\/example\.test\/catalogo\.html\?prodotto=prodotto-1/);
  const links = productContactLinks(product, business, settings, selection);
  assert.equal(messageFromEmail(links.email), message);
  assert.equal(messageFromWhatsApp(links.whatsapp), message);
  assert.equal(links.phone, business.phoneHref);
});

test('an exhausted pair remains available for an information request with its actual status', () => {
  const selection = { size: 'L', color: 'Nero', url };
  const message = productRequestMessage(product, selection);
  assert.match(message, /Taglia richiesta: L\nColore richiesto: Nero/);
  assert.match(message, /Disponibilità indicata per la combinazione: esaurita\./);
  const links = productContactLinks(product, business, settings, selection);
  assert.equal(messageFromEmail(links.email), message);
  assert.equal(messageFromWhatsApp(links.whatsapp), message);
});

test('a pair outside the offered combinations cannot prepare an email or WhatsApp message', () => {
  const selection = { size: 'M', color: 'Nero', url };
  assert.equal(productRequestMessage(product, selection), '');
  assert.deepEqual(productContactLinks(product, business, settings, selection), { email: '', whatsapp: '', phone: business.phoneHref });
});

test('global unavailability overrides a pair marked available in both message channels', () => {
  const unavailable = { ...product, available: false };
  const selection = { size: 'M', color: 'Blu', url };
  const links = productContactLinks(unavailable, business, settings, selection);
  assert.match(messageFromEmail(links.email), /combinazione: esaurita\./);
  assert.equal(messageFromEmail(links.email), messageFromWhatsApp(links.whatsapp));
});

test('a partial choice stays an inquiry and does not claim a complete available combination', () => {
  const message = productRequestMessage(product, { size: 'M', url });
  assert.match(message, /Taglia richiesta: M/);
  assert.doesNotMatch(message, /Colore richiesto/);
  assert.match(message, /da verificare dopo la scelta delle varianti/);
  assert.doesNotMatch(message, /combinazione: disponibile/);
});

test('a single managed dimension has a complete status without inventing the other dimension', () => {
  const sizesOnly = { ...product, colors: [], variantAvailability: { 'M|': true } };
  const message = productRequestMessage(sizesOnly, { size: 'M', url });
  assert.match(message, /combinazione: disponibile\./);
  assert.doesNotMatch(message, /Colore richiesto/);
});

test('legacy products and an empty map retain the original request text', () => {
  const legacy = { ...product };
  delete legacy.variantAvailability;
  const selection = { size: 'M', color: 'Nero', url };
  const expected = `Buongiorno, vorrei informazioni sulla disponibilità di questo articolo:\nArticolo blu & nero\nCodice: A-1\nTaglia richiesta: M\nColore richiesto: Nero\n${url}\nGrazie.`;
  assert.equal(productRequestMessage(legacy, selection), expected);
  assert.equal(productRequestMessage({ ...legacy, variantAvailability: {} }, selection), expected);
  assert.equal(messageFromEmail(productContactLinks(legacy, business, settings, selection).email), expected);
});
