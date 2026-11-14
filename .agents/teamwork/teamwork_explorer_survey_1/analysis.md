# Technical Analysis: Desktop UI, Visual Identity & WYSIWYG Architecture (R1)

**Author:** Explorer 1 (`teamwork_explorer_survey_1`)  
**Phase:** Phase 0 (Survey & Architectural Specification)  
**Target Project:** Mobile Phone Sales & Repair Lab Desktop Application  
**Workspace:** `c:\Users\Eng_Ahmed\Desktop\label`  
**Date:** 2026-11-07  

---

## Executive Summary

This investigation evaluates the Desktop UI framework, visual identity, layout architecture, 203 DPI live WYSIWYG preview canvas, thread-safe asynchronous device polling, and local environment state. 

**Core Recommendation:**  
**PyQt6** is overwhelmingly the superior framework choice over CustomTkinter for this production-grade thermal printing and hardware diagnosis desktop application. PyQt6 provides native High-DPI sub-pixel rendering, complete Qt Style Sheets (QSS) for the Luxury Dark Theme (`#121212`, `#1E1E1E`, `#D4AF37`), virtualized table views (`QTableView`) capable of high-performance inventory logging, a rock-solid thread-safe event loop with `pyqtSignal`/`pyqtSlot` to isolate 2-second ADB/iOS polling, and seamless standalone packaging with PyInstaller.

The host environment has Python 3.12.10 installed on Windows with screen working area `1280x672` and printer `Microsoft Print to PDF`. The UI must therefore be designed with responsive layouts, `QScrollArea` wrappers, and a minimum footprint of `1200x640` to display perfectly on 720p screens while scaling crisply to 1080p, 2K, and 4K displays.

---

## 1. UI Framework Evaluation: PyQt6 vs. CustomTkinter

| Evaluation Criterion | PyQt6 | CustomTkinter (Tkinter Wrapper) | Winner & Technical Rationale |
| :--- | :--- | :--- | :--- |
| **High-DPI Scaling & Crispness** | Native Qt6 per-monitor High-DPI scaling (`PassThrough` / fractional scaling) with sub-pixel antialiasing and DirectWrite font rasterization. | Tkinter underlying Tcl/Tk canvas causes integer coordinate rounding, blurred text, and canvas scaling bugs at 125%/150% Windows DPI. | **PyQt6** — Essential for 203 DPI 1:1 pixel preview fidelity and crisp label rendering. |
| **Live WYSIWYG Canvas Rendering** | Direct double-buffered `QPixmap` rendering from PIL image bytes (`QImage.Format.Format_RGBA8888`), hardware accelerated via Qt RHI. Zero redraw flicker. | Requires `CTkImage` or `ImageTk.PhotoImage`. Frequent redraws during keystrokes cause canvas micro-stuttering, tearing, and garbage collector overhead. | **PyQt6** — Guarantees sub-20ms real-time preview updates during rapid text field typing. |
| **Luxury Dark Theme Styling** | Full Qt Style Sheets (QSS) with CSS3 pseudo-classes (`:hover`, `:focus`, `:checked`), linear gradients (metallic gold), custom scrollbars, and compound widgets. | Limited widget attributes (`fg_color`, `border_color`). No CSS cascading, no gradient support, difficult custom tab/scrollbar styling. | **PyQt6** — Achieves exact luxury dark aesthetic (`#121212` matte black, `#1E1E1E` card surfaces, `#D4AF37` metallic gold). |
| **Data Tables (Inventory Log)** | `QTableView` with virtualized models (`QAbstractTableModel`) and `QSortFilterProxyModel`. Can render 50,000+ records instantly with zero lag. | No native virtualized table. `CTkTable` add-on is cell-widget based, causing massive memory and UI freeze beyond 50 rows; `ttk.Treeview` has notorious Windows dark theme styling bugs. | **PyQt6** — Vital for lab inventory logs with real-time search, sorting, and 1-click reprinting. |
| **Thread Safety & Async Signals** | `QThread` + `pyqtSignal` + `pyqtSlot`. Queued connections (`Qt.ConnectionType.QueuedConnection`) automatically dispatch worker thread events to main GUI event loop. | Tkinter is fundamentally not thread-safe. Background worker threads cannot touch widgets; requires `queue.Queue` polling via `root.after()`, causing latency and CPU cycles. | **PyQt6** — Non-negotiable for 2-second ADB/Fastboot/libimobiledevice polling loops. |
| **Packaging with PyInstaller** | Standard built-in PyInstaller hooks automatically detect PyQt6 platforms, plugins, and dependencies. Single `.exe` builds cleanly. | Requires manual `--copy-metadata` and `--add-data` for customtkinter JSON themes and font folders; frequent silent crashes on target Windows machines. | **PyQt6** — Enterprise packaging stability. |

---

## 2. Luxury Dark Theme Visual Identity & Design Tokens

### 2.1 Palette Tokens
- **Background Root (`bg_root`):** `#121212` (Deep Matte Black)
- **Card / Surface (`bg_surface`):** `#1E1E1E` (Dark Charcoal)
- **Elevated Surface (`bg_surface_elevated`):** `#2A2A2A` (Hover / Selected Card)
- **Input Field Background (`bg_input`):** `#242424`
- **Border / Divider (`border_default`):** `#333333` (Subtle 1px border)
- **Border Focus (`border_focus`):** `#D4AF37` (Metallic Gold glow)
- **Primary Accent (`accent_gold`):** `#D4AF37` (Metallic Gold)
- **Accent Gradient (`accent_gradient`):** `qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #D4AF37, stop:1 #B89628)`
- **Accent Hover (`accent_hover`):** `#E6C65A`
- **Accent Pressed (`accent_pressed`):** `#9E7D18`
- **Status Connected (`status_green`):** `#2ECC71`
- **Status Fastboot / Warning (`status_orange`):** `#E67E22`
- **Status Error / Disconnected (`status_red`):** `#E74C3C`
- **Text Primary (`text_primary`):** `#FFFFFF`
- **Text Secondary (`text_secondary`):** `#A0A0A0`
- **Text Gold (`text_gold`):** `#D4AF37`

### 2.2 Comprehensive QSS Stylesheet Specification
```css
/* Global Window & Fonts */
QMainWindow, QDialog {
    background-color: #121212;
    color: #FFFFFF;
    font-family: 'Segoe UI', 'Cairo', sans-serif;
    font-size: 13px;
}

/* Card Containers */
QFrame.CardFrame {
    background-color: #1E1E1E;
    border: 1px solid #333333;
    border-radius: 8px;
    padding: 12px;
}

/* Tabs */
QTabWidget::pane {
    border: 1px solid #333333;
    background-color: #1E1E1E;
    border-radius: 6px;
    top: -1px;
}
QTabBar::tab {
    background-color: #161616;
    color: #A0A0A0;
    padding: 8px 18px;
    border: 1px solid #333333;
    border-bottom: none;
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
    font-weight: 600;
}
QTabBar::tab:selected {
    background-color: #1E1E1E;
    color: #D4AF37;
    border-bottom: 2px solid #D4AF37;
}
QTabBar::tab:hover:!selected {
    background-color: #242424;
    color: #FFFFFF;
}

/* Input Fields & Comboboxes */
QLineEdit, QComboBox, QSpinBox, QDoubleSpinBox, QPlainTextEdit {
    background-color: #242424;
    color: #FFFFFF;
    border: 1px solid #3A3A3A;
    border-radius: 5px;
    padding: 6px 10px;
    selection-background-color: #D4AF37;
    selection-color: #121212;
}
QLineEdit:focus, QComboBox:focus, QSpinBox:focus, QPlainTextEdit:focus {
    border: 1px solid #D4AF37;
    background-color: #282828;
}

/* Primary Action Buttons (Metallic Gold) */
QPushButton.PrimaryBtn {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #D4AF37, stop:1 #B89628);
    color: #121212;
    font-weight: bold;
    border: none;
    border-radius: 6px;
    padding: 9px 16px;
    font-size: 13px;
}
QPushButton.PrimaryBtn:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #E6C65A, stop:1 #D4AF37);
}
QPushButton.PrimaryBtn:pressed {
    background-color: #9E7D18;
}

/* Secondary Buttons */
QPushButton.SecondaryBtn {
    background-color: #2A2A2A;
    color: #D4AF37;
    border: 1px solid #D4AF37;
    border-radius: 6px;
    padding: 8px 14px;
    font-weight: 600;
}
QPushButton.SecondaryBtn:hover {
    background-color: #332808;
    color: #FFF;
}

/* Table View */
QTableView {
    background-color: #1E1E1E;
    alternate-background-color: #181818;
    color: #FFFFFF;
    border: 1px solid #333333;
    gridline-color: #2A2A2A;
    selection-background-color: #332808;
    selection-color: #D4AF37;
    border-radius: 6px;
}
QHeaderView::section {
    background-color: #161616;
    color: #D4AF37;
    padding: 6px;
    border: 1px solid #2A2A2A;
    font-weight: bold;
}

/* ScrollBars */
QScrollBar:vertical {
    background-color: #121212;
    width: 10px;
    margin: 0;
}
QScrollBar::handle:vertical {
    background-color: #333333;
    min-height: 24px;
    border-radius: 5px;
}
QScrollBar::handle:vertical:hover {
    background-color: #D4AF37;
}
```

---

## 3. Layout Architecture & View Specifications

### 3.1 Five-Panel Layout Wireframe
```
+----------------------------------------------------------------------------------------------------------------------+
| [TOP STATUS BAR] Logo | ● Android ADB: Connected (SM-S918B) | 🍏 iOS: Ready | [ ] Auto-Print | Mock Mode: [Live v]   |
+-----------------------------------------------------+---------------------------------+------------------------------+
| [LEFT PANEL - 360px]                                | [CENTER PANEL - Flex/WYSIWYG]   | [RIGHT PANEL - 320px]        |
| +-------------------------------------------------+ | +-----------------------------+ | +--------------------------+ |
| | Tab 1: Device Specs   | Tab 2: Service Intake   | | | Zoom [100% v]  Orient [H/V] | | | PRINTER SELECTOR         | |
| +-------------------------------------------------+ | +-----------------------------+ | | [Xprinter XP-370B      v]| |
| | Stock ID: [STK-2026-0042] [x] Auto-increment    | | |                             | | | [Calibrate / Test Label] | |
| | Brand/Model: [Apple iPhone 14 Pro Max         ] | | |   +---------------------+   | | +--------------------------+ |
| | Storage: [256GB v]  RAM: [6GB v]  Color: [Gold] | | |   | 3uTools Style 203DPI|   | | PAPER PRESET               | |
| | OS: [iOS 17.5.1   ]  Region: [LL/A            ] | | |   | iPhone 14 Pro Max   |   | | ( ) 38x25 mm               | |
| | Serial: [F2LXXXXXXX ] [Copy]                    | | |   | 256GB - Gold - 92%  |   | | ( ) 40x25 mm               | |
| | IMEI 1: [356789012345678 ] [Copy]               | | |   | [|||||||||||||||||] |   | | (*) 50x30 mm (Recommended) | |
| | IMEI 2: [356789012345679 ]                      | | |   | IMEI: 3567890123456 |   | | ( ) 60x30 mm               | |
| | Batt Health: [92%] Cycles: [214]                | | |   +---------------------+   | | ( ) 80x40 mm / Custom...   | |
| | Grade: [Grade A+ v]  Remarks: [Scratchless    ] | | |                             | | Margin: [1.0] mm           | |
| |                                                 | | | [x] Compact Smart Merge     | | +--------------------------+ |
| | [Clear Form]          [PRINT LABEL NOW (GOLD) ] | | | [*] Code128  ( ) QR Code    | | TEMPLATE MANAGER           | |
| +-------------------------------------------------+ | +-----------------------------+ | | [Save]  [Load]  [Delete] | |
+-----------------------------------------------------+---------------------------------+------------------------------+
| [BOTTOM PANEL - 180px] LOCAL HISTORY & INVENTORY LOG                                                                 |
| [Search: Serial, IMEI, Model, Phone...       ]  Filter: [All v]  [Reprint Selected]  [Export .xlsx]  [Export .csv]   |
| ID         | Type   | Timestamp           | Model           | Storage | Serial      | IMEI 1          | Customer   |
| STK-2026-42| Specs  | 2026-11-07 14:10:05 | iPhone 14 Pro M | 256GB   | F2LXXXXXXX  | 356789012345678 | Sales Lab  |
| TCK-2026-12| Intake | 2026-11-07 13:45:22 | Galaxy S22      | 128GB   | R5CTXXXXXX  | 352134567890123 | John Doe   |
+----------------------------------------------------------------------------------------------------------------------+
```

### 3.2 Detailed Panel Specifications

#### Panel 1: Top Status Bar
- **Dimensions:** Fixed height `48px`.
- **Left:** Branding logo + application title (`LABELSMILE PRO 2026` with gold glyph).
- **Center:** Connection indicator badges:
  - `Android ADB`: Grey (Offline) / Bright Green (Online: `Model Name`) / Orange (Fastboot Mode: `Fastboot Active`).
  - `iOS Normal`: Grey (Offline) / Bright Green (Online: `iPhone Model - iOS Ver`).
  - `Worker Poller`: Pulsing status pill (`Active Polling: 2s`).
- **Right:**
  - `Auto-Print on Connect` toggle switch (default: `False` to prevent paper waste; activates silent printing when new device serial detected).
  - `Simulation Mode` selector: `[Live Hardware]`, `[Simulate Galaxy S23 Ultra]`, `[Simulate iPhone 15 Pro]`, `[Simulate Fastboot Mode]`.
  - `Manual Refresh` button (`↻ Rescan`).

#### Panel 2: Left Panel (Data Input & Tabs)
- **Width:** `360px` - `380px`, placed inside a `QScrollArea` with smooth scrolling.
- **Tab 1: Device Specs Label (3uTools Style)**:
  - `Stock ID`: Auto-generated sequentially (`STK-YYYY-XXXX`), with manual unlock toggle.
  - `Brand & Marketing Name`: Auto-resolved from ADB/iOS or editable text.
  - `Storage Capacity & RAM`: Dual comboboxes with common presets (`64GB` to `1TB`, `4GB` to `16GB`) and custom input.
  - `Color & OS Version`: Auto-populated.
  - `Serial Number`: Text input with uppercase filter and 1-click clipboard copy.
  - `IMEI 1 & IMEI 2`: 15-digit validated inputs with Luhn algorithm indicator and copy buttons.
  - `Battery Health % & Charge Cycles`: Battery health with automatic color tinting (Green `>=85%`, Yellow `80-84%`, Red `<80%`).
  - `Sales Region & Cosmetic Grade`: Dropdowns (`LL/A`, `ZP/A`, `New`, `Grade A+`, `Grade A`, `Grade B`).
  - `Custom Remarks / Warranty`: Text field (e.g. `1 Month Warranty, Battery Replaced`).
- **Tab 2: Service & Repair Intake Label**:
  - `Ticket ID`: Auto-generated timestamp code (`TCK-XXXXX`).
  - `Customer Name & Customer Phone`: Unicode support (Arabic & English) with phone regex validation.
  - `Device Model & Screen Passcode`: Passcode/pattern field with "No Passcode" checkbox.
  - `Security & Condition Checkboxes`: Grid of 6 checkboxes (`SIM Removed`, `SD Removed`, `Back Cracked`, `Screen Cracked`, `Dead/No Power`, `Water Damaged`).
  - `Reported Fault Description`: Multi-line text edit.
  - `Estimated Cost & Advance Deposit`: Monetary spinboxes.
  - `Intake Date & Time`: Auto-set to current time, editable.

#### Panel 3: Center Panel (Live WYSIWYG Designer & Preview)
- **Dimensions:** Flexible width, centered drafting board.
- **DPI Fidelity:** Native 203 DPI aspect ratio matching the selected paper size.
- **Real-Time Reactive Updates:** Keystrokes in Left Panel emit `textChanged` signals that trigger `LabelRenderer.render_label_pil(...)`. The PIL image is converted to `QPixmap` and pushed to the canvas in under 15ms.
- **Compact Smart Merge Mode:**
  - Toggle switch.
  - When enabled on small stickers (38x25 mm, 40x25 mm): automatically combines `Brand/Model` + `Storage` + `Color` + `Battery %` into 1 or 2 high-density lines (e.g. `iPhone 13 • 128GB • Midnight • 88%`), maximizing barcode scan area.
- **Barcode & QR Engine:**
  - Radio/Toggle for `Code128 Barcode` vs `QR Code` vs `Both` vs `None`.
  - Target data selector (IMEI 1, Serial, Ticket ID, Custom URL).
- **RTL Arabic Text Support:**
  - Real-time bidi reshaping via `arabic-reshaper` and `python-bidi`. Connected Arabic text renders right-to-left without glyph disconnection.

#### Panel 4: Right Panel (Printer & Template Manager)
- **Width:** `300px` - `320px`.
- **Printer Selector:**
  - Windows printer enumeration via `win32print`.
  - Auto-selects any printer containing "Xprinter", "XP-370B", "POS", or "Thermal"; defaults to default printer or "Microsoft Print to PDF".
  - `[Calibrate / Test Label]` button: Immediately prints a 203 DPI border alignment box with center crosshair.
- **Paper Presets:**
  - Radio list: `38x25 mm (304x200 px)`, `40x25 mm (320x200 px)`, `50x30 mm (400x240 px)`, `60x30 mm (480x240 px)`, `80x40 mm (640x320 px)`, `80x50 mm (640x400 px)`, and `Custom mm`.
  - Margin adjustment: `1.0 mm` default (range `0.0 - 5.0 mm`).
- **Template Manager:**
  - Save, Load, and Delete JSON templates storing layout toggles, font sizes, barcode types, and default margins.

#### Panel 5: Bottom Panel (Local History & Inventory Log)
- **Height:** Collapsible / resizable (`160px` to `240px`).
- **Search Bar:** Real-time filter across Serial, IMEI, Model, Ticket, Customer Phone.
- **Export Controls:** 1-click Export to Excel (`.xlsx`) using `openpyxl` and `.csv`.
- **1-Click Reprint:** Selecting any row and clicking "Reprint" sends the exact stored label back to the thermal printer instantly.

---

## 4. Live WYSIWYG & 203 DPI Canvas Mathematics

### 4.1 Native Dot Density Formula
Thermal barcode printers (e.g., Xprinter XP-370B) operate at **203.2 DPI**, which yields exactly **8.0 dots per millimeter**:
$$\text{Dots per mm} = \frac{203.2 \text{ dots/inch}}{25.4 \text{ mm/inch}} = 8.0 \text{ dots/mm}$$

Exact pixel dimensions for standard commercial label rolls:
$$\text{Width (px)} = \text{Width (mm)} \times 8$$
$$\text{Height (px)} = \text{Height (mm)} \times 8$$

| Label Size (mm) | Pixel Dimensions (px @ 203 DPI) | Typical Lab Use Case |
| :--- | :--- | :--- |
| **38 x 25 mm** | **304 x 200 px** | Cable tag, small accessories, compact phone back sticker |
| **40 x 25 mm** | **320 x 200 px** | Standard retail phone spec tag (Compact Smart Merge recommended) |
| **50 x 30 mm** | **400 x 240 px** | **Universal Gold Standard** for mobile sales & repair labs |
| **60 x 30 mm** | **480 x 240 px** | Full diagnostic label with dual IMEI and extended remarks |
| **80 x 40 mm** | **640 x 320 px** | Repair intake sticker with customer claim info and checklist |
| **80 x 50 mm** | **640 x 400 px** | Comprehensive diagnostic sheet with full component breakdown |

### 4.2 Monochrome 1-Bit Rendering Pipeline
```
[User Form / Device Data]
          │
          ▼
[Bidi & Arabic Reshaper Engine] (Text Reshaping & RTL alignment)
          │
          ▼
[Pillow PIL RGBA/L Canvas] (Exact 203 DPI dimensions, e.g. 400x240 px)
  ├── 1. Draw 1mm outer alignment border / margins
  ├── 2. Render Header (Model, Storage, Color, Battery %)
  ├── 3. Render Barcode (Code128 via python-barcode) or QR (qrcode)
  ├── 4. Render Spec Grid (Serial, IMEI, Grade, Region, Warranty)
          │
          ▼
[Binarization Thresholding] -> 1-bit Monochrome (mode="1", 0=Black, 255=White)
  ├── Ensures 100% crisp edges without fuzzy dithering on thermal printhead
          │
          ├──► [Path A: WYSIWYG Live Preview]
          │      └── Convert PIL Image to QImage/QPixmap -> Render on QGraphicsView / Canvas
          │
          └──► [Path B: Direct Silent Windows Printing]
                 └── PyWin32 win32ui CreateDC -> StretchDIBits / BitBlt -> Xprinter XP-370B
```

---

## 5. Thread Safety, Event Loops & Asynchronous Device Signals

### 5.1 Architecture Overview
Hardware polling must occur every 2 seconds via `adb devices -l` and `idevice_id -l`. When a device is connected, running subsequent extraction commands (`dumpsys`, `getprop`, `ideviceinfo`) takes between **300ms and 2.5 seconds**. 

If run on the GUI thread, the entire desktop interface freezes, causing Windows "Not Responding" titlebar warnings and freezing keystrokes in the WYSIWYG editor.

### 5.2 PyQt6 Signal/Slot Solution
To ensure absolute thread safety without locks:
1. The background polling engine inherits from `QObject` and is moved to a dedicated `QThread` (`device_thread = QThread()`).
2. All communication with the UI occurs strictly through **`pyqtSignal`**.
3. Qt automatically creates a **Queued Connection** (`Qt.ConnectionType.QueuedConnection`) across thread boundaries, marshaling the Python dictionary payload into the main thread's event loop.
4. The main thread slot unpacks the dictionary, populates form fields, updates status badges, and triggers label preview refresh.

```
+────────────────────────────────────────────────────────+
|                  MAIN GUI THREAD                       |
|                                                        |
|  QMainWindow                                           |
|    ├── Form Fields (Model, IMEI, Battery, etc.)        |
|    ├── Live WYSIWYG Canvas (QPixmap)                   |
|    └── Top Status Bar Badges                           |
|                                                        |
|  Slots (Executed on Main Thread):                      |
|    ▲ on_device_connected(specs_dict)                   |
|    ▲ on_device_disconnected(device_type)               |
|    ▲ on_status_updated(msg)                            |
+──────────────────────────▲─────────────────────────────+
                           │ (Queued Signal Payload)
+──────────────────────────┴─────────────────────────────+
|                 BACKGROUND WORKER THREAD               |
|                                                        |
|  DevicePollingWorker(QObject)                          |
|    ├── Runs in QThread                                 |
|    ├── QTimer(2000ms) interval                         |
|    ├── Subprocess Calls: adb devices, idevice_id       |
|    ├── Subprocess Calls: getprop, dumpsys, ideviceinfo |
|    └── Emits Signals:                                  |
|          • sig_device_connected(dict)                  |
|          • sig_device_disconnected(str)                |
|          • sig_status(str)                             |
+────────────────────────────────────────────────────────+
```

### 5.3 Auto-Print on Connect Guard Logic
To prevent printing duplicates on every 2-second polling tick:
```python
class LabelAppController(QMainWindow):
    def __init__(self):
        super().__init__()
        self.last_handled_serial = None
        self.device_connected = False

    @pyqtSlot(dict)
    def on_device_connected(self, specs: dict):
        current_serial = specs.get("serial_number", "")
        self.populate_form_fields(specs)
        self.status_bar.set_connected(specs["platform"], specs["model"])

        # Auto-Print logic with idempotency guard
        if self.auto_print_checkbox.isChecked():
            if current_serial and current_serial != self.last_handled_serial:
                self.last_handled_serial = current_serial
                self.print_current_label(silent=True)
                self.log_to_database(specs, print_type="Auto-Print")

    @pyqtSlot(str)
    def on_device_disconnected(self, platform: str):
        self.status_bar.set_disconnected(platform)
        self.last_handled_serial = None  # Reset so re-plugging triggers auto-print
```

---

## 6. Workspace Environment Findings

An inspection of `c:\Users\Eng_Ahmed\Desktop\label` and the system environment revealed:

1. **Workspace Files:**
   - The workspace currently contains only `.agents/teamwork/` with orchestration metadata and `ORIGINAL_REQUEST.md`.
   - Clean slate: No production source files or conflicting directories exist.
2. **Python Environment:**
   - Version: `Python 3.12.10` located at `C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\python.exe`.
   - Pip Version: `pip 25.0.1` located at `C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\Scripts\pip.exe`.
   - Currently installed packages are standard command-line/web utilities (`fastapi`, `click`, `rich`, `pydantic`, `uvicorn`, etc.).
   - Required libraries to be specified in `requirements.txt`:
     - `PyQt6>=6.6.0`
     - `Pillow>=10.2.0`
     - `pywin32>=306`
     - `python-barcode>=0.15.1`
     - `qrcode[pil]>=7.4.2`
     - `arabic-reshaper>=3.0.0`
     - `python-bidi>=0.4.2`
     - `openpyxl>=3.1.2`
     - `pyinstaller>=6.4.0`
3. **Screen Resolution:**
   - Resolution: `1280 x 720` with working area `1280 x 672`.
   - **Critical Design Implication:** The desktop window must have a minimum size of `1200 x 640` and make aggressive use of `QScrollArea` in the left and right panels to ensure all controls remain accessible on 720p laptop displays without being clipped by the Windows taskbar.
4. **Installed Printers:**
   - Installed: `Microsoft Print to PDF` on port `PORTPROMPT:`.
   - Ready for virtual print testing and validation of the Windows GDI DC rendering pipeline.

---

## 7. Standalone Executable Packaging Architecture (PyInstaller)

To produce a single, self-contained `LabelSmilePro.exe` using `build_exe.bat`:
1. **PyInstaller Command:**
   ```bat
   pyinstaller --noconsole --onedir --clean ^
       --name "LabelSmilePro" ^
       --icon "assets/icon.ico" ^
       --add-data "bin;bin" ^
       --add-data "assets;assets" ^
       --add-data "data;data" ^
       --add-data "templates;templates" ^
       main.py
   ```
2. **Bundling `/bin` Tools:**
   - Android binaries: `bin/adb.exe`, `bin/AdbWinApi.dll`, `bin/AdbWinUsbApi.dll`.
   - iOS binaries: `bin/ideviceinfo.exe`, `bin/idevice_id.exe`, `bin/idevicediagnostics.exe`, `bin/imobiledevice-1.0.dll`, `bin/plist-2.0.dll`.
3. **Runtime Path Resolution:**
   The application must resolve resource paths using:
   ```python
   def get_resource_path(relative_path: str) -> str:
       if hasattr(sys, '_MEIPASS'):
           return os.path.join(sys._MEIPASS, relative_path)
       return os.path.join(os.path.abspath("."), relative_path)
   ```

---

## 8. Summary of Recommendations for Downstream Agents

1. **Framework:** Adopt **PyQt6** for all UI components.
2. **Architecture:** Use a 5-panel layout with a master horizontal splitter / grid and responsive `QScrollArea` wrappers to support 720p through 4K screens.
3. **Threading:** Implement `DevicePollingWorker` on a `QThread` communicating via `pyqtSignal` to guarantee zero UI freeze.
4. **WYSIWYG:** Render live preview bitmaps using PIL at native 203 DPI, converting to `QPixmap` for sub-20ms screen refresh.
5. **Arabic Support:** Pipe all customer names and ticket remarks through `arabic_reshaper` + `python-bidi` before PIL canvas drawing.
6. **Virtual Print Mode:** Provide a built-in virtual printer preview and simulation engine so the application is 100% operational and verifiable without physical Xprinter hardware.
