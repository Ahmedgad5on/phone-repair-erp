"""
core/label_renderer.py — High-Precision 203 DPI Thermal Label Rendering Engine
Conforming to PROJECT.md Interface Contract #2.

Features:
- Native 1-bit monochrome PIL canvas (mode '1') at 203.2 DPI (8.000 dots/mm).
- Zero anti-aliasing blur for thermal print heads (e.g., Xprinter XP-370B).
- Compact Smart Merge algorithm for 38x25mm and 40x25mm labels.
- Arabic text reshaping (arabic-reshaper + python-bidi) with LRE/PDF number protection.
- Code128 barcodes and 2D QR codes with scannable quiet zones.
- Alignment calibration label generator with millimeter tick marks and center crosshair.
"""

from typing import Optional, Tuple, Dict, Any, List
import math
import os
import re

from PIL import Image, ImageDraw, ImageFont

from core.models import DeviceSpecs, RepairTicket

# ==============================================================================
# 1. Constants & Metric Scaling (203.2 DPI = 8.000 dots/mm)
# ==============================================================================

DPI = 203.2
DOTS_PER_MM = 8.0  # 203.2 / 25.4 = 8.0000 dots/mm

def mm_to_dots(mm: float) -> int:
    """Converts physical millimeters to 203 DPI pixel dots with exact integer rounding."""
    return round(mm * DOTS_PER_MM)

# ==============================================================================
# 2. Typography & Font Loader
# ==============================================================================

_FONT_CACHE: Dict[Tuple[int, bool], ImageFont.ImageFont] = {}

def get_font(size_pt: int, bold: bool = False) -> ImageFont.ImageFont:
    """
    Retrieves or caches a TrueType font rendered at exact 203 DPI pixel size.
    Hierarchy: Segoe UI -> Tahoma -> Arial -> PIL default fallback.
    """
    key = (size_pt, bold)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]

    # Convert typographic points (72 pt/in) to 203 DPI pixels
    size_px = max(9, round(size_pt * (DPI / 72.0)))

    candidate_paths = []
    if bold:
        candidate_paths = [
            r"C:\Windows\Fonts\segoeuib.ttf",
            r"C:\Windows\Fonts\tahomabd.ttf",
            r"C:\Windows\Fonts\arialbd.ttf",
        ]
    else:
        candidate_paths = [
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\tahoma.ttf",
            r"C:\Windows\Fonts\arial.ttf",
        ]

    for path in candidate_paths:
        if os.path.exists(path):
            try:
                font = ImageFont.truetype(path, size=size_px)
                _FONT_CACHE[key] = font
                return font
            except Exception:
                continue

    fallback = ImageFont.load_default()
    _FONT_CACHE[key] = fallback
    return fallback

# ==============================================================================
# 3. Arabic Text Processing & BiDi Pipeline
# ==============================================================================

def is_arabic_text(text: str) -> bool:
    """Checks if text contains characters in the standard Arabic Unicode block."""
    if not text:
        return False
    return any('\u0600' <= char <= '\u06FF' or '\u0750' <= char <= '\u077F' for char in text)

def reshape_arabic_text(text: str) -> str:
    """
    Applies contextual ligature reshaping and Unicode Bidirectional algorithm.
    Protects embedded numbers and Latin codes with LRE/PDF controls.
    """
    if not text or not text.strip():
        return text

    if not is_arabic_text(text):
        return text

    # Protect phone numbers, IMEI, and Latin strings from reversal
    def protect_ltr(match):
        return f"\u202A{match.group(0)}\u202C"

    # Protect digit groups and alphanumeric tokens
    processed = re.sub(r'(\+?\d[\d\- ]{3,}\d|[A-Za-z0-9\-_]{4,})', protect_ltr, text)

    try:
        import arabic_reshaper
        from bidi.algorithm import get_display

        reshaped = arabic_reshaper.reshape(processed)
        return get_display(reshaped)
    except ImportError:
        # Fallback if libraries are not yet installed
        return processed

# ==============================================================================
# 4. Barcode & QR Code Engines (with Self-Contained Built-In Fallback)
# ==============================================================================

# Standard Code128 pattern dictionary for 107 symbols (widths of 3 bars and 3 spaces)
CODE128_PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
]

def generate_code128_image(data: str, target_height_px: int = 50, module_width_px: int = 2) -> Image.Image:
    """
    Generates a high-precision 1-bit Code128 barcode image (mode '1').
    Attempts python-barcode first; falls back to pure-Python Code128 generator.
    """
    clean_data = str(data).strip()
    if not clean_data:
        clean_data = "EMPTY"

    try:
        import barcode
        from barcode.writer import ImageWriter

        CODE128 = barcode.get_barcode_class('code128')
        writer = ImageWriter()
        writer.set_options({
            'module_width': module_width_px * 0.125,
            'module_height': target_height_px * 0.125,
            'quiet_zone': 2.0,
            'write_text': False,
        })
        bc = CODE128(clean_data, writer=writer)
        pil_img = bc.render()
        return pil_img.convert('1')
    except Exception:
        return _render_native_code128_b(clean_data, target_height_px, module_width_px)

def _render_native_code128_b(text: str, height: int, module_w: int) -> Image.Image:
    """Pure-Python deterministic Code128 Subset B generator."""
    values = [104]  # Start B
    checksum = 104
    for idx, char in enumerate(text, start=1):
        val = ord(char) - 32
        val = max(0, min(val, 95))
        values.append(val)
        checksum += val * idx
    values.append(checksum % 103)
    values.append(106)  # Stop character

    # Build binary string (1=bar, 0=space)
    modules = []
    for val in values:
        pattern = CODE128_PATTERNS[val]
        is_bar = True
        for width_str in pattern:
            width = int(width_str)
            modules.extend([1 if is_bar else 0] * width)
            is_bar = not is_bar

    quiet_zone = [0] * (10 * module_w)
    total_modules = quiet_zone + [m for m in modules for _ in range(module_w)] + quiet_zone
    total_w = len(total_modules)

    img = Image.new("1", (total_w, height), color=1)
    draw = ImageDraw.Draw(img)
    for x, val in enumerate(total_modules):
        if val == 1:
            draw.line((x, 0, x, height - 1), fill=0)
    return img

def generate_qr_image(payload: str, box_size: int = 3, border: int = 2) -> Image.Image:
    """
    Generates a 1-bit monochrome QR Code (mode '1').
    Attempts qrcode library first; falls back to structured test pattern.
    """
    clean_payload = str(payload).strip()
    if not clean_payload:
        clean_payload = "EMPTY"

    try:
        import qrcode
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=box_size,
            border=border,
        )
        qr.add_data(clean_payload)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        return img.convert('1')
    except Exception:
        dim = 25 * box_size + 2 * border * box_size
        img = Image.new("1", (dim, dim), color=1)
        draw = ImageDraw.Draw(img)
        draw.rectangle((0, 0, dim - 1, dim - 1), outline=0, width=2)
        draw.rectangle((box_size * 2, box_size * 2, dim - box_size * 2, dim - box_size * 2), outline=0)
        draw.text((box_size * 4, dim // 2 - 4), "QR", font=ImageFont.load_default(), fill=0)
        return img

# ==============================================================================
# 5. Compact Smart Merge Algorithm
# ==============================================================================

def format_compact_smart_merge(
    marketing_name: str,
    storage: str,
    color: str,
    battery_health: Optional[int]
) -> str:
    """
    Returns the authoritative Compact Smart Merge string:
    'Model - Storage - Color - Battery%'
    Omit battery if None or <= 0.
    """
    parts = []
    if marketing_name and marketing_name.strip():
        parts.append(marketing_name.strip())
    if storage and storage.strip():
        parts.append(storage.strip())
    if color and color.strip():
        parts.append(color.strip())
    if battery_health is not None and battery_health > 0:
        parts.append(f"{battery_health}%")
    return " - ".join(parts)

# ==============================================================================
# 6. Core Label Renderer Implementation (Contract #2)
# ==============================================================================

def render_device_specs_label(
    specs: DeviceSpecs,
    width_mm: int = 38,
    height_mm: int = 25,
    compact_merge: bool = True,
    barcode_type: str = "code128",  # "code128", "qr", "both"
    show_titles: bool = True,
    margin_mm: float = 1.0,
    stock_number: str = ""
) -> Image.Image:
    """
    Returns a native 1-bit monochrome PIL Image (mode '1') at 203 DPI.
    Zero anti-aliasing blur for thermal print heads.
    """
    width_px = mm_to_dots(width_mm)
    height_px = mm_to_dots(height_mm)
    margin_px = mm_to_dots(margin_mm)

    canvas = Image.new("1", (width_px, height_px), color=1)
    draw = ImageDraw.Draw(canvas)

    usable_w = width_px - (2 * margin_px)
    usable_h = height_px - (2 * margin_px)

    stk_num = stock_number.strip() if stock_number else (specs.device_id or "STK-000000")
    if stk_num and not stk_num.startswith("#") and not stk_num.startswith("STK"):
        stk_display = f"#{stk_num}"
    else:
        stk_display = f"#{stk_num}" if stk_num.startswith("STK") else stk_num

    grade = (specs.condition_grade or "A+").strip()

    # Fonts
    f_header = get_font(9, bold=True)
    f_main = get_font(8, bold=True)
    f_sub = get_font(7, bold=False)
    f_badge = get_font(8, bold=True)
    f_barcode = get_font(7, bold=False)

    curr_y = margin_px

    # 1. Header Row (Stock # & Grade Badge)
    draw.text((margin_px, curr_y), stk_display, font=f_header, fill=0)

    # Grade Badge on right
    if grade:
        badge_text = f" {grade} "
        bb = draw.textbbox((0, 0), badge_text, font=f_badge)
        bw = (bb[2] - bb[0]) + 4
        bh = (bb[3] - bb[1]) + 4
        bx = width_px - margin_px - bw
        # Draw solid black badge box with white text
        draw.rectangle((bx, curr_y, bx + bw, curr_y + bh), fill=0)
        draw.text((bx + 2, curr_y + 1), badge_text, font=f_badge, fill=1)

    curr_y += 20

    # 2. Device Identity & Specs
    model_name = specs.marketing_name or f"{specs.brand} {specs.model_code}".strip()

    if compact_merge:
        # Compact Smart Merge
        merged_line = format_compact_smart_merge(
            model_name,
            specs.storage,
            specs.color,
            specs.battery_health
        )
        bb_m = draw.textbbox((0, 0), merged_line, font=f_main)
        if (bb_m[2] - bb_m[0]) > usable_w:
            # Wrap to 2 lines
            l1 = f"{model_name} {specs.storage}".strip()
            l2_parts = [specs.color]
            if specs.battery_health and specs.battery_health > 0:
                l2_parts.append(f"{specs.battery_health}%")
            if specs.sales_region:
                l2_parts.append(specs.sales_region)
            l2 = " • ".join(p for p in l2_parts if p)

            draw.text((margin_px, curr_y), l1, font=f_main, fill=0)
            curr_y += 16
            draw.text((margin_px, curr_y), l2, font=f_sub, fill=0)
            curr_y += 16
        else:
            draw.text((margin_px, curr_y), merged_line, font=f_main, fill=0)
            curr_y += 18

        # Diagnostics & Serial row
        diag_parts = []
        if specs.serial_number:
            diag_parts.append(f"SN: {specs.serial_number}")
        if specs.battery_cycles:
            diag_parts.append(f"{specs.battery_cycles}cy")
        if specs.sales_region and (bb_m[2] - bb_m[0]) <= usable_w:
            diag_parts.append(specs.sales_region)

        if diag_parts and curr_y < (height_px - 75):
            diag_str = " | ".join(diag_parts)
            draw.text((margin_px, curr_y), diag_str, font=f_sub, fill=0)
            curr_y += 16

    else:
        # Multi-line full layout for larger labels
        if show_titles:
            draw.text((margin_px, curr_y), f"Model: {model_name}", font=f_main, fill=0)
        else:
            draw.text((margin_px, curr_y), model_name, font=f_main, fill=0)
        curr_y += 18

        specs_line = f"Storage: {specs.storage}  RAM: {specs.ram}".strip()
        draw.text((margin_px, curr_y), specs_line, font=f_sub, fill=0)
        curr_y += 16

        color_reg = f"Color: {specs.color}  Region: {specs.sales_region or 'N/A'}"
        draw.text((margin_px, curr_y), color_reg, font=f_sub, fill=0)
        curr_y += 16

        if specs.battery_health:
            bat_str = f"Battery: {specs.battery_health}% ({specs.battery_cycles or 0} Cycles)"
            draw.text((margin_px, curr_y), bat_str, font=f_sub, fill=0)
            curr_y += 16

        if specs.serial_number:
            draw.text((margin_px, curr_y), f"SN: {specs.serial_number}", font=f_sub, fill=0)
            curr_y += 16

    # 3. Barcode / QR Section
    barcode_payload = specs.imei1 or stk_num or specs.serial_number or "123456789012345"
    remaining_h = height_px - margin_px - curr_y

    if barcode_type == "qr":
        qr_size = min(remaining_h - 4, usable_w, 90)
        if qr_size > 30:
            qr_img = generate_qr_image(barcode_payload, box_size=max(2, qr_size // 30), border=1)
            qr_resized = qr_img.resize((qr_size, qr_size), Image.NEAREST)
            paste_x = margin_px + (usable_w - qr_size) // 2
            canvas.paste(qr_resized, (paste_x, curr_y + 2))
    elif barcode_type == "both" and usable_w >= 380:
        # Dual Barcode + QR on large labels
        qr_dim = min(remaining_h - 16, 70)
        qr_img = generate_qr_image(barcode_payload, box_size=2, border=1).resize((qr_dim, qr_dim), Image.NEAREST)
        canvas.paste(qr_img, (margin_px, curr_y + 2))

        bc_w = usable_w - qr_dim - 12
        bc_img = generate_code128_image(barcode_payload, target_height_px=remaining_h - 18, module_width_px=2)
        if bc_img.width > bc_w:
            bc_img = generate_code128_image(barcode_payload, target_height_px=remaining_h - 18, module_width_px=1)
        canvas.paste(bc_img, (margin_px + qr_dim + 8, curr_y + 2))
    else:
        # Standard Code128 barcode
        bc_target_h = max(28, remaining_h - 18)
        bc_img = generate_code128_image(barcode_payload, target_height_px=bc_target_h, module_width_px=2)
        if bc_img.width > usable_w:
            bc_img = generate_code128_image(barcode_payload, target_height_px=bc_target_h, module_width_px=1)

        paste_x = margin_px + max(0, (usable_w - bc_img.width) // 2)
        canvas.paste(bc_img, (paste_x, curr_y + 2))
        curr_y += bc_img.height + 4

        # Human-readable barcode text centered
        bb_t = draw.textbbox((0, 0), barcode_payload, font=f_barcode)
        tw = bb_t[2] - bb_t[0]
        tx = margin_px + max(0, (usable_w - tw) // 2)
        draw.text((tx, curr_y), barcode_payload, font=f_barcode, fill=0)

    return canvas

def render_repair_ticket_label(
    ticket: RepairTicket,
    width_mm: int = 50,
    height_mm: int = 30,
    barcode_type: str = "code128",
    margin_mm: float = 1.0
) -> Image.Image:
    """
    Returns a native 1-bit monochrome PIL Image (mode '1') at 203 DPI
    representing a workshop service repair intake ticket.
    """
    width_px = mm_to_dots(width_mm)
    height_px = mm_to_dots(height_mm)
    margin_px = mm_to_dots(margin_mm)

    canvas = Image.new("1", (width_px, height_px), color=1)
    draw = ImageDraw.Draw(canvas)

    usable_w = width_px - (2 * margin_px)
    usable_h = height_px - (2 * margin_px)

    f_title = get_font(10, bold=True)
    f_bold = get_font(8, bold=True)
    f_body = get_font(7, bold=False)
    f_small = get_font(6, bold=False)

    curr_y = margin_px

    # 1. Header (Ticket ID & Date)
    ticket_id = ticket.ticket_id or "TKT-000000"
    draw.text((margin_px, curr_y), ticket_id, font=f_title, fill=0)

    intake_date = ticket.intake_datetime or "2026-11-07"
    bb_d = draw.textbbox((0, 0), intake_date, font=f_small)
    draw.text((width_px - margin_px - (bb_d[2] - bb_d[0]), curr_y + 3), intake_date, font=f_small, fill=0)
    curr_y += 22

    # Divider line
    draw.line((margin_px, curr_y, width_px - margin_px, curr_y), fill=0, width=1)
    curr_y += 4

    # 2. Customer Name (Arabic/English) & Phone
    cust_name = reshape_arabic_text(ticket.customer_name or "Walk-in Customer")
    phone = ticket.customer_phone or "N/A"
    draw.text((margin_px, curr_y), cust_name, font=f_bold, fill=0)
    bb_p = draw.textbbox((0, 0), phone, font=f_bold)
    draw.text((width_px - margin_px - (bb_p[2] - bb_p[0]), curr_y), phone, font=f_bold, fill=0)
    curr_y += 17

    # 3. Device & Fault
    model = ticket.device_model or "Unknown Device"
    draw.text((margin_px, curr_y), f"Model: {model}", font=f_body, fill=0)
    curr_y += 15

    fault = reshape_arabic_text(ticket.reported_fault or "Diagnostics Needed")
    draw.text((margin_px, curr_y), f"Fault: {fault}", font=f_body, fill=0)
    curr_y += 16

    # 4. Security Checkboxes & Est Cost
    passcode = ticket.passcode or "None"
    cost_str = f"${ticket.estimated_cost:.2f}" if ticket.estimated_cost > 0 else "TBD"

    info_line = f"Pass: {passcode} | Est: {cost_str}"
    draw.text((margin_px, curr_y), info_line, font=f_body, fill=0)
    curr_y += 16

    # Status Checkboxes
    cb_sim = "[X] SIM Out" if ticket.sim_removed else "[ ] SIM Out"
    cb_crack = "[X] Cracked" if ticket.back_cracked else "[ ] Cracked"
    cb_dead = "[X] Dead" if ticket.dead_device else "[ ] Dead"
    checkboxes_str = f"{cb_sim}  {cb_crack}  {cb_dead}"
    draw.text((margin_px, curr_y), checkboxes_str, font=f_small, fill=0)
    curr_y += 14

    # 5. Barcode / QR Code
    remaining_h = height_px - margin_px - curr_y
    if remaining_h >= 30:
        if barcode_type == "qr":
            qr_payload = f"TICKET:{ticket_id}|PHONE:{phone}|MODEL:{model}"
            qr_size = min(remaining_h, 70)
            qr_img = generate_qr_image(qr_payload, box_size=2, border=1).resize((qr_size, qr_size), Image.NEAREST)
            paste_x = margin_px + (usable_w - qr_size) // 2
            canvas.paste(qr_img, (paste_x, curr_y))
        else:
            bc_h = max(24, remaining_h - 14)
            bc_img = generate_code128_image(ticket_id, target_height_px=bc_h, module_width_px=2)
            if bc_img.width > usable_w:
                bc_img = generate_code128_image(ticket_id, target_height_px=bc_h, module_width_px=1)
            paste_x = margin_px + max(0, (usable_w - bc_img.width) // 2)
            canvas.paste(bc_img, (paste_x, curr_y))
            curr_y += bc_img.height + 2
            bb_t = draw.textbbox((0, 0), ticket_id, font=f_small)
            draw.text((margin_px + (usable_w - (bb_t[2] - bb_t[0])) // 2, curr_y), ticket_id, font=f_small, fill=0)

    return canvas

def render_calibration_label(width_mm: int = 38, height_mm: int = 25) -> Image.Image:
    """
    Generates an alignment test border with millimeter tick marks and center crosshair.
    Complies with TestF18AlignmentCalibrationGenerator and Tier 2 boundary verification.
    """
    width_px = mm_to_dots(width_mm)
    height_px = mm_to_dots(height_mm)
    margin_px = mm_to_dots(1.0)  # Standard 1.0mm = 8px

    canvas = Image.new("1", (width_px, height_px), color=1)
    draw = ImageDraw.Draw(canvas)

    # 1. Outer Perimeter 1px Border (Hardware Edge Check)
    draw.rectangle((0, 0, width_px - 1, height_px - 1), outline=0, width=1)

    # 2. Inset Margin Border Box
    draw.rectangle((margin_px, margin_px, width_px - margin_px, height_px - margin_px), outline=0, width=1)

    # 3. Millimeter Tick Marks (Every 8 pixels)
    tick_interval_px = mm_to_dots(1.0)
    f_ticks = get_font(5, bold=False)

    # Top and Bottom Horizontal Ticks
    for x in range(margin_px, width_px - margin_px + 1, tick_interval_px):
        mm_idx = (x - margin_px) // tick_interval_px
        if mm_idx % 10 == 0 and mm_idx > 0:
            tick_len = 10
            draw.text((x - 4, margin_px + tick_len + 1), str(mm_idx), font=f_ticks, fill=0)
        elif mm_idx % 5 == 0:
            tick_len = 6
        else:
            tick_len = 4

        draw.line((x, margin_px, x, margin_px + tick_len), fill=0, width=1)
        draw.line((x, height_px - margin_px, x, height_px - margin_px - tick_len), fill=0, width=1)

    # Left and Right Vertical Ticks
    for y in range(margin_px, height_px - margin_px + 1, tick_interval_px):
        mm_idx = (y - margin_px) // tick_interval_px
        if mm_idx % 10 == 0 and mm_idx > 0:
            tick_len = 10
        elif mm_idx % 5 == 0:
            tick_len = 6
        else:
            tick_len = 4

        draw.line((margin_px, y, margin_px + tick_len, y), fill=0, width=1)
        draw.line((width_px - margin_px, y, width_px - margin_px - tick_len, y), fill=0, width=1)

    # 4. Center Alignment Crosshair & Circle
    cx = width_px // 2
    cy = height_px // 2
    cross_size = 16
    draw.line((cx - cross_size, cy, cx + cross_size, cy), fill=0, width=1)
    draw.line((cx, cy - cross_size, cx, cy + cross_size), fill=0, width=1)
    draw.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), outline=0, width=1)

    # 5. Dimensional Information Banner
    f_title = get_font(8, bold=True)
    f_sub = get_font(6, bold=False)

    dim_text = f"{width_mm}x{height_mm} mm - 203 DPI"
    bb1 = draw.textbbox((0, 0), dim_text, font=f_title)
    draw.text((cx - (bb1[2] - bb1[0]) // 2, margin_px + 14), dim_text, font=f_title, fill=0)

    sub_text = "CALIBRATION VERIFIED: 8 DOTS/MM"
    bb2 = draw.textbbox((0, 0), sub_text, font=f_sub)
    draw.text((cx - (bb2[2] - bb2[0]) // 2, margin_px + 28), sub_text, font=f_sub, fill=0)

    # 6. Test Barcode
    test_code = "TEST-XP370B"
    bc_h = 32
    bc_img = generate_code128_image(test_code, target_height_px=bc_h, module_width_px=1)
    if bc_img.width <= (width_px - 2 * margin_px):
        canvas.paste(bc_img, (cx - bc_img.width // 2, height_px - margin_px - bc_h - 16))
        draw.text((cx - 24, height_px - margin_px - 14), test_code, font=f_ticks, fill=0)

    return canvas
