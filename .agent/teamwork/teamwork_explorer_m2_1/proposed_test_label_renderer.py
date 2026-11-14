"""
tests/test_label_renderer.py — Unit Tests for 203 DPI Label Rendering Engine
Validates Features F06, F07, F15, F16, F18 and Interface Contract #2.
"""

import unittest
import os
import sys

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from core.models import DeviceSpecs, RepairTicket
from core.label_renderer import (
    mm_to_dots,
    get_font,
    format_compact_smart_merge,
    reshape_arabic_text,
    generate_code128_image,
    generate_qr_image,
    render_device_specs_label,
    render_repair_ticket_label,
    render_calibration_label,
)


class TestLabelRendererDimensions(unittest.TestCase):
    """Tests 203.2 DPI integer pixel scaling (8 dots/mm)."""

    def test_mm_to_dots_standard_presets(self):
        self.assertEqual(mm_to_dots(38), 304)
        self.assertEqual(mm_to_dots(25), 200)
        self.assertEqual(mm_to_dots(40), 320)
        self.assertEqual(mm_to_dots(50), 400)
        self.assertEqual(mm_to_dots(30), 240)
        self.assertEqual(mm_to_dots(60), 480)
        self.assertEqual(mm_to_dots(80), 640)
        self.assertEqual(mm_to_dots(40), 320)
        self.assertEqual(mm_to_dots(50), 400)

    def test_mm_to_dots_fractional(self):
        self.assertEqual(mm_to_dots(38.4), 307)
        self.assertEqual(mm_to_dots(38.6), 309)
        self.assertEqual(mm_to_dots(1.0), 8)
        self.assertEqual(mm_to_dots(0.5), 4)

    def test_device_specs_label_dimensions(self):
        specs = DeviceSpecs.empty()
        specs.marketing_name = "iPhone 13 Pro"
        specs.storage = "256GB"
        specs.color = "Sierra Blue"
        specs.battery_health = 89

        img_38x25 = render_device_specs_label(specs, width_mm=38, height_mm=25)
        self.assertEqual(img_38x25.size, (304, 200))
        self.assertEqual(img_38x25.mode, "1")

        img_40x25 = render_device_specs_label(specs, width_mm=40, height_mm=25)
        self.assertEqual(img_40x25.size, (320, 200))

        img_50x30 = render_device_specs_label(specs, width_mm=50, height_mm=30)
        self.assertEqual(img_50x30.size, (400, 240))

    def test_repair_ticket_dimensions(self):
        ticket = RepairTicket(
            ticket_id="TKT-2026-0001",
            customer_name="Ahmed Ali",
            customer_phone="01012345678",
            device_model="iPhone 14 Pro",
            reported_fault="Screen Replacement",
            passcode="123456",
            estimated_cost=150.0,
        )
        img_50x30 = render_repair_ticket_label(ticket, width_mm=50, height_mm=30)
        self.assertEqual(img_50x30.size, (400, 240))
        self.assertEqual(img_50x30.mode, "1")

        img_80x40 = render_repair_ticket_label(ticket, width_mm=80, height_mm=40)
        self.assertEqual(img_80x40.size, (640, 320))

    def test_calibration_label_dimensions(self):
        cal_38x25 = render_calibration_label(width_mm=38, height_mm=25)
        self.assertEqual(cal_38x25.size, (304, 200))
        self.assertEqual(cal_38x25.mode, "1")

        cal_80x50 = render_calibration_label(width_mm=80, height_mm=50)
        self.assertEqual(cal_80x50.size, (640, 400))


class TestCompactSmartMerge(unittest.TestCase):
    """Tests the Compact Smart Merge formatting algorithm."""

    def test_standard_iphone_merge(self):
        merged = format_compact_smart_merge("iPhone 13 Pro", "256GB", "Sierra Blue", 89)
        self.assertEqual(merged, "iPhone 13 Pro - 256GB - Sierra Blue - 89%")

    def test_standard_samsung_merge(self):
        merged = format_compact_smart_merge("Galaxy S24 Ultra", "512GB", "Titanium Gray", 100)
        self.assertEqual(merged, "Galaxy S24 Ultra - 512GB - Titanium Gray - 100%")

    def test_missing_or_depleted_battery(self):
        merged_none = format_compact_smart_merge("Xiaomi 14", "256GB", "White", None)
        self.assertEqual(merged_none, "Xiaomi 14 - 256GB - White")

        merged_zero = format_compact_smart_merge("iPhone 11", "64GB", "Black", 0)
        self.assertEqual(merged_zero, "iPhone 11 - 64GB - Black")

    def test_all_empty_fields(self):
        merged = format_compact_smart_merge("", "", "", None)
        self.assertEqual(merged, "")

    def test_special_characters_in_model(self):
        model = 'Xiaomi "14 Ultra" (16GB/1TB)'
        merged = format_compact_smart_merge(model, "", "Black", 94)
        self.assertEqual(merged, 'Xiaomi "14 Ultra" (16GB/1TB) - Black - 94%')


class TestBarcodeAndQRCodeGeneration(unittest.TestCase):
    """Tests barcode and QR code 1-bit bitmap generation."""

    def test_code128_valid_imei(self):
        img = generate_code128_image("358901234567896", target_height_px=45, module_width_px=2)
        self.assertEqual(img.mode, "1")
        self.assertGreater(img.width, 100)
        self.assertEqual(img.height, 45)

    def test_code128_alphanumeric_serial(self):
        img = generate_code128_image("F2LYP012N6P1", target_height_px=40, module_width_px=2)
        self.assertEqual(img.mode, "1")
        self.assertEqual(img.height, 40)

    def test_qr_code_generation(self):
        payload = '{"ticket_id":"TKT-000100","model":"Galaxy S24 Ultra"}'
        img = generate_qr_image(payload, box_size=3, border=2)
        self.assertEqual(img.mode, "1")
        self.assertGreater(img.width, 50)
        self.assertEqual(img.width, img.height)


class TestArabicBiDiReshaping(unittest.TestCase):
    """Tests Arabic ligature reshaping and number sequence protection."""

    def test_arabic_ligatures(self):
        original = "شاشة مكسورة"
        reshaped = reshape_arabic_text(original)
        self.assertIsNotNone(reshaped)
        self.assertNotEqual(reshaped, "")

    def test_arabic_with_phone_number_preservation(self):
        text = "الهاتف: 01012345678"
        processed = reshape_arabic_text(text)
        self.assertIn("01012345678", processed)

    def test_latin_text_unmodified(self):
        text = "iPhone 15 Pro Max"
        processed = reshape_arabic_text(text)
        self.assertEqual(processed, text)


class TestCalibrationLabelGeometry(unittest.TestCase):
    """Tests alignment calibration label border boxes, crosshair, and tick marks."""

    def test_calibration_pixel_values(self):
        img = render_calibration_label(width_mm=38, height_mm=25)
        # Check that canvas has both black lines and white space
        extrema = img.getextrema()
        self.assertEqual(extrema, (0, 1))

    def test_calibration_outer_border_pixel(self):
        img = render_calibration_label(width_mm=38, height_mm=25)
        # Pixel at (0, 0) should be black (0) for perimeter border
        self.assertEqual(img.getpixel((0, 0)), 0)
        self.assertEqual(img.getpixel((303, 199)), 0)

    def test_calibration_center_crosshair_pixel(self):
        img = render_calibration_label(width_mm=38, height_mm=25)
        # Center is (152, 100)
        cx, cy = 152, 100
        # Check crosshair intersection has black lines
        self.assertEqual(img.getpixel((cx, cy)), 0)


if __name__ == "__main__":
    unittest.main()
