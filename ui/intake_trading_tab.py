"""
ui/intake_trading_tab.py — Smart Stock Intake & Tax/Warranty Tagging
Module 1: Commercial Trading Inventory Intake (New Sealed & Used Smartphones)
"""
from datetime import datetime
import logging
import os
from pathlib import Path
from typing import Optional, Dict, Any, List

from PyQt6.QtCore import Qt, pyqtSignal, pyqtSlot
from PyQt6.QtGui import QPixmap, QIcon
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QComboBox, QSpinBox, QDoubleSpinBox, QPushButton,
    QButtonGroup, QRadioButton, QFileDialog, QMessageBox, QFrame,
    QScrollArea, QSplitter, QTableWidget, QTableWidgetItem, QHeaderView
)

from core.database import DatabaseManager, encode_cost_cipher, DEFAULT_CIPHER_KEY
from core.models import DeviceSpecs, DeviceRecord, UserRole

logger = logging.getLogger(__name__)

BRANDS = [
    "Apple", "Samsung", "Xiaomi", "Oppo", "Realme",
    "Vivo", "Honor", "Huawei", "Google Pixel", "Other"
]

TAX_STATUSES = [
    "ضمان محلي / مسدد الضريبة",
    "دولي بدون ضريبة",
    "شريحتين / eSIM"
]

OWNERSHIP_TAGS = [
    "ملك المحل",
    "بضاعة أمانة",
    "خارج للعرض عند تاجر"
]

STORAGE_OPTIONS = ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB"]
RAM_OPTIONS = ["3GB", "4GB", "6GB", "8GB", "12GB", "16GB"]

POPULAR_COLORS = [
    ("أسود", "#1C1C1E", "#FFFFFF"),
    ("أبيض", "#F5F5F7", "#1C1C1E"),
    ("فضي", "#D1D5DB", "#1C1C1E"),
    ("رمادي", "#4B5563", "#FFFFFF"),
    ("ذهبي", "#D4AF37", "#0D0D11"),
    ("أزرق", "#2563EB", "#FFFFFF"),
    ("أخضر", "#059669", "#FFFFFF"),
    ("بنفسجي", "#7C3AED", "#FFFFFF"),
    ("أحمر", "#DC2626", "#FFFFFF"),
    ("وردي", "#EC4899", "#FFFFFF"),
]

COLOR_OPTIONS = [
    "أسود (Black / Midnight)",
    "أبيض (White / Starlight)",
    "فضي (Silver / Astro Silver)",
    "رمادي فلكي (Space Gray)",
    "تيتانيوم طبيعي (Natural Titanium)",
    "تيتانيوم صحراوي (Desert Titanium)",
    "تيتانيوم أسود (Black Titanium)",
    "ذهبي (Gold / Champagne)",
    "أزرق بحري (Sierra Blue / Pacific Blue)",
    "أزرق سماوي (Sky Blue)",
    "أخضر زمردي (Emerald Green / Alpine Green)",
    "بنفسجي عميق (Deep Purple)",
    "أحمر (Red / Product Red)",
    "وردي (Pink / Rose Gold)",
    "أورورا غروب (Sunset Orange / Aurora)"
]


class IntakeTradingTab(QWidget):
    """
    Intake terminal supporting dual-mode intake:
    1. Used USB hardware auto-read + KYC Seller ID photo.
    2. New Sealed batch entry with zero-reprint smart pricing.
    """
    device_intake_saved = pyqtSignal(dict)  # Emits saved device dictionary
    request_print_label = pyqtSignal(dict)  # Emits device specs for direct label print

    def __init__(self, db: DatabaseManager, current_role: str = "Owner", parent=None):
        super().__init__(parent)
        self.db = db
        self.current_role = current_role
        self.current_user = "Owner" if current_role == "Owner" else "SalesStaff"
        self._kyc_photo_path: str = ""

        self._init_ui()
        self._update_cipher_preview()

    def set_user_role(self, role: str, user_name: str):
        self.current_role = role
        self.current_user = user_name
        is_owner = (role == "Owner")
        self.txt_buy_price.setEnabled(is_owner)
        self.txt_prep_cost.setEnabled(is_owner)
        self.lbl_cipher_val.setVisible(is_owner)
        self.lbl_cipher_title.setVisible(is_owner)

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(12, 12, 12, 12)
        main_layout.setSpacing(10)

        # Scrollable container for smaller screens
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)

        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setSpacing(12)

        # ----------------------------------------------------------------------
        # Header / Condition Toggle Bar
        # ----------------------------------------------------------------------
        top_card = QFrame()
        top_card.setObjectName("card")
        top_card_layout = QHBoxLayout(top_card)

        lbl_header = QLabel("📦 إدخال وتوصيف أجهزة المخزن (Stock Intake)")
        lbl_header.setObjectName("title")
        top_card_layout.addWidget(lbl_header)
        top_card_layout.addStretch()

        # Condition Toggle: New vs Used
        lbl_cond = QLabel("حالة الجهاز:")
        lbl_cond.setStyleSheet("font-weight: bold;")
        top_card_layout.addWidget(lbl_cond)

        self.btn_cond_used = QRadioButton("✨ مستعمل / كسر زيرو")
        self.btn_cond_used.setChecked(True)
        self.btn_cond_new = QRadioButton("🆕 جديد متبرشم")

        self.cond_group = QButtonGroup(self)
        self.cond_group.addButton(self.btn_cond_used)
        self.cond_group.addButton(self.btn_cond_new)
        self.btn_cond_used.toggled.connect(self._on_condition_changed)

        top_card_layout.addWidget(self.btn_cond_used)
        top_card_layout.addWidget(self.btn_cond_new)

        layout.addWidget(top_card)

        # ----------------------------------------------------------------------
        # Section 1: Device Telemetry & Specs
        # ----------------------------------------------------------------------
        specs_card = QFrame()
        specs_card.setObjectName("card")
        specs_layout = QGridLayout(specs_card)
        specs_layout.setHorizontalSpacing(14)
        specs_layout.setVerticalSpacing(8)

        lbl_specs_title = QLabel("1. مواصفات الجهاز والبيانات الفنية")
        lbl_specs_title.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 14px;")
        specs_layout.addWidget(lbl_specs_title, 0, 0, 1, 4)

        # Brand
        specs_layout.addWidget(QLabel("الماركة (Brand):"), 1, 0)
        self.cb_brand = QComboBox()
        self.cb_brand.addItems(BRANDS)
        self.cb_brand.currentTextChanged.connect(self._on_brand_changed)
        specs_layout.addWidget(self.cb_brand, 1, 1)

        # Model Name
        specs_layout.addWidget(QLabel("اسم الموديل (Model):"), 1, 2)
        self.txt_model = QLineEdit()
        self.txt_model.setPlaceholderText("مثال: iPhone 15 Pro Max / Galaxy S24 Ultra")
        specs_layout.addWidget(self.txt_model, 1, 3)

        # Storage & RAM (Side-by-side in one compact layout)
        specs_layout.addWidget(QLabel("المساحة والرامات:"), 2, 0)
        storage_ram_box = QHBoxLayout()
        storage_ram_box.setContentsMargins(0, 0, 0, 0)
        storage_ram_box.setSpacing(6)

        self.cb_storage = QComboBox()
        self.cb_storage.setEditable(True)
        self.cb_storage.addItems(STORAGE_OPTIONS)
        self.cb_storage.setToolTip("المساحة التخزينية للهاتف (Storage)")
        storage_ram_box.addWidget(self.cb_storage, 3)

        lbl_slash = QLabel("/")
        lbl_slash.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 14px;")
        storage_ram_box.addWidget(lbl_slash)

        self.cb_ram = QComboBox()
        self.cb_ram.setEditable(True)
        self.cb_ram.addItems(RAM_OPTIONS)
        self.cb_ram.setToolTip("حجم الذاكرة العشوائية (RAM)")
        storage_ram_box.addWidget(self.cb_ram, 2)

        specs_layout.addLayout(storage_ram_box, 2, 1)

        # Color Section (Dropdown + Quick 1-Click Color Swatches)
        specs_layout.addWidget(QLabel("اللون (Color):"), 2, 2)
        color_container = QWidget()
        color_vbox = QVBoxLayout(color_container)
        color_vbox.setContentsMargins(0, 0, 0, 0)
        color_vbox.setSpacing(4)

        self.cb_color = QComboBox()
        self.cb_color.setEditable(True)
        self.cb_color.addItems(COLOR_OPTIONS)
        self.cb_color.setPlaceholderText("اختر أو اكتب اللون...")
        color_vbox.addWidget(self.cb_color)

        # Quick Color Swatches Row
        swatch_layout = QHBoxLayout()
        swatch_layout.setContentsMargins(0, 0, 0, 0)
        swatch_layout.setSpacing(3)
        for c_name, bg_hex, text_color in POPULAR_COLORS:
            btn_c = QPushButton(c_name)
            btn_c.setFixedHeight(22)
            btn_c.setCursor(Qt.CursorShape.PointingHandCursor)
            btn_c.setStyleSheet(f"""
                QPushButton {{
                    background-color: {bg_hex};
                    color: {text_color};
                    border: 1px solid #38384A;
                    border-radius: 3px;
                    font-size: 10px;
                    font-weight: bold;
                    padding: 1px 4px;
                }}
                QPushButton:hover {{
                    border: 1px solid #D4AF37;
                }}
            """)
            btn_c.clicked.connect(lambda _, name=c_name: self.set_color_value(name))
            swatch_layout.addWidget(btn_c)
        swatch_layout.addStretch()
        color_vbox.addLayout(swatch_layout)

        specs_layout.addWidget(color_container, 2, 3)

        # Alias for backward compatibility
        self.txt_color = self.cb_color.lineEdit()

        # Serial Number
        specs_layout.addWidget(QLabel("الرقم التسلسلي (Serial):"), 3, 0)
        self.txt_serial = QLineEdit()
        specs_layout.addWidget(self.txt_serial, 3, 1)

        # IMEI 1
        specs_layout.addWidget(QLabel("رقم IMEI 1 (أساسي):"), 3, 2)
        self.txt_imei1 = QLineEdit()
        self.txt_imei1.setPlaceholderText("15 رقماً")
        specs_layout.addWidget(self.txt_imei1, 3, 3)

        # IMEI 2
        specs_layout.addWidget(QLabel("رقم IMEI 2 / eSIM:"), 4, 0)
        self.txt_imei2 = QLineEdit()
        specs_layout.addWidget(self.txt_imei2, 4, 1)

        # Battery Health & Cycles
        specs_layout.addWidget(QLabel("صحة البطارية (%):"), 4, 2)
        b_box = QHBoxLayout()
        self.sp_battery_health = QSpinBox()
        self.sp_battery_health.setRange(0, 100)
        self.sp_battery_health.setValue(100)
        b_box.addWidget(self.sp_battery_health)

        b_box.addWidget(QLabel("الدورات:"))
        self.sp_battery_cycles = QSpinBox()
        self.sp_battery_cycles.setRange(0, 5000)
        self.sp_battery_cycles.setValue(0)
        b_box.addWidget(self.sp_battery_cycles)
        specs_layout.addLayout(b_box, 4, 3)

        # Tax Status & Ownership
        specs_layout.addWidget(QLabel("الموقف الضريبي والجمركي:"), 5, 0)
        self.cb_tax_status = QComboBox()
        self.cb_tax_status.addItems(TAX_STATUSES)
        specs_layout.addWidget(self.cb_tax_status, 5, 1)

        specs_layout.addWidget(QLabel("ملكية الجهاز:"), 5, 2)
        self.cb_ownership = QComboBox()
        self.cb_ownership.addItems(OWNERSHIP_TAGS)
        specs_layout.addWidget(self.cb_ownership, 5, 3)

        layout.addWidget(specs_card)

        # ----------------------------------------------------------------------
        # Section 2: Pricing & Secret Cost Cipher (Zero-Reprint Smart Pricing)
        # ----------------------------------------------------------------------
        price_card = QFrame()
        price_card.setObjectName("card")
        price_layout = QGridLayout(price_card)
        price_layout.setHorizontalSpacing(14)
        price_layout.setVerticalSpacing(8)

        lbl_price_title = QLabel("2. منظومة التسعير وشفرة التكلفة السرية (Secret Cost Cipher)")
        lbl_price_title.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 14px;")
        price_layout.addWidget(lbl_price_title, 0, 0, 1, 4)

        # Buy Price
        price_layout.addWidget(QLabel("سعر الشراء (التكلفة):"), 1, 0)
        self.txt_buy_price = QDoubleSpinBox()
        self.txt_buy_price.setRange(0, 1000000)
        self.txt_buy_price.setSingleStep(100)
        self.txt_buy_price.valueChanged.connect(self._update_cipher_preview)
        price_layout.addWidget(self.txt_buy_price, 1, 1)

        # Prep Cost
        price_layout.addWidget(QLabel("مصاريف التجهيز / الصيانة:"), 1, 2)
        self.txt_prep_cost = QDoubleSpinBox()
        self.txt_prep_cost.setRange(0, 100000)
        self.txt_prep_cost.setSingleStep(50)
        price_layout.addWidget(self.txt_prep_cost, 1, 3)

        # Target Selling Price
        price_layout.addWidget(QLabel("سعر البيع المطلوب (Target):"), 2, 0)
        self.txt_sell_price = QDoubleSpinBox()
        self.txt_sell_price.setRange(0, 1000000)
        self.txt_sell_price.setSingleStep(100)
        price_layout.addWidget(self.txt_sell_price, 2, 1)

        # Min Allowed Price
        price_layout.addWidget(QLabel("أقل سعر مسموح للبيع (Min):"), 2, 2)
        self.txt_min_price = QDoubleSpinBox()
        self.txt_min_price.setRange(0, 1000000)
        self.txt_min_price.setSingleStep(100)
        price_layout.addWidget(self.txt_min_price, 2, 3)

        # Cipher Badge Preview
        self.lbl_cipher_title = QLabel("رمز الشفرة على الملصق:")
        price_layout.addWidget(self.lbl_cipher_title, 3, 0)

        self.lbl_cipher_val = QLabel("LHABB")
        self.lbl_cipher_val.setStyleSheet(
            "background-color: #282834; color: #D4AF37; font-weight: bold; font-size: 16px; padding: 4px 12px; border-radius: 4px;"
        )
        price_layout.addWidget(self.lbl_cipher_val, 3, 1)

        lbl_smart_note = QLabel("ℹ️ لا يتم طباعة أرقام سعر البيع على الملصق نهائياً لحماية سرية الأسعار.")
        lbl_smart_note.setStyleSheet("color: #9CA3AF; font-size: 11px;")
        price_layout.addWidget(lbl_smart_note, 3, 2, 1, 2)

        layout.addWidget(price_card)

        # ----------------------------------------------------------------------
        # Section 3: KYC Seller Verification (ID Photo) & Source
        # ----------------------------------------------------------------------
        kyc_card = QFrame()
        kyc_card.setObjectName("card")
        kyc_layout = QGridLayout(kyc_card)
        kyc_layout.setHorizontalSpacing(14)
        kyc_layout.setVerticalSpacing(8)

        lbl_kyc_title = QLabel("3. بيانات البائع وإثبات الشخصية (KYC Verification)")
        lbl_kyc_title.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 14px;")
        kyc_layout.addWidget(lbl_kyc_title, 0, 0, 1, 4)

        kyc_layout.addWidget(QLabel("اسم البائع / المصدر:"), 1, 0)
        self.txt_seller_name = QLineEdit()
        self.txt_seller_name.setPlaceholderText("اسم العميل أو التاجر المورد")
        kyc_layout.addWidget(self.txt_seller_name, 1, 1)

        kyc_layout.addWidget(QLabel("رقم هاتف البائع:"), 1, 2)
        self.txt_seller_phone = QLineEdit()
        self.txt_seller_phone.setPlaceholderText("01xxxxxxxxx")
        kyc_layout.addWidget(self.txt_seller_phone, 1, 3)

        kyc_layout.addWidget(QLabel("صورة بطاقة الرقم القومي:"), 2, 0)
        kyc_row = QHBoxLayout()
        self.btn_upload_kyc = QPushButton("📷 اختيار / رفع صورة البطاقة")
        self.btn_upload_kyc.clicked.connect(self._choose_kyc_photo)
        kyc_row.addWidget(self.btn_upload_kyc)

        self.lbl_kyc_status = QLabel("لم يتم إرفاق صورة")
        self.lbl_kyc_status.setStyleSheet("color: #9CA3AF;")
        kyc_row.addWidget(self.lbl_kyc_status)
        kyc_layout.addLayout(kyc_row, 2, 1)

        kyc_layout.addWidget(QLabel("ملاحظات إضافية:"), 2, 2)
        self.txt_remarks = QLineEdit()
        self.txt_remarks.setPlaceholderText("مثال: خربوش بسيط بالباغة / كرتونة أصلية")
        kyc_layout.addWidget(self.txt_remarks, 2, 3)

        layout.addWidget(kyc_card)

        # ----------------------------------------------------------------------
        # Action Buttons Footer
        # ----------------------------------------------------------------------
        btn_card = QFrame()
        btn_card.setObjectName("card")
        btn_layout = QHBoxLayout(btn_card)
        btn_layout.setSpacing(10)

        self.btn_clear = QPushButton("تفريغ الحقول")
        self.btn_clear.clicked.connect(self.clear_form)
        btn_layout.addWidget(self.btn_clear)

        btn_layout.addStretch()

        self.btn_print_only = QPushButton("🏷️ معاينة وطباعة الملصق (Ctrl+P)")
        self.btn_print_only.clicked.connect(self._emit_print_preview)
        btn_layout.addWidget(self.btn_print_only)

        self.btn_save_intake = QPushButton("💾 حفظ وإدخال للمخزن وطباعة فورية")
        self.btn_save_intake.setObjectName("btnPrimary")
        self.btn_save_intake.clicked.connect(self._save_device_intake)
        btn_layout.addWidget(self.btn_save_intake)

        layout.addWidget(btn_card)

        # ----------------------------------------------------------------------
        # Recent In-Stock Devices Live Table (جدول الأجهزة المتوفرة والمدخلة حديثاً)
        # ----------------------------------------------------------------------
        recent_card = QFrame()
        recent_card.setObjectName("card")
        recent_card.setStyleSheet("background-color: #16161D; border: 1px solid #282834; border-radius: 8px;")
        r_layout = QVBoxLayout(recent_card)
        r_layout.setContentsMargins(14, 12, 14, 14)
        r_layout.setSpacing(10)

        # Header with title and refresh button
        r_top = QHBoxLayout()
        lbl_r_title = QLabel("📦 الأجهزة المتوفرة بالمخزن والمدخلة حديثاً (Live In-Stock Inventory)")
        lbl_r_title.setStyleSheet("font-size: 14px; font-weight: bold; color: #D4AF37;")
        r_top.addWidget(lbl_r_title)

        r_top.addStretch()

        self.btn_refresh_intakes = QPushButton("↻ تحديث السجل")
        self.btn_refresh_intakes.setFixedHeight(28)
        self.btn_refresh_intakes.setStyleSheet("""
            QPushButton {
                background-color: #21212B;
                color: #E5E7EB;
                border: 1px solid #374151;
                border-radius: 4px;
                padding: 0 10px;
                font-size: 12px;
            }
            QPushButton:hover { background-color: #374151; }
        """)
        self.btn_refresh_intakes.clicked.connect(self.refresh_recent_intakes)
        r_top.addWidget(self.btn_refresh_intakes)

        r_layout.addLayout(r_top)

        self.table_recent = QTableWidget()
        self.table_recent.setMinimumHeight(240)
        self.table_recent.setColumnCount(10)
        self.table_recent.setHorizontalHeaderLabels([
            "الكود", "الماركة", "اسم الجهاز", "المساحة والرام", "اللون", "الحالة", "سعر الشراء (التكلفة)", "سعر البيع", "الحد الأدنى", "إجراءات"
        ])
        self.table_recent.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.table_recent.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.table_recent.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table_recent.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table_recent.setStyleSheet("""
            QTableWidget {
                background-color: #121218;
                gridline-color: #282834;
                color: #F3F4F6;
                font-size: 12px;
                border: 1px solid #282834;
                border-radius: 4px;
            }
            QHeaderView::section {
                background-color: #1A1A24;
                color: #D4AF37;
                font-weight: bold;
                padding: 6px;
                border: none;
                border-bottom: 2px solid #D4AF37;
            }
            QTableWidget::item:selected {
                background-color: #282834;
                color: #D4AF37;
            }
        """)
        r_layout.addWidget(self.table_recent)

        layout.addWidget(recent_card)

        scroll.setWidget(container)
        main_layout.addWidget(scroll)

        # Populate table at startup
        self.refresh_recent_intakes()

    def refresh_recent_intakes(self):
        """Fetches the latest in-stock devices and updates the live inventory table."""
        try:
            devices = self.db.search_devices(status="in_stock", limit=30)
            self.table_recent.setRowCount(len(devices))
            for r, d in enumerate(devices):
                st_no = d.get("stock_no", "")
                brand = d.get("brand", "")
                model = d.get("model_name", "")
                storage = f"{d.get('storage') or '-'} / {d.get('ram') or '-'}"
                color = d.get("color") or "-"
                cond = "🆕 جديد" if d.get("condition") == "New" else "✨ مستعمل"
                
                is_owner = (self.current_role == "Owner")
                if is_owner:
                    buy_p = f"{float(d.get('buy_price') or 0):,.0f} ج.م ({d.get('secret_cost_cipher') or '-'})"
                else:
                    buy_p = f"🤫 ({d.get('secret_cost_cipher') or '-'})"
                
                sell_p = f"{float(d.get('target_selling_price') or 0):,.0f} ج.م"
                min_p = f"{float(d.get('min_allowed_price') or 0):,.0f} ج.م"

                self.table_recent.setItem(r, 0, QTableWidgetItem(st_no))
                self.table_recent.setItem(r, 1, QTableWidgetItem(brand))
                self.table_recent.setItem(r, 2, QTableWidgetItem(model))
                self.table_recent.setItem(r, 3, QTableWidgetItem(storage))
                self.table_recent.setItem(r, 4, QTableWidgetItem(color))
                self.table_recent.setItem(r, 5, QTableWidgetItem(cond))
                self.table_recent.setItem(r, 6, QTableWidgetItem(buy_p))
                self.table_recent.setItem(r, 7, QTableWidgetItem(sell_p))
                self.table_recent.setItem(r, 8, QTableWidgetItem(min_p))

                # Action button: Reprint Label
                btn_reprint = QPushButton("🖨️ طباعة")
                btn_reprint.setFixedHeight(24)
                btn_reprint.setStyleSheet("""
                    QPushButton {
                        background-color: #1A1A24;
                        color: #D4AF37;
                        border: 1px solid #D4AF37;
                        border-radius: 3px;
                        font-size: 11px;
                        font-weight: bold;
                        padding: 0 8px;
                    }
                    QPushButton:hover { background-color: #D4AF37; color: #111; }
                """)
                btn_reprint.clicked.connect(lambda checked, dev_row=d: self._reprint_row_device(dev_row))
                self.table_recent.setCellWidget(r, 9, btn_reprint)
        except Exception as e:
            logger.error("Error refreshing recent intakes: %s", e)

    def _reprint_row_device(self, dev: Dict[str, Any]):
        """Emits print label request for an existing device in the table."""
        self.request_print_label.emit(dev)

    def set_color_value(self, color_name: str):
        """Sets color directly from quick swatch click."""
        self.cb_color.setCurrentText(color_name)
        if self.cb_color.lineEdit():
            self.cb_color.lineEdit().setText(color_name)

    def _on_condition_changed(self):
        is_new = self.btn_cond_new.isChecked()
        if is_new:
            self.sp_battery_health.setValue(100)
            self.sp_battery_cycles.setValue(0)
            self.sp_battery_health.setEnabled(False)
            self.sp_battery_cycles.setEnabled(False)
        else:
            self.sp_battery_health.setEnabled(True)
            self.sp_battery_cycles.setEnabled(True)

    def _update_cipher_preview(self):
        amount = self.txt_buy_price.value()
        key = self.db.get_setting("cipher_key", DEFAULT_CIPHER_KEY)
        cipher = encode_cost_cipher(amount, key)
        self.lbl_cipher_val.setText(cipher if cipher else "—")

    def _choose_kyc_photo(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self, "اختيار صورة بطاقة البائع", "", "Images (*.png *.jpg *.jpeg *.bmp)"
        )
        if file_path:
            self._kyc_photo_path = file_path
            self.lbl_kyc_status.setText(f"✓ تم إرفاق: {os.path.basename(file_path)}")
            self.lbl_kyc_status.setStyleSheet("color: #10B981; font-weight: bold;")

    def set_kyc_photo_direct(self, photo_path: str):
        if os.path.exists(photo_path):
            self._kyc_photo_path = photo_path
            self.lbl_kyc_status.setText(f"✓ تم استلام الصورة من تيليجرام: {os.path.basename(photo_path)}")
            self.lbl_kyc_status.setStyleSheet("color: #10B981; font-weight: bold;")

    def populate_from_specs(self, specs: DeviceSpecs):
        """Auto-fills fields when USB device is plugged in."""
        if specs.brand:
            idx = self.cb_brand.findText(specs.brand, Qt.MatchFlag.MatchContains)
            if idx >= 0:
                self.cb_brand.setCurrentIndex(idx)
        if specs.marketing_name:
            self.txt_model.setText(specs.marketing_name)
        if specs.storage:
            self.cb_storage.setCurrentText(specs.storage)
        if specs.ram:
            self.cb_ram.setCurrentText(specs.ram)
        if specs.color:
            target_color = specs.color.strip()
            matched_idx = -1
            for i in range(self.cb_color.count()):
                item_txt = self.cb_color.itemText(i).lower()
                if target_color.lower() in item_txt or (
                    "(" in item_txt and any(part.strip().lower() == target_color.lower() for part in item_txt.split("(")[-1].replace(")", "").split("/"))
                ):
                    matched_idx = i
                    break
            if matched_idx >= 0:
                self.cb_color.setCurrentIndex(matched_idx)
            else:
                self.cb_color.setCurrentText(target_color)
            if self.txt_color:
                self.txt_color.setText(self.cb_color.currentText() or target_color)
        if specs.serial_number:
            self.txt_serial.setText(specs.serial_number)
        if specs.imei1:
            self.txt_imei1.setText(specs.imei1)
        if specs.imei2:
            self.txt_imei2.setText(specs.imei2)
        if specs.battery_health is not None:
            self.sp_battery_health.setValue(int(specs.battery_health))
        if specs.battery_cycles is not None:
            self.sp_battery_cycles.setValue(int(specs.battery_cycles))

    def _build_device_record(self) -> DeviceRecord:
        condition = "New" if self.btn_cond_new.isChecked() else "Used"
        buy_p = self.txt_buy_price.value()
        prep_p = self.txt_prep_cost.value()
        sell_p = self.txt_sell_price.value()
        min_p = self.txt_min_price.value()

        if min_p == 0 and sell_p > 0:
            min_p = sell_p * 0.95  # default 5% max discount leeway

        key = self.db.get_setting("cipher_key", DEFAULT_CIPHER_KEY)
        cipher = encode_cost_cipher(buy_p, key)

        return DeviceRecord(
            stock_no=self.db.get_next_stock_no(),
            condition=condition,
            brand=self.cb_brand.currentText(),
            model_name=self.txt_model.text().strip(),
            storage=self.cb_storage.currentText().strip(),
            ram=self.cb_ram.currentText().strip(),
            color=self.txt_color.text().strip(),
            serial_number=self.txt_serial.text().strip(),
            imei1=self.txt_imei1.text().strip(),
            imei2=self.txt_imei2.text().strip(),
            battery_health=self.sp_battery_health.value(),
            battery_cycles=self.sp_battery_cycles.value(),
            tax_status=self.cb_tax_status.currentText(),
            ownership=self.cb_ownership.currentText(),
            buy_price=buy_p,
            prep_cost=prep_p,
            target_selling_price=sell_p,
            min_allowed_price=min_p,
            secret_cost_cipher=cipher,
            status="in_stock",
            seller_name=self.txt_seller_name.text().strip(),
            seller_phone=self.txt_seller_phone.text().strip(),
            seller_id_photo=self._kyc_photo_path,
            remarks=self.txt_remarks.text().strip()
        )

    def _save_device_intake(self):
        model = self.txt_model.text().strip()
        if not model:
            QMessageBox.warning(self, "تنبيه", "يرجى إدخال اسم الموديل أولاً!")
            self.txt_model.setFocus()
            return

        rec = self._build_device_record()
        try:
            # Auto-learn TAC-to-color mapping if IMEI1 and color are valid
            if rec.imei1 and len(rec.imei1.strip()) >= 8 and rec.color:
                try:
                    self.db.learn_tac_color(rec.imei1.strip()[:8], rec.model_name, rec.color)
                except Exception as e_tac:
                    logger.debug("Failed to auto-learn TAC color: %s", e_tac)

            dev_id = self.db.insert_device(
                device=rec,
                user_role=self.current_role,
                user_name=self.current_user
            )
            rec.id = dev_id
            QMessageBox.information(
                self, "نجاح الإدخال",
                f"✅ تم إدخال الجهاز للمخزن بنجاح!\nرقم السريال: {rec.stock_no}\nالشفرة السرية: {rec.secret_cost_cipher}"
            )
            dev_dict = rec.to_dict()
            self.device_intake_saved.emit(dev_dict)
            self.request_print_label.emit(dev_dict)
            self.clear_form()
            self.refresh_recent_intakes()
        except Exception as e:
            QMessageBox.critical(self, "خطأ", f"فشل حفظ الجهاز في قاعدة البيانات: {e}")

    def _emit_print_preview(self):
        rec = self._build_device_record()
        self.request_print_label.emit(rec.to_dict())

    def clear_form(self):
        self.txt_model.clear()
        self.txt_serial.clear()
        self.txt_imei1.clear()
        self.txt_imei2.clear()
        self.txt_color.clear()
        self.cb_storage.setCurrentIndex(0)
        self.cb_ram.setCurrentIndex(0)
        self.txt_seller_name.clear()
        self.txt_seller_phone.clear()
        self.txt_remarks.clear()
        self.txt_buy_price.setValue(0)
        self.txt_prep_cost.setValue(0)
        self.txt_sell_price.setValue(0)
        self.txt_min_price.setValue(0)
        self._kyc_photo_path = ""
        self.lbl_kyc_status.setText("لم يتم إرفاق صورة")
        self.lbl_kyc_status.setStyleSheet("color: #9CA3AF;")
        self._update_cipher_preview()
