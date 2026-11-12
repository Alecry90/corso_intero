"""Schemi avanzati: input/output schema, state Pydantic, runtime context."""
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

# [slide]
class InputState(TypedDict):
    domanda: str

class OutputState(TypedDict):
    risposta: str

class OverallState(InputState, OutputState):
    documenti: list[str]          # chiave INTERNA: non esce dall'invoke

def cerca(state: InputState) -> dict:          # un nodo può leggere solo l'input…
    return {"documenti": [f"doc su {state['domanda']}"]}

def rispondi(state: OverallState) -> dict:      # …e un altro tutto lo state
    return {"risposta": f"Trovati {len(state['documenti'])} documenti"}

builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_sequence([cerca, rispondi])
builder.add_edge(START, "cerca")
builder.add_edge("rispondi", END)
graph = builder.compile()
print(graph.invoke({"domanda": "ferie"}))      # {'risposta': 'Trovati 1 documenti'}
# [/slide]

# [slide:pydantic]
from pydantic import BaseModel, Field

class Ordine(BaseModel):
    cliente: str
    quantita: int = Field(gt=0)          # validato all'ingresso del grafo
    note: str = ""                       # valore di default

def prepara(state: Ordine) -> dict:      # accesso per attributo: state.quantita
    return {"note": f"{state.quantita} pezzi per {state.cliente}"}

g = StateGraph(Ordine)
g.add_node("prepara", prepara)
g.add_edge(START, "prepara")
grafo_ordini = g.compile()
print(grafo_ordini.invoke({"cliente": "Rossi", "quantita": 3}))
# grafo_ordini.invoke({"cliente": "Rossi", "quantita": 0})  → ValidationError
# [/slide:pydantic]

# [slide:context]
from dataclasses import dataclass
from langgraph.runtime import Runtime

@dataclass
class Contesto:          # "configurazione" della singola esecuzione
    utente_id: str
    lingua: str = "it"

class S(TypedDict):
    testo: str

def saluta(state: S, runtime: Runtime[Contesto]) -> dict:
    ctx = runtime.context
    saluto = "Ciao" if ctx.lingua == "it" else "Hello"
    return {"testo": f"{saluto} {ctx.utente_id}"}

g2 = StateGraph(S, context_schema=Contesto)
g2.add_node("saluta", saluta)
g2.add_edge(START, "saluta")
grafo_ctx = g2.compile()
print(grafo_ctx.invoke({"testo": ""}, context=Contesto(utente_id="u42", lingua="en")))
# [/slide:context]
