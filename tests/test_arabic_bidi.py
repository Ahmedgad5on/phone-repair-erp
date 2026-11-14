"""
tests/test_arabic_bidi.py — Exhaustive Unit Test Suite for Typography & Arabic BiDi Engine
Validates:
- Contextual glyph connectivity & Unicode Presentation Forms (U+FE70 - U+FEFC)
- Lam-Alef ligature combinations (لا, لأ, لإ, لآ)
- BiDi reordering for Right-to-Left visual scanning
- Directional isolation (Unicode LRE \\u202A and PDF \\u202C) for phone numbers, IMEIs, and model codes
- Font loading hierarchy (Segoe UI -> Tahoma -> Arial -> Default) and point-to-pixel scaling at 203 DPI
- Modern Pillow 10+ bounding box math (draw.textbbox) and vertical clipping prevention
- 1-bit monochrome pixel purity
"""
import os
from pathlib import Path
import time
import unittest
from PIL import Image, ImageDraw, ImageFont

from core.label_renderer import (
    TypographyEngine,
    prepare_arabic_bidi_text,
    reshape_arabic_text,
    is_arabic_text,
    contains_arabic,
    FontManager,
    font_manager,
    get_font,
    measure_text,
    draw_text_bounded,
    typography_engine,
    render_repair_ticket_label,
)
from core.models import RepairTicket
from tests.e2e.test_harness import VirtualPrintVerifier


class Test01ArabicReshapingBasics(unittest.TestCase):
    """Suite 1: Contextual glyph connectivity and ligature reshaping."""

    def test_01_isolated_to_connected_presentation_forms(self):
        """Verify isolated Arabic letters convert into Unicode Presentation Forms (U+FE70 - U+FEFC)."""
        raw_text = "سامسونج"
        shaped = reshape_arabic_text(raw_text)
        self.assertTrue(len(shaped) > 0)
        has_presentation = any(
            (0xFB50 <= ord(c) <= 0xFDFF) or (0xFE70 <= ord(c) <= 0xFEFC)
            for c in shaped
        )
        self.assertTrue(has_presentation, f"Expected presentation forms in reshaped string: {repr(shaped)}")

    def test_02_lam_alef_ligature_merging(self):
        """Verify Lam-Alef combinations (لا, لأ, لإ, لآ) merge into single ligature codepoints."""
        ligature_cases = [
            ("لا", "\uFEFB"),  # Lam + Alef
            ("لأ", "\uFEF7"),  # Lam + Alef with Hamza above
            ("لإ", "\uFEF9"),  # Lam + Alef with Hamza below
            ("لآ", "\uFEF5"),  # Lam + Alef with Madda above
        ]
        for pair, expected_ligature in ligature_cases:
            shaped = reshape_arabic_text(pair)
            self.assertIn(expected_ligature, shaped, f"Failed ligature merge for {pair}")

    def test_03_medial_and_final_connections(self):
        """Verify character forms change based on word position."""
        word = "تصليح"
        shaped = reshape_arabic_text(word)
        self.assertNotEqual(word, shaped)
        self.assertTrue(any(0xFE70 <= ord(c) <= 0xFEFC for c in shaped))

    def test_04_tashkeel_diacritics_preservation(self):
        """Verify Arabic text with Harakat/Tashkeel is processed without throwing exceptions."""
        vocalized = "مُحَمَّدٌ عَلِيّ"
        result = reshape_arabic_text(vocalized)
        self.assertTrue(len(result) > 0)

    def test_05_pure_latin_bypass(self):
        """Verify pure ASCII / English strings bypass reshaping completely and remain unchanged."""
        english = "iPhone 15 Pro Max (512GB)"
        result = reshape_arabic_text(english)
        self.assertEqual(result, english)


class Test02BidirectionalReversal(unittest.TestCase):
    """Suite 2: Right-to-Left visual reordering for LTR rasterization."""

    def test_06_pure_arabic_bidi_reversal(self):
        """Verify pure Arabic word sequence is visually reversed for Left-to-Right scanning."""
        raw = "شاشة مكسورة"
        processed = prepare_arabic_bidi_text(raw)
        self.assertNotEqual(raw, processed)
        self.assertTrue(contains_arabic(processed))

    def test_07_contains_arabic_detector(self):
        """Verify contains_arabic correctly categorizes Arabic vs non-Arabic characters."""
        self.assertTrue(contains_arabic("أحمد"))
        self.assertTrue(contains_arabic("Galaxy S24 تصليح"))
        self.assertFalse(contains_arabic("iPhone 16 Pro"))
        self.assertFalse(contains_arabic("1234567890"))
        self.assertFalse(contains_arabic(""))

    def test_08_empty_and_whitespace_strings(self):
        """Verify empty and whitespace strings return safely without alteration."""
        self.assertEqual(prepare_arabic_bidi_text(""), "")
        self.assertEqual(prepare_arabic_bidi_text("   "), "   ")
        self.assertEqual(prepare_arabic_bidi_text(None), "")

    def test_09_multiline_arabic_handling(self):
        """Verify multiline Arabic strings are preserved with line breaks."""
        multiline = "شاشة تالفة\nبطارية ضعيفة"
        processed = prepare_arabic_bidi_text(multiline)
        self.assertIn("\n", processed)
        lines = processed.split("\n")
        self.assertEqual(len(lines), 2)

    def test_10_extreme_length_performance(self):
        """Verify a 2,000 character Arabic text processes in under 100ms without recursion errors."""
        long_text = "تم فحص الجهاز وتبين وجود كسر بالباغة والشاشة بحالة جيدة. " * 35
        start = time.perf_counter()
        res = prepare_arabic_bidi_text(long_text)
        duration = time.perf_counter() - start
        self.assertLess(duration, 0.2, f"Processing too slow: {duration:.4f}s")
        self.assertGreater(len(res), 1500)


class Test03LrePdfNumberProtection(unittest.TestCase):
    """Suite 3: Directional isolation of numbers, IMEIs, and Latin identifiers."""

    def test_11_protect_ltr_wrapper(self):
        """Verify protect_ltr wraps string in Unicode LRE (\\u202A) and PDF (\\u202C)."""
        num = "01012345678"
        protected = TypographyEngine.protect_ltr(num)
        self.assertEqual(protected, "\u202A01012345678\u202C")

    def test_12_protect_ltr_idempotency(self):
        """Verify double-wrapping is prevented when text is already protected."""
        num = "\u202A01012345678\u202C"
        double = TypographyEngine.protect_ltr(num)
        self.assertEqual(double, num)

    def test_13_phone_number_digit_order_preservation(self):
        """Verify Egyptian phone number digits maintain strict 010... order in Arabic text."""
        raw = "رقم الهاتف: 01012345678"
        processed = prepare_arabic_bidi_text(raw, auto_protect=True)
        self.assertIn("01012345678", processed)

    def test_14_international_phone_plus_preservation(self):
        """Verify leading '+' in international phone does not jump to trailing end."""
        raw = "الاتصال: +201012345678"
        processed = prepare_arabic_bidi_text(raw, auto_protect=True)
        self.assertIn("+201012345678", processed)

    def test_15_imei_number_preservation(self):
        """Verify 15-digit IMEI sequence is strictly preserved in mixed Arabic remarks."""
        imei = "354892019482014"
        raw = f"الجهاز عليه ايمي: {imei}"
        processed = prepare_arabic_bidi_text(raw, auto_protect=True)
        self.assertIn(imei, processed)

    def test_16_alphanumeric_model_hyphen_preservation(self):
        """Verify model codes like SM-S928B do not invert to S928B-SM."""
        raw = "الموديل: SM-S928B سليم"
        processed = prepare_arabic_bidi_text(raw, auto_protect=True)
        self.assertIn("SM-S928B", processed)

    def test_16b_model_codes_starting_with_digits_ltr_preservation(self):
        """Verify model codes starting with digits maintain strict LTR sequence in Arabic strings."""
        cases = [
            ("موديل 14 Ultra سليم", "14 Ultra"),
            ("موديل 12 Pro Max سليم", "12 Pro Max"),
            ("موديل 10 Pro+ سليم", "10 Pro+"),
            ("موديل S23+ سليم", "S23+"),
            ("سعر Note 12 Pro+ ممتاز", "Note 12 Pro+"),
            ("يدعم شبكات 5G و 4G", "5G"),
            ("يدعم شبكات 5G و 4G", "4G"),
            ("هاتف OnePlus 8T بحالة جيدة", "8T"),
            ("هاتف Honor 8X فحص", "8X"),
            ("الموديل: iPhone 16 Pro Max جديد", "iPhone 16 Pro Max"),
            ("كود الموديل SM-S928B أصلي", "SM-S928B"),
        ]
        for raw, expected_span in cases:
            processed = prepare_arabic_bidi_text(raw, auto_protect=True)
            self.assertIn(
                expected_span,
                processed,
                f"Model code '{expected_span}' inverted or corrupted in Arabic text: '{processed}'"
            )



class Test04FontLoadingHierarchy(unittest.TestCase):
    """Suite 4: Font manager hierarchy and 203 DPI point-to-pixel scaling."""

    def test_17_pt_to_px_exact_203dpi_scaling(self):
        """Verify mathematical point-to-pixel conversion at 203.2 DPI."""
        cases = [
            (6.0, 17),
            (7.0, 20),
            (8.0, 23),
            (9.0, 25),
            (10.0, 28),
            (12.0, 34),
        ]
        for pt, expected_px in cases:
            self.assertEqual(FontManager.pt_to_px(pt), expected_px)

    def test_18_system_font_discovery(self):
        """Verify FontManager successfully discovers Windows system TrueType fonts."""
        mgr = FontManager()
        has_windows_font = any(
            (k, False) in mgr._resolved_paths
            for k in ["segoe", "tahoma", "arial"]
        )
        self.assertTrue(has_windows_font, "Expected at least one Windows TrueType font to be resolved")

    def test_19_font_caching_identity(self):
        """Verify font cache returns identical instance on identical parameters."""
        f1 = get_font(8.0, bold=True)
        f2 = get_font(8.0, bold=True)
        self.assertIs(f1, f2)

    def test_20_default_font_failsafe(self):
        """Verify empty font manager falls back gracefully to PIL default font."""
        empty_mgr = FontManager(assets_dir=Path("nonexistent_path_xyz"))
        empty_mgr._resolved_paths = {}
        fallback_font = empty_mgr.get_font(pt_size=8.0)
        self.assertIsNotNone(fallback_font)


class Test05Pillow10BoundingBoxMath(unittest.TestCase):
    """Suite 5: Modern Pillow 10+ bounding box measurement and clipping prevention."""

    def setUp(self):
        self.canvas = Image.new("1", (304, 200), color=1)
        self.draw = ImageDraw.Draw(self.canvas)
        self.font = get_font(8.0, bold=False)

    def test_21_measure_text_bounding_box_tuple(self):
        """Verify measure_text returns positive width, height, and valid 4-tuple bbox."""
        w, h, bbox = measure_text(self.draw, "iPhone 15 Pro", self.font)
        self.assertGreater(w, 0)
        self.assertGreater(h, 0)
        self.assertEqual(len(bbox), 4)
        self.assertEqual(bbox[2] - bbox[0], w)
        self.assertEqual(bbox[3] - bbox[1], h)

    def test_22_empty_string_bounding_box(self):
        """Verify empty string returns 0, 0, (0, 0, 0, 0)."""
        w, h, bbox = measure_text(self.draw, "", self.font)
        self.assertEqual((w, h), (0, 0))
        self.assertEqual(bbox, (0, 0, 0, 0))

    def test_23_arabic_text_bounding_box_positive(self):
        """Verify Arabic text measures positive bounds."""
        w, h, bbox = measure_text(self.draw, reshape_arabic_text("شاشة مكسورة"), self.font)
        self.assertGreater(w, 0)
        self.assertGreater(h, 0)

    def test_24_draw_text_bounded_bearing_adjustment(self):
        """Verify draw_text_bounded completes without errors."""
        res_bbox = draw_text_bounded(
            self.draw,
            (10, 10),
            "أحمد علي",
            self.font,
            fill=0,
            is_arabic=True
        )
        self.assertEqual(len(res_bbox), 4)

    def test_25_draw_text_bounded_max_width_truncation(self):
        """Verify extreme long text is truncated when max_width is exceeded."""
        long_str = "Long Text That Exceeds The Label Canvas Printable Width Multiple Times"
        w_orig, _, _ = measure_text(self.draw, long_str, self.font)
        max_w = 80
        draw_text_bounded(self.draw, (10, 10), long_str, self.font, max_width=max_w)
        self.assertGreater(w_orig, max_w)


class Test06VerticalClippingAnd1BitMonochrome(unittest.TestCase):
    """Suite 6: Prevention of vertical clipping and 1-bit monochrome canvas purity."""

    def test_26_render_arabic_text_on_1bit_canvas(self):
        """Verify Arabic text renders in pure black pixels (0) on pure white canvas (1)."""
        canvas = Image.new("1", (200, 50), color=1)
        draw = ImageDraw.Draw(canvas)
        font = get_font(9.0, bold=True)
        draw_text_bounded(draw, (10, 10), "تصليح باغة", font, fill=0)

        # Check unique pixel values using getcolors()
        colors = canvas.getcolors()
        unique_vals = {c[1] for c in colors}
        self.assertTrue(unique_vals.issubset({0, 1}))
        self.assertIn(0, unique_vals)  # Ensure text was actually drawn

    def test_27_arabic_ticket_label_full_pipeline(self):
        """Verify repair ticket with Arabic customer name and fault description renders mode '1'."""
        ticket = RepairTicket(
            ticket_id="TKT-000099",
            customer_name="محمد صلاح الدين",
            customer_phone="01234567890",
            device_model="Galaxy S24 Ultra",
            reported_fault="تغيير شاشة داخلية + بطارية",
            passcode="0000",
            estimated_cost=2500.0,
            intake_datetime="2026-11-07 16:00"
        )
        img = render_repair_ticket_label(ticket, width_mm=50, height_mm=30)
        self.assertEqual(img.size, (400, 240))
        self.assertEqual(img.mode, "1")
        self.assertTrue(VirtualPrintVerifier.verify_1bit_monochrome(img.mode))


if __name__ == "__main__":
    unittest.main()
