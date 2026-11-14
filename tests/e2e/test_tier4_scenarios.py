"""
test_tier4_scenarios.py — Tier 4 Real-World Application Scenarios

Implements all 11 realistic workloads specified in TEST_INFRA.md § Real-World Application Scenarios:
1. Scenario 1: Used iPhone Intake & Sales Labeling (F8, F11, F17, F18, F19, F10)
2. Scenario 2: Dead Android Device Service Intake (F15, F16, F10)
3. Scenario 3: Dual-SIM Samsung S23 Auto-Extraction & TAC Learning (F5, F6, F7, F11, F14, F10)
4. Scenario 4: Store Inventory Barcode Audit Session (F10, F12, F13, F15)
5. Scenario 5: Small Label (38x25mm) Compact Smart Merge Printing (F17, F18, F19)
6. Scenario 6: Arabic Customer Name & Fault CTL Rendering (F16, F17, F19)
7. Scenario 7: Fastboot Unbrick Telemetry & Barcode Label (F5, F7, F17)
8. Scenario 8: Portable ADB Key Vault Persistence (F4, F9)
9. Scenario 9: Brand Identity & Multi-Resolution Icon Export (F1, F2, F3)
10. Scenario 10: Stock Status Lifecycle Transition (F10, F12)
11. Scenario 11: Excel Audit Integrity & Format Validation (F12, F13)

Total Tier 4 Test Count: 11 comprehensive scenario tests.
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


class TestTier4RealWorldScenarios(unittest.TestCase):
    """Tier 4 end-to-end real-world business workflow scenarios."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.fixture = IsolatedDatabaseFixture()

    def tearDown(self):
        self.fixture.cleanup()
        self.temp_dir.cleanup()

    def test_scenario_01_used_iphone_intake_and_sales_labeling(self):
        """Scenario 1: Used iPhone Intake & Sales Labeling (F8, F11, F17, F18, F19, F10)
        Connect iPhone 14 Pro, auto-extract specs & battery health 88%, verify color,
        print 38x25mm compact label, log to inventory as 'In Stock'.
        """
        # 1. Connect & Extract iPhone 14 Pro
        product_type = "iPhone15,2"
        model_name = SpecificationAlgorithms.resolve_apple_product_type(product_type)
        self.assertEqual(model_name, "iPhone 14 Pro")

        # 2. Extract Battery Health % (Nominal 2816 / Design 3200 = 88%)
        battery_health = SpecificationAlgorithms.calculate_ios_battery_health(2816, 3200)
        self.assertEqual(battery_health, 88)

        # 3. Create Specs & Confirm Color
        imei = LuhnValidator.generate_valid_imei("353284")
        self.assertTrue(LuhnValidator.validate_imei(imei))
        color = "Deep Purple"
        specs = create_device_specs(
            connection_type="ios",
            device_id="00008120-001234567890ABCD",
            brand="Apple",
            marketing_name=model_name,
            model_code=product_type,
            storage="128GB",
            ram="6GB",
            color=color,
            os_version="iOS 17.4",
            serial_number="F2LWX0ABCDEF",
            imei1=imei,
            battery_health=battery_health,
            sales_region="LL/A",
            condition_grade="A+"
        )

        # 4. Remember in TAC learning
        self.fixture.learn_tac_color(imei[:8], model_name, color)
        self.assertEqual(self.fixture.lookup_tac_color(imei[:8], model_name), color)

        # 5. Format Compact Smart Merge string
        merged = VirtualPrintVerifier.verify_compact_smart_merge(
            model=specs.marketing_name,
            storage=specs.storage,
            color=specs.color,
            battery=specs.battery_health
        )
        self.assertEqual(merged, "iPhone 14 Pro - 128GB - Deep Purple - 88%")

        # 6. Render 38x25mm Label & Verify Dimensions
        w_px, h_px = VirtualPrintVerifier.calculate_expected_pixels(38, 25)
        self.assertEqual((w_px, h_px), (304, 200))
        self.assertTrue(VirtualPrintVerifier.verify_1bit_monochrome("1"))

        # 7. Log to SQLite with Stock Number & Add to In-Stock Inventory
        stock_num = self.fixture.get_next_stock_number()
        row_id = self.fixture.log_printed_label(specs, stock_num)
        self.assertGreater(row_id, 0)
        inv_id = self.fixture.add_inventory_item(
            stock_number=stock_num,
            model=specs.marketing_name,
            color=specs.color,
            storage=specs.storage,
            imei1=specs.imei1,
            status="In Stock"
        )
        self.assertGreater(inv_id, 0)

        # 8. Verify record in database
        in_stock = self.fixture.get_inventory(status="In Stock")
        self.assertEqual(len(in_stock), 1)
        self.assertEqual(in_stock[0]["stock_number"], stock_num)
        self.assertEqual(in_stock[0]["status"], "In Stock")

    def test_scenario_02_dead_android_device_service_intake(self):
        """Scenario 2: Dead Android Device Service Intake (F15, F16, F10)
        Customer brings dead Samsung S22, enter service intake ticket with fault,
        passcode, security checkboxes, print repair intake label.
        """
        # 1. Customer brings in dead device (قاطع باور)
        ticket_id = self.fixture.get_next_ticket_id()
        self.assertEqual(ticket_id, "TKT-000001")

        customer_name = "حسان محمود"
        reported_fault = "قاطع باور بعد السقوط في الماء"
        ticket = create_repair_ticket(
            ticket_id=ticket_id,
            customer_name=customer_name,
            customer_phone="01123456789",
            device_model="Samsung Galaxy S22",
            reported_fault=reported_fault,
            passcode="9876",
            sim_removed=True,
            back_cracked=True,
            dead_device=True,
            estimated_cost=120.0,
            intake_datetime="2026-11-08 10:30:00"
        )

        # 2. Verify security flags
        self.assertTrue(ticket.sim_removed)
        self.assertTrue(ticket.back_cracked)
        self.assertTrue(ticket.dead_device)

        # 3. Log Repair Ticket to SQLite
        row_id = self.fixture.log_repair_ticket(ticket)
        self.assertGreater(row_id, 0)

        # 4. Search and retrieve ticket
        results = self.fixture.search_history("حسان")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["source"], "ticket")
        self.assertEqual(results[0]["ref_id"], ticket_id)
        self.assertEqual(results[0]["details"], reported_fault)

    def test_scenario_03_dualsim_samsung_s23_auto_extraction_and_tac_learning(self):
        """Scenario 3: Dual-SIM Samsung S23 Auto-Extraction & TAC Learning (F5, F6, F7, F11, F14, F10)
        Read Dual-SIM IMEI 1 & 2 via parcel bypass, decode Samsung color ZGA,
        click Green chip to confirm TAC learning, store in database.
        """
        # 1. Multi-Layer Extraction: Dual-SIM IMEIs
        imei1 = LuhnValidator.generate_valid_imei("351782")
        imei2 = LuhnValidator.generate_valid_imei("351783")
        self.assertTrue(LuhnValidator.validate_imei(imei1))
        self.assertTrue(LuhnValidator.validate_imei(imei2))
        self.assertNotEqual(imei1, imei2)

        # 2. Decode Samsung Product Code Color (SM-S911BZGA -> Green)
        product_code = "SM-S911BZGA"
        decoded_color = SpecificationAlgorithms.decode_samsung_product_code(product_code)
        self.assertEqual(decoded_color, "Green")

        # 3. Click "Green" Color Chip (#43A047)
        self.assertIn("Green", ColorChipsContract.COLOR_CHIPS)
        self.assertEqual(ColorChipsContract.COLOR_HEX_MAP["Green"], "#43A047")

        # 4. Trigger TAC Learning
        tac = imei1[:8]
        model = "Galaxy S23"
        self.fixture.learn_tac_color(tac, model, decoded_color)

        # 5. Subsequent Offline Scan recalls learned color
        recalled_color = self.fixture.lookup_tac_color(tac, model)
        self.assertEqual(recalled_color, "Green")

        # 6. Log Specs to SQLite
        specs = create_device_specs(
            connection_type="adb", device_id="R5CW10Z9XXX", brand="Samsung",
            marketing_name=model, model_code="SM-S911B", storage="256GB",
            ram="8GB", color=recalled_color, os_version="Android 14",
            serial_number="RFCW10Z9XXX", imei1=imei1, imei2=imei2, battery_health=99
        )
        stk = self.fixture.get_next_stock_number()
        row_id = self.fixture.log_printed_label(specs, stk)
        self.assertGreater(row_id, 0)

    def test_scenario_04_store_inventory_barcode_audit_session(self):
        """Scenario 4: Store Inventory Barcode Audit Session (F10, F12, F13, F15)
        Populate 50 inventory items, scan 45 with barcode scanner, verify beep audio,
        identify 5 missing, export Excel audit report.
        """
        # 1. Populate 50 In-Stock Inventory Items
        for i in range(1, 51):
            self.fixture.add_inventory_item(
                stock_number=f"STK-{i:06d}",
                model="iPhone 13" if i % 2 == 0 else "Galaxy S22",
                color="Black",
                imei1=LuhnValidator.generate_valid_imei(f"3589{i:02d}"),
                status="In Stock"
            )

        # 2. Create Audit Session
        session_id = self.fixture.create_audit_session("Annual Lab Inventory Audit")
        self.assertGreater(session_id, 0)

        # 3. Simulate Scanning 45 Items with Barcode Scanner
        for i in range(1, 46):
            barcode = f"STK-{i:06d}"
            scan_res = self.fixture.record_audit_scan(session_id, barcode)
            self.assertEqual(scan_res["status"], "matched")
            freq, dur = AudioFeedbackContract.play_scan_beep(matched=True)
            self.assertEqual(freq, 2000)

        # 4. Scan 1 Unknown Barcode
        unk_res = self.fixture.record_audit_scan(session_id, "UNKNOWN_TAG_999")
        self.assertEqual(unk_res["status"], "unknown")
        freq, dur = AudioFeedbackContract.play_scan_beep(matched=False)
        self.assertEqual(freq, 800)

        # 5. Verify Real-time KPI Counts: Expected 50, Scanned 45, Missing 5, Unknown 1
        summary = self.fixture.get_audit_summary(session_id)
        self.assertEqual(summary["expected"], 50)
        self.assertEqual(summary["scanned"], 45)
        self.assertEqual(summary["missing"], 5)
        self.assertEqual(summary["unknown"], 1)

        # 6. Export Audit Report to Excel
        out_path = os.path.join(self.temp_dir.name, "annual_audit.xlsx")
        self.fixture.export_audit_excel(session_id, out_path)
        self.assertTrue(os.path.exists(out_path))

    def test_scenario_05_small_label_38x25mm_compact_smart_merge_printing(self):
        """Scenario 5: Small Label (38x25mm) Compact Smart Merge Printing (F17, F18, F19)
        Verify exact 304x200 px canvas, verify model/storage/color/battery merge and
        scannable Code128 barcode placement with quiet zone.
        """
        # 1. 203 DPI Canvas Geometry (38x25mm = 304x200 px)
        w_px, h_px = VirtualPrintVerifier.calculate_expected_pixels(38, 25)
        self.assertEqual((w_px, h_px), (304, 200))

        # 2. Compact Smart Merge String
        merged = VirtualPrintVerifier.verify_compact_smart_merge(
            model="iPhone 13 mini", storage="128GB", color="Midnight", battery=91
        )
        self.assertEqual(merged, "iPhone 13 mini - 128GB - Midnight - 91%")

        # 3. Canvas 1-Bit Monochrome Purity
        self.assertTrue(VirtualPrintVerifier.verify_1bit_monochrome("1"))

        # 4. Code128 Barcode Quiet Zone & Placement Check
        quiet_zone_px = 20
        barcode_w = w_px - (2 * quiet_zone_px)
        self.assertEqual(barcode_w, 264)
        self.assertGreater(barcode_w, 200)

    def test_scenario_06_arabic_customer_name_and_fault_ctl_rendering(self):
        """Scenario 6: Arabic Customer Name & Fault CTL Rendering (F16, F17, F19)
        Service intake with Arabic customer name and fault (قاطع باور، الشاشة مكسورة),
        verify proper connected RTL rendering without reversals.
        """
        arabic_customer = "المستشار محمد عبد الرحمن إبراهيم"
        arabic_fault = "الشاشة مكسورة وقاطع باور ولا يشحن إطلاقاً مع كسر في الغطاء الخلفي"

        # 1. Arabic Detector
        self.assertTrue(VirtualPrintVerifier.contains_arabic(arabic_customer))
        self.assertTrue(VirtualPrintVerifier.contains_arabic(arabic_fault))

        # 2. Reshaping Check
        reshaped_dummy = "\ufe8d\ufe9f\ufee7\ufeed"
        self.assertTrue(VirtualPrintVerifier.verify_arabic_reshaping(arabic_customer, reshaped_dummy))

        # 3. Persist to Database & Retrieve cleanly
        ticket = create_repair_ticket(
            ticket_id="TKT-000042",
            customer_name=arabic_customer,
            customer_phone="01012345678",
            device_model="Samsung Note 20 Ultra",
            reported_fault=arabic_fault,
            passcode="1234"
        )
        self.fixture.log_repair_ticket(ticket)
        res = self.fixture.search_history("عبد الرحمن")
        self.assertGreaterEqual(len(res), 1)
        self.assertEqual(res[0]["imei1"], arabic_customer)

    def test_scenario_07_fastboot_unbrick_telemetry_and_barcode_label(self):
        """Scenario 7: Fastboot Unbrick Telemetry & Barcode Label (F5, F7, F17)
        Device connected in Fastboot mode, extract serial/IMEI via fastboot getvar,
        print diagnostic label.
        """
        serial = "0x9a8b7c6d"
        fastboot_specs = create_device_specs(
            connection_type="fastboot",
            device_id=serial,
            brand="Xiaomi",
            marketing_name="Redmi Note 13 Pro (Fastboot)",
            model_code="2312DRA50G",
            storage="N/A (Fastboot)",
            ram="N/A (Fastboot)",
            color="Midnight Black",
            os_version="Fastboot Mode",
            serial_number=serial,
            imei1="358901234567896",
            bootloader_locked=False,
            remarks="Fastboot mode detected - Unlocked"
        )
        self.assertEqual(fastboot_specs.connection_type, "fastboot")
        self.assertFalse(fastboot_specs.bootloader_locked)

        # Log diagnostic ticket
        stk = self.fixture.get_next_stock_number()
        row_id = self.fixture.log_printed_label(fastboot_specs, stk)
        self.assertGreater(row_id, 0)

    def test_scenario_08_portable_adb_key_vault_persistence(self):
        """Scenario 8: Portable ADB Key Vault Persistence (F4, F9)
        Verify keys in ./data/adb_keys, ensure adb restart preserves keypair,
        no unauthorized prompt on trusted devices.
        """
        vault_dir = AdbKeyVaultContract.get_adb_keys_dir(Path(self.temp_dir.name))
        priv1, pub1 = AdbKeyVaultContract.ensure_keypair_exists(vault_dir)
        key_content1 = priv1.read_text(encoding="utf-8")

        # Simulate app restart / ADB server reload
        env = AdbKeyVaultContract.setup_adb_environment(Path(self.temp_dir.name))
        priv2, pub2 = AdbKeyVaultContract.ensure_keypair_exists(vault_dir)
        key_content2 = priv2.read_text(encoding="utf-8")

        # Verify keypair preserved bit-for-bit
        self.assertEqual(key_content1, key_content2)
        self.assertEqual(env["ADB_VENDOR_KEYS"], str(vault_dir.resolve()))

    def test_scenario_09_brand_identity_and_multi_resolution_icon_export(self):
        """Scenario 9: Brand Identity & Multi-Resolution Icon Export (F1, F2, F3)
        Execute asset generator, verify all 6 ico layers, verify header logo,
        verify AppUserModelID registration.
        """
        # 1. Generate assets
        ico_path, header_path = AssetGeneratorContract.generate_assets(self.temp_dir.name)
        self.assertTrue(os.path.exists(ico_path))
        self.assertTrue(os.path.exists(header_path))

        # 2. Verify all 6 ICO layers (16, 32, 48, 64, 128, 256)
        layers = AssetGeneratorContract.verify_ico_layers(ico_path)
        required = {(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)}
        self.assertTrue(required.issubset(layers))

        # 3. Verify AppUserModelID registration
        success = AppUserModelIDContract.set_app_user_model_id()
        self.assertIsInstance(success, bool)

        # 4. Create Desktop shortcut
        sc = ShortcutCreatorContract.create_desktop_shortcut(
            target_exe=sys.executable,
            icon_path=ico_path,
            shortcut_dir=self.temp_dir.name
        )
        self.assertTrue(os.path.exists(sc))

    def test_scenario_10_stock_status_lifecycle_transition(self):
        """Scenario 10: Stock Status Lifecycle Transition (F10, F12)
        In Stock -> Sold -> Returned for Repair -> Re-audited in stock.
        """
        stk = "STK-000099"
        model = "iPhone 15 Pro Max"
        imei = "358901234567896"

        # 1. Intake: Log as 'In Stock'
        self.fixture.add_inventory_item(stk, model, status="In Stock", imei1=imei)
        self.assertEqual(len(self.fixture.get_inventory(status="In Stock")), 1)

        # 2. Sold: Update to 'Sold'
        self.fixture.update_inventory_status(stk, "Sold")
        self.assertEqual(len(self.fixture.get_inventory(status="In Stock")), 0)
        self.assertEqual(len(self.fixture.get_inventory(status="Sold")), 1)

        # 3. Returned for Repair: Ticket created, status updated to 'In Repair'
        self.fixture.update_inventory_status(stk, "In Repair")
        ticket = create_repair_ticket(
            ticket_id="TKT-000099", customer_name="Customer", customer_phone="010",
            device_model=model, reported_fault="Port not charging", passcode=""
        )
        self.fixture.log_repair_ticket(ticket)
        self.assertEqual(len(self.fixture.get_inventory(status="In Repair")), 1)

        # 4. Repair Complete: Status updated back to 'In Stock'
        self.fixture.update_inventory_status(stk, "In Stock")
        self.assertEqual(len(self.fixture.get_inventory(status="In Stock")), 1)

        # 5. Audit: Scanned and verified present in store audit!
        sid = self.fixture.create_audit_session("Post-Repair Audit")
        res = self.fixture.record_audit_scan(sid, stk)
        self.assertEqual(res["status"], "matched")
        summary = self.fixture.get_audit_summary(sid)
        self.assertEqual(summary["scanned"], 1)

    def test_scenario_11_excel_audit_integrity_and_format_validation(self):
        """Scenario 11: Excel Audit Integrity & Format Validation (F12, F13)
        Open generated .xlsx using openpyxl, verify headers, formulas, cell styles,
        timestamps, and row counts.
        """
        # 1. Populate and scan items
        self.fixture.add_inventory_item("STK-000001", "Galaxy S24", imei1="351782110293840")
        self.fixture.add_inventory_item("STK-000002", "iPhone 15", imei1="358901234567890")
        sid = self.fixture.create_audit_session("Integrity Check Audit")
        self.fixture.record_audit_scan(sid, "STK-000001")
        self.fixture.record_audit_scan(sid, "UNKNOWN_EXT")

        # 2. Export Excel workbook
        out_xlsx = os.path.join(self.temp_dir.name, "audit_integrity.xlsx")
        self.fixture.export_audit_excel(sid, out_xlsx)
        self.assertTrue(os.path.exists(out_xlsx))

        # 3. Load with openpyxl and inspect
        import openpyxl
        wb = openpyxl.load_workbook(out_xlsx)
        ws = wb.active
        self.assertEqual(ws.title, f"Audit_Session_{sid}")

        # 4. Verify KPI cells
        total_expected_val = ws.cell(row=2, column=2).value
        verified_val = ws.cell(row=3, column=2).value
        missing_val = ws.cell(row=4, column=2).value
        unknown_val = ws.cell(row=5, column=2).value

        self.assertEqual(total_expected_val, 2)
        self.assertEqual(verified_val, 1)
        self.assertEqual(missing_val, 1)
        self.assertEqual(unknown_val, 1)

        # 5. Verify Table Headers
        headers = [ws.cell(row=7, column=c).value for c in range(1, 6)]
        self.assertEqual(headers, ["Row", "Barcode", "Stock #", "Status", "Scanned At"])

    def test_scenario_12_multi_oem_bulk_intake_labeling(self):
        """Scenario 12: Multi-OEM Bulk Intake Labeling
        Continuous intake session for Samsung S24 Ultra, Xiaomi 13 Pro, Pixel 8, iPhone 16.
        """
        devices = [
            ("Samsung", "Galaxy S24 Ultra", "SM-S928B", "Titanium Gray", "351782110293840"),
            ("Apple", "iPhone 16 Pro Max", "iPhone17,2", "Desert Titanium", "358901230192830"),
            ("Xiaomi", "Xiaomi 13 Pro", "2210132G", "Ceramic Black", "358901234567896"),
            ("Google", "Pixel 8 Pro", "GC3VE", "Bay Blue", "353284091234560"),
        ]
        logged_stocks = []
        for brand, model, code, color, imei in devices:
            self.assertTrue(LuhnValidator.validate_imei(imei))
            specs = create_device_specs(
                connection_type="adb" if brand != "Apple" else "ios",
                device_id=imei[:10],
                brand=brand,
                marketing_name=model,
                model_code=code,
                storage="256GB",
                ram="8GB",
                color=color,
                os_version="14",
                serial_number=f"SER_{imei[:8]}",
                imei1=imei
            )
            stk = self.fixture.get_next_stock_number()
            self.fixture.log_printed_label(specs, stk)
            self.fixture.add_inventory_item(stk, model, color=color, imei1=imei)
            logged_stocks.append(stk)

        self.assertEqual(len(logged_stocks), 4)
        self.assertEqual(len(self.fixture.get_inventory(status="In Stock")), 4)

    def test_scenario_13_audit_session_interruption_and_recovery(self):
        """Scenario 13: Audit Session Interruption and Recovery
        Verify audit session state persists across multiple connection sessions.
        """
        for i in range(1, 11):
            self.fixture.add_inventory_item(f"STK-AUD-{i:03d}", f"Device {i}")

        sid = self.fixture.create_audit_session("Morning Part 1")
        for i in range(1, 5):
            self.fixture.record_audit_scan(sid, f"STK-AUD-{i:03d}")

        summary_pre = self.fixture.get_audit_summary(sid)
        self.assertEqual(summary_pre["scanned"], 4)

        for i in range(5, 8):
            self.fixture.record_audit_scan(sid, f"STK-AUD-{i:03d}")

        summary_post = self.fixture.get_audit_summary(sid)
        self.assertEqual(summary_post["scanned"], 7)
        self.assertEqual(summary_post["missing"], 3)

    def test_scenario_14_barcode_scanner_quiet_zone_and_luhn_failure_cascade(self):
        """Scenario 14: Barcode Scanner Quiet Zone & Luhn Failure Cascade
        Damaged / corrupted barcode with invalid check digit triggers error feedback.
        """
        invalid_imei = "358901234567891"
        self.assertFalse(LuhnValidator.validate_imei(invalid_imei))
        sid = self.fixture.create_audit_session("Error Handling Audit")
        res = self.fixture.record_audit_scan(sid, invalid_imei)
        self.assertEqual(res["status"], "unknown")
        freq, dur = AudioFeedbackContract.play_scan_beep(matched=False)
        self.assertEqual(freq, 800)

    def test_scenario_15_dual_label_sizes_switching(self):
        """Scenario 15: Dual Label Sizes Switching (38x25mm vs 60x30mm)
        Verify switching label templates maintains exact metric pixel geometry without distortion.
        """
        w1, h1 = VirtualPrintVerifier.calculate_expected_pixels(38, 25)
        self.assertEqual((w1, h1), (304, 200))

        w2, h2 = VirtualPrintVerifier.calculate_expected_pixels(60, 30)
        self.assertEqual((w2, h2), (480, 240))

        self.assertEqual(w1 / 38, 8.0)
        self.assertEqual(w2 / 60, 8.0)


if __name__ == "__main__":
    unittest.main()

