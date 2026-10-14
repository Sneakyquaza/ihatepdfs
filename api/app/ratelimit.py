"""In-memory per-IP rate limiting for the processing endpoints (single uvicorn worker)."""

import os
import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse

WINDOW_S = int(os.getenv("RATE_LIMIT_WINDOW_S", "600"))
MAX_PER_WINDOW = int(os.getenv("RATE_LIMIT_REQUESTS", "60"))
MAX_CONCURRENT_PER_IP = int(os.getenv("RATE_LIMIT_CONCURRENT", "3"))

_hits: dict[str, deque[float]] = defaultdict(deque)
_active: dict[str, int] = defaultdict(int)


def client_ip(request: Request) -> str:
    # Set (overwritten, never appended) by the Apache front proxy, so clients cannot spoof it.
    return request.headers.get("x-client-ip") or (request.client.host if request.client else "unknown")


async def _too_many(request: Request, code: str, retry_after: int) -> JSONResponse:
    # Drain the upload first: replying mid-upload resets the connection and the proxy turns it into a 500.
    async for _ in request.stream():
        pass
    return JSONResponse({"detail": {"code": code, "message": code}}, status_code=429, headers={"Retry-After": str(retry_after)})


async def rate_limit_middleware(request: Request, call_next):
    if request.method != "POST" or not request.url.path.startswith("/api/"):
        return await call_next(request)

    ip = client_ip(request)
    now = time.monotonic()
    hits = _hits[ip]
    while hits and now - hits[0] > WINDOW_S:
        hits.popleft()
    if len(hits) >= MAX_PER_WINDOW:
        return await _too_many(request, "rate_limited", int(WINDOW_S - (now - hits[0])) + 1)
    if _active[ip] >= MAX_CONCURRENT_PER_IP:
        return await _too_many(request, "too_many_concurrent", 5)

    hits.append(now)
    _active[ip] += 1
    try:
        return await call_next(request)
    finally:
        _active[ip] -= 1
        if not _active[ip]:
            del _active[ip]
        if not hits:
            _hits.pop(ip, None)
