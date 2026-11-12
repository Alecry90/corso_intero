# Esame Ferrara Alessandro — AI

I tre notebook sono già eseguiti e contengono gli output salvati.

## File

- `Esercizi_parte1.ipynb`: domande teoriche, embeddings, rete ricorrente e T5.
- `Esercizi_parte2.ipynb`: confronto delle metriche, robustezza e perplessità.
- `esercizi_parte3.ipynb`: RAG, confronto quantizzato e agente con tool.
- `texts/`: testi necessari a PARTE 2.
- `risultati_parte2/` e `risultati_parte3/`: dati, metriche e risultati dei test.
- `confronto_modelli.txt`: report prodotto dall'agente sui benchmark forniti nella traccia.
- `requirements.txt`: dipendenze; `requirements-verifica.txt`: versioni usate per la verifica.

## Riesecuzione

Ambiente verificato: Python 3.11. Aprire i notebook dalla radice di questa cartella
ed eseguire le celle in ordine. Per preparare un ambiente Windows:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-verifica.txt
.\.venv\Scripts\python.exe -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab')"
.\.venv\Scripts\python.exe -m jupyter notebook
```

PARTE 3 richiede Ollama in esecuzione su `http://localhost:11434` e i modelli:

```powershell
ollama pull llama3.2
ollama pull llama3.2:3b-instruct-q2_K
ollama pull qwen2.5
```

Se necessario, avviare il servizio con `ollama serve`.
Gli altri modelli vengono caricati da Gensim e Hugging Face al primo utilizzo.
Gli output già salvati sono consultabili senza rieseguire i modelli.
