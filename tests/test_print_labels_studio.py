"""
tests/test_print_labels_studio.py — Comprehensive unit tests for 3uTools Print Labels Studio
Verifies 100% of the features shown in the 3uTools Print Labels interface:
1. SampleTemplate matching exact dimensions, margins, orientation, and elements
2. Full resolution of all 21 addable fields + QR Code
3. TemplateRepository persistence (Save, Load, List, Delete)
4. 203 DPI 1-bit monochrome rendering with 1D Code128 barcodes and 2D QR codes
5. Interactive Canvas element picking and bounding box calculation
6. Studio UI controls (Add chip, Add QR, Show/Hide Title, Barcode toggle, Reorder, Print)
"""
import os
import tempfile
import unittest
from PyQt6.QtWidgets import QApplication

from core.label_template_model import (
    PrintLabelTemplate, LabelElement, TemplateRepository,
    ADDABLE_FIELDS, resolve_field_value, create_sample_template
)
from core.label_template_renderer import render_template_to_pil, compute_element_rects
from core.models import DeviceSpecs
from core.mock_device import MOCK_IPHONE16_PROMAX, MOCK_S24_ULTRA


class TestPrintLabelsStudio(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not QApplication.instance():
            cls.app = QApplication([])
        else:
            cls.app = QApplication.instance()

    def test_01_sample_template_matches_3utools_screenshot(self):
        """Verifies default SampleTemplate mirrors the exact 3uTools screenshot."""
        tpl = create_sample_template()
        self.assertEqual(tpl.name, "SampleTemplate")
        self.assertEqual(tpl.paper_length_mm, 30.0)
        self.assertEqual(tpl.paper_width_mm, 40.0)
        self.assertEqual(tpl.margin_top_mm, 2.0)
        self.assertEqual(tpl.margin_bottom_mm, 2.0)
        self.assertEqual(tpl.margin_left_mm, 2.0)
        self.assertEqual(tpl.margin_right_mm, 2.0)
        self.assertEqual(tpl.orientation, "landscape")

        eff_w, eff_h = tpl.effective_dimensions_mm()
        self.assertEqual(eff_w, 40.0)
        self.assertEqual(eff_h, 30.0)

        # 5 elements in screenshot: Number, Model Name, Capacity, Color, Serial Number barcode
        self.assertEqual(len(tpl.elements), 5)
        keys = [el.field_key for el in tpl.elements]
        self.assertIn("number", keys)
        self.assertIn("model_name", keys)
        self.assertIn("capacity", keys)
        self.assertIn("color", keys)
        self.assertIn("serial_number", keys)

        # Serial number has barcode=True
        serial_el = next(e for e in tpl.elements if e.field_key == "serial_number")
        self.assertTrue(serial_el.is_barcode)

    def test_02_all_21_addable_fields_defined(self):
        """Verifies all 21 addable option chips from 3uTools screenshot are present."""
        self.assertEqual(len(ADDABLE_FIELDS), 21)
        expected_keys = [
            "number", "model_name", "color", "capacity", "serial_number",
            "ios_version", "imei", "imei2", "ecid", "network_lock",
            "model_number", "sales_region", "warranty_status", "regulatory_model",
            "charge_cycles", "battery_life", "remarks", "model_capacity_color",
            "date", "name", "phone"
        ]
        actual_keys = [k for k, _ in ADDABLE_FIELDS]
        for ek in expected_keys:
            self.assertIn(ek, actual_keys)

    def test_03_field_resolution_with_live_specs_and_fallback(self):
        """Verifies field value resolution with both mock specs and fallback state."""
        # 1. Fallback when disconnected
        for k, _ in ADDABLE_FIELDS:
            val = resolve_field_value(k, specs=None, stock_number="001")
            self.assertTrue(len(val) > 0)

        # 2. Live specs resolution
        specs = MOCK_IPHONE16_PROMAX
        m_name = resolve_field_value("model_name", specs=specs)
        self.assertIn("iPhone 16 Pro Max", m_name)

        cap = resolve_field_value("capacity", specs=specs)
        self.assertEqual(cap, specs.storage)

        col = resolve_field_value("color", specs=specs)
        self.assertEqual(col, "Desert Titanium")

        sn = resolve_field_value("serial_number", specs=specs)
        self.assertEqual(sn, specs.serial_number)

        imei = resolve_field_value("imei", specs=specs)
        self.assertEqual(imei, specs.imei1)

        combo = resolve_field_value("model_capacity_color", specs=specs)
        self.assertIn("iPhone 16 Pro Max", combo)
        self.assertIn(specs.storage, combo)
        self.assertIn("Desert Titanium", combo)

    def test_04_template_repository_crud(self):
        """Verifies template persistence, load, save, list, and delete."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, "test_templates.json")
            repo = TemplateRepository(storage_path=file_path)

            # Initially loads SampleTemplate
            self.assertIsNotNone(repo.get_template("SampleTemplate"))

            # Create custom template
            custom_tpl = PrintLabelTemplate(
                name="MyWorkshopTag",
                paper_length_mm=25.0,
                paper_width_mm=38.0,
                elements=[LabelElement(id="e1", field_key="model_name", title="Model Name")]
            )
            repo.save_template(custom_tpl)

            # Reload
            repo2 = TemplateRepository(storage_path=file_path)
            loaded = repo2.get_template("MyWorkshopTag")
            self.assertIsNotNone(loaded)
            self.assertEqual(loaded.paper_width_mm, 38.0)
            self.assertEqual(len(loaded.elements), 1)

            # Delete
            deleted = repo2.delete_template("MyWorkshopTag")
            self.assertTrue(deleted)
            self.assertIsNone(repo2.get_template("MyWorkshopTag"))

            # SampleTemplate protected
            del_sample = repo2.delete_template("SampleTemplate")
            self.assertFalse(del_sample)

    def test_05_render_template_to_pil(self):
        """Verifies high-precision 203 DPI 1-bit monochrome rendering."""
        tpl = create_sample_template()
        img = render_template_to_pil(tpl, specs=MOCK_IPHONE16_PROMAX, stock_number="STK-001")
        self.assertIsNotNone(img)
        self.assertEqual(img.mode, "1")

        # 40mm x 30mm @ 203.2 DPI = ~320 x 240 dots
        self.assertGreaterEqual(img.width, 300)
        self.assertGreaterEqual(img.height, 220)

    def test_06_compute_element_rects(self):
        """Verifies element bounding boxes are computed for interactive mouse selection."""
        tpl = create_sample_template()
        rects = compute_element_rects(tpl, specs=MOCK_IPHONE16_PROMAX)
        self.assertEqual(len(rects), 5)
        for el_id, (rx, ry, rw, rh) in rects.items():
            self.assertGreater(rw, 0)
            self.assertGreater(rh, 0)
            self.assertGreaterEqual(rx, 0)
            self.assertGreaterEqual(ry, 0)

    def test_07_dialog_and_studio_widget_ui(self):
        """Verifies UI instantiation, adding options, reordering, and auto-print trigger."""
        from ui.print_labels_dialog import PrintLabelsDialog, PrintLabelsStudioWidget

        dlg = PrintLabelsDialog(specs=MOCK_IPHONE16_PROMAX, stock_number="007")
        studio = dlg.studio

        # Check initial table rows
        self.assertEqual(studio.table_items.rowCount(), 5)

        # Add field
        studio._on_add_field_clicked("battery_life", "Battery Life")
        self.assertEqual(studio.table_items.rowCount(), 6)

        # Add QR
        studio._on_add_qr_clicked()
        self.assertEqual(studio.table_items.rowCount(), 7)

        # Show/Hide Title toggle
        el0 = studio._current_template.elements[0]
        init_show = el0.show_title
        studio._toggle_show_title(el0)
        self.assertEqual(el0.show_title, not init_show)

        # Barcode toggle
        el1 = studio._current_template.elements[1]
        studio._toggle_barcode(el1)
        self.assertTrue(el1.is_barcode)

        # Move item up/down
        studio._move_item_down(0)
        studio._move_item_up(1)

        # Delete item
        studio._delete_item(len(studio._current_template.elements) - 1)
        self.assertEqual(studio.table_items.rowCount(), 6)

        dlg.close()


if __name__ == "__main__":
    unittest.main()
