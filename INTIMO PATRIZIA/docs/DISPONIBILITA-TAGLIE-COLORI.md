# Disponibilità per taglia e colore

Secondo punto pubblicato il 23 ottobre 2026, ore 17:17 italiane. Il database resta **Cloud Firestore**; gli account e le password restano in **Firebase Authentication**.

## Come usarla

1. Apri l’Area gestore e scegli **Aggiungi prodotto** oppure **Modifica prodotto**.
2. Compila **Taglie**, per esempio `M, L`, e **Colori**, per esempio `Blu, Rosso`.
3. Attiva **Gestisci disponibilità per taglia e colore**.
4. Per ogni coppia scegli **Disponibile**, **Esaurita** oppure **Non proposta**.
5. Salva la scheda. Se l’articolo e il reparto sono pubblicati, il cliente vedrà le informazioni aggiornate nel catalogo.

Esempio: M blu disponibile, L blu esaurita, L rosso disponibile, M rosso non proposta. La ricerca M + rosso esclude quel prodotto; L + blu lo mantiene consultabile e nel dettaglio segnala la combinazione esaurita. È possibile chiedere informazioni su una combinazione esaurita; i pulsanti per preparare messaggi vengono nascosti per una coppia non proposta. Nessun messaggio viene inviato automaticamente.

Se gestisci soltanto le taglie, lascia vuoti i colori; vale anche il contrario. Massimo 20 taglie, 20 colori e 100 combinazioni nel modulo. Usa nomi distinti anche ignorando maiuscole e accenti; ogni nome può avere al massimo 50 caratteri e non può contenere `|`, `~` o caratteri di controllo.

## Prodotti già presenti e aggiornamenti

Le schede precedenti mantengono la sola opzione **Disponibile in negozio** finché non attivi la gestione dettagliata. Attivandola, le nuove combinazioni partono da **Non proposta**: scegli quelle effettivamente offerte. La disattivazione rimuove la gestione dettagliata al salvataggio e torna all’opzione generale.

Disattivare **Disponibile in negozio** rende indisponibili tutte le coppie, conservando le singole scelte. Se cambi taglie o colori, le coppie non più corrispondenti vengono rimosse al salvataggio e il modulo lo segnala. Le scelte temporaneamente rimosse rimangono recuperabili durante la compilazione reinserendo le etichette originali, prima di salvare. Le schede vecchie ancora aperte non possono eliminare implicitamente una mappa già salvata: in caso di errore, ricarica il modulo aggiornato.

Duplicazione, cestino, ripristino e copie del catalogo conservano le disponibilità dettagliate. Il file di copia ora è versione 2; il sito continua ad accettare le copie versione 1, che non contengono le nuove combinazioni. Il recupero mantiene il comportamento precedente: aggiunge soltanto elementi mancanti come bozze, senza sovrascrivere gli esistenti.

## Come funziona il database

Ogni scheda mantiene taglie e colori e può aggiungere una mappa `variantAvailability`, ad esempio `{ "M|Blu": true, "L|Blu": false }`. È un campo dello stesso documento prodotto: nessuna nuova raccolta o documento per variante. Una mappa vuota conserva il comportamento generale precedente.

Le regole Firestore mantengono l’accesso alle modifiche riservato al gestore verificato e limitano tipo, dimensione e formato della mappa. L’adattatore controlla anche che ogni etichetta appartenga alla scheda. Il catalogo tratta come non disponibile una mappa incoerente scritta aggirando l’adattatore, senza interrompere la pagina. I filtri e la selezione nel dettaglio lavorano sui dati già caricati, senza nuove letture per ogni scelta.

Non sono quantità di magazzino: dopo una vendita fisica devi aggiornare tu lo stato. Non è stata introdotta una sincronizzazione con cassa o Note iCloud. La Home esclude gli articoli con tutte le coppie esaurite fra i risultati già letti; può mostrare meno di quattro proposte, senza ulteriori letture automatiche per riempirle.

Restano attivi solo Hosting, Authentication e Firestore nel piano Spark, con fatturazione disabilitata. Nessun servizio a pagamento aggiunto. Letture, scritture, spazio e traffico continuano a consumare le normali quote gratuite.

Il catalogo online non contiene ancora prodotti reali: le prove con combinazioni sono state eseguite localmente e sul modulo online senza salvare articoli. Evidenze e limiti del collaudo in [QA.md](QA.md).
