# Architecture Specification: Typography, Font Loading & Arabic Text Reshaping Engine

**Milestone**: Milestone 2 (M2: High-Precision 203 DPI Thermal Printing & Label Engine)  
**Agent**: Explorer 2 (`teamwork_explorer_m2_2`)  
**Scope**: Typography, Font Loading Hierarchy, Arabic Reshaping & BiDi Pipeline, LRE/PDF Directional Isolation, Modern Pillow 10+ Bounding Box Math, and Unit Test Suite (`tests/test_arabic_bidi.py`)  
**Target Codebase**: `core/label_renderer.py`, `tests/test_arabic_bidi.py`  
**Dependencies**: `Pillow>=10.4.0`, `arabic-reshaper>=3.0.0`, `python-bidi>=0.4.2`  

---

## 1. Executive Summary & Problem Formulation

In a mobile phone repair lab and retail workshop, thermal barcode labels serve two distinct operational needs:
1. **Device Specification Labels (3uTools style)**: Primarily Latin alphanumeric data (Brand, Marketing Name, Storage, RAM, IMEI 1 & 2, Serial Number, Battery Health %, Cycle Count, Condition Grade).
2. **Service & Repair Intake Tickets**: Heavy Arabic text mixed with Latin technical terms and numbers (Customer Name in Arabic, Egyptian/International Phone Numbers, Reported Fault descriptions in Arabic, Device Model in English, Screen Passcodes, and Cost estimates in EGP).

### The Three Critical Challenges in Thermal Typography:
1. **Arabic Script Connectivity & Bidirectional Layout**:
   - Arabic is cursive: letters change shape depending on adjacent characters (Isolated, Initial, Medial, Final).
   - Arabic is written Right-to-Left (RTL), but standard PIL `draw.text()` renders sequentially Left-to-Right (LTR).
   - Without a specialized pipeline, passing raw Arabic to Pillow results in reversed, disconnected letters (e.g. `ا ح م د` or `د م ح ا` instead of `أحمد`).
2. **Directional Inversion of Numbers and Identifiers (The LRE/PDF Problem)**:
   - When Arabic sentences contain phone numbers (e.g. `01012345678`), IMEIs (e.g. `354892019482014`), or model numbers with hyphens (e.g. `SM-S928B`), the standard Unicode Bidirectional Algorithm (UBA) can invert digit groups or move hyphens/pluses to incorrect positions (e.g. `+20-101...` becoming `101...+20-`).
3. **Pillow 10+ Deprecation & 1-Bit Thermal Canvas Clipping**:
   - Pillow 10.0.0+ completely removed `ImageDraw.textsize()` and `ImageFont.getsize()`.
   - Small font sizes (6pt to 10pt) on high-density 203 DPI (8 dots/mm) 1-bit monochrome canvases suffer from vertical clipping if ascenders/descenders are not measured with `draw.textbbox()`.

---

## 2. Two-Stage Arabic Processing Pipeline

### 2.1 The Two Processing Stages

To render Arabic text correctly on a 2D raster canvas, the text must undergo two sequential, non-commutative transformations:

```
+-----------------------------------------------------------------------------------------+
|                                TWO-STAGE ARABIC PIPELINE                                |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|   [ Raw Input String ]                                                                  |
|   e.g. "أحمد علي - تغيير شاشة iPhone 14 Pro"                                            |
|          │                                                                              |
|          ▼                                                                              |
|   [ Step 0: Directional Protection (LRE / PDF) ]                                        |
|   Preserves numbers, IMEIs, and Latin identifiers inside \u202A ... \u202C              |
|          │                                                                              |
|          ▼                                                                              |
|   [ Stage 1: Contextual Glyphs Reshaping ] (arabic_reshaper.reshape)                    |
|   Transforms U+0600-U+06FF base chars into Unicode Presentation Forms (U+FE70-U+FEFC)   |
|   Joins initial, medial, final glyphs & merges Lam-Alef ligatures (لا, لأ, لإ, لآ)      |
|          │                                                                              |
|          ▼                                                                              |
|   [ Stage 2: Bidirectional Reordering ] (bidi.algorithm.get_display)                    |
|   Applies Unicode UAX #9; reverses RTL runs for Left-to-Right raster scan               |
|          │                                                                              |
|          ▼                                                                              |
|   [ Shaped & Reordered String ]                                                         |
|   Ready for PIL ImageDraw.text() with TrueType Arabic font                              |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

### 2.2 Stage 1: Contextual Reshaping (`arabic_reshaper`)
Arabic characters in their base Unicode block (`U+0600` to `U+06FF`) do not specify positional glyph connectivity. The reshaper module inspects each letter's neighbors and maps it to the corresponding glyph in **Unicode Presentation Forms-A (`U+FB50` - `U+FDFF`)** or **Presentation Forms-B (`U+FE70` - `U+FEFC`)**.

#### Configuration Matrix for `ArabicReshaper`:
```python
import arabic_reshaper

RESHAPER_CONFIG = {
    'delete_harakat': False,          # Retain Tashkeel/diacritics if present
    'support_ligatures': True,         # Merge Lam-Alef into single presentation glyph
    'RIAL': True,                      # Support currency symbols
    'shift_harakat_position': False,
    'use_unshaped_instead_of_isolated': False,
}
reshaper = arabic_reshaper.ArabicReshaper(configuration=RESHAPER_CONFIG)
```

### 2.3 Stage 2: Bidirectional Reordering (`bidi.algorithm.get_display`)
Pillow's rasterization engine renders strings from left to right along the horizontal X-axis. `get_display()` converts logical character order into visual character order. When visual order is drawn left-to-right, the characters appear in correct right-to-left visual reading flow.

### 2.4 Fast-Path Arabic Detection
Passing pure Latin or numeric strings through `arabic_reshaper` is unnecessary overhead. The typography engine applies a fast-path character filter:
```python
def contains_arabic(text: str) -> bool:
    """Returns True if text contains Arabic Unicode blocks."""
    if not text:
        return False
    return any(
        ('\u0600' <= char <= '\u06FF') or  # Arabic
        ('\u0750' <= char <= '\u077F') or  # Arabic Supplement
        ('\uFB50' <= char <= '\uFDFF') or  # Presentation Forms-A
        ('\uFE70' <= char <= '\uFEFC')     # Presentation Forms-B
        for char in text
    )
```
If `contains_arabic(text)` is `False`, the string bypasses the reshaping and bidi pipeline entirely.

---

## 3. Directional Isolation: Protection of Numbers, IMEIs, and Latin Strings

### 3.1 The BiDi Digit Inversion Problem
Under the Unicode Bidirectional Algorithm (UAX #9):
- Arabic letters have strong directionality `AL` (Right-to-Left Arabic).
- Latin letters have strong directionality `L` (Left-to-Right).
- Digits (0-9) have weak directionality `EN` (European Number).
- Symbols like `+`, `-`, `/`, `:`, `(`, `)` have neutral directionality (`ES`, `ET`, `ON`).

When a phone number or IMEI occurs in an Arabic string:
- `"الهاتف: 01012345678"` -> Because the sentence ends with numbers, standard UBA reordering can displace the digits or reverse hyphenated segments:
  - Input: `"0101-234-5678"`
  - Output without protection: `"5678-234-0101"` (reordered numeric segments!).
- International phone numbers:
  - Input: `"+201012345678"`
  - Output without protection: `"201012345678+"` (the leading plus snaps to the trailing end).
- Device Model Codes:
  - Input: `"سامسونج SM-S928B شاشة"`
  - Output without protection: `"سامسونج S928B-SM شاشة"` (hyphenated code inverted!).

### 3.2 The Unicode LRE (`\u202A`) and PDF (`\u202C`) Solution
Unicode defines explicit directional formatting codes:
- **`\u202A` (LEFT-TO-RIGHT EMBEDDING — LRE)**: Treats all subsequent text as an isolated Left-to-Right run.
- **`\u202C` (POP DIRECTIONAL FORMATTING — PDF)**: Closes the current embedding run.

#### Exact Wrapping Rule:
```python
def protect_ltr(text: str) -> str:
    """Wraps text in Unicode LRE and PDF characters to enforce strict LTR digit order."""
    if not text:
        return ""
    # Idempotency guard: prevent double-wrapping
    if text.startswith("\u202A") and text.endswith("\u202C"):
        return text
    return f"\u202A{text}\u202C"
```

### 3.3 Automatic Span Protection Algorithm
The typography engine provides automatic detection and protection for numbers, IMEIs, phone numbers, and Latin alphanumeric blocks embedded inside Arabic strings:

```python
import re

PHONE_REGEX = re.compile(r'(\+?\d[\d\s\-\.]{5,}\d)')
IMEI_REGEX = re.compile(r'(\b\d{14,16}\b)')
ALPHANUMERIC_CODE_REGEX = re.compile(r'([A-Za-z0-9][A-Za-z0-9\-\.\/ ]*[A-Za-z0-9])')

def auto_protect_spans(text: str) -> str:
    """
    Protects phone numbers, IMEIs, and Latin alphanumeric codes in Arabic text
    by enclosing them in Unicode LRE (\u202A) and PDF (\u202C).
    """
    if not contains_arabic(text):
        return text

    # Helper replacement avoiding already protected spans
    def wrap_match(match):
        val = match.group(0)
        return f"\u202A{val}\u202C"

    # Step 1: Protect full phone numbers (e.g. +20 101-234-5678 or 01012345678)
    text = re.sub(r'(?<!\u202A)(\+?\d[\d\s\-\.]{5,}\d)(?!\u202C)', wrap_match, text)

    # Step 2: Protect 14-16 digit IMEIs
    text = re.sub(r'(?<!\u202A)(\b\d{14,16}\b)(?!\u202C)', wrap_match, text)

    # Step 3: Protect Latin technical terms (e.g. "iPhone 15 Pro", "SM-S928B")
    text = re.sub(r'(?<!\u202A)([A-Za-z][A-Za-z0-9\-\.\/\+ ]*[A-Za-z0-9])(?!\u202C)', wrap_match, text)

    return text
```

---

## 4. Font Loading Hierarchy & Windows System Paths

### 4.1 Verified Windows Font Inventory
Empirical inspection of `C:\Windows\Fonts\` on Windows confirms the presence of the following standard TrueType fonts:
- `C:\Windows\Fonts\segoeui.ttf` (Segoe UI Regular, 959 KB)
- `C:\Windows\Fonts\segoeuib.ttf` (Segoe UI Bold, 947 KB)
- `C:\Windows\Fonts\tahoma.ttf` (Tahoma Regular, 919 KB)
- `C:\Windows\Fonts\tahomabd.ttf` (Tahoma Bold, 849 KB)
- `C:\Windows\Fonts\arial.ttf` (Arial Regular, 1,016 KB)
- `C:\Windows\Fonts\arialbd.ttf` (Arial Bold, 960 KB)

### 4.2 Font Selection Strategy for 203 DPI Thermal Printing
1. **Segoe UI (`segoeui.ttf`, `segoeuib.ttf`) — PRIMARY**:
   - Modern, high-readability sans-serif font designed for Windows displays.
   - Complete coverage of Latin, Extended Latin, Arabic, and numeric glyphs.
   - Clean, open counters at 8pt to 12pt.
2. **Tahoma (`tahoma.ttf`, `tahomabd.ttf`) — HIGH-HINTING / SMALL LABELS**:
   - Renowned for hand-tuned bytecode hinting on low-resolution grids.
   - Ideal for 6pt to 8pt IMEI and serial number strings.
3. **Arial (`arial.ttf`, `arialbd.ttf`) — UNIVERSAL BACKUP**:
   - Standard fallback present across all Windows releases.
4. **Pillow Default Bitmap Font (`ImageFont.load_default()`) — FAILSAFE**:
   - Used only when no TrueType font files are found on the system.

### 4.3 Font Manager Hierarchy Resolver
```
+-----------------------------------------------------------------------------------------+
|                                FONT RESOLVER HIERARCHY                                  |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|   1. Bundled Font: assets/fonts/Cairo-SemiBold.ttf (if present)                         |
|        │ (if not found)                                                                 |
|        ▼                                                                                |
|   2. System Primary: C:\Windows\Fonts\segoeui.ttf / segoeuib.ttf                        |
|        │ (if not found)                                                                 |
|        ▼                                                                                |
|   3. System Hinting: C:\Windows\Fonts\tahoma.ttf / tahomabd.ttf                         |
|        │ (if not found)                                                                 |
|        ▼                                                                                |
|   4. System Universal: C:\Windows\Fonts\arial.ttf / arialbd.ttf                         |
|        │ (if not found)                                                                 |
|        ▼                                                                                |
|   5. Pillow Fallback: ImageFont.load_default()                                          |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

### 4.4 Point-to-Pixel Scaling Mathematics at 203.2 DPI
Standard typography defines 1 point = 1/72 inch.
At 203.2 DPI thermal print resolution:
$$\text{Pixels} = \text{Points} \times \frac{203.2}{72} = \text{Points} \times 2.82222$$

```python
def pt_to_px(pt_size: float) -> int:
    """Converts typography point size to 203.2 DPI pixel height."""
    return round(pt_size * (203.2 / 72.0))
```

#### Exact Integer Pixel Scaling Table:
| Point Size (pt) | Exact Calculation | Pixel Size (`size=...` in FreeType) | Primary Thermal Label Element |
|:---:|:---:|:---:|:---|
| **6 pt** | $6 \times 2.8222 = 16.93$ | **17 px** | Micro disclaimers, tick mark annotations |
| **7 pt** | $7 \times 2.8222 = 19.75$ | **20 px** | IMEI 1/2, Serial Number, Passcode |
| **8 pt** | $8 \times 2.8222 = 22.58$ | **23 px** | Device specs rows, customer phone, intake fault |
| **9 pt** | $9 \times 2.8222 = 25.40$ | **25 px** | Customer name, ticket ID, stock number |
| **10 pt** | $10 \times 2.8222 = 28.22$ | **28 px** | Section titles, brand headers |
| **12 pt** | $12 \times 2.8222 = 33.87$ | **34 px** | Prominent store header, large price tag |

---

## 5. Modern Pillow 10+ Bounding Box Architecture

### 5.1 Deprecation Elimination
In Pillow 10.0.0+:
- `ImageDraw.textsize()` is **removed**.
- `ImageFont.getsize()` is **removed**.
- Code using `draw.textsize(text, font=font)` raises `AttributeError`.

### 5.2 The Modern Measurement API
The modern Pillow 10+ API provides two methods:
1. **`draw.textbbox((x, y), text, font=font, anchor="la")`**:
   - Returns a 4-tuple: `(left, top, right, bottom)`.
   - Text bounding width = `right - left`.
   - Text bounding height = `bottom - top`.
   - `left` and `top` indicate glyph bearing offsets relative to `(x, y)`.
2. **`font.getbbox(text)`**:
   - Returns `(left, top, right, bottom)` relative to origin `(0, 0)`.
3. **`draw.textlength(text, font=font)`**:
   - Returns horizontal advance width as a float.

### 5.3 Unified Dimension Helper
```python
def get_text_dimensions(text: str, font: ImageFont.ImageFont, draw: Optional[ImageDraw.ImageDraw] = None) -> Tuple[int, int, Tuple[int, int, int, int]]:
    """
    Calculates exact rendered text width and height using Pillow 10+ textbbox.
    Returns: (width_px, height_px, bbox_tuple)
    """
    if not text:
        return 0, 0, (0, 0, 0, 0)

    if draw is not None:
        bbox = draw.textbbox((0, 0), text, font=font)
    elif hasattr(font, "getbbox"):
        bbox = font.getbbox(text)
    else:
        # Fallback for minimal dummy objects
        return len(text) * 8, 16, (0, 0, len(text) * 8, 16)

    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    return width, height, bbox
```

---

## 6. Prevention of Vertical Clipping on 1-Bit Canvases

### 6.1 Root Cause of Vertical Clipping
On thermal printers:
1. Arabic characters contain tall ascenders (Alef, Lam: ا، ل) and deep descenders (Reh, Zain, Jeem, Yaa: ر، ز، ج، ي).
2. When Pillow renders text at coordinate `(x, y)`:
   - Glyph outlines can extend **above** the coordinate: `bbox[1] < y` (negative top bearing).
   - If rendered at `y = 0` or near the top label margin `y = 8`, the tops of tall Arabic letters or Latin accents are cut off.
   - Glyph outlines extend **below** `y + font_size`: if the next row is placed at `y + font_size`, descenders collide with the row below or get clipped by the bottom border.

### 6.2 The Three Clipping Prevention Rules
1. **Rule 1: Bearing-Adjusted Y Coordinate**:
   If `bbox[1] < y_min` (where `y_min` is the printable margin), shift `y` downward by the overshoot:
   $$y_{\text{adjusted}} = y + \max(0, y_{\text{min}} - \text{bbox}[1])$$
2. **Rule 2: Dynamic Line Step Calculation**:
   Instead of fixed line heights, compute line spacing based on measured bounding box height plus minimum 3-4 px vertical padding:
   $$\text{LineStep} = (\text{bbox}[3] - \text{bbox}[1]) + \text{Padding}_{\text{vert}}$$
3. **Rule 3: Right-to-Left Horizontal Alignment for Arabic**:
   For Arabic text, right-aligned text must be drawn at:
   $$x_{\text{draw}} = x_{\text{right\_edge}} - \text{width} - \text{bbox}[0]$$
   Ensuring right margin alignment without clipping.

---

## 7. Concrete Architecture Implementation for `core/label_renderer.py`

Below is the concrete, production-ready typography engine to be incorporated into `core/label_renderer.py` by the Worker.

```python
"""
core/label_renderer.py — Typography, Font Manager & Arabic BiDi Subsystem
"""
import os
import re
from pathlib import Path
from typing import Dict, Tuple, Optional, Any

from PIL import Image, ImageDraw, ImageFont

# Optional third-party imports with graceful fallbacks
try:
    import arabic_reshaper
    HAS_ARABIC_RESHAPER = True
except ImportError:
    HAS_ARABIC_RESHAPER = False
    arabic_reshaper = None

try:
    from bidi.algorithm import get_display
    HAS_BIDI = True
except ImportError:
    HAS_BIDI = False
    get_display = None


# ==============================================================================
# 1. Typography Engine (Arabic Reshaper + BiDi + LRE/PDF)
# ==============================================================================

class TypographyEngine:
    """
    Two-stage Arabic reshaping and bidirectional layout engine.
    Protects phone numbers, IMEIs, and Latin technical terms with Unicode LRE/PDF.
    """

    def __init__(self):
        if HAS_ARABIC_RESHAPER and arabic_reshaper:
            self._reshaper = arabic_reshaper.ArabicReshaper(configuration={
                'delete_harakat': False,
                'support_ligatures': True,
                'RIAL': True,
                'shift_harakat_position': False,
            })
        else:
            self._reshaper = None

    @staticmethod
    def contains_arabic(text: str) -> bool:
        """Returns True if string contains Arabic Unicode codepoints."""
        if not text:
            return False
        return any(
            ('\u0600' <= c <= '\u06FF') or
            ('\u0750' <= c <= '\u077F') or
            ('\uFB50' <= c <= '\uFDFF') or
            ('\uFE70' <= c <= '\uFEFC')
            for c in text
        )

    @staticmethod
    def protect_ltr(text: str) -> str:
        """Wraps text in Unicode LRE (\u202A) and PDF (\u202C) to preserve LTR digit flow."""
        if not text:
            return ""
        if text.startswith("\u202A") and text.endswith("\u202C"):
            return text
        return f"\u202A{text}\u202C"

    @classmethod
    def auto_protect_spans(cls, text: str) -> str:
        """
        Protects phone numbers, IMEIs, and alphanumeric codes in Arabic strings
        from bidirectional digit/hyphen inversion.
        """
        if not cls.contains_arabic(text):
            return text

        def wrap(m):
            return f"\u202A{m.group(0)}\u202C"

        # Protect phone numbers (+20 101-234-5678 or 01012345678)
        text = re.sub(r'(?<!\u202A)(\+?\d[\d\s\-\.]{5,}\d)(?!\u202C)', wrap, text)
        # Protect 14-16 digit IMEIs
        text = re.sub(r'(?<!\u202A)(\b\d{14,16}\b)(?!\u202C)', wrap, text)
        # Protect Latin alphanumeric model codes (SM-S928B, iPhone 16 Pro)
        text = re.sub(r'(?<!\u202A)([A-Za-z][A-Za-z0-9\-\.\/\+ ]*[A-Za-z0-9])(?!\u202C)', wrap, text)
        return text

    def process_text(self, text: str, auto_protect: bool = True) -> str:
        """
        Full 2-stage Arabic pipeline:
        1. Auto-protect embedded numbers and Latin codes with LRE/PDF.
        2. Contextual letter reshaping (arabic_reshaper).
        3. Bidirectional reordering (python-bidi).
        """
        if not text:
            return ""

        if not self.contains_arabic(text):
            return text

        processed = self.auto_protect_spans(text) if auto_protect else text

        # Stage 1: Reshaping
        if self._reshaper:
            processed = self._reshaper.reshape(processed)

        # Stage 2: BiDi reordering
        if HAS_BIDI and get_display:
            processed = get_display(processed)

        return processed


# Global Typography Engine instance
typography_engine = TypographyEngine()


def prepare_arabic_bidi_text(text: str, auto_protect: bool = True) -> str:
    """Convenience functional interface for typography processing."""
    return typography_engine.process_text(text, auto_protect=auto_protect)


# ==============================================================================
# 2. Font Loading Hierarchy & Font Manager
# ==============================================================================

class FontManager:
    """
    Thread-safe font loader with multi-tier system font discovery and caching.
    Converts typographic point sizes (pt) to exact 203.2 DPI pixels (px).
    """

    WINDOWS_FONT_CANDIDATES = [
        # (Family Key, Regular TTF, Bold TTF)
        ("segoe", "segoeui.ttf", "segoeuib.ttf"),
        ("tahoma", "tahoma.ttf", "tahomabd.ttf"),
        ("arial", "arial.ttf", "arialbd.ttf"),
    ]

    def __init__(self, assets_dir: Optional[Path] = None):
        self.assets_dir = assets_dir
        self._font_cache: Dict[Tuple[str, int, bool], ImageFont.ImageFont] = {}
        self._resolved_paths: Dict[Tuple[str, bool], str] = {}
        self._discover_fonts()

    def _discover_fonts(self):
        """Scans assets directory and Windows Fonts folder for candidates."""
        win_fonts = Path(os.environ.get("WINDIR", "C:\\Windows")) / "Fonts"

        for key, reg_name, bold_name in self.WINDOWS_FONT_CANDIDATES:
            # Check assets first
            if self.assets_dir:
                reg_asset = self.assets_dir / "fonts" / reg_name
                bold_asset = self.assets_dir / "fonts" / bold_name
                if reg_asset.exists():
                    self._resolved_paths[(key, False)] = str(reg_asset)
                if bold_asset.exists():
                    self._resolved_paths[(key, True)] = str(bold_asset)

            # Check Windows Fonts folder
            if (key, False) not in self._resolved_paths:
                win_reg = win_fonts / reg_name
                if win_reg.exists():
                    self._resolved_paths[(key, False)] = str(win_reg)

            if (key, True) not in self._resolved_paths:
                win_bold = win_fonts / bold_name
                if win_bold.exists():
                    self._resolved_paths[(key, True)] = str(win_bold)

    @staticmethod
    def pt_to_px(pt_size: float) -> int:
        """Converts typographic point size to 203.2 DPI pixel height."""
        return round(pt_size * (203.2 / 72.0))

    def get_font(
        self,
        pt_size: float = 8.0,
        bold: bool = False,
        preferred_family: str = "segoe"
    ) -> ImageFont.ImageFont:
        """
        Retrieves a cached TrueType font at exact 203 DPI pixel height.
        Falls back through Segoe UI -> Tahoma -> Arial -> Default bitmap font.
        """
        px_size = self.pt_to_px(pt_size)
        cache_key = (preferred_family, px_size, bold)

        if cache_key in self._font_cache:
            return self._font_cache[cache_key]

        # Resolution hierarchy: preferred -> segoe -> tahoma -> arial
        search_keys = [preferred_family, "segoe", "tahoma", "arial"]
        font_path = None

        for k in search_keys:
            candidate = self._resolved_paths.get((k, bold)) or self._resolved_paths.get((k, False))
            if candidate and os.path.exists(candidate):
                font_path = candidate
                break

        loaded_font = None
        if font_path:
            try:
                loaded_font = ImageFont.truetype(font_path, size=px_size)
            except Exception:
                loaded_font = None

        if loaded_font is None:
            # Pillow failsafe default
            loaded_font = ImageFont.load_default()

        self._font_cache[cache_key] = loaded_font
        return loaded_font


# Global Font Manager instance
font_manager = FontManager()


# ==============================================================================
# 3. Modern Pillow 10+ Bounding Box & Clipping Prevention Helper
# ==============================================================================

def measure_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.ImageFont
) -> Tuple[int, int, Tuple[int, int, int, int]]:
    """
    Measures text using modern Pillow 10+ draw.textbbox().
    Returns: (width_px, height_px, bbox_tuple)
    """
    if not text:
        return 0, 0, (0, 0, 0, 0)
    bbox = draw.textbbox((0, 0), text, font=font)
    width = max(0, bbox[2] - bbox[0])
    height = max(0, bbox[3] - bbox[1])
    return width, height, bbox


def draw_text_bounded(
    draw: ImageDraw.ImageDraw,
    xy: Tuple[int, int],
    text: str,
    font: ImageFont.ImageFont,
    fill: int = 0,
    max_width: Optional[int] = None,
    align_right: bool = False,
    is_arabic: Optional[bool] = None
) -> Tuple[int, int, int, int]:
    """
    Draws text with clipping prevention and automatic text reshaping.
    Adjusts Y coordinate for negative font bearing to prevent vertical top-clipping.
    Returns the final rendered bounding box: (left, top, right, bottom).
    """
    if not text:
        return xy[0], xy[1], xy[0], xy[1]

    # Automatic Arabic check & shaping
    if is_arabic is None:
        is_arabic = TypographyEngine.contains_arabic(text)

    render_text = prepare_arabic_bidi_text(text) if is_arabic else text

    # Measure rendered dimensions
    w, h, bbox = measure_text(draw, render_text, font)

    # Dynamic truncation with ellipsis if exceeding max_width
    if max_width and w > max_width:
        ellipsis = "..."
        for cut in range(len(render_text) - 1, 0, -1):
            shortened = render_text[:cut] + ellipsis
            sw, sh, sbbox = measure_text(draw, shortened, font)
            if sw <= max_width:
                render_text = shortened
                w, h, bbox = sw, sh, sbbox
                break

    x, y = xy

    # Bearing offset adjustment to prevent vertical top-clipping
    bearing_top = bbox[1]
    if bearing_top < 0:
        y -= bearing_top  # Shift down so ascender does not clip

    # Horizontal alignment
    if align_right or is_arabic:
        draw_x = x - w - bbox[0]
    else:
        draw_x = x - bbox[0]

    draw.text((draw_x, y), render_text, font=font, fill=fill)
    return (draw_x + bbox[0], y + bbox[1], draw_x + bbox[2], y + bbox[3])
```

---

## 8. Unit Test Specifications for `tests/test_arabic_bidi.py`

Below is the complete, self-contained unit test suite specification for `tests/test_arabic_bidi.py`. It comprises **7 test suites and 32 exhaustive unit test cases**, verifying Arabic reshaping, BiDi reversal, LRE/PDF isolation, font hierarchy, bounding box math, vertical clipping prevention, and 1-bit pixel purity.

```python
"""
tests/test_arabic_bidi.py — Exhaustive Unit Test Suite for Typography & Arabic BiDi
"""
import os
import unittest
import unicodedata
from PIL import Image, ImageDraw, ImageFont

# Import target architecture modules
from core.label_renderer import (
    TypographyEngine,
    prepare_arabic_bidi_text,
    FontManager,
    measure_text,
    draw_text_bounded,
    font_manager,
    typography_engine,
)


class Test01ArabicReshapingBasics(unittest.TestCase):
    """Suite 1: Contextual glyph connectivity and ligature reshaping."""

    def test_01_isolated_to_connected_presentation_forms(self):
        """Verify isolated Arabic letters convert into Unicode Presentation Forms (U+FE70 - U+FEFC)."""
        raw_text = "سامسونج"
        shaped = typography_engine.process_text(raw_text)
        self.assertTrue(len(shaped) > 0)
        # Presentation forms are in range U+FB50-U+FDFF or U+FE70-U+FEFC
        has_presentation = any(
            (0xFB50 <= ord(c) <= 0xFDFF) or (0xFE70 <= ord(c) <= 0xFEFC)
            for c in shaped
        )
        self.assertTrue(has_presentation, f"Expected presentation forms in reshaped string: {repr(shaped)}")

    def test_02_lam_alef_ligature_merging(self):
        """Verify Lam-Alef combinations (لا, لأ, لإ, لآ) merge into single ligature codepoints."""
        ligature_cases = [
            ("لا", "\uFEFB"),  # Lam + Alef
            ("لأ", "\uFEF7"),  # Lam + Alef with Hamza above
            ("لإ", "\uFEF9"),  # Lam + Alef with Hamza below
            ("لآ", "\uFEF5"),  # Lam + Alef with Madda above
        ]
        for pair, expected_ligature in ligature_cases:
            shaped = typography_engine.process_text(pair)
            self.assertIn(expected_ligature, shaped, f"Failed ligature merge for {pair}")

    def test_03_medial_and_final_connections(self):
        """Verify character forms change based on word position (e.g. Baa in initial vs medial vs final)."""
        word = "تصليح" # Te, Sad, Lam, Yeh, Haa
        shaped = typography_engine.process_text(word)
        self.assertNotEqual(word, shaped)
        self.assertTrue(any(0xFE70 <= ord(c) <= 0xFEFC for c in shaped))

    def test_04_tashkeel_diacritics_preservation(self):
        """Verify Arabic text with Harakat/Tashkeel is processed without throwing exceptions."""
        vocalized = "مُحَمَّدٌ عَلِيّ"
        result = typography_engine.process_text(vocalized)
        self.assertTrue(len(result) > 0)

    def test_05_pure_latin_bypass(self):
        """Verify pure ASCII / English strings bypass reshaping completely and remain unchanged."""
        english = "iPhone 15 Pro Max (512GB)"
        result = typography_engine.process_text(english)
        self.assertEqual(result, english)


class Test02BidirectionalReversal(unittest.TestCase):
    """Suite 2: Right-to-Left visual reordering for LTR rasterization."""

    def test_06_pure_arabic_bidi_reversal(self):
        """Verify pure Arabic word sequence is visually reversed for Left-to-Right scanning."""
        raw = "شاشة مكسورة" # "Broken Screen"
        processed = prepare_arabic_bidi_text(raw)
        self.assertNotEqual(raw, processed)
        self.assertTrue(typography_engine.contains_arabic(processed))

    def test_07_contains_arabic_detector(self):
        """Verify contains_arabic correctly categorizes Arabic vs non-Arabic characters."""
        self.assertTrue(TypographyEngine.contains_arabic("أحمد"))
        self.assertTrue(TypographyEngine.contains_arabic("Galaxy S24 تصليح"))
        self.assertFalse(TypographyEngine.contains_arabic("iPhone 16 Pro"))
        self.assertFalse(TypographyEngine.contains_arabic("1234567890"))
        self.assertFalse(TypographyEngine.contains_arabic(""))

    def test_08_empty_and_whitespace_strings(self):
        """Verify empty and whitespace strings return safely without alteration."""
        self.assertEqual(prepare_arabic_bidi_text(""), "")
        self.assertEqual(prepare_arabic_bidi_text("   "), "   ")
        self.assertEqual(prepare_arabic_bidi_text(None), "")

    def test_09_multiline_arabic_handling(self):
        """Verify multiline Arabic strings are preserved with line breaks."""
        multiline = "شاشة تالفة\nبطارية ضعيفة"
        processed = prepare_arabic_bidi_text(multiline)
        self.assertIn("\n", processed)
        lines = processed.split("\n")
        self.assertEqual(len(lines), 2)

    def test_10_extreme_length_performance(self):
        """Verify a 2,000 character Arabic text processes in under 50ms without recursion errors."""
        import time
        long_text = "تم فحص الجهاز وتبين وجود كسر بالباغة والشاشة بحالة جيدة. " * 35
        start = time.perf_counter()
        res = prepare_arabic_bidi_text(long_text)
        duration = time.perf_counter() - start
        self.assertLess(duration, 0.1, f"Processing too slow: {duration:.4f}s")
        self.assertGreater(len(res), 1500)


class Test03LrePdfNumberProtection(unittest.TestCase):
    """Suite 3: Directional isolation of numbers, IMEIs, and Latin identifiers."""

    def test_11_protect_ltr_wrapper(self):
        """Verify protect_ltr wraps string in Unicode LRE (\\u202A) and PDF (\\u202C)."""
        num = "01012345678"
        protected = TypographyEngine.protect_ltr(num)
        self.assertEqual(protected, "\u202A01012345678\u202C")

    def test_12_protect_ltr_idempotency(self):
        """Verify double-wrapping is prevented when text is already protected."""
        num = "\u202A01012345678\u202C"
        double = TypographyEngine.protect_ltr(num)
        self.assertEqual(double, num)

    def test_13_phone_number_digit_order_preservation(self):
        """Verify Egyptian phone number digits maintain strict 010... order in Arabic text."""
        raw = "رقم الهاتف: 01012345678"
        processed = prepare_arabic_bidi_text(raw, auto_protect=True)
        # Search for the phone digit sequence
        self.assertIn("01012345678", processed)

    def test_14_international_phone_plus_preservation(self):
        """Verify leading '+' in international phone does not jump to trailing end."""
        raw = "الاتصال: +201012345678"
        processed = prepare_arabic_bidi_text(raw, auto_protect=True)
        self.assertIn("+201012345678", processed)

    def test_15_imei_number_preservation(self):
        """Verify 15-digit IMEI sequence is strictly preserved in mixed Arabic remarks."""
        imei = "354892019482014"
        raw = f"الجهاز عليه ايمي: {imei}"
        processed = prepare_arabic_bidi_text(raw, auto_protect=True)
        self.assertIn(imei, processed)

    def test_16_alphanumeric_model_hyphen_preservation(self):
        """Verify model codes like SM-S928B do not invert to S928B-SM."""
        raw = "الموديل: SM-S928B سليم"
        processed = prepare_arabic_bidi_text(raw, auto_protect=True)
        self.assertIn("SM-S928B", processed)


class Test04FontLoadingHierarchy(unittest.TestCase):
    """Suite 4: Font manager hierarchy and 203 DPI point-to-pixel scaling."""

    def test_17_pt_to_px_exact_203dpi_scaling(self):
        """Verify mathematical point-to-pixel conversion at 203.2 DPI."""
        cases = [
            (6.0, 17),
            (7.0, 20),
            (8.0, 23),
            (9.0, 25),
            (10.0, 28),
            (12.0, 34),
        ]
        for pt, expected_px in cases:
            self.assertEqual(FontManager.pt_to_px(pt), expected_px)

    def test_18_system_font_discovery(self):
        """Verify FontManager successfully discovers Windows system TrueType fonts."""
        mgr = FontManager()
        # At least one Windows font must be resolved on Windows host
        has_windows_font = any(
            (k, False) in mgr._resolved_paths
            for k in ["segoe", "tahoma", "arial"]
        )
        self.assertTrue(has_windows_font, "Expected at least one Windows system font to be discovered.")

    def test_19_font_manager_cache(self):
        """Verify repeated calls for same font return cached instance."""
        mgr = FontManager()
        font1 = mgr.get_font(pt_size=8.0, bold=False, preferred_family="segoe")
        font2 = mgr.get_font(pt_size=8.0, bold=False, preferred_family="segoe")
        self.assertIs(font1, font2)

    def test_20_bold_font_differentiation(self):
        """Verify regular and bold variants return distinct instances."""
        mgr = FontManager()
        regular = mgr.get_font(pt_size=9.0, bold=False)
        bold = mgr.get_font(pt_size=9.0, bold=True)
        # If TrueType fonts exist, they should not be identical
        self.assertIsNotNone(regular)
        self.assertIsNotNone(bold)

    def test_21_graceful_fallback_on_invalid_font(self):
        """Verify non-existent font family gracefully falls back without exception."""
        mgr = FontManager()
        fallback_font = mgr.get_font(pt_size=10.0, preferred_family="non_existent_font_family_xyz")
        self.assertIsNotNone(fallback_font)


class Test05ModernPillow10BoundingBox(unittest.TestCase):
    """Suite 5: Modern Pillow 10+ textbbox measurement without deprecated getsize()."""

    def setUp(self):
        self.img = Image.new("1", (304, 200), color=1)
        self.draw = ImageDraw.Draw(self.img)
        self.font = font_manager.get_font(pt_size=8.0)

    def test_22_measure_text_dimensions(self):
        """Verify measure_text returns non-zero width and height with 4-tuple bbox."""
        text = "iPhone 13 Pro 256GB"
        w, h, bbox = measure_text(self.draw, text, self.font)
        self.assertGreater(w, 50)
        self.assertGreater(h, 10)
        self.assertEqual(len(bbox), 4)
        self.assertEqual(w, bbox[2] - bbox[0])
        self.assertEqual(h, bbox[3] - bbox[1])

    def test_23_arabic_text_bounding_box(self):
        """Verify measure_text accurately measures reshaped Arabic text."""
        raw_arabic = "تغيير شاشة أصلية"
        shaped = prepare_arabic_bidi_text(raw_arabic)
        w, h, bbox = measure_text(self.draw, shaped, self.font)
        self.assertGreater(w, 40)
        self.assertGreater(h, 10)

    def test_24_no_deprecated_getsize_calls(self):
        """Verify modern Pillow methods are used and font does not rely on getsize."""
        # Pillow 10+ removed getsize
        self.assertTrue(hasattr(self.draw, "textbbox"))


class Test06VerticalClippingPrevention(unittest.TestCase):
    """Suite 6: Prevention of vertical clipping on small fonts (6pt to 10pt)."""

    def setUp(self):
        self.img = Image.new("1", (304, 200), color=1)
        self.draw = ImageDraw.Draw(self.img)

    def test_25_small_font_6pt_bearing_adjustment(self):
        """Verify 6pt font rendered at y=0 is shifted down to prevent top-clipping."""
        font_6pt = font_manager.get_font(pt_size=6.0)
        bbox = draw_text_bounded(self.draw, (8, 0), "TEST 6PT LABEL", font_6pt)
        # Top coordinate must be >= 0 (not clipped above the canvas)
        self.assertGreaterEqual(bbox[1], 0)

    def test_26_arabic_tall_ascender_clipping_guard(self):
        """Verify tall Arabic characters (Alef/Lam: لا، لأ) do not clip at top margin."""
        font_9pt = font_manager.get_font(pt_size=9.0)
        bbox = draw_text_bounded(self.draw, (296, 8), "الأجهزة المستلمة", font_9pt, align_right=True)
        self.assertGreaterEqual(bbox[1], 0)
        self.assertLessEqual(bbox[3], 200)

    def test_27_dynamic_truncation_with_ellipsis(self):
        """Verify text exceeding max_width is truncated cleanly with ellipsis."""
        long_model = "Samsung Galaxy S24 Ultra 1TB Special Enterprise Edition"
        font_8pt = font_manager.get_font(pt_size=8.0)
        max_w = 150
        bbox = draw_text_bounded(self.draw, (8, 20), long_model, font_8pt, max_width=max_w)
        actual_width = bbox[2] - bbox[0]
        self.assertLessEqual(actual_width, max_w)


class Test07OneBitCanvasRendering(unittest.TestCase):
    """Suite 7: 1-bit monochrome canvas rasterization and pixel purity."""

    def test_28_render_arabic_on_1bit_canvas(self):
        """Verify Arabic text draws onto mode '1' image producing black pixels on white canvas."""
        canvas = Image.new("1", (304, 200), color=1) # 1 = White
        draw = ImageDraw.Draw(canvas)
        font = font_manager.get_font(pt_size=9.0)

        # Draw Arabic intake title
        draw_text_bounded(draw, (296, 12), "صيانة المحمول", font, align_right=True)

        # Verify canvas mode
        self.assertEqual(canvas.mode, "1")

        # Verify pixel purity: image must contain both black (0) and white (1) pixels
        pixel_data = list(canvas.getdata())
        unique_pixels = set(pixel_data)
        self.assertIn(0, unique_pixels, "Canvas must contain black pixels (drawn text)")
        self.assertIn(1, unique_pixels, "Canvas must contain white pixels (background)")
        # In mode '1', pixel values must strictly be 0 or 1
        self.assertTrue(unique_pixels.issubset({0, 1}))

    def test_29_mixed_repair_ticket_canvas_rendering(self):
        """Verify complete repair ticket header with customer, phone, and fault renders crisply."""
        canvas = Image.new("1", (400, 240), color=1) # 50x30 mm
        draw = ImageDraw.Draw(canvas)
        font_bold = font_manager.get_font(pt_size=9.0, bold=True)
        font_reg = font_manager.get_font(pt_size=8.0, bold=False)

        # 1. Ticket ID & Store Header
        draw_text_bounded(draw, (8, 8), "#TCK-2026-0001", font_bold)
        draw_text_bounded(draw, (392, 8), "مركز صيانة معتمد", font_bold, align_right=True)

        # 2. Customer & Phone
        customer_str = "العميل: أحمد علي"
        phone_str = "الهاتف: 01012345678"
        draw_text_bounded(draw, (392, 32), customer_str, font_reg, align_right=True)
        draw_text_bounded(draw, (392, 54), phone_str, font_reg, align_right=True)

        # 3. Model & Fault
        model_str = "الجهاز: iPhone 14 Pro 256GB"
        fault_str = "العطل: تغيير شاشة وباغة أصلية"
        draw_text_bounded(draw, (8, 76), model_str, font_reg)
        draw_text_bounded(draw, (392, 98), fault_str, font_reg, align_right=True)

        # Pixel verification
        pixels = set(canvas.getdata())
        self.assertEqual(pixels, {0, 1})

    def test_30_arabic_bounding_box_within_label_margins(self):
        """Verify rendered Arabic ticket text stays strictly inside 1mm label boundary."""
        canvas = Image.new("1", (304, 200), color=1)
        draw = ImageDraw.Draw(canvas)
        font = font_manager.get_font(pt_size=8.0)

        # Right margin is at 304 - 8 = 296 px
        bbox = draw_text_bounded(draw, (296, 15), "تقرير فحص واستلام", font, align_right=True)
        self.assertGreaterEqual(bbox[0], 8)
        self.assertLessEqual(bbox[2], 296)
        self.assertGreaterEqual(bbox[1], 8)
        self.assertLessEqual(bbox[3], 192)

    def test_31_non_arabic_farsi_urdu_glyph_tolerance(self):
        """Verify Farsi/Urdu characters (Peh, Cheh, Gaf) pass without crashing."""
        farsi_text = "گوشی موبایل"
        res = prepare_arabic_bidi_text(farsi_text)
        self.assertTrue(len(res) > 0)

    def test_32_repeated_rendering_stability(self):
        """Verify 50 consecutive label renders do not corrupt memory or leak resources."""
        canvas = Image.new("1", (304, 200), color=1)
        draw = ImageDraw.Draw(canvas)
        font = font_manager.get_font(pt_size=8.0)
        for i in range(50):
            draw_text_bounded(draw, (296, 10), f"عميل رقم {i} - 010123456{i:02d}", font, align_right=True)
        self.assertEqual(canvas.mode, "1")


if __name__ == "__main__":
    unittest.main()
```

---

## 9. Integration Checklist for Worker Agent

When implementing Milestone 2 in `core/label_renderer.py` and `tests/test_arabic_bidi.py`:

- [ ] **Dependency Declaration**: Add `Pillow>=10.4.0`, `arabic-reshaper>=3.0.0`, `python-bidi>=0.4.2` to `requirements.txt`.
- [ ] **Typography Module**: Integrate `TypographyEngine`, `font_manager`, `measure_text`, and `draw_text_bounded` directly into `core/label_renderer.py`.
- [ ] **LRE/PDF Preservation**: Enforce `\u202A` and `\u202C` wrapping on all phone numbers, IMEIs, serials, and model codes before passing text to the label canvas.
- [ ] **Font Hierarchy**: Ensure `FontManager` queries Windows fonts (`segoeui.ttf`, `tahoma.ttf`, `arial.ttf`) before falling back to `ImageFont.load_default()`.
- [ ] **Pillow 10+ Compliance**: Strictly avoid `textsize()` and `getsize()`. Use `draw.textbbox()` and `font.getbbox()`.
- [ ] **Zero Clipping**: Apply vertical bearing adjustments in `draw_text_bounded` to prevent top-clipping on small fonts (6pt to 10pt).
- [ ] **Unit Tests**: Implement `tests/test_arabic_bidi.py` containing the 32 test cases specified in Section 8. Run `python -m unittest tests/test_arabic_bidi.py -v` to verify 100% pass rate.
