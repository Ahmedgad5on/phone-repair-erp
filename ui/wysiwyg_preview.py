"""
ui/wysiwyg_preview.py — Center Panel: Live WYSIWYG 203 DPI Preview
Features:
- Native 1-bit monochrome PIL rendering dynamically converted to QPixmap.
- Sub-20ms rendering budget with debounced live update timer.
- Zoom controls (Fit, 100% 203 DPI, 150%, 200%).
- Dimension badge showing physical mm and dot coordinates (e.g. 38x25mm -> 304x200px).
- Dynamic toggles for Barcode Type (Code128, QR, Both), Compact Smart Merge, and Titles.
"""
from typing import Optional, Union
from PIL import Image
from PyQt6.QtCore import Qt, QTimer, pyqtSignal, QByteArray, QBuffer, QIODevice
from PyQt6.QtGui import QImage, QPixmap
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QComboBox,
    QCheckBox, QPushButton, QFrame, QScrollArea
)

from core.models import DeviceSpecs, RepairTicket
from core.label_renderer import (
    render_device_specs_label,
    render_repair_ticket_label,
    render_calibration_label,
    mm_to_dots
)


class WysiwygPreviewPanel(QFrame):
    """
    Center panel live 203 DPI thermal label canvas preview.
    """
    settings_changed = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("CardFrame")
        self.setProperty("class", "CardFrame")

        # Current state
        self._mode: str = "specs"  # "specs", "ticket", "calibration"
        self._specs: Optional[DeviceSpecs] = None
        self._ticket: Optional[RepairTicket] = None
        self._stock_number: str = "STK-000001"
        self._width_mm: int = 38
        self._height_mm: int = 25
        self._margin_mm: float = 1.0
        self._zoom_factor: float = 1.5
        self._current_pil_image: Optional[Image.Image] = None

        # Debounce timer
        self._debounce_timer = QTimer(self)
        self._debounce_timer.setSingleShot(True)
        self._debounce_timer.setInterval(40)
        self._debounce_timer.timeout.connect(self._render_now)

        self._init_ui()

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(12, 10, 12, 10)
        main_layout.setSpacing(10)

        # 1. Header Toolbar
        top_bar = QHBoxLayout()
        lbl_head = QLabel("Live WYSIWYG 203 DPI Preview")
        lbl_head.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 13px;")
        top_bar.addWidget(lbl_head)

        top_bar.addStretch()

        # Dimension Badge
        self.lbl_dims = QLabel("38x25 mm (304x200 px)")
        self.lbl_dims.setStyleSheet(
            "background-color: #262626; color: #FFFFFF; border: 1px solid #3A3A3A; "
            "border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: bold;"
        )
        top_bar.addWidget(self.lbl_dims)

        # Zoom combo
        self.combo_zoom = QComboBox()
        self.combo_zoom.addItem("100% (203 DPI)", 1.0)
        self.combo_zoom.addItem("150% Zoom", 1.5)
        self.combo_zoom.addItem("200% Zoom", 2.0)
        self.combo_zoom.addItem("250% Zoom", 2.5)
        self.combo_zoom.setCurrentIndex(1)
        self.combo_zoom.currentIndexChanged.connect(self._on_zoom_changed)
        top_bar.addWidget(self.combo_zoom)

        main_layout.addLayout(top_bar)

        # 2. Viewport / Scroll Area with Label Card
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setStyleSheet("background-color: #151515; border: 1px solid #282828; border-radius: 6px;")

        self.canvas_container = QWidget()
        self.canvas_container.setStyleSheet("background-color: transparent;")
        container_layout = QVBoxLayout(self.canvas_container)
        container_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.lbl_canvas = QLabel()
        self.lbl_canvas.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_canvas.setStyleSheet("border: 2px solid #555555; background-color: white; border-radius: 2px;")
        container_layout.addWidget(self.lbl_canvas)

        self.scroll_area.setWidget(self.canvas_container)
        main_layout.addWidget(self.scroll_area, 1)

        # 3. Bottom Toggles Toolbar
        bot_bar = QHBoxLayout()
        bot_bar.setSpacing(14)

        # Barcode selection
        lbl_bc = QLabel("Barcode:")
        lbl_bc.setProperty("class", "MutedLabel")
        bot_bar.addWidget(lbl_bc)

        self.combo_barcode = QComboBox()
        self.combo_barcode.addItem("Code128 Barcode", "code128")
        self.combo_barcode.addItem("2D QR Code", "qr")
        self.combo_barcode.addItem("Dual (Barcode + QR)", "both")
        self.combo_barcode.currentIndexChanged.connect(self.schedule_update)
        bot_bar.addWidget(self.combo_barcode)

        # Compact Smart Merge
        self.chk_compact = QCheckBox("Compact Smart Merge")
        self.chk_compact.setChecked(True)
        self.chk_compact.setToolTip("Merges Model + Storage + Color into single lines for small stickers")
        self.chk_compact.toggled.connect(self.schedule_update)
        bot_bar.addWidget(self.chk_compact)

        # Show Field Titles
        self.chk_titles = QCheckBox("Field Titles")
        self.chk_titles.setChecked(True)
        self.chk_titles.toggled.connect(self.schedule_update)
        bot_bar.addWidget(self.chk_titles)

        bot_bar.addStretch()
        main_layout.addLayout(bot_bar)

    def set_mode(self, mode: str):
        """Sets rendering mode: 'specs' or 'calibration'."""
        self._mode = mode
        self.chk_compact.setEnabled(True)
        self.chk_titles.setEnabled(True)
        self.schedule_update()

    def set_paper_size(self, width_mm: int, height_mm: int, margin_mm: float = 1.0):
        """Updates label dimensions and margin."""
        self._width_mm = width_mm
        self._height_mm = height_mm
        self._margin_mm = margin_mm
        w_dots = mm_to_dots(width_mm)
        h_dots = mm_to_dots(height_mm)
        self.lbl_dims.setText(f"{width_mm}x{height_mm} mm ({w_dots}x{h_dots} px)")
        self.schedule_update()

    def update_specs(self, specs: DeviceSpecs, stock_number: str = ""):
        """Updates device specs and triggers render."""
        self._specs = specs
        if stock_number:
            self._stock_number = stock_number
        self.schedule_update()

    def update_ticket(self, ticket=None):
        """No-op for backwards compatibility."""
        pass

    def schedule_update(self):
        """Schedules a debounced re-render."""
        self._debounce_timer.start()

    def _render_now(self):
        """Generates the 203 DPI PIL image and paints onto QLabel."""
        bc_type = self.combo_barcode.currentData() or "code128"
        compact = self.chk_compact.isChecked()
        titles = self.chk_titles.isChecked()

        try:
            if self._mode == "calibration":
                pil_img = render_calibration_label(self._width_mm, self._height_mm)

            else:
                specs = self._specs or DeviceSpecs(
                    connection_type="none",
                    device_id="SAMPLE-01",
                    brand="Apple",
                    marketing_name="iPhone 15 Pro",
                    model_code="A3102",
                    storage="256GB",
                    ram="8GB",
                    color="Natural Titanium",
                    os_version="iOS 18.0",
                    serial_number="F2LYP012N6P1",
                    imei1="358901234567890",
                    battery_health=98
                )
                from core.config import ConfigManager
                cfg = ConfigManager.get_instance().config
                pil_img = render_device_specs_label(
                    specs=specs,
                    width_mm=self._width_mm,
                    height_mm=self._height_mm,
                    compact_merge=compact,
                    barcode_type=bc_type,
                    show_titles=titles,
                    margin_mm=self._margin_mm,
                    stock_number=self._stock_number,
                    template=cfg.label_template,
                    font_family=cfg.selected_font,
                    shop_name=cfg.shop_name,
                    shop_phone=cfg.shop_phone,
                    logo_path=cfg.logo_path,
                    show_logo=cfg.show_logo,
                    font_scale=cfg.font_size_scale,
                    label_fields=cfg.label_fields,
                    custom_price=cfg.custom_label_price,
                    custom_warranty=cfg.custom_label_warranty,
                    custom_note=cfg.custom_label_note,
                    qr_mode=cfg.qr_mode,
                    qr_custom_url=cfg.qr_custom_url,
                )

            self._current_pil_image = pil_img
            self._display_image(pil_img)

        except Exception as exc:
            pass

    def _display_image(self, pil_img: Image.Image):
        """Converts PIL mode '1' image to QPixmap with crisp nearest-neighbor zoom scaling."""
        rgba_img = pil_img.convert("RGBA")
        data = rgba_img.tobytes("raw", "RGBA")
        qimg = QImage(data, rgba_img.width, rgba_img.height, QImage.Format.Format_RGBA8888)
        pixmap = QPixmap.fromImage(qimg)

        target_w = int(rgba_img.width * self._zoom_factor)
        target_h = int(rgba_img.height * self._zoom_factor)

        scaled = pixmap.scaled(
            target_w, target_h,
            Qt.AspectRatioMode.KeepAspectRatio,
            Qt.TransformationMode.FastTransformation  # Crisp pixel-perfect 1-bit thermal look
        )
        self.lbl_canvas.setPixmap(scaled)

    def _on_zoom_changed(self):
        self._zoom_factor = float(self.combo_zoom.currentData())
        if self._current_pil_image:
            self._display_image(self._current_pil_image)

    def get_current_image(self) -> Optional[Image.Image]:
        return self._current_pil_image
