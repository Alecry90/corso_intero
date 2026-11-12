import './admin-catalog-safety.css';

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const count = value => Number.isInteger(value) && value >= 0 ? value : 0;
const counted = (value, one, many) => `${count(value)} ${count(value) === 1 ? one : many}`;
const restoreTotals = result => `${counted(result?.categories, 'reparto', 'reparti')} e ${counted(result?.products, 'prodotto', 'prodotti')} recuperati come bozze; ${counted(result?.skipped, 'elemento già presente saltato', 'elementi già presenti saltati')}.`;

/** The caller mounts this panel only for the verified manager and disposes it on logout. */
export function initializeAdminCatalogSafety(container, {
  exportBackup, previewRestore, applyRestore, listTrash, restoreProduct, onChange,
  maxFileBytes = 128 * 1024 * 1024,
} = {}) {
  if (!container) return () => {};
  for (const callback of [exportBackup, previewRestore, applyRestore, listTrash, restoreProduct]) {
    if (typeof callback !== 'function') throw new TypeError('Configura le operazioni di copia e cestino.');
  }
  let disposed = false, busy = '', controller = null, plan = null;
  let trash = [], trashLoaded = false, trashPage = 0, pendingRestore = '';
  const objectURLs = new Set();
  const pageSize = 50;
  const alive = () => !disposed && container.isConnected;
  container.classList.add('admin-catalog-safety');
  container.hidden = false;
  container.inert = false;
  container.innerHTML = `<h2>Copie di sicurezza e cestino</h2>
    <p class="admin-small">Conserva una copia del catalogo sul tuo dispositivo e recupera gli articoli spostati nel cestino. Le operazioni sono riservate al gestore.</p>
    <details class="catalog-safety-section" id="catalog-safety-backup">
      <summary>Copia di sicurezza del catalogo</summary>
      <p class="admin-small">La copia comprende il catalogo e le foto caricate dal gestore. I file statici del sito conservano il loro percorso. Non contiene account, password, preferiti o dati dei clienti. Scaricarla utilizza le normali letture del piano gratuito; avviala quando serve e conserva il file in un posto sicuro.</p>
      <button id="catalog-safety-export" type="button" class="admin-button admin-button-quiet">Scarica copia del catalogo</button>
      <h3>Recupera da una copia</h3>
      <p class="admin-small">Prima controlliamo il file. Il recupero aggiunge soltanto gli elementi mancanti, non sovrascrive quelli presenti e mantiene i prodotti recuperati in bozza.</p>
      <div class="admin-field"><label for="catalog-safety-file">Copia del catalogo in formato JSON</label>
        <input id="catalog-safety-file" type="file" accept=".json,application/json" aria-describedby="catalog-safety-file-help">
        <p id="catalog-safety-file-help" class="admin-field-help"></p>
      </div>
      <button id="catalog-safety-preview" type="button" class="admin-button admin-button-quiet">Controlla la copia</button>
      <div id="catalog-safety-plan" class="catalog-safety-plan" tabindex="-1" hidden>
        <h4>Controllo della copia</h4><p id="catalog-safety-plan-counts"></p>
        <ul id="catalog-safety-plan-warnings" hidden></ul>
        <p class="admin-small">Vuoi aggiungere questi elementi? I prodotti saranno bozze da controllare prima della pubblicazione. Se fermi l’operazione, gli elementi già recuperati rimangono salvati.</p>
        <div class="catalog-safety-actions">
          <button id="catalog-safety-apply" type="button" class="admin-button admin-button-primary">Conferma: recupera come bozze</button>
          <button id="catalog-safety-cancel-plan" type="button" class="admin-text-button">Annulla il recupero</button>
        </div>
      </div>
    </details>
    <details class="catalog-safety-section" id="catalog-safety-trash">
      <summary>Cestino dei prodotti</summary>
      <p class="admin-small">Gli articoli nel cestino e le loro fotografie restano riservati e occupano ancora spazio nel database. Ripristinare un prodotto lo riporta tra le bozze con lo stesso identificativo e le sue foto.</p>
      <button id="catalog-safety-refresh-trash" type="button" class="admin-button admin-button-quiet">Mostra o aggiorna il cestino</button>
      <p id="catalog-safety-trash-count" class="admin-small">Apri il cestino con il pulsante qui sopra.</p>
      <ul id="catalog-safety-trash-list" class="catalog-safety-trash-list" aria-label="Prodotti nel cestino"></ul>
      <nav id="catalog-safety-trash-pages" class="catalog-safety-pages" aria-label="Pagine del cestino" hidden>
        <button id="catalog-safety-trash-previous" class="admin-button admin-button-quiet" type="button">Precedenti</button>
        <span id="catalog-safety-trash-page" class="admin-small"></span>
        <button id="catalog-safety-trash-next" class="admin-button admin-button-quiet" type="button">Successivi</button>
      </nav>
    </details>
    <p id="catalog-safety-status" class="admin-form-feedback" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></p>
    <button id="catalog-safety-stop" class="admin-text-button" type="button" hidden>Ferma dopo l’elemento in corso</button>`;

  const $ = id => container.querySelector(`#${id}`);
  $('catalog-safety-file-help').textContent = `Scegli un file creato da “Scarica copia del catalogo”, massimo ${Math.floor(maxFileBytes / (1024 * 1024))} MB. Il file viene letto da questa pagina e non viene inviato ad altri servizi.`;
  function feedback(message, error = false, focus = false) {
    if (!alive()) return;
    const node = $('catalog-safety-status');
    node.textContent = message;
    node.dataset.state = error ? 'error' : 'normal';
    if (focus) node.focus({ preventScroll: false });
  }
  function controls() {
    if (!alive()) return;
    container.setAttribute('aria-busy', String(Boolean(busy)));
    container.querySelectorAll('button, input').forEach(node => { node.disabled = Boolean(busy); });
    $('catalog-safety-apply').disabled = Boolean(busy) || !plan;
    $('catalog-safety-stop').hidden = !busy;
    $('catalog-safety-stop').disabled = !busy || controller?.signal.aborted === true;
    $('catalog-safety-stop').textContent = ['apply', 'restore'].includes(busy) ? 'Ferma dopo l’elemento in corso' : 'Annulla l’operazione';
    $('catalog-safety-trash-previous').disabled = Boolean(busy) || trashPage === 0;
    $('catalog-safety-trash-next').disabled = Boolean(busy) || (trashPage + 1) * pageSize >= trash.length;
  }
  const progress = value => {
    if (controller?.signal.aborted) return;
    const message = typeof value === 'string' ? value : value?.message;
    if (typeof message === 'string' && message) feedback(message);
    else if (Number.isFinite(value?.completed) && Number.isFinite(value?.total)) feedback(`${value.completed} di ${value.total} elementi elaborati…`);
  };
  async function run(operation, message, task) {
    if (disposed || busy) return;
    busy = operation;
    controller = new AbortController();
    const signal = controller.signal;
    controls(); feedback(message);
    try { await task(signal); }
    catch (error) {
      if (!alive()) return;
      if (operation === 'apply' && error?.partial) {
        const refreshNote = await afterWrite();
        feedback(`${restoreTotals(error.partial)} Gli elementi indicati restano salvati. ${error?.message || 'Recupero interrotto.'}${refreshNote}`, true, true);
      } else if (signal.aborted || error?.name === 'AbortError') {
        feedback(operation === 'apply' ? 'Recupero fermato. Gli elementi eventualmente già recuperati restano salvati. Controlla di nuovo la copia prima di riprendere.' : 'Operazione annullata.');
      } else feedback(error?.message || 'Non è stato possibile completare l’operazione. Riprova.', true, true);
    } finally {
      if (operation === 'apply') clearPlan();
      busy = ''; controller = null;
      if (alive()) controls();
    }
  }
  function clearPlan() {
    plan = null;
    if (!alive()) return;
    $('catalog-safety-plan').hidden = true;
    $('catalog-safety-plan-counts').textContent = '';
    $('catalog-safety-plan-warnings').replaceChildren();
    $('catalog-safety-plan-warnings').hidden = true;
    $('catalog-safety-apply').disabled = true;
  }
  function archivedDate(product) {
    const value = product.archivedAt;
    const date = typeof value === 'string' ? new Date(value) : value && Number.isFinite(value.seconds) ? new Date(value.seconds * 1000) : null;
    return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeZone: 'Europe/Rome' }).format(date) : '';
  }
  function renderTrash() {
    if (!alive()) return;
    trashPage = Math.min(trashPage, Math.max(0, Math.ceil(trash.length / pageSize) - 1));
    const list = $('catalog-safety-trash-list'); list.replaceChildren();
    if (trashLoaded) $('catalog-safety-trash-count').textContent = trash.length === 1 ? '1 prodotto nel cestino. Il ripristino lo manterrà in bozza.' : trash.length ? `${trash.length} prodotti nel cestino. Il ripristino li manterrà in bozza.` : 'Il cestino è vuoto.';
    for (const product of trash.slice(trashPage * pageSize, (trashPage + 1) * pageSize)) {
      const row = element('li', 'catalog-safety-trash-row');
      const info = element('div', 'catalog-safety-trash-info');
      info.append(element('h4', '', product.name || 'Prodotto senza nome'));
      const date = archivedDate(product);
      info.append(element('p', 'admin-small', `${product.categoryName || product.categoryId || 'Reparto non indicato'}${date ? ` · Nel cestino dal ${date}` : ''}`));
      row.append(info);
      if (pendingRestore === product.id) {
        const confirmation = element('div', 'catalog-safety-restore-confirm');
        confirmation.append(element('p', 'admin-small', 'Ripristinare questo prodotto come bozza? Potrai controllarlo prima di pubblicarlo.'));
        const actions = element('div', 'catalog-safety-actions');
        for (const [action, label, style] of [['confirm', 'Ripristina come bozza', 'admin-button admin-button-primary'], ['cancel', 'Annulla', 'admin-text-button']]) {
          const button = element('button', style, label); button.type = 'button'; button.dataset.restoreId = product.id; button.dataset.restoreAction = action; actions.append(button);
        }
        confirmation.append(actions); row.append(confirmation);
      } else {
        const button = element('button', 'admin-button admin-button-quiet', 'Ripristina'); button.type = 'button'; button.dataset.restoreId = product.id; button.dataset.restoreAction = 'choose'; row.append(button);
      }
      list.append(row);
    }
    $('catalog-safety-trash-pages').hidden = trash.length <= pageSize;
    $('catalog-safety-trash-page').textContent = `Pagina ${trashPage + 1} di ${Math.max(1, Math.ceil(trash.length / pageSize))}`;
    controls();
  }
  const afterWrite = async () => {
    if (disposed || typeof onChange !== 'function') return '';
    try { await onChange(); return ''; }
    catch { return ' Per rivedere gli elementi salvati, aggiorna l’elenco del catalogo.'; }
  };

  $('catalog-safety-export').addEventListener('click', () => run('export', 'Preparazione della copia: lettura di reparti, prodotti e fotografie…', async signal => {
    const result = await exportBackup({ signal, onProgress: progress });
    if (!alive() || signal.aborted) return;
    if (!result?.backup || typeof result.backup !== 'object') throw new Error('La copia non è completa. Riprova prima di conservarla.');
    const blob = new Blob([JSON.stringify(result.backup)], { type: 'application/json;charset=utf-8' });
    if (blob.size > maxFileBytes) throw new Error('La copia supera il limite recuperabile da questa pagina. Non è stata scaricata: contatta chi gestisce il sito per un’esportazione completa.');
    const url = URL.createObjectURL(blob); objectURLs.add(url);
    const link = document.createElement('a'); link.href = url;
    link.download = typeof result.filename === 'string' && /^[A-Za-z0-9_.-]+\.json$/i.test(result.filename) ? result.filename : 'catalogo-intimo-patrizia.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => { URL.revokeObjectURL(url); objectURLs.delete(url); }, 1000);
    feedback('Download della copia avviato. Controlla che il file sia presente nei download del dispositivo e conservalo in un posto sicuro.');
  }));
  $('catalog-safety-file').addEventListener('change', () => {
    if (busy || disposed) return;
    clearPlan(); feedback('File cambiato. Scegli “Controlla la copia” prima del recupero.'); controls();
  });
  $('catalog-safety-preview').addEventListener('click', () => run('preview', 'Controllo della copia e confronto con il catalogo attuale…', async signal => {
    clearPlan();
    const file = $('catalog-safety-file').files?.[0];
    if (!file) throw new Error('Scegli prima una copia del catalogo in formato JSON.');
    if (file.size > maxFileBytes) throw new Error(`Il file supera ${Math.floor(maxFileBytes / (1024 * 1024))} MB.`);
    const text = await file.text();
    if (signal.aborted || !alive()) return;
    const result = await previewRestore(text, { signal });
    if (signal.aborted || !alive()) return;
    if (!result?.summary || !result.plan) throw new Error('La copia non ha prodotto un piano di recupero valido.');
    const summary = result.summary;
    plan = count(summary.categories) + count(summary.products) ? result.plan : null;
    $('catalog-safety-plan-counts').textContent = `${counted(summary.categories, 'reparto', 'reparti')} e ${counted(summary.products, 'prodotto', 'prodotti')} da aggiungere; ${counted(summary.skipped, 'elemento già presente', 'elementi già presenti')} da saltare.`;
    const warnings = Array.isArray(summary.warnings) ? summary.warnings.filter(value => typeof value === 'string') : [];
    $('catalog-safety-plan-warnings').replaceChildren(...warnings.slice(0, 50).map(text => element('li', '', text)));
    $('catalog-safety-plan-warnings').hidden = !warnings.length;
    $('catalog-safety-plan').hidden = false;
    $('catalog-safety-plan').focus();
    feedback(plan ? 'Controllo completato. Verifica i conteggi e conferma soltanto se vuoi aggiungere le bozze mancanti.' : 'Non ci sono elementi mancanti da recuperare. Il catalogo non è stato modificato.');
  }));
  $('catalog-safety-cancel-plan').addEventListener('click', () => { if (busy || disposed) return; clearPlan(); feedback('Recupero annullato. Il catalogo non è stato modificato.'); controls(); $('catalog-safety-preview').focus(); });
  $('catalog-safety-apply').addEventListener('click', () => {
    if (!plan) return;
    const selectedPlan = plan;
    return run('apply', 'Recupero in corso: gli elementi vengono aggiunti uno alla volta…', async signal => {
      const result = await applyRestore(selectedPlan, { signal, onProgress: progress });
      if (!alive()) return;
      const stopped = signal.aborted || result?.stopped === true;
      const refreshNote = await afterWrite();
      if (alive()) feedback(`${restoreTotals(result)} ${stopped ? 'Recupero fermato: gli elementi già recuperati restano salvati.' : 'Controlla i prodotti prima di pubblicarli.'}${refreshNote}`, false, true);
    });
  });
  $('catalog-safety-refresh-trash').addEventListener('click', () => run('trash', 'Caricamento dei prodotti nel cestino…', async signal => {
    const result = await listTrash({ signal });
    if (!alive() || signal.aborted) return;
    if (!Array.isArray(result) || result.length > 5000) throw new Error('L’elenco del cestino non è valido. Riprova.');
    trash = result.filter(product => product && typeof product.id === 'string'); trashLoaded = true; pendingRestore = ''; trashPage = 0;
    renderTrash(); feedback(trash.length ? 'Cestino aggiornato. Seleziona Ripristina per recuperare un articolo come bozza.' : 'Il cestino è vuoto.');
  }));
  $('catalog-safety-trash-list').addEventListener('click', event => {
    const button = event.target.closest('button[data-restore-id]');
    if (!button || !$('catalog-safety-trash-list').contains(button) || busy || disposed) return;
    const id = button.dataset.restoreId;
    if (!trash.some(product => product.id === id)) return;
    if (button.dataset.restoreAction === 'choose' || button.dataset.restoreAction === 'cancel') {
      pendingRestore = button.dataset.restoreAction === 'choose' ? id : '';
      renderTrash();
      const target = [...$('catalog-safety-trash-list').querySelectorAll('button[data-restore-id]')].find(node => node.dataset.restoreId === id);
      target?.focus(); return;
    }
    if (button.dataset.restoreAction !== 'confirm' || pendingRestore !== id) return;
    return run('restore', 'Ripristino del prodotto come bozza…', async signal => {
      const result = await restoreProduct(id, { signal });
      if (!alive()) return;
      if (result?.product?.archived === true) throw new Error('Il prodotto è cambiato durante il recupero. Aggiorna il cestino prima di riprovare.');
      trash = trash.filter(product => product.id !== id); pendingRestore = ''; renderTrash();
      const refreshNote = await afterWrite();
      feedback(result?.product?.published === true ? `Il prodotto è già stato ripristinato e pubblicato da un’altra scheda. La richiesta non ne ha cambiato lo stato.${refreshNote}` : `Prodotto ripristinato come bozza, con lo stesso identificativo e le fotografie. Controllalo prima di pubblicarlo.${refreshNote}`, false, true);
    });
  });
  for (const [id, delta] of [['catalog-safety-trash-previous', -1], ['catalog-safety-trash-next', 1]]) $(id).addEventListener('click', () => {
    if (busy || disposed) return;
    trashPage += delta; pendingRestore = ''; renderTrash(); $('catalog-safety-trash-count').scrollIntoView({ block: 'nearest' });
  });
  $('catalog-safety-stop').addEventListener('click', () => {
    if (!controller || controller.signal.aborted) return;
    controller.abort(); controls();
    feedback(busy === 'apply' || busy === 'restore' ? 'Arresto richiesto: attendo l’elemento già in corso. Gli elementi salvati rimarranno disponibili.' : 'Annullamento richiesto…');
  });
  controls();
  return () => {
    disposed = true; controller?.abort(); plan = null; trash = [];
    for (const url of objectURLs) URL.revokeObjectURL(url);
    objectURLs.clear(); container.replaceChildren(); container.removeAttribute('aria-busy');
  };
}
