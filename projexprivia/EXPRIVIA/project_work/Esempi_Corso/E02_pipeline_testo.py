"""Esercizio 2: pipeline sequenziale per analizzare un testo."""

import operator
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph


class State(TypedDict):
    testo: str
    numero_parole: int
    caratteri_senza_spazi: int
    report: str
    log: Annotated[list[str], operator.add]


def normalizza(state: State) -> dict:
    testo_normalizzato = " ".join(state["testo"].split()).lower()
    return {
        "testo": testo_normalizzato,
        "log": ["normalizza"],
    }


def conta(state: State) -> dict:
    numero_parole = len(state["testo"].split())
    caratteri_senza_spazi = sum(
        not carattere.isspace() for carattere in state["testo"] #se non è uno spazio, conta il carattere
    )
    return {
        "numero_parole": numero_parole,
        "caratteri_senza_spazi": caratteri_senza_spazi,
        "log": ["conta"],
    }


def crea_report(state: State) -> dict:
    report = (
        f"Testo normalizzato: {state['testo']}\n"
        f"Numero di parole: {state['numero_parole']}\n"
        f"Caratteri senza spazi: {state['caratteri_senza_spazi']}"
    )
    return {
        "report": report,
        "log": ["crea_report"],
    }


builder = StateGraph(State)
builder.add_sequence([normalizza, conta, crea_report])
builder.add_edge(START, "normalizza")
builder.add_edge("crea_report", END)
graph = builder.compile()


TESTI = [
    "  Ciao   MONDO  ",
    "Python   rende il codice leggibile",
    "  LangGraph   gestisce   grafi e stato condiviso. ",
]


if __name__ == "__main__":
    for indice, testo in enumerate(TESTI, start=1):
        risultato = graph.invoke({"testo": testo, "log": []})

        assert risultato["log"] == ["normalizza", "conta", "crea_report"]

        print(f"--- Testo {indice} ---")
        print(risultato["report"])
        print("Log:", risultato["log"])
