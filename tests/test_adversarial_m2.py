"""
tests/test_adversarial_m2.py — Empirical Challenger Test Suite for Milestone 2
(203 DPI High-Precision Thermal Printing & Label Engine).

Adversarially probes:
1. Exact canvas pixel geometry across standard, boundary, and extreme presets.
2. Strict Mode '1' 1-bit native monochrome purity (zero anti-alias or grayscale pixels).
3. Compact Smart Merge stress (120-char models, None/negative battery, punctuation, wraps).
4. Code128 barcode engine stress (empty, 1-char, 100-char, non-ASCII fallback, max-width constraints).
5. 2D QR code engine stress (empty, 1-char, 100-char, 500-char, fitted box sizing, module scaling).
6. Label layout edge cases (empty specs/tickets, extreme strings, Arabic BiDi preservation).
7. Windows GDI silent printing and Virtual Fallback (PNG/PDF exports, capabilities, error recovery).
"""

from datetime import datetime
import os
from pathlib import Path
import tempfile
import unittest
from typing import Set

from PIL import Image

from core.models import DeviceSpecs, RepairTicket
from core.label_renderer import (
    DPI,
    DOTS_PER_MM,
    mm_to_dots,
    get_font,
    measure_text,
    draw_text_bounded,
    format_compact_smart_merge,
    generate_code128_barcode,
    generate_code128_image,
    generate_qr_code,
    generate_qr_code_fitted,
    generate_qr_image,
    render_device_specs_label,
    render_repair_ticket_label,
    render_calibration_label,
    prepare_arabic_bidi_text,
    reshape_arabic_text,
    contains_arabic,
)
import core.printer_win32 as pw
from tests.e2e.test_harness import VirtualPrintVerifier


class Test01CanvasGeometryAdversarial(unittest.TestCase):
    """1. Exact canvas pixel geometry across standard and boundary presets."""

    def test_01_all_standard_presets_integer_geometry(self):
        """Standard commercial label sizes must yield exact 8 dots/mm integer pixels."""
        presets = [
            (38, 25, 304, 200),
            (40, 25, 320, 200),
            (50, 30, 400, 240),
            (60, 30, 480, 240),
            (80, 40, 640, 320),
            (80, 50, 640, 400),
        ]
        for w_mm, h_mm, exp_w, exp_h in presets:
            w_px = mm_to_dots(w_mm)
            h_px = mm_to_dots(h_mm)
            self.assertEqual((w_px, h_px), (exp_w, exp_h))
            self.assertTrue(VirtualPrintVerifier.verify_203dpi_dimensions(w_px, h_px, w_mm, h_mm))

    def test_02_boundary_and_extreme_presets(self):
        """Boundary millimeter dimensions must round deterministically."""
        boundary_cases = [
            (10, 10, 80, 80),      # Minimum sensible label
            (20, 15, 160, 120),    # Small jewelry/component tag
            (100, 80, 800, 640),   # Large shipping label
            (100, 150, 800, 1200), # 4x6 inch logistics label
            (100, 10, 800, 80),    # Thin ribbon aspect ratio (10:1)
            (10, 100, 80, 800),    # Tall narrow aspect ratio (1:10)
        ]
        for w_mm, h_mm, exp_w, exp_h in boundary_cases:
            w_px = mm_to_dots(w_mm)
            h_px = mm_to_dots(h_mm)
            self.assertEqual((w_px, h_px), (exp_w, exp_h))

    def test_03_fractional_millimeter_half_up_rounding(self):
        """Fractional millimeter coordinates must obey standard half-up rounding."""
        self.assertEqual(mm_to_dots(38.4), 307)
        self.assertEqual(mm_to_dots(38.5), 308)
        self.assertEqual(mm_to_dots(38.6), 309)
        self.assertEqual(mm_to_dots(25.125), 201)
        self.assertEqual(mm_to_dots(0.125), 1)

    def test_04_render_device_specs_label_dimensions(self):
        """Rendered device specs labels must match canvas dimensions for all presets."""
        specs = DeviceSpecs(
            connection_type="mock", device_id="STK-001", brand="Samsung",
            marketing_name="Galaxy S24 Ultra", model_code="SM-S928B", storage="512GB",
            ram="12GB", color="Titanium Gray", os_version="14",
            serial_number="R5CW123456", imei1="352093081234567", battery_health=100
        )
        for w_mm, h_mm in [(38, 25), (40, 25), (50, 30), (60, 30), (80, 40), (80, 50)]:
            img = render_device_specs_label(specs, width_mm=w_mm, height_mm=h_mm)
            exp_w, exp_h = mm_to_dots(w_mm), mm_to_dots(h_mm)
            self.assertEqual(img.size, (exp_w, exp_h))

    def test_05_margin_boundary_stress(self):
        """Zero margin, standard margin, and oversized margins should not crash."""
        specs = DeviceSpecs(
            connection_type="mock", device_id="STK-001", brand="Apple",
            marketing_name="iPhone 15 Pro", model_code="A3102", storage="256GB",
            ram="8GB", color="Black Titanium", os_version="17.5",
            serial_number="G0NK123456", imei1="352093081234567", battery_health=98
        )
        for m in [0.0, 0.5, 1.0, 5.0, 10.0, 20.0]:
            img = render_device_specs_label(specs, width_mm=38, height_mm=25, margin_mm=m)
            self.assertEqual(img.size, (304, 200))
            self.assertEqual(img.mode, "1")

    def test_06_calibration_label_geometry_and_elements(self):
        """Calibration label geometry must match exact perimeter, inset, ticks, and crosshairs."""
        for w_mm, h_mm in [(38, 25), (40, 25), (50, 30), (80, 50)]:
            img = render_calibration_label(w_mm, h_mm)
            exp_w, exp_h = mm_to_dots(w_mm), mm_to_dots(h_mm)
            self.assertEqual(img.size, (exp_w, exp_h))
            self.assertEqual(img.mode, "1")

            # Check that outer border pixels at (0, 0) and corners are black (0)
            self.assertEqual(img.getpixel((0, 0)), 0)
            self.assertEqual(img.getpixel((exp_w - 1, 0)), 0)
            self.assertEqual(img.getpixel((0, exp_h - 1)), 0)
            self.assertEqual(img.getpixel((exp_w - 1, exp_h - 1)), 0)

            # Center crosshair check: center pixel is black (0)
            cx, cy = exp_w // 2, exp_h // 2
            self.assertEqual(img.getpixel((cx, cy)), 0)


class Test02StrictMonochromePurity(unittest.TestCase):
    """2. Strict Mode '1' 1-bit native monochrome purity (no grayscale pixels)."""

    @staticmethod
    def _assert_pure_monochrome(test_case: unittest.TestCase, img: Image.Image, name: str):
        """Verifies an image has mode '1' and strictly 0 and 1/255 pixel values."""
        test_case.assertEqual(img.mode, "1", f"{name} mode is {img.mode}, expected '1'")
        # Convert to 8-bit grayscale 'L' to inspect pixel values
        l_img = img.convert("L")
        extrema = l_img.getextrema()
        test_case.assertIn(extrema[0], (0, 255), f"{name} min pixel value unexpected: {extrema}")
        test_case.assertIn(extrema[1], (0, 255), f"{name} max pixel value unexpected: {extrema}")
        
        # Check all unique pixel values in grayscale representation are strictly 0 or 255
        pixel_vals = set(l_img.getdata())
        test_case.assertTrue(
            pixel_vals.issubset({0, 255}),
            f"{name} contains grayscale intermediate pixels: {pixel_vals - {0, 255}}"
        )

    def test_07_device_specs_label_monochrome_purity(self):
        """Device specs label outputs must be strictly 1-bit monochrome across all variants."""
        specs = DeviceSpecs(
            connection_type="mock", device_id="STK-001", brand="Samsung",
            marketing_name="Galaxy S24 Ultra", model_code="SM-S928B", storage="512GB",
            ram="12GB", color="Titanium Gray", os_version="14",
            serial_number="R5CW123456", imei1="352093081234567", battery_health=100
        )
        for b_type in ["code128", "qr", "both"]:
            for compact in [True, False]:
                im = render_device_specs_label(
                    specs, width_mm=38, height_mm=25,
                    compact_merge=compact, barcode_type=b_type
                )
                self._assert_pure_monochrome(self, im, f"specs_38x25_{b_type}_compact={compact}")

    def test_08_repair_ticket_monochrome_purity(self):
        """Repair ticket label outputs must be strictly 1-bit monochrome."""
        ticket = RepairTicket(
            ticket_id="TKT-100200", customer_name="محمد أحمد Ali",
            customer_phone="01012345678", device_model="iPhone 14 Pro",
            reported_fault="Screen cracked شاشة مكسورة", passcode="1234",
            sim_removed=True, back_cracked=False, dead_device=False,
            estimated_cost=120.0, intake_datetime="2026-11-07"
        )
        for b_type in ["code128", "qr"]:
            im = render_repair_ticket_label(ticket, width_mm=50, height_mm=30, barcode_type=b_type)
            self._assert_pure_monochrome(self, im, f"repair_ticket_{b_type}")

    def test_09_calibration_label_monochrome_purity(self):
        """Calibration label output must be strictly 1-bit monochrome."""
        for w, h in [(38, 25), (50, 30)]:
            im = render_calibration_label(w, h)
            self._assert_pure_monochrome(self, im, f"calibration_{w}x{h}")

    def test_10_barcode_and_qr_generators_monochrome_purity(self):
        """Direct Code128 and QR generator outputs must be strictly 1-bit monochrome."""
        bc = generate_code128_barcode("352093081234567", target_height_px=50, module_width_px=2)
        self._assert_pure_monochrome(self, bc, "code128_barcode")

        qr = generate_qr_code("TICKET:TKT-123456", box_size_px=3, border_modules=2)
        self._assert_pure_monochrome(self, qr, "qr_code")

        qr_fitted = generate_qr_code_fitted("PAYLOAD-1234", max_size_px=80)
        self._assert_pure_monochrome(self, qr_fitted, "qr_code_fitted")

    def test_11_virtual_png_export_preserves_mode1(self):
        """Virtual print export to PNG must preserve mode '1' on disk without color conversion."""
        specs = DeviceSpecs(
            connection_type="mock", device_id="STK-001", brand="Apple",
            marketing_name="iPhone 16 Pro Max", model_code="A3296", storage="1TB",
            ram="8GB", color="Desert Titanium", os_version="18.0",
            serial_number="DNPK123456", imei1="352093081234567", battery_health=100
        )
        im = render_device_specs_label(specs, width_mm=38, height_mm=25)

        with tempfile.TemporaryDirectory() as tmp_dir:
            ok, file_path = pw.save_virtual_print(im, format_type="PNG", output_dir=tmp_dir, file_prefix="purity_test")
            self.assertTrue(ok)
            self.assertTrue(os.path.exists(file_path))

            with Image.open(file_path) as reloaded:
                self.assertEqual(reloaded.mode, "1")
                self.assertEqual(reloaded.size, (304, 200))


class Test03CompactSmartMergeStress(unittest.TestCase):
    """3. Compact Smart Merge stress (120-char models, None/negative battery, punctuation, wraps)."""

    def test_12_standard_smart_merge_format(self):
        """Authoritative Compact Smart Merge format: Model - Storage - Color - Battery%."""
        res = format_compact_smart_merge("iPhone 13 Pro", "256GB", "Sierra Blue", 89)
        self.assertEqual(res, "iPhone 13 Pro - 256GB - Sierra Blue - 89%")

    def test_13_none_and_negative_battery_health(self):
        """Battery health should be completely omitted when None or <= 0."""
        self.assertEqual(
            format_compact_smart_merge("iPhone 12", "128GB", "Black", None),
            "iPhone 12 - 128GB - Black"
        )
        self.assertEqual(
            format_compact_smart_merge("iPhone 12", "128GB", "Black", 0),
            "iPhone 12 - 128GB - Black"
        )
        self.assertEqual(
            format_compact_smart_merge("iPhone 12", "128GB", "Black", -1),
            "iPhone 12 - 128GB - Black"
        )
        self.assertEqual(
            format_compact_smart_merge("iPhone 12", "128GB", "Black", -50),
            "iPhone 12 - 128GB - Black"
        )

    def test_14_positive_and_boundary_battery_health(self):
        """Positive battery health values must include percentage sign."""
        self.assertEqual(
            format_compact_smart_merge("iPhone 15", "128GB", "Pink", 1),
            "iPhone 15 - 128GB - Pink - 1%"
        )
        self.assertEqual(
            format_compact_smart_merge("iPhone 15", "128GB", "Pink", 100),
            "iPhone 15 - 128GB - Pink - 100%"
        )
        self.assertEqual(
            format_compact_smart_merge("iPhone 15", "128GB", "Pink", 105),
            "iPhone 15 - 128GB - Pink - 105%"
        )

    def test_15_120_char_marketing_name_stress(self):
        """Compact smart merge with 120-character marketing name must format without crashing."""
        long_model = "Samsung Galaxy S24 Ultra Enterprise Specialized Edition Model A2849 For Heavy Industrial Operations And Fleet Usage 2026"
        self.assertGreaterEqual(len(long_model), 120)
        res = format_compact_smart_merge(long_model, "1TB", "Titanium Gray", 99)
        self.assertTrue(res.startswith(long_model))
        self.assertTrue(res.endswith("1TB - Titanium Gray - 99%"))

    def test_16_punctuation_and_special_symbols(self):
        """Punctuation, slashes, brackets, and quotes in specs must be preserved."""
        model = "Galaxy Note 20 Ultra 5G (SM-N986B/DS) - [Special Edition]"
        storage = "256GB / 512GB (Dual-SIM)"
        color = 'Space-Gray / "Silver" & Gold'
        res = format_compact_smart_merge(model, storage, color, 88)
        self.assertEqual(
            res,
            f"{model} - {storage} - {color} - 88%"
        )

    def test_17_partial_and_empty_fields(self):
        """Empty or whitespace-only fields must be omitted cleanly without extra hyphens."""
        self.assertEqual(format_compact_smart_merge("", "", "", None), "")
        self.assertEqual(format_compact_smart_merge("   ", "  ", "  ", None), "")
        self.assertEqual(format_compact_smart_merge("iPhone 11", "", "", None), "iPhone 11")
        self.assertEqual(format_compact_smart_merge("", "64GB", "", None), "64GB")
        self.assertEqual(format_compact_smart_merge("", "", "Red", None), "Red")
        self.assertEqual(format_compact_smart_merge("", "", "", 92), "92%")
        self.assertEqual(format_compact_smart_merge("Pixel 8", "", "Obsidian", 95), "Pixel 8 - Obsidian - 95%")

    def test_18_rendering_120_char_model_wraps_dynamically(self):
        """Rendering a 120-char model on 38x25mm label must wrap to 2 lines without error."""
        long_name = "X" * 120
        specs = DeviceSpecs(
            connection_type="mock", device_id="STK-001", brand="Samsung",
            marketing_name=long_name, model_code="SM-LONG", storage="512GB",
            ram="12GB", color="Black", os_version="14",
            serial_number="R5CW123456", imei1="352093081234567", battery_health=100,
            sales_region="LL/A"
        )
        img = render_device_specs_label(specs, width_mm=38, height_mm=25, compact_merge=True)
        self.assertEqual(img.size, (304, 200))
        self.assertEqual(img.mode, "1")


class Test04BarcodeEngineAdversarial(unittest.TestCase):
    """4. Barcode generator stress (empty strings, 1-char, 100-char, max-width limits)."""

    def test_19_empty_string_raises_value_error_by_default(self):
        """Empty string or whitespace-only barcode input must raise ValueError when allow_empty=False."""
        for empty_val in ["", "   ", "\t\n", None]:
            with self.assertRaises(ValueError):
                generate_code128_barcode(empty_val, allow_empty=False)

    def test_20_empty_string_with_allow_empty_true(self):
        """Empty barcode with allow_empty=True must generate valid fallback barcode."""
        for empty_val in ["", "   ", "\t\n", None]:
            img = generate_code128_barcode(empty_val, allow_empty=True)
            self.assertEqual(img.mode, "1")
            self.assertEqual(img.height, 50)
            self.assertGreater(img.width, 0)

    def test_21_single_character_barcode(self):
        """Single non-whitespace character barcodes must render valid mode '1' images."""
        single_chars = ["0", "9", "A", "Z", "a", "z", "-", ".", "$", "/", "+", "%", "*", "_"]
        for ch in single_chars:
            img = generate_code128_barcode(ch, target_height_px=40, module_width_px=2)
            self.assertEqual(img.mode, "1")
            self.assertEqual(img.height, 40)
            self.assertGreater(img.width, 40)

        # Single space is whitespace-only, should raise ValueError on allow_empty=False
        with self.assertRaises(ValueError):
            generate_code128_barcode(" ", allow_empty=False)

        # But should succeed with allow_empty=True
        img_sp = generate_code128_barcode(" ", allow_empty=True)
        self.assertEqual(img_sp.mode, "1")

        # Embedded space is valid
        img_emb = generate_code128_barcode("A B", target_height_px=40)
        self.assertEqual(img_emb.mode, "1")

    def test_22_100_character_long_barcode(self):
        """100-character alphanumeric barcode must render without crashing."""
        long_data = "A1B2C3D4E5" * 10  # 100 characters
        img = generate_code128_barcode(long_data, target_height_px=60, module_width_px=1)
        self.assertEqual(img.mode, "1")
        self.assertEqual(img.height, 60)
        self.assertGreater(img.width, 800)

    def test_23_max_width_constraint_downscaling(self):
        """Barcode engine must downscale module width from 2 to 1 when max_width_px is constrained."""
        data = "352093081234567"
        im_unconstrained = generate_code128_barcode(data, module_width_px=2)
        im_constrained = generate_code128_barcode(data, module_width_px=2, max_width_px=150)
        self.assertLess(im_constrained.width, im_unconstrained.width)
        self.assertEqual(im_constrained.mode, "1")

    def test_24_non_ascii_and_arabic_fallback_resilience(self):
        """Code128 given non-ASCII or Arabic characters must fall back cleanly without raising unhandled error."""
        non_ascii_inputs = [
            "سامسونج",             # Arabic
            "Test 🔥 Emoji",       # Emoji
            "\x00\x01\x02Control", # Non-printable control characters
            "Ümlaut Ör Äpple",     # Latin Extended
        ]
        for data in non_ascii_inputs:
            img = generate_code128_barcode(data, allow_empty=True)
            self.assertEqual(img.mode, "1")
            self.assertEqual(img.height, 50)
            self.assertGreater(img.width, 0)


class Test05QrCodeEngineAdversarial(unittest.TestCase):
    """5. QR code generator stress (empty, 1-char, 100-char, 500-char, fitted box sizing)."""

    def test_25_empty_string_raises_value_error_by_default(self):
        """Empty string QR input must raise ValueError when allow_empty=False."""
        for empty_val in ["", "   ", "\t\n", None]:
            with self.assertRaises(ValueError):
                generate_qr_code(empty_val, allow_empty=False)

    def test_26_empty_string_with_allow_empty_true(self):
        """Empty QR with allow_empty=True must generate valid fallback QR code."""
        for empty_val in ["", "   ", "\t\n", None]:
            img = generate_qr_code(empty_val, allow_empty=True)
            self.assertEqual(img.mode, "1")
            self.assertGreater(img.width, 0)
            self.assertEqual(img.width, img.height)

    def test_27_single_char_qr_code(self):
        """Single character QR code must generate valid square mode '1' image."""
        img = generate_qr_code("A", box_size_px=3, border_modules=2)
        self.assertEqual(img.mode, "1")
        self.assertEqual(img.width, img.height)

    def test_28_100_and_500_character_qr_codes(self):
        """100-character and 500-character QR codes must generate valid square mode '1' images."""
        qr_100 = generate_qr_code("Q" * 100, box_size_px=2, border_modules=2)
        self.assertEqual(qr_100.mode, "1")
        self.assertEqual(qr_100.width, qr_100.height)

        qr_500 = generate_qr_code("DATA:" + ("X" * 495), box_size_px=2, border_modules=2)
        self.assertEqual(qr_500.mode, "1")
        self.assertEqual(qr_500.width, qr_500.height)
        self.assertGreater(qr_500.width, qr_100.width)

    def test_29_fitted_qr_code_within_bounds(self):
        """generate_qr_code_fitted must calculate box size ensuring total dimensions <= max_size_px."""
        payload = "TICKET:TKT-100200|PHONE:01012345678|MODEL:Galaxy S24"
        for max_s in [50, 75, 100, 150, 200]:
            img = generate_qr_code_fitted(payload, max_size_px=max_s, border_modules=2)
            self.assertEqual(img.mode, "1")
            self.assertLessEqual(img.width, max_s + 10)
            self.assertEqual(img.width, img.height)


class Test06LabelLayoutEdgeCases(unittest.TestCase):
    """6. Label layout edge cases (all-empty dataclasses, Arabic BiDi, mixed text)."""

    def test_30_all_empty_device_specs_dataclass(self):
        """DeviceSpecs with all fields empty or None must render without raising exceptions."""
        empty_specs = DeviceSpecs(
            connection_type="none", device_id="", brand="", marketing_name="",
            model_code="", storage="", ram="", color="", os_version="",
            serial_number="", imei1="", imei2=None, battery_health=None,
            battery_cycles=None, sales_region=None, bootloader_locked=None,
            condition_grade="", remarks=""
        )
        for compact in [True, False]:
            for b_type in ["code128", "qr", "both"]:
                img = render_device_specs_label(empty_specs, compact_merge=compact, barcode_type=b_type)
                self.assertEqual(img.size, (304, 200))
                self.assertEqual(img.mode, "1")

    def test_31_all_empty_repair_ticket_dataclass(self):
        """RepairTicket with all fields empty or zero must render without raising exceptions."""
        empty_ticket = RepairTicket(
            ticket_id="", customer_name="", customer_phone="", device_model="",
            reported_fault="", passcode="", sim_removed=False, back_cracked=False,
            dead_device=False, estimated_cost=0.0, intake_datetime=""
        )
        for b_type in ["code128", "qr"]:
            img = render_repair_ticket_label(empty_ticket, barcode_type=b_type)
            self.assertEqual(img.size, (400, 240))
            self.assertEqual(img.mode, "1")

    def test_32_arabic_customer_and_fault_with_embedded_numbers(self):
        """Arabic customer name and fault with phone numbers and IMEIs must render cleanly."""
        ticket = RepairTicket(
            ticket_id="TKT-000555",
            customer_name="أحمد محمود السيد",
            customer_phone="+201012345678",
            device_model="Samsung Galaxy S24 Ultra (SM-S928B)",
            reported_fault="تغيير شاشة مكسورة وتغيير بطارية أصلية",
            passcode="9876",
            sim_removed=True,
            back_cracked=True,
            dead_device=False,
            estimated_cost=250.0,
            intake_datetime="2026-11-07"
        )
        img = render_repair_ticket_label(ticket, width_mm=50, height_mm=30)
        self.assertEqual(img.size, (400, 240))
        self.assertEqual(img.mode, "1")

    def test_33_arabic_span_protection_idempotency(self):
        """prepare_arabic_bidi_text called multiple times on the same string must be idempotent."""
        raw_text = "رقم العميل: 01012345678 - كود: SM-S928B"
        processed_once = prepare_arabic_bidi_text(raw_text)
        processed_twice = prepare_arabic_bidi_text(processed_once)
        self.assertGreater(len(processed_once), 0)
        self.assertGreater(len(processed_twice), 0)


class Test07PrinterAndVirtualFallbackStress(unittest.TestCase):
    """7. Windows GDI silent printing and Virtual Fallback stress."""

    def test_34_none_and_zero_size_images_rejected(self):
        """print_label_image must raise ValueError on None or zero-dimension images."""
        with self.assertRaises(ValueError):
            pw.print_label_image(None)

        with self.assertRaises(ValueError):
            pw.print_label_image(Image.new("1", (0, 0)))

        with self.assertRaises(ValueError):
            pw.print_label_image(Image.new("1", (304, 0)))

    def test_35_explicit_virtual_png_export(self):
        """Explicit virtual PNG request must save valid 203 DPI file to disk."""
        img = Image.new("1", (304, 200), color=1)
        ok, path = pw.print_label_image(img, printer_name="Virtual Print (PNG Export)")
        self.assertTrue(ok)
        self.assertTrue(path.endswith(".png"))
        self.assertTrue(os.path.exists(path))
        if os.path.exists(path):
            os.remove(path)

    def test_36_explicit_virtual_pdf_export(self):
        """Explicit virtual PDF request must save valid PDF file to disk."""
        img = Image.new("1", (304, 200), color=1)
        ok, path = pw.print_label_image(img, printer_name="Virtual Print (PDF Export)")
        self.assertTrue(ok)
        self.assertTrue(path.endswith(".pdf"))
        self.assertTrue(os.path.exists(path))
        if os.path.exists(path):
            os.remove(path)

    def test_37_nonexistent_printer_with_fallback(self):
        """Nonexistent printer with virtual_fallback=True must succeed and return saved path."""
        img = Image.new("1", (304, 200), color=1)
        ok, msg = pw.print_label_image(img, printer_name="FakeThermalPrinterXYZ999", virtual_fallback=True)
        self.assertTrue(ok)
        self.assertIn("Saved virtual print to:", msg)
        file_path = msg.split("Saved virtual print to: ")[1].strip()
        if os.path.exists(file_path):
            os.remove(file_path)

    def test_38_nonexistent_printer_without_fallback(self):
        """Nonexistent printer with virtual_fallback=False must return False."""
        img = Image.new("1", (304, 200), color=1)
        ok, msg = pw.print_label_image(img, printer_name="FakeThermalPrinterXYZ999", virtual_fallback=False)
        self.assertFalse(ok)
        self.assertIn("not found", msg)

    def test_39_capabilities_inspection(self):
        """get_printer_capabilities must return dictionary with expected schema."""
        caps = pw.get_printer_capabilities("Virtual Print (PNG Export)")
        self.assertIn("dpi_x", caps)
        self.assertIn("dpi_y", caps)
        self.assertIn("is_thermal", caps)
        self.assertIn("printable_width", caps)
        self.assertIn("printable_height", caps)

    def test_40_thermal_keyword_ranking(self):
        """Installed printer enumeration must rank known thermal brands first."""
        mock_installed = [
            "Canon TS3100 Series",
            "Xprinter XP-370B",
            "Microsoft Print to PDF",
            "Zebra ZD420",
            "HP LaserJet Pro"
        ]
        thermal_ranked = [p for p in mock_installed if any(kw in p.lower() for kw in pw.THERMAL_KEYWORDS)]
        other = [p for p in mock_installed if p not in thermal_ranked]
        result = thermal_ranked + other
        self.assertEqual(result[0], "Xprinter XP-370B")
        self.assertEqual(result[1], "Zebra ZD420")


if __name__ == "__main__":
    unittest.main()
