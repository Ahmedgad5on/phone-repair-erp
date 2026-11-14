"""
ui/printer_panel.py — Right Dock: Printer, Paper Geometry & Template Manager
Features:
- Printer Selection: Auto-detects Windows printers (prioritizing Xprinter XP-370B) + "Calibrate Gap / Print Test Box" button.
- Template Manager: Select Template dropdown (SampleTemplate, Small_38x25_Compact, Standard_40x30, Wide_60x30, Receipt_80x50), Name input, Save, Delete.
- Paper Size & Orientation: Quick Preset Pills (38x25, 40x25, 40x30, 60x30, 80x50), Length x Width mm spinners, Landscape/Portrait radios, 4-Side Margins (Top, Bottom, Left, Right mm).
- Primary Action Footer: Large Metallic Gold "PRINT LABEL (Ctrl+P)" button with live status feedback.
"""
from typing import List, Optional, Tuple, Dict
from PyQt6.QtCore import pyqtSignal, Qt
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QLineEdit,
    QComboBox, QRadioButton, QDoubleSpinBox, QPushButton, QFrame, QMessageBox
)

from core.printer_win32 import get_installed_printers, detect_thermal_printer
from core.label_template_model import (
    PrintLabelTemplate, TemplateRepository, create_sample_template
)


class PrinterManagerPanel(QFrame):
    """
    Right Dock: Printer, Paper Geometry & Template Manager.
    """
    template_selected = pyqtSignal(object)       # PrintLabelTemplate
    geometry_changed = pyqtSignal()              # Notifies paper/margins changed
    print_requested = pyqtSignal(str)            # printer_name
    calibrate_requested = pyqtSignal(str)        # printer_name
    quick_test_print_requested = pyqtSignal(str) # alias for calibrate_requested
    printer_changed = pyqtSignal(str)            # Notifies printer selection changed

    PRESET_PILLS = [
        ("38x25", 25.0, 38.0, 1.0),
        ("40x25", 25.0, 40.0, 1.0),
        ("40x30", 30.0, 40.0, 1.5),
        ("60x30", 30.0, 60.0, 2.0),
        ("80x50", 50.0, 80.0, 3.0),
    ]

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("PanelCard")
        self.setFixedWidth(310)

        self._repo = TemplateRepository()
        self._current_template: PrintLabelTemplate = (
            self._repo.get_template("Small_38x25_Compact")
            or self._repo.get_template("Standard_40x30")
            or self._repo.get_template("SampleTemplate")
            or create_sample_template()
        )
        self._block_signals = False

        self._init_ui()
        self.refresh_printers()
        self._populate_templates()
        self.apply_template_to_ui(self._current_template)

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 10, 12, 12)
        layout.setSpacing(10)

        # -------------------------------------------------------------------
        # 1. Printer Selection Bar & Calibrate
        # -------------------------------------------------------------------
        p_head = QHBoxLayout()
        lbl_p_title = QLabel("🖨️ اختيار طابعة الملصقات:")
        lbl_p_title.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 12px;")
        p_head.addWidget(lbl_p_title)
        p_head.addStretch()

        self.btn_refresh_printers = QPushButton("🔄 تحديث")
        self.btn_refresh_printers.setToolTip("إعادة فحص وتحديث الطابعات المتصلة بالكمبيوتر")
        self.btn_refresh_printers.setFixedHeight(22)
        self.btn_refresh_printers.setStyleSheet("""
            QPushButton {
                background-color: #1A1A24;
                color: #9CA3AF;
                border: 1px solid #333344;
                border-radius: 3px;
                padding: 1px 6px;
                font-size: 10px;
                font-weight: bold;
            }
            QPushButton:hover { color: #D4AF37; border-color: #D4AF37; }
        """)
        self.btn_refresh_printers.clicked.connect(self.refresh_printers)
        p_head.addWidget(self.btn_refresh_printers)
        layout.addLayout(p_head)

        self.combo_printers = QComboBox()
        self.combo_printers.setToolTip("Select active Windows GDI thermal label printer")
        self.combo_printers.currentTextChanged.connect(self._on_printer_combo_changed)
        layout.addWidget(self.combo_printers)

        self.btn_calibrate = QPushButton("🎯 معايرة الحساس وطباعة تجريبية (Calibrate)")
        self.btn_calibrate.setToolTip("معايرة حساس الفواصل (Gap Sensor) لمنع الطباعة على أكثر من ستيكر وطباعة إطار تجريبي 203 DPI")
        self.btn_calibrate.setStyleSheet("""
            QPushButton {
                background-color: #1A1A24;
                color: #D4AF37;
                border: 1px solid #333344;
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 11px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #222230;
                border-color: #D4AF37;
            }
        """)
        self.btn_calibrate.clicked.connect(self._on_calibrate_clicked)
        layout.addWidget(self.btn_calibrate)

        # Separator
        sep1 = QFrame()
        sep1.setFrameShape(QFrame.Shape.HLine)
        sep1.setStyleSheet("color: #282834;")
        layout.addWidget(sep1)

        # -------------------------------------------------------------------
        # 2. Template Manager
        # -------------------------------------------------------------------
        lbl_t_title = QLabel("Template Manager:")
        lbl_t_title.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 12px;")
        layout.addWidget(lbl_t_title)

        self.combo_templates = QComboBox()
        self.combo_templates.currentIndexChanged.connect(self._on_template_combo_changed)
        layout.addWidget(self.combo_templates)

        grid_tpl_actions = QHBoxLayout()
        self.edit_tpl_name = QLineEdit("SampleTemplate")
        self.edit_tpl_name.setPlaceholderText("Template Name")
        grid_tpl_actions.addWidget(self.edit_tpl_name)

        self.btn_save_tpl = QPushButton("حفظ")
        self.btn_save_tpl.setToolTip("حفظ القالب الحالي")
        self.btn_save_tpl.setFixedWidth(54)
        self.btn_save_tpl.setStyleSheet("""
            QPushButton {
                background-color: #10B981; color: #0D0D11; font-weight: bold;
                font-size: 11px; border-radius: 4px; padding: 2px 4px;
            }
            QPushButton:hover { background-color: #34D399; }
        """)
        self.btn_save_tpl.clicked.connect(self._on_save_template_clicked)
        grid_tpl_actions.addWidget(self.btn_save_tpl)

        self.btn_del_tpl = QPushButton("حذف")
        self.btn_del_tpl.setToolTip("حذف هذا القالب")
        self.btn_del_tpl.setFixedWidth(54)
        self.btn_del_tpl.setStyleSheet("""
            QPushButton {
                background-color: #1E1E28; color: #EF4444; font-weight: bold;
                font-size: 11px; border: 1px solid #EF4444; border-radius: 4px; padding: 2px 4px;
            }
            QPushButton:hover { background-color: #EF4444; color: #FFFFFF; }
        """)
        self.btn_del_tpl.clicked.connect(self._on_delete_template_clicked)
        grid_tpl_actions.addWidget(self.btn_del_tpl)
        layout.addLayout(grid_tpl_actions)

        # Separator
        sep2 = QFrame()
        sep2.setFrameShape(QFrame.Shape.HLine)
        sep2.setStyleSheet("color: #282834;")
        layout.addWidget(sep2)

        # -------------------------------------------------------------------
        # 3. Paper Size & Geometry
        # -------------------------------------------------------------------
        lbl_geo = QLabel("Paper Size & Geometry:")
        lbl_geo.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 12px;")
        layout.addWidget(lbl_geo)

        # Quick Preset Pills & Combo Selector
        pills_layout = QHBoxLayout()
        pills_layout.setSpacing(4)
        for label, l_mm, w_mm, m_mm in self.PRESET_PILLS:
            btn_pill = QPushButton(label)
            btn_pill.setFixedHeight(24)
            btn_pill.setStyleSheet("""
                QPushButton {
                    background-color: #1A1A24;
                    color: #9CA3AF;
                    border: 1px solid #282834;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: bold;
                    padding: 2px 6px;
                }
                QPushButton:hover {
                    color: #D4AF37;
                    border-color: #D4AF37;
                    background-color: #222230;
                }
            """)
            btn_pill.clicked.connect(lambda ch, l=l_mm, w=w_mm, m=m_mm: self._apply_preset_pill(l, w, m))
            pills_layout.addWidget(btn_pill)
        layout.addLayout(pills_layout)

        # Dropdown preset selector for quick selection & test compatibility
        self.combo_preset = QComboBox()
        self.combo_preset.setToolTip("Select standard thermal label preset")
        for label, l_mm, w_mm, m_mm in self.PRESET_PILLS:
            self.combo_preset.addItem(f"Preset: {label} mm", (l_mm, w_mm, m_mm))
        self.combo_preset.currentIndexChanged.connect(self._on_combo_preset_changed)
        layout.addWidget(self.combo_preset)

        # Length x Width Spinners
        grid_size = QGridLayout()
        grid_size.setHorizontalSpacing(8)
        grid_size.setVerticalSpacing(4)

        grid_size.addWidget(QLabel("Length:"), 0, 0)
        self.spin_length = QDoubleSpinBox()
        self.spin_length.setRange(10.0, 200.0)
        self.spin_length.setSuffix(" mm")
        self.spin_length.setValue(30.0)
        self.spin_length.valueChanged.connect(self._on_geometry_changed)
        grid_size.addWidget(self.spin_length, 0, 1)

        grid_size.addWidget(QLabel("Width:"), 0, 2)
        self.spin_width = QDoubleSpinBox()
        self.spin_width.setRange(10.0, 200.0)
        self.spin_width.setSuffix(" mm")
        self.spin_width.setValue(40.0)
        self.spin_width.valueChanged.connect(self._on_geometry_changed)
        grid_size.addWidget(self.spin_width, 0, 3)
        layout.addLayout(grid_size)

        # Orientation
        orient_box = QHBoxLayout()
        self.radio_landscape = QRadioButton("Landscape (Transverse)")
        self.radio_portrait = QRadioButton("Portrait (Vertical)")
        self.radio_landscape.setChecked(True)
        self.radio_landscape.toggled.connect(self._on_geometry_changed)
        self.radio_portrait.toggled.connect(self._on_geometry_changed)
        orient_box.addWidget(self.radio_landscape)
        orient_box.addWidget(self.radio_portrait)
        layout.addLayout(orient_box)

        # 4 Margins (Top, Bottom, Left, Right)
        grid_margins = QGridLayout()
        grid_margins.setHorizontalSpacing(8)
        grid_margins.setVerticalSpacing(4)

        grid_margins.addWidget(QLabel("Top:"), 0, 0)
        self.spin_m_top = QDoubleSpinBox()
        self.spin_m_top.setRange(0.0, 20.0)
        self.spin_m_top.setSuffix(" mm")
        self.spin_m_top.setValue(1.5)
        self.spin_m_top.valueChanged.connect(self._on_geometry_changed)
        grid_margins.addWidget(self.spin_m_top, 0, 1)

        grid_margins.addWidget(QLabel("Bottom:"), 0, 2)
        self.spin_m_bottom = QDoubleSpinBox()
        self.spin_m_bottom.setRange(0.0, 20.0)
        self.spin_m_bottom.setSuffix(" mm")
        self.spin_m_bottom.setValue(1.5)
        self.spin_m_bottom.valueChanged.connect(self._on_geometry_changed)
        grid_margins.addWidget(self.spin_m_bottom, 0, 3)

        grid_margins.addWidget(QLabel("Left:"), 1, 0)
        self.spin_m_left = QDoubleSpinBox()
        self.spin_m_left.setRange(0.0, 20.0)
        self.spin_m_left.setSuffix(" mm")
        self.spin_m_left.setValue(1.5)
        self.spin_m_left.valueChanged.connect(self._on_geometry_changed)
        grid_margins.addWidget(self.spin_m_left, 1, 1)

        grid_margins.addWidget(QLabel("Right:"), 1, 2)
        self.spin_m_right = QDoubleSpinBox()
        self.spin_m_right.setRange(0.0, 20.0)
        self.spin_m_right.setSuffix(" mm")
        self.spin_m_right.setValue(1.5)
        self.spin_m_right.valueChanged.connect(self._on_geometry_changed)
        grid_margins.addWidget(self.spin_m_right, 1, 3)
        layout.addLayout(grid_margins)

        layout.addStretch()

        # -------------------------------------------------------------------
        # 4. Primary Action Footer
        # -------------------------------------------------------------------
        sep3 = QFrame()
        sep3.setFrameShape(QFrame.Shape.HLine)
        sep3.setStyleSheet("color: #282834;")
        layout.addWidget(sep3)

        self.btn_print = QPushButton("🖨️ PRINT LABEL (Ctrl+P)")
        self.btn_print.setFixedHeight(48)
        self.btn_print.setStyleSheet("""
            QPushButton {
                background-color: #D4AF37;
                color: #0D0D11;
                font-size: 13px;
                font-weight: bold;
                border: 1px solid #FFE57F;
                border-radius: 6px;
            }
            QPushButton:hover {
                background-color: #E5C158;
                border-color: #FFF2A8;
            }
            QPushButton:pressed {
                background-color: #B8972E;
            }
        """)
        self.btn_print.clicked.connect(self._on_print_clicked)
        layout.addWidget(self.btn_print)

        self.lbl_status = QLabel("Ready to print 203 DPI")
        self.lbl_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_status.setStyleSheet("color: #9CA3AF; font-size: 11px;")
        layout.addWidget(self.lbl_status)

    # -------------------------------------------------------------------
    # Logic & Sync
    # -------------------------------------------------------------------

    def refresh_printers(self):
        prev = self.combo_printers.currentText().strip()
        self._block_signals = True
        self.combo_printers.clear()
        printers = get_installed_printers()
        detected_thermal = detect_thermal_printer()

        target_idx = 0
        for idx, name in enumerate(printers):
            self.combo_printers.addItem(name)
            if prev and name == prev:
                target_idx = idx
            elif not prev and detected_thermal and name == detected_thermal:
                target_idx = idx

        if printers:
            self.combo_printers.setCurrentIndex(target_idx)
        else:
            self.combo_printers.addItem("Virtual Print (Exports PNG/PDF)")
        self._block_signals = False
        cur = self.get_selected_printer()
        self.printer_changed.emit(cur)

    def get_selected_printer(self) -> str:
        return self.combo_printers.currentText().strip()

    def set_selected_printer(self, name: str):
        self._block_signals = True
        idx = self.combo_printers.findText(name)
        if idx >= 0:
            self.combo_printers.setCurrentIndex(idx)
        self._block_signals = False

    def _on_printer_combo_changed(self, text: str):
        if not self._block_signals and text:
            self.printer_changed.emit(text.strip())

    def set_status_message(self, msg: str, success: bool = True):
        color = "#10B981" if success else "#EF4444"
        self.lbl_status.setText(msg)
        self.lbl_status.setStyleSheet(f"color: {color}; font-size: 11px; font-weight: bold;")

    def _populate_templates(self):
        self._block_signals = True
        self.combo_templates.clear()
        for tpl in self._repo.list_templates():
            self.combo_templates.addItem(tpl.name)
        idx = self.combo_templates.findText(self._current_template.name)
        if idx >= 0:
            self.combo_templates.setCurrentIndex(idx)
        self._block_signals = False

    def _on_template_combo_changed(self, idx: int):
        if self._block_signals or idx < 0:
            return
        name = self.combo_templates.currentText()
        tpl = self._repo.get_template(name)
        if tpl:
            self._current_template = tpl
            self.apply_template_to_ui(tpl)
            self.template_selected.emit(tpl)

    def apply_template_to_ui(self, tpl: PrintLabelTemplate):
        self._block_signals = True
        self.edit_tpl_name.setText(tpl.name)
        self.spin_length.setValue(tpl.paper_length_mm)
        self.spin_width.setValue(tpl.paper_width_mm)
        self.spin_m_top.setValue(tpl.margin_top_mm)
        self.spin_m_bottom.setValue(tpl.margin_bottom_mm)
        self.spin_m_left.setValue(tpl.margin_left_mm)
        self.spin_m_right.setValue(tpl.margin_right_mm)
        if tpl.orientation == "landscape":
            self.radio_landscape.setChecked(True)
        else:
            self.radio_portrait.setChecked(True)
        self._block_signals = False

    def sync_template_geometry(self, tpl: PrintLabelTemplate):
        tpl.paper_length_mm = self.spin_length.value()
        tpl.paper_width_mm = self.spin_width.value()
        tpl.margin_top_mm = self.spin_m_top.value()
        tpl.margin_bottom_mm = self.spin_m_bottom.value()
        tpl.margin_left_mm = self.spin_m_left.value()
        tpl.margin_right_mm = self.spin_m_right.value()
        tpl.orientation = "landscape" if self.radio_landscape.isChecked() else "portrait"

    def _on_combo_preset_changed(self, idx: int):
        data = self.combo_preset.itemData(idx)
        if data:
            l_mm, w_mm, m_mm = data
            self._apply_preset_pill(l_mm, w_mm, m_mm)

    def _apply_preset_pill(self, length_mm: float, width_mm: float, margin_mm: float):
        self._block_signals = True
        self.spin_length.setValue(length_mm)
        self.spin_width.setValue(width_mm)
        self.spin_m_top.setValue(margin_mm)
        self.spin_m_bottom.setValue(margin_mm)
        self.spin_m_left.setValue(margin_mm)
        self.spin_m_right.setValue(margin_mm)
        self._block_signals = False
        self._on_geometry_changed()

    def _on_geometry_changed(self):
        if self._block_signals:
            return
        self.sync_template_geometry(self._current_template)
        self.geometry_changed.emit()

    def _on_save_template_clicked(self):
        name = self.edit_tpl_name.text().strip() or "CustomTemplate"
        self._current_template.name = name
        self.sync_template_geometry(self._current_template)
        self._repo.save_template(self._current_template)
        self.set_status_message(f"Template '{name}' saved!", success=True)
        self._populate_templates()

    def _on_delete_template_clicked(self):
        name = self.combo_templates.currentText()
        if name in ("SampleTemplate", "Small_38x25_Compact", "Standard_40x30"):
            QMessageBox.warning(self, "Protected Template", f"Built-in template '{name}' cannot be deleted.")
            return
        reply = QMessageBox.question(
            self, "Confirm Delete", f"Delete template '{name}'?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply == QMessageBox.StandardButton.Yes:
            self._repo.delete_template(name)
            self._populate_templates()
            self.set_status_message(f"Deleted '{name}'", success=True)

    def _on_calibrate_clicked(self):
        printer = self.get_selected_printer()
        self.calibrate_requested.emit(printer)
        self.quick_test_print_requested.emit(printer)

    def _on_test_clicked(self):
        """Alias for test / calibration click."""
        self._on_calibrate_clicked()

    def _on_print_clicked(self):
        printer = self.get_selected_printer()
        self.print_requested.emit(printer)

    def get_current_template(self) -> PrintLabelTemplate:
        self.sync_template_geometry(self._current_template)
        return self._current_template
