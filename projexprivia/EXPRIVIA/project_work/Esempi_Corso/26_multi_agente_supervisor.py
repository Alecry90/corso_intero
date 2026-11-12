"""Multi-agente 'supervisor': i sub-agenti diventano tool del supervisore."""
from importlib import import_module
from langchain_core.tools import tool
from config import get_llm
_t = import_module("11_tools")
calcola_iva, data_odierna = _t.calcola_iva, _t.data_odierna

@tool
def cerca_listino(prodotto: str) -> str:
    """Cerca il prezzo di listino (IVA esclusa) di un prodotto."""
    listino = {"monitor": 180.0, "tastiera": 35.0, "mouse": 20.0}
    return f"{prodotto}: {listino.get(prodotto.lower(), 'non trovato')} euro"

# [slide]
from langchain.agents import create_agent

commerciale = create_agent(get_llm(), tools=[cerca_listino],
    system_prompt="Sei un commerciale: trovi i prezzi di listino.")
contabile = create_agent(get_llm(), tools=[calcola_iva],
    system_prompt="Sei un contabile: calcoli l'IVA.")

@tool
def chiedi_al_commerciale(richiesta: str) -> str:
    """Delega al commerciale domande su prodotti e prezzi di listino."""
    out = commerciale.invoke({"messages": [("user", richiesta)]})
    return out["messages"][-1].content

@tool
def chiedi_al_contabile(richiesta: str) -> str:
    """Delega al contabile i calcoli di IVA e totali."""
    out = contabile.invoke({"messages": [("user", richiesta)]})
    return out["messages"][-1].content

supervisore = create_agent(get_llm(),
    tools=[chiedi_al_commerciale, chiedi_al_contabile],
    system_prompt="Coordini un team. Delega ogni sotto-problema allo specialista "
                  "giusto, poi componi tu la risposta finale per il cliente.")
# [/slide]

if __name__ == "__main__":
    out = supervisore.invoke({"messages": [("user", "Quanto costa un monitor IVA inclusa?")]})
    print(out["messages"][-1].content)
