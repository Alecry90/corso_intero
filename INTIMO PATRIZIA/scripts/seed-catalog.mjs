import { readFile } from 'node:fs/promises';
import { services } from './firebase-cli-common.mjs';
import { assertId, categoryInput, productInput, LIMITS } from '../functions/src/validation.js';

const { db, projectId } = services();
const source = JSON.parse(await readFile(new URL('../public/data/demo-catalog.json', import.meta.url), 'utf8'));
if (!Array.isArray(source.categories) || !Array.isArray(source.products) || source.categories.length > LIMITS.categories || source.products.length > LIMITS.products) throw new Error('Catalogo di esempio non valido.');
const categories = source.categories.map(({ id, ...body }) => ({ id: assertId(id), ...categoryInput(body) }));
if (new Set(categories.map((c) => c.id)).size !== categories.length) throw new Error('Categorie duplicate.');
const products = [];
for (const { id, ...body } of source.products) {
  assertId(id);
  const { record } = await productInput({ ...body, isDemo: true }, id);
  if (!categories.some((c) => c.id === record.categoryId)) throw new Error(`Categoria mancante per ${id}.`);
  if (record.image?.startsWith('/api/')) throw new Error('Il seed accetta solo immagini statiche /assets/.');
  products.push({ id, ...record, image: record.image || '' });
}
if (new Set(products.map((p) => p.id)).size !== products.length) throw new Error('Prodotti duplicati.');
await db.runTransaction(async (transaction) => {
  const [existingCategories, existingProducts, meta] = await Promise.all([
    transaction.get(db.collection('categories').limit(1)),
    transaction.get(db.collection('products').limit(1)),
    transaction.get(db.collection('catalogMeta').doc('inventory'))
  ]);
  if (!existingCategories.empty || !existingProducts.empty || meta.exists) throw new Error('Il catalogo non è vuoto: seed annullato per preservare i dati.');
  for (const { id, ...record } of categories) transaction.create(db.collection('categories').doc(id), { ...record, productCount: products.filter((p) => p.categoryId === id).length });
  for (const { id, ...record } of products) transaction.create(db.collection('products').doc(id), record);
  transaction.create(db.collection('catalogMeta').doc('inventory'), { categoryCount: categories.length, productCount: products.length });
});
console.log(`Inserite ${categories.length} categorie e ${products.length} prodotti dimostrativi in ${projectId}.`);
