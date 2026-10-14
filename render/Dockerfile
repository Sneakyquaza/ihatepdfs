# Headless Chromium for HTML/URL -> PDF, kept in its own locked-down container (see docker-compose.yml):
# it renders untrusted pages, so it never shares a filesystem with the API's user files.
FROM mcr.microsoft.com/playwright/python:v1.58.0-noble

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv
COPY requirements.txt .
RUN pip install --break-system-packages -r requirements.txt
COPY --chmod=755 app.py .

USER pwuser
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
