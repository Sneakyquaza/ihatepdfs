"""HTTP layer for the server-side tools. Heavy library work runs in isolated processes (see isolate.py)."""

import asyncio
import logging
import os
import re
from pathlib import Path
from typing import Awaitable, Callable

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, Response

from . import jobs
from .errors import ApiError
from .isolate import run_job
from .ratelimit import rate_limit_middleware
from .redact import PRESETS, parse_boxes
from .util import Workspace, assert_public_url, run, save_upload, send, stem_of

app = FastAPI(title="iHatePDFs API", docs_url=None, redoc_url=None, openapi_url=None)
app.middleware("http")(rate_limit_middleware)

log = logging.getLogger("uvicorn.error")


@app.exception_handler(Exception)
async def _unexpected(_: Request, exc: Exception):
    log.exception("unhandled error", exc_info=exc)
    return JSONResponse({"detail": {"code": "processing_failed", "message": "Processing failed"}}, status_code=500)


PDF = {".pdf"}
OFFICE = {".doc", ".docx", ".odt", ".rtf", ".txt", ".ppt", ".pptx", ".odp", ".xls", ".xlsx", ".ods", ".csv"}
IMAGES = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
OCR_LANGS = {"eng", "fra", "deu", "spa", "ita", "por", "nld"}
MAX_OCR_PAGES = int(os.getenv("MAX_OCR_PAGES", "100"))

# Limit concurrent heavy jobs so one burst can't exhaust CPU/RAM, and cap the queue behind them.
HEAVY = asyncio.Semaphore(int(os.getenv("MAX_HEAVY_JOBS", "2")))
MAX_QUEUE = int(os.getenv("MAX_QUEUE", "20"))
_queued = 0


async def handle(work: Callable[[Workspace], Awaitable[Response]]) -> Response:
    global _queued
    if _queued >= MAX_QUEUE:
        raise ApiError(503, "busy", "Server busy", headers={"Retry-After": "30"})
    ws = Workspace()
    _queued += 1
    waiting = True
    try:
        async with HEAVY:
            _queued -= 1
            waiting = False
            return await work(ws)
    except BaseException:
        ws.cleanup()
        raise
    finally:
        if waiting:  # cancelled (client gone) before getting a slot
            _queued -= 1


async def save_pdf(upload: UploadFile, ws: Workspace, max_pages: int = jobs.MAX_PAGES) -> str:
    """Save an uploaded PDF and reject encrypted/empty/oversized ones before any tool touches it."""
    src = await save_upload(upload, ws, PDF)
    await run_job(jobs.check_pages, str(src), max_pages, timeout=30)
    return str(src)


def parse_langs(lang: str) -> str:
    langs = [l for l in lang.split("+") if l]
    if not langs or any(l not in OCR_LANGS for l in langs):
        raise ApiError(400, "invalid_option", "Invalid language")
    return "+".join(langs)


@app.get("/api/health")
async def health():
    return {"ok": True}


# ---------- Compression / repair ----------

GS_LEVELS = {"low": "/printer", "recommended": "/ebook", "extreme": "/screen"}
GS = ["gs", "-sDEVICE=pdfwrite", "-dNOPAUSE", "-dQUIET", "-dBATCH", "-dSAFER"]


@app.post("/api/compress-pdf")
async def compress_pdf(file: UploadFile = File(...), level: str = Form("recommended")):
    if level not in GS_LEVELS:
        raise ApiError(400, "invalid_option", "Invalid level")

    async def work(ws: Workspace):
        src = await save_pdf(file, ws)
        out = ws.file(".pdf")
        await run([*GS, "-dCompatibilityLevel=1.5", f"-dPDFSETTINGS={GS_LEVELS[level]}",
                   "-dDetectDuplicateImages=true", f"-sOutputFile={out}", src])
        best = out if out.stat().st_size < os.path.getsize(src) else Path(src)
        return send(best, f"{stem_of(file)}_compressed.pdf", ws)

    return await handle(work)


@app.post("/api/repair-pdf")
async def repair_pdf(file: UploadFile = File(...)):
    async def work(ws: Workspace):
        # no page check here: the whole point is to accept broken files
        src = await save_upload(file, ws, PDF)
        out = ws.file(".pdf")
        if not await run_job(jobs.repair, str(src), str(out)):
            await run([*GS, f"-sOutputFile={out}", str(src)])
        return send(out, f"{stem_of(file)}_repaired.pdf", ws)

    return await handle(work)


@app.post("/api/grayscale-pdf")
async def grayscale_pdf(file: UploadFile = File(...)):
    async def work(ws: Workspace):
        src = await save_pdf(file, ws)
        out = ws.file(".pdf")
        await run([*GS, "-sColorConversionStrategy=Gray", "-dProcessColorModel=/DeviceGray", "-dOverrideICC",
                   f"-sOutputFile={out}", src])
        return send(out, f"{stem_of(file)}_gray.pdf", ws)

    return await handle(work)


@app.post("/api/flatten-pdf")
async def flatten_pdf(file: UploadFile = File(...)):
    async def work(ws: Workspace):
        src = await save_pdf(file, ws)
        out = ws.file(".pdf")
        await run_job(jobs.flatten, src, str(out))
        return send(out, f"{stem_of(file)}_flat.pdf", ws)

    return await handle(work)


# ---------- Conversions ----------

@app.post("/api/office-to-pdf")
async def office_to_pdf(file: UploadFile = File(...)):
    async def work(ws: Workspace):
        src = await save_upload(file, ws, OFFICE)
        profile = ws.path / "lo_profile"
        await run([
            "soffice", f"-env:UserInstallation=file://{profile}", "--headless", "--norestore",
            "--convert-to", "pdf", "--outdir", str(ws.path), str(src),
        ], timeout=240, env={"HOME": str(ws.path)})
        return send(src.with_suffix(".pdf"), f"{stem_of(file)}.pdf", ws)

    return await handle(work)


@app.post("/api/pdf-to-word")
async def pdf_to_word(file: UploadFile = File(...)):
    async def work(ws: Workspace):
        src = await save_pdf(file, ws)
        out = ws.file(".docx")
        await run_job(jobs.pdf_to_word, src, str(out))
        return send(out, f"{stem_of(file)}.docx", ws)

    return await handle(work)


@app.post("/api/pdf-to-excel")
async def pdf_to_excel(file: UploadFile = File(...)):
    async def work(ws: Workspace):
        src = await save_pdf(file, ws)
        out = ws.file(".xlsx")
        await run_job(jobs.pdf_to_excel, src, str(out), str(ws.path))
        return send(out, f"{stem_of(file)}.xlsx", ws)

    return await handle(work)


@app.post("/api/pdf-to-powerpoint")
async def pdf_to_powerpoint(file: UploadFile = File(...)):
    async def work(ws: Workspace):
        src = await save_pdf(file, ws)
        out = ws.file(".pptx")
        await run_job(jobs.pdf_to_powerpoint, src, str(out), str(ws.path))
        return send(out, f"{stem_of(file)}.pptx", ws)

    return await handle(work)


@app.post("/api/pdf-to-markdown")
async def pdf_to_markdown(file: UploadFile = File(...)):
    async def work(ws: Workspace):
        src = await save_pdf(file, ws, MAX_OCR_PAGES)
        out = ws.file(".md")
        await run_job(jobs.pdf_to_markdown, src, str(out), file.filename or "", str(ws.path))
        return send(out, f"{stem_of(file)}.md", ws)

    return await handle(work)


@app.post("/api/extract-images")
async def extract_images(file: UploadFile = File(...), minSize: str = Form("64")):
    sizes = {"all": 0, "64": 64, "200": 200}
    if minSize not in sizes:
        raise ApiError(400, "invalid_option", "Invalid minimum size")

    async def work(ws: Workspace):
        src = await save_pdf(file, ws)
        out = ws.file(".zip")
        await run_job(jobs.extract_images, src, str(out), stem_of(file), sizes[minSize])
        return send(out, f"{stem_of(file)}_images.zip", ws)

    return await handle(work)


RENDER_URL = os.getenv("RENDER_URL", "http://render:8000")


@app.post("/api/html-to-pdf")
async def html_to_pdf(file: UploadFile | None = File(None), url: str | None = Form(None)):
    """Delegated to the isolated Chromium service (render/), which enforces its own network policy."""
    import httpx

    if not file and not url:
        raise ApiError(400, "missing_input", "Provide an HTML file or a URL")

    async def work(ws: Workspace):
        if url:
            assert_public_url(url)  # fast, friendly error; render/ re-checks every request anyway
            data, files, name = {"url": url}, None, "webpage.pdf"
        else:
            src = await save_upload(file, ws, {".html", ".htm"})
            data, files, name = {}, {"file": ("page.html", src.read_bytes(), "text/html")}, f"{stem_of(file)}.pdf"
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                resp = await client.post(f"{RENDER_URL}/render", data=data, files=files)
        except httpx.HTTPError:
            raise ApiError(502, "processing_failed", "Renderer unavailable")
        if resp.status_code != 200:
            detail = resp.json().get("detail", {}) if resp.headers.get("content-type", "").startswith("application/json") else {}
            code = detail.get("code", "processing_failed") if isinstance(detail, dict) else "processing_failed"
            raise ApiError(resp.status_code if resp.status_code < 500 else 502, code, code)
        out = ws.file(".pdf")
        out.write_bytes(resp.content)
        return send(out, name, ws)

    return await handle(work)


# ---------- OCR / PDF/A ----------

@app.post("/api/ocr-pdf")
async def ocr_pdf(file: UploadFile = File(...), lang: str = Form("eng")):
    langs = parse_langs(lang)

    async def work(ws: Workspace):
        src = await save_pdf(file, ws, MAX_OCR_PAGES)
        out = ws.file(".pdf")
        await run(["ocrmypdf", "--skip-text", "--rotate-pages", "--deskew", "-l", langs,
                   "--output-type", "pdf", src, str(out)], timeout=600)
        return send(out, f"{stem_of(file)}_ocr.pdf", ws)

    return await handle(work)


@app.post("/api/pdf-to-pdfa")
async def pdf_to_pdfa(file: UploadFile = File(...)):
    async def work(ws: Workspace):
        src = await save_pdf(file, ws)
        out = ws.file(".pdf")
        # --tesseract-timeout 0 disables OCR while still producing a PDF/A
        await run(["ocrmypdf", "--skip-text", "--tesseract-timeout", "0", "--output-type", "pdfa-2",
                   src, str(out)], timeout=300)
        return send(out, f"{stem_of(file)}_pdfa.pdf", ws)

    return await handle(work)


@app.post("/api/image-to-text")
async def image_to_text(file: UploadFile = File(...), lang: str = Form("eng")):
    langs = parse_langs(lang)

    async def work(ws: Workspace):
        src = await save_upload(file, ws, IMAGES)
        base = ws.path / "ocr"
        await run(["tesseract", str(src), str(base), "-l", langs], timeout=180)
        if not base.with_suffix(".txt").read_text(errors="replace").strip():
            raise ApiError(422, "no_text", "No text found", name=file.filename or "")
        return send(base.with_suffix(".txt"), f"{stem_of(file)}.txt", ws)

    return await handle(work)


# ---------- Security ----------

@app.post("/api/protect-pdf")
async def protect_pdf(file: UploadFile = File(...), password: str = Form(...)):
    if not password:
        raise ApiError(400, "password_required", "Password required")

    async def work(ws: Workspace):
        src = await save_pdf(file, ws)
        out = ws.file(".pdf")
        await run_job(jobs.protect, src, str(out), password)
        return send(out, f"{stem_of(file)}_protected.pdf", ws)

    return await handle(work)


@app.post("/api/unlock-pdf")
async def unlock_pdf(file: UploadFile = File(...), password: str = Form("")):
    async def work(ws: Workspace):
        # encrypted by definition: skip save_pdf's encryption check
        src = await save_upload(file, ws, PDF)
        out = ws.file(".pdf")
        await run_job(jobs.unlock, str(src), str(out), password)
        return send(out, f"{stem_of(file)}_unlocked.pdf", ws)

    return await handle(work)


@app.post("/api/redact-pdf")
async def redact_pdf(
    file: UploadFile = File(...),
    editor: str | None = Form(None),
    terms: str = Form(""),
    redactEmails: bool = Form(False),
    redactPhones: bool = Form(False),
    redactIban: bool = Form(False),
    redactCards: bool = Form(False),
):
    boxes = parse_boxes(editor)
    term_list = [t.strip() for t in re.split(r"[,\n]", terms) if t.strip()][:200]
    flags = {"emails": redactEmails, "phones": redactPhones, "iban": redactIban, "cards": redactCards}
    presets = [p for p, on in flags.items() if on and p in PRESETS]

    async def work(ws: Workspace):
        src = await save_pdf(file, ws)
        out = ws.file(".pdf")
        count = await run_job(jobs.redact, src, str(out), boxes, term_list, presets)
        resp = send(out, f"{stem_of(file)}_redacted.pdf", ws)
        resp.headers["X-Redaction-Count"] = str(count)
        return resp

    return await handle(work)


# ---------- Compare ----------

@app.post("/api/compare-pdf")
async def compare_pdf(file_a: UploadFile = File(...), file_b: UploadFile = File(...)):
    async def work(ws: Workspace):
        src_a = await save_pdf(file_a, ws)
        src_b = await save_pdf(file_b, ws)
        out = ws.file(".pdf")
        await run_job(jobs.compare, src_a, src_b, str(out), file_a.filename or "A", file_b.filename or "B")
        return send(out, "comparison.pdf", ws)

    return await handle(work)


# ---------- Images ----------

@app.post("/api/upscale-image")
async def upscale_image(file: UploadFile = File(...), scale: int = Form(2)):
    if scale not in jobs.UPSCALE_MAX_INPUT_PIXELS:
        raise ApiError(400, "invalid_option", "Scale must be 2 or 4")

    async def work(ws: Workspace):
        src = await save_upload(file, ws, IMAGES)
        out = ws.file(".png")
        await run_job(jobs.upscale, str(src), str(out), scale)
        return send(out, f"{stem_of(file)}_x{scale}.png", ws)

    return await handle(work)


MAX_SCAN_FILES = 30


@app.post("/api/scan-to-pdf")
async def scan_to_pdf(files: list[UploadFile] = File(...), filter: str = Form("color"), pageSize: str = Form("a4")):
    if filter not in ("color", "gray", "bw") or pageSize not in ("fit", "a4"):
        raise ApiError(400, "invalid_option", "Invalid option")
    if len(files) > MAX_SCAN_FILES:
        raise ApiError(400, "too_many_files", "Too many files", max=MAX_SCAN_FILES)

    async def work(ws: Workspace):
        srcs = [str(await save_upload(f, ws, IMAGES)) for f in files]
        out = ws.file(".pdf")
        await run_job(jobs.scan_to_pdf, srcs, str(out), filter, pageSize)
        return send(out, "scan.pdf", ws)

    return await handle(work)
