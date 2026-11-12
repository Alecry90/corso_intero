# Firestore Rules: modello e verifica locale

19 ottobre 2026. Target previsto: database esistente `(default)`, Standard, `europe-west1`. Nessuna creazione di database, operazione cloud o modifica di fatturazione è stata eseguita per questi test.

Le regole sono un prototipo collaudato nell'emulatore; non costituiscono una garanzia assoluta o una certificazione di conformità. Devono essere riviste prima di una diffusione ampia e ricontrollate quando cambiano schema o query.

## Identità e dati

Solo il token Firebase con email `alessandroferrara01@libero.it` e `email_verified == true` può scrivere. Spazi ai margini e maiuscole sono normalizzati. Nessun custom claim concede privilegi ad altre email. I visitatori autenticati hanno gli stessi diritti di lettura pubblica dei visitatori anonimi. Non esistono regole che consentono al client di scrivere ruoli, utenti o la propria autorizzazione.

| Percorso | Schema e accesso |
| --- | --- |
| `categories/{id}` | Campi commerciali, `productCount`, `lastProductId`, `updatedAt`. Lettura pubblica solo se `published == true`; tutti i campi di un reparto pubblicato sono pubblici, inclusi contatore e ID tecnico del prodotto. |
| `products/{id}` | Campi commerciali completi; lettura pubblica solo con `published == true`, `isDemo == false` e reparto pubblicato. |
| `productImages/{productId}` | WebP Base64 separato, massimo 300 KiB binari/409600 caratteri Base64, dimensioni 16–4096, hash esadecimale. Solo GET, niente list; foto pubblica solo se prodotto reale e reparto sono pubblicati. |
| `categorySlugs/{slug}` | Prenotazione privata `{categoryId}`. Creazione/cambio slug vincolati al reparto corrispondente nella stessa operazione atomica. |
| `catalogMeta/inventory` | Contatori privati, marker `lastCategoryId`/`lastProductId`, timestamp. Limiti 50 reparti e 5000 prodotti. |
| `catalogMeta/revision` | Solo `{version: UUIDv4}` pubblico. Nessun conteggio, email o altro campo ammesso. |
| `catalogAccess/manager` | GET consentito solo al gestore verificato anche se il documento non esiste; nessuna scrittura consentita. |
| Altri percorsi e sottocollezioni | Negati. |

Le mappe accettano soltanto i campi previsti; ogni scrittura di creazione e aggiornamento attraversa lo stesso validatore. Tipi, campi obbligatori, lunghezze, importi con massimo due decimali, booleani, ordine e dimensioni sono convalidati. Taglie/colori hanno massimo 20 stringhe da 1 a 50 caratteri, senza `|`: il round trip `join`/`split` verifica i tipi e il pattern verifica ogni lunghezza senza superare il budget di valutazione delle regole.

Ogni CRUD scrive una nuova revisione nella stessa transazione. Contatori reparto e inventario possono variare solo di una unità, collegata tramite marker a un prodotto/reparto creato, spostato o eliminato nella stessa transazione. Eliminare un prodotto richiede rimozione della relativa foto; eliminare un reparto richiede contatore zero e rimozione della prenotazione dello slug.

## Query effettive dell'adattatore

- Pubblico: `categories where published == true limit(50)`.
- Pubblico, per ciascun reparto pubblico: `products where categoryId == id and published == true and isDemo == false`, ordinamento per ordine/nome o prezzo/nome e cursori `startAfter`; massimo 100 documenti per query. La pagina pubblica mostra 24 proposte, la Home al massimo 12 (6 normalmente), con piccolo buffer per il confronto tra reparti.
- Gestore: categorie con `limit(50)`, prodotti ordinati con cursore e `limit(50)`, ricerca dello slug con `where slug == value limit(2)`. Contatori e CRUD restano atomici, limite inventario 5000. Il client nuovo usa al massimo 100; le regole ammettono ancora query limitate fino a 200 per compatibilità con le schede aperte sulla precedente versione del sito. Query senza limite o oltre 200 negate.
- Ricerca testuale: scansione progressiva del solo assortimento pubblico selezionato, con indicatore di ricerca in corso fino al termine. Preferiti: letture singole degli ID salvati (gruppi di massimo 12), con verifica esplicita di prodotto/reparto pubblicati ed esclusione esempi anche quando il gestore consulta il sito pubblico.
- Foto, revisione, inventario, prenotazioni e probe: letture di documento singolo. Nessuna query generale a foto o metadati.

Le regole non agiscono come filtri: le query pubbliche prive dei vincoli di pubblicazione vengono respinte. Non si acquisisce il catalogo completo per nascondere le bozze nel browser.

## Verifica riproducibile

`tests/firestore-rules.test.js` usa il Web SDK già presente. Richiede `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, rifiuta host non locali e usa esclusivamente il namespace `demo-intimopatrizia-rules`. Senza variabile esplicita la suite è segnalata come saltata; non esiste ripiego verso un progetto cloud. Le regole sono caricate e compilate mediante l'endpoint dell'emulatore prima dei test. Il token speciale dell'emulatore `owner` viene usato esclusivamente per le fixture; identità gestore e visitatori sono verificate separatamente dalle regole.

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
node --test tests/firestore-rules.test.js
```

Runtime locale: Firestore Emulator 1.22.0 e Java Temurin 21. Per questa postazione Windows sono necessari locale `en_US` e directory temporanea corta per i socket. Il locale italiano dell'emulatore generava un'eccezione nelle traduzioni degli errori. Toolkit ed emulatori sono conservati fuori dal progetto, senza includerli nel sito.

## Attacchi esercitati

| Verifica | Risultato nell'emulatore |
| --- | --- |
| Pubblico anonimo: query e GET delle sole proposte reali pubblicate | Consentiti; tutte le query pubbliche reali dell'adattatore passano. |
| GET di bozze, esempi, prodotti in reparto nascosto e relative foto | Negati. |
| Query generica a prodotti/categorie, query foto, query metadati/slug | Negate, salvo query commerciali limitate del gestore. |
| Email diversa con claim `admin:true`, gestore con email non verificata, visitatore | Nessun accesso al probe e nessuna scrittura. |
| Creazione, aggiornamento, cancellazione e autoassegnazione di privilegi da visitatore | Negati. |
| Campi extra, campi obbligatori rimossi, tipi errati, testi oltre limite | Negati, incluse voci lista non stringa e ultima voce annidata. |
| Liste da 21 voci, voci oltre 50 caratteri, separatore incorporato | Negate; 20 taglie e 20 colori validi consentiti. |
| Prezzi negativi, stringa, oltre limite e tre decimali | Negati; due decimali validi consentiti. |
| Percorsi script, esterni, traversal e foto di altro ID | Negati. |
| Duplicazione di slug prenotato | Negata senza cambiare revisione. |
| Falsificazione/decremento/replay dei contatori e cancellazione reparto popolato | Negati. |
| CRUD valido senza avanzare revisione, replay revisione, metadata personali nella revisione | Negati. |
| Caricamento foto, spostamento con foto, aggiornamento, rimozione foto/prodotto/reparto | Consentiti con transazione, contatori coerenti e foto protette quando bozza. |
| Foto: MIME diverso da WebP, Base64 invalido, dimensioni/hash/campi errati, oltre 300 KiB | Negati; il confine esatto di 300 KiB è ammesso. |
| Foto orfana, lettura sottocollezione non autorizzata | Negate. |
| Dati legacy senza marker e con vecchia revisione nell'inventario | Normalizzazione durante CRUD valido consentita; nessuna mutazione nascosta durante letture. |

Esito: 10 casi di integrazione, più il contenitore della suite, passati sul vero emulatore; nessuna scrittura effettuata sul database reale.

## Limiti espliciti

Le regole controllano forma e dimensioni della foto, ma non decodificano il bitmap, non verificano il contenuto WebP, non ricalcolano SHA256 e non rimuovono EXIF. L'adattatore del gestore decodifica e ricodifica tramite canvas prima della scrittura. Nessun visitatore può inviare foto, ma il gestore autorizzato potrebbe aggirare l'adattatore: il campo MIME non è una prova crittografica del contenuto.

Le quattro categorie legacy precedono le prenotazioni di slug. L'adattatore controlla anche gli slug legacy prima di creare/rinominare un reparto e crea la prenotazione durante un CRUD; un gestore che aggira l'adattatore potrebbe creare un duplicato di uno slug legacy ancora non prenotato. Non si eseguono migrazioni nascoste sul database.

I contatori iniziali devono corrispondere ai dati preesistenti. L'adattatore rifiuta un catalogo popolato senza inventario invece di inventare conteggi. Le regole non possono enumerare un'intera raccolta per ricostruire questi conteggi. Le quote Spark possono interrompere le operazioni al raggiungimento dei limiti; questi test non misurano il traffico o le quote del progetto reale.

Riferimenti primari: [condizioni e getAfter](https://firebase.google.com/docs/firestore/security/rules-conditions), [List.join](https://firebase.google.com/docs/reference/rules/rules.List), [String.split](https://firebase.google.com/docs/reference/rules/rules.String), [test con emulatore](https://firebase.google.com/docs/firestore/security/test-rules-emulator).
