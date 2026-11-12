# =============================================================
# ESERCIZI DI ALLENAMENTO SU STRUTTURE PYTHON
# (slegati dal contesto RNN, con numeri e stringhe casuali)
# =============================================================

import random
import re
import numpy as np

random.seed(42)  # per risultati riproducibili


# -------------------------------------------------------------
# ESERCIZIO 1 - Ciclo for annidato + enumerate + dizionario
# -------------------------------------------------------------
# Dato questo dizionario, stampa per ogni categoria il suo nome
# e poi, sotto, ogni numero della lista precedute dal suo indice
# (che deve partire da 1, non da 0).
#
# Output atteso (esempio):
# Categoria A:
#    1. 7
#    2. 15
#    3. 3
# Categoria B:
#    1. 42
#    ...
print("="*52)
print(f"\nESERCIZIO 1")
numeri_casuali = {
    "Categoria A": [7, 15, 3],
    "Categoria B": [42, 8, 23, 1],
    "Categoria C": [99, 0]
}

# Scrivi qui il tuo codice:

print("📊 ESEMPI DI NUMERI CAUSALI:")
for categoria, numeri in numeri_casuali.items(): 
    print(f"\n{categoria}:")
    for i, numeri in enumerate(numeri, 1):
        print(f"   {i}. {numeri}")




# -------------------------------------------------------------
# ESERCIZIO 2 - zip()
# -------------------------------------------------------------
# Date le due liste sotto (della stessa lunghezza), stampa per
# ogni coppia una frase del tipo:
#    "Il numero 5 corrisponde alla lettera b"
# usando zip() per scorrerle insieme.

numeri = [5, 12, 8, 30]
lettere = ["b", "x", "q", "z"]

# Scrivi qui il tuo codice:
print("="*52)
print(f"\nESERCIZIO 2")
for numero, lettera in zip(numeri, lettere):
    print(f"Il numero {numero} corrisponde alla lettera {lettera}")


# -------------------------------------------------------------
# ESERCIZIO 3 - List comprehension
# -------------------------------------------------------------
# Data la lista "valori", crea con una list comprehension una
# nuova lista contenente il quadrato di ogni numero, ma SOLO
# per i numeri pari (usa un if dentro la comprehension).
print("=" * 52)
print("ESERCIZIO 3")
valori = [3, 4, 7, 8, 10, 11, 15, 16]

# Scrivi qui il tuo codice (una sola riga con list comprehension):
valori_quadrati=[v**2 for v in valori if v % 2 == 0]
print(f"\n{valori_quadrati}")


# -------------------------------------------------------------
# ESERCIZIO 4 - Dict comprehension (come word_to_ix / ix_to_word)
# -------------------------------------------------------------
# Data la lista di stringhe casuali "etichette", crea due
# dizionari con dict comprehension + enumerate:
#   - etichetta_to_ix : {etichetta: indice}
#   - ix_to_etichetta : {indice: etichetta}
print("=" * 52)
print("ESERCIZIO 4")
etichette = ["rosso", "blu", "verde", "giallo"]

# Scrivi qui il tuo codice:
etichetta_to_ix, ix_to_etichetta= {e: i for i,e in enumerate(etichette,1)},{i: e for i,e in enumerate(etichette,1)}
print(f"\nLa prima lista è: {etichetta_to_ix}\nLa seconda lista è:{ix_to_etichetta}")



# -------------------------------------------------------------
# ESERCIZIO 5 - Funzione con finestra scorrevole (sliding window)
# -------------------------------------------------------------
# Scrivi una funzione crea_sequenze(numeri, lunghezza) che,
# come create_training_sequences(), scorra la lista "numeri"
# con una finestra di "lunghezza" elementi e restituisca due
# liste: sequences (le finestre) e targets (il numero subito
# dopo ogni finestra).
#
# Esempio con numeri = [1,2,3,4,5,6] e lunghezza = 2:
#   sequences = [[1,2], [2,3], [3,4], [4,5]]
#   targets   = [3, 4, 5, 6]
print("=" * 52)
print("ESERCIZIO 5")
numeri_seq = [1, 2, 3, 4, 5, 6]

# Scrivi qui la tua funzione e poi chiamala:
def crea_sequenze(numeri, lunghezza):
    sequences=[]
    targets =[]
    for i in range(len(numeri) - lunghezza):
        finestra= numeri[i: i + lunghezza]
        target = numeri[i + lunghezza]
        sequences.append(finestra)
        targets.append(target)
    return sequences,targets
lunghezza = 2

sequences, targets = crea_sequenze(numeri_seq, lunghezza)

print(f"La funzione funziona e queste sono le due liste:\n{sequences}, \n {targets}")



# -------------------------------------------------------------
# ESERCIZIO 6 - Regex (re.sub)
# -------------------------------------------------------------
# Data la stringa sotto (con numeri e simboli misti a lettere),
# usa re.sub() per rimuovere tutto ciò che NON è una lettera o
# uno spazio (stesso pattern visto nel notebook: [^a-zA-Z\s]).

# Scrivi qui il tuo codice:
print("=" * 52)
print("ESERCIZIO 6")
testo_sporco = "Cod1ce: A7B! Prova#123 test_ok!!"
testo_pulito= re.sub(r'[^a-zA-Z\s]','',testo_sporco)
print(testo_pulito)


# -------------------------------------------------------------
# ESERCIZIO 7 - Slicing su liste e array NumPy
# -------------------------------------------------------------
# Data la matrice NumPy sotto (5 righe, 4 colonne di numeri
# casuali), separa in X e y come fatto con X, y = sequences[:, :-1], sequences[:, -1]:
#   - X = tutte le colonne tranne l'ultima
#   - y = solo l'ultima colonna

matrice = np.array([
    [4, 9, 2, 1],
    [7, 3, 8, 5],
    [6, 0, 1, 9],
    [2, 5, 4, 3],
    [8, 1, 7, 0]
])

# Scrivi qui il tuo codice:


# -------------------------------------------------------------
# ESERCIZIO 8 - One-hot e softmax "fatti in casa"
# -------------------------------------------------------------
# a) Scrivi una funzione crea_one_hot(indice, dimensione) uguale
#    a quella vista nel notebook (np.zeros + assegna 1 in posizione).
# b) Scrivi una funzione softmax(x) uguale a quella vista.
# c) Verifica che la somma dei valori restituiti da softmax sia 1
#    (usa np.sum sul risultato) su un vettore di 5 numeri casuali.

x_casuale = np.array([2.0, 1.0, 0.5, 3.0, 0.1])

# Scrivi qui il tuo codice:


# -------------------------------------------------------------
# ESERCIZIO 9 (combinato) - Mini pipeline "parola -> numero -> one-hot"
# -------------------------------------------------------------
# Con la lista di stringhe casuali sotto:
#   1. crea il vocabolario (valori unici, ordinati)
#   2. crea i dizionari to_ix e to_parola con dict comprehension
#   3. usa words_to_indices-style (list comprehension) per
#      convertire "sequenza_test" in indici
#   4. crea il one-hot di ciascun indice con crea_one_hot
#      (riusa la funzione dell'esercizio 8)

corpus_casuale = ["mela", "pera", "mela", "kiwi", "pera", "banana", "mela"]
sequenza_test = ["pera", "mela", "kiwi"]

# Scrivi qui il tuo codice:
