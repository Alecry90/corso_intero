"""Multi-agente 'router': un nodo classifica e passa il controllo all'agente giusto."""
from typing import Literal
from pydantic import BaseModel
from langchain_core.messages import SystemMessage
from langchain_core.tools import tool
from langchain.agents import create_agent
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from config import get_llm

@tool
def cerca_policy(domanda: str) -> str:
    """Cerca nelle policy aziendali (orari, penali, rimborsi)."""
    return "Disdetta gratuita fino a 24 ore prima; poi penale del 30%."

@tool
def prenota(data: str, persone: int) -> str:
    """Registra una prenotazione."""
    return f"Prenotazione confermata per {persone} persone il {data}"

agente_policy = create_agent(get_llm(), tools=[cerca_policy],
                             system_prompt="Rispondi SOLO usando cerca_policy.")
agente_booking = create_agent(get_llm(), tools=[prenota],
                              system_prompt="Gestisci prenotazioni. Chiedi i dati mancanti.")

# [slide]
class Rotta(BaseModel):
    agente: Literal["policy", "booking", "generico"]

router_llm = get_llm().with_structured_output(Rotta)
PROMPT = ("Classifica l'ultima richiesta: 'policy' per regole/penali/costi, "
          "'booking' per prenotare o disdire, 'generico' per il resto.")

def router(state: MessagesState) -> Command[Literal["policy", "booking", "generico"]]:
    rotta = router_llm.invoke([SystemMessage(PROMPT)] + state["messages"][-3:])
    return Command(goto=rotta.agente)          # handoff: passa il controllo

def generico(state: MessagesState) -> dict:
    return {"messages": [("ai", "Posso aiutarti con policy e prenotazioni.")]}

builder = StateGraph(MessagesState)
builder.add_node("router", router)
builder.add_node("policy", agente_policy)       # un agente compilato è un nodo!
builder.add_node("booking", agente_booking)
builder.add_node("generico", generico)
builder.add_edge(START, "router")
for n in ("policy", "booking", "generico"):
    builder.add_edge(n, END)                    # un giro per turno di conversazione
graph = builder.compile(checkpointer=InMemorySaver())
# [/slide]

if __name__ == "__main__":
    cfg = {"configurable": {"thread_id": "1"}}
    out = graph.invoke({"messages": [("user", "Quanto costa disdire?")]}, cfg)
    print(out["messages"][-1].content)
