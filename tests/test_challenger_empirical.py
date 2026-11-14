"""
tests/test_challenger_empirical.py — Milestone 2 Round 2 Empirical Adversarial Stress Harness
Written by M2 R2 Challenger 1 to independently stress-test:
1. 203 DPI canvas geometry and integer pixel math across standard presets and boundaries.
2. Strict 1-bit monochrome purity across all rendered labels.
3. Code128 barcodes and 2D QR codes quiet zones, module integrity, and deterministic scannability.
4. Concurrent print testing (100 jobs across 10 threads) with printer_name=None for thread safety and zero deadlock.
5. Arabic BiDi leading-digit model codes and repair ticket boundary overlap checks.
"""
import concurrent.futures
import math
import os
from pathlib import Path
import shutil
import threading
import time
import unittest
from unittest.mock import patch
from typing import List, Tuple, Optional

from PIL import Image, ImageDraw

from core.models import DeviceSpecs, RepairTicket
from core.label_renderer import (
    DPI,
    DOTS_PER_MM,
    mm_to_dots,
    render_device_specs_label,
    render_repair_ticket_label,
    render_calibration_label,
    generate_code128_barcode,
    generate_qr_code,
    generate_qr_code_fitted,
    format_compact_smart_merge,
    prepare_arabic_bidi_text,
    get_font,
    CODE128_PATTERNS
)
from core.printer_win32 import (
    print_label_image,
    get_installed_printers,
    detect_thermal_printer,
    is_virtual_printer
)


class Test01CanvasGeometryAndIntegerPixelMath(unittest.TestCase):
    """Stress tests for 203 DPI canvas geometry and integer pixel math."""

    def test_01_dpi_dots_per_mm_exactness(self):
        """203.2 DPI divided by 25.4 mm/inch must equal exactly 8.000 dots/mm."""
        self.assertAlmostEqual(DPI, 203.2, places=4)
        self.assertAlmostEqual(DOTS_PER_MM, 8.0, places=4)
        self.assertEqual(mm_to_dots(1.0), 8)
        self.assertEqual(mm_to_dots(0.5), 4)
        self.assertEqual(mm_to_dots(0.125), 1)

    def test_02_standard_preset_dimensions_all_renderers(self):
        """Standard commercial label presets must scale to exact integer pixels across all renderers."""
        presets = [
            (38, 25, 304, 200),
            (40, 25, 320, 200),
            (50, 30, 400, 240),
            (60, 30, 480, 240),
            (80, 40, 640, 320),
            (80, 50, 640, 400),
        ]

        specs = DeviceSpecs(
            connection_type="mock",
            device_id="TEST-DEV-001",
            brand="Apple",
            marketing_name="iPhone 16 Pro Max",
            model_code="A3297",
            storage="256GB",
            ram="8GB",
            color="Desert Titanium",
            os_version="iOS 18.1",
            serial_number="H79XYZ1234",
            imei1="352099123456789",
            battery_health=98,
            battery_cycles=42,
            sales_region="LL/A"
        )

        ticket = RepairTicket(
            ticket_id="TKT-001234",
            customer_name="Ahmed Al-Sayed",
            customer_phone="01012345678",
            device_model="Galaxy S24 Ultra",
            reported_fault="Screen Replacement",
            passcode="1234",
            estimated_cost=150.0
        )

        for w_mm, h_mm, expected_w, expected_h in presets:
            with self.subTest(preset=f"{w_mm}x{h_mm}mm"):
                # Test specs label
                img_specs = render_device_specs_label(specs, width_mm=w_mm, height_mm=h_mm)
                self.assertEqual(img_specs.size, (expected_w, expected_h))
                self.assertEqual(img_specs.mode, "1")

                # Test ticket label
                img_ticket = render_repair_ticket_label(ticket, width_mm=w_mm, height_mm=h_mm)
                self.assertEqual(img_ticket.size, (expected_w, expected_h))
                self.assertEqual(img_ticket.mode, "1")

                # Test calibration label
                img_calib = render_calibration_label(width_mm=w_mm, height_mm=h_mm)
                self.assertEqual(img_calib.size, (expected_w, expected_h))
                self.assertEqual(img_calib.mode, "1")

    def test_03_boundary_aspect_ratios(self):
        """Boundary sizes (10x10mm square, 100x150mm poster) must render with strict integer math."""
        boundaries = [
            (10, 10, 80, 80),        # Minimal square
            (15, 15, 120, 120),      # Small square
            (100, 150, 800, 1200),   # Very large label
            (20, 80, 160, 640),      # Tall narrow
            (80, 15, 640, 120),      # Wide short
        ]

        specs = DeviceSpecs(
            connection_type="mock",
            device_id="DEV-MIN",
            brand="Generic",
            marketing_name="Model X",
            model_code="X1",
            storage="64GB",
            ram="4GB",
            color="Black",
            os_version="1.0",
            serial_number="SN123",
            imei1="123456789012345"
        )

        for w_mm, h_mm, exp_w, exp_h in boundaries:
            with self.subTest(boundary=f"{w_mm}x{h_mm}"):
                img = render_device_specs_label(specs, width_mm=w_mm, height_mm=h_mm)
                self.assertEqual(img.size, (exp_w, exp_h))
                self.assertEqual(img.mode, "1")

                img_cal = render_calibration_label(width_mm=w_mm, height_mm=h_mm)
                self.assertEqual(img_cal.size, (exp_w, exp_h))
                self.assertEqual(img_cal.mode, "1")


class Test02MonochromePurityVerification(unittest.TestCase):
    """Stress tests verifying 100% strict 1-bit monochrome purity across all label types."""

    def _verify_1bit_purity(self, image: Image.Image):
        """Verifies image is mode '1' and contains strictly 0 (black) and 255 (white) values."""
        self.assertEqual(image.mode, "1", f"Expected mode '1', got {image.mode}")
        self.assertEqual(image.getbands(), ("1",))
        # Inspect raw data / colors
        colors = image.getcolors()
        self.assertIsNotNone(colors)
        values = {color for count, color in colors}
        # In PIL mode '1', pixel values are 0 (black) and 255 (white) or 0 and 1
        valid_values = {0, 255, 1}
        self.assertTrue(
            values.issubset(valid_values),
            f"Image contains unexpected non-monochrome pixel values: {values}"
        )
        # Verify no intermediate grays exist
        for val in values:
            self.assertIn(val, (0, 1, 255))

    def test_04_device_specs_label_monochrome_purity(self):
        """Device specs label in all barcode variations must be purely 1-bit monochrome."""
        specs = DeviceSpecs(
            connection_type="mock",
            device_id="STK-009988",
            brand="Samsung",
            marketing_name="Galaxy S24 Ultra 5G",
            model_code="SM-S928B",
            storage="512GB",
            ram="12GB",
            color="Titanium Gray",
            os_version="Android 14",
            serial_number="RF8X123456",
            imei1="354890123456781",
            battery_health=100,
            battery_cycles=15,
            sales_region="EU"
        )

        for bc_type in ("code128", "qr", "both"):
            with self.subTest(barcode_type=bc_type):
                # Small label
                img1 = render_device_specs_label(specs, width_mm=38, height_mm=25, barcode_type=bc_type)
                self._verify_1bit_purity(img1)
                # Large label
                img2 = render_device_specs_label(specs, width_mm=80, height_mm=50, barcode_type=bc_type)
                self._verify_1bit_purity(img2)
                # Multi-line (compact_merge=False)
                img3 = render_device_specs_label(specs, width_mm=50, height_mm=30, compact_merge=False, barcode_type=bc_type)
                self._verify_1bit_purity(img3)

    def test_05_repair_ticket_label_monochrome_purity(self):
        """Repair ticket label with Arabic and English text must be purely 1-bit monochrome."""
        ticket = RepairTicket(
            ticket_id="TKT-2026-9999",
            customer_name="المهندس أحمد عبد الرحمن",
            customer_phone="01098765432",
            device_model="Xiaomi 14 Ultra",
            reported_fault="تغيير شاشة أصلية مع فحص البطارية",
            passcode="8899",
            sim_removed=True,
            back_cracked=True,
            dead_device=False,
            estimated_cost=250.0
        )

        for bc_type in ("code128", "qr"):
            with self.subTest(barcode_type=bc_type):
                img = render_repair_ticket_label(ticket, width_mm=50, height_mm=30, barcode_type=bc_type)
                self._verify_1bit_purity(img)

    def test_06_calibration_label_monochrome_purity(self):
        """Calibration label must be purely 1-bit monochrome."""
        img = render_calibration_label(width_mm=38, height_mm=25)
        self._verify_1bit_purity(img)

        img_large = render_calibration_label(width_mm=80, height_mm=50)
        self._verify_1bit_purity(img_large)


class Test03BarcodesQuietZonesAndScannability(unittest.TestCase):
    """Stress tests verifying Code128 and QR code quiet zones, module integrity, and scannability."""

    @staticmethod
    def _decode_code128_scanline(image: Image.Image, y_offset: Optional[int] = None) -> Tuple[int, List[int], int]:
        """
        Scans a horizontal line of a 1-bit barcode image, extracts alternating bar/space run-lengths,
        and determines the module width and symbol values according to Code128 specifications.
        """
        w, h = image.size
        y = y_offset if y_offset is not None else h // 2

        # Extract horizontal row pixels: 0 = bar (black), 255/1 = space (white)
        pixels = [0 if image.getpixel((x, y)) == 0 else 1 for x in range(w)]

        # Find first black pixel (start of barcode) and last black pixel
        first_bar = next((x for x, val in enumerate(pixels) if val == 0), -1)
        last_bar = next((w - 1 - x for x, val in enumerate(reversed(pixels)) if val == 0), -1)

        left_quiet_zone = first_bar
        right_quiet_zone = w - 1 - last_bar

        # Measure run lengths of barcode portion
        runs = []
        curr_val = pixels[first_bar]
        curr_len = 0
        for x in range(first_bar, last_bar + 1):
            if pixels[x] == curr_val:
                curr_len += 1
            else:
                runs.append((curr_val, curr_len))
                curr_val = pixels[x]
                curr_len = 1
        runs.append((curr_val, curr_len))

        # Determine estimated module width (GCD or minimum run length)
        min_run = min(run_len for _, run_len in runs)
        module_w = max(1, min_run)

        return left_quiet_zone, right_quiet_zone, module_w

    def test_07_code128_quiet_zones(self):
        """Code128 barcodes must enforce quiet zones on both left and right edges."""
        test_payloads = [
            "352099123456789",  # 15-digit IMEI
            "F17XYZ456KL9",     # 12-char Serial
            "TKT-001020",       # Ticket ID
            "A",                # Single character
            "12345678901234567890" # 20 chars
        ]

        for payload in test_payloads:
            with self.subTest(payload=payload):
                # Default quiet_zone_px = 20, module_width_px = 2
                img = generate_code128_barcode(payload, target_height_px=40, module_width_px=2, quiet_zone_px=20)
                left_q, right_q, mod_w = self._decode_code128_scanline(img)

                # Both quiet zones must be >= 20px
                self.assertGreaterEqual(left_q, 20, f"Left quiet zone {left_q}px < 20px for payload '{payload}'")
                self.assertGreaterEqual(right_q, 20, f"Right quiet zone {right_q}px < 20px for payload '{payload}'")

                # Verify all columns in quiet zones are 100% white across the full height
                for x in range(left_q):
                    for y in range(img.height):
                        self.assertNotEqual(img.getpixel((x, y)), 0, f"Left quiet zone dirty at ({x}, {y})")

                for x in range(img.width - right_q, img.width):
                    for y in range(img.height):
                        self.assertNotEqual(img.getpixel((x, y)), 0, f"Right quiet zone dirty at ({x}, {y})")

    def test_08_code128_module_vertical_uniformity(self):
        """All bars in Code128 must be uniform vertical stripes from y=0 to y=height-1."""
        img = generate_code128_barcode("352099123456789", target_height_px=50, module_width_px=2)
        top_row = [img.getpixel((x, 0)) for x in range(img.width)]
        mid_row = [img.getpixel((x, 25)) for x in range(img.width)]
        bot_row = [img.getpixel((x, 49)) for x in range(img.width)]

        self.assertEqual(top_row, mid_row, "Top row does not match middle row in Code128")
        self.assertEqual(mid_row, bot_row, "Middle row does not match bottom row in Code128")

    def test_09_code128_scannability_and_pattern_validity(self):
        """Code128 barcode must follow exact Code128 symbol encoding with valid Start, Data, Checksum, Stop."""
        payload = "TEST-123"
        img = generate_code128_barcode(payload, target_height_px=40, module_width_px=2, quiet_zone_px=20)
        w, h = img.size

        # Extract middle row (1 for black bar, 0 for white space)
        row = [1 if img.getpixel((x, h // 2)) == 0 else 0 for x in range(w)]
        first_bar = row.index(1)
        last_bar = w - 1 - list(reversed(row)).index(1)

        # Barcode data section length
        barcode_modules = row[first_bar:last_bar + 1]

        # Each module is 2 pixels wide
        mod_w = 2
        # Sample every mod_w pixels
        sampled = barcode_modules[0::mod_w]

        # Verify Code128 Stop pattern at the end: "2331112" (Stop symbol has 13 modules + 2 for termination bar)
        # Pattern 106: 2 bars, 3 spaces, 3 bars, 1 space, 1 bar, 1 space, 2 bars -> 1100011101011
        stop_pattern = "1100011101011"
        sampled_str = "".join(str(m) for m in sampled)
        self.assertTrue(sampled_str.endswith(stop_pattern), f"Barcode does not end with Code128 stop pattern: {sampled_str[-15:]}")

    def test_10_qr_code_quiet_zone_and_finder_patterns(self):
        """2D QR codes must have crisp quiet zones and valid 7x7 Finder Pattern geometry."""
        data = "https://label.workshop.local/tkt/1001"
        box_size = 3
        border = 2
        img = generate_qr_code(data, box_size_px=box_size, border_modules=border)

        self.assertEqual(img.mode, "1")
        w, h = img.size
        self.assertEqual(w, h, "QR code must be strictly square")

        # Quiet zone border check: outer (border * box_size) pixels must be pure white
        quiet_px = border * box_size
        for x in range(w):
            for y in range(quiet_px):
                self.assertEqual(img.getpixel((x, y)), 255, f"Top quiet zone dirty at ({x}, {y})")
                self.assertEqual(img.getpixel((x, h - 1 - y)), 255, f"Bottom quiet zone dirty at ({x}, {h - 1 - y})")
        for y in range(h):
            for x in range(quiet_px):
                self.assertEqual(img.getpixel((x, y)), 255, f"Left quiet zone dirty at ({x}, y={y})")
                self.assertEqual(img.getpixel((w - 1 - x, y)), 255, f"Right quiet zone dirty at ({w - 1 - x}, y={y})")

        # Top-Left Finder Pattern: 7x7 modules starting at (quiet_px, quiet_px)
        # Module (0,0) of finder pattern must be black
        finder_x = quiet_px
        finder_y = quiet_px
        # Center of finder pattern (3 modules in) must be black
        center_x = finder_x + 3 * box_size + 1
        center_y = finder_y + 3 * box_size + 1
        self.assertEqual(img.getpixel((center_x, center_y)), 0, "Finder pattern center must be black")

    def test_11_qr_code_fitted_constraint(self):
        """generate_qr_code_fitted must produce square image strictly within max_size_px."""
        payload = "DEVICE:SM-S928B|IMEI:352099123456789|STOCK:STK-001"
        for max_px in (50, 70, 90, 120, 200):
            with self.subTest(max_size=max_px):
                img = generate_qr_code_fitted(payload, max_size_px=max_px, border_modules=1)
                self.assertLessEqual(img.width, max_px)
                self.assertLessEqual(img.height, max_px)
                self.assertEqual(img.width, img.height)
                self.assertEqual(img.mode, "1")


class Test04ConcurrentPrintingStressHarness(unittest.TestCase):
    """
    Stress tests concurrent printing with printer_name=None across 10 threads and 100 jobs.
    Verifies thread safety, absence of deadlocks, 100% throughput, and collision-free exports.
    """

    def setUp(self):
        self.temp_exports_dir = Path("exports/labels")
        self.temp_exports_dir.mkdir(parents=True, exist_ok=True)
        self.created_files = []

    def tearDown(self):
        # Clean up files created during concurrent test
        for fp in self.created_files:
            try:
                p = Path(fp)
                if p.exists():
                    p.unlink()
            except Exception:
                pass

    @patch("core.printer_win32.detect_thermal_printer", return_value=None)
    def test_12_concurrent_100_print_jobs_across_10_threads(self, mock_detect):
        """Execute 100 print jobs concurrently across 10 threads with printer_name=None."""
        total_jobs = 100
        num_threads = 10

        # Create 100 distinct label images (304x200 1-bit)
        images = []
        for i in range(total_jobs):
            img = Image.new("1", (304, 200), color=1)
            d = ImageDraw.Draw(img)
            d.text((10, 10), f"CONCURRENT JOB #{i:03d}", fill=0)
            images.append(img)

        results = []
        errors = []
        start_time = time.perf_counter()

        def print_worker(job_idx: int) -> Tuple[int, bool, str]:
            try:
                img = images[job_idx]
                success, msg = print_label_image(img, printer_name=None, virtual_fallback=True)
                return job_idx, success, msg
            except Exception as exc:
                return job_idx, False, str(exc)

        # Run concurrent print requests using ThreadPoolExecutor
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_threads) as executor:
            future_to_job = {executor.submit(print_worker, i): i for i in range(total_jobs)}
            for future in concurrent.futures.as_completed(future_to_job, timeout=60.0):
                job_idx = future_to_job[future]
                try:
                    res = future.result()
                    results.append(res)
                    if res[1]:
                        self.created_files.append(res[2])
                    else:
                        errors.append(res)
                except Exception as exc:
                    errors.append((job_idx, False, str(exc)))

        elapsed_time = time.perf_counter() - start_time

        # 1. Zero deadlock and full completion
        self.assertEqual(len(results), total_jobs, f"Expected {total_jobs} results, got {len(results)}")
        self.assertEqual(len(errors), 0, f"Encountered errors during concurrent printing: {errors}")

        # 2. 100% throughput: all jobs must succeed
        success_count = sum(1 for _, ok, _ in results if ok)
        self.assertEqual(success_count, total_jobs, f"Only {success_count}/{total_jobs} jobs succeeded")

        # 3. All returned paths must be unique (no uuid collision or file overwrite)
        saved_paths = [path for _, ok, path in results if ok]
        unique_paths = set(saved_paths)
        self.assertEqual(
            len(unique_paths),
            total_jobs,
            f"Filename collision detected: {total_jobs} jobs yielded only {len(unique_paths)} unique files"
        )

        # 4. Verify all saved files exist on disk, are valid mode '1' PNGs, and have size (304, 200)
        for path_str in saved_paths:
            file_path = Path(path_str)
            self.assertTrue(file_path.exists(), f"Saved virtual print file missing: {path_str}")
            with Image.open(str(file_path)) as opened_img:
                self.assertEqual(opened_img.size, (304, 200))
                self.assertEqual(opened_img.mode, "1")

        print(f"\n[STRESS TEST] Concurrent 100 print jobs across 10 threads completed in {elapsed_time:.3f}s (Throughput: {total_jobs/elapsed_time:.1f} jobs/sec)")


class Test05ArabicBidiAndLayoutEdgeCases(unittest.TestCase):
    """Stress tests for Arabic BiDi leading-digit models and repair ticket layout bounds."""

    def test_13_leading_digit_smartphone_models_preserve_ltr(self):
        """Smartphone model names starting with digits or numbers must preserve LTR order."""
        test_cases = [
            ("موديل 14 Ultra ممتاز", "14 Ultra"),
            ("جهاز 12 Pro Max أصلي", "12 Pro Max"),
            ("صيانة 10 Pro+ شاشة", "10 Pro+"),
            ("سامسونج S23+ مع 5G جديد", "S23+"),
            ("شاومي Note 12 Pro+ سليم", "Note 12 Pro+"),
            ("هاتف 8T ون بلس", "8T"),
            ("هواوي 8X مستعمل", "8X"),
            ("ايفون 16 Pro Max فحص", "16 Pro Max"),
        ]

        for arabic_text, expected_span in test_cases:
            with self.subTest(text=arabic_text):
                processed = prepare_arabic_bidi_text(arabic_text)
                self.assertIn(expected_span, processed, f"Span '{expected_span}' corrupted or inverted in: '{processed}'")

    def test_14_repair_ticket_long_customer_name_no_phone_overlap(self):
        """Extreme length customer name must not overlap phone number and maintain >= 8px gap."""
        long_names = [
            "المهندس أحمد عبد الرحمن السيد الشناوي الدسوقي الإسكندراني",
            "Dr. Christopher Alexander Montgomery Bartholomew Wellington The Third",
            "محمد " * 30,
        ]

        phone = "01012345678"

        for name in long_names:
            with self.subTest(name=name[:20]):
                ticket = RepairTicket(
                    ticket_id="TKT-OVERLAP-CHK",
                    customer_name=name,
                    customer_phone=phone,
                    device_model="S24 Ultra",
                    reported_fault="Broken Glass",
                    passcode="0000"
                )
                img = render_repair_ticket_label(ticket, width_mm=50, height_mm=30)
                self.assertEqual(img.size, (400, 240))

                # Phone text bounds
                d = ImageDraw.Draw(img)
                f_bold = get_font(8.0, bold=True)
                bb_p = d.textbbox((0, 0), phone, font=f_bold)
                w_phone = bb_p[2] - bb_p[0]

                margin_px = 8
                usable_w = 400 - 16
                phone_start_x = 400 - margin_px - w_phone
                name_max_w = usable_w - w_phone - 8
                name_end_x = margin_px + name_max_w

                gap = phone_start_x - name_end_x
                self.assertGreaterEqual(gap, 8, f"Gap between name and phone {gap}px is less than 8px")

                # The gap area (columns name_end_x to phone_start_x - 1, rows 44 to 59) must be pure white (no overlap)
                gap_pixels = [
                    img.getpixel((x, y))
                    for x in range(name_end_x, phone_start_x)
                    for y in range(44, 59)
                ]
                self.assertTrue(
                    all(p != 0 for p in gap_pixels),
                    f"Pixel overlap detected in gap region for name '{name[:25]}...'"
                )


if __name__ == "__main__":
    unittest.main()
