"""Parallelizzazione: fan-out da START e fan-in con reducer."""
import operator
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from config import get_llm

llm = get_llm()

# [slide]
class State(TypedDict):
    tema: str
    punti: Annotated[list[str], operator.add]   # i rami paralleli ACCODANO qui
    sintesi: str

def pro(state: State) -> dict:
    r = llm.invoke(f"Un vantaggio di {state['tema']}")
    return {"punti": ["PRO: " + r.content]}

def contro(state: State) -> dict:
    r = llm.invoke(f"Uno svantaggio di {state['tema']}")
    return {"punti": ["CONTRO: " + r.content]}

def curiosita(state: State) -> dict:
    r = llm.invoke(f"Una curiosità su {state['tema']}")
    return {"punti": ["CURIOSITÀ: " + r.content]}

def sintetizza(state: State) -> dict:
    r = llm.invoke("Riassumi in 3 righe:\n" + "\n".join(state["punti"]))
    return {"sintesi": r.content}

builder = StateGraph(State)
for nome, fn in [("pro", pro), ("contro", contro), ("curiosita", curiosita)]:
    builder.add_node(nome, fn)
    builder.add_edge(START, nome)                       # FAN-OUT: stesso super-step
builder.add_node("sintesi", sintetizza)
builder.add_edge(["pro", "contro", "curiosita"], "sintesi")   # FAN-IN: attende tutti
builder.add_edge("sintesi", END)
graph = builder.compile()
# [/slide]
print(graph.invoke({"tema": "il lavoro da remoto", "punti": []})["sintesi"])
