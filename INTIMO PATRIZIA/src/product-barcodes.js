// A GTIN is an identifier, never a numeric quantity or an article description.
// Preserve its printed representation; padding is used only for comparisons.
export function normalizeGTIN(value) {
  if (typeof value !== 'string') throw new TypeError('Scrivi il codice a barre come testo, mantenendo gli zeri iniziali.');
  const code = value.trim();
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code) || /^0+$/.test(code)) {
    throw new TypeError('Servono le 8, 12, 13 o 14 cifre complete del codice EAN/UPC/GTIN.');
  }
  let sum = 0;
  for (let index = code.length - 2, weight = 3; index >= 0; index--, weight = weight === 3 ? 1 : 3) sum += Number(code[index]) * weight;
  if ((10 - sum % 10) % 10 !== Number(code.at(-1))) throw new TypeError('La cifra di controllo non corrisponde: ricontrolla tutte le cifre del codice.');
  return code;
}

export function gtinKey(value) { return normalizeGTIN(value).padStart(14, '0'); }

export function equivalentGTINs(value) {
  const canonical = gtinKey(value);
  return [8, 12, 13, 14].filter(length => /^0*$/.test(canonical.slice(0, 14 - length))).map(length => canonical.slice(-length));
}
