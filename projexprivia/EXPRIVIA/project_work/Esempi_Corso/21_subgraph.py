"""Subgraph: un grafo compilato usato come nodo di un altro grafo."""
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

# [slide]
# --- sottografo riutilizzabile -------------------------------------------
class RicercaState(TypedDict):
    query: str
    sintesi: str

def ricerca(state: RicercaState) -> dict:
    return {"sintesi": f"risultati per '{state['query']}'"}

def pulisci(state: RicercaState) -> dict:
    return {"sintesi": state["sintesi"].upper()}

sub = StateGraph(RicercaState)
sub.add_sequence([ricerca, pulisci])
sub.add_edge(START, "ricerca")
ricercatore = sub.compile()
# [/slide]

# [slide:padre]
# --- grafo padre ----------------------------------------------------------
class ParentState(TypedDict):
    domanda: str
    contesto: str
    query: str        # chiave condivisa con il sottografo
    sintesi: str

def usa_ricercatore(state: ParentState) -> dict:      # schemi diversi → wrapper
    out = ricercatore.invoke({"query": state["domanda"]})
    return {"contesto": out["sintesi"]}

parent = StateGraph(ParentState)
parent.add_node("wrapper", usa_ricercatore)
parent.add_node("diretto", ricercatore)     # chiavi condivise → grafo compilato = nodo
parent.add_edge(START, "wrapper")
parent.add_edge("wrapper", "diretto")
parent.add_edge("diretto", END)
graph = parent.compile()
print(graph.invoke({"domanda": "ferie 2026", "query": "permessi"}))
# [/slide:padre]
