"""
tests/test_ui.py — Unit & Integration Test Suite for Desktop UI Layer (Milestone 4)
Tests 5-panel layout, luxury dark styling tokens, signal propagation, and headless execution.
"""
import os
import shutil
import tempfile
import unittest

os.environ["QT_QPA_PLATFORM"] = "offscreen"

from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import Qt

from core.database import DatabaseManager
from core.models import DeviceSpecs, RepairTicket
from ui.main_window import MainWindow
from ui.styles import LUXURY_DARK_QSS, BG_ROOT, BG_SURFACE, ACCENT_GOLD


class TestDesktopUI(unittest.TestCase):
    """Test suite for PyQt6 Desktop UI Layer."""

    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance()
        if not cls.app:
            cls.app = QApplication([])

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, "test_ui.db")
        self.db = DatabaseManager(db_path=self.db_path)
        self.window = MainWindow(db=self.db)

    def tearDown(self):
        self.window.top_status_bar.stop_worker()
        self.window.close()
        self.db.close()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_five_panel_layout_exists(self):
        """Verify all 5 required panels exist and are instantiated."""
        self.assertIsNotNone(self.window.top_status_bar)
        self.assertIsNotNone(self.window.left_specs_intake_panel)
        self.assertIsNotNone(self.window.center_wysiwyg_preview)
        self.assertIsNotNone(self.window.right_printer_manager)
        self.assertIsNotNone(self.window.bottom_history_table)

    def test_02_minimum_window_footprint(self):
        """Verify minimum size 1200x640 supports 720p screens."""
        min_size = self.window.minimumSize()
        self.assertGreaterEqual(min_size.width(), 1200)
        self.assertGreaterEqual(min_size.height(), 640)

    def test_03_luxury_dark_theme_tokens(self):
        """Verify luxury dark theme color tokens exist in styles."""
        self.assertEqual(BG_ROOT, "#121212")
        self.assertEqual(BG_SURFACE, "#1E1E1E")
        self.assertEqual(ACCENT_GOLD, "#D4AF37")
        self.assertIn("#121212", LUXURY_DARK_QSS)
        self.assertIn("#1E1E1E", LUXURY_DARK_QSS)
        self.assertIn("#D4AF37", LUXURY_DARK_QSS)

    def test_04_device_specs_population_and_preview(self):
        """Verify populating specs updates form fields and preview canvas."""
        specs = DeviceSpecs(
            connection_type="mock",
            device_id="TEST-DEV-01",
            brand="Samsung",
            marketing_name="Galaxy S24 Ultra",
            model_code="SM-S928B",
            storage="512GB",
            ram="12GB",
            color="Titanium Gray",
            os_version="Android 14",
            serial_number="RFCW10Z9XXX",
            imei1="354892019482014",
            battery_health=99
        )
        self.window._on_device_connected(specs)

        self.assertEqual(self.window.tab_specs.edit_brand.text(), "Samsung")
        self.assertEqual(self.window.tab_specs.edit_model.text(), "Galaxy S24 Ultra")
        self.assertEqual(self.window.tab_specs.edit_serial.text(), "RFCW10Z9XXX")
        self.assertEqual(self.window.tab_specs.edit_battery.text(), "99")

        # Force render tick
        self.window.center_wysiwyg_preview._render_now()
        img = self.window.center_wysiwyg_preview.get_current_image()
        self.assertIsNotNone(img)
        self.assertEqual(img.size, (304, 200))  # 38x25mm default

    def test_05_repair_intake_ticket_preview(self):
        """Verify switching to repair intake tab renders repair ticket label."""
        self.window.left_tabs.setCurrentIndex(1)
        self.assertEqual(self.window.center_wysiwyg_preview._mode, "ticket")

        ticket = self.window.tab_intake.get_ticket()
        self.assertIsNotNone(ticket)
        self.assertTrue(ticket.ticket_id.startswith("TKT-"))

        self.window.center_wysiwyg_preview._render_now()
        img = self.window.center_wysiwyg_preview.get_current_image()
        self.assertIsNotNone(img)
        self.assertEqual(img.size, (400, 240))  # 50x30mm intake ticket preset

    def test_06_print_specs_persists_and_increments_stock(self):
        """Verify printing specs logs to database and increments stock number."""
        stk_before = self.window.tab_specs.get_stock_number()
        specs = self.window.tab_specs.get_specs()

        self.window._execute_print_specs(specs, stk_before)

        # Verify record in database
        records = self.db.search_history("")
        self.assertGreaterEqual(len(records), 1)
        self.assertEqual(records[0]["ref_id"], stk_before)

        # Verify next stock number is updated
        stk_after = self.window.tab_specs.get_stock_number()
        self.assertNotEqual(stk_before, stk_after)

    def test_07_paper_size_preset_change(self):
        """Verify switching preset changes width and height in preview."""
        self.window.right_printer_manager.combo_preset.setCurrentIndex(1)  # 40x25mm
        self.window.center_wysiwyg_preview._render_now()
        img = self.window.center_wysiwyg_preview.get_current_image()
        self.assertEqual(img.size, (320, 200))

    def test_08_reprint_workflow(self):
        """Verify 1-click reprint from history table reloads record and triggers print."""
        # Log a record
        specs = DeviceSpecs(
            connection_type="mock", device_id="D99", brand="Xiaomi",
            marketing_name="14 Ultra", model_code="24030PN60G",
            storage="512GB", ram="16GB", color="White",
            os_version="14", serial_number="SN_REPRINT_TEST",
            imei1="359999000011122"
        )
        self.db.log_printed_label(specs, "STK-REPRINT-01")
        self.window.bottom_history_table.reload_data()

        # Find row and simulate reprint
        record = self.db.search_history("SN_REPRINT_TEST")[0]
        self.window._on_reprint_requested(record)

        # Check that tab switched and fields loaded
        self.assertEqual(self.window.tab_specs.edit_serial.text(), "SN_REPRINT_TEST")

    def test_09_printer_selection_synchronization(self):
        """Verify printer selection box in top bar is present and synchronizes with right panel."""
        top_combo = self.window.top_bar.combo_printer
        right_combo = self.window.right_panel.combo_printers

        self.assertIsNotNone(top_combo)
        self.assertGreaterEqual(top_combo.count(), 1)
        self.assertEqual(top_combo.currentText(), right_combo.currentText())

        # Select different item if available
        if top_combo.count() > 1:
            top_combo.setCurrentIndex(1)
            self.assertEqual(right_combo.currentText(), top_combo.currentText())


if __name__ == "__main__":
    unittest.main()
