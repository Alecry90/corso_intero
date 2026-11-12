import json
from pathlib import Path

path = Path(__file__).parent / 'spiegazioni_1_25.json'
cells = json.loads(path.read_text(encoding='utf-8'))
steps = {
1: [
"È una cella markdown, cioè testo: ## visualizza un titolo. Non esegue istruzioni Python.",
"Presenta le tre cose da preparare: librerie, modello linguistico e archivi aziendali. È come mettere sul tavolo tutti i documenti prima di esaminare una pratica."
],
2: [
"import carica librerie; from ... import ... seleziona alcuni nomi. json traduce JSON; operator.add unirà liste; re è importato ma non usato nel notebook. Path gestisce percorsi; TypedDict descrive dizionari; Annotated aggiunge informazioni ai tipi; uuid4 genera identificatori; date gestisce date.",
"ChatOllama collega il modello locale. tool crea strumenti per gli agenti. AnyMessage indica vari tipi di messaggio: SystemMessage contiene istruzioni, HumanMessage una richiesta, ToolMessage un risultato dello strumento.",
"StateGraph costruisce il percorso; START/END segnano inizio/fine. MemorySaver conserverà stati in memoria; interrupt metterà in pausa; Command servirà a riprendere. Sono importazioni: il workflow non parte ancora.",
"ChatOllama(model='qwen2.5:latest', temperature=0) crea llm. temperature=0 riduce la variabilità, senza garantire correttezza. Path('../data') indica data un livello sopra la directory di esecuzione: funziona avviando da deliverables. DATA_DIR / nome costruisce un percorso.",
"Nel try, llm.invoke riceve una lista con HumanMessage('Rispondi soltanto con OK.'). Restituisce un messaggio: .content è il testo; llm.model è il nome del modello. print li mostra; una f-string inserisce valori nelle parentesi { }.",
"except Exception as errore stampa il problema; raise rilancia l'errore e ferma la cella. Il codice mostra la risposta, ma non confronta che sia davvero OK.",
"with open(...) as f apre e chiude automaticamente ciascun file; json.load(f) lo converte in dati Python. I tre DB sono liste in memoria, non server. len conta 3 dipendenti, 4 claim e 4 policy. File mancanti possono interrompere il caricamento."
],
3: [
"ExpenseState è la cartellina della pratica: ogni nodo legge dati e aggiunge risultati.",
"total=False rende opzionali le chiavi dichiarate. Gli aggiornamenti parziali vengono poi uniti da LangGraph: total=False da solo non unisce dizionari."
],
4: [
"class ExpenseState(TypedDict, total=False) descrive le chiavi di un dizionario, senza creare una pratica. Le annotazioni aiutano a leggere il codice: non validano automaticamente i valori durante l'esecuzione.",
"input_originale è la frase dell'utente; intent il suo scopo. employee_id/employee_name sono codice/nome dipendente; claim_id è il codice della spesa. E001 e CLM001 identificano cose diverse.",
"category, amount, currency, expense_date e note_aggiuntive sono categoria, importo, valuta, data e note. str significa testo; float numero decimale; str | None significa testo oppure valore assente.",
"missing_info: list[str] elenca campi mancanti, per esempio ['employee_id']. awaiting_clarification: bool è True/False: serve un chiarimento?",
"employee_data, expense_data e policy_data custodiscono i dizionari ufficiali. travel_approval è previsto nello schema, ma non viene usato da questi controlli.",
"deterministic_result/deterministic_reason sono esito/motivo delle regole Python. reviewer_output è la risposta del revisore; reviewer_coerente vale True, False o None, cioè non disponibile.",
"esito e motivazione costruiscono il risultato finale; risposta_finale è il messaggio per l'utente. human_decision/human_note conservano un'eventuale decisione umana e nota; errori è una lista di problemi.",
"I due punti indicano tipi, non valori assegnati. print conferma la definizione. Una pratica concreta iniziale può contenere soltanto input_originale ed errori=[]; il resto arriva dopo."
],
5: [
"Il Request Agent legge la frase e compila una scheda JSON. Non deve cercare negli archivi né approvare il rimborso.",
"interpreta_richiesta controllerà la risposta, convertirà i dati e segnalerà quelli mancanti."
],
6: [
"RequestAgent è il progetto di un oggetto. __init__(self, model, system='', checkpointer=None) è il costruttore: conserva modello e prompt in self.model/self.system. self indica l'oggetto; checkpointer è l'eventuale memoria.",
"RequestState descrive lo stato interno messages. Annotated[list[AnyMessage], operator.add] dice a LangGraph di aggiungere i nuovi messaggi ai precedenti: [domanda] + [risposta]. È diverso dallo stato completo ExpenseState.",
"StateGraph crea il progetto. add_node('llm', self.call_llm) registra la funzione; add_edge collega START → llm → END. compile prepara self.graph all'esecuzione: non chiama ancora il modello.",
"call_llm(self, state) riceve lo stato e legge state['messages']. Se self.system non è vuoto, antepone un SystemMessage creando una nuova lista.",
"self.model.invoke(messages) restituisce un messaggio AI. return {'messages': [response]} consegna il nuovo messaggio, che LangGraph aggiunge alla storia. Questa funzione non controlla il JSON.",
"La classe viene soltanto definita e print lo conferma. Quando creata senza checkpointer, l'agente non ha una memoria persistente configurata tra invocazioni."
],
7: [
"{policy['expense_type'] for policy in POLICIES_DB} raccoglie le categorie in un insieme, eliminando duplicati. sorted ordina; ', '.join le unisce: client_meal, hotel, meal, travel_train.",
"request_system è una f-string multilinea. {categorie} inserisce le categorie; {{ e }} scrivono parentesi graffe letterali dell'esempio JSON.",
"Il prompt ordina di estrarre dati presenti, non inventare, non interrogare archivi e non decidere. Fornisce le chiavi JSON: intent, employee_id, employee_name, claim_id, category, amount, currency, expense_date, note_aggiuntive.",
"null indica assenza e diventerà None; amount deve essere numerico e la data anno-mese-giorno. ALTRO indica una domanda che non riguarda rimborsi. Sono istruzioni al modello, da verificare dopo.",
"RequestAgent(model=llm, system=request_system) crea request_agent e chiama __init__. print conferma la creazione: nessuna frase viene interpretata qui."
],
8: [
"interpreta_richiesta riceve ExpenseState e restituisce un aggiornamento dict. Nel try passa input_originale al grafo di request_agent dentro un HumanMessage.",
"risultato['messages'][-1].content prende il testo dell'ultimo messaggio. json.loads lo converte da JSON a Python. isinstance(dati, dict) richiede un oggetto; raise ValueError rifiuta, per esempio, una lista JSON [].",
"except Exception restituisce DATI_INSUFFICIENTI, una motivazione e gli errori aggiornati. state.get('errori', []) legge la lista o usa []; + [str(errore)] aggiunge il problema. return termina la funzione.",
"dati.get('amount') legge l'importo. float converte '110' in 110.0; TypeError/ValueError lo rendono None. Qui non si decide se un importo negativo sia ammesso.",
"La data viene convertita con str, verificata da date.fromisoformat e normalizzata da .isoformat(). '2026-02-30' diventa None perché impossibile. Il parser accetta anche altre forme ISO: non impone soltanto testualmente YYYY-MM-DD.",
".get legge intent, employee_id e claim_id; intent usa ALTRO se la chiave manca. Il nome Luca Bianchi non viene trasformato in E001: l'agente non cerca nell'archivio.",
"mancanti=[] viene riempita con append: intent_rimborso se lo scopo è diverso; employee_id, claim_id ed expense_date se assenti. I quattro if sono indipendenti.",
"Categoria/importo/valuta non sono obbligatori qui: il claim li fornirà. La data è richiesta dal workflow, ma non viene confrontata nelle regole successive.",
"Il return finale conserva i campi estratti, missing_info e awaiting_clarification=bool(mancanti): [] dà False, una lista non vuota True. LangGraph unirà questi campi alla pratica; print conferma solo la definizione."
],
9: [
"Le stringhe vicine tra parentesi vengono unite in una frase. Contiene CLM001, treno, 110 EUR, Luca Bianchi e 2026-10-08, ma non E001.",
"stato_prova crea una pratica minima con input_originale ed errori=[]. interpreta_richiesta(stato_prova) chiama davvero il modello.",
"json.dumps converte il risultato in testo; indent=2 aggiunge rientri, ensure_ascii=False conserva accenti; print lo mostra.",
"Nell'output salvato employee_id è null, missing_info=['employee_id'] e awaiting_clarification=true. Non è un rifiuto: manca il codice del dipendente."
],
10: [
"Introduce get_employee_info, un tool che legge l'archivio usando employee_id. OK significa trovato, NOT_FOUND significa assente: non sono esiti di rimborso."
],
11: [
"@tool trasforma la funzione in uno strumento LangChain; annotazioni e docstring descrivono il suo uso al modello. get_employee_info riceve employee_id:str e restituisce una stringa JSON.",
"for visita EMPLOYEES_DB; == confronta i codici esatti. Se trova E001, return termina subito e restituisce status OK con **employee, che copia tutti i campi del record.",
"json.dumps converte in testo e ensure_ascii=False conserva gli accenti. Se nessun record corrisponde, il secondo return produce NOT_FOUND e l'ID cercato, per esempio E999.",
"get_employee_info.invoke({'employee_id':'E001'}) prova direttamente il tool, senza LLM. L'output trova Luca Bianchi, Consultant, Consulting, PRJ-DELTA, limite annuo 3000, manager E900. Recuperare il limite annuo non significa applicarlo: la cella 25 non lo usa."
],
12: [
"EmployeeAgent può chiedere tool e ripetere modello → azione → modello. employee_node collegherà i dati alla pratica leggendo la risposta reale del tool, anziché il riepilogo del modello."
],
13: [
"__init__ riceve model, tools, system e checkpointer. self.system conserva il prompt; {t.name:t for t in tools} crea una rubrica nome → strumento.",
"model.bind_tools(tools) presenta gli strumenti al modello senza eseguirli. 'A if tools else B' sceglie il modello con tool se la lista è non vuota, altrimenti quello normale.",
"EmployeeState conserva messages con Annotated/operator.add: i messaggi nuovi si aggiungono ai precedenti. StateGraph registra llm/call_llm e action/take_action.",
"add_conditional_edges usa exists_action per scegliere True → action oppure False → END. add_edge collega START → llm e action → llm. compile rende self.graph eseguibile.",
"exists_action riceve lo stato: [-1] prende l'ultimo messaggio; getattr(...,'tool_calls',[]) legge le chiamate o usa []. bool restituisce True se ce ne sono. È il semaforo del bivio.",
"call_llm legge messages, antepone SystemMessage se esiste il prompt, invoca il modello e restituisce {'messages':[response]}. Il commento 'verifica se ci sono messaggi' è impreciso: il codice li legge.",
"take_action prepara results=[] e visita le tool_calls. Ogni call contiene name, args e id: per esempio get_employee_info, {'employee_id':'E001'} e un identificatore.",
"Nel try, nome not in self.tools produce ValueError; altrimenti self.tools[nome].invoke(argomenti) esegue il tool. except Exception converte errori in JSON con TOOL_FAILURE e message.",
"results.append(ToolMessage(name=nome, tool_call_id=call['id'], content=str(risposta))) collega ogni risultato alla sua richiesta. Avviene anche in caso di errore, non solo successo come suggerisce un commento.",
"return {'messages':results} aggiunge risposte alla storia; il grafo torna al modello. Il ciclo continua finché richiede tool, poi termina. print conferma soltanto la definizione della classe."
],
14: [
"employee_system ordina di usare esattamente l'ID ricevuto, segnalare NOT_FOUND/TOOL_FAILURE senza inventare e riassumere i dati. Vietato decidere o cercare spese/policy.",
"EmployeeAgent(model=llm, tools=[get_employee_info], system=employee_system) crea employee_agent. La lista assegna un solo strumento. I parametri nominati rendono chiaro ogni valore; print conferma la creazione, senza cercare un ID."
],
15: [
"employee_agent.graph.invoke riceve un HumanMessage che chiede E001. recursion_limit=10 limita i passi del grafo, non il numero di dipendenti.",
"tool_chiamato=False parte come bandierina. for visita i messaggi; isinstance(message,ToolMessage) riconosce risultati di strumenti, imposta True e stampa name/content.",
"L'ultimo .content mostra il riepilogo del modello. if not tool_chiamato stampa un avviso se il tool non risulta usato; non è un assert che fa fallire formalmente il test.",
"L'output registrato mostra get_employee_info e OK per E001. Il commento promette anche E999, ma il codice testa soltanto E001."
],
16: [
"employee_node riceve ExpenseState e restituisce dict. state.get('employee_id') legge l'ID già presente; il commento 'inserire l'ID' è impreciso. Se assente, return produce employee_data NOT_FOUND senza chiamare l'agente.",
"Nel try invoca employee_agent con un HumanMessage contenente l'ID esatto, inserito dalla f-string, e recursion_limit=10.",
"reversed percorre i messaggi dal più recente. isinstance e message.name selezionano l'ultima risposta get_employee_info. json.loads(str(content)) la converte in Python.",
"isinstance(dati,dict) richiede un oggetto; TOOL_FAILURE provoca ValueError. Il confronto != controlla che employee_id restituito coincida con quello richiesto.",
"return {'employee_data':dati} salva la fonte reale, anche se è NOT_FOUND col codice corretto; le regole controlleranno poi lo status. Il riepilogo LLM non viene usato.",
"Senza un ToolMessage valido, raise segnala il mancato uso del tool. except restituisce employee_data TOOL_FAILURE e aggiunge 'Employee Agent: ...' agli errori. print conferma la definizione."
],
17: [
"Claim è la pratica, per esempio CLM001; policy è il regolamento della categoria, per esempio travel_train. I due strumenti cercano prima la spesa, poi la regola corrispondente."
],
18: [
"@tool, annotazioni e docstring rendono disponibili due strumenti: get_expense_details(claim_id:str)->str e get_reimbursement_policy(category:str)->str. Entrambi restituiscono testo JSON.",
"Il primo scorre CLAIMS_DB; == confronta claim_id. Se trova, return restituisce status OK e **claim, cioè tutti i campi. Altrimenti restituisce NOT_FOUND e il codice.",
"CLM001 contiene E001, travel_train, 110 EUR, ricevuta R001, progetto PRJ-DELTA e descrizione del treno. Non contiene la data: viene raccolta separatamente dalla frase.",
"Il secondo scorre POLICIES_DB e confronta expense_type con category. Se trova, restituisce OK e **policy; altrimenti NOT_FOUND e category. Il parametro e il campo archivio hanno nomi diversi.",
"La policy travel_train ha massimo 250, ricevuta obbligatoria, ruoli Analyst/Consultant/Manager e soglia 250. Il tool legge questi valori, senza confrontarli col claim.",
"json.dumps serializza i dati; ensure_ascii=False conserva accenti. print conferma le definizioni: questa cella non include una chiamata di prova .invoke."
],
19: [
"ClaimsAgent deve leggere il claim e usare il suo expense_type per scegliere la policy, anche se l'utente indica una categoria diversa. claims_node controllerà che entrambe le risposte riguardino i codici corretti."
],
20: [
"È la struttura di EmployeeAgent con strumenti diversi. __init__ conserva system, costruisce self.tools con nome → tool e usa bind_tools se presenti. ClaimsState accumula messages con Annotated/operator.add.",
"StateGraph e add_node registrano llm e action. add_conditional_edges sceglie action/END; add_edge collega START → llm e action → llm; compile crea self.graph. L'ordine claim/policy viene richiesto dal prompt, non imposto da questi collegamenti.",
"exists_action restituisce bool(getattr(ultimo messaggio,'tool_calls',[])): True se serve un'azione, False altrimenti.",
"call_llm legge la storia, antepone SystemMessage quando presente, invoca il modello e restituisce {'messages':[response]}.",
"take_action visita le tool_calls, legge name/args, verifica il nome ed esegue self.tools[nome].invoke(argomenti). Esempi: claim_id CLM001 oppure category travel_train. Una richiesta può contenere più chiamate.",
"except converte errori in TOOL_FAILURE. append crea ToolMessage con nome, ID della chiamata e contenuto. return {'messages':results} consegna i risultati al modello; il ciclo termina quando non chiede più tool.",
"I quattro metodi sono __init__, exists_action, call_llm e take_action. print conferma solo la classe: non esegue ancora ricerche."
],
21: [
"claims_system ordina: cerca claim, leggi expense_type, cerca la policy di quella categoria. Il dato ufficiale prevale sulla frase: CLM001 richiede travel_train anche se l'utente dice hotel.",
"Il prompt vieta invenzioni e decisioni sul rimborso. ClaimsAgent(model=llm, tools=[get_expense_details,get_reimbursement_policy], system=claims_system) crea l'oggetto con due strumenti; print conferma, senza ricerche."
],
22: [
"claims_node legge claim_id dallo stato. Se manca, return produce expense_data NOT_FOUND e 'claim_id mancante', senza chiamare il modello.",
"Nel try, claims_agent.graph.invoke riceve un HumanMessage con l'ID nella f-string e recursion_limit=10. expense_data/policy_data iniziano a None.",
"for visita i messaggi; continue salta quelli che non sono ToolMessage. Se name è get_expense_details, json.loads salva expense_data; elif è get_reimbursement_policy salva policy_data. Una risposta successiva dello stesso tool sostituisce la precedente.",
"isinstance richiede expense_data dict; TOOL_FAILURE provoca errore; claim_id deve coincidere con quello richiesto. Se status è NOT_FOUND, return consegna solo il claim assente; senza categoria non serve una policy.",
"Status del claim diverso da OK/NOT_FOUND è invalido. Poi policy_data deve essere un dizionario senza TOOL_FAILURE: una policy assente o malformata non viene inventata.",
"categoria_claim legge expense_type ufficiale. Se policy.status è OK, il suo expense_type deve coincidere; se NOT_FOUND, category deve coincidere con la categoria cercata. Altri status sono rifiutati.",
"Superati i controlli, return restituisce expense_data/policy_data. CLM001 con policy hotel è un errore; CLM001 con travel_train corrisponde.",
"except restituisce expense_data TOOL_FAILURE e aggiunge 'Claims Agent: ...' agli errori; non restituisce una nuova policy. Il nodo legge le fonti reali, non il riepilogo LLM. print conferma la definizione."
],
23: [
"Il test invoca claims_agent per CLM001 con recursion_limit=10. Non chiama claims_node: testa l'agente e le sue ricerche.",
"risposte_tool={} raccoglie i ToolMessage. json.loads converte content; risposte_tool[message.name]=dati associa nome strumento → risposta, sostituendo eventuali risultati precedenti. json.dumps con indent=2 mostra dati leggibili.",
"Quattro assert richiedono claim_id CLM001/status OK e policy expense_type travel_train/status OK. Se una condizione è falsa, AssertionError ferma la cella; una risposta assente può causare KeyError.",
"La stampa finale arriva solo dopo i controlli. Si verificano i dati trovati, non l'ordine temporale dei tool né l'approvazione del rimborso."
],
24: [
"Deterministico significa stessi dati → stessi controlli → stesso risultato. Le regole sono codice Python, non una scelta libera del modello.",
"Le quattro etichette teoriche sono APPROVABILE, NON_APPROVABILE, DATI_INSUFFICIENTI, NECESSARIA_APPROVAZIONE. Con soglia uguale al massimo nelle policy presenti, l'ultimo caso è irraggiungibile."
],
25: [
"verifica_regole riceve ExpenseState e restituisce deterministic_result/reason. .get(...,{}) legge dipendente, spesa e policy, usando {} se mancano. Non chiama LLM.",
"for nome,dati visita tre coppie etichetta/dizionario. Se status != OK, return dà DATI_INSUFFICIENTI e il nome del documento mancante. .get('status','mancanti') offre un testo di riserva.",
"Se spesa.employee_id != dipendente.employee_id, NON_APPROVABILE: la spesa appartiene a un'altra persona. Se expense_type del claim/policy differiscono, DATI_INSUFFICIENTI: regolamento sbagliato.",
"Se role not in allowed_roles, NON_APPROVABILE. Analyst non è consentito per client_meal. Se receipt_required and not receipt_id, NON_APPROVABILE: CLM003 ha la ricevuta obbligatoria assente. Si verifica il codice, non un'immagine.",
"Nel try, float converte amount, max_amount, approval_over. KeyError/TypeError/ValueError produce DATI_INSUFFICIENTI. I controlli precedenti con [] presumono campi presenti: dati OK ma incompleti possono causare errori non intercettati da questo try.",
"importo <= 0 dà NON_APPROVABILE, anche per zero. Il commento sul negativo suggerisce dati insufficienti, ma il codice rifiuta esplicitamente.",
"importo > limite dà NON_APPROVABILE: CLM002 240>180. Le f-string usano :g per evitare decimali inutili. EUR è scritto nel testo; currency non viene controllata.",
"Solo entro il massimo, importo > soglia_approvazione dà NECESSARIA_APPROVAZIONE. Esempio teorico: massimo 250, soglia 200, importo 220. Il confronto > non include l'uguaglianza.",
"Nei dati presenti massimo/soglia coincidono: 250/250, 180/180, 60/60, 120/120. Quindi il ramo umano è irraggiungibile: oltre soglia significa già oltre massimo.",
"Senza ostacoli, l'ultimo return dà APPROVABILE. CLM001/E001: ruolo Consultant ammesso, R001 presente, 110≤250. CLM004/E003: Manager ammesso, R004 presente, 95≤120.",
"Ogni return ferma il controllo: si spiega il primo problema, non tutte le violazioni. Si usano importo/categoria ufficiali del claim. Non vengono applicati limite annuo, progetto, data o autorizzazione trasferta.",
"Non c'è controllo esplicito sui numeri speciali NaN/infinito; nei JSON presenti i numeri sono ordinari. print conferma la definizione, senza eseguire una pratica completa."
]
}
for cell in cells:
    cell['steps'] = steps[cell['cell']]
path.write_text(json.dumps(cells, ensure_ascii=False, indent=2), encoding='utf-8')
print('Celle:', len(cells))
print('Parole:', len(' '.join(' '.join([x['title'], x['purpose'], *x['steps'], x['result'], x['remember']]) for x in cells).split()))
