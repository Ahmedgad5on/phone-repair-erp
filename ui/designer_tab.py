"""
ui/designer_tab.py — Shop Identity & Label Field Designer Panel
Allows users to:
1. Set Shop Name, Phone, Address/Slogan, and Shop Logo directly with 1-bit thermal preview.
2. Select Label Template and Typography Font family.
3. Customize which fields appear on the label and adjust their vertical ordering and alignment.
4. Set custom Display Price, Warranty, and Notes.
5. Choose QR Code mode (Full Specs, WhatsApp Direct, IMEI, Custom URL).
All edits update the live WYSIWYG preview in real time.
"""
import os
import re
from typing import List, Dict, Any
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QPixmap, QImage
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QComboBox, QCheckBox, QPushButton, QFileDialog,
    QGroupBox, QTableWidget, QTableWidgetItem, QHeaderView,
    QScrollArea, QFrame, QMessageBox
)

from core.config import ConfigManager, DEFAULT_LABEL_FIELDS
from core.i18n import tr
from core.label_renderer import convert_image_to_1bit_monochrome


class DesignerTab(QWidget):
    """
    Shop branding, label templates, and field layout customization panel.
    """
    layout_changed = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.config_mgr = ConfigManager.get_instance()
        self.cfg = self.config_mgr.config
        self._block_updates = False
        self._init_ui()
        self.load_settings()

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(6, 6, 6, 6)
        main_layout.setSpacing(8)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)

        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(10)

        # =====================================================================
        # 1. Shop Identity & Branding Box
        # =====================================================================
        grp_shop = QGroupBox("🏷️ " + tr("shop_name"))
        grid_shop = QGridLayout(grp_shop)
        grid_shop.setSpacing(6)

        grid_shop.addWidget(QLabel(tr("shop_name")), 0, 0)
        self.edit_shop_name = QLineEdit()
        self.edit_shop_name.setPlaceholderText("مثال: محل المتميز لخدمات المحمول")
        self.edit_shop_name.textChanged.connect(self._on_setting_changed)
        grid_shop.addWidget(self.edit_shop_name, 0, 1)

        grid_shop.addWidget(QLabel(tr("shop_phone")), 1, 0)
        self.edit_shop_phone = QLineEdit()
        self.edit_shop_phone.setPlaceholderText("مثال: 01012345678")
        self.edit_shop_phone.textChanged.connect(self._on_setting_changed)
        grid_shop.addWidget(self.edit_shop_phone, 1, 1)

        grid_shop.addWidget(QLabel(tr("shop_address")), 2, 0)
        self.edit_shop_address = QLineEdit()
        self.edit_shop_address.setPlaceholderText("بيع • شراء • صيانة فورية")
        self.edit_shop_address.textChanged.connect(self._on_setting_changed)
        grid_shop.addWidget(self.edit_shop_address, 2, 1)

        # Logo row
        grid_shop.addWidget(QLabel(tr("shop_logo")), 3, 0)
        logo_row = QHBoxLayout()
        self.chk_show_logo = QCheckBox(tr("show_logo_chk"))
        self.chk_show_logo.setChecked(True)
        self.chk_show_logo.toggled.connect(self._on_setting_changed)
        logo_row.addWidget(self.chk_show_logo)

        self.btn_browse_logo = QPushButton(tr("choose_logo"))
        self.btn_browse_logo.clicked.connect(self._browse_logo)
        logo_row.addWidget(self.btn_browse_logo)

        self.btn_remove_logo = QPushButton(tr("remove_logo"))
        self.btn_remove_logo.clicked.connect(self._remove_logo)
        logo_row.addWidget(self.btn_remove_logo)
        grid_shop.addLayout(logo_row, 3, 1)

        # Logo Preview Box
        grid_shop.addWidget(QLabel("معاينة اللوجو (203 DPI أحادي):"), 4, 0)
        self.lbl_logo_preview = QLabel("لا يوجد لوجو")
        self.lbl_logo_preview.setFixedSize(140, 48)
        self.lbl_logo_preview.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_logo_preview.setStyleSheet("background-color: white; color: #111; border: 1px solid #555; border-radius: 4px; font-weight: bold;")
        grid_shop.addWidget(self.lbl_logo_preview, 4, 1)

        layout.addWidget(grp_shop)

        # =====================================================================
        # 2. Template, Font & Barcode Mode Box
        # =====================================================================
        grp_style = QGroupBox("🎨 " + tr("label_template"))
        grid_style = QGridLayout(grp_style)
        grid_style.setSpacing(6)

        grid_style.addWidget(QLabel(tr("label_template")), 0, 0)
        self.combo_template = QComboBox()
        self.combo_template.addItem("مختبر حديث (Modern Lab — الافتراضي)", "modern_lab")
        self.combo_template.addItem("معرض بيع VIP (Retail VIP Showcase)", "retail_vip")
        self.combo_template.addItem("عرض مواصفات تفصيلي (Detailed Specs)", "workshop_tech")
        self.combo_template.addItem("باركود أولاً (Minimalist Barcode)", "minimalist_tag")
        self.combo_template.addItem("المصمم الحر المخصص (Custom Tailored)", "custom_designer")
        self.combo_template.currentIndexChanged.connect(self._on_setting_changed)
        grid_style.addWidget(self.combo_template, 0, 1)

        grid_style.addWidget(QLabel(tr("label_font")), 1, 0)
        self.combo_font = QComboBox()
        self.combo_font.addItem("Segoe UI (الافتراضي العصري)", "segoe")
        self.combo_font.addItem("Tahoma (الخط العربي الكلاسيكي)", "tahoma")
        self.combo_font.addItem("Arial (واضح قياسي)", "arial")
        self.combo_font.addItem("Calibri (ناعم متناسق)", "calibri")
        self.combo_font.addItem("Arabic Typesetting (عربي أصيل)", "arabic_type")
        self.combo_font.addItem("Consolas (تقني مونوسبيس)", "consolas")
        self.combo_font.currentIndexChanged.connect(self._on_setting_changed)
        grid_style.addWidget(self.combo_font, 1, 1)

        grid_style.addWidget(QLabel("محتوى رمز الـ QR Code:"), 2, 0)
        self.combo_qr_mode = QComboBox()
        self.combo_qr_mode.addItem("تقرير مواصفات الهاتف كاملة (Specs Report)", "specs")
        self.combo_qr_mode.addItem("محادثة واتساب المحل للاستفسار (WhatsApp Chat)", "whatsapp")
        self.combo_qr_mode.addItem("رقم IMEI والسيريال فقط (IMEI Only)", "imei")
        self.combo_qr_mode.addItem("رابط إنترنت مخصص (Custom URL)", "custom")
        self.combo_qr_mode.currentIndexChanged.connect(self._on_setting_changed)
        grid_style.addWidget(self.combo_qr_mode, 2, 1)

        layout.addWidget(grp_style)

        # =====================================================================
        # 3. Custom Price & Warranty Inputs
        # =====================================================================
        grp_custom = QGroupBox("💰 حقول مخصصة قابلة للطباعة على الملصق")
        grid_custom = QGridLayout(grp_custom)
        grid_custom.setSpacing(6)

        grid_custom.addWidget(QLabel(tr("custom_price")), 0, 0)
        self.edit_price = QLineEdit()
        self.edit_price.setPlaceholderText("مثال: 18,500 EGP")
        self.edit_price.textChanged.connect(self._on_setting_changed)
        grid_custom.addWidget(self.edit_price, 0, 1)

        grid_custom.addWidget(QLabel(tr("custom_warranty")), 1, 0)
        self.edit_warranty = QLineEdit()
        self.edit_warranty.setPlaceholderText("مثال: ضمان 3 شهور ضد عيوب الصناعة")
        self.edit_warranty.textChanged.connect(self._on_setting_changed)
        grid_custom.addWidget(self.edit_warranty, 1, 1)

        grid_custom.addWidget(QLabel(tr("custom_note")), 2, 0)
        self.edit_note = QLineEdit()
        self.edit_note.setPlaceholderText("مثال: بطارية أصلية 100% / شاشة وكالة")
        self.edit_note.textChanged.connect(self._on_setting_changed)
        grid_custom.addWidget(self.edit_note, 2, 1)

        # Sound chime checkbox
        self.chk_sound = QCheckBox(tr("audio_chime"))
        self.chk_sound.setChecked(True)
        self.chk_sound.toggled.connect(self._on_setting_changed)
        grid_custom.addWidget(self.chk_sound, 3, 0, 1, 2)

        layout.addWidget(grp_custom)

        # =====================================================================
        # 4. Fields Layout & Positioning Table
        # =====================================================================
        grp_fields = QGroupBox("📋 " + tr("fields_layout_grp"))
        vbox_fields = QVBoxLayout(grp_fields)
        vbox_fields.setSpacing(6)

        info_lbl = QLabel("تحكم في إظهار أو إخفاء أي خانة وترتيب موقعها في الليبل من الأعلى للأسفل:")
        info_lbl.setProperty("class", "MutedLabel")
        info_lbl.setWordWrap(True)
        vbox_fields.addWidget(info_lbl)

        self.table_fields = QTableWidget()
        self.table_fields.setColumnCount(3)
        self.table_fields.setHorizontalHeaderLabels([tr("field_active"), tr("field_name"), tr("field_align")])
        self.table_fields.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.table_fields.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.table_fields.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        self.table_fields.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table_fields.setSelectionMode(QTableWidget.SelectionMode.SingleSelection)
        self.table_fields.setFixedHeight(210)
        vbox_fields.addWidget(self.table_fields)

        # Up / Down Order Buttons
        btn_order_row = QHBoxLayout()
        self.btn_move_up = QPushButton(tr("move_up"))
        self.btn_move_up.clicked.connect(self._move_field_up)
        btn_order_row.addWidget(self.btn_move_up)

        self.btn_move_down = QPushButton(tr("move_down"))
        self.btn_move_down.clicked.connect(self._move_field_down)
        btn_order_row.addWidget(self.btn_move_down)

        self.btn_reset_fields = QPushButton("🔄 إعادة الترتيب الافتراضي")
        self.btn_reset_fields.clicked.connect(self._reset_default_fields)
        btn_order_row.addWidget(self.btn_reset_fields)

        vbox_fields.addLayout(btn_order_row)
        layout.addWidget(grp_fields)

        scroll.setWidget(container)
        main_layout.addWidget(scroll)

    def load_settings(self):
        """Populates UI with current settings."""
        self._block_updates = True
        self.cfg = self.config_mgr.load()

        self.edit_shop_name.setText(self.cfg.shop_name)
        self.edit_shop_phone.setText(self.cfg.shop_phone)
        self.edit_shop_address.setText(self.cfg.shop_address)
        self.chk_show_logo.setChecked(self.cfg.show_logo)
        self.edit_price.setText(self.cfg.custom_label_price)
        self.edit_warranty.setText(self.cfg.custom_label_warranty)
        self.edit_note.setText(self.cfg.custom_label_note)
        self.chk_sound.setChecked(self.cfg.play_sound_on_connect)

        # Template
        idx_t = self.combo_template.findData(self.cfg.label_template)
        if idx_t >= 0:
            self.combo_template.setCurrentIndex(idx_t)

        # Font
        idx_f = self.combo_font.findData(self.cfg.selected_font)
        if idx_f >= 0:
            self.combo_font.setCurrentIndex(idx_f)

        # QR Mode
        idx_q = self.combo_qr_mode.findData(self.cfg.qr_mode)
        if idx_q >= 0:
            self.combo_qr_mode.setCurrentIndex(idx_q)

        self._update_logo_preview()
        self._populate_fields_table()
        self._block_updates = False

    def _populate_fields_table(self):
        """Populates the fields ordering table."""
        fields = self.cfg.label_fields or [dict(f) for f in DEFAULT_LABEL_FIELDS]
        self.table_fields.setRowCount(len(fields))

        for row, f_data in enumerate(fields):
            # 0: Checkbox
            chk = QCheckBox()
            chk.setChecked(f_data.get("enabled", True))
            chk.toggled.connect(self._on_table_changed)
            chk_widget = QWidget()
            chk_lay = QHBoxLayout(chk_widget)
            chk_lay.addWidget(chk)
            chk_lay.setAlignment(Qt.AlignmentFlag.AlignCenter)
            chk_lay.setContentsMargins(0, 0, 0, 0)
            self.table_fields.setCellWidget(row, 0, chk_widget)

            # 1: Name
            item_name = QTableWidgetItem(f_data.get("name", f_data.get("id")))
            item_name.setData(Qt.ItemDataRole.UserRole, f_data.get("id"))
            item_name.setFlags(item_name.flags() & ~Qt.ItemFlag.ItemIsEditable)
            self.table_fields.setItem(row, 1, item_name)

            # 2: Alignment combobox
            combo_align = QComboBox()
            combo_align.addItem(tr("align_left"), "left")
            combo_align.addItem(tr("align_center"), "center")
            combo_align.addItem(tr("align_right"), "right")
            cur_align = f_data.get("align", "left")
            idx_a = combo_align.findData(cur_align)
            if idx_a >= 0:
                combo_align.setCurrentIndex(idx_a)
            combo_align.currentIndexChanged.connect(self._on_table_changed)
            self.table_fields.setCellWidget(row, 2, combo_align)

    def _browse_logo(self):
        path, _ = QFileDialog.getOpenFileName(
            self, tr("choose_logo"), "", "Images (*.png *.jpg *.jpeg *.bmp)"
        )
        if path:
            self.config_mgr.update(logo_path=path)
            self.cfg.logo_path = path
            self._update_logo_preview()
            self._on_setting_changed()

    def _remove_logo(self):
        self.config_mgr.update(logo_path="")
        self.cfg.logo_path = ""
        self._update_logo_preview()
        self._on_setting_changed()

    def _update_logo_preview(self):
        path = self.cfg.logo_path.strip()
        if path and os.path.exists(path):
            mono = convert_image_to_1bit_monochrome(path, max_w=130, max_h=42)
            if mono:
                rgba = mono.convert("RGBA")
                data = rgba.tobytes("raw", "RGBA")
                qimg = QImage(data, rgba.width, rgba.height, QImage.Format.Format_RGBA8888)
                self.lbl_logo_preview.setPixmap(QPixmap.fromImage(qimg))
                return
        self.lbl_logo_preview.setText("لا يوجد لوجو")

    def _move_field_up(self):
        row = self.table_fields.currentRow()
        if row > 0:
            self._swap_rows(row, row - 1)
            self.table_fields.setCurrentCell(row - 1, 1)
            self._save_fields_from_table()

    def _move_field_down(self):
        row = self.table_fields.currentRow()
        if 0 <= row < self.table_fields.rowCount() - 1:
            self._swap_rows(row, row + 1)
            self.table_fields.setCurrentCell(row + 1, 1)
            self._save_fields_from_table()

    def _swap_rows(self, r1: int, r2: int):
        fields = self._get_fields_from_table()
        fields[r1], fields[r2] = fields[r2], fields[r1]
        for idx, f in enumerate(fields, start=1):
            f["order"] = idx
        self.cfg.label_fields = fields
        self.config_mgr.update(label_fields=fields)
        self._populate_fields_table()

    def _reset_default_fields(self):
        defaults = [dict(f) for f in DEFAULT_LABEL_FIELDS]
        self.cfg.label_fields = defaults
        self.config_mgr.update(label_fields=defaults)
        self._populate_fields_table()
        self.layout_changed.emit()

    def _get_fields_from_table(self) -> List[Dict[str, Any]]:
        fields = []
        for row in range(self.table_fields.rowCount()):
            # Enabled
            w_chk = self.table_fields.cellWidget(row, 0)
            enabled = True
            if w_chk:
                chk = w_chk.findChild(QCheckBox)
                if chk:
                    enabled = chk.isChecked()

            # Name and ID
            item = self.table_fields.item(row, 1)
            name = item.text() if item else ""
            fid = item.data(Qt.ItemDataRole.UserRole) if item else ""

            # Align
            w_align = self.table_fields.cellWidget(row, 2)
            align = "left"
            if isinstance(w_align, QComboBox):
                align = w_align.currentData() or "left"

            fields.append({
                "id": fid,
                "name": name,
                "enabled": enabled,
                "order": row + 1,
                "align": align
            })
        return fields

    def _save_fields_from_table(self):
        fields = self._get_fields_from_table()
        self.cfg.label_fields = fields
        self.config_mgr.update(label_fields=fields)
        self.layout_changed.emit()

    def _on_table_changed(self):
        if not self._block_updates:
            self._save_fields_from_table()

    def _on_setting_changed(self):
        if self._block_updates:
            return

        self.config_mgr.update(
            shop_name=self.edit_shop_name.text().strip(),
            shop_phone=self.edit_shop_phone.text().strip(),
            shop_address=self.edit_shop_address.text().strip(),
            show_logo=self.chk_show_logo.isChecked(),
            label_template=self.combo_template.currentData(),
            selected_font=self.combo_font.currentData(),
            qr_mode=self.combo_qr_mode.currentData(),
            custom_label_price=self.edit_price.text().strip(),
            custom_label_warranty=self.edit_warranty.text().strip(),
            custom_label_note=self.edit_note.text().strip(),
            play_sound_on_connect=self.chk_sound.isChecked()
        )
        self.layout_changed.emit()
