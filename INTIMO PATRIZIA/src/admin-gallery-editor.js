import { loadProductGallery } from './firestore-catalog.js';

export function createAdminGalleryEditor(container, { compress, onDirty = () => {} }) {
  let generation = 0;
  let slots = [];
  let release = () => {};
  container.innerHTML = `<fieldset class="admin-image-field"><legend>Altre fotografie</legend><p class="admin-small">Aggiungi retro e dettaglio del tessuto: al massimo tre foto in tutto, compresa la principale. Le modifiche vengono salvate insieme al prodotto.</p><div class="admin-extra-photo-grid">${[1,2].map(slot => `<div class="admin-field"><label for="gallery-file-${slot}">${slot === 1 ? 'Seconda fotografia' : 'Terza fotografia'}</label><div id="gallery-preview-${slot}" class="admin-image-preview"><span>Nessuna fotografia</span></div><input id="gallery-file-${slot}" type="file" accept="image/jpeg,image/png,image/webp,image/avif"><label for="gallery-alt-${slot}">Descrizione della nuova fotografia</label><input id="gallery-alt-${slot}" maxlength="250"><button id="gallery-remove-${slot}" type="button" class="admin-text-button">Rimuovi questa foto</button><p id="gallery-status-${slot}" class="admin-small" role="status"></p></div>`).join('')}</div></fieldset>`;
  const find = id => container.querySelector(`#${id}`);
  function preview(slot, src, alt = '') {
    const box = find(`gallery-preview-${slot}`);
    box.replaceChildren();
    if (!src) { const text = document.createElement('span'); text.textContent = 'Nessuna fotografia'; box.append(text); return; }
    const image = document.createElement('img'); image.src = src; image.alt = alt || 'Anteprima della fotografia aggiuntiva'; box.append(image);
  }
  async function select(slot) {
    const file = find(`gallery-file-${slot}`).files?.[0];
    if (!file) return;
    const job = generation;
    const item = slots[slot - 1];
    const selection = ++item.job;
    item.busy = true;
    find(`gallery-status-${slot}`).textContent = 'Preparazione della foto…';
    onDirty();
    try {
      const image = await compress(file);
      if (generation !== job || item.job !== selection) return;
      item.upload = image.data; item.remove = false;
      find(`gallery-alt-${slot}`).required = true;
      preview(slot, image.data);
      find(`gallery-status-${slot}`).textContent = `Pronta: ${Math.ceil(image.size / 1024)} KB. Sarà salvata con il prodotto.`;
    } catch (error) {
      if (generation !== job || item.job !== selection) return;
      find(`gallery-status-${slot}`).textContent = error.message;
      find(`gallery-file-${slot}`).value = '';
    } finally { if (generation === job && item.job === selection) item.busy = false; }
  }
  for (const slot of [1,2]) {
    find(`gallery-file-${slot}`).addEventListener('change', () => select(slot));
    find(`gallery-alt-${slot}`).addEventListener('input', onDirty);
    find(`gallery-remove-${slot}`).addEventListener('click', () => {
      const item = slots[slot - 1]; item.job++; item.busy = false; item.upload = null; item.remove = true;
      find(`gallery-file-${slot}`).value = ''; find(`gallery-alt-${slot}`).value = ''; find(`gallery-alt-${slot}`).required = false;
      find(`gallery-status-${slot}`).textContent = 'La foto sarà rimossa al salvataggio.'; preview(slot); onDirty();
    });
  }
  function reset(product) {
    const job = ++generation; release(); release = () => {};
    slots = [1,2].map(() => ({ job: 0, upload: null, remove: false, busy: false }));
    for (const slot of [1,2]) {
      find(`gallery-file-${slot}`).value = ''; find(`gallery-alt-${slot}`).value = ''; find(`gallery-alt-${slot}`).required = false;
      find(`gallery-status-${slot}`).textContent = ''; preview(slot);
    }
    if (product?.gallerySlots?.length) loadProductGallery(product, { admin: true }).then(data => {
      if (job !== generation) { data.release(); return; }
      release = data.release;
      for (const image of data.images.filter(image => image.slot > 0)) {
        if (slots[image.slot - 1].job || slots[image.slot - 1].remove) continue;
        preview(image.slot, image.src, image.alt);
        find(`gallery-status-${image.slot}`).textContent = 'Fotografia già salvata. Scegli un file per sostituirla.';
      }
    }).catch(() => { if (job === generation) for (const slot of product.gallerySlots) find(`gallery-status-${slot}`).textContent = 'Anteprima non disponibile. La foto salvata verrà conservata.'; });
  }
  reset(null);
  return {
    reset,
    busy: () => slots.some(item => item.busy),
    payload() {
      if (slots.some(item => item.busy)) throw new Error('Attendi la preparazione delle fotografie aggiuntive.');
      const galleryUploads = []; const galleryRemovals = [];
      slots.forEach((item,index) => {
        const slot = index + 1;
        if (item.remove) galleryRemovals.push(slot);
        if (item.upload) {
          const alt = find(`gallery-alt-${slot}`).value.trim();
          if (!alt) throw new Error(`Descrivi la fotografia ${slot + 1} prima di salvare.`);
          galleryUploads.push({ slot, imageData: item.upload, alt });
        }
      });
      return { galleryUploads, galleryRemovals };
    },
    destroy() { generation++; release(); },
  };
}
