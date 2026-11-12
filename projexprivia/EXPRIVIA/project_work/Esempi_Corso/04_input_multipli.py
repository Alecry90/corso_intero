"""State con più campi e tipi diversi."""
# [slide]
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    nome: str
    valori: list[int]
    operazione: str          # "+" oppure "*"
    risultato: str

def elabora(state: State) -> dict:
    if state["operazione"] == "+":
        totale = sum(state["valori"])
    else:
        totale = 1
        for v in state["valori"]:
            totale *= v
    return {"risultato": f"Ciao {state['nome']}, risultato: {totale}"}

builder = StateGraph(State)
builder.add_node("elabora", elabora)
builder.add_edge(START, "elabora")
builder.add_edge("elabora", END)
graph = builder.compile()

out = graph.invoke({"nome": "Ada", "valori": [1, 2, 3, 4],
                    "operazione": "+"})
print(out["risultato"])     # Ciao Ada, risultato: 10
# [/slide]
