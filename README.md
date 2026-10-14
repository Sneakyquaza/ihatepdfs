# PDFKit — outils PDF & image (type iLovePDF)

34 outils, FR/EN. Architecture hybride : le léger tourne dans le navigateur, le lourd sur une API Python.

```
web/  Next.js 15 (App Router, TS, Tailwind 4)  — UI + traitements navigateur (pdf-lib, pdf.js, canvas, IA WASM)
api/  FastAPI (Docker)                          — Ghostscript, LibreOffice, ocrmypdf/Tesseract, pikepdf, PyMuPDF, WeasyPrint, OpenCV
```

## Lancer

```bash
docker compose up -d --build      # http://localhost:3000
```

Dev front avec hot reload (l'API doit tourner sur :8000) :

```bash
docker build -t ilp-api api && docker run -d --rm -p 8000:8000 ilp-api
cd web && npm install && npm run dev
```

## Outils

| Où | Outils |
|---|---|
| Navigateur | fusionner, diviser, supprimer/extraire pages, organiser (glisser-déposer), pivoter, numéroter, filigrane, éditer (texte/formes/surlignage/masquage), signer (dessin/texte/import), PDF→image, image→PDF, **suppression d'arrière-plan IA**, redimensionner, recadrer, compresser, convertir, pivoter/miroir, filigrane image |
| Serveur | compresser, réparer, OCR, PDF/A, Word/PowerPoint/Excel→PDF, HTML/URL→PDF, PDF→Word/Excel/PowerPoint, protéger, déverrouiller, comparer, agrandissement IA x2/x4 |

## Ajouter un outil

1. Déclarer dans `web/src/lib/tools.ts` (catégorie, icône, `accept`, options → formulaire généré automatiquement).
2. Textes dans `web/src/i18n/fr.ts` et `en.ts` (`tools.<id>`, + libellés d'options).
3. Traitement : soit une fonction dans `web/src/lib/processors/` branchée dans `processors/index.ts`, soit un endpoint `POST /api/<endpoint>` dans `api/app/main.py`.

## Config API (env)

`MAX_UPLOAD_MB` (100), `MAX_HEAVY_JOBS` (2 jobs lourds simultanés par worker), `CORS_ORIGINS`.
Les fichiers serveur vivent dans un dossier temporaire supprimé après la réponse. HTML→PDF bloque les URL vers des IP privées (y compris via redirection).

## ⚠️ Licences

- `@imgly/background-removal` (remove-bg) est **AGPL-3.0** : en production publique, il faut publier le code source du site ou acheter leur licence commerciale — ou basculer vers `rembg` (MIT) côté serveur.
- PyMuPDF et Ghostscript sont aussi **AGPL** (licences commerciales disponibles chez Artifex).
