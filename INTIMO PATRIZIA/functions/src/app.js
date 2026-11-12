import express from 'express';
import { ApiError, LIMITS, assertId, categoryInput, productInput } from './validation.js';
import { isAllowedAdmin } from './admin-access.js';

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const sorted = (items) => items.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'it'));

export function createApi({ repository, verifyIdToken, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    // The Functions runtime may parse JSON before Express. Enforce the raw limit too.
    if (req.rawBody?.length > 500 * 1024) return next(new ApiError(413, 'payload-too-large', 'Dati troppo grandi. La foto deve essere inferiore a 300 KiB.'));
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) return next(new ApiError(415, 'unsupported-media', 'Invia dati in formato JSON.'));
    next();
  });
  app.use(express.json({ limit: '500kb', strict: true }));
  const authenticate = wrap(async (req, res, next) => {
    const token = /^Bearer (\S+)$/.exec(req.get('authorization') || '')?.[1];
    if (!token) throw new ApiError(401, 'unauthenticated', 'Accedi per continuare.');
    let decoded;
    try { decoded = await verifyIdToken(token, true); }
    catch { throw new ApiError(401, 'unauthenticated', 'Sessione scaduta o non valida. Accedi di nuovo.'); }
    req.identity = decoded;
    next();
  });
  app.get('/api/session', authenticate, (req, res) => {
    res.json({ canManageCatalog: isAllowedAdmin(req.identity) });
  });
  app.use('/api/admin', authenticate, (req, res, next) => {
    if (!isAllowedAdmin(req.identity)) return next(new ApiError(403, 'permission-denied', 'Questo account non è autorizzato a gestire il catalogo.'));
    req.adminUid = req.identity.uid;
    next();
  });
  const catalog = (includeDrafts) => wrap(async (req, res) => {
    const result = await repository.catalog(includeDrafts);
    const categories = sorted(result.categories);
    const ids = new Set(categories.map((c) => c.id));
    const products = sorted(result.products.filter((p) => ids.has(p.categoryId)));
    res.json({ categories, products, demo: false, limits: LIMITS, truncated: result.truncated });
  });
  app.get('/api/catalog/version', wrap(async (req, res) => {
    res.json({ version: await repository.catalogVersion() });
  }));
  app.get('/api/catalog', catalog(false));
  app.get('/api/admin/catalog', catalog(true));
  app.post('/api/admin/categories', wrap(async (req, res) => {
    const record = categoryInput(req.body);
    res.status(201).json({ category: await repository.saveCategory(null, record) });
  }));
  app.put('/api/admin/categories/:id', wrap(async (req, res) => {
    const id = assertId(req.params.id);
    res.json({ category: await repository.saveCategory(id, categoryInput(req.body)) });
  }));
  app.delete('/api/admin/categories/:id', wrap(async (req, res) => {
    await repository.deleteCategory(assertId(req.params.id));
    res.status(204).end();
  }));
  app.post('/api/admin/products', wrap(async (req, res) => {
    const id = repository.newProductId();
    const input = await productInput(req.body, id);
    res.status(201).json({ product: await repository.saveProduct(id, input, true) });
  }));
  app.put('/api/admin/products/:id', wrap(async (req, res) => {
    const id = assertId(req.params.id);
    res.json({ product: await repository.saveProduct(id, await productInput(req.body, id), false) });
  }));
  app.delete('/api/admin/products/:id', wrap(async (req, res) => {
    await repository.deleteProduct(assertId(req.params.id));
    res.status(204).end();
  }));
  app.get('/api/admin/images/:id', wrap(async (req, res) => {
    const image = await repository.adminImage(assertId(req.params.id));
    if (!image) throw new ApiError(404, 'not-found', 'Immagine non disponibile.');
    res.set({ 'Content-Type': image.mime, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'" });
    res.send(Buffer.from(image.base64, 'base64'));
  }));
  app.get('/api/images/:id', wrap(async (req, res) => {
    const image = await repository.publicImage(assertId(req.params.id));
    if (!image) throw new ApiError(404, 'not-found', 'Immagine non disponibile.');
    res.set({ 'Content-Type': image.mime, 'ETag': `"${image.hash}"`, 'Cache-Control': 'public, max-age=0, must-revalidate', 'Content-Security-Policy': "default-src 'none'" });
    if (req.get('if-none-match') === `"${image.hash}"`) return res.status(304).end();
    res.send(Buffer.from(image.base64, 'base64'));
  }));
  app.use((req, res) => res.status(404).json({ error: { code: 'not-found', message: 'Risorsa non disponibile.' } }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') return res.status(413).json({ error: { code: 'payload-too-large', message: 'Dati troppo grandi. La foto deve essere inferiore a 300 KiB.' } });
    if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: { code: 'invalid-json', message: 'JSON non valido.' } });
    if (error instanceof ApiError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    // Never log tokens, body contents, email addresses or images.
    logger.error('Catalog API error', { code: error.code || 'internal', method: req.method });
    res.status(500).json({ error: { code: 'internal', message: 'Il catalogo non è disponibile in questo momento. Riprova tra poco.' } });
  });
  return app;
}
