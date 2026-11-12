"""Conditional edges: una funzione router sceglie il ramo."""
# [slide]
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    a: int
    b: int
    operazione: str
    risultato: int

def somma(state: State) -> dict:
    return {"risultato": state["a"] + state["b"]}

def sottrai(state: State) -> dict:
    return {"risultato": state["a"] - state["b"]}

def instrada(state: State) -> str:     # router: NON modifica lo state,
    if state["operazione"] == "+":      # ritorna il nome del ramo
        return "ramo_somma"
    return "ramo_sottrazione"

builder = StateGraph(State)
builder.add_node("somma", somma)
builder.add_node("sottrai", sottrai)
builder.add_conditional_edges(
    START, instrada,
    {"ramo_somma": "somma", "ramo_sottrazione": "sottrai"},   # etichetta → nodo
)
builder.add_edge("somma", END)
builder.add_edge("sottrai", END)
graph = builder.compile()

print(graph.invoke({"a": 10, "b": 4, "operazione": "-"})["risultato"])   # 6
# [/slide]
