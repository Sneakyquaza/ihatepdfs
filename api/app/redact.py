"""True redaction: content under each area is removed from the file, not just covered."""

import json
import re

import pymupdf
from .errors import ApiError

PRESETS: dict[str, re.Pattern] = {
    "emails": re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"),
    # Any run of digits with optional single separators ("01 6 1 38 0 5 75", "+33 (0)6.12…");
    # deliberately loose, then filtered by _is_phone.
    "phones": re.compile(r"(?<![\w+])(?:(?:\+|00)\d{1,3}[ .-]?)?(?:\(0\)[ .-]?)?\d(?:[ .-]?\d){7,16}(?!\w)"),
    "iban": re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b"),
    "cards": re.compile(r"\b(?:\d[ -]?){12,18}\d\b"),
}
PHONE_LABEL = re.compile(r"(?:t[ée]l[ée]?(?:phone)?|phone|mobile|portable|port|fax|gsm|whatsapp)\W{0,6}$", re.IGNORECASE)
MAX_BOXES = 2000


def _luhn(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def _is_phone(match: str, before: str) -> bool:
    digits = re.sub(r"\D", "", match)
    if not 9 <= len(digits) <= 15:
        return False
    # oddly spaced digit runs are only phones when they look like one: trunk/intl prefix or a label before them
    if match.startswith(("0", "+")) or PHONE_LABEL.search(before):
        return True
    groups = re.split(r"[ .-]+", match)
    return all(len(g) >= 2 for g in groups)


def _accept(preset: str, match: str, before: str) -> bool:
    if preset == "phones":
        return _is_phone(match, before)
    if preset == "cards":
        digits = re.sub(r"\D", "", match)
        return 13 <= len(digits) <= 19 and _luhn(digits)
    return True


def find_matches(text: str, presets: list[str], terms: list[str]) -> list[tuple[int, int]]:
    """Character spans of `text` to redact, for the enabled presets and literal (case-insensitive) terms."""
    patterns: list[tuple[str | None, re.Pattern]] = [(p, PRESETS[p]) for p in presets]
    patterns += [(None, re.compile(re.escape(t), re.IGNORECASE)) for t in terms]
    spans = []
    for preset, pattern in patterns:
        for m in pattern.finditer(text):
            if m.start() == m.end():
                continue
            if preset and not _accept(preset, m.group(), text[max(0, m.start() - 30):m.start()]):
                continue
            spans.append((m.start(), m.end()))
    return spans


def parse_boxes(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except ValueError:
        raise ApiError(400, "invalid_areas", "Invalid areas")
    if not isinstance(data, list) or len(data) > MAX_BOXES:
        raise ApiError(400, "invalid_areas", "Invalid areas")
    boxes = []
    for b in data:
        try:
            box = {k: float(b[k]) for k in ("x", "y", "w", "h")}
            box["page"] = int(b["page"])
        except (KeyError, TypeError, ValueError):
            raise ApiError(400, "invalid_areas", "Invalid areas")
        boxes.append(box)
    return boxes


def _text_hits(page: pymupdf.Page, presets: list[str], terms: list[str]) -> list[pymupdf.Rect]:
    """Match against the page's words joined by spaces; return the rects of every touched word."""
    words = page.get_text("words")
    spans: list[tuple[int, int, pymupdf.Rect]] = []
    parts: list[str] = []
    pos = 0
    for w in words:
        text = w[4]
        spans.append((pos, pos + len(text), pymupdf.Rect(w[:4])))
        parts.append(text)
        pos += len(text) + 1
    rects = []
    for start, end in find_matches(" ".join(parts), presets, terms):
        rects.extend(r for s, e, r in spans if s < end and e > start)
    return rects


def redact(src: str, out: str, boxes: list[dict], terms: list[str], presets: list[str]) -> int:
    count = 0
    with pymupdf.open(src) as doc:
        if doc.needs_pass:
            raise ApiError(400, "encrypted", "PDF is password protected")
        for pno, page in enumerate(doc):
            rects = []
            # boxes are fractions of the page as displayed (rotation applied); annotations use unrotated coords
            W, H = page.rect.width, page.rect.height
            for b in boxes:
                if b["page"] == pno:
                    r = pymupdf.Rect(b["x"] * W, b["y"] * H, (b["x"] + b["w"]) * W, (b["y"] + b["h"]) * H)
                    rects.append(r * page.derotation_matrix)
            if presets or terms:
                rects += _text_hits(page, presets, terms)
            for r in rects:
                page.add_redact_annot(r, fill=(0, 0, 0))
            if rects:
                page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS)
                count += len(rects)
        if not count:
            raise ApiError(400, "nothing_to_redact", "Nothing to redact")
        # drop metadata, hidden text, JS, attachments, links… that could leak what was redacted
        doc.scrub()
        doc.save(out, garbage=4, deflate=True, clean=True)
    return count
