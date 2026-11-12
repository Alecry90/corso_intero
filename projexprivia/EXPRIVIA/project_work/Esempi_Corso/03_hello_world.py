"""Il primo grafo: un solo nodo, nessun LLM."""
# [slide]
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):          # 1) lo STATE: la memoria condivisa
    nome: str
    messaggio: str

def saluta(state: State) -> dict:     # 2) un NODO: legge lo state…
    # …e ritorna un update parziale
    return {"messaggio": f"Ciao {state['nome']}, benvenuto in LangGraph!"}

builder = StateGraph(State)           # 3) costruzione del grafo
builder.add_node("saluta", saluta)
builder.add_edge(START, "saluta")     # 4) EDGES: da dove si parte…
builder.add_edge("saluta", END)       # …e dove si finisce
graph = builder.compile()             # 5) compilazione (obbligatoria)

risultato = graph.invoke({"nome": "Nico"})
print(risultato)   # {'nome': 'Nico', 'messaggio': 'Ciao Nico, benvenuto in LangGraph!'}
# [/slide]

# [slide:visualizza]
# Rappresentazione testuale Mermaid (incollabile su un editor Mermaid / Markdown)
print(graph.get_graph().draw_mermaid())

# ASCII art direttamente nel terminale (pip install grandalf)
print(graph.get_graph().draw_ascii())

# In un notebook Jupyter:
# from IPython.display import Image, display
# display(Image(graph.get_graph().draw_mermaid_png()))
# [/slide:visualizza]
