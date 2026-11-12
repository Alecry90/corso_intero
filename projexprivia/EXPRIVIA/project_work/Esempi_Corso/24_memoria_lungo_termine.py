"""Memoria a lungo termine con lo Store (condivisa tra thread)."""
import uuid
from dataclasses import dataclass
from langchain_core.messages import SystemMessage
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.checkpoint.memory import InMemorySaver
from config import get_llm

llm = get_llm()

# [slide]
from langgraph.store.memory import InMemoryStore
from langgraph.runtime import Runtime

@dataclass
class Contesto:
    utente_id: str

def assistente(state: MessagesState, runtime: Runtime[Contesto]) -> dict:
    ns = (runtime.context.utente_id, "preferenze")          # namespace = "cartella"
    ultimo = state["messages"][-1].content
    if "preferisco" in ultimo.lower():                        # salva un ricordo
        runtime.store.put(ns, str(uuid.uuid4()), {"testo": ultimo})
    ricordi = runtime.store.search(ns, limit=5)               # legge i ricordi
    note = "\n".join(r.value["testo"] for r in ricordi) or "nessuna"
    sistema = SystemMessage(f"Preferenze note dell'utente:\n{note}")
    return {"messages": [llm.invoke([sistema] + state["messages"])]}

builder = StateGraph(MessagesState, context_schema=Contesto)
builder.add_node("assistente", assistente)
builder.add_edge(START, "assistente")
builder.add_edge("assistente", END)
graph = builder.compile(checkpointer=InMemorySaver(), store=InMemoryStore())
# [/slide]

# [slide:uso]
ctx = Contesto(utente_id="ada")
graph.invoke({"messages": [("user", "Preferisco risposte brevi e in elenco")]},
             {"configurable": {"thread_id": "lunedi"}}, context=ctx)
# Nuovo thread (nuova conversazione), stesso utente → la preferenza è ancora lì
out = graph.invoke({"messages": [("user", "Consigliami 3 libri di Python")]},
                   {"configurable": {"thread_id": "martedi"}}, context=ctx)
print(out["messages"][-1].content)
# [/slide:uso]
