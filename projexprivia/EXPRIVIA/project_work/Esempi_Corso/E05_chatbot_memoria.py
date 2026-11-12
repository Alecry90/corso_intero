"""Chatbot con memoria di conversazione (checkpointer + thread_id)."""
from langchain_core.messages import SystemMessage, trim_messages
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.checkpoint.memory import InMemorySaver
from config import get_llm
import uuid #serve per generare un id univoco per ogni conversazione, in modo da poter avere più conversazioni indipendenti tra loro


llm = get_llm()

class State(MessagesState):
    personalita: str



def chatbot(state: State) -> dict:
    recenti = trim_messages(
        state["messages"],
        max_tokens=10,
        token_counter=len,
        strategy="last",
        start_on="human",
    )

    sistema = SystemMessage(
        f"Sei un assistente con questa personalità: {state['personalita']}"
    )

    risposta = llm.invoke([sistema] + recenti)
    return {"messages": [risposta]}



builder = StateGraph(State)
builder.add_node("chatbot", chatbot)
builder.add_edge(START, "chatbot")
builder.add_edge("chatbot", END)

graph = builder.compile(checkpointer=InMemorySaver())

def nuova_config() -> dict: #serve per creare una nuova configurazione per ogni conversazione, in modo da poter avere più conversazioni indipendenti tra loro
    return {
        "configurable": {
            "thread_id": str(uuid.uuid4())
        }
    }


def stampa_storia(config: dict) -> None:
    snapshot = graph.get_state(config)
    messaggi = snapshot.values.get("messages", [])

    if not messaggi:
        print("La conversazione è vuota.")
        return

    for messaggio in messaggi:
        messaggio.pretty_print()


def chat() -> None:
    personalita = input(
        "Scegli la personalità del chatbot: "
    )

    config = nuova_config()

    print("Comandi disponibili: /nuova, /storia, /esci")

    while True:
        testo = input("Tu: ").strip()

        if not testo:
            continue

        if testo == "/esci":
            break

        if testo == "/nuova":
            config = nuova_config()
            print("Nuova conversazione iniziata.")
            continue

        if testo == "/storia":
            stampa_storia(config)
            continue

        risultato = graph.invoke(
            {
                "messages": [("user", testo)],
                "personalita": personalita,
            },
            config,
        )

        print("AI:", risultato["messages"][-1].content)


if __name__ == "__main__":
    chat()


