"""Agente su SQLite: tool deterministici + query in sola lettura."""
import json
import sqlite3
from pathlib import Path
from langchain_core.tools import tool
from langchain.agents import create_agent
from config import get_llm

DB = str(Path(__file__).parent / "data" / "negozio.db")

def crea_db():
    with sqlite3.connect(DB) as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS prodotti(
            id INTEGER PRIMARY KEY, nome TEXT UNIQUE NOT NULL,
            prezzo REAL NOT NULL, giacenza INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS ordini(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prodotto_id INTEGER NOT NULL REFERENCES prodotti(id),
            quantita INTEGER NOT NULL, totale REAL NOT NULL,
            creato_il TEXT DEFAULT CURRENT_TIMESTAMP);
        INSERT OR IGNORE INTO prodotti VALUES
            (1,'monitor',180,5),(2,'tastiera',35,20),(3,'mouse',20,0);
        """)

# [slide]
@tool
def query_sql(sql: str) -> str:
    """Esegue UNA query SELECT in sola lettura.
    Tabelle: prodotti(id, nome, prezzo, giacenza),
             ordini(id, prodotto_id, quantita, totale)."""
    if not sql.strip().lower().startswith("select"):
        return "Errore: sono ammesse solo SELECT"
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)     # connessione READ-ONLY
    try:
        return str(conn.execute(sql).fetchmany(20))
    except sqlite3.Error as e:
        # l'errore torna all'LLM, che può correggersi
        return f"Errore SQL: {e}. Correggi la query e riprova."
    finally:
        conn.close()
# [/slide]

# [slide:scrittura]
@tool
def crea_ordine(prodotto: str, quantita: int) -> str:
    """Registra un ordine se il prodotto esiste e la giacenza è sufficiente."""
    if quantita <= 0:
        return "Quantità non valida"
    with sqlite3.connect(DB) as conn:   # transazione: commit/rollback
        row = conn.execute(       # parametri "?", mai f-string!
            "SELECT id, prezzo, giacenza FROM prodotti WHERE nome = ?",
            (prodotto.lower(),)).fetchone()
        if row is None or row[2] < quantita:
            return "Ordine rifiutato: prodotto inesistente o giacenza insufficiente"
        pid, prezzo, _ = row
        totale = round(prezzo * quantita, 2)   # calcolo nel CODICE
        conn.execute("UPDATE prodotti SET giacenza = giacenza - ? "
                     "WHERE id = ?", (quantita, pid))
        cur = conn.execute("INSERT INTO ordini(prodotto_id, quantita, totale) "
                           "VALUES (?,?,?)", (pid, quantita, totale))
    ricevuta = {"ordine_id": cur.lastrowid, "prodotto": prodotto,
                "quantita": quantita, "totale": totale}
    Path(f"ordine_{cur.lastrowid}.json").write_text(json.dumps(ricevuta, indent=2))
    return json.dumps(ricevuta)
# [/slide:scrittura]

crea_db()
agent = create_agent(get_llm(), tools=[query_sql, crea_ordine],
                     system_prompt="Sei il commesso di un negozio di informatica. "
                                   "Usa query_sql per informarti e crea_ordine per ordinare.")

if __name__ == "__main__":
    out = agent.invoke({"messages": [("user", "Vorrei 2 tastiere, quanto spendo?")]})
    print(out["messages"][-1].content)
