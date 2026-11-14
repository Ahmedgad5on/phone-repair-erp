# Technical Specification: Visual Identity, High-Precision Thermal Printing, PyQt6 Luxury UI & Store Inventory Audit

**Document Version**: 1.0.0  
**Target Milestone**: R1 (Visual Identity), R2 (UI & Audit), R4 (Thermal Printing Engine), R5 (Database & Persistence)  
**Author**: teamwork_spec_miner (`spec_miner_printing_ui`)  
**Authoritative Sources**: `ORIGINAL_REQUEST.md`, `PROJECT.md`, Existing Reference Codebase (`core/`, `ui/`, `tests/`), Windows GDI / Win32 Spooler API, ISO/IEC 15417 (Code128), ISO/IEC 18004 (QR Code).

---

## 1. Executive Summary & Architecture Overview

The system is a standalone Windows desktop application designed for mobile phone sales and repair workshops to extract real-time hardware telemetry from connected Android (ADB/Fastboot) and iOS devices, print high-precision 203 DPI monochrome thermal barcode labels silently via Windows GDI, manage repair intake ticketing, and perform rapid warehouse/store inventory barcode audits.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Visual Identity (R1)                                   │
│  assets/generate_icon.py ──► SSAA 1024x1024 ──► Lanczos ──► app_icon.ico (6 layers)   │
│                                                          ──► logo_header.png (128x128) │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
┌──────────────────────────────────────────▼─────────────────────────────────────────────┐
│                               Desktop UI Architecture (R2)                             │
│  MainWindow (PyQt6 Luxury Dark #121212, #1E1E1E, #D4AF37)                              │
│  ├─ Top Header: Logo, Title, USB Pills (ADB/Fastboot/iOS), Auto-Print, Mock Selector   │
│  ├─ Tab 1: Device Specs Form + 1-Click Visual Color Chips Bar (TAC auto-learn)         │
│  ├─ Tab 2: Service & Repair Intake Ticket Form (Bilingual Arabic/English)              │
│  ├─ Tab 3: Store Inventory Audit (Always-focused Barcode Input, Beep, Excel Export)   │
│  ├─ Center: Live WYSIWYG 203 DPI Preview (sub-20ms debounce, Zoom 100%-250%)          │
│  └─ Right: Printer & Preset Manager (XP-370B auto-detect, JSON templates)              │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
┌──────────────────────────────────────────▼─────────────────────────────────────────────┐
│                     High-Precision 203 DPI Thermal Printing (R4)                       │
│  Canvas: 8.0 dots/mm (203.2 DPI) ──► 1-bit Mode '1' monochrome (zero blur)             │
│  Compact Smart Merge: Model - Storage - Color - Batt%                                  │
│  Arabic CTL: arabic-reshaper + python-bidi + Unicode LRE/PDF number protection         │
│  Barcodes: Crisp 1-bit Code128 (quiet zone >= 20px) + Level M QR Code                 │
│  Silent Print: win32ui CreateDC ──► BitBlt / DIB ──► Direct Thermal Spooler            │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
┌──────────────────────────────────────────▼─────────────────────────────────────────────┐
│                          Database & Persistence Engine (R5)                            │
│  SQLite3 WAL Mode (5000ms busy timeout, foreign_keys=ON)                               │
│  ├─ inventory (Stock #, Serial, IMEI, Specs, Status: In Stock / Sold / In Repair)     │
│  ├─ repair_tickets (Ticket ID, Customer, Fault, Passcode, Checkboxes, Cost)           │
│  ├─ tac_color_map (TAC 8-digit prefix ──► Learned Color mapping)                       │
│  ├─ print_history (Audit log of all physical/virtual print events)                     │
│  ├─ audit_sessions (Session ID, Name, Expected, Scanned, Missing, Status)              │
│  └─ audit_items (Scanned items per session, Timestamp, Audit status)                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Visual Identity & Asset Generation Architecture (R1)

### 2.1 Brand Emblem Geometry & Vector Composition
The brand emblem embodies technical precision and luxury craftsmanship for high-end mobile labs. It is programmatically generated in `assets/generate_icon.py` without requiring external graphic design tools.

#### Canvas & Coordinate Framework:
- **Master Resolution**: $1024 \times 1024$ pixels, 32-bit RGBA (`mode='RGBA'`).
- **Color Palette**:
  * Root Shield Fill: Matte Black `#121212` (`RGB(18, 18, 18, 255)`)
  * Outer Shield Bezel: Metallic Gold `#D4AF37` (`RGB(212, 175, 55, 255)`), stroke width $24\text{ px}$
  * Inner Shield Accent Line: Light Gold `#F5DE87` (`RGB(245, 222, 135, 255)`), stroke width $6\text{ px}$
  * Phone Chassis Fill: Deep Charcoal `#1A1A1A` (`RGB(26, 26, 26, 255)`)
  * Phone Bezel Stroke: Warm Gold `#C5A028` (`RGB(197, 160, 40, 255)`), stroke width $8\text{ px}$
  * Barcode Bars: Solid Gold `#D4AF37`
  * Diagnostic Lightning Pulse: Electric Vivid Gold `#FFE57F` (`RGB(255, 229, 127, 255)`), stroke width $14\text{ px}$
  * Glow / Shadow: Multi-pass translucent gold overlay (`RGBA(212, 175, 55, 40)`)

#### Geometric Elements:
1. **Curved Medieval-Modern Shield Outline**:
   - Top edge: Horizontal line with rounded upper corners from $(160, 140)$ to $(864, 140)$ with a subtle crest arc rising to $(512, 110)$.
   - Lateral sides: Vertical descent from $y = 140$ to $y = 580$.
   - Bottom curve: Smooth cubic bezier taper from $(160, 580)$ and $(864, 580)$ converging symmetrically to a sharpened bottom tip at $(512, 940)$.
   - Parametric Polygon Coordinates (master 1024 grid):
     ```python
     shield_points = [
         (160, 160), (320, 130), (512, 110), (704, 130), (864, 160),
         (874, 200), (874, 560), (830, 680), (720, 800), (512, 940),
         (304, 800), (194, 680), (150, 560), (150, 200)
     ]
     ```
2. **Smartphone Silhouette**:
   - Centered inside the shield body: $X \in [340, 684]$ (width $344\text{ px}$), $Y \in [220, 800]$ (height $580\text{ px}$).
   - Corner radius: $42\text{ px}$ rounded rectangle.
   - Screen display area: Inset by $16\text{ px}$, $X \in [356, 668]$, $Y \in [250, 750]$.
   - Speaker Island / Dynamic Notch: Centered at top of screen $(X: 472\text{ to }552, Y: 260\text{ to }274)$, pill-shaped.
   - Home Indicator: Sub-bar centered at bottom $(X: 462\text{ to }562, Y: 736\text{ to }742)$.
3. **Thermal Barcode Bars**:
   - Positioned in upper half of phone screen: $Y \in [330, 480]$ (height $150\text{ px}$).
   - Rendered as vertical bars of varying widths matching a 1D Code128 pattern:
     ```python
     bar_pattern = [8, 4, 16, 8, 4, 12, 8, 4, 16, 4, 8, 12, 4, 8, 16, 8, 4]
     # alternating bars and spaces drawn in metallic gold (#D4AF37)
     ```
4. **Diagnostic Lightning Pulse (ECG / Pulse Waveform)**:
   - Traverses dynamically across the lower-center of the phone screen from $X = 220$ to $X = 804$.
   - Dynamic polyline representing telemetry signal:
     ```python
     pulse_points = [
         (240, 610), (380, 610), (410, 580), (430, 650),
         (470, 420), # Primary upward lightning peak
         (510, 720), # Deep downward strike
         (550, 550), (580, 630), (610, 610), (784, 610)
     ]
     ```
   - Drawn with $14\text{ px}$ stroke, rounded joints, and duplicate translucent underlay for neon diagnostic glow.

### 2.2 Supersampled Anti-Aliasing (SSAA) Rendering Pipeline
Direct rendering at low resolutions (e.g., 16x16 or 32x32) creates severe jagged artifacts and broken barcode lines. The SSAA pipeline guarantees broadcast-quality icons:
1. **Oversampling Phase**: Render the master composition onto a high-resolution $1024 \times 1024$ canvas (4x to 64x the target icon layers) in Pillow `RGBA` mode.
2. **Lanczos Downsample Filtering**: Downscale using 8-lobe windowed sync (`Image.Resampling.LANCZOS`).
3. **Alpha Preservation**: Alpha values are pre-multiplied during downscale to prevent dark fringing on transparent edges.

### 2.3 Multi-Resolution `.ico` Layer Specification
The file `assets/app_icon.ico` must encapsulate 6 distinct icon dimensions:

| Layer # | Dimensions (px) | Color Depth | Primary Windows Display Target |
|:-------:|:---------------:|:-----------:|:------------------------------|
| Layer 1 | $16 \times 16$  | 32-bit RGBA | Window title bar, File Explorer details list |
| Layer 2 | $32 \times 32$  | 32-bit RGBA | Desktop standard icon, Taskbar normal button |
| Layer 3 | $48 \times 48$  | 32-bit RGBA | File Explorer medium icons, Alt+Tab thumbnail |
| Layer 4 | $64 \times 64$  | 32-bit RGBA | High-DPI 200% Taskbar button, Windows Start Menu tile |
| Layer 5 | $128 \times 128$| 32-bit RGBA | File Explorer large icons, High-DPI displays |
| Layer 6 | $256 \times 256$| 32-bit PNG-compressed ICO | File Explorer extra-large icons, Task Switcher, Win11 Widgets |

**Pillow Export Implementation**:
```python
master_1024.save(
    "assets/app_icon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)
```

### 2.4 Header Logo (`assets/logo_header.png`)
- **Dimensions**: Exactly $128 \times 128$ pixels.
- **Format**: 32-bit PNG with transparent alpha background outside the shield border.
- **Usage**:
  * Displayed in top-left brand widget of `StatusBarPanel` ($36 \times 36\text{ px}$ scaled).
  * Application startup splash screen.
  * Default shop logo when user has not configured a custom lab logo.

### 2.5 Windows OS Integration & Taskbar Identity

#### 1. AppUserModelID Initialization:
Windows groups taskbar buttons by their Application User Model ID (AUMID). If not set explicitly, Windows pins the process to `python.exe` and displays the default Python snake icon.
```python
# main.py — MUST BE EXECUTED BEFORE ANY QT OBJECT IS CREATED
import sys
if sys.platform == "win32":
    import ctypes
    APP_ID = "ProLab.SmartLabeler.App.1.0"
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
```

#### 2. PyQt6 Window Icon Propagation:
```python
from PyQt6.QtGui import QIcon
from core.paths import get_asset_path

app = QApplication(sys.argv)
icon_path = get_asset_path("app_icon.ico")
app_icon = QIcon(icon_path)
app.setWindowIcon(app_icon)  # Sets default for all QMainWindow, QDialog, QMessageBox
```

#### 3. Programmatic Windows Desktop Shortcut Creation:
A dedicated script/utility function `core/shortcut.py` creates a shortcut on the user's desktop with the custom gold shield emblem:
- **Primary Mechanism**: PowerShell invocation via `subprocess` (zero extra pip dependencies):
  ```python
  def create_desktop_shortcut(target_exe: str, icon_path: str, shortcut_name: str = "ProLab Smart Labeler"):
      desktop = Path(os.environ["USERPROFILE"]) / "Desktop"
      lnk_path = desktop / f"{shortcut_name}.lnk"
      ps_cmd = f"""
      $WshShell = New-Object -ComObject WScript.Shell
      $Shortcut = $WshShell.CreateShortcut('{str(lnk_path)}')
      $Shortcut.TargetPath = '{str(target_exe)}'
      $Shortcut.WorkingDirectory = '{str(Path(target_exe).parent)}'
      $Shortcut.IconLocation = '{str(icon_path)},0'
      $Shortcut.Description = 'ProLab Smart Labeler - Mobile Sales & Repair Lab'
      $Shortcut.Save()
      """
      subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], check=True, creationflags=0x08000000)
  ```
- **Fallback Mechanism**: Python `win32com.client` if available.

---

## 3. High-Precision 203 DPI Thermal Printing Engine (R4)

### 3.1 203 DPI Exact Metric Scaling Formulas
Thermal printer heads (such as Xprinter XP-370B, Zebra ZD220, TSC TTP-244 Pro) operate at a hardware resolution of **203.2 dots per inch**:
$$\text{Dots per Millimeter} = \frac{203.2 \text{ dots/inch}}{25.4 \text{ mm/inch}} = 8.000000 \text{ dots/mm}$$

Therefore, the conversion formula from physical millimeters to integer print dots is:
$$\text{Pixels} = \operatorname{round}(\text{Dimension}_{\text{mm}} \times 8.0)$$

#### Standard Presets Dimension Table:
| Label Format (mm) | Width (dots/px) | Height (dots/px) | Usable Canvas (1mm margin) | Primary Commercial Application |
|:-----------------:|:---------------:|:----------------:|:--------------------------:|:-------------------------------|
| **38 x 25 mm**    | **304 px**      | **200 px**       | $288 \times 184\text{ px}$ | Compact phone back sticker (3uTools style) |
| **40 x 25 mm**    | **320 px**      | **200 px**       | $304 \times 184\text{ px}$ | Standard mobile sales sticker |
| **50 x 30 mm**    | **400 px**      | **240 px**       | $384 \times 224\text{ px}$ | Workshop Repair Intake Ticket |
| **60 x 30 mm**    | **480 px**      | **240 px**       | $464 \times 224\text{ px}$ | Detailed specs + Dual Barcode/QR |
| **80 x 40 mm**    | **640 px**      | **320 px**       | $624 \times 304\text{ px}$ | Large box / inventory carton tag |
| **80 x 50 mm**    | **640 px**      | **400 px**       | $624 \times 384\text{ px}$ | Full workshop ticket + customer receipt |

### 3.2 Margins & Boundary Math
- **Default Margin**: $1.0\text{ mm} = 8\text{ pixels}$.
- **Boundary Clamping**: Margin $M$ must satisfy $0 \le M \le \min(W/4, H/4)$.
- **Usable Rect**:
  $$X_{\min} = M_{\text{px}}, \quad Y_{\min} = M_{\text{px}}, \quad X_{\max} = W_{\text{px}} - M_{\text{px}}, \quad Y_{\max} = H_{\text{px}} - M_{\text{px}}$$

### 3.3 Compact Smart Merge Layout Algorithm (38x25 mm & 40x25 mm)
Small label stickers ($38\times25\text{ mm}$ and $40\times25\text{ mm}$) cannot accommodate vertical multi-line forms without overflowing the canvas or shrinking barcodes to unscannable dimensions.

The **Compact Smart Merge Algorithm** resolves this by consolidating multi-attribute telemetry into high-density composite lines:

```
┌────────────────────────────────────────────────────────┐ ◄─── y=8
│ #STK-000042                                     [A+]  │  Line 1: Stock No & Grade
├────────────────────────────────────────────────────────┤ ◄─── y=28 (Hairline rule)
│ iPhone 11 Pro - 256GB - Space Gray - 91%              │  Line 2: Compact Smart Merge
│ SN: F2LYP012N6P1                                      │  Line 3: Serial / IMEI
│ ┌────────────────────────────────────────────────────┐ │
│ │ |||| | |||||| || |||| |||||| |||| |||||||| ||||||| │ │  Bottom: Crisp Code128
│ └────────────────────────────────────────────────────┘ │  (Height: 46px, Quiet: 20px)
│                     STK-000042                         │  Human-readable text (6pt)
└────────────────────────────────────────────────────────┘ ◄─── y=192
```

#### Merge String Formula:
$$\text{Line}_{\text{merge}} = \operatorname{join}\Big(\text{" - "}, \big[\text{Model}, \text{Storage}, \text{Color}, \text{Battery\%}\big]\Big)$$
- If battery health is `None` or $\le 0$, it is omitted.
- If rendered text width $> W_{\text{usable}}$, the algorithm dynamically breaks into two 7.0pt lines:
  * Line 2a: $\text{Marketing Name}$ (e.g., `Samsung Galaxy S24 Ultra`)
  * Line 2b: $\text{Storage} \bullet \text{Color} \bullet \text{Battery\%}$ (e.g., `512GB • Titanium Gray • 100%`)

### 3.4 1-Bit Monochrome Barcode & QR Code Engine

#### Native 1-Bit Monochrome Canvas (`mode='1'`):
- The rendering canvas is created as `Image.new("1", (W, H), color=1)` (1 = White, 0 = Black).
- Antialiasing is strictly forbidden for thermal printing. Antialiasing introduces intermediate gray levels ($0 < v < 255$) which convert into erratic dither patterns on thermal heads, causing scanner failure.

#### Code128 1D Barcode Pipeline:
- **Module Width ($X$)**: Default $2\text{ pixels}$.
  If data length causes total barcode width to exceed $W_{\text{usable}}$, downscale $X$ to $1\text{ pixel}$.
- **Quiet Zones**: ISO/IEC 15417 specifies $\ge 10X$. For $X = 2\text{ px}$, lateral quiet zone must be $\ge 20\text{ px}$ (or $10\text{ px}$ on compressed layouts).
- **Height**: $40\text{ to }55\text{ pixels}$.
- **Checksum**: Modulo 103 checksum calculated across Subsets A/B/C.

#### 2D QR Code Pipeline:
- **Standard**: ISO/IEC 18004.
- **Error Correction**: Level M (15% recovery) or Level L for high density.
- **Integer Module Scaling (`box_size`)**:
  Calculated via integer division: `box_size = max(2, max_size_px // matrix_dim)`.
  Fractional resizing is prohibited to ensure perfect 1:1 pin alignment.

### 3.5 Arabic Text Complex Layout & BiDi Pipeline
Because Pillow's `ImageDraw.text` does not support OpenType GSUB tables, raw Arabic characters render disconnected and reversed. The printing engine incorporates a deterministic two-stage typography pipeline:

```
Raw Arabic Input: "استلام صيانة - هاتف iPhone 15 Pro - 01012345678"
       │
       ▼
[Span Protection Regex] ──► Wraps Phone / IMEI / Model in \u202A ... \u202C
       │
       ▼
[Stage 1: arabic-reshaper] ──► Converts U+0600..U+06FF to Presentation Forms U+FE70..U+FEFC
       │                       (Handles initial, medial, final glyphs & Lam-Alef ligatures)
       ▼
[Stage 2: python-bidi] ──────► get_display() reverses visual order for LTR rasterizer
       │
       ▼
[Pillow ImageDraw.text] ─────► Renders with Segoe UI / Tahoma / Arial TTF font
```

#### Unicode Protection Spans:
- Phone numbers, IMEIs, and Latin alphanumeric codes are protected from bidirectional digit flipping by enclosing them in **Unicode Left-to-Right Embedding (`\u202A`)** and **Pop Directional Formatting (`\u202C`)**.
- Regular expressions identify:
  1. Phone numbers: `(\+?\d[\d\s\-\.]{5,}\d)`
  2. Standalone IMEIs: `(\b\d{14,16}\b)`
  3. Alphanumeric model codes: `(\b(?:\d+[\s\-]*)?[A-Za-z][A-Za-z0-9\-\.\/\+ ]*)`

### 3.6 Direct Windows GDI Silent Printing Pipeline
Windows thermal printing must occur without spawning system print dialogs (`PrintDlg`) or third-party PDF readers.

```
PIL Image (mode '1') ──► Convert to RGB ──► ImageWin.Dib(rgb_img)
                                                  │
 win32print.OpenPrinter(printer_name)              │
                 │                                │
 win32ui.CreateDC() ──► CreatePrinterDC()          │
                 │                                │
           hDC.StartDoc("Thermal Label")          │
           hDC.StartPage()                        │
                 │                                │
           dib.draw(hDC.GetHandleOutput(), dst_rect) ◄─── Direct GDI Blit
                 │
           hDC.EndPage()
           hDC.EndDoc()
           hDC.DeleteDC()
```

#### Device Capabilities & Coordinate Scaling:
- Inspect `_LOGPIXELSX` and `_LOGPIXELSY`.
- If the printer driver reports non-203 DPI (e.g., 300 DPI or 600 DPI on an office printer), coordinate scaling factors $S_x = \text{DPI}_x / 203.2$ and $S_y = \text{DPI}_y / 203.2$ scale the destination bounding box while preserving label physical dimensions.
- Error Handling:
  * On failure: invoke `hDC.AbortDoc()` to cancel corrupted spooler jobs.
  * In `finally` block: invoke `hDC.DeleteDC()` to prevent GDI resource leaks.
  * Virtual Fallback: When no physical thermal printer is connected, output is routed silently to `exports/labels/*.png` (native 203 DPI 1-bit) or `*.pdf`.

---

## 4. UI Layout, Navigation & Store Inventory Audit Architecture (R2)

### 4.1 PyQt6 Luxury Dark Mode QSS Stylesheet System
The desktop application adheres to an obsidian/charcoal luxury dark aesthetic accented with warm metallic gold:

```css
/* Core Palette Tokens */
/* Root Background: #121212 | Card Surfaces: #1E1E1E | Inputs: #262626 */
/* Gold Accents: #D4AF37 | Gold Hover: #E5C158 | Borders: #333333 */

QMainWindow, QDialog {
    background-color: #121212;
    color: #FFFFFF;
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 13px;
}

QFrame.CardFrame, QFrame#CardFrame {
    background-color: #1E1E1E;
    border: 1px solid #333333;
    border-radius: 8px;
}

QLineEdit, QComboBox, QTextEdit {
    background-color: #262626;
    border: 1px solid #3A3A3A;
    border-radius: 4px;
    color: #FFFFFF;
    padding: 6px 10px;
}

QLineEdit:focus, QComboBox:focus, QTextEdit:focus {
    border: 1px solid #D4AF37;
    background-color: #2D2D2D;
}

QPushButton.PrimaryButton, QPushButton#PrimaryButton {
    background-color: #D4AF37;
    color: #121212;
    font-weight: bold;
    border-radius: 5px;
    padding: 8px 16px;
    border: none;
}

QPushButton.PrimaryButton:hover {
    background-color: #E5C158;
}
```

### 4.2 Top Header & Real-Time Status Bar
- **Logo Widget**: Renders `assets/logo_header.png` ($36 \times 36\text{ px}$).
- **App Title**: `⚡ ProLab Smart Labeler` in bold metallic gold `#D4AF37`.
- **USB Connection Badges (Pills)**:
  * Android ADB Pill: Green (`#2E7D32`) when device connected; dark gray (`#262626`) when disconnected.
  * Fastboot Pill: Warning Orange (`#F57F17`) when Android in bootloader.
  * iOS Pill: Apple Green/Blue (`#1E40AF` / `#2E7D32`) when iPhone/iPad detected.
- **Controls**:
  * "Auto-Print on Connect" QCheckBox with connection idempotency guard (prints once per unique serial/UDID).
  * Hardware Source Selector (Live USB Polling vs Mock Presets).
  * Shop & Logo Settings Button (`⚙️ إعدادات المحل`).
  * Drivers Installer Button (`🔧 التعريفات`).
  * Bilingual Switcher (`🇬🇧 English` / `🇸🇦 العربية`).

### 4.3 Tab 1: Device Specs Label (Sales/Inventory - 3uTools Style)
- **Auto-Incrementing Stock Number**: Formatted as `#STK-000001` with lock/unlock manual override.
- **Editable Form Fields**: Brand, Model Marketing Name, Model Code, Storage (32GB to 1TB), RAM, Color, OS Version, Region (LL/A, etc.), Serial Number, IMEI 1 & IMEI 2, Battery Health %, Charge Cycles, Condition Grade (New, A+, A, B, C), Remarks.
- **1-Click Visual Color Chips Bar**:
  * Located immediately below the Color input field.
  * 8 Quick Color Buttons:
    1. ⬛ Black (`#1A1A1A`, white text)
    2. ⬜ White (`#F5F5F7`, dark text)
    3. 🟨 Gold (`#D4AF37`, dark text)
    4. 🪙 Silver (`#C0C0C0`, dark text)
    5. 🟦 Blue (`#1E3A8A`, white text)
    6. 🟩 Green (`#14532D`, white text)
    7. 🟪 Purple (`#581C87`, white text)
    8. 🔘 Titanium (`#78716C`, white text)
  * **Operational Workflow**:
    1. Single click instantly populates `edit_color.setText(color_name)` in $<0.2\text{ s}$.
    2. Automatically extracts TAC (first 8 digits of current IMEI 1).
    3. Commits `(tac, marketing_name, color)` into SQLite table `tac_color_map`.
    4. Future connected devices with the same TAC automatically resolve to this learned color!

### 4.4 Tab 2: Service & Repair Intake Label (استلام صيانة)
- **Auto-Generated Ticket ID**: Sequential `TKT-000001`.
- **Intake Date/Time**: Auto-stamped current timestamp (`YYYY-MM-DD HH:MM`).
- **Customer Information**: Customer Name (bilingual), Customer Phone number.
- **Device & Diagnostics**: Device Model, Reported Fault (Arabic/English presets: شاشة مكسورة, قاطع شحن, تغيير بطارية, etc.), Screen Passcode / Pattern PIN.
- **Security Checkboxes**:
  * `[x] SIM Removed` (default checked)
  * `[ ] Back Glass Cracked` (default unchecked)
  * `[ ] Dead Device / قاطع باور` (default unchecked)
- **Financial**: Estimated Repair Cost.

### 4.5 Tab 3: Store Inventory Audit (الجرد الذكي بالباركود)
A dedicated warehouse auditing tab designed for high-speed stock verification using USB/wireless 1D/2D barcode scanners.

#### Component Layout & Operational Flow:
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Session: [ Session 2026-11-08 (Active) ▼ ]   [ + New Audit Session ]   [ Export Excel ]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│  ⚡ SCAN BARCODE: [ |||||||||||||||||||||||||||||||||||||||||||||||||| ] (ALWAYS FOCUSED)│
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [ Total In Stock: 142 ]   [ Verified: 98 ]   [ Missing: 44 ]   [ Unknown: 2 ]         │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│  VERIFIED PRESENT (98)                    │  PENDING / MISSING (44)                    │
│  ┌──────────┬─────────────┬─────────────┐ │  ┌──────────┬─────────────┬──────────────┐ │
│  │ Stock #  │ Model       │ Scanned At  │ │  │ Stock #  │ Model       │ Serial       │ │
│  ├──────────┼─────────────┼─────────────┤ │  ├──────────┼─────────────┼──────────────┤ │
│  │ STK-0001 │ iPhone 13   │ 14:02:11    │ │  │ STK-0045 │ Galaxy S23  │ R5CW819201   │ │
│  │ STK-0002 │ S24 Ultra   │ 14:02:19    │ │  │ STK-0046 │ 14 Pro Max  │ F2LYP88921   │ │
│  └──────────┴─────────────┴─────────────┘ │  └──────────┴─────────────┴──────────────┘ │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

#### Detailed Tab 3 Behaviors:
1. **Always-Focused High-Speed Scanner Input (`edit_barcode_scanner`)**:
   - Tab event filter automatically restores focus to `edit_barcode_scanner` on window focus or after any table interaction.
   - On pressing `Enter` (the standard carriage return emitted by hardware barcode scanners):
     * Retrieves barcode string (Stock #, Serial, or IMEI).
     * Clears input box immediately ready for next scan ($<50\text{ ms}$).
2. **SQLite In-Stock Fetch & Verification**:
   - Queries `inventory` where `status = 'In Stock'`.
   - If barcode matches an expected in-stock item:
     * Moves item from Pending table to Verified Present table.
     * Records scan in `audit_items` table with timestamp.
     * Emits pleasant high-pitch audio beep (`winsound.Beep(1800, 100)`).
     * Updates live KPI counters.
   - If barcode matches an already verified item:
     * Emits warning audio chime; displays status bar notice: "Already Verified".
   - If barcode is unknown / not in inventory:
     * Increments "Unknown Serials" counter.
     * Emits double low-pitch error tone (`winsound.Beep(600, 150)`).
     * Adds entry to Unknown Scans log.
3. **Excel Audit Report Export (`openpyxl`)**:
   - Button: `📊 Export Audit Report to Excel (.xlsx)`.
   - Generates workbook with three luxury-styled worksheets:
     * **Audit Summary**: Session metadata, completion %, total items, present count, missing count, unknown count.
     * **Verified Present**: Stock #, Model, Serial, IMEI, Verification Timestamp.
     * **Missing Discrepancies**: Highlighting missing inventory with red warning fills.

### 4.6 Center & Right Designer & Printer Manager
- **Center WYSIWYG Preview (`WysiwygPreviewPanel`)**:
  * Real-time 203 DPI canvas preview dynamically updating on every keystroke ($40\text{ ms}$ debounce).
  * Zoom Controls: 100% (true 203 DPI scale), 150%, 200%, 250%.
  * Dimension Badge: `38x25 mm (304x200 px)`.
  * Toggles: Compact Smart Merge (On/Off), Field Titles (On/Off), Barcode mode (Code128 / QR / Both).
- **Right Printer Manager (`PrinterManagerPanel`)**:
  * Windows printer dropdown with auto-detection (prioritizes Xprinter XP-370B, Zebra, TSC).
  * Paper preset selector (38x25, 40x25, 50x30, 60x30, 80x40, 80x50 mm).
  * Margin spinbox (default 1.0 mm = 8 px).
  * Orientation selector (Vertical / Transverse).
  * JSON Template Save / Load / Delete engine.
  * Direct action buttons: "🖨 Silent Print", "📄 Virtual Export (PNG/PDF)", "📏 Calibration Test".

---

## 5. Database & Inventory Schema Architecture (R5)

### 5.1 SQLite3 Pragmas & Concurrency
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
```

### 5.2 Complete Table Schemas (DDL)

```sql
-- 1. Inventory & Device Catalog
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_number TEXT UNIQUE NOT NULL,      -- e.g. 'STK-000001'
    brand TEXT NOT NULL,                    -- e.g. 'Apple', 'Samsung'
    marketing_name TEXT NOT NULL,           -- e.g. 'iPhone 11 Pro'
    model_code TEXT,                        -- e.g. 'MWCH2LL/A', 'SM-S928B'
    storage TEXT,                           -- e.g. '256GB'
    ram TEXT,                               -- e.g. '8GB'
    color TEXT,                             -- e.g. 'Space Gray'
    os_version TEXT,                        -- e.g. 'iOS 17.5.1'
    serial_number TEXT UNIQUE NOT NULL,     -- Hardware Serial
    imei1 TEXT UNIQUE NOT NULL,             -- Primary 15-digit IMEI
    imei2 TEXT,                             -- Optional secondary IMEI
    battery_health INTEGER,                 -- Percentage 0-100
    battery_cycles INTEGER,                 -- Charge cycle count
    sales_region TEXT,                      -- e.g. 'LL/A'
    condition_grade TEXT DEFAULT 'A+',      -- 'New', 'A+', 'A', 'B', 'C'
    status TEXT NOT NULL DEFAULT 'In Stock',-- 'In Stock', 'Sold', 'In Repair', 'Returned'
    purchase_cost REAL DEFAULT 0.0,
    selling_price REAL DEFAULT 0.0,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Workshop Service & Repair Tickets
CREATE TABLE IF NOT EXISTS repair_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT UNIQUE NOT NULL,         -- e.g. 'TKT-000001'
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    device_model TEXT NOT NULL,
    reported_fault TEXT NOT NULL,
    passcode TEXT,                          -- Screen PIN or pattern
    sim_removed INTEGER DEFAULT 1,          -- 1 = True, 0 = False
    back_cracked INTEGER DEFAULT 0,
    dead_device INTEGER DEFAULT 0,
    estimated_cost REAL DEFAULT 0.0,
    intake_datetime TEXT NOT NULL,
    ticket_status TEXT DEFAULT 'Open',       -- 'Open', 'In Progress', 'Completed', 'Delivered'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Self-Learning TAC (Type Allocation Code) to Color Mapping
CREATE TABLE IF NOT EXISTS tac_color_map (
    tac TEXT NOT NULL,                      -- First 8 digits of IMEI (e.g. '35890123')
    model_name TEXT NOT NULL,               -- e.g. 'iPhone 11 Pro'
    color TEXT NOT NULL,                    -- e.g. 'Space Gray'
    frequency INTEGER DEFAULT 1,            -- Learned count
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tac, color)
);

-- 4. Thermal Print Audit History
CREATE TABLE IF NOT EXISTS print_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_number TEXT,
    ticket_id TEXT,
    label_type TEXT NOT NULL,               -- 'device_specs', 'repair_ticket', 'calibration'
    width_mm INTEGER NOT NULL,
    height_mm INTEGER NOT NULL,
    printer_name TEXT NOT NULL,             -- Windows printer or 'Virtual PNG'
    status TEXT NOT NULL DEFAULT 'Success', -- 'Success', 'Failed'
    printed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Store Inventory Audit Sessions
CREATE TABLE IF NOT EXISTS audit_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,             -- e.g. 'Audit 2026-11-08'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    total_expected INTEGER DEFAULT 0,
    total_scanned INTEGER DEFAULT 0,
    total_missing INTEGER DEFAULT 0,
    total_unknown INTEGER DEFAULT 0,
    status TEXT DEFAULT 'In Progress'       -- 'In Progress', 'Completed', 'Archived'
);

-- 6. Store Inventory Audit Scanned Items
CREATE TABLE IF NOT EXISTS audit_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES audit_sessions(id) ON DELETE CASCADE,
    stock_number TEXT,
    serial_number TEXT,
    imei1 TEXT,
    scanned_barcode TEXT NOT NULL,
    scan_status TEXT NOT NULL,              -- 'Verified', 'Unexpected', 'Duplicate'
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5.3 Performance & Covering Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_inv_serial ON inventory(serial_number);
CREATE INDEX IF NOT EXISTS idx_inv_imei1 ON inventory(imei1);
CREATE INDEX IF NOT EXISTS idx_inv_stock ON inventory(stock_number);
CREATE INDEX IF NOT EXISTS idx_inv_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_inv_model ON inventory(marketing_name);
CREATE INDEX IF NOT EXISTS idx_tickets_phone ON repair_tickets(customer_phone);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id ON repair_tickets(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tac_prefix ON tac_color_map(tac);
CREATE INDEX IF NOT EXISTS idx_audit_sess_id ON audit_items(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_scanned ON audit_items(scanned_barcode);
```

### 5.4 Backward Compatibility & Migration Strategy
The current database file `data/app.db` contains `printed_labels` and `repair_tickets`. To ensure non-breaking upgrades:
1. `printed_labels` is aliased or mapped to `print_history`.
2. Existing records in `printed_labels` can be seamlessly migrated into `inventory` by running:
   ```sql
   INSERT OR IGNORE INTO inventory (
       stock_number, brand, marketing_name, model_code, storage, ram, color,
       os_version, serial_number, imei1, imei2, battery_health, battery_cycles,
       sales_region, condition_grade, remarks, created_at
   )
   SELECT stock_number, brand, marketing_name, model_code, storage, ram, color,
          os_version, serial_number, imei1, imei2, battery_health, battery_cycles,
          sales_region, condition_grade, remarks, created_at
   FROM printed_labels;
   ```

---

## 6. Features Discovered Table

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Visual Identity | SSAA Emblem Generator | Generates luxury gold/black shield brand icon via 1024x1024 SSAA downsampled with Lanczos | Execution of `generate_icon.py` | `assets/app_icon.ico` (6 sizes) & `assets/logo_header.png` | Creates directory if missing; logs error | ORIGINAL_REQUEST R1 |
| 2 | Visual Identity | AppUserModelID Taskbar Identity | Decouples Python exe from Windows taskbar, ensuring custom gold icon in Taskbar | String `"ProLab.SmartLabeler.App.1.0"` | Windows shell process registration | Catches OS error silently | ORIGINAL_REQUEST R1 |
| 3 | Visual Identity | Desktop Shortcut Creator | Programmatically creates a desktop shortcut with `app_icon.ico` using PowerShell COM | Target exe & icon path | `.lnk` file on Desktop | Raises error if PowerShell is restricted | ORIGINAL_REQUEST R1 |
| 4 | Printing Engine | 203 DPI Coordinate Scaler | Converts physical millimeters to exact print dots at 8.000 dots/mm ($203.2 / 25.4$) | mm dimension float | Integer pixel dots | Returns integer rounded half-up | ORIGINAL_REQUEST R4 |
| 5 | Printing Engine | Compact Smart Merge | Merges Model + Storage + Color + Battery % into concise single lines for small stickers | Specs fields | Single formatted string or 2 wrapped lines | Omits battery if None or $\le 0$ | ORIGINAL_REQUEST R4 |
| 6 | Printing Engine | 1-Bit Monochrome Purity | Generates strictly binary mode `'1'` canvas (0=Black, 1=White) without gray blur | Render calls | PIL Image mode `'1'` | Raises error if invalid dimensions | ORIGINAL_REQUEST R4 |
| 7 | Printing Engine | Code128 Barcode Engine | Crisp 1-bit thermal Code128 with $2\text{ px}$ module width and $\ge 20\text{ px}$ quiet zones | Data string, height, module width | PIL Image mode `'1'` | Auto-compresses module to 1px if constrained | ORIGINAL_REQUEST R4 |
| 8 | Printing Engine | 2D QR Code Engine | Level M QR code with integer module scaling (no fractional blurring) | Payload string, max px | PIL Image mode `'1'` | Pure Python fallback if qrcode missing | ORIGINAL_REQUEST R4 |
| 9 | Printing Engine | Arabic CTL & BiDi Pipeline | Two-stage reshaping (`arabic-reshaper`) and visual reversal (`python-bidi`) | Arabic text string | Properly connected RTL reshaped string | Protects embedded digits with LRE/PDF | ORIGINAL_REQUEST R4 |
| 10 | Printing Engine | Direct Windows GDI Silent Printing | Direct blit to printer DC via `win32print` / `win32ui` without popups or viewers | PIL Image, printer name | Direct print job to spooler | AbortDoc() on failure; fallback to PNG | ORIGINAL_REQUEST R4 |
| 11 | UI & Navigation | Luxury Dark Theme QSS | Master stylesheet with #121212 background, #1E1E1E cards, and #D4AF37 gold accents | PyQt6 widgets | Styled UI components | Default Qt fallback if CSS error | ORIGINAL_REQUEST R2 |
| 12 | UI & Navigation | 1-Click Visual Color Chips | 8 color buttons beneath Color field for 0.2s override & SQLite TAC learning | Button click (Black..Titanium) | Color field populated; SQLite TAC updated | No crash if IMEI is missing | ORIGINAL_REQUEST R2 |
| 13 | UI & Navigation | Auto-Print Idempotency Guard | Triggers print automatically on USB plug-in, but only once per unique serial | DeviceSpecs signal | Silent print job execution | Skips duplicate prints for same device | ORIGINAL_REQUEST R2 |
| 14 | UI & Navigation | Live WYSIWYG 203 DPI Preview | Sub-20ms live thermal canvas preview with debounced rendering and 100%-250% zoom | Specs changes, preset changes | QPixmap display on card canvas | Debounce timer prevents UI stutter | ORIGINAL_REQUEST R2 |
| 15 | UI & Navigation | Store Inventory Audit (Tab 3) | Rapid barcode scanning reconciliation against in-stock database records | USB Barcode scanner input | Scanned item moved; audio beep emitted | Double beep for duplicates/unknowns | ORIGINAL_REQUEST R2 |
| 16 | UI & Navigation | Store Audit Excel Export | Generates multi-sheet .xlsx audit discrepancy report with luxury headers | Session ID / Table rows | openpyxl `.xlsx` file | Returns False on file lock error | ORIGINAL_REQUEST R2 |
| 17 | Database | SQLite WAL Multi-Table Schema | Persistent storage for inventory, tickets, TAC color map, print history, audit | SQL queries & dataclasses | Committed rows in SQLite | 5000ms busy timeout prevents lockouts | ORIGINAL_REQUEST R5 |
| 18 | Database | TAC Color Self-Learning | Learns device color associations from first 8 IMEI digits across brands | TAC string, model, color | Upserted record in `tac_color_map` | Ignores malformed TACs | ORIGINAL_REQUEST R3, R5 |

---

## 7. Edge Cases & Boundary Conditions Matrix

| # | Feature | Input / Boundary Condition | Expected & Observed Behavior |
|---|---------|----------------------------|------------------------------|
| 1 | Canvas Scaling | Fractional millimeter inputs (e.g. $38.4\text{ mm}$, $38.5\text{ mm}$) | Strict half-up integer rounding: $38.4 \times 8 = 307.2 \to 307\text{ px}$; $38.5 \times 8 = 308.0 \to 308\text{ px}$. |
| 2 | Canvas Scaling | Extreme aspect ratios (e.g. $100 \times 10\text{ mm}$ ribbon, $10 \times 100\text{ mm}$ tape) | Deterministic integer allocation ($800 \times 80\text{ px}$ and $80 \times 800\text{ px}$) without crash or memory overflow. |
| 3 | Margin Boundary | Margin $\ge$ half canvas dimension (e.g. margin $20\text{ mm}$ on $38\times25\text{ mm}$) | Margin clamped to safe limit ($\min(W/4, H/4)$), preventing negative drawing dimensions. |
| 4 | Compact Smart Merge | Ultra-long marketing name (e.g. 120-character Chinese OEM phone name) | Wrapped into secondary line with ellipsis truncation preventing canvas edge overflow. |
| 5 | Compact Smart Merge | Battery health is 0, negative, or `None` (e.g. Android demo unit or dead battery) | Battery percentage is omitted completely without trailing dash or orphan `%` sign. |
| 6 | Code128 Barcode | Empty or whitespace-only barcode data string | Returns placeholder barcode (`"0000"`) or raises explicit ValueError depending on `allow_empty` flag. |
| 7 | Code128 Barcode | Barcode data exceeding usable width at 2px module width | Dynamically downscales module width from $2\text{ px}$ to $1\text{ px}$ and halves quiet zone to fit printable area. |
| 8 | QR Code | Massive payload (500+ characters) on small 25mm label | Computes largest integer box size; if impossible to fit, safely truncates or clamps to 1-pixel module. |
| 9 | Arabic BiDi | Mixed Arabic, Latin, and digits (e.g. "iPhone 15 Pro - تصليح شاشة - 01012345678") | Phone numbers and "iPhone 15 Pro" remain strictly LTR; Arabic text flows correctly RTL without detached glyphs. |
| 10 | Arabic BiDi | Pre-reshaped Arabic Unicode Presentation Forms (U+FE70-U+FEFC) passed as input | Idempotency guard detects presentation forms and skips second pass, preventing double-reversal corruption. |
| 11 | Windows GDI Print | Selected printer is disconnected or spooler service crashes mid-job | `win32ui` catches exception, executes `AbortDoc()`, calls `DeleteDC()`, and falls back to virtual PNG export. |
| 12 | Windows GDI Print | Driver has 300 DPI or 600 DPI resolution instead of 203 DPI | Inspects `LOGPIXELSX/Y`, scales destination DIB rectangle by $(300/203.2)$, maintaining correct physical mm size. |
| 13 | 1-Click Color Chip | Clicked while IMEI field is empty or $<8$ digits | Sets Color text field immediately in $<0.2\text{ s}$; skips TAC database write without throwing errors. |
| 14 | Store Audit Scan | High-speed burst scanning (5 barcodes per second) | Queue absorbs events; table updates reactively; audio beeps play asynchronously without GUI lockup. |
| 15 | Store Audit Scan | Barcode not matching any expected in-stock item | Item routed to "Unknown / Unregistered Serials"; low-pitch double beep emitted; warning logged. |
| 16 | Store Audit Export | Target Excel file is currently open and locked by Microsoft Excel | Displays user-friendly message box: "File is open in Excel, please close it and retry", preventing app crash. |
| 17 | Database WAL | 20 simultaneous background threads reading/writing SQLite | Thread-safe `RLock` + WAL mode + 5000ms busy timeout ensures zero `database is locked` OperationalErrors. |

---

## 8. Verification & Acceptance Criteria Method

1. **Visual Identity Verification**:
   - Run `python assets/generate_icon.py`.
   - Verify `assets/app_icon.ico` contains all 6 layers: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256 px.
   - Verify `assets/logo_header.png` is exactly 128x128 px with alpha channel.
   - Run `python -c "import ctypes; ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID('ProLab.SmartLabeler.App.1.0')"` to confirm Windows integration.
2. **Thermal Printing Engine Verification**:
   - Execute `pytest tests/test_adversarial_m2.py` and `pytest tests/test_challenger_empirical.py`.
   - Confirm all label sizes ($38\times25$, $40\times25$, $50\times30$, etc.) produce exact integer dots ($304\times200$, $320\times200$, etc.) with mode `'1'`.
   - Validate Code128 scannability and Arabic BiDi text layout.
3. **UI & Store Inventory Audit Verification**:
   - Run `pytest tests/test_ui.py`.
   - Verify 1-Click Color Chips update form and write to `tac_color_map`.
   - Verify Tab 3 barcode scan increments counters, moves rows from Pending to Verified, and exports `.xlsx`.
4. **Database Verification**:
   - Run `pytest tests/test_database.py`.
   - Verify `inventory`, `repair_tickets`, `tac_color_map`, `print_history`, `audit_sessions`, `audit_items` tables exist with WAL mode.
