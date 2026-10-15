"""Extract embedded images from a PDF into a ZIP, in their original encoding when that opens everywhere."""

import zipfile

import pymupdf

from .errors import ApiError

# Encodings every viewer opens as-is (when the colorspace is gray/RGB and there is no soft mask).
KEEP_AS_IS = {"jpeg": "jpg", "png": "png", "jpx": "jp2"}


def _image_bytes(doc: pymupdf.Document, xref: int, smask: int) -> tuple[bytes, str] | None:
    info = doc.extract_image(xref)
    if not info:
        return None
    ext = info["ext"]
    if not smask and ext in KEEP_AS_IS and info.get("colorspace") in (1, 3):
        return info["image"], KEEP_AS_IS[ext]
    pix = pymupdf.Pixmap(doc, xref)
    if smask:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix) if pix.colorspace and pix.colorspace.n != 3 else pix
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)  # drop any alpha so the soft mask is the only one
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, smask))
    elif pix.colorspace is None or pix.colorspace.n not in (1, 3):
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    return pix.tobytes("png"), "png"


def extract(src: str, out: str, name: str, min_size: int) -> None:
    seen: set[int] = set()
    count = 0
    with pymupdf.open(src) as doc, zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as zf:
        for pno, page in enumerate(doc, start=1):
            k = 0
            for img in page.get_images(full=True):
                xref, smask, width, height = img[0], img[1], img[2], img[3]
                if xref in seen or width < min_size or height < min_size:
                    continue
                seen.add(xref)
                try:
                    res = _image_bytes(doc, xref, smask)
                except Exception:
                    continue  # stencil masks and other exotic objects
                if res is None:
                    continue
                k += 1
                count += 1
                zf.writestr(f"{name}_p{pno}_{k}.{res[1]}", res[0])
    if count == 0:
        raise ApiError(422, "no_images", "No images found", name=name)
