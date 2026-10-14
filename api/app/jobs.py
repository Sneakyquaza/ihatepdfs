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


def pdf_to_excel(src: str, out: str) -> None:
    import pdfplumber
    from openpyxl import Workbook

    wb = Workbook()
    wb.remove(wb.active)
    with pdfplumber.open(src) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables()
            if tables:
                for tno, table in enumerate(tables, start=1):
                    sheet = wb.create_sheet(f"P{pno}-T{tno}"[:31])
                    for row in table:
                        sheet.append([c if c is not None else "" for c in row])
            else:
                text = page.extract_text() or ""
                if text.strip():
                    sheet = wb.create_sheet(f"P{pno}-text"[:31])
                    for line in text.splitlines():
                        sheet.append(line.split())
    if not wb.sheetnames:
        wb.create_sheet("Empty")
    wb.save(out)


_FONT_ALIASES = {"helvetica": "Arial", "arialmt": "Arial", "times": "Times New Roman", "timesnewromanpsmt": "Times New Roman",
                 "courier": "Courier New", "couriernewpsmt": "Courier New", "symbol": "Symbol"}


def _pptx_font(name: str) -> str:
    """'ABCDEF+Calibri-Bold' -> 'Calibri'; PDF base-14 names -> common Office fonts."""
    name = name.split("+", 1)[-1]
    family = name.split("-", 1)[0].split(",", 1)[0]
    alias = _FONT_ALIASES.get(family.lower())
    if alias:
        return alias
    for suffix in ("MT", "PSMT", "PS"):
        if family.endswith(suffix) and len(family) > len(suffix):
            family = family[: -len(suffix)]
    return family or "Arial"


def _xml_safe(text: str) -> str:
    return "".join(ch for ch in text if ch in "\t" or ord(ch) >= 0x20)


def pdf_to_powerpoint(src: str, out: str, tmp_dir: str) -> None:
    """Editable slides: page artwork as a background picture, horizontal text re-created as real text boxes."""
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.text import MSO_AUTO_SIZE
    from pptx.util import Emu, Pt

    emu = 12700  # EMU per point
    prs = Presentation()
    with pymupdf.open(src) as doc:
        first = doc[0].rect
        prs.slide_width, prs.slide_height = Emu(int(first.width * emu)), Emu(int(first.height * emu))
        blank = prs.slide_layouts[6]
        for i, page in enumerate(doc):
            sx, sy = first.width / page.rect.width, first.height / page.rect.height
            lines = []
            # rotated pages keep everything in the picture: their text coordinates don't map to the slide
            if page.rotation == 0:
                for block in page.get_text("dict", flags=pymupdf.TEXTFLAGS_TEXT)["blocks"]:
                    for line in block.get("lines", []):
                        horizontal = abs(line["dir"][1]) < 1e-3 and line["dir"][0] > 0
                        spans = [sp for sp in line["spans"] if sp["text"].strip()]
                        if not horizontal or not spans:
                            continue
                        lines.append((pymupdf.Rect(line["bbox"]), line["spans"]))
                        for sp in line["spans"]:
                            page.add_redact_annot(pymupdf.Rect(sp["bbox"]), fill=False)
                if lines:
                    # strip only the text we re-create; images and vector art stay in the background
                    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                                          graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                                          text=pymupdf.PDF_REDACT_TEXT_REMOVE)

            slide = prs.slides.add_slide(blank)
            img = Path(tmp_dir) / f"slide{i}.png"
            page.get_pixmap(dpi=150).save(img)
            slide.shapes.add_picture(str(img), 0, 0, prs.slide_width, prs.slide_height)

            for rect, spans in lines:
                box = slide.shapes.add_textbox(
                    Emu(int(rect.x0 * sx * emu)), Emu(int(rect.y0 * sy * emu)),
                    Emu(int((rect.width * sx * 1.15 + 4) * emu)), Emu(int(rect.height * sy * emu)),
                )
                tf = box.text_frame
                tf.word_wrap = False
                tf.auto_size = MSO_AUTO_SIZE.NONE
                tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
                para = tf.paragraphs[0]
                for sp in spans:
                    text = _xml_safe(sp["text"])
                    if not text:
                        continue
                    run = para.add_run()
                    run.text = text
                    f = run.font
                    f.size = Pt(max(1.0, sp["size"] * sy))
                    f.bold = bool(sp["flags"] & 16)
                    f.italic = bool(sp["flags"] & 2)
                    f.name = _pptx_font(sp["font"])
                    c = sp["color"]
                    f.color.rgb = RGBColor((c >> 16) & 255, (c >> 8) & 255, c & 255)
    prs.save(out)


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
