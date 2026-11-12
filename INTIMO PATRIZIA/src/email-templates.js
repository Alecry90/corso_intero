/**
 * Pure email composition: no contact lookup, storage, network calls or delivery.
 * Brevo syntax is documented at:
 * https://help.brevo.com/hc/es/articles/360001030599-Personalice-su-e-mail-con-condiciones-IF
 * https://help.brevo.com/hc/it/articles/209553645-Inserimento-di-un-link-di-disiscrizione-personalizzato-nelle-email
 */
export const EMAIL_TEMPLATE_TYPES = Object.freeze(['promotion', 'event', 'message']);

export const EMAIL_TEMPLATE_LABELS = Object.freeze({
  promotion: 'Promozione',
  event: 'Evento',
  message: 'Un messaggio da Intimo Patrizia',
});

const SITE_ORIGIN = 'https://intimopatrizia-bari.web.app';
const CONTACT_EMAIL = 'intimopatrizia@libero.it';
// Keep these values aligned with src/boutique.css; email clients cannot use CSS variables.
const COLORS = Object.freeze({ bone: '#f9f6f0', paper: '#fffdf9', linen: '#eee7db', wine: '#622d39', ink: '#332b27', muted: '#4e443d' });
const brevoGreeting = attribute => `{% if contact.${attribute} %}Ciao {{ contact.${attribute} }}{% else %}Ciao{% endif %}`;
const BREVO_UNSUBSCRIBE = '{{ unsubscribe }}';

function field(value, label, limit, { required = false, multiline = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new TypeError(`${label}: inserisci un testo.`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    throw new TypeError(`${label}: il testo contiene caratteri non validi.`);
  }
  if (!multiline && /[\r\n\u2028\u2029]/u.test(value)) {
    throw new TypeError(`${label}: usa una sola riga.`);
  }
  const normalized = value.replace(/\r\n?/gu, '\n').trim();
  if (required && !normalized) throw new TypeError(`${label}: campo obbligatorio.`);
  if (normalized.length > limit) throw new TypeError(`${label}: massimo ${limit} caratteri.`);
  return normalized;
}

function ctaUrl(value) {
  const raw = field(value, 'Link del pulsante', 2048);
  if (!raw) return '';
  // Reject ambiguous URLs before URL() can silently normalize them.
  if (/[\s\\<>"'`]/u.test(raw) || /%(?![a-f\d]{2})/iu.test(raw) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/iu.test(raw)) {
    throw new TypeError('Link del pulsante: usa un URL HTTPS valido del sito Intimo Patrizia.');
  }
  if (!(raw.startsWith('/') && !raw.startsWith('//')) && !raw.startsWith('https://')) {
    throw new TypeError('Link del pulsante: usa HTTPS o un percorso interno che inizi con /.');
  }
  let url;
  try { url = new URL(raw, SITE_ORIGIN); } catch {
    throw new TypeError('Link del pulsante: URL non valido.');
  }
  if (url.origin !== SITE_ORIGIN || url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new TypeError('Link del pulsante: sono consentite solo pagine di intimopatrizia-bari.web.app.');
  }
  return url.href;
}

/** Validate and normalize the editor fields without inventing commercial terms. */
export function validateEmailTemplate(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('Inserisci i dati del messaggio.');
  if (!EMAIL_TEMPLATE_TYPES.includes(values.type)) throw new TypeError('Scegli un modello: promozione, evento o messaggio.');
  const normalized = {
    type: values.type,
    title: field(values.title, 'Titolo', 120, { required: true }),
    body: field(values.body, 'Messaggio', 6000, { required: true, multiline: true }),
    eventDate: field(values.eventDate, 'Data e ora', 80),
    eventLocation: field(values.eventLocation, 'Luogo', 200),
    promotionDetails: field(values.promotionDetails, 'Dettagli della promozione', 2000, { multiline: true }),
    promotionConditions: field(values.promotionConditions, 'Condizioni della promozione', 2000, { multiline: true }),
    ctaLabel: field(values.ctaLabel, 'Testo del pulsante', 80),
    ctaUrl: ctaUrl(values.ctaUrl),
  };
  if (Boolean(normalized.ctaLabel) !== Boolean(normalized.ctaUrl)) {
    throw new TypeError('Per aggiungere un pulsante, inserisci sia il testo sia il link.');
  }
  return normalized;
}

function escapeHtml(value) {
  // Braces are entities too: authored content must not become Brevo template code.
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '{': '&#123;', '}': '&#125;' };
  return value.replace(/[&<>"'{}]/gu, (character) => entities[character]);
}

function plainText(value, mode) {
  // Text email has no entity decoding. Separate user-supplied template delimiters.
  return mode === 'brevo' ? value.replace(/\{(?=[{%#])/gu, '{ ') : value;
}

function paragraphs(value, style = '') {
  return value.split(/\n{2,}/u).map((paragraph) => `<p style="margin:0 0 18px;line-height:1.65;${style}">${escapeHtml(paragraph).replace(/\n/gu, '<br>')}</p>`).join('');
}

function senderAddress(value) {
  const email = field(value, 'Email mittente', 254, { required: true });
  if (!/^[a-z\d._%+-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+$/iu.test(email)) {
    throw new TypeError('Email mittente: indirizzo non valido.');
  }
  return email;
}

/**
 * Return { subject, html, text } for a local preview or a Brevo campaign.
 * Brevo resolves its own recipient attributes and unsubscribe URL at delivery.
 */
export function renderEmailTemplate(values, { mode = 'preview', recipientName = '', senderEmail = CONTACT_EMAIL, nameAttribute = 'FIRSTNAME' } = {}) {
  if (mode !== 'preview' && mode !== 'brevo') throw new TypeError('Modalità email non valida.');
  if (!['FIRSTNAME', 'NOME'].includes(nameAttribute)) throw new TypeError('Attributo del nome non valido.');
  const data = validateEmailTemplate(values);
  const email = senderAddress(senderEmail);
  const name = field(recipientName, 'Nome destinatario di esempio', 120);
  const greeting = mode === 'brevo' ? brevoGreeting(nameAttribute) : `Ciao${name ? ` ${name}` : ''}`;
  const htmlGreeting = mode === 'brevo' ? greeting : escapeHtml(greeting);
  const details = [];
  if (data.type === 'promotion') {
    if (data.promotionDetails) details.push(['Dettagli della promozione', data.promotionDetails]);
    if (data.promotionConditions) details.push(['Condizioni della promozione', data.promotionConditions]);
  }
  if (data.type === 'event') {
    if (data.eventDate) details.push(['Data e ora', data.eventDate]);
    if (data.eventLocation) details.push(['Luogo', data.eventLocation]);
  }
  const detailHtml = details.map(([label, value]) => `<tr><td style="padding:18px 24px;background:${COLORS.linen};color:${COLORS.ink};font-family:Arial,sans-serif;font-size:16px;"><p style="margin:0 0 8px;color:${COLORS.wine};font-weight:bold;">${label}</p>${paragraphs(value, 'margin-bottom:0;')}</td></tr>`).join('');
  const buttonHtml = data.ctaUrl ? `<tr><td style="padding:12px 24px 30px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${COLORS.wine};"><a href="${escapeHtml(data.ctaUrl)}" style="display:inline-block;padding:15px 24px;color:${COLORS.paper};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;line-height:1.4;text-decoration:none;">${escapeHtml(data.ctaLabel)}</a></td></tr></table><p style="margin:16px 0 0;color:${COLORS.muted};font-family:Arial,sans-serif;font-size:14px;line-height:1.65;">Se il pulsante non si apre, copia questo indirizzo nel browser:<span style="display:block;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(data.ctaUrl)}</span></p></td></tr>` : '';
  const unsubscribeHtml = mode === 'brevo'
    ? `<a href="${BREVO_UNSUBSCRIBE}" style="color:${COLORS.wine};text-decoration:underline;">Disiscriviti</a>`
    : `<a role="link" aria-disabled="true" style="color:${COLORS.muted};text-decoration:underline;">Disiscriviti (esempio, link non attivo nell'anteprima)</a>`;
  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(data.title)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.bone};color:${COLORS.ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${COLORS.bone};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${COLORS.paper};">
<tr><td style="padding:28px 24px;background:${COLORS.wine};color:${COLORS.paper};font-family:Georgia,serif;font-size:28px;line-height:1.2;">Intimo Patrizia <span style="font-family:Arial,sans-serif;font-size:14px;">· Bari</span></td></tr>
<tr><td style="padding:30px 24px 0;font-family:Arial,sans-serif;font-size:13px;color:${COLORS.wine};">${EMAIL_TEMPLATE_LABELS[data.type]}</td></tr>
<tr><td style="padding:14px 24px 0;"><h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:32px;font-weight:normal;line-height:1.2;color:${COLORS.wine};">${escapeHtml(data.title)}</h1></td></tr>
<tr><td style="padding:0 24px 12px;font-family:Arial,sans-serif;font-size:17px;color:${COLORS.ink};"><p style="margin:0 0 18px;line-height:1.65;">${htmlGreeting},</p>${paragraphs(data.body)}</td></tr>
${detailHtml}${buttonHtml}
<tr><td style="padding:28px 24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.65;color:${COLORS.muted};border-top:1px solid ${COLORS.linen};"><p style="margin:0 0 12px;">Intimo Patrizia · Bari<br><a href="mailto:${escapeHtml(email)}" style="color:${COLORS.wine};text-decoration:underline;">${escapeHtml(email)}</a></p><p style="margin:0;">${unsubscribeHtml}</p></td></tr>
</table></td></tr></table></body></html>`;
  const textParts = [EMAIL_TEMPLATE_LABELS[data.type], data.title, `${greeting},`, data.body, ...details.map(([label, value]) => `${label}\n${value}`)];
  if (data.ctaUrl) textParts.push(`${data.ctaLabel}\n${data.ctaUrl}`);
  // Only deliberately generated Brevo tags bypass plainText().
  const text = [
    ...textParts.map((part, index) => index === 2 && mode === 'brevo' ? part : plainText(part, mode)),
    `Intimo Patrizia · Bari\n${plainText(email, mode)}`,
    mode === 'brevo' ? `Disiscriviti: ${BREVO_UNSUBSCRIBE}` : "Disiscriviti (esempio, link non attivo nell'anteprima).",
  ].join('\n\n');
  return { subject: plainText(data.title, mode), html, text };
}
