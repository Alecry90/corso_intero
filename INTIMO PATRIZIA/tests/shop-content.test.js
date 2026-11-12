import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyShopSettings, normalizeShopSettings, mergeBusinessSettings, normalizeCampaign, safeCampaignPath, visibleCampaigns, fromRomeInput, toRomeInput, formatCampaignDates, businessStructuredData } from '../src/shop-content-model.js';
const campaign = overrides => ({ kind: 'promotion', title: 'Proposta reale del negozio', body: 'Condizioni inserite dal gestore.', startAt: null, endAt: null, categoryId: '', productIds: [], ctaLabel: '', ctaPath: '', image: '', imageAlt: '', published: false, ...overrides });
test('settings never invent opening hours, WhatsApp, legal name or street number', () => {
  const settings = normalizeShopSettings(emptyShopSettings());
  assert.equal(settings.whatsappNumber, ''); assert.equal(settings.legalName, ''); assert.equal(settings.streetNumber, ''); assert.deepEqual(settings.hours, Array(7).fill(''));
  const base = { name: 'Intimo Patrizia', address: { street: 'Via Ettore Fieramosca', city: 'Bari' }, email: 'negozio@example.test', phoneHref: 'tel:+390805794644' };
  const business = mergeBusinessSettings(base, settings);
  assert.equal(business.email, base.email); assert.deepEqual(business.address, base.address); assert.equal(business.whatsappNumber, '');
  const schema = businessStructuredData(business, 'https://example.test');
  assert.equal(schema.openingHoursSpecification, undefined); assert.equal(schema.legalName, undefined); assert.equal(schema.address.streetAddress, base.address.street);
});
test('Maps follows address overrides and preserves its original destination when the address is unchanged', () => {
  const base = { name: 'Intimo Patrizia', address: { street: 'Via Ettore Fieramosca', streetNumber: '94', postalCode: '70123', city: 'Bari', province: 'BA', country: 'IT' }, mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Intimo%20Patrizia%2C%20Via%20Ettore%20Fieramosca%2094%2C%20Bari' };
  assert.equal(mergeBusinessSettings(base).mapsUrl, base.mapsUrl);
  assert.equal(mergeBusinessSettings(base, normalizeShopSettings({ ...emptyShopSettings(), streetNumber: '94', email: 'nuovo@example.test' })).mapsUrl, base.mapsUrl);
  for (const [field, value] of Object.entries({ street: 'Via Nuova', streetNumber: '96', postalCode: '70124', city: 'Modugno', province: 'BR', country: 'FR' })) {
    const merged = mergeBusinessSettings(base, normalizeShopSettings({ ...emptyShopSettings(), [field]: value }));
    const target = new URL(merged.mapsUrl);
    assert.equal(target.origin + target.pathname, 'https://www.google.com/maps/search/');
    assert.equal(target.searchParams.get('api'), '1');
    assert.ok(target.searchParams.get('query').includes(base.name));
    assert.ok(target.searchParams.get('query').includes(value));
    assert.deepEqual(merged.address, { ...base.address, [field]: value });
  }
  const moved = mergeBusinessSettings(base, normalizeShopSettings({ ...emptyShopSettings(), streetNumber: '96' }));
  assert.equal(new URL(moved.mapsUrl).searchParams.get('query'), 'Intimo Patrizia, Via Ettore Fieramosca 96, 70123 Bari BA IT');
  assert.equal(base.address.streetNumber, '94');
});
test('confirmed hours survive empty settings and partial changes preserve the other days', () => {
  const base = { name: 'Intimo Patrizia', address: { street: 'Via Ettore Fieramosca', streetNumber: '94', city: 'Bari' }, hours: [...Array(6).fill('09:00-13:30, 17:00-20:30'), 'Chiuso'] };
  const unchanged = mergeBusinessSettings(base, normalizeShopSettings(emptyShopSettings()));
  assert.deepEqual(unchanged.hours, base.hours); assert.notEqual(unchanged.hours, base.hours);
  const settings = normalizeShopSettings({ ...emptyShopSettings(), hours: ['Chiuso', ...Array(4).fill(''), '10:00-12:00', ''] });
  const business = mergeBusinessSettings(base, settings);
  assert.deepEqual(business.hours, ['Chiuso', ...Array(4).fill('09:00-13:30, 17:00-20:30'), '10:00-12:00', 'Chiuso']);
  assert.deepEqual(base.hours, [...Array(6).fill('09:00-13:30, 17:00-20:30'), 'Chiuso']);
  const schema = businessStructuredData(business, 'https://example.test');
  assert.equal(schema.address.streetAddress, 'Via Ettore Fieramosca 94');
  assert.equal(schema.openingHoursSpecification.length, 11);
  assert.deepEqual(schema.openingHoursSpecification.filter(value => value.dayOfWeek === 'https://schema.org/Tuesday').map(({ opens, closes }) => [opens, closes]), [['09:00', '13:30'], ['17:00', '20:30']]);
  assert.deepEqual(schema.openingHoursSpecification.find(value => value.dayOfWeek === 'https://schema.org/Saturday'), { '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Saturday', opens: '10:00', closes: '12:00' });
  assert.equal(schema.openingHoursSpecification.find(value => value.dayOfWeek === 'https://schema.org/Sunday').opens, '00:00');
});
test('settings reject unknown data, invalid contacts and overlapping or malformed hours', () => {
  for (const patch of [{ ownerEmail: 'private@example.test' }, { whatsappNumber: '+390805794644' }, { phoneHref: 'javascript:alert(1)' }, { email: 'invalid' }, { country: 'Italia' }, { hours: ['10:00'] }, { hours: ['20:00-09:00', ...Array(6).fill('')] }, { hours: ['09:00-13:00, 12:00-20:00', ...Array(6).fill('')] }]) assert.throws(() => normalizeShopSettings({ ...emptyShopSettings(), ...patch }));
  const settings = normalizeShopSettings({ ...emptyShopSettings(), hours: ['09:00–13:00, 16:00–20:00', ...Array(5).fill(''), 'Chiuso'] });
  assert.equal(settings.hours[0], '09:00-13:00, 16:00-20:00');
  const schema = businessStructuredData(mergeBusinessSettings({ name: 'Intimo Patrizia', address: {} }, settings));
  assert.equal(schema.openingHoursSpecification.length, 3); assert.equal(schema.openingHoursSpecification[0].opens, '09:00');
});
test('campaign publishing enforces data limits, dates, linked products and internal destinations', () => {
  assert.equal(normalizeCampaign(campaign()).published, false);
  for (const patch of [{ ownerEmail: 'private' }, { title: '' }, { kind: 'unknown' }, { published: 'true' }, { productIds: Array(13).fill('p') }, { productIds: ['p', 'p'] }, { productIds: ['bad/id'] }, { categoryId: 'bad/id' }, { startAt: new Date('2026-10-21'), endAt: new Date('2026-10-20') }, { kind: 'event' }, { ctaLabel: 'Vai' }, { ctaLabel: 'Vai', ctaPath: 'https://external.test' }, { image: 'https://external.test/photo.jpg', imageAlt: 'Foto' }, { image: '/assets/photo.webp' }]) assert.throws(() => normalizeCampaign(campaign(patch)));
  assert.equal(normalizeCampaign(campaign({ productIds: ['a', 'b'], ctaLabel: 'Esplora', ctaPath: '/catalogo.html?prodotto=a' })).ctaPath, '/catalogo.html?prodotto=a');
  for (const path of ['//external.test', '/admin.html', '/catalogo.html?x=%2f%2fexternal', '/contatti.html?x=%0a', '/catalogo.html\\evil', 'javascript:alert(1)']) assert.equal(safeCampaignPath(path), false);
});
test('public presentation excludes drafts, expired promotions and future promotion windows while showing planned events', () => {
  const now = new Date('2026-10-21T10:00:00Z');
  const records = [campaign({ id: 'draft' }), campaign({ id: 'live', published: true }), campaign({ id: 'expired', published: true, endAt: new Date('2026-10-20') }), campaign({ id: 'future-promo', published: true, startAt: new Date('2026-11-01') }), campaign({ id: 'event', kind: 'event', published: true, startAt: new Date('2026-11-01') })];
  assert.deepEqual(visibleCampaigns(records, now).map(record => record.id), ['live', 'event']);
});
test('event input uses Europe/Rome including DST, independent of machine timezone', () => {
  assert.equal(fromRomeInput('2026-01-20T10:30').toISOString(), '2026-01-20T09:30:00.000Z');
  assert.equal(fromRomeInput('2026-07-20T10:30').toISOString(), '2026-07-20T08:30:00.000Z');
  assert.equal(toRomeInput(new Date('2026-07-20T08:30:00Z')), '2026-07-20T10:30');
  assert.throws(() => fromRomeInput('2026-03-29T02:30'), /non esiste/);
  assert.throws(() => fromRomeInput('2026-02-30T10:00'));
  assert.match(formatCampaignDates(campaign({ kind: 'event', startAt: new Date('2026-07-20T08:30:00Z') })), /10:30/);
});
