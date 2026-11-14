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
from typing import Optional, Tuple, Union

# Ensure project root is in sys.path for direct CLI execution
_project_root = str(Path(__file__).resolve().parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from PIL import Image, ImageDraw

from core.shortcut_util import create_desktop_shortcut, get_desktop_dir

__all__ = [
    "generate_assets",
    "create_desktop_shortcut",
    "get_desktop_dir",
    "render_master_brand_emblem",
    "verify_ico_layers",
    "verify_logo_png",
    "REQUIRED_ICO_SIZES",
    "ICO_SIZES",
    "PNG_HEADER_SIZE",
    "COLOR_MATTE_BLACK",
    "COLOR_METALLIC_GOLD",
    "main",
]

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("generate_icon")

# Layer Resolutions & Target Dimensions
REQUIRED_ICO_SIZES = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
ICO_SIZES = REQUIRED_ICO_SIZES
PNG_HEADER_SIZE = (128, 128)

# Authoritative Brand Color Palette
COLOR_MATTE_BLACK = (18, 18, 18)        # #121212
COLOR_METALLIC_GOLD = (212, 175, 55)    # #D4AF37

# RGBA Drawing Tuples
COLOR_TRANSPARENT = (0, 0, 0, 0)
RGBA_MATTE_BLACK = (18, 18, 18, 255)
RGBA_CHARCOAL_CHASSIS = (26, 26, 26, 255)   # #1A1A1A
RGBA_OLED_SCREEN = (13, 13, 13, 255)        # #0D0D0D
RGBA_METALLIC_GOLD = (212, 175, 55, 255)    # #D4AF37
RGBA_WARM_GOLD = (197, 160, 40, 255)        # #C5A028
RGBA_LIGHT_GOLD = (245, 222, 135, 255)      # #F5DE87
RGBA_ELECTRIC_GOLD = (255, 229, 127, 255)   # #FFE57F
RGBA_PULSE_GLOW = (255, 229, 127, 75)
RGBA_BEZEL_HALO = (212, 175, 55, 35)
RGBA_NOTCH = (30, 30, 30, 255)
RGBA_SCREEN_BEZEL = (45, 45, 45, 255)
RGBA_HOME_INDICATOR = (197, 160, 40, 220)


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

    # Outer Glow / Soft Halo Underlay
    draw.polygon(shield_pts, outline=RGBA_BEZEL_HALO, width=36)

    # Shield Matte Black Base Fill
    draw.polygon(shield_pts, fill=RGBA_MATTE_BLACK)

    # Outer Metallic Gold Bezel
    draw.polygon(shield_pts, outline=RGBA_METALLIC_GOLD, width=24)

    # Inner Bevel Accent Line (Parametric Inset by 94% toward centroid (512, 520))
    cx, cy = 512, 520
    scale = 0.94
    inner_pts = [
        (int(cx + (x - cx) * scale), int(cy + (y - cy) * scale))
        for x, y in shield_pts
    ]
    draw.polygon(inner_pts, outline=RGBA_LIGHT_GOLD, width=6)

    # 2. Smartphone Silhouette
    # Outer Chassis
    chassis_box = [(340, 220), (684, 800)]
    draw.rounded_rectangle(chassis_box, radius=42, fill=RGBA_CHARCOAL_CHASSIS, outline=RGBA_WARM_GOLD, width=8)

    # OLED Screen
    screen_box = [(356, 246), (668, 756)]
    draw.rounded_rectangle(screen_box, radius=28, fill=RGBA_OLED_SCREEN, outline=RGBA_SCREEN_BEZEL, width=2)

    # Dynamic Notch / Speaker Island
    notch_box = [(472, 260), (552, 274)]
    draw.rounded_rectangle(notch_box, radius=7, fill=RGBA_NOTCH)

    # Home Indicator Bar
    home_box = [(462, 738), (562, 744)]
    draw.rounded_rectangle(home_box, radius=3, fill=RGBA_HOME_INDICATOR)

    # 3. Thermal Code128 Barcode Bars
    bar_pattern = [8, 4, 16, 8, 4, 12, 8, 4, 16, 4, 8, 12, 4, 8, 16, 8, 4, 12, 6, 14, 6, 8, 4, 10, 4, 14, 4]
    bx = 396
    by1, by2 = 325, 475
    is_bar = True
    for w in bar_pattern:
        if is_bar:
            draw.rectangle([(bx, by1), (bx + w, by2)], fill=RGBA_METALLIC_GOLD)
        bx += w
        is_bar = not is_bar

    # 4. Diagnostic Lightning Pulse (ECG Telemetry Polyline)
    pulse_pts = [
        (240, 610), (380, 610), (410, 580), (430, 650),
        (470, 420), (510, 720), (550, 550), (580, 630),
        (610, 610), (784, 610)
    ]
    # Translucent neon glow underlay (composited cleanly onto base canvas)
    glow_overlay = Image.new("RGBA", (canvas_size, canvas_size), COLOR_TRANSPARENT)
    glow_draw = ImageDraw.Draw(glow_overlay)
    glow_draw.line(pulse_pts, fill=RGBA_PULSE_GLOW, width=24, joint="curve")
    img = Image.alpha_composite(img, glow_overlay)
    draw = ImageDraw.Draw(img)

    # Sharp electric core
    draw.line(pulse_pts, fill=RGBA_ELECTRIC_GOLD, width=14, joint="curve")


    # Diagnostic Apex & Trough Beacon Nodes
    draw.ellipse([(470 - 9, 420 - 9), (470 + 9, 420 + 9)], fill=(255, 244, 194, 255))
    draw.ellipse([(510 - 7, 720 - 7), (510 + 7, 720 + 7)], fill=RGBA_ELECTRIC_GOLD)

    return img


def verify_ico_layers(ico_path: Union[str, Path]) -> bool:
    """
    Validates binary header and confirms presence of all 6 required layer dimensions.
    """
    p = Path(ico_path)
    if not p.exists():
        return False
    data = p.read_bytes()
    if len(data) < 6:
        return False
    reserved, ico_type, count = struct.unpack("<HHH", data[:6])
    if reserved != 0 or ico_type != 1 or count != len(REQUIRED_ICO_SIZES):
        logger.error("Invalid ICO header: reserved=%d, type=%d, count=%d", reserved, ico_type, count)
        return False

    with Image.open(p) as ico:
        available_sizes = set(ico.info.get("sizes", []))
        if not available_sizes and hasattr(ico, "ico"):
            available_sizes = set(ico.ico.sizes())
        expected_sizes = set(REQUIRED_ICO_SIZES)
        if not expected_sizes.issubset(available_sizes):
            logger.error("Missing sizes in ICO. Expected %s, found %s", expected_sizes, available_sizes)
            return False
    return True


def verify_logo_png(png_path: Union[str, Path]) -> bool:
    """
    Validates dimensions and RGBA properties of header logo PNG.
    """
    p = Path(png_path)
    if not p.exists():
        return False
    with Image.open(p) as png:
        if png.size != PNG_HEADER_SIZE:
            logger.error("Invalid PNG dimensions: %s != %s", png.size, PNG_HEADER_SIZE)
            return False
        if png.mode != "RGBA":
            logger.error("Invalid PNG mode: %s != RGBA", png.mode)
            return False
    return True


def generate_assets(output_dir: Union[str, Path] = "assets") -> Tuple[str, str]:
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
    master.save(str(ico_target), format="ICO", sizes=REQUIRED_ICO_SIZES)

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


def main() -> int:
    """CLI entrypoint for standalone execution."""
    parser = argparse.ArgumentParser(description="ProLab Smart Labeler Brand Asset Generator")
    parser.add_argument("--output-dir", "-o", default=None, help="Target directory for output assets (default: ./assets)")
    parser.add_argument("--verify", action="store_true", help="Perform verification on generated assets")
    parser.add_argument("--shortcut", action="store_true", help="Create a desktop shortcut with generated icon")
    parser.add_argument("--target-exe", default=None, help="Target executable path for desktop shortcut (default: sys.executable / main.py)")
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
            ok = create_desktop_shortcut(
                target_exe=args.target_exe,
                icon_path=ico_path,
            )
            if ok:
                print("[SUCCESS] Desktop shortcut created successfully.")
            else:
                print("[ERROR] Desktop shortcut creation failed.", file=sys.stderr)
                return 1
        return 0
    except Exception as exc:
        print(f"[ERROR] Asset generation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
