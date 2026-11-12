"""Il modello NON esegue i tool: propone una chiamata strutturata."""
# [slide]
from langchain_core.tools import tool
from config import get_llm

@tool
def moltiplica(a: int, b: int) -> int:
    """Moltiplica due numeri interi."""
    return a * b

llm_con_tools = get_llm().bind_tools([moltiplica])
msg = llm_con_tools.invoke("Quanto fa 12 per 7?")
print(msg.tool_calls)
# [{'name': 'moltiplica', 'args': {'a': 12, 'b': 7}, 'id': '...'}]

# Siamo NOI (o il grafo) a eseguire il tool
for call in msg.tool_calls:
    print(moltiplica.invoke(call["args"]))      # 84
# [/slide]
