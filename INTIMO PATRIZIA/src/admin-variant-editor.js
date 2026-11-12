import './admin-variant-editor.css';
import { normalizeVariantAvailability } from './product-variants.js';

let nextEditorId = 0;
const MAX_COMBINATIONS = 100;
const splitValues = (value) => [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))];
const node = (tag, className, text) => {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};

/** Availability is a manual choice; adding a label never makes a variant available. */
export function createAdminVariantEditor(container, { sizesInput, colorsInput, onDirty = () => {} }) {
  const prefix = `admin-variants-${++nextEditorId}`;
  const fieldset = node('fieldset', 'admin-switches admin-variant-editor');
  const legend = node('legend', '', 'Disponibilità per combinazione');
  const modeLabel = node('label', 'admin-check admin-variant-mode');
  const mode = node('input');
  mode.type = 'checkbox';
  mode.id = `${prefix}-enabled`;
  const modeText = node('span', '', 'Gestisci disponibilità per taglia e colore');
  const modeHelp = node('span', 'admin-field-help', 'Scegli quali combinazioni proponi e segna ciascuna come disponibile o esaurita.');
  modeText.append(modeHelp);
  modeLabel.append(mode, modeText);

  const generalNote = node('p', 'admin-field-help admin-variant-general');
  const details = node('div', 'admin-variant-details');
  details.id = `${prefix}-details`;
  mode.setAttribute('aria-controls', details.id);
  const instructions = node('p', 'admin-field-help', 'Le nuove combinazioni partono da “Non proposta”. Per usare solo taglie o solo colori, lascia vuoto l’altro campo.');
  instructions.id = `${prefix}-help`;
  const editHelp = node('p', 'admin-field-help', 'Modifica taglie e colori nei campi sopra. Rimuovere una voce elimina le sue combinazioni al salvataggio.');
  const globalHelp = node('p', 'admin-field-help', 'Se disattivi “Disponibile in negozio”, tutte le combinazioni risultano non disponibili. Le scelte qui sotto vengono conservate.');
  const summary = node('p', 'admin-variant-summary');
  summary.id = `${prefix}-summary`;
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  const warning = node('p', 'admin-field-help admin-variant-warning');
  warning.setAttribute('role', 'status');
  const error = node('p', 'admin-field-error admin-variant-error');
  error.id = `${prefix}-error`;
  error.setAttribute('role', 'alert');
  error.tabIndex = -1;
  const rows = node('div', 'admin-variant-rows');
  details.append(instructions, editHelp, globalHelp, summary, warning, error, rows);
  fieldset.append(legend, modeLabel, generalNote, details);
  container.replaceChildren(fieldset);

  let choices = new Map();
  let savedKeys = new Set();
  let originalOrphans = new Set();
  let candidates = [];
  let structuralError = '';
  let structuralFocus = mode;
  let invalidSavedData = false;
  let destroyed = false;

  function dimensions() {
    return { sizes: splitValues(sizesInput.value), colors: splitValues(colorsInput.value) };
  }

  function candidateRows({ sizes, colors }) {
    if (!sizes.length && !colors.length) return [];
    return (sizes.length ? sizes : ['']).flatMap((size) => (colors.length ? colors : ['']).map((color) => ({
      key: `${size}|${color}`,
      label: [size, color].filter(Boolean).join(' · '),
    })));
  }

  function setError(message = '', focus = false) {
    error.textContent = message;
    error.hidden = !message;
    mode.setAttribute('aria-invalid', String(Boolean(message)));
    if (message) mode.setAttribute('aria-describedby', error.id);
    else mode.removeAttribute('aria-describedby');
    if (focus && message) {
      const target = structuralError ? structuralFocus : rows.querySelector('select') || mode;
      target.focus();
    }
  }

  function refreshSummary() {
    const present = candidates.filter(({ key }) => choices.has(key));
    const available = present.filter(({ key }) => choices.get(key) === true).length;
    const unavailable = present.length - available;
    summary.textContent = `${present.length} ${present.length === 1 ? 'combinazione proposta' : 'combinazioni proposte'} · ${available} ${available === 1 ? 'disponibile' : 'disponibili'} · ${unavailable} ${unavailable === 1 ? 'esaurita' : 'esaurite'}`;
    summary.hidden = Boolean(structuralError);
    const visible = new Set(candidates.map(({ key }) => key));
    const removed = [...choices.keys()].filter((key) => !visible.has(key)).length;
    warning.hidden = !removed || Boolean(structuralError);
    warning.textContent = removed === 1
      ? 'Una combinazione non corrisponde più alle taglie e ai colori inseriti: sarà rimossa al salvataggio.'
      : `${removed} combinazioni non corrispondono più alle taglie e ai colori inseriti: saranno rimosse al salvataggio.`;
  }

  function rebuild() {
    if (destroyed) return;
    details.hidden = !mode.checked;
    generalNote.hidden = mode.checked;
    generalNote.textContent = savedKeys.size || invalidSavedData
      ? 'Al salvataggio verranno rimosse le disponibilità delle singole combinazioni. Verrà usata solo l’opzione “Disponibile in negozio”.'
      : 'Viene usata l’opzione generale “Disponibile in negozio”. Attiva questa gestione per indicare le singole combinazioni.';
    structuralError = '';
    structuralFocus = mode;
    candidates = [];
    rows.replaceChildren();
    setError();
    if (!mode.checked) return;
    const values = dimensions();
    if (values.sizes.some((value) => /[|~]/.test(value))) {
      structuralError = 'Nelle taglie non usare i caratteri | e ~. Correggi il campo Taglie prima di salvare.';
      structuralFocus = sizesInput;
    } else if (values.colors.some((value) => /[|~]/.test(value))) {
      structuralError = 'Nei colori non usare i caratteri | e ~. Correggi il campo Colori prima di salvare.';
      structuralFocus = colorsInput;
    } else if (!values.sizes.length && !values.colors.length) {
      structuralError = 'Inserisci almeno una taglia o un colore nei campi sopra, poi scegli le combinazioni proposte.';
      structuralFocus = sizesInput;
    } else {
      try {
        const firstKey = `${values.sizes[0] || ''}|${values.colors[0] || ''}`;
        normalizeVariantAvailability({ [firstKey]: false }, values);
      } catch (validationError) {
        structuralError = validationError.message;
        structuralFocus = structuralError.includes('Colori') ? colorsInput : sizesInput;
      }
      if (!structuralError && (values.sizes.length || 1) * (values.colors.length || 1) > MAX_COMBINATIONS) {
        structuralError = 'Puoi gestire al massimo 100 combinazioni di taglia e colore. Riduci le voci nei campi sopra; le scelte già fatte sono conservate finché non salvi.';
        structuralFocus = values.sizes.length > values.colors.length ? sizesInput : colorsInput;
      }
      if (!structuralError) {
        candidates = candidateRows(values);
        const currentKeys = new Set(candidates.map(({ key }) => key));
        if (invalidSavedData || [...originalOrphans].some((key) => !currentKeys.has(key))) {
          structuralError = 'Alcune combinazioni salvate non corrispondono alle taglie e ai colori del prodotto. Ripristina le voci mancanti oppure disattiva questa gestione per rimuovere le combinazioni al salvataggio.';
          structuralFocus = sizesInput;
        }
      }
    }
    setError(structuralError);
    refreshSummary();
    if (structuralError) return;
    const fragment = document.createDocumentFragment();
    candidates.forEach(({ key, label }, index) => {
      const row = node('div', 'admin-variant-row');
      const labelElement = node('label', 'admin-variant-label', label);
      const select = node('select', 'admin-variant-select');
      select.id = `${prefix}-choice-${index}`;
      labelElement.htmlFor = select.id;
      select.setAttribute('aria-describedby', instructions.id);
      for (const [value, text] of [['', 'Non proposta'], ['available', 'Disponibile'], ['unavailable', 'Esaurita']]) {
        const option = node('option', '', text);
        option.value = value;
        select.append(option);
      }
      select.value = !choices.has(key) ? '' : choices.get(key) ? 'available' : 'unavailable';
      select.dataset.availability = select.value || 'omitted';
      select.addEventListener('change', () => {
        if (select.value === '') choices.delete(key);
        else choices.set(key, select.value === 'available');
        select.dataset.availability = select.value || 'omitted';
        setError();
        refreshSummary();
        onDirty();
      });
      row.append(labelElement, select);
      fragment.append(row);
    });
    rows.append(fragment);
  }

  function inputsChanged() {
    rebuild();
    onDirty();
  }

  function reset(product) {
    const source = product?.variantAvailability;
    const entries = source && typeof source === 'object' && !Array.isArray(source) ? Object.entries(source) : [];
    invalidSavedData = Boolean(source && (typeof source !== 'object' || Array.isArray(source))) || entries.some(([key, value]) => {
      const parts = key.split('|');
      return parts.length !== 2 || !parts.some(Boolean) || parts.some((part) => /[|~]/.test(part) || part !== part.trim()) || typeof value !== 'boolean';
    }) || entries.length > MAX_COMBINATIONS;
    choices = new Map(entries.filter(([, value]) => typeof value === 'boolean'));
    savedKeys = new Set(choices.keys());
    const initialKeys = new Set(candidateRows(dimensions()).map(({ key }) => key));
    originalOrphans = new Set([...savedKeys].filter((key) => !initialKeys.has(key)));
    mode.checked = entries.length > 0 || invalidSavedData;
    rebuild();
  }

  mode.addEventListener('change', inputsChanged);
  sizesInput.addEventListener('input', inputsChanged);
  colorsInput.addEventListener('input', inputsChanged);
  reset(null);

  return {
    reset,
    payload() {
      if (!mode.checked) return { variantAvailability: {} };
      rebuild();
      if (structuralError) {
        setError(structuralError, true);
        throw new Error(structuralError);
      }
      const entries = candidates.filter(({ key }) => choices.has(key)).map(({ key }) => [key, choices.get(key)]);
      if (!entries.length) {
        const message = 'Indica almeno una combinazione disponibile o esaurita, oppure disattiva la gestione per taglia e colore.';
        setError(message, true);
        throw new Error(message);
      }
      return { variantAvailability: normalizeVariantAvailability(Object.fromEntries(entries), dimensions()) };
    },
    destroy() {
      destroyed = true;
      mode.removeEventListener('change', inputsChanged);
      sizesInput.removeEventListener('input', inputsChanged);
      colorsInput.removeEventListener('input', inputsChanged);
      container.replaceChildren();
    },
  };
}
