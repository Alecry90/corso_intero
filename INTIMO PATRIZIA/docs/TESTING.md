# Test locali

I test non richiedono fatturazione, Cloud Functions, Storage o scritture sul progetto Firebase reale. Firestore usa esclusivamente `127.0.0.1:8080` e identificativi che iniziano con `demo-`. L'accesso Auth nei test browser risponde da fixture locali; non vengono inviate email.

## Strumenti esterni al progetto

La cartella predefinita è `%USERPROFILE%/.cache/intimo-test-tools` (personalizzabile con `INTIMO_TEST_TOOLS`). Contiene:

- JDK21 portatile Temurin in `java21/<versione>/bin/java.exe`, oppure percorso completo in `INTIMO_TEST_JAVA`.
- `cloud-firestore-emulator-v1.22.0.jar`, proveniente da `https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar`.

Lo SHA256 atteso del JAR, verificato nel manifest della CLI Firebase 15.34.0, è `9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c`. Anche l'archivio JDK deve essere verificato con lo SHA256 fornito dai metadati ufficiali Adoptium. I binari restano fuori dal repository. Lo script di avvio non installa e non scarica strumenti, né modifica Java o PATH di sistema.

## Avvio e test

Da un terminale interattivo nella cartella del progetto:

```powershell
node scripts/start-firestore-emulator.mjs
```

Il processo Java usa `-Duser.language=en -Duser.country=US` per evitare un errore del bundle messaggi in locale italiana e una directory temporanea breve del toolkit tramite `-Djdk.net.unixdomain.tmpdir`. L'emulatore è collegato soltanto all'indirizzo locale. Per arrestarlo usa Ctrl-C nello stesso terminale.

In un secondo terminale:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
node --test tests/firestore-rules.test.js
```

La suite carica le regole reali, crea identità anonime/visitatore/gestore verificato/gestore non verificato e verifica pubblicazione, fotografie private, schema, limiti, unicità degli identificativi, conteggi e operazioni atomiche. Non viene usato un sostituto delle Security Rules.

Per i test browser avvia il server isolato in un altro terminale:

```powershell
node scripts/start-e2e.mjs
```

Poi esegui:

```powershell
$env:INTIMO_REUSE_TEST_SERVER='true'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
node node_modules/@playwright/test/cli.js test --global-timeout=150000
```

Il server e2e disabilita la configurazione reale `.env.local` e collega solo Firestore all'emulatore. Le prove di accesso, CRUD, immagini e aggiornamento automatico usano l'adapter e il Web SDK reali con regole reali. Le prove puramente visive mantengono una fixture dimostrativa. Ogni prova dati usa un namespace locale separato. Al termine interrompi il server e2e con Ctrl-C nel suo terminale; Playwright lo riusa senza avviare ulteriori processi da terminare su Windows.

Su questa macchina Node portatile è disponibile in `C:/Users/A1618apulia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`. Si può usare il percorso completo senza installazione di sistema.
