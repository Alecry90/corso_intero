"""Prima chiamata a un modello locale tramite LangChain + Ollama."""
# [slide]
from langchain_core.messages import SystemMessage, HumanMessage
from config import get_llm

llm = get_llm()
risposta = llm.invoke([
    SystemMessage("Sei un tutor di Python. Rispondi in massimo 3 righe."),
    HumanMessage("Che differenza c'è tra una lista e una tupla?"),
])
print(type(risposta).__name__)    # AIMessage
print(risposta.content)           # il testo generato
print(risposta.usage_metadata)    # token in input/output
# [/slide]
