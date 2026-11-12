"""Esercizio 3: doppia calcolatrice con due router consecutivi."""

from collections.abc import Callable
from typing import TypedDict

from langgraph.graph import END, START, StateGraph


Operazione = Callable[[float, float], float]

OPERAZIONI: dict[str, Operazione] = {
    "+": lambda x, y: x + y,
    "-": lambda x, y: x - y,
    "*": lambda x, y: x * y,
    "/": lambda x, y: x / y,
}


class State(TypedDict):
    a: float
    b: float
    op1: str
    c: float
    d: float
    op2: str
    risultato1: float
    risultato2: float
    errore: str


def motivo_errore(x: float, y: float, operatore: str, numero: int) -> str:
    if operatore not in OPERAZIONI:
        return f"Operatore {numero} sconosciuto: {operatore}" #numero indica se è il primo o il secondo operatore
    if operatore == "/" and y == 0:
        return f"Divisione per zero nell'operazione {numero}"
    return ""


def instrada_primo(state: State) -> str:
    errore = motivo_errore(state["a"], state["b"], state["op1"], 1)
    return "errore" if errore else "calcola"


def calcola_primo(state: State) -> dict:
    funzione = OPERAZIONI[state["op1"]]
    return {"risultato1": funzione(state["a"], state["b"])}


def instrada_secondo(state: State) -> str:
    errore = motivo_errore(state["c"], state["d"], state["op2"], 2)
    return "errore" if errore else "calcola"


def calcola_secondo(state: State) -> dict:
    funzione = OPERAZIONI[state["op2"]]
    return {"risultato2": funzione(state["c"], state["d"])}


def gestisci_errore(state: State) -> dict:
    errore_primo = motivo_errore(state["a"], state["b"], state["op1"], 1)
    errore_secondo = motivo_errore(state["c"], state["d"], state["op2"], 2)
    return {"errore": errore_primo or errore_secondo}


builder = StateGraph(State)
builder.add_node("calcola_primo", calcola_primo)
builder.add_node("calcola_secondo", calcola_secondo)
builder.add_node("errore", gestisci_errore)

builder.add_conditional_edges(
    START,
    instrada_primo,
    {"calcola": "calcola_primo", "errore": "errore"},
)
builder.add_conditional_edges(
    "calcola_primo",
    instrada_secondo,
    {"calcola": "calcola_secondo", "errore": "errore"},
)
builder.add_edge("calcola_secondo", END)
builder.add_edge("errore", END)

graph = builder.compile()


CASI_DI_PROVA = [
    {"a": 10, "b": 4, "op1": "+", "c": 6, "d": 3, "op2": "*"},
    {"a": 10, "b": 4, "op1": "-", "c": 8, "d": 2, "op2": "/"},
    {"a": 10, "b": 0, "op1": "/", "c": 2, "d": 3, "op2": "+"},
    {"a": 10, "b": 4, "op1": "%", "c": 2, "d": 3, "op2": "+"},
    {"a": 10, "b": 4, "op1": "+", "c": 8, "d": 0, "op2": "/"},
    {"a": 10, "b": 4, "op1": "+", "c": 8, "d": 2, "op2": "%"},
]


if __name__ == "__main__":
    for indice, caso in enumerate(CASI_DI_PROVA, start=1):
        risultato = graph.invoke(caso)
        print(f"Caso {indice}:", risultato)

    assert graph.invoke(CASI_DI_PROVA[0])["risultato1"] == 14
    assert graph.invoke(CASI_DI_PROVA[0])["risultato2"] == 18
    assert "Divisione per zero" in graph.invoke(CASI_DI_PROVA[2])["errore"]
    assert "sconosciuto" in graph.invoke(CASI_DI_PROVA[3])["errore"]
    assert "Divisione per zero" in graph.invoke(CASI_DI_PROVA[4])["errore"]
    assert "sconosciuto" in graph.invoke(CASI_DI_PROVA[5])["errore"]

    print("\nDiagramma Mermaid:")
    print(graph.get_graph().draw_mermaid())
