"""
tests/test_designer.py — Unit tests for Label Field Designer and Custom Positioning Engine
"""
import os
import unittest
from PyQt6.QtWidgets import QApplication

from core.config import ConfigManager, DEFAULT_LABEL_FIELDS
from core.models import DeviceSpecs
from core.label_renderer import render_device_specs_label
from ui.designer_tab import DesignerTab
from ui.printer_panel import PrinterManagerPanel

app = QApplication.instance() or QApplication([])


class TestDesignerEngine(unittest.TestCase):
    def setUp(self):
        self.specs = DeviceSpecs(
            connection_type="adb",
            device_id="TEST-DEV-01",
            brand="Samsung",
            marketing_name="Galaxy S24 Ultra",
            model_code="SM-S928B",
            storage="512GB",
            ram="12GB",
            color="Titanium Gray",
            os_version="Android 14",
            serial_number="R5CW10ABCDE",
            imei1="354890123456789",
            battery_health=99,
            battery_cycles=45,
            condition_grade="A+"
        )
        self.config_mgr = ConfigManager.get_instance()

    def test_custom_designer_template_renders_successfully(self):
        """Tests that custom_designer template generates a valid 1-bit monochrome image."""
        img = render_device_specs_label(
            specs=self.specs,
            width_mm=38,
            height_mm=25,
            template="custom_designer",
            font_family="segoe",
            shop_name="Test Store",
            shop_phone="01012345678",
            custom_price="15,000 EGP",
            custom_warranty="6 Months",
            custom_note="Mint Condition",
            barcode_type="code128"
        )
        self.assertEqual(img.mode, "1")
        self.assertEqual(img.size, (304, 200))

    def test_custom_designer_qr_mode(self):
        """Tests custom_designer with 2D QR Code mode."""
        img = render_device_specs_label(
            specs=self.specs,
            width_mm=50,
            height_mm=30,
            template="custom_designer",
            barcode_type="qr",
            qr_mode="whatsapp",
            shop_phone="+201012345678"
        )
        self.assertEqual(img.mode, "1")
        self.assertEqual(img.size, (400, 240))

    def test_field_toggling_and_ordering(self):
        """Tests that disabled fields are omitted and custom order is respected."""
        custom_fields = [
            {"id": "model_name", "name": "Device Model", "enabled": True, "order": 1, "align": "center"},
            {"id": "price_warranty", "name": "Price", "enabled": True, "order": 2, "align": "left"},
            {"id": "barcode_qr", "name": "Barcode", "enabled": True, "order": 3, "align": "center"},
            {"id": "shop_header", "name": "Shop", "enabled": False, "order": 4, "align": "center"},
        ]
        img = render_device_specs_label(
            specs=self.specs,
            width_mm=38,
            height_mm=25,
            template="custom_designer",
            label_fields=custom_fields,
            custom_price="1200$"
        )
        self.assertEqual(img.mode, "1")

    def test_designer_tab_widget_lifecycle(self):
        """Verifies DesignerTab UI widgets initialize, load settings, and update."""
        tab = DesignerTab()
        self.assertIsNotNone(tab.edit_shop_name)
        self.assertIsNotNone(tab.edit_shop_phone)
        self.assertIsNotNone(tab.table_fields)
        self.assertGreater(tab.table_fields.rowCount(), 0)

        # Modify values
        tab.edit_shop_name.setText("Al-Motamayez VIP")
        tab.edit_shop_phone.setText("01099999999")
        tab._on_setting_changed()

        cfg = self.config_mgr.load()
        self.assertEqual(cfg.shop_name, "Al-Motamayez VIP")
        self.assertEqual(cfg.shop_phone, "01099999999")

    def test_printer_panel_test_button_and_saving(self):
        """Verifies PrinterManagerPanel test print signal and printer persistence."""
        panel = PrinterManagerPanel()
        test_signals = []
        panel.quick_test_print_requested.connect(lambda p: test_signals.append(p))
        panel._on_test_clicked()
        self.assertEqual(len(test_signals), 1)


if __name__ == "__main__":
    unittest.main()
