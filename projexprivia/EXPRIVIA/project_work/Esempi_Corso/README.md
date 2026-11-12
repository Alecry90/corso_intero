# Esempi del corso LangGraph

Ogni file `NN_*.py` corrisponde a una o più slide del corso (gli estratti sulle slide sono presi da qui).

## Setup
```bash
python -m venv .venv
.venv\Scripts\activate            # Windows  (Linux/Mac: source .venv/bin/activate)
pip install -r requirements.txt
ollama pull <modello-chat>        # un modello con tag "tools" su ollama.com
ollama pull <modello-embedding>   # solo per 28_rag_agentico.py
set OLLAMA_MODEL=<modello-chat>   # Linux/Mac: export OLLAMA_MODEL=...
set OLLAMA_EMBED_MODEL=<modello-embedding>
python 03_hello_world.py
```
Tutti i file importano il modello da `config.py`: è l'unico punto da modificare.

## Mappa
| File | Argomento |
|---|---|
| 01–02 | chiamata a un LLM, tool calling |
| 03–08 | state, nodi, edges, router, loop, reducer |
| 09–10 | chatbot e memoria (checkpointer, thread) |
| 11–14 | tool, agente ReAct da zero, prebuilt, create_agent |
| 15–17 | output strutturato, routing, parallelo, evaluator-optimizer |
| 18–21 | schemi di state, runtime context, Command, Send, subgraph |
| 22–25 | persistenza SQLite e time travel, human-in-the-loop, Store, streaming |
| 26–27 | multi-agente (supervisor, router) |
| 28–29 | RAG agentico su PDF, agente su SQLite |
| 30 | retry, cache, recursion limit |
