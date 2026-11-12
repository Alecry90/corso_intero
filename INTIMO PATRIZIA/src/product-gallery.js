import { loadProductGallery } from './firestore-catalog.js';

const galleryCSS = `
.product-gallery{display:grid;gap:14px;width:100%;min-width:0;color:#422e29}
.product-gallery__stage{position:relative;display:grid;place-items:center;min-height:180px;background:#f5f0e8;border-radius:6px;overflow:hidden}
.product-gallery__zoom{display:block;width:100%;padding:0;border:0;background:transparent;cursor:zoom-in}
.product-gallery__photo{display:block;width:100%;height:min(52vh,480px);object-fit:contain}
.product-gallery__zoom-label{display:block;padding:10px;font:inherit;font-size:13px;text-align:center;text-decoration:underline;background:#fffaf4}
.product-gallery__controls{display:flex;align-items:center;justify-content:space-between;gap:12px}
.product-gallery__controls button,.product-gallery__close{min-width:44px;min-height:44px;border:1px solid #9b8278;background:#fffaf4;color:#422e29;border-radius:4px;font:inherit;cursor:pointer}
.product-gallery__count{font-size:14px;text-align:center}
.product-gallery__thumbs{display:flex;gap:10px;flex-wrap:wrap}
.product-gallery__thumb{width:72px;height:80px;padding:3px;border:1px solid #b3a398;background:#fffaf4;border-radius:4px;cursor:pointer}
.product-gallery__thumb[aria-pressed="true"]{border:3px solid #653d33;padding:1px}
.product-gallery__thumb img{display:block;width:100%;height:100%;object-fit:contain}
.product-gallery button:focus-visible,.product-gallery__lightbox button:focus-visible{outline:3px solid #5d382d;outline-offset:4px}
.product-gallery__status{margin:0;padding:24px;font-size:15px;text-align:center}
.product-gallery__lightbox{width:min(1000px,calc(100vw - 32px));max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);padding:18px;border:0;border-radius:8px;background:#fffaf4;color:#422e29}
.product-gallery__lightbox::backdrop{background:rgb(31 22 18 / 76%)}
.product-gallery__lightbox img{display:block;width:100%;height:min(70dvh,900px);object-fit:contain}
.product-gallery__lightbox-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}
.product-gallery__lightbox-title{margin:0;font-size:20px;font-weight:500}
.product-gallery__close{padding:8px 14px}
@media(max-width:600px){.product-gallery__photo{height:330px;max-height:55dvh}.product-gallery__thumb{width:62px;height:68px}.product-gallery__lightbox{padding:12px}}
`;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, label, text = label) {
  const node = element('button', className, text);
  node.type = 'button';
  node.setAttribute('aria-label', label);
  return node;
}

function safeSource(src) {
  if (typeof src !== 'string') return false;
  if (/^\/assets\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:png|jpe?g|webp|avif|svg)$/.test(src)) return true;
  try {
    const url = new URL(src);
    return url.protocol === 'blob:' && url.origin === location.origin;
  } catch { return false; }
}

/** Mount a bounded, keyboard-accessible photo gallery in a dedicated container.
 * Pass a product for Firestore loading, or [{slot,src,alt}] for resolved photos.
 * Destroy on detail close, visibility changes or product changes.
 */
export function mountProductGallery(container, product, { admin = false, signal, label = product?.name || 'Prodotto' } = {}) {
  if (!container?.append) throw new TypeError('La galleria richiede un contenitore.');
  if (!document.getElementById('product-gallery-styles')) {
    const style = element('style'); style.id = 'product-gallery-styles'; style.textContent = galleryCSS; document.head.append(style);
  }
  const controller = new AbortController();
  const wrapper = element('section', 'product-gallery');
  wrapper.setAttribute('aria-label', `Fotografie: ${label}`);
  const status = element('p', 'product-gallery__status', 'Caricamento fotografie…');
  status.setAttribute('role', 'status');
  wrapper.append(status);
  container.replaceChildren(wrapper);
  let destroyed = false;
  let release = () => {};
  let lightbox;
  let lightboxPhoto;
  let zoom;
  let images = [];
  let selected = 0;
  const cleanup = [];
  const listen = (target, event, listener) => { target.addEventListener(event, listener); cleanup.push(() => target.removeEventListener(event, listener)); };
  const closeZoom = () => {
    if (!lightbox?.open) return;
    lightbox.close();
    if (!destroyed && zoom?.isConnected) zoom.focus({ preventScroll: true });
  };

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    controller.abort();
    for (const remove of cleanup.splice(0)) remove();
    if (lightbox?.open) lightbox.close();
    lightbox?.remove();
    release();
    wrapper.remove();
    signal?.removeEventListener('abort', destroy);
  }
  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted) destroy();

  function render() {
    if (!images.length) { status.textContent = 'Fotografia non disponibile.'; return; }
    wrapper.replaceChildren();
    const stage = element('div', 'product-gallery__stage');
    zoom = button('product-gallery__zoom', `Ingrandisci la fotografia di ${label}`, '');
    const photo = element('img', 'product-gallery__photo'); photo.decoding = 'async';
    zoom.append(photo, element('span', 'product-gallery__zoom-label', 'Ingrandisci fotografia'));
    stage.append(zoom);
    wrapper.append(stage);
    const count = element('span', 'product-gallery__count'); count.setAttribute('aria-live', 'polite'); count.setAttribute('aria-atomic', 'true');
    const controls = element('div', 'product-gallery__controls');
    const previous = button('', 'Fotografia precedente', '←');
    const next = button('', 'Fotografia successiva', '→');
    controls.append(previous, count, next);
    controls.hidden = images.length < 2;
    wrapper.append(controls);
    const thumbs = element('div', 'product-gallery__thumbs');
    thumbs.setAttribute('role', 'group'); thumbs.setAttribute('aria-label', 'Scegli la fotografia');
    const thumbButtons = images.map((image, index) => {
      const thumb = button('product-gallery__thumb', `Mostra fotografia ${index + 1} di ${images.length}: ${image.alt}`, '');
      const miniature = element('img'); miniature.src = image.src; miniature.alt = ''; miniature.loading = 'lazy';
      thumb.append(miniature); thumbs.append(thumb);
      listen(thumb, 'click', () => select(index));
      return thumb;
    });
    thumbs.hidden = images.length < 2; wrapper.append(thumbs);
    lightbox = element('dialog', 'product-gallery__lightbox');
    const titleId = `gallery-title-${crypto.randomUUID()}`;
    lightbox.setAttribute('aria-labelledby', titleId);
    const header = element('div', 'product-gallery__lightbox-header');
    const title = element('h2', 'product-gallery__lightbox-title', label); title.id = titleId;
    const close = button('product-gallery__close', 'Chiudi ingrandimento', 'Chiudi');
    header.append(title, close);
    lightboxPhoto = element('img'); lightboxPhoto.decoding = 'async';
    lightbox.append(header, lightboxPhoto);
    document.body.append(lightbox);

    function select(index) {
      selected = (index + images.length) % images.length;
      const image = images[selected]; photo.src = image.src; photo.alt = image.alt;
      lightboxPhoto.src = image.src; lightboxPhoto.alt = image.alt;
      count.textContent = `Fotografia ${selected + 1} di ${images.length}`;
      thumbButtons.forEach((thumb, i) => thumb.setAttribute('aria-pressed', String(i === selected)));
    }
    const moveWithKeys = event => {
      if (event.altKey || event.ctrlKey || event.metaKey || images.length < 2) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); select(selected + (event.key === 'ArrowRight' ? 1 : -1)); }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); select(event.key === 'Home' ? 0 : images.length - 1); }
    };
    listen(wrapper, 'keydown', moveWithKeys);
    listen(lightbox, 'keydown', moveWithKeys);
    listen(previous, 'click', () => select(selected - 1));
    listen(next, 'click', () => select(selected + 1));
    listen(zoom, 'click', () => { if (!lightbox.open) { lightbox.showModal(); close.focus(); } });
    listen(close, 'click', closeZoom);
    listen(lightbox, 'cancel', event => { event.preventDefault(); closeZoom(); });
    listen(lightbox, 'click', event => { if (event.target !== lightbox) return; const rect = lightbox.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeZoom(); });
    select(0);
  }

  const ready = (async () => {
    try {
      if (destroyed) return;
      const result = Array.isArray(product) ? { images: product, release: () => {} } : await loadProductGallery(product, { admin, signal: controller.signal });
      if (destroyed) { result.release(); return; }
      release = result.release;
      images = result.images.filter(image => safeSource(image.src) && typeof image.alt === 'string' && image.alt.trim()).slice(0, 3);
      render();
    } catch (error) {
      release();
      if (!destroyed && error?.name !== 'AbortError') status.textContent = 'Le fotografie non sono disponibili in questo momento. Riprova riaprendo la scheda.';
    }
  })();
  return { destroy, ready };
}
