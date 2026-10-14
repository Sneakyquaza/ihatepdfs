# iHatePDFs — outils PDF & image gratuits

43 outils, FR/EN. Architecture hybride : le léger tourne dans le navigateur, le lourd sur une API Python.

```
web/     Next.js 16 (App Router, TS, Tailwind 4) — UI + traitements navigateur (pdf-lib, pdf.js, canvas, IA WASM)
api/     FastAPI (Docker)                       — Ghostscript, LibreOffice, ocrmypdf/Tesseract, pikepdf, PyMuPDF, OpenCV
render/  Chromium headless isolé (Playwright)   — HTML/URL → PDF
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
| Navigateur | fusionner, diviser, supprimer/extraire pages, organiser (glisser-déposer), plusieurs pages par feuille, recadrer, métadonnées, PDF→texte, pivoter, numéroter, filigrane, éditer (texte/formes/surlignage/masquage), signer (dessin/texte/import), PDF→image, image→PDF, **suppression d'arrière-plan IA**, redimensionner, recadrer, compresser, convertir, pivoter/miroir, filigrane image, flouter/pixeliser des zones |
| Serveur | **caviarder** (suppression réelle du contenu + recherche de mots/e-mails/téléphones/IBAN/cartes), aplatir, niveaux de gris, compresser, réparer, OCR (PDF et image), PDF/A, Word/PowerPoint/Excel→PDF, HTML/URL→PDF (Chromium isolé), PDF→Word, PDF→Excel (nombres typés, tableaux multi-pages, OCR auto), PDF→PowerPoint (texte modifiable), protéger, déverrouiller, comparer, agrandissement IA x2/x4 |

## Tests

```bash
./e2e/run.sh [url] [outils]   # bout en bout : Playwright (via Docker) pilote chaque outil dans un vrai navigateur
docker compose build api && docker compose run --rm -v ./api/tests:/srv/tests api python -m unittest discover -s tests
```

## Ajouter un outil

1. Déclarer dans `web/src/lib/tools.ts` (catégorie, icône, `accept`, options → formulaire généré automatiquement).
2. Textes dans `web/src/i18n/fr.ts` et `en.ts` (`tools.<id>`, + libellés d'options).
3. Traitement : soit une fonction dans `web/src/lib/processors/` branchée dans `processors/index.ts`, soit un endpoint `POST /api/<endpoint>` dans `api/app/main.py`.

## Config API (env)

`MAX_UPLOAD_MB` (100), `MAX_HEAVY_JOBS` (4 jobs lourds simultanés), `MAX_QUEUE` (20 en attente, au-delà → 503),
`JOB_TIMEOUT_S` (300) / `JOB_MEMORY_MB` (4096) par traitement, `MAX_PAGES` (500), `MAX_OCR_PAGES` (100),
`RATE_LIMIT_REQUESTS` / `RATE_LIMIT_WINDOW_S` (60 requêtes / 10 min par IP → 429), `RATE_LIMIT_CONCURRENT` (3 par IP).
L'IP client vient de l'en-tête `X-Client-IP` posé (écrasé) par Apache : le client ne peut pas le falsifier.
Les fichiers serveur vivent dans un dossier temporaire supprimé après la réponse. HTML→PDF bloque les URL vers des IP privées (y compris via redirection).

## Déploiement

Mettre un reverse proxy TLS devant `127.0.0.1:3000` (le conteneur `web`). Il doit :
- poser l'en-tête `X-Client-IP` avec l'IP du visiteur en **écrasant** toute valeur reçue (utilisé par la limitation par IP de l'API) ;
- autoriser des réponses lentes (OCR / conversions Office : jusqu'à 10 min) et des uploads d'au moins 100 Mo.

Mise à jour : `./deploy/update.sh` (git pull + rebuild + restart).

## Licence

AGPL-3.0 (voir `LICENSE`) — imposée par `@imgly/background-removal`, PyMuPDF et Ghostscript. Le code source est public et lié depuis le pied de page du site, ce qui satisfait l'obligation de l'AGPL pour un service en ligne : toute modification déployée doit être poussée sur ce dépôt.
