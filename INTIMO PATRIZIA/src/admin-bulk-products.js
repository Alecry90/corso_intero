import './admin-bulk-products.css';

const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_CHANGED_PRODUCTS = 50;
const amount = value => Number.isInteger(value) && value >= 0 ? value : 0;
const counted = (value, single, plural) => `${amount(value)} ${amount(value) === 1 ? single : plural}`;
const totals = result => `${counted(result?.updated, 'prodotto aggiornato', 'prodotti aggiornati')}; ${counted(result?.unchanged, 'prodotto invariato', 'prodotti invariati')}.`;
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
};
const valueText = value => value === '' || value === null || value === undefined ? '(vuoto)' : String(value);

/** Mount only for the verified manager; dispose when their session changes. */
export function initializeAdminBulkProducts(container, { getState, exportCSV, preview, apply, refresh } = {}) {
  if (!container) return () => {};
  for (const callback of [getState, exportCSV, preview, apply, refresh]) {
    if (typeof callback !== 'function') throw new TypeError('Configura le operazioni di aggiornamento CSV.');
  }
  const currentUid = () => {
    const state = getState();
    return !state?.readOnly && state?.user?.uid && state.auth?.currentUser()?.uid === state.user.uid ? state.user.uid : '';
  };
  const ownerUid = currentUid();
  let disposed = false, revision = 0, active = null, plan = null, planValid = false, checkedFile = null;
  const downloads = new Map();
  const alive = () => !disposed && container.isConnected;
  const authorized = () => Boolean(ownerUid) && currentUid() === ownerUid;
  const live = job => alive() && authorized() && active === job && job.revision === revision;

  container.classList.add('admin-bulk-products');
  container.innerHTML = `<details class="bulk-products-section">
    <summary>Aggiorna molti prodotti</summary>
    <p class="admin-small bulk-products-intro">Esporta gli articoli già presenti, modifica il foglio e controlla le differenze prima di confermare. Questo strumento aggiorna prodotti esistenti; per crearne di nuovi usa “Importa prodotti da un foglio”. Nessun aggiornamento viene salvato automaticamente.</p>
    <div class="bulk-products-step">
      <h3>1. Esporta il catalogo da modificare</h3>
      <p class="admin-small">Il CSV comprende prodotti pubblicati, bozze ed esempi; esclude il cestino, le fotografie e i dati dei clienti. L’esportazione legge l’intero catalogo soltanto quando premi il pulsante e utilizza le normali letture del piano gratuito.</p>
      <button id="bulk-products-export" type="button" class="admin-button admin-button-quiet">Esporta prodotti in CSV</button>
    </div>
    <div class="bulk-products-step">
      <h3>2. Controlla il foglio modificato</h3>
      <div class="admin-field bulk-products-file-field">
        <label for="bulk-products-file">CSV dei prodotti esistenti</label>
        <input id="bulk-products-file" type="file" accept=".csv,text/csv" aria-describedby="bulk-products-file-help">
        <p id="bulk-products-file-help" class="admin-field-help">CSV UTF-8, massimo 32 MiB e 5.000 righe. Puoi aggiornare al massimo 50 prodotti per volta; le righe invariate non vengono risalvate. Il file viene letto da questa pagina.</p>
      </div>
      <button id="bulk-products-preview" type="button" class="admin-button admin-button-quiet">Controlla gli aggiornamenti</button>
    </div>
    <section id="bulk-products-plan" class="bulk-products-plan" aria-labelledby="bulk-products-plan-heading" hidden>
      <h3 id="bulk-products-plan-heading">3. Verifica e conferma</h3>
      <p id="bulk-products-counts" class="bulk-products-counts"></p>
      <p id="bulk-products-unchanged" class="admin-small"></p>
      <ol id="bulk-products-items" class="bulk-products-items" aria-label="Differenze ed errori del foglio"></ol>
      <label class="admin-check bulk-products-confirm" for="bulk-products-confirm">
        <input id="bulk-products-confirm" type="checkbox" disabled>
        <span>Ho controllato tutte le differenze e confermo gli aggiornamenti. I prodotti pubblicati si aggiornano online.</span>
      </label>
      <div class="bulk-products-actions">
        <button id="bulk-products-apply" type="button" class="admin-button admin-button-primary" disabled>Conferma aggiornamenti</button>
        <button id="bulk-products-clear" type="button" class="admin-text-button">Scarta il controllo</button>
      </div>
      <p class="admin-small">Se fermi l’operazione, i prodotti già aggiornati restano salvati. Per riprendere devi controllare di nuovo il file.</p>
    </section>
    <details class="bulk-products-guide">
      <summary>Come preparare il CSV</summary>
      <ul class="admin-small">
        <li>Conserva <code>id</code> e <code>versione</code> esattamente come nell’esportazione: identificano il prodotto e la sua versione. Se il prodotto cambia dopo l’esportazione, esportalo di nuovo prima di modificarlo.</li>
        <li>Scrivi i prezzi come numeri decimali senza il simbolo €; per esempio <code>24,90</code>. Per i valori sì/no usa <code>si</code> o <code>no</code>.</li>
        <li>Separa le voci degli elenchi con <code>|</code>, per esempio <code>S|M|L</code>.</li>
        <li>Una cella vuota svuota un campo facoltativo. Una colonna assente lascia il campo com’è: conserva solo le colonne che vuoi modificare, oltre a <code>id</code> e <code>versione</code>.</li>
        <li>Modifica al massimo 50 prodotti per controllo. Il file può contenere fino a 5.000 righe, comprese quelle invariate.</li>
        <li>Rimuovere una riga dal foglio non elimina il prodotto. Usa il cestino dal catalogo per rimuovere un articolo dal sito.</li>
        <li>Prima di modifiche estese, conserva una copia dalla sezione “Copie di sicurezza e cestino” → “Copia di sicurezza del catalogo”. La copia si avvia manualmente e comporta le normali letture del piano gratuito.</li>
      </ul>
    </details>
    <p id="bulk-products-status" class="admin-form-feedback" role="status" aria-live="polite" aria-atomic="true"></p>
    <p id="bulk-products-error" class="admin-form-feedback" role="alert" aria-atomic="true" tabindex="-1" hidden></p>
    <button id="bulk-products-stop" type="button" class="admin-text-button" hidden>Annulla operazione</button>
  </details>`;

  const $ = id => container.querySelector(`#bulk-products-${id}`);
  function feedback(message, error = false) {
    if (!alive() || !authorized()) return;
    $('status').textContent = error ? '' : message;
    $('error').textContent = error ? message : '';
    $('error').hidden = !error;
    if (error) $('error').focus();
  }
  function controls() {
    if (!alive()) return;
    const blocked = Boolean(active) || !authorized();
    container.setAttribute('aria-busy', String(Boolean(active)));
    container.querySelectorAll('button, input').forEach(element => { element.disabled = blocked; });
    $('confirm').disabled = blocked || !planValid;
    $('apply').disabled = blocked || !planValid || !$('confirm').checked;
    $('stop').hidden = !active;
    $('stop').disabled = !active || !authorized() || active.controller.signal.aborted;
    $('stop').textContent = active?.kind === 'apply' ? 'Ferma dopo il prodotto in corso' : 'Annulla operazione';
  }
  function clearPlan() {
    plan = null; planValid = false; checkedFile = null;
    if (!alive() || !authorized()) return;
    $('plan').hidden = true;
    $('items').replaceChildren();
    $('counts').textContent = '';
    $('unchanged').textContent = '';
    $('confirm').checked = false;
    $('confirm').disabled = true;
    $('apply').disabled = true;
  }
  function invalidate() {
    if (!alive() || !authorized()) return;
    revision++;
    active?.controller.abort();
    clearPlan();
    $('file').removeAttribute('aria-invalid');
    controls();
    feedback('File cambiato: controlla nuovamente le differenze prima di confermare.');
  }
  const progress = job => value => {
    if (!live(job) || job.controller.signal.aborted) return;
    const message = typeof value === 'string' ? value : value?.message;
    if (typeof message === 'string' && message) feedback(message);
    else if (Number.isFinite(value?.completed) && Number.isFinite(value?.total)) feedback(`${value.completed} di ${value.total} prodotti elaborati…`);
  };
  async function reload(job) {
    if (!live(job)) return '';
    try { await refresh(); return ''; }
    catch { return ' L’elenco del catalogo non è stato ricaricato. Ricarica la pagina per vedere lo stato attuale.'; }
  }
  async function run(kind, message, task) {
    if (active || !authorized() || !alive()) return;
    const job = { kind, revision, controller: new AbortController() };
    active = job;
    controls(); feedback(message);
    try { await task(job); }
    catch (error) {
      if (!live(job)) return;
      if (kind === 'preview') clearPlan();
      if (kind === 'apply') {
        clearPlan();
        const refreshNote = await reload(job);
        if (!live(job)) return;
        const partial = error?.partial;
        const prefix = partial ? `${totals(partial)} Gli aggiornamenti completati restano salvati. ` : 'Verifica il catalogo: eventuali aggiornamenti già conclusi restano salvati. ';
        const reason = job.controller.signal.aborted || error?.name === 'AbortError' ? 'Operazione fermata.' : error?.message || 'Non è stato possibile completare gli aggiornamenti.';
        feedback(`${prefix}${reason} Controlla di nuovo il file prima di riprendere.${refreshNote}`, true);
      } else if (job.controller.signal.aborted || error?.name === 'AbortError') feedback('Operazione annullata. Nessun prodotto è stato aggiornato.');
      else feedback(error?.message || 'Operazione non riuscita. Controlla il file e riprova.', true);
    } finally {
      if (kind === 'apply') clearPlan();
      if (active === job) {
        active = null;
        if (alive() && authorized()) controls();
      }
    }
  }
  function downloadCSV(result) {
    if (typeof result?.csv !== 'string') throw new Error('L’esportazione non ha restituito un file CSV valido. Riprova.');
    const csv = '\uFEFF' + result.csv.replace(/^\uFEFF/, '');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = node('a');
    link.href = url;
    link.download = String(result.filename || 'prodotti-intimo-patrizia.csv');
    link.hidden = true;
    container.append(link); link.click(); link.remove();
    const timer = setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 1000);
    downloads.set(url, timer);
  }
  function renderPreview(result, file) {
    if (!result || !Array.isArray(result.items) || !result.summary) throw new Error('Il controllo del file non è completo. Riprova.');
    const { items, summary } = result;
    const changedItems = items.filter(item => !item.error && !item.unchanged && Array.isArray(item.changes) && item.changes.length);
    const errorItems = items.filter(item => item.error);
    const changed = Math.max(amount(summary.changed), changedItems.length);
    const errors = Math.max(amount(summary.errors), errorItems.length);
    const unchanged = amount(summary.unchanged);
    planValid = result.plan !== null && result.plan !== undefined && changed > 0 && changed <= MAX_CHANGED_PRODUCTS && changedItems.length === changed && errors === 0;
    plan = planValid ? result.plan : null;
    checkedFile = planValid ? file : null;
    $('confirm').checked = false;
    $('counts').textContent = `${counted(changed, 'prodotto da aggiornare', 'prodotti da aggiornare')}; ${counted(errors, 'errore da correggere', 'errori da correggere')}.`;
    $('unchanged').textContent = `${counted(unchanged, 'prodotto invariato: non sarà risalvato', 'prodotti invariati: non saranno risalvati')}.`;
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      if (!item.error && (item.unchanged || !Array.isArray(item.changes) || !item.changes.length)) continue;
      const entry = node('li', 'bulk-products-item');
      entry.append(node('p', 'bulk-products-item-title', `Riga ${item.line} · ${item.name || item.id || 'Prodotto senza nome'}`));
      if (item.id && item.name) entry.append(node('p', 'admin-small bulk-products-item-id', `ID: ${item.id}`));
      if (item.error) {
        entry.dataset.state = 'error';
        entry.append(node('p', 'bulk-products-row-error', item.error));
      } else {
        const changes = node('dl', 'bulk-products-changes');
        for (const change of item.changes) {
          const field = node('div', 'bulk-products-change');
          field.append(node('dt', '', change.label || change.field));
          const values = node('dd');
          const before = node('span', 'bulk-products-value');
          before.append(node('span', 'bulk-products-value-label', 'Prima: '), node('span', '', valueText(change.before)));
          const arrow = node('span', 'bulk-products-arrow', '→'); arrow.setAttribute('aria-hidden', 'true');
          const after = node('span', 'bulk-products-value');
          after.append(node('span', 'bulk-products-value-label', 'Dopo: '), node('span', '', valueText(change.after)));
          values.append(before, arrow, after); field.append(values); changes.append(field);
        }
        entry.append(changes);
      }
      fragment.append(entry);
    }
    $('items').replaceChildren(fragment);
    $('items').hidden = !changedItems.length && !errorItems.length;
    $('plan').hidden = false;
    if (changed > MAX_CHANGED_PRODUCTS) feedback('Il foglio modifica più di 50 prodotti. Mantieni al massimo 50 righe modificate e controlla di nuovo il file. Nessun prodotto è stato aggiornato.', true);
    else if (errors) feedback('Correggi gli errori indicati e carica di nuovo il foglio. Nessun prodotto è stato aggiornato.', true);
    else if (!changed) feedback('Il foglio non contiene differenze da salvare. Nessun prodotto è stato aggiornato.');
    else if (!planValid) feedback('Il controllo non contiene tutte le differenze previste. Controlla di nuovo il file. Nessun prodotto è stato aggiornato.', true);
    else feedback('Controllo completato. Leggi tutte le differenze, seleziona la conferma e premi “Conferma aggiornamenti” per salvarle.');
  }

  $('export').addEventListener('click', () => run('export', 'Lettura del catalogo per preparare il CSV…', async job => {
    const result = await exportCSV({ signal: job.controller.signal, onProgress: progress(job) });
    if (!live(job)) return;
    if (job.controller.signal.aborted) { feedback('Esportazione annullata.'); return; }
    downloadCSV(result);
    feedback(`CSV preparato: ${counted(result.count, 'prodotto esportato', 'prodotti esportati')}. Controlla il file nei download del dispositivo.`);
  }));
  $('preview').addEventListener('click', () => {
    if (active || !authorized()) return;
    clearPlan();
    const file = $('file').files?.[0];
    if (!file || file.size > MAX_FILE_BYTES) {
      $('file').setAttribute('aria-invalid', 'true');
      controls();
      feedback(file ? 'Il CSV supera 32 MiB. Riduci il file e caricalo di nuovo.' : 'Scegli prima il file CSV da controllare.', true);
      return;
    }
    $('file').removeAttribute('aria-invalid');
    run('preview', 'Lettura del foglio e controllo delle differenze…', async job => {
      const text = await file.text();
      if (!live(job)) return;
      if (job.controller.signal.aborted) { feedback('Controllo annullato. Nessun prodotto è stato aggiornato.'); return; }
      const result = await preview(text, { signal: job.controller.signal, onProgress: progress(job) });
      if (!live(job)) return;
      if (job.controller.signal.aborted) { feedback('Controllo annullato. Nessun prodotto è stato aggiornato.'); return; }
      renderPreview(result, file);
    });
  });
  $('apply').addEventListener('click', () => {
    if (active || !authorized() || !planValid || !$('confirm').checked) return;
    if ($('file').files?.[0] !== checkedFile) { invalidate(); return; }
    const token = plan;
    run('apply', 'Aggiornamento dei prodotti confermati…', async job => {
      const result = await apply(token, { signal: job.controller.signal, onProgress: progress(job) });
      if (!live(job)) return;
      clearPlan();
      const refreshNote = await reload(job);
      if (!live(job)) return;
      const stopped = result?.stopped || job.controller.signal.aborted;
      feedback(`${totals(result)} ${stopped ? 'Operazione fermata; gli aggiornamenti completati restano salvati.' : 'Aggiornamenti completati.'} Controlla di nuovo il file prima di un altro aggiornamento.${refreshNote}`);
    });
  });
  $('clear').addEventListener('click', () => {
    if (active || !authorized()) return;
    revision++; clearPlan(); controls(); feedback('Controllo scartato. Nessun prodotto è stato aggiornato.');
  });
  $('file').addEventListener('change', invalidate);
  $('confirm').addEventListener('change', controls);
  $('stop').addEventListener('click', () => {
    if (!active || !authorized()) return;
    active.controller.abort();
    feedback(active.kind === 'apply' ? 'Arresto richiesto. Attendo il prodotto in corso; quelli già aggiornati restano salvati.' : 'Annullamento richiesto. Attendo la conclusione dell’operazione in corso.');
    controls();
  });
  controls();
  return () => {
    disposed = true; revision++; active?.controller.abort(); plan = null;
    for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); }
    downloads.clear();
    container.replaceChildren(); container.classList.remove('admin-bulk-products'); container.removeAttribute('aria-busy');
  };
}
