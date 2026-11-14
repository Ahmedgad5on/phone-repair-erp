"""
ui/shop_dialog.py — Shop Branding, Logo Customization & Typography Dialog
Allows shop owners to configure:
- Shop Name, Phone, and Address/Slogan.
- Shop Logo image upload with real-time 1-bit thermal preview.
- Label Font family (Segoe UI, Tahoma, Arial, Calibri, Arabic Typesetting, Consolas).
- Label Design Template (Modern Lab, Retail VIP, Tech Workshop, Minimalist Barcode).
"""
import os
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QPixmap, QImage
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QComboBox, QCheckBox, QPushButton, QFileDialog,
    QGroupBox, QMessageBox, QFrame
)

from core.config import ConfigManager
from core.i18n import tr
from core.label_renderer import convert_image_to_1bit_monochrome


class ShopSettingsDialog(QDialog):
    """
    Shop branding & label customization modal dialog.
    """
    settings_saved = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle(tr("shop_dialog_title"))
        self.setFixedSize(540, 520)
        self.config_mgr = ConfigManager.get_instance()
        self.cfg = self.config_mgr.config
        self._init_ui()
        self._load_values()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # 1. Shop Info Group
        grp_shop = QGroupBox(tr("shop_name"))
        grid_shop = QGridLayout(grp_shop)
        grid_shop.setSpacing(8)

        grid_shop.addWidget(QLabel(tr("shop_name")), 0, 0)
        self.edit_name = QLineEdit()
        grid_shop.addWidget(self.edit_name, 0, 1)

        grid_shop.addWidget(QLabel(tr("shop_phone")), 1, 0)
        self.edit_phone = QLineEdit()
        grid_shop.addWidget(self.edit_phone, 1, 1)

        grid_shop.addWidget(QLabel(tr("shop_address")), 2, 0)
        self.edit_address = QLineEdit()
        grid_shop.addWidget(self.edit_address, 2, 1)

        layout.addWidget(grp_shop)

        # 2. Logo Group
        grp_logo = QGroupBox(tr("shop_logo"))
        grid_logo = QGridLayout(grp_logo)
        grid_logo.setSpacing(8)

        self.chk_show_logo = QCheckBox(tr("show_logo_chk"))
        grid_logo.addWidget(self.chk_show_logo, 0, 0, 1, 2)

        self.edit_logo_path = QLineEdit()
        self.edit_logo_path.setPlaceholderText("C:\\path\\to\\logo.png")
        self.edit_logo_path.textChanged.connect(self._update_logo_preview)
        grid_logo.addWidget(self.edit_logo_path, 1, 0)

        btn_browse = QPushButton(tr("choose_logo"))
        btn_browse.clicked.connect(self._browse_logo)
        grid_logo.addWidget(btn_browse, 1, 1)

        # Logo Preview Box (Showing 1-bit thermal conversion)
        lbl_prev_title = QLabel("معاينة اللوجو (أحادي 203 DPI):")
        lbl_prev_title.setProperty("class", "MutedLabel")
        grid_logo.addWidget(lbl_prev_title, 2, 0)

        self.lbl_logo_preview = QLabel()
        self.lbl_logo_preview.setFixedSize(120, 48)
        self.lbl_logo_preview.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_logo_preview.setStyleSheet("background-color: white; border: 1px solid #555555; border-radius: 4px;")
        grid_logo.addWidget(self.lbl_logo_preview, 2, 1)

        layout.addWidget(grp_logo)

        # 3. Design & Typography Group
        grp_design = QGroupBox(tr("label_template"))
        grid_design = QGridLayout(grp_design)
        grid_design.setSpacing(8)

        grid_design.addWidget(QLabel(tr("label_template")), 0, 0)
        self.combo_template = QComboBox()
        self.combo_template.addItem(tr("template_modern"), "modern_lab")
        self.combo_template.addItem(tr("template_retail"), "retail_vip")
        self.combo_template.addItem(tr("template_workshop"), "workshop_tech")
        self.combo_template.addItem(tr("template_minimal"), "minimalist_tag")
        self.combo_template.addItem(tr("template_custom"), "custom_designer")
        grid_design.addWidget(self.combo_template, 0, 1)

        grid_design.addWidget(QLabel(tr("label_font")), 1, 0)
        self.combo_font = QComboBox()
        self.combo_font.addItem("Segoe UI (الافتراضي العصري)", "segoe")
        self.combo_font.addItem("Tahoma (الخط العربي الكلاسيكي)", "tahoma")
        self.combo_font.addItem("Arial (واضح قياسي)", "arial")
        self.combo_font.addItem("Calibri (ناعم متناسق)", "calibri")
        self.combo_font.addItem("Arabic Typesetting (عربي أصيل)", "arabic_type")
        self.combo_font.addItem("Consolas (تقني مونوسبيس)", "consolas")
        grid_design.addWidget(self.combo_font, 1, 1)

        layout.addWidget(grp_design)

        # 4. Desktop Shortcut
        grp_system = QGroupBox("🖥️ تكامل النظام وسطح المكتب")
        grid_sys = QGridLayout(grp_system)
        grid_sys.setSpacing(8)

        self.btn_desktop_shortcut = QPushButton("🖥️ إنشاء اختصار على سطح المكتب (Desktop Shortcut)")
        self.btn_desktop_shortcut.setStyleSheet("padding: 6px; font-weight: bold;")
        self.btn_desktop_shortcut.clicked.connect(self._create_desktop_shortcut_clicked)
        grid_sys.addWidget(self.btn_desktop_shortcut, 0, 0)

        layout.addWidget(grp_system)

        # Actions
        btn_box = QHBoxLayout()
        btn_box.addStretch()

        self.btn_cancel = QPushButton(tr("clear_btn"))
        self.btn_cancel.clicked.connect(self.reject)
        btn_box.addWidget(self.btn_cancel)

        self.btn_save = QPushButton(tr("save_settings"))
        self.btn_save.setObjectName("PrimaryButton")
        self.btn_save.setProperty("class", "PrimaryButton")
        self.btn_save.clicked.connect(self._save_and_close)
        btn_box.addWidget(self.btn_save)

        layout.addLayout(btn_box)

    def _load_values(self):
        self.edit_name.setText(self.cfg.shop_name)
        self.edit_phone.setText(self.cfg.shop_phone)
        self.edit_address.setText(self.cfg.shop_address)
        self.edit_logo_path.setText(self.cfg.logo_path)
        self.chk_show_logo.setChecked(self.cfg.show_logo)

        # Template index
        idx_t = self.combo_template.findData(self.cfg.label_template)
        if idx_t >= 0:
            self.combo_template.setCurrentIndex(idx_t)

        # Font index
        idx_f = self.combo_font.findData(self.cfg.selected_font)
        if idx_f >= 0:
            self.combo_font.setCurrentIndex(idx_f)

        self._update_logo_preview()

    def _browse_logo(self):
        path, _ = QFileDialog.getOpenFileName(
            self, tr("choose_logo"), "", "Image Files (*.png *.jpg *.jpeg *.bmp)"
        )
        if path:
            self.edit_logo_path.setText(path)

    def _update_logo_preview(self):
        path = self.edit_logo_path.text().strip()
        if path and os.path.exists(path):
            mono = convert_image_to_1bit_monochrome(path, max_w=110, max_h=42)
            if mono:
                rgba = mono.convert("RGBA")
                data = rgba.tobytes("raw", "RGBA")
                qimg = QImage(data, rgba.width, rgba.height, QImage.Format.Format_RGBA8888)
                self.lbl_logo_preview.setPixmap(QPixmap.fromImage(qimg))
                return
        self.lbl_logo_preview.setText("لا يوجد لوجو")

    def _create_desktop_shortcut_clicked(self):
        try:
            from core.shortcut_util import create_desktop_shortcut
            created = create_desktop_shortcut()
            if created:
                QMessageBox.information(
                    self,
                    "نجاح",
                    "✅ تم إنشاء اختصار البرنامج على سطح المكتب بنجاح بالأيقونة الذهبية الفاخرة!"
                )
            else:
                QMessageBox.warning(self, "تنبيه", "تعذر إنشاء الاختصار تلقائياً.")
        except Exception as e:
            QMessageBox.critical(self, "خطأ", f"حدث خطأ أثناء إنشاء الاختصار:\n{e}")

    def _save_and_close(self):
        self.config_mgr.update(
            shop_name=self.edit_name.text().strip(),
            shop_phone=self.edit_phone.text().strip(),
            shop_address=self.edit_address.text().strip(),
            logo_path=self.edit_logo_path.text().strip(),
            show_logo=self.chk_show_logo.isChecked(),
            label_template=self.combo_template.currentData(),
            selected_font=self.combo_font.currentData()
        )
        self.settings_saved.emit()
        self.accept()
        self.settings_saved.emit()
        self.accept()
