# Verifiche e valutazione

## Lettore codici a barre: prototipo locale, non pubblicato · 23 ottobre 2026

Preparati helper GTIN e controllore della fotocamera con ZXing, senza collegamento ai dati prodotto né modifiche al gestore pubblicato. `output/qa/barcode-tests.xml`: 25 test passati, zero fallimenti/saltati. Controllati formati, checksum, zeri iniziali, equivalenze UPC/EAN, distinzione multipack, caricamento tardivo del decoder, nessuna richiesta camera alla costruzione, permesso negato/risposta tardiva, stop/distruzione e cambio visibilità/dialog, tracce rilasciate prima del risultato e isolamento di una nuova sessione da risposte precedenti. Fotocamera e decoder nei test di ciclo di vita sono simulati: nessuna prova fisica di scansione iPhone eseguita.

Sulle librerie realmente installate verificati costruttore BrowserMultiFormatReader, metodo decode, setter possibleFormats e costanti dei quattro formati supportati. Browser CUA sul prototipo reale: codice con checksum errato rifiutato, UPC `036000291452` conservato con zero iniziale, nessuna attivazione camera durante l’inserimento manuale, layout390px senza overflow. Screenshot `output/qa/barcode-reader-prototype.png`. Build produzione passata; i nuovi moduli non sono importati dalle pagine pubblicate. Licenze ZXing conservate; npm audit non segnala advisory ZXing e continua a segnalare dipendenze preesistenti Firebase/gRPC, senza aggiornamenti forzati o fuori scope.

Nessun deploy, campo database, API esterna, GTIN reale del negozio, foto, prodotto, credenziale o policy camera online modificati. Servono campioni di codici/marche e fonte ufficiale per progettare e verificare l’autoriempimento: non dichiararlo operativo. Limite corrente tre foto per scheda e policy camera disabilitata in produzione esplicitati in [CODICI-A-BARRE.md](CODICI-A-BARRE.md). Le fasi già pubblicate restano quelle indicate in `DEPLOYMENT.md`.

## Aggiornamenti CSV di prodotti esistenti · 23 ottobre 2026

Suite completa `output/qa/bulk-all-tests.xml`: 203 test passati, zero fallimenti o saltati. Comprende 16 test del modello CSV, cinque del servizio di conferma con dipendenze isolate e dodici casi dell’adattatore con vere transazioni/regole nell’emulatore. Verificati CSV UTF-8/BOM, celle quotate e multilinea, protezione reversibile dalle formule, identificativi/versioni, prezzi e testi normalizzati come il salvataggio, codici duplicati, assenza colonna/cella vuota, cestino, esempi immutabili, 5000 righe/50 cambiamenti, foto/galleria e varianti conservate, file e anteprime obsoleti, concorrenza nel retry transazionale, piani UI alterati e riutilizzati, stop e conteggi parziali, account non autorizzati. Nessun nuovo prodotto o cancellazione nel flusso di aggiornamento.

La prova con spostamento di reparto, tre fotografie e 100 coppie ha individuato il superamento delle 1000 espressioni nelle regole. I tre helper revisionAdvanced/inventoryDelta/parentCountChange ora conservano i documenti già letti in variabili locali, evitando ripetizioni di exists/get; condizioni, validazioni delle mappe e permessi invariati. La suite completa include le regressioni precedenti di copie/cestino/varianti/galleria/regole.

Browser CUA su pagina locale esplicitamente dimostrativa con vero componente e vero modello CSV; persistenza soltanto in memoria locale. Provati due aggiornamenti confermati, pulsante bloccato prima della conferma, errore bloccante, 5000 righe invariate senza renderizzare 5000 righe né attivare il salvataggio, errore simulato dopo un prodotto e stop dopo il prodotto in corso: entrambi indicano un solo articolo aggiornato e conservato. Download realmente eseguito e file controllato dal disco: BOM UTF-8, due righe, sedici colonne. Nessuna email inviata né prodotto/profilo/account online modificato.

Screenshot `output/qa/bulk-products-desktop.png` e `bulk-products-mobile.png`; controlli a 1440/768/390 px senza overflow orizzontale. Conferma etichettata, focus visibile e messaggi status/alert osservati. Non eseguito un nuovo audit Axe dell’intero sito. Override viewport ripristinato. Il modulo è stato collaudato con callback locali e l’adattatore reale nell’emulatore: non sono state eseguite scritture CSV sul progetto di produzione, che non contiene ancora articoli reali. Guida [AGGIORNAMENTI-CSV.md](AGGIORNAMENTI-CSV.md).

Guard ambiente produzione, build e controllo Spark passati. Avviso Vite già presente sui chunk SDK oltre 500 kB. Verifica indipendente dell’integrazione completata senza problemi materiali rilevati. Dati legali ancora mancanti e altre fasi restano separati da questo intervento.

Rilascio finale: regole completate prima di Hosting, release `1792777302266000` FINALIZED alle 19:41 italiane. `output/qa/bulk-cloud-verification.json` conferma billing disabilitato, account billing chiuso, nessuna Function e proprietario verificato non disabilitato. `bulk-hosted-verification.json`: Home, catalogo e gestore HTTP200; contenitore e nuovo pannello/conferma nel bundle online; inventario, profili e esempio privato HTTP403; reparto pubblico HTTP200. Browser online: Area gestore richiede accesso e non espone i comandi di modifica all’anonimo. La sessione del gestore delle fasi precedenti non era più aperta; non è stato richiesto o simulato un nuovo login per le prove. Screenshot finale del componente con dati locali `output/qa/bulk-products-preview-final.png`; schede di verifica e gestore mantenute aperte.

## Disponibilità per taglia e colore · 23 ottobre 2026

Suite finale `output/qa/variants-tests-final.xml`: 170 test passati, zero fallimenti o saltati. Comprende helper, adattatore e vere regole nell’emulatore, conservazione della mappa in modifica/duplicazione/cestino/ripristino/copia, omissione e svuotamento esplicito, limiti e permessi. Il conteggio strumentato resta di cinque letture nella transazione di modifica e due nella lettura pubblica di riferimento; nessun documento per variante. Provato anche un aggiornamento diretto del gestore accettato dalle regole per formato ma con etichetta estranea: i lettori pubblici lo trattano come non disponibile senza interrompere il catalogo. La corrispondenza esatta delle etichette è controllata dall’adattatore, non interamente dalle regole.

Prima esecuzione completa interferita da una seconda suite con lo stesso namespace; namespace isolato per processo e suite completa rieseguita dopo la correzione, con esito finale sopra. Non è stato usato il progetto reale per scritture di prova. Copia reale versione 1 del primo punto letta dal disco: 25 reparti, 12 esempi, normalizzazione versione 2 con mappe vuote riuscita. Unità dedicate verificano anche copie con mappe non vuote e recupero come bozza.

Browser CUA: veri componenti su pagine locali esplicitamente dimostrative, scelta di varianti, riepilogo immediato, verifica payload, filtri del vero catalogo con JSON locale. M/rosso non proposto restituisce zero risultati; L/blu esaurito mantiene l’articolo. Il dettaglio distingue disponibile/esaurita/non proposta; il collegamento email contiene la selezione ed è rimosso quando la coppia non è proposta. Nessun messaggio inviato. Screenshot editor a 1440 e 390 px e contatto a 1440/390, misura aggiuntiva contatto a 768: nessun overflow orizzontale. Select etichettati, focus visibile e stato annunciabile osservati; non eseguito un nuovo audit Axe completo. Lint sull’intero CSS esistente segnala dieci divisori e tre bordi: il nuovo divisore appartiene alla lista tabellare delle combinazioni; il resto è preesistente. Mantenuta la direzione grafica del progetto, senza dichiarare superata una nuova valutazione dell’intero sito.

Build e guard produzione/Spark passati; avviso Vite sui chunk SDK oltre 500 kB già esistenti. Regole distribuite prima di Hosting, release `1792768652829000` FINALIZED alle 17:17 italiane. Readback: billing disabilitato, account billing chiuso, nessuna Function, gestore esistente e verificato. HTTP200 per Home/catalogo/gestore, nuovo contenitore editor nell’HTML online, HTTP403 per inventario e profili privati anonimi.

Modulo online effettivamente provato dal gestore autenticato: taglie/colori generano le quattro coppie; tre stati e riepilogo corretti. Esempio compilato soltanto nel browser, mai salvato. Screenshot `output/qa/variant-editor-online.png`. L’annullamento ha aperto una conferma che impedisce ulteriori comandi automatici della scheda: non è stato possibile verificarne la chiusura, il titolare può confermare lo scarto delle modifiche. Il catalogo reale continua a non contenere prodotti reali; la verifica di scrittura e ricaricamento con mappe non vuote è nell’emulatore, non in produzione. Anteprime locali tenute aperte e server di verifica mantenuto per consultarle. Guida [DISPONIBILITA-TAGLIE-COLORI.md](DISPONIBILITA-TAGLIE-COLORI.md).

## Copie del catalogo e cestino · 23 ottobre 2026

Suite completa su emulatore: report JUnit `output/qa/catalog-safety-tests.xml`, 133 casi, zero errori/fallimenti/saltati. Dopo la revisione finale di cancellazioni e concorrenza ripetuti i 40 casi pertinenti di modello/trasporto/cestino/galleria/regole, tutti passati: `output/qa/catalog-safety-final-tests.xml`. Verificati file versionati, limiti, esclusione account, SHA256 foto, riferimenti originali, rifiuto dei duplicati/conflitti, snapshot coerenti, piano obsoleto, permessi e ripristino di reparti/prodotti mancanti con foto atomiche e stato bozza. Le simulazioni di perdita fisica usano solo l'amministratore dell'emulatore in namespace demo; ogni client reale è bloccato dalle regole di cancellazione prodotti.

Browser locale: nuovo componente reale con callback di prova isolate, scelta file, anteprima, conferma recupero, cestino/bozza e avvio download. Browser online con gestore già autenticato: sezione montata, pulsanti archivio presenti, copia effettivamente scaricata e validata dal disco (25 reparti, 12 esempi, zero prodotti reali e foto caricate), anteprima di recupero con 37 elementi esistenti saltati e conferma disabilitata, cestino vuoto. Nessun prodotto creato, cancellato, archiviato o ripristinato online; nessun profilo o credenziale modificato e nessuna email inviata. La prova di ripristino con scritture è rimasta locale.

Screenshot reali `output/qa/catalog-safety-online.png` e `output/qa/catalog-trash-online.png`; esito del file in `output/qa/catalog-backup-online-verification.json`. Guida [COPIE-E-CESTINO.md](COPIE-E-CESTINO.md). Guard ambiente/Spark, build e distribuzione regole/Hosting passati; release `1792766807575000` FINALIZED. Billing disabilitato, account billing chiuso, nessuna Function. Quote gratuite finite e limite copia 128 MiB esplicitati; copie e cestino non sono un backup completo Firebase. Gli altri interventi autorizzati restano in coda in [MIGLIORAMENTI-GRATUITI.md](MIGLIORAMENTI-GRATUITI.md).

Controllo finale anonimo online: gestore/catalogo e reparto pubblico HTTP200, prodotto di esempio privato e inventario HTTP403. Emulatore locale arrestato al termine; schede dell'utente lasciate aperte.

## Requisiti password e account duplicati · 23 ottobre 2026

Suite Node:79 test,72 passati,7 saltati perché richiedono emulatori,0 fallimenti. I5nuovi test verificano minimo8/A–Z senza obbligo di simboli/numeri, massimo4096, conservazione degli spazi, login inoltrato al servizio, messaggio duplicato e recupero dopo errore di policy. Aggiornata la sola fixture di registrazione nello scenario browser esistente; quella suite Playwright non è stata eseguita in questo rilascio.

Policy Authentication applicata e riletta dal servizio: ENFORCE, minimo8, maiuscola richiesta, forceUpgradeOnSignintrue, massimo4096; altri requisiti spenti. Unicità email e improved email privacy mantenute. SDK validatePassword con la policy reale:7caratteri→false,8minuscoli→false,8conmaiuscola→true,8maiuscoli→true. Nessuna password di un utente reale usata o esportata; la verifica recupera solo la policy e valuta i campioni localmente.

Nel browser online provati rifiuto per assenza della maiuscola e lunghezza7, focus e messaggi del modulo. Console Firebase aperta e verificata su Impostazioni→Policy relative alle password, valori corrispondenti al readback API. Screenshot `output/qa/password-validation-online.png` e `output/qa/firebase-password-policy.png`. Nessun account creato, nessuna email inviata e nessun recupero reale completato per il collaudo. Dati/profili, sessioni attive, diritti gestore, Google login e impostazioni email non modificati.

Guard ambiente/Spark e build passati; pubblicazione Hosting FINALIZED `1792746122396000`. Billing disabilitato e nessuna Function. Guida operativa: [PASSWORD-E-ACCOUNT.md](PASSWORD-E-ACCOUNT.md).

## Collegamenti email di prova · 23 ottobre 2026

Diagnosi verificata sulla documentazione ufficiale Brevo: sul piano Free i reindirizzamenti delle email di prova scadono dopo circa 30 minuti. Il sito genera già destinazioni HTTPS permanenti; nessuna modifica alle impostazioni di tracciamento del fornitore.

I nuovi modelli mostrano l'URL originale come testo copiabile sotto il pulsante. Suite email: 11/11 passati; regressione su tutti i tipi e sulle due modalità, URL relativi/assoluti con query e frammenti, escape, assenza di un secondo link e caso senza pulsante. Suite Node complessiva: 67 passati, 7 saltati perché richiedono emulatori, zero fallimenti. Build produzione e guard ambiente/Spark passati.

Modello effettivo controllato nel browser; screenshot `output/qa/email-link-corretto.png`. Clic sul pulsante: aperto il catalogo online con il reparto Biancheria per la casa selezionato, senza reindirizzamento Brevo. Il reparto risulta correttamente privo di prodotti pubblicati. Guida operativa: [EMAIL-LINK.md](EMAIL-LINK.md). Nessuna email inviata e nessun prodotto, profilo o iscritto modificato durante la verifica. I vecchi messaggi e i modelli già scaricati rimangono invariati.

Dopo il deploy Hosting: gestore, bundle e catalogo HTTP200; testo di aiuto e URL copiabile presenti nella versione online. `admin.html` conserva `no-store`. Release `1792742590221000` FINALIZED, billing disabilitato, nessuna Function e titolare verificato/abilitato.

## Consigli dalla navigazione · 20 ottobre 2026, rilascio finale

- Unit collector e minimizzazione:7/7. Sanitizzazione, limiti, mancato consenso, account cambiato durante await, esclusione di prodotti privati/esempio e categorie mancanti/nascoste.
- Browser, batch `navigation-personalization`, `customer-personalization`, `home-account`, `catalog-pagination`:7/7. Nessun salvataggio al login; attivazione, segnali limitati alla sessione, Home, revoca remota al ritorno, modifica locale, cancellazione e logout. Profilo e newsletter separati. Nuova sezione con Axe senza violazioni e senza overflow1440/390.
- Dopo l’ultimo collegamento della ricerca dalla Home al catalogo, ripetuti soltanto i due test navigation-personalization:2/2. Verificato anche l’incremento successivo attraverso la ricerca digitata nel catalogo.
- Regole/SDK profilo e nuova scelta:17/17; paginazione e regole compatibilità:13/13. Altri risultati del pager, trasportoREST5000 e regressioni sono documentati nella sezione catalogo paginato sotto.
- Build produzione riuscita; ambiente produzione validato. Rimane il warning noto di dimensione del chunk Firebase, non un errore di build. Tutti gli indici cloud READY prima del deploy.
- Verifica online senza mutazioni: nuova sezione nell’account reale con checkbox disattivata, catalogo senza errori e zero prodotti pubblici, sei reparti e21 sezioni; Home anonima accessibile. HTTP200, CSP e diniego403 di dati privati. Nessuna email inviata o scelta reale attivata dall’agente.
- Screenshot reali `output/qa/account-consigli-online-pc.jpg` e `account-consigli-online-cellulare.jpg`; screenshot isolati del modulo `personalization-choice-1440.png` e `personalization-choice-390.png` ispezionati. Schede dell’utente mantenute aperte; override viewport ripristinato.

## Risultati delle fasi precedenti
## Home personale · 20 ottobre 2026

Build produzione riuscita. Test browser `home-account` e `customer-account`: 3/3 passati; nuovo `home-account` ripetuto dopo la modifica del testo neutro iniziale nell’header: passato. Provati invito anonimo, assenza di collegamenti Accedi accessibili dopo autenticazione, nome sicuro, ordinamento per preferiti/interessi/categorie affini, esclusione di esempi, prodotti privati e non disponibili, catalogo vuoto, logout e profilo invariato. Axe sulla nuova sezione: zero violazioni. Screenshot QA con dati isolati a 1440/768/390 px controllati visivamente. Nessuna cronologia di ricerche/clic introdotta. Lint del nuovo modulo: 0 FAIL/0 WARN. Pubblicazione Hosting verificata nella Home anonima online.

## Comunicazioni Brevo in prova · 20 ottobre 2026

Tre modelli email con validazione, escape HTML/template, attributo nome NOME effettivo dell’account Brevo italiano e placeholder di disiscrizione. Dieci unit test passati. Due scenari browser mirati con Firestore locale passati: owner-only, tre tipi, download/oggetto, anteprima sandbox e injection, CTA non valide, CRUD del catalogo, visibilità responsive390/1440, uscita da tastiera e cancellazione della bozza; visitatore/anonimo non possono usare il compositore. Nessun invio nella suite.

Configurazione UI Brevo: modulo e lista dedicata creati, nome opzionale, consenso richiesto/non preselezionato, doppia conferma con modello Brevo. Test reale solo all’email personale autorizzata: richiesta accettata dal modulo, conferma eseguita dall’utente, lista dedicata con un contatto. Telefono verificato dall’utente. Nessuna campagna promozionale inviata. Link pubblico conservato in newsletter.json ma enabledfalse/testModetrue: nessuna iscrizione proposta ai clienti fino al cambio del mittente e completamento delle impostazioni per uso reale. Nessuna chiave API o dato dei profili Firebase trasferito.

## Login e preferenze private · 20 ottobre 2026

Seconda fase pubblicata. Accedi visibile nell’header a 320/390/768/1000/1440 px, invito Home facoltativo. Account: nome opzionale, sei reparti scelti, link ai preferiti, salvataggio e cancellazione del solo profilo. Catalogo: cuori, filtro URL, ripristino e refresh del profilo al ritorno senza polling. Nessuna cronologia di ricerche/clic o iscrizione marketing; informative tecniche aggiornate.

Passati 10 test delle nuove regole/API con Firestore locale reale (isolamento UID, anonimato/list, schema/limiti, concorrenza, assenza di scrittura al solo accesso e cancellazione), gli 11 test delle regole catalogo e cinque scenari browser mirati: profilo/preferiti end-to-end anche con email non verificata, ritorno sicuro, testo del nome senza HTML, refresh sul focus, accessibilità account senza violazioni selezionate, visibilità responsive, visitatore senza scritture catalogo, titolare e filtri/sync esistenti. Build riuscita. Foto/test account soltanto locali: nessuna email reale o prodotto cloud creato.

Controllo sul sito reale passato: 6 reparti/21 sezioni, zero prodotti pubblici, login pronto e visibile su mobile, profili e inventario privati negati agli anonimi, nessun errore JavaScript/CSP o overflow. Release `1792484752213000` FINALIZED; fatturazione disabilitata e nessuna Function. Screenshot `output/qa/login-*` e `online-*`. Invii promozionali riservati alla terza fase.

## Home allineata · 20 ottobre 2026

Home pubblicata con gli stessi 6 reparti del catalogo, descrizioni pertinenti e collegamenti alle 21 sezioni. Rimossi i quattro titoli precedenti. Nomi e ID derivano dalla tassonomia condivisa; sottosezioni dal manifest acquisito. Verificati link e selezione di tutti i reparti, larghezze 390/768/1440 senza overflow, ordine mobile con controlli prima delle sezioni, build e controllo browser sul dominio reale senza errori JavaScript. Screenshot `output/qa/home-aligned-*` e `online-home-aligned-mobile.png`. Nessun cambiamento a login, dati personali o invii email in questa prima fase; stati dei 20 requisiti nella checklist restano applicabili. Solo Hosting distribuito, dopo verifica della fatturazione disabilitata.

## Reparti dalle Note · 20 ottobre 2026

- Passati 10 test della tassonomia, 14 del piano di importazione e il test REST con emulatore: anteprima senza scritture, prodotti e fotografie invariati, seconda applicazione senza modifiche.
- Verificati i nuovi filtri a 6 reparti e 21 sezioni, URL e alias precedenti, ricerca, ordinamento, aggiornamento e conservazione del focus; superate le verifiche di accessibilità e i flussi esistenti. Build completata.
- Importazione live verificata: 25 categorie totali (21 pubbliche, 4 iniziali nascoste), 12 esempi conservati, zero prodotti importati.
- Dopo il deploy, `scripts/check-hosted.mjs` passato sul sito reale: 6 reparti, tutte le 21 sezioni attese, zero prodotti pubblici, login pronto, inventario privato negato, nessun errore JavaScript/CSP o overflow mobile. Stato cloud: release FINALIZED e fatturazione disabilitata.
- I titoli delle Note sono stati acquisiti; nessuna sincronizzazione automatica con Apple Notes. Il prodotto presente nella nota è stato ignorato su richiesta dell’utente.

## Catalogo paginato · 20 ottobre 2026

- Tre test del pager: prima pagina da 24 con meno di 40 documenti letti su un assortimento simulato di 5000, attraversamento completo senza duplicati o omissioni, prezzi nulli in fondo in entrambe le direzioni, ID per nomi uguali e interruzione senza mutare il cursore precedente. Passati 3/3.
- Tre scenari browser con SDK e regole reali nell’emulatore: 263 prodotti pubblici più bozza/esempio/reparto privato; nove pagine oltre il precedente limite 200, ricerca del prodotto 251, prezzi globali ascendenti/discendenti, filtri, URL con pagina, reload e popstate. Gestore: pagine da 50, totale atomico 266, ricerca oltre la prima pagina e confini delle pagine corretti anche con nomi accentati. Preview da 6 con buffer limitato e letture per ID che nascondono bozze/esempi/reparti privati anche al gestore. Passati 3/3.
- Regressione catalogo, tassonomia, account e sito: `site.spec.js`, `catalog-taxonomy.spec.js`, `customer-account.spec.js`, 17/17 passati. Inclusi filtri/ricerca/focus dopo polling, foto sostituita, CRUD e vincoli di autorizzazione.
- Regole: 13/13 test locali passati, inclusi contatori 201 e 5000, rifiuto 5001, pagine nuove da 100 e compatibili da 200, rifiuto delle query da 201 o senza limite. Categorie ancora limitate a 50.
- Piano importazione aggiornato al limite 5000: 14/14 test passati. Trasporto REST: 2/2 passati nell’emulatore, con lettura cursore di 5000 documenti reali, anteprima senza scritture, conservazione integrale del prodotto finale e degli altri documenti, applicazione atomica/idempotente e rifiuto del prodotto 5001 senza modifiche.

Queste verifiche sono locali e usano solo namespace `demo-*`. Non dimostrano quote o prestazioni sotto carico reali né lo stato di costruzione degli indici cloud. Il backend storico `functions/` conserva i limiti della precedente architettura ed è escluso dalla pubblicazione Spark.

## Migrazione Spark · 19 ottobre 2026

L’architettura corrente sostituisce Cloud Functions con Web SDK Firestore e regole distribuite. Le sezioni successive descrivono verifiche storiche dell’architettura precedente, non il backend corrente.

- **10/10 test modello/configurazione** passati, con blocco degli emulatori, modalità demo e configurazioni discordanti nel deploy.
- **10 casi delle regole più il contenitore (11/11)** passati sul vero emulatore Firestore 1.22.0. Verificati accesso esclusivo all’email verificata del gestore, rifiuto di visitatori/vecchi claim, query pubbliche, bozze/foto protette, schema, limiti, slug, contatori atomici, spostamenti e dati legacy. Audit in `tests/firestore-rules-audit.md`.
- Smoke dell’adapter reale su emulatore: database vuoto, creazione di due categorie e prodotto, spostamento, modifica/rename slug, collisioni, cancellazioni e conteggi finali 0/0 superati.
- **13 prove browser verificate PASS**: 10 nella prima esecuzione e le 3 restanti nei rilanci mirati dopo correzioni alle fixture di navigazione e clock. Nessun difetto applicativo mascherato: i test dati usano adapter, SDK e Security Rules reali dell’emulatore, con Auth simulato e nessuna email/account reale modificato.
- Verificata sostituzione della sola foto, mantenendo nome, alt e percorso: cambia il Blob del catalogo già aperto, hash diverso e nuovi pixel corretti.
- Verificati polling senza BroadcastChannel, notifiche tra schede, recupero da errore di versione, nessun download se invariata, conservazione di filtri/focus/selezione.
- Tutte le dieci pagine a 320, 375, 768 e 1440 px; sette pagine analizzate da axe con le regole WCAG selezionate: passate. Non è una certificazione completa.
- Build delle dieci pagine completata. Rimane un avviso dimensionale del chunk SDK Firestore; nessun errore di compilazione.
- Account reale del sito `alessandroferrara01@libero.it` letto in sola lettura: esistente, email verificata, abilitato. Nessuna password creata o modificata.
- Controllo fatturazione: disabilitata, account collegato chiuso. Lo script di deploy rifiuta la fatturazione attiva e distribuisce soltanto Auth, Firestore e Hosting.
- Note iCloud non collegate. Dati legali/attività da completare secondo checklist.

Toolkit Java/emulatore esterno al progetto, verificato con SHA256; nessuna modifica Java/PATH di sistema. Riproducibilità in `docs/TESTING.md`.

**Collaudo online dopo il deploy, 19 ottobre alle 23:18:** `scripts/check-hosted.mjs` passato sul dominio reale. Hosting e letture pubbliche disponibili, 4 reparti e 0 prodotti reali pubblicati, nessun esempio, inizializzazione login pronta, inventario privato rifiutato agli anonimi, header/CSP corretti, nessun errore JavaScript/CSP e nessun overflow mobile. Release FINALIZED e fatturazione ancora disabilitata confermate da `firebase:status`. Screenshot in `output/qa/online-*`. Non sono state simulate credenziali umane per dichiarare un login reale del titolare; CRUD/foto restano verificati nell’emulatore.

---


Test locali e verifiche di provisioning Firebase del 15 ottobre, con aggiornamento del 19 ottobre 2026. Per lo stato cloud corrente vedere `DEPLOYMENT.md`.

## Catalogo e accessi: 19 ottobre 2026

- Test modello/configurazione produzione: **10/10 passati**.
- Test API: **14/14 passati**, inclusi accesso a qualsiasi account, gestione riservata all’email verificata del titolare senza custom claim, rifiuto degli altri account, token revocati, aggiornamento della versione e protezione di bozze/esempi.
- Build di produzione delle **dieci pagine**, inclusa `accedi.html`: completata senza errori.
- Pagina Account, catalogo e gestione rispondono HTTP 200 sul server locale.
- Suite browser aggiornata: **13/13 test passati**, uscita del processo con codice 0. Verificati accesso facoltativo, navigazione anonima, login di altri account in sola lettura, gestore senza custom claim, email non verificata bloccata, registrazione, CRUD con foto e aggiornamenti automatici.
- Tutte le dieci pagine controllate a 320, 375, 768 e 1440 px: nessun overflow orizzontale, un solo h1 e navigazione/footer condivisi. Axe sulle sette pagine selezionate, inclusa Account: nessuna violazione nelle regole WCAG A/AA usate; non è una certificazione completa.
- Polling, notifiche tra schede, recupero da errore temporaneo e conservazione di filtri, ricerca, selezione e focus verificati. Una versione invariata non riscarica tutti i prodotti.
- Screenshot della pagina Account desktop/mobile salvati in `output/qa/` e ispezionati. I test usano Firebase Auth e Firestore sostituiti esclusivamente nel test, senza inviare email o modificare account reali.
- L’integrazione con Note iCloud non è collegata: reparti e struttura della cartella dell’utente non sono stati acquisiti.

## Ripresa infrastruttura del 19 ottobre, prima delle modifiche al catalogo

- Test modello/configurazione produzione: **10/10 passati**.
- Test API con archivio e identità isolati: **8/8 passati**.
- Build Vite di produzione delle nove pagine: completata senza errori.
- Server di sviluppo su `http://127.0.0.1:5173/`: Home, catalogo e area gestore rispondono HTTP 200. Questo controllo non dimostra il funzionamento delle API cloud.
- Verifica autenticata in sola lettura: fatturazione disabilitata, account collegato chiuso, nessuna Cloud Function in `europe-west1` e nessuna release Hosting. Nessun nuovo deploy tentato.
- Aggiunto `npm run firebase:status -- --project intimopatrizia-bari` per ripetere il controllo dei tre servizi senza modificarli; sintassi dello script verificata con Node.

Le verifiche browser, visive e di accessibilità della revisione boutique sotto risalgono al 15 ottobre. Le verifiche dei nuovi flussi del 19 ottobre sono registrate separatamente.

## Revisione boutique corrente

Riferimento: immagine boutique AVIF fornita dal titolare. Il tema corrente è `src/boutique.css`, con cartiglio serif, pannello salvia, fotografia verticale, cartiglio sovrapposto e decorazioni sottili. La direzione brutalista e il riferimento AZ Milano sono stati sostituiti dalla scelta successiva dell’utente.

- Build Vite delle nove pagine: completata.
- Suite Playwright/Chrome: **7 test passati** dopo il nuovo tema e la rifinitura mobile.
- Sei pagine pubbliche/gestore controllate con Axe e regole WCAG A/AA selezionate: nessuna violazione automatica. Non equivale a una certificazione o a un audit completo con tecnologie assistive.
- Tutte le nove pagine a 320, 375, 768 e 1440 px: nessun overflow orizzontale; un solo h1; navigazione e footer condivisi.
- Menu mobile: focus confinato nel dialog, chiusura con Escape e ritorno del focus.
- Ricerca Home: invio al catalogo con query, risultati verificati. Catalogo: categorie, ordinamento, URL, stato vuoto e dettaglio prodotto.
- Galleria: apertura e chiusura fotografie originali.
- Area gestore: lettura demo; CRUD effettivo attraverso API in un test isolato, con Firebase Auth e database sostituiti, upload Base64 e visibilità delle bozze.
- Movimento ridotto: contenuti visibili e freccia SVG senza animazione.
- Build di produzione servita su 4173: dodici controlli su sei pagine a 375 e 1440 px; font serif corretti, nessun overflow o errore JavaScript.

Screenshot in `output/qa/`: hero desktop/mobile, Home complete, catalogo desktop e hero della build di produzione. Le catture complete attendono il caricamento delle immagini differite per non mostrare spazi vuoti dovuti alla sola procedura di acquisizione.

## Revisione visiva

Il desktop riprende la composizione richiesta con i colori dell’attività, preservando il logo blu originale. Sui telefoni il cartiglio precede la fotografia; lo spazio è stato ridotto per mostrare tessuti e scarpine già nel primo schermo a 375×812. Titoli in Cormorant Garamond e testi/controlli in DM Sans, ospitati localmente. I testi restano bruni o bordeaux sui fondi chiari: le linee carta su salvia sono decorative.

Foto di insegna e vetrine verificate anche dopo lo scroll mobile: tutte caricate. Prodotti iniziali illustrativi e contenuti esempio restano dichiarati. Nessuno sconto, recensione o dato commerciale è stato ricavato dal template come fatto dell’attività.

## Backend e servizi esterni

La suite corrente comprende 10 test di modello/configurazione produzione, 8 test API e 7 test browser: tutti passati. I controlli di produzione impediscono di pubblicare con emulatori, modalità demo, configurazione Web incompleta o un Project ID diverso dal destinatario.

I test transazionali del repository usano un database isolato. Il progetto reale `intimopatrizia-bari` ora esiste: Web App, Firestore Standard a europe-west1, regole deny-all, quattro categorie e dodici prodotti importati, account Google del gestore con claim admin e identità di servizio API con ruoli limitati. La lettura di dati, regole e ruolo è stata verificata via MCP.

La build con configurazione reale mostra l’accesso Google e apre il popup OAuth senza errori di CSP. La lettura diretta di Firestore con Web SDK non autenticato è stata rifiutata. Il deploy effettivo delle Functions è ancora rifiutato: dopo la conferma di Blaze, Google restituisce fatturazione disabilitata e account collegato chiuso. Non è ancora stato eseguito un test completo delle API sul cloud né pubblicato il sito con backend funzionante.

Dopo l’attivazione della fatturazione restano deploy di Functions/Hosting, test reali di accesso/CRUD/foto/bozze e completamento dei dati legali, come indicato nella checklist di progetto.
# Menu account con nome scelto — 20 ottobre 2026

Build produzione riuscita e test `e2e/customer-account.spec.js` 2/2 superati su emulatore locale. Verificati nome da preferenze (mai email o nome del provider), aggiornamento immediato dopo salvataggio, persistenza tra pagine, ripristino dopo cancellazione e logout, testo HTML trattato come testo, menu mobile e nome di 60 caratteri senza overflow a 320/390/1440 px. Axe sul flusso account: zero violazioni. Screenshot `output/qa/header-nickname-desktop.png` e `header-nickname-mobile.png` con identità di prova. Hosting pubblicato e nuovo elemento `[data-account-label]` verificato sul dominio reale. Nessun account reale modificato per le prove.


## Struttura negozio · 21 ottobre 2026

37 test modello/SDK/regole passati: import CSV, galleria, dati/orari/campagne e regressione delle regole del catalogo. Ripetizione galleria8/8 dopo aggiunta dello spostamento fra reparti con tutte e tre le foto. Browser: 12 scenari inizialmente passati e due ripetuti con esito positivo dopo correzione del test, più un nuovo scenario di caricamento delle tre foto dal modulo: 15 scenari distinti superati. Il test foto usa il flusso amministratore reale su un progetto emulatore isolato; il precedente harness su pagina HTML sintetica non inizializzava correttamente il contesto Firebase. Provati anche anteprima CSV senza scritture, importazione in bozza, codici duplicati saltati, copia autonoma e collegamento al compositore senza invio. Axe sui nuovi blocchi Home e galleria: nessuna violazione; overflow1440/768/390 assente. Campagne riprovate dopo notifica fra schede e ricontrollo al ritorno. Lint dei quattro file pubblici nuovi:0FAIL/0WARN; build produzione e guard ambiente passati. Schede di accesso dell’utente non ricaricate durante il controllo del rilascio.

## Controllo TikTok e regressioni · 21 ottobre 2026

Nel browser reale due vecchie schede Account caricavano ancora accedi-CCwLNaR5.js e non avevano TikTok; dopo ricaricamento mostrano il profilo esatto @nicolaferrara998 e il civico94. La terza scheda con campi compilati, già aggiornata, non è stata ricaricata. Verificate10pagine online con header/footer singoli, h1 singolo e TikTok, senza errori console osservati; nessun overflow. Quattro pagine principali controllate anche a320px con campi visibili etichettati; menu con Escape e ritorno focus, fotografia gallery aperta da pulsante e chiusa da tastiera. I79riferimenti interni statici controllati esistono. L’immagine senza src nel dialog chiuso della Gallery è intenzionale e non indica una risorsa mancante.

Correzioni: link Maps ricostruito quando cambia l’indirizzo; campagne pubbliche lette con cursori da50 fino a trovare6visibili per Home.14test modello/SDK/regole superati,0skip, in emulatore isolato; regressione con50schede scadute prima di una pagina attiva e bozze private escluse. Guard produzione/Spark e build passati. Nessun accesso reale, email, prodotto o consenso modificato durante i controlli.
