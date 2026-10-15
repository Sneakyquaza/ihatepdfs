"""PDF -> Markdown: headings, emphasis, lists, tables, empty documents."""

import tempfile
import unittest
from pathlib import Path

import pymupdf

from app.errors import ApiError
from app.markdown import convert


def render(build) -> str:
    with tempfile.TemporaryDirectory() as d:
        src, out = str(Path(d) / "a.pdf"), str(Path(d) / "a.md")
        doc = pymupdf.open()
        build(doc)
        doc.save(src)
        convert(src, out, "a.pdf", d)
        return Path(out).read_text(encoding="utf-8")


class Markdown(unittest.TestCase):
    def test_structure(self):
        def build(doc):
            page = doc.new_page()
            page.insert_text((50, 80), "Main title", fontsize=24, fontname="hebo")
            page.insert_text((50, 120), "Section", fontsize=16, fontname="hebo")
            for i in range(4):
                page.insert_text((50, 150 + i * 14), f"Plain body sentence number {i} of the paragraph.", fontsize=10)
            page.insert_text((50, 230), "Bold part", fontsize=10, fontname="hebo")
            page.insert_text((50, 260), "- first item", fontsize=10)
            page.insert_text((50, 274), "- second item", fontsize=10)

        md = render(build)
        self.assertIn("# Main title", md)
        self.assertIn("## Section", md)
        self.assertIn("**Bold part**", md)
        self.assertIn("- first item", md)
        self.assertIn("- second item", md)

    def test_table(self):
        def build(doc):
            page = doc.new_page()
            page.insert_text((50, 50), "Intro text before the table.", fontsize=10)
            x0, y0, cw, ch = 50, 80, 100, 24
            for r in range(3):
                for c in range(2):
                    rect = pymupdf.Rect(x0 + c * cw, y0 + r * ch, x0 + (c + 1) * cw, y0 + (r + 1) * ch)
                    page.draw_rect(rect, color=(0, 0, 0), width=1)
                    page.insert_text((rect.x0 + 4, rect.y0 + 16), f"r{r}c{c}", fontsize=10)

        md = render(build)
        self.assertIn("|r0c0|r0c1|", md.replace(" ", ""))
        self.assertLess(md.index("Intro"), md.index("r0c0"))

    def test_empty_document(self):
        with self.assertRaises(ApiError) as cm:
            render(lambda doc: doc.new_page())
        self.assertEqual(cm.exception.detail["code"], "no_text")
