"""
ui/device_tab.py — Mode 1: Device Specs Label (مبيعات / مخزن - 3uTools Style)
Enhanced Features:
- Direct, instant editing of device specs (Model Name, Storage, RAM, Color, Serial, IMEI, Battery, Remarks).
- Persistent Color Selection: Selection never reverts to default; learns in SQLite.
- Auto-Detect Color button to re-trigger hardware & learned color detection.
- High-visibility bilingual buttons with clear contrast and comfortable spacing.
- Synchronized live bidirectional updates with Live CAD Canvas and Printer Engine.
"""
from typing import Optional, List, Dict, Any
import uuid

from PyQt6.QtCore import pyqtSignal, Qt
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QComboBox, QPushButton, QScrollArea, QFrame,
    QTableWidget, QTableWidgetItem, QHeaderView
)
from PyQt6.QtGui import QColor, QFont

from core.models import DeviceSpecs
from core.database import DatabaseManager
from core.label_template_model import (
    PrintLabelTemplate, LabelElement, ADDABLE_FIELDS, resolve_field_value
)

COLOR_CHIPS = [
    ("Black", "أسود", "#111111", "#FFFFFF"),
    ("White", "أبيض", "#F5F5F5", "#111111"),
    ("Gold", "ذهبي", "#D4AF37", "#111111"),
    ("Silver", "فضي", "#B0B0B0", "#111111"),
    ("Blue", "أزرق", "#1E88E5", "#FFFFFF"),
    ("Green", "أخضر", "#2E7D32", "#FFFFFF"),
    ("Purple", "بنفسجي", "#7B1FA2", "#FFFFFF"),
    ("Titanium", "تيتانيوم", "#616161", "#FFFFFF"),
]


class DeviceSpecsTab(QWidget):
    """
    Mode 1: Device Specifications & Synchronized Item Editor Dock.
    Allows instant editing of device specs, persistent color selection, and CAD live sync.
    """
    specs_changed = pyqtSignal(object)           # DeviceSpecs
    element_added = pyqtSignal(object)           # LabelElement
    element_selected = pyqtSignal(str)          # element_id
    template_updated = pyqtSignal()             # Notifies template changed

    def __init__(self, db: Optional[DatabaseManager] = None, parent=None):
        super().__init__(parent)
        self.db = db
        self._current_specs: DeviceSpecs = DeviceSpecs.empty()
        self._stock_number: str = "001"
        self._template: Optional[PrintLabelTemplate] = None
        self._block_signals: bool = False
        self._user_overrides: Dict[str, str] = {}
        self._active_color_name: Optional[str] = None
        self._color_buttons: Dict[str, QPushButton] = {}

        self._init_ui()

    def _init_ui(self):
        root_layout = QVBoxLayout(self)
        root_layout.setContentsMargins(4, 4, 4, 4)
        root_layout.setSpacing(6)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(2, 2, 2, 2)
        layout.setSpacing(8)

        # -------------------------------------------------------------------
        # 1. Device Summary & Stock Number Bar
        # -------------------------------------------------------------------
        card_stock = QFrame()
        card_stock.setObjectName("PanelCard")
        stock_layout = QHBoxLayout(card_stock)
        stock_layout.setContentsMargins(8, 6, 8, 6)
        stock_layout.setSpacing(8)

        lbl_stk = QLabel("كود المخزن:")
        lbl_stk.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 12px;")
        stock_layout.addWidget(lbl_stk)

        self.edit_stock = QLineEdit(self._stock_number)
        self.edit_stock.setFixedWidth(65)
        self.edit_stock.setStyleSheet("font-weight: bold; color: #D4AF37; text-align: center; font-size: 13px;")
        self.edit_stock.textChanged.connect(self._on_stock_changed)
        stock_layout.addWidget(self.edit_stock)

        self.lbl_device_title = QLabel("جاهز للاتصال أو الإدخال اليدوي")
        self.lbl_device_title.setWordWrap(True)
        self.lbl_device_title.setStyleSheet("color: #9CA3AF; font-size: 11px; font-weight: 500;")
        stock_layout.addWidget(self.lbl_device_title, 1)

        layout.addWidget(card_stock)

        # -------------------------------------------------------------------
        # 2. Quick Direct Data Editor (تعديل بيانات الجهاز مباشرة)
        # -------------------------------------------------------------------
        card_editor = QFrame()
        card_editor.setObjectName("PanelCard")
        vbox_editor = QVBoxLayout(card_editor)
        vbox_editor.setContentsMargins(10, 8, 10, 8)
        vbox_editor.setSpacing(6)

        head_editor = QHBoxLayout()
        lbl_ed_title = QLabel("تعديل بيانات الجهاز مباشرة (تحديث فوري لليبل):")
        lbl_ed_title.setStyleSheet("color: #D4AF37; font-size: 12px; font-weight: bold;")
        head_editor.addWidget(lbl_ed_title)
        head_editor.addStretch()

        self.btn_reset_edits = QPushButton("↺ استعادة الأصل")
        self.btn_reset_edits.setToolTip("إلغاء التعديلات اليدوية واستعادة البيانات الأصلية المقروءة من الجهاز")
        self.btn_reset_edits.setFixedHeight(24)
        self.btn_reset_edits.setStyleSheet("""
            QPushButton {
                background-color: #1A1A24; color: #9CA3AF; font-size: 11px;
                border: 1px solid #333344; border-radius: 4px; padding: 2px 8px;
            }
            QPushButton:hover { background-color: #282838; color: #F4F4F6; }
        """)
        self.btn_reset_edits.clicked.connect(self._on_reset_edits_clicked)
        head_editor.addWidget(self.btn_reset_edits)
        vbox_editor.addLayout(head_editor)

        grid_inputs = QGridLayout()
        grid_inputs.setHorizontalSpacing(10)
        grid_inputs.setVerticalSpacing(6)

        # Style for input fields
        inp_style = """
            QLineEdit {
                background-color: #16161D;
                color: #FFFFFF;
                border: 1px solid #282834;
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 12px;
                font-weight: 500;
            }
            QLineEdit:focus {
                border: 1px solid #D4AF37;
                background-color: #1A1A24;
            }
        """

        # Brand Name
        lbl_brand = QLabel("الماركة (Brand):")
        lbl_brand.setStyleSheet("color: #D4AF37; font-size: 11px; font-weight: 600;")
        self.edit_brand = QLineEdit()
        self.edit_brand.setPlaceholderText("مثال: Apple / Samsung / Xiaomi")
        self.edit_brand.setStyleSheet(inp_style)
        self.edit_brand.textChanged.connect(lambda t: self._on_field_edited("brand", t))
        grid_inputs.addWidget(lbl_brand, 0, 0)
        grid_inputs.addWidget(self.edit_brand, 0, 1, 1, 3)

        # Model Name
        lbl_m = QLabel("موديل الجهاز:")
        lbl_m.setStyleSheet("color: #D4AF37; font-size: 11px; font-weight: 600;")
        self.edit_model = QLineEdit()
        self.edit_model.setPlaceholderText("مثال: Oppo Reno8 T / iPhone 11 Pro")
        self.edit_model.setStyleSheet(inp_style)
        self.edit_model.textChanged.connect(lambda t: self._on_field_edited("model_name", t))
        grid_inputs.addWidget(lbl_m, 1, 0)
        grid_inputs.addWidget(self.edit_model, 1, 1, 1, 3)

        # Storage
        lbl_s = QLabel("المساحة:")
        lbl_s.setStyleSheet("color: #D4AF37; font-size: 11px; font-weight: 600;")
        self.edit_storage = QLineEdit()
        self.edit_storage.setPlaceholderText("128GB / 256GB")
        self.edit_storage.setStyleSheet(inp_style)
        self.edit_storage.textChanged.connect(lambda t: self._on_field_edited("capacity", t))
        grid_inputs.addWidget(lbl_s, 2, 0)
        grid_inputs.addWidget(self.edit_storage, 2, 1)

        # Color
        lbl_c = QLabel("اللون:")
        lbl_c.setStyleSheet("color: #D4AF37; font-size: 11px; font-weight: 600;")
        self.edit_color = QLineEdit()
        self.edit_color.setPlaceholderText("اللون الحالي")
        self.edit_color.setStyleSheet(inp_style)
        self.edit_color.textChanged.connect(lambda t: self._on_field_edited("color", t))
        grid_inputs.addWidget(lbl_c, 2, 2)
        grid_inputs.addWidget(self.edit_color, 2, 3)

        # Battery Health %
        lbl_b = QLabel("البطارية (%):")
        lbl_b.setStyleSheet("color: #D4AF37; font-size: 11px; font-weight: 600;")
        self.edit_battery = QLineEdit()
        self.edit_battery.setPlaceholderText("98% أو 100%")
        self.edit_battery.setStyleSheet(inp_style)
        self.edit_battery.textChanged.connect(lambda t: self._on_field_edited("battery_life", t))
        grid_inputs.addWidget(lbl_b, 3, 0)
        grid_inputs.addWidget(self.edit_battery, 3, 1)

        # Serial Number
        lbl_sn = QLabel("السيريال (SN):")
        lbl_sn.setStyleSheet("color: #D4AF37; font-size: 11px; font-weight: 600;")
        self.edit_serial = QLineEdit()
        self.edit_serial.setPlaceholderText("الرقم التسلسلي")
        self.edit_serial.setStyleSheet(inp_style)
        self.edit_serial.textChanged.connect(lambda t: self._on_field_edited("serial_number", t))
        grid_inputs.addWidget(lbl_sn, 3, 2)
        grid_inputs.addWidget(self.edit_serial, 3, 3)

        # IMEI 1
        lbl_i1 = QLabel("رقم IMEI 1:")
        lbl_i1.setStyleSheet("color: #D4AF37; font-size: 11px; font-weight: 600;")
        self.edit_imei1 = QLineEdit()
        self.edit_imei1.setPlaceholderText("رقم IMEI الرئيسي (15 رقم)")
        self.edit_imei1.setStyleSheet(inp_style)
        self.edit_imei1.textChanged.connect(lambda t: self._on_field_edited("imei", t))
        grid_inputs.addWidget(lbl_i1, 4, 0)
        grid_inputs.addWidget(self.edit_imei1, 4, 1, 1, 3)

        # IMEI 2
        lbl_i2 = QLabel("رقم IMEI 2:")
        lbl_i2.setStyleSheet("color: #D4AF37; font-size: 11px; font-weight: 600;")
        self.edit_imei2 = QLineEdit()
        self.edit_imei2.setPlaceholderText("رقم IMEI الثاني (اختياري)")
        self.edit_imei2.setStyleSheet(inp_style)
        self.edit_imei2.textChanged.connect(lambda t: self._on_field_edited("imei2", t))
        grid_inputs.addWidget(lbl_i2, 5, 0)
        grid_inputs.addWidget(self.edit_imei2, 5, 1, 1, 3)

        # Remarks
        lbl_r = QLabel("ملاحظات / الحالة:")
        lbl_r.setStyleSheet("color: #D4AF37; font-size: 11px; font-weight: 600;")
        self.edit_remarks = QLineEdit()
        self.edit_remarks.setPlaceholderText("مثال: جديد كرتونة / كسر زيرو / بدون خدوش")
        self.edit_remarks.setStyleSheet(inp_style)
        self.edit_remarks.textChanged.connect(lambda t: self._on_field_edited("remarks", t))
        grid_inputs.addWidget(lbl_r, 6, 0)
        grid_inputs.addWidget(self.edit_remarks, 6, 1, 1, 3)

        vbox_editor.addLayout(grid_inputs)
        layout.addWidget(card_editor)

        # -------------------------------------------------------------------
        # 3. 1-Click Visual Color Swatch Bar (8 buttons + Auto Detect)
        # -------------------------------------------------------------------
        card_color = QFrame()
        card_color.setObjectName("PanelCard")
        vbox_color = QVBoxLayout(card_color)
        vbox_color.setContentsMargins(10, 8, 10, 8)
        vbox_color.setSpacing(6)

        color_head = QHBoxLayout()
        lbl_col = QLabel("اختيار لون الجهاز بضغطة واحدة (تثبيت دائم وحفظ تلقائي):")
        lbl_col.setStyleSheet("color: #D4AF37; font-size: 12px; font-weight: bold;")
        color_head.addWidget(lbl_col)
        color_head.addStretch()

        self.lbl_active_color = QLabel("اللون المختار: تلقائي")
        self.lbl_active_color.setStyleSheet("color: #10B981; font-size: 11px; font-weight: bold;")
        color_head.addWidget(self.lbl_active_color)

        self.btn_auto_color = QPushButton("🎯 تحديد تلقائي")
        self.btn_auto_color.setToolTip("إعادة تفعيل التحديد التلقائي للون من عتاد الهاتف وقاعدة البيانات")
        self.btn_auto_color.setFixedHeight(24)
        self.btn_auto_color.setStyleSheet("""
            QPushButton {
                background-color: #1E1E2E; color: #D4AF37; font-size: 11px;
                border: 1px solid #D4AF37; border-radius: 4px; padding: 2px 8px; font-weight: bold;
            }
            QPushButton:hover { background-color: #D4AF37; color: #0D0D11; }
        """)
        self.btn_auto_color.clicked.connect(self._on_auto_color_clicked)
        color_head.addWidget(self.btn_auto_color)
        vbox_color.addLayout(color_head)

        # 4 Rows of 2 spacious color buttons (Obsidian & Metallic luxury chips)
        grid_colors = QGridLayout()
        grid_colors.setSpacing(6)
        r, c = 0, 0
        for en_name, ar_name, bg_hex, fg_hex in COLOR_CHIPS:
            btn = QPushButton(f"{ar_name} ({en_name})")
            btn.setToolTip(f"تحديد لون {ar_name} وتثبيته على الليبل")
            btn.setFixedHeight(28)
            btn.setStyleSheet(f"""
                QPushButton {{
                    background-color: {bg_hex};
                    color: {fg_hex};
                    border: 1px solid #444455;
                    border-radius: 5px;
                    font-size: 11px;
                    font-weight: bold;
                    padding: 2px 6px;
                }}
                QPushButton:hover {{
                    border: 2px solid #D4AF37;
                }}
            """)
            btn.clicked.connect(lambda ch, c_name=en_name, b_hex=bg_hex, f_hex=fg_hex: self._on_color_chip_clicked(c_name))
            self._color_buttons[en_name] = btn
            grid_colors.addWidget(btn, r, c)
            c += 1
            if c >= 2:
                c = 0
                r += 1

        vbox_color.addLayout(grid_colors)
        layout.addWidget(card_color)

        # -------------------------------------------------------------------
        # 4. Addable Options Chip Grid (العناصر المضافة على الليبل)
        # -------------------------------------------------------------------
        card_chips = QFrame()
        card_chips.setObjectName("PanelCard")
        vbox_chips = QVBoxLayout(card_chips)
        vbox_chips.setContentsMargins(10, 8, 10, 8)
        vbox_chips.setSpacing(6)

        chips_head = QHBoxLayout()
        lbl_addable = QLabel("إضافة عناصر وتخصيص الليبل (اضغط للإضافة):")
        lbl_addable.setStyleSheet("color: #D4AF37; font-size: 12px; font-weight: bold;")
        chips_head.addWidget(lbl_addable)
        chips_head.addStretch()

        self.btn_add_qr = QPushButton("➕ كود QR")
        self.btn_add_qr.setObjectName("GoldBtn")
        self.btn_add_qr.setFixedHeight(26)
        self.btn_add_qr.setStyleSheet("""
            QPushButton {
                background-color: #D4AF37; color: #0D0D11; font-weight: bold;
                font-size: 11px; border-radius: 4px; padding: 2px 8px;
            }
            QPushButton:hover { background-color: #E5C158; }
        """)
        self.btn_add_qr.clicked.connect(self._on_add_qr_clicked)
        chips_head.addWidget(self.btn_add_qr)
        vbox_chips.addLayout(chips_head)

        grid_chips = QGridLayout()
        grid_chips.setSpacing(5)
        row, col = 0, 0
        max_cols = 2

        # Arabic/English mapping for legible chips
        ADDABLE_LABELS_AR = {
            "number": "+ كود المخزن (Stock #)",
            "model_name": "+ اسم الموديل (Model)",
            "color": "+ لون الجهاز (Color)",
            "capacity": "+ المساحة (Storage)",
            "serial_number": "+ السيريال (Serial #)",
            "ios_version": "+ إصدار النظام (OS)",
            "imei": "+ رقم IMEI 1",
            "imei2": "+ رقم IMEI 2",
            "ecid": "+ معرف المعالج (ECID)",
            "network_lock": "+ قفل الشبكة (Lock)",
            "model_number": "+ رقم الطراز (Model Code)",
            "sales_region": "+ المنطقة (Region)",
            "warranty_status": "+ الضمان (Warranty)",
            "regulatory_model": "+ الموديل القياسي",
            "charge_cycles": "+ دورات الشحن (Cycles)",
            "battery_life": "+ صحة البطارية (%)",
            "remarks": "+ ملاحظات (Remarks)",
            "model_capacity_color": "+ موديل + مساحة + لون",
            "date": "+ التاريخ الحالي",
            "name": "+ اسم المحل",
            "phone": "+ رقم الهاتف",
        }

        for field_key, title in ADDABLE_FIELDS:
            btn_title = ADDABLE_LABELS_AR.get(field_key, f"+ {title}")
            btn_chip = QPushButton(btn_title)
            btn_chip.setObjectName("ChipButton")
            btn_chip.setFixedHeight(26)
            btn_chip.setStyleSheet("""
                QPushButton {
                    background-color: #1A1A24;
                    color: #E0E0E6;
                    border: 1px solid #282834;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 500;
                    padding: 2px 6px;
                }
                QPushButton:hover {
                    border: 1px solid #D4AF37;
                    color: #D4AF37;
                    background-color: #222230;
                }
            """)
            btn_chip.clicked.connect(lambda ch, fk=field_key, t=title: self._on_add_field_clicked(fk, t))
            grid_chips.addWidget(btn_chip, row, col)
            col += 1
            if col >= max_cols:
                col = 0
                row += 1
        vbox_chips.addLayout(grid_chips)
        layout.addWidget(card_chips)

        # -------------------------------------------------------------------
        # 5. Synchronized Item Editor Table
        # -------------------------------------------------------------------
        lbl_tbl = QLabel("جدول عناصر الليبل (متزامن حياً مع المعاينة والطباعة):")
        lbl_tbl.setStyleSheet("color: #D4AF37; font-size: 12px; font-weight: bold; margin-top: 4px;")
        layout.addWidget(lbl_tbl)

        self.table = QTableWidget()
        self.table.setColumnCount(3)
        self.table.setHorizontalHeaderLabels(["الحقل (Field)", "المحتوى (Value)", "التحكم (Actions)"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Interactive)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        self.table.setColumnWidth(0, 95)
        self.table.setColumnWidth(2, 175)
        self.table.setMinimumHeight(240)
        self.table.setStyleSheet("""
            QTableWidget {
                background-color: #16161D;
                color: #FFFFFF;
                border: 1px solid #282834;
                gridline-color: #22222E;
                font-size: 12px;
            }
            QHeaderView::section {
                background-color: #121218;
                color: #D4AF37;
                font-weight: bold;
                font-size: 11px;
                padding: 4px;
                border: 1px solid #282834;
            }
        """)
        self.table.itemChanged.connect(self._on_table_item_changed)
        self.table.itemSelectionChanged.connect(self._on_table_selection_changed)
        layout.addWidget(self.table)

        scroll.setWidget(container)
        root_layout.addWidget(scroll)

    # -------------------------------------------------------------------
    # Binding & Data Handlers
    # -------------------------------------------------------------------

    def set_template(self, template: PrintLabelTemplate):
        self._template = template
        self.refresh_table()

    def set_specs(self, specs: Optional[DeviceSpecs]):
        """
        Receives new or updated device specs from detector.
        Preserves user manual modifications so they are never overwritten.
        """
        incoming = specs or DeviceSpecs.empty()
        
        # Check if same device is connected or if user has active overrides
        is_same_device = bool(
            self._current_specs.device_id
            and incoming.device_id
            and self._current_specs.device_id == incoming.device_id
        )

        if is_same_device:
            # Preserve user overrides for the same phone
            for field, val in self._user_overrides.items():
                self._apply_override_to_specs(incoming, field, val)
        else:
            # New device connected: clear previous overrides
            self._user_overrides.clear()
            self._active_color_name = None

            # Automatic Color Determination:
            # If incoming color is missing or default, try auto-learning lookup in DB
            if incoming.color in (None, "", "Default", "Unknown", "Standard"):
                detected_color = self._determine_auto_color(incoming)
                if detected_color:
                    incoming.color = detected_color

        self._current_specs = incoming
        self._sync_inputs_from_specs()
        self.refresh_table()

    def _determine_auto_color(self, specs: DeviceSpecs) -> Optional[str]:
        """Automatically resolves color from SQLite TAC learning or properties."""
        if not self.db:
            return None
        tac = None
        if specs.imei1:
            digits = "".join(filter(str.isdigit, specs.imei1))
            if len(digits) >= 8:
                tac = digits[:8]
        model = specs.marketing_name or specs.model_code or ""
        
        try:
            if tac and model:
                learned = self.db.lookup_tac_color(tac, model)
                if learned:
                    return learned
            if tac:
                with self.db._lock:
                    conn = self.db._get_connection()
                    cur = conn.cursor()
                    cur.execute("SELECT color FROM tac_color_map WHERE tac = ? LIMIT 1;", (tac,))
                    row = cur.fetchone()
                    if row and row["color"]:
                        return row["color"]
        except Exception:
            pass
        return None

    def _sync_inputs_from_specs(self):
        """Populates quick edit inputs from current specs without triggering edit loops."""
        self._block_signals = True
        try:
            # Title
            if self._current_specs and self._current_specs.marketing_name:
                if self._current_specs.connection_type == "unauthorized":
                    self.lbl_device_title.setText(f"⚠️ {self._current_specs.brand} {self._current_specs.marketing_name} - (اضغط 'سماح دائماً' على شاشة الهاتف)")
                    self.lbl_device_title.setStyleSheet("color: #F59E0B; font-size: 11px; font-weight: bold;")
                elif self._current_specs.connection_type == "mtp":
                    self.lbl_device_title.setText(f"ℹ️ {self._current_specs.brand} {self._current_specs.marketing_name} - [وضع MTP]")
                    self.lbl_device_title.setStyleSheet("color: #38BDF8; font-size: 11px; font-weight: bold;")
                else:
                    self.lbl_device_title.setText(f"🟢 {self._current_specs.brand} {self._current_specs.marketing_name} | {self._current_specs.storage}")
                    self.lbl_device_title.setStyleSheet("color: #10B981; font-size: 12px; font-weight: bold;")
            else:
                self.lbl_device_title.setText("جاهز للاتصال أو الإدخال اليدوي")
                self.lbl_device_title.setStyleSheet("color: #9CA3AF; font-size: 12px; font-weight: 600;")

            # Form fields
            self.edit_brand.setText(self._current_specs.brand or "")
            self.edit_model.setText(self._current_specs.marketing_name or "")
            self.edit_storage.setText(self._current_specs.storage or "")
            self.edit_color.setText(self._current_specs.color or "")
            
            # Battery Health %
            b_val = ""
            if self._current_specs and self._current_specs.battery_health is not None:
                b_val = str(self._current_specs.battery_health)
            self.edit_battery.setText(b_val)
            if self._current_specs and getattr(self._current_specs, "is_apple", False):
                self.edit_battery.setPlaceholderText("98% أو 100%")
            elif self._current_specs and self._current_specs.marketing_name:
                self.edit_battery.setPlaceholderText("خاص بالآيفون فقط")
            else:
                self.edit_battery.setPlaceholderText("98% أو 100%")

            self.edit_serial.setText(self._current_specs.serial_number or "")
            self.edit_imei1.setText(self._current_specs.imei1 or "")
            self.edit_imei2.setText(self._current_specs.imei2 or "")
            self.edit_remarks.setText(self._current_specs.remarks or "")

            color_name = self._current_specs.color or "تلقائي"
            self.lbl_active_color.setText(f"اللون المختار: {color_name}")
            self._highlight_color_button(color_name)
        finally:
            self._block_signals = False

    def get_specs(self) -> DeviceSpecs:
        """Returns the current synchronized DeviceSpecs instance."""
        return self._current_specs

    def _highlight_color_button(self, active_color: str):
        """Visually marks the currently selected color button with gold border and checkmark."""
        for en_name, ar_name, bg_hex, fg_hex in COLOR_CHIPS:
            btn = self._color_buttons.get(en_name)
            if not btn:
                continue
            is_active = (en_name.lower() == (active_color or "").lower()) or (ar_name == active_color)
            if is_active:
                btn.setText(f"✓ {ar_name} ({en_name})")
                btn.setStyleSheet(f"""
                    QPushButton {{
                        background-color: {bg_hex};
                        color: {fg_hex};
                        border: 2px solid #D4AF37;
                        border-radius: 6px;
                        font-size: 11px;
                        font-weight: bold;
                        padding: 2px 8px;
                    }}
                """)
            else:
                btn.setText(f"{ar_name} ({en_name})")
                btn.setStyleSheet(f"""
                    QPushButton {{
                        background-color: {bg_hex};
                        color: {fg_hex};
                        border: 1px solid #444455;
                        border-radius: 6px;
                        font-size: 11px;
                        font-weight: 500;
                        padding: 2px 8px;
                    }}
                    QPushButton:hover {{
                        border: 2px solid #D4AF37;
                    }}
                """)

    def _on_field_edited(self, field_key: str, text: str):
        """Handles manual user edits in quick edit boxes."""
        if self._block_signals:
            return
        val = text.strip()
        self._user_overrides[field_key] = val
        self._apply_override_to_specs(self._current_specs, field_key, val)

        if field_key == "color":
            self.lbl_active_color.setText(f"اللون المختار: {val or 'تلقائي'}")
            self._highlight_color_button(val)
            # TAC learning if available
            self._save_tac_learning(val)

        self.specs_changed.emit(self._current_specs)
        self.refresh_table()
        self.template_updated.emit()

    def _apply_override_to_specs(self, specs: DeviceSpecs, field_key: str, val: str):
        """Applies an override value to a DeviceSpecs instance."""
        if not specs.raw_properties:
            specs.raw_properties = {}
        specs.raw_properties[field_key] = val

        if field_key == "brand":
            specs.brand = val
        elif field_key == "model_name":
            specs.marketing_name = val
        elif field_key == "capacity":
            specs.storage = val
        elif field_key == "color":
            specs.color = val
        elif field_key == "serial_number":
            specs.serial_number = val
        elif field_key == "imei":
            specs.imei1 = val
        elif field_key == "imei2":
            specs.imei2 = val
        elif field_key == "battery_life":
            clean_pct = val.replace("%", "").strip()
            specs.battery_health = int(clean_pct) if clean_pct.isdigit() else None
        elif field_key == "charge_cycles":
            specs.battery_cycles = int(val) if val.isdigit() else None
        elif field_key == "remarks":
            specs.remarks = val
        elif field_key == "sales_region":
            specs.sales_region = val

    def _on_reset_edits_clicked(self):
        """Clears user overrides and reloads original specs from connected device."""
        self._user_overrides.clear()
        self._active_color_name = None
        self._sync_inputs_from_specs()
        self.specs_changed.emit(self._current_specs)
        self.refresh_table()
        self.template_updated.emit()

    def _on_auto_color_clicked(self):
        """Re-triggers automatic color determination for the current device."""
        if "color" in self._user_overrides:
            del self._user_overrides["color"]
        detected = self._determine_auto_color(self._current_specs)
        self._current_specs.color = detected or "Standard"
        self._sync_inputs_from_specs()
        self.specs_changed.emit(self._current_specs)
        self.refresh_table()
        self.template_updated.emit()

    def _save_tac_learning(self, color_name: str):
        """Stores learned TAC + Model -> Color in SQLite."""
        if self.db and self._current_specs.imei1 and color_name:
            digits = "".join(filter(str.isdigit, self._current_specs.imei1))
            if len(digits) >= 8:
                tac = digits[:8]
                model = self._current_specs.marketing_name or self._current_specs.model_code or ""
                try:
                    self.db.learn_tac_color(tac, model, color_name)
                except Exception:
                    pass

    def _on_color_chip_clicked(self, color_name: str):
        """User clicked a visual color button: sets color permanently."""
        self._active_color_name = color_name
        self._user_overrides["color"] = color_name
        self._current_specs.color = color_name
        self.edit_color.setText(color_name)
        self.lbl_active_color.setText(f"اللون المختار: {color_name}")
        self._highlight_color_button(color_name)
        self._save_tac_learning(color_name)

        self.specs_changed.emit(self._current_specs)
        self.refresh_table()
        self.template_updated.emit()

    def set_stock_number(self, stock_no: str):
        self._stock_number = stock_no
        self.edit_stock.setText(stock_no)

    def get_stock_number(self) -> str:
        return self._stock_number or "001"

    def _on_stock_changed(self, text: str):
        self._stock_number = text.strip() or "001"
        self.refresh_table()
        self.template_updated.emit()

    def _on_add_field_clicked(self, field_key: str, title: str):
        if not self._template:
            return
        last_y = 2.0
        if self._template.elements:
            last_el = self._template.elements[-1]
            last_y = (last_el.y_mm or 2.0) + (7.5 if last_el.is_barcode else 4.0)

        is_bc = field_key in ("serial_number", "imei")

        new_el = LabelElement(
            id=f"el_{field_key}_{uuid.uuid4().hex[:4]}",
            field_key=field_key,
            title=title,
            content=title,
            show_title=not is_bc,
            is_barcode=is_bc,
            font_family="Segoe UI",
            font_size=8,
            align="left",
            x_mm=2.0,
            y_mm=round(last_y, 1)
        )
        self._template.elements.append(new_el)
        self.refresh_table()
        self.element_added.emit(new_el)
        self.element_selected.emit(new_el.id)
        self.template_updated.emit()

    def _on_add_qr_clicked(self):
        if not self._template:
            return
        last_y = 2.0
        if self._template.elements:
            last_el = self._template.elements[-1]
            last_y = (last_el.y_mm or 2.0) + (7.5 if last_el.is_barcode else 4.0)

        new_el = LabelElement(
            id=f"el_qr_{uuid.uuid4().hex[:4]}",
            field_key="qr_code",
            title="QR Code",
            content="https://prolab.app",
            show_title=False,
            is_barcode=False,
            is_qr=True,
            font_family="Segoe UI",
            font_size=8,
            align="center",
            x_mm=2.0,
            y_mm=round(last_y, 1),
            width_mm=12.0,
            height_mm=12.0
        )
        self._template.elements.append(new_el)
        self.refresh_table()
        self.element_added.emit(new_el)
        self.element_selected.emit(new_el.id)
        self.template_updated.emit()

    # -------------------------------------------------------------------
    # Table Population & Per-Row Function Area
    # -------------------------------------------------------------------

    def refresh_table(self):
        if not self._template:
            self.table.setRowCount(0)
            return

        self._block_signals = True
        self.table.setRowCount(0)

        for idx, el in enumerate(self._template.elements):
            # Battery life is exclusive to Apple/iPhone devices
            if el.field_key == "battery_life":
                if self._current_specs and self._current_specs.marketing_name:
                    if not getattr(self._current_specs, "is_apple", False):
                        continue

            row_idx = self.table.rowCount()
            self.table.insertRow(row_idx)
            self.table.setRowHeight(row_idx, 34)

            # Column 0: Title (Editable)
            item_title = QTableWidgetItem(el.title)
            item_title.setData(Qt.ItemDataRole.UserRole, el.id)
            self.table.setItem(row_idx, 0, item_title)

            # Column 1: Content (Editable / Resolved)
            val = resolve_field_value(el.field_key, self._current_specs, self.get_stock_number())
            item_content = QTableWidgetItem(val)
            item_content.setData(Qt.ItemDataRole.UserRole, el.id)
            self.table.setItem(row_idx, 1, item_content)

            # Column 2: Function Area
            fn_widget = QWidget()
            fn_layout = QHBoxLayout(fn_widget)
            fn_layout.setContentsMargins(4, 2, 4, 2)
            fn_layout.setSpacing(4)

            # 1. Show / Hide Title Toggle Button
            btn_title = QPushButton("إظهار" if el.show_title else "إخفاء")
            btn_title.setToolTip("إظهار أو إخفاء عنوان الحقل على الليبل")
            btn_title.setFixedSize(48, 24)
            btn_title.setStyleSheet("""
                QPushButton { background-color: #1A1A24; color: #D4AF37; font-size: 11px; font-weight: bold; border-radius: 3px; }
                QPushButton:hover { background-color: #282838; }
            """)
            btn_title.clicked.connect(lambda ch, e=el: self._toggle_show_title(e))
            fn_layout.addWidget(btn_title)

            # 2. Display Style Dropdown
            combo_style = QComboBox()
            combo_style.setFixedHeight(24)
            combo_style.setStyleSheet("font-size: 11px;")
            combo_style.addItem("نص فقط", "text")
            combo_style.addItem("باركود فقط", "barcode")
            combo_style.addItem("نص + باركود", "both")
            combo_style.addItem("كود QR", "qr")

            if el.is_qr:
                combo_style.setCurrentIndex(3)
            elif el.is_barcode and el.show_title:
                combo_style.setCurrentIndex(2)
            elif el.is_barcode:
                combo_style.setCurrentIndex(1)
            else:
                combo_style.setCurrentIndex(0)

            combo_style.currentIndexChanged.connect(
                lambda idx_c, e=el, cb=combo_style: self._on_display_style_changed(e, cb.currentData())
            )
            fn_layout.addWidget(combo_style)

            # 3. Move Up
            btn_up = QPushButton("▲")
            btn_up.setToolTip("تحريك العنصر لأعلى")
            btn_up.setFixedSize(24, 24)
            btn_up.setStyleSheet("padding: 0; font-size: 10px; color: #D4AF37; background-color: #1A1A24; border-radius: 3px;")
            btn_up.clicked.connect(lambda ch, i=idx: self._move_item_up(i))
            fn_layout.addWidget(btn_up)

            # 4. Move Down
            btn_down = QPushButton("▼")
            btn_down.setToolTip("تحريك العنصر لأسفل")
            btn_down.setFixedSize(24, 24)
            btn_down.setStyleSheet("padding: 0; font-size: 10px; color: #D4AF37; background-color: #1A1A24; border-radius: 3px;")
            btn_down.clicked.connect(lambda ch, i=idx: self._move_item_down(i))
            fn_layout.addWidget(btn_down)

            # 5. Delete Item Button
            btn_del = QPushButton("🗑")
            btn_del.setToolTip("حذف هذا الحقل من الليبل")
            btn_del.setFixedSize(24, 24)
            btn_del.setStyleSheet("padding: 0; font-size: 12px; color: #EF4444; background-color: #1A1A24; border-radius: 3px;")
            btn_del.clicked.connect(lambda ch, i=idx: self._delete_item(i))
            fn_layout.addWidget(btn_del)

            self.table.setCellWidget(idx, 2, fn_widget)

        self._block_signals = False

    def _toggle_show_title(self, el: LabelElement):
        el.show_title = not el.show_title
        self.refresh_table()
        self.template_updated.emit()

    def _on_display_style_changed(self, el: LabelElement, mode: str):
        if mode == "barcode":
            el.is_barcode = True
            el.is_qr = False
        elif mode == "qr":
            el.is_barcode = False
            el.is_qr = True
        elif mode == "both":
            el.is_barcode = True
            el.is_qr = False
            el.show_title = True
        else:
            el.is_barcode = False
            el.is_qr = False
        self.template_updated.emit()

    def _move_item_up(self, idx: int):
        if idx > 0 and self._template:
            elems = self._template.elements
            elems[idx - 1], elems[idx] = elems[idx], elems[idx - 1]
            elems[idx - 1].y_mm, elems[idx].y_mm = elems[idx].y_mm, elems[idx - 1].y_mm
            self.refresh_table()
            self.table.selectRow(idx - 1)
            self.template_updated.emit()

    def _move_item_down(self, idx: int):
        if self._template and idx < len(self._template.elements) - 1:
            elems = self._template.elements
            elems[idx], elems[idx + 1] = elems[idx + 1], elems[idx]
            elems[idx].y_mm, elems[idx + 1].y_mm = elems[idx + 1].y_mm, elems[idx].y_mm
            self.refresh_table()
            self.table.selectRow(idx + 1)
            self.template_updated.emit()

    def _delete_item(self, idx: int):
        if self._template and 0 <= idx < len(self._template.elements):
            del self._template.elements[idx]
            self.refresh_table()
            self.template_updated.emit()

    def _on_table_item_changed(self, item: QTableWidgetItem):
        if self._block_signals or not self._template:
            return
        row = item.row()
        col = item.column()
        if 0 <= row < len(self._template.elements):
            el = self._template.elements[row]
            val = item.text().strip()
            if col == 0:
                el.title = val
            elif col == 1:
                el.content = val
                # Sync table content edit back to current specs and user overrides
                self._user_overrides[el.field_key] = val
                self._apply_override_to_specs(self._current_specs, el.field_key, val)
                self._sync_inputs_from_specs()
                self.specs_changed.emit(self._current_specs)

            self.template_updated.emit()

    def _on_table_selection_changed(self):
        row = self.table.currentRow()
        if self._template and 0 <= row < len(self._template.elements):
            el = self._template.elements[row]
            self.element_selected.emit(el.id)

    def select_row_by_id(self, element_id: str):
        if not self._template:
            return
        self._block_signals = True
        for row, el in enumerate(self._template.elements):
            if el.id == element_id:
                self.table.selectRow(row)
                break
        self._block_signals = False
