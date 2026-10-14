"""Run CPU-heavy library code in a throwaway process with a wall-clock timeout and a memory cap.

In-process work (PyMuPDF, pdf2docx, WeasyPrint, OpenCV…) can't be interrupted from a thread, so a
hostile or huge file could hold a job slot forever. Each job runs in a child forked from a
forkserver that has already imported the heavy libraries (`app.jobs`), so starting one is cheap.
"""

import asyncio
import logging
import multiprocessing as mp
import os
import resource
import traceback
from typing import Any, Callable

from .errors import ApiError

JOB_TIMEOUT_S = int(os.getenv("JOB_TIMEOUT_S", "300"))
JOB_MEMORY_MB = int(os.getenv("JOB_MEMORY_MB", "4096"))

_ctx = mp.get_context("forkserver")
_ctx.set_forkserver_preload(["app.jobs"])
log = logging.getLogger("uvicorn.error")


def _child(conn, fn: Callable, args: tuple) -> None:
    # Cap address space so a decompression bomb fails with MemoryError instead of eating the host.
    limit = JOB_MEMORY_MB * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
    import pikepdf
    import pymupdf

    try:
        conn.send(("ok", fn(*args)))
    except ApiError as e:
        conn.send(("api", e.status_code, e.detail))
    except pikepdf.PasswordError:
        conn.send(("api", 400, {"code": "encrypted", "message": "PDF is password protected"}))
    except (pikepdf.PdfError, pymupdf.FileDataError) as e:
        conn.send(("api", 400, {"code": "invalid_pdf", "message": f"Damaged or invalid PDF: {e}"}))
    except MemoryError:
        conn.send(("api", 413, {"code": "too_complex", "message": "File too complex to process"}))
    except Exception:
        conn.send(("err", traceback.format_exc()))
    finally:
        conn.close()


def _run(fn: Callable, args: tuple, timeout: int) -> Any:
    parent, child = _ctx.Pipe(duplex=False)
    proc = _ctx.Process(target=_child, args=(child, fn, args), daemon=True)
    proc.start()
    child.close()
    try:
        if not parent.poll(timeout):
            raise ApiError(504, "timeout", "Processing timed out")
        try:
            msg = parent.recv()
        except EOFError:  # child died without answering (killed, segfault…)
            log.error("job %s died with exit code %s", fn.__name__, proc.exitcode)
            raise ApiError(500, "processing_failed", "Processing failed")
    finally:
        if proc.is_alive():
            proc.kill()
        proc.join(5)
        parent.close()
    if msg[0] == "ok":
        return msg[1]
    if msg[0] == "api":
        _, status, detail = msg
        raise ApiError(status, detail["code"], detail.get("message", ""), **detail.get("params", {}))
    log.error("job %s failed:\n%s", fn.__name__, msg[1])
    raise ApiError(500, "processing_failed", "Processing failed")


async def run_job(fn: Callable, *args: Any, timeout: int = JOB_TIMEOUT_S) -> Any:
    """`fn` must be a module-level function of app.jobs (it is pickled by reference)."""
    return await asyncio.to_thread(_run, fn, args, timeout)
