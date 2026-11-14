# Project: Mobile Phone Sales & Repair Lab Smart Labeler (Standalone Windows Desktop App)

## Architecture
- **Application Core**: Python 3.12 64-bit on Windows 11.
- **GUI Framework**: PyQt6 with luxury dark styling (`#121212` Matte Black, `#1E1E1E` Charcoal cards, `#D4AF37` Metallic Gold accents).
- **Hardware Telemetry Engine**:
  - Persistent background QThread listeners for USB events (WMI `Win32_PnPEntity`, `adb track-devices`, `idevice_id -l`).
  - Bundled portable `/bin` binaries (`adb.exe`, `fastboot.exe`, `ideviceinfo.exe`, `idevicediagnostics.exe`).
  - Portable ADB Key Vault in `./data/adb_keys` with `ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, `ADB_VENDOR_KEYS`.
  - Multi-layer Android extraction: Layer 1 `service call iphonesubinfo` parcel bypass with 15-digit Luhn validation, Layer 2 OEM props, Layer 3 fastboot fallback; Multi-OEM color resolver & Samsung product code decoder; Commercial storage & RAM tiers; Battery metrics.
  - iOS extraction: `ideviceinfo` and `idevicediagnostics ioregentry AppleSmartBattery`, ProductType dictionary up to iPhone 16 series, battery health % derivation.
- **203 DPI Thermal Printing Engine**:
  - Exact 8.0 dots/mm pixel geometry via Pillow monochrome canvas (e.g. 38x25 mm = 304x200 px).
  - Two-stage Arabic CTL text pipeline (`arabic-reshaper` + `python-bidi`) with LRE/PDF protection.
  - Native Code128 1D barcode and QR code rendering.
  - Compact Smart Merge layout for small stickers.
  - Windows GDI silent direct printing to printer DC via `win32print`/`win32ui`.
- **Database & Inventory**:
  - Local SQLite database in WAL mode with relational tables: `inventory`, `repair_tickets`, `tac_color_map`, `print_history`, `audit_sessions`, `audit_items`.
  - High-speed barcode store inventory audit with live counters, audio feedback, and Excel (`.xlsx`) export.
- **Packaging & Visual Identity**:
  - Programmatic vector asset generator `assets/generate_icon.py` producing multi-resolution `assets/app_icon.ico` (6 layers) and `assets/logo_header.png`.
  - Windows taskbar `AppUserModelID` (`ProLab.SmartLabeler.App.1.0`) and desktop shortcut integration.
  - PyInstaller standalone `.exe` build with bundled `/bin` and assets.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Vector Logo & Icon Generator | Programmatically generate luxury shield emblem, SSAA 1024x1024 to multi-res `app_icon.ico` (16 to 256px) and `logo_header.png` (128x128px) | M1 | R1 |
| 2 | Windows AppUserModelID & Taskbar Icon | Register `ProLab.SmartLabeler.App.1.0` and set window icons across all UI dialogs | M1 | R1 |
| 3 | Desktop Shortcut Creator | Programmatic creation of Windows desktop shortcut with custom gold/black icon | M1 | R1 |
| 4 | Portable ADB Key Vault | `./data/adb_keys` directory with environment variables `ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, `ADB_VENDOR_KEYS` and persistent RSA key pair | M2 | R3 |
| 5 | Multi-Layer Android IMEI Extraction | Parcel bypass (`iphonesubinfo 1` & `3/4`) + UTF-16 hex decoder + 15-digit Luhn validation; OEM prop fallback; Fastboot getvar fallback | M2 | R3 |
| 6 | Multi-OEM Color Resolver & Samsung Decoder | Color extraction for Xiaomi, Oppo/Realme, Pixel, Huawei, Samsung `ril.product_code` 3-letter decoding, and TAC learning | M2 | R3 |
| 7 | Android Hardware Specs & Battery | Storage tier mapping (32GB–1TB), RAM parsing, serial number, and battery level/cycles | M2 | R3 |
| 8 | iOS Telemetry & Battery Health | `ideviceinfo` mapping up to iPhone 16 series, `idevicediagnostics` battery health % calculation, sales region | M2 | R3 |
| 9 | Zero-Click Background USB Listener | Persistent QThread monitoring without UI freezing, debouncing, auto-query on connect | M2 | R3 |
| 10 | SQLite Relational Schema & Migration | Relational tables: `inventory`, `repair_tickets`, `tac_color_map`, `print_history`, `audit_sessions`, `audit_items` with indexes and WAL mode | M3 | R5 |
| 11 | TAC-to-Color Learning Engine | Save manual color overrides linked to first 8 IMEI digits + Model, auto-recall on future scans | M3 | R2/R5 |
| 12 | Store Inventory Audit Engine | SQLite in-stock fetch, barcode verification, session state tracking, missing/present sorting | M3 | R2 |
| 13 | Audit Report Excel Export | Generate rich Excel `.xlsx` audit reports using `openpyxl` with KPI summaries and scan timestamps | M3 | R2 |
| 14 | 1-Click Visual Color Chips Bar | 8 quick color buttons (Black, White, Gold, Silver, Blue, Green, Purple, Titanium) for instant 0.2s manual override in Tab 1 | M4 | R2 |
| 15 | Tab 3 Store Inventory Audit UI | Dedicated high-speed barcode input (auto-focused), audio beep on scan, live KPI counters, export button | M4 | R2 |
| 16 | Luxury Dark Mode UI & Brand Header | Top header with logo, title, USB status pills, auto-print switch; luxury dark palette styling | M4 | R2 |
| 17 | 203 DPI Thermal Label Canvas & Arabic CTL | 8 dots/mm metric rendering, Arabic reshaping + BiDi with LRE/PDF protection, Code128 / QR codes | M4 | R4 |
| 18 | Compact Smart Merge Layout | Formats `Model - Storage - Color - Battery%` with dynamic wrapping and barcode for 38x25 and 40x25 mm stickers | M4 | R2/R4 |
| 19 | Direct Windows GDI Silent Printing | `win32print`/`win32ui` direct bitmap transfer to printer DC without dialogs | M4 | R4 |
| 20 | Standalone PyInstaller Packaging | `build_exe.bat` automation: icon generation -> PyInstaller bundling `/bin` & `assets` -> writable `./data` | M5 | R5 |
| 21 | Full E2E & Tier 5 Adversarial Verification | 100% pass across Tiers 1-4 opaque-box tests and Tier 5 white-box adversarial coverage hardening | M6 | Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Visual Identity & Asset Generation | `assets/generate_icon.py`, `app_icon.ico`, `logo_header.png`, AppUserModelID, Desktop shortcut helper | None | DONE |
| M2 | Hardware Extraction & Portable ADB Vault | Portable ADB vault (`./data/adb_keys`), multi-layer IMEI Luhn validation, Samsung product code decoding, iOS iPhone 16 mapping | None | IN_PROGRESS |
| M3 | Database Schema, TAC Learning & Audit Engine | SQLite schema expansion (`inventory`, `tac_color_map`, `audit_sessions`, `audit_items`), TAC learning API, audit verification logic, Excel export | None | PLANNED |
| M4 | UI Integration, Color Chips Bar & Tab 3 Audit | Tab 1 Color Chips bar, Tab 3 Store Inventory Audit UI with audio beep, Brand Header with custom logo, Compact Smart Merge preview | M1, M2, M3 | PLANNED |
| M5 | Packaging Automation & Standalone Executable | `build_exe.bat`, `app.spec`, PyInstaller bundling verification, distribution validation | M1, M4 | PLANNED |
| M6 | Final Verification & Adversarial Hardening | Phase 1: 100% E2E test pass; Phase 2: Tier 5 adversarial coverage hardening & audit | M1-M5, E2E Track | PLANNED |

## Interface Contracts
### `assets.generate_icon` ↔ UI / Packaging
- `generate_assets(output_dir="assets") -> Tuple[str, str]`: Generates and verifies `app_icon.ico` (multi-layer 16, 32, 48, 64, 128, 256 px) and `logo_header.png` (128x128 px).
- `create_desktop_shortcut(target_exe=None, icon_path=None) -> bool`: Creates Windows Desktop shortcut pointing to the application executable with custom icon.

### `core.paths` & `core.adb_reader` ↔ ADB Vault
- `get_adb_keys_dir() -> Path`: Resolves `./data/adb_keys` relative to application root (frozen exe or development).
- `setup_adb_environment() -> Dict[str, str]`: Sets `ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, and `ADB_VENDOR_KEYS` to the adb keys directory.

### `core.database` ↔ UI & Audit
- `get_inventory(status=None) -> List[Dict]`: Retrieves inventory items.
- `update_inventory_status(stock_number, status) -> bool`: Updates stock lifecycle (`In Stock`, `Sold`, `In Repair`).
- `learn_tac_color(tac: str, model: str, color: str) -> None`: Stores learned color mapping.
- `lookup_tac_color(tac: str, model: str) -> Optional[str]`: Retrieves learned color.
- `create_audit_session(notes=None) -> int`: Initializes an inventory audit session.
- `record_audit_scan(session_id: int, barcode: str) -> Dict`: Verifies scanned barcode against in-stock inventory, returns scan result (`matched`, `unknown`, `already_scanned`).
- `get_audit_summary(session_id: int) -> Dict`: Returns counts (`expected`, `scanned`, `missing`, `unknown`).
- `export_audit_excel(session_id: int, file_path: str) -> str`: Generates styled Excel report.

### `ui.main_window` ↔ Tab 3 & Color Chips
- Tab 1 `DeviceTab`: Signals color change and triggers TAC learning when user clicks any of the 8 color chips.
- Tab 3 `StoreInventoryAuditTab`: High-speed scanner text input, plays audio feedback (`winsound.Beep(2000, 150)` for success, `(800, 250)` for error), updates live KPI counters, triggers Excel export.

## Code Layout
- `assets/`: `generate_icon.py`, `app_icon.ico`, `logo_header.png`, `shortcut_util.py`.
- `bin/`: Portable `adb.exe`, `fastboot.exe`, libimobiledevice suite, DLLs.
- `core/`:
  - `paths.py`: Runtime path resolution, adb keys directory setup.
  - `database.py`: SQLite connection, migrations, inventory, tickets, TAC learning, audit logging.
  - `adb_reader.py`: Android multi-layer extraction, parcel parser, Luhn validator, OEM color resolver.
  - `ios_reader.py`: iOS libimobiledevice extraction, iPhone 16 mapping, battery health calculator.
  - `device_detector.py`: Background USB monitoring (WMI / polling), thread-safe Qt signals.
  - `label_renderer.py`: 203 DPI monochrome rendering, Arabic CTL pipeline, Code128, QR, Compact Smart Merge.
  - `printer_win32.py`: Direct Windows GDI silent printing via win32print/win32ui.
  - `mock_device.py`: Mock ADB/Fastboot/iOS outputs for programmatic testing.
  - `audio_feedback.py`: Scanner audio beep helper (winsound on Windows, safe fallback).
- `ui/`:
  - `main_window.py`: Header, status bar, tabs, WYSIWYG preview, printer manager.
  - `device_tab.py`: Tab 1 Device specs, 1-Click Visual Color Chips bar.
  - `service_tab.py`: Tab 2 Service & Repair intake ticket.
  - `audit_tab.py`: Tab 3 Store Inventory Audit UI (barcode scanner input, live counters, Excel export).
  - `designer_tab.py`: Label designer, template controls.
  - `styles.py`: Luxury dark theme QSS stylesheet.
- `tests/`:
  - `test_*.py`: Unit tests for core modules.
  - `e2e/`: Opaque-box E2E tests (Tiers 1-4).
- `build_exe.bat`, `app.spec`: PyInstaller standalone executable bundling scripts.
