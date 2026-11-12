# =============================================================
# SOLUZIONI - ESERCIZI DI ALLENAMENTO SU STRUTTURE PYTHON
# =============================================================

import random
import re
import numpy as np

random.seed(42)


# -------------------------------------------------------------
# SOLUZIONE ESERCIZIO 1 - Ciclo for annidato + enumerate + dizionario
# -------------------------------------------------------------
numeri_casuali = {
    "Categoria A": [7, 15, 3],
    "Categoria B": [42, 8, 23, 1],
    "Categoria C": [99, 0]
}

print("--- Esercizio 1 ---")
for categoria, numeri in numeri_casuali.items():   # ciclo esterno: scorre chiave/valore del dizionario
    print(f"{categoria}:")
    for i, numero in enumerate(numeri, 1):          # ciclo interno: indice (da 1) + valore
        print(f"   {i}. {numero}")


# -------------------------------------------------------------
# SOLUZIONE ESERCIZIO 2 - zip()
# -------------------------------------------------------------
numeri = [5, 12, 8, 30]
lettere = ["b", "x", "q", "z"]

print("\n--- Esercizio 2 ---")
for numero, lettera in zip(numeri, lettere):  # accoppia numeri[i] con lettere[i]
    print(f"Il numero {numero} corrisponde alla lettera {lettera}")


# -------------------------------------------------------------
# SOLUZIONE ESERCIZIO 3 - List comprehension
# -------------------------------------------------------------
valori = [3, 4, 7, 8, 10, 11, 15, 16]

quadrati_pari = [v ** 2 for v in valori if v % 2 == 0]
# equivalente a:
# quadrati_pari = []
# for v in valori:
#     if v % 2 == 0:
#         quadrati_pari.append(v ** 2)

print("\n--- Esercizio 3 ---")
print(quadrati_pari)  # [16, 64, 100, 256]


# -------------------------------------------------------------
# SOLUZIONE ESERCIZIO 4 - Dict comprehension
# -------------------------------------------------------------
etichette = ["rosso", "blu", "verde", "giallo"]

etichetta_to_ix = {etichetta: i for i, etichetta in enumerate(etichette)}
ix_to_etichetta = {i: etichetta for i, etichetta in enumerate(etichette)}

print("\n--- Esercizio 4 ---")
print(etichetta_to_ix)  # {'rosso': 0, 'blu': 1, 'verde': 2, 'giallo': 3}
print(ix_to_etichetta)  # {0: 'rosso', 1: 'blu', 2: 'verde', 3: 'giallo'}


# -------------------------------------------------------------
# SOLUZIONE ESERCIZIO 5 - Funzione con finestra scorrevole
# -------------------------------------------------------------
def crea_sequenze(numeri, lunghezza):
    """Crea sequenze input-target con finestra scorrevole"""
    sequences = []
    targets = []

    for i in range(len(numeri) - lunghezza):
        seq = numeri[i:i + lunghezza]
        target = numeri[i + lunghezza]
        sequences.append(seq)
        targets.append(target)

    return sequences, targets


numeri_seq = [1, 2, 3, 4, 5, 6]
sequences, targets = crea_sequenze(numeri_seq, 2)

print("\n--- Esercizio 5 ---")
print(sequences)  # [[1, 2], [2, 3], [3, 4], [4, 5]]
print(targets)    # [3, 4, 5, 6]


# -------------------------------------------------------------
# SOLUZIONE ESERCIZIO 6 - Regex (re.sub)
# -------------------------------------------------------------
testo_sporco = "Cod1ce: A7B! Prova#123 test_ok!!"

testo_pulito = re.sub(r'[^a-zA-Z\s]', '', testo_sporco)

print("\n--- Esercizio 6 ---")
print(testo_pulito)  # "Codce AB Prova testok"


# -------------------------------------------------------------
# SOLUZIONE ESERCIZIO 7 - Slicing su array NumPy
# -------------------------------------------------------------
matrice = np.array([
    [4, 9, 2, 1],
    [7, 3, 8, 5],
    [6, 0, 1, 9],
    [2, 5, 4, 3],
    [8, 1, 7, 0]
])

X = matrice[:, :-1]  # tutte le righe, tutte le colonne tranne l'ultima
y = matrice[:, -1]   # tutte le righe, solo l'ultima colonna

print("\n--- Esercizio 7 ---")
print(X)
# [[4 9 2]
#  [7 3 8]
#  [6 0 1]
#  [2 5 4]
#  [8 1 7]]
print(y)  # [1 5 9 3 0]


# -------------------------------------------------------------
# SOLUZIONE ESERCIZIO 8 - One-hot e softmax
# -------------------------------------------------------------
def crea_one_hot(indice, dimensione):
    """Crea vettore one-hot"""
    vettore = np.zeros(dimensione)
    vettore[indice] = 1
    return vettore


def softmax(x):
    """Funzione softmax"""
    exp_x = np.exp(x - np.max(x))  # sottrazione del massimo per stabilita' numerica
    return exp_x / np.sum(exp_x)


x_casuale = np.array([2.0, 1.0, 0.5, 3.0, 0.1])
probabilita = softmax(x_casuale)

print("\n--- Esercizio 8 ---")
print(crea_one_hot(2, 5))   # [0. 0. 1. 0. 0.]
print(probabilita)          # 5 numeri tra 0 e 1
print(np.sum(probabilita))  # 1.0 (o molto vicino, per arrotondamenti)


# -------------------------------------------------------------
# SOLUZIONE ESERCIZIO 9 (combinato) - Mini pipeline
# -------------------------------------------------------------
corpus_casuale = ["mela", "pera", "mela", "kiwi", "pera", "banana", "mela"]
sequenza_test = ["pera", "mela", "kiwi"]

# 1. vocabolario: valori unici e ordinati
vocabolario = sorted(list(set(corpus_casuale)))

# 2. dizionari parola <-> indice
parola_to_ix = {parola: i for i, parola in enumerate(vocabolario)}
ix_to_parola = {i: parola for i, parola in enumerate(vocabolario)}

# 3. conversione della sequenza in indici (list comprehension)
indici_sequenza = [parola_to_ix[parola] for parola in sequenza_test]

# 4. conversione di ogni indice in one-hot (riusa la funzione dell'esercizio 8)
vocab_size = len(vocabolario)
one_hot_sequenza = [crea_one_hot(idx, vocab_size) for idx in indici_sequenza]

print("\n--- Esercizio 9 ---")
print("Vocabolario:", vocabolario)          # ['banana', 'kiwi', 'mela', 'pera']
print("parola_to_ix:", parola_to_ix)
print("Indici sequenza:", indici_sequenza)  # es. [3, 2, 1]
print("One-hot sequenza:")
for parola, vettore in zip(sequenza_test, one_hot_sequenza):
    print(f"   {parola} -> {vettore}")
