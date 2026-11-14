"""
core/label_template_renderer.py — High-Fidelity 203 DPI Thermal Renderer for Custom Templates
Renders PrintLabelTemplate instances into 1-bit monochrome PIL images and QPixmaps
with sub-millimeter precision, margins, barcodes, QR codes, and alignment.
"""
import logging
from typing import Dict, List, Optional, Tuple, Any
from PIL import Image, ImageDraw, ImageFont

from core.label_template_model import (
    PrintLabelTemplate, LabelElement, resolve_field_value
)
from core.label_renderer import (
    mm_to_dots, get_font, generate_code128_barcode,
    generate_qr_code, measure_text, draw_text_bounded,
    convert_image_to_1bit_monochrome, DOTS_PER_MM
)
from core.models import DeviceSpecs

logger = logging.getLogger(__name__)


def should_render_element(el: LabelElement, specs: Optional[DeviceSpecs]) -> bool:
    """
    Checks whether a template element should be included in label rendering.
    Rule: Battery health (battery_life) is exclusive to iPhone / Apple devices.
    If an Android / non-Apple phone is connected, battery_life is omitted completely.
    """
    if el.field_key == "battery_life":
        if specs is not None and getattr(specs, "marketing_name", ""):
            # Check if this connected device is Apple / iPhone
            is_apple = getattr(specs, "is_apple", False)
            if not is_apple:
                return False
    return True


def render_template_to_pil(
    template: PrintLabelTemplate,
    specs: Optional[DeviceSpecs] = None,
    stock_number: str = "001",
    draw_margin_guide: bool = False
) -> Image.Image:
    """
    Renders the given PrintLabelTemplate to an exact 203 DPI PIL image (mode '1').
    White background (1), black foreground (0).
    """
    w_mm, h_mm = template.effective_dimensions_mm()
    total_w_px = max(64, mm_to_dots(w_mm))
    total_h_px = max(64, mm_to_dots(h_mm))

    # Canvas (1 = white)
    img = Image.new("1", (total_w_px, total_h_px), 1)
    draw = ImageDraw.Draw(img)

    # Margins
    m_top = mm_to_dots(template.margin_top_mm)
    m_bottom = mm_to_dots(template.margin_bottom_mm)
    m_left = mm_to_dots(template.margin_left_mm)
    m_right = mm_to_dots(template.margin_right_mm)

    printable_w = max(10, total_w_px - m_left - m_right)
    printable_h = max(10, total_h_px - m_top - m_bottom)

    # Optional margin guide (used for editing canvas)
    if draw_margin_guide:
        # Draw light dotted/dashed rectangle for margin guide
        for x in range(m_left, total_w_px - m_right, 4):
            draw.point((x, m_top), fill=0)
            draw.point((x, total_h_px - m_bottom - 1), fill=0)
        for y in range(m_top, total_h_px - m_bottom, 4):
            draw.point((m_left, y), fill=0)
            draw.point((total_w_px - m_right - 1, y), fill=0)

    # Track vertical stack cursor if elements do not have custom y_mm set
    cursor_y = m_top

    for el in template.elements:
        if not should_render_element(el, specs):
            continue

        val = resolve_field_value(el.field_key, specs, stock_number)
        display_text = f"{el.title}:{val}" if el.show_title else val

        # Font resolution
        font_px = max(9, round(el.font_size * (203.2 / 72.0)))
        font = get_font(size_pt=float(el.font_size), bold=el.bold, preferred_family=el.font_family)

        # Positioning
        if el.y_mm > 0:
            item_y = round(el.y_mm * DOTS_PER_MM)
        else:
            item_y = cursor_y

        if el.x_mm > 0:
            item_x = round(el.x_mm * DOTS_PER_MM)
        else:
            item_x = m_left

        if el.is_barcode:
            # Render 1D Code128 Barcode with human readable text underneath
            barcode_h = round((el.height_mm or 8.0) * DOTS_PER_MM)
            # Bars take top 70%, text takes bottom 30%
            bars_h = max(16, int(barcode_h * 0.72))
            try:
                raw_barcode_val = specs.serial_number if (specs and el.field_key == "serial_number" and specs.serial_number) else val
                if not raw_barcode_val or raw_barcode_val == "Serial Number":
                    raw_barcode_val = "F2LZW9820D" if specs else "SERIAL12345"

                bc_img = generate_code128_barcode(
                    data=raw_barcode_val,
                    target_height_px=bars_h,
                    module_width_px=2,
                    quiet_zone_px=8,
                    max_width_px=printable_w
                )
                bc_w, bc_actual_h = bc_img.size

                # Align barcode
                if el.align == "center":
                    bc_x = m_left + max(0, (printable_w - bc_w) // 2)
                elif el.align == "right":
                    bc_x = max(m_left, total_w_px - m_right - bc_w)
                else:
                    bc_x = item_x

                img.paste(bc_img, (bc_x, item_y))

                # Human-readable text centered underneath the bars
                text_under = el.title if el.show_title else val
                t_w, t_h, _ = measure_text(draw, text_under, font)
                text_x = bc_x + max(0, (bc_w - t_w) // 2)
                text_y = item_y + bc_actual_h + 1
                draw_text_bounded(draw, (text_x, text_y), text_under, font, fill=0)

                cursor_y = max(cursor_y, text_y + t_h + 3)
            except Exception as e:
                logger.debug("Failed to render barcode: %s", e)
                # Fallback text
                draw_text_bounded(draw, (item_x, item_y), f"[{display_text}]", font, fill=0)
                cursor_y = max(cursor_y, item_y + 16)

        elif el.is_qr:
            # Render QR Code
            qr_size_px = max(32, min(printable_w, round((el.width_mm or 12.0) * DOTS_PER_MM)))
            try:
                qr_content = val or "https://3utools.com"
                qr_img = generate_qr_code(qr_content, target_size_px=qr_size_px, border_modules=1)
                qr_w, qr_h = qr_img.size
                if el.align == "center":
                    qr_x = m_left + max(0, (printable_w - qr_w) // 2)
                elif el.align == "right":
                    qr_x = max(m_left, total_w_px - m_right - qr_w)
                else:
                    qr_x = item_x
                img.paste(qr_img, (qr_x, item_y))
                cursor_y = max(cursor_y, item_y + qr_h + 3)
            except Exception as e:
                logger.debug("Failed to render QR: %s", e)
                draw_text_bounded(draw, (item_x, item_y), f"[QR: {display_text}]", font, fill=0)
                cursor_y = max(cursor_y, item_y + 16)

        else:
            # Standard Text line
            t_w, t_h, _ = measure_text(draw, display_text, font)
            if el.align == "center":
                text_x = m_left + max(0, (printable_w - t_w) // 2)
            elif el.align == "right":
                text_x = max(m_left, total_w_px - m_right - t_w)
            else:
                text_x = item_x

            draw_text_bounded(draw, (text_x, item_y), display_text, font, fill=0)
            cursor_y = max(cursor_y, item_y + t_h + 3)

    return img


def compute_element_rects(
    template: PrintLabelTemplate,
    specs: Optional[DeviceSpecs] = None,
    stock_number: str = "001"
) -> Dict[str, Tuple[int, int, int, int]]:
    """
    Computes bounding boxes (x, y, w, h) in dots for each element in the template,
    enabling mouse picking, selection outlines, and drag repositioning on the canvas.
    """
    rects: Dict[str, Tuple[int, int, int, int]] = {}
    w_mm, h_mm = template.effective_dimensions_mm()
    total_w_px = max(64, mm_to_dots(w_mm))
    total_h_px = max(64, mm_to_dots(h_mm))

    m_top = mm_to_dots(template.margin_top_mm)
    m_bottom = mm_to_dots(template.margin_bottom_mm)
    m_left = mm_to_dots(template.margin_left_mm)
    m_right = mm_to_dots(template.margin_right_mm)
    printable_w = max(10, total_w_px - m_left - m_right)

    # Dummy draw to measure
    dummy_img = Image.new("1", (1, 1), 1)
    dummy_draw = ImageDraw.Draw(dummy_img)

    cursor_y = m_top

    for el in template.elements:
        if not should_render_element(el, specs):
            continue

        val = resolve_field_value(el.field_key, specs, stock_number)
        display_text = f"{el.title}:{val}" if el.show_title else val
        font = get_font(size_pt=float(el.font_size), bold=el.bold, preferred_family=el.font_family)

        item_y = round(el.y_mm * DOTS_PER_MM) if el.y_mm > 0 else cursor_y
        item_x = round(el.x_mm * DOTS_PER_MM) if el.x_mm > 0 else m_left

        if el.is_barcode:
            bc_w = round((el.width_mm or 36.0) * DOTS_PER_MM)
            bc_h = round((el.height_mm or 8.0) * DOTS_PER_MM) + round(float(el.font_size) * 1.5)
            if el.align == "center":
                x = m_left + max(0, (printable_w - bc_w) // 2)
            elif el.align == "right":
                x = max(m_left, total_w_px - m_right - bc_w)
            else:
                x = item_x
            rects[el.id] = (x, item_y, bc_w, bc_h)
            cursor_y = max(cursor_y, item_y + bc_h + 3)

        elif el.is_qr:
            qr_size = round((el.width_mm or 12.0) * DOTS_PER_MM)
            if el.align == "center":
                x = m_left + max(0, (printable_w - qr_size) // 2)
            elif el.align == "right":
                x = max(m_left, total_w_px - m_right - qr_size)
            else:
                x = item_x
            rects[el.id] = (x, item_y, qr_size, qr_size)
            cursor_y = max(cursor_y, item_y + qr_size + 3)

        else:
            t_w, t_h, _ = measure_text(dummy_draw, display_text, font)
            t_w = max(40, t_w)
            t_h = max(14, t_h)
            if el.align == "center":
                x = m_left + max(0, (printable_w - t_w) // 2)
            elif el.align == "right":
                x = max(m_left, total_w_px - m_right - t_w)
            else:
                x = item_x
            rects[el.id] = (x, item_y, t_w, t_h)
            cursor_y = max(cursor_y, item_y + t_h + 3)

    return rects
