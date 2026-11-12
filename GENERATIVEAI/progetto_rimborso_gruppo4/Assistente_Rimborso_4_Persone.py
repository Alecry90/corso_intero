# %% [markdown]
# # Assistente per rimborso spese — esame in 4 persone
# 
# Questo notebook usa SOLO i file JSON originali ricevuti dal gruppo. Non inventa
# dipendenti, note spese, policy, ricevute né autorizzazioni alle trasferte.
# Le celle seguono il modello dei laboratori: `json.load`, `ChatOllama`, `@tool`,
# `TypedDict`, `StateGraph`, `MemorySaver` e interruzioni per approvazione umana.
# 
# **Importante:** `claims.json` non contiene date; nessuno dei JSON contiene
# approvazioni delle trasferte o il totale annuale già speso. In questi casi
# l'assistente NON presume un'approvazione o una disponibilità di budget.

# %% [markdown]
# ## SETUP COMUNE — Cella 1: import e configurazione
# `USA_OLLAMA = False` permette di testare la struttura senza un modello avviato.
# Per l'esame, impostarlo a `True` dopo aver avviato Ollama e scaricato `llama3.2`.
# Installare le dipendenze dal file `requirements.txt` in un ambiente Python 3.11+.

# %%
import json
import re
from pathlib import Path
from typing import TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_ollama import ChatOllama
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt, Command

USA_OLLAMA = False  # Cambiare in True soltanto con Ollama in esecuzione.
MODELLO = "llama3.2"  # Il modello utilizzato negli esempi del corso.
llm = ChatOllama(model=MODELLO, temperature=0) if USA_OLLAMA else None
DATA_DIR = Path("data")  # Avviare il notebook nella cartella del progetto.

# %% [markdown]
# ## SETUP COMUNE — Cella 2: lettura dei JSON originali
# `json.load` legge i file come liste di dizionari. Gli indici facilitano la ricerca
# tramite ID senza alterare il contenuto dei quattro allegati originali.

# %%
with (DATA_DIR / "employees.json").open(encoding="utf-8") as f:
    dipendenti_originali = json.load(f)
with (DATA_DIR / "claims.json").open(encoding="utf-8") as f:
    spese_originali = json.load(f)
with (DATA_DIR / "policies.json").open(encoding="utf-8") as f:
    policy_originali = json.load(f)
with (DATA_DIR / "README.json").open(encoding="utf-8") as f:
    descrizione_progetto = json.load(f)

DIPENDENTI = {x["employee_id"]: x for x in dipendenti_originali}
SPESE = {x["claim_id"]: x for x in spese_originali}
POLICY = {x["expense_type"]: x for x in policy_originali}
print(f"Caricati {len(DIPENDENTI)} dipendenti, {len(SPESE)} spese, {len(POLICY)} policy.")

# %% [markdown]
# # PARTE 1 — Persona 1: Request Agent
# **Cella 3: State condiviso (`TypedDict`).** Tutti i nodi scrivono nello stesso
# dizionario; ogni funzione restituisce soltanto le chiavi che deve aggiornare.
# I nomi `*_richiesto` distinguono i dati del messaggio dai dati ufficiali del claim.

# %%
class ExpenseState(TypedDict, total=False):
    input_originale: str
    intent: str
    claim_id: str | None
    employee_id_richiesto: str | None
    amount_richiesto: float | None
    category_richiesta: str | None
    expense_date_richiesta: str | None
    missing_info: list[str]
    clarification_question: str
    employee_data: dict
    expense_data: dict
    policy_data: dict
    travel_data: dict
    employee_id: str | None
    esito_regole: str
    motivo_regole: str
    reviewer_output: str
    esito: str
    motivazione: str
    risposta_finale: str
    human_decision: dict
    errori: list[str]

# %% [markdown]
# **Cella 4: estrazione.** In modalità classe, Ollama interpreta il testo e produce
# JSON. Nella modalità di prova, le espressioni regolari estraggono soltanto
# identificativi/importi scritti ESPRESSAMENTE dall'utente; non sostituiscono l'LLM.

# %%
def estrai_senza_llm(testo: str) -> dict:
    """Estrazione limitata, trasparente e ripetibile per i test di classe."""
    claim = re.search(r"\bCLM\d+\b", testo, re.IGNORECASE)
    dipendente = re.search(r"\bE\d{3}\b", testo, re.IGNORECASE)
    importo = re.search(r"(?<!\w)(\d+(?:[.,]\d+)?)\s*(?:€|euro|EUR)(?!\w)", testo, re.IGNORECASE)
    categoria = next((c for c in POLICY if re.search(r"\b" + re.escape(c) + r"\b", testo, re.I)), None)
    data = re.search(r"\b\d{4}-\d{2}-\d{2}\b", testo)
    return {
        "intent": "RIMBORSO_SPESA" if re.search(r"rimbors|\bCLM\d+\b", testo, re.I) else "ALTRO",
        "claim_id": claim.group().upper() if claim else None,
        "employee_id_richiesto": dipendente.group().upper() if dipendente else None,
        "amount_richiesto": float(importo.group(1).replace(",", ".")) if importo else None,
        "category_richiesta": categoria,
        "expense_date_richiesta": data.group() if data else None,
    }


def estrai_con_ollama(testo: str) -> dict:
    """Usa ChatOllama come nei laboratori; vieta le informazioni inventate."""
    istruzioni = (
        "Sei il Request Agent di rimborsi spese. Non inventare dati. "
        "Estrai SOLTANTO il JSON con chiavi intent, claim_id, "
        "employee_id_richiesto, amount_richiesto, category_richiesta, "
        "expense_date_richiesta. intent è RIMBORSO_SPESA oppure ALTRO. "
        "Se un valore manca, scrivi null. Le categorie note sono: "
        + ", ".join(POLICY) + ". La data deve essere YYYY-MM-DD se esplicita."
    )
    risposta = llm.invoke([SystemMessage(content=istruzioni), HumanMessage(content=testo)])
    testo_json = str(risposta.content)
    apertura, chiusura = testo_json.find("{"), testo_json.rfind("}")
    if apertura < 0 or chiusura < apertura:
        raise ValueError("Il modello non ha restituito un JSON interpretabile")
    dati = json.loads(testo_json[apertura:chiusura + 1])
    # Riutilizziamo la verifica regex per gli ID: l'LLM non può inventare un claim.
    sicuri = estrai_senza_llm(testo)
    dati["claim_id"] = sicuri["claim_id"]
    dati["employee_id_richiesto"] = sicuri["employee_id_richiesto"]
    dati["intent"] = sicuri["intent"]
    return dati

# %% [markdown]
# **Cella 5: `interpret_request` e chiarimento.** Serve soltanto un `claim_id`
# identificabile per iniziare a interrogare i dati ufficiali. Importo, categoria e
# dipendente possono essere recuperati dal claim, evitando domande superflue.

# %%
def interpret_request(state: ExpenseState) -> dict:
    testo = state.get("input_originale", "").strip()
    try:
        dati = estrai_con_ollama(testo) if USA_OLLAMA else estrai_senza_llm(testo)
    except Exception as exc:
        return {"intent": "ERRORE", "missing_info": ["interpretazione"],
                "clarification_question": "Puoi riscrivere la richiesta indicando il claim ID?",
                "errori": [f"Request Agent: {type(exc).__name__}: {exc}"]}
    mancanti = []
    if dati.get("intent") != "RIMBORSO_SPESA":
        mancanti.append("intent_rimborso")
    if not dati.get("claim_id"):
        mancanti.append("claim_id")
    return {**dati, "missing_info": mancanti,
            "clarification_question": "Indica l'identificativo della nota spese (es. CLM001)." if mancanti else ""}


def route_request(state: ExpenseState) -> str:
    return "chiarimento" if state.get("missing_info") else "claims_agent"


def chiedi_chiarimento(state: ExpenseState) -> dict:
    messaggio = state.get("clarification_question", "Servono più informazioni.")
    return {"esito": "DATI_INSUFFICIENTI", "motivazione": messaggio,
            "risposta_finale": "DATI_INSUFFICIENTI — " + messaggio}

# %% [markdown]
# # PARTE 2 — Persona 2: Employee Agent e regole Python
# **Cella 6: tool del dipendente e trasferta.** I dati anagrafici sono REALI
# rispetto ai file forniti. `check_travel_approval` ritorna `NOT_AVAILABLE`:
# la verifica NON si trova nei JSON, quindi non può restituire True o False.

# %%
@tool
def get_employee_info(employee_id: str) -> dict:
    """Recupera ruolo, dipartimento, progetto e responsabile dai dati dipendenti."""
    persona = DIPENDENTI.get(employee_id)
    return {"status": "OK", **persona} if persona else {"status": "NOT_FOUND", "employee_id": employee_id}


@tool
def check_travel_approval(employee_id: str, date: str = "") -> dict:
    """Verifica la disponibilità dell'approvazione trasferta nei dati forniti."""
    if employee_id not in DIPENDENTI:
        return {"status": "NOT_FOUND", "approved": None}
    return {"status": "NOT_AVAILABLE", "approved": None,
            "motivo": "I JSON forniti non contengono approvazioni della trasferta né date dei claim."}

# %% [markdown]
# **Cella 7: nodi Employee e Travel.** `try/except` cattura `Tool Failure`.
# Si usa l'ID presente nel claim ufficiale, non quello dichiarato dall'utente.

# %%
def employee_agent(state: ExpenseState) -> dict:
    claim = state.get("expense_data", {})
    employee_id = claim.get("employee_id")
    if not employee_id:
        return {"employee_data": {"status": "NOT_AVAILABLE"}}
    try:
        dati = get_employee_info.invoke({"employee_id": employee_id})
        return {"employee_id": employee_id, "employee_data": dati}
    except Exception as exc:
        return {"employee_data": {"status": "TOOL_FAILURE"},
                "errori": state.get("errori", []) + [f"get_employee_info: {exc}"]}


def travel_check(state: ExpenseState) -> dict:
    try:
        esito = check_travel_approval.invoke({
            "employee_id": state.get("employee_id") or "",
            "date": state.get("expense_date_richiesta") or ""
        })
        return {"travel_data": esito}
    except Exception as exc:
        return {"travel_data": {"status": "TOOL_FAILURE", "approved": None},
                "errori": state.get("errori", []) + [f"check_travel_approval: {exc}"]}

# %% [markdown]
# **Cella 8: regole deterministiche.** Tutte le verifiche di conformità sono
# scritte in Python, non chieste all'LLM. Priorità: errori e incongruenze,
# ricevuta mancante, ruolo, valuta, limiti, infine conferma della trasferta.
# `max_amount` è trattato come un MASSIMALE VINCOLANTE: oltre si rifiuta;
# `approval_over` si applica solo a importi entro il massimale.
# Nei JSON ricevuti i due valori coincidono, quindi nessuno supera la soglia
# di approvazione pur restando sotto il massimale. Per dimostrare Human Approval
# si usa la verifica umana dell'autorizzazione di trasferta NON presente nei file.

# %%
def applica_regole(state: ExpenseState) -> tuple[str, str]:
    spesa = state.get("expense_data", {})
    dipendente = state.get("employee_data", {})
    policy = state.get("policy_data", {})
    viaggio = state.get("travel_data", {})

    for nome, record in [("spesa", spesa), ("dipendente", dipendente), ("policy", policy)]:
        if record.get("status") != "OK":
            return "DATI_INSUFFICIENTI", f"Non posso verificare {nome}: {record.get('status', 'mancante')}."
    if viaggio.get("status") in {"TOOL_FAILURE", "NOT_FOUND"}:
        return "DATI_INSUFFICIENTI", "Errore durante la verifica della trasferta."

    # I dati già presenti nel claim prevalgono sulle ipotesi del messaggio.
    if state.get("employee_id_richiesto") and state["employee_id_richiesto"] != spesa["employee_id"]:
        return "DATI_INSUFFICIENTI", "Dipendente indicato diverso dal titolare del claim."
    if state.get("category_richiesta") and state["category_richiesta"] != spesa["expense_type"]:
        return "DATI_INSUFFICIENTI", "Categoria indicata diversa dal claim ufficiale."
    if state.get("amount_richiesto") is not None and abs(state["amount_richiesto"] - spesa["amount"]) > 0.001:
        return "DATI_INSUFFICIENTI", "Importo nel messaggio diverso dall'importo registrato."
    if spesa.get("project_code") != dipendente.get("project"):
        return "DATI_INSUFFICIENTI", "Il progetto della spesa non coincide col progetto del dipendente."
    if spesa.get("currency") != "EUR":
        return "DATI_INSUFFICIENTI", "La policy non contiene regole di conversione valuta."
    importo = spesa.get("amount")
    massimale = policy.get("max_amount")
    soglia = policy.get("approval_over")
    if isinstance(importo, bool) or not isinstance(importo, (int, float)) or importo <= 0:
        return "DATI_INSUFFICIENTI", "Importo della spesa non valido."
    if isinstance(massimale, bool) or not isinstance(massimale, (int, float)) or massimale <= 0:
        return "DATI_INSUFFICIENTI", "Massimale della policy non valido."
    if policy.get("receipt_required") and not spesa.get("receipt_id"):
        return "DATI_INSUFFICIENTI", "Ricevuta obbligatoria assente: serve un giustificativo."
    if dipendente.get("role") not in policy.get("allowed_roles", []):
        return "NON_APPROVABILE", f"Ruolo {dipendente.get('role')} non consentito dalla policy."
    if importo > massimale:
        return "NON_APPROVABILE", f"Spesa di {importo:.2f} EUR oltre il massimale di {massimale:.2f} EUR."
    limite_annuo = dipendente.get("annual_expense_limit")
    if isinstance(limite_annuo, (int, float)) and not isinstance(limite_annuo, bool) and importo > limite_annuo:
        return "NON_APPROVABILE", "Singola spesa superiore persino al limite annuo del dipendente."
    # Senza il totale annuale già usato non è possibile verificare il residuo:
    # il limite annuale è informativo e non prova che esista ancora budget.
    if viaggio.get("approved") is False:
        return "NON_APPROVABILE", "Trasferta esplicitamente non approvata."
    if isinstance(soglia, (int, float)) and not isinstance(soglia, bool) and importo > soglia:
        return "NECESSARIA_APPROVAZIONE", "Importo superiore alla soglia di approvazione della policy."
    if viaggio.get("approved") is not True:
        return "NECESSARIA_APPROVAZIONE", (
            "Dati della spesa conformi, ma il responsabile deve verificare "
            "l'approvazione della trasferta assente dai JSON.")
    # Caso raggiungibile se in futuro un tool REALE attesta l'approvazione.
    return "APPROVABILE", "Controlli superati e trasferta verificata."


def deterministic_rules(state: ExpenseState) -> dict:
    esito, motivo = applica_regole(state)
    return {"esito_regole": esito, "motivo_regole": motivo}

# %% [markdown]
# # PARTE 3 — Persona 3: Claims/Expense Data Agent
# **Cella 9: tool della spesa e della policy.** Cercano le chiavi nei dizionari
# ottenuti dai JSON ORIGINALI. Restituiscono `NOT_FOUND` quando non trovano l'ID.

# %%
@tool
def get_expense_details(claim_id: str) -> dict:
    """Recupera importo, categoria, ricevuta, dipendente e progetto del claim."""
    record = SPESE.get(claim_id)
    return {"status": "OK", **record} if record else {"status": "NOT_FOUND", "claim_id": claim_id}


@tool
def get_reimbursement_policy(category: str) -> dict:
    """Recupera massimale, ricevuta obbligatoria, ruoli e soglia della categoria."""
    record = POLICY.get(category)
    return {"status": "OK", **record} if record else {"status": "NOT_FOUND", "expense_type": category}

# %% [markdown]
# **Cella 10: nodo Claims.** Interroga prima la spesa, poi la policy relativa
# alla categoria del claim (non a quella eventualmente inventata dall'utente).
# Gestisce separatamente spesa assente e guasti dei due tool.

# %%
def claims_agent(state: ExpenseState) -> dict:
    errori = list(state.get("errori", []))
    try:
        spesa = get_expense_details.invoke({"claim_id": state["claim_id"]})
    except Exception as exc:
        spesa = {"status": "TOOL_FAILURE"}
        errori.append(f"get_expense_details: {exc}")
    if spesa.get("status") == "OK":
        try:
            policy = get_reimbursement_policy.invoke({"category": spesa.get("expense_type", "")})
        except Exception as exc:
            policy = {"status": "TOOL_FAILURE"}
            errori.append(f"get_reimbursement_policy: {exc}")
    else:
        policy = {"status": "NOT_AVAILABLE"}
    return {"expense_data": spesa, "policy_data": policy, "errori": errori}

# %% [markdown]
# # PARTE 4 — Persona 4: Reviewer e Supervisor
# **Cella 11: Reviewer Agent-as-Tool.** Il tool riceve l'esito calcolato dal
# codice Python e scrive una motivazione. Non può cambiarne l'etichetta.
# In modalità test la risposta è deterministica; Ollama serve solo a spiegarla.

# %%
@tool
def reviewer_agent_tool(context_json: str) -> str:
    """Reviewer Agent-as-Tool: formula una risposta senza modificare la decisione."""
    info = json.loads(context_json)
    base = f"{info['esito']} — {info['motivo']}"
    if not USA_OLLAMA:
        return base
    try:
        risposta = llm.invoke([
            SystemMessage(content=("Sei il Reviewer Agent. Riformula in italiano chiaro "
                "la motivazione ricevuta, senza inventare dati né cambiare l'esito. "
                "Non dichiarare approvato un rimborso che aspetta il responsabile.")),
            HumanMessage(content=context_json)
        ])
        return base + "\nSpiegazione: " + str(risposta.content)
    except Exception:
        return base + "\n(Reviewer LLM non disponibile: usata motivazione verificata.)"


def reviewer_node(state: ExpenseState) -> dict:
    esito = state.get("esito_regole", "DATI_INSUFFICIENTI")
    motivo = state.get("motivo_regole", "Verifica incompleta.")
    contesto = {"esito": esito, "motivo": motivo,
                "claim_id": state.get("claim_id"), "expense": state.get("expense_data", {}),
                "employee": state.get("employee_data", {}), "policy": state.get("policy_data", {})}
    try:
        testo = reviewer_agent_tool.invoke({"context_json": json.dumps(contesto, ensure_ascii=False)})
    except Exception as exc:
        testo = f"{esito} — {motivo} (Reviewer tool non disponibile: {type(exc).__name__})."
    return {"esito": esito, "motivazione": motivo, "reviewer_output": testo,
            "risposta_finale": testo}

# %% [markdown]
# **Cella 12: routing condizionale.** Tutte e 4 le etichette sono considerate.
# Il nodo umano usa `interrupt`: l'esecuzione si blocca finché NON viene
# fornito il parere del responsabile. I booleani sono esaminati dal codice,
# non decisi dal modello. I dati originali restano invariati.

# %%
def route_finale(state: ExpenseState) -> str:
    """Restituisce esplicitamente una delle quattro etichette della traccia."""
    esito = state.get("esito", "DATI_INSUFFICIENTI")
    if esito in {"APPROVABILE", "NON_APPROVABILE", "DATI_INSUFFICIENTI", "NECESSARIA_APPROVAZIONE"}:
        return esito
    return "DATI_INSUFFICIENTI"


def human_approval(state: ExpenseState) -> dict:
    risposta = interrupt({
        "richiesta": "Verificare la trasferta e decidere sul rimborso.",
        "claim_id": state.get("claim_id"),
        "esito_preliminare": state.get("esito"),
        "motivo": state.get("motivazione"),
        "campi_richiesti": ["approva", "trasferta_approvata", "budget_disponibile_verificato", "nota"]
    })
    if not isinstance(risposta, dict) or type(risposta.get("approva")) is not bool:
        raise ValueError("Serve un dizionario con 'approva' booleano.")
    approva = risposta["approva"]
    trasferta = risposta.get("trasferta_approvata")
    if type(trasferta) not in (bool, type(None)):
        raise ValueError("trasferta_approvata dev'essere True, False o None.")
    budget = risposta.get("budget_disponibile_verificato")
    if type(budget) not in (bool, type(None)):
        raise ValueError("budget_disponibile_verificato deve essere True, False o None.")
    nota = str(risposta.get("nota", "")).strip()
    if trasferta is False:
        esito, motivo = "NON_APPROVABILE", "Responsabile: trasferta non approvata."
    elif not approva:
        esito, motivo = "NON_APPROVABILE", "Responsabile: rimborso rifiutato."
    elif budget is False:
        esito, motivo = "NON_APPROVABILE", "Responsabile: budget residuo insufficiente."
    elif trasferta is not True:
        esito, motivo = "DATI_INSUFFICIENTI", "Manca la verifica della trasferta anche dopo la revisione."
    elif budget is not True:
        esito, motivo = "DATI_INSUFFICIENTI", "Manca la verifica del budget annuo residuo."
    else:
        esito, motivo = "APPROVABILE", "Responsabile: trasferta e budget verificati, rimborso approvato."
    if nota:
        motivo += " Nota: " + nota
    return {"human_decision": risposta, "esito": esito,
            "motivazione": motivo, "risposta_finale": f"{esito} — {motivo}"}

# %% [markdown]
# **Cella 13: costruzione del StateGraph.** Lo schema è sequenziale con due
# percorsi condizionali: chiarimento dopo Request, intervento umano dopo Reviewer.
# Si recupera il claim prima del dipendente per conoscere l'ID verificato.
# `MemorySaver` conserva i checkpoint **solo finché il processo è aperto**.

# %%
builder = StateGraph(ExpenseState)
builder.add_node("request_agent", interpret_request)
builder.add_node("chiarimento", chiedi_chiarimento)
builder.add_node("claims_agent", claims_agent)
builder.add_node("employee_agent", employee_agent)
builder.add_node("travel_check", travel_check)
builder.add_node("deterministic_rules", deterministic_rules)
builder.add_node("reviewer_agent", reviewer_node)
builder.add_node("human_approval", human_approval)

builder.add_edge(START, "request_agent")
builder.add_conditional_edges("request_agent", route_request, {
    "chiarimento": "chiarimento", "claims_agent": "claims_agent"})
builder.add_edge("chiarimento", END)
builder.add_edge("claims_agent", "employee_agent")
builder.add_edge("employee_agent", "travel_check")
builder.add_edge("travel_check", "deterministic_rules")
builder.add_edge("deterministic_rules", "reviewer_agent")
builder.add_conditional_edges("reviewer_agent", route_finale, {
    "APPROVABILE": END,
    "NON_APPROVABILE": END,
    "DATI_INSUFFICIENTI": END,
    "NECESSARIA_APPROVAZIONE": "human_approval"
})
builder.add_edge("human_approval", END)

checkpointer = MemorySaver()
app = builder.compile(checkpointer=checkpointer)
print("Grafo LangGraph pronto. I JSON originali non sono stati modificati.")

# %% [markdown]
# **Cella 14: esecuzione e ripresa.** Ogni richiesta ha un `thread_id`
# diverso. Quando `__interrupt__` compare, NON è stata approvata: la persona
# autorizzata deve controllare gli elementi che NON sono nei JSON.
# `Command(resume=...)` riprende lo stesso checkpoint, senza ricominciare.

# %%
def esegui_richiesta(testo: str, thread_id: str) -> dict:
    config = {"configurable": {"thread_id": thread_id}}
    app.invoke({"input_originale": testo, "errori": []}, config=config)
    stato = dict(app.get_state(config).values)
    stato["in_attesa_responsabile"] = "human_approval" in app.get_state(config).next
    return stato


def decisione_responsabile(thread_id: str, approva: bool,
                           trasferta_approvata: bool | None,
                           budget_disponibile_verificato: bool | None = None,
                           nota: str = "") -> dict:
    if (type(approva) is not bool or type(trasferta_approvata) not in (bool, type(None))
            or type(budget_disponibile_verificato) not in (bool, type(None))):
        raise ValueError("Decisione, trasferta e budget devono essere booleani o None (se previsto).")
    config = {"configurable": {"thread_id": thread_id}}
    if "human_approval" not in app.get_state(config).next:
        raise ValueError("Questa richiesta non è in attesa del responsabile.")
    app.invoke(Command(resume={"approva": approva,
                               "trasferta_approvata": trasferta_approvata,
                               "budget_disponibile_verificato": budget_disponibile_verificato,
                               "nota": nota}), config=config)
    return dict(app.get_state(config).values)

# %% [markdown]
# **Cella 15: diagramma.** LangGraph permette di mostrare in Markdown lo schema
# Mermaid. Una copia già pronta è in `ARCHITETTURA.md`.

# %%
print(app.get_graph().draw_mermaid())

# %% [markdown]
# **Cella 16: prove sui dati reali.** Nessun ID inventato; questi sono i 4 claim
# esistenti. Il primo e il quarto richiedono controllo umano perché NON c'è
# una fonte di approvazione trasferta. Non approvare cliccando a caso.

# %%
for numero in (1, 2, 3, 4):
    claim_id = f"CLM{numero:03d}"
    stato = esegui_richiesta(f"Chiedo rimborso per {claim_id}.", f"dimostrazione-{claim_id}")
    print(claim_id, stato["esito"], "| in pausa:", stato["in_attesa_responsabile"])

# %% [markdown]
# **Cella 17: test automatici dal JSON.** I casi usano solo le identità e i
# record originali, più messaggi errati per verificare i controlli. Nei test
# con `decisione_responsabile`, il messaggio è una simulazione esplicitamente
# denominata TEST, non un'autorizzazione contenuta nei JSON.

# %%
with Path("TEST_SCENARIOS.json").open(encoding="utf-8") as f:
    scenari = json.load(f)

contatore = 0
for scenario in scenari:
    test_id = scenario["id"]
    stato = esegui_richiesta(scenario["input"], "test-" + test_id)
    assert stato["esito"] == scenario["output_atteso"], (
        test_id, stato["esito"], scenario["output_atteso"])
    if "risposta_responsabile" in scenario:
        assert stato["in_attesa_responsabile"], f"{test_id}: manca l'interruzione"
        risposta = scenario["risposta_responsabile"]
        finale = decisione_responsabile("test-" + test_id, **risposta)
        assert finale["esito"] == scenario["output_finale_atteso"], test_id
    contatore += 1
print(f"Test superati: {contatore}/{len(scenari)}")
