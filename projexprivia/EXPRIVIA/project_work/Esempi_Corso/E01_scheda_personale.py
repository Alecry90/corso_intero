"""State con più campi e tipi diversi."""
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    nome: str
    ruolo: str
    competenze: list[str]          # Lista di competenze
    scheda: str

def componi_scheda(state: State) -> dict:
    numero_competenze = len(state["competenze"])
    competenze_str = ", ".join(state["competenze"])
    scheda = f"{state['nome']} - {state['ruolo']}\nCompetenze ({numero_competenze}): {competenze_str}"
    return {"scheda": scheda}


test_output = componi_scheda({
    "nome": "Ada",
    "ruolo": "Data Analyst",
    "competenze": ["Python", "SQL", "LangGraph"],
    "scheda": "",
})

assert test_output == {
    "scheda": "Ada - Data Analyst\nCompetenze (3): Python, SQL, LangGraph"
}


builder = StateGraph(State)

builder.add_node("componi_scheda", componi_scheda)

builder.add_edge(START, "componi_scheda")
builder.add_edge("componi_scheda", END)

graph = builder.compile()

risultato = graph.invoke({
    "nome": "Ada",
    "ruolo": "Data Analyst",
    "competenze": ["Python", "SQL", "LangGraph"],
})

print(risultato)
print(graph.get_graph().draw_mermaid())
