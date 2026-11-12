# Intimo Patrizia · Identità del sito

## Direzione

Un negozio di Bari presentato attraverso le cose di casa: tessuti, piccoli capi, insegna originale e dettagli della vetrina. Il tono familiare è la direzione richiesta dal titolare; non viene trasformato in una storia aziendale inventata.

Il riferimento visivo corrente è l’immagine boutique fornita dal titolare (`pagina-di-destinazione-boutique-minimal-dal-design-piatto_23-2149327774.avif`). La sua composizione è reinterpretata con l’identità di Intimo Patrizia: pannello salvia, titolo serif in un cartiglio carta, fotografia verticale arretrata a destra, piccolo cartiglio sovrapposto, regole chiare a L e decorazioni geometriche sottili. La Home usa “Un po’ di casa.” come titolo. Le decorazioni sono SVG e CSS, senza ricavare fotografie o risorse dal template.

L’impostazione boutique si estende alle pagine interne: serif in maiuscolo/minuscolo, spazi ariosi, immagini grandi e linee sottili. Il riferimento precedente AZ Milano e l’esplorazione brutalista sono stati superati dalla nuova scelta esplicita del titolare. Le skill `design`, `design-system` e le regole UI/UX servono a costruire un sistema coerente; il riferimento scelto prevale sulle preferenze stilistiche generiche delle skill.

## Colori e token

| Ruolo | Colore | Utilizzo |
| --- | --- | --- |
| Avorio | `#f9f6f0` | Fondo principale. |
| Carta | `#fffdf9` | Campi chiari e testo su bordeaux. |
| Lino | `#eee7db` | Sezione collezioni e superfici secondarie. |
| Bordeaux | `#622d39` | Titoli, azioni, footer. |
| Bruno | `#332b27` | Testo principale. |
| Bruno secondario | `#4e443d` | Testi di supporto. |
| Salvia | `#dce1d3` | Hero, navigazione e pannelli informativi. |
| Salvia scuro | `#354338` | Testo e controlli su salvia. |
| Blu marchio | `#173e75` | Logo e focus visibile. |

Architettura condivisa in `src/styles.css` e tema `src/boutique.css`: valori primitivi → ruoli semantici `--bg`, `--ink`, `--accent` → variabili di componente `--button-bg`, `--button-hover`. Un unico sistema di margini fluidi e spaziatura. Nessun gradiente decorativo. Il campo ricerca chiaro resta leggibile sul fondo salvia.

## Tipografia

**Cormorant Garamond**, pesi 500/600, per titoli; **DM Sans Variable** per testi e controlli. File ospitati localmente, licenza SIL Open Font License conservata in `docs/licenses/`. I caratteri commerciali citati nei riferimenti non vengono scaricati o utilizzati.

Titoli brevi, testo leggibile, prezzi con `Intl.NumberFormat('it-IT')`. Il logo è ricavato dall’asset fornito: parole, disposizione sfalsata e carattere serif blu mantenuti nella pulizia del fondo. Gli originali restano in `img/`.

## Comportamento

- Navigazione completa su desktop, menu modale con hamburger su tablet e mobile.
- Target principali di almeno 44 px, focus visibile, chiusura con Escape e ritorno del focus.
- Hero a piena altezza disponibile. Sui telefoni i campi si impilano senza ridurre il testo a dimensioni illeggibili.
- Movimento di ingresso e disegno della freccia curva ispirata al riferimento. `prefers-reduced-motion` disattiva le animazioni; sono presenti comandi per ridurle anche nell’interfaccia.
- Ricerca della Home collegata al catalogo reale tramite il parametro `cerca`; nessun campo decorativo senza funzione.
- Nessun acquisto simulato: il catalogo porta alle informazioni in negozio.

## Immagini e testi

Foto di insegna, biancheria e vetrina: materiali originali forniti. Hero: composizione editoriale generata, dichiarata nella Home. Prodotti iniziali: illustrazioni vettoriali e dati dimostrativi, tutti esplicitamente marcati. Nessuna recensione, anno di fondazione, percentuale di tessuto o informazione familiare è stata inventata come fatto dell’attività.
