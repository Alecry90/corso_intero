import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_TEMPLATE_TYPES, renderEmailTemplate, validateEmailTemplate } from '../src/email-templates.js';

const message = { type: 'message', title: 'Novità dalla boutique', body: 'Un messaggio per te.\nTi aspettiamo.' };

test('Italian Brevo account uses its actual NOME attribute and rejects template identifiers', () => {
  const result = renderEmailTemplate(message, { mode: 'brevo', nameAttribute: 'NOME' });
  assert.match(result.html, /contact\.NOME/);
  assert.doesNotMatch(result.html, /contact\.FIRSTNAME/);
  assert.throws(() => renderEmailTemplate(message, { nameAttribute: 'NOME }}' }), TypeError);
});

test('three email types contain the authored content, business contact and a preview unsubscribe example', () => {
  assert.deepEqual(EMAIL_TEMPLATE_TYPES, ['promotion', 'event', 'message']);
  for (const type of EMAIL_TEMPLATE_TYPES) {
    const result = renderEmailTemplate({ ...message, type }, { recipientName: 'Maria' });
    assert.equal(result.subject, message.title);
    assert.match(result.html, /Ciao Maria,/u);
    assert.match(result.text, /Ciao Maria,/u);
    assert.match(result.html, /Intimo Patrizia/u);
    assert.match(result.text, /Intimo Patrizia · Bari\nintimopatrizia@libero\.it/u);
    assert.match(result.html, /Disiscriviti \(esempio, link non attivo nell'anteprima\)/u);
    assert.doesNotMatch(result.html, /href="(?:#|\{\{ unsubscribe \}\})"/u);
    assert.doesNotMatch(result.html, /<(?:script|img|iframe|style)\b/iu);
    assert.match(result.html, /<table role="presentation"/u);
    assert.match(result.html, /#f9f6f0/u);
    assert.match(result.html, /#622d39/u);
  }
});

test('preview greeting falls back to Ciao when the optional name is absent or blank', () => {
  for (const recipientName of [undefined, '', '  ', null]) {
    const result = renderEmailTemplate(message, { recipientName });
    assert.match(result.html, />Ciao,<\/p>/u);
    assert.match(result.text, /\n\nCiao,\n\n/u);
    assert.doesNotMatch(result.html, /Ciao undefined|Ciao null/u);
  }
});

test('Brevo variants retain only intentional recipient and unsubscribe tokens with a generic name fallback', () => {
  for (const type of EMAIL_TEMPLATE_TYPES) {
    const result = renderEmailTemplate({ ...message, type }, { mode: 'brevo', recipientName: 'Esempio da ignorare' });
    const greeting = '{% if contact.FIRSTNAME %}Ciao {{ contact.FIRSTNAME }}{% else %}Ciao{% endif %}';
    assert.ok(result.html.includes(greeting));
    assert.ok(result.text.includes(greeting));
    assert.ok(result.html.includes('href="{{ unsubscribe }}"'));
    assert.ok(result.text.includes('Disiscriviti: {{ unsubscribe }}'));
    assert.doesNotMatch(result.html, /Esempio da ignorare|link non attivo/u);
  }
});

test('every authored HTML field is escaped and cannot become a script, attribute or Brevo expression', () => {
  const attack = '<img src=x onerror="alert(1)"> & \' {{ params.EVIL }} {% if true %}';
  const values = {
    type: 'promotion', title: attack.slice(0, 120), body: attack,
    promotionDetails: attack, promotionConditions: attack,
    ctaLabel: '<b>{{ params.EVIL }}</b>', ctaUrl: '/catalogo.html?categoria=intimo&ordine=nome',
  };
  const result = renderEmailTemplate(values, { mode: 'brevo' });
  assert.doesNotMatch(result.html, /<img|<b>|\{\{ params\.EVIL \}\}|\{% if true %\}/u);
  assert.ok(result.html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;'));
  assert.ok(result.html.includes('&#123;&#123; params.EVIL &#125;&#125;'));
  assert.ok(result.html.includes('href="https://intimopatrizia-bari.web.app/catalogo.html?categoria=intimo&amp;ordine=nome"'));
  assert.doesNotMatch(result.text, /\{\{ params\.EVIL|\{% if true/u);
  assert.doesNotMatch(result.subject, /\{\{ params\.EVIL|\{% if true/u);
  const event = renderEmailTemplate({ ...message, type: 'event', eventDate: '<img src=x>', eventLocation: attack });
  assert.doesNotMatch(event.html, /<img/u);
  const preview = renderEmailTemplate(message, { recipientName: '<svg onload="alert(1)">' });
  assert.ok(preview.html.includes('Ciao &lt;svg onload=&quot;alert(1)&quot;&gt;,'));
});

test('event and promotion metadata is optional, renders only for its type and never invents commercial terms', () => {
  const result = renderEmailTemplate({
    ...message, type: 'promotion', promotionDetails: 'Articoli selezionati in negozio.',
    promotionConditions: 'Condizioni da verificare in negozio.', eventDate: '24 ottobre', eventLocation: 'Bari',
  });
  assert.match(result.text, /Articoli selezionati in negozio\./u);
  assert.match(result.text, /Condizioni da verificare in negozio\./u);
  assert.doesNotMatch(result.text, /24 ottobre|Data e ora|%|gratuit|sconto/iu);
  const event = renderEmailTemplate({ ...message, type: 'event', eventDate: '24 ottobre, ore 18', eventLocation: 'Luogo comunicato dalla boutique' });
  assert.match(event.text, /Data e ora\n24 ottobre, ore 18/u);
  assert.match(event.text, /Luogo\nLuogo comunicato dalla boutique/u);
  assert.doesNotMatch(renderEmailTemplate({ ...message, type: 'promotion' }).text, /Condizioni della promozione/u);
});

test('validation enforces type, required fields and precise content boundaries without mutating values', () => {
  const original = { ...message, title: '  Titolo  ', body: 'Prima\r\nSeconda' };
  const normalized = validateEmailTemplate(original);
  assert.equal(normalized.title, 'Titolo');
  assert.equal(normalized.body, 'Prima\nSeconda');
  assert.equal(original.title, '  Titolo  ');
  assert.doesNotThrow(() => validateEmailTemplate({ ...message, title: 'a'.repeat(120), body: 'b'.repeat(6000) }));
  for (const values of [null, [], { ...message, type: 'altro' }, { ...message, title: '' }, { ...message, body: '  ' }, { ...message, title: 1 }, { ...message, title: 'a'.repeat(121) }, { ...message, body: 'b'.repeat(6001) }]) {
    assert.throws(() => validateEmailTemplate(values), TypeError);
  }
});

test('subjects cannot carry CRLF headers, line separators or control characters', () => {
  for (const title of ['Titolo\r\nBcc: vittima@example.com', 'Titolo\naltro', 'Titolo\raltro', 'Titolo\u2028altro', 'Titolo\0altro']) {
    assert.throws(() => renderEmailTemplate({ ...message, title }), TypeError);
  }
});

test('CTA accepts only unambiguous HTTPS URLs on the real site or internal paths and requires a label', () => {
  for (const ctaUrl of ['/catalogo.html', 'https://intimopatrizia-bari.web.app/contatti.html']) {
    const result = renderEmailTemplate({ ...message, ctaUrl, ctaLabel: 'Visita il sito' });
    assert.match(result.html, /href="https:\/\/intimopatrizia-bari\.web\.app\//u);
    assert.match(result.text, /Visita il sito\nhttps:\/\/intimopatrizia-bari\.web\.app\//u);
  }
  for (const ctaUrl of ['javascript:alert(1)', 'data:text/html,x', '//evil.example/x', 'http://intimopatrizia-bari.web.app/', 'https://evil.example/', 'https://intimopatrizia-bari.web.app.evil.example/', 'https://evil.example@intimopatrizia-bari.web.app/', 'https://intimopatrizia-bari.web.app:444/', '/\\evil.example', '/catalogo.html\n', '/catalogo%0a.html', '/catalogo%5c.html', '/catalogo%zz.html']) {
    assert.throws(() => renderEmailTemplate({ ...message, ctaUrl, ctaLabel: 'Visita' }), TypeError, ctaUrl);
  }
  assert.throws(() => renderEmailTemplate({ ...message, ctaUrl: '/catalogo.html' }), /sia il testo sia il link/u);
  assert.throws(() => renderEmailTemplate({ ...message, ctaLabel: 'Visita' }), /sia il testo sia il link/u);
  assert.doesNotMatch(renderEmailTemplate(message).html, /Visita il sito/u);
});

test('each CTA includes its permanent address as escaped copyable text, preserving product queries and fragments', () => {
  const addresses = [
    ['/catalogo.html?categoria=intimo&ordine=nome#novita', 'https://intimopatrizia-bari.web.app/catalogo.html?categoria=intimo&ordine=nome#novita'],
    ['https://intimopatrizia-bari.web.app/catalogo.html?prodotto=patrizia-42&tag=Novit%C3%A0#scheda', 'https://intimopatrizia-bari.web.app/catalogo.html?prodotto=patrizia-42&tag=Novit%C3%A0#scheda'],
  ];
  for (const type of EMAIL_TEMPLATE_TYPES) {
    for (const mode of ['preview', 'brevo']) {
      for (const [ctaUrl, expectedUrl] of addresses) {
        const result = renderEmailTemplate({ ...message, type, ctaUrl, ctaLabel: 'Guarda il catalogo' }, { mode });
        const escapedUrl = expectedUrl.replace(/&/gu, '&amp;');
        const fallback = result.html.match(/<p\b[^>]*>Se il pulsante non si apre, copia questo indirizzo nel browser:[\s\S]*?<\/p>/u)?.[0];
        assert.ok(fallback, `${type} ${mode}: missing copyable address`);
        assert.equal(fallback.match(/<span\b[^>]*>([^<]*)<\/span>/u)?.[1], escapedUrl);
        assert.doesNotMatch(fallback, /<a\b|sendibt|\{[\{%#]/iu);
        assert.equal(result.html.split(`href="${escapedUrl}"`).length - 1, 1);
        assert.ok(result.text.includes(`Guarda il catalogo\n${expectedUrl}`));
      }
      assert.doesNotMatch(renderEmailTemplate({ ...message, type }, { mode }).html, /Se il pulsante non si apre/u);
    }
  }
});

test('sender validation prevents mailto attribute and header injection; options reject unknown modes', () => {
  for (const senderEmail of ['bad', 'real@example.com\r\nBcc:a@b.it', 'x\" onclick=\"alert(1)@example.com', '', 'a b@example.com']) {
    assert.throws(() => renderEmailTemplate(message, { senderEmail }), TypeError);
  }
  assert.throws(() => renderEmailTemplate(message, { mode: 'send' }), TypeError);
});
