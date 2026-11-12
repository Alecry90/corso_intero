"""Output strutturato con Pydantic e routing guidato dall'LLM."""
# [slide]
from typing import Literal
from pydantic import BaseModel, Field
from config import get_llm

class Classificazione(BaseModel):
    categoria: Literal["tecnico", "amministrativo", "commerciale"]
    urgenza: int = Field(ge=1, le=5, description="1=bassa 5=critica")
    sintesi: str = Field(description="riassunto in massimo 15 parole")

classificatore = get_llm().with_structured_output(Classificazione)
c = classificatore.invoke("Fattura di marzo errata, correggere subito!")
print(c.categoria, c.urgenza)   # oggetto Pydantic già validato
# [/slide]

# [slide:router]
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    richiesta: str
    categoria: str
    risposta: str

def classifica(state: State) -> dict:
    c = classificatore.invoke(state["richiesta"])
    return {"categoria": c.categoria}

def tecnico(state: State) -> dict:
    return {"risposta": "Apro un ticket al supporto IT"}

def amministrativo(state: State) -> dict:
    return {"risposta": "Inoltro all'amministrazione"}

def commerciale(state: State) -> dict:
    return {"risposta": "Ti contatterà un commerciale"}

builder = StateGraph(State)
builder.add_node("classifica", classifica)
for fn in (tecnico, amministrativo, commerciale):
    builder.add_node(fn.__name__, fn)        # nome nodo = nome funzione
    builder.add_edge(fn.__name__, END)
builder.add_edge(START, "classifica")
builder.add_conditional_edges(
    "classifica", lambda s: s["categoria"],
    ["tecnico", "amministrativo", "commerciale"])
graph = builder.compile()
# [/slide:router]
print(graph.invoke({"richiesta": "Il VPN non si connette da stamattina"}))
