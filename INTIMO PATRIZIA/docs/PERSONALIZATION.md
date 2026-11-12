# Home personale e database

Implementazione del 20 ottobre 2026. Stato della pubblicazione in [DEPLOYMENT.md](DEPLOYMENT.md).

La Home invita ad accedere solo i visitatori anonimi. Dopo l’accesso mostra il nome scelto e fino a quattro prodotti pubblici disponibili. Preferiti e reparti scelti funzionano anche senza personalizzazione da navigazione. La selezione generale e il catalogo vuoto sono dichiarati senza inventare prodotti.

## Dati e consenso

- Authentication gestisce identità, email e credenziali.
- `customerProfiles/{uid}` conserva nome facoltativo, reparti espliciti, fino a 200 ID preferiti e ultima modifica. È privato del cliente e non elencabile dal gestore.
- `customerPersonalization/{uid}` contiene soltanto `enabled`, `policyVersion`, `updatedAt`; viene creato salvando la scelta, mai al solo login. Versione: `2026-10-20-session-v1`.
- `sessionStorage`, chiave `intimo-navigation-v1:UID`, contiene al massimo 20 ID prodotto e sei punteggi interi limitati a 1000, solo dopo verifica positiva della scelta sul server. Nessuna email, frase di ricerca o cronologia temporale.

La scelta inizialmente è spenta. Verifica fallita o versione sconosciuta bloccano la raccolta. Revoca, cancellazione, logout e cambio account eliminano i segnali; la sessione termina secondo il funzionamento del browser alla chiusura della scheda. La scelta rimane salvata tra accessi, i segnali non costituiscono uno storico tra dispositivi. BroadcastChannel comunica le modifiche alle altre schede, con nuova verifica anche al ritorno sulla pagina. Risposte asincrone non possono trasferire segnali a un altro UID.

## Ordinamento

Preferiti: 100; prodotto consultato: 40 più recenza limitata; reparto esplicito: 20; categoria di un preferito: 10; punteggio di navigazione del reparto: massimo 20. Una consultazione aggiunge 3 al reparto; una ricerca aggiunge 1 ai tre reparti più pertinenti. La ricerca viene considerata dopo 600 ms senza digitazione o all’invio, a risultati completati. Le frasi servono nella pagina per individuare i reparti e non vengono serializzate o inviate a Firestore.

La Home legge un’anteprima limitata e al massimo 12 prodotti indicati da preferiti/consultazioni: è una selezione di candidati, non il confronto dell’intero inventario con un servizio AI. Esclude esempi, bozze, prodotti non disponibili e reparti nascosti. Il testo spiega se i consigli usano scelte esplicite, sessione o catalogo generale.

## Crescita

Catalogo con 24 e pannello con 50 articoli per pagina, cursori Firestore e limite applicativo di 5000. La ricerca per sottostringa esamina progressivamente i prodotti pertinenti, dichiarando il caricamento: un catalogo grande richiede più tempo e letture. Nessun servizio di ricerca a pagamento aggiunto.

Nessuno storico cloud, sincronizzazione Note iCloud o invio campagne al login è implementato. Accesso, personalizzazione e iscrizione Brevo rimangono separati. Per uno storico futuro tra dispositivi serviranno nuove spiegazioni, scelta e limiti di conservazione.

Fonti: [quote Firestore](https://firebase.google.com/docs/firestore/quotas), [cursori Firebase](https://firebase.google.com/docs/firestore/query-data/query-cursors), [Garante: cookie e altri strumenti](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876). Le informative pubbliche restano bozze da completare con i dati reali dell’attività.
