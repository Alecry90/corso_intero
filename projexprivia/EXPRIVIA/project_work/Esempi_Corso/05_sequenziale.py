"""Grafo sequenziale: i nodi si passano il lavoro tramite lo state."""
# [slide]
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    nome: str
    eta: int
    output: str

def primo(state: State) -> dict:
    return {"output": f"Ciao {state['nome']}!"}

def secondo(state: State) -> dict:
    return {"output": state["output"] + f" Hai {state['eta']} anni."}

def terzo(state: State) -> dict:
    return {"output": state["output"].upper()}

builder = StateGraph(State)
builder.add_node("primo", primo)
builder.add_node("secondo", secondo)
builder.add_node("terzo", terzo)
builder.add_edge(START, "primo")
builder.add_edge("primo", "secondo")
builder.add_edge("secondo", "terzo")
builder.add_edge("terzo", END)
# equivalente: builder.add_sequence([primo, secondo, terzo])
graph = builder.compile()

print(graph.invoke({"nome": "Ada", "eta": 36})["output"])
# [/slide]
