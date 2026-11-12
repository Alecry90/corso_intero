# Catalogo prodotti

## Sorgente richiesta

La sorgente indicata dall’utente è esclusivamente la cartella **Catalogo prodotti nelle Note dell’iPhone**, condivisa tramite:
https://www.icloud.com/notes/0e9k4aF4HDLTGmaUNvIXKpfCw

Non si tratta di cartelle sul computer o di iCloud Drive. Dopo l’accesso dell’utente sono stati acquisiti i 21 titoli delle note nella cartella: il manifest `catalog/notes-categories.json` conserva la corrispondenza con i nomi pubblici. Il sito li organizza in 6 reparti e 21 sezioni. Non è configurata una sincronizzazione automatica con Apple Notes.

Il pannello del sito consente l’inserimento diretto di reparti, prodotti e fotografie. Il file locale di ripiego è vuoto. L’importazione del 20 ottobre crea 21 categorie, nasconde le 4 categorie iniziali e conserva integralmente i 12 prodotti isDemo=true. Nessun prodotto della nota è stato importato, come richiesto dall’utente. Il trasporto verifica conservazione dei prodotti e idempotenza; non ripetere il seed né cancellare dati reali per sostituirli con esempi.

## Gestione

La navigazione è pubblica; tutti possono registrarsi/accedere. Solo `alessandroferrara01@libero.it` con indirizzo verificato può scrivere, secondo le regole Firestore. I custom claim precedenti non autorizzano altri utenti.

L’area gestione consente reparti, prodotti, prezzo facoltativo, disponibilità, bozze, esempi, ordinamento e una foto. Un reparto pieno non è eliminabile: prima spostare o eliminare i prodotti. Una bozza, un prodotto esempio o un reparto nascosto e le relative fotografie non sono accessibili pubblicamente. Limiti della versione: 50 reparti, 5000 prodotti, foto ricodificata in WebP fino a 300 KiB. Il limite applicativo non aumenta le quote gratuite del progetto.

## Paginazione · 20 ottobre 2026

Il catalogo pubblico legge pagine da 24 prodotti; il gestore da 50. Le query Firestore sono ordinate e avanzano con cursori `startAfter`, senza scaricare prima tutti i 5000 documenti. Il pubblico interroga separatamente i reparti pubblicati con `published == true` e `isDemo == false`, poi unisce le teste ordinate dei reparti mantenendo un piccolo buffer. Nome e ID seguono lo stesso ordine UTF-8 del server per evitare ripetizioni tra pagine; i prezzi mancanti sono sempre dopo quelli numerici, anche in ordine decrescente.

Pagina precedente e successiva mantengono filtri e URL (`pagina`); collegamenti diretti, ricaricamento e cronologia ripristinano la pagina. Finché il totale non è noto il conteggio indica l’intervallo caricato e la presenza di altre proposte. I contatori dell’area gestore derivano dai metadati atomici del catalogo, senza confondere le prime 50 schede con il totale.

La ricerca per sottostringa conserva nome, descrizione, materiale e colori: scorre progressivamente le pagine del reparto selezionato e segnala la ricerca in corso fino alla verifica dell’intero risultato. I preferiti vengono recuperati per ID, in gruppi da massimo 12, compresi quelli salvati oltre le prime pagine. La Home usa una lettura ridotta a 6 prodotti, al massimo 12, oltre agli eventuali ID specifici richiesti dalla sezione personale. Bozze, esempi e reparti nascosti sono esclusi anche quando il gestore usa queste API pubbliche.

Il nuovo client usa query da massimo 100 documenti. Le regole ammettono ancora pagine limitate fino a 200 per le schede aperte con la precedente versione; query senza limite o oltre 200 restano vietate. Contatori e transazioni CRUD conservano i controlli di coerenza. Gli indici richiesti sono in `firestore.indexes.json`; nessun nuovo servizio o piano a pagamento è introdotto. Anche l’importazione Note legge i prodotti in pagine da 100 nella stessa transazione, conserva tutti i 5000 documenti e rifiuta un inventario superiore al limite.

## Aggiornamenti

Ogni modifica riuscita aggiorna una revisione UUID in transazione. Le pagine visibili la controllano ogni 15 secondi e al ritorno; riletta la revisione, scaricano il catalogo solo se cambiato. BroadcastChannel notifica le schede dello stesso browser senza trasferire dati personali. I filtri, la ricerca e il focus restano attivi. Errori temporanei conservano i prodotti già caricati e segnalano il nuovo tentativo.

Le immagini sono documenti separati: caricamento differito, URL Blob temporanei e invalidazione quando il prodotto cambia. Non esistono endpoint /api nel deploy Spark; le vecchie stringhe /api/images/{id} sono identificatori interni risolti dal client tramite Firestore.

## Stato

La configurazione locale corrente usa Spark; stato della pubblicazione e risultati dei test aggiornati separatamente in [DEPLOYMENT.md](DEPLOYMENT.md) e [QA.md](QA.md). Non dichiarare la sincronizzazione iCloud o il collaudo cloud completati senza evidenza.

## Estensione del 21 ottobre 2026

Fino a tre fotografie per articolo: principale in productImages e due aggiuntive in productGalleryImages, con riferimenti e descrizioni validati in transazione. Codice, marca e flag Novità/In vetrina opzionali; aggiornamenti validi conservano i nuovi campi omessi. Duplicazione con copie autonome delle foto, SKU vuoto e bozza; CSV con anteprima, 50 righe e importazione create-only per codice normalizzato. Filtri e link prodotto applicati oltre le prime pagine. Limiti e uso nella guida STRUTTURA-SITO-GUIDA.md. Le quote Spark restano finite.
