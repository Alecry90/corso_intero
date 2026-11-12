import json
from pathlib import Path

p = Path('.work/spiegazioni_26_50.json')
items = json.loads(p.read_text(encoding='utf-8'))
steps = {
26: [
    "Il for esterno prende un claim alla volta da CLAIMS_DB. dipendente e policy ripartono da None per evitare di riutilizzare i dati della spesa precedente.",
    "Un for cerca in EMPLOYEES_DB la persona con employee_id uguale a quello del claim; un altro cerca in POLICIES_DB la policy con expense_type uguale alla categoria del claim. Ogni break interrompe soltanto il ciclo di ricerca in cui si trova.",
    "stato_test: ExpenseState crea il dizionario con employee_data, expense_data e policy_data. L'annotazione descrive il tipo; non avvia il grafo. {'status': 'OK', **dipendente} unisce status ai campi del dipendente; lo stesso avviene per claim e policy.",
    "Il test presume che le corrispondenze esistano: con None, l'espansione ** provocherebbe un errore. Nei dati presenti esistono tutte.",
    "verifica_regole(stato_test) chiama direttamente le regole. print legge deterministic_result e deterministic_reason nel dizionario restituito e li mostra accanto al claim_id."
],
28: [
    "class ReviewerAgent definisce il progetto dell'agente; la docstring tra triple virgolette descrive il compito.",
    "__init__(self, model, system='', checkpointer=None) costruisce l'oggetto: riceve il modello, istruzioni facoltative e un eventuale salvataggio dello stato. self indica l'oggetto; self.model e self.system conservano i valori.",
    "La classe interna ReviewerState(TypedDict) descrive lo stato: messages è una lista di messaggi. Annotated[list[AnyMessage], operator.add] dice a LangGraph di sommare le liste, aggiungendo i nuovi messaggi alla cronologia.",
    "StateGraph(ReviewerState) crea il grafo. add_node('llm', self.call_llm) registra il nodo senza eseguirlo; add_edge collega START → llm → END. compile(checkpointer=checkpointer) prepara il grafo eseguibile in self.graph. Il checkpointer predefinito è None.",
    "call_llm(self, state) legge state['messages']. Se self.system non è vuoto, mette un SystemMessage davanti ai messaggi; altrimenti usa la lista ricevuta. self.model.invoke(messages) chiama il modello.",
    "return {'messages': [response]} restituisce l'aggiornamento; operator.add aggiunge la risposta alla cronologia. Il print conferma la definizione della classe, non l'analisi di un caso."
],
31: [
    "reviewer_node(state: ExpenseState) -> dict riceve lo stato principale e restituisce i campi da aggiornare. Il dizionario caso raccoglie dipendente, spesa, policy, risultato e motivazione delle regole. state.get(...) restituisce None se il campo manca.",
    "Nel try, json.dumps(caso, ensure_ascii=False) converte il caso in testo JSON con accenti leggibili. review_reimbursement_case.invoke({'case_json': ...}) chiama il tool e riceve il testo del Reviewer.",
    "json.loads(risposta) converte il testo in oggetto Python. JSON malformato, testo aggiuntivo o recinzioni Markdown possono causare un errore.",
    "Tre isinstance verificano che l'oggetto sia dict, coerente sia bool e osservazioni sia str. In caso contrario raise ValueError segnala l'errore. JSON true/false diventano True/False; la stringa 'true' è invalida. Questi controlli verificano il formato, non la correttezza del giudizio.",
    "Se i controlli passano, return salva reviewer_coerente e reviewer_output. Anche False è formalmente valido: significa incoerenza dichiarata.",
    "except Exception as errore gestisce gli errori del try: salva reviewer_coerente = None, un messaggio con l'eccezione e errori aggiornati. state.get('errori', []) + [nuovo_errore] conserva i precedenti e aggiunge il nuovo. Il print conferma la definizione."
],
33: [
    "chiarimento_node legge missing_info con .get(..., []); etichette traduce le chiavi interne in frasi comprensibili: employee_id, claim_id, expense_date e intent_rimborso.",
    "La list comprehension percorre i campi mancanti e usa etichette.get(campo, campo): se manca una traduzione mantiene la chiave. ', '.join(...) unisce le frasi nella domanda.",
    "interrupt riceve tipo = 'chiarimento', domanda e campi_mancanti. Sospende il grafo; non legge da input(). Il checkpointer conserva la richiesta finché arriva Command(resume=...) sullo stesso thread.",
    "Alla ripresa, interrupt restituisce il valore resume. str(risposta).strip() lo converte in testo eliminando spazi esterni; non controlla il tipo, quindi anche un dizionario diventa testo.",
    "richiesta_completa aggiunge a input_originale una nuova riga, 'Chiarimento dell'utente:' e la risposta. Il nodo non inserisce direttamente ID o data: il Request Agent li dovrà estrarre.",
    "return aggiorna input_originale, svuota missing_info e imposta awaiting_clarification a False. Il grafo torna a request; un dato ancora mancante può produrre un altro chiarimento."
],
35: [
    "approvazione_umana_node recupera expense_data con .get(..., {}). Passa a interrupt tipo, domanda, claim_id, importo, valuta, esito preliminare, motivazione e revisione. I .get restituiscono None se un campo manca.",
    "La pausa attende Command(resume={'approvato': True/False, 'nota': ...}) sullo stesso thread. Alla ripresa quel valore diventa risposta.",
    "Il controllo richiede un dict e un bool nel campo approvato. Con or, se il primo controllo fallisce il secondo non viene valutato. Stringhe come 'False', numeri o campo assente non sono validi.",
    "Una risposta invalida restituisce human_decision = NON_VALIDA e una spiegazione; il router farà ripetere la domanda.",
    "str(risposta.get('nota') or '').strip() normalizza la nota facoltativa; or None rende None una nota vuota.",
    "'APPROVATO' if risposta['approvato'] else 'RIFIUTATO' sceglie il testo in base al booleano. return salva human_decision e human_note; la risposta finale viene costruita da un altro nodo."
],
37: [
    "risposta_finale_node legge risultato delle regole, giudizio del Reviewer, decisione umana e motivazione. .get(..., '') usa una motivazione vuota se manca; claim_id or 'non indicato' fornisce un identificativo leggibile.",
    "La catena if/elif/else esegue solo il primo ramo vero, quindi l'ordine conta. Se risultato è DATI_INSUFFICIENTI, conserva esito e motivazione delle regole.",
    "Se risultato non è APPROVABILE, NON_APPROVABILE o NECESSARIA_APPROVAZIONE, produce DATI_INSUFFICIENTI con la motivazione già nello stato o un testo di ripiego. Include il caso di risultato None.",
    "Se revisione_ok is not True, produce DATI_INSUFFICIENTI e aggiunge reviewer_output. Richiede esattamente True: False e None bloccano anche un rifiuto corretto delle regole.",
    "Con revisione confermata, NON_APPROVABILE mantiene il rifiuto; APPROVABILE mantiene l'approvazione e aggiunge la frase sull'approvazione automatica.",
    "Resta il caso NECESSARIA_APPROVAZIONE: human_decision APPROVATO produce APPROVABILE; RIFIUTATO produce NON_APPROVABILE. Altrimenti resta NECESSARIA_APPROVAZIONE, in attesa di una decisione valida.",
    "L'if separato aggiunge human_note solo quando risultato era NECESSARIA_APPROVAZIONE, decisione è APPROVATO/RIFIUTATO e nota non è vuota. Le tre condizioni and devono valere insieme.",
    "return salva esito, motivazione e risposta_finale. Una f-string li unisce con claim_id; la frase è costruita dal codice, senza una nuova chiamata al modello."
],
39: [
    "Le quattro funzioni ricevono ExpenseState e restituiscono il nome del prossimo nodo, come indica -> str. Non modificano lo stato e non eseguono quel nodo.",
    "dopo_request: awaiting_clarification vero → chiarimento; altrimenti esito DATI_INSUFFICIENTI → risposta_finale; negli altri casi → employee. Il chiarimento ha precedenza se entrambe le condizioni fossero vere.",
    "dopo_regole: risultato APPROVABILE, NON_APPROVABILE o NECESSARIA_APPROVAZIONE → reviewer. Ogni altro valore, incluso None o DATI_INSUFFICIENTI, → risposta_finale. Anche i rifiuti vengono revisionati.",
    "dopo_reviewer: reviewer_coerente is True e risultato NECESSARIA_APPROVAZIONE → approvazione_umana. Altrimenti → risposta_finale. L'insieme con un solo elemento equivale qui a controllare quel risultato.",
    "dopo_approvazione: human_decision NON_VALIDA → approvazione_umana, per ripetere la domanda; ogni altro valore → risposta_finale. Il nodo finale gestirà anche la decisione mancante.",
    "I .get permettono di leggere stati incompleti senza KeyError. Il print conferma la definizione dei router."
],
40: [
    "prove_routing contiene tuple con nome del test, funzione, piccolo stato preparato e nodo atteso. La funzione viene conservata come oggetto, poi chiamata nel ciclo.",
    "Tre casi provano Request: dati mancanti → chiarimento, errore → finale, dati completi → employee. Due provano Regole: risultato valido → reviewer, dati insufficienti → finale.",
    "Tre casi provano Reviewer: revisione True e approvazione richiesta → umano; rifiuto coerente → finale; revisione False → finale. Due provano la decisione umana: NON_VALIDA → ripetizione, APPROVATO → finale.",
    "Il for scompone ogni tupla; funzione(stato) produce ottenuto. L'espressione condizionale sceglie il segno di successo se ottenuto == atteso, altrimenti quello di errore. print mostra il confronto.",
    "Non c'è assert: una differenza sarebbe stampata ma non bloccherebbe il notebook. Non vengono chiamati modelli né eseguite vere pause."
],
42: [
    "StateGraph(ExpenseState) crea la descrizione del grafo principale.",
    "Gli add_node registrano nome e funzione: request/interpreta_richiesta, chiarimento/chiarimento_node, employee/employee_node, claims/claims_node, regole/verifica_regole, reviewer/reviewer_node, approvazione_umana/approvazione_umana_node, risposta_finale/risposta_finale_node. Non le eseguono subito.",
    "add_edge(START, 'request') stabilisce il punto iniziale. add_conditional_edges dopo request usa dopo_request e una mappa nome → nodo per scegliere chiarimento, employee o finale.",
    "add_edge('chiarimento', 'request') fa reinterpretare il testo aggiornato dopo la ripresa. Gli archi fissi employee → claims → regole impongono recupero dati e controlli.",
    "Le conditional edges dopo regole usano dopo_regole per scegliere reviewer/finale; dopo reviewer usano dopo_reviewer per scegliere umano/finale; dopo approvazione usano dopo_approvazione per ripetere la domanda o concludere.",
    "add_edge('risposta_finale', END) termina il processo. compile(checkpointer=MemorySaver()) prepara expense_graph eseguibile, senza valutare un claim.",
    "MemorySaver conserva in memoria lo stato delle pause associate a thread_id. Consente la ripresa ma non è un archivio permanente su disco."
],
45: [
    "casi_test contiene due tuple con claim_id e richiesta italiana per CLM001/CLM003. Le stringhe adiacenti sono unite da Python; entrambe indicano E001 e la data 2026-10-08.",
    "Il for prepara config_test con configurable.thread_id. uuid4() genera un identificativo casuale; .hex lo rende testo esadecimale. Ogni prova ha uno stato indipendente.",
    "expense_graph.invoke({'input_originale': richiesta, 'errori': []}, config=config_test) avvia tutto il workflow, inclusi i modelli. I nodi aggiungono gli altri campi.",
    "I print mostrano claim, risultato delle regole e booleano del Reviewer. .get restituisce None se manca un campo.",
    "Se __interrupt__ esiste, [0].value legge il contenuto della prima pausa; altrimenti stampa risposta_finale. Non c'è assert: vengono mostrati gli esiti effettivi."
],
46: [
    "richiesta_clm002 indica E002, CLM002, hotel da 240 EUR e data 2026-10-08. config_clm002 crea un nuovo thread_id con uuid4().hex, da riutilizzare nella cella 47.",
    "expense_graph.invoke avvia la richiesta con errori vuota. I print leggono risultato, motivazione e giudizio del Reviewer.",
    "if __interrupt__ controlla qualunque pausa. La frase fissa 'Workflow in pausa per approvazione:' non verifica il tipo dell'interruzione.",
    "json.dumps del payload usa indent=2 per i rientri e ensure_ascii=False per gli accenti. Il ramo else stamperebbe risposta finale ed errori se non ci fosse pausa."
],
47: [
    "Command(resume={'approvato': False, 'nota': ...}) prepara una risposta alla pausa attiva. invoke usa config_clm002, quindi riprende il medesimo thread.",
    "La pausa della cella 46 è nel chiarimento: il dizionario arriva a chiarimento_node, che lo trasforma in testo e lo aggiunge alla richiesta. Il Request Agent rilegge tutto. Non arriva al nodo di approvazione umana.",
    "I print leggono human_decision, esito e risposta_finale; .get mostra None se un campo non è presente.",
    "Il codice non controlla prima che tipo dell'interruzione sia approvazione_umana: l'atteso del test e il nodo realmente sospeso non coincidono."
]
}
for item in items:
    if item['cell'] in steps:
        item['steps'] = steps[item['cell']]
    elif item['cell'] in (27, 32, 34, 36, 38, 41, 44):
        item['steps'] = item['steps'][1:]
p.write_text(json.dumps(items, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
words = sum(len(str(v).split()) for item in items for v in (item['title'],item['purpose'],*item['steps'],item['result'],item['remember']))
print(len(items), words)
