"""Le modalità di streaming."""
from typing import TypedDict
from langgraph.graph import StateGraph, MessagesState, START, END
from config import get_llm

llm = get_llm()

# [slide]
from langgraph.config import get_stream_writer

def agente(state: MessagesState) -> dict:
    writer = get_stream_writer()
    writer({"stato": "sto pensando…"})                # evento CUSTOM
    return {"messages": [llm.invoke(state["messages"])]}

builder = StateGraph(MessagesState)
builder.add_node("agente", agente)
builder.add_edge(START, "agente")
builder.add_edge("agente", END)
graph = builder.compile()
inputs = {"messages": [("user", "Spiegami cos'è un grafo in 2 righe")]}

# 1) "values": lo state completo dopo ogni passo | "updates": solo le modifiche
for chunk in graph.stream(inputs, stream_mode="updates"):
    print(chunk)

# 2) "messages": i token dell'LLM appena generati (effetto "macchina da scrivere")
for token, meta in graph.stream(inputs, stream_mode="messages"):
    if meta["langgraph_node"] == "agente":
        print(token.content, end="", flush=True)

# 3) più modalità insieme → tuple (modalità, dato)
for modo, dato in graph.stream(inputs, stream_mode=["custom", "updates"]):
    print(modo, dato)
# [/slide]
