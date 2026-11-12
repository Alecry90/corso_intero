"""Evaluator-optimizer: genera, valuta, migliora (con limite di tentativi)."""
from typing import TypedDict
from pydantic import BaseModel
from langgraph.graph import StateGraph, START, END
from config import get_llm

llm = get_llm(temperature=0.7)

class State(TypedDict):
    prodotto: str
    bozza: str
    feedback: str
    approvato: bool
    tentativi: int

# [slide]
class Valutazione(BaseModel):
    approvato: bool
    feedback: str

valutatore = get_llm().with_structured_output(Valutazione)

def genera(state: State) -> dict:
    prompt = f"Scrivi uno slogan per {state['prodotto']}. {state.get('feedback', '')}"
    return {"bozza": llm.invoke(prompt).content,
            "tentativi": state.get("tentativi", 0) + 1}

def valuta(state: State) -> dict:
    v = valutatore.invoke(f"Lo slogan '{state['bozza']}' è breve (<10 parole), "
                          "chiaro e in italiano? Se no, spiega come migliorarlo.")
    return {"approvato": v.approvato, "feedback": v.feedback}

def prossimo(state: State) -> str:
    if state["approvato"] or state["tentativi"] >= 3:    # SEMPRE un'uscita dal ciclo
        return END
    return "genera"

builder = StateGraph(State)
builder.add_node("genera", genera)
builder.add_node("valuta", valuta)
builder.add_edge(START, "genera")
builder.add_edge("genera", "valuta")
builder.add_conditional_edges("valuta", prossimo, ["genera", END])
graph = builder.compile()
# [/slide]
print(graph.invoke({"prodotto": "una borraccia smart"}))
