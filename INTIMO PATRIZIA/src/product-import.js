export const PRODUCT_CSV_HEADERS = ['codice','nome','reparto','prezzo','taglie','colori','tessuto','descrizione','marca','foto','foto_2','foto_3'];
export const productCodeKey = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('it');

export function parseProductCSV(source) {
  if (typeof source !== 'string' || source.length > 512000) throw new Error('Il foglio deve essere un CSV di massimo 500 KB.');
  const text = source.replace(/^\uFEFF/, '');
  const delimiter = text.slice(0, text.search(/[\r\n]/) < 0 ? text.length : text.search(/[\r\n]/)).includes(';') ? ';' : ',';
  const rows = []; let row = []; let cell = ''; let quoted = false; let closedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      if (character === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (character === '"') { quoted = false; closedQuote = true; }
      else cell += character;
      continue;
    }
    if (character === '"') {
      if (cell || closedQuote) throw new Error('Virgolette non valide nel CSV. Esporta nuovamente il foglio come CSV UTF-8.');
      quoted = true;
    } else if (character === delimiter || character === '\r' || character === '\n') {
      row.push(cell); cell = ''; closedQuote = false;
      if (character !== delimiter) { if (row.some(value => value.trim())) rows.push(row); row = []; if (character === '\r' && text[i + 1] === '\n') i++; }
    } else {
      if (closedQuote && character.trim()) throw new Error('Caratteri dopo le virgolette di chiusura nel CSV.');
      if (!closedQuote) cell += character;
    }
  }
  if (quoted) throw new Error('Una cella del CSV contiene virgolette non chiuse.');
  row.push(cell); if (row.some(value => value.trim())) rows.push(row);
  const headers = rows.shift()?.map(value => value.trim().toLowerCase()) || [];
  if (!['codice','nome','reparto'].every(header => headers.includes(header))) throw new Error('Servono le colonne codice, nome e reparto. Scarica il modello vuoto.');
  if (new Set(headers).size !== headers.length || headers.some(header => !PRODUCT_CSV_HEADERS.includes(header))) throw new Error('Colonne duplicate o sconosciute. Usa le intestazioni del modello CSV.');
  if (!rows.length || rows.length > 50) throw new Error('Inserisci da 1 a 50 prodotti per importazione.');
  return rows.map((values,index) => {
    if (values.length !== headers.length) throw new Error(`Riga ${index + 2}: numero di colonne diverso dall’intestazione.`);
    return Object.fromEntries(headers.map((header,i) => [header, values[i].trim()]));
  });
}

export function planProductImport(rows, categories, existing = []) {
  const knownCodes = new Set(existing.map(product => productCodeKey(product.sku)).filter(Boolean));
  const seen = new Set();
  const shortText = (value, maximum, label) => {
    if ((value || '').length > maximum || /[\u0000-\u001f\u007f]/.test((value || '').replace(/[\r\n\t]/g, ' '))) throw new Error(`${label} non valido o troppo lungo.`);
    return value || '';
  };
  const list = value => {
    const values = [...new Set((value || '').split(/[|,]/).map(item => item.trim()).filter(Boolean))];
    if (values.length > 20 || values.some(item => item.length > 50)) throw new Error('Taglie e colori: massimo 20 voci di 50 caratteri.');
    return values;
  };
  return rows.map((row,index) => {
    try {
      const sku = shortText(row.codice,80,'Codice'); const name = shortText(row.nome,120,'Nome');
      if (!sku || !name) throw new Error('Codice e nome sono obbligatori.');
      const key = productCodeKey(sku);
      if (seen.has(key)) throw new Error('Codice ripetuto nel foglio.');
      seen.add(key);
      const category = categories.find(item => item.id === row.reparto || item.slug === row.reparto);
      if (!category) throw new Error('Reparto non riconosciuto: usa l’identificativo mostrato sotto al modulo.');
      const priceText = (row.prezzo || '').replace(',', '.');
      if (priceText && (!/^\d+(\.\d{1,2})?$/.test(priceText) || Number(priceText) > 100000)) throw new Error('Prezzo non valido: usa 19,90 oppure 19.90, senza simbolo euro.');
      const photos = [row.foto,row.foto_2,row.foto_3].map(value => (value || '').trim());
      if (photos.some(value => value && /[\\/\u0000-\u001f]/.test(value))) throw new Error('Foto: indica soltanto il nome del file, senza percorso.');
      return { line: index + 2, skip: knownCodes.has(key), photos, payload: {
        sku, name, categoryId: category.id, price: priceText ? Number(priceText) : null,
        sizes: list(row.taglie), colors: list(row.colori), material: shortText(row.tessuto,200,'Tessuto'),
        description: shortText(row.descrizione,3000,'Descrizione'), brand: shortText(row.marca,80,'Marca'),
        published: false, available: true, isDemo: false, featured: false, newArrival: false, order: 0,
        imageAlt: photos[0] ? name : '',
      } };
    } catch (error) { return { line: index + 2, error: error.message, name: row.nome || row.codice || '' }; }
  });
}
