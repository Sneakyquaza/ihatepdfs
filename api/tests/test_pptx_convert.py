"""Geometry of re-created text boxes (pptx_convert.line_frame) and font-name mapping."""

import unittest

import pymupdf

from app.pptx_convert import line_frame, pptx_font

IDENTITY = pymupdf.Matrix(1, 0, 0, 1, 0, 0)


class LineFrame(unittest.TestCase):
    def test_horizontal_unrotated_page(self):
        f = line_frame((100, 90, 200, 104), (1, 0), 12, IDENTITY)
        self.assertEqual(f.angle, 0)
        self.assertAlmostEqual(f.cx, 150)
        self.assertAlmostEqual(f.cy, 97)
        self.assertAlmostEqual(f.length, 100)

    def test_bottom_to_top_text(self):
        # direction (0, -1) = written upwards -> 270° clockwise
        f = line_frame((290, 300, 304, 380), (0, -1), 12, IDENTITY)
        self.assertAlmostEqual(f.angle, 270)
        self.assertAlmostEqual(f.length, 80)
        self.assertAlmostEqual(f.cy, 340)

    def test_diagonal_text_length_recovered(self):
        # a 100 x 14 box rotated 45° has an axis-aligned hull of ~80.6 x 80.6
        hull = (100 + 14) / 2 ** 0.5
        f = line_frame((0, 0, hull, hull), (2 ** -0.5, 2 ** -0.5), 14 / 1.2, IDENTITY)
        self.assertAlmostEqual(f.angle, 45, places=3)
        self.assertAlmostEqual(f.length, 100, delta=0.5)

    def test_rotated_page_maps_to_displayed_space(self):
        page_doc = pymupdf.open()
        page = page_doc.new_page(width=595, height=842)
        page.set_rotation(90)
        # horizontal text on the unrotated page reads top-to-bottom once displayed
        f = line_frame((100, 87, 154, 104), (1, 0), 12, page.rotation_matrix)
        self.assertAlmostEqual(f.angle, 90)
        self.assertAlmostEqual(f.cx, (738 + 755) / 2, delta=1)
        self.assertAlmostEqual(f.cy, 127, delta=1)


class FontNames(unittest.TestCase):
    def test_mapping(self):
        self.assertEqual(pptx_font("ABCDEF+Calibri-Bold"), "Calibri")
        self.assertEqual(pptx_font("Helvetica-Oblique"), "Arial")
        self.assertEqual(pptx_font("TimesNewRomanPSMT"), "Times New Roman")
        self.assertEqual(pptx_font("GaramondPSMT"), "Garamond")


if __name__ == "__main__":
    unittest.main()
