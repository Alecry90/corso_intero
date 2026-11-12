"""Human-in-the-loop con interrupt() e Command(resume=...)."""
from typing import Literal, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from config import get_llm

llm = get_llm()

class State(TypedDict):
    richiesta: str
    bozza: str
    esito: str

def scrivi(state: State) -> dict:
    return {"bozza": llm.invoke(f"Scrivi una breve email per: {state['richiesta']}").content}

# [slide]
from langgraph.types import interrupt, Command

def approvazione(state: State) -> Command[Literal["invia", "annulla"]]:
    decisione = interrupt({        # il grafo si FERMA qui…
        "domanda": "Approvi l'invio? (si/no)",
        "bozza": state["bozza"],
    })                             # …e riparte col valore del resume
    return Command(goto="invia" if decisione == "si" else "annulla")

def invia(state: State) -> dict:   return {"esito": "Email inviata"}
def annulla(state: State) -> dict: return {"esito": "Invio annullato"}
# [/slide]

builder = StateGraph(State)
builder.add_node("scrivi", scrivi)
builder.add_node("approvazione", approvazione)
builder.add_node("invia", invia)
builder.add_node("annulla", annulla)
builder.add_edge(START, "scrivi")
builder.add_edge("scrivi", "approvazione")
builder.add_edge("invia", END)
builder.add_edge("annulla", END)

# [slide:run]
graph = builder.compile(checkpointer=InMemorySaver())  # OBBLIGATORIO
config = {"configurable": {"thread_id": "mail-1"}}

out = graph.invoke({"richiesta": "rinviare la riunione a lunedì"}, config)
if "__interrupt__" in out:                      # il grafo è in pausa
    payload = out["__interrupt__"][0].value
    print(payload["bozza"])
    risposta = input(payload["domanda"] + " ")
    out = graph.invoke(Command(resume=risposta), config)  # stesso thread!
print(out["esito"])
# [/slide:run]

# [slide:edit]
def revisione(state: State) -> dict:
    testo = interrupt({"istruzione": "Modifica o premi invio",
                       "testo": state["bozza"]})
    return {"bozza": testo or state["bozza"]}   # resume = nuovo valore
# [/slide:edit]

# [slide:tool]
from langchain_core.tools import tool

@tool
def prenota_sala(sala: str, data: str) -> str:
    """Prenota una sala riunioni. Richiede conferma dell'utente."""
    risposta = interrupt({"azione": "prenota_sala", "sala": sala, "data": data})
    if risposta != "approva":
        return "Prenotazione annullata dall'utente"
    return f"Sala {sala} prenotata per il {data}"      # qui l'INSERT sul DB
# [/slide:tool]
