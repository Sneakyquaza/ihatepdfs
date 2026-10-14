#!/usr/bin/env sh
# Regenerate requirements.lock from requirements.txt (the human-edited, loosely pinned list).
# Resolves in a clean container with the same base image, then applies the opencv swap. The current lock
# is used as constraints, so only new/removed requirements change versions (delete it for a full upgrade).
set -eu
cd "$(dirname "$0")"
docker run --rm -e PIP_ROOT_USER_ACTION=ignore -e PIP_DISABLE_PIP_VERSION_CHECK=1 -v "$PWD":/w -w /w python:3.12-slim-trixie sh -c '
  touch requirements.lock && grep -v "^opencv" requirements.lock > /tmp/constraints.txt \
  && pip install -q -r requirements.txt -c /tmp/constraints.txt \
  && pip uninstall -q -y opencv-python-headless opencv-python \
  && pip install -q "opencv-contrib-python-headless>=4.10,<5" \
  && pip freeze --all | grep -viE "^(pip|setuptools|wheel)==" > requirements.lock'
echo "requirements.lock updated ($(wc -l < requirements.lock) packages)"
