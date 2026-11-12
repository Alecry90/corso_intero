// Passwords are checked as entered: never trim, normalize or store them here.
export const NEW_PASSWORD_REQUIREMENTS = 'Scegli una password di almeno 8 caratteri con almeno una lettera maiuscola (A–Z).';

export function validateAccountPassword(value, { signup = false } = {}) {
  if (typeof value !== 'string' || !value) return 'Inserisci la password.';
  if (value.length > 4096) return 'Usa una password di non più di 4096 caratteri.';
  if (signup && (value.length < 8 || !/[A-Z]/.test(value))) return NEW_PASSWORD_REQUIREMENTS;
  return '';
}

export function describeAccountError(error, operation = '') {
  const code = error?.code;
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(code)) return 'Email o password non corrette. Controlla i dati e riprova.';
  if (code === 'auth/invalid-email') return 'Inserisci un indirizzo email valido.';
  if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements') {
    if (operation === 'login') return 'La password deve essere aggiornata: servono almeno 8 caratteri e una lettera maiuscola (A–Z). Inserisci la tua email e scegli “Hai dimenticato la password?” per impostarne una nuova.';
    return NEW_PASSWORD_REQUIREMENTS;
  }
  if (code === 'auth/email-already-in-use') return 'Esiste già un account con questa email. Accedi oppure recupera la password.';
  if (code === 'auth/too-many-requests') return 'Sono stati effettuati molti tentativi. Attendi qualche minuto prima di riprovare.';
  if (code === 'auth/network-request-failed' || error instanceof TypeError) return 'Connessione non disponibile. Controlla la rete e riprova.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'La finestra Google è stata chiusa prima di completare l’accesso. Puoi riprovare.';
  if (code === 'auth/popup-blocked') return 'Il browser ha bloccato la finestra Google. Consenti i popup per questo sito oppure usa email e password.';
  if (code === 'auth/account-exists-with-different-credential') return 'Questo account usa un altro metodo di accesso. Prova email e password oppure il metodo usato per registrarti.';
  if (code === 'auth/user-disabled') return 'L’accesso di questo account è stato disabilitato. Contatta il negozio per assistenza.';
  if (code === 'auth/requires-recent-login' || code === 'auth/user-token-expired' || code === 'auth/invalid-user-token') return 'Per continuare, esci dall’account e accedi di nuovo.';
  if (code === 'auth/operation-not-allowed' || code === 'auth/unauthorized-domain') return 'Questo metodo di accesso non è ancora disponibile. Puoi usare un altro metodo o riprovare più tardi.';
  return 'Non è stato possibile completare l’operazione. Riprova tra poco.';
}
