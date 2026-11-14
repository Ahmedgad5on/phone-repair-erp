# Environment & Workspace Survey Report
**Project:** Mobile Phone Sales & Repair Lab Desktop Application (Thermal Lab Pro / ProLab SmartLabeler)  
**Date:** 2026-11-08  
**Author:** Teamwork Explorer (`explorer_survey_env`)  
**Target Specification:** `ORIGINAL_REQUEST.md`

---

## 1. Executive Summary

A comprehensive survey of the environment, existing workspace filesystem, Python runtime, system libraries, bundled binaries, Windows printer subsystem, and fonts was performed.

**Key Highlights:**
- **Bundled Binaries (`/bin`):** All 43 external binary files exist in `c:\Users\Eng_Ahmed\Desktop\label\bin`, including `adb.exe` (v37.0.1), `fastboot.exe` (v37.0.1), and complete `libimobiledevice` Windows binaries (`ideviceinfo.exe`, `idevicediagnostics.exe`, `idevice_id.exe`, `usbmuxd.exe`, etc.). All binaries were tested and execute without missing DLL errors.
- **Python Runtime:** Python 3.12.10 (64-bit AMD64) is active at `C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\python.exe`.
- **Python Packages:** All required dependencies (`PyQt6`, `Pillow`, `arabic-reshaper`, `python-bidi`, `python-barcode`, `qrcode`, `openpyxl`, `pywin32`, `pyinstaller`) are installed and functional.
- **Windows Subsystem & Fonts:** Windows 11 (build 10.0.26200-SP0). All essential fonts with Arabic support (`Arial`, `Segoe UI`, `Tahoma`, `Times New Roman`, `Calibri`) exist in `C:\WINDOWS\Fonts`.
- **Printer Subsystem:** Windows spooler is accessible via `win32print`. `Microsoft Print to PDF` is available as default printer. Virtual export fallback is fully operational.
- **Test Suite Status:** 441 unit tests and 200 E2E tests (641 total) currently pass.
- **Gaps Identified:** 
  1. `assets/` directory is missing (`generate_icon.py`, `app_icon.ico`, `logo_header.png`).
  2. `./data/adb_keys` portable key vault is not yet initialized or configured in environment variables (`ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, `ADB_VENDOR_KEYS`).
  3. UI Tab 3 Store Inventory Audit (`StoreInventoryAuditTab`) with barcode scanner input, real-time counters, beep, and Excel export is not implemented.
  4. 1-Click Visual Color Chips bar (8 quick color buttons) in Tab 1 (Device Specs) is not implemented.
  5. SQLite schema lacks `stock_status` ('In Stock', 'Sold', 'In Repair') and TAC-to-color persistence table.
  6. `build_exe.bat` and `app.spec` need updating to generate and bundle the icon assets.

---

## 2. Workspace Filesystem & Existing Assets

### 2.1 Project Directory Structure
Path: `c:\Users\Eng_Ahmed\Desktop\label`

| Directory / File | Type | Status | Description |
|---|---|---|---|
| `bin/` | Directory | **Present** (43 files) | Bundled ADB, Fastboot, and libimobiledevice binaries & DLLs |
| `core/` | Directory | **Present** (13 files) | Core domain logic (ADB/iOS reader, database, label renderer, printer, models) |
| `ui/` | Directory | **Present** (13 files) | PyQt6 UI panels (MainWindow, DeviceTab, IntakeTab, Preview, PrinterPanel) |
| `data/` | Directory | **Present** (6 files) | `app.db`, `apple_models.json`, `print_label_templates.json`, `settings.json`, `templates/` |
| `tests/` | Directory | **Present** (16 files) | Unit and E2E test suites |
| `dist/` | Directory | **Present** | Compiled PyInstaller folder (`dist/ThermalLabPro`) |
| `dist_installer/` | Directory | **Present** | Inno Setup compiled installer executables |
| `exports/labels/` | Directory | **Present** | Generated test PNG and PDF label outputs |
| `assets/` | Directory | **MISSING** | Must contain `generate_icon.py`, `app_icon.ico`, `logo_header.png` |
| `data/adb_keys/` | Directory | **MISSING** | Must hold persistent RSA keys for portable ADB vault |
| `main.py` | File | **Present** | Main application entry point (PyQt6) |
| `requirements.txt`| File | **Present** | Dependency manifest |
| `app.spec` | File | **Present** | PyInstaller build specification |
| `build_exe.bat` | File | **Present** | Standalone executable build script |
| `installer.iss` | File | **Present** | Inno Setup installer script |
| `install_drivers.bat` | File | **Present** | USB driver & service registration script |

### 2.2 Bundled `/bin` Binary Inventory
Inspected `c:\Users\Eng_Ahmed\Desktop\label\bin` (43 files total):

- **Android ADB & Fastboot:**
  - `adb.exe` (Size: 8,273,560 bytes) — Version: Android Debug Bridge 1.0.41 (v37.0.1)
  - `AdbWinApi.dll` (Size: 108,184 bytes)
  - `AdbWinUsbApi.dll` (Size: 73,368 bytes)
  - `fastboot.exe` (Size: 2,429,080 bytes) — Version: 37.0.1
- **Apple iOS (libimobiledevice suite):**
  - `idevice_id.exe` (Size: 13,824 bytes) — Device enumeration via USB (`-l`)
  - `ideviceinfo.exe` (Size: 19,456 bytes) — Telemetry and XML plist extraction
  - `idevicediagnostics.exe` (Size: 16,896 bytes) — AppleSmartBattery gas gauge & IORegistry query
  - `idevicename.exe` (Size: 13,824 bytes)
  - `idevicepair.exe` (Size: 20,480 bytes)
  - `idevicesyslog.exe` (Size: 24,064 bytes)
  - `ideviceenterrecovery.exe` (Size: 12,800 bytes)
  - `usbmuxd.exe` (Size: 70,144 bytes) & `usbmuxd.dll` (Size: 40,448 bytes)
  - Supporting libraries: `imobiledevice.dll`, `plist.dll`, `libcrypto-1_1-x64.dll`, `libcrypto-3-x64.dll`, `libssl-1_1-x64.dll`, `libssl-3-x64.dll`, `libusb-1.0.dll`, `libxml2.dll`, `zlib1.dll`, etc.

**Verification Result:** Direct command-line invocation of `adb.exe version`, `fastboot.exe --version`, `idevice_id.exe -h`, `ideviceinfo.exe -h`, and `idevicediagnostics.exe -h` all completed with exit code 0 and proper help output.

---

## 3. Python & Package Environment

### 3.1 Python Runtime
- **Version:** Python 3.12.10
- **Architecture:** 64-bit (`AMD64`)
- **Executable Location:** `C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\python.exe`
- **Pip Version:** 25.0.1

### 3.2 Required Package Verification Matrix

| Required Package | Required Min | Installed Version | Import Test | Status |
|---|---|---|---|---|
| `PyQt6` | `>=6.5.0` | **6.12.0** (Qt 6.12.0) | `import PyQt6.QtCore` | **PASS** |
| `Pillow` | `>=10.0.0` | **13.0.0** | `import PIL.Image` | **PASS** |
| `arabic-reshaper` | `>=3.0.0` | **3.1.0** | `import arabic_reshaper` | **PASS** |
| `python-bidi` | `>=0.4.2` | **0.6.12** | `import bidi` | **PASS** |
| `python-barcode` | `>=0.15.1` | **0.16.1** | `import barcode` | **PASS** |
| `qrcode` | `>=7.4.2` | **8.2** | `import qrcode` | **PASS** |
| `openpyxl` | `>=3.1.2` | **3.1.5** | `import openpyxl` | **PASS** |
| `pywin32` | `>=306` | **312** | `import win32print, win32ui, win32con` | **PASS** |
| `pyinstaller` | `>=6.0.0` | **6.22.3** | `import PyInstaller` | **PASS** |

**Pip Functionality:** Verified functional. Can install/upgrade packages if needed.

---

## 4. Windows System Environment

### 4.1 Operating System & Architecture
- **OS Platform:** Windows 11 (`Windows-11-10.0.26200-SP0`)
- **Kernel Build:** 10.0.26200
- **Processor Architecture:** AMD64 (64-bit)

### 4.2 System Fonts (Arabic & Latin Support)
Checked path: `C:\WINDOWS\Fonts`

| Font File | Font Family | Arabic Glyph Support | Status |
|---|---|---|---|
| `arial.ttf` / `arialbd.ttf` | Arial Regular / Bold | Full Arabic (Basic, Arabic Supplement, Presentation Forms) | **Present** |
| `segoeui.ttf` / `segoeuib.ttf` | Segoe UI Regular / Bold | Full Arabic UI glyphs | **Present** |
| `tahoma.ttf` / `tahomabd.ttf` | Tahoma Regular / Bold | Full Arabic (Clear bitmap & TTF hinting) | **Present** |
| `calibri.ttf` | Calibri Regular | Full Arabic glyphs | **Present** |
| `times.ttf` | Times New Roman Regular | Full Arabic glyphs | **Present** |

*Conclusion on Typography:* System font availability is optimal. No external font download is required. Segoe UI and Arial provide robust 203 DPI rasterization for right-to-left Arabic text.

### 4.3 Printer Subsystem
- **Enumeration:** `win32print.EnumPrinters(PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS)` successfully queries the Windows Spooler.
- **Default Printer:** `Microsoft Print to PDF`
- **Thermal Printer Presence:** No physical thermal printer is currently attached to USB, but `core/printer_win32.py` includes automatic detection and graceful fallback to Virtual PNG/PDF export.

---

## 5. Existing Test Suite Execution

We executed the existing automated test suites using `python -m unittest`:

1. **Unit Tests (`tests/test_*.py`):**
   - Command: `python -m unittest discover -s tests -p "test_*.py"`
   - Output: **Ran 441 tests in 8.138s — OK**
   - Notes: Includes 100 concurrent print job stress tests (308.2 jobs/sec). Minor Pillow 14 deprecation warning (`Image.Image.getdata` in `tests/test_adversarial_m2.py`).
2. **E2E Tests (`tests/e2e/test_*.py`):**
   - Command: `python -m unittest discover -s tests/e2e -p "test_*.py"`
   - Output: **Ran 200 tests in 0.621s — OK**
   - Notes: Validated Tier 1 features, Tier 2 boundaries, and test harness.

Total passing tests: **641 passed, 0 failed**.

---

## 6. Detailed Requirements & Gap Analysis

Based on `ORIGINAL_REQUEST.md`, here are the specific gaps requiring development:

### 6.1 R1. Visual Identity, Custom Logo & Desktop Icon Engine
- [ ] Create `assets/generate_icon.py` to programmatically render a luxury vector emblem on a Matte Black (`#121212`) and Metallic Gold (`#D4AF37`) rounded shield with smartphone silhouette, barcode lines, and diagnostic pulse.
- [ ] Generate `assets/app_icon.ico` (multi-res: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256 px).
- [ ] Generate `assets/logo_header.png` (128x128 px) for top header and splash screen.
- [ ] Update `main.py` to set `ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ProLab.SmartLabeler.App.1.0")` (currently sets `"thermallab.mobileprinter.pro.1"`).
- [ ] Apply `app_icon.ico` to `MainWindow` and dialogs.
- [ ] Add "Create Desktop Shortcut" feature (via Python `pylnk3` or `winshell`/`win32com.client`).

### 6.2 R2. Main UI Layout, Navigation & Inventory Audit
- [ ] **Tab 1 (Device Specs):** Add 1-Click Visual Color Chips Bar with 8 quick color buttons (Black, White, Gold, Silver, Blue, Green, Purple, Titanium) below the Color field for instant 0.2s manual override and automatic TAC-to-Color learning in SQLite.
- [ ] **Tab 2 (Repair Intake):** Already implemented (`ui/intake_tab.py`); verify Arabic/English labels and security checkboxes.
- [ ] **Tab 3 (Store Inventory Audit):** Currently missing. Implement `StoreInventoryAuditTab` with:
  - High-speed barcode scanner text input (auto-focused).
  - SQLite query for items marked "In Stock".
  - Barcode scan moving matched items from "Pending / Missing" to "Verified Present" with an audio beep (Windows `winsound.MessageBeep`).
  - Real-time counters: Total Expected, Scanned, Missing, Unknown Serials.
  - "Export Audit Report to Excel (.xlsx)" button using `openpyxl`.

### 6.3 R3. Zero-Click Hardware Extraction Engine
- [ ] Create `./data/adb_keys` directory and update `core/paths.py` + `core/adb_reader.py` to configure `ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, and `ADB_VENDOR_KEYS` before starting `adb.exe`.
- [ ] Ensure persistence of `adbkey` and `adbkey.pub` across restarts and relocations.
- [ ] Android IMEI extraction: Multi-layer IMEI with 15-digit Luhn validation (Layer 1 parcel bypass, Layer 2 props, Layer 3 fastboot fallback).
- [ ] Multi-OEM Color resolver: Xiaomi, Oppo/Realme/OnePlus, Pixel, Huawei/Honor, Samsung Product Code decoder (`ril.product_code`), SQLite TAC memory fallback.
- [ ] iOS extraction: Verify `idevicediagnostics ioregentry AppleSmartBattery` parsing for exact battery health %.

### 6.4 R4. High-Precision Thermal Printing Engine (203 DPI)
- [x] 203 DPI Pillow rendering engine is implemented.
- [x] Arabic text reshaping with `arabic-reshaper` and `python-bidi` is implemented.
- [x] Code128 and QR code generation are implemented.
- [x] Windows GDI silent printing via `win32print`/`win32ui` is implemented.
- [ ] Ensure "Compact Smart Merge" toggle cleanly handles 38x25 mm and 40x25 mm stickers without clipping.

### 6.5 R5. Database, History & Standalone .exe Packaging
- [ ] Add `stock_status` column (`'In Stock'`, `'Sold'`, `'In Repair'`) to `printed_labels` in `core/database.py`.
- [ ] Add `tac_colors` table in `core/database.py` for TAC prefix (first 8 digits of IMEI) + model to color mapping.
- [ ] Update `build_exe.bat` to execute `python assets/generate_icon.py` before PyInstaller compilation.
- [ ] Update `app.spec` to bundle `assets` and configure `icon='assets/app_icon.ico'`.

---

## 7. Recommended Next Steps for Team

1. **Step 1:** Implement `assets/generate_icon.py` and run it to produce `app_icon.ico` and `logo_header.png`.
2. **Step 2:** Update `core/paths.py` and `core/adb_reader.py` for portable `./data/adb_keys` environment configuration.
3. **Step 3:** Extend `core/database.py` with `stock_status` and `tac_colors` table and query helpers.
4. **Step 4:** Enhance `ui/device_tab.py` with the 8-color visual chips bar and TAC learning.
5. **Step 5:** Build `ui/audit_tab.py` (`StoreInventoryAuditTab`) and integrate it as Tab 3 in `ui/main_window.py`.
6. **Step 6:** Update `build_exe.bat` and `app.spec` to bundle the new assets and build the final executable.
