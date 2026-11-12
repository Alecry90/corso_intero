"""Stesso agente con i componenti prebuilt ToolNode e tools_condition."""
from langchain_core.messages import SystemMessage
from importlib import import_module
_t = import_module("11_tools")
calcola_iva, data_odierna = _t.calcola_iva, _t.data_odierna

# [slide]
from langgraph.graph import StateGraph, MessagesState, START
from langgraph.prebuilt import ToolNode, tools_condition
from config import get_llm

tools = [calcola_iva, data_odierna]
llm_tools = get_llm().bind_tools(tools)
SISTEMA = SystemMessage("Sei un contabile. Per i calcoli usa SEMPRE i tool.")

def agente(state: MessagesState) -> dict:
    risposta = llm_tools.invoke([SISTEMA] + state["messages"])
    return {"messages": [risposta]}

builder = StateGraph(MessagesState)
builder.add_node("agente", agente)
builder.add_node("tools", ToolNode(tools))     # esegue i tool
builder.add_edge(START, "agente")
builder.add_conditional_edges("agente", tools_condition)
#                       ↑ va a "tools" se ci sono tool_calls, altrimenti END
builder.add_edge("tools", "agente")
graph = builder.compile()
# [/slide]

# [slide:stream]
domanda = {"messages": [("user", "Che giorno è? IVA su 80 euro?")]}
# un dict per ogni nodo eseguito
for step in graph.stream(domanda, stream_mode="updates"):
    for nodo, update in step.items():
        print(f"--- {nodo} ---")
        update["messages"][-1].pretty_print()
# [/slide:stream]
