#!/usr/bin/env sh
# Pull latest code and rebuild/restart the stack.
set -eu
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
