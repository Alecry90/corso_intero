"""Reducer: come vengono combinati gli update sullo state."""
# [slide]
import operator
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

class State(TypedDict):
    ultimo: str                                  # nessun reducer → SOVRASCRIVE
    log: Annotated[list[str], operator.add]      # operator.add → ACCODA
    messages: Annotated[list, add_messages]      # add_messages → accoda/aggiorna per id

def nodo_a(state: State) -> dict:
    return {"ultimo": "A", "log": ["A eseguito"], "messages": [("user", "ciao")]}

def nodo_b(state: State) -> dict:
    return {"ultimo": "B", "log": ["B eseguito"], "messages": [("ai", "ciao a te")]}

builder = StateGraph(State)
builder.add_node("a", nodo_a)
builder.add_node("b", nodo_b)
builder.add_edge(START, "a")
builder.add_edge("a", "b")
builder.add_edge("b", END)
graph = builder.compile()

out = graph.invoke({"ultimo": "", "log": [], "messages": []})
print(out["ultimo"])          # B
print(out["log"])             # ['A eseguito', 'B eseguito']
print(len(out["messages"]))   # 2 (HumanMessage, AIMessage)
# [/slide]
