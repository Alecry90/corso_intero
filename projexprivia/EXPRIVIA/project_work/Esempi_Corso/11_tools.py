"""Definire tool: type hints + docstring = schema per l'LLM."""
# [slide]
from datetime import date
from langchain_core.tools import tool

@tool
def calcola_iva(imponibile: float, aliquota: float = 22.0) -> float:
    """Calcola l'IVA in euro dati imponibile e aliquota (%)."""
    return round(imponibile * aliquota / 100, 2)

@tool
def data_odierna() -> str:
    """Restituisce la data di oggi in formato GG/MM/AAAA."""
    return date.today().strftime("%d/%m/%Y")

print(calcola_iva.name)         # calcola_iva
print(calcola_iva.description)  # docstring = "manuale" per l'LLM
print(calcola_iva.args)         # schema JSON degli argomenti
print(calcola_iva.invoke({"imponibile": 100}))   # 22.0
# [/slide]
