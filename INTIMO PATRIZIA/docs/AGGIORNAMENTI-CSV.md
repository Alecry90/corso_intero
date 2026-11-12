# Aggiornare molti prodotti con un foglio

Terzo punto del percorso gratuito, pubblicato il 23 ottobre 2026 alle 19:41 italiane. Il foglio serve a modificare articoli già presenti nel database **Cloud Firestore**. L’importazione **Importa prodotti da un foglio** rimane dedicata alla creazione di nuove bozze.

## Procedura

1. Nell’Area gestore apri **Aggiorna molti prodotti** e premi **Esporta prodotti in CSV**. Scarichi le schede attive, comprese bozze ed esempi; gli articoli nel cestino sono esclusi. È una lettura manuale dell’intero catalogo, non un’esportazione continua.
2. Apri il file con Excel, LibreOffice oppure un programma per fogli. Se necessario scegli codifica UTF-8 e separatore punto e virgola. Mantieni come testo le colonne **id** e **versione**: non modificarle.
3. Cambia i dati desiderati. Esempio: prezzo da `19,90` a `17,90`, oppure disponibile da `si` a `no`.
4. Salva/esporta nuovamente come **CSV UTF-8**. Il formato `.xlsx` non è un CSV.
5. Seleziona il file nel sito e premi **Controlla gli aggiornamenti**. Leggi ogni differenza fra il valore attuale e quello nuovo.
6. Se il risultato è corretto, seleziona la conferma e premi **Conferma aggiornamenti**. Le modifiche agli articoli già pubblicati diventano visibili online; le bozze restano tali salvo modifica esplicita della colonna pubblicato.

Prima di una modifica importante scarica anche una copia JSON da **Copie di sicurezza e cestino**. Il CSV contiene soltanto i campi modificabili: non comprende foto, account o dati dei clienti e non sostituisce una copia completa del catalogo. Il ripristino JSON attuale aggiunge elementi mancanti, senza sovrascrivere gli esistenti: per correggere prezzi o testi già modificati occorre un nuovo aggiornamento controllato.

## Colonne

| Colonna | Cosa inserire |
| --- | --- |
| id, versione | Identificativo e versione della scheda: mantienili esattamente come esportati. |
| codice, nome, reparto | Codice articolo, nome e identificativo del reparto esistente. Il prodotto è riconosciuto da id, non dal nome o codice. |
| prezzo | Euro senza simbolo, per esempio `19,90` o `19.90`, massimo due decimali. Vuoto significa prezzo da chiedere in negozio. |
| taglie, colori | Voci separate da `|`, per esempio `S|M|L` e `Blu|Rosso`. Se esiste una disponibilità dettagliata, le voci devono restare compatibili con le combinazioni salvate. |
| tessuto, descrizione, marca | Testo della scheda; una cella vuota cancella il valore facoltativo. |
| disponibile, pubblicato, in_vetrina, novita | `si` oppure `no`. Per mettere temporaneamente un articolo fuori disponibilità usa disponibile, non eliminare la riga. |
| ordine | Intero da 0 a 9999; i valori più bassi precedono quelli più alti nell’ordine del catalogo. |

Puoi rimuovere dal foglio le righe che non vuoi aggiornare: non cancellerai prodotti dal sito. Puoi togliere una colonna modificabile per conservarne i valori esistenti; **una colonna assente conserva il dato, una cella vuota in una colonna presente lo modifica**. id e versione devono sempre restare.

Foto, descrizioni alternative delle foto, indicazione di esempio e combinazioni dettagliate vengono conservate. Il CSV non carica fotografie, non crea nuovi prodotti, non gestisce il cestino e non converte esempi in prodotti reali. Per cambiare le singole combinazioni disponibile/esaurita usa il modulo prodotto del secondo punto. Un cambiamento di taglie o colori che lascerebbe combinazioni incoerenti viene bloccato.

## Limiti e conflitti

Il file può comprendere al massimo 5000 righe prodotto e 32 MiB, ma ogni conferma può modificare al massimo **50 prodotti**. Le righe identiche non vengono riscritte. Per aggiornare più schede, lavora per gruppi ed esporta nuovamente il foglio fra un gruppo e l’altro.

Se una scheda è stata cambiata dopo l’esportazione, il sito rifiuta le modifiche ricavate dalla sua vecchia versione. Se il catalogo cambia fra anteprima e conferma, devi ripetere il controllo. Le verifiche avvengono anche nella transazione di salvataggio: un aggiornamento concorrente non viene sovrascritto silenziosamente.

Le righe vengono salvate una per volta. Se premi **Ferma dopo il prodotto in corso**, cambi account o si verifica un conflitto, quelle già salvate rimangono aggiornate: il riepilogo mostra quante. Non è un’operazione unica che annulla automaticamente tutto. Dopo un esito parziale esporta un nuovo foglio e ricontrolla i valori prima di riprovare.

Codici ripetuti assegnati a più prodotti vengono segnalati. Non scambiare fra due prodotti codici già in uso in una sola importazione: scegli codici distinti. I testi esportati che potrebbero essere interpretati come formule vengono protetti; non è prevista l’esecuzione di formule nel sito.

## Piano gratuito

Non viene aggiunto un servizio esterno. Restano Hosting, Authentication e Firestore nel piano Spark, con fatturazione disabilitata. Esportazione e controllo leggono le schede; soltanto le righe cambiate confermate vengono salvate nelle normali transazioni del catalogo. Le quote gratuite di letture, scritture, spazio e traffico rimangono finite. Nessuna sincronizzazione con Excel, Note iCloud o cassa del negozio.
