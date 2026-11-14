## 2026-11-08T14:01:54Z
You are teamwork_spec_miner. Your assigned working directory is:
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\spec_miner_printing_ui

MANDATORY FIRST STEP:
Read the authoritative user request at:
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md

YOUR MISSION:
Mine and document exhaustive technical specifications, exact formulas, UI architectures, rendering pipelines, and database designs for the Visual Identity, High-Precision Thermal Printing Engine, PyQt6 Luxury UI, and Store Inventory Audit.

SPECIFIC SPECIFICATION TOPICS TO DOCUMENT:
1. Visual Identity & Asset Generation (R1):
   - `assets/generate_icon.py` implementation spec: Luxury shield emblem geometry on rounded Matte Black (#121212) and Metallic Gold (#D4AF37) bordered shield, combining smartphone silhouette, barcode bars, and diagnostic lightning pulse.
   - Supersampled anti-aliasing (e.g. render at 1024x1024 with Pillow/cairo or vector math, then high-quality Lanczos downsample).
   - Multi-resolution `assets/app_icon.ico` layers: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256 px.
   - Header logo `assets/logo_header.png` (128x128 px).
   - Windows integration: `ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ProLab.SmartLabeler.App.1.0")`, setting window icon on all PyQt6 windows/dialogs, Desktop shortcut creation via VBScript/PowerShell or `win32com.client`.
2. High-Precision 203 DPI Thermal Printing Engine (R4):
   - Pixel dimensions formula: 203 DPI = 8 dots/mm (203.2 dots/inch / 25.4 mm/inch = 8.0 dots/mm).
     * 38x25 mm = 304 x 200 px
     * 40x25 mm = 320 x 200 px
     * 50x30 mm = 400 x 240 px
     * 60x30 mm = 480 x 240 px
     * 80x40 mm = 640 x 320 px
     * 80x50 mm = 640 x 400 px
   - Margins: 1mm = 8 pixels default margin.
   - Compact Smart Merge Layout for small formats (38x25 mm and 40x25 mm): merging Model + Storage + Color + Battery % into concise header lines and bottom Code128 barcode.
   - Code128 1D Barcode & QR Code: crisp 1-bit monochrome rendering with exact quiet zones.
   - Arabic Text Support: `arabic-reshaper` and `python-bidi` integration with Pillow `ImageDraw.text` and TTF font selection (Arial/Segoe UI/Tahoma) for proper connected RTL text without detached glyphs.
   - Direct Windows GDI Silent Printing: `win32print` and `win32ui` creating a printer Device Context (DC), `CreateCompatibleDC`, `CreateCompatibleBitmap`, and `BitBlt` / `StretchBlt` to send monochrome 1-bit bitmap directly to the selected printer DC without external viewers or print dialogs.
3. UI Layout & Navigation (R2):
   - PyQt6 Luxury Dark Mode QSS stylesheet (#121212 Matte Black background, #1E1E1E Charcoal cards, #D4AF37 Metallic Gold accents, borders, and buttons).
   - Top Header & Status Bar: Custom Logo, Title, USB connection badge (Android ADB / Fastboot / iOS Normal), "Auto-Print on Connect" toggle.
   - Tab 1: Device Specs Label (Sales/Inventory - 3uTools style) with auto-incrementing Stock No, editable fields, 1-Click Visual Color Chips bar (8 quick color buttons for instant 0.2s manual override & SQLite TAC learning).
   - Tab 2: Service & Repair Intake Label (استلام صيانة) with Ticket ID, customer details, reported fault, passcode, security checkboxes, cost, intake date/time.
   - Tab 3: Store Inventory Audit (الجرد الذكي بالباركود) with always-focused high-speed barcode input, SQLite in-stock fetch, audio beep on scan, live counters, openpyxl Excel (.xlsx) export.
   - Center & Right Designer & Printer Manager: Live WYSIWYG 203 DPI preview, Title Display toggle, Compact Smart Merge toggle, printer selection (default Xprinter XP-370B), preset sizes, margins, orientation, JSON template save/load/delete.
4. Database & Inventory Schema (R5):
   - SQLite tables: `inventory` (devices), `repair_tickets`, `tac_color_map`, `print_history`, `audit_sessions`, `audit_items`.
5. Documentation & Output:
   - Create and maintain `progress.md` in your working directory.
   - Write comprehensive spec to:
     `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\spec_miner_printing_ui\spec_printing_ui_audit.md`
   - Write `handoff.md` and send completion message to orchestrator (`send_message`).
