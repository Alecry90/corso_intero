import { initializeFirebaseAuth } from './firebase-auth.js';
import { loadCustomerProfile } from './customer-profile.js';

export function initializeHeaderAccount(header) {
  if (!header) return;
  const labels = header.querySelectorAll('[data-account-label]');
  const links = header.querySelectorAll('.header-visit, .mobile-account-link');
  let auth;
  let uid = null;
  let revision = 0;

  function render(signedIn, name = '') {
    const label = signedIn === null ? 'Account' : signedIn ? name || 'Il tuo account' : 'Accedi';
    for (const element of labels) element.textContent = label;
    for (const link of links) {
      link.setAttribute('aria-label', signedIn === null ? 'Apri il tuo account' : signedIn ? `Apri il tuo account${name ? `, ${name}` : ''}` : 'Accedi o apri il tuo account');
      if (name) link.title = name;
      else link.removeAttribute('title');
    }
  }

  render(null);

  document.addEventListener('customer-profile-changed', event => {
    if (!uid || event.detail?.uid !== uid || auth?.currentUser()?.uid !== uid) return;
    revision++;
    render(true, event.detail.displayName);
  });

  initializeFirebaseAuth().then(session => {
    auth = session;
    if (auth.status !== 'ready') { render(false); return; }
    auth.onChange(async user => {
      const nextUid = user?.uid || '';
      if (nextUid === uid) return;
      uid = nextUid;
      const job = ++revision;
      render(Boolean(user));
      if (!user) return;
      try {
        const profile = await loadCustomerProfile(user);
        if (job === revision && auth.currentUser()?.uid === user.uid) render(true, profile.displayName);
      } catch {
        // Keep the account link usable when the private profile is unavailable.
      }
    });
  }).catch(() => render(false));
}
