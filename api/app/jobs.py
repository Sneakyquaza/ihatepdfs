"""CPU-heavy jobs, executed in isolated processes by `isolate.run_job`.

Every function here is module-level and takes plain values (paths as str), so it can be pickled
by reference. Importing this module also preloads the heavy libraries in the forkserver.
"""

import difflib
import os
from pathlib import Path

import pikepdf
import pymupdf

from .errors import ApiError
from .redact import redact  # noqa: F401  (re-exported as a job)

MAX_PAGES = int(os.getenv("MAX_PAGES", "500"))
UPSCALE_MAX_INPUT_PIXELS = {2: 2_500_000, 4: 800_000}


def check_pages(src: str, limit: int = MAX_PAGES) -> int:
    """Reject PDFs with more pages than `limit` before handing them to a slow tool."""
    with pymupdf.open(src) as doc:
        if doc.needs_pass:
            raise ApiError(400, "encrypted", "PDF is password protected")
        if doc.page_count == 0:
            raise ApiError(400, "no_pages", "PDF has no pages")
        if doc.page_count > limit:
            raise ApiError(413, "too_many_pages", "Too many pages", max=limit)
        return doc.page_count


def repair(src: str, out: str) -> bool:
    """Rewrite through qpdf; returns False when the file is too broken (caller falls back to Ghostscript)."""
    try:
        with pikepdf.open(src) as pdf:
            pdf.save(out)
        return True
    except pikepdf.PasswordError:
        raise
    except Exception:
        return False


def pdf_to_word(src: str, out: str) -> None:
    from pdf2docx import Converter

    cv = Converter(src)
    try:
        cv.convert(out)
    finally:
        cv.close()


def pdf_to_excel(src: str, out: str, tmp_dir: str) -> None:
    from .tables import convert

    convert(src, out, tmp_dir)


def pdf_to_powerpoint(src: str, out: str, tmp_dir: str) -> None:
    from .pptx_convert import convert

    convert(src, out, tmp_dir)


def protect(src: str, out: str, password: str) -> None:
    with pikepdf.open(src) as pdf:
        pdf.save(out, encryption=pikepdf.Encryption(owner=password, user=password, R=6))


def unlock(src: str, out: str, password: str) -> None:
    try:
        with pikepdf.open(src, password=password) as pdf:
            pdf.save(out)
    except pikepdf.PasswordError:
        raise ApiError(400, "wrong_password", "Wrong password")


def flatten(src: str, out: str) -> None:
    with pikepdf.open(src) as pdf:
        # form fields need appearance streams before they can be burnt into the page
        pdf.generate_appearance_streams()
        pdf.flatten_annotations("all")
        if "/AcroForm" in pdf.Root:
            del pdf.Root.AcroForm
        pdf.save(out)


def _words(doc: pymupdf.Document) -> list[tuple[int, pymupdf.Rect, str]]:
    return [(pno, pymupdf.Rect(w[:4]), w[4]) for pno, page in enumerate(doc) for w in page.get_text("words")]


def compare(src_a: str, src_b: str, out: str, name_a: str, name_b: str) -> None:
    with pymupdf.open(src_a) as a, pymupdf.open(src_b) as b, pymupdf.open() as result:
        wa, wb = _words(a), _words(b)
        removed: dict[int, list[pymupdf.Rect]] = {}
        added: dict[int, list[pymupdf.Rect]] = {}
        sm = difflib.SequenceMatcher(None, [w[2] for w in wa], [w[2] for w in wb], autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag in ("delete", "replace"):
                for pno, rect, _ in wa[i1:i2]:
                    removed.setdefault(pno, []).append(rect)
            if tag in ("insert", "replace"):
                for pno, rect, _ in wb[j1:j2]:
                    added.setdefault(pno, []).append(rect)

        gap, header = 24, 28
        for i in range(max(a.page_count, b.page_count)):
            ra = a[i].rect if i < a.page_count else pymupdf.Rect(0, 0, 0, 0)
            rb = b[i].rect if i < b.page_count else pymupdf.Rect(0, 0, 0, 0)
            width = ra.width + rb.width + gap
            height = max(ra.height, rb.height) + header
            page = result.new_page(width=width, height=height)
            page.insert_text((8, 18), f"A: {name_a}  (page {i + 1})", fontsize=10, color=(0.7, 0, 0))
            page.insert_text((ra.width + gap + 8, 18), f"B: {name_b}  (page {i + 1})", fontsize=10, color=(0, 0.5, 0))
            if i < a.page_count:
                page.show_pdf_page(pymupdf.Rect(0, header, ra.width, header + ra.height), a, i)
                for r in removed.get(i, []):
                    page.draw_rect(r + (0, header, 0, header), color=None, fill=(1, 0, 0), fill_opacity=0.3)
            if i < b.page_count:
                ox = ra.width + gap
                page.show_pdf_page(pymupdf.Rect(ox, header, ox + rb.width, header + rb.height), b, i)
                for r in added.get(i, []):
                    page.draw_rect(r + (ox, header, ox, header), color=None, fill=(0, 0.8, 0), fill_opacity=0.3)
            page.draw_line((ra.width + gap / 2, 0), (ra.width + gap / 2, height), color=(0.6, 0.6, 0.6))
        result.save(out)


def upscale(src: str, out: str, scale: int) -> None:
    from PIL import Image, ImageFilter

    with Image.open(src) as im:
        if im.width * im.height > UPSCALE_MAX_INPUT_PIXELS[scale]:
            raise ApiError(400, "image_too_large", "Image too large", scale=scale)
        im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
        model = Path(os.getenv("MODELS_DIR", "/models")) / f"FSRCNN_x{scale}.pb"
        try:
            import cv2
            import numpy as np

            if not model.exists():
                raise FileNotFoundError(model)
            sr = cv2.dnn_superres.DnnSuperResImpl_create()
            sr.readModel(str(model))
            sr.setModel("fsrcnn", scale)
            rgb = np.array(im.convert("RGB"))[:, :, ::-1]
            up = Image.fromarray(sr.upsample(rgb)[:, :, ::-1])
            if im.mode == "RGBA":
                up.putalpha(im.getchannel("A").resize(up.size, Image.LANCZOS))
        except (ImportError, AttributeError, FileNotFoundError):
            up = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
            up = up.filter(ImageFilter.UnsharpMask(radius=2, percent=80, threshold=2))
        up.save(out, optimize=True)


def extract_images(src: str, out: str, name: str, min_size: int) -> None:
    from .extract_images import extract

    extract(src, out, name, min_size)


def pdf_to_markdown(src: str, out: str, name: str, tmp_dir: str) -> None:
    from .markdown import convert

    convert(src, out, name, tmp_dir)


def scan_to_pdf(paths: list[str], out: str, mode: str, page_size: str) -> None:
    from .scan import convert

    convert(paths, out, mode, page_size)
