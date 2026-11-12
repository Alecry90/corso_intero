# Codici a barre: preparazione e fonte dei prodotti

Richiesta del 23 ottobre 2026: leggere il codice sulle confezioni con iPhone e recuperare automaticamente informazioni e foto. **In preparazione: non pubblicato né collegato al gestore online.** Il lettore e l’arricchimento della scheda sono due parti distinte; un codice non contiene descrizioni o fotografie.

## Parte predisposta

`src/product-barcodes.js` controlla GTIN di 8, 12, 13 o 14 cifre e cifra di controllo. Conserva il testo originale e gli zeri iniziali; usa una rappresentazione di 14 cifre soltanto per confrontare UPC/EAN equivalenti. Non confonde il GTIN di una confezione multipla con il codice dell’unità venduta e non cerca di espandere un UPC-E come se fosse EAN-8.

`src/barcode-scanner.js` è un controllore opzionale della fotocamera, con decoder ZXing caricato dal sito soltanto all’avvio esplicito. Sono previsti inserimento manuale, EAN-8/EAN-13/UPC-A e ITF a 14 cifre, verifica del risultato, stop dopo la lettura e rilascio delle tracce anche dopo richieste di permesso concluse in ritardo. Fotogrammi e codici non vengono inviati a servizi di scansione esterni. Il modulo chiamante deve fermarlo anche al logout. L’interfaccia dimostrativa è `output/qa/barcode-reader-verifica.html`, esplicitamente priva di ricerca prodotti e di salvataggi.

Le dipendenze locali sono fissate a `@zxing/browser` 0.2.1 e `@zxing/library` 0.23.0; licenze conservate in `docs/licenses/ZXing-*`. Nessun abbonamento o servizio cloud aggiunto. La scansione da una fotocamera fisica su iPhone non è stata ancora collaudata.

## Informazioni necessarie per completare l’autoriempimento

Sono stati richiesti al titolare due o tre codici completi, la marca di ciascuno e l’eventuale disponibilità di file Excel/CSV, catalogo o accesso rivenditore dei fornitori. Password e chiavi non vanno inviate in chat.

La fonte preferita è un catalogo ufficiale del fornitore che associ GTIN, articolo, nome, marca, composizione, variante e fotografie utilizzabili dal negozio. Prima di implementare un connettore occorre verificarne copertura, condizioni d’uso, aggiornamento, accesso e costi. Un sito pubblico o una ricerca web non garantiscono un’API gratuita né il diritto di ripubblicare tutte le immagini. Non è stato collegato un database universale né configurata un’API esterna.

Il flusso previsto è: lettura del codice → corrispondenza esatta nella fonte verificata → proposta dei dati e delle fotografie disponibili → controllo del gestore → salvataggio normale, inizialmente in bozza. Un prodotto non trovato deve essere segnalato senza inventare nome, composizione, prezzo o fotografie. Prezzi e disponibilità del negozio rimangono una scelta del gestore. Il codice interno articolo SKU va mantenuto distinto dal GTIN; per prodotti con varianti occorre associare esplicitamente il codice a taglia/colore corretti.

## Integrazione ancora da completare

- Il progetto online imposta attualmente `camera=()` nelle Permissions-Policy. Per attivare il lettore serve consentire la fotocamera soltanto sull’Area gestore, lasciando microfono e posizione disabilitati e richiedendo il normale permesso del browser all’avvio.
- La CSP attuale non consente API o immagini di altri domini. Non sono state aggiunte eccezioni generiche: eventuali origini vanno definite dopo aver verificato la fonte.
- I prodotti non hanno ancora un campo persistente GTIN. Aggiungerlo richiede adattatore, regole, salvataggi precedenti, copie, duplicazione e CSV coerenti; non riutilizzare indiscriminatamente il codice SKU.
- La galleria attuale supporta tre fotografie per prodotto. Una fonte con più immagini richiederà una valutazione della galleria e delle quote gratuite prima di estendere quel limite.
- Il progetto deve restare Spark con fatturazione disabilitata. Nessuna API segreta può essere inserita nel frontend pubblico; non attivare Functions o altri servizi a pagamento per ottenere un proxy.

Fonti primarie consultate: [GS1 sul significato del GTIN](https://asset.gs1.org/standards/get-barcodes), [GS1 sui codici per varianti](https://support.gs1.org/support/solutions/articles/43000734083-how-many-gs1-gtins-do-i-need-when-i-have-a-product-with-many-sizes-and-colours-), [Verified by GS1 e dati disponibili](https://support.gs1.org/support/solutions/articles/43000734115-how-can-i-know-which-company-assigned-a-gs1-gtin-to-a-product-), [ZXing Browser](https://github.com/zxing-js/browser), [MDN BarcodeDetector](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector/detect).
