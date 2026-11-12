# IntimoPatrizia · pubblicazione Spark

**Aggiornamenti CSV pubblicati il 23 ottobre 2026, ore 19:41 italiane.** Release `sites/intimopatrizia-bari/releases/1792777302266000`, FINALIZED, timestamp cloud `2026-10-23T17:41:42.266Z`. Regole Firestore rilasciate prima di Hosting; helper di lettura ottimizzati per rispettare il limite di espressioni senza rimuovere controlli. Nessuna modifica Authentication, indici, prodotti, profili o consensi. Nuovo pannello gestore per esportazione, confronto e aggiornamenti confermati di articoli esistenti, con limiti e transazioni protette da revisioni. 203 test passati; prove UI locali e verifica online di HTML/bundle, accesso riservato e HTTP descritti in [QA.md](QA.md). Readback: billing disabilitato, account billing chiuso, nessuna Function, proprietario del sito esistente e verificato. Guida [AGGIORNAMENTI-CSV.md](AGGIORNAMENTI-CSV.md).

**Disponibilità per taglia e colore pubblicata il 23 ottobre 2026, ore 17:17 italiane.** Release `sites/intimopatrizia-bari/releases/1792768652829000`, FINALIZED. Regole Firestore distribuite prima di Hosting; nessuna modifica ad Authentication o agli indici. Campo facoltativo sul documento prodotto, tre stati nel gestore, filtri/dettaglio e consigli coerenti. Copie catalogo versione 2, import delle precedenti versione 1 mantenuto. Guard, build, 170 test e verifiche HTTP/browser passati nei limiti descritti in [QA.md](QA.md). Billing disabilitato, account collegato chiuso, nessuna Function. Nessun prodotto o dato cliente modificato per le prove. Guida [DISPONIBILITA-TAGLIE-COLORI.md](DISPONIBILITA-TAGLIE-COLORI.md).

**Copie del catalogo e cestino pubblicati il 23 ottobre 2026, ore 16:46 italiane.** Release `sites/intimopatrizia-bari/releases/1792766807575000`, FINALIZED, 57 file Hosting. Regole Firestore distribuite prima del frontend: archivio recuperabile privato, ripristino in bozza, cancellazione fisica prodotti vietata a tutti i client, comprese vecchie schede. Nuova sezione del gestore per copia JSON del solo catalogo/foto e recupero aggiuntivo dei mancanti, senza sovrascritture, con controllo di revisione in ogni transazione.

Collaudo completo locale e prove reali in sola lettura in [QA.md](QA.md); guida [COPIE-E-CESTINO.md](COPIE-E-CESTINO.md). Scaricata e controllata una copia reale; nessuna scrittura su prodotti/profili online. Authentication e gli altri servizi invariati; billing disabilitato e nessuna Function. Limite copia 128 MiB e quote finite dichiarati. Restano gli interventi successivi nel percorso gratuito autorizzato.

**Requisiti password pubblicati il 23 ottobre 2026, ore 11:02 italiane.** Release Hosting `sites/intimopatrizia-bari/releases/1792746122396000`, `FINALIZED`,57file. Successivamente applicata solo la policy Authentication: minimo8, maiuscola A–Z, ENFORCE e aggiornamento richiesto al prossimo login password per gli utenti precedenti. Email duplicate vietate e protezione email mantenuta. Nessuna modifica a credenziali, utenti o dati del catalogo; nessuna email inviata per i test e nessuna revoca delle sessioni attive. Console Firebase e pagina Account aperte al titolare.

Verifiche unit, SDK sulla policy reale, browser e readback cloud in [QA.md](QA.md); istruzioni in [PASSWORD-E-ACCOUNT.md](PASSWORD-E-ACCOUNT.md). Configurazione e script inclusi nella procedura completa di deploy per conservarla nei rilasci futuri. Piano Spark e billing disabilitato confermati.

**Miglioramento dei collegamenti email pubblicato il 23 ottobre 2026, ore 10:03 italiane.** Release `sites/intimopatrizia-bari/releases/1792742590221000`, `FINALIZED`, 57 file Hosting. I nuovi modelli includono l'URL completo copiabile sotto ogni pulsante; l'Area gestore spiega la scadenza dei link Brevo Free negli invii di prova e indica l'invio normale della campagna. Nessuna modifica ai vecchi messaggi o al tracciamento Brevo. Guida: [EMAIL-LINK.md](EMAIL-LINK.md).

Pubblicato soltanto Hosting dopo guard produzione/Spark e build. Verificati online HTTP200 per gestore, bundle e catalogo; avviso e testo copiabile presenti nel bundle distribuito, gestore con cache `no-store`. Billing disabilitato, account billing chiuso, nessuna Function. Nessuna email inviata e nessuna modifica a prodotti, profili o iscritti. Verifiche dettagliate in [QA.md](QA.md).

**Controllo TikTok e correzioni pubblicati il 21 ottobre 2026, ore 11:32 italiane.** Release `sites/intimopatrizia-bari/releases/1792575124271000`, `FINALIZED`, 57 file Hosting. Due anteprime Account caricavano ancora un vecchio bundle: ricaricate e verificate con collegamento TikTok esatto e civico94; la scheda già aggiornata con campi compilati è rimasta intatta. TikTok è presente in tutte le10pagine verificate nel browser, nei Contatti e nei footer.

Corretto Maps dopo una modifica dell’indirizzo dal gestore; risolta la lettura delle campagne oltre la prima pagina di50, interrompendo la ricerca Home dopo6contenuti visibili.14test mirati modello/SDK/regole passati in emulatore isolato. Controllo reale di10pagine,4anche a320px, menu mobile e galleria da tastiera;79riferimenti interni esistenti. Dopo il deploy,11URL(incluso `/`) e16asset referenziati nell’HTML rispondono200; query pubblica campagne200, inventario e profili privati403 agli anonimi. Guard ambiente/Spark e build passati. Billing disabilitato, nessuna Function; nessuna modifica ai prodotti o profili reali e nessun invio email. Screenshot con TikTok visibile: `output/qa/tiktok-contatti-online.jpg`. Prodotti reali e dati legali mancanti restano da completare.

## Rilascio della struttura

**Struttura negozio pubblicata il 21 ottobre 2026, ore 10:27 italiane.** Release finale `sites/intimopatrizia-bari/releases/1792571250499000`, stato `FINALIZED`, 57 file Hosting. Distribuiti regole Firestore e indici prima del frontend; tutti gli otto indici cloud risultavano READY. Nessuna modifica ai prodotti o ai profili reali durante le prove.

Nuove funzioni: fino a tre foto per prodotto, codice/marca, Home Novità e In vetrina, filtri per taglia/colore/tessuto/prezzo, link prodotto e richieste precompilate, duplicazione in bozza, importazione CSV con anteprima, promozioni/eventi/collezioni, dati e orari pubblici. Conservati e pubblicati anche civico 94, orari, Instagram e TikTok forniti nell’altra chat. Le email rimangono preparate dal gestore e inviate manualmente da Brevo. Guida: [STRUTTURA-SITO-GUIDA.md](STRUTTURA-SITO-GUIDA.md).

Verifiche: 37 test modello/SDK/regole e 15 scenari browser distinti superati su emulatori isolati, senza pubblicare prodotti di prova. Nel browser del sito reale verificati sei reparti, catalogo con zero prodotti pubblici, nuovi filtri, contatti/orari/social e assenza di errori JavaScript nelle pagine controllate. Anteprime reali PC1440 e cellulare390 salvate in `output/qa/struttura-online-*.jpg`; nessun overflow nei due formati. Le dimensioni dell’anteprima in-app sono condivise fra schede: il file cellulare conserva la visualizzazione a390 anche quando il browser torna al formato PC.

Corretto il mantenimento di vecchie versioni: HTML, percorso `/` e dati pubblici richiedono la rivalidazione della cache; l’Area gestore conserva `no-store`, gli asset con nome hash restano in cache. Le anteprime già aperte con una vecchia pagina sono state aggiornate con un solo parametro di versione; le schede Account dell’utente non sono state ricaricate.

Controlli finali in sola lettura: HTTP200 e nuovi header confermati; inventario, profili e scelte private negati agli anonimi; fatturazione disabilitata, account billing chiuso, nessuna Function, account del titolare verificato e abilitato. Le quote Spark restano finite; prodotti reali, fotografie e dati legali mancanti devono ancora essere aggiunti.

## Pubblicazione del 20 ottobre 2026

**Consigli facoltativi e catalogo paginato pubblicati il 20 ottobre 2026, ore 21:10 italiane.** Release `sites/intimopatrizia-bari/releases/1792523411213000`, stato `FINALIZED`, 57 file Hosting. Regole Firestore per la scelta privata e limite inventario5000 distribuite prima del frontend; tutti e sei gli indici risultavano READY prima della pubblicazione. Richieste dei nuovi client limitate a100 documenti; regole a200 per compatibilità con schede della versione precedente, senza ampliamento dei diritti di lettura.

Home personale con interessi/preferiti e segnali opzionali della sessione, scelta inizialmente spenta, revoca e cancellazione dall’Account. Nessuna cronologia nel database e nessuna iscrizione o invio marketing al login. Catalogo24 e gestore50 articoli per pagina. Guida per il titolare: [DATABASE-GUIDA.md](DATABASE-GUIDA.md); dettagli: [PERSONALIZATION.md](PERSONALIZATION.md).

Verifiche cloud dopo il rilascio: billingEnabledfalse, account di fatturazione chiuso, nessuna Function; account del titolare esistente, verificato e abilitato. Home anonima, account reale del titolare con nuova scelta disattivata e catalogo pubblico con sei reparti/zero prodotti verificati nel browser. HTTP200 e CSP presenti; profili, scelte e inventario negati agli anonimi (403). I test non hanno aggiunto prodotti o consensi al database reale né inviato email. I prodotti reali restano da caricare; informative legali ancora bozze con dati del titolare da completare.

## Cronologia delle pubblicazioni precedenti
**Home personale pubblicata il 20 ottobre 2026.** Deploy solo Hosting completato (57 file), fatturazione disabilitata verificata. L’invito all’accesso è mostrato solo ai visitatori anonimi; gli autenticati vedono consigli derivati da interessi e preferiti espliciti. Nessuna raccolta automatica di ricerche/clic, nessuna modifica alle regole o ai dati cloud. Branch anonimo verificato sul sito pubblicato; flusso autenticato e catalogo vuoto verificati su emulatore con identità isolate. Architettura attuale e proposta successiva: [PERSONALIZATION.md](PERSONALIZATION.md).

**Nome scelto nel menu account pubblicato il 20 ottobre 2026.** Deploy solo Hosting completato (56 file), piano Spark verificato con fatturazione disabilitata. Dopo l’accesso il collegamento in alto e il menu mobile mostrano il nome salvato in “Come vuoi essere chiamato”, con aggiornamento al salvataggio e ripristino dopo cancellazione/logout. Nessuna modifica alle regole, ai dati cloud o alle comunicazioni email. Presenza del nuovo menu verificata anche sul dominio online.

**Comunicazioni in prova pubblicate il 20 ottobre 2026, ore 15:12 italiane.** Release `sites/intimopatrizia-bari/releases/1792501936460000`, FINALIZED, 59 file Hosting. Nessuna modifica delle regole, dei profili o dei prodotti cloud. Tre modelli nell’area gestore; collegamento al modulo Brevo disponibile al gestore per prove. Iscrizioni clienti nascoste (`enabled: false`, `testMode: true`) su indicazione del titolare di usare per ora soltanto la propria email personale per i test. Conferma via email provata e confermata dal titolare. Smoke online passato, billing ancora disabilitato. Anteprime reali desktop1440 e mobile390 salvate in `output/qa/anteprima-sito-*.jpg`.

**Login e preferenze pubblicati il 20 ottobre 2026, ore 10:25 italiane.** Release `sites/intimopatrizia-bari/releases/1792484752213000`, `FINALIZED`. Distribuiti regole Firestore e 57 file Hosting. Profili clienti leggibili/modificabili soltanto dal rispettivo UID, senza query di elenco o accesso degli altri utenti. Nome facoltativo, interessi espliciti e preferiti; nessun invio marketing o raccolta automatica di navigazione. Smoke online superato, fatturazione ancora disabilitata. Le pubblicazioni precedenti sono riportate sotto come cronologia.

**Catalogo aggiornato il 20 ottobre 2026, ore 09:55 italiane.** Release `sites/intimopatrizia-bari/releases/1792482959137000`, `FINALIZED`: pubblicati 6 reparti e 21 sezioni ricavate dalle Note. Importazione verificata: 21 categorie create, 4 iniziali nascoste, 12 prodotti esempio conservati integralmente, nessun prodotto o immagine scritto. Controllo online passato: 21 sezioni, zero prodotti pubblici, login pronto, inventario privato protetto, nessun errore JavaScript/CSP o overflow mobile. Fatturazione ancora disabilitata; nessuna Function distribuita.

Aggiornamento del 19 ottobre 2026. Il requisito corrente è **zero spese**. Il precedente tentativo con Cloud Functions è stato sostituito dall’architettura Spark: Hosting statico, Authentication e Firestore, senza Functions o Storage.

## Stato verificato

Controllo autenticato in sola lettura del 19 ottobre, prima del nuovo deploy:

- Fatturazione disabilitata; account collegato chiuso.
- Nessuna Cloud Function distribuita e nessuna release Hosting prima di questo rilascio.
- L’account del sito `alessandroferrara01@libero.it` **esiste, ha email verificata ed è abilitato**. Non serve registrarlo nuovamente.
- Provider Google ed email/password disponibili; domini Hosting e sviluppo configurati.
- Database esistente: `(default)`, Native Standard, `europe-west1`, con le fixture iniziali e l’inventario.

Nessun pagamento, riapertura dell’account di fatturazione o creazione di password eseguiti dall’agente. La console chiedeva 30 euro per attivare l’account e mostrava saldo dovuto zero; questo percorso è stato abbandonato su richiesta dell’utente. La documentazione Firebase indica che la chiusura del billing account porta al piano Spark.

**Pubblicazione completata il 19 ottobre 2026 alle 23:18, ora italiana.** Release Hosting `sites/intimopatrizia-bari/releases/1792444704418000`, stato `FINALIZED`. Auth, domini, regole e indici Firestore e 55 file Hosting distribuiti con successo; nessuna Cloud Function distribuita.

Controllo successivo sul dominio reale: Home e catalogo disponibili, quattro reparti preesistenti e zero prodotti pubblici (i dodici esempi restano esclusi), login facoltativo inizializzato, inventario privato negato agli anonimi, header/CSP corretti, nessun errore JavaScript/CSP e nessun overflow mobile. Screenshot in `output/qa/online-*`. Il controllo cloud ripetuto conferma fatturazione disabilitata, account collegato chiuso e account del titolare verificato/abilitato.

## Risorse

| Risorsa | Configurazione |
| --- | --- |
| Project ID | intimopatrizia-bari |
| Web App | 1:370635038039:web:b43718679fd06e442d7212 |
| Hosting pubblicato | https://intimopatrizia-bari.web.app/ |
| Account | /accedi.html |
| Gestione | /admin.html |
| Permesso di scrittura | Regole Firestore: sola email Libero indicata, verificata |
| Foto | WebP Base64 in documenti Firestore separati, fino a 300 KiB |
| Limiti applicativi | 50 reparti, 5000 prodotti; pagine pubbliche da 24 e gestione da 50 |
| Sorgente Note iCloud | 21 titoli acquisiti, 6 reparti nel sito; nessuna sincronizzazione automatica |

La configurazione Web pubblica resta in `.env.local`; nessun token o credenziale amministrativa viene inserito nella build. La vecchia service account API e i vecchi custom claim non sono usati per l’autorizzazione del sito Spark. Non occorrono nuove assegnazioni di ruolo agli utenti del sito.

## Paginazione e indici · 20 ottobre 2026

L’implementazione locale supporta 5000 prodotti con cursori Firestore, query del client limitate a 100 e letture ridotte per la Home. Non richiede Functions, Storage o fatturazione. Prima di pubblicare il nuovo Hosting, verificare che gli indici compositi per ordine/nome, nome e prezzo/nome siano pronti: l’emulatore verifica query e regole, ma non dimostra il completamento della costruzione degli indici cloud.

Durante il rilascio le regole conservano il precedente massimo di 200 documenti per query, per consentire alle schede ancora aperte con il vecchio Hosting di continuare a funzionare; il client nuovo usa al massimo 100. Il limite globale e dei contatori reparto passa a 5000. Pubblicazione di prodotti, reparti, esempi e fotografie mantiene gli stessi vincoli di accesso.

## Comandi

```text
npm run firebase:status -- --project intimopatrizia-bari
npm run firebase:deploy -- --project intimopatrizia-bari
```

Il deploy controlla in sola lettura che la fatturazione sia disabilitata, poi compila e distribuisce Auth, domini, regole/indici Firestore e Hosting. Non riattiva la fatturazione. Le impostazioni demo/emulatore sono vietate in produzione. Non ricreare progetto, database o seed.

Le quote gratuite possono limitare disponibilità e traffico; Spark non attiva automaticamente addebiti oltre quota. Non collegare nuovi account di fatturazione per risolvere limiti senza istruzione dell’utente.

## Verifica finale

Sito pubblico, letture Firestore anonime, esempi esclusi, disponibilità Auth e header/CSP sono verificati sul dominio online con `node scripts/check-hosted.mjs`. CRUD e foto sono provati con identità simulate su un vero emulatore locale; una prova umana dell’account amministratore sul dominio online richiede l’accesso dell’utente con la propria password. Non sono state generate credenziali o modificati account per simulare quel login.

Dati dell’attività e informative ancora segnati come bozza: `PROJECT-CHECKLIST.md`. Note iCloud non sincronizzate: `CATALOG.md`. Risultati dei test: `QA.md`.
