Build a complete, production-ready, standalone Windows Desktop Application (.exe) for a Mobile Phone Sales & Repair Lab that automatically reads connected Android (via ADB/Fastboot) and iOS/iPhone (via libimobiledevice) devices and prints high-precision thermal barcode labels optimized for 203 DPI thermal printers like Xprinter XP-370B.

Working directory: C:\Users\Eng_Ahmed\Desktop\label
Integrity mode: development

## Requirements

### R1. Visual Identity, Custom Logo & Desktop Icon Engine
- Build an asset generator (`assets/generate_icon.py`) that programmatically creates a luxury vector-style brand emblem on a rounded Matte Black (#121212) and Metallic Gold (#D4AF37) bordered shield, combining a smartphone silhouette, thermal barcode bars, and diagnostic lightning pulse.
- Generate and export using supersampled anti-aliasing:
  - Multi-resolution `assets/app_icon.ico` containing 16x16, 32x32, 48x48, 64x64, 128x128, and 256x256 px layers.
  - Header logo `assets/logo_header.png` (128x128 px) for the top-left UI brand header and startup splash screen.
- Windows integration:
  - Call `ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ProLab.SmartLabeler.App.1.0")` at startup so Windows displays the custom gold/black icon in the Taskbar instead of the default Python icon.
  - Apply `app_icon.ico` to all application windows and dialogs.
  - Provide a "Create Desktop Shortcut" button in app settings and installer/build scripts that places a Windows Desktop shortcut with the custom icon.

### R2. Main UI Layout, Navigation & Inventory Audit
- Build the desktop UI in luxury dark mode (#121212 Matte Black, #1E1E1E Charcoal cards, #D4AF37 Metallic Gold accents/buttons) using Python PyQt6.
- Top Header & Status Bar:
  - Displays the custom Gold/Black Brand Logo, App Title, real-time USB connection badge (Android ADB / Fastboot / iOS Normal), and an "Auto-Print on Connect" toggle switch.
- Tab 1: Device Specs Label (مبيعات / مخزن - 3uTools Style):
  - Auto-incrementing Stock/Inventory Number (001, 002) with manual override.
  - Auto-filled and editable fields: Brand/Marketing Name (iPhone 11 Pro, Samsung S23 Ultra), Storage (512GB), RAM (8GB), Color (Space Gray), OS Version, Serial Number, IMEI 1 & IMEI 2, Battery Health (%), Charge Cycles, Sales Region (LL/A, Middle East), Condition (New, A+, A, B), and Remarks.
  - 1-Click Visual Color Chips Bar: 8 quick color buttons (Black, White, Gold, Silver, Blue, Green, Purple, Titanium) below the Color field for instant 0.2s manual override and automatic TAC-to-Color learning in SQLite.
- Tab 2: Service & Repair Intake Label (استلام صيانة):
  - Auto-generated Ticket ID, Customer Name, Customer Phone, Device Model, Reported Fault (العطل), Screen Passcode, Security Checkboxes (SIM removed, Back cracked, Dead device - قاطع باور), Estimated Cost, and Intake Date/Time.
- Tab 3: Store Inventory Audit (الجرد الذكي بالباركود):
  - Dedicated high-speed barcode scanner input box (always focused when tab is active).
  - Fetches all items marked as In Stock from the local SQLite database.
  - Scanning printed device labels with a USB/Wireless barcode scanner moves items from "Pending / Missing" to "Verified Present" with an audio beep.
  - Real-time counters (Total Expected, Scanned, Missing, Unknown Serials) and an Export Audit Report to Excel (.xlsx) button.
- Center & Right Designer & Printer Manager:
  - Live WYSIWYG 203 DPI preview with Title Display / No Title Display toggles and a "Compact Smart Merge" toggle merging Model + Storage + Color + Battery % so all data and bottom Code128 barcode fit cleanly on 38x25 mm and 40x25 mm stickers.
  - Printer and template controls: auto-detect Windows printers (defaulting to Xprinter XP-370B), preset sizes (38x25 mm, 40x25 mm, 50x30 mm, 60x30 mm, 80x40 mm, 80x50 mm), 1mm default margins, Transverse/Vertical orientation, and JSON Template Save/Load/Delete.

### R3. Zero-Click Hardware Data Extraction Engine
- Implement persistent background listeners (`adb track-devices`, `idevice_id -l`, and WMI USB events) for zero-click detection on USB connection without freezing the UI.
- Portable ADB Key Vault:
  - Dedicated `./data/adb_keys` directory inside the application folder.
  - Configure environment variables `ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, and `ADB_VENDOR_KEYS` to point to `./data/adb_keys` before starting the bundled `adb.exe` server.
  - Ensure RSA `adbkey` and `adbkey.pub` persist inside `./data/adb_keys` across restarts and app folder moves.
- Android Multi-Layer Extraction:
  - Multi-Layer IMEI (Android 6 to 16): Layer 1 parcel bypass (`service call iphonesubinfo 1 s16 com.android.shell` for IMEI 1, `iphonesubinfo 3 / 4` for Dual-SIM IMEI 2, parsing UTF-16 hex output with 15-digit Luhn checksum validation); Layer 2 OEM system properties (`ro.ril.oem.imei`, `ro.ril.oem.imei1`, `ro.ril.oem.imei2`, `ril.IMEI`, `persist.radio.imei`, `ro.gsm.imei`, `persist.sys.imei`); Layer 3 Fastboot fallback (`fastboot getvar imei, imei1, imei2`).
  - Multi-OEM Color Resolver: Xiaomi (`ro.boot.hwc`, `ro.product.SystemColor`, `persist.sys.color`), Oppo/Realme/OnePlus (`ro.hw.phone.color`, `ro.boot.project_color`), Pixel (`ro.boot.hardware.color`), Huawei/Honor (`ro.config.color`); Samsung Product Code Decoder (`ril.product_code` 3-letter variant/color mapping, e.g. ZKG/ZKA=Black, ZWG/ZWA=White, ZGA=Green, ZVA=Violet, ZBA=Blue, ZDA=Gold, ZTA=Titanium Gray); SQLite TAC memory fallback (first 8 digits of IMEI + Model).
  - Specs & Battery: Marketing Name, Storage (`df /data` mapped to 32/64/128/256/512GB/1TB), RAM (`/proc/meminfo`), Serial (`ro.serialno`), Battery level/cycles (`dumpsys battery`).
- iOS Extraction: Use `ideviceinfo` and `idevicediagnostics ioregentry AppleSmartBattery` with a ProductType dictionary covering up to iPhone 16 series to extract Marketing Model, Storage, Color, iOS Version, Serial, IMEI, Region (LL/A, J/A, etc.), Cycle Count, and exact Battery Health %.

### R4. High-Precision Thermal Printing Engine (203 DPI Native)
- 203 DPI (8 dots/mm) monochrome canvas rendering using Pillow (e.g. 304x200 px for 38x25 mm).
- Arabic text support via `arabic-reshaper` and `python-bidi` for proper connected right-to-left rendering without disconnected or reversed glyphs.
- Generate crisp Code128 1D barcodes and optional QR codes.
- Direct Windows GDI silent printing via `win32print`/`win32ui` directly to the selected printer DC without external viewer or print dialog popups.

### R5. Database, History & Standalone .exe Packaging
- Local SQLite database logging all printed devices, repair tickets, stock status (In Stock, Sold, In Repair), and TAC color mappings.
- Provide a `build_exe.bat` script that:
  1. Runs `python assets/generate_icon.py` to generate `./assets/app_icon.ico` and `./assets/logo_header.png`.
  2. Executes PyInstaller with `--noconsole --icon=assets/app_icon.ico --add-data "assets;assets"` bundling `/bin` binaries (`adb.exe`, `fastboot.exe`, `libimobiledevice` suite), keeping `./data/adb_keys` and the SQLite database writable next to the final executable.

## Verification Resources
- Use automated mock device listeners and virtual printer rendering tests to verify hardware parsing (ADB, Fastboot, ideviceinfo) and thermal label bitmap outputs programmatically without requiring physical mobile devices or hardware printers.

## Acceptance Criteria

### Visual Identity & Packaging
- [ ] `assets/generate_icon.py` generates `assets/app_icon.ico` with all 6 required resolutions (16x16, 32x32, 48x48, 64x64, 128x128, 256x256 px) and `assets/logo_header.png` (128x128 px).
- [ ] Windows Taskbar displays the custom gold/black shield icon when running, and all application dialogs use `app_icon.ico`.
- [ ] "Create Desktop Shortcut" action creates a functional Windows Desktop shortcut with `app_icon.ico`.
- [ ] `build_exe.bat` runs PyInstaller to produce a standalone executable in `dist/` bundling `/bin` binaries and custom assets.

### UI & Navigation
- [ ] Application launches in PyQt6 luxury dark mode (#121212, #1E1E1E, #D4AF37) containing Top Header/Status Bar, Tab 1 (Device Specs), Tab 2 (Service Intake), Tab 3 (Store Audit), and Designer/Printer panels.
- [ ] 1-Click Visual Color Chips bar updates the Color field instantly and records TAC-to-color mapping in SQLite.
- [ ] Tab 3 barcode audit correctly moves scanned items from Pending to Verified Present, emits an audio beep, and exports an audit report to Excel (.xlsx).
- [ ] Arabic text renders properly connected right-to-left on both preview and printed output without disconnected or reversed glyphs.

### Hardware Extraction
- [ ] Background listeners run continuously without freezing or lagging the UI.
- [ ] Portable ADB key vault initializes `./data/adb_keys` with `ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, and `ADB_VENDOR_KEYS`.
- [ ] Android extraction parses IMEI (with 15-digit Luhn validation across Layer 1 parcel bypass, Layer 2 props, Layer 3 fastboot), Samsung product code color decoding, hardware specs, and battery metrics.
- [ ] iOS extraction maps ProductType identifiers up to iPhone 16 series and resolves capacity, color, serial, IMEI, region, cycle count, and battery health %.
- [ ] Automated mock device tests validate Android and iOS parser logic against sample hardware output strings.

### Printing Engine
- [ ] Rendered labels match exact 203 DPI pixel dimensions (e.g., 38x25 mm generates exactly 304x200 px).
- [ ] Compact Smart Merge layout combines Model + Storage + Color + Battery % cleanly with Code128 barcode on small label formats (38x25 mm and 40x25 mm).
- [ ] Code128 barcode and QR code generate crisp, scannable graphics on the 1-bit monochrome canvas.
- [ ] Windows silent printing sends bitmap data directly to printer DC via pywin32.
