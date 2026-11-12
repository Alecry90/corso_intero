"""Retry, cache, limiti: rendere robusto un grafo."""
import random
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    citta: str
    meteo: str

def chiama_api_meteo(state: State) -> dict:
    if random.random() < 0.3:
        raise ConnectionError("servizio non raggiungibile")    # errore TRANSITORIO
    return {"meteo": f"Sole a {state['citta']}"}

# [slide]
from langgraph.types import RetryPolicy, CachePolicy
from langgraph.cache.memory import InMemoryCache

builder = StateGraph(State)
builder.add_node(
    "meteo", chiama_api_meteo,
    retry_policy=RetryPolicy(max_attempts=5, initial_interval=0.5,
                             retry_on=ConnectionError),  # solo transitori
    cache_policy=CachePolicy(ttl=600),    # stesso input → cache 10 min
)
builder.add_edge(START, "meteo")
builder.add_edge("meteo", END)
graph = builder.compile(cache=InMemoryCache())

# limite esplicito ai cicli
print(graph.invoke({"citta": "Bari"}, {"recursion_limit": 25}))
# [/slide]
