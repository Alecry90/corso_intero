"""Esercizio 4: ricerca binaria con un ciclo LangGraph."""

import random
from typing import TypedDict

from langgraph.graph import END, START, StateGraph


MIN_NUMERO = 1
MAX_NUMERO = 100
MAX_TENTATIVI = 7
RECURSION_LIMIT = 2 * MAX_TENTATIVI + 5 #significa che il grafo può fare
#al massimo 19 passi prima di un errore, quindi se il numero non viene indovinato entro 7 tentativi,
#il grafo termina con un errore. il 2 serve per considerare i passi di setup e suggerisci,
#il +5 serve per considerare eventuali passi extra dovuti a errori o condizioni particolari.

class State(TypedDict):
    segreto: int
    minimo: int
    massimo: int
    ipotesi: list[int]
    tentativi: int
    suggerimento: str
    esito: str


def setup(state: State) -> dict:
    return {
        "segreto": random.randint(MIN_NUMERO, MAX_NUMERO),
        "minimo": MIN_NUMERO,
        "massimo": MAX_NUMERO,
        "ipotesi": [],
        "tentativi": 0,
        "suggerimento": "",
        "esito": "continua",
    }


def indovina(state: State) -> dict:
    nuova_ipotesi = (state["minimo"] + state["massimo"]) // 2 #il // serve per fare la divisione intera,
    #quindi arrotonda per difetto
    return {
        "ipotesi": state["ipotesi"] + [nuova_ipotesi],
        "tentativi": state["tentativi"] + 1,
    }


def suggerisci(state: State) -> dict:
    ultima_ipotesi = state["ipotesi"][-1]

    if ultima_ipotesi == state["segreto"]:
        return {
            "suggerimento": "indovinato",
            "esito": f"VINTO in {state['tentativi']} tentativi",
        }

    if state["tentativi"] >= MAX_TENTATIVI:
        return {
            "suggerimento": "tentativi esauriti",
            "esito": f"SCONFITTA: il numero era {state['segreto']}",
        }

    if ultima_ipotesi < state["segreto"]:
        return {
            "minimo": ultima_ipotesi + 1,
            "suggerimento": "più alto",
            "esito": "continua",
        }

    return {
        "massimo": ultima_ipotesi - 1,
        "suggerimento": "più basso",
        "esito": "continua",
    }


def continua_o_termina(state: State) -> str:
    return "continua" if state["esito"] == "continua" else "fine"


builder = StateGraph(State)
builder.add_node("setup", setup)
builder.add_node("indovina", indovina)
builder.add_node("suggerisci", suggerisci)

builder.add_edge(START, "setup")
builder.add_edge("setup", "indovina")
builder.add_edge("indovina", "suggerisci")
builder.add_conditional_edges(
    "suggerisci",
    continua_o_termina,
    {"continua": "indovina", "fine": END},
)

graph = builder.compile()


if __name__ == "__main__":
    risultato = graph.invoke({}, {"recursion_limit": RECURSION_LIMIT}) #qui il recursion_limit
    #serve per evitare loop infiniti, se il numero non viene indovinato entro 7 tentativi, 
    #il grafo termina con un errore

    assert risultato["esito"].startswith("VINTO")
    assert risultato["ipotesi"][-1] == risultato["segreto"]
    assert risultato["tentativi"] <= MAX_TENTATIVI

    print("Numero segreto:", risultato["segreto"])
    print("Ipotesi:", risultato["ipotesi"])
    print("Tentativi:", risultato["tentativi"])
    print("Esito:", risultato["esito"])
    print("\nDiagramma Mermaid:")
    print(graph.get_graph().draw_mermaid())
