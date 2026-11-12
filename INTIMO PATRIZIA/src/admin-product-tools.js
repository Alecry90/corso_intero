import './admin-product-tools.css';
import { PRODUCT_CSV_HEADERS, parseProductCSV, planProductImport } from './product-import.js';
import { loadManagerCatalogPage } from './firestore-catalog.js';
import { compressedImage } from './image-preparation.js';

export function initializeAdminProductTools({ container, getState, request, refresh }) {
  let plan = []; let revision = 0; let busy = false; let controller;
  const current = () => !getState().readOnly && getState().user && getState().auth?.currentUser()?.uid === getState().user.uid;
  container.innerHTML = `<details class="admin-batch"><summary>Importa prodotti da un foglio</summary><p class="admin-small">Prepara fino a 50 articoli per volta. Il controllo mostra i dati prima di salvare: l’importazione crea sempre bozze e non modifica prodotti già presenti con lo stesso codice. Le immagini sono facoltative e si abbinano tramite nome del file.</p><button id="import-template" class="admin-button admin-button-quiet" type="button">Scarica modello CSV vuoto</button><div class="admin-form-grid"><div class="admin-field"><label for="import-csv">Foglio CSV UTF-8</label><input id="import-csv" type="file" accept=".csv,text/csv"><p class="admin-field-help">Massimo 50 righe e 500 KB. In reparto usa uno degli identificativi elencati sotto.</p></div><div class="admin-field"><label for="import-photos">Fotografie abbinate al foglio</label><input id="import-photos" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple><p class="admin-field-help">Le colonne foto, foto_2 e foto_3 devono contenere i nomi esatti dei file selezionati. JPG, PNG, WebP o AVIF.</p></div></div><details><summary>Identificativi dei reparti</summary><ul id="import-categories" class="admin-import-categories"></ul></details><div class="admin-dialog-actions"><button id="import-preview" class="admin-button admin-button-quiet" type="button">Controlla il foglio</button><button id="import-apply" class="admin-button admin-button-primary" type="button" disabled>Importa come bozze</button><button id="import-stop" class="admin-text-button" type="button" hidden>Ferma dopo il prodotto in corso</button></div><p id="import-status" role="status" class="admin-small"></p><ol id="import-plan" class="admin-import-plan"></ol></details>`;
  const $ = id => container.querySelector(`#${id}`);
  const feedback = text => { $('import-status').textContent = text; };
  function reset() { revision++; controller?.abort(); busy = false; $('import-preview').disabled = false; plan = []; $('import-plan').replaceChildren(); $('import-apply').disabled = true; feedback('File cambiato: controlla nuovamente il foglio prima di importare.'); }
  async function existingProducts(signal) {
    const products = []; let cursor;
    do { const page = await loadManagerCatalogPage({ signal, cursor, pageSize: 100 }); products.push(...page.products); cursor = page.nextCursor; } while (cursor && products.length <= 5000);
    return products;
  }
  function files() {
    const entries = [...$('import-photos').files];
    if (entries.length > 150) throw new Error('Seleziona al massimo 150 fotografie per 50 prodotti.');
    const map = new Map();
    for (const file of entries) {
      const key = file.name.toLocaleLowerCase('it');
      if (map.has(key)) throw new Error(`Due foto hanno lo stesso nome: ${file.name}. Rinominale prima di continuare.`);
      if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} supera 12 MB.`);
      map.set(key, file);
    }
    return map;
  }
  async function preview() {
    if (busy || !current()) return;
    reset(); const job = revision; const uid = getState().user.uid;
    const file = $('import-csv').files?.[0];
    if (!file) { feedback('Scegli prima il file CSV.'); return; }
    if (file.size > 512000) { feedback('Il CSV supera 500 KB.'); return; }
    busy = true; $('import-preview').disabled = true; controller = new AbortController(); feedback('Controllo del foglio e dei codici già presenti…');
    try {
      const rows = parseProductCSV(await file.text()); const selected = files();
      const existing = await existingProducts(controller.signal);
      if (job !== revision || !current() || getState().user.uid !== uid) return;
      plan = planProductImport(rows, getState().categories, existing);
      for (const item of plan) if (!item.error && !item.skip) for (const photo of item.photos) if (photo && !selected.has(photo.toLocaleLowerCase('it'))) item.error = `Fotografia non selezionata: ${photo}.`;
      $('import-plan').replaceChildren(...plan.map(item => {
        const li = document.createElement('li');
        li.textContent = `Riga ${item.line} · ${item.payload?.name || item.name}: ${item.error || (item.skip ? 'codice già presente, verrà saltato' : `nuova bozza${item.payload.price === null ? ', prezzo da definire' : ''}`)}`;
        if (item.error) li.dataset.state = 'error'; return li;
      }));
      const count = plan.filter(item => !item.error && !item.skip).length;
      $('import-apply').disabled = plan.some(item => item.error) || !count;
      feedback(plan.some(item => item.error) ? 'Correggi gli errori nel foglio e ricontrollalo. Nessun prodotto è stato salvato.' : `${count} nuove bozze da importare; ${plan.length - count} codici già presenti. Controlla l’elenco e scegli “Importa come bozze” quando è corretto.`);
    } catch (error) { if (job === revision) feedback(error.message || 'Controllo non riuscito. Riprova.'); }
    finally { if (job === revision) { busy = false; $('import-preview').disabled = false; } }
  }
  async function apply() {
    if (busy || !current() || !plan.length || plan.some(item => item.error)) return;
    const uid = getState().user.uid; const job = revision; const selected = files();
    busy = true; $('import-apply').disabled = true; $('import-preview').disabled = true; $('import-stop').hidden = false;
    $('import-csv').disabled = true; $('import-photos').disabled = true;
    let saved = 0; let failed = 0;
    try {
      for (const item of plan) {
        if (job !== revision || !current() || getState().user.uid !== uid) break;
        if (item.skip) continue;
        feedback(`Preparazione e salvataggio: ${item.payload.name}…`);
        try {
          const payload = { ...item.payload }; const galleryUploads = [];
          for (let slot = 0; slot < item.photos.length; slot++) {
            if (!item.photos[slot]) continue;
            const image = await compressedImage(selected.get(item.photos[slot].toLocaleLowerCase('it')));
            if (slot === 0) payload.imageData = image.data;
            else galleryUploads.push({ slot, imageData: image.data, alt: `${payload.name}, fotografia ${slot + 1}` });
          }
          if (job !== revision || !current() || getState().user.uid !== uid) break;
          if (galleryUploads.length) payload.galleryUploads = galleryUploads;
          await request('products/import', 'POST', payload);
          item.skip = true; saved++;
          if (current() && getState().user.uid === uid && $('import-plan')) $('import-plan').children[item.line - 2].textContent = `Riga ${item.line} · ${payload.name}: bozza salvata.`;
        } catch (error) {
          failed++;
          if (current() && getState().user.uid === uid && $('import-plan')) $('import-plan').children[item.line - 2].textContent = `Riga ${item.line} · ${item.payload.name}: ${error.message}.`;
        }
      }
      if (current() && getState().user.uid === uid) { await refresh(); feedback(`${saved} bozze salvate, ${failed} righe non salvate. ${job !== revision ? 'Importazione fermata.' : 'Ricontrolla il foglio prima di un nuovo tentativo.'}`); }
    } finally {
      busy = false; if ($('import-stop')) { $('import-stop').hidden = true; $('import-preview').disabled = false; $('import-csv').disabled = false; $('import-photos').disabled = false; }
    }
  }
  $('import-template').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + PRODUCT_CSV_HEADERS.join(';') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'modello-prodotti-intimo-patrizia.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  });
  $('import-csv').addEventListener('change', reset); $('import-photos').addEventListener('change', reset);
  $('import-preview').addEventListener('click', preview); $('import-apply').addEventListener('click', () => apply().catch(error => feedback(error.message)));
  $('import-stop').addEventListener('click', () => { revision++; feedback('Arresto richiesto: attendo il prodotto in corso.'); });
  const list = $('import-categories');
  for (const category of getState().categories) { const li = document.createElement('li'); li.textContent = `${category.name}: ${category.slug}`; list.append(li); }
  return () => { revision++; controller?.abort(); container.replaceChildren(); };
}
