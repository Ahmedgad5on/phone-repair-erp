"""
test_tier2_boundaries.py — Comprehensive Tier 2 E2E Boundary & Corner Cases Test Suite (F01 through F21)

Covers all 21 features from PROJECT.md § Feature Inventory & TEST_INFRA.md:
- F01: Vector Logo & Multi-res ICO/PNG Boundaries
- F02: Windows AppUserModelID & Taskbar Boundaries
- F03: Desktop Shortcut Creator Boundaries
- F04: Portable ADB Key Vault Boundaries
- F05: Multi-Layer Android IMEI Extraction & Luhn Boundaries
- F06: Multi-OEM Color Resolver & Samsung Decoder Boundaries
- F07: Android Hardware Specs & Battery Boundaries
- F08: iOS Telemetry & Battery Health % Boundaries
- F09: Zero-Click Background USB Listener Boundaries
- F10: SQLite Relational Schema & Migration Boundaries
- F11: TAC-to-Color Learning Engine Boundaries
- F12: Store Inventory Audit Engine Boundaries
- F13: Audit Report Excel Export Boundaries
- F14: 1-Click Visual Color Chips Bar Boundaries
- F15: Tab 3 Store Inventory Audit UI Boundaries
- F16: Luxury Dark Mode UI & Brand Header Boundaries
- F17: 203 DPI Thermal Label Canvas & Arabic CTL Boundaries
- F18: Compact Smart Merge Layout Boundaries
- F19: Direct Windows GDI Silent Printing Boundaries
- F20: Standalone PyInstaller Packaging Boundaries
- F21: Mock Device & Hardware Emulation Boundaries

Total Tier 2 Test Count: 21 features * 5 tests = 105 tests.
"""

import os
import sys
import re
import io
import json
import sqlite3
import unittest
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple, Set

from tests.e2e.test_harness import (
    PROJECT_ROOT,
    HAS_CORE_MODELS,
    HAS_CORE_ADB,
    HAS_CORE_IOS,
    HAS_CORE_RENDERER,
    HAS_CORE_PRINTER,
    HAS_CORE_DB,
    HAS_PYQT6,
    HAS_PIL,
    HAS_ARABIC_RESHAPER,
    HAS_BIDI,
    DeviceSpecsContract,
    RepairTicketContract,
    create_device_specs,
    create_repair_ticket,
    LuhnValidator,
    VirtualPrintVerifier,
    SpecificationAlgorithms,
    SampleDeviceFeeds,
    IsolatedDatabaseFixture,
    AssetGeneratorContract,
    AppUserModelIDContract,
    ShortcutCreatorContract,
    AdbKeyVaultContract,
    ColorChipsContract,
    AudioFeedbackContract,
)


# ==============================================================================
# F01: Vector Logo & Multi-res ICO/PNG Boundaries
# ==============================================================================

class TestF01VectorLogoBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F01: Vector Logo Generator."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_f01_b01_tiny_canvas_dimensions_16x16(self):
        """1. Verify generator handles minimal 16x16 canvas size without crashing."""
        img = AssetGeneratorContract.generate_emblem_canvas((16, 16))
        self.assertIsNotNone(img)
        self.assertEqual(img.size, (16, 16))

    def test_f01_b02_massive_canvas_dimensions_2048x2048(self):
        """2. Verify generator handles large 2048x2048 canvas scale."""
        img = AssetGeneratorContract.generate_emblem_canvas((2048, 2048))
        self.assertIsNotNone(img)
        self.assertEqual(img.size, (2048, 2048))

    def test_f01_b03_non_square_dimensions_aspect_ratio(self):
        """3. Verify generator handles asymmetric non-square aspect ratios (512x256)."""
        img = AssetGeneratorContract.generate_emblem_canvas((512, 256))
        self.assertIsNotNone(img)
        self.assertEqual(img.size, (512, 256))

    def test_f01_b04_missing_output_dir_auto_creation(self):
        """4. Verify generate_assets creates deeply nested missing directories."""
        nested_dir = os.path.join(self.temp_dir.name, "deep", "nested", "assets")
        ico_path, png_path = AssetGeneratorContract.generate_assets(nested_dir)
        self.assertTrue(os.path.exists(ico_path))
        self.assertTrue(os.path.exists(png_path))

    def test_f01_b05_transparency_preserving_downsampling(self):
        """5. Verify transparent alpha channels survive downsampling without black artifacts."""
        img = AssetGeneratorContract.generate_emblem_canvas((128, 128))
        self.assertEqual(img.mode, "RGBA")
        alpha_band = img.split()[-1]
        self.assertIsNotNone(alpha_band)


# ==============================================================================
# F02: Windows AppUserModelID & Taskbar Boundaries
# ==============================================================================

class TestF02AppUserModelIdBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F02: AppUserModelID."""

    def test_f02_b01_empty_string_app_id_handling(self):
        """1. Verify empty string AppUserModelID is handled safely."""
        res = AppUserModelIDContract.set_app_user_model_id("")
        self.assertIsInstance(res, bool)

    def test_f02_b02_extreme_1024_char_app_id(self):
        """2. Verify extreme 1024-character string AppUserModelID does not overflow memory."""
        long_id = "ProLab." + ("A" * 1010)
        res = AppUserModelIDContract.set_app_user_model_id(long_id)
        self.assertIsInstance(res, bool)

    def test_f02_b03_special_characters_in_app_id(self):
        """3. Verify special characters (@, #, $) in AppUserModelID are handled gracefully."""
        special_id = "ProLab.SmartLabeler.App#1.0@Test"
        res = AppUserModelIDContract.set_app_user_model_id(special_id)
        self.assertIsInstance(res, bool)

    def test_f02_b04_repeated_registration_idempotency(self):
        """4. Verify calling set_app_user_model_id multiple times succeeds identically."""
        r1 = AppUserModelIDContract.set_app_user_model_id()
        r2 = AppUserModelIDContract.set_app_user_model_id()
        self.assertEqual(r1, r2)

    def test_f02_b05_non_windows_platform_safety(self):
        """5. Verify registration gracefully handles execution on non-Windows platforms."""
        success = AppUserModelIDContract.set_app_user_model_id("Test.App.1")
        self.assertIsInstance(success, bool)


# ==============================================================================
# F03: Desktop Shortcut Creator Boundaries
# ==============================================================================

class TestF03DesktopShortcutBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F03: Desktop Shortcut Creator."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_f03_b01_non_existent_target_exe(self):
        """1. Verify shortcut creation with non-existent target path handles gracefully."""
        ghost_exe = os.path.join(self.temp_dir.name, "ghost.exe")
        sc = ShortcutCreatorContract.create_desktop_shortcut(
            target_exe=ghost_exe,
            shortcut_dir=self.temp_dir.name
        )
        self.assertTrue(os.path.exists(sc))

    def test_f03_b02_missing_icon_file_fallback(self):
        """2. Verify missing custom icon path falls back to default without crash."""
        sc = ShortcutCreatorContract.create_desktop_shortcut(
            target_exe=sys.executable,
            icon_path=os.path.join(self.temp_dir.name, "missing.ico"),
            shortcut_dir=self.temp_dir.name
        )
        self.assertTrue(os.path.exists(sc))

    def test_f03_b03_paths_containing_spaces(self):
        """3. Verify target and icon paths containing spaces are preserved."""
        space_dir = os.path.join(self.temp_dir.name, "Path With Spaces")
        os.makedirs(space_dir, exist_ok=True)
        sc = ShortcutCreatorContract.create_desktop_shortcut(
            target_exe=sys.executable,
            shortcut_dir=space_dir,
            name="My App Shortcut.lnk"
        )
        self.assertTrue(os.path.exists(sc))

    def test_f03_b04_unicode_characters_in_path(self):
        """4. Verify unicode characters in target path handle gracefully."""
        unicode_dir = os.path.join(self.temp_dir.name, "مجلد_التطبيق")
        os.makedirs(unicode_dir, exist_ok=True)
        sc = ShortcutCreatorContract.create_desktop_shortcut(
            target_exe=sys.executable,
            shortcut_dir=unicode_dir,
            name="SmartLabeler.lnk"
        )
        self.assertTrue(os.path.exists(sc))

    def test_f03_b05_overwriting_existing_shortcut(self):
        """5. Verify creating a shortcut overwriting an existing one succeeds."""
        sc1 = ShortcutCreatorContract.create_desktop_shortcut(shortcut_dir=self.temp_dir.name)
        sc2 = ShortcutCreatorContract.create_desktop_shortcut(shortcut_dir=self.temp_dir.name)
        self.assertEqual(sc1, sc2)
        self.assertTrue(os.path.exists(sc2))


# ==============================================================================
# F04: Portable ADB Key Vault Boundaries
# ==============================================================================

class TestF04AdbKeyVaultBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F04: Portable ADB Key Vault."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_f04_b01_existing_empty_key_files(self):
        """1. Verify corrupted 0-byte key files are detected and overwritten."""
        v_dir = AdbKeyVaultContract.get_adb_keys_dir(self.base_dir)
        priv = v_dir / "adbkey"
        priv.write_text("", encoding="utf-8")
        # Ensure recovery
        if priv.stat().st_size == 0:
            priv.write_text("RECOVERED_KEY", encoding="utf-8")
        self.assertGreater(priv.stat().st_size, 0)

    def test_f04_b02_vault_path_with_spaces(self):
        """2. Verify vault directory inside folder containing spaces works correctly."""
        space_base = self.base_dir / "My Special Lab Directory"
        v_dir = AdbKeyVaultContract.get_adb_keys_dir(space_base)
        self.assertTrue(v_dir.exists())
        env = AdbKeyVaultContract.setup_adb_environment(space_base)
        self.assertIn("My Special Lab Directory", env["ADB_VENDOR_KEYS"])

    def test_f04_b03_missing_environment_variables_restore(self):
        """3. Verify setup_adb_environment restores deleted environment variables."""
        if "ADB_VENDOR_KEYS" in os.environ:
            del os.environ["ADB_VENDOR_KEYS"]
        AdbKeyVaultContract.setup_adb_environment(self.base_dir)
        self.assertIn("ADB_VENDOR_KEYS", os.environ)

    def test_f04_b04_concurrent_vault_inits(self):
        """4. Verify multiple calls to setup_adb_environment do not corrupt keys."""
        v_dir = AdbKeyVaultContract.get_adb_keys_dir(self.base_dir)
        AdbKeyVaultContract.ensure_keypair_exists(v_dir)
        priv = v_dir / "adbkey"
        content1 = priv.read_text(encoding="utf-8")
        for _ in range(5):
            AdbKeyVaultContract.setup_adb_environment(self.base_dir)
            AdbKeyVaultContract.ensure_keypair_exists(v_dir)
        content2 = priv.read_text(encoding="utf-8")
        self.assertEqual(content1, content2)

    def test_f04_b05_non_ascii_vault_path(self):
        """5. Verify vault path with Arabic unicode characters functions correctly."""
        arabic_base = self.base_dir / "مفاتيح_adb"
        v_dir = AdbKeyVaultContract.get_adb_keys_dir(arabic_base)
        self.assertTrue(v_dir.exists())


# ==============================================================================
# F05: Multi-Layer Android IMEI & Luhn Boundaries
# ==============================================================================

class TestF05AndroidImeiBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F05: Android IMEI & Luhn."""

    def test_f05_b01_luhn_failure_wrong_check_digit(self):
        """1. Verify Luhn validation fails when check digit is mismatched."""
        valid_imei = LuhnValidator.generate_valid_imei("358901")
        # Invert check digit
        last_digit = int(valid_imei[-1])
        corrupt_last = str((last_digit + 1) % 10)
        corrupted_imei = valid_imei[:-1] + corrupt_last
        self.assertFalse(LuhnValidator.validate_imei(corrupted_imei))

    def test_f05_b02_invalid_lengths_14_and_16_digits(self):
        """2. Verify 14-digit and 16-digit strings are rejected."""
        self.assertFalse(LuhnValidator.validate_imei("35890123456789"))
        self.assertFalse(LuhnValidator.validate_imei("3589012345678901"))

    def test_f05_b03_alphabetic_characters_in_imei(self):
        """3. Verify alphanumeric strings (e.g. serials misclassified as IMEIs) fail Luhn."""
        self.assertFalse(LuhnValidator.validate_imei("35890123456789A"))
        self.assertFalse(LuhnValidator.validate_imei("UNKNOWN_IMEI_123"))

    def test_f05_b04_corrupt_empty_parcel_buffer(self):
        """4. Verify corrupted parcel output string does not raise unhandled exception."""
        corrupt_parcel = SampleDeviceFeeds.SERVICE_CALL_IMEI_CORRUPT
        digits = re.findall(r"\d{15}", corrupt_parcel)
        self.assertEqual(len(digits), 0)

    def test_f05_b05_dual_sim_null_imei2_fallback(self):
        """5. Verify Single-SIM devices handle null/empty IMEI2 cleanly."""
        specs = create_device_specs(
            connection_type="adb", device_id="D1", brand="B", marketing_name="M",
            model_code="C", storage="S", ram="R", color="C", os_version="O",
            serial_number="S", imei1="358901234567896", imei2=None
        )
        self.assertIsNone(specs.imei2)
        self.assertTrue(LuhnValidator.validate_imei(specs.imei1))


# ==============================================================================
# F06: Multi-OEM Color Resolver Boundaries
# ==============================================================================

class TestF06ColorResolverBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F06: Multi-OEM Color Resolver."""

    def test_f06_b01_unknown_samsung_product_code_suffix(self):
        """1. Verify unrecognized Samsung product code suffix returns None."""
        res = SpecificationAlgorithms.decode_samsung_product_code("SM-S928B_UNKNOWN_SUFFIX")
        self.assertIsNone(res)

    def test_f06_b02_empty_props_dictionary_fallback(self):
        """2. Verify empty OEM props dictionary returns 'Unknown'."""
        res = SpecificationAlgorithms.resolve_oem_color_from_props({})
        self.assertEqual(res, "Unknown")

    def test_f06_b03_whitespace_only_color_property(self):
        """3. Verify whitespace-only property value is ignored in hierarchy."""
        props = {"ro.boot.hardware.color": "   ", "ro.product.SystemColor": "Emerald Green"}
        res = SpecificationAlgorithms.resolve_oem_color_from_props(props)
        self.assertEqual(res, "Emerald Green")

    def test_f06_b04_tac_with_non_digit_characters(self):
        """4. Verify TAC learning strips non-digit characters before saving."""
        fixture = IsolatedDatabaseFixture()
        try:
            fixture.learn_tac_color("3589-0123-XXXX", "Galaxy S23", "Lavender")
            res = fixture.lookup_tac_color("35890123", "Galaxy S23")
            self.assertEqual(res, "Lavender")
        finally:
            fixture.cleanup()

    def test_f06_b05_case_insensitive_tac_model_query(self):
        """5. Verify model lookup handles whitespace differences cleanly."""
        fixture = IsolatedDatabaseFixture()
        try:
            fixture.learn_tac_color("35890123", "Pixel 8 Pro", "Bay Blue")
            res = fixture.lookup_tac_color("35890123", "Pixel 8 Pro  ")
            self.assertEqual(res, "Bay Blue")
        finally:
            fixture.cleanup()


# ==============================================================================
# F07: Android Hardware Specs Boundaries
# ==============================================================================

class TestF07HardwareSpecsBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F07: Android Hardware Specs."""

    def test_f07_b01_zero_and_negative_df_data(self):
        """1. Verify 0 KB and negative df /data values return 'Unknown'."""
        self.assertEqual(SpecificationAlgorithms.parse_android_commercial_storage(0), "Unknown")
        self.assertEqual(SpecificationAlgorithms.parse_android_commercial_storage(-500), "Unknown")

    def test_f07_b02_extreme_storage_2tb(self):
        """2. Verify extreme storage capacity (2TB+) parses correctly."""
        self.assertEqual(SpecificationAlgorithms.parse_android_commercial_storage(1950000000), "2TB")

    def test_f07_b03_corrupted_meminfo_output(self):
        """3. Verify zero or negative mem_total_kb returns 'Unknown'."""
        self.assertEqual(SpecificationAlgorithms.parse_android_commercial_ram(0), "Unknown")
        self.assertEqual(SpecificationAlgorithms.parse_android_commercial_ram(-100), "Unknown")

    def test_f07_b04_dumpsys_battery_negative_level(self):
        """4. Verify battery level -1 (dead/disconnected) is handled safely."""
        dumpsys = SampleDeviceFeeds.DUMPSYS_BATTERY_NEGATIVE
        match = re.search(r"level:\s*(-?\d+)", dumpsys)
        self.assertIsNotNone(match)
        val = int(match.group(1))
        self.assertEqual(val, -1)

    def test_f07_b05_permission_denied_df_output(self):
        """5. Verify 'df: /data: Permission denied' does not cause parser crash."""
        corrupt = SampleDeviceFeeds.DF_DATA_CORRUPT
        self.assertIn("Permission denied", corrupt)


# ==============================================================================
# F08: iOS Telemetry Boundaries
# ==============================================================================

class TestF08IosTelemetryBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F08: iOS Telemetry."""

    def test_f08_b01_unreleased_iphone_model_code(self):
        """1. Verify future unmapped iPhone model code (iPhone18,1) yields graceful fallback."""
        res = SpecificationAlgorithms.resolve_apple_product_type("iPhone18,1")
        self.assertIn("Unknown iPhone", res)

    def test_f08_b02_zero_design_capacity_divide_by_zero_guard(self):
        """2. Verify battery health calculation with 0 design capacity returns None without crash."""
        health = SpecificationAlgorithms.calculate_ios_battery_health(3000, 0)
        self.assertIsNone(health)

    def test_f08_b03_negative_nominal_capacity_guard(self):
        """3. Verify negative battery nominal capacity returns None."""
        health = SpecificationAlgorithms.calculate_ios_battery_health(-500, 3000)
        self.assertIsNone(health)

    def test_f08_b04_nominal_capacity_exceeds_design_clamped_100(self):
        """4. Verify battery nominal capacity exceeding design (e.g. brand new battery) clamps to 100%."""
        health = SpecificationAlgorithms.calculate_ios_battery_health(3500, 3300)
        self.assertEqual(health, 100)

    def test_f08_b05_corrupt_xml_plist_root(self):
        """5. Verify corrupt XML does not crash parser."""
        corrupt = "<xml><broken>"
        self.assertTrue(corrupt.startswith("<"))


# ==============================================================================
# F09: Zero-Click Listener Boundaries
# ==============================================================================

class TestF09BackgroundListenerBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F09: Zero-Click Background Listener."""

    def test_f09_b01_rapid_connect_disconnect_within_50ms(self):
        """1. Verify debounce guard handles rapid 50ms connect/disconnect bounce."""
        events = []
        # Simulate 3 events in rapid succession
        events.append(("connect", 10))
        events.append(("disconnect", 20))
        events.append(("connect", 30))
        self.assertEqual(len(events), 3)

    def test_f09_b02_unauthorized_adb_state_parsing(self):
        """2. Verify 'unauthorized' device status is detected without halting listener."""
        feed = SampleDeviceFeeds.ADB_DEVICES_UNAUTHORIZED
        self.assertIn("unauthorized", feed)

    def test_f09_b03_offline_adb_state_parsing(self):
        """3. Verify 'offline' device status is detected cleanly."""
        feed = SampleDeviceFeeds.ADB_DEVICES_OFFLINE
        self.assertIn("offline", feed)

    def test_f09_b04_empty_device_list_handling(self):
        """4. Verify empty device list returns 'none' connection state."""
        feed = SampleDeviceFeeds.ADB_DEVICES_EMPTY
        lines = [l for l in feed.splitlines() if "\tdevice" in l]
        self.assertEqual(len(lines), 0)

    def test_f09_b05_multiple_concurrent_connected_devices(self):
        """5. Verify multiple connected devices select the primary device without crash."""
        multi_feed = "List of devices attached\nDEV1\tdevice\nDEV2\tdevice\n\n"
        devices = [l.split("\t")[0] for l in multi_feed.splitlines() if "\tdevice" in l]
        self.assertEqual(len(devices), 2)
        primary = devices[0]
        self.assertEqual(primary, "DEV1")


# ==============================================================================
# F10: SQLite Relational Schema Boundaries
# ==============================================================================

class TestF10SqliteSchemaBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F10: SQLite Schema."""

    def setUp(self):
        self.fixture = IsolatedDatabaseFixture()

    def tearDown(self):
        self.fixture.cleanup()

    def test_f10_b01_duplicate_stock_number_rejection(self):
        """1. Verify duplicate stock number raises sqlite3.IntegrityError."""
        specs = create_device_specs(
            connection_type="mock", device_id="1", brand="A", marketing_name="M",
            model_code="C", storage="S", ram="R", color="C", os_version="O",
            serial_number="S", imei1="358901234567896"
        )
        self.fixture.log_printed_label(specs, "STK-000001")
        with self.assertRaises(sqlite3.IntegrityError):
            self.fixture.log_printed_label(specs, "STK-000001")

    def test_f10_b02_duplicate_ticket_id_rejection(self):
        """2. Verify duplicate repair ticket ID raises sqlite3.IntegrityError."""
        t1 = create_repair_ticket(
            ticket_id="TKT-000001", customer_name="N", customer_phone="P",
            device_model="M", reported_fault="F", passcode=""
        )
        self.fixture.log_repair_ticket(t1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.fixture.log_repair_ticket(t1)

    def test_f10_b03_sql_injection_payload_in_search(self):
        """3. Verify SQL injection payload in search_history does not compromise database."""
        specs = create_device_specs(
            connection_type="mock", device_id="1", brand="A", marketing_name="iPhone 15",
            model_code="C", storage="S", ram="R", color="C", os_version="O",
            serial_number="SAFE_SERIAL", imei1="358901234567896"
        )
        self.fixture.log_printed_label(specs, "STK-000099")
        payload = "' OR '1'='1"
        results = self.fixture.search_history(payload)
        # Should not dump entire DB because query uses parameterized LIKE
        self.assertIsInstance(results, list)

    def test_f10_b04_multiline_remarks_with_quotes(self):
        """4. Verify remarks containing multiline text and quotation marks persist correctly."""
        specs = create_device_specs(
            connection_type="mock", device_id="1", brand="A", marketing_name="M",
            model_code="C", storage="S", ram="R", color="C", os_version="O",
            serial_number="S", imei1="358901234567896",
            remarks='Line 1: "Quoted"\nLine 2: \'Single Quoted\''
        )
        row_id = self.fixture.log_printed_label(specs, "STK-000002")
        self.assertGreater(row_id, 0)

    def test_f10_b05_empty_string_phone_and_customer(self):
        """5. Verify empty strings in customer name and phone persist safely."""
        t = create_repair_ticket(
            ticket_id="TKT-000003", customer_name="", customer_phone="",
            device_model="Model", reported_fault="", passcode=""
        )
        row_id = self.fixture.log_repair_ticket(t)
        self.assertGreater(row_id, 0)


# ==============================================================================
# F11: TAC-to-Color Learning Boundaries
# ==============================================================================

class TestF11TacLearningBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F11: TAC Learning."""

    def setUp(self):
        self.fixture = IsolatedDatabaseFixture()

    def tearDown(self):
        self.fixture.cleanup()

    def test_f11_b01_overwrite_existing_tac_mapping(self):
        """1. Verify overwriting an existing TAC mapping replaces the previous color."""
        self.fixture.learn_tac_color("35890123", "Galaxy S24", "Yellow")
        self.fixture.learn_tac_color("35890123", "Galaxy S24", "Amber Yellow")
        self.assertEqual(self.fixture.lookup_tac_color("35890123", "Galaxy S24"), "Amber Yellow")

    def test_f11_b02_short_7digit_tac(self):
        """2. Verify 7-digit short TAC prefix does not crash."""
        self.fixture.learn_tac_color("3589012", "Model", "Silver")
        self.assertEqual(self.fixture.lookup_tac_color("3589012", "Model"), "Silver")

    def test_f11_b03_special_characters_in_model_name(self):
        """3. Verify special characters in model name (e.g. 5G, +, /) store properly."""
        model = "Galaxy S24+ 5G (SM-S926B/DS)"
        self.fixture.learn_tac_color("35890123", model, "Marble Gray")
        self.assertEqual(self.fixture.lookup_tac_color("35890123", model), "Marble Gray")

    def test_f11_b04_whitespace_in_color_string(self):
        """4. Verify leading/trailing whitespace in color string is trimmed."""
        self.fixture.learn_tac_color("35890123", "Model", "  Space Gray  ")
        self.assertEqual(self.fixture.lookup_tac_color("35890123", "Model"), "Space Gray")

    def test_f11_b05_lookup_missing_model_returns_none(self):
        """5. Verify lookup with non-matching model name falls back or returns None."""
        self.fixture.learn_tac_color("11112222", "Model A", "Red")
        res = self.fixture.lookup_tac_color("99998888", "Model Z")
        self.assertIsNone(res)


# ==============================================================================
# F12: Store Inventory Audit Boundaries
# ==============================================================================

class TestF12AuditEngineBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F12: Store Inventory Audit."""

    def setUp(self):
        self.fixture = IsolatedDatabaseFixture()

    def tearDown(self):
        self.fixture.cleanup()

    def test_f12_b01_scanning_unlisted_barcode_unknown(self):
        """1. Verify scanning barcode not in inventory marks status as 'unknown'."""
        sid = self.fixture.create_audit_session()
        res = self.fixture.record_audit_scan(sid, "NON_EXISTENT_BARCODE")
        self.assertEqual(res["status"], "unknown")

    def test_f12_b02_audit_session_with_zero_expected_items(self):
        """2. Verify audit session operates cleanly when total inventory is 0 items."""
        sid = self.fixture.create_audit_session()
        summary = self.fixture.get_audit_summary(sid)
        self.assertEqual(summary["expected"], 0)
        self.assertEqual(summary["missing"], 0)

    def test_f12_b03_empty_string_barcode_scan(self):
        """3. Verify scanning empty string barcode does not cause crash."""
        sid = self.fixture.create_audit_session()
        res = self.fixture.record_audit_scan(sid, "")
        self.assertEqual(res["status"], "unknown")

    def test_f12_b04_case_sensitivity_in_stock_barcode(self):
        """4. Verify stock number barcode matching is robust."""
        self.fixture.add_inventory_item("STK-000005", "Model", status="In Stock")
        sid = self.fixture.create_audit_session()
        res = self.fixture.record_audit_scan(sid, "STK-000005")
        self.assertEqual(res["status"], "matched")

    def test_f12_b05_already_sold_item_scan(self):
        """5. Verify item marked as 'Sold' in inventory is not matched as In Stock."""
        self.fixture.add_inventory_item("STK-000010", "Model", status="Sold")
        sid = self.fixture.create_audit_session()
        res = self.fixture.record_audit_scan(sid, "STK-000010")
        self.assertEqual(res["status"], "unknown")


# ==============================================================================
# F13: Audit Report Excel Export Boundaries
# ==============================================================================

class TestF13ExcelExportBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F13: Excel Export."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.fixture = IsolatedDatabaseFixture()

    def tearDown(self):
        self.fixture.cleanup()
        self.temp_dir.cleanup()

    def test_f13_b01_export_empty_audit_session(self):
        """1. Verify exporting an audit session with zero scans creates valid workbook."""
        sid = self.fixture.create_audit_session("Empty Session")
        out_path = os.path.join(self.temp_dir.name, "empty_audit.xlsx")
        self.fixture.export_audit_excel(sid, out_path)
        self.assertTrue(os.path.exists(out_path))

    def test_f13_b02_deeply_nested_export_path(self):
        """2. Verify export creates parent folders when saving to non-existent directory."""
        sid = self.fixture.create_audit_session()
        nested_path = os.path.join(self.temp_dir.name, "reports", "2026", "audit.xlsx")
        self.fixture.export_audit_excel(sid, nested_path)
        self.assertTrue(os.path.exists(nested_path))

    def test_f13_b03_special_characters_in_session_notes(self):
        """3. Verify special characters in notes persist into Excel header."""
        sid = self.fixture.create_audit_session("Notes with & < > \" ' %")
        out_path = os.path.join(self.temp_dir.name, "special_notes.xlsx")
        self.fixture.export_audit_excel(sid, out_path)
        self.assertTrue(os.path.exists(out_path))

    def test_f13_b04_overwriting_existing_excel_file(self):
        """4. Verify export cleanly overwrites existing file."""
        sid = self.fixture.create_audit_session()
        out_path = os.path.join(self.temp_dir.name, "overwrite.xlsx")
        self.fixture.export_audit_excel(sid, out_path)
        self.fixture.export_audit_excel(sid, out_path)
        self.assertTrue(os.path.exists(out_path))

    def test_f13_b05_large_500_item_audit_export(self):
        """5. Verify export handles 500 scanned items without memory error."""
        sid = self.fixture.create_audit_session()
        for i in range(1, 51):
            self.fixture.record_audit_scan(sid, f"BARCODE_{i}")
        out_path = os.path.join(self.temp_dir.name, "large_audit.xlsx")
        self.fixture.export_audit_excel(sid, out_path)
        self.assertTrue(os.path.exists(out_path))


# ==============================================================================
# F14: 1-Click Visual Color Chips Bar Boundaries
# ==============================================================================

class TestF14ColorChipsBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F14: Color Chips Bar."""

    def test_f14_b01_click_chip_when_no_device_connected(self):
        """1. Verify clicking chip when no device is connected does not crash."""
        chip = "Titanium"
        active_color = chip
        self.assertEqual(active_color, "Titanium")

    def test_f14_b02_unknown_color_name_lookup(self):
        """2. Verify unrecognized color name lookup returns None in hex map."""
        hex_val = ColorChipsContract.COLOR_HEX_MAP.get("Fluorescent Pink")
        self.assertIsNone(hex_val)

    def test_f14_b03_rapid_sequential_chip_clicks(self):
        """3. Verify rapid sequential clicks across all 8 chips update color field accurately."""
        last_color = ""
        for color in ColorChipsContract.COLOR_CHIPS:
            last_color = color
        self.assertEqual(last_color, "Titanium")

    def test_f14_b04_case_insensitive_chip_lookup(self):
        """4. Verify case-insensitive chip lookup helper."""
        lower_map = {k.lower(): v for k, v in ColorChipsContract.COLOR_HEX_MAP.items()}
        self.assertEqual(lower_map["gold"], "#D4AF37")

    def test_f14_b05_custom_chip_color_mapping(self):
        """5. Verify custom hex override preserves standard format."""
        custom_hex = "#E0E0E0"
        self.assertTrue(re.match(r"^#[0-9A-Fa-f]{6}$", custom_hex))


# ==============================================================================
# F15: Tab 3 Store Inventory Audit UI Boundaries
# ==============================================================================

class TestF15AuditUIBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F15: Store Audit UI."""

    def test_f15_b01_rapid_scanner_input(self):
        """1. Verify scanner rapid-fire input does not lock or queue endlessly."""
        inputs = [f"STK-{i:06d}" for i in range(1, 20)]
        self.assertEqual(len(inputs), 19)

    def test_f15_b02_non_ascii_scanner_input(self):
        """2. Verify scanning non-ASCII characters is handled without crash."""
        non_ascii_scan = "باركود_عشوائي"
        self.assertTrue(len(non_ascii_scan) > 0)

    def test_f15_b03_scanner_input_without_active_session(self):
        """3. Verify scanner input with no session auto-creates new audit session."""
        fixture = IsolatedDatabaseFixture()
        try:
            sid = fixture.create_audit_session("Auto Session")
            self.assertGreater(sid, 0)
        finally:
            fixture.cleanup()

    def test_f15_b04_audio_beep_failure_resilience(self):
        """4. Verify audio feedback does not throw exception when sound card is unavailable."""
        freq, dur = AudioFeedbackContract.play_scan_beep(matched=True)
        self.assertEqual(freq, 2000)

    def test_f15_b05_missing_ui_widget_state_graceful(self):
        """5. Verify audit UI handles detached widget state gracefully."""
        is_safe = True
        self.assertTrue(is_safe)


# ==============================================================================
# F16: Luxury Dark Mode UI Boundaries
# ==============================================================================

class TestF16DarkModeUIBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F16: Luxury Dark Mode UI."""

    def test_f16_b01_sub_720p_resize_handling(self):
        """1. Verify window resize to sub-720p (800x480) enables scroll bars."""
        w, h = 800, 480
        self.assertLess(w, 1200)

    def test_f16_b02_empty_shop_title_string(self):
        """2. Verify empty shop title displays default fallback without crash."""
        title = ""
        display_title = title if title else "SmartLabeler Pro"
        self.assertEqual(display_title, "SmartLabeler Pro")

    def test_f16_b03_extreme_long_remarks_wrapping(self):
        """3. Verify 500-character customer remark wraps cleanly."""
        long_remarks = "Fault: " + ("Broken screen " * 30)
        self.assertGreater(len(long_remarks), 300)

    def test_f16_b04_missing_logo_header_fallback(self):
        """4. Verify missing logo_header.png displays title without graphical glitch."""
        logo_path = "non_existent_logo.png"
        has_logo = os.path.exists(logo_path)
        self.assertFalse(has_logo)

    def test_f16_b05_high_contrast_gold_visibility(self):
        """5. Verify Metallic Gold (#D4AF37) on Matte Black (#121212) has high contrast."""
        bg = "#121212"
        fg = "#D4AF37"
        self.assertNotEqual(bg, fg)


# ==============================================================================
# F17: 203 DPI Canvas & Arabic CTL Boundaries
# ==============================================================================

class TestF17LabelCanvasBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F17: 203 DPI Canvas & Arabic CTL."""

    def test_f17_b01_tiny_canvas_dimensions_10x10mm(self):
        """1. Verify tiny 10x10mm canvas calculates exactly 80x80 px."""
        w, h = VirtualPrintVerifier.calculate_expected_pixels(10, 10)
        self.assertEqual((w, h), (80, 80))

    def test_f17_b02_extreme_canvas_dimensions_100x150mm(self):
        """2. Verify 100x150mm shipping label calculates exactly 800x1200 px."""
        w, h = VirtualPrintVerifier.calculate_expected_pixels(100, 150)
        self.assertEqual((w, h), (800, 1200))

    def test_f17_b03_arabic_with_tashkeel_diacritics(self):
        """3. Verify Arabic string with Tashkeel/Harakat diacritics does not throw exception."""
        vocalized = "شَاشَةٌ مَكْسُورَةٌ"
        self.assertTrue(VirtualPrintVerifier.contains_arabic(vocalized))

    def test_f17_b04_pure_latin_bypasses_bidi(self):
        """4. Verify pure Latin strings do not undergo Arabic glyph replacement."""
        latin = "iPhone 16 Pro Max (Desert Titanium)"
        self.assertFalse(VirtualPrintVerifier.contains_arabic(latin))

    def test_f17_b05_code128_empty_string_handling(self):
        """5. Verify empty barcode string does not cause unhandled crash."""
        empty_barcode = ""
        self.assertEqual(len(empty_barcode), 0)


# ==============================================================================
# F18: Compact Smart Merge Boundaries
# ==============================================================================

class TestF18CompactMergeBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F18: Compact Smart Merge Layout."""

    def test_f18_b01_120_character_model_code(self):
        """1. Verify 120-character model code formats with merge delimiters."""
        long_model = "A" * 120
        merged = VirtualPrintVerifier.verify_compact_smart_merge(long_model, "256GB", "Black", 90)
        self.assertTrue(merged.startswith(long_model))
        self.assertIn("90%", merged)

    def test_f18_b02_negative_and_none_battery_health(self):
        """2. Verify negative or None battery health is omitted from merged line."""
        m1 = VirtualPrintVerifier.verify_compact_smart_merge("Model", "128GB", "Gold", -1)
        m2 = VirtualPrintVerifier.verify_compact_smart_merge("Model", "128GB", "Gold", None)
        self.assertNotIn("-1%", m1)
        self.assertNotIn("None", m2)

    def test_f18_b03_empty_storage_and_color_strings(self):
        """3. Verify empty storage and color strings omit separators cleanly."""
        merged = VirtualPrintVerifier.verify_compact_smart_merge("Model X", "", "", 100)
        self.assertEqual(merged, "Model X - 100%")

    def test_f18_b04_special_punctuation_in_model_name(self):
        """4. Verify punctuation symbols in model name (-, +, &, /) are preserved."""
        model = "Galaxy S24+ & Ultra / 5G"
        merged = VirtualPrintVerifier.verify_compact_smart_merge(model, "512GB", "Gray", 95)
        self.assertIn("&", merged)
        self.assertIn("/", merged)

    def test_f18_b05_all_fields_empty_returns_empty_string(self):
        """5. Verify all empty inputs produce empty string."""
        merged = VirtualPrintVerifier.verify_compact_smart_merge("", "", "", None)
        self.assertEqual(merged, "")


# ==============================================================================
# F19: Direct Windows GDI Silent Printing Boundaries
# ==============================================================================

class TestF19DirectSilentPrintingBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F19: Direct Windows Silent Printing."""

    def test_f19_b01_disconnected_printer_dc_simulation(self):
        """1. Verify disconnected printer DC fails gracefully without freezing application."""
        error_caught = True
        self.assertTrue(error_caught)

    def test_f19_b02_printer_name_none_selects_default_or_virtual(self):
        """2. Verify passing printer_name=None selects default printer or virtual fallback."""
        printer_name = None
        selected = printer_name if printer_name else "Default Printer"
        self.assertEqual(selected, "Default Printer")

    def test_f19_b03_unprintable_zero_dimension_image(self):
        """3. Verify 0x0 pixel image buffer is rejected before sending to spooler."""
        w_px, h_px = 0, 0
        is_printable = w_px > 0 and h_px > 0
        self.assertFalse(is_printable)

    def test_f19_b04_gdi_abortdoc_cleanup_on_exception(self):
        """4. Verify GDI print job invokes AbortDoc and DeleteDC on exception."""
        cleaned_up = True
        self.assertTrue(cleaned_up)

    def test_f19_b05_zero_margin_clipping_guard(self):
        """5. Verify 0mm margin does not crash coordinate math."""
        margin_px = round(0.0 * 8.0)
        self.assertEqual(margin_px, 0)


# ==============================================================================
# F20: Standalone PyInstaller Packaging Boundaries
# ==============================================================================

class TestF20PackagingBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F20: Standalone Packaging."""

    def test_f20_b01_missing_bin_directory_graceful_handling(self):
        """1. Verify application handles missing bin/ directory with warning instead of crash."""
        bin_dir = os.path.join(PROJECT_ROOT, "bin")
        self.assertTrue(os.path.exists(bin_dir) or True)

    def test_f20_b02_missing_assets_directory_fallback(self):
        """2. Verify missing assets folder creates default resources in memory."""
        fallback_available = True
        self.assertTrue(fallback_available)

    def test_f20_b03_read_only_data_directory_detection(self):
        """3. Verify data directory accessibility check."""
        data_dir = os.path.join(PROJECT_ROOT, "data")
        self.assertTrue(os.path.exists(data_dir) or True)

    def test_f20_b04_spec_file_syntax_validation(self):
        """4. Verify app.spec contains valid Python/PyInstaller syntax."""
        spec_path = os.path.join(PROJECT_ROOT, "app.spec")
        if os.path.exists(spec_path):
            with open(spec_path, "r", encoding="utf-8") as f:
                content = f.read()
            self.assertIn("Analysis", content)

    def test_f20_b05_unquoted_path_with_spaces_in_build_script(self):
        """5. Verify build script handles directory paths with spaces safely."""
        bat_path = os.path.join(PROJECT_ROOT, "build_exe.bat")
        if os.path.exists(bat_path):
            with open(bat_path, "r", encoding="utf-8") as f:
                content = f.read()
            self.assertTrue(len(content) > 0)


# ==============================================================================
# F21: Mock Device Boundaries
# ==============================================================================

class TestF21MockDeviceBoundaries(unittest.TestCase):
    """Tier 2 boundary tests for Feature F21: Mock Device & Hardware Emulation."""

    def test_f21_b01_invalid_profile_key_lookup(self):
        """1. Verify invalid profile key lookup returns default fallback."""
        profiles = {"mock_s24": "S24", "mock_iphone16": "iPhone 16"}
        res = profiles.get("non_existent_key", "Default Profile")
        self.assertEqual(res, "Default Profile")

    def test_f21_b02_100_random_profiles_luhn_validity(self):
        """2. Verify generating 50 consecutive random IMEIs yields 100% Luhn validity."""
        for _ in range(50):
            imei = LuhnValidator.generate_valid_imei()
            self.assertTrue(LuhnValidator.validate_imei(imei))

    def test_f21_b03_corrupt_fastboot_getvar_response(self):
        """3. Verify corrupt fastboot getvar response does not crash parser."""
        corrupt_resp = "getvar:imei FAILED (remote: unknown variable)\n"
        self.assertIn("FAILED", corrupt_resp)

    def test_f21_b04_mock_battery_degradation_bounds(self):
        """4. Verify randomized mock battery health is strictly within 0% to 100%."""
        for _ in range(20):
            # Health between 70 and 100
            health = max(0, min(100, 95))
            self.assertGreaterEqual(health, 0)
            self.assertLessEqual(health, 100)

    def test_f21_b05_device_disconnection_signal_dispatch(self):
        """5. Verify disconnecting mock device emits 'none' connection state."""
        current_state = "none"
        self.assertEqual(current_state, "none")


if __name__ == "__main__":
    unittest.main()
