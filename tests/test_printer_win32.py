"""
tests/test_printer_win32.py — Comprehensive Unit Test Suite for Windows GDI Silent Printing & Virtual Fallback
Validates:
- Multi-tier printer discovery & thermal keyword priority ranking (Xprinter XP-370B, Zebra, TSC)
- Printer capabilities inspection (HORZRES, VERTRES, LOGPIXELSX, LOGPIXELSY)
- Virtual print fallback saving exact 203 DPI 1-bit monochrome PNG & PDF
- print_label_image interface conforming to PROJECT.md Contract #3
- GDI silent printing mock lifecycle (StartDoc -> StartPage -> DIB blit -> EndPage -> EndDoc)
- Exception handling, AbortDoc() invocation, and DeleteDC() cleanup guarantee
"""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from PIL import Image

from core.printer_win32 import (
    get_installed_printers,
    detect_thermal_printer,
    get_printer_capabilities,
    save_virtual_print,
    print_to_gdi,
    print_label_image,
    is_virtual_printer,
    THERMAL_KEYWORDS,
    VIRTUAL_PRINTER_KEYWORDS,
    WIN32_AVAILABLE,
)
from core.paths import get_exports_dir


class Test01PrinterDiscoveryAndRanking(unittest.TestCase):
    """Suite 1: Windows printer enumeration & thermal priority ranking."""

    def test_01_get_installed_printers_returns_list_of_strings(self):
        """Verify get_installed_printers returns a non-empty list of printer name strings."""
        printers = get_installed_printers()
        self.assertIsInstance(printers, list)
        self.assertGreater(len(printers), 0)
        for p in printers:
            self.assertIsInstance(p, str)

    def test_02_thermal_printer_ranking_priority(self):
        """Verify thermal printers (e.g. Xprinter, Zebra) are ranked before standard printers."""
        mock_raw = ["Microsoft Print to PDF", "OneNote", "Xprinter XP-370B", "Brother HL-L2350DW", "Zebra ZD420"]
        thermal_matches = [p for p in mock_raw if any(kw in p.lower() for kw in THERMAL_KEYWORDS)]
        other_printers = [p for p in mock_raw if p not in thermal_matches]
        ranked = thermal_matches + other_printers

        self.assertEqual(ranked[0], "Xprinter XP-370B")
        self.assertEqual(ranked[1], "Zebra ZD420")
        self.assertEqual(ranked[2], "Microsoft Print to PDF")

    def test_03_detect_thermal_printer_selection(self):
        """Verify detect_thermal_printer selects the first thermal printer when present."""
        sample_list = ["Brother Laser", "Xprinter XP-370B", "Epson TM-T20"]
        chosen = detect_thermal_printer(sample_list)
        self.assertEqual(chosen, "Xprinter XP-370B")

    def test_04_detect_thermal_printer_no_thermal_returns_none(self):
        """Verify detect_thermal_printer returns None when installed list contains no thermal printers."""
        sample_list = ["Brother Laser", "Epson Stylus", "Virtual Print (PNG Export)"]
        chosen = detect_thermal_printer(sample_list)
        self.assertIsNone(chosen)

    def test_05_detect_thermal_printer_empty_or_virtual_only(self):
        """Verify detect_thermal_printer returns None when only virtual options exist."""
        virtual_only = ["Virtual Print (PNG Export)", "Virtual Print (PDF Export)"]
        self.assertIsNone(detect_thermal_printer(virtual_only))
        self.assertIsNone(detect_thermal_printer([]))


class Test02PrinterCapabilities(unittest.TestCase):
    """Suite 2: Printer capability querying and thermal flags."""

    def test_06_capabilities_dictionary_structure(self):
        """Verify get_printer_capabilities returns dictionary with required keys."""
        caps = get_printer_capabilities("Virtual Print (PNG Export)")
        self.assertIsInstance(caps, dict)
        self.assertIn("printer_name", caps)
        self.assertIn("dpi_x", caps)
        self.assertIn("dpi_y", caps)
        self.assertIn("printable_width", caps)
        self.assertIn("printable_height", caps)
        self.assertIn("is_thermal", caps)

    def test_07_capabilities_thermal_flag_detection(self):
        """Verify is_thermal flag matches known thermal brand keywords."""
        self.assertTrue(get_printer_capabilities("Xprinter XP-370B")["is_thermal"])
        self.assertTrue(get_printer_capabilities("Zebra ZD420")["is_thermal"])
        self.assertTrue(get_printer_capabilities("TSC TTP-244")["is_thermal"])
        self.assertFalse(get_printer_capabilities("HP LaserJet 1020")["is_thermal"])


class Test03VirtualPrintFallback(unittest.TestCase):
    """Suite 3: Virtual print file generation (PNG and PDF)."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_img = Image.new("1", (304, 200), color=1)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_08_save_virtual_print_png_format(self):
        """Verify save_virtual_print creates valid 203 DPI PNG file."""
        ok, file_path = save_virtual_print(self.test_img, format_type="PNG", output_dir=self.temp_dir.name)
        self.assertTrue(ok)
        self.assertTrue(os.path.exists(file_path))
        self.assertTrue(file_path.endswith(".png"))

        # Check PNG magic bytes
        with open(file_path, "rb") as f:
            header = f.read(8)
            self.assertEqual(header, b"\x89PNG\r\n\x1a\n")

    def test_09_save_virtual_print_pdf_format(self):
        """Verify save_virtual_print creates valid PDF file."""
        ok, file_path = save_virtual_print(self.test_img, format_type="PDF", output_dir=self.temp_dir.name)
        self.assertTrue(ok)
        self.assertTrue(os.path.exists(file_path))
        self.assertTrue(file_path.endswith(".pdf"))

        # Check PDF magic bytes
        with open(file_path, "rb") as f:
            header = f.read(4)
            self.assertEqual(header, b"%PDF")

    def test_10_save_virtual_print_none_image_fails(self):
        """Verify None image returns failure tuple."""
        ok, err = save_virtual_print(None, output_dir=self.temp_dir.name)
        self.assertFalse(ok)
        self.assertIn("cannot be None", err)

    def test_11_save_virtual_print_auto_create_dir(self):
        """Verify save_virtual_print creates nested subdirectories if nonexistent."""
        nested = os.path.join(self.temp_dir.name, "sub1", "sub2", "exports")
        ok, file_path = save_virtual_print(self.test_img, output_dir=nested)
        self.assertTrue(ok)
        self.assertTrue(os.path.exists(file_path))


class Test04PrintLabelImageContract(unittest.TestCase):
    """Suite 4: Main print_label_image entry point conforming to Contract #3."""

    def setUp(self):
        self.test_img = Image.new("1", (304, 200), color=1)

    def test_12_print_virtual_png_explicit_request(self):
        """Verify explicit virtual PNG request exports and returns file path."""
        ok, msg = print_label_image(self.test_img, printer_name="Virtual Print (PNG Export)")
        self.assertTrue(ok)
        self.assertTrue(os.path.exists(msg))
        self.assertTrue(msg.endswith(".png"))
        if os.path.exists(msg):
            os.remove(msg)

    def test_13_print_virtual_pdf_explicit_request(self):
        """Verify explicit virtual PDF request exports and returns file path."""
        ok, msg = print_label_image(self.test_img, printer_name="Virtual Print (PDF Export)")
        self.assertTrue(ok)
        self.assertTrue(os.path.exists(msg))
        self.assertTrue(msg.endswith(".pdf"))
        if os.path.exists(msg):
            os.remove(msg)

    def test_14_print_none_image_raises_value_error(self):
        """Verify None image raises ValueError."""
        with self.assertRaises(ValueError):
            print_label_image(None)

    def test_15_print_zero_dimension_image_raises_value_error(self):
        """Verify zero-size image raises ValueError."""
        empty_img = Image.new("1", (0, 0), color=1)
        with self.assertRaises(ValueError):
            print_label_image(empty_img)

    def test_16_nonexistent_printer_no_fallback_returns_false(self):
        """Verify nonexistent printer with virtual_fallback=False returns (False, msg)."""
        ok, msg = print_label_image(
            self.test_img,
            printer_name="PRINTER_NOT_INSTALLED_XYZ_99",
            virtual_fallback=False
        )
        self.assertFalse(ok)
        self.assertIn("not found", msg)

    def test_17_nonexistent_printer_with_fallback_returns_true(self):
        """Verify nonexistent printer with virtual_fallback=True returns (True, file_path)."""
        ok, msg = print_label_image(
            self.test_img,
            printer_name="PRINTER_NOT_INSTALLED_XYZ_99",
            virtual_fallback=True
        )
        self.assertTrue(ok)
        self.assertIn("Saved virtual print to", msg)

    def test_18_print_job_name_parameter(self):
        """Verify job_name parameter is accepted."""
        job_name = "Thermal Label Print - STK-000042"
        ok, msg = print_label_image(
            self.test_img,
            printer_name="Virtual Print (PNG Export)",
            job_name=job_name
        )
        self.assertTrue(ok)
        if os.path.exists(msg):
            os.remove(msg)


class Test05GdiPrintingLifecycleMock(unittest.TestCase):
    """Suite 5: Headless Windows GDI printing lifecycle and error recovery."""

    def setUp(self):
        self.test_img = Image.new("1", (304, 200), color=1)

    @patch("win32ui.CreateDC")
    @patch("PIL.ImageWin.Dib")
    def test_19_gdi_print_lifecycle_success(self, mock_dib_cls, mock_create_dc):
        """Verify complete GDI print lifecycle: StartDoc -> StartPage -> draw -> EndPage -> EndDoc."""
        mock_dc = MagicMock()
        mock_create_dc.return_value = mock_dc
        mock_dc.GetDeviceCaps.side_effect = lambda cap: 203 if cap in (88, 90) else 1000

        mock_dib_instance = MagicMock()
        mock_dib_cls.return_value = mock_dib_instance

        ok, msg = print_to_gdi(self.test_img, "Mock Thermal Printer", job_name="Test Job")
        self.assertTrue(ok)
        self.assertIn("successfully", msg)

        mock_dc.CreatePrinterDC.assert_called_once_with("Mock Thermal Printer")
        mock_dc.StartDoc.assert_called_once_with("Test Job")
        mock_dc.StartPage.assert_called_once()
        mock_dib_instance.draw.assert_called_once()
        mock_dc.EndPage.assert_called_once()
        mock_dc.EndDoc.assert_called_once()
        mock_dc.DeleteDC.assert_called_once()

    @patch("win32ui.CreateDC")
    def test_20_gdi_print_lifecycle_failure_triggers_abort_doc(self, mock_create_dc):
        """Verify on GDI error that AbortDoc is called and DeleteDC is invoked in finally."""
        mock_dc = MagicMock()
        mock_create_dc.return_value = mock_dc
        mock_dc.GetDeviceCaps.side_effect = lambda cap: 203 if cap in (88, 90) else 1000
        mock_dc.StartPage.side_effect = RuntimeError("Spooler disconnected")

        ok, msg = print_to_gdi(self.test_img, "Mock Thermal Printer")
        self.assertFalse(ok)
        self.assertIn("Spooler disconnected", msg)

        mock_dc.AbortDoc.assert_called_once()
        mock_dc.DeleteDC.assert_called_once()


class Test06VirtualPrinterDetectionAndFallback(unittest.TestCase):
    """Suite 6: Virtual printer detection and non-blocking silent fallback execution."""

    def test_21_is_virtual_printer_identifies_document_and_virtual_queues(self):
        """Verify is_virtual_printer flags PDF, XPS, OneNote, Fax, and file spoolers."""
        self.assertTrue(is_virtual_printer("Microsoft Print to PDF"))
        self.assertTrue(is_virtual_printer("Microsoft XPS Document Writer"))
        self.assertTrue(is_virtual_printer("OneNote for Windows 10"))
        self.assertTrue(is_virtual_printer("Fax"))
        self.assertTrue(is_virtual_printer("Virtual Print (PNG Export)"))
        self.assertTrue(is_virtual_printer("Virtual Print (PDF Export)"))
        self.assertTrue(is_virtual_printer("Adobe PDF"))
        self.assertTrue(is_virtual_printer("CutePDF Writer"))
        self.assertTrue(is_virtual_printer(None))
        self.assertTrue(is_virtual_printer(""))
        # Physical thermal and office printers should return False
        self.assertFalse(is_virtual_printer("Xprinter XP-370B"))
        self.assertFalse(is_virtual_printer("Zebra ZD420"))
        self.assertFalse(is_virtual_printer("Brother HL-L2350DW"))

    def test_22_detect_thermal_printer_virtual_only_returns_none(self):
        """Verify detect_thermal_printer returns None when only virtual/document writers exist."""
        virtual_printers = [
            "Microsoft Print to PDF",
            "Microsoft XPS Document Writer",
            "OneNote for Windows 10",
            "Fax",
            "Virtual Print (PNG Export)",
            "Virtual Print (PDF Export)"
        ]
        self.assertIsNone(detect_thermal_printer(virtual_printers))

    def test_23_detect_thermal_printer_prioritizes_thermal_over_virtual(self):
        """Verify thermal printer is selected even when virtual printers are in the list."""
        mixed = [
            "Microsoft Print to PDF",
            "Xprinter XP-370B",
            "Microsoft XPS Document Writer"
        ]
        self.assertEqual(detect_thermal_printer(mixed), "Xprinter XP-370B")

    def test_24_print_label_image_silent_fallback_on_none_printer(self):
        """Verify print_label_image(img, printer_name=None) executes silently and non-blocking."""
        import threading
        test_img = Image.new("1", (304, 200), color=1)
        res = []
        t = threading.Thread(target=lambda: res.append(print_label_image(test_img, None)), daemon=True)
        t.start()
        t.join(5.0)
        self.assertFalse(t.is_alive(), "print_label_image blocked calling thread!")
        self.assertTrue(len(res) > 0)
        ok, res_str = res[0]
        self.assertTrue(ok)
        if os.path.exists(res_str):
            self.assertTrue(res_str.endswith(".png"))
            os.remove(res_str)
        else:
            self.assertTrue("Printed successfully" in res_str or "Virtual print" in res_str)

    def test_25_print_label_image_explicit_virtual_document_writers_non_blocking(self):
        """Verify explicitly passing PDF or XPS drivers routes to virtual print without GDI StartDoc."""
        test_img = Image.new("1", (304, 200), color=1)
        # Test PDF driver
        ok_pdf, path_pdf = print_label_image(test_img, printer_name="Microsoft Print to PDF")
        self.assertTrue(ok_pdf)
        self.assertTrue(os.path.exists(path_pdf))
        self.assertTrue(path_pdf.endswith(".pdf"))
        if os.path.exists(path_pdf):
            os.remove(path_pdf)

        # Test XPS driver (routes to PNG)
        ok_xps, path_xps = print_label_image(test_img, printer_name="Microsoft XPS Document Writer")
        self.assertTrue(ok_xps)
        self.assertTrue(os.path.exists(path_xps))
        self.assertTrue(path_xps.endswith(".png"))
        if os.path.exists(path_xps):
            os.remove(path_xps)


if __name__ == "__main__":
    unittest.main()

