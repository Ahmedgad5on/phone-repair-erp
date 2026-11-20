"""
tests/test_ui.py — Unit & Integration Test Suite for Desktop UI Layer
Tests executive vertical layout, luxury dark styling tokens, signal propagation, and headless execution.
"""
import os
import shutil
import tempfile
import unittest

os.environ["QT_QPA_PLATFORM"] = "offscreen"

from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import Qt

from core.database import DatabaseManager
from core.models import DeviceSpecs
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
        if hasattr(self.window, "github_sync_worker") and self.window.github_sync_worker:
            self.window.github_sync_worker.stop()
        if hasattr(self.window, "bot") and self.window.bot:
            self.window.bot.stop()
        if hasattr(self.window, "top_bar") and self.window.top_bar:
            self.window.top_bar.stop_worker()
        self.window.close()
        self.db.close()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_layout_and_workspaces_exist(self):
        """Verify header telemetry, sidebar navigation, and stacked workspaces exist."""
        self.assertIsNotNone(self.window.top_bar)
        self.assertIsNotNone(self.window.sidebar_frame)
        self.assertIsNotNone(self.window.stack)
        self.assertGreaterEqual(self.window.stack.count(), 9)

        # Core operational workspaces
        self.assertIsNotNone(self.window.tab_intake)
        self.assertIsNotNone(self.window.tab_inventory)
        self.assertIsNotNone(self.window.tab_pos)
        self.assertIsNotNone(self.window.tab_trade_in)
        self.assertIsNotNone(self.window.tab_traders)
        self.assertIsNotNone(self.window.tab_reports)
        self.assertIsNotNone(self.window.tab_analytics)
        self.assertIsNotNone(self.window.tab_audit)
        self.assertIsNotNone(self.window.canvas)
        self.assertIsNotNone(self.window.right_panel)
        self.assertIsNotNone(self.window.tab_telegram)
        self.assertIsNotNone(self.window.tab_security)

    def test_02_minimum_window_footprint(self):
        """Verify minimum size 1200x640 supports standard commercial POS screens."""
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
        """Verify populating specs updates intake form fields and canvas state."""
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

        self.assertEqual(self.window.tab_intake.cb_brand.currentText(), "Samsung")
        self.assertEqual(self.window.tab_intake.txt_model.text(), "Galaxy S24 Ultra")
        self.assertEqual(self.window.tab_intake.txt_serial.text(), "RFCW10Z9XXX")
        self.assertEqual(self.window.tab_intake.sp_battery_health.value(), 99)
        self.assertEqual(self.window.canvas._specs.serial_number, "RFCW10Z9XXX")

    def test_05_sidebar_navigation_switching(self):
        """Verify switching sidebar items changes active stacked page correctly."""
        self.window._on_sidebar_nav_clicked(1)
        self.assertEqual(self.window.stack.currentIndex(), 1)

        self.window._on_sidebar_nav_clicked(2)
        self.assertEqual(self.window.stack.currentIndex(), 2)

        self.window._on_sidebar_nav_clicked(0)
        self.assertEqual(self.window.stack.currentIndex(), 0)

    def test_06_role_switch_rbac_protection(self):
        """Verify switching between Owner and Salesperson enforces field-level permissions."""
        self.window._on_role_switched("Salesperson", "SalesStaff")
        self.assertEqual(self.window.current_role, "Salesperson")
        self.assertFalse(self.window.tab_intake.txt_buy_price.isEnabled())

        self.window._on_role_switched("Owner", "Owner")
        self.assertEqual(self.window.current_role, "Owner")
        self.assertTrue(self.window.tab_intake.txt_buy_price.isEnabled())

    def test_07_paper_size_preset_change(self):
        """Verify switching preset changes width and height in template model."""
        self.window.right_panel.combo_preset.setCurrentIndex(1)
        tpl = self.window.right_panel.get_current_template()
        self.assertIsNotNone(tpl)
        w_mm, h_mm = tpl.effective_dimensions_mm()
        self.assertGreater(w_mm, 0)
        self.assertGreater(h_mm, 0)

    def test_08_device_disconnect_telemetry_reset(self):
        """Verify disconnecting resets telemetry indicator."""
        self.window._on_device_disconnected()
        self.assertIn("في انتظار", self.window.lbl_device_status.text())

    def test_09_printer_selection_synchronization(self):
        """Verify printer selection box in top bar is present and synchronizes with right panel."""
        top_combo = self.window.top_bar.combo_printer
        right_combo = self.window.right_panel.combo_printers

        self.assertIsNotNone(top_combo)
        self.assertGreaterEqual(top_combo.count(), 1)
        self.assertEqual(top_combo.currentText(), right_combo.currentText())

        if top_combo.count() > 1:
            top_combo.setCurrentIndex(1)
            self.assertEqual(right_combo.currentText(), top_combo.currentText())


if __name__ == "__main__":
    import sys
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestDesktopUI)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    os._exit(0 if result.wasSuccessful() else 1)
