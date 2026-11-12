# Il database, spiegato semplicemente

Il sito usa già **Firebase Firestore**: non occorre creare un altro database. Pensa a un archivio di schede: una raccolta raggruppa le schede, un documento è una scheda e un campo è un’informazione sulla scheda.

| Archivio | Contenuto | Chi lo usa |
| --- | --- | --- |
| Reparti e sezioni | Organizzazione del catalogo | Tutti vedono quelli pubblicati; tu li gestisci |
| Prodotti | Nome, prezzo, taglie, disponibilità, reparto | Tutti vedono quelli reali e pubblicati; tu li modifichi |
| Foto | Immagine collegata al prodotto | Pubblica solo per prodotti e reparti pubblicati |
| Profilo cliente | Nome scelto, reparti interessanti e preferiti | Solo il rispettivo cliente |
| Scelta dei consigli | Attivo/spento, data e versione della spiegazione | Solo il rispettivo cliente |

**Firebase Authentication** verifica chi entra. Le regole del database decidono cosa può fare. Il tuo account verificato `alessandroferrara01@libero.it` può gestire il catalogo; gli altri account non ottengono questo permesso registrandosi. Il sito rimane leggibile senza accesso.

Le password sono gestite da Authentication e non vengono salvate nei profili Firestore. Dal 23 ottobre sono richiesti almeno 8 caratteri e una maiuscola; le email duplicate sono vietate. Chi ha una vecchia password non conforme la aggiorna tramite recupero al prossimo accesso, mantenendo lo stesso account. Istruzioni e impostazioni: [PASSWORD-E-ACCOUNT.md](PASSWORD-E-ACCOUNT.md).

## Aggiungere un prodotto

1. Accedi e apri **Area gestore**.
2. Scegli la sezione corretta e compila nome, eventuale prezzo, descrizione, taglie e colori utili.
3. Aggiungi la foto dal computer o dal telefono: il sito la ridimensiona e comprime.
4. Salva una bozza per prepararla oppure pubblicala quando è pronta. Non segnarla come esempio.
5. La scheda entra nel database: il catalogo visibile verifica gli aggiornamenti periodicamente e al ritorno sulla pagina. Non devi ripubblicare i file del sito.

Le cartelle delle Note iCloud hanno definito le sezioni, ma **non si sincronizzano automaticamente**: aggiungere foto nelle Note non pubblica prodotti. Usa il pannello del sito. Per un futuro caricamento di moltissimi articoli si potrà preparare un foglio con una riga per prodotto e foto abbinate ai codici.

## Capire i consigli

Dopo l’accesso la Home saluta il cliente con il nome scelto e usa preferiti e reparti espliciti. Il semplice login non salva ricerche o clic.

Il cliente può attivare **Consigli dalla navigazione** nell’Account. Solo allora la scheda del browser conserva, per la sessione, fino a 20 prodotti consultati e piccoli punteggi dei reparti. Consultare più pigiami dà più peso a Pigiami e relax. Le frasi cercate e la cronologia non vanno nel database.

Uscita, cambio account o disattivazione eliminano i segnali. La scelta attiva/spenta resta salvata finché non viene cambiata o cancellata. Quindi profilo e preferiti possono ritrovarsi in un accesso futuro; la navigazione non costituisce uno storico tra dispositivi. I consigli avranno contenuto quando pubblicherai prodotti reali.

## Email e capacità

Brevo gestisce comunicazioni e disiscrizione. Registrarsi al sito non iscrive alle promozioni; i consigli non inviano email. Campagna e invio rimangono separati. La configurazione attuale è di prova con il tuo mittente personale: servirà il mittente definitivo del negozio, verificato.

Ora sono previsti fino a **5000 prodotti** e **50 sezioni**, caricati a pagine di 24 nel catalogo e 50 nel pannello. La ricerca su molti prodotti può richiedere più tempo e letture. Spark resta senza fatturazione attiva ma con quote gratuite finite: non significa spazio o traffico illimitati. Misureremo l’utilizzo sul catalogo reale prima di aumentare ancora la scala.
