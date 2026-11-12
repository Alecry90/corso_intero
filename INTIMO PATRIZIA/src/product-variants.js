// Availability lives on the existing product document. An empty map retains
// the catalogue's general availability without inventing size/colour pairs.
const MAX_VARIANTS = 100;
const normalized = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it').trim();
const plainMap = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const invalid = message => { throw new TypeError(`Disponibilità per variante: ${message}`); };

function dimensionLabels(values, label) {
  if (!Array.isArray(values) || values.length > 20) invalid(`${label}, massimo 20 valori.`);
  if (values.some(value => typeof value !== 'string' || !value.trim() || value.length > 50 || /[|~\u0000-\u001f\u007f]/.test(value))) invalid(`${label}, usa nomi di massimo 50 caratteri senza | o ~.`);
  if (new Set(values.map(normalized)).size !== values.length) invalid(`${label}, i nomi devono essere distinti anche ignorando maiuscole e accenti.`);
  return new Set(values);
}

export function normalizeVariantAvailability(value, { sizes = [], colors = [] } = {}) {
  if (value === undefined) return undefined;
  if (!plainMap(value)) invalid('invia una mappa di combinazioni e valori vero o falso.');
  const entries = Object.entries(value);
  if (entries.length > MAX_VARIANTS) invalid('massimo 100 combinazioni.');
  if (!entries.length) return {};
  const sizeLabels = dimensionLabels(sizes, 'Taglie');
  const colorLabels = dimensionLabels(colors, 'Colori');
  if (!sizeLabels.size && !colorLabels.size) invalid('aggiungi almeno una taglia o un colore.');
  for (const [key, available] of entries) {
    if (typeof available !== 'boolean') invalid('ogni combinazione richiede vero o falso.');
    const parts = key.split('|');
    if (parts.length !== 2) invalid('la chiave deve essere taglia|colore.');
    const [size, color] = parts;
    if ((sizeLabels.size ? !sizeLabels.has(size) : size !== '') || (colorLabels.size ? !colorLabels.has(color) : color !== '')) invalid('ogni combinazione deve usare le taglie e i colori del prodotto.');
  }
  return Object.fromEntries(entries);
}

export function hasDetailedAvailability(product) {
  return plainMap(product?.variantAvailability) && Object.keys(product.variantAvailability).length > 0;
}

export function variantRows(product) {
  if (!hasDetailedAvailability(product)) return [];
  let availability;
  // Rules can validate the bounded shape without checking every label's exact
  // membership. A direct SDK write must not make public rendering throw or
  // advertise an invalid offer. Writes still use the strict validator above.
  try { availability = normalizeVariantAvailability(product.variantAvailability, product); }
  catch { return []; }
  return Object.entries(availability).map(([key, available]) => {
    const [size, color] = key.split('|');
    return { key, size, color, available: product.available !== false && available };
  });
}

export function productIsAvailable(product) {
  return product?.available !== false && (!hasDetailedAvailability(product) || variantRows(product).some(row => row.available));
}

function matchingRows(product, size, color) {
  const wantedSize = normalized(size), wantedColor = normalized(color);
  return variantRows(product).filter(row => (!wantedSize || normalized(row.size) === wantedSize) && (!wantedColor || normalized(row.color) === wantedColor));
}

export function matchesVariantSelection(product, { size = '', color = '', availableOnly = false } = {}) {
  if (hasDetailedAvailability(product)) {
    return matchingRows(product, size, color).some(row => !availableOnly || row.available);
  }
  const matchesList = (values, selection) => !normalized(selection) || (Array.isArray(values) && values.some(value => normalized(value) === normalized(selection)));
  return matchesList(product?.sizes, size) && matchesList(product?.colors, color) && (!availableOnly || productIsAvailable(product));
}

export function variantSelectionStatus(product, { size = '', color = '' } = {}) {
  if (!hasDetailedAvailability(product)) return 'legacy';
  const rows = matchingRows(product, size, color);
  if (!rows.length) return 'not-offered';
  if (!rows.some(row => row.available)) return 'unavailable';
  if ((product.sizes?.length && !normalized(size)) || (product.colors?.length && !normalized(color))) return 'choose';
  return 'available';
}
