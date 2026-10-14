#!/usr/bin/env sh
# Visual/console audit of every page (FR/EN, light/dark, desktop/phone); screenshots in out/audit/.
# Usage: ./e2e/audit.sh [origin]   (default http://localhost:3000)
set -eu
cd "$(dirname "$0")"
docker run --rm --network host --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp -e ORIGIN="${1:-http://localhost:3000}" -v "$PWD":/e2e -w /e2e \
  mcr.microsoft.com/playwright:v1.58.2-noble sh -c "npm ci --silent && node audit.js"
