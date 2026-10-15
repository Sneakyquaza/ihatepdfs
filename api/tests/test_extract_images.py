"""Embedded image extraction: dedupe, size filter, soft masks, CMYK -> RGB."""

import tempfile
import unittest
import zipfile
from pathlib import Path

import pymupdf

from app.errors import ApiError
from app.extract_images import extract


def png(w, h, color=(200, 30, 30)):
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, w, h), False)
    pix.set_rect(pix.irect, color)
    return pix.tobytes("png")


class ExtractImages(unittest.TestCase):
    def run_extract(self, build, min_size=64):
        with tempfile.TemporaryDirectory() as d:
            src, out = str(Path(d) / "a.pdf"), str(Path(d) / "a.zip")
            doc = pymupdf.open()
            build(doc)
            doc.save(src)
            extract(src, out, "doc", min_size)
            with zipfile.ZipFile(out) as zf:
                return {n: zf.read(n) for n in zf.namelist()}

    def test_dedupe_and_size_filter(self):
        data = png(100, 80)

        def build(doc):
            p1 = doc.new_page()
            xref = p1.insert_image(pymupdf.Rect(10, 10, 110, 90), stream=data)
            p1.insert_image(pymupdf.Rect(10, 100, 30, 120), stream=png(10, 10))  # icon
            p2 = doc.new_page()
            p2.insert_image(pymupdf.Rect(10, 10, 110, 90), xref=xref)  # same image again

        files = self.run_extract(build)
        self.assertEqual(list(files), ["doc_p1_1.png"])
        self.assertEqual(len(self.run_extract(build, 0)), 2)

    def test_soft_mask_becomes_png_with_alpha(self):
        pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 80, 80), True)
        pix.set_rect(pix.irect, (10, 200, 10, 128))

        def build(doc):
            doc.new_page().insert_image(pymupdf.Rect(0, 0, 80, 80), pixmap=pix)

        files = self.run_extract(build)
        (name, content), = files.items()
        self.assertTrue(name.endswith(".png"))
        self.assertTrue(pymupdf.Pixmap(content).alpha)

    def test_cmyk_jpeg_converted_to_rgb(self):
        cmyk = pymupdf.Pixmap(pymupdf.csCMYK, pymupdf.IRect(0, 0, 80, 80), False)
        cmyk.set_rect(cmyk.irect, (0, 255, 255, 0))

        def build(doc):
            doc.new_page().insert_image(pymupdf.Rect(0, 0, 80, 80), stream=cmyk.tobytes("jpeg"))

        (name, content), = self.run_extract(build).items()
        self.assertEqual(pymupdf.Pixmap(content).colorspace.n, 3)

    def test_no_images(self):
        with self.assertRaises(ApiError) as cm:
            self.run_extract(lambda doc: doc.new_page())
        self.assertEqual(cm.exception.detail["code"], "no_images")
