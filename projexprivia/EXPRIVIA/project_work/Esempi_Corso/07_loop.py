"""Loop: un arco condizionale che torna indietro."""
# [slide]
import random
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    numeri: list[int]
    contatore: int

def genera(state: State) -> dict:
    nuovo = random.randint(1, 10)
    return {"numeri": state["numeri"] + [nuovo], #aggiunge il nuovo numero alla lista dei numeri
            "contatore": state["contatore"] + 1}

def continua(state: State) -> str:
    return "ancora" if state["contatore"] < 5 else "basta" #quindi li genera finché il contatore è minore di 5, altrimenti termina

builder = StateGraph(State)
builder.add_node("genera", genera)
builder.add_edge(START, "genera")
builder.add_conditional_edges("genera", continua, {"ancora": "genera", "basta": END})
graph = builder.compile()

# recursion_limit: numero massimo di "passi" (super-step) prima di un errore
out = graph.invoke({"numeri": [], "contatore": 0}, {"recursion_limit": 20}) # recursion_limit serve per evitare loop infiniti, se il contatore non fosse limitato a 5, il grafo andrebbe in loop infinito
print(out)        # {'numeri': [3, 9, 1, 7, 4], 'contatore': 5}
# [/slide]
