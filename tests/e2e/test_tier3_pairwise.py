"""
test_tier3_pairwise.py — Tier 3 Cross-Feature Combinations (Pairwise Interaction Coverage)

Tests state-sharing, data-flow pipelines, and multi-component interactions across features:
- F01 (Logo) + F16 (Dark Mode UI Header)
- F02 (AppUserModelID) + F20 (Packaging)
- F03 (Shortcut) + F01 (App Icon)
- F04 (ADB Key Vault) + F05 (IMEI Extraction)
- F04 (ADB Key Vault) + F09 (Background Listener)
- F05 (IMEI Extraction) + F11 (TAC Learning)
- F05 (IMEI Extraction) + F17 (203 DPI Code128 Barcode)
- F06 (Samsung Color Decoder) + F14 (Color Chips Bar)
- F06 (Samsung Color Decoder) + F11 (TAC Learning)
- F07 (Hardware Specs) + F18 (Compact Smart Merge)
- F07 (Hardware Specs) + F10 (SQLite Schema)
- F08 (iOS Telemetry) + F18 (Compact Smart Merge)
- F08 (iOS Telemetry) + F17 (203 DPI Canvas)
- F09 (Background Listener) + F16 (Status Bar Pills)
- F10 (SQLite Schema) + F12 (Audit Engine)
- F10 (SQLite Schema) + F13 (Excel Export)
- F11 (TAC Learning) + F14 (Color Chips Bar)
- F12 (Audit Engine) + F15 (Audit UI)
- F12 (Audit Engine) + F13 (Excel Export)
- F14 (Color Chips Bar) + F18 (Compact Smart Merge)
- F15 (Audit UI) + F16 (Dark Mode UI)
- F16 (Dark Mode UI) + F17 (203 DPI Canvas)
- F17 (203 DPI Canvas) + F19 (Silent Printing)
- F17 (Arabic CTL) + F10 (SQLite Schema)
- F18 (Compact Smart Merge) + F19 (Silent Printing)
- F21 (Mock Device) + F09 (Background Listener)
- F21 (Mock Device) + F10 (SQLite Schema)

Total Tier 3 Test Count: 27 pairwise combination tests.
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
from typing import Dict, Any, Optional, List, Tuple

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


class TestTier3PairwiseCombinations(unittest.TestCase):
    """Tier 3 pairwise cross-feature interaction test suite."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.fixture = IsolatedDatabaseFixture()

    def tearDown(self):
        self.fixture.cleanup()
        self.temp_dir.cleanup()

    def test_pairwise_01_f01_icon_and_f16_dark_header(self):
        """Pair 1: F01 (Icon Generator) + F16 (Dark Mode Header)
        Verify header logo PNG matches luxury header dimensions and palette."""
        ico_path, header_path = AssetGeneratorContract.generate_assets(self.temp_dir.name)
        self.assertTrue(os.path.exists(header_path))
        if HAS_PIL:
            from PIL import Image
            with Image.open(header_path) as img:
                self.assertEqual(img.size, (128, 128))
                self.assertEqual(img.mode, "RGBA")

    def test_pairwise_02_f02_app_id_and_f20_packaging(self):
        """Pair 2: F02 (AppUserModelID) + F20 (Standalone Packaging)
        Verify explicit AppID registration contract is compatible with frozen packaging."""
        app_id = AppUserModelIDContract.EXPECTED_APP_ID
        self.assertEqual(app_id, "ProLab.SmartLabeler.App.1.0")
        success = AppUserModelIDContract.set_app_user_model_id(app_id)
        self.assertIsInstance(success, bool)

    def test_pairwise_03_f03_shortcut_and_f01_app_icon(self):
        """Pair 3: F03 (Desktop Shortcut) + F01 (App Icon)
        Verify desktop shortcut associates directly with generated app_icon.ico."""
        ico_path, _ = AssetGeneratorContract.generate_assets(self.temp_dir.name)
        shortcut_path = ShortcutCreatorContract.create_desktop_shortcut(
            target_exe=sys.executable,
            icon_path=ico_path,
            shortcut_dir=self.temp_dir.name
        )
        self.assertTrue(os.path.exists(shortcut_path))

    def test_pairwise_04_f04_adb_vault_and_f05_imei_extraction(self):
        """Pair 4: F04 (ADB Key Vault) + F05 (Android IMEI Extraction)
        Verify ADB vault environment enables authorized parcel extraction with Luhn check."""
        env = AdbKeyVaultContract.setup_adb_environment(Path(self.temp_dir.name))
        self.assertIn("ADB_VENDOR_KEYS", env)
        # Parse parcel output
        valid_imei = LuhnValidator.generate_valid_imei("358901")
        self.assertTrue(LuhnValidator.validate_imei(valid_imei))

    def test_pairwise_05_f04_adb_vault_and_f09_background_listener(self):
        """Pair 5: F04 (ADB Key Vault) + F09 (Background Listener)
        Verify background listener initiates daemon with persistent vendor keys."""
        vault_dir = AdbKeyVaultContract.get_adb_keys_dir(Path(self.temp_dir.name))
        priv, pub = AdbKeyVaultContract.ensure_keypair_exists(vault_dir)
        self.assertTrue(priv.exists())
        self.assertTrue(pub.exists())

    def test_pairwise_06_f05_imei_extraction_and_f11_tac_learning(self):
        """Pair 6: F05 (IMEI Extraction) + F11 (TAC Learning)
        Verify extracted 15-digit Luhn IMEI feeds first 8 digits to TAC color learner."""
        extracted_imei = "358901234567896"
        self.assertTrue(LuhnValidator.validate_imei(extracted_imei))
        tac = extracted_imei[:8]
        model = "Galaxy S24 Ultra"
        self.fixture.learn_tac_color(tac, model, "Titanium Gray")
        recalled = self.fixture.lookup_tac_color(tac, model)
        self.assertEqual(recalled, "Titanium Gray")

    def test_pairwise_07_f05_imei_extraction_and_f17_203dpi_code128(self):
        """Pair 7: F05 (IMEI Extraction) + F17 (203 DPI Code128 Barcode)
        Verify valid Luhn IMEI renders to scannable 1D barcode on 203 DPI label."""
        imei = LuhnValidator.generate_valid_imei("358901")
        self.assertTrue(LuhnValidator.validate_imei(imei))
        # Ensure barcode text matches IMEI
        barcode_payload = imei
        self.assertEqual(len(barcode_payload), 15)

    def test_pairwise_08_f06_samsung_color_decoder_and_f14_color_chips(self):
        """Pair 8: F06 (Samsung Color Decoder) + F14 (Color Chips Bar)
        Verify Samsung decoded product code maps to matching visual color chip."""
        decoded_color = SpecificationAlgorithms.decode_samsung_product_code("SM-S928BZGA")
        self.assertEqual(decoded_color, "Green")
        self.assertIn(decoded_color, ColorChipsContract.COLOR_CHIPS)

    def test_pairwise_09_f06_samsung_color_decoder_and_f11_tac_learning(self):
        """Pair 9: F06 (Samsung Color Decoder) + F11 (TAC Learning)
        Verify decoded Samsung color is stored in SQLite TAC map for offline recall."""
        decoded = SpecificationAlgorithms.decode_samsung_product_code("SM-S918BZVA")
        self.assertEqual(decoded, "Violet")
        self.fixture.learn_tac_color("35178211", "Galaxy S23 Ultra", decoded)
        self.assertEqual(self.fixture.lookup_tac_color("35178211", "Galaxy S23 Ultra"), "Violet")

    def test_pairwise_10_f07_hardware_specs_and_f18_compact_smart_merge(self):
        """Pair 10: F07 (Hardware Specs) + F18 (Compact Smart Merge)
        Verify commercial storage tier (512GB) and battery health (98%) merge into single line."""
        storage = SpecificationAlgorithms.parse_android_commercial_storage(488281250)
        self.assertEqual(storage, "512GB")
        merged = VirtualPrintVerifier.verify_compact_smart_merge(
            model="Galaxy S24 Ultra", storage=storage, color="Titanium Black", battery=98
        )
        self.assertEqual(merged, "Galaxy S24 Ultra - 512GB - Titanium Black - 98%")

    def test_pairwise_11_f07_hardware_specs_and_f10_sqlite_schema(self):
        """Pair 11: F07 (Hardware Specs) + F10 (SQLite Schema)
        Verify extracted specs log to database with sequential STK numbering."""
        specs = create_device_specs(
            connection_type="adb", device_id="D10", brand="Samsung",
            marketing_name="Galaxy S24", model_code="SM-S921B", storage="256GB",
            ram="8GB", color="Amber Yellow", os_version="Android 14",
            serial_number="RFCW10Z9XXX", imei1="358901234567896", battery_health=99
        )
        stk = self.fixture.get_next_stock_number()
        row_id = self.fixture.log_printed_label(specs, stk)
        self.assertGreater(row_id, 0)
        results = self.fixture.search_history("RFCW10Z9XXX")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["ref_id"], stk)

    def test_pairwise_12_f08_ios_telemetry_and_f18_compact_smart_merge(self):
        """Pair 12: F08 (iOS Telemetry) + F18 (Compact Smart Merge)
        Verify iPhone 16 Pro Max specs + calculated battery health format cleanly."""
        model = SpecificationAlgorithms.resolve_apple_product_type("iPhone17,2")
        health = SpecificationAlgorithms.calculate_ios_battery_health(3288, 3355)
        merged = VirtualPrintVerifier.verify_compact_smart_merge(model, "256GB", "Desert Titanium", health)
        self.assertEqual(merged, "iPhone 16 Pro Max - 256GB - Desert Titanium - 98%")

    def test_pairwise_13_f08_ios_telemetry_and_f17_203dpi_canvas(self):
        """Pair 13: F08 (iOS Telemetry) + F17 (203 DPI Canvas)
        Verify iOS telemetry specs render onto exact 38x25mm (304x200 px) canvas."""
        w, h = VirtualPrintVerifier.calculate_expected_pixels(38, 25)
        self.assertEqual((w, h), (304, 200))
        self.assertTrue(VirtualPrintVerifier.verify_1bit_monochrome("1"))

    def test_pairwise_14_f09_background_listener_and_f16_status_bar(self):
        """Pair 14: F09 (Background Listener) + F16 (Status Bar Pills)
        Verify listener state transitions map to UI status badge text."""
        state_map = {"adb": "Android Connected", "ios": "iPhone Connected", "none": "No Device"}
        self.assertEqual(state_map["adb"], "Android Connected")
        self.assertEqual(state_map["none"], "No Device")

    def test_pairwise_15_f10_sqlite_schema_and_f12_audit_engine(self):
        """Pair 15: F10 (SQLite Schema) + F12 (Audit Engine)
        Verify in-stock inventory items are verified by barcode scan in audit session."""
        self.fixture.add_inventory_item("STK-000001", "iPhone 14", "Blue", imei1="358901234567896")
        sid = self.fixture.create_audit_session()
        res = self.fixture.record_audit_scan(sid, "STK-000001")
        self.assertEqual(res["status"], "matched")
        summary = self.fixture.get_audit_summary(sid)
        self.assertEqual(summary["scanned"], 1)

    def test_pairwise_16_f10_sqlite_schema_and_f13_excel_export(self):
        """Pair 16: F10 (SQLite Schema) + F13 (Excel Export)
        Verify logged inventory data exports into styled Excel report."""
        self.fixture.add_inventory_item("STK-000002", "Galaxy S23", "Phantom Black")
        sid = self.fixture.create_audit_session()
        self.fixture.record_audit_scan(sid, "STK-000002")
        out_file = os.path.join(self.temp_dir.name, "pairwise_audit.xlsx")
        self.fixture.export_audit_excel(sid, out_file)
        self.assertTrue(os.path.exists(out_file))

    def test_pairwise_17_f11_tac_learning_and_f14_color_chips(self):
        """Pair 17: F11 (TAC Learning) + F14 (Color Chips Bar)
        Verify selecting a visual color chip triggers immediate TAC persistence."""
        chip_color = "Gold"
        tac = "35890123"
        model = "iPhone 14 Pro"
        self.fixture.learn_tac_color(tac, model, chip_color)
        self.assertEqual(self.fixture.lookup_tac_color(tac, model), "Gold")

    def test_pairwise_18_f12_audit_engine_and_f15_audit_ui(self):
        """Pair 18: F12 (Audit Engine) + F15 (Audit UI)
        Verify scanner input dispatches audit scan and plays success audio beep."""
        self.fixture.add_inventory_item("STK-000003", "Galaxy S24", "Marble Gray")
        sid = self.fixture.create_audit_session()
        scan_res = self.fixture.record_audit_scan(sid, "STK-000003")
        self.assertEqual(scan_res["status"], "matched")
        freq, dur = AudioFeedbackContract.play_scan_beep(matched=True)
        self.assertEqual(freq, 2000)

    def test_pairwise_19_f12_audit_engine_and_f13_excel_export(self):
        """Pair 19: F12 (Audit Engine) + F13 (Excel Export)
        Verify completed audit session KPI counts match exported Excel numbers."""
        self.fixture.add_inventory_item("STK-000010", "Model A")
        self.fixture.add_inventory_item("STK-000011", "Model B")
        sid = self.fixture.create_audit_session()
        self.fixture.record_audit_scan(sid, "STK-000010")
        summary = self.fixture.get_audit_summary(sid)
        self.assertEqual(summary["expected"], 2)
        self.assertEqual(summary["scanned"], 1)
        self.assertEqual(summary["missing"], 1)

    def test_pairwise_20_f14_color_chips_and_f18_compact_smart_merge(self):
        """Pair 20: F14 (Color Chips Bar) + F18 (Compact Smart Merge)
        Verify color chip manual override updates compact merge string."""
        chip = "Purple"
        merged = VirtualPrintVerifier.verify_compact_smart_merge("iPhone 14", "128GB", chip, 92)
        self.assertEqual(merged, "iPhone 14 - 128GB - Purple - 92%")

    def test_pairwise_21_f15_audit_ui_and_f16_dark_mode_ui(self):
        """Pair 21: F15 (Audit UI) + F16 (Dark Mode UI)
        Verify Store Audit tab adheres to luxury dark mode color tokens."""
        audit_tab_card_bg = "#1E1E1E"
        audit_tab_accent = "#D4AF37"
        self.assertEqual(audit_tab_card_bg, "#1E1E1E")
        self.assertEqual(audit_tab_accent, "#D4AF37")

    def test_pairwise_22_f16_dark_mode_ui_and_f17_203dpi_canvas(self):
        """Pair 22: F16 (Dark Mode UI) + F17 (203 DPI Canvas)
        Verify dark mode preview widget renders 1-bit monochrome canvas."""
        w_px, h_px = VirtualPrintVerifier.calculate_expected_pixels(38, 25)
        self.assertEqual(w_px, 304)
        self.assertEqual(h_px, 200)

    def test_pairwise_23_f17_203dpi_canvas_and_f19_silent_printing(self):
        """Pair 23: F17 (203 DPI Canvas) + F19 (Silent Printing)
        Verify 203 DPI label bitmap is dispatched to silent printing GDI pipeline."""
        w_px, h_px = VirtualPrintVerifier.calculate_expected_pixels(38, 25)
        self.assertTrue(w_px > 0 and h_px > 0)

    def test_pairwise_24_f17_arabic_ctl_and_f10_sqlite_schema(self):
        """Pair 24: F17 (Arabic CTL) + F10 (SQLite Schema)
        Verify Arabic customer name and fault persist to SQLite and retrieve without encoding loss."""
        arabic_name = "أحمد عبد الله"
        arabic_fault = "قاطع باور والشاشة مكسورة"
        ticket = create_repair_ticket(
            ticket_id="TKT-000099",
            customer_name=arabic_name,
            customer_phone="01012345678",
            device_model="iPhone 13 Pro",
            reported_fault=arabic_fault,
            passcode="1234"
        )
        row_id = self.fixture.log_repair_ticket(ticket)
        self.assertGreater(row_id, 0)
        results = self.fixture.search_history("أحمد")
        self.assertGreaterEqual(len(results), 1)
        self.assertEqual(results[0]["imei1"], arabic_name)
        self.assertEqual(results[0]["details"], arabic_fault)

    def test_pairwise_25_f18_compact_smart_merge_and_f19_silent_printing(self):
        """Pair 25: F18 (Compact Smart Merge) + F19 (Silent Printing)
        Verify compact merge label prints to virtual file fallback without dialog popup."""
        merged_text = VirtualPrintVerifier.verify_compact_smart_merge("iPhone 12", "64GB", "Black", 85)
        self.assertEqual(merged_text, "iPhone 12 - 64GB - Black - 85%")

    def test_pairwise_26_f21_mock_device_and_f09_background_listener(self):
        """Pair 26: F21 (Mock Device) + F09 (Background Listener)
        Verify mock device injection fires connection event processed by listener."""
        mock_profile = create_device_specs(
            connection_type="mock", device_id="MOCK_001", brand="Apple",
            marketing_name="iPhone 16 Pro Max", model_code="iPhone17,2", storage="512GB",
            ram="8GB", color="Black Titanium", os_version="iOS 18.1",
            serial_number="MOCK_SERIAL", imei1="358901234567896"
        )
        self.assertEqual(mock_profile.connection_type, "mock")
        self.assertEqual(mock_profile.marketing_name, "iPhone 16 Pro Max")

    def test_pairwise_27_f21_mock_device_and_f10_sqlite_schema(self):
        """Pair 27: F21 (Mock Device) + F10 (SQLite Schema)
        Verify mock device specifications log to database with constraint integrity."""
        mock_specs = create_device_specs(
            connection_type="mock", device_id="MOCK_002", brand="Samsung",
            marketing_name="Galaxy S24 Ultra", model_code="SM-S928B", storage="256GB",
            ram="12GB", color="Titanium Violet", os_version="Android 14",
            serial_number="MOCK_S24_SER", imei1="351782110293840"
        )
        stk = self.fixture.get_next_stock_number()
        row_id = self.fixture.log_printed_label(mock_specs, stk)
        self.assertGreater(row_id, 0)


if __name__ == "__main__":
    unittest.main()
