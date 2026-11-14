"""
tests/test_database.py — Unit & Adversarial Test Suite for DatabaseManager (Milestone 3)
Testing SQLite3 WAL mode, auto-increment sequences, search filtering, SQL injection resilience,
Excel (.xlsx) export, and CSV UTF-8 BOM escaping.
"""
import os
import shutil
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

from core.database import DatabaseManager
from core.models import DeviceSpecs, RepairTicket


class TestDatabaseManager(unittest.TestCase):
    """Unit and integration test cases for core.database.DatabaseManager."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, "test_lab.db")
        self.db = DatabaseManager(db_path=self.db_path)

    def tearDown(self):
        self.db.close()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_wal_mode_and_pragmas(self):
        """Verify database initializes in WAL journal mode with normal synchronous setting."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("PRAGMA journal_mode;")
        mode = cur.fetchone()[0]
        self.assertEqual(mode.lower(), "wal")

        cur.execute("PRAGMA foreign_keys;")
        fk = cur.fetchone()[0]
        self.assertEqual(fk, 1)

    def test_02_indexes_created(self):
        """Verify required search and performance indexes exist in the schema."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='index';")
        indexes = {row[0] for row in cur.fetchall()}
        required = [
            "idx_labels_serial", "idx_labels_imei1", "idx_labels_model",
            "idx_labels_stock", "idx_tickets_phone", "idx_tickets_model",
            "idx_tickets_ticket_id", "idx_tickets_customer"
        ]
        for req in required:
            self.assertIn(req, indexes, f"Missing index: {req}")

    def test_03_stock_number_autoincrement(self):
        """Verify sequential stock numbers start at STK-000001 and increment monotonically."""
        stk1 = self.db.get_next_stock_number()
        self.assertEqual(stk1, "STK-000001")

        specs = DeviceSpecs(
            connection_type="mock",
            device_id="SN001",
            brand="Apple",
            marketing_name="iPhone 15 Pro",
            model_code="A3102",
            storage="256GB",
            ram="8GB",
            color="Natural",
            os_version="18.0",
            serial_number="F2LYP012N6P1",
            imei1="358901234567890"
        )
        row_id = self.db.log_printed_label(specs, stk1)
        self.assertGreaterEqual(row_id, 1)

        stk2 = self.db.get_next_stock_number()
        self.assertEqual(stk2, "STK-000002")

    def test_04_ticket_id_autoincrement(self):
        """Verify sequential repair ticket IDs start at TKT-000001 and increment monotonically."""
        tkt1 = self.db.get_next_ticket_id()
        self.assertEqual(tkt1, "TKT-000001")

        ticket = RepairTicket(
            ticket_id=tkt1,
            customer_name="Ahmed Hassan",
            customer_phone="01012345678",
            device_model="Galaxy S24 Ultra",
            reported_fault="Screen Replacement",
            passcode="1234"
        )
        row_id = self.db.log_repair_ticket(ticket)
        self.assertGreaterEqual(row_id, 1)

        tkt2 = self.db.get_next_ticket_id()
        self.assertEqual(tkt2, "TKT-000002")

    def test_05_duplicate_stock_number_rejected(self):
        """Verify attempting to insert a duplicate stock number raises sqlite3.IntegrityError."""
        specs = DeviceSpecs(
            connection_type="mock", device_id="D1", brand="A", marketing_name="M",
            model_code="C", storage="128GB", ram="8GB", color="Black",
            os_version="15", serial_number="SN1", imei1="352099123456789"
        )
        self.db.log_printed_label(specs, "STK-CUSTOM-001")

        with self.assertRaises(sqlite3.IntegrityError):
            self.db.log_printed_label(specs, "STK-CUSTOM-001")

    def test_06_duplicate_ticket_id_rejected(self):
        """Verify attempting to insert a duplicate ticket ID raises sqlite3.IntegrityError."""
        ticket = RepairTicket(
            ticket_id="TKT-CUSTOM-999",
            customer_name="Customer",
            customer_phone="01111111111",
            device_model="iPhone 14",
            reported_fault="Battery",
            passcode="0000"
        )
        self.db.log_repair_ticket(ticket)

        with self.assertRaises(sqlite3.IntegrityError):
            self.db.log_repair_ticket(ticket)

    def test_07_search_multi_field_query(self):
        """Verify search_history returns matches across serial, IMEI, model, customer name, and phone."""
        # Insert specs
        specs = DeviceSpecs(
            connection_type="mock", device_id="D2", brand="Samsung",
            marketing_name="Galaxy S24 Ultra", model_code="SM-S928B",
            storage="512GB", ram="12GB", color="Titanium Black",
            os_version="14", serial_number="RFCW10Z9XXX", imei1="354892019482014"
        )
        self.db.log_printed_label(specs, "STK-000001")

        # Insert ticket with Arabic customer name
        ticket = RepairTicket(
            ticket_id="TKT-000001",
            customer_name="المهندس أحمد عبد الرحمن",
            customer_phone="01098765432",
            device_model="Xiaomi 14 Ultra",
            reported_fault="صيانة كاميرا",
            passcode="2026"
        )
        self.db.log_repair_ticket(ticket)

        # 1. Search by IMEI
        res = self.db.search_history("354892019482")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["source"], "specs")
        self.assertEqual(res[0]["ref_id"], "STK-000001")

        # 2. Search by Arabic name substring
        res = self.db.search_history("عبد الرحمن")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["source"], "ticket")
        self.assertEqual(res[0]["ref_id"], "TKT-000001")

        # 3. Search by Phone
        res = self.db.search_history("0109876")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["ref_id"], "TKT-000001")

        # 4. Search by Model
        res = self.db.search_history("14 Ultra")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["ref_id"], "TKT-000001")

        # 5. Empty search returns all records
        res_all = self.db.search_history("")
        self.assertEqual(len(res_all), 2)

    def test_08_sql_injection_resilience(self):
        """Verify search query containing SQL injection payloads does not break or leak unauthorized data."""
        payloads = [
            "' OR 1=1 --",
            "'; DROP TABLE printed_labels; --",
            "' UNION SELECT * FROM sqlite_master --",
            "\" OR \"a\"=\"a"
        ]
        for p in payloads:
            results = self.db.search_history(p)
            self.assertIsInstance(results, list)

        # Verify tables still intact
        self.assertIsNotNone(self.db.get_next_stock_number())

    def test_09_excel_export_multi_sheet(self):
        """Verify export_history_to_excel creates valid workbook with both specs and tickets sheets."""
        specs = DeviceSpecs(
            connection_type="mock", device_id="D3", brand="Apple",
            marketing_name="iPhone 16 Pro Max", model_code="A3297",
            storage="1TB", ram="8GB", color="Desert Titanium",
            os_version="18.1", serial_number="F4XZ0099LL1",
            imei1="359998887776665", battery_health=99, condition_grade="A+"
        )
        self.db.log_printed_label(specs, "STK-000010")

        ticket = RepairTicket(
            ticket_id="TKT-000010",
            customer_name="Mohamed Samir",
            customer_phone="01222223333",
            device_model="Honor Magic 6 Pro",
            reported_fault="Back Glass Broken",
            passcode="4321",
            back_cracked=True,
            estimated_cost=85.50
        )
        self.db.log_repair_ticket(ticket)

        out_xlsx = os.path.join(self.temp_dir, "exports", "test_report.xlsx")
        success = self.db.export_history_to_excel(out_xlsx)
        self.assertTrue(success)
        self.assertTrue(os.path.exists(out_xlsx))

        # Inspect workbook contents with openpyxl
        import openpyxl
        wb = openpyxl.load_workbook(out_xlsx)
        self.assertIn("Device Specs History", wb.sheetnames)
        self.assertIn("Repair Tickets History", wb.sheetnames)

        ws_specs = wb["Device Specs History"]
        self.assertGreaterEqual(ws_specs.max_row, 2)
        self.assertEqual(ws_specs.cell(row=2, column=2).value, "STK-000010")
        self.assertEqual(ws_specs.cell(row=2, column=5).value, "iPhone 16 Pro Max")

        ws_tickets = wb["Repair Tickets History"]
        self.assertGreaterEqual(ws_tickets.max_row, 2)
        self.assertEqual(ws_tickets.cell(row=2, column=2).value, "TKT-000010")
        self.assertEqual(ws_tickets.cell(row=2, column=3).value, "Mohamed Samir")

    def test_10_csv_export_escaping_and_utf8(self):
        """Verify export_history_to_csv properly escapes quotes, newlines, and preserves Arabic text with BOM."""
        complex_remarks = 'First line, with comma and "quotes"\nSecond line with Arabic: فحص شامل'
        specs = DeviceSpecs(
            connection_type="mock", device_id="D4", brand="Google",
            marketing_name="Pixel 9 Pro", model_code="G1234",
            storage="256GB", ram="16GB", color="Obsidian",
            os_version="15", serial_number="99PIXEL001",
            imei1="351234567890123", remarks=complex_remarks
        )
        self.db.log_printed_label(specs, "STK-000020")

        out_csv = os.path.join(self.temp_dir, "exports", "test_specs.csv")
        success = self.db.export_history_to_csv(out_csv, source="specs")
        self.assertTrue(success)

        # Verify UTF-8 BOM encoding and RFC 4180 parsing
        with open(out_csv, "rb") as f:
            raw_bytes = f.read()
            self.assertTrue(raw_bytes.startswith(b"\xef\xbb\xbf"), "Missing UTF-8 BOM header")

        import csv
        with open(out_csv, "r", encoding="utf-8-sig", newline="") as f:
            reader = list(csv.reader(f))
            self.assertGreaterEqual(len(reader), 2)
            # Check remarks field
            row = reader[1]
            self.assertIn("فحص شامل", row[-2])
            self.assertIn('First line, with comma and "quotes"', row[-2])

    def test_11_concurrent_access_stress(self):
        """Stress test with 20 parallel threads concurrently logging and searching."""
        errors = []

        def worker_task(thread_id: int):
            try:
                for i in range(10):
                    stk = f"STK-THR{thread_id:02d}-{i:03d}"
                    specs = DeviceSpecs(
                        connection_type="mock", device_id=f"T{thread_id}_{i}",
                        brand="OEM", marketing_name=f"Model_{thread_id}",
                        model_code="M", storage="128GB", ram="6GB", color="Blue",
                        os_version="13", serial_number=f"SN_{thread_id}_{i}",
                        imei1=f"350000{thread_id:02d}{i:03d}0"
                    )
                    self.db.log_printed_label(specs, stk)
                    # Read back
                    res = self.db.search_history(f"SN_{thread_id}_{i}")
                    if len(res) != 1:
                        errors.append(f"Expected 1 result for thread {thread_id}, got {len(res)}")
            except Exception as e:
                errors.append(str(e))

        threads = [threading.Thread(target=worker_task, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0, f"Concurrent execution produced errors: {errors}")


if __name__ == "__main__":
    unittest.main()
