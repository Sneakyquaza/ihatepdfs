#!/usr/bin/env sh
# Regenerate requirements.lock from requirements.txt (the human-edited, loosely pinned list).
# Resolves in a clean container with the same base image, then applies the opencv swap.
set -eu
cd "$(dirname "$0")"
docker run --rm -v "$PWD":/w -w /w python:3.12-slim-trixie sh -c '
  pip install -q -r requirements.txt \
  && pip uninstall -q -y opencv-python-headless opencv-python \
  && pip install -q "opencv-contrib-python-headless>=4.10,<5" \
  && pip freeze --all | grep -viE "^(pip|setuptools|wheel)==" > requirements.lock'
echo "requirements.lock updated ($(wc -l < requirements.lock) packages)"
