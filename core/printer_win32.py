"""
core/printer_win32.py — Direct Windows GDI Silent Printing Engine & Virtual Fallback
Conforming to PROJECT.md Interface Contract #3.

Features:
- Headless Windows GDI silent printing via win32ui.CreateDC() and PIL.ImageWin.Dib.
- Zero print dialog popups, zero external viewers.
- Multi-tier printer discovery prioritizing thermal label printers (Xprinter XP-370B, Zebra, TSC).
- Device capabilities inspection (HORZRES, VERTRES, LOGPIXELSX, LOGPIXELSY) with coordinate scaling.
- Robust error recovery: AbortDoc() on failures and guaranteed DeleteDC() in finally block.
- Virtual Print Fallback saving exact 203 DPI 1-bit monochrome PNG or PDF to exports/labels/.
"""
from datetime import datetime
import logging
import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Tuple, Union
import uuid

import builtins
builtins.core_printer = sys.modules[__name__]

from PIL import Image

from core.paths import get_exports_dir, is_frozen

logger = logging.getLogger(__name__)

# PyWin32 imports with graceful fallback
try:
    import win32con
    import win32print
    import win32ui
    from PIL import ImageWin
    WIN32_AVAILABLE = True
except ImportError:
    win32con = None
    win32print = None
    win32ui = None
    ImageWin = None
    WIN32_AVAILABLE = False


# Known keywords for auto-prioritizing thermal label printers
THERMAL_KEYWORDS: Tuple[str, ...] = (
    "xprinter", "xp-370", "xp-", "thermal", "pos", "barcode",
    "label", "zebra", "tsc", "gprinter", "rongta", "citizen",
    "bixolon", "godex", "dymo", "rollo", "munbyn"
)

# Keywords identifying virtual, document, or file-port spooler drivers that prompt for save paths
VIRTUAL_PRINTER_KEYWORDS: Tuple[str, ...] = (
    "pdf",
    "xps",
    "oxps",
    "onenote",
    "fax",
    "virtual",
    "document writer",
    "writer",
    "portprompt",
    "file:",
    "root print queue",
    "send to",
)

# GDI Capability indices
_HORZRES = 8       # Printable width in device pixels
_VERTRES = 10      # Printable height in device pixels
_LOGPIXELSX = 88   # Horizontal DPI
_LOGPIXELSY = 90   # Vertical DPI


def is_virtual_printer(printer_name: Optional[str]) -> bool:
    """
    Determines whether a printer name corresponds to a virtual, document,
    or file-spooler driver (e.g. PDF, XPS, OneNote, Fax, Virtual Export)
    that would spawn interactive file dialogs or fail direct GDI blitting.
    """
    if not printer_name:
        return True
    p_lower = printer_name.lower().strip()
    return any(kw in p_lower for kw in VIRTUAL_PRINTER_KEYWORDS)


def get_installed_printers() -> List[str]:
    """
    Returns list of installed Windows printer names, ranked with thermal label printers first.
    If pywin32 is unavailable or no physical printers exist, returns virtual print fallback options.
    """
    if not WIN32_AVAILABLE:
        return ["Virtual Print (PNG Export)", "Virtual Print (PDF Export)"]

    discovered: List[str] = []
    try:
        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        enum_records = win32print.EnumPrinters(flags, None, 2)
        for record in enum_records:
            if isinstance(record, dict):
                name = record.get("pPrinterName")
            elif isinstance(record, (list, tuple)) and len(record) > 2:
                name = record[2]
            else:
                name = str(record)
            if name and name not in discovered:
                discovered.append(name)

        if not discovered:
            try:
                def_p = win32print.GetDefaultPrinter()
                if def_p and def_p not in discovered:
                    discovered.append(def_p)
            except Exception:
                pass

    except Exception as exc:
        logger.warning("Error enumerating Windows printers: %s", exc)

    if not discovered:
        return ["Virtual Print (PNG Export)", "Virtual Print (PDF Export)"]

    # Rank thermal printers first
    thermal_matches = [p for p in discovered if any(kw in p.lower() for kw in THERMAL_KEYWORDS)]
    other_printers = [p for p in discovered if p not in thermal_matches]
    return thermal_matches + other_printers


def detect_thermal_printer(printers: Optional[List[str]] = None) -> Optional[str]:
    """
    Detects and auto-selects a genuine physical thermal printer:
    1. Filters out virtual, document, and file-port drivers (PDF, XPS, OneNote, Fax, Virtual).
    2. If the default Windows printer is a genuine thermal printer, select it.
    3. Otherwise, return the first installed physical printer matching thermal keywords (Xprinter, Zebra, TSC, etc.).
    4. If no genuine thermal printer is found, return None (allowing silent virtual fallback).
    """
    installed = printers if printers is not None else get_installed_printers()
    if not installed:
        return None

    # Filter out virtual, document, and file-port drivers
    physical_candidates = [p for p in installed if not is_virtual_printer(p)]
    if not physical_candidates:
        return None

    # Check if default Windows printer is a physical thermal printer
    if WIN32_AVAILABLE:
        try:
            default_p = win32print.GetDefaultPrinter()
            if default_p and default_p in physical_candidates:
                if any(kw in default_p.lower() for kw in THERMAL_KEYWORDS):
                    return default_p
        except Exception:
            pass

    # Find first physical candidate matching thermal keywords
    for p in physical_candidates:
        p_lower = p.lower()
        if any(kw in p_lower for kw in THERMAL_KEYWORDS):
            return p

    # No genuine thermal printer attached/installed
    return None


def get_printer_capabilities(printer_name: str) -> Dict[str, Any]:
    """
    Queries driver capabilities (printable resolution and DPI) for a given printer.
    """
    caps: Dict[str, Any] = {
        "printer_name": printer_name,
        "dpi_x": 203,
        "dpi_y": 203,
        "printable_width": 0,
        "printable_height": 0,
        "is_thermal": any(kw in printer_name.lower() for kw in THERMAL_KEYWORDS) if printer_name else False,
    }

    if not WIN32_AVAILABLE or not printer_name or is_virtual_printer(printer_name):
        return caps

    hDC = None
    try:
        hDC = win32ui.CreateDC()
        hDC.CreatePrinterDC(printer_name)
        caps["printable_width"] = hDC.GetDeviceCaps(_HORZRES)
        caps["printable_height"] = hDC.GetDeviceCaps(_VERTRES)
        dpi_x = hDC.GetDeviceCaps(_LOGPIXELSX)
        dpi_y = hDC.GetDeviceCaps(_LOGPIXELSY)
        if dpi_x > 0:
            caps["dpi_x"] = dpi_x
        if dpi_y > 0:
            caps["dpi_y"] = dpi_y
    except Exception as exc:
        logger.debug("Failed querying capabilities for %s: %s", printer_name, exc)
    finally:
        if hDC:
            try:
                hDC.DeleteDC()
            except Exception:
                pass

    return caps


def save_virtual_print(
    image: Image.Image,
    format_type: str = "PNG",
    output_dir: Optional[str] = None,
    file_prefix: str = "label"
) -> Tuple[bool, str]:
    """
    Saves the exact 203 DPI label image to disk (PNG or PDF).
    
    Returns:
        (True, file_path) on success, (False, error_message) on failure.
    """
    try:
        if image is None:
            raise ValueError("Image cannot be None")

        out_dir = Path(output_dir) if output_dir else get_exports_dir()
        out_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        rand_id = uuid.uuid4().hex[:6]

        if format_type.upper() == "PDF":
            filename = f"{file_prefix}_{timestamp}_{rand_id}.pdf"
            file_path = out_dir / filename
            # Save 203.2 DPI PDF
            rgb_img = image.convert("RGB") if image.mode != "RGB" else image
            rgb_img.save(str(file_path), format="PDF", resolution=203.2)
        else:
            filename = f"{file_prefix}_{timestamp}_{rand_id}.png"
            file_path = out_dir / filename
            # Save native 1-bit monochrome PNG with 203 DPI metadata
            image.save(str(file_path), format="PNG", dpi=(203, 203))

        resolved_path = str(file_path.resolve())
        logger.info("Virtual print saved: %s", resolved_path)
        return True, resolved_path

    except Exception as exc:
        err = f"Virtual print export failed: {exc}"
        logger.error(err)
        return False, err


def configure_printer_devmode(
    printer_name: str,
    width_mm: float,
    length_mm: float,
    orientation: str = "portrait"
) -> Tuple[bool, str]:
    """
    Dynamically configures Windows DEVMODE on the target thermal printer queue
    so the Windows spooler enforces the exact physical label dimensions and prevents
    feeding multiple labels or blank pages.
    """
    if not WIN32_AVAILABLE or not printer_name or is_virtual_printer(printer_name):
        return False, "Not a physical Windows printer"

    try:
        try:
            h = win32print.OpenPrinter(printer_name, {"DesiredAccess": win32print.PRINTER_ALL_ACCESS})
        except Exception:
            h = win32print.OpenPrinter(printer_name)

        pinfo = win32print.GetPrinter(h, 2)
        dm = pinfo.get("pDevMode")
        if dm is None:
            win32print.ClosePrinter(h)
            return False, "No DevMode available"

        dm.PaperSize = 256  # Custom / User Defined
        dm.PaperWidth = int(round(width_mm * 10))
        dm.PaperLength = int(round(length_mm * 10))
        dm.Orientation = win32con.DMORIENT_PORTRAIT if orientation == "portrait" else win32con.DMORIENT_LANDSCAPE
        dm.Fields |= win32con.DM_PAPERSIZE | win32con.DM_PAPERWIDTH | win32con.DM_PAPERLENGTH | win32con.DM_ORIENTATION

        pinfo["pDevMode"] = dm
        try:
            win32print.SetPrinter(h, 2, pinfo, 0)
            win32print.ClosePrinter(h)
            logger.info("Configured DevMode for %s: %s x %s mm", printer_name, width_mm, length_mm)
            return True, f"DevMode set to {width_mm:.1f}x{length_mm:.1f}mm"
        except Exception as e:
            win32print.ClosePrinter(h)
            return False, f"SetPrinter error: {e}"
    except Exception as exc:
        return False, f"Configure devmode exception: {exc}"


def calibrate_thermal_gap(
    printer_name: str,
    width_mm: float = 40.0,
    length_mm: float = 30.0,
    gap_mm: float = 2.0
) -> Tuple[bool, str]:
    """
    Sends raw TSPL gap calibration commands directly to the thermal printer spooler.
    Instructs the printer hardware gap sensor to measure the label pitch and align
    accurately to the tear bar.
    """
    if not WIN32_AVAILABLE or not printer_name or is_virtual_printer(printer_name):
        return False, "Not a physical Windows printer"

    try:
        # TSPL Gap Calibration & Auto-feed Sequence
        tspl_cmd = (
            f"SIZE {width_mm:.1f} mm,{length_mm:.1f} mm\r\n"
            f"GAP {gap_mm:.1f} mm,0 mm\r\n"
            f"DIRECTION 1\r\n"
            f"OFFSET 0 mm\r\n"
            f"SET PEEL OFF\r\n"
            f"SET CUTTER OFF\r\n"
            f"GAPDETECT\r\n"
            f"AUTODETECT\r\n"
            f"FORMFEED\r\n"
        ).encode("ascii")

        h = win32print.OpenPrinter(printer_name)
        job_id = win32print.StartDocPrinter(h, 1, ("GapCalibration", None, "RAW"))
        win32print.StartPagePrinter(h)
        win32print.WritePrinter(h, tspl_cmd)
        win32print.EndPagePrinter(h)
        win32print.EndDocPrinter(h)
        win32print.ClosePrinter(h)
        logger.info("Sent TSPL gap calibration to %s (job %s)", printer_name, job_id)
        return True, f"تمت معايرة الحساس وتوجيه الطابعة لليبل بدقة على '{printer_name}'"
    except Exception as exc:
        err = f"Failed sending gap calibration to '{printer_name}': {exc}"
        logger.error(err)
        return False, err


def print_to_gdi(
    image: Image.Image,
    printer_name: str,
    job_name: str = "Thermal Label Print",
    paper_width_mm: Optional[float] = None,
    paper_length_mm: Optional[float] = None,
    orientation: str = "portrait"
) -> Tuple[bool, str]:
    """
    Directly blits the PIL Image to the Windows GDI printer Device Context.
    Executes silently without opening any dialogs or external viewer processes.
    Enforces exact physical label dimensions in DEVMODE to prevent extra page feeds.
    
    Returns:
        (True, message) on success, (False, error_message) on failure.
    """
    if not WIN32_AVAILABLE:
        return False, "pywin32 (win32print/win32ui) is not installed."

    if image is None:
        raise ValueError("Image cannot be None")

    # Automatically enforce exact paper dimensions in Windows DEVMODE before creating DC
    if not is_virtual_printer(printer_name):
        w_mm = paper_width_mm or (image.width * 25.4 / 203.2)
        l_mm = paper_length_mm or (image.height * 25.4 / 203.2)
        configure_printer_devmode(printer_name, w_mm, l_mm, orientation=orientation)

    hDC = None
    doc_started = False
    try:
        hDC = win32ui.CreateDC()
        hDC.CreatePrinterDC(printer_name)

        # Query driver DPI for scaling check
        dpi_x = hDC.GetDeviceCaps(_LOGPIXELSX)
        dpi_y = hDC.GetDeviceCaps(_LOGPIXELSY)

        # Calculate coordinate scaling if driver is non-203 DPI (e.g. 300 DPI)
        scale_x = (dpi_x / 203.2) if dpi_x and dpi_x > 0 else 1.0
        scale_y = (dpi_y / 203.2) if dpi_y and dpi_y > 0 else 1.0

        dst_w = int(round(image.width * scale_x))
        dst_h = int(round(image.height * scale_y))

        # Begin print job
        hDC.StartDoc(job_name)
        doc_started = True
        hDC.StartPage()

        # ImageWin.Dib requires RGB mode for reliable blit
        rgb_img = image.convert("RGB") if image.mode != "RGB" else image
        dib = ImageWin.Dib(rgb_img)

        # Direct BitBlt / StretchDIBits to DC handle
        hdc_handle = hDC.GetHandleOutput()
        dib.draw(hdc_handle, (0, 0, dst_w, dst_h))

        # Finish print job
        hDC.EndPage()
        hDC.EndDoc()
        doc_started = False

        return True, f"Printed successfully to '{printer_name}'"

    except Exception as exc:
        err_msg = f"GDI Print error on '{printer_name}': {exc}"
        logger.error(err_msg)
        if hDC and doc_started:
            try:
                hDC.AbortDoc()
            except Exception:
                pass
        return False, err_msg
    finally:
        if hDC:
            try:
                hDC.DeleteDC()
            except Exception:
                pass


def print_label_image(
    image: Image.Image,
    printer_name: Optional[str] = None,
    job_name: str = "Thermal Label Print",
    virtual_fallback: bool = True,
    paper_width_mm: Optional[float] = None,
    paper_length_mm: Optional[float] = None,
    orientation: str = "portrait"
) -> Tuple[bool, str]:
    """
    Main entry point conforming strictly to PROJECT.md Interface Contract #3:
    - If printer_name is None, auto-detects thermal printer; if none found, falls back
      silently to virtual PNG export without calling GDI StartDoc().
    - If printer_name indicates a virtual/document/file-port printer (PDF, XPS, OneNote, Fax, Virtual),
      immediately invokes save_virtual_print() without calling GDI StartDoc().
    - If physical printer unavailable or GDI fails and virtual_fallback=True,
      automatically saves 203 DPI PNG to exports/labels/ without modal dialogs or error.
       
    Returns:
        (success: bool, message_or_filepath: str)
    """
    if image is None:
        raise ValueError("Image cannot be None")
    if hasattr(image, "size") and (image.size[0] == 0 or image.size[1] == 0):
        raise ValueError("Image dimensions cannot be zero")

    installed = get_installed_printers()

    # 1. Explicit Virtual Print or virtual/document/file-spooler driver request
    if printer_name is not None and str(printer_name).strip():
        name_str = str(printer_name).strip()
        if is_virtual_printer(name_str):
            if "pdf" in name_str.lower() and "png" not in name_str.lower():
                return save_virtual_print(image, format_type="PDF")
            return save_virtual_print(image, format_type="PNG")

        # Physical printer explicitly requested: verify it is installed
        if name_str not in installed:
            if not virtual_fallback:
                return False, f"Printer '{name_str}' not found"
            ok, file_path = save_virtual_print(image, format_type="PNG")
            return True, f"Printer '{name_str}' not found. Saved virtual print to: {file_path}"
        target_printer = name_str
    else:
        # Auto-detect thermal printer
        target_printer = detect_thermal_printer(installed)
        if not target_printer or is_virtual_printer(target_printer) or not WIN32_AVAILABLE:
            if virtual_fallback:
                return save_virtual_print(image, format_type="PNG")
            return False, f"No physical thermal printer available for '{target_printer or 'None'}' and virtual fallback disabled."

    # 2. Attempt GDI silent print to genuine physical printer
    success, message = print_to_gdi(
        image,
        target_printer,
        job_name=job_name,
        paper_width_mm=paper_width_mm,
        paper_length_mm=paper_length_mm,
        orientation=orientation
    )

    # 5. Fallback on hardware/driver error
    if not success and virtual_fallback:
        fallback_ok, file_path = save_virtual_print(image, format_type="PNG")
        if fallback_ok:
            return True, f"Printer '{target_printer}' error ({message}). Saved virtual print to: {file_path}"
        return False, f"Printer error ({message}) and virtual fallback failed: {file_path}"

    return success, message

