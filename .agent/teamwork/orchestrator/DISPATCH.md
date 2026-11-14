# Incoming Dispatch

## 2026-11-07T14:02:41Z

Build a complete, production-ready, standalone Windows Desktop Application (.exe) for a Mobile Phone Sales & Repair Lab that automatically reads connected Android (via ADB/Fastboot) and iOS/iPhone (via libimobiledevice) devices and prints high-precision thermal barcode labels (specifically optimized for 203 DPI thermal printers like Xprinter XP-370B).

Working directory: C:\Users\Eng_Ahmed\Desktop\label
Integrity mode: development

## Requirements

### R1. Desktop UI & Visual Identity
Build a desktop application with a luxury dark theme (#121212 Matte Black, #1E1E1E Charcoal cards, #D4AF37 Metallic Gold accents) using PyQt6 or CustomTkinter (choose the most stable for high-DPI canvas rendering and modern styling). The layout must include:
- Top Status Bar: Real-time connection listener showing connected Android/iOS device status, connection mode (ADB / Fastboot / iOS Normal), and an "Auto-Print on Connect" toggle switch.
- Left Panel (Device Data & Modes):
  - Tab 1: Device Specs Label (3uTools style) with auto-incrementing Stock/Inventory Number (with manual override), auto-filled and editable fields for Brand/Marketing Name (e.g., iPhone 11 Pro, Samsung S23 Ultra), Storage (e.g., 512GB), RAM (e.g., 8GB), Color (e.g., Space Gray), OS Version, Serial Number, IMEI 1 & IMEI 2, Battery Health (%), Charge Cycles, Sales Region (e.g., LL/A), Condition/Grade (New, A+, A, B), and Custom Remarks.
  - Tab 2: Service & Repair Intake Label with auto-generated Ticket ID, Customer Name, Customer Phone, Device Model, Reported Fault/Issue, Screen Passcode/Pattern, Security Checkboxes (SIM removed, Back cracked, Dead device), Estimated Cost, and Intake Date/Time.
- Center Panel (Live WYSIWYG Label Designer & Preview): High-resolution live preview showing exact label proportions, borders, text, 1D Barcode (Code128), and/or QR Code; field visibility toggles (title display vs no title display); and a "Compact Smart Merge" toggle merging Model + Storage + Color + Battery % into 1 or 2 compact lines for 38x25 mm and 40x25 mm labels.
- Right Panel (Printer, Paper Size & Template Manager): Printer selector dropdown (auto-detecting Windows printers, defaulting to Xprinter if found); preset paper sizes (38x25 mm, 40x25 mm, 50x30 mm, 60x30 mm, 80x40 mm, 80x50 mm, plus custom width x length); margin controls (default 1 mm); orientation and font controls; and JSON template save/load/delete.
- Bottom Panel (Local History & Inventory Log): Searchable table of printed devices/tickets (by Serial, IMEI, Model, or Customer Phone) with 1-click reprint and export to Excel (.xlsx / .csv).

### R2. Hardware Data Extraction Engine (Android & iOS)
Run all device polling in background threads without freezing the UI:
- Android Extraction Module (ADB & Fastboot): Poll `adb devices` every 2 seconds. When connected: query manufacturer, brand, model, and marketname (including local lookup/smart resolver for common Samsung/Xiaomi/Oppo model codes); parse `df /data` to standard commercial storage sizes and `/proc/meminfo` for standard RAM sizes; read serial number and extract IMEI 1 & 2 via `service call iphonesubinfo 1` / `dumpsys iphonesubinfo`; parse `dumpsys battery` for level, health, and charge counter/cycles; read Android version and bootloader lock state.
- iOS Extraction Module (libimobiledevice): Poll `idevice_id -l` every 2 seconds. When connected: execute `ideviceinfo` and `idevicediagnostics ioregentry AppleSmartBattery` (or GasGauge); include an internal mapping dictionary converting Apple ProductType identifiers to marketing names up to iPhone 16 series; extract TotalDiskCapacity, DeviceColor/DeviceEnclosureColor, ProductVersion, SerialNumber, IMEI, ModelNumber + RegionInfo, Battery CycleCount, and calculate exact Battery Health %.
- Include simulated/mock device and virtual print modes alongside live hardware detection so that hardware extraction and printing workflows can be fully operated and verified without physical devices connected.

### R3. High-Precision Thermal Printing Engine (203 DPI Native)
- Render labels using Python Pillow (PIL) at native 203 DPI (8 dots per mm, 1-bit monochrome canvas, e.g. 38x25 mm at 304x200 px) to eliminate blur.
- Support Arabic text reshaping and bi-directional layout (arabic-reshaper and python-bidi) before drawing on canvas so Arabic text renders connected and right-to-left correctly.
- Generate Code128 barcodes (python-barcode) and compact QR codes (qrcode).
- Direct Windows silent printing using pywin32 (`win32print` and `win32ui` CreateDC with HORZRES/VERTRES scaling check) to send the rendered bitmap directly to the selected thermal printer without external viewer or print dialog popups.
- Include a "Calibrate / Test Label" button printing a dimensional border box to verify sticker alignment.

### R4. Database, Architecture & Standalone Packaging
- Database: Built-in sqlite3 logging every printed device specs label and repair ticket.
- Modular Project Structure: Organize into `/ui`, `/core/adb_reader.py`, `/core/ios_reader.py`, `/core/label_renderer.py`, `/core/printer_win32.py`, `/core/database.py`, and `/data/apple_models.json`.
- Standalone .exe Build Script: Provide `requirements.txt` and `build_exe.bat` using PyInstaller (`--noconsole`) bundling a `/bin` folder with `adb.exe`, `AdbWinApi.dll`, and libimobiledevice binaries (`ideviceinfo.exe`, `idevice_id.exe`, `idevicediagnostics.exe`).
