from langchain_core.messages import HumanMessage, SystemMessage

from config import get_llm


llm = get_llm()
risposta = llm.invoke(
    [
        SystemMessage("Sei un tutor di Python. Rispondi in massimo 3 righe."),
        HumanMessage("Che differenza c'è tra una lista e una tupla?"),
    ]
)

print(type(risposta).__name__)
print(risposta.content)
print(risposta.usage_metadata)
