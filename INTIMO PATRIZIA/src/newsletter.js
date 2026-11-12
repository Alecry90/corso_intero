// Only a public link is loaded here. No identity, address, token or preference
// is sent to Brevo until the visitor chooses to open its subscription page.
export async function initializeNewsletter() {
  const sections = [...document.querySelectorAll('[data-newsletter]')];
  if (!sections.length) return;
  try {
    const response = await fetch('/data/newsletter.json', { cache: 'no-store' });
    if (!response.ok) return;
    const config = await response.json();
    if (config.enabled !== true || config.testMode === true || typeof config.signupUrl !== 'string') return;
    const url = new URL(config.signupUrl);
    if (url.protocol !== 'https:' || url.username || url.password || !/^([a-z0-9-]+\.)?sibforms\.com$/.test(url.hostname)) return;
    for (const section of sections) {
      for (const link of section.querySelectorAll('[data-newsletter-link]')) {
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      section.hidden = false;
    }
  } catch { /* A provider configuration failure never blocks the account. */ }
}

initializeNewsletter();
