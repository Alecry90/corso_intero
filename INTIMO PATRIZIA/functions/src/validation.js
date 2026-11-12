import sharp from 'sharp';
import { createHash } from 'node:crypto';

export const MAX_IMAGE_BYTES = 300 * 1024;
export const LIMITS = Object.freeze({ categories: 50, products: 200 });

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const bad = (message) => { throw new ApiError(400, 'invalid-input', message); };
export const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id);
export function assertId(id) { if (!validId(id)) bad('Identificativo non valido.'); return id; }
function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad('Invia un oggetto JSON.');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) bad(`Campo non consentito: ${key}.`);
}
function text(value, field, max, required = false) {
  if (value === undefined) value = '';
  if (typeof value !== 'string') bad(`${field}: usa un testo.`);
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cleaned)) bad(`${field}: testo non valido (massimo ${max} caratteri).`);
  return cleaned;
}
function bool(value, field, fallback = true) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') bad(`${field}: usa vero o falso.`);
  return value;
}
function order(value) {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0 || value > 9999) bad('Ordine: scegli un intero tra 0 e 9999.');
  return value;
}
function list(value, field, maxItems = 20) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) bad(`${field}: massimo ${maxItems} valori.`);
  return [...new Set(value.map((v) => text(v, field, 50, true)))];
}
function asset(value) {
  const path = text(value, 'Immagine', 250);
  if (path && !/^\/assets\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:png|jpe?g|webp|avif|svg)$/i.test(path)) bad('Immagine: usa un file presente in /assets/.');
  return path;
}
export function categoryInput(body) {
  object(body, ['name', 'slug', 'description', 'order', 'published', 'image']);
  const name = text(body.name, 'Nome categoria', 100, true);
  const slug = body.slug === undefined ? name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : text(body.slug, 'Slug', 100, true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) bad('Slug: usa lettere minuscole, numeri e trattini.');
  return { name, slug, description: text(body.description, 'Descrizione', 1500), order: order(body.order), published: bool(body.published, 'Pubblicata'), image: asset(body.image) };
}
export async function productInput(body, id) {
  object(body, ['name', 'categoryId', 'description', 'price', 'sizes', 'colors', 'material', 'image', 'imageAlt', 'available', 'published', 'isDemo', 'order', 'imageData', 'removeImage']);
  const categoryId = assertId(body.categoryId);
  let price = body.price ?? null;
  if (price !== null && (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 100000 || Math.abs(price * 100 - Math.round(price * 100)) > 1e-6)) bad('Prezzo: usa un importo in euro con massimo due decimali, oppure null.');
  const removeImage = bool(body.removeImage, 'Rimuovi immagine', false);
  if (removeImage && body.imageData) bad('Scegli se caricare oppure rimuovere la foto.');
  const record = {
    name: text(body.name, 'Nome prodotto', 160, true), categoryId,
    description: text(body.description, 'Descrizione', 3000), price,
    sizes: list(body.sizes, 'Taglie'), colors: list(body.colors, 'Colori'), material: text(body.material, 'Materiale', 200),
    imageAlt: text(body.imageAlt, 'Testo alternativo', 250), available: bool(body.available, 'Disponibile'), published: bool(body.published, 'Pubblicato'),
    isDemo: bool(body.isDemo, 'Esempio', false), order: order(body.order)
  };
  // Omission preserves the current image; explicit empty image or removeImage removes it.
  if (body.image !== undefined) record.image = body.image === `/api/images/${id}` ? body.image : asset(body.image);
  let imageDocument;
  if (body.imageData !== undefined) {
    imageDocument = await validateImage(body.imageData);
    record.image = `/api/images/${id}`;
  }
  if (removeImage) record.image = '';
  return { record, imageDocument, removeImage };
}
export async function validateImage(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > (MAX_IMAGE_BYTES * 4 / 3) + 100) bad('La foto supera 300 KiB. Riduci le dimensioni prima del caricamento.');
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2].length % 4 !== 0) bad('Sono ammesse foto JPEG, PNG o WebP in Base64 valido.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== match[2]) bad('Base64 non valido oppure immagine oltre 300 KiB.');
  const magic = bytes.subarray(0, 12);
  const actual = magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff ? 'jpeg' : magic.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png' : magic.subarray(0,4).toString() === 'RIFF' && magic.subarray(8,12).toString() === 'WEBP' ? 'webp' : null;
  if (actual !== match[1]) bad('Il contenuto della foto non corrisponde al formato dichiarato.');
  try {
    const image = sharp(bytes, { limitInputPixels: 16_777_216, failOn: 'warning', animated: false });
    const meta = await image.metadata();
    if (meta.format !== actual || !meta.width || !meta.height || meta.width > 4096 || meta.height > 4096 || meta.width < 16 || meta.height < 16 || (meta.pages && meta.pages > 1)) bad('Usa una foto statica tra 16 e 4096 pixel per lato.');
    // Decode fully and strip EXIF/location metadata. Firestore receives only a normalized static bitmap.
    const output = await image.rotate().webp({ quality: 82, effort: 4 }).toBuffer();
    if (output.length > MAX_IMAGE_BYTES) bad('La foto convertita supera 300 KiB. Riducila e riprova.');
    const base64 = output.toString('base64');
    if (Buffer.byteLength(JSON.stringify({ base64 })) > 450_000) bad('La foto supera lo spazio massimo consentito.');
    return { base64, mime: 'image/webp', bytes: output.length, width: meta.width, height: meta.height, hash: createHash('sha256').update(output).digest('hex') };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    bad('Foto non leggibile. Esporta un nuovo JPEG, PNG o WebP.');
  }
}
