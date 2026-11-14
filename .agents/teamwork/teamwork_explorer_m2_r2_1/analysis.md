# Architectural Analysis: Printer Driver Detection & Silent Fallback Architecture

**Module Under Investigation**: `core/printer_win32.py`  
**Milestone**: M2 Round 2 (High-Precision 203 DPI Thermal Printing & Label Engine)  
**Author**: M2 R2 Explorer 1 (`teamwork_explorer_m2_r2_1`)  
**Context**: Resolution of Challenger 2 Finding 1 ("Silent Printing Hangs on Default Windows Printer When `printer_name=None`")  
**Compliance**: Read-Only Analysis conforming strictly to `ORIGINAL_REQUEST.md`, `PROJECT.md` (R3, F17, Interface Contract #3), and Challenger 2 Handoff Report.

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Core Problem
When `print_label_image(image, printer_name=None)` is called on a standard Windows machine (developer workstation, CI environment, or workshop PC where an Xprinter/thermal printer is not physically connected and powered on), the calling thread **blocks indefinitely**. This freezes the application or background worker thread, directly violating PROJECT.md Requirement R3 ("Direct Windows silent printing... without external viewer or print dialog popups") and Feature F17 ("zero dialogs, virtual PNG/PDF preview fallback").

Empirical verification reproduced this hang with timeout interception:
```powershell
python -c "import threading, time; from PIL import Image; from core.printer_win32 import print_label_image; img = Image.new('1', (304, 200), color=1); t = threading.Thread(target=lambda: print_label_image(img, None), daemon=True); t.start(); t.join(2.0); print('BLOCKED:', t.is_alive())"
# Output: BLOCKED: True
```

### 1.2 Step-by-Step Root Cause Analysis

The defect is caused by four compounding flaws in `core/printer_win32.py`:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. `get_installed_printers()` returns ['Microsoft Print to PDF']       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. `detect_thermal_printer()` filters ONLY `p.startswith('Virtual')`   │
│    -> 'Microsoft Print to PDF' passes through into `physical` list!    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. Tier 2 queries `win32print.GetDefaultPrinter()`                     │
│    -> Returns 'Microsoft Print to PDF' (found in `physical`)           │
│    -> Auto-selected as `target_printer`!                              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. `print_label_image(img, printer_name=None)`                         │
│    -> Explicit virtual check skipped because `printer_name` was None   │
│    -> Resolves `target_printer = 'Microsoft Print to PDF'`             │
│    -> Calls `print_to_gdi(img, 'Microsoft Print to PDF')`              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 5. Windows GDI Subsystem: `hDC.StartDoc("Thermal Label Print")`        │
│    -> Port is 'PORTPROMPT:'                                            │
│    -> Spawns interactive modal GUI "Save Print Output As" dialog box   │
│    -> Process/Thread BLOCKS INDEFINITELY waiting for user input        │
└────────────────────────────────────────────────────────────────────────┘
```

#### Root Cause 1: Inadequate Definition of "Physical" Printer (Line 113)
In `detect_thermal_printer`:
```python
physical = [p for p in installed if not p.startswith("Virtual Print")]
```
The author assumed that only mock printer strings starting with the literal prefix `"Virtual Print"` (e.g. `"Virtual Print (PNG Export)"`) were virtual. However, standard Windows installations include system document spoolers such as:
- `"Microsoft Print to PDF"`
- `"Microsoft XPS Document Writer"`
- `"OneNote for Windows 10"` / `"OneNote (Desktop)"` / `"Send to OneNote"`
- `"Fax"`
- Third-party virtual drivers (`"Adobe PDF"`, `"CutePDF Writer"`, `"Foxit PDF Printer"`, etc.)

None of these begin with `"Virtual Print"`. Consequently, all Windows software spoolers were classified as "physical" printers.

#### Root Cause 2: Unfiltered Fallback to Default Windows Printer (Lines 123-130)
In Tier 2 of `detect_thermal_printer`:
```python
if WIN32_AVAILABLE:
    try:
        default_p = win32print.GetDefaultPrinter()
        if default_p in physical:
            return default_p
    except Exception:
        pass
```
On Windows 10/11 systems without a physical printer connected, Windows automatically designates `"Microsoft Print to PDF"` (or XPS) as the system default printer. Because `"Microsoft Print to PDF"` passed into `physical`, Tier 2 immediately returned it as the detected "thermal" printer.
Furthermore, Tier 3 (`return physical[0]`) unconditionally returned `physical[0]`, ensuring that even if Tier 2 failed, the virtual printer was selected.

#### Root Cause 3: The Windows `PORTPROMPT:` Spooler Behavior
When GDI `win32ui.CreateDC().CreatePrinterDC("Microsoft Print to PDF")` is created, Windows queries the printer port. For `"Microsoft Print to PDF"`, the port name is `'PORTPROMPT:'`.
Calling `hDC.StartDoc(job_name)` instructs the Windows print spooler to begin spooling. Because the port is `PORTPROMPT:` and no target output file was provided via `DOCINFO`, Windows opens an interactive Win32 modal dialog titled **"Save Print Output As"** on the active desktop.
In headless test runs, background polling threads, or automated desktop operations, this dialog cannot be answered, freezing the thread forever.

#### Root Cause 4: Bypass of Virtual Check in `print_label_image` (Lines 314-342)
In `print_label_image`:
```python
# 1. Explicit Virtual Print request
if printer_name:
    p_upper = printer_name.upper()
    if "PDF" in p_upper:
        return save_virtual_print(image, format_type="PDF")
    if "PNG" in p_upper or "VIRTUAL" in p_upper:
        return save_virtual_print(image, format_type="PNG")
```
This virtual check only evaluated `if printer_name:` (when an argument was explicitly passed).
When `printer_name=None`, Step 1 was skipped.
Then in Step 2:
`target_printer = detect_thermal_printer(installed)` (which returned `"Microsoft Print to PDF"`).
There was **zero validation** on `target_printer` before calling `print_to_gdi(image, target_printer)` at Line 342.

---

## 2. Architectural Design & Fix Strategy

To permanently eliminate modal dialogs and process blocking while satisfying PROJECT.md Interface Contract #3, we establish four architectural invariants:

### Invariant 1: Comprehensive Virtual/Document Driver Categorization
Define a centralized, case-insensitive keyword catalog `VIRTUAL_PRINTER_KEYWORDS` that covers all known Windows document writers, file-spooling drivers, and virtual printers:
- Software document formats: `"pdf"`, `"xps"`, `"oxps"`
- Note/Office capture queues: `"onenote"`, `"send to"`
- Telephony/Fax spoolers: `"fax"`
- File and prompt ports: `"portprompt"`, `"file:"`, `"nul"`
- Virtual exports: `"virtual"`, `"document writer"`, `"writer"`, `"root print queue"`

Provide a dedicated predicate function:
```python
def is_virtual_printer(printer_name: Optional[str]) -> bool:
    """
    Returns True if printer_name is None, empty, or corresponds to a virtual,
    document-capturing, or file-port driver that prompts for file output.
    """
```

### Invariant 2: Strict Thermal Printer Detection Protocol
`detect_thermal_printer()` must ONLY return a genuine physical thermal label/receipt printer.
1. Filter `installed` to exclude any driver where `is_virtual_printer(p)` is True.
2. If `win32print.GetDefaultPrinter()` is in `physical_candidates` AND its name matches `THERMAL_KEYWORDS`, return it (honors user's preferred thermal printer).
3. Scan `physical_candidates` for any printer matching `THERMAL_KEYWORDS`. If found, return the first match.
4. If NO physical candidate matches `THERMAL_KEYWORDS`, **return `None`**.
*(A label printing system must NEVER auto-route a 38x25mm sticker job to an office desktop laser/inkjet printer or virtual spooler).*

### Invariant 3: Immediate Non-Blocking Virtual Fallback in `print_label_image`
In `print_label_image(image, printer_name=None, ...)`:
1. Resolve `target_printer = printer_name if printer_name else detect_thermal_printer()`.
2. **Pre-GDI Virtual Intercept**: If `not target_printer`, `is_virtual_printer(target_printer)`, or `not WIN32_AVAILABLE`:
   - If `virtual_fallback` is True:
     - If `target_printer` explicitly requested PDF (contains `"pdf"` and not `"png"`), call `save_virtual_print(image, format_type="PDF")`.
     - Otherwise, call `save_virtual_print(image, format_type="PNG")`.
     - Return `(True, file_path)` immediately. Zero GDI calls, zero `StartDoc`, zero modal popups.
   - If `virtual_fallback` is False:
     - Return `(False, "No physical thermal printer available...")`.
3. If `target_printer` is a genuine physical printer, proceed to `print_to_gdi`. If GDI fails (e.g. printer unplugged), catch exception and invoke `save_virtual_print(image, format_type="PNG")`.

### Invariant 4: Hardened Capabilities Query
In `get_printer_capabilities(printer_name)`:
If `is_virtual_printer(printer_name)` is True, immediately return default 203 DPI capabilities dictionary without calling `win32ui.CreateDC().CreatePrinterDC()`. This avoids driver initialization overhead and potential driver crashes on misconfigured virtual queues.

---

## 3. Exact Proposed Code Changes for `core/printer_win32.py`

### Change 1: Constants and Virtual Printer Predicate
**Location**: Lines 45-58 of `core/printer_win32.py`

#### Target Content:
```python
# Known keywords for auto-prioritizing thermal label printers
THERMAL_KEYWORDS: Tuple[str, ...] = (
    "xprinter", "xp-370", "xp-", "thermal", "pos", "barcode",
    "label", "zebra", "tsc", "gprinter", "rongta", "citizen",
    "bixolon", "godex", "dymo", "rollo", "munbyn"
)

# GDI Capability indices
_HORZRES = 8       # Printable width in device pixels
_VERTRES = 10      # Printable height in device pixels
_LOGPIXELSX = 88   # Horizontal DPI
_LOGPIXELSY = 90   # Vertical DPI
```

#### Replacement Content:
```python
# Known keywords for auto-prioritizing thermal label printers
THERMAL_KEYWORDS: Tuple[str, ...] = (
    "xprinter", "xp-370", "xp-", "thermal", "pos", "barcode",
    "label", "zebra", "tsc", "gprinter", "rongta", "citizen",
    "bixolon", "godex", "dymo", "rollo", "munbyn", "honeywell",
    "intermec", "sato", "datamax", "sewoo", "star", "epson tm",
    "tm-t", "receipt"
)

# Keywords identifying virtual, document, or file-port spooler drivers that prompt for save paths
VIRTUAL_PRINTER_KEYWORDS: Tuple[str, ...] = (
    "pdf",
    "xps",
    "oxps",
    "onenote",
    "fax",
    "virtual",
    "document writer",
    "writer",
    "portprompt",
    "file:",
    "root print queue",
    "send to",
)

# GDI Capability indices
_HORZRES = 8       # Printable width in device pixels
_VERTRES = 10      # Printable height in device pixels
_LOGPIXELSX = 88   # Horizontal DPI
_LOGPIXELSY = 90   # Vertical DPI


def is_virtual_printer(printer_name: Optional[str]) -> bool:
    """
    Determines whether a printer name corresponds to a virtual, document,
    or file-spooler driver (e.g. PDF, XPS, OneNote, Fax, Virtual Export)
    that would spawn interactive file dialogs or fail direct GDI blitting.
    """
    if not printer_name:
        return True
    p_lower = printer_name.lower().strip()
    return any(kw in p_lower for kw in VIRTUAL_PRINTER_KEYWORDS)
```

---

### Change 2: Refactor `detect_thermal_printer`
**Location**: Lines 101-134 of `core/printer_win32.py`

#### Target Content:
```python
def detect_thermal_printer(printers: Optional[List[str]] = None) -> Optional[str]:
    """
    Detects and auto-selects the most appropriate printer:
    1. First printer matching thermal keywords (Xprinter, XP-370B, Zebra, etc.)
    2. Default Windows printer
    3. First installed physical printer
    4. None if no physical printers installed
    """
    installed = printers if printers is not None else get_installed_printers()
    if not installed:
        return None

    physical = [p for p in installed if not p.startswith("Virtual Print")]
    if not physical:
        return None

    # Tier 1: Thermal Keyword matching
    for p in physical:
        p_lower = p.lower()
        if any(kw in p_lower for kw in THERMAL_KEYWORDS):
            return p

    # Tier 2: System Default if in physical list
    if WIN32_AVAILABLE:
        try:
            default_p = win32print.GetDefaultPrinter()
            if default_p in physical:
                return default_p
        except Exception:
            pass

    # Tier 3: First available physical printer
    return physical[0]
```

#### Replacement Content:
```python
def detect_thermal_printer(printers: Optional[List[str]] = None) -> Optional[str]:
    """
    Detects and auto-selects a genuine physical thermal printer:
    1. Filters out virtual, document, and file-port drivers (PDF, XPS, OneNote, Fax, Virtual).
    2. If the default Windows printer is a genuine thermal printer, select it.
    3. Otherwise, return the first installed physical printer matching thermal keywords (Xprinter, Zebra, TSC, etc.).
    4. If no genuine thermal printer is found, return None (allowing silent virtual fallback).
    """
    installed = printers if printers is not None else get_installed_printers()
    if not installed:
        return None

    # Filter out virtual, document, and file-port drivers
    physical_candidates = [p for p in installed if not is_virtual_printer(p)]
    if not physical_candidates:
        return None

    # Check if default Windows printer is a physical thermal printer
    if WIN32_AVAILABLE:
        try:
            default_p = win32print.GetDefaultPrinter()
            if default_p and default_p in physical_candidates:
                if any(kw in default_p.lower() for kw in THERMAL_KEYWORDS):
                    return default_p
        except Exception:
            pass

    # Find first physical candidate matching thermal keywords
    for p in physical_candidates:
        p_lower = p.lower()
        if any(kw in p_lower for kw in THERMAL_KEYWORDS):
            return p

    # No genuine thermal printer attached/installed
    return None
```

---

### Change 3: Protect `get_printer_capabilities` Against Virtual DC Creation
**Location**: Line 149 of `core/printer_win32.py`

#### Target Content:
```python
    if not WIN32_AVAILABLE or not printer_name or printer_name.startswith("Virtual Print"):
        return caps
```

#### Replacement Content:
```python
    if not WIN32_AVAILABLE or not printer_name or is_virtual_printer(printer_name):
        return caps
```

---

### Change 4: Refactor `print_label_image` with Immediate Virtual Fallback
**Location**: Lines 292-351 of `core/printer_win32.py`

#### Target Content:
```python
def print_label_image(
    image: Image.Image,
    printer_name: Optional[str] = None,
    job_name: str = "Thermal Label Print",
    virtual_fallback: bool = True
) -> Tuple[bool, str]:
    """
    Main entry point conforming strictly to PROJECT.md Interface Contract #3:
    - If printer_name requests virtual print, exports to PNG or PDF immediately.
    - If printer_name is None, auto-detects thermal printer or system default.
    - If physical printer unavailable or GDI fails and virtual_fallback=True,
      automatically saves 203 DPI PNG to exports/labels/ without error.
       
    Returns:
        (success: bool, message_or_filepath: str)
    """
    if image is None:
        raise ValueError("Image cannot be None")
    if hasattr(image, "size") and (image.size[0] == 0 or image.size[1] == 0):
        raise ValueError("Image dimensions cannot be zero")

    # 1. Explicit Virtual Print request
    if printer_name:
        p_upper = printer_name.upper()
        if "PDF" in p_upper:
            return save_virtual_print(image, format_type="PDF")
        if "PNG" in p_upper or "VIRTUAL" in p_upper:
            return save_virtual_print(image, format_type="PNG")

    # 2. Check for nonexistent printer name if explicitly provided
    installed = get_installed_printers()
    physical_installed = [p for p in installed if not p.startswith("Virtual Print")]

    target_printer = printer_name
    if target_printer:
        if physical_installed and target_printer not in physical_installed:
            if not virtual_fallback:
                return False, f"Printer '{target_printer}' not found"
            ok, file_path = save_virtual_print(image, format_type="PNG")
            return True, f"Printer '{target_printer}' not found. Saved virtual print to: {file_path}"
    else:
        target_printer = detect_thermal_printer(installed)

    # 3. If no physical printer exists or pywin32 not available
    if not target_printer or not WIN32_AVAILABLE:
        if virtual_fallback:
            return save_virtual_print(image, format_type="PNG")
        return False, "No physical thermal printer available and virtual fallback disabled."

    # 4. Attempt GDI silent print
    success, message = print_to_gdi(image, target_printer, job_name=job_name)

    # 5. Fallback on hardware/driver error
    if not success and virtual_fallback:
        fallback_ok, file_path = save_virtual_print(image, format_type="PNG")
        if fallback_ok:
            return True, f"Printer '{target_printer}' error ({message}). Saved virtual print to: {file_path}"
        return False, f"Printer error ({message}) and virtual fallback failed: {file_path}"

    return success, message
```

#### Replacement Content:
```python
def print_label_image(
    image: Image.Image,
    printer_name: Optional[str] = None,
    job_name: str = "Thermal Label Print",
    virtual_fallback: bool = True
) -> Tuple[bool, str]:
    """
    Main entry point conforming strictly to PROJECT.md Interface Contract #3:
    - If printer_name is None, auto-detects thermal printer; if none found, falls back
      silently to virtual PNG export without calling GDI StartDoc().
    - If printer_name indicates a virtual/document/file-port printer (PDF, XPS, OneNote, Fax, Virtual),
      immediately invokes save_virtual_print() without calling GDI StartDoc().
    - If physical printer unavailable or GDI fails and virtual_fallback=True,
      automatically saves 203 DPI PNG to exports/labels/ without modal dialogs or error.
       
    Returns:
        (success: bool, message_or_filepath: str)
    """
    if image is None:
        raise ValueError("Image cannot be None")
    if hasattr(image, "size") and (image.size[0] == 0 or image.size[1] == 0):
        raise ValueError("Image dimensions cannot be zero")

    installed = get_installed_printers()

    # 1. Resolve target printer
    if printer_name is not None and str(printer_name).strip():
        target_printer = str(printer_name).strip()
    else:
        target_printer = detect_thermal_printer(installed)

    # 2. Virtual or file-port printer routing (zero GDI StartDoc calls)
    if not target_printer or is_virtual_printer(target_printer) or not WIN32_AVAILABLE:
        if virtual_fallback:
            # If target explicitly requested PDF (e.g. 'Virtual Print (PDF Export)' or explicit PDF printer), export PDF
            if target_printer and "pdf" in target_printer.lower() and "png" not in target_printer.lower():
                return save_virtual_print(image, format_type="PDF")
            return save_virtual_print(image, format_type="PNG")
        return False, f"No physical thermal printer available for '{target_printer or 'None'}' and virtual fallback disabled."

    # 3. Check for nonexistent printer name if explicitly provided
    physical_installed = [p for p in installed if not is_virtual_printer(p)]
    if physical_installed and target_printer not in physical_installed:
        if not virtual_fallback:
            return False, f"Printer '{target_printer}' not found"
        ok, file_path = save_virtual_print(image, format_type="PNG")
        return True, f"Printer '{target_printer}' not found. Saved virtual print to: {file_path}"

    # 4. Attempt GDI silent print to genuine physical printer
    success, message = print_to_gdi(image, target_printer, job_name=job_name)

    # 5. Fallback on hardware/driver error
    if not success and virtual_fallback:
        fallback_ok, file_path = save_virtual_print(image, format_type="PNG")
        if fallback_ok:
            return True, f"Printer '{target_printer}' error ({message}). Saved virtual print to: {file_path}"
        return False, f"Printer error ({message}) and virtual fallback failed: {file_path}"

    return success, message
```

---

## 4. Formulated Unit Tests & Test Specifications

The following unit tests must be updated or added to `tests/test_printer_win32.py` and `tests/test_adversarial_m2.py`:

### 4.1 Update Existing `test_04` in `tests/test_printer_win32.py`
In the original `tests/test_printer_win32.py`, `test_04` asserted that `detect_thermal_printer` fell back to `"Brother Laser"` when no thermal printer existed. That test reflected the old, flawed behavior. It should be replaced with:

```python
    def test_04_detect_thermal_printer_no_thermal_returns_none(self):
        """Verify detect_thermal_printer returns None when installed list contains no thermal printers."""
        sample_list = ["Brother Laser", "Epson Stylus", "Virtual Print (PNG Export)"]
        chosen = detect_thermal_printer(sample_list)
        self.assertIsNone(chosen)
```

### 4.2 New Tests to Add to `tests/test_printer_win32.py`

```python
    def test_21_is_virtual_printer_identifies_document_and_virtual_queues(self):
        """Verify is_virtual_printer flags PDF, XPS, OneNote, Fax, and file spoolers."""
        from core.printer_win32 import is_virtual_printer
        self.assertTrue(is_virtual_printer("Microsoft Print to PDF"))
        self.assertTrue(is_virtual_printer("Microsoft XPS Document Writer"))
        self.assertTrue(is_virtual_printer("OneNote for Windows 10"))
        self.assertTrue(is_virtual_printer("Fax"))
        self.assertTrue(is_virtual_printer("Virtual Print (PNG Export)"))
        self.assertTrue(is_virtual_printer("Virtual Print (PDF Export)"))
        self.assertTrue(is_virtual_printer("Adobe PDF"))
        self.assertTrue(is_virtual_printer("CutePDF Writer"))
        self.assertTrue(is_virtual_printer(None))
        self.assertTrue(is_virtual_printer(""))
        # Physical thermal and office printers should return False
        self.assertFalse(is_virtual_printer("Xprinter XP-370B"))
        self.assertFalse(is_virtual_printer("Zebra ZD420"))
        self.assertFalse(is_virtual_printer("Brother HL-L2350DW"))

    def test_22_detect_thermal_printer_virtual_only_returns_none(self):
        """Verify detect_thermal_printer returns None when only virtual/document writers exist."""
        virtual_printers = [
            "Microsoft Print to PDF",
            "Microsoft XPS Document Writer",
            "OneNote for Windows 10",
            "Fax",
            "Virtual Print (PNG Export)",
            "Virtual Print (PDF Export)"
        ]
        self.assertIsNone(detect_thermal_printer(virtual_printers))

    def test_23_detect_thermal_printer_prioritizes_thermal_over_virtual(self):
        """Verify thermal printer is selected even when virtual printers are in the list."""
        mixed = [
            "Microsoft Print to PDF",
            "Xprinter XP-370B",
            "Microsoft XPS Document Writer"
        ]
        self.assertEqual(detect_thermal_printer(mixed), "Xprinter XP-370B")

    def test_24_print_label_image_silent_fallback_on_none_printer(self):
        """Verify print_label_image(img, printer_name=None) executes silently and non-blocking."""
        import threading
        test_img = Image.new("1", (304, 200), color=1)
        res = []
        t = threading.Thread(target=lambda: res.append(print_label_image(test_img, None)), daemon=True)
        t.start()
        t.join(2.0)
        self.assertFalse(t.is_alive(), "print_label_image blocked calling thread!")
        self.assertTrue(len(res) > 0)
        ok, path = res[0]
        self.assertTrue(ok)
        self.assertTrue(os.path.exists(path))
        self.assertTrue(path.endswith(".png"))
        if os.path.exists(path):
            os.remove(path)

    def test_25_print_label_image_explicit_virtual_document_writers_non_blocking(self):
        """Verify explicitly passing PDF or XPS drivers routes to virtual print without GDI StartDoc."""
        test_img = Image.new("1", (304, 200), color=1)
        # Test PDF driver
        ok_pdf, path_pdf = print_label_image(test_img, printer_name="Microsoft Print to PDF")
        self.assertTrue(ok_pdf)
        self.assertTrue(os.path.exists(path_pdf))
        self.assertTrue(path_pdf.endswith(".pdf"))
        if os.path.exists(path_pdf):
            os.remove(path_pdf)

        # Test XPS driver (routes to PNG)
        ok_xps, path_xps = print_label_image(test_img, printer_name="Microsoft XPS Document Writer")
        self.assertTrue(ok_xps)
        self.assertTrue(os.path.exists(path_xps))
        self.assertTrue(path_xps.endswith(".png"))
        if os.path.exists(path_xps):
            os.remove(path_xps)
```

---

## 5. Verification Commands and Validation Matrix

### 5.1 Verification Matrix
| Test Case | Inputs | Expected Output | GDI StartDoc Called? | Blocks Thread? |
|---|---|---|---|---|
| Auto-Print on Default PC | `img, printer_name=None` | `(True, "path/label_*.png")` | **NO** | **NO (<0.06s)** |
| Detect Thermal (PDF only) | `["Microsoft Print to PDF"]` | `None` | **NO** | **NO** |
| Detect Thermal (XPS/OneNote) | `["Microsoft XPS Document Writer", "Fax"]` | `None` | **NO** | **NO** |
| Detect Thermal (Xprinter present) | `["PDF", "Xprinter XP-370B"]` | `"Xprinter XP-370B"` | **NO** | **NO** |
| Explicit PDF Printer | `img, "Microsoft Print to PDF"` | `(True, "path/label_*.pdf")` | **NO** | **NO (<0.06s)** |
| Explicit XPS Printer | `img, "Microsoft XPS Document Writer"` | `(True, "path/label_*.png")` | **NO** | **NO (<0.06s)** |
| Physical Thermal Mock | `img, "Xprinter XP-370B"` | `(True, "Printed successfully...")` | **YES (Mock)** | **NO** |

### 5.2 Verification Commands
To be run by the implementer and challenger after applying the proposed changes:

```powershell
# 1. Verify non-blocking execution of print_label_image with printer_name=None
python -c "import threading, time, os; from PIL import Image; from core.printer_win32 import print_label_image; img = Image.new('1', (304, 200), color=1); res = []; t = threading.Thread(target=lambda: res.append(print_label_image(img, None)), daemon=True); t.start(); t.join(2.0); print('BLOCKED:', t.is_alive()); print('SUCCESS:', res[0][0]); [os.remove(res[0][1]) if os.path.exists(res[0][1]) else None]"

# 2. Verify detect_thermal_printer returns None on current Windows setup
python -c "from core.printer_win32 import detect_thermal_printer; print('Detected thermal:', detect_thermal_printer())"

# 3. Run full printer test suite
python -m unittest tests/test_printer_win32.py -v

# 4. Run full adversarial test suite
python -m unittest tests/test_adversarial_m2.py -v
```
