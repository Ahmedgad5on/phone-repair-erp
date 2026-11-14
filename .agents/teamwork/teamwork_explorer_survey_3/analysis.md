# High-Precision 203 DPI Thermal Printing Engine, Database Architecture, and Standalone Packaging

**Component**: Thermal Printing Engine, Typography/Arabic Pipeline, Barcodes/QR, Windows GDI Silent Printing, SQLite Database, and PyInstaller Packaging  
**Explorer**: Explorer 3 (`teamwork_explorer_survey_3`)  
**Phase**: Phase 0 (Survey & Architectural Specification)  
**Target Platform**: Windows 10/11 x64  
**Primary Target Printer**: Xprinter XP-370B / 203 DPI ESC/POS & TSPL Thermal Label Printers  

---

## 1. Executive Summary & Architecture Map

Requirements **R3** (High-Precision Thermal Printing Engine) and **R4** (Database, Architecture & Standalone Packaging) govern the output, data persistence, and distribution pillars of the Mobile Phone Sales & Repair Lab Desktop Application.

Thermal label printing differs fundamentally from standard laser or inkjet document printing:
1. **Physical Dot Constraint**: 203.2 DPI thermal print heads have a fixed grid of physical heating elements spaced at exactly 8 dots per millimeter (0.125 mm per dot).
2. **Binary State**: Each thermal pin is either energised (burning black onto thermal paper) or off (white). There are no hardware shades of gray. Anti-aliasing gray fringes created by standard graphic pipelines translate into ragged edges, blurred text, and unreadable barcodes.
3. **Arabic Script Complexity**: Arabic characters require contextual ligature reshaping and bidirectional reordering before bitmap rasterization.
4. **Driver & Spooler Mechanics**: Windows printing must operate completely silently without modal print dialogs, utilizing direct GDI Device Contexts (`win32ui.CreateDC`) while providing virtual preview fallbacks on developer/host machines lacking physical thermal hardware.
5. **Standalone Portability**: Technicians require a single, zero-dependency executable (`.exe`) bundling ADB, libimobiledevice, fonts, templates, and runtime dependencies.

```
+----------------------------------------------------------------------------------------------------+
|                                    APPLICATION CORE ARCHITECTURE                                   |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ Data Sources ]             [ Processing Pipeline ]                 [ Output Sinks ]            |
|  - Android ADB / Fastboot ->  - Compact Smart Merge Layout Engine ->  - win32ui CreateDC (Silent) |
|  - iOS libimobiledevice   ->  - Arabic Reshaper + python-bidi     ->  - Virtual Print / PNG / PDF  |
|  - Service Intake Form    ->  - Code128 (barcode) & QR (qrcode)   ->  - Calibration Test Label     |
|                               - 1-Bit Mode '1' PIL Rasterizer     ->  - SQLite DB & Excel Export   |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. 203 DPI Native Monochrome Canvas & PIL Rendering Engine

### 2.1 Mathematical Scaling (203.2 DPI = 8 dots/mm)
Standard thermal label printers operate at an exact resolution of **203.2 DPI**:
$$\text{Resolution} = \frac{203.2 \text{ dots}}{25.4 \text{ mm}} = 8.000 \text{ dots/mm}$$

Every millimeter translates to exactly 8 pixels. Standard industry thermal sticker rolls scale to clean integer dimensions with zero pixel rounding errors:

| Preset Name | Dimensions (mm) | Canvas Width (px) | Canvas Height (px) | Usable Area (1mm Margin) | Primary Use Case |
|---|---|---|---|---|---|
| **Small Micro** | 38 x 25 mm | 304 px | 200 px | 288 x 184 px | Compact back-glass sticker |
| **Small Standard** | 40 x 25 mm | 320 px | 200 px | 304 x 184 px | Standard 3uTools mobile sticker |
| **Medium Shelf** | 50 x 30 mm | 400 px | 240 px | 384 x 224 px | Sales box & repair intake sticker |
| **Large Shelf** | 60 x 30 mm | 480 px | 240 px | 464 x 224 px | Full specs + dual barcode label |
| **Lab Intake** | 80 x 40 mm | 640 px | 320 px | 624 x 304 px | Complete workshop intake ticket |
| **Full Sheet** | 80 x 50 mm | 640 px | 400 px | 624 x 384 px | Large intake ticket with customer disclaimer |
| **Custom** | $W \times H$ mm | $W \times 8$ px | $H \times 8$ px | $(W-2M) \times 8 \times (H-2M) \times 8$ px | Arbitrary user rolls |

**Margin Calculation**:
- Default margin: $M = 1.0 \text{ mm} = 8 \text{ px}$ (top, bottom, left, right).
- High precision: Technicians can adjust margins in 0.5 mm steps (4 px increments).

### 2.2 1-Bit Monochrome Rendering (PIL mode '1') & Anti-Aliasing Elimination
When standard RGB/RGBA rendering engines draw text or lines, they apply anti-aliasing (sub-pixel grayscale smoothing). On a thermal print head:
- Intermediate gray pixels (values 30-220) get dithered or snapped by the printer's internal firmware.
- Dithering creates a noisy "spray" of isolated dots around fine letters.
- 6pt to 9pt fonts lose their counters (the hole in 'e', 'a', 'o', '0' fills with black).
- Barcode vertical bar edges become blurry, violating narrow-bar tolerances (X-dimension).

**The Native 1-Bit Canvas Pipeline**:
```python
from PIL import Image, ImageDraw, ImageFont

# Step 1: Create 1-bit native monochrome canvas (mode '1')
# 1 = White background (unheated thermal head), 0 = Black (heated pin)
canvas = Image.new('1', (width_px, height_px), color=1)
draw = ImageDraw.Draw(canvas)

# Step 2: Draw all vector lines, boxes, and text directly onto mode '1'
# In mode '1', draw.text() performs pure binary pixel rasterization
draw.rectangle((margin, margin, width_px - margin, height_px - margin), outline=0, width=1)
```

**Alternative Crisp Anti-Aliased Supersampling Strategy**:
If ultra-smooth vector fonts are preferred before binary burning:
1. Render canvas at **$2\times$ supersampling** (406 DPI, mode `'L'` grayscale).
2. Apply high-frequency unsharp thresholding:
   $$\text{Pixel}_{\text{out}} = \begin{cases} 0 \text{ (Black)} & \text{if } P < 168 \\ 1 \text{ (White)} & \text{if } P \ge 168 \end{cases}$$
3. Downsample to 203 DPI using `Image.NEAREST` or directly draw on mode `'1'` using TrueType bytecode hinting.
4. Investigation confirms: Drawing directly on mode `'1'` using Windows TrueType fonts (`segoeui.ttf`, `tahoma.ttf`) with hinting enabled produces razor-sharp, zero-blur text at 7pt-10pt.

### 2.3 Dynamic Layout Engine (Device Specs & Service Intake)
The rendering engine in `core/label_renderer.py` must decouple label data from visual presentation using a dynamic block layout:

```
+-------------------------------------------------------------+
| [MARGIN]                                                    |
|  #STK-1042                             [GRADE A+]           |  <- Header Row
|  Apple iPhone 13 Pro 256GB - Sierra Blue                    |  <- Title / Merged Row
|  SN: F2LYP012N6P1    |   Bat: 89% (412 Cycles)              |  <- Specs Row 1
|  IMEI1: 354892019482014   |  LL/A (USA)                     |  <- Specs Row 2
|  ||||||||||||||||||||||||||||||||||||||||||||||||||||||||   |  <- Code128 Barcode
|                     354892019482014                         |  <- Barcode Human Readable
| [MARGIN]                                                    |
+-------------------------------------------------------------+
```

### 2.4 "Compact Smart Merge" Algorithm & Coordinate Budget
On 38x25mm (304x200px) and 40x25mm (320x200px) stickers, vertical real estate is strictly capped at **200 pixels**.

**The Vertical Pixel Budget for 38x25mm**:
- Total Height: 200 px
- Top Margin (8 px) + Bottom Margin (8 px) = 16 px
- Printable Vertical Space: $200 - 16 = 184 \text{ px}$
- Barcode Area: 52 px (bars) + 14 px (text) + 6 px (spacing) = 72 px
- Remaining Space for Text: $184 - 72 = 112 \text{ px}$
- Average Line Height at 8pt font (with padding): 18 px
- Maximum readable lines: $112 / 18 \approx 6 \text{ lines}$

If unmerged, a full device specification requires 8-10 lines:
1. Stock Number
2. Brand
3. Model
4. Storage & RAM
5. Color
6. Battery Health & Cycles
7. Serial Number
8. IMEI 1
9. Condition Grade
10. Sales Region

**The Compact Smart Merge Algorithm**:
When "Compact Smart Merge" is toggled ON:
1. **Header Row (Y = 8 to 26 px)**:
   - Left: Stock Number `[ #STK-1042 ]` (9pt Bold)
   - Right: Condition Grade `[ Grade A+ ]` (8pt Bold pill box)
2. **Line 1 - Smart Merged Identity (Y = 28 to 46 px)**:
   - Evaluates: `{MarketingModel} {Storage} • {Color}`
   - Example: `iPhone 13 Pro 256GB • Blue`
   - Dynamic truncation: If length exceeds printable width, shorten `iPhone 13 Pro Max` to `iP 13 PM`.
3. **Line 2 - Smart Merged Diagnostics (Y = 48 to 64 px)**:
   - Evaluates: `Bat: {Battery}% • {Cycles}cy • {Region}`
   - Example: `Bat: 89% • 412cy • LL/A`
4. **Line 3 - Serial & IMEI (Y = 66 to 82 px)**:
   - Evaluates: `SN: {Serial}` (or dual SN / IMEI line)
5. **Line 4 - Barcode Bar (Y = 86 to 150 px)**:
   - Code128 barcode encoding Stock # or IMEI.
6. **Line 5 - Barcode Human Readable (Y = 152 to 168 px)**:
   - Human-readable number centered underneath.

**Coordinate Table for 38x25mm (304x200 px)**:

| Element | X Range (px) | Y Range (px) | Font Size / Height | Content Example |
|---|---|---|---|---|
| Border Box | 0 to 303 | 0 to 199 | 1px stroke | Alignment border (optional) |
| Stock # | 8 to 180 | 8 to 26 | 9pt Bold (~20px) | `#STK-1042` |
| Grade Badge | 210 to 296 | 8 to 26 | 8pt Bold (boxed) | `A+` |
| Merged Device Line | 8 to 296 | 28 to 46 | 8pt SemiBold (~18px)| `iPhone 13 Pro 256GB • Blue` |
| Diagnostics Line | 8 to 296 | 48 to 64 | 7.5pt Regular (~16px)| `Bat: 89% • 412cy • LL/A` |
| Serial Number Line | 8 to 296 | 66 to 82 | 7.5pt Mono (~16px) | `SN: F2LYP012N6P1` |
| Code128 Barcode | 20 to 284 | 86 to 148 | 62px height | Barcode bars (module width = 2px) |
| Barcode Text | 20 to 284 | 150 to 166 | 7pt Mono (~16px) | `354892019482014` |

---

## 3. Typography & Full Arabic Support Pipeline

### 3.1 Arabic Reshaping & Bi-Directional Algorithm Pipeline
Arabic text cannot be passed directly into standard PIL `draw.text()` because:
1. Arabic characters change form depending on position (isolated, initial, medial, final).
2. Arabic is written right-to-left (RTL), but PIL's default renderer renders left-to-right (LTR).
3. Without preprocessing, text appears disconnected and reversed (e.g. "م ر ح ب ا" instead of "مرحبا").

**The 2-Stage Processing Engine**:
```python
import arabic_reshaper
from bidi.algorithm import get_display

class TypographyEngine:
    def __init__(self):
        # Configure reshaper with ligature and presentation form support
        self.reshaper = arabic_reshaper.ArabicReshaper(configuration={
            'delete_harakat': False,
            'support_ligatures': True,
            'RIAL': True,
        })

    def process_text(self, text: str) -> str:
        if not text:
            return ""
        # Detect if text contains Arabic Unicode range (0x0600 - 0x06FF, 0x0750 - 0x077F)
        if any('\u0600' <= char <= '\u06FF' or '\u0750' <= char <= '\u077F' for char in text):
            # Step 1: Reshape contextual letter connections
            reshaped = self.reshaper.reshape(text)
            # Step 2: Apply Unicode Bidirectional Algorithm (UBA)
            return get_display(reshaped)
        return text
```

### 3.2 Mixed LTR/RTL Text Handling & Number Preservation
In service intake tickets, fields frequently mix Arabic and Latin script:
- Customer Name + Model: `أحمد علي - iPhone 14 Pro`
- Fault Description: `عطل شاشة + تغيير منفذ الشحن Type-C`
- Phone Numbers: `الهاتف: 01012345678`

**Edge-Case Guard: Phone Number Reversal**:
Under standard UBA rules, an Arabic sentence ending in a phone number may invert the digit blocks or hyphen order.
**Solution**: Enclose Latin strings, phone numbers, and IMEI codes in Unicode Directional Formatting Characters:
- LRE (Left-to-Right Embedding): `\u202A`
- PDF (Pop Directional Formatting): `\u202C`
- Example: `f"الهاتف: \u202A{phone}\u202C"` guarantees that `01012345678` renders strictly left-to-right.

### 3.3 Font Selection, System Font Paths & Bundled Open-Source Fallback
The survey confirmed the following system fonts exist in `C:\Windows\Fonts` on Windows:
- `C:\Windows\Fonts\segoeui.ttf` & `segoeuib.ttf` (Segoe UI / Segoe UI Bold): High legibility, complete Latin + Arabic character sets.
- `C:\Windows\Fonts\tahoma.ttf` & `tahomabd.ttf` (Tahoma): Historic gold standard for Arabic pixel hinting.
- `C:\Windows\Fonts\arial.ttf` & `arialbd.ttf` (Arial): Universal standard.

**Bundled Font Recommendation**:
To ensure 100% deterministic, cross-edition rendering independent of Windows host font changes, bundle an open-source font in `assets/fonts/`:
- **`Cairo-SemiBold.ttf`** or **`Tajawal-Medium.ttf`** (Google Fonts / SIL Open Font License).
- **Resolver Order**:
  1. `assets/fonts/Cairo-SemiBold.ttf` (bundled inside app)
  2. `C:\Windows\Fonts\segoeui.ttf` (system font)
  3. `C:\Windows\Fonts\tahoma.ttf` (system font)
  4. `C:\Windows\Fonts\arial.ttf` (system font)
  5. `ImageFont.load_default()` (failsafe fallback)

### 3.4 Point-to-Pixel Scaling at 203 DPI & Clipping Prevention
In typography, point sizes are calibrated to 72 points per inch. At 203.2 DPI:
$$\text{Pixel Height} = \text{Point Size} \times \frac{203.2}{72} \approx \text{Point Size} \times 2.822$$

| Point Size | Pixel Height at 203 DPI | Recommended Use |
|---|---|---|
| **6 pt** | 17 px | Micro labels, secondary disclaimers |
| **7 pt** | 20 px | IMEI / Serial numbers, specs rows |
| **8 pt** | 23 px | Device model, customer phone, intake fault |
| **9 pt** | 25 px | Customer name, stock ID |
| **10 pt** | 28 px | Section titles, ticket ID header |
| **12 pt** | 34 px | Large store header / banner |

**Clipping Prevention Protocol**:
Arabic characters contain tall ascenders (Alef, Lam: ا، ل) and deep descenders (Reh, Zain, Qaf: ر، ز، ق).
- PIL's legacy `font.getsize()` is **deprecated/removed in Pillow 10+**.
- Always use `draw.textbbox((x, y), text, font=font)`.
- Line step must be calculated as:
  $$\text{LineHeight} = (\text{bbox}[3] - \text{bbox}[1]) + 4 \text{ px (vertical padding)}$$
- Never hardcode fixed Y coordinates without verifying `textbbox`.

---

## 4. Barcode & QR Code Subsystems

### 4.1 1D Barcode (Code128) Generation via `python-barcode`
Code128 is the preferred 1D format for thermal printing:
- Supports full ASCII alphanumeric characters.
- High data density via automatic Code Set switching (A, B, and Code C for paired numeric digits).

```python
import barcode
from barcode.writer import ImageWriter

def generate_code128(data: str, target_height_px: int = 50, module_width_px: int = 2) -> Image.Image:
    CODE128 = barcode.get_barcode_class('code128')
    writer = ImageWriter()
    # Configure writer options in millimeters (converted to dots by writer)
    # At 203 DPI: 1 dot = 0.125 mm
    module_width_mm = module_width_px * 0.125
    writer.set_options({
        'module_width': module_width_mm,
        'module_height': target_height_px * 0.125,
        'quiet_zone': 2.0, # 2mm (~16 dots)
        'write_text': False, # Render human-readable text separately for precise typography
    })
    bc = CODE128(data, writer=writer)
    pil_img = bc.render()
    return pil_img.convert('1')
```

### 4.2 Module Width (X-Dimension) & Quiet Zone Enforcement
1. **Module Width (X-Dimension)**:
   - On a 203 DPI printer, module width **must be an integer multiple of 1 dot**:
     - `module_width = 1 dot` = 0.125 mm (4.9 mil)
     - `module_width = 2 dots` = 0.250 mm (9.8 mil) — **Optimal for thermal print heads**
     - `module_width = 3 dots` = 0.375 mm (14.8 mil)
   - Fractional dots (e.g. 1.5 dots) cause aliasing where adjacent bars merge, rendering the barcode unscannable.
2. **Quiet Zones (Margins)**:
   - Code128 standard mandates a quiet zone $\ge 10 \times \text{module width}$ on both sides.
   - For 2-dot module width: Quiet zone must be $\ge 20 \text{ dots}$ (2.5 mm).
   - If the barcode is pushed too close to the label edge, scanner lasers cannot establish contrast.

### 4.3 2D QR Code Generation via `qrcode` & Dynamic Density
QR codes are ideal when large payloads (JSON specs, ticket tracking URL, vCard) must fit on small labels:

```python
import qrcode

def generate_qr_code(payload: str, box_size_px: int = 3, border_modules: int = 2) -> Image.Image:
    qr = qrcode.QRCode(
        version=None, # Auto-detect smallest matrix version
        error_correction=qrcode.constants.ERROR_CORRECT_M, # 15% recovery
        box_size=box_size_px, # Integer pixels per module
        border=border_modules,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    return img.convert('1')
```

- At `box_size = 3` px per module:
  - Version 1 (21x21 modules + 4 border = 25x25): $25 \times 3 = 75 \text{ px}$ (9.3 mm).
  - Version 2 (25x25 modules + 4 border = 29x29): $29 \times 3 = 87 \text{ px}$ (10.8 mm).
  - Version 3 (29x29 modules + 4 border = 33x33): $33 \times 3 = 99 \text{ px}$ (12.3 mm).
- A 12 mm QR code easily fits alongside text on a 38x25mm label.

### 4.4 Automated Label Overflow Protection & Switching Rules
If a technician inputs a long IMEI or Stock ID on a small 38x25mm label:
- Code128 barcode width can exceed the usable 288 px canvas width.
- **Safety Rule**:
  ```python
  if barcode_image.width > max_available_width:
      # Step 1: Attempt generation at module_width = 1 px
      # Step 2: If still overflowing, automatically prompt or switch to QR code
  ```

---

## 5. Direct Windows GDI Silent Printing via pywin32

### 5.1 GDI Bitmap vs RAW ESC/POS/TSPL Architecture Decision
Thermal printers accept data via two methods on Windows:
1. **RAW Command Spooling (`win32print.WritePrinter`)**:
   - Sends raw printer commands (ESC/POS `GS v 0` or TSPL `BITMAP`).
   - *Problem*: Different thermal printers use mutually incompatible languages (Xprinter uses ESC/POS or TSPL depending on DIP switches; Zebra uses ZPL; TSC uses TSPL; Brother uses raster). If a user connects a Zebra printer to an ESC/POS raw spooler, it prints yards of blank paper or raw syntax errors.
2. **Windows GDI Direct Device Context (`win32ui.CreateDC`) — RECOMMENDED**:
   - Uses the official Windows printer driver.
   - Works universally across all thermal brands (Xprinter XP-370B, Zebra, TSC, Rongta, Gprinter) as well as virtual printers (`Microsoft Print to PDF`).
   - The driver translates the GDI bitmap into the exact proprietary thermal head pulses required.
   - Completely silent: Operates without displaying Windows print dialogs.

### 5.2 `win32print` & `win32ui` CreateDC Silent Printing Workflow
```python
import win32print
import win32ui
from PIL import Image, ImageWin

def print_label_gdi(image: Image.Image, printer_name: str = None, job_name: str = "MobileLab_Label"):
    if printer_name is None:
        printer_name = win32print.GetDefaultPrinter()

    # Ensure 1-bit or RGB compatibility
    if image.mode != 'RGB':
        # win32ui ImageWin.Dib handles 24-bit RGB or 1-bit monochrome cleanly
        img_to_print = image.convert('RGB')
    else:
        img_to_print = image

    # 1. Create Printer Device Context
    hDC = win32ui.CreateDC()
    hDC.CreatePrinterDC(printer_name)

    # 2. Query Printer Physical Printable Area
    horz_res = hDC.GetDeviceCaps(8)    # HORZRES
    vert_res = hDC.GetDeviceCaps(10)   # VERTRES
    dpi_x    = hDC.GetDeviceCaps(88)   # LOGPIXELSX
    dpi_y    = hDC.GetDeviceCaps(90)   # LOGPIXELSY

    # 3. Start Document & Page
    hDC.StartDoc(job_name)
    hDC.StartPage()

    # 4. Draw Device Independent Bitmap (DIB)
    dib = ImageWin.Dib(img_to_print)
    # Blit at 1:1 pixel coordinates (0, 0, width, height)
    dib.draw(hDC.GetHandleOutput(), (0, 0, img_to_print.width, img_to_print.height))

    # 5. Flush and End
    hDC.EndPage()
    hDC.EndDoc()
    hDC.DeleteDC()
```

### 5.3 HORZRES/VERTRES Capabilities & DPI Validation
Before sending the bitmap, the print engine queries:
- `LOGPIXELSX` and `LOGPIXELSY`: If printer reports 203 DPI, 1 pixel on canvas = 1 dot on head.
- If printer reports 300 DPI (e.g. high-res thermal or office printer), the engine scales the destination rectangle by $300 / 203.2 \approx 1.476$ to prevent shrunk labels.

### 5.4 Fallback Modes: Virtual Print, PNG Preview & PDF Generation
On development machines or when no thermal printer is attached (as discovered on this machine where only `Microsoft Print to PDF` is installed):
1. **Virtual Print to PNG**:
   - Saves rendered 1-bit monochrome image directly to `exports/labels/print_preview_{timestamp}.png`.
   - Opens image in UI center panel live WYSIWYG or default Windows photo viewer.
2. **Virtual Print to PDF**:
   - PIL supports direct PDF export with exact DPI metadata:
     `image.save("label.pdf", resolution=203.2)`
3. **Printer Auto-Detection & Selector**:
   - Enumerate all installed Windows printers using `win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)`.
   - Auto-select any printer matching keywords: `["Xprinter", "XP-370", "XP-", "POS", "Thermal", "Zebra", "TSC", "Barcode"]`.
   - If none found, gracefully default to `Virtual Preview / PDF Export`.

### 5.5 "Calibrate / Test Label" Generator
Technicians frequently deal with label drift (labels creeping up or down due to gap sensor miscalibration).
The application must feature a dedicated **"Calibrate / Test Label"** generator:
- **Outer Perimeter Rectangle**: 1-pixel solid black line drawn at `(0, 0, width-1, height-1)`. If the box is clipped, the printer gap sensor is misaligned.
- **Millimeter Ruler Ticks**:
  - Small ticks (4 px) at every 1 mm (8 px).
  - Medium ticks (8 px) at every 5 mm (40 px).
  - Major ticks (12 px) at every 10 mm (80 px) with numeric labels `10`, `20`, `30`, `40`.
- **Center Alignment Crosshair**:
  - Crosshair `+` at exact center `(W/2, H/2)` with circle.
- **Diagnostic Information**:
  - `TEST: 40x25mm (320x200 px) @ 203 DPI`
  - `CALIBRATION VERIFIED: 8 DOTS/MM`
  - Scannable test Code128 barcode: `TEST-XP370B`
  - Scannable test QR code: `MOBILE-LAB-203DPI`

---

## 6. SQLite Database Architecture & Historical Management

### 6.1 Database Schema (`core/database.py`)
A lightweight, zero-configuration SQLite3 database persists all printed labels and repair tickets.

```sql
-- 1. App Configuration and Templates
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS label_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL, -- 'specs' or 'repair'
    paper_size TEXT NOT NULL, -- '38x25mm', '40x25mm', etc.
    custom_width_mm REAL,
    custom_height_mm REAL,
    margin_mm REAL DEFAULT 1.0,
    compact_merge INTEGER DEFAULT 1,
    show_barcode INTEGER DEFAULT 1,
    barcode_type TEXT DEFAULT 'code128', -- 'code128' or 'qr'
    elements_config TEXT, -- JSON layout rules
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Device Specs Printed Labels Log (Inventory)
CREATE TABLE IF NOT EXISTS device_specs_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_number TEXT UNIQUE NOT NULL,
    brand TEXT,
    model TEXT,
    marketing_name TEXT NOT NULL,
    storage TEXT,
    ram TEXT,
    color TEXT,
    os_version TEXT,
    serial_number TEXT,
    imei1 TEXT,
    imei2 TEXT,
    battery_health INTEGER,
    battery_cycles INTEGER,
    sales_region TEXT,
    condition_grade TEXT DEFAULT 'Grade A',
    remarks TEXT,
    paper_size TEXT NOT NULL,
    barcode_type TEXT DEFAULT 'code128',
    print_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_printed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_specs_stock ON device_specs_labels(stock_number);
CREATE INDEX IF NOT EXISTS idx_specs_serial ON device_specs_labels(serial_number);
CREATE INDEX IF NOT EXISTS idx_specs_imei1 ON device_specs_labels(imei1);
CREATE INDEX IF NOT EXISTS idx_specs_model ON device_specs_labels(marketing_name);

-- 3. Service & Repair Intake Tickets
CREATE TABLE IF NOT EXISTS service_intake_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    device_model TEXT NOT NULL,
    reported_fault TEXT NOT NULL,
    passcode TEXT,
    sim_removed INTEGER DEFAULT 1,
    back_cracked INTEGER DEFAULT 0,
    dead_device INTEGER DEFAULT 0,
    estimated_cost REAL DEFAULT 0.0,
    status TEXT DEFAULT 'received', -- 'received', 'in_progress', 'ready', 'delivered'
    remarks TEXT,
    paper_size TEXT NOT NULL,
    print_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_printed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ticket_id ON service_intake_tickets(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_phone ON service_intake_tickets(customer_phone);
CREATE INDEX IF NOT EXISTS idx_ticket_customer ON service_intake_tickets(customer_name);
```

### 6.2 Auto-Incrementing Stock # & Ticket ID Generation with Manual Override
- **Stock Number Generation**:
  - Default pattern: `STK-{NEXT_ID:04d}` (e.g. `STK-1001`, `STK-1002`).
  - Next ID computed via:
    `SELECT COALESCE(MAX(id), 0) + 1 FROM device_specs_labels;`
  - Manual Override: User can enter custom stock codes (e.g. `IPH-13PM-01`). The database enforces uniqueness; if an existing stock number is reprinted, it updates `print_count = print_count + 1` and `last_printed_at = CURRENT_TIMESTAMP`.
- **Ticket ID Generation**:
  - Default pattern: `TCK-{YEAR}-{NEXT_ID:04d}` (e.g. `TCK-2026-0001`).

### 6.3 Thread-Safe WAL Mode Execution & High-Performance Search Filtering
Because background polling threads and UI events access the database concurrently:
1. **Enable WAL Mode**:
   `PRAGMA journal_mode = WAL;` (Write-Ahead Logging enables non-blocking concurrent reads during writes).
2. **Connection Management**:
   Use a thread-safe connection pool or dedicated context manager per operation:
   `sqlite3.connect(db_path, check_same_thread=False, timeout=15.0)`
3. **Multi-Field Instant Search**:
   As the user types into the bottom panel search box, run parameterized queries:
   ```sql
   SELECT id, stock_number, marketing_name, storage, color, battery_health, serial_number, imei1, condition_grade, print_count, created_at
   FROM device_specs_labels
   WHERE stock_number LIKE ? OR serial_number LIKE ? OR imei1 LIKE ? OR imei2 LIKE ? OR marketing_name LIKE ?
   ORDER BY id DESC LIMIT 200;
   ```

### 6.4 Excel (.xlsx) & CSV Export Logic
- **Excel Export (`openpyxl`)**:
  - Exports filtered or full inventory/tickets to `.xlsx`.
  - Luxury theme styling:
    - Header row: Fill `#1E1E1E` (Dark Charcoal), Font `#D4AF37` (Gold, Bold).
    - Data rows: Clean borders, alternating zebra shading.
    - Column auto-fit: Width dynamically calculated based on maximum string length.
- **CSV Fallback Export**:
  - Standard Python `csv` module with `utf-8-sig` encoding (UTF-8 with BOM) so Microsoft Excel opens Arabic text directly without character corruption.

### 6.5 1-Click Instant Reprint Flow
- Each row in the UI history table displays a "Reprint" button.
- Clicking "Reprint":
  1. Loads record row into memory.
  2. Constructs payload matching original layout.
  3. Invokes `label_renderer.render_specs_label(payload)`.
  4. Dispatches silent print to selected printer.
  5. Executes `UPDATE device_specs_labels SET print_count = print_count + 1, last_printed_at = CURRENT_TIMESTAMP WHERE id = ?`.
  6. Refreshes UI history table row.

---

## 7. Packaging, Bundling & Distribution Architecture

### 7.1 PyInstaller Spec Configuration (`--noconsole`, `--onedir` vs `--onefile`)
The application must run as a standalone Windows executable.

**Distribution Recommendation**:
- **Primary: `--onedir` distribution** (packaged as `MobileLab-v1.0.0-win64.zip` or Inno Setup installer).
  *Rationale*: Launch time is instantaneous (< 1 second). `--onefile` uncompresses 120MB+ into `%TEMP%` on every startup, introducing a 5-10 second launch delay.
- **Secondary: `--onefile` support** via `build_exe.bat` flag.

### 7.2 Discovered Host Binary Inventory
The survey conducted on this host discovered all required external tool binaries:
1. **Android ADB & Fastboot**:
   - Location: `C:\Users\Eng_Ahmed\AppData\Local\Android\Sdk\platform-tools\`
   - Required files to copy to `/bin`:
     - `adb.exe`
     - `fastboot.exe`
     - `AdbWinApi.dll`
     - `AdbWinUsbApi.dll`
     - `libwinpthread-1.dll`
2. **iOS libimobiledevice Suite**:
   - Location: `C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\`
   - Required files to copy to `/bin`:
     - `ideviceinfo.exe`
     - `idevice_id.exe`
     - `idevicediagnostics.exe`
     - `idevicepair.exe`
     - Required companion DLLs:
       - `imobiledevice.dll`
       - `usbmuxd.dll`
       - `plist.dll`
       - `libcrypto-3-x64.dll`
       - `libssl-3-x64.dll`
       - `libxml2.dll`
       - `iconv-2.dll`
       - `zlib1.dll`
       - `pthreadVC3.dll`

### 7.3 Dynamic Runtime Path Resolution (`core/paths.py`)
To ensure reliable operation whether running from source code or inside a PyInstaller frozen bundle:

```python
import sys
import os

def get_base_dir() -> str:
    """Returns application base directory, handling PyInstaller _MEIPASS."""
    if getattr(sys, 'frozen', False):
        return getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_bin_path(binary_name: str) -> str:
    """Resolves executable path from /bin, checking bundle, exe folder, and PATH."""
    base = get_base_dir()
    # Check bundled _MEIPASS/bin
    bundled_path = os.path.join(base, 'bin', binary_name)
    if os.path.isfile(bundled_path):
        return bundled_path

    # Check sibling bin directory next to .exe
    if getattr(sys, 'frozen', False):
        exe_bin = os.path.join(os.path.dirname(sys.executable), 'bin', binary_name)
        if os.path.isfile(exe_bin):
            return exe_bin

    # Check project root /bin (development mode)
    dev_bin = os.path.join(os.getcwd(), 'bin', binary_name)
    if os.path.isfile(dev_bin):
        return dev_bin

    # Fallback to system PATH
    return binary_name
```

### 7.4 `requirements.txt` Specifications
Verified Python 3.12 compatible versions:

```txt
# Desktop UI
PyQt6>=6.6.1

# 203 DPI Thermal Imaging & Graphics
Pillow>=10.4.0

# Windows GDI Silent Printing & Spooler
pywin32>=306

# Barcode & QR Code Engines
python-barcode>=0.15.1
qrcode>=7.4.2

# Typography & Arabic Reshaping Pipeline
arabic-reshaper>=3.0.0
python-bidi>=0.4.2

# Data Export & Persistence
openpyxl>=3.1.2

# Standalone Windows Packaging
pyinstaller>=6.5.0
```

### 7.5 `build_exe.bat` Production Automation Script
```bat
@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   Mobile Phone Sales & Repair Lab - Build Script
echo ========================================================

:: 1. Validate Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    exit /b 1
)

:: 2. Install Dependencies
echo [*] Installing dependencies from requirements.txt...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    exit /b 1
)

:: 3. Create /bin and copy required binaries if missing
if not exist "bin\adb.exe" (
    echo [*] Setting up bin directory...
    mkdir bin 2>nul
    copy /y "C:\Users\Eng_Ahmed\AppData\Local\Android\Sdk\platform-tools\adb.exe" "bin\"
    copy /y "C:\Users\Eng_Ahmed\AppData\Local\Android\Sdk\platform-tools\AdbWinApi.dll" "bin\"
    copy /y "C:\Users\Eng_Ahmed\AppData\Local\Android\Sdk\platform-tools\AdbWinUsbApi.dll" "bin\"
    copy /y "C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\ideviceinfo.exe" "bin\"
    copy /y "C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\idevice_id.exe" "bin\"
    copy /y "C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\idevicediagnostics.exe" "bin\"
    copy /y "C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\*.dll" "bin\"
)

:: 4. Run PyInstaller
echo [*] Building standalone executable with PyInstaller...
pyinstaller --noconfirm --onedir --windowed ^
    --name "MobileLabPrinter" ^
    --add-data "bin;bin" ^
    --add-data "assets;assets" ^
    --add-data "data;data" ^
    --hidden-import "win32print" ^
    --hidden-import "win32ui" ^
    --hidden-import "PIL" ^
    --hidden-import "qrcode" ^
    --hidden-import "barcode" ^
    --hidden-import "arabic_reshaper" ^
    --hidden-import "bidi" ^
    --hidden-import "openpyxl" ^
    main.py

if %errorlevel% equ 0 (
    echo ========================================================
    echo   [SUCCESS] Standalone application built successfully!
    echo   Executable located at: dist\MobileLabPrinter\MobileLabPrinter.exe
    echo ========================================================
) else (
    echo [ERROR] Build failed! Check PyInstaller output.
    exit /b %errorlevel%
)
```

---

## 8. Summary Table of Architecture Decisions & Implementation Checklist

| Subsystem | Key Architectural Decision | Rationale |
|---|---|---|
| **Canvas Resolution** | Fixed 203.2 DPI ($8\text{ dots/mm}$) integer pixel canvas | Eliminates interpolation blur on Xprinter XP-370B thermal head. |
| **Color Mode** | Native 1-bit mode `'1'` (black/white) | Eliminates gray anti-aliasing noise, preserves crisp font stems and barcode contrast. |
| **Small Stickers** | Compact Smart Merge (Model + Storage + Color + Bat%) | Compresses device specs into 1-2 lines to fit 200px vertical ceiling of 38x25mm labels. |
| **Arabic Pipeline** | `arabic_reshaper` + `python-bidi` with LRE/PDF isolation | Prevents disconnected letters and digit reversals on mixed customer/phone tickets. |
| **Fonts** | Segoe UI / Tahoma system fonts + bundled Cairo fallback | Guarantees clear glyphs at 7pt-10pt and cross-version font reliability. |
| **Barcodes** | Code128 with integer 2-dot module width + dynamic safety switch | Ensures instant handheld scanner readability; auto-switches to QR if payload overflows. |
| **Windows Printing** | GDI Direct Device Context (`win32ui.CreateDC`) | Driver-agnostic silent printing without print dialogs across all thermal printer brands. |
| **Dev Fallback** | Virtual Print to PNG / PDF preview | Allows 100% test coverage and development on host machines lacking physical thermal printers. |
| **Database** | SQLite3 with WAL mode and multi-column indexed search | Thread-safe, non-blocking background writes, instant search filtering, 1-click reprints. |
| **Packaging** | PyInstaller `--onedir` with dynamic `/bin` discovery | Sub-second launch time, bundled ADB and libimobiledevice suite, zero external prerequisites. |

---
*Report compiled by Explorer 3 (`teamwork_explorer_survey_3`) for Phase 0 Survey.*
