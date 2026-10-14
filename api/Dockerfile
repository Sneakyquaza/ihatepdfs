FROM python:3.12-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      ghostscript qpdf pngquant unpaper \
      tesseract-ocr tesseract-ocr-eng tesseract-ocr-fra tesseract-ocr-deu \
      tesseract-ocr-spa tesseract-ocr-ita tesseract-ocr-por tesseract-ocr-nld \
      libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
      fonts-dejavu fonts-liberation fonts-noto-core \
      fonts-crosextra-carlito fonts-crosextra-caladea \
      libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.lock .
# Exact, complete dependency set (see lock.sh). --no-deps: the lock already lists every package, and
# it carries opencv-contrib (needed for dnn_superres) instead of the opencv-python-headless pdf2docx asks for.
RUN pip install --no-deps -r requirements.lock

# FSRCNN super-resolution models, pinned to a commit and checked against known hashes
ARG FSRCNN_COMMIT=6a4812c4ef1c4f5947d79beafa32a05a6eb4a94d
RUN mkdir -p /models \
    && curl -fsSL -o /models/FSRCNN_x2.pb https://raw.githubusercontent.com/Saafke/FSRCNN_Tensorflow/$FSRCNN_COMMIT/models/FSRCNN_x2.pb \
    && curl -fsSL -o /models/FSRCNN_x4.pb https://raw.githubusercontent.com/Saafke/FSRCNN_Tensorflow/$FSRCNN_COMMIT/models/FSRCNN_x4.pb \
    && printf '%s  %s\n' \
         366b33f0084c7b3f2bf6724f0a2c77bca94fcec9d7b6d72389d330073b380d5c /models/FSRCNN_x2.pb \
         5c68d18db561aed8ead4ffedf1b897ea615baaf60ebf6c35f8e641f8fa4a21bf /models/FSRCNN_x4.pb \
       | sha256sum -c -

COPY --chmod=755 app ./app

RUN useradd -m -u 10001 app
USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
