# Account e password

Configurazione pubblicata il 23 ottobre 2026 sul progetto `intimopatrizia-bari`.

**Cloud Firestore** è il database di prodotti, preferenze e preferiti. **Firebase Authentication** gestisce identità, accesso e credenziali. Le password non vengono salvate nelle schede cliente di Firestore, inviate a Brevo o scritte nei log del sito.

## Requisiti attivi

- Almeno 8 caratteri e almeno una lettera maiuscola A–Z.
- Massimo 4096 caratteri; numeri, minuscole e simboli non sono obbligatori.
- Applicazione obbligatoria sul servizio Firebase, oltre alla validazione immediata del modulo di registrazione.
- Un account per email; i duplicati ricevono il messaggio «Esiste già un account con questa email. Accedi oppure recupera la password».
- Protezione contro l'enumerazione email mantenuta attiva. Nessuna ricerca preventiva degli indirizzi degli altri utenti.

## Account già esistenti

`forceUpgradeOnSignin` è attivo: al prossimo accesso con email e password, una password non conforme deve essere aggiornata tramite **Hai dimenticato la password?**. Il sito spiega il motivo e guida al recupero. L'utente mantiene la stessa email e lo stesso account; preferiti e dati collegati non vengono cancellati. Non sono state revocate le sessioni attive. L'accesso con Google continua a essere gestito da Google.

Per recuperare una password, il cliente inserisce l'email nel modulo di accesso e sceglie **Hai dimenticato la password?**. Riceve le istruzioni da Firebase e sceglie personalmente la nuova password; il recupero restituisce un messaggio neutro anche per indirizzi sconosciuti. Non creare un secondo account per aggiornare la password.

## Dove vedere le impostazioni

Apri [Firebase Authentication](https://console.firebase.google.com/project/intimopatrizia-bari/authentication/users).

- **Utenti**: account registrati, metodo di accesso, date e identificativo UID. Le password non sono visualizzabili in chiaro.
- **Metodo di accesso**: provider email/password e Google.
- **Impostazioni → Policy relative alle password**: Richiedi applicazione, Richiedi carattere maiuscolo, Forza l'upgrade all'accesso, minimo8, massimo4096.
- **Modelli**: contenuto delle email di verifica e recupero inviate da Firebase.

L'accesso alla console Google del progetto è distinto dall'account gestore del sito. Il gestore del sito resta soltanto l'email verificata `alessandroferrara01@libero.it`.

## Manutenzione e verifica

Configurazione versionata in `config/auth-password-policy.json`; applicazione e verifica con `scripts/configure-password-policy.mjs --project intimopatrizia-bari --confirm-project intimopatrizia-bari`. Lo script modifica soltanto `passwordPolicyConfig`, preserva unicità email e protezioni privacy e viene richiamato nella procedura completa di deploy.

Verificati: test unitari del validatore e dei messaggi; lettura della policy reale tramite SDK `validatePassword` (sette caratteri rifiutati, otto minuscoli rifiutati, otto con maiuscola accettati); rifiuti nella pagina online e valori nella console Firebase. La verifica SDK recupera la policy e valuta le stringhe localmente. Nessuna registrazione, password reale, email di recupero o credenziale modificata per il collaudo; recupero con un codice email reale non eseguito.

Fonti: [Firebase password authentication](https://firebase.google.com/docs/auth/web/password-auth), [protezione email](https://docs.cloud.google.com/identity-platform/docs/admin/email-enumeration-protection), [policy REST](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects.tenants#PasswordPolicyConfig).
