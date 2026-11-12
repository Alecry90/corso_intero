# Firebase Spark

Architettura corrente richiesta dall’utente: **zero spese**, senza Cloud Functions, Firebase Storage, App Hosting o altri servizi che richiedono Blaze. Il progetto esistente è `intimopatrizia-bari`; Firestore è il database Native Standard `(default)`, in `europe-west1`. Non ricreare progetto/database né importare nuovamente il seed.

## Accesso e dati

Il sito statico su Hosting usa il Web SDK Firestore. La navigazione pubblica non inizializza Firebase Auth; Account e gestione lo inizializzano sulla stessa app Firebase. La sessione usa sessionStorage e termina con “Esci”.

Le regole consentono le modifiche solo al token Firebase con email verificata `alessandroferrara01@libero.it`. Un claim admin su un altro account non basta. Per aggiungere altri gestori occorre un’istruzione dell’utente e una nuova distribuzione delle regole. L’esistenza della casella Libero non crea automaticamente un account Firebase: registrazione/accesso e verifica dell’indirizzo avvengono dal sito.

Il controllo di autorizzazione legge `catalogAccess/manager`: la regola consente il GET al solo gestore anche se il documento non esiste, senza scriverlo. Il browser non decide i permessi e non contiene chiavi amministrative.

| Raccolta/documento | Accesso |
| --- | --- |
| categories | Pubblico solo se published=true; gestione vede anche reparti nascosti. I campi tecnici productCount e lastProductId sono pubblici nei reparti pubblicati. |
| products | Pubblico solo se published=true, isDemo=false e il reparto è pubblico. |
| productImages/{id} | Solo GET della foto di un prodotto pubblico reale in un reparto pubblico, oppure del gestore. Nessuna lista pubblica. |
| categorySlugs | Riservato al gestore; prenotazione univoca degli slug nuovi. |
| catalogMeta/inventory | Riservato; conteggi e marcatori di transazione. |
| catalogMeta/revision | GET pubblico della sola revisione UUID. |
| catalogAccess/manager | GET del gestore; nessuna scrittura. |
| Altri percorsi | Negati. |

Le transazioni aggiornano prodotto, foto, contatori e revisione insieme. Marcatori e getAfter verificano creazioni, spostamenti e cancellazioni; non si elimina un reparto con prodotti. Schemi e campi ammessi sono espliciti. Il codice precedente usava categorie senza prenotazione slug: l’adapter controlla anche quelle prima di creare/modificare; non effettua migrazioni scrivendo durante un semplice caricamento pagina.

## Fotografie e limiti

Il browser ricodifica l’immagine in WebP senza conservare i metadati originali. Massimo 300 KiB binari, circa 400 KiB Base64 in un documento separato sotto il limite Firestore di 1 MiB. L’indicizzazione dei documenti foto è disabilitata. Le regole validano schema, dimensioni dichiarate e lunghezza del contenuto; **non decodificano una bitmap e non verificano il suo hash**. Il flusso standard ricodifica e calcola l’hash nel browser; soltanto il gestore fidato può caricare immagini. Non è più presente una validazione bitmap con sharp sul server.

Limiti applicativi: 50 reparti e 200 prodotti. Le query pubbliche sono limitate, una per reparto pubblicato; le foto sono richieste separatamente solo quando servono. La revisione viene controllata ogni 15 secondi nelle pagine visibili; il catalogo intero si rilegge solo se cambia. Anche letture respinte e controlli delle regole possono consumare quota.

Spark offre quote gratuite, non capacità illimitata: [piani Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [quote Firestore](https://firebase.google.com/docs/firestore/quotas), [quote Hosting](https://firebase.google.com/docs/hosting/usage-quotas-pricing). Non collegare un account di fatturazione per aumentare quote senza una nuova istruzione dell’utente.

## Configurazione e deploy

`firebase.json` serve soltanto `dist/`; nessuna riscrittura verso Functions. La CSP ammette gli endpoint Firestore e Auth necessari. Lo script deploy esegue prima un controllo in sola lettura che richiede fatturazione disabilitata. Un account collegato chiuso non viene riaperto.

```text
npm run firebase:deploy -- --project intimopatrizia-bari
```

L’ordine è: controllo Spark, build, provider Auth, domini autorizzati, regole/indici Firestore, Hosting. Un indice nuovo può richiedere tempo prima di essere disponibile. La configurazione pubblica Web proviene dalle variabili Vite o da /__/firebase/init.json; le variabili per emulatori/demo sono vietate nel deploy.

## Test isolati

I test delle regole usano il vero emulatore Firestore su loopback e progetti demo separati; i test browser usano identità simulate, senza email reali e senza modificare il cloud. Java e JAR dell’emulatore sono nel toolkit esterno al progetto; non occorrono Functions. Non eseguire seed o test distruttivi sul progetto reale.

Le regole sono un prototipo specifico per questa applicazione: verifiche e limiti dell’audit sono registrati in QA e nella suite delle regole; non costituiscono una certificazione di sicurezza generale. Lo stato del rilascio è in [DEPLOYMENT.md](DEPLOYMENT.md).