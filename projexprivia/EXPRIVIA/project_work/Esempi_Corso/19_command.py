"""Command: aggiornare lo state E scegliere il prossimo nodo, dentro il nodo."""
from typing import Literal, TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    richiesta: str
    priorita: str
    esito: str

# [slide]
from langgraph.types import Command

def triage(state: State) -> Command[Literal["urgente", "standard"]]:
    urgente = "urgente" in state["richiesta"].lower()
    return Command(
        update={"priorita": "alta" if urgente else "normale"},   # aggiorna lo state…
        goto="urgente" if urgente else "standard",               # …e instrada
    )

def urgente(state: State) -> dict:
    return {"esito": "Escalation al responsabile"}

def standard(state: State) -> dict:
    return {"esito": "Messo in coda"}

builder = StateGraph(State)
builder.add_node("triage", triage)       # niente add_conditional_edges:
builder.add_node("urgente", urgente)     # le destinazioni sono nel type hint
builder.add_node("standard", standard)
builder.add_edge(START, "triage")
builder.add_edge("urgente", END)
builder.add_edge("standard", END)
graph = builder.compile()
print(graph.invoke({"richiesta": "URGENTE: server giù"}))
# [/slide]
