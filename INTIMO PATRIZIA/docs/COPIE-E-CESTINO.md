# Copia del catalogo e cestino

Primo intervento del percorso di miglioramento gratuito, 23 ottobre 2026. Disponibile soltanto al gestore verificato nell'Area gestore, sezione **Copie di sicurezza e cestino**.

## Scaricare una copia

1. Apri **Copia di sicurezza del catalogo**.
2. Premi **Scarica copia del catalogo** e attendi il controllo di schede e foto.
3. Conserva il file JSON scaricato sul tuo dispositivo, preferibilmente anche su un secondo supporto personale. Controlla che il download sia terminato.

La copia comprende reparti, prodotti, codici, prezzi, descrizioni e fotografie caricate dal gestore, incluse le foto aggiuntive e gli articoli nel cestino. I file statici del sito conservano il loro percorso: vanno conservati anche i file del progetto per recuperarli su un sito differente. La copia non contiene utenti, password, preferenze dei clienti, consensi o dati Authentication. Non è un backup completo del progetto Firebase.

L'esportazione si interrompe se il catalogo cambia durante la lettura, una foto manca o non supera il controllo d'integrità. Non scarica una copia dichiarata completa in quei casi. Ogni file è limitato a 128 MiB; un catalogo oltre tale dimensione richiederà un'esportazione suddivisa da aggiungere prima di quel volume. Nessun servizio di backup a pagamento è stato attivato.

## Recuperare una copia

Dal secondo intervento del 23 ottobre i nuovi file sono versione 2 e includono anche la disponibilità per taglia e colore. Le copie versione 1 continuano a essere accettate; per quelle schede viene mantenuta la disponibilità generale.

1. Seleziona il JSON in **Recupera da una copia**.
2. Premi **Controlla la copia**. Il sito controlla formato, collegamenti, foto, limiti e possibili conflitti, e mostra quanti elementi mancano.
3. Solo dopo aver verificato il riepilogo scegli **Conferma: recupera come bozze**.

Vengono aggiunti soltanto reparti e prodotti mancanti, con gli identificativi originali. Gli elementi già presenti, anche nel cestino, non vengono sovrascritti. Tutti gli elementi recuperati sono bozze: controllali e pubblicali quando sono pronti. Le immagini di ogni prodotto e la sua scheda vengono recuperate insieme.

Se un'altra scheda modifica il catalogo, l'operazione si ferma e richiede un nuovo controllo. Puoi fermare il recupero dopo l'elemento in corso: quelli già salvati rimangono presenti. Il riepilogo indica anche eventuali recuperi parziali; ricontrollare lo stesso file salta gli elementi già presenti.

## Cestino dei prodotti

Il pulsante **Sposta nel cestino** nasconde l'articolo ai clienti, conservandone scheda, identificativo e fotografie. Apri **Cestino dei prodotti → Mostra o aggiorna il cestino → Ripristina → Ripristina come bozza** per recuperarlo.

Un articolo nel cestino deve essere ripristinato prima di modificarlo, duplicarlo o pubblicarlo. Le regole del database impediscono la cancellazione fisica dei prodotti da tutti i client, incluse le vecchie schede del gestore, e impediscono di ripubblicare direttamente un articolo archiviato. Il vecchio comando di eliminazione nella versione corrente archivia; un vecchio programma che tenta la cancellazione fisica viene respinto dal database.

Il cestino conserva spazio occupato e conta nel limite delle 5000 schede. Questa versione non propone lo svuotamento definitivo. I reparti con articoli nel cestino rimangono non eliminabili; i reparti vuoti possono essere eliminati e recuperati da una copia precedente, sempre come bozze.

## Piano gratuito

Restano Hosting, Authentication e Firestore sul piano Spark, con fatturazione disabilitata. Nessuna Function, Storage, backup gestito o servizio esterno aggiunto. Esportazioni, controlli e recuperi usano le normali quote gratuite di lettura/scrittura: eseguili quando serve, soprattutto prima di importazioni o modifiche importanti. Spazio e traffico rimangono limitati.

Verifiche tecniche ed evidenze in [QA.md](QA.md). Il recupero di articoli e fotografie è stato collaudato nell'emulatore locale; il catalogo reale non è stato usato per prove di cancellazione o recupero.
