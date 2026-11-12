"""Persistenza su file (SqliteSaver) e time travel."""
import os
from langgraph.graph import StateGraph, MessagesState, START, END
from config import get_llm

llm = get_llm()

def chatbot(state: MessagesState) -> dict:
    return {"messages": [llm.invoke(state["messages"])]}

builder = StateGraph(MessagesState)
builder.add_node("chatbot", chatbot)
builder.add_edge(START, "chatbot")
builder.add_edge("chatbot", END)

# [slide]
import sqlite3
# pip install langgraph-checkpoint-sqlite
from langgraph.checkpoint.sqlite import SqliteSaver

conn = sqlite3.connect("checkpoints.db", check_same_thread=False)
memoria = SqliteSaver(conn)                 # crea le tabelle al primo uso
graph = builder.compile(checkpointer=memoria)

config = {"configurable": {"thread_id": "cliente-42"}}
graph.invoke({"messages": [("user", "Mi chiamo Ada")]}, config)
graph.invoke({"messages": [("user", "Ricordi il mio nome?")]}, config)
# chiudendo e rilanciando lo script, con lo stesso thread_id la conversazione RIPRENDE
# [/slide]

# [slide:timetravel]
storia = list(graph.get_state_history(config))        # dal più recente al più vecchio
for snap in storia:
    cid = snap.config["configurable"]["checkpoint_id"]
    print(cid[:8], "next:", snap.next, "msg:", len(snap.values.get("messages", [])))

# 1) REPLAY: riesegui da un checkpoint passato (i passi successivi vengono rifatti)
passato = next(s for s in storia if s.next == ("chatbot",))
graph.invoke(None, passato.config)

# 2) FORK: modifica lo state di un checkpoint e prosegui su un nuovo ramo
modifica = {"messages": [("user", "Rispondi in inglese")]}
nuovo_cfg = graph.update_state(passato.config, modifica)
graph.invoke(None, nuovo_cfg)
# [/slide:timetravel]
conn.close()
