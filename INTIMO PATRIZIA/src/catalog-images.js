import { getCatalogImage } from './firestore-catalog.js';

// Keep image documents separate from catalogue reads and fetch them near the viewport.
export function createCatalogImages() {
  const jobs = new Map();
  const urls = new Set();
  const bindings = new WeakMap();
  let generation = 0;
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      observer.unobserve(entry.target);
      bindings.get(entry.target)?.load();
    }
  }, { rootMargin: '300px' });

  function show(image, source, { admin = false } = {}) {
    const id = /^\/api\/images\/([A-Za-z0-9_-]+)$/.exec(source)?.[1];
    if (!id) { image.src = source; return; }
    const key = `${admin ? 'admin' : 'public'}:${id}`;
    const currentGeneration = generation;
    const current = bindings.get(image);
    if (current?.key === key && current.generation === generation) return;
    image.removeAttribute('src');
    const binding = { key, generation, load: async () => {
      try {
        if (!jobs.has(key)) jobs.set(key, getCatalogImage(id, { admin }).then(blob => {
          if (currentGeneration !== generation) return null;
          const url = URL.createObjectURL(blob);
          urls.add(url);
          return url;
        }).catch(error => { jobs.delete(key); throw error; }));
        const url = await jobs.get(key);
        if (url && image.isConnected && bindings.get(image) === binding && currentGeneration === generation) image.src = url;
      } catch {
        if (image.isConnected && bindings.get(image) === binding) image.alt = 'Fotografia non disponibile';
      }
    } };
    bindings.set(image, binding);
    if (observer) observer.observe(image);
    else binding.load();
  }

  function reset() {
    generation++;
    observer?.disconnect();
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
    jobs.clear();
  }
  window.addEventListener('pagehide', event => { if (!event.persisted) reset(); });
  return { show, reset };
}
