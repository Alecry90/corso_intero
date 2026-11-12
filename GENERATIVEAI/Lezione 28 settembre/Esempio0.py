import numpy as np

# ─────────────────────────────────────────────────────────────────────────────
# QUANTIZZAZIONE PTQ — schema con scala (Δ) senza zero-point
#
# L'obiettivo della quantizzazione è rappresentare valori floating-point (es.
# float32) con un numero ridotto di bit (es. int8), risparmiando memoria e
# velocizzando i calcoli (tipico nelle reti neurali).
#
# In questo schema:
#   - si usa int8 con segno → range intero [-128, 127]
#   - la scala Δ è calcolata sull'intervallo osservato [x_min, x_max]
#   - NON si usa zero-point: lo zero float non è necessariamente rappresentato
#     esattamente, ma l'errore è trascurabile se il range è ben calibrato
#
# Formule:
#   Δ     = (x_max - x_min) / (L - 1)       L = 256 per int8
#   q     = clip(round(x / Δ), -128, 127)
#   x_hat = q · Δ
# ─────────────────────────────────────────────────────────────────────────────

def quantize(x: np.ndarray, bits: int = 8) -> tuple[np.ndarray, float]:
    """
    Quantizza un array floating-point in interi con segno a `bits` bit (PTQ).

    La scala Δ è calcolata come (x_max - x_min) / (L - 1), dove L = 2^bits.
    Non viene usato lo zero-point.

    Parametri
    ----------
    x    : array di valori float da quantizzare
    bits : numero di bit (default 8 → L=256, range int8 [-128, 127])

    Ritorna
    -------
    q     : array quantizzato come int8
    delta : fattore di scala Δ
    """
    # Numero totale di livelli (es. 256 per 8 bit)
    L = 2 ** bits

    # Δ: ampiezza di un singolo passo tra due livelli interi consecutivi.
    # Copre l'intero range osservato [x_min, x_max] in L-1 passi.
    delta = (np.max(x) - np.min(x)) / (L - 1)

    # Divisione per Δ → arrotondamento → clip nel range int8 [-128, 127]
    q = np.clip(np.round(x / delta), -128, 127)

    return q.astype(np.int8), delta


def dequantize(q: np.ndarray, delta: float) -> np.ndarray:
    """
    Ricostruisce l'array floating-point dalla versione quantizzata.

    La ricostruzione introduce un errore di quantizzazione ≤ Δ/2,
    cioè la metà del passo tra due livelli interi consecutivi.

    Parametri
    ----------
    q     : array di interi quantizzati (int8)
    delta : fattore di scala Δ usato in fase di quantizzazione

    Ritorna
    -------
    x_hat : approssimazione float32 dei valori originali
    """
    return q.astype(np.float32) * delta


# Genera 10 valori casuali da una distribuzione normale (seed fisso → riproducibile)
# rng = np.random.default_rng(42)
# x = rng.normal(size=10).astype(np.float32)

x = np.array([-1.00, -0.52, -0.1, 0.0, 0.1, 0.48, 1])

#Sensibilità agli outlier
#x = np.array([-0.8, -0.3, -0.1, 0.0, 0.1, 0.2, 0.4, 5.0])

# Quantizzazione PTQ: float32 → int8
q, delta = quantize(x, bits=8)

# Dequantizzazione: int8 → float32 (approssimato)
x_hat = dequantize(q, delta)

# ── Stampa dei risultati ──────────────────────────────────────────────────────
print(f"Scala (Δ)                  : {delta:.6f}")
print(f"Errore teorico atteso ≤    : {delta / 2:.6f}  (= Δ/2)\n")

# Errore elemento per elemento
errori = np.abs(x - x_hat)
print(f"{'i':>3}  {'originale':>12}  {'quantizzato':>12}  {'ricostruito':>12}  {'errore':>10}")
print("-" * 57)
for i, (xi, qi, xhi, ei) in enumerate(zip(x, q, x_hat, errori)):
    print(f"{i:>3}  {xi:>12.6f}  {qi:>12}  {xhi:>12.6f}  {ei:>10.6f}")

print("-" * 57)
print(f"{'max':>3}  {'':>12}  {'':>12}  {'':>12}  {np.max(errori):>10.6f}")
