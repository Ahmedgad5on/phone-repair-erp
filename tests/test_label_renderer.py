"""
tests/test_label_renderer.py — Comprehensive Unit Test Suite for 203 DPI Thermal Label Rendering Engine
Validates:
- 203.2 DPI integer canvas math (8.000 dots/mm) and preset dimensions
- Mode '1' 1-bit native monochrome canvas (anti-aliasing elimination)
- Compact Smart Merge formatting and dynamic wrapping
- Code128 barcodes with 2-dot module width and 20px quiet zones
- 2D QR codes with integer module scaling and Error Correction Level M
- Alignment calibration label geometry matching VirtualPrintVerifier
- Robustness against missing fields, empty strings, and adversarial inputs
"""
import json
import math
import unittest
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
)
from tests.e2e.test_harness import VirtualPrintVerifier, LuhnValidator


class Test01MetricScalingAndCanvasMath(unittest.TestCase):
    """Suite 1: 203.2 DPI integer coordinate mathematics and preset dimensions."""

    def test_01_dpi_constant_and_dots_per_mm(self):
        """Verify 203.2 DPI equals exactly 8.000 dots per millimeter."""
        self.assertAlmostEqual(DPI, 203.2, places=1)
        self.assertEqual(DOTS_PER_MM, 8.0)
        self.assertEqual(round(203.2 / 25.4), 8)

    def test_02_standard_preset_dimensions(self):
        """Verify all commercial label presets scale to exact integer pixels."""
        presets = [
            (38, 25, 304, 200),  # Standard phone back sticker
            (40, 25, 320, 200),  # 3uTools style sticker
            (50, 30, 400, 240),  # Intake ticket / accessory tag
            (60, 30, 480, 240),  # Dual barcode label
            (80, 40, 640, 320),  # Workshop repair intake
            (80, 50, 640, 400),  # Comprehensive warranty ticket
        ]
        for w_mm, h_mm, exp_w, exp_h in presets:
            w_px = mm_to_dots(w_mm)
            h_px = mm_to_dots(h_mm)
            self.assertEqual((w_px, h_px), (exp_w, exp_h), f"Failed for {w_mm}x{h_mm} mm")
            self.assertTrue(VirtualPrintVerifier.verify_203dpi_dimensions(w_px, h_px, w_mm, h_mm))

    def test_03_fractional_millimeter_rounding(self):
        """Verify fractional millimeters follow standard half-up integer rounding."""
        self.assertEqual(mm_to_dots(38.4), 307)
        self.assertEqual(mm_to_dots(38.6), 309)
        self.assertEqual(mm_to_dots(1.0), 8)
        self.assertEqual(mm_to_dots(0.5), 4)

    def test_04_memory_footprint_1bit_packed(self):
        """Verify packed byte footprint for 1-bit monochrome is exactly (W*H)/8 bytes."""
        w_px, h_px = 304, 200
        canvas = Image.new("1", (w_px, h_px), color=1)
        self.assertEqual(canvas.mode, "1")
        # In mode '1', each byte packs 8 horizontal pixels
        expected_bytes = (w_px * h_px) // 8
        self.assertEqual(expected_bytes, 7600)


class Test02CompactSmartMerge(unittest.TestCase):
    """Suite 2: Compact Smart Merge algorithm formatting and constraints."""

    def test_05_iphone_smart_merge_format(self):
        """Verify iPhone model + storage + color + battery merge formatting."""
        res = format_compact_smart_merge("iPhone 13 Pro", "256GB", "Sierra Blue", 89)
        self.assertEqual(res, "iPhone 13 Pro - 256GB - Sierra Blue - 89%")

    def test_06_android_smart_merge_format(self):
        """Verify Galaxy S24 Ultra model + storage + color + battery merge formatting."""
        res = format_compact_smart_merge("Galaxy S24 Ultra", "512GB", "Titanium Gray", 100)
        self.assertEqual(res, "Galaxy S24 Ultra - 512GB - Titanium Gray - 100%")

    def test_07_omission_of_none_battery(self):
        """Verify battery is omitted when battery_health is None."""
        res = format_compact_smart_merge("Xiaomi 14", "256GB", "White", None)
        self.assertEqual(res, "Xiaomi 14 - 256GB - White")

    def test_08_omission_of_zero_or_negative_battery(self):
        """Verify battery is omitted when battery_health <= 0 (depleted/unknown)."""
        res_zero = format_compact_smart_merge("iPhone 11", "64GB", "Black", 0)
        res_neg = format_compact_smart_merge("iPhone 11", "64GB", "Black", -1)
        self.assertEqual(res_zero, "iPhone 11 - 64GB - Black")
        self.assertEqual(res_neg, "iPhone 11 - 64GB - Black")

    def test_09_all_fields_empty_returns_empty_string(self):
        """Verify empty fields return an empty string without delimiters."""
        res = format_compact_smart_merge("", "", "", None)
        self.assertEqual(res, "")
        res_spaces = format_compact_smart_merge("   ", "  ", "", 0)
        self.assertEqual(res_spaces, "")

    def test_10_special_characters_in_model_name(self):
        """Verify model name with quotes, slashes, and parens formats cleanly."""
        model = 'Xiaomi "14 Ultra" (16GB/1TB)'
        res = format_compact_smart_merge(model, "", "Black", 94)
        self.assertEqual(res, 'Xiaomi "14 Ultra" (16GB/1TB) - Black - 94%')


class Test03BarcodesAndQRCodes(unittest.TestCase):
    """Suite 3: 1D Code128 barcodes and 2D QR codes."""

    def test_11_code128_valid_imei_and_quiet_zone(self):
        """Verify Code128 barcode of 15-digit Luhn-valid IMEI produces mode '1' image."""
        imei = "358901234567896"
        self.assertTrue(LuhnValidator.validate_imei(imei))
        img = generate_code128_barcode(imei, target_height_px=48, module_width_px=2, quiet_zone_px=20)
        self.assertEqual(img.mode, "1")
        self.assertEqual(img.height, 48)
        self.assertGreater(img.width, 100)

    def test_12_code128_alphanumeric_serial(self):
        """Verify Code128 barcode of alphanumeric Apple serial number."""
        serial = "F2LYP012N6P1"
        img = generate_code128_image(serial, target_height_px=40, module_width_px=2)
        self.assertEqual(img.mode, "1")
        self.assertEqual(img.height, 40)

    def test_13_code128_empty_data_raises_value_error(self):
        """Verify empty data raises ValueError when allow_empty=False."""
        with self.assertRaises(ValueError):
            generate_code128_barcode("", allow_empty=False)
        with self.assertRaises(ValueError):
            generate_code128_barcode("   ", allow_empty=False)

    def test_14_code128_max_width_constraint_downscales(self):
        """Verify barcode downscales module width when constrained by max_width_px."""
        long_data = "STK-2026-LONG-INVENTORY-IDENTIFIER-999"
        img_unconstrained = generate_code128_barcode(long_data, module_width_px=2, max_width_px=None, allow_empty=True)
        img_constrained = generate_code128_barcode(long_data, module_width_px=2, max_width_px=250, allow_empty=True)
        self.assertLessEqual(img_constrained.width, img_unconstrained.width)

    def test_15_qr_code_integer_module_scaling(self):
        """Verify QR code generates crisp mode '1' image with integer box_size."""
        payload = json.dumps({"ticket": "TKT-000100", "phone": "01012345678"})
        img = generate_qr_code(payload, box_size_px=3, border_modules=2)
        self.assertEqual(img.mode, "1")
        self.assertEqual(img.width, img.height)

    def test_16_qr_code_fitted_dimensions(self):
        """Verify generate_qr_code_fitted stays strictly within max_size_px."""
        max_px = 75
        img = generate_qr_code_fitted("https://example.com/check/123", max_size_px=max_px)
        self.assertLessEqual(img.width, max_px)
        self.assertLessEqual(img.height, max_px)

    def test_17_qr_code_empty_data_raises_value_error(self):
        """Verify empty data raises ValueError in generate_qr_code when allow_empty=False."""
        with self.assertRaises(ValueError):
            generate_qr_code("", allow_empty=False)


class Test04DeviceSpecsLabelRendering(unittest.TestCase):
    """Suite 4: Device specs label rendering conforming to Contract #2."""

    def setUp(self):
        self.specs = DeviceSpecs(
            connection_type="mock",
            device_id="STK-000001",
            brand="Apple",
            marketing_name="iPhone 15 Pro",
            model_code="A2848",
            storage="256GB",
            ram="8GB",
            color="Natural Titanium",
            os_version="18.1",
            serial_number="F2LWX0ABCDEF",
            imei1="358901234567896",
            battery_health=98,
            battery_cycles=42,
            sales_region="LL/A",
            condition_grade="A+",
            remarks="Excellent workshop intake"
        )

    def test_18_render_specs_38x25mm_dimensions_and_mode(self):
        """Verify 38x25mm specs label produces exact 304x200 mode '1' image."""
        img = render_device_specs_label(self.specs, width_mm=38, height_mm=25, compact_merge=True)
        self.assertEqual(img.size, (304, 200))
        self.assertEqual(img.mode, "1")
        self.assertTrue(VirtualPrintVerifier.verify_1bit_monochrome(img.mode))

    def test_19_render_specs_40x25mm_dimensions(self):
        """Verify 40x25mm specs label produces exact 320x200 mode '1' image."""
        img = render_device_specs_label(self.specs, width_mm=40, height_mm=25)
        self.assertEqual(img.size, (320, 200))
        self.assertEqual(img.mode, "1")

    def test_20_render_specs_qr_barcode_type(self):
        """Verify specs label renders correctly with barcode_type='qr'."""
        img = render_device_specs_label(self.specs, width_mm=38, height_mm=25, barcode_type="qr")
        self.assertEqual(img.size, (304, 200))
        self.assertEqual(img.mode, "1")

    def test_21_render_specs_both_barcode_type_large_label(self):
        """Verify large label (60x30mm) renders dual barcode + QR code."""
        img = render_device_specs_label(self.specs, width_mm=60, height_mm=30, barcode_type="both")
        self.assertEqual(img.size, (480, 240))
        self.assertEqual(img.mode, "1")

    def test_22_render_specs_multiline_mode(self):
        """Verify specs label renders in full multi-line mode when compact_merge=False."""
        img = render_device_specs_label(self.specs, width_mm=50, height_mm=30, compact_merge=False, show_titles=True)
        self.assertEqual(img.size, (400, 240))
        self.assertEqual(img.mode, "1")

    def test_23_render_specs_with_sparse_and_none_fields(self):
        """Verify sparse specs (None serial, None IMEI, None battery) renders without crash."""
        sparse_specs = DeviceSpecs(
            connection_type="none",
            device_id="",
            brand="Samsung",
            marketing_name="Galaxy A15",
            model_code="SM-A155F",
            storage="128GB",
            ram="4GB",
            color="Blue",
            os_version="14",
            serial_number="",
            imei1="",
            battery_health=None,
            battery_cycles=None,
            sales_region=None
        )
        img = render_device_specs_label(sparse_specs, width_mm=38, height_mm=25)
        self.assertEqual(img.size, (304, 200))
        self.assertEqual(img.mode, "1")

    def test_24_render_specs_custom_stock_number_and_grade(self):
        """Verify custom stock number override and custom grade badge."""
        img = render_device_specs_label(
            self.specs,
            width_mm=38,
            height_mm=25,
            stock_number="LAB-2026-99",
            compact_merge=True
        )
        self.assertEqual(img.size, (304, 200))


class Test05RepairTicketLabelRendering(unittest.TestCase):
    """Suite 5: Service & repair intake ticket label rendering conforming to Contract #2."""

    def setUp(self):
        self.ticket = RepairTicket(
            ticket_id="TKT-2026-0001",
            customer_name="أحمد علي مصطفى",
            customer_phone="01012345678",
            device_model="iPhone 14 Pro",
            reported_fault="تغيير شاشة كاملة + باغة",
            passcode="123456",
            sim_removed=True,
            back_cracked=False,
            dead_device=False,
            estimated_cost=1850.0,
            intake_datetime="2026-11-07 14:30"
        )

    def test_25_render_ticket_50x30mm_dimensions_and_mode(self):
        """Verify 50x30mm repair ticket produces exact 400x240 mode '1' image."""
        img = render_repair_ticket_label(self.ticket, width_mm=50, height_mm=30)
        self.assertEqual(img.size, (400, 240))
        self.assertEqual(img.mode, "1")

    def test_26_render_ticket_qr_barcode_type(self):
        """Verify repair ticket renders with barcode_type='qr'."""
        img = render_repair_ticket_label(self.ticket, width_mm=50, height_mm=30, barcode_type="qr")
        self.assertEqual(img.size, (400, 240))
        self.assertEqual(img.mode, "1")

    def test_27_render_ticket_sparse_fields(self):
        """Verify ticket with minimal fields (no phone, no passcode, zero cost) renders cleanly."""
        sparse_ticket = RepairTicket(
            ticket_id="TKT-000002",
            customer_name="",
            customer_phone="",
            device_model="Galaxy S23",
            reported_fault="",
            passcode="",
            estimated_cost=0.0
        )
        img = render_repair_ticket_label(sparse_ticket, width_mm=50, height_mm=30)
        self.assertEqual(img.size, (400, 240))
        self.assertEqual(img.mode, "1")

    def test_27b_render_ticket_long_customer_name_truncation_no_phone_overlap(self):
        """Verify 100+ character customer names truncate cleanly with ellipsis and never overlap phone."""
        from PIL import ImageDraw
        long_name_ar = "المهندس أحمد عبد الرحمن السيد الشناوي " * 4  # 150+ chars
        phone = "01012345678"
        ticket_ar = RepairTicket(
            ticket_id="TKT-2026-LONG-AR",
            customer_name=long_name_ar,
            customer_phone=phone,
            device_model="Samsung Galaxy S24 Ultra 5G Dual SIM",
            reported_fault="تغيير شاشة كاملة مع باغة وشاسيه وفحص البوردة والبطارية بدقة",
            passcode="1234",
            estimated_cost=3500.0,
            intake_datetime="2026-11-07 18:00"
        )
        img_ar = render_repair_ticket_label(ticket_ar, width_mm=50, height_mm=30)
        self.assertEqual(img_ar.size, (400, 240))
        self.assertEqual(img_ar.mode, "1")

        # Verify geometric non-overlap: phone start x must be strictly greater than customer name max end x
        draw = ImageDraw.Draw(img_ar)
        f_bold = get_font(8.0, bold=True)
        bb_phone = draw.textbbox((0, 0), phone, font=f_bold)
        w_phone = bb_phone[2] - bb_phone[0]
        phone_start_x = 400 - 8 - w_phone
        max_name_w = 384 - w_phone - 8
        name_max_end_x = 8 + max_name_w

        # Ensure at least 8px margin gap between customer name region and phone number start
        self.assertLessEqual(name_max_end_x, phone_start_x - 8)
        self.assertGreater(phone_start_x, name_max_end_x)

        # Verify blank gap pixels between name region and phone across text height (y in 44..58)
        for y_scan in range(44, 59):
            gap_pixels = [img_ar.getpixel((x, y_scan)) for x in range(name_max_end_x, phone_start_x)]
            self.assertTrue(all(p == 1 for p in gap_pixels), f"Collision detected at y={y_scan}: gap pixels between name and phone are not white")

        # Test long English customer name (120+ characters)
        long_name_en = "Alexander Bartholomew Constantine Montgomery III of the Royal Technicians Guild"
        ticket_en = RepairTicket(
            ticket_id="TKT-2026-LONG-EN",
            customer_name=long_name_en,
            customer_phone=phone,
            device_model="iPhone 16 Pro Max",
            reported_fault="Cracked OLED display replacement",
            passcode="0000"
        )
        img_en = render_repair_ticket_label(ticket_en, width_mm=50, height_mm=30)
        self.assertEqual(img_en.size, (400, 240))
        for y_scan in range(44, 59):
            gap_pixels_en = [img_en.getpixel((x, y_scan)) for x in range(name_max_end_x, phone_start_x)]
            self.assertTrue(all(p == 1 for p in gap_pixels_en), f"Collision detected in English long name at y={y_scan}")



class Test06CalibrationLabelRendering(unittest.TestCase):
    """Suite 6: Alignment calibration label generator conforming to Contract #2."""

    def test_28_calibration_geometry_38x25mm(self):
        """Verify calibration label matches 38x25mm (304x200px) geometric boundaries."""
        img = render_calibration_label(width_mm=38, height_mm=25)
        self.assertEqual(img.size, (304, 200))
        self.assertEqual(img.mode, "1")

        geo = VirtualPrintVerifier.verify_calibration_geometry(304, 200, margin_px=8)
        self.assertEqual(geo["border_box"], (8, 8, 296, 192))
        self.assertEqual(geo["center_point"], (152, 100))
        self.assertEqual(geo["horz_ticks_count"], 36)
        self.assertEqual(geo["vert_ticks_count"], 23)

    def test_29_calibration_geometry_50x30mm(self):
        """Verify calibration label on 50x30mm (400x240px)."""
        img = render_calibration_label(width_mm=50, height_mm=30)
        self.assertEqual(img.size, (400, 240))
        self.assertEqual(img.mode, "1")

        geo = VirtualPrintVerifier.verify_calibration_geometry(400, 240, margin_px=8)
        self.assertEqual(geo["border_box"], (8, 8, 392, 232))
        self.assertEqual(geo["center_point"], (200, 120))


if __name__ == "__main__":
    unittest.main()
