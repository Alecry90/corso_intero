# Provenienza degli asset

Data: 15 ottobre 2026.

## Materiali forniti

Gli originali sono conservati senza modifiche in `img/`:

- `LOGO INTIMO PATRIZIA.png`: origine del marchio usato nel sito.
- `INSEGNA INTIMO PATRIZIA.jpg` → `public/assets/negozio.jpg`.
- `biancheria.jpg` → `public/assets/biancheria.jpg`.
- `binbo.jpg` → `public/assets/bimbo.jpg`.

L’utilizzo delle fotografie si basa sul fatto che il titolare le ha fornite per costruire il sito. Eventuali diritti su personaggi o marchi visibili nelle confezioni restano ai rispettivi titolari; nessuna licenza di terzi è stata inferita dalla sola presenza nella fotografia.

## Hero editoriale

Creato con lo strumento integrato `image_gen`, senza API key o CLI esterno. Brief di generazione trasmesso all’agente immagini: “foto editoriale still life verticale di biancheria per famiglia: lino avorio ripiegato su sedia legno, maglia salvia e minuscole scarpine bimbo crema, luce sole calda domestica, sfondo neutro, niente persone/loghi/testi”. Risultato verticale 1024 × 1536. Non è una fotografia del negozio né di un suo prodotto reale.

La versione di distribuzione `public/assets/hero-family.webp` è ottenuta dal PNG generato mediante conversione WebP, qualità 85, senza ricomposizioni. Il PNG sorgente è conservato in `docs/assets/hero-family-source.png`.

## Logo pulito

`public/assets/logo-clean.png` è una pulizia del logo fornito con `image_gen`, modalità modifica, `transparent_background: true`. Il ritaglio è trasparente e riprende le due parole sfalsate del marchio. L’elaborazione generativa può introdurre piccole differenze nei contorni: per una riproduzione tipografica esatta sarà preferibile un file vettoriale originale, se disponibile.

Prompt finale completo:

> Edit target supplied business wordmark logo. Extract only the existing letterforms spelling exactly INTIMO PATRIZIA on a fully transparent background. Preserve the exact serif letter shapes, typography, relative placement (INTIMO upper-left italic, PATRIZIA lower-right upright) and proportions of the source. Make the existing letters solid deep blue #173e75 to read on an ivory webpage. Remove every part of the black textured rectangular background, blue glow and haze; no glow, no frame, no shadow, no extra symbols or text. Crop canvas close around wordmark with generous small transparent padding, wide horizontal format. This is background cleanup of an existing logo, do not redesign or add a font.

## Illustrazioni del catalogo

Dodici SVG creati nel codice del progetto: quattro forme di categoria in tre varianti cromatiche. Servono a rappresentare le schede dimostrative e non sono fotografie di merce. Ogni prodotto ha `isDemo: true` e un testo alternativo esplicito. Possono essere sostituiti dal gestore con foto reali tramite il pannello; quelle caricate vengono memorizzate in Base64 su Firestore.

## Font

Cormorant Garamond e DM Sans sono distribuiti dal pacchetto Fontsource e serviti localmente. Licenze in `docs/licenses/`; non vengono eseguite richieste a Google Fonts durante la visita.
