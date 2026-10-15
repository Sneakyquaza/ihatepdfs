"""Scan to PDF: document detection on a synthetic photo, fallback, PDF assembly."""

import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np
import pymupdf

from app.scan import convert, find_quad, order_corners, warp


def synth_photo(w=1200, h=900):
    """White sheet with text lines, perspective-transformed + rotated onto a darker noisy desk."""
    sheet = np.full((700, 500, 3), 245, np.uint8)
    for i in range(12):
        cv2.putText(sheet, f"Line {i} of the document", (30, 60 + i * 50), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (20, 20, 20), 2)
    src = np.float32([[0, 0], [500, 0], [500, 700], [0, 700]])
    truth = np.float32([[300, 130], [800, 100], [870, 780], [230, 760]])
    rot = cv2.getRotationMatrix2D((w / 2, h / 2), 10, 1.0)
    truth = cv2.transform(truth.reshape(-1, 1, 2), rot).reshape(4, 2)
    rng = np.random.default_rng(1)
    bg = np.clip(rng.normal(70, 12, (h, w, 3)), 0, 255).astype(np.uint8)
    warped = cv2.warpPerspective(sheet, cv2.getPerspectiveTransform(src, truth), (w, h))
    mask = cv2.warpPerspective(np.full(sheet.shape[:2], 255, np.uint8), cv2.getPerspectiveTransform(src, truth), (w, h))
    img = np.where(mask[:, :, None] > 0, warped, bg)
    return img, order_corners(truth)


class Scan(unittest.TestCase):
    def test_quad_detected(self):
        img, truth = synth_photo()
        quad = find_quad(img)
        self.assertIsNotNone(quad)
        self.assertLess(np.abs(quad - truth).max(), 25)
        flat = warp(img, quad)
        self.assertGreater(flat.mean(), 180)  # background cropped away

    def test_plain_image_falls_back(self):
        self.assertIsNone(find_quad(np.full((600, 800, 3), 200, np.uint8)))

    def test_pdf_pages_follow_inputs(self):
        photo, _ = synth_photo()
        plain = np.full((300, 600, 3), 180, np.uint8)
        with tempfile.TemporaryDirectory() as d:
            paths = []
            for i, im in enumerate([photo, plain, photo]):
                p = str(Path(d) / f"{i}.jpg")
                cv2.imwrite(p, im)
                paths.append(p)
            for mode in ("color", "gray", "bw"):
                for size in ("a4", "fit"):
                    out = str(Path(d) / f"{mode}_{size}.pdf")
                    convert(paths, out, mode, size)
                    with pymupdf.open(out) as doc:
                        self.assertEqual(doc.page_count, 3)
                        if size == "a4":
                            self.assertAlmostEqual(doc[0].rect.width, 595.28, delta=0.5)
                            self.assertGreater(doc[1].rect.width, doc[1].rect.height)  # landscape input
