"""
ui/print_labels_canvas.py — Precision Interactive 203 DPI Thermal Label Canvas
Features:
- Sub-millimeter physical rendering on 203 DPI grid (8 dots/mm).
- Millimeter rulers (top horizontal and left vertical graduated in mm).
- Printable safe-zone margins with dashed guidelines.
- Full interactive selection with 8 resize handles (4 corners + 4 midpoints).
- Drag-to-move (X, Y) and drag-to-resize (dynamically scaling font size / barcode height).
- Micro-precision keyboard shortcuts: Arrow keys nudge by 0.5 mm, Delete removes, Ctrl+Wheel scales.
- Zoom support: 100%, 150%, 200%, and Fit-to-View.
"""
from typing import Optional, Dict, Tuple, List
from PyQt6.QtCore import Qt, QRectF, QPointF, pyqtSignal
from PyQt6.QtGui import (
    QPainter, QPen, QBrush, QColor, QFont, QMouseEvent, QKeyEvent, QWheelEvent,
    QImage, QPixmap
)
from PyQt6.QtWidgets import QWidget

from core.label_template_model import PrintLabelTemplate, LabelElement
from core.label_template_renderer import render_template_to_pil, compute_element_rects
from core.label_renderer import DOTS_PER_MM
from core.models import DeviceSpecs


class PrintLabelsCanvas(QWidget):
    """
    High-precision interactive CAD/WYSIWYG canvas for thermal label editing.
    """
    element_selected = pyqtSignal(str)              # Emits element_id
    element_moved = pyqtSignal(str, float, float)   # Emits (element_id, x_mm, y_mm)
    element_resized = pyqtSignal(str, int)          # Emits (element_id, new_font_size)
    element_deleted = pyqtSignal(str)              # Emits element_id
    zoom_changed = pyqtSignal(float)               # Emits scale factor

    # Handle indices:
    # 0: TL, 1: TC, 2: TR, 3: ML, 4: MR, 5: BL, 6: BC, 7: BR
    HANDLE_CURSORS = [
        Qt.CursorShape.SizeFDiagCursor,  # TL
        Qt.CursorShape.SizeVerCursor,   # TC
        Qt.CursorShape.SizeBDiagCursor,  # TR
        Qt.CursorShape.SizeHorCursor,   # ML
        Qt.CursorShape.SizeHorCursor,   # MR
        Qt.CursorShape.SizeBDiagCursor,  # BL
        Qt.CursorShape.SizeVerCursor,   # BC
        Qt.CursorShape.SizeFDiagCursor,  # BR
    ]

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setMinimumSize(480, 360)

        self._template: Optional[PrintLabelTemplate] = None
        self._specs: Optional[DeviceSpecs] = None
        self._stock_number: str = "001"
        self._selected_id: Optional[str] = None

        # Rulers & layout metrics
        self.ruler_size = 24  # px width/height for rulers
        self._snap_to_grid: bool = False
        self._grid_step_mm: float = 0.5

        # Drag & Resize interaction states
        self._is_dragging: bool = False
        self._is_resizing: bool = False
        self._active_handle_idx: int = -1
        self._drag_start_pos: Optional[QPointF] = None
        self._element_orig_mm: Tuple[float, float] = (0.0, 0.0)
        self._element_orig_size: int = 8

        # Cached dots rects: id -> (rx, ry, rw, rh) in dots
        self._rects_dots: Dict[str, Tuple[int, int, int, int]] = {}

        # Viewport scale & offset
        self._user_zoom: Optional[float] = None  # None means auto-fit
        self._scale: float = 1.0
        self._offset_x: float = 0.0
        self._offset_y: float = 0.0

    # -----------------------------------------------------------------------
    # Configuration & Data Binding
    # -----------------------------------------------------------------------

    def set_template(self, template: PrintLabelTemplate):
        self._template = template
        self._recompute_rects()
        self.update()

    def set_specs(self, specs: Optional[DeviceSpecs], stock_number: str = "001"):
        self._specs = specs
        self._stock_number = stock_number
        self._recompute_rects()
        self.update()

    def select_element(self, element_id: Optional[str]):
        if self._selected_id != element_id:
            self._selected_id = element_id
            self.update()

    def get_selected_id(self) -> Optional[str]:
        return self._selected_id

    def set_snap_to_grid(self, enabled: bool):
        self._snap_to_grid = enabled

    def set_zoom(self, zoom_mode: str):
        """zoom_mode can be 'fit', '1.0', '1.5', '2.0'"""
        if zoom_mode == "fit":
            self._user_zoom = None
        elif zoom_mode == "1.0":
            self._user_zoom = 1.0
        elif zoom_mode == "1.5":
            self._user_zoom = 1.5
        elif zoom_mode == "2.0":
            self._user_zoom = 2.0
        self.update()

    def _recompute_rects(self):
        if self._template:
            self._rects_dots = compute_element_rects(self._template, self._specs, self._stock_number)
        else:
            self._rects_dots = {}

    # -----------------------------------------------------------------------
    # Painting Routines (Obsidian CAD Studio Style)
    # -----------------------------------------------------------------------

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        painter.setRenderHint(QPainter.RenderHint.TextAntialiasing, True)

        # Clear background (Obsidian CAD drafting background)
        painter.fillRect(self.rect(), QColor("#111116"))

        if not self._template:
            painter.setPen(QColor("#64748B"))
            painter.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, "No Label Template Loaded")
            return

        w_mm, h_mm = self._template.effective_dimensions_mm()
        total_w_dots = max(64, round(w_mm * DOTS_PER_MM))
        total_h_dots = max(64, round(h_mm * DOTS_PER_MM))

        # Calculate scale and positioning considering rulers
        avail_w = self.width() - self.ruler_size - 40
        avail_h = self.height() - self.ruler_size - 40
        if avail_w <= 0 or avail_h <= 0:
            return

        if self._user_zoom is None:
            scale_x = avail_w / total_w_dots
            scale_y = avail_h / total_h_dots
            self._scale = min(scale_x, scale_y, 2.5)
            self._scale = max(self._scale, 0.4)
        else:
            self._scale = self._user_zoom

        paper_draw_w = total_w_dots * self._scale
        paper_draw_h = total_h_dots * self._scale
        self._offset_x = self.ruler_size + max(20.0, (avail_w - paper_draw_w) / 2)
        self._offset_y = self.ruler_size + max(20.0, (avail_h - paper_draw_h) / 2)

        paper_rect = QRectF(self._offset_x, self._offset_y, paper_draw_w, paper_draw_h)

        # Draw CAD dot grid background
        grid_pen = QPen(QColor(45, 45, 60, 90), 1)
        painter.setPen(grid_pen)
        grid_step = 24
        for gx in range(int(self.ruler_size) + 10, self.width(), grid_step):
            for gy in range(int(self.ruler_size) + 10, self.height(), grid_step):
                painter.drawPoint(gx, gy)

        # Draw Rulers
        self._draw_rulers(painter, w_mm, h_mm, paper_rect)

        # Multi-layer soft drop shadow behind label paper
        for s_off, s_alpha in [(8, 15), (6, 25), (4, 45), (2, 70)]:
            shadow_rect = paper_rect.translated(s_off, s_off)
            painter.fillRect(shadow_rect, QColor(0, 0, 0, s_alpha))

        # White Thermal Paper Base
        painter.fillRect(paper_rect, QColor("#FFFFFF"))
        painter.setPen(QPen(QColor("#D4AF37"), 1.2))  # Subtle gold outer edge
        painter.drawRect(paper_rect)

        # Draw Safe-Zone Guidelines (Dashed Crimson/Gray margins)
        m_top = self._template.margin_top_mm * DOTS_PER_MM * self._scale
        m_bottom = self._template.margin_bottom_mm * DOTS_PER_MM * self._scale
        m_left = self._template.margin_left_mm * DOTS_PER_MM * self._scale
        m_right = self._template.margin_right_mm * DOTS_PER_MM * self._scale

        margin_rect = QRectF(
            self._offset_x + m_left,
            self._offset_y + m_top,
            paper_draw_w - m_left - m_right,
            paper_draw_h - m_top - m_bottom
        )
        dash_pen = QPen(QColor("#FF7777"), 1, Qt.PenStyle.DashLine)
        painter.setPen(dash_pen)
        painter.drawRect(margin_rect)

        # Render thermal PIL image and blit onto paper
        try:
            pil_img = render_template_to_pil(self._template, self._specs, self._stock_number, draw_margin_guide=False)
            rgb_img = pil_img.convert("RGBA")
            data = rgb_img.tobytes("raw", "RGBA")
            qimg = QImage(data, rgb_img.width, rgb_img.height, QImage.Format.Format_RGBA8888)
            painter.drawImage(paper_rect, qimg)
        except Exception as e:
            painter.setPen(QColor("#EF4444"))
            painter.drawText(paper_rect, Qt.AlignmentFlag.AlignCenter, f"Render Error: {e}")

        # Draw Studio CAD Info Badge under label
        badge_y = paper_rect.bottom() + 14
        if badge_y + 22 < self.height():
            badge_text = f"✦ {w_mm:.0f}×{h_mm:.0f} mm  •  203 DPI  •  {int(self._scale * 100)}% Zoom  •  Thermal Ready"
            font_badge = QFont("Segoe UI", 8, QFont.Weight.DemiBold)
            painter.setFont(font_badge)
            fm = painter.fontMetrics()
            tw = fm.horizontalAdvance(badge_text) + 24
            badge_rect = QRectF(paper_rect.center().x() - tw / 2, badge_y, tw, 22)
            painter.setPen(QPen(QColor("#282834"), 1))
            painter.setBrush(QBrush(QColor("#16161F")))
            painter.drawRoundedRect(badge_rect, 11, 11)
            painter.setPen(QColor("#D4AF37"))
            painter.drawText(badge_rect, Qt.AlignmentFlag.AlignCenter, badge_text)

        # Draw Selection Box and 8 Resize Handles
        if self._selected_id and self._selected_id in self._rects_dots:
            rx, ry, rw, rh = self._rects_dots[self._selected_id]
            sel_x = self._offset_x + rx * self._scale
            sel_y = self._offset_y + ry * self._scale
            sel_w = rw * self._scale
            sel_h = rh * self._scale
            sel_rect = QRectF(sel_x - 2, sel_y - 2, sel_w + 4, sel_h + 4)

            # Gold selection outline
            gold_pen = QPen(QColor("#D4AF37"), 1.8, Qt.PenStyle.SolidLine)
            painter.setPen(gold_pen)
            painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.drawRect(sel_rect)

            # 8 Handles (White fill with Gold border)
            handle_size = 7
            handle_brush = QBrush(QColor("#FFFFFF"))
            handle_pen = QPen(QColor("#D4AF37"), 1.5)
            painter.setPen(handle_pen)
            painter.setBrush(handle_brush)

            handles = self._get_handle_rects(sel_rect, handle_size)
            for h_rect in handles:
                painter.drawRect(h_rect)

    def _draw_rulers(self, painter: QPainter, w_mm: float, h_mm: float, paper_rect: QRectF):
        """Draws precision millimeter CAD rulers along the top and left axes."""
        ruler_bg = QColor("#16161E")
        ruler_line = QPen(QColor("#282834"), 1)
        tick_pen = QPen(QColor("#9CA3AF"), 1)
        font = QFont("Segoe UI", 7)
        painter.setFont(font)

        # Top Ruler Header
        top_ruler_rect = QRectF(0, 0, self.width(), self.ruler_size)
        painter.fillRect(top_ruler_rect, ruler_bg)
        painter.setPen(ruler_line)
        painter.drawLine(0, self.ruler_size, self.width(), self.ruler_size)

        # Left Ruler Header
        left_ruler_rect = QRectF(0, 0, self.ruler_size, self.height())
        painter.fillRect(left_ruler_rect, ruler_bg)
        painter.setPen(ruler_line)
        painter.drawLine(self.ruler_size, 0, self.ruler_size, self.height())

        # Corner box
        painter.fillRect(QRectF(0, 0, self.ruler_size, self.ruler_size), QColor("#1A1A24"))
        painter.setPen(QColor("#D4AF37"))
        painter.drawText(QRectF(0, 0, self.ruler_size, self.ruler_size), Qt.AlignmentFlag.AlignCenter, "mm")

        # Top Ruler Ticks (Every 1mm and 5mm)
        dots_per_mm_scaled = DOTS_PER_MM * self._scale
        for mm in range(int(w_mm) + 1):
            x = paper_rect.left() + (mm * dots_per_mm_scaled)
            if x > self.width():
                break
            painter.setPen(tick_pen)
            if mm % 10 == 0:
                painter.drawLine(int(x), self.ruler_size - 10, int(x), self.ruler_size)
                painter.drawText(QRectF(x - 12, 1, 24, 10), Qt.AlignmentFlag.AlignCenter, str(mm))
            elif mm % 5 == 0:
                painter.drawLine(int(x), self.ruler_size - 6, int(x), self.ruler_size)
            else:
                painter.drawLine(int(x), self.ruler_size - 3, int(x), self.ruler_size)

        # Left Ruler Ticks (Every 1mm and 5mm)
        for mm in range(int(h_mm) + 1):
            y = paper_rect.top() + (mm * dots_per_mm_scaled)
            if y > self.height():
                break
            painter.setPen(tick_pen)
            if mm % 10 == 0:
                painter.drawLine(self.ruler_size - 10, int(y), self.ruler_size, int(y))
                painter.drawText(QRectF(1, y - 6, self.ruler_size - 10, 12), Qt.AlignmentFlag.AlignRight, str(mm))
            elif mm % 5 == 0:
                painter.drawLine(self.ruler_size - 6, int(y), self.ruler_size, int(y))
            else:
                painter.drawLine(self.ruler_size - 3, int(y), self.ruler_size, int(y))

    # -----------------------------------------------------------------------
    # Handle Calculation & Hit Testing
    # -----------------------------------------------------------------------

    def _get_handle_rects(self, sel_rect: QRectF, size: float = 7) -> List[QRectF]:
        """Returns 8 bounding rects for TL, TC, TR, ML, MR, BL, BC, BR."""
        cx = sel_rect.center().x()
        cy = sel_rect.center().y()
        pts = [
            sel_rect.topLeft(),                                 # 0: TL
            QPointF(cx, sel_rect.top()),                        # 1: TC
            sel_rect.topRight(),                                # 2: TR
            QPointF(sel_rect.left(), cy),                       # 3: ML
            QPointF(sel_rect.right(), cy),                      # 4: MR
            sel_rect.bottomLeft(),                              # 5: BL
            QPointF(cx, sel_rect.bottom()),                     # 6: BC
            sel_rect.bottomRight()                              # 7: BR
        ]
        half = size / 2
        return [QRectF(p.x() - half, p.y() - half, size, size) for p in pts]

    def _find_handle_at(self, pos: QPointF) -> int:
        """Returns handle index (0..7) or -1 if none."""
        if not self._selected_id or self._selected_id not in self._rects_dots:
            return -1
        rx, ry, rw, rh = self._rects_dots[self._selected_id]
        sel_x = self._offset_x + rx * self._scale
        sel_y = self._offset_y + ry * self._scale
        sel_rect = QRectF(sel_x - 2, sel_y - 2, rw * self._scale + 4, rh * self._scale + 4)
        handles = self._get_handle_rects(sel_rect, size=10)
        for i, h in enumerate(handles):
            if h.contains(pos):
                return i
        return -1

    def _find_element_at(self, pos: QPointF) -> Optional[str]:
        dx = (pos.x() - self._offset_x) / self._scale
        dy = (pos.y() - self._offset_y) / self._scale
        for el_id, (rx, ry, rw, rh) in reversed(list(self._rects_dots.items())):
            if rx - 4 <= dx <= rx + rw + 4 and ry - 4 <= dy <= ry + rh + 4:
                return el_id
        return None

    # -----------------------------------------------------------------------
    # Mouse & Keyboard Interaction
    # -----------------------------------------------------------------------

    def mousePressEvent(self, event: QMouseEvent):
        if event.button() == Qt.MouseButton.LeftButton:
            self.setFocus()
            # 1. Check if clicking on an active resize handle
            handle_idx = self._find_handle_at(event.position())
            if handle_idx != -1:
                self._is_resizing = True
                self._active_handle_idx = handle_idx
                self._drag_start_pos = event.position()
                el = next((e for e in self._template.elements if e.id == self._selected_id), None)
                if el:
                    self._element_orig_size = el.font_size
                return

            # 2. Check if clicking on an element
            hit_id = self._find_element_at(event.position())
            if hit_id:
                self._selected_id = hit_id
                self.element_selected.emit(hit_id)
                self._is_dragging = True
                self._drag_start_pos = event.position()
                el = next((e for e in self._template.elements if e.id == hit_id), None)
                if el:
                    if el.x_mm <= 0 and el.y_mm <= 0:
                        rx, ry, _, _ = self._rects_dots.get(hit_id, (0, 0, 0, 0))
                        el.x_mm = round(rx / DOTS_PER_MM, 1)
                        el.y_mm = round(ry / DOTS_PER_MM, 1)
                    self._element_orig_mm = (el.x_mm, el.y_mm)
                self.update()
            else:
                self._selected_id = None
                self.element_selected.emit("")
                self.update()

    def mouseMoveEvent(self, event: QMouseEvent):
        pos = event.position()
        if self._is_resizing and self._selected_id and self._drag_start_pos and self._template:
            delta_y = pos.y() - self._drag_start_pos.y()
            delta_size = int(-delta_y / 6.0)
            new_size = max(5, min(36, self._element_orig_size + delta_size))
            el = next((e for e in self._template.elements if e.id == self._selected_id), None)
            if el and el.font_size != new_size:
                el.font_size = new_size
                self._recompute_rects()
                self.update()
                self.element_resized.emit(self._selected_id, new_size)

        elif self._is_dragging and self._selected_id and self._drag_start_pos and self._template:
            delta_px = pos - self._drag_start_pos
            delta_dots_x = delta_px.x() / self._scale
            delta_dots_y = delta_px.y() / self._scale
            delta_mm_x = delta_dots_x / DOTS_PER_MM
            delta_mm_y = delta_dots_y / DOTS_PER_MM

            new_x_mm = max(0.0, self._element_orig_mm[0] + delta_mm_x)
            new_y_mm = max(0.0, self._element_orig_mm[1] + delta_mm_y)

            if self._snap_to_grid:
                new_x_mm = round(new_x_mm / self._grid_step_mm) * self._grid_step_mm
                new_y_mm = round(new_y_mm / self._grid_step_mm) * self._grid_step_mm
            else:
                new_x_mm = round(new_x_mm, 1)
                new_y_mm = round(new_y_mm, 1)

            el = next((e for e in self._template.elements if e.id == self._selected_id), None)
            if el:
                el.x_mm = new_x_mm
                el.y_mm = new_y_mm
                self._recompute_rects()
                self.update()
                self.element_moved.emit(self._selected_id, new_x_mm, new_y_mm)
        else:
            # Update mouse cursor based on hover
            h_idx = self._find_handle_at(pos)
            if h_idx != -1:
                self.setCursor(self.HANDLE_CURSORS[h_idx])
            elif self._find_element_at(pos):
                self.setCursor(Qt.CursorShape.SizeAllCursor)
            else:
                self.setCursor(Qt.CursorShape.ArrowCursor)

    def mouseReleaseEvent(self, event: QMouseEvent):
        if event.button() == Qt.MouseButton.LeftButton:
            self._is_dragging = False
            self._is_resizing = False
            self._drag_start_pos = None
            self._active_handle_idx = -1
            self._recompute_rects()
            self.update()

    def keyPressEvent(self, event: QKeyEvent):
        """Micro-precision keyboard shortcuts."""
        if not self._selected_id or not self._template:
            super().keyPressEvent(event)
            return

        el = next((e for e in self._template.elements if e.id == self._selected_id), None)
        if not el:
            super().keyPressEvent(event)
            return

        step = 0.5  # 0.5 mm nudge
        if event.key() == Qt.Key.Key_Left:
            el.x_mm = max(0.0, round(el.x_mm - step, 1))
            self._recompute_rects()
            self.update()
            self.element_moved.emit(self._selected_id, el.x_mm, el.y_mm)
        elif event.key() == Qt.Key.Key_Right:
            el.x_mm = round(el.x_mm + step, 1)
            self._recompute_rects()
            self.update()
            self.element_moved.emit(self._selected_id, el.x_mm, el.y_mm)
        elif event.key() == Qt.Key.Key_Up:
            el.y_mm = max(0.0, round(el.y_mm - step, 1))
            self._recompute_rects()
            self.update()
            self.element_moved.emit(self._selected_id, el.x_mm, el.y_mm)
        elif event.key() == Qt.Key.Key_Down:
            el.y_mm = round(el.y_mm + step, 1)
            self._recompute_rects()
            self.update()
            self.element_moved.emit(self._selected_id, el.x_mm, el.y_mm)
        elif event.key() in (Qt.Key.Key_Delete, Qt.Key.Key_Backspace):
            del_id = self._selected_id
            self._selected_id = None
            self.element_deleted.emit(del_id)
            self._recompute_rects()
            self.update()
        else:
            super().keyPressEvent(event)

    def wheelEvent(self, event: QWheelEvent):
        """Ctrl + Wheel scales hovered/selected item font size."""
        if event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            delta = event.angleDelta().y()
            if self._selected_id and self._template:
                el = next((e for e in self._template.elements if e.id == self._selected_id), None)
                if el:
                    delta_size = 1 if delta > 0 else -1
                    new_size = max(5, min(36, el.font_size + delta_size))
                    el.font_size = new_size
                    self._recompute_rects()
                    self.update()
                    self.element_resized.emit(self._selected_id, new_size)
                    event.accept()
                    return
        super().wheelEvent(event)
