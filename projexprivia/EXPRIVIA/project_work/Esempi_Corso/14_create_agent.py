"""create_agent (LangChain v1): l'agente ReAct pronto all'uso, costruito su LangGraph."""
from importlib import import_module
_t = import_module("11_tools")
calcola_iva, data_odierna = _t.calcola_iva, _t.data_odierna

# [slide]
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver
from config import get_llm

agent = create_agent(
    model=get_llm(),
    tools=[calcola_iva, data_odierna],
    system_prompt="Sei un contabile. Per i calcoli usa SEMPRE i tool.",
    checkpointer=InMemorySaver(),
)
config = {"configurable": {"thread_id": "1"}}
domanda = {"messages": [("user", "IVA su 250 euro al 10%?")]}
out = agent.invoke(domanda, config)
print(out["messages"][-1].content)

# È un grafo compilato: stream, get_state, interrupt…
print(agent.get_graph().draw_mermaid())
# [/slide]
