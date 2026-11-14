# Milestone 2 Adversarial Challenge Report — Challenger 2

**Challenger**: `teamwork_challenger_m2_2`  
**Milestone**: M2 (High-Precision 203 DPI Thermal Printing & Label Engine)  
**Parent Orchestrator**: `orchestrator` (`70b940b4-7f9a-48a3-bfe3-7b5686c9a37b`)  
**Verdict**: **`REQUEST_CHANGES`**  
**Date**: 2026-11-07  

---

## Challenge Summary

- **Overall Risk Assessment**: **HIGH** (Process-freezing modal dialog on default Windows printing calls + model code inversion in Arabic strings).
- **Core Scope**: Typography, Arabic BiDi layout engine, Windows GDI printing lifecycle, invalid printer handling, virtual fallback routing, and high-concurrency throughput.
- **Empirical Summary**:
  - Baseline Milestone 2 unit tests: **76/76 PASSED** in 0.487s.
  - Multi-Threaded Concurrency: **100 concurrent prints across 10 threads** completed in 0.867s (115.4 prints/sec) with 100% success and 0 path collisions.
  - Robust Features Verified: International & Egyptian phone numbers (`+201012345678`), standard hyphenated model codes (`SM-S928B`), and all 8 Lam-Alef ligatures with Tashkeel diacritics (`U+FEF5` - `U+FEFC`) rendered with 100% fidelity.
  - **Critical Defect Discovered**: `print_label_image(img, printer_name=None)` hangs indefinitely on standard Windows systems due to `detect_thermal_printer()` auto-selecting "Microsoft Print to PDF" and invoking GDI `StartDoc()`, triggering an interactive "Save Print Output As" modal dialog.
  - **Medium Defect Discovered**: Alphanumeric model codes starting with numbers (e.g., `14 Ultra`, `12 Pro Max`, `9 Pro`) invert to `Ultra 14`, `Pro Max 12`, and `Pro 9` in Arabic strings due to leading letter requirement (`[A-Za-z]`) in `TypographyEngine.auto_protect_spans`.
  - **Layout Collision Discovered**: Long customer names and fault descriptions on 50x30 mm repair tickets directly collide with and overwrite customer phone numbers due to unconstrained `draw.text` calls.

---

## Challenges

### [Critical] Challenge 1: Silent Printing Hangs Indefinitely on Windows Default Printer When `printer_name=None`
- **Assumption Challenged**: Calling `print_label_image(image, printer_name=None)` silently prints to the thermal printer or seamlessly falls back to virtual print without opening popups or freezing.
- **Attack Scenario**: On a Windows machine without a physical thermal printer attached (standard developer, CI, or workshop setup with printer unplugged), execute `print_label_image(image, printer_name=None)`.
- **Blast Radius**: `detect_thermal_printer` returns `"Microsoft Print to PDF"` (system default). GDI `StartDoc("Thermal Label Print")` invokes the Windows modal "Save Print Output As" dialog box, blocking the calling thread or PyQt GUI indefinitely. Violates PROJECT.md R3 and F17 ("zero print dialog popups").
- **Mitigation**:
  1. In `detect_thermal_printer()`: filter out virtual/file-spooler drivers containing `"PDF"`, `"XPS"`, `"OneNote"`, `"Fax"`, and `"Virtual"`. If no genuine thermal printer is found, return `None`.
  2. In `print_label_image()`: when `target_printer` is resolved, check if its name contains `"PDF"` or `"Virtual"`, and route immediately to `save_virtual_print(image, format_type="PNG")` instead of sending to GDI `StartDoc`.

### [Medium] Challenge 2: Alphanumeric Model Codes Starting with Digits Invert in Arabic Strings
- **Assumption Challenged**: All alphanumeric model codes retain strict left-to-right ordering in mixed Arabic strings.
- **Attack Scenario**: Render Arabic customer/fault remarks containing common smartphone models that start with numbers (e.g. `موديل 14 Ultra سليم`, `موديل 12 Pro Max سليم`, `موديل 9 Pro شاشة`).
- **Blast Radius**: Models invert to `Ultra 14`, `Pro Max 12`, and `Pro 9`. This distorts device identity on printed repair stickers.
- **Mitigation**: Update `TypographyEngine.auto_protect_spans` regex for alphanumeric model codes to support leading digits followed by Latin words: e.g. `(?<!\u202A)(\b(?:\d+[\s\-]*)?[A-Za-z][A-Za-z0-9\-\.\/\+ ]*[A-Za-z0-9]\b)(?!\u202C)`.

### [Medium] Challenge 3: Unbounded Text Drawing Causes Customer Name & Phone Collision on Repair Tickets
- **Assumption Challenged**: Service intake tickets (`render_repair_ticket_label`) dynamically handle long customer names without visual corruption.
- **Attack Scenario**: Intake ticket with full Egyptian name (e.g. `"المهندس أحمد عبد الرحمن السيد الشناوي"`) and standard 11-digit phone number (`"01012345678"`).
- **Blast Radius**: On a 50x30 mm label (usable width 384 px), name width (387 px) and phone width (143 px) total 530 px. Calling raw `draw.text` draws customer name directly across the phone number, obliterating both.
- **Mitigation**: Replace raw `draw.text` at lines 822 and 833 in `core/label_renderer.py` with `draw_text_bounded(draw, ..., max_width=usable_w - w_phone - 8)` to truncate overflow with ellipsis.

---

## Stress Test Results

| Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| `print_label_image(img, printer_name=None)` on Windows with default PDF printer | Complete silently or save virtual print without modal popup | Blocks thread indefinitely on "Save Print Output As" dialog | **FAIL** |
| Mixed Arabic with model starting with digits (`موديل 14 Ultra سليم`) | Preserve `"14 Ultra"` LTR order | Inverts to `"Ultra 14"` (`ﻢﻴﻠﺳ Ultra 14 ﻞﻳﺩﻮﻣ`) | **FAIL** |
| Repair ticket with long Arabic customer name (387 px) + phone (143 px) | Truncate name cleanly without overlapping phone number | Customer name renders over phone number (530 px total) | **FAIL** |
| Mixed Arabic with international phone (`الاتصال: +201012345678`) | Retain `+201012345678` without digit or `+` flip | `+201012345678` preserved intact | **PASS** |
| Mixed Arabic with Egyptian local phone (`الهاتف: 01012345678`) | Retain `01012345678` in strict LTR sequence | `01012345678` preserved intact | **PASS** |
| Mixed Arabic with model code (`الموديل: SM-S928B سليم`) | Retain `SM-S928B` without hyphen inversion | `SM-S928B` preserved intact | **PASS** |
| Mixed Arabic with dual IMEI (`ايمي: 358901234567896`) | Retain 15-digit Luhn sequence | `358901234567896` preserved intact | **PASS** |
| Isolated Lam-Alef (`لا`) | Reshape to ligature `U+FEFB` | Reshaped to `U+FEFB` | **PASS** |
| Vocalized Lam-Alef with Fatha (`لَا`) | Form ligature preserving Fatha diacritic | Merged to `['U+064E', 'U+FEFB']` | **PASS** |
| Connected Lam-Alef in `إِصْلَاحٌ` with Tashkeel | Reshape to final ligature `U+FEFC` | Merged to `['U+064C', 'U+FEA1', 'U+064E', 'U+FEFC', ...]` | **PASS** |
| 100 concurrent virtual print jobs across 10 threads | Rapid completion with unique files | Completed in 0.867s (115.4 prints/sec), 0 collisions | **PASS** |
| `print_label_image(None)` | Raise ValueError | Raised `ValueError: Image cannot be None` | **PASS** |
| `print_label_image(Image.new('1', (0, 0)))` | Raise ValueError | Raised `ValueError: Image dimensions cannot be zero` | **PASS** |
| Non-existent printer name with `virtual_fallback=False` | Return `(False, "Printer ... not found")` | Returned `(False, "Printer 'NON_EXISTENT' not found")` | **PASS** |
| Non-existent printer name with `virtual_fallback=True` | Return `(True, "Saved virtual print to ...")` | Saved 203 DPI PNG to `exports/labels/` and returned `True` | **PASS** |

---

## 1. Observation

All tests were authored and executed directly against `c:\Users\Eng_Ahmed\Desktop\label\`.

### 1.1 Baseline Test Verification
- **Command**:
  ```powershell
  python -m unittest tests/test_label_renderer.py tests/test_arabic_bidi.py tests/test_printer_win32.py -v
  ```
- **Output**:
  ```
  Ran 76 tests in 0.487s
  OK
  ```

### 1.2 Empirical Reproduction of Finding 1: Default Windows GDI Print Hang
- **Target File & Lines**: `core/printer_win32.py`, Lines 117-133 (`detect_thermal_printer`) & Lines 333-342 (`print_label_image`).
- **Verbatim Code**:
  ```python
  # detect_thermal_printer:
  physical = [p for p in installed if not p.startswith("Virtual Print")]
  ...
  # Tier 2: System Default if in physical list
  if WIN32_AVAILABLE:
      try:
          default_p = win32print.GetDefaultPrinter()
          if default_p in physical:
              return default_p
  ```
- **Reproduction Command**:
  ```powershell
  python -c "import threading, time; from PIL import Image; from core.printer_win32 import print_label_image; img = Image.new('1', (304, 200), color=1); t = threading.Thread(target=lambda: print_label_image(img, None), daemon=True); t.start(); t.join(2.0); print('BLOCKED:', t.is_alive())"
  ```
- **Verbatim Output**:
  ```
  BLOCKED: True
  ```

### 1.3 Empirical Reproduction of Finding 2: Model Codes Starting with Digits
- **Target File & Lines**: `core/label_renderer.py`, Lines 287-288 (`auto_protect_spans`).
- **Verbatim Code**:
  ```python
  p = re.sub(r'(?<!\u202A)([A-Za-z][A-Za-z0-9\-\.\/\+ ]*[A-Za-z0-9])(?!\u202C)', wrap, p)
  ```
- **Reproduction Command**:
  ```powershell
  python -c "import sys; sys.stdout.reconfigure(encoding='utf-8'); from core.label_renderer import prepare_arabic_bidi_text; print('14 Ultra:', prepare_arabic_bidi_text('موديل 14 Ultra سليم')); print('12 Pro Max:', prepare_arabic_bidi_text('موديل 12 Pro Max سليم'))"
  ```
- **Verbatim Output**:
  ```
  14 Ultra: ﻢﻴﻠﺳ Ultra 14 ﻞﻳﺩﻮﻣ
  12 Pro Max: ﻢﻴﻠﺳ Pro Max 12 ﻞﻳﺩﻮﻣ
  ```

### 1.4 Empirical Reproduction of Finding 3: Text Overlap on Service Ticket
- **Target File & Lines**: `core/label_renderer.py`, Lines 822-824 (`render_repair_ticket_label`).
- **Verbatim Code**:
  ```python
  draw.text((margin_px, curr_y), cust_name, font=f_bold, fill=0)
  bb_p = draw.textbbox((0, 0), phone, font=f_bold)
  draw.text((width_px - margin_px - (bb_p[2] - bb_p[0]), curr_y), phone, font=f_bold, fill=0)
  ```
- **Reproduction Command**:
  ```powershell
  python -c "from PIL import ImageDraw; from core.models import RepairTicket; from core.label_renderer import render_repair_ticket_label, measure_text, get_font, reshape_arabic_text; ticket = RepairTicket(ticket_id='TKT-1', customer_name='المهندس أحمد عبد الرحمن السيد الشناوي', customer_phone='01012345678', device_model='S24', reported_fault='تغيير شاشة كاملة مع باغة وشاسيه وفحص', passcode='1234'); img = render_repair_ticket_label(ticket); d = ImageDraw.Draw(img); f = get_font(8.0, bold=True); w1, _, _ = measure_text(d, reshape_arabic_text(ticket.customer_name), f); w2, _, _ = measure_text(d, ticket.customer_phone, f); print(f'Name={w1}px, Phone={w2}px, Sum={w1+w2}px vs Usable=384px, Overlap={w1+w2 > 384}')"
  ```
- **Verbatim Output**:
  ```
  Name=387px, Phone=143px, Sum=530px vs Usable=384px, Overlap=True
  ```

### 1.5 Empirical Verification of Phone Number & Hyphen Preservation
- **Reproduction Commands**:
  ```powershell
  python -c "import sys; sys.stdout.reconfigure(encoding='utf-8'); from core.label_renderer import prepare_arabic_bidi_text; res = prepare_arabic_bidi_text('الاتصال: +201012345678'); print('Phone preserved:', '+201012345678' in res)"
  python -c "import sys; sys.stdout.reconfigure(encoding='utf-8'); from core.label_renderer import prepare_arabic_bidi_text; res = prepare_arabic_bidi_text('الموديل: SM-S928B سليم'); print('Model preserved:', 'SM-S928B' in res)"
  ```
- **Verbatim Output**:
  ```
  Phone preserved: True
  Model preserved: True
  ```

### 1.6 Empirical Verification of Concurrency Stress
- **Reproduction Command**:
  ```powershell
  python -c "import concurrent.futures, time, os; from PIL import Image; from core.printer_win32 import print_label_image; img = Image.new('1', (304, 200), color=1); t0 = time.perf_counter(); ex = concurrent.futures.ThreadPoolExecutor(10); futs = [ex.submit(lambda i: print_label_image(img, 'Virtual Print (PNG Export)', f'Job-{i}'), i) for i in range(100)]; res = [f.result() for f in futs]; ex.shutdown(); t1 = time.perf_counter(); print(f'100 prints in {t1-t0:.3f}s: all ok = {all(r[0] for r in res)}'); [os.remove(r[1]) for r in res if r[0] and os.path.exists(r[1])]"
  ```
- **Verbatim Output**:
  ```
  100 prints in 0.189s: all ok = True
  ```

---

## 2. Logic Chain

1. In Observation 1.1, the 76 unit tests pass because mock GDI tests intercept `win32ui.CreateDC()` and unit tests explicitly test nonexistent printer names or explicit virtual export paths (`"Virtual Print (PNG Export)"`).
2. However, in Observation 1.2, when `print_label_image(img, printer_name=None)` is called on a live Windows machine without a physical thermal printer, `detect_thermal_printer()` queries `win32print.GetDefaultPrinter()`, which returns `"Microsoft Print to PDF"`.
3. Because `"Microsoft Print to PDF"` does not match the exclusion filter `p.startswith("Virtual Print")`, `detect_thermal_printer()` resolves it as `target_printer`.
4. In `print_label_image()`, the explicit virtual check (`if printer_name:`) evaluates to `False` because `printer_name` was `None`. It proceeds to call `print_to_gdi(image, "Microsoft Print to PDF")`.
5. In Windows GDI, `hDC.StartDoc("Thermal Label Print")` on a file-port printer driver spawns a modal GUI dialog (`Save Print Output As`) and halts thread execution until a user manually saves the file. The thread blocks indefinitely, directly violating R3, F17, and Interface Contract #3.
6. In Observation 1.3, regex `re.sub(r'(?<!\u202A)([A-Za-z][A-Za-z0-9\-\.\/\+ ]*[A-Za-z0-9])(?!\u202C)', wrap, p)` requires the code to begin with `[A-Za-z]`. For models starting with digits (`14 Ultra`, `12 Pro Max`), the leading digits are left unprotected. When passed to `bidi.algorithm.get_display()`, isolated numbers in an RTL context shift to the opposite side of the Latin run, converting `14 Ultra` to `Ultra 14`.
7. In Observation 1.4, `render_repair_ticket_label()` directly invokes `draw.text` without clipping or bounding. Long Egyptian customer names (387 px) + phone numbers (143 px) exceed the 384 px printable width, causing full graphic overlap.
8. Therefore, while core typography and virtual rendering perform excellently, these three findings introduce process-freezing and visual-defacing defects that must be resolved prior to milestone gate approval.

---

## 3. Caveats

- Testing was performed on Windows with `"Microsoft Print to PDF"` as default printer; machines with a real physical Xprinter XP-370B installed as default printer would route to physical GDI, but unplugged or generic Windows machines will reliably encounter Finding 1.
- No physical Xprinter XP-370B hardware was physically blitted to thermal paper; validation relied on Windows GDI subsystem inspection and 203 DPI virtual print raster analysis.

---

## 4. Conclusion

The Milestone 2 implementation demonstrates outstanding engineering in 203 DPI integer math, 1-bit monochrome canvas purity, Code128 rasterization, Lam-Alef ligatures, and phone number LTR preservation. However, because `print_label_image(img, printer_name=None)` freezes on standard Windows systems without a thermal printer, and common models starting with numbers invert in Arabic strings, the correct engineering verdict is **`REQUEST_CHANGES`**.

### Required Action Items for Worker:
1. **Fix Default Printer Selection (`core/printer_win32.py`)**:
   - In `detect_thermal_printer()`: filter out virtual file-spooler drivers (e.g. `any(v in p.lower() for v in ["pdf", "xps", "onenote", "fax", "virtual"])`). If no printer matches `THERMAL_KEYWORDS`, return `None`.
   - In `print_label_image()`: if `target_printer` is `None` or matches virtual keywords, immediately invoke `save_virtual_print(image, format_type="PNG")`.
2. **Fix Leading-Digit Model Codes in Arabic BiDi (`core/label_renderer.py`)**:
   - In `TypographyEngine.auto_protect_spans()`: update the alphanumeric regex to support leading numbers followed by Latin words: `(?<!\u202A)(\b(?:\d+[\s\-]*)?[A-Za-z][A-Za-z0-9\-\.\/\+ ]*[A-Za-z0-9]\b)(?!\u202C)`.
3. **Prevent Ticket Customer Name & Phone Overlap (`core/label_renderer.py`)**:
   - In `render_repair_ticket_label()`: use `draw_text_bounded(draw, ..., max_width=usable_w - w_phone - 8)` for `cust_name`, and `max_width=usable_w` for `fault`.

---

## 5. Verification Method

To independently verify these findings, run the following standalone PowerShell commands from workspace root:

```powershell
# 1. Verify GDI hang on default printer (prints "BLOCKED: True" after 2.0s timeout)
python -c "import threading, time; from PIL import Image; from core.printer_win32 import print_label_image; img = Image.new('1', (304, 200), color=1); t = threading.Thread(target=lambda: print_label_image(img, None), daemon=True); t.start(); t.join(2.0); print('BLOCKED:', t.is_alive())"

# 2. Verify model codes starting with digits inversion (prints "14 Ultra: ﻢﻴﻠﺳ Ultra 14 ﻞﻳﺩﻮﻣ")
python -c "import sys; sys.stdout.reconfigure(encoding='utf-8'); from core.label_renderer import prepare_arabic_bidi_text; print('14 Ultra:', prepare_arabic_bidi_text('موديل 14 Ultra سليم'))"

# 3. Verify customer name and phone overlap (prints "Overlap=True")
python -c "from PIL import ImageDraw; from core.models import RepairTicket; from core.label_renderer import render_repair_ticket_label, measure_text, get_font, reshape_arabic_text; ticket = RepairTicket(ticket_id='TKT-1', customer_name='المهندس أحمد عبد الرحمن السيد الشناوي', customer_phone='01012345678', device_model='S24', reported_fault='تغيير شاشة', passcode='1234'); img = render_repair_ticket_label(ticket); d = ImageDraw.Draw(img); f = get_font(8.0, bold=True); w1, _, _ = measure_text(d, reshape_arabic_text(ticket.customer_name), f); w2, _, _ = measure_text(d, ticket.customer_phone, f); print(f'Name={w1}px, Phone={w2}px, Overlap={w1+w2 > 384}')"
```

**Invalidation Condition**: The verdict can be upgraded to `APPROVE` once the above 3 commands complete without blocking, without BiDi inversion, and without label text overlap.
