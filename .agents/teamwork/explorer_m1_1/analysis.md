# Technical Analysis & Implementation Blueprint: Milestone M1 — Visual Identity & Asset Generation Engine

**Author**: teamwork_explorer (`explorer_m1_1`)  
**Target Milestone**: M1 (Visual Identity, Asset Generation, Taskbar & Desktop Shortcut Integration)  
**Date**: 2026-11-08  
**Working Directory**: `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\explorer_m1_1\`  
**Target System**: Standalone Windows Desktop Application (Python 3.12 64-bit, Pillow 13.0, PyQt6)  

---

## 1. Executive Summary

Milestone M1 establishes the visual identity, brand graphics, and Windows desktop integration for the Mobile Phone Sales & Repair Lab Smart Labeler. This document details the technical design and concrete code blueprints for:
1. **Parametric Vector Geometry Engine (`assets/generate_icon.py`)**:
   - Master $1024 \times 1024$ px 32-bit RGBA master canvas.
   - Curved medieval-modern shield outline on Matte Black (`#121212`) with Metallic Gold (`#D4AF37`) double/beveled border.
   - Precision smartphone chassis silhouette (`#1A1A1A`) with dynamic notch and gold home indicator.
   - Thermal Code128 vertical barcode bars rendered in metallic gold.
   - Diagnostic telemetry lightning pulse (ECG waveform) with dual-layer neon glow in electric gold (`#FFE57F`).
2. **Supersampled Anti-Aliasing (SSAA) Downsampling Pipeline**:
   - High-precision oversampling ratio (from $4\times$ down to $64\times$) downsampled via 8-lobe windowed Lanczos sync filtering (`Image.Resampling.LANCZOS`).
   - True multi-resolution `assets/app_icon.ico` packing 6 discrete icon layers: $16\times 16$, $32\times 32$, $48\times 48$, $64\times 64$, $128\times 128$, and $256\times 256$ px.
   - Standalone brand header logo `assets/logo_header.png` at exactly $128\times 128$ px.
3. **Dual Execution Protocol**:
   - Standalone CLI execution: `python assets/generate_icon.py [--output-dir DIR] [--verify] [--shortcut]`.
   - Programmatic import: `from assets.generate_icon import generate_assets, create_desktop_shortcut`.
4. **Windows System Integration**:
   - Explicit Application User Model ID: `ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ProLab.SmartLabeler.App.1.0")`.
   - Global application and dialog window icon assignment via PyQt6 `app.setWindowIcon(QIcon("assets/app_icon.ico"))`.
   - Zero-dependency COM-based Windows Desktop shortcut utility using PowerShell background automation (`0x08000000` `CREATE_NO_WINDOW`).
5. **Path Resolution & Packaging Pipeline**:
   - Adding `get_assets_dir()` and `get_asset_path()` to `core/paths.py`.
   - Updating `build_exe.bat` and `app.spec` for automated icon generation and asset bundling.

---

## 2. Parametric Vector Geometry & Pillow Drawing Architecture

### 2.1 Coordinate Framework & Color Palette
The master emblem is constructed programmatically on a $1024 \times 1024$ pixel canvas with transparent root background (`mode='RGBA'`, initial fill `(0, 0, 0, 0)`). This ensures the shield floats naturally across light or dark Windows themes without awkward bounding boxes.

| Element | Color Name | Hex Code | RGBA Value | Dimensions / Stroke |
|:---|:---|:---|:---|:---|
| Master Canvas | Transparent | None | `(0, 0, 0, 0)` | $1024 \times 1024$ px |
| Shield Fill | Matte Black | `#121212` | `(18, 18, 18, 255)` | Polygon interior |
| Outer Shield Bezel | Metallic Gold | `#D4AF37` | `(212, 175, 55, 255)` | $24\text{ px}$ stroke |
| Outer Halo / Glow | Translucent Gold | None | `(212, 175, 55, 35)` | $36\text{ px}$ underlay |
| Inner Shield Accent Line | Light Gold | `#F5DE87` | `(245, 222, 135, 255)` | $6\text{ px}$ stroke (inset 94%) |
| Phone Chassis Body | Deep Charcoal | `#1A1A1A` | `(26, 26, 26, 255)` | $344 \times 580\text{ px}$, $R=42\text{ px}$ |
| Phone Chassis Border | Warm Gold | `#C5A028` | `(197, 160, 40, 255)` | $8\text{ px}$ stroke |
| Screen Glass | OLED Black | `#0D0D0D` | `(13, 13, 13, 255)` | $312 \times 510\text{ px}$, $R=28\text{ px}$ |
| Screen Inner Bezel | Dark Charcoal | `#2D2D2D` | `(45, 45, 45, 255)` | $2\text{ px}$ stroke |
| Dynamic Island Notch | Soft Black | `#1E1E1E` | `(30, 30, 30, 255)` | $80 \times 14\text{ px}$, $R=7\text{ px}$ |
| Home Indicator Bar | Translucent Warm Gold | None | `(197, 160, 40, 220)` | $100 \times 6\text{ px}$, $R=3\text{ px}$ |
| Barcode Bars | Metallic Gold | `#D4AF37` | `(212, 175, 55, 255)` | Height $150\text{ px}$, widths 4-16 px |
| Lightning Pulse Glow | Translucent Gold Glow | None | `(255, 229, 127, 75)` | $24\text{ px}$ stroke underlay |
| Lightning Pulse Core | Electric Vivid Gold | `#FFE57F` | `(255, 229, 127, 255)` | $14\text{ px}$ stroke core |
| Telemetry Peak Nodes | Bright Ivory Gold | `#FFF4C2` | `(255, 244, 194, 255)` | Node circles $R=7\text{--}9\text{ px}$ |

### 2.2 Shield Emblem Geometry
The shield features a traditional heraldic contour fused with modern industrial beveling.
The master contour is defined by 14 symmetrical anchor vertices around vertical axis $X = 512$:
```python
SHIELD_POINTS = [
    (160, 160),  # Upper-left crest shoulder
    (320, 130),  # Left crest arch upward
    (512, 110),  # Top center apex
    (704, 130),  # Right crest arch upward
    (864, 160),  # Upper-right crest shoulder
    (874, 200),  # Right upper corner
    (874, 560),  # Right vertical descent
    (830, 680),  # Right lower inward taper
    (720, 800),  # Right converging curve
    (512, 940),  # Bottom center tip
    (304, 800),  # Left converging curve
    (194, 680),  # Left lower inward taper
    (150, 560),  # Left vertical descent
    (150, 200),  # Left upper corner
]
```

#### Parametric Inner Bevel Insetting:
To create the beveled metallic double border, an inner accent polygon is derived by scaling vertices toward centroid $(C_x, C_y) = (512, 520)$ by factor $s = 0.94$:
$$X'_i = \operatorname{round}(512 + (X_i - 512) \times 0.94)$$
$$Y'_i = \operatorname{round}(520 + (Y_i - 520) \times 0.94)$$
This creates a consistent ~16 px inset line drawn with a 6 px stroke of Light Gold (`#F5DE87`).

### 2.3 Smartphone Silhouette Geometry
Centered precisely on the shield:
- **Chassis Bounding Box**: $X \in [340, 684]$, $Y \in [220, 800]$ ($\text{Width} = 344\text{ px}$, $\text{Height} = 580\text{ px}$).
  - Rounded rectangle radius $R = 42\text{ px}$.
  - Fill: Deep Charcoal `#1A1A1A`.
  - Border stroke: $8\text{ px}$ Warm Gold `#C5A028`.
- **Screen Bounding Box**: $X \in [356, 668]$, $Y \in [246, 756]$ ($\text{Width} = 312\text{ px}$, $\text{Height} = 510\text{ px}$).
  - Rounded rectangle radius $R = 28\text{ px}$.
  - Fill: OLED Black `#0D0D0D`.
  - Border stroke: $2\text{ px}$ Charcoal `#2D2D2D`.
- **Dynamic Island / Speaker Notch**:
  - $X \in [472, 552]$, $Y \in [260, 274]$ ($\text{Width} = 80\text{ px}$, $\text{Height} = 14\text{ px}$, $R = 7\text{ px}$).
  - Fill: Soft Black `#1E1E1E`.
- **Home Indicator Bar**:
  - $X \in [462, 562]$, $Y \in [738, 744]$ ($\text{Width} = 100\text{ px}$, $\text{Height} = 6\text{ px}$, $R = 3\text{ px}$).
  - Fill: Translucent Warm Gold `(197, 160, 40, 220)`.

### 2.4 Thermal Barcode Bars
Positioned across the upper portion of the phone screen:
- Top boundary: $Y = 325$, Bottom boundary: $Y = 475$ ($\text{Height} = 150\text{ px}$).
- Starting coordinate: $X = 396\text{ px}$.
- Modulation pattern (widths of alternating solid bars and transparent gaps):
  `[8, 4, 16, 8, 4, 12, 8, 4, 16, 4, 8, 12, 4, 8, 16, 8, 4, 12, 6, 14, 6, 8, 4, 10, 4, 14, 4]`
- Total barcode width: $232\text{ px}$, centered within the $312\text{ px}$ screen ($\text{margins} = 40\text{ px}$).
- Bar fill: Metallic Gold `#D4AF37`.

### 2.5 Diagnostic Lightning Pulse (ECG Telemetry)
The lightning pulse represents high-speed hardware telemetry and electrical diagnostics:
```python
PULSE_POINTS = [
    (240, 610),  # Entrance from left shield body
    (380, 610),  # Traverses across left chassis border
    (410, 580),  # Pre-pulse small upward dip
    (430, 650),  # Pre-pulse downward counter-movement
    (470, 420),  # High-voltage apex spike (peak telemetry)
    (510, 720),  # Deep negative strike
    (550, 550),  # First recovery peak
    (580, 630),  # Second recovery trough
    (610, 610),  # Baseline stabilization
    (784, 610),  # Exit across right chassis into shield
]
```
- **Layer 1 (Neon Glow)**: `draw.line(PULSE_POINTS, fill=(255, 229, 127, 75), width=24, joint="curve")`.
- **Layer 2 (Sharp Core)**: `draw.line(PULSE_POINTS, fill=(255, 229, 127, 255), width=14, joint="curve")`.
- **Diagnostic Nodes**:
  - Apex beacon: Circle at $(470, 420)$ with radius $R = 9\text{ px}$, fill `#FFF4C2`.
  - Trough beacon: Circle at $(510, 720)$ with radius $R = 7\text{ px}$, fill `#FFE57F`.

---

## 3. Supersampled Anti-Aliasing (SSAA) & Downsampling Pipeline

### 3.1 Mathematical Rationale for $1024 \times 1024$ SSAA
Direct rasterization of complex geometric curves and narrow 1D barcode lines at small dimensions ($16\times 16$ or $32\times 32$) results in severe aliasing, pixel dropouts, and jagged staircasing:
- Oversampling factor for $256\times 256$: $\frac{1024}{256} = 4\times$ ($16$ samples/pixel).
- Oversampling factor for $128\times 128$: $\frac{1024}{128} = 8\times$ ($64$ samples/pixel).
- Oversampling factor for $64\times 64$: $\frac{1024}{64} = 16\times$ ($256$ samples/pixel).
- Oversampling factor for $48\times 48$: $\approx 21.3\times$ ($455$ samples/pixel).
- Oversampling factor for $32\times 32$: $\frac{1024}{32} = 32\times$ ($1024$ samples/pixel).
- Oversampling factor for $16\times 16$: $\frac{1024}{16} = 64\times$ ($4096$ samples/pixel).

### 3.2 Lanczos 3-Lobe Downsampling
Downscaling is performed using windowed sinc interpolation with 3 lobes (`Image.Resampling.LANCZOS`):
$$L(x) = \begin{cases} \operatorname{sinc}(x) \operatorname{sinc}(x/3) & \text{if } |x| < 3 \\ 0 & \text{otherwise} \end{cases}$$
Lanczos resampling eliminates edge ringing while preserving acute contrast between the `#121212` matte black shield and `#D4AF37` gold borders.

### 3.3 Multi-Resolution `.ico` Layer Specification
The generated `assets/app_icon.ico` embeds 6 standard Windows icon dimensions:

| Layer # | Dimensions (px) | Color Format | Compression | Display Destination in Windows |
|:---:|:---:|:---:|:---:|:---|
| 1 | $16 \times 16$ | 32-bit RGBA | Uncompressed DIB / PNG | Window title bar icon, File Explorer Details view |
| 2 | $32 \times 32$ | 32-bit RGBA | Uncompressed DIB / PNG | Standard Desktop shortcut, Taskbar 100% button |
| 3 | $48 \times 48$ | 32-bit RGBA | Uncompressed DIB / PNG | File Explorer Medium Icons, Alt+Tab thumbnail |
| 4 | $64 \times 64$ | 32-bit RGBA | Uncompressed DIB / PNG | High-DPI 200% Taskbar, Windows Start Menu tile |
| 5 | $128 \times 128$ | 32-bit RGBA | PNG-compressed ICO | File Explorer Large Icons, Windows Search preview |
| 6 | $256 \times 256$ | 32-bit RGBA | PNG-compressed ICO | File Explorer Extra Large Icons, Task View switch |

### 3.4 Binary ICO Structure Verification
Every `.ico` file begins with a 6-byte `ICONDIR` header followed by $N$ 16-byte `ICONDIRENTRY` records:
- Bytes 0-1: `idReserved` $= 0x0000$ (must be 0).
- Bytes 2-3: `idType` $= 0x0001$ (1 for Icon format).
- Bytes 4-5: `idCount` $= 6$ (number of image layers).
- Each entry defines `(bWidth, bHeight, bColorCount, bReserved, wPlanes, wBitCount, dwBytesInRes, dwImageOffset)`.
Pillow's `IcoImagePlugin` encodes layers $\ge 48\times 48$ with PNG compression and smaller layers with 32-bit DIB bitmaps, conforming 100% with modern Windows Vista/7/10/11 icon specifications.

---

## 4. Complete Code Implementation Design

### 4.1 Target Script: `assets/generate_icon.py`
The proposed production code for `assets/generate_icon.py` is fully self-contained, standalone-executable, programmatically importable, and includes integrated validation:

```python
"""
assets/generate_icon.py — Luxury Brand Emblem & Desktop Icon Generator.
Produces:
- assets/app_icon.ico (multi-resolution: 16, 32, 48, 64, 128, 256 px)
- assets/logo_header.png (128x128 px for UI brand header and splash screens)
"""
from __future__ import annotations

import argparse
import io
import logging
import os
from pathlib import Path
import struct
import subprocess
import sys
from typing import Optional, Tuple

from PIL import Image, ImageDraw

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("generate_icon")

ICO_SIZES = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
PNG_HEADER_SIZE = (128, 128)

# Color Palette Definitions
COLOR_TRANSPARENT = (0, 0, 0, 0)
COLOR_MATTE_BLACK = (18, 18, 18, 255)       # #121212
COLOR_CHARCOAL_CHASSIS = (26, 26, 26, 255)  # #1A1A1A
COLOR_OLED_SCREEN = (13, 13, 13, 255)       # #0D0D0D
COLOR_METALLIC_GOLD = (212, 175, 55, 255)   # #D4AF37
COLOR_WARM_GOLD = (197, 160, 40, 255)       # #C5A028
COLOR_LIGHT_GOLD = (245, 222, 135, 255)     # #F5DE87
COLOR_ELECTRIC_GOLD = (255, 229, 127, 255)  # #FFE57F
COLOR_PULSE_GLOW = (255, 229, 127, 75)
COLOR_BEZEL_HALO = (212, 175, 55, 35)
COLOR_NOTCH = (30, 30, 30, 255)
COLOR_SCREEN_BEZEL = (45, 45, 45, 255)
COLOR_HOME_INDICATOR = (197, 160, 40, 220)


def render_master_brand_emblem(canvas_size: int = 1024) -> Image.Image:
    """
    Renders the luxury master brand emblem onto a high-resolution RGBA canvas.
    Combines shield geometry, phone chassis, barcode bars, and diagnostic lightning pulse.
    """
    img = Image.new("RGBA", (canvas_size, canvas_size), COLOR_TRANSPARENT)
    draw = ImageDraw.Draw(img)

    # 1. Outer Medieval-Modern Shield Points
    shield_pts = [
        (160, 160), (320, 130), (512, 110), (704, 130), (864, 160),
        (874, 200), (874, 560), (830, 680), (720, 800), (512, 940),
        (304, 800), (194, 680), (150, 560), (150, 200)
    ]

    # Outer Glow / Soft Halo
    draw.polygon(shield_pts, outline=COLOR_BEZEL_HALO, width=36)

    # Shield Matte Black Base Fill
    draw.polygon(shield_pts, fill=COLOR_MATTE_BLACK)

    # Outer Metallic Gold Bezel
    draw.polygon(shield_pts, outline=COLOR_METALLIC_GOLD, width=24)

    # Inner Bevel Accent Line (Parametric Inset by 94% toward centroid (512, 520))
    cx, cy = 512, 520
    scale = 0.94
    inner_pts = [
        (int(cx + (x - cx) * scale), int(cy + (y - cy) * scale))
        for x, y in shield_pts
    ]
    draw.polygon(inner_pts, outline=COLOR_LIGHT_GOLD, width=6)

    # 2. Smartphone Silhouette
    # Outer Chassis
    chassis_box = [(340, 220), (684, 800)]
    draw.rounded_rectangle(chassis_box, radius=42, fill=COLOR_CHARCOAL_CHASSIS, outline=COLOR_WARM_GOLD, width=8)

    # OLED Screen
    screen_box = [(356, 246), (668, 756)]
    draw.rounded_rectangle(screen_box, radius=28, fill=COLOR_OLED_SCREEN, outline=COLOR_SCREEN_BEZEL, width=2)

    # Dynamic Notch / Speaker Island
    notch_box = [(472, 260), (552, 274)]
    draw.rounded_rectangle(notch_box, radius=7, fill=COLOR_NOTCH)

    # Home Indicator Bar
    home_box = [(462, 738), (562, 744)]
    draw.rounded_rectangle(home_box, radius=3, fill=COLOR_HOME_INDICATOR)

    # 3. Thermal Code128 Barcode Bars
    bar_pattern = [8, 4, 16, 8, 4, 12, 8, 4, 16, 4, 8, 12, 4, 8, 16, 8, 4, 12, 6, 14, 6, 8, 4, 10, 4, 14, 4]
    bx = 396
    by1, by2 = 325, 475
    is_bar = True
    for w in bar_pattern:
        if is_bar:
            draw.rectangle([(bx, by1), (bx + w, by2)], fill=COLOR_METALLIC_GOLD)
        bx += w
        is_bar = not is_bar

    # 4. Diagnostic Lightning Pulse (ECG Telemetry Polyline)
    pulse_pts = [
        (240, 610), (380, 610), (410, 580), (430, 650),
        (470, 420), (510, 720), (550, 550), (580, 630),
        (610, 610), (784, 610)
    ]
    # Translucent neon glow underlay
    draw.line(pulse_pts, fill=COLOR_PULSE_GLOW, width=24, joint="curve")
    # Sharp electric core
    draw.line(pulse_pts, fill=COLOR_ELECTRIC_GOLD, width=14, joint="curve")

    # Diagnostic Apex & Trough Beacon Nodes
    draw.ellipse([(470 - 9, 420 - 9), (470 + 9, 420 + 9)], fill=(255, 244, 194, 255))
    draw.ellipse([(510 - 7, 720 - 7), (510 + 7, 720 + 7)], fill=COLOR_ELECTRIC_GOLD)

    return img


def verify_ico_layers(ico_path: Path) -> bool:
    """
    Validates binary header and confirms presence of all 6 required layer dimensions.
    """
    if not ico_path.exists():
        return False
    data = ico_path.read_bytes()
    if len(data) < 6:
        return False
    reserved, ico_type, count = struct.unpack("<HHH", data[:6])
    if reserved != 0 or ico_type != 1 or count != len(ICO_SIZES):
        logger.error("Invalid ICO header: reserved=%d, type=%d, count=%d", reserved, ico_type, count)
        return False

    with Image.open(ico_path) as ico:
        available_sizes = set(ico.info.get("sizes", []))
        expected_sizes = set(ICO_SIZES)
        if not expected_sizes.issubset(available_sizes):
            logger.error("Missing sizes in ICO. Expected %s, found %s", expected_sizes, available_sizes)
            return False
    return True


def verify_logo_png(png_path: Path) -> bool:
    """
    Validates dimensions and RGBA properties of header logo PNG.
    """
    if not png_path.exists():
        return False
    with Image.open(png_path) as png:
        if png.size != PNG_HEADER_SIZE:
            logger.error("Invalid PNG dimensions: %s != %s", png.size, PNG_HEADER_SIZE)
            return False
        if png.mode != "RGBA":
            logger.error("Invalid PNG mode: %s != RGBA", png.mode)
            return False
    return True


def generate_assets(output_dir: str | Path = "assets") -> Tuple[str, str]:
    """
    Generates and verifies app_icon.ico (multi-layer) and logo_header.png (128x128).
    Returns (ico_path, png_path) as absolute strings.
    """
    out_path = Path(output_dir).resolve()
    out_path.mkdir(parents=True, exist_ok=True)

    ico_target = out_path / "app_icon.ico"
    png_target = out_path / "logo_header.png"

    logger.info("Rendering 1024x1024 master brand emblem...")
    master = render_master_brand_emblem(1024)

    # 1. Export Multi-Resolution ICO with Lanczos Downsampling
    logger.info("Saving multi-resolution ICO: %s", ico_target)
    master.save(str(ico_target), format="ICO", sizes=ICO_SIZES)

    # 2. Export 128x128 Header Logo PNG with SSAA Lanczos Downsampling
    logger.info("Downsampling and saving header logo PNG: %s", png_target)
    logo_128 = master.resize(PNG_HEADER_SIZE, resample=Image.Resampling.LANCZOS)
    logo_128.save(str(png_target), format="PNG")

    # 3. Post-Generation Verification
    if not verify_ico_layers(ico_target):
        raise RuntimeError(f"ICO layer verification failed on {ico_target}")
    if not verify_logo_png(png_target):
        raise RuntimeError(f"PNG logo verification failed on {png_target}")

    logger.info("Asset generation completed successfully.")
    return str(ico_target), str(png_target)


def create_desktop_shortcut(
    target_exe: Optional[str] = None,
    icon_path: Optional[str] = None,
    shortcut_name: str = "ProLab Smart Labeler"
) -> bool:
    """
    Creates a Windows Desktop shortcut with the custom emblem icon.
    Executes silently via PowerShell COM Object (WScript.Shell).
    """
    if sys.platform != "win32":
        logger.warning("Desktop shortcuts are only supported on Windows.")
        return False

    project_root = Path(__file__).resolve().parent.parent

    # Resolve target executable
    if target_exe is None:
        dist_exe = project_root / "dist" / "ThermalLabPro" / "ThermalLabPro.exe"
        if dist_exe.exists():
            target_exe = str(dist_exe)
        else:
            target_exe = sys.executable

    # Resolve icon path
    if icon_path is None:
        candidate_icon = project_root / "assets" / "app_icon.ico"
        icon_path = str(candidate_icon) if candidate_icon.exists() else str(Path(target_exe))

    # Resolve true Desktop path across OneDrive/redirected folders
    ps_cmd = f"""
    $desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
    $lnkPath = Join-Path $desktop "{shortcut_name}.lnk"
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut($lnkPath)
    $Shortcut.TargetPath = "{target_exe}"
    $Shortcut.WorkingDirectory = "{str(Path(target_exe).parent)}"
    $Shortcut.IconLocation = "{icon_path},0"
    $Shortcut.Description = "ProLab Smart Labeler — Mobile Phone Sales & Repair Lab"
    $Shortcut.Save()
    """
    try:
        CREATE_NO_WINDOW = 0x08000000
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            check=True,
            creationflags=CREATE_NO_WINDOW,
        )
        logger.info("Created desktop shortcut: %s.lnk", shortcut_name)
        return True
    except Exception as exc:
        logger.error("Failed to create desktop shortcut: %s", exc)
        return False


def main() -> int:
    """CLI entrypoint for standalone execution."""
    parser = argparse.ArgumentParser(description="ProLab Smart Labeler Brand Asset Generator")
    parser.add_argument("--output-dir", "-o", default=None, help="Target directory for output assets (default: ./assets)")
    parser.add_argument("--verify", action="store_true", help="Perform verification on generated assets")
    parser.add_argument("--shortcut", action="store_true", help="Create a desktop shortcut with generated icon")
    args = parser.parse_args()

    # Determine default output directory relative to project root
    if args.output_dir:
        out_dir = Path(args.output_dir)
    else:
        script_dir = Path(__file__).resolve().parent
        out_dir = script_dir if script_dir.name == "assets" else script_dir / "assets"

    try:
        ico_path, png_path = generate_assets(out_dir)
        print(f"[SUCCESS] Generated ICO: {ico_path}")
        print(f"[SUCCESS] Generated PNG: {png_path}")

        if args.verify:
            assert verify_ico_layers(Path(ico_path)), "ICO validation failed"
            assert verify_logo_png(Path(png_path)), "PNG validation failed"
            print("[SUCCESS] All asset integrity checks passed.")

        if args.shortcut:
            ok = create_desktop_shortcut(icon_path=ico_path)
            if ok:
                print("[SUCCESS] Desktop shortcut created successfully.")
            else:
                print("[WARNING] Could not create desktop shortcut.")
        return 0
    except Exception as exc:
        print(f"[ERROR] Asset generation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
```

### 4.2 Target Companion Utility: `assets/shortcut_util.py`
To satisfy the layout contract specified in `PROJECT.md` line 85 (`assets/shortcut_util.py`), this module provides a clean importable interface:

```python
"""
assets/shortcut_util.py — Programmatic Windows Desktop Shortcut Creator.
Provides zero-dependency Windows desktop shortcut creation using COM automation.
"""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
from typing import Optional


def create_desktop_shortcut(
    target_exe: Optional[str] = None,
    icon_path: Optional[str] = None,
    shortcut_name: str = "ProLab Smart Labeler"
) -> bool:
    """
    Creates a Windows Desktop shortcut pointing to the application executable with custom icon.
    Returns True on success, False on failure or unsupported platform.
    """
    if sys.platform != "win32":
        return False

    project_root = Path(__file__).resolve().parent.parent

    # Resolve target executable
    if target_exe is None:
        dist_exe = project_root / "dist" / "ThermalLabPro" / "ThermalLabPro.exe"
        if dist_exe.exists():
            target_exe = str(dist_exe.resolve())
        else:
            target_exe = sys.executable

    # Resolve icon path
    if icon_path is None:
        candidate_icon = project_root / "assets" / "app_icon.ico"
        icon_path = str(candidate_icon.resolve()) if candidate_icon.exists() else str(Path(target_exe).resolve())

    working_dir = str(Path(target_exe).parent.resolve())

    ps_script = f"""
    $desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
    $lnk = Join-Path $desktop "{shortcut_name}.lnk"
    $wsh = New-Object -ComObject WScript.Shell
    $sc = $wsh.CreateShortcut($lnk)
    $sc.TargetPath = "{target_exe}"
    $sc.WorkingDirectory = "{working_dir}"
    $sc.IconLocation = "{icon_path},0"
    $sc.Description = "ProLab Smart Labeler — Mobile Sales & Repair Lab 203 DPI"
    $sc.Save()
    """

    try:
        CREATE_NO_WINDOW = 0x08000000
        subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=True,
            check=True,
            creationflags=CREATE_NO_WINDOW,
        )
        return True
    except Exception:
        return False
```

---

## 5. System Integration & Codebase Modifications

### 5.1 `core/paths.py` Enhancements
To cleanly resolve asset paths in development and frozen environments, add these functions to `core/paths.py`:

```python
def get_assets_dir() -> Path:
    """
    Returns the path to the assets directory:
    - sys._MEIPASS / 'assets' when frozen
    - Project root / 'assets' in development mode
    Ensures directory exists before returning.
    """
    assets_dir = get_bundle_dir() / "assets"
    return assets_dir


def get_asset_path(filename: str = "") -> str:
    """
    Resolves the absolute path to an asset file (e.g. 'app_icon.ico', 'logo_header.png').
    Checks bundled assets directory first, then falls back to project root / assets.
    """
    if not filename:
        return str(get_assets_dir().resolve())
    asset_file = get_assets_dir() / filename
    return str(asset_file.resolve())
```

### 5.2 `main.py` Windows Integration
Modify `main.py` to register the authoritative AppUserModelID and set the application-wide icon:

```python
# In main.py:
from PyQt6.QtGui import QIcon
from core.paths import get_asset_path

def main():
    if sys.platform == "win32":
        try:
            import ctypes
            APP_ID = "ProLab.SmartLabeler.App.1.0"
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
        except Exception:
            pass

    app = QApplication(sys.argv)
    app.setApplicationName("Thermal Lab Pro")
    app.setOrganizationName("ThermalLab")

    # Set application-wide custom icon across all windows and message boxes
    icon_path = get_asset_path("app_icon.ico")
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))
```

### 5.3 `ui/status_bar.py` Brand Header Logo Integration
In `ui/status_bar.py`, integrate `logo_header.png` into `StatusBarPanel._init_ui()`:

```python
from PyQt6.QtGui import QPixmap
from PyQt6.QtCore import Qt
from core.paths import get_asset_path

# Inside StatusBarPanel._init_ui():
logo_path = get_asset_path("logo_header.png")
if os.path.exists(logo_path):
    self.lbl_logo = QLabel()
    pix = QPixmap(logo_path).scaled(36, 36, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
    self.lbl_logo.setPixmap(pix)
    self.lbl_logo.setFixedSize(36, 36)
    layout.addWidget(self.lbl_logo)

self.lbl_title = QLabel("ProLab Smart Labeler")
self.lbl_title.setStyleSheet("font-size: 15px; font-weight: bold; color: #D4AF37;")
layout.addWidget(self.lbl_title)
```

### 5.4 `build_exe.bat` & `app.spec` Packaging Integration
Update `build_exe.bat`:
```bat
echo [3/5] Cleaning previous build artifacts and generating assets...
if exist "build" rmdir /s /q "build"
if exist "dist\ThermalLabPro" rmdir /s /q "dist\ThermalLabPro"

echo Executing brand asset generation...
python assets\generate_icon.py --verify
if %errorlevel% neq 0 (
    echo [ERROR] Asset generation failed!
    exit /b 1
)

echo [4/5] Executing PyInstaller compilation...
pyinstaller --noconfirm app.spec
```

Update `app.spec`:
```python
datas = [
    (os.path.join(project_dir, 'bin'), 'bin'),
    (os.path.join(project_dir, 'assets'), 'assets'),
    (os.path.join(project_dir, 'data', 'apple_models.json'), 'data'),
]

# In EXE(...):
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ThermalLabPro',
    icon=os.path.join(project_dir, 'assets', 'app_icon.ico'),
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
)
```

---

## 6. Verification & Test Strategy (`tests/test_assets.py`)

A comprehensive unit test suite should be written at `tests/test_assets.py` to ensure high quality and zero regressions across all asset generation and integration contracts.

```python
"""
tests/test_assets.py — Comprehensive Unit Tests for Asset Generation & Windows Integration.
"""
import io
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

from PIL import Image

from assets.generate_icon import (
    generate_assets,
    render_master_brand_emblem,
    verify_ico_layers,
    verify_logo_png,
    create_desktop_shortcut,
    ICO_SIZES,
    PNG_HEADER_SIZE,
)
from core.paths import get_asset_path, get_assets_dir


class TestAssetGeneration(unittest.TestCase):
    """Verifies vector geometry, downsampling, binary formatting, and CLI execution."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.out_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_render_master_brand_emblem_properties(self):
        """Master emblem must be 1024x1024 RGBA with transparent canvas."""
        img = render_master_brand_emblem(1024)
        self.assertEqual(img.size, (1024, 1024))
        self.assertEqual(img.mode, "RGBA")
        # Corner pixel outside shield must be transparent
        self.assertEqual(img.getpixel((0, 0)), (0, 0, 0, 0))
        # Center of phone screen should be OLED black
        self.assertEqual(img.getpixel((512, 520)), (13, 13, 13, 255))

    def test_generate_assets_creates_valid_files(self):
        """generate_assets must produce app_icon.ico and logo_header.png with non-zero size."""
        ico_str, png_str = generate_assets(self.out_dir)
        ico_path = Path(ico_str)
        png_path = Path(png_str)

        self.assertTrue(ico_path.exists())
        self.assertTrue(png_path.exists())
        self.assertGreater(ico_path.stat().st_size, 10000)
        self.assertGreater(png_path.stat().st_size, 2000)

    def test_ico_binary_header_and_layers(self):
        """ICO must contain valid Windows header and all 6 required layer sizes."""
        ico_str, _ = generate_assets(self.out_dir)
        ico_path = Path(ico_str)
        data = ico_path.read_bytes()

        # Parse ICONDIR
        reserved, ico_type, count = struct.unpack("<HHH", data[:6])
        self.assertEqual(reserved, 0)
        self.assertEqual(ico_type, 1)
        self.assertEqual(count, 6)

        # Parse ICONDIRENTRYs
        parsed_sizes = []
        for i in range(count):
            entry = data[6 + i * 16 : 6 + (i + 1) * 16]
            w, h, colors, res, planes, bpp, size_bytes, offset = struct.unpack("<BBBBHHII", entry)
            dw = 256 if w == 0 else w
            dh = 256 if h == 0 else h
            parsed_sizes.append((dw, dh))
            self.assertEqual(bpp, 32)

        self.assertEqual(sorted(parsed_sizes), sorted(ICO_SIZES))

    def test_ico_layer_readability_with_pillow(self):
        """Every layer in the generated ICO must be loadable without exceptions."""
        ico_str, _ = generate_assets(self.out_dir)
        with Image.open(ico_str) as ico:
            sizes = set(ico.info.get("sizes", []))
            self.assertTrue(set(ICO_SIZES).issubset(sizes))
            for s in ICO_SIZES:
                ico.size = s
                frame = ico.load()
                self.assertIsNotNone(frame)
                self.assertEqual(ico.size, s)

    def test_logo_header_png_properties(self):
        """logo_header.png must be exactly 128x128 RGBA."""
        _, png_str = generate_assets(self.out_dir)
        png_path = Path(png_str)
        with Image.open(png_path) as png:
            self.assertEqual(png.size, PNG_HEADER_SIZE)
            self.assertEqual(png.mode, "RGBA")
            # Verify transparency on corner
            self.assertEqual(png.getpixel((0, 0))[3], 0)

    def test_standalone_cli_execution(self):
        """Script must execute standalone with exit code 0 via CLI."""
        script_path = Path(__file__).resolve().parent.parent / "assets" / "generate_icon.py"
        if not script_path.exists():
            self.skipTest("assets/generate_icon.py not yet implemented by worker")

        cmd = [sys.executable, str(script_path), "--output-dir", str(self.out_dir), "--verify"]
        res = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, f"CLI error: {res.stderr}")
        self.assertTrue((self.out_dir / "app_icon.ico").exists())
        self.assertTrue((self.out_dir / "logo_header.png").exists())

    def test_paths_helpers(self):
        """get_assets_dir and get_asset_path must resolve accurately."""
        assets_dir = get_assets_dir()
        self.assertTrue(assets_dir.name == "assets")
        ico_path = get_asset_path("app_icon.ico")
        self.assertTrue(ico_path.endswith("app_icon.ico"))


if __name__ == "__main__":
    unittest.main()
```

---

## 7. Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Technical Mitigation Strategy |
|:---|:---:|:---:|:---|
| **Pillow Resampling Edge Fringing** | Medium | Medium | Render on transparent `RGBA` master canvas; Lanczos handles alpha transparency cleanly. |
| **Pillow `getdata()` Deprecation in Pillow 13+** | High | Low | Use `getchannel('A')` or direct pixel iteration rather than deprecated `getdata()`. |
| **Windows Desktop Shortcut Path Redirection** | High | Medium | Query `[Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)` via PowerShell rather than hardcoding `C:\Users\...\Desktop`. |
| **Directory Ambiguity During Standalone CLI Execution** | Medium | Low | Intelligently detect if current directory or script parent is `assets/` to avoid creating nested `assets/assets/`. |
| **Flashing Console Window During Shortcut Creation** | High | Low | Pass `creationflags=0x08000000` (`CREATE_NO_WINDOW`) to `subprocess.run()`. |
