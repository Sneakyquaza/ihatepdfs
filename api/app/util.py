"""Shared helpers: temp workspaces, bounded uploads, subprocess runner, responses."""

import asyncio
import ipaddress
import os
import re
import shutil
import socket
import subprocess
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "100")) * 1024 * 1024
CHUNK = 1024 * 1024

MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".zip": "application/zip",
    ".txt": "text/plain; charset=utf-8",
}


class Workspace:
    """Per-request temp dir, removed after the response is sent."""

    def __init__(self) -> None:
        self.path = Path(tempfile.mkdtemp(prefix="ilp_"))

    def file(self, suffix: str) -> Path:
        return self.path / f"{uuid.uuid4().hex}{suffix}"

    def cleanup(self) -> None:
        shutil.rmtree(self.path, ignore_errors=True)


def suffix_of(upload: UploadFile) -> str:
    return Path(upload.filename or "").suffix.lower()


def stem_of(upload: UploadFile, default: str = "file") -> str:
    stem = Path(upload.filename or default).stem
    stem = re.sub(r"[^\w\-. ]+", "_", stem).strip() or default
    return stem[:120]


async def save_upload(upload: UploadFile, ws: Workspace, allowed: set[str] | None = None) -> Path:
    suffix = suffix_of(upload)
    if allowed is not None and suffix not in allowed:
        raise HTTPException(400, f"Unsupported file type '{suffix or '?'}'. Allowed: {', '.join(sorted(allowed))}")
    dest = ws.file(suffix)
    size = 0
    with dest.open("wb") as out:
        while chunk := await upload.read(CHUNK):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(413, f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)")
            out.write(chunk)
    if size == 0:
        raise HTTPException(400, "Empty file")
    return dest


async def run(cmd: list[str], timeout: int = 180, env: dict | None = None) -> None:
    def _run() -> subprocess.CompletedProcess:
        return subprocess.run(cmd, capture_output=True, timeout=timeout, env={**os.environ, **(env or {})})

    try:
        proc = await asyncio.to_thread(_run)
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Processing timed out")
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout).decode(errors="replace")[-600:]
        raise HTTPException(500, f"{Path(cmd[0]).name} failed: {tail}")


def send(path: Path, filename: str, ws: Workspace) -> FileResponse:
    if not path.exists():
        ws.cleanup()
        raise HTTPException(500, "No output produced")
    media = MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media, filename=filename, background=BackgroundTask(ws.cleanup))


def assert_public_url(url: str) -> None:
    """Reject non-http(s) URLs and hosts resolving to private/loopback/link-local ranges (SSRF guard)."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(400, "Only public http(s) URLs are allowed")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror:
        raise HTTPException(400, "Cannot resolve host")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise HTTPException(400, "URL points to a non-public address")
