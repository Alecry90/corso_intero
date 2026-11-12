# Intimo Patrizia

Sito multipagina per Intimo Patrizia, Bari: HTML, CSS e JavaScript con Vite. L’architettura corrente usa **Firebase Spark**, con Hosting statico, Authentication e accesso diretto a Firestore protetto dalle regole. Non distribuisce Cloud Functions, Cloud Storage o servizi a consumo.

## Funzioni

- Consultazione pubblica senza account; registrazione e login facoltativi con Google oppure email e password.
- Account utile da subito: nome facoltativo, reparti scelti e fino a 200 preferiti privati, persistenti fra accessi e cancellabili dall’account. Consigli dalla navigazione facoltativi, inizialmente spenti: dopo consenso i segnali restano nella sessione della scheda, senza cronologia cloud. Nessuna iscrizione marketing al login. Guida semplice in [DATABASE-GUIDA.md](docs/DATABASE-GUIDA.md).
- Gestione di reparti, prodotti, bozze, disponibilità e fino a tre fotografie per prodotto.
- Scritture riservate alla sola email **alessandroferrara01@libero.it**, verificata da Firebase. I vecchi custom claim non concedono privilegi.
- Le pagine del catalogo visibili controllano una revisione ogni 15 secondi e al ritorno sulla pagina; le schede dello stesso browser ricevono una notifica dopo il salvataggio. Ricerca, filtri e focus vengono conservati.
- Foto compresse e ricodificate nel browser in WebP, massimo 300 KiB ciascuna, archiviate separatamente in Firestore e scaricate vicino all’area visibile. Le foto di bozze, esempi e reparti nascosti non sono pubbliche.

Limiti applicativi: 50 reparti, 5000 prodotti, fino a tre foto per prodotto (massimo 300 KiB ciascuna). Il catalogo pubblico carica 24 prodotti per pagina e la gestione 50, con cursori Firestore e ricerca progressiva sull’intero reparto; la Home legge una selezione ridotta. Le quote gratuite Firebase si applicano all’intero progetto: superarle può interrompere il servizio, senza attivare automaticamente pagamenti su Spark. Non è una garanzia di disponibilità illimitata.

Acquisiti i 21 titoli della cartella **Catalogo prodotti di Note iCloud**, organizzati nel sito in 6 reparti. La sorgente è documentata in `catalog/notes-categories.json`. Nessun prodotto importato; i quattro reparti iniziali sono nascosti e i dodici esempi conservati. Le modifiche alle Note non si sincronizzano automaticamente: prodotti e foto si gestiscono dal pannello del sito.

## Sviluppo

Usare Node 22.12 o successivo e le dipendenze del lockfile:

```text
npm ci
npm run dev
npm run build
npm test
```

La configurazione Web pubblica è in `.env.local`, sul modello di `.env.example`. Nessuna credenziale amministrativa va nel frontend. In sviluppo senza Firebase il catalogo usa `public/data/catalog.json`, vuoto. Gli esempi sono disponibili solo con `VITE_CATALOG_MODE=demo`, vietato nel deploy.

## Struttura

- `src/firestore-catalog.js`: letture, autorizzazione verificata dalle regole e transazioni.
- `src/catalog-pager.js`: unione ordinata delle pagine dei reparti, cursori e piccoli buffer di lettura.
- `firestore.rules`: protezione dati e validazione delle scritture.
- `src/catalog-images.js`: caricamento differito e URL temporanei delle foto.
- `src/account.js`, `src/admin.js`, `src/catalog.js`: account, gestione e catalogo.
- `functions/`: implementazione precedente conservata come riferimento, **esclusa dal deploy corrente**. I suoi test non verificano l’architettura Spark.
- `docs/FIREBASE.md`, `docs/DEPLOYMENT.md`, `docs/QA.md`: architettura, stato cloud e verifiche.

## Pubblicazione gratuita

```text
npm run firebase:status -- --project intimopatrizia-bari
npm run firebase:deploy -- --project intimopatrizia-bari
```

Lo script verifica che la fatturazione sia disabilitata, blocca configurazioni demo/emulatore o progetti discordanti, costruisce il sito e distribuisce soltanto Auth, regole/indici Firestore e Hosting. Non abilita pagamenti. Stato effettivo e prove ancora necessarie in [DEPLOYMENT.md](docs/DEPLOYMENT.md).

Prima del rilascio definitivo restano da completare i dati dell’attività e le informative segnate come bozza: vedere [PROJECT-CHECKLIST.md](docs/PROJECT-CHECKLIST.md).

## Comunicazioni email: modalità prova

Tre modelli nell’area gestore (promozione/evento/messaggio), anteprima sandbox e download HTML/testo compatibile con Brevo. Account Brevo gratuito configurato con modulo opt-in e conferma email; prova del titolare confermata. Nessun dato Firebase esportato e nessuna chiave API nel sito. `public/data/newsletter.json` conserva il solo link pubblico, con `testMode: true` e `enabled: false`: i link per i clienti restano nascosti finché non arriva il mittente del negozio e vengono completate le impostazioni privacy. Mittente temporaneo esclusivamente di prova: email Libero del titolare. Gli invii avvengono da Brevo, non da Firebase o automaticamente dal login.

## Struttura negozio · 21 ottobre 2026

Galleria fino a tre foto, codice/marca, Home Novità e In vetrina, filtri dettagliati, link diretti e richieste precompilate. Area gestore con duplicazione in bozza, importazione CSV fino a 50 righe con controllo iniziale, promozioni/eventi/collezioni e dati/orari pubblici. Nessun invio automatico di email e nessun prodotto dimostrativo pubblicato. Guida: [STRUTTURA-SITO-GUIDA.md](docs/STRUTTURA-SITO-GUIDA.md).
