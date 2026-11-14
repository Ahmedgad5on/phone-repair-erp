## 2026-11-07T19:03:44Z
You are the Milestone 2 Remediation Worker (M2 R2 Worker).
Working directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_worker_m2_r2
Dispatch file: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_worker_m2_r2\DISPATCH.md

MANDATORY FIRST STEP:
Read c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md and c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\PROJECT.md completely.
Read Challenger 2's handoff report at c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_challenger_m2_2\handoff.md.
Read Explorer 1's blueprint at c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m2_r2_1\analysis.md and handoff.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP:
You have exclusive write access to:
- `core/printer_win32.py`
- `core/label_renderer.py`
- `tests/test_printer_win32.py`
- `tests/test_arabic_bidi.py`
- `tests/test_label_renderer.py`

TASK DESCRIPTION:
Implement the 3 scoped fixes identified during Milestone 2 adversarial challenge:

1. Fix Silent Printing Hang on Default Windows Printer (`core/printer_win32.py`):
   - Add `VIRTUAL_PRINTER_KEYWORDS: Tuple[str, ...] = ("pdf", "xps", "onenote", "fax", "virtual", "document writer", "writer", "portprompt", "file:")` and helper `is_virtual_printer(name: Optional[str]) -> bool`.
   - Update `detect_thermal_printer(printers: Optional[List[str]] = None) -> Optional[str]`:
     Filter out all virtual/file-port printers. If no printer in the candidates list matches `THERMAL_KEYWORDS`, return `None` (do NOT return non-thermal default Windows printers like "Microsoft Print to PDF").
   - Update `print_label_image(image: Image.Image, printer_name: Optional[str] = None, ...)`:
     If `printer_name` is provided and is a virtual printer (or contains PDF/PNG/Virtual), route to `save_virtual_print`.
     If `printer_name` is None: resolve `target_printer = detect_thermal_printer(installed)`. If `target_printer` is None or `is_virtual_printer(target_printer)`: immediately invoke `save_virtual_print(image, format_type="PNG")` and return `(True, path)`. Never call GDI `StartDoc()` on a virtual or None printer.
   - Update `tests/test_printer_win32.py` so tests align with `detect_thermal_printer` returning `None` when no thermal printer is present, and verify non-blocking execution when `printer_name=None`.

2. Fix Model Codes Starting with Digits in Arabic Strings (`core/label_renderer.py`):
   - In `TypographyEngine.auto_protect_spans(text: str) -> str`:
     Update regex to protect smartphone model codes whether starting with letters or numbers (e.g. `14 Ultra`, `12 Pro Max`, `10 Pro+`, `S23+`, `Note 12 Pro+`, `5G`, `4G`, `8T`, `8X`, `iPhone 16 Pro Max`, `SM-S928B`).
     Regex pattern: `r'(?<!\u202A)(\b(?:\d+[\s\-]*)?[A-Za-z](?:[A-Za-z0-9\-\.\/\+ ]*[A-Za-z0-9\+])?)(?!\u202C)'`
     Wrap matched spans in Unicode LRE (`\u202A`) and PDF (`\u202C`).
   - In `tests/test_arabic_bidi.py`, add unit tests verifying that models like `14 Ultra`, `12 Pro Max`, and `10 Pro+` in mixed Arabic strings maintain strict LTR sequence without inversion.

3. Fix Label Text Overlap on Repair Intake Labels (`core/label_renderer.py`):
   - In `draw_text_bounded(draw, xy, text, font, max_width=None, fill=0, align_right=False)`:
     Fix horizontal alignment logic so that `draw_x = x - bbox[0]` unless `align_right=True` (do NOT subtract `w` just because `is_arabic` is True, which was shifting left-aligned text off-screen!).
     Ensure pre-reshaped Arabic text is not double-reshaped or double-reversed.
   - In `render_repair_ticket_label(ticket, ...)`:
     Compute `bb_p = draw.textbbox((0, 0), phone, font=f_bold)`
     `w_phone = bb_p[2] - bb_p[0]`
     `max_name_w = usable_w - w_phone - 8`
     Use `draw_text_bounded(draw, (margin_px, curr_y), cust_name, font=f_bold, max_width=max_name_w, fill=0)`.
     Draw phone at `(width_px - margin_px - w_phone, curr_y)`.
     For `device_model` and `reported_fault`, use `draw_text_bounded` with `max_width=usable_w`.
   - In `tests/test_label_renderer.py`, add unit tests verifying that 100+ character customer names truncate cleanly with ellipsis (`...`) and never overlap the phone number.

VERIFICATION REQUIREMENTS:
Run and report results for:
1. `python -m unittest tests/test_label_renderer.py tests/test_arabic_bidi.py tests/test_printer_win32.py tests/test_adversarial_m2.py -v`
2. `python -m unittest discover tests -v` (Full workspace test suite)
3. `python -m unittest discover -s tests/e2e -p "test_*.py" -v` (Full E2E test suite)
4. Execute Challenger 2's 3 verification commands (from `teamwork_challenger_m2_2/handoff.md` Section 5):
   - Command 1: non-blocking GDI execution on default printer (`BLOCKED: False`)
   - Command 2: `14 Ultra` LTR preservation in Arabic text
   - Command 3: No customer name and phone overlap

Deliver your handoff report in `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_worker_m2_r2\handoff.md` with:
- What changed and exact line references
- Full test outputs
- Verification commands
Notify parent orchestrator via `send_message`.
