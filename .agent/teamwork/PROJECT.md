# Project: Mobile Phone Sales & Repair Lab Thermal Label Application

## Architecture
A standalone Windows desktop application designed for mobile sales and repair workshops to extract real-time hardware telemetry from connected Android and iOS devices and produce 203 DPI thermal barcode labels with direct Windows GDI silent printing.

### High-Level Components
1. **Hardware Extraction Layer (`core/`)**:
   - `core/adb_reader.py`: Asynchronous ADB & Fastboot polling, deterministic storage/RAM calculators, IMEI/battery parsers.
   - `core/ios_reader.py`: libimobiledevice wrapper (`ideviceinfo`, `idevicediagnostics`), Apple ProductType resolver.
   - `core/mock_device.py`: Realistic Android/iOS telemetry simulator for offline/mock development.
   - `core/models.py`: Strongly typed dataclasses for DeviceSpecs and RepairTicket.
   - `core/paths.py`: Runtime path resolution supporting standard execution and PyInstaller `_MEIPASS` frozen bundles.
2. **Thermal Rendering & Printing Layer (`core/`)**:
   - `core/label_renderer.py`: PIL 1-bit monochrome canvas at 203 DPI (8 dots/mm), Compact Smart Merge algorithm, Code128 barcodes, QR codes, Arabic text reshaping (`arabic-reshaper` + `python-bidi`).
   - `core/printer_win32.py`: Direct Windows GDI silent printing via `win32print` & `win32ui` CreateDC with fallback virtual printing (PNG/PDF) and calibration test label.
3. **Persistence Layer (`core/`)**:
   - `core/database.py`: SQLite3 with WAL mode, auto-incrementing stock numbers and ticket IDs, search filtering, Excel (.xlsx) and CSV export.
4. **Desktop UI Layer (`ui/`)**:
   - PyQt6 implementation with Luxury Dark Theme (#121212, #1E1E1E, #D4AF37).
   - 5 responsive panels: Top Status Bar, Left Specs & Intake Tabs, Center WYSIWYG 203 DPI Live Preview, Right Printer/Paper/Template Manager, Bottom Local History Table.
   - QThread-based asynchronous polling worker with thread-safe `pyqtSignal` events and auto-print on connect idempotency guard.
5. **Distribution Layer**:
   - PyInstaller spec, `requirements.txt`, and `build_exe.bat` bundling `/bin` portable tools (`adb.exe`, `ideviceinfo.exe`, companion DLLs).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F01 | Luxury Dark Theme UI | Responsive 5-panel layout (#121212, #1E1E1E, #D4AF37) in PyQt6 with QScrollAreas | M4 | R1, Survey 1 |
| F02 | Status Bar & Connection Listener | Live ADB/Fastboot/iOS status pills, Auto-Print toggle, Mock selector | M4 | R1, Survey 1 |
| F03 | Device Specs Form Panel | 3uTools-style fields with auto/manual Stock #, Brand, Model, Storage, RAM, etc. | M4 | R1, Survey 1 |
| F04 | Service & Repair Intake Panel | Auto Ticket ID, Customer Name/Phone, Fault, Passcode, Checkboxes, Est. Cost | M4 | R1, Survey 1 |
| F05 | Live WYSIWYG Label Preview | Real-time 203 DPI preview updating dynamically on field keystrokes and toggles | M4 | R1, Survey 1 |
| F06 | Barcode & QR Code Engine | Crisp 1-bit Code128 barcodes (python-barcode) and compact 2D QR codes (qrcode) | M2 | R1, R3, Survey 3 |
| F07 | Compact Smart Merge | Dynamic merge of Model + Storage + Color + Battery % into 1-2 lines for small labels | M2 | R1, R3, Survey 3 |
| F08 | Printer & Preset Manager Panel | Printer selector (auto-detect Xprinter), presets (38x25 to 80x50mm), JSON templates | M4 | R1, Survey 1 |
| F09 | Local History & Log Table | Searchable table (Serial, IMEI, Model, Phone), 1-click reprint, Excel/CSV export | M3, M4 | R1, Survey 3 |
| F10 | Android Extraction Engine | 2s polling ADB/Fastboot, CREATE_NO_WINDOW, storage/RAM/IMEI/battery/bootloader parsers | M1 | R2, Survey 2 |
| F11 | OEM Model Code Resolver | Regex prefix resolver for Samsung SM-*, Xiaomi marketnames, Oppo/Realme codes | M1 | R2, Survey 2 |
| F12 | iOS Extraction Engine | 2s polling libimobiledevice, ideviceinfo/diagnostics, capacity, color, serial, battery % | M1 | R2, Survey 2 |
| F13 | Apple ProductType Mapping | JSON mapping from iPhone identifiers to marketing names up to iPhone 16 series | M1 | R2, Survey 2 |
| F14 | Simulation / Mock Device Engine | Full mock telemetry for Galaxy S24 Ultra, iPhone 16 Pro Max, Fastboot for offline use | M1 | R2, Survey 2 |
| F15 | 203 DPI Native 1-Bit Canvas | 8 dots/mm integer math (38x25mm -> 304x200px) in PIL mode '1', zero anti-alias blur | M2 | R3, Survey 3 |
| F16 | Arabic Reshaping & BiDi Layout | arabic-reshaper + python-bidi pipeline with Unicode LRE/PDF number preservation | M2 | R3, Survey 3 |
| F17 | Direct Windows Silent Printing | win32print/win32ui CreateDC DIB blit, zero dialogs, virtual PNG/PDF preview fallback | M2 | R3, Survey 3 |
| F18 | Alignment Calibration Generator | Dimensional border box and millimeter tick marks for sticker alignment checks | M2 | R3, Survey 3 |
| F19 | SQLite3 Persistence & Indexing | WAL mode logging of specs and tickets, auto-increments with override, multi-index | M3 | R4, Survey 3 |
| F20 | Standalone Packaging (.exe) | requirements.txt, build_exe.bat bundling /bin tools and companion DLLs via PyInstaller | M5 | R4, Survey 2, 3 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Hardware Extraction Engine | ADB/Fastboot & libimobiledevice readers, parsers, Apple models JSON, Mock Device Engine, `/bin` bundling | none | DONE |
| M2 | 203 DPI Printing & Label Engine | PIL 1-bit monochrome canvas, Compact Smart Merge, Arabic BiDi, Code128/QR, Windows GDI print & virtual fallback | M1 | DONE |
| M3 | Database & Persistence Engine | SQLite3 schema with WAL mode, auto-incrementing Stock/Ticket IDs, search queries, Excel/CSV export | M1, M2 | DONE |
| M4 | Desktop UI & WYSIWYG Application | PyQt6 5-panel luxury dark theme UI, async QThread polling, live WYSIWYG preview, auto-print triggers | M1, M2, M3 | DONE |
| M5 | Standalone Packaging & Build | requirements.txt verification, build_exe.bat, PyInstaller standalone executable bundling | M4 | DONE |
| M_FINAL | Full E2E Test Suite & Adversarial Hardening | Pass 100% of E2E tests (629/629 tests passing across Tiers 1-5) | M5, TEST_READY.md | DONE |

---

## Interface Contracts

### 1. Hardware Reader ↔ UI / Application
```python
# core/models.py
from dataclasses import dataclass, field
from typing import Optional, Dict, Any

@dataclass
class DeviceSpecs:
    connection_type: str  # "adb", "fastboot", "ios", "none", "mock"
    device_id: str        # Serial or UDID
    brand: str
    marketing_name: str
    model_code: str
    storage: str          # e.g. "128GB", "256GB"
    ram: str              # e.g. "8GB", "12GB"
    color: str
    os_version: str
    serial_number: str
    imei1: str
    imei2: Optional[str] = None
    battery_health: Optional[int] = None # Percentage 0-100
    battery_cycles: Optional[int] = None
    sales_region: Optional[str] = None   # e.g. "LL/A"
    bootloader_locked: Optional[bool] = None
    condition_grade: str = "A+"
    remarks: str = ""
    raw_properties: Dict[str, Any] = field(default_factory=dict)

@dataclass
class RepairTicket:
    ticket_id: str
    customer_name: str
    customer_phone: str
    device_model: str
    reported_fault: str
    passcode: str
    sim_removed: bool = True
    back_cracked: bool = False
    dead_device: bool = False
    estimated_cost: float = 0.0
    intake_datetime: str = ""
```

### 2. Label Renderer ↔ Printer Engine
```python
# core/label_renderer.py
from PIL import Image

def render_device_specs_label(
    specs: DeviceSpecs,
    width_mm: int = 38,
    height_mm: int = 25,
    compact_merge: bool = True,
    barcode_type: str = "code128", # "code128", "qr", "both"
    show_titles: bool = True,
    margin_mm: float = 1.0,
    stock_number: str = ""
) -> Image.Image:
    """Returns a native 1-bit monochrome PIL Image (mode '1') at 203 DPI (width_mm*8, height_mm*8)."""

def render_repair_ticket_label(
    ticket: RepairTicket,
    width_mm: int = 50,
    height_mm: int = 30,
    barcode_type: str = "code128",
    margin_mm: float = 1.0
) -> Image.Image:
    """Returns a native 1-bit monochrome PIL Image (mode '1') at 203 DPI."""

def render_calibration_label(width_mm: int = 38, height_mm: int = 25) -> Image.Image:
    """Generates an alignment test border with millimeter tick marks."""
```

### 3. Printing Engine ↔ Windows GDI
```python
# core/printer_win32.py
from typing import List, Tuple, Optional
from PIL import Image

def get_installed_printers() -> List[str]:
    """Returns list of Windows printer names."""

def print_label_image(
    image: Image.Image,
    printer_name: Optional[str] = None,
    job_name: str = "Thermal Label Print",
    virtual_fallback: bool = True
) -> Tuple[bool, str]:
    """Prints image silently to selected Windows printer via win32ui/win32print DIB blit.
    If printer_name is None, uses default printer or virtual PNG fallback.
    Returns (success, message_or_filepath)."""
```

### 4. Persistence ↔ Application
```python
# core/database.py
class DatabaseManager:
    def __init__(self, db_path: str = "data/app.db"): ...
    def get_next_stock_number(self) -> str: ...
    def get_next_ticket_id(self) -> str: ...
    def log_printed_label(self, specs: DeviceSpecs, stock_number: str, label_type: str) -> int: ...
    def log_repair_ticket(self, ticket: RepairTicket) -> int: ...
    def search_history(self, query: str) -> List[Dict[str, Any]]: ...
    def export_history_to_excel(self, file_path: str) -> bool: ...
    def export_history_to_csv(self, file_path: str) -> bool: ...
```

---

## Code Layout
```
c:\Users\Eng_Ahmed\Desktop\label\
├── main.py                   # Application entrypoint
├── requirements.txt          # Python dependencies
├── build_exe.bat             # Standalone PyInstaller build script
├── app.spec                  # PyInstaller spec file
├── bin/                      # Portable binaries bundled with application
│   ├── adb.exe
│   ├── fastboot.exe
│   ├── AdbWinApi.dll
│   ├── AdbWinUsbApi.dll
│   ├── idevice_id.exe
│   ├── ideviceinfo.exe
│   ├── idevicediagnostics.exe
│   └── *.dll (libimobiledevice companion DLLs)
├── core/
│   ├── __init__.py
│   ├── paths.py              # Dynamic path resolution (dev vs frozen bundle)
│   ├── models.py             # Data classes (DeviceSpecs, RepairTicket)
│   ├── adb_reader.py         # Android extraction engine
│   ├── ios_reader.py         # iOS extraction engine
│   ├── mock_device.py        # Hardware simulation engine
│   ├── label_renderer.py     # 203 DPI 1-bit PIL rendering & Arabic reshaper
│   ├── printer_win32.py      # Windows GDI silent printing
│   └── database.py           # SQLite3 persistence & export
├── data/
│   ├── apple_models.json     # ProductType to marketing name mappings
│   └── templates/            # Label preset JSON templates
├── ui/
│   ├── __init__.py
│   ├── styles.py             # Luxury Dark Theme QSS (#121212, #1E1E1E, #D4AF37)
│   ├── main_window.py        # Master 5-panel PyQt6 window
│   ├── status_bar.py         # Top status listener & auto-print toggle
│   ├── device_tab.py         # Left Panel Tab 1: 3uTools specs form
│   ├── intake_tab.py         # Left Panel Tab 2: Service repair intake form
│   ├── wysiwyg_preview.py    # Center Panel: Live 203 DPI canvas preview
│   ├── printer_panel.py      # Right Panel: Printer, paper size & templates
│   └── history_table.py      # Bottom Panel: History log & search
└── tests/
    ├── __init__.py
    ├── test_adb_reader.py
    ├── test_ios_reader.py
    ├── test_label_renderer.py
    ├── test_arabic_bidi.py
    ├── test_database.py
    └── e2e/
        ├── test_harness.py
        ├── test_tier1_features.py
        ├── test_tier2_boundaries.py
        ├── test_tier3_combinations.py
        └── test_tier4_scenarios.py
```
