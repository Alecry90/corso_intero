"""Chatbot con memoria di conversazione (checkpointer + thread_id)."""
from langchain_core.messages import SystemMessage, trim_messages
from langgraph.graph import StateGraph, MessagesState, START, END
from config import get_llm

llm = get_llm()

# [slide:trim]
def chatbot(state: MessagesState) -> dict:
    recenti = trim_messages(          # resta nel contesto del modello
        state["messages"],
        max_tokens=10, token_counter=len,  # = ultimi 10 messaggi
        strategy="last", start_on="human", #strategy="last" = prende gli ultimi messaggi, 
        #start_on="human" = inizia a contare dal primo messaggio umano
    )
    sistema = SystemMessage("Sei un assistente cordiale.")
    return {"messages": [llm.invoke([sistema] + recenti)]}
# [/slide:trim]

builder = StateGraph(MessagesState)
builder.add_node("chatbot", chatbot)
builder.add_edge(START, "chatbot")
builder.add_edge("chatbot", END)

# [slide]
from langgraph.checkpoint.memory import InMemorySaver

graph = builder.compile(checkpointer=InMemorySaver())   # salva lo state a ogni passo
config = {"configurable": {"thread_id": "nico-1"}}      # una "conversazione" sarà indipendente
#dalle altre, thread_id = "nico-1" = conversazione di nico

def chat(): #serve per fare la chat con il chatbot, prende l'input dell'utente e lo passa al grafo, #poi stampa la risposta del chatbot
    while True:
        testo = input("Tu: ")
        if testo.lower() in ("exit", "quit"): #se l'utente scrive exit o quit, esce dal loop
            break
        out = graph.invoke({"messages": [("user", testo)]}, config)
        print("AI:", out["messages"][-1].content)
# [/slide]

# [slide:stato]
def ispeziona(): #serve a ispezionare lo stato del grafo, quindi vedere i messaggi della conversazione e il prossimo nodo in attesa
    snap = graph.get_state(config)       # ultimo checkpoint
    print(len(snap.values["messages"]))  # messaggi del thread
    print(snap.next)                     # () = nessun nodo in attesa
    for m in snap.values["messages"]:
        m.pretty_print() #stampa i messaggi in modo leggibile, con il ruolo e il contenuto

# thread diverso = conversazione nuova e indipendente
altro = {"configurable": {"thread_id": "ospite-7"}}
# [/slide:stato]

if __name__ == "__main__":
    chat()
    ispeziona()
