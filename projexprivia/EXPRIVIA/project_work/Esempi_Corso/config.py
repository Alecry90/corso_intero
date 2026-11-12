# [slide]
# config.py – UNICO punto in cui si sceglie il modello
from langchain_ollama import ChatOllama, OllamaEmbeddings

MODEL = "beam:cloud"       # chat in Ollama Cloud, tag "tools"
EMBED_MODEL = "bge-m3"     # embedding locale per il RAG
BASE_URL = "http://localhost:11434"


def get_llm(temperature: float = 0) -> ChatOllama:
    if not MODEL:
        raise RuntimeError("Imposta la variabile OLLAMA_MODEL")
    return ChatOllama(model=MODEL, temperature=temperature,
                      base_url=BASE_URL)


def get_embeddings() -> OllamaEmbeddings:
    return OllamaEmbeddings(model=EMBED_MODEL, base_url=BASE_URL)
# [/slide]
