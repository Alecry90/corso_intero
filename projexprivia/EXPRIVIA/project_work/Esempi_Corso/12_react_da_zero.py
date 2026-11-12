"""Agente ReAct costruito a mano: LLM <-> tools in loop."""
from langchain_core.messages import SystemMessage, ToolMessage
from langgraph.graph import StateGraph, MessagesState, START, END
from config import get_llm
from importlib import import_module
_t = import_module("11_tools")
calcola_iva, data_odierna = _t.calcola_iva, _t.data_odierna

# [slide]
tools = [calcola_iva, data_odierna]
tools_by_name = {t.name: t for t in tools}
llm_tools = get_llm().bind_tools(tools)
SISTEMA = SystemMessage("Sei un contabile. Per i calcoli usa SEMPRE i tool.")

def agente(state: MessagesState) -> dict:          # REASON
    risposta = llm_tools.invoke([SISTEMA] + state["messages"])
    return {"messages": [risposta]}

def esegui_tools(state: MessagesState) -> dict:    # ACT
    risultati = []
    for call in state["messages"][-1].tool_calls:
        output = tools_by_name[call["name"]].invoke(call["args"])
        risultati.append(ToolMessage(content=str(output),
                                     tool_call_id=call["id"]))
    return {"messages": risultati}                  # OBSERVE

def deve_continuare(state: MessagesState) -> str:
    return "tools" if state["messages"][-1].tool_calls else END
# [/slide]

# [slide:grafo]
builder = StateGraph(MessagesState)
builder.add_node("agente", agente)
builder.add_node("tools", esegui_tools)
builder.add_edge(START, "agente")
builder.add_conditional_edges("agente", deve_continuare, ["tools", END])
builder.add_edge("tools", "agente")     # il CICLO: si torna all'LLM
graph = builder.compile()

domanda = "Quanta IVA pago su 250 euro al 10%?"
out = graph.invoke({"messages": [("user", domanda)]})
for m in out["messages"]:
    m.pretty_print()   # Human → AI(tool_call) → Tool → AI
# [/slide:grafo]
