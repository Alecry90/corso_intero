# Guida commentata — Assistente per rimborsi spese (4 partecipanti)

## Materiale utilizzato e correzioni
La traccia richiede **Python e LangGraph**, un `State` condiviso, workflow sequenziale, routing per quattro etichette, gestione di tool failure, test, architettura, PowerPoint, e per le parti avanzate Reviewer Agent-as-Tool, chiarimento, human approval e checkpointer. I tre laboratori mostrano come utilizzare `json.load`, `ChatOllama`, `@tool`, prompt, tool calling e human approval. Per questo progetto è necessario anche `StateGraph`.

Abbiamo rispettato i **quattro JSON forniti dal gruppo**. Non sono stati inventati nuovi dipendenti, note spese, ricevute, policy, autorizzazioni o movimenti annuali. I file nella sottocartella `data/` sono byte per byte identici agli allegati. Rispetto alla prima bozza, abbiamo eliminato dati fittizi e ID sbagliati come `C001` e li abbiamo sostituiti con `CLM001`–`CLM004`.

I JSON contengono le colonne/chiavi `employee_id`, `role`, `project`, `annual_expense_limit`, `claim_id`, `expense_type`, `amount`, `receipt_id`, `max_amount`, `allowed_roles`, `approval_over`. **Non contengono** la data del rimborso, lo stato di autorizzazione della trasferta, il saldo annuale già utilizzato e i file fisici delle ricevute. Il programma non deve dedurne valori dal nulla.

## Divisione tra le 4 persone

| Persona | Responsabilità | Celle di codice | Prova da presentare |
|---|---|---|---|
| **1** | Request Agent e definizione dell'ExpenseState | 3, 4, 5 (+ setup 1–2) | T05: richiesta senza claim → chiarimento |
| **2** | Employee Agent, Travel Check, regole deterministiche | 6, 7, 8 | T02: hotel oltre massimale, T03: ricevuta assente |
| **3** | Claims/Expense Agent e interrogazione delle policy | 9, 10 | CLM001 / CLM002 e T06: claim inesistente |
| **4** | Reviewer-as-Tool, routing, checkpoint, human approval, test | 11–17 | T01 e T11: sospensione/ripresa con attestazioni di test |

Il codice Python **non** deve essere eseguito quattro volte separatamente: viene riunito in un solo notebook in ordine di esecuzione. Nel grafo il Claims Agent viene PRIMA dell'Employee Agent perché ricava `employee_id` dal claim ufficiale. Questo non cambia la divisione del lavoro.

## Spiegazione cella per cella (e funzioni)

### SETUP: Celle 1–2 (tutti, presentate dalla Persona 1)

**Cella 1 — Import e configurazione.** `json` legge i dati; `re` cerca identificativi; `TypedDict` descrive lo State; `@tool` espone funzioni Python come strumenti dell'agente; `StateGraph`, `START` ed `END` definiscono il workflow; `MemorySaver` ricorda gli stati intermedi; `interrupt` e `Command` gestiscono la pausa/ripresa. `USA_OLLAMA=False` non chiama un server LLM; `True` usa `ChatOllama(model='llama3.2')` come nei laboratori. **Non è necessario cambiare modello per i test senza Ollama.**

**Cella 2 — Lettura dei quattro JSON.** Ogni `with ... open(..., encoding='utf-8')` seguito da `json.load` produce una lista/dizionario. Le comprensioni `DIPENDENTI`, `SPESE`, `POLICY` creano indici in memoria: `DIPENDENTI['E001']`, `SPESE['CLM001']`, `POLICY['hotel']`. Gli allegati su disco restano identici. `README.json` descrive l'obiettivo del progetto.

### PARTE 1 — Persona 1

**Cella 3 — `class ExpenseState(TypedDict, total=False)`.** Tutti i nodi condividono un unico schema. `total=False` permette ai nodi di aggiungere le proprie chiavi gradualmente. `input_originale` contiene il testo; `claim_id`, `employee_id_richiesto`, `amount_richiesto` e `category_richiesta` descrivono ciò che la persona *dichiara*; `employee_data`, `expense_data`, `policy_data`, `travel_data` rappresentano le risposte dei tool; `esito`, `motivazione` e `risposta_finale` rappresentano il risultato. Tenere distinti valori dichiarati e valori verificati evita errori.

**Cella 4 — `estrai_senza_llm(testo)` e `estrai_con_ollama(testo)`.** La prima cerca letteralmente stringhe come `CLM001`, `E001` e importi espressi in euro; è una modalità di test deterministica, non un finto modello. La seconda invia `SystemMessage` e `HumanMessage` a `llm.invoke` e carica il JSON restituito con `json.loads`. Controlla poi di nuovo gli ID tramite regex per non usare ID inventati dall'LLM. `None` indica che nel testo l'informazione manca.

**Cella 5 — `interpret_request`, `route_request`, `chiedi_chiarimento`.** `interpret_request` prepara lo State a partire dall'input; se non trova un `claim_id`, aggiunge `missing_info` e `clarification_question`. `route_request` è una funzione semplice di routing: manda al nodo `chiarimento` oppure a `claims_agent`. `chiedi_chiarimento` produce `DATI_INSUFFICIENTI`. Non chiediamo subito categoria/importo perché sono già disponibili nel claim.

### PARTE 2 — Persona 2

**Cella 6 — `@tool get_employee_info(employee_id)` e `@tool check_travel_approval(employee_id, date)`.** Il primo cerca davvero nella lista `employees.json` e restituisce `OK` o `NOT_FOUND`. Il secondo **non finge** che esista un archivio delle trasferte: dato che nei JSON manca, restituisce `NOT_AVAILABLE` e `approved=None`. Questa distinzione è fondamentale: **dato assente ≠ autorizzazione negata**.

**Cella 7 — `employee_agent(state)` e `travel_check(state)`.** Il primo legge l'ID dipendente dal claim recuperato dalla Persona 3 e chiama `get_employee_info.invoke({...})`. Il secondo prova `check_travel_approval.invoke({...})`. Entrambi gestiscono eccezioni con `try/except` e inseriscono l'errore nello State, invece di far terminare bruscamente il programma.

**Cella 8 — `applica_regole(state)` e `deterministic_rules(state)`.** `applica_regole` esamina in puro Python: stato dei tool, coerenza delle dichiarazioni con claim, progetto, valuta, importo positivo, ricevuta, ruolo, massimale, limite annuo e trasferta. La funzione restituisce una *tupla* `(etichetta, motivazione)`. `deterministic_rules` trasforma la tupla in un dizionario aggiornabile nello State. Nessun LLM decide i numeri o i quattro esiti. **Scelta progettuale esplicita:** `max_amount` viene considerato un tetto rigido, quindi `CLM002` (240 EUR hotel, massimo 180 EUR) è `NON_APPROVABILE`. `approval_over` è usato solo se inferiore al massimo; nei dati attuali è uguale al massimo. La trasferta non verificabile richiede l'intervento umano solo se gli altri controlli sono superati. La disponibilità del budget annuo dovrà essere attestata dal responsabile, dato che il dataset riporta solo il limite.

### PARTE 3 — Persona 3

**Cella 9 — `@tool get_expense_details(claim_id)` e `@tool get_reimbursement_policy(category)`.** Sono due funzioni Python identiche come stile ai tool dei laboratori. Cercano nei dizionari costruiti dai JSON. In assenza del record restituiscono `NOT_FOUND` e non costruiscono spese o regole alternative.

**Cella 10 — `claims_agent(state)`.** Chiama prima `get_expense_details.invoke`, quindi, dalla categoria ufficiale del claim, chiama `get_reimbursement_policy.invoke`. In caso di `Exception` scrive `TOOL_FAILURE` e un testo in `errori`. Se il claim non esiste, non può selezionare una policy; risponde `NOT_AVAILABLE`. Questo comportamento è verificabile con T06 e con il test aggiuntivo di guasto dei tool.

### PARTE 4 — Persona 4

**Cella 11 — `@tool reviewer_agent_tool(context_json)` e `reviewer_node(state)`.** La funzione tool riceve l'etichetta delle regole Python e i dati verificati. Quando Ollama è attivo, produce una spiegazione leggibile; altrimenti restituisce una motivazione fissa e ripetibile. `reviewer_node` invoca il tool con `reviewer_agent_tool.invoke`. In nessun caso Reviewer può cambiare l'esito calcolato da `applica_regole`.

**Cella 12 — `route_finale` e `human_approval`.** `route_finale` invia a Human Approval **soltanto** `NECESSARIA_APPROVAZIONE`; gli altri esiti arrivano a `END`. `human_approval` utilizza `interrupt({...})` per fermarsi e chiedere una decisione. Quando arriva `Command(resume={...})`, valida: `approva`, `trasferta_approvata` e `budget_disponibile_verificato`. Il risultato può allora essere `APPROVABILE`, `NON_APPROVABILE` o `DATI_INSUFFICIENTI`. Senza tutte le verifiche positive, l'approvazione non è automatica.

**Cella 13 — `StateGraph` e `MemorySaver`.** `builder.add_node` registra le funzioni, `builder.add_edge` crea il percorso sequenziale e `add_conditional_edges` collega i due snodi decisionali. `app = builder.compile(checkpointer=checkpointer)` compila il grafo. `MemorySaver` salva in RAM i checkpoint per ciascun `thread_id`; **non** sopravvive al riavvio di Jupyter.

**Cella 14 — `esegui_richiesta` e `decisione_responsabile`.** La prima lancia `app.invoke(...)` con uno specifico `thread_id`, e poi recupera lo State con `app.get_state`. La seconda controlla che il thread sia davvero sospeso su `human_approval`, passa la decisione tramite `Command(resume=...)` e legge lo stato finale. In produzione occorrerebbe controllare l'identità del responsabile: nel notebook la decisione è **un input umano di esempio**, non un'autorizzazione realmente verificata.

**Cella 15 — Diagramma Mermaid.** `app.get_graph().draw_mermaid()` stampa il grafo; il file `ARCHITETTURA.md` offre anche uno schema annotato pronto per la relazione.

**Cella 16 — Prove con i quattro claim reali.** Esegue `CLM001`, `CLM002`, `CLM003` e `CLM004`, ciascuno con un thread differente. Attesi: `NECESSARIA_APPROVAZIONE`, `NON_APPROVABILE`, `DATI_INSUFFICIENTI`, `NECESSARIA_APPROVAZIONE`.

**Cella 17 — Suite JSON.** Carica `TEST_SCENARIOS.json` e confronta `esito` con `output_atteso` usando `assert`. Negli scenari T11–T14 una decisione del responsabile è **ipotetica a scopo di test** e inserita come messaggio successivo; non aggiunge record ai file originali.

## Come eseguire il progetto

1. Copiare l'intera cartella sul PC. Aprire il notebook dalla cartella `progetto_rimborso_gruppo4` così `Path('data')` trova i quattro JSON.
2. Installare: `python -m pip install -r requirements.txt`. Avviare Jupyter.
3. Avviare tutte le celle in ordine con `USA_OLLAMA=False` e verificare i test e le etichette.
4. Per mostrare il modello come nei laboratori, eseguire `ollama pull llama3.2`, avviare Ollama e impostare `USA_OLLAMA=True` nella prima cella. Poi rieseguire tutte le celle. In questa modalità bisogna controllare manualmente l'interpretazione delle frasi libere; gli esiti sono comunque calcolati da Python.
5. Per l'Human Approval, lanciare `esegui_richiesta('Rimborso CLM001', 'prova-uman1')`, verificare che lo State sia in pausa e, **solo in una prova ipotetica**, chiamare `decisione_responsabile('prova-uman1', approva=True, trasferta_approvata=True, budget_disponibile_verificato=True, nota='TEST: verifiche simulate dal docente')`.

## Risultati sui file realmente ricevuti

| Claim | Dato importante | Esito prima dell'uomo |
|---|---|---|
| CLM001 | Treno, 110 EUR, ricevuta R001, limite 250 | `NECESSARIA_APPROVAZIONE`: manca autorizzazione trasferta |
| CLM002 | Hotel, 240 EUR, limite 180 | `NON_APPROVABILE` |
| CLM003 | Pasto, 48 EUR, ricevuta assente (null) | `DATI_INSUFFICIENTI` |
| CLM004 | Cena cliente, 95 EUR, ricevuta R004, limite 120 | `NECESSARIA_APPROVAZIONE`: manca autorizzazione trasferta |

**Nota per il docente:** questi esiti sono la conseguenza della *nostra esplicita interpretazione* di `max_amount` come massimale rigido. Se il docente intende `approval_over` come possibilità di autorizzare eccezioni oltre il massimale, è necessaria una regola aziendale aggiuntiva, assente dal JSON.

## Verifiche effettuate qui e limiti
La sintassi Python e la validità strutturale del notebook sono state controllate. I **15 scenari** e il caso **Tool Failure** sono stati verificati con un harness locale che esegue i nodi e sostituisce le dipendenze agentiche non installate. **Non è un test end-to-end del vero runtime LangGraph/Ollama**: occorre eseguirlo sul PC del gruppo con i pacchetti installati.
