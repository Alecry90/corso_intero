"""Map-reduce con Send: un worker per ogni elemento, in parallelo."""
import operator
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from config import get_llm

llm = get_llm()

# [slide]
from langgraph.types import Send

class State(TypedDict):
    recensioni: list[str]
    giudizi: Annotated[list[str], operator.add]     # raccoglie i risultati dei worker
    report: str

class RecensioneState(TypedDict):                    # state "privato" del worker
    testo: str

def distribuisci(state: State) -> list[Send]:        # MAP: N invii dinamici
    return [Send("analizza", {"testo": r}) for r in state["recensioni"]]

def analizza(state: RecensioneState) -> dict:
    s = llm.invoke(f"Rispondi solo POSITIVA o NEGATIVA: {state['testo']}").content
    return {"giudizi": [f"{s.strip()} | {state['testo'][:30]}"]}

def report(state: State) -> dict:                    # REDUCE
    pos = sum("POSITIVA" in g.upper() for g in state["giudizi"])
    return {"report": f"{pos}/{len(state['giudizi'])} recensioni positive"}

builder = StateGraph(State)
builder.add_node("analizza", analizza)
builder.add_node("report", report)
builder.add_conditional_edges(START, distribuisci, ["analizza"])
builder.add_edge("analizza", "report")
builder.add_edge("report", END)
graph = builder.compile()
# [/slide]
print(graph.invoke({"recensioni": ["Ottimo servizio", "Pessimo, mai più", "Tutto perfetto"]})["report"])
