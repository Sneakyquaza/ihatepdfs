"""PDF -> Markdown: headings from font-size ranking, emphasis, lists and tables, in reading order."""

import re
from collections import Counter

import pymupdf

from .errors import ApiError
from .tables import _ocr_if_scanned

BULLET = re.compile(r"^\s*[•◦▪▫●○·‣–—*-]\s+")
NUMBERED = re.compile(r"^\s*\d{1,3}[.)]\s+")
MAX_HEADING_LEVELS = 4


def _body_size(doc: pymupdf.Document) -> float:
    sizes: Counter[float] = Counter()
    for page in doc:
        for b in page.get_text("dict")["blocks"]:
            for line in b.get("lines", []):
                for s in line["spans"]:
                    sizes[round(s["size"] * 2) / 2] += len(s["text"].strip())
    return sizes.most_common(1)[0][0] if sizes else 11.0


def _heading_levels(doc: pymupdf.Document, body: float) -> dict[float, int]:
    larger: set[float] = set()
    for page in doc:
        for b in page.get_text("dict")["blocks"]:
            for line in b.get("lines", []):
                for s in line["spans"]:
                    if s["text"].strip() and s["size"] > body * 1.15:
                        larger.add(round(s["size"] * 2) / 2)
    ranked = sorted(larger, reverse=True)[:MAX_HEADING_LEVELS]
    return {size: i + 1 for i, size in enumerate(ranked)}


def _is_bold(span: dict) -> bool:
    return bool(span["flags"] & 16) or "bold" in span["font"].lower()


def _is_italic(span: dict) -> bool:
    return bool(span["flags"] & 2) or "italic" in span["font"].lower() or "oblique" in span["font"].lower()


def _render(runs: list[tuple[bool, bool, str]]) -> str:
    merged: list[list] = []
    for bold, italic, text in runs:
        if merged and merged[-1][0] == bold and merged[-1][1] == italic:
            merged[-1][2] += text
        else:
            merged.append([bold, italic, text])
    out = ""
    for bold, italic, text in merged:
        core = text.strip()
        if not core:
            out += text
            continue
        mark = ("**" if bold else "") + ("*" if italic else "")
        lead, trail = text[: len(text) - len(text.lstrip())], text[len(text.rstrip()):]
        out += f"{lead}{mark}{core}{mark[::-1]}{trail}"
    return out


def _block_markdown(block: dict, levels: dict[float, int]) -> str:
    lines = []  # (text, plain_text, level)
    for line in block["lines"]:
        spans = [s for s in line["spans"] if s["text"].strip()]
        if not spans:
            continue
        sizes = {round(s["size"] * 2) / 2 for s in spans}
        level = min((levels[s] for s in sizes if s in levels), default=0) if all(s in levels for s in sizes) else 0
        runs = [(_is_bold(s), _is_italic(s), s["text"]) for s in line["spans"]]
        plain = "".join(s["text"] for s in line["spans"]).strip()
        lines.append((_render(runs).strip(), plain, level))
    if not lines:
        return ""
    if all(lvl for _, _, lvl in lines):
        return "#" * min(l[2] for l in lines) + " " + " ".join(p for _, p, _ in lines)
    items: list[str] = []
    for text, plain, _ in lines:
        if BULLET.match(plain):
            stripped = BULLET.sub("", text, count=1)
            items.append("- " + (stripped if stripped != text else BULLET.sub("", plain, count=1)))
        elif NUMBERED.match(plain):
            items.append(plain.strip())
        elif items and re.search(r"\w-$", items[-1]) and plain[:1].islower():
            items[-1] = items[-1][:-1] + text  # re-join a hyphenated word
        elif items:
            items[-1] += " " + text
        else:
            items.append(text)
    listy = any(BULLET.match(p) or NUMBERED.match(p) for _, p, _ in lines)
    return "\n".join(items) if listy else items[0] if len(items) == 1 else " ".join(items)


def _in_table(block: dict, rects: list[pymupdf.Rect]) -> bool:
    cx = (block["bbox"][0] + block["bbox"][2]) / 2
    cy = (block["bbox"][1] + block["bbox"][3]) / 2
    return any(r.contains(pymupdf.Point(cx, cy)) for r in rects)


def convert(src: str, out: str, name: str, tmp_dir: str) -> None:
    src = _ocr_if_scanned(src, tmp_dir)
    parts: list[str] = []
    with pymupdf.open(src) as doc:
        body = _body_size(doc)
        levels = _heading_levels(doc, body)
        for page in doc:
            tables = []
            try:
                tables = list(page.find_tables().tables)
            except Exception:
                pass
            rects = [pymupdf.Rect(t.bbox) for t in tables]
            items: list[tuple[float, str]] = []  # (y0, markdown) in block order
            for block in page.get_text("dict", sort=True)["blocks"]:
                if block["type"] != 0 or _in_table(block, rects):
                    continue
                md = _block_markdown(block, levels)
                if md:
                    items.append((block["bbox"][1], md))
            for t in tables:
                md = t.to_markdown().strip()
                if not md:
                    continue
                pos = next((i for i, (y, _) in enumerate(items) if y >= t.bbox[1]), len(items))
                items.insert(pos, (t.bbox[1], md))
            parts.extend(md for _, md in items)
    text = "\n\n".join(parts).strip()
    if not re.search(r"\w", text):
        raise ApiError(422, "no_text", "No text found", name=name)
    with open(out, "w", encoding="utf-8") as f:
        f.write(text + "\n")
