FROM python:3.12-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      ghostscript qpdf pngquant unpaper \
      tesseract-ocr tesseract-ocr-eng tesseract-ocr-fra tesseract-ocr-deu \
      tesseract-ocr-spa tesseract-ocr-ita tesseract-ocr-por tesseract-ocr-nld \
      libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
      libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libffi8 \
      fonts-dejavu fonts-liberation fonts-noto-core \
      libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
# pdf2docx pulls opencv-python-headless; swap it for the contrib build (adds dnn_superres for upscaling).
RUN pip install -r requirements.txt \
    && pip uninstall -y opencv-python-headless opencv-python \
    && pip install "opencv-contrib-python-headless>=4.10,<5"

RUN mkdir -p /models \
    && for s in 2 4; do curl -fsSL -o /models/FSRCNN_x$s.pb \
         https://raw.githubusercontent.com/Saafke/FSRCNN_Tensorflow/master/models/FSRCNN_x$s.pb; done

COPY --chmod=755 app ./app

RUN useradd -m -u 10001 app
USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
