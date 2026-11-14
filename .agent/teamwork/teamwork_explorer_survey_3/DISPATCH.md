## 2026-11-07T14:06:32Z
You are Explorer 3 (teamwork_explorer) participating in Phase 0 (Survey) of the Mobile Phone Sales & Repair Lab Desktop Application project.

Your Working Directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_survey_3
Parent Orchestrator Working Directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\orchestrator
Original Request Path: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md

MANDATORY FIRST STEP:
Read c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md completely.

YOUR FOCUS AREA:
High-Precision 203 DPI Thermal Printing Engine, Database, and Standalone Packaging (Requirements R3 & R4).
1. 203 DPI Native Monochrome Canvas & PIL Rendering:
   - Exact mathematical scaling: 203 DPI = 8 dots/mm (e.g. 38x25mm -> 304x200px, 40x25mm -> 320x200px, 50x30mm -> 400x240px, 60x30mm -> 480x240px, 80x40mm -> 640x320px, 80x50mm -> 640x400px).
   - 1-bit monochrome bitmap rendering (PIL mode '1') to eliminate anti-aliasing fuzziness/blur on thermal print heads.
   - Dynamic layout engine for Device Specs & Service Intake labels.
   - "Compact Smart Merge" algorithm: merging Brand + Model + Storage + Color + Battery % into 1 or 2 high-density lines for small 38x25mm & 40x25mm stickers.
2. Typography & Arabic Support:
   - Arabic text reshaping (`arabic-reshaper`) and bi-directional algorithm (`python-bidi`) pipeline.
   - TTF font selection (Windows system fonts such as Arial, Tahoma, Segoe UI, or bundled open fonts) ensuring clear glyph rendering at small point sizes (e.g., 6pt to 10pt) without clipping.
3. Barcodes & QR Codes:
   - 1D Barcode (Code128 via `python-barcode`): generating clean 1-bit monochrome bitmaps without quiet zone overflow.
   - 2D QR Code (`qrcode`): error correction, pixel-perfect module sizing.
4. Direct Windows Silent Printing via pywin32:
   - `win32print` and `win32ui` CreateDC workflow.
   - HORZRES/VERTRES printer capabilities query and DPI scaling validation.
   - Sending DIB / bitmap to printer DC silently without print dialog popups.
   - "Virtual / PDF / PNG preview print" fallback mode when no physical thermal printer is attached or when running on development/test machines.
   - "Calibrate / Test Label" generation: drawing precise outer dimensional border box and millimeter tick marks to test alignment.
5. Database Architecture:
   - SQLite schema for printed specs labels and repair intake tickets with auto-incrementing Stock # and Ticket IDs.
   - Search filtering (Serial, IMEI, Model, Customer Phone).
   - Export logic to Excel (.xlsx via openpyxl or pandas/csv) and 1-click reprint trigger.
6. Packaging & Distribution:
   - PyInstaller spec / `build_exe.bat` (`--noconsole`, `--add-data` for fonts, templates, icons, and bundled `/bin` binaries).
   - Dependencies analysis (`requirements.txt`).

OUTPUT REQUIREMENTS:
- Write your comprehensive findings to `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_survey_3\analysis.md`.
- Write your structured completion report to `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_survey_3\handoff.md`.
- Send a completion message back to parent orchestrator with reference to your handoff path.
REMEMBER: You are read-only. Do not write or edit production source code.
