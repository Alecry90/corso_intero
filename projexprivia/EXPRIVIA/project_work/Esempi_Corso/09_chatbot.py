"""Primo chatbot: un nodo che chiama l'LLM con MessagesState."""
# [slide]
from langgraph.graph import StateGraph, MessagesState, START, END
from config import get_llm

llm = get_llm()

def chatbot(state: MessagesState) -> dict:
    risposta = llm.invoke(state["messages"])     # passa TUTTA la cronologia
    return {"messages": [risposta]}              # add_messages la accoda

builder = StateGraph(MessagesState)
builder.add_node("chatbot", chatbot)
builder.add_edge(START, "chatbot")
builder.add_edge("chatbot", END)
graph = builder.compile()

out = graph.invoke({"messages": [("user", "Ciao, mi chiamo Nico")]})
print(out["messages"][-1].content)

out = graph.invoke({"messages": [("user", "Come mi chiamo?")]})
print(out["messages"][-1].content)     # NON lo sa: ogni invoke riparte da zero!
# [/slide]
