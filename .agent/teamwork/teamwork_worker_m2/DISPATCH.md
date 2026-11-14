## 2026-11-07T17:10:00Z
You are the Milestone 2 Implementation Worker (`teamwork_worker_m2`).

### Working Directory
`c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_worker_m2`
Parent Orchestrator Working Directory: `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\orchestrator`

### Mandatory Reading (FIRST STEP)
Read the following authoritative specification files completely before writing code:
1. `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md` (Original user requirements)
2. `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\PROJECT.md` (Master architecture & Interface Contracts #2 and #3)
3. Explorer 1 Blueprint: `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m2_1\analysis.md` and `proposed_label_renderer.py`
4. Explorer 2 Blueprint: `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m2_2\analysis.md` (Typography, Arabic Reshaping, BiDi, LRE/PDF number protection, font loading hierarchy, Pillow 10+ bounding box math)
5. Explorer 3 Blueprint: `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m2_3\analysis.md` (Code128 2-dot module width + 20px quiet zones, QR Code box_size, Windows GDI silent printing via `win32ui.CreateDC()`, Virtual Print Fallback in `exports/labels/`)

### Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

### File Ownership (Exclusive Write Access)
You own and may modify ONLY these files:
- `core/label_renderer.py`
- `core/printer_win32.py`
- `core/paths.py` (add `get_exports_dir()`)
- `tests/test_label_renderer.py`
- `tests/test_arabic_bidi.py`
- `tests/test_printer_win32.py`
- Your own metadata directory: `.agents/teamwork/teamwork_worker_m2/`

Do NOT touch any other existing files (such as `core/adb_reader.py`, `core/ios_reader.py`, `core/models.py`, `core/mock_device.py`, or existing test files).

### Implementation Scope & Deliverables
1. `core/paths.py`:
   - Add `get_exports_dir() -> Path` resolving to `<app_data>/exports` or `<project_root>/exports/labels` and ensuring it exists.
2. `core/label_renderer.py`:
   - Strictly implement Interface Contract #2:
     - `render_device_specs_label(...) -> Image.Image`
     - `render_repair_ticket_label(...) -> Image.Image`
     - `render_calibration_label(...) -> Image.Image`
   - Exact 203 DPI canvas math: $8.000\text{ dots/mm}$ integer scaling (`round(mm * 8.0)`).
   - Mode `'1'` 1-bit native monochrome canvas (pure black 0 / white 255).
   - Compact Smart Merge formatting: `" - ".join(parts)` omitting battery when None or <= 0.
   - Arabic reshaping (`arabic_reshaper.reshape()` + `bidi.algorithm.get_display()`) with automatic/manual Unicode LRE (`\u202A`) and PDF (`\u202C`) number & hyphen protection.
   - TrueType font hierarchy loading (`segoeui.ttf`, `tahoma.ttf`, `arial.ttf`, fallback) using modern Pillow 10+ API (`draw.textbbox()`).
   - 1D Code128 barcode with integer 2-dot module width ($0.250\text{ mm}$) and 20px quiet zones.
   - 2D QR Code with integer module `box_size` and Error Correction Level M.
   - Calibration label matching `tests/e2e/test_harness.py:verify_calibration_geometry`.
   - Embed pure-Python fallbacks for Code128 pattern generator and basic reshaping to guarantee execution in all test environments.
3. `core/printer_win32.py`:
   - Strictly implement Interface Contract #3:
     - `get_installed_printers() -> List[str]`
     - `print_label_image(image, printer_name, job_name, virtual_fallback) -> Tuple[bool, str]`
   - Multi-tier printer discovery prioritizing thermal printers (Xprinter XP-370B, Zebra, TSC).
   - Headless Windows GDI silent printing via `win32ui.CreateDC()` and `ImageWin.Dib` with `HORZRES`/`VERTRES`/`LOGPIXELSX`/`LOGPIXELSY` scaling checks and foolproof `try...finally` cleanup (`AbortDoc` + `DeleteDC`).
   - Virtual Print Fallback: saves exact 203 DPI 1-bit PNG or PDF to `exports/labels/`.
4. Unit Tests:
   - `tests/test_label_renderer.py` (Canvas dimensions, mode '1', Compact Smart Merge, Code128, QR, calibration geometry).
   - `tests/test_arabic_bidi.py` (Arabic letter reshaping, ligatures, BiDi reordering, phone number & IMEI protection, font loading, bounding box math).
   - `tests/test_printer_win32.py` (Printer discovery, ranking, GDI blitting mock, coordinate scaling, virtual print fallback).

### Verification
Run all tests before reporting:
- `python -m unittest tests/test_label_renderer.py tests/test_arabic_bidi.py tests/test_printer_win32.py -v`
- `python -m unittest discover tests -v`
- `python -m unittest discover -s tests/e2e -p "test_*.py" -v`
Ensure 100% pass rate. Document all commands and results in `handoff.md`.
