#!/usr/bin/env sh
# Runs the e2e suite in the official Playwright image (the host may lack Chromium's system libs).
# Usage: ./e2e/run.sh [base-url] [tool-id,tool-id,...]
#   base-url defaults to http://localhost:3000/fr ; the UI is driven in French.
set -eu
cd "$(dirname "$0")"
BASE="${1:-http://localhost:3000/fr}"
docker run --rm --network host --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp -e BASE="$BASE" -v "$PWD":/e2e -w /e2e \
  mcr.microsoft.com/playwright:v1.58.2-noble sh -c "npm ci --silent && node fixtures.js && node run.js ${2:-}"
