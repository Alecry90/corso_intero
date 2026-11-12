import { FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { ApiError, LIMITS } from './validation.js';

const categoryFields = ['name', 'slug', 'description', 'order', 'published', 'image'];
const productFields = ['name', 'categoryId', 'description', 'price', 'sizes', 'colors', 'material', 'image', 'imageAlt', 'available', 'published', 'isDemo', 'order'];
const view = (doc, fields) => ({ id: doc.id, ...Object.fromEntries(fields.filter((key) => doc.data()[key] !== undefined).map((key) => [key, doc.data()[key]])) });
const missing = (thing) => { throw new ApiError(404, 'not-found', `${thing} non trovato.`); };

export class FirestoreCatalogRepository {
  constructor(db) {
    this.db = db;
    this.categories = db.collection('categories');
    this.products = db.collection('products');
    this.images = db.collection('productImages');
    this.meta = db.collection('catalogMeta').doc('inventory');
  }
  newProductId() { return this.products.doc().id; }
  async catalogVersion() {
    const meta = await this.meta.get();
    const revision = meta.exists ? meta.data().revision : undefined;
    return typeof revision === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(revision) ? revision : 'initial';
  }
  async counts(transaction, meta) {
    if (meta.exists) return { categoryCount: meta.data().categoryCount || 0, productCount: meta.data().productCount || 0 };
    const [categories, products] = await Promise.all([
      transaction.get(this.categories.limit(LIMITS.categories + 1)),
      transaction.get(this.products.limit(LIMITS.products + 1))
    ]);
    return { categoryCount: categories.size, productCount: products.size };
  }
  async catalog(includeDrafts = false) {
    const categoryQuery = includeDrafts ? this.categories : this.categories.where('published', '==', true);
    const productQuery = includeDrafts ? this.products : this.products.where('published', '==', true);
    const [categories, products] = await Promise.all([
      categoryQuery.limit(LIMITS.categories + 1).get(),
      productQuery.limit(LIMITS.products + 1).get()
    ]);
    return {
      categories: categories.docs.slice(0, LIMITS.categories).map((doc) => view(doc, categoryFields)),
      products: products.docs.slice(0, LIMITS.products).filter((doc) => includeDrafts || doc.data().isDemo !== true).map((doc) => view(doc, productFields)),
      truncated: categories.size > LIMITS.categories || products.size > LIMITS.products
    };
  }
  async saveCategory(id, record) {
    const ref = id ? this.categories.doc(id) : this.categories.doc();
    await this.db.runTransaction(async (transaction) => {
      const [old, meta, sameSlug] = await Promise.all([transaction.get(ref), transaction.get(this.meta), transaction.get(this.categories.where('slug', '==', record.slug).limit(2))]);
      if (id && !old.exists) missing('Categoria');
      if (sameSlug.docs.some((doc) => doc.id !== ref.id)) throw new ApiError(409, 'duplicate-slug', 'Questo identificativo è già usato da un’altra categoria.');
      const counts = await this.counts(transaction, meta);
      if (!old.exists && counts.categoryCount >= LIMITS.categories) throw new ApiError(409, 'catalog-limit', `Limite di ${LIMITS.categories} categorie raggiunto.`);
      transaction.set(ref, { ...record, productCount: old.exists ? old.data().productCount || 0 : 0, updatedAt: FieldValue.serverTimestamp() });
      transaction.set(this.meta, { ...counts, categoryCount: counts.categoryCount + (old.exists ? 0 : 1), revision: randomUUID(), updatedAt: FieldValue.serverTimestamp() });
    });
    return { id: ref.id, ...record };
  }
  async deleteCategory(id) {
    const ref = this.categories.doc(id);
    await this.db.runTransaction(async (transaction) => {
      const [old, meta, products] = await Promise.all([
        transaction.get(ref), transaction.get(this.meta), transaction.get(this.products.where('categoryId', '==', id).limit(1))
      ]);
      if (!old.exists) missing('Categoria');
      if (!products.empty) throw new ApiError(409, 'category-not-empty', 'Sposta o elimina prima i prodotti di questa categoria.');
      const counts = await this.counts(transaction, meta);
      transaction.delete(ref);
      transaction.set(this.meta, { ...counts, categoryCount: Math.max(0, counts.categoryCount - 1), revision: randomUUID(), updatedAt: FieldValue.serverTimestamp() });
    });
  }
  async saveProduct(id, { record, imageDocument, removeImage }, create) {
    const ref = this.products.doc(id);
    let saved;
    await this.db.runTransaction(async (transaction) => {
      const categoryRef = this.categories.doc(record.categoryId);
      const [old, category, meta] = await Promise.all([transaction.get(ref), transaction.get(categoryRef), transaction.get(this.meta)]);
      if (!create && !old.exists) missing('Prodotto');
      if (create && old.exists) throw new ApiError(409, 'already-exists', 'Questo prodotto esiste già.');
      if (!category.exists) throw new ApiError(400, 'invalid-category', 'Scegli una categoria esistente.');
      const previous = old.exists ? old.data() : {};
      const moved = old.exists && previous.categoryId !== record.categoryId;
      const oldCategoryRef = moved ? this.categories.doc(previous.categoryId) : null;
      const oldCategory = oldCategoryRef ? await transaction.get(oldCategoryRef) : null;
      const counts = await this.counts(transaction, meta);
      if (create && counts.productCount >= LIMITS.products) throw new ApiError(409, 'catalog-limit', `Limite di ${LIMITS.products} prodotti raggiunto.`);
      saved = { ...record, image: record.image === undefined ? previous.image || '' : record.image };
      if (saved.image === `/api/images/${id}` && !imageDocument && previous.image !== saved.image) throw new ApiError(400, 'invalid-image', 'Carica la foto prima di utilizzarla.');
      transaction.set(ref, { ...saved, updatedAt: FieldValue.serverTimestamp() });
      // Every product create/move touches its category, making category deletion conflict safely.
      transaction.update(categoryRef, { productCount: Math.max(0, (category.data().productCount || 0) + (create || moved ? 1 : 0)), updatedAt: FieldValue.serverTimestamp() });
      if (oldCategory?.exists) transaction.update(oldCategoryRef, { productCount: Math.max(0, (oldCategory.data().productCount || 0) - 1), updatedAt: FieldValue.serverTimestamp() });
      if (imageDocument) transaction.set(this.images.doc(id), { ...imageDocument, updatedAt: FieldValue.serverTimestamp() });
      else if (removeImage || (record.image !== undefined && record.image !== `/api/images/${id}`)) transaction.delete(this.images.doc(id));
      transaction.set(this.meta, { ...counts, productCount: counts.productCount + (create ? 1 : 0), revision: randomUUID(), updatedAt: FieldValue.serverTimestamp() });
    });
    return { id, ...saved };
  }
  async deleteProduct(id) {
    const ref = this.products.doc(id);
    await this.db.runTransaction(async (transaction) => {
      const [old, meta] = await Promise.all([transaction.get(ref), transaction.get(this.meta)]);
      if (!old.exists) missing('Prodotto');
      const categoryRef = this.categories.doc(old.data().categoryId);
      const category = await transaction.get(categoryRef);
      const counts = await this.counts(transaction, meta);
      transaction.delete(ref);
      transaction.delete(this.images.doc(id));
      if (category.exists) transaction.update(categoryRef, { productCount: Math.max(0, (category.data().productCount || 0) - 1), updatedAt: FieldValue.serverTimestamp() });
      transaction.set(this.meta, { ...counts, productCount: Math.max(0, counts.productCount - 1), revision: randomUUID(), updatedAt: FieldValue.serverTimestamp() });
    });
  }
  async publicImage(id) {
    const product = await this.products.doc(id).get();
    if (!product.exists || product.data().published !== true || product.data().isDemo === true || product.data().image !== `/api/images/${id}`) return null;
    const category = await this.categories.doc(product.data().categoryId).get();
    if (!category.exists || category.data().published !== true) return null;
    const image = await this.images.doc(id).get();
    return image.exists ? image.data() : null;
  }
  async adminImage(id) {
    const product = await this.products.doc(id).get();
    if (!product.exists || product.data().image !== `/api/images/${id}`) return null;
    const image = await this.images.doc(id).get();
    return image.exists ? image.data() : null;
  }
}
