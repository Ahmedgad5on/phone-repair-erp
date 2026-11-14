"""
ui/print_labels_dialog.py — 3uTools-Style Print Labels Master Studio Window & Widget
Recreates 100% of the features shown in the 3uTools Print Labels interface:
- Printer & Template selection, saving, and deletion
- Paper Size (Length x Width mm), Margins (Top, Bottom, Left, Right mm), Orientation (Landscape/Portrait)
- 21 Addable Option tag chips + Add QR Code button
- Typography toolbar (Font family, Font size, Bold, Alignments)
- Selected items table (Title, Content, Function Area with Show/Hide Title, Barcode toggle, Reorder, Delete)
- Interactive Preview & Edit Area with drag-and-drop element repositioning and blue bounding box handles
- Bottom bar with device connection status, Auto-Print toggle, Feedback, Close, and Print buttons
"""
import logging
import os
import sys
import uuid
from typing import Optional, List, Dict

from PyQt6.QtCore import Qt, pyqtSignal, pyqtSlot
from PyQt6.QtGui import QIcon, QFont, QColor
from PyQt6.QtWidgets import (
    QDialog, QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QComboBox, QCheckBox, QRadioButton, QButtonGroup,
    QPushButton, QTableWidget, QTableWidgetItem, QHeaderView,
    QDoubleSpinBox, QScrollArea, QFrame, QSplitter, QMessageBox
)

from core.label_template_model import (
    PrintLabelTemplate, LabelElement, TemplateRepository,
    ADDABLE_FIELDS, resolve_field_value, create_sample_template
)
from core.label_template_renderer import render_template_to_pil
from core.printer_win32 import get_installed_printers, print_label_image, save_virtual_print
from core.models import DeviceSpecs
from ui.print_labels_canvas import PrintLabelsCanvas

logger = logging.getLogger(__name__)

# Clean light stylesheet reproducing 3uTools modern aesthetic
THREU_STYLESHEET = """
QWidget#StudioRoot, QDialog#PrintLabelsDialog {
    background-color: #F5F7FA;
    color: #333333;
    font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
    font-size: 12px;
}
QFrame#PanelCard {
    background-color: #FFFFFF;
    border: 1px solid #E4E7ED;
    border-radius: 6px;
}
QLabel {
    color: #4A5568;
    font-size: 12px;
}
QLabel#SectionTitle {
    color: #2D3748;
    font-size: 13px;
    font-weight: bold;
}
QLineEdit, QComboBox, QDoubleSpinBox {
    background-color: #FFFFFF;
    color: #2D3748;
    border: 1px solid #DCDFE6;
    border-radius: 4px;
    padding: 3px 6px;
    min-height: 22px;
}
QLineEdit:focus, QComboBox:focus, QDoubleSpinBox:focus {
    border: 1px solid #409EFF;
}
QPushButton {
    background-color: #FFFFFF;
    color: #4A5568;
    border: 1px solid #DCDFE6;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 12px;
}
QPushButton:hover {
    background-color: #F2F6FC;
    color: #409EFF;
    border-color: #C6E2FF;
}
QPushButton#ChipButton {
    background-color: #FAFAFA;
    color: #606266;
    border: 1px solid #DCDFE6;
    border-radius: 12px;
    padding: 3px 10px;
    font-size: 11px;
}
QPushButton#ChipButton:hover {
    background-color: #ECF5FF;
    color: #409EFF;
    border-color: #B3D8FF;
}
QPushButton#PrimaryButton {
    background-color: #22C55E;
    color: #FFFFFF;
    border: none;
    border-radius: 4px;
    padding: 6px 24px;
    font-weight: bold;
    font-size: 13px;
}
QPushButton#PrimaryButton:hover {
    background-color: #16A34A;
}
QPushButton#ActionLink {
    background-color: transparent;
    color: #409EFF;
    border: none;
    padding: 2px 6px;
    text-decoration: underline;
}
QPushButton#ActionLink:hover {
    color: #66B1FF;
}
QTableWidget {
    background-color: #FFFFFF;
    border: 1px solid #E4E7ED;
    border-radius: 4px;
    gridline-color: #F0F2F5;
    color: #333333;
}
QHeaderView::section {
    background-color: #F8FAFC;
    color: #64748B;
    border: none;
    border-bottom: 1px solid #E2E8F0;
    padding: 4px;
    font-weight: bold;
}
QRadioButton, QCheckBox {
    color: #4A5568;
}
"""


class PrintLabelsStudioWidget(QWidget):
    """
    3uTools Print Labels Studio widget. Can be embedded directly into tabs or wrapped in QDialog.
    """
    label_printed = pyqtSignal(object)
    close_requested = pyqtSignal()

    def __init__(self, specs: Optional[DeviceSpecs] = None, stock_number: str = "001", is_dialog: bool = False, parent=None):
        super().__init__(parent)
        self.setObjectName("StudioRoot")
        self.setStyleSheet(THREU_STYLESHEET)

        self._specs = specs
        self._stock_number = stock_number
        self._is_dialog = is_dialog
        self._repo = TemplateRepository()

        # Load initial template (SampleTemplate)
        tpl = self._repo.get_template("SampleTemplate")
        if not tpl:
            tpl = create_sample_template()
            self._repo.save_template(tpl)
        self._current_template = tpl

        self._block_signals = False

        self._init_ui()
        self._populate_printers()
        self._populate_templates()
        self._apply_template_to_ui(self._current_template)
        self.update_device_status(self._specs)

    def _init_ui(self):
        root_layout = QVBoxLayout(self)
        root_layout.setContentsMargins(14, 12, 14, 10)
        root_layout.setSpacing(10)

        # Main Splitter (Left Controls, Right Preview & Edit Area)
        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.setHandleWidth(6)

        # =====================================================================
        # LEFT PANEL: Controls & Settings
        # =====================================================================
        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)
        left_layout.setContentsMargins(0, 0, 8, 0)
        left_layout.setSpacing(10)

        # 1. Select Printer & Template Bar
        printer_bar = QHBoxLayout()
        lbl_p = QLabel("Printer:")
        lbl_p.setObjectName("SectionTitle")
        printer_bar.addWidget(lbl_p)

        self.combo_printer = QComboBox()
        self.combo_printer.setMinimumWidth(180)
        printer_bar.addWidget(self.combo_printer)

        printer_bar.addSpacing(10)
        lbl_t = QLabel("Select Template:")
        lbl_t.setObjectName("SectionTitle")
        printer_bar.addWidget(lbl_t)

        self.combo_template = QComboBox()
        self.combo_template.setMinimumWidth(140)
        self.combo_template.currentIndexChanged.connect(self._on_template_selected)
        printer_bar.addWidget(self.combo_template)

        self.btn_save_tpl = QPushButton("Save Template")
        self.btn_save_tpl.setObjectName("ActionLink")
        self.btn_save_tpl.clicked.connect(self._on_save_template_clicked)
        printer_bar.addWidget(self.btn_save_tpl)

        self.btn_del_tpl = QPushButton("Delete Template")
        self.btn_del_tpl.setObjectName("ActionLink")
        self.btn_del_tpl.clicked.connect(self._on_delete_template_clicked)
        printer_bar.addWidget(self.btn_del_tpl)

        printer_bar.addStretch()
        left_layout.addLayout(printer_bar)

        # Scrollable container for template content & addable options
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll_content = QWidget()
        scroll_layout = QVBoxLayout(scroll_content)
        scroll_layout.setContentsMargins(0, 0, 4, 0)
        scroll_layout.setSpacing(10)

        # 2. Template Content Card
        card_tpl = QFrame()
        card_tpl.setObjectName("PanelCard")
        grid_tpl = QGridLayout(card_tpl)
        grid_tpl.setContentsMargins(12, 10, 12, 10)
        grid_tpl.setHorizontalSpacing(12)
        grid_tpl.setVerticalSpacing(8)

        lbl_sec1 = QLabel("Template Content")
        lbl_sec1.setObjectName("SectionTitle")
        grid_tpl.addWidget(lbl_sec1, 0, 0, 1, 4)

        grid_tpl.addWidget(QLabel("Template Name:"), 1, 0)
        self.edit_tpl_name = QLineEdit("SampleTemplate")
        self.edit_tpl_name.textChanged.connect(self._on_param_changed)
        grid_tpl.addWidget(self.edit_tpl_name, 1, 1, 1, 3)

        grid_tpl.addWidget(QLabel("Paper Size:"), 2, 0)
        size_layout = QHBoxLayout()
        size_layout.addWidget(QLabel("Length"))
        self.spin_length = QDoubleSpinBox()
        self.spin_length.setRange(10.0, 200.0)
        self.spin_length.setValue(30.0)
        self.spin_length.setSuffix(" mm")
        self.spin_length.valueChanged.connect(self._on_param_changed)
        size_layout.addWidget(self.spin_length)

        size_layout.addWidget(QLabel("x Width"))
        self.spin_width = QDoubleSpinBox()
        self.spin_width.setRange(10.0, 200.0)
        self.spin_width.setValue(40.0)
        self.spin_width.setSuffix(" mm")
        self.spin_width.valueChanged.connect(self._on_param_changed)
        size_layout.addWidget(self.spin_width)
        size_layout.addStretch()
        grid_tpl.addLayout(size_layout, 2, 1, 1, 3)

        grid_tpl.addWidget(QLabel("Margin:"), 3, 0)
        margin_layout = QHBoxLayout()
        margin_layout.addWidget(QLabel("Top"))
        self.spin_m_top = QDoubleSpinBox()
        self.spin_m_top.setRange(0.0, 20.0)
        self.spin_m_top.setValue(2.0)
        self.spin_m_top.setSuffix(" mm")
        self.spin_m_top.valueChanged.connect(self._on_param_changed)
        margin_layout.addWidget(self.spin_m_top)

        margin_layout.addWidget(QLabel("Bottom"))
        self.spin_m_bottom = QDoubleSpinBox()
        self.spin_m_bottom.setRange(0.0, 20.0)
        self.spin_m_bottom.setValue(2.0)
        self.spin_m_bottom.setSuffix(" mm")
        self.spin_m_bottom.valueChanged.connect(self._on_param_changed)
        margin_layout.addWidget(self.spin_m_bottom)

        margin_layout.addWidget(QLabel("Left"))
        self.spin_m_left = QDoubleSpinBox()
        self.spin_m_left.setRange(0.0, 20.0)
        self.spin_m_left.setValue(2.0)
        self.spin_m_left.setSuffix(" mm")
        self.spin_m_left.valueChanged.connect(self._on_param_changed)
        margin_layout.addWidget(self.spin_m_left)

        margin_layout.addWidget(QLabel("Right"))
        self.spin_m_right = QDoubleSpinBox()
        self.spin_m_right.setRange(0.0, 20.0)
        self.spin_m_right.setValue(2.0)
        self.spin_m_right.setSuffix(" mm")
        self.spin_m_right.valueChanged.connect(self._on_param_changed)
        margin_layout.addWidget(self.spin_m_right)
        margin_layout.addStretch()
        grid_tpl.addLayout(margin_layout, 3, 1, 1, 3)

        grid_tpl.addWidget(QLabel("Paper Orientation:"), 4, 0)
        orient_layout = QHBoxLayout()
        self.radio_landscape = QRadioButton("Landscape")
        self.radio_portrait = QRadioButton("Portrait")
        self.radio_landscape.setChecked(True)
        self.radio_landscape.toggled.connect(self._on_param_changed)
        self.radio_portrait.toggled.connect(self._on_param_changed)
        orient_layout.addWidget(self.radio_landscape)
        orient_layout.addWidget(self.radio_portrait)
        orient_layout.addStretch()
        grid_tpl.addLayout(orient_layout, 4, 1, 1, 3)

        scroll_layout.addWidget(card_tpl)

        # 3. Addable Options Card (Chips + QR Code)
        card_addable = QFrame()
        card_addable.setObjectName("PanelCard")
        box_addable = QVBoxLayout(card_addable)
        box_addable.setContentsMargins(12, 10, 12, 10)
        box_addable.setSpacing(8)

        head_addable = QHBoxLayout()
        lbl_sec2 = QLabel("Addable Options")
        lbl_sec2.setObjectName("SectionTitle")
        head_addable.addWidget(lbl_sec2)
        head_addable.addStretch()

        self.btn_add_qr = QPushButton("+ Add QR Code")
        self.btn_add_qr.clicked.connect(self._on_add_qr_clicked)
        head_addable.addWidget(self.btn_add_qr)
        box_addable.addLayout(head_addable)

        # Grid of the 21 Addable Field Chips
        chips_grid = QGridLayout()
        chips_grid.setSpacing(6)
        row, col = 0, 0
        max_cols = 5
        for field_key, title in ADDABLE_FIELDS:
            btn_chip = QPushButton(title)
            btn_chip.setObjectName("ChipButton")
            btn_chip.clicked.connect(lambda checked, fk=field_key, t=title: self._on_add_field_clicked(fk, t))
            chips_grid.addWidget(btn_chip, row, col)
            col += 1
            if col >= max_cols:
                col = 0
                row += 1
        box_addable.addLayout(chips_grid)
        scroll_layout.addWidget(card_addable)

        # 4. Typography & Alignment Toolbar
        card_typo = QFrame()
        card_typo.setObjectName("PanelCard")
        typo_bar = QHBoxLayout(card_typo)
        typo_bar.setContentsMargins(10, 6, 10, 6)
        typo_bar.setSpacing(8)

        self.combo_font_family = QComboBox()
        self.combo_font_family.addItems(["Microsoft YaHei", "Segoe UI", "Tahoma", "Arial", "Calibri", "Consolas"])
        self.combo_font_family.currentIndexChanged.connect(self._on_typo_changed)
        typo_bar.addWidget(self.combo_font_family)

        self.combo_font_size = QComboBox()
        for s in [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20]:
            self.combo_font_size.addItem(str(s), s)
        self.combo_font_size.setCurrentText("8")
        self.combo_font_size.currentIndexChanged.connect(self._on_typo_changed)
        typo_bar.addWidget(self.combo_font_size)

        self.btn_bold = QPushButton("B")
        self.btn_bold.setCheckable(True)
        self.btn_bold.setFixedWidth(28)
        self.btn_bold.setStyleSheet("font-weight: bold;")
        self.btn_bold.toggled.connect(self._on_typo_changed)
        typo_bar.addWidget(self.btn_bold)

        self.btn_align_left = QPushButton("Left")
        self.btn_align_left.setCheckable(True)
        self.btn_align_left.setChecked(True)
        self.btn_align_center = QPushButton("Center")
        self.btn_align_center.setCheckable(True)
        self.btn_align_right = QPushButton("Right")
        self.btn_align_right.setCheckable(True)

        self.align_group = QButtonGroup(self)
        self.align_group.addButton(self.btn_align_left, 1)
        self.align_group.addButton(self.btn_align_center, 2)
        self.align_group.addButton(self.btn_align_right, 3)
        self.align_group.idClicked.connect(self._on_typo_changed)

        typo_bar.addWidget(self.btn_align_left)
        typo_bar.addWidget(self.btn_align_center)
        typo_bar.addWidget(self.btn_align_right)
        typo_bar.addStretch()

        scroll_layout.addWidget(card_typo)

        # 5. Selected Fields Table
        self.table_items = QTableWidget()
        self.table_items.setColumnCount(3)
        self.table_items.setHorizontalHeaderLabels(["Title", "Content", "Function Area"])
        self.table_items.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Interactive)
        self.table_items.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.table_items.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        self.table_items.setColumnWidth(0, 110)
        self.table_items.setColumnWidth(2, 230)
        self.table_items.setMinimumHeight(150)
        self.table_items.itemSelectionChanged.connect(self._on_table_selection_changed)
        scroll_layout.addWidget(self.table_items)

        scroll.setWidget(scroll_content)
        left_layout.addWidget(scroll, 1)
        splitter.addWidget(left_widget)

        # =====================================================================
        # RIGHT PANEL: Preview & Edit Area
        # =====================================================================
        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)
        right_layout.setContentsMargins(8, 0, 0, 0)
        right_layout.setSpacing(6)

        lbl_sec3 = QLabel("Preview & Edit Area")
        lbl_sec3.setObjectName("SectionTitle")
        right_layout.addWidget(lbl_sec3)

        # Interactive Canvas
        self.canvas = PrintLabelsCanvas(self)
        self.canvas.element_selected.connect(self._on_canvas_element_selected)
        self.canvas.element_moved.connect(self._on_canvas_element_moved)
        right_layout.addWidget(self.canvas, 1)

        splitter.addWidget(right_widget)
        splitter.setSizes([620, 500])
        root_layout.addWidget(splitter, 1)

        # =====================================================================
        # BOTTOM STATUS & ACTION BAR
        # =====================================================================
        bottom_bar = QHBoxLayout()
        bottom_bar.setContentsMargins(0, 4, 0, 0)

        # Device status
        self.lbl_device_status = QLabel("⚡ Unconnected Devices")
        self.lbl_device_status.setStyleSheet("color: #E6A23C; font-weight: bold; font-size: 12px;")
        bottom_bar.addWidget(self.lbl_device_status)

        bottom_bar.addSpacing(20)

        # Auto print checkbox
        self.chk_autoprint = QCheckBox("Auto Print When Device Connected")
        self.chk_autoprint.setChecked(False)
        bottom_bar.addWidget(self.chk_autoprint)

        bottom_bar.addStretch()

        self.btn_feedback = QPushButton("Feedback")
        self.btn_feedback.clicked.connect(self._on_feedback_clicked)
        bottom_bar.addWidget(self.btn_feedback)

        if self._is_dialog:
            self.btn_close = QPushButton("Close")
            self.btn_close.clicked.connect(self.close_requested.emit)
            bottom_bar.addWidget(self.btn_close)

        self.btn_print = QPushButton("Print")
        self.btn_print.setObjectName("PrimaryButton")
        self.btn_print.clicked.connect(self._on_print_clicked)
        bottom_bar.addWidget(self.btn_print)

        root_layout.addLayout(bottom_bar)

    def _populate_printers(self):
        self.combo_printer.clear()
        printers = get_installed_printers()
        for p in printers:
            self.combo_printer.addItem(p)
        for i, p in enumerate(printers):
            if "pdf" in p.lower():
                self.combo_printer.setCurrentIndex(i)
                break

    def _populate_templates(self):
        self._block_signals = True
        self.combo_template.clear()
        templates = self._repo.list_templates()
        for tpl in templates:
            self.combo_template.addItem(tpl.name, tpl)
        idx = self.combo_template.findText("SampleTemplate")
        if idx >= 0:
            self.combo_template.setCurrentIndex(idx)
        self._block_signals = False

    def _apply_template_to_ui(self, tpl: PrintLabelTemplate):
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

        self._refresh_table()
        self.canvas.set_template(tpl)
        self.canvas.set_specs(self._specs, self._stock_number)
        self._block_signals = False

    def _refresh_table(self):
        self.table_items.setRowCount(0)
        tpl = self._current_template
        for idx, el in enumerate(tpl.elements):
            self.table_items.insertRow(idx)

            item_title = QTableWidgetItem(el.title)
            self.table_items.setItem(idx, 0, item_title)

            val = resolve_field_value(el.field_key, self._specs, self._stock_number)
            item_content = QTableWidgetItem(val)
            self.table_items.setItem(idx, 1, item_content)

            fn_widget = QWidget()
            fn_layout = QHBoxLayout(fn_widget)
            fn_layout.setContentsMargins(2, 2, 2, 2)
            fn_layout.setSpacing(4)

            btn_toggle_title = QPushButton("Hide Title" if el.show_title else "Show Title")
            btn_toggle_title.setFixedHeight(22)
            btn_toggle_title.clicked.connect(lambda ch, e=el: self._toggle_show_title(e))
            fn_layout.addWidget(btn_toggle_title)

            btn_barcode = QPushButton("Barcode")
            btn_barcode.setCheckable(True)
            btn_barcode.setChecked(el.is_barcode)
            btn_barcode.setFixedHeight(22)
            if el.is_barcode:
                btn_barcode.setStyleSheet("background-color: #E6F7FF; color: #1890FF; font-weight: bold;")
            btn_barcode.clicked.connect(lambda ch, e=el: self._toggle_barcode(e))
            fn_layout.addWidget(btn_barcode)

            btn_up = QPushButton("▲")
            btn_up.setFixedSize(22, 22)
            btn_up.clicked.connect(lambda ch, i=idx: self._move_item_up(i))
            fn_layout.addWidget(btn_up)

            btn_down = QPushButton("▼")
            btn_down.setFixedSize(22, 22)
            btn_down.clicked.connect(lambda ch, i=idx: self._move_item_down(i))
            fn_layout.addWidget(btn_down)

            btn_del = QPushButton("✕")
            btn_del.setFixedSize(22, 22)
            btn_del.setStyleSheet("color: #F56C6C;")
            btn_del.clicked.connect(lambda ch, i=idx: self._delete_item(i))
            fn_layout.addWidget(btn_del)

            self.table_items.setCellWidget(idx, 2, fn_widget)

    def _sync_template_from_ui(self):
        if self._block_signals:
            return
        tpl = self._current_template
        tpl.name = self.edit_tpl_name.text().strip() or "CustomTemplate"
        tpl.paper_length_mm = self.spin_length.value()
        tpl.paper_width_mm = self.spin_width.value()
        tpl.margin_top_mm = self.spin_m_top.value()
        tpl.margin_bottom_mm = self.spin_m_bottom.value()
        tpl.margin_left_mm = self.spin_m_left.value()
        tpl.margin_right_mm = self.spin_m_right.value()
        tpl.orientation = "landscape" if self.radio_landscape.isChecked() else "portrait"
        self.canvas.set_template(tpl)

    def _on_param_changed(self):
        self._sync_template_from_ui()

    def _on_template_selected(self, index: int):
        if self._block_signals or index < 0:
            return
        tpl_name = self.combo_template.currentText()
        tpl = self._repo.get_template(tpl_name)
        if tpl:
            self._current_template = tpl
            self._apply_template_to_ui(tpl)

    def _on_save_template_clicked(self):
        self._sync_template_from_ui()
        self._repo.save_template(self._current_template)
        QMessageBox.information(self, "Template Saved", f"Template '{self._current_template.name}' saved successfully!")
        self._populate_templates()
        idx = self.combo_template.findText(self._current_template.name)
        if idx >= 0:
            self.combo_template.setCurrentIndex(idx)

    def _on_delete_template_clicked(self):
        name = self.combo_template.currentText()
        if name == "SampleTemplate":
            QMessageBox.warning(self, "Delete Template", "Built-in SampleTemplate cannot be deleted.")
            return
        reply = QMessageBox.question(
            self, "Confirm Delete", f"Delete template '{name}'?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply == QMessageBox.StandardButton.Yes:
            self._repo.delete_template(name)
            self._populate_templates()

    def _on_add_field_clicked(self, field_key: str, title: str):
        last_y = 2.0
        if self._current_template.elements:
            last_el = self._current_template.elements[-1]
            last_y = (last_el.y_mm or 2.0) + (8.0 if last_el.is_barcode else 4.5)

        new_el = LabelElement(
            id=f"el_{field_key}_{uuid.uuid4().hex[:4]}",
            field_key=field_key,
            title=title,
            content=title,
            show_title=True,
            is_barcode=False,
            font_family=self.combo_font_family.currentText(),
            font_size=self.combo_font_size.currentData() or 8,
            bold=self.btn_bold.isChecked(),
            align="left",
            x_mm=2.0,
            y_mm=round(last_y, 1)
        )
        self._current_template.elements.append(new_el)
        self._refresh_table()
        self.canvas.set_template(self._current_template)
        self.canvas.select_element(new_el.id)

    def _on_add_qr_clicked(self):
        last_y = 2.0
        if self._current_template.elements:
            last_el = self._current_template.elements[-1]
            last_y = (last_el.y_mm or 2.0) + (8.0 if last_el.is_barcode else 4.5)

        new_el = LabelElement(
            id=f"el_qr_{uuid.uuid4().hex[:4]}",
            field_key="qr_code",
            title="QR Code",
            content="Specs QR",
            show_title=False,
            is_barcode=False,
            is_qr=True,
            font_family="Microsoft YaHei",
            font_size=8,
            align="center",
            x_mm=2.0,
            y_mm=round(last_y, 1),
            width_mm=14.0,
            height_mm=14.0
        )
        self._current_template.elements.append(new_el)
        self._refresh_table()
        self.canvas.set_template(self._current_template)
        self.canvas.select_element(new_el.id)

    def _toggle_show_title(self, el: LabelElement):
        el.show_title = not el.show_title
        self._refresh_table()
        self.canvas.set_template(self._current_template)

    def _toggle_barcode(self, el: LabelElement):
        el.is_barcode = not el.is_barcode
        if el.is_barcode:
            el.is_qr = False
        self._refresh_table()
        self.canvas.set_template(self._current_template)

    def _move_item_up(self, idx: int):
        if idx > 0:
            elems = self._current_template.elements
            elems[idx - 1], elems[idx] = elems[idx], elems[idx - 1]
            elems[idx - 1].y_mm, elems[idx].y_mm = elems[idx].y_mm, elems[idx - 1].y_mm
            self._refresh_table()
            self.canvas.set_template(self._current_template)
            self.table_items.selectRow(idx - 1)

    def _move_item_down(self, idx: int):
        elems = self._current_template.elements
        if idx < len(elems) - 1:
            elems[idx], elems[idx + 1] = elems[idx + 1], elems[idx]
            elems[idx].y_mm, elems[idx + 1].y_mm = elems[idx + 1].y_mm, elems[idx].y_mm
            self._refresh_table()
            self.canvas.set_template(self._current_template)
            self.table_items.selectRow(idx + 1)

    def _delete_item(self, idx: int):
        if 0 <= idx < len(self._current_template.elements):
            del self._current_template.elements[idx]
            self._refresh_table()
            self.canvas.set_template(self._current_template)

    def _on_table_selection_changed(self):
        row = self.table_items.currentRow()
        if 0 <= row < len(self._current_template.elements):
            el = self._current_template.elements[row]
            self.canvas.select_element(el.id)
            self._block_signals = True
            idx_f = self.combo_font_family.findText(el.font_family)
            if idx_f >= 0:
                self.combo_font_family.setCurrentIndex(idx_f)
            idx_s = self.combo_font_size.findData(el.font_size)
            if idx_s >= 0:
                self.combo_font_size.setCurrentIndex(idx_s)
            self.btn_bold.setChecked(el.bold)
            if el.align == "center":
                self.btn_align_center.setChecked(True)
            elif el.align == "right":
                self.btn_align_right.setChecked(True)
            else:
                self.btn_align_left.setChecked(True)
            self._block_signals = False

    def _on_canvas_element_selected(self, element_id: str):
        if not element_id:
            self.table_items.clearSelection()
            return
        for row, el in enumerate(self._current_template.elements):
            if el.id == element_id:
                self.table_items.selectRow(row)
                break

    def _on_canvas_element_moved(self, element_id: str, x_mm: float, y_mm: float):
        pass

    def _on_typo_changed(self):
        if self._block_signals:
            return
        sel_id = self.canvas.get_selected_id()
        if not sel_id:
            row = self.table_items.currentRow()
            if 0 <= row < len(self._current_template.elements):
                sel_id = self._current_template.elements[row].id

        font_family = self.combo_font_family.currentText()
        font_size = self.combo_font_size.currentData() or 8
        bold = self.btn_bold.isChecked()
        align = "left"
        if self.btn_align_center.isChecked():
            align = "center"
        elif self.btn_align_right.isChecked():
            align = "right"

        for el in self._current_template.elements:
            if not sel_id or el.id == sel_id:
                el.font_family = font_family
                el.font_size = font_size
                el.bold = bold
                el.align = align

        self.canvas.set_template(self._current_template)

    def update_device_status(self, specs: Optional[DeviceSpecs], stock_number: Optional[str] = None):
        self._specs = specs
        if stock_number:
            self._stock_number = stock_number

        if specs and specs.marketing_name:
            self.lbl_device_status.setText(f"📱 {specs.marketing_name} Connected")
            self.lbl_device_status.setStyleSheet("color: #67C23A; font-weight: bold; font-size: 12px;")
        else:
            self.lbl_device_status.setText("⚡ Unconnected Devices")
            self.lbl_device_status.setStyleSheet("color: #909399; font-weight: bold; font-size: 12px;")

        self._refresh_table()
        self.canvas.set_specs(self._specs, self._stock_number)

    def trigger_auto_print_if_enabled(self, specs: DeviceSpecs, stock_number: str):
        if self.chk_autoprint.isChecked():
            self._specs = specs
            self._stock_number = stock_number
            self._on_print_clicked()

    def _on_print_clicked(self):
        printer_name = self.combo_printer.currentText()
        try:
            pil_img = render_template_to_pil(self._current_template, self._specs, self._stock_number)

            if "pdf" in printer_name.lower() or "virtual" in printer_name.lower():
                path = save_virtual_print(pil_img, format="pdf", prefix="Label")
                QMessageBox.information(self, "Printed Successfully", f"Label exported to PDF:\n{path}")
            else:
                success = print_label_image(pil_img, printer_name=printer_name)
                if success:
                    QMessageBox.information(self, "Printing", f"Sent label to {printer_name}!")
                else:
                    path = save_virtual_print(pil_img, format="png", prefix="Label")
                    QMessageBox.information(self, "Fallback Exported", f"Virtual print fallback saved to:\n{path}")

            self.label_printed.emit(pil_img)
        except Exception as e:
            QMessageBox.critical(self, "Print Error", f"Failed to print label:\n{e}")

    def _on_feedback_clicked(self):
        QMessageBox.information(
            self, "3uTools Print Labels Studio",
            "Print Labels Studio v3.0\n"
            "Full hardware telemetry integration with sub-millimeter 203 DPI thermal printing."
        )


class PrintLabelsDialog(QDialog):
    """
    Standalone modal/modeless dialog wrapper for PrintLabelsStudioWidget.
    """
    label_printed = pyqtSignal(object)

    def __init__(self, specs: Optional[DeviceSpecs] = None, stock_number: str = "001", parent=None):
        super().__init__(parent)
        self.setObjectName("PrintLabelsDialog")
        self.setWindowTitle("Print Labels")
        self.resize(1180, 740)
        self.setMinimumSize(1020, 620)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self.studio = PrintLabelsStudioWidget(specs=specs, stock_number=stock_number, is_dialog=True, parent=self)
        self.studio.close_requested.connect(self.close)
        self.studio.label_printed.connect(self.label_printed.emit)
        layout.addWidget(self.studio)

    def update_device_status(self, specs: Optional[DeviceSpecs], stock_number: Optional[str] = None):
        self.studio.update_device_status(specs, stock_number)

    def trigger_auto_print_if_enabled(self, specs: DeviceSpecs, stock_number: str):
        self.studio.trigger_auto_print_if_enabled(specs, stock_number)
