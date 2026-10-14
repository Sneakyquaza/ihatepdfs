"""HTML/URL -> PDF with headless Chromium.

Every request the page makes (document, scripts, images…) is intercepted: only http(s) to public IPs
is allowed, and we perform the fetch ourselves against the IP we just validated (Host header + TLS SNI
keep the original name), so DNS rebinding can't sneak in a private address. Redirects are followed by
us, hop by hop: Chromium follows a fulfilled 3xx *without* re-entering the route handler, so we never
hand it one. As a backstop Chromium has no network path of its own (dead proxy, loopback included,
WebRTC limited to proxied traffic): anything that escaped interception simply fails.
"""

import asyncio
import ipaddress
import os
import socket
from urllib.parse import urlsplit, urlunsplit

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from playwright.async_api import Browser, Route, async_playwright

MAX_RESOURCE_BYTES = 20 * 1024 * 1024
MAX_REQUESTS = 300
PAGE_TIMEOUT_MS = int(os.getenv("PAGE_TIMEOUT_MS", "30000"))
MAX_HTML_BYTES = 10 * 1024 * 1024
MAX_REDIRECTS = 5
CHROMIUM_ARGS = [
    "--disable-dev-shm-usage",
    "--proxy-server=http://127.0.0.1:9",  # nothing listens there
    "--proxy-bypass-list=<-loopback>",  # don't exempt localhost from the dead proxy
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    "--dns-prefetch-disable",
]
HOP_HEADERS = {"content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"}
SLOTS = asyncio.Semaphore(int(os.getenv("MAX_RENDERS", "2")))

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
_browser: Browser | None = None
_client = httpx.AsyncClient(follow_redirects=False, timeout=15, verify=True)


class Blocked(Exception):
    pass


def _err(status: int, code: str) -> HTTPException:
    return HTTPException(status, {"code": code, "message": code})


async def resolve_public(host: str, port: int) -> str:
    """Resolve once and return an IP only if every address is public."""
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise Blocked("unresolvable_host")
    ips = {info[4][0] for info in infos}
    if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
        raise Blocked("private_url")
    return sorted(ips)[0]


async def fetch_following(url: str, method: str, headers: dict, body: bytes | None) -> tuple[httpx.Response, bytes, str]:
    """pinned_fetch + manual redirects (each hop re-validated). Returns (final response, body, final URL)."""
    for _ in range(MAX_REDIRECTS + 1):
        resp, data = await pinned_fetch(url, method, headers, body)
        location = resp.headers.get("location")
        if resp.status_code not in (301, 302, 303, 307, 308) or not location:
            return resp, data, url
        url = str(httpx.URL(url).join(location))
        if resp.status_code == 303 or (resp.status_code in (301, 302) and method == "POST"):
            method, body = "GET", None
    raise Blocked("too_many_redirects")


async def pinned_fetch(url: str, method: str, headers: dict, body: bytes | None) -> tuple[httpx.Response, bytes]:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise Blocked("invalid_url")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    ip = await resolve_public(parts.hostname, port)
    host_ip = f"[{ip}]" if ":" in ip else ip
    netloc = f"{host_ip}:{parts.port}" if parts.port else host_ip
    pinned = urlunsplit((parts.scheme, netloc, parts.path or "/", parts.query, ""))
    headers = {k: v for k, v in headers.items() if k.lower() not in ("host", "connection", "accept-encoding")}
    headers["host"] = parts.netloc.split("@")[-1]
    req = _client.build_request(method, pinned, headers=headers, content=body,
                                extensions={"sni_hostname": parts.hostname})
    resp = await _client.send(req, stream=True)
    data = bytearray()
    async for chunk in resp.aiter_bytes():
        data += chunk
        if len(data) > MAX_RESOURCE_BYTES:
            await resp.aclose()
            raise Blocked("too_large")
    await resp.aclose()
    return resp, bytes(data)


async def get_browser() -> Browser:
    global _browser
    if _browser is None or not _browser.is_connected():
        pw = await async_playwright().start()
        _browser = await pw.chromium.launch(args=CHROMIUM_ARGS)
    return _browser


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/render")
async def render(url: str | None = Form(None), file: UploadFile | None = File(None)):
    if not url and not file:
        raise _err(400, "missing_input")
    html = None
    if not url:
        html = (await file.read(MAX_HTML_BYTES + 1)).decode(errors="replace")
        if len(html) > MAX_HTML_BYTES:
            raise _err(413, "file_too_large")

    async with SLOTS:
        browser = await get_browser()
        context = await browser.new_context(java_script_enabled=True, accept_downloads=False,
                                            service_workers="block", viewport={"width": 1280, "height": 900})
        main_error: list[str] = []
        count = 0

        async def route(route: Route):
            nonlocal count
            req = route.request
            if req.url.startswith(("data:", "blob:", "about:")):
                return await route.continue_()
            count += 1
            try:
                if count > MAX_REQUESTS:
                    raise Blocked("too_many_requests")
                resp, body, _ = await fetch_following(req.url, req.method, await req.all_headers(), req.post_data_buffer)
            except Blocked as e:
                if req.is_navigation_request() and req.frame == page.main_frame:
                    main_error.append(str(e))
                return await route.abort("blockedbyclient")
            except httpx.HTTPError:
                if req.is_navigation_request() and req.frame == page.main_frame:
                    main_error.append("unreachable")
                return await route.abort("failed")
            # httpx already decoded the body: drop encoding/length headers that no longer match it
            headers = {k: v for k, v in resp.headers.items() if k.lower() not in HOP_HEADERS}
            await route.fulfill(status=resp.status_code, headers=headers, body=body)

        try:
            page = await context.new_page()
            await context.route("**/*", route)
            if url:
                try:
                    _, _, url = await fetch_following(url, "GET", {}, None)
                except Blocked as e:
                    code = str(e)
                    raise _err(400, code if code in ("private_url", "invalid_url", "unresolvable_host") else "unreachable")
                except httpx.HTTPError:
                    raise _err(400, "unreachable")
                try:
                    await page.goto(url, wait_until="networkidle", timeout=PAGE_TIMEOUT_MS)
                except Exception:
                    if main_error:
                        raise _err(400, main_error[0] if main_error[0] in ("private_url", "invalid_url", "unresolvable_host") else "unreachable")
                    # slow trackers keep the network busy: render whatever loaded
                    try:
                        await page.wait_for_load_state("load", timeout=5000)
                    except Exception:
                        raise _err(504, "timeout")
            else:
                await page.set_content(html, wait_until="networkidle", timeout=PAGE_TIMEOUT_MS)
            # a blocked redirect of the main document doesn't always make goto() fail: report it anyway
            if url and main_error:
                code = main_error[0]
                raise _err(400, code if code in ("private_url", "invalid_url", "unresolvable_host") else "unreachable")
            pdf = await page.pdf(format="A4", print_background=True,
                                 margin={"top": "12mm", "bottom": "12mm", "left": "10mm", "right": "10mm"})
        finally:
            await context.close()
    return Response(pdf, media_type="application/pdf")
