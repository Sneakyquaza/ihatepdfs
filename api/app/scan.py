"""Photos of paper documents -> one clean PDF: find the sheet, straighten it, clean it up."""

import io

import cv2
import img2pdf
import numpy as np
from PIL import Image, ImageOps

MAX_SIDE = 3500  # working resolution cap (JOB_MEMORY_MB)
DETECT_SIDE = 700
MIN_AREA = 0.2
A4 = (595.28, 841.89)


def load(path: str) -> np.ndarray:
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
            im = Image.alpha_composite(bg, im)
        im = im.convert("RGB")
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        return np.asarray(im)[:, :, ::-1].copy()  # BGR


def _quad_from_mask(mask: np.ndarray) -> np.ndarray | None:
    h, w = mask.shape
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in sorted(contours, key=cv2.contourArea, reverse=True)[:5]:
        hull = cv2.convexHull(c)
        peri = cv2.arcLength(hull, True)
        for eps in (0.02, 0.03, 0.05, 0.08):
            approx = cv2.approxPolyDP(hull, eps * peri, True)
            if len(approx) == 4:
                area = cv2.contourArea(approx) / (w * h)
                if MIN_AREA < area < 0.97:
                    return approx.reshape(4, 2).astype(np.float32)
                break
    return None


def order_corners(pts: np.ndarray) -> np.ndarray:
    """Top-left, top-right, bottom-right, bottom-left."""
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]], dtype=np.float32)


def find_quad(img: np.ndarray) -> np.ndarray | None:
    """Document corners in `img` pixel coordinates (ordered), or None when no sheet stands out."""
    h, w = img.shape[:2]
    k = min(1.0, DETECT_SIDE / max(h, w))
    small = cv2.resize(img, (round(w * k), round(h * k)), interpolation=cv2.INTER_AREA) if k < 1 else img
    gray = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (7, 7), 0)
    # edges are outlines: fill the largest enclosed shapes to get a solid mask
    edges = cv2.dilate(cv2.Canny(gray, 40, 120), np.ones((3, 3), np.uint8))
    cnts, _ = cv2.findContours(cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)),
                               cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(edges)
    cv2.drawContours(filled, cnts, -1, 255, cv2.FILLED)
    masks = [
        filled,
        cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1],
        cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, -5),
    ]
    for m in masks:
        quad = _quad_from_mask(m)
        if quad is not None:
            return order_corners(quad / k)
    return None


def warp(img: np.ndarray, quad: np.ndarray) -> np.ndarray:
    tl, tr, br, bl = quad
    width = int(round(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))))
    height = int(round(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr))))
    if width < 50 or height < 50:
        return img
    dst = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype=np.float32)
    return cv2.warpPerspective(img, cv2.getPerspectiveTransform(quad, dst), (width, height), flags=cv2.INTER_CUBIC,
                               borderMode=cv2.BORDER_REPLICATE)


def _stretch(img: np.ndarray) -> np.ndarray:
    """Per-channel levels: paper becomes white, ink stays dark (auto-contrast + white balance)."""
    out = np.empty_like(img)
    chans = [img] if img.ndim == 2 else [img[:, :, c] for c in range(img.shape[2])]
    for i, ch in enumerate(chans):
        lo, hi = np.percentile(ch[::4, ::4], (1, 90))
        hi = max(hi, lo + 1)
        res = np.clip((ch.astype(np.float32) - lo) * (255.0 / (hi - lo)), 0, 255).astype(np.uint8)
        if img.ndim == 2:
            return res
        out[:, :, i] = res
    return out


def clean(img: np.ndarray, mode: str) -> bytes:
    """JPEG for colour/gray, 1-bit PNG (img2pdf stores it as CCITT G4) for bw."""
    if mode == "color":
        return cv2.imencode(".jpg", _stretch(img), [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes()
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if mode == "gray":
        return cv2.imencode(".jpg", _stretch(gray), [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes()
    block = max(15, (max(gray.shape) // 40) | 1)
    bw = cv2.adaptiveThreshold(cv2.GaussianBlur(gray, (3, 3), 0), 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                               cv2.THRESH_BINARY, block, 12)
    bio = io.BytesIO()
    Image.fromarray(bw).convert("1").save(bio, "PNG", optimize=True)
    return bio.getvalue()


def _page_size(w: int, h: int, page_size: str) -> tuple[float, float]:
    if page_size == "fit":
        return A4[0], A4[0] * h / w
    return (A4[1], A4[0]) if w > h else A4


def convert(paths: list[str], out: str, mode: str, page_size: str) -> None:
    images = []
    for p in paths:
        img = load(p)
        quad = find_quad(img)
        if quad is not None:
            img = warp(img, quad)
        images.append(clean(img, mode))

    def layout(w, h, _ndpi):
        pw, ph = _page_size(w, h, page_size)
        scale = min(pw / w, ph / h)
        return pw, ph, w * scale, h * scale

    with open(out, "wb") as f:
        f.write(img2pdf.convert(images, layout_fun=layout))
