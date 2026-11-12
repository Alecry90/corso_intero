import './admin-communications.css';
import { initializeFirebaseAuth } from './firebase-auth.js';
import { getCatalogSession } from './firestore-catalog.js';
import { renderEmailTemplate, validateEmailTemplate } from './email-templates.js';
import newsletterConfig from '../public/data/newsletter.json';

const testSenderEmail = () => state.auth?.currentUser()?.email || '';
const $ = id => document.getElementById(id);
const panel = $('admin-communications');
const form = $('communications-form');
const fields = $('communications-fields');
const state = { readOnly: true, isOwner: false, auth: null, authJob: 0, userId: null, controller: null };
const exportButtons = [$('communication-download-html'), $('communication-download-text')];
const value = name => form.elements.namedItem(name).value.trim();
const mayCompose = () => !state.readOnly && state.isOwner && state.auth?.currentUser()?.emailVerified === true && state.auth.currentUser().uid === state.userId;

function feedback(message, error = false) {
  $('communications-validation').textContent = message;
  $('communications-validation').dataset.state = error ? 'error' : 'normal';
}

function selectTemplate() {
  for (const type of ['event', 'promotion']) {
    const group = $(`communication-${type}-fields`);
    const active = value('type') === type;
    group.hidden = !active;
    for (const control of group.querySelectorAll('input, textarea')) control.disabled = !mayCompose() || !active;
  }
}

function readValues() {
  const type = value('type');
  return {
    type,
    title: value('title'),
    body: value('body'),
    eventDate: type === 'event' ? value('eventDate') : '',
    eventLocation: type === 'event' ? value('eventLocation') : '',
    promotionDetails: type === 'promotion' ? value('promotionDetails') : '',
    promotionConditions: type === 'promotion' ? value('promotionConditions') : '',
    ctaLabel: value('ctaLabel'),
    ctaUrl: value('ctaUrl'),
  };
}

function validate(values) {
  if (!values.title || !values.body) return 'Compila titolo e messaggio per scaricare il modello.';
  if (values.title.length > 120 || values.body.length > 6000) return 'Rispetta i limiti: titolo di 120 caratteri e messaggio di 6.000 caratteri.';
  if (Boolean(values.ctaLabel) !== Boolean(values.ctaUrl)) return 'Per aggiungere un pulsante, compila sia il testo sia il link.';
  try { validateEmailTemplate(values); }
  catch (error) { return error.message || 'Controlla i contenuti del modello.'; }
  if (!form.checkValidity()) return 'Controlla i campi e rispetta le lunghezze massime indicate.';
  return '';
}

function previewDocument(html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const csp = document.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'";
  document.head.prepend(csp);
  for (const link of document.querySelectorAll('a')) {
    link.removeAttribute('href');
    link.removeAttribute('target');
  }
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

function renderPreview(values, issue) {
  const illustrative = !values.title || !values.body;
  const previewValues = {
    ...values,
    title: values.title || 'Il titolo della tua comunicazione',
    body: values.body || 'Qui vedrai il messaggio del negozio. Completa i campi per preparare il modello della tua email.',
  };
  // An incomplete button never becomes an active link in the preview.
  if (issue) { previewValues.ctaLabel = ''; previewValues.ctaUrl = ''; }
  const rendered = renderEmailTemplate(previewValues, { mode: 'preview', recipientName: value('recipientName'), senderEmail: testSenderEmail() });
  $('communication-preview-subject').textContent = rendered.subject;
  $('communication-preview').srcdoc = previewDocument(rendered.html);
  $('communication-preview-note').textContent = illustrative
    ? 'Anteprima illustrativa riservata: completa i campi per vedere i tuoi contenuti. I link nell’anteprima sono disattivati.'
    : 'Anteprima riservata dei contenuti inseriti. Personalizzazione e disiscrizione saranno gestite da Brevo. I link nell’anteprima sono disattivati.';
}

function update() {
  if (!mayCompose()) return;
  selectTemplate();
  const values = readValues();
  const issue = validate(values);
  let ready = !issue;
  try {
    renderPreview(values, issue);
    // Validate the actual export as well as the illustrative preview.
    if (ready) renderEmailTemplate(values, { mode: 'brevo', senderEmail: testSenderEmail(), nameAttribute: 'NOME' });
    feedback(issue || 'Modello pronto da scaricare. Nessuna email verrà inviata da questo pannello.');
  } catch (error) {
    ready = false;
    $('communication-preview').removeAttribute('srcdoc');
    $('communication-preview-subject').textContent = '';
    $('communication-preview-note').textContent = 'Correggi i campi per aggiornare l’anteprima riservata del modello.';
    feedback(error?.message || 'Controlla i contenuti del modello prima di scaricarlo.', true);
  }
  for (const button of exportButtons) button.disabled = !ready;
}

function clearDraft() {
  form.reset();
  $('communication-preview').removeAttribute('srcdoc');
  $('communication-preview-subject').textContent = '';
  feedback('Compila titolo e messaggio per scaricare il modello.');
}

function setAccess(isOwner) {
  state.isOwner = isOwner;
  state.readOnly = !isOwner;
  panel.hidden = !isOwner;
  panel.inert = !isOwner;
  fields.disabled = !isOwner;
  $('communication-test-sender').textContent = isOwner ? testSenderEmail() : 'Account del gestore';
  for (const button of panel.querySelectorAll('button')) button.disabled = !isOwner;
  const subscriptionTest = $('communication-test-signup');
  if (subscriptionTest) {
    subscriptionTest.hidden = !isOwner || !newsletterConfig.signupUrl;
    if (isOwner && newsletterConfig.signupUrl) subscriptionTest.href = newsletterConfig.signupUrl;
  }
  selectTemplate();
  if (isOwner) update();
}

async function onAuthChange(user) {
  const job = ++state.authJob;
  state.controller?.abort();
  setAccess(false);
  if (!user || user.uid !== state.userId || user.emailVerified !== true) clearDraft();
  state.userId = user?.uid || null;
  if (!user || user.emailVerified !== true) return;
  const controller = new AbortController();
  state.controller = controller;
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const session = await getCatalogSession(controller.signal);
    if (job !== state.authJob || controller.signal.aborted || state.auth.currentUser()?.uid !== user.uid) return;
    setAccess(session?.canManageCatalog === true && state.auth.currentUser()?.emailVerified === true);
  } catch {
    // This optional panel must never block the existing catalog administration.
    if (job === state.authJob) setAccess(false);
  } finally {
    clearTimeout(timeout);
    if (state.controller === controller) state.controller = null;
  }
}

function download(extension, mimeType) {
  if (!mayCompose()) return;
  const values = readValues();
  const issue = validate(values);
  if (issue) { feedback(issue, true); update(); return; }
  try {
    const rendered = renderEmailTemplate(values, { mode: 'brevo', senderEmail: testSenderEmail(), nameAttribute: 'NOME' });
    const content = extension === 'html' ? rendered.html : `Oggetto: ${rendered.subject}\n\n${rendered.text}`;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `intimo-patrizia-${values.type}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    feedback(extension === 'html' ? 'Modello HTML scaricato con indirizzo copiabile. Importalo in Brevo: per gli invii da consultare anche dopo la prova usa Programma → Invia ora nella campagna.' : 'Testo con oggetto scaricato. Completa e controlla la campagna in Brevo.');
  } catch (error) {
    feedback(error?.message || 'Il modello non può essere scaricato. Controlla i campi e riprova.', true);
    for (const button of exportButtons) button.disabled = true;
  }
}

if (panel && form && fields) {
  window.addEventListener('intimopatrizia:prepare-campaign-email', event => {
    if (!mayCompose()) return;
    const data = event.detail;
    if (!data || typeof data.title !== 'string' || typeof data.body !== 'string') return;
    const values = { type: ['event','promotion'].includes(data.type) ? data.type : 'message', title: data.title.slice(0,120), body: data.body.slice(0,5000), eventDate: String(data.eventDate || '').slice(0,80), ctaLabel: String(data.ctaLabel || '').slice(0,80), ctaUrl: String(data.ctaUrl || '').slice(0,2048) };
    for (const [name,value] of Object.entries(values)) { const control = form.elements.namedItem(name); if (control) control.value = value; }
    update();
    panel.scrollIntoView({ behavior: 'auto', block: 'start' });
    form.elements.namedItem('title')?.focus({ preventScroll: true });
    feedback('Contenuti copiati nel modello. Controlla anteprima, condizioni e destinatari in Brevo prima di inviare.');
  });
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  $('communication-download-html').addEventListener('click', () => download('html', 'text/html;charset=utf-8'));
  $('communication-download-text').addEventListener('click', () => download('txt', 'text/plain;charset=utf-8'));
  $('communication-open-brevo').addEventListener('click', () => {
    if (mayCompose()) window.open('https://app.brevo.com/', '_blank', 'noopener,noreferrer');
  });
  initializeFirebaseAuth().then(auth => {
    state.auth = auth;
    if (auth?.status === 'ready') auth.onChange(onAuthChange);
  }).catch(() => setAccess(false));
}
