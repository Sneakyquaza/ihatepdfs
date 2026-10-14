"""True redaction: content under each area is removed from the file, not just covered."""

import json
import re

import fitz  # PyMuPDF
from fastapi import HTTPException

PRESETS: dict[str, re.Pattern] = {
    "emails": re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"),
    # loose on purpose; filtered by digit count below
    "phones": re.compile(r"(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(0\)[\s.-]?)?\d{1,4}(?:[\s.-]?\d{2,4}){2,5}"),
    "iban": re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b"),
    "cards": re.compile(r"\b(?:\d[ -]?){12,18}\d\b"),
}
MAX_BOXES = 2000


def _luhn(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def _accept(preset: str, match: str) -> bool:
    digits = re.sub(r"\D", "", match)
    if preset == "phones":
        return 9 <= len(digits) <= 15
    if preset == "cards":
        return 13 <= len(digits) <= 19 and _luhn(digits)
    return True


def parse_boxes(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "Invalid areas")
    if not isinstance(data, list) or len(data) > MAX_BOXES:
        raise HTTPException(400, "Invalid areas")
    boxes = []
    for b in data:
        try:
            box = {k: float(b[k]) for k in ("x", "y", "w", "h")}
            box["page"] = int(b["page"])
        except (KeyError, TypeError, ValueError):
            raise HTTPException(400, "Invalid areas")
        boxes.append(box)
    return boxes


def _text_hits(page: fitz.Page, patterns: list[tuple[str | None, re.Pattern]]) -> list[fitz.Rect]:
    """Match patterns against the page's words joined by spaces; return the rects of every touched word."""
    words = page.get_text("words")
    spans: list[tuple[int, int, fitz.Rect]] = []
    parts: list[str] = []
    pos = 0
    for w in words:
        text = w[4]
        spans.append((pos, pos + len(text), fitz.Rect(w[:4])))
        parts.append(text)
        pos += len(text) + 1
    joined = " ".join(parts)
    rects = []
    for preset, pattern in patterns:
        for m in pattern.finditer(joined):
            if m.start() == m.end() or (preset and not _accept(preset, m.group())):
                continue
            rects.extend(r for s, e, r in spans if s < m.end() and e > m.start())
    return rects


def redact(src: str, out: str, boxes: list[dict], terms: list[str], presets: list[str]) -> int:
    patterns: list[tuple[str | None, re.Pattern]] = [(p, PRESETS[p]) for p in presets]
    patterns += [(None, re.compile(re.escape(t), re.IGNORECASE)) for t in terms]
    count = 0
    with fitz.open(src) as doc:
        if doc.needs_pass:
            raise HTTPException(400, "PDF is password protected, unlock it first")
        for pno, page in enumerate(doc):
            rects = []
            # boxes are fractions of the page as displayed (rotation applied); annotations use unrotated coords
            W, H = page.rect.width, page.rect.height
            for b in boxes:
                if b["page"] == pno:
                    r = fitz.Rect(b["x"] * W, b["y"] * H, (b["x"] + b["w"]) * W, (b["y"] + b["h"]) * H)
                    rects.append(r * page.derotation_matrix)
            if patterns:
                rects += _text_hits(page, patterns)
            for r in rects:
                page.add_redact_annot(r, fill=(0, 0, 0))
            if rects:
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)
                count += len(rects)
        if not count:
            raise HTTPException(400, "Nothing to redact: draw areas or enter text that appears in the document")
        # drop metadata, hidden text, JS, attachments, links… that could leak what was redacted
        doc.scrub()
        doc.save(out, garbage=4, deflate=True, clean=True)
    return count
