"""
ui/inventory_tab.py — Full Warehouse & Stock Management Tab (إدارة المخزن الشاملة)
Features:
- Live Inventory Statistics (Total In-Stock, Capital Investment, Expected Value, Expected Profit)
- Multi-Field Live Search & Filter Bar (Brand, Condition, Status, Keyword)
- Full Stock Table with Role-Based Price Masking, Secret Cost Cipher, and Battery Health
- Direct 1-Click Action Buttons per row: Print Label, Quick Reprice, POS Checkout
- Export Full Inventory PDF Report
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QPushButton, QFrame, QTableWidget, QTableWidgetItem,
    QHeaderView, QComboBox, QMessageBox, QAbstractItemView, QDialog
)
from PyQt6.QtGui import QColor

from core.database import DatabaseManager
from core.models import DeviceSpecs

logger = logging.getLogger(__name__)


class QuickPriceEditDialog(QDialog):
    """Fast modal dialog to update target and minimum selling price for a device."""
    prices_updated = pyqtSignal()

    def __init__(self, db: DatabaseManager, device_dict: dict, user_role: str = "Owner", parent=None):
        super().__init__(parent)
        self.db = db
        self.dev = device_dict
        self.user_role = user_role
        self.setWindowTitle(f"💰 تعديل أسعار: {device_dict.get('brand')} {device_dict.get('model_name')}")
        self.setFixedSize(420, 320)
        self.setStyleSheet("""
            QDialog { background-color: #0E0E14; color: #fff; font-family: 'Segoe UI', sans-serif; }
            QLabel { font-size: 12px; font-weight: bold; color: #D4AF37; }
            QLineEdit {
                background-color: #161622;
                border: 1px solid #28283C;
                border-radius: 5px;
                color: #FFFFFF;
                padding: 6px;
                font-size: 13px;
                font-weight: bold;
            }
            QLineEdit:focus { border: 1px solid #D4AF37; }
        """)
        self._init_ui()

    def _init_ui(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(18, 18, 18, 18)
        lay.setSpacing(12)

        lbl_title = QLabel(f"📱 {self.dev.get('brand')} {self.dev.get('model_name')} ({self.dev.get('color') or '-'})")
        lbl_title.setStyleSheet("font-size: 14px; font-weight: 800; color: #FFFFFF;")
        lay.addWidget(lbl_title)

        grid = QGridLayout()
        grid.setSpacing(10)

        grid.addWidget(QLabel("سعر الشراء (التكلفة):"), 0, 0)
        lbl_cost = QLabel(f"{float(self.dev.get('buy_price') or 0):,.0f} ج.م (شفرة: {self.dev.get('secret_cost_cipher') or '-'})")
        lbl_cost.setStyleSheet("color: #F59E0B; font-size: 13px;")
        grid.addWidget(lbl_cost, 0, 1)

        grid.addWidget(QLabel("سعر البيع المطلوب (ج.م):"), 1, 0)
        self.txt_sell = QLineEdit(str(int(float(self.dev.get('target_selling_price') or 0))))
        grid.addWidget(self.txt_sell, 1, 1)

        grid.addWidget(QLabel("الحد الأدنى للبيع (ج.م):"), 2, 0)
        self.txt_min = QLineEdit(str(int(float(self.dev.get('min_allowed_price') or 0))))
        grid.addWidget(self.txt_min, 2, 1)

        lay.addLayout(grid)

        btn_row = QHBoxLayout()
        btn_cancel = QPushButton("إلغاء")
        btn_cancel.clicked.connect(self.reject)
        btn_row.addWidget(btn_cancel)

        btn_row.addStretch()

        btn_save = QPushButton("💾 حفظ الأسعار الجديدة")
        btn_save.setFixedHeight(34)
        btn_save.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #D4AF37, stop:1 #E5C158);
                color: #0D0D11;
                border: none;
                border-radius: 5px;
                font-weight: bold;
                font-size: 12px;
                padding: 0 16px;
            }
            QPushButton:hover { background: #F5D77F; }
        """)
        btn_save.clicked.connect(self._save)
        btn_row.addWidget(btn_save)

        lay.addLayout(btn_row)

    def _save(self):
        try:
            target_p = float(self.txt_sell.text().strip())
            min_p = float(self.txt_min.text().strip())
            if target_p < min_p:
                QMessageBox.warning(self, "تنبيه", "سعر البيع لا يمكن أن يكون أقل من الحد الأدنى للبيع!")
                return

            self.db.update_device_prices(
                device_id=self.dev["id"],
                target_price=target_p,
                min_price=min_p,
                user_role=self.user_role,
                user_name="DesktopUser"
            )
            self.prices_updated.emit()
            self.accept()
        except ValueError:
            QMessageBox.warning(self, "خطأ", "يرجى إدخال أرقام صحيحة للأسعار!")


class InventoryTab(QWidget):
    """Full-featured warehouse and stock management module."""
    request_print_label = pyqtSignal(dict)
    checkout_device = pyqtSignal(dict)

    def __init__(self, db: DatabaseManager, current_role: str = "Owner", current_user: str = "Admin", parent=None):
        super().__init__(parent)
        self.db = db
        self.current_role = current_role
        self.current_user = current_user

        self._init_ui()
        self.refresh_inventory()

    def set_user_role(self, role: str, user_name: str):
        self.current_role = role
        self.current_user = user_name
        self.refresh_inventory()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(10)

        # 1. Header Title & KPI Stat Cards
        kpi_frame = QFrame()
        kpi_frame.setStyleSheet("""
            background-color: #121218;
            border: 1px solid #232332;
            border-radius: 8px;
            padding: 8px;
        """)
        k_layout = QHBoxLayout(kpi_frame)
        k_layout.setContentsMargins(8, 4, 8, 4)
        k_layout.setSpacing(12)

        # KPI 1: In-Stock Count
        self.lbl_kpi_count = QLabel("0 جهاز")
        self.lbl_kpi_count.setStyleSheet("font-size: 16px; font-weight: 800; color: #38BDF8;")
        k_layout.addWidget(self._make_kpi_box("📦 أجهزة المخزن", self.lbl_kpi_count))

        # KPI 2: Total Cost / Capital
        self.lbl_kpi_capital = QLabel("0 ج.م")
        self.lbl_kpi_capital.setStyleSheet("font-size: 16px; font-weight: 800; color: #F59E0B;")
        self.box_capital = self._make_kpi_box("💵 رأس المال المجمد", self.lbl_kpi_capital)
        k_layout.addWidget(self.box_capital)

        # KPI 3: Total Expected Sales
        self.lbl_kpi_sales_val = QLabel("0 ج.م")
        self.lbl_kpi_sales_val.setStyleSheet("font-size: 16px; font-weight: 800; color: #D4AF37;")
        k_layout.addWidget(self._make_kpi_box("💰 إجمالي قيمة البيع", self.lbl_kpi_sales_val))

        # KPI 4: Total Expected Profit
        self.lbl_kpi_profit = QLabel("0 ج.م")
        self.lbl_kpi_profit.setStyleSheet("font-size: 16px; font-weight: 800; color: #10B981;")
        self.box_profit = self._make_kpi_box("📈 الأرباح الصافية المتوقعة", self.lbl_kpi_profit)
        k_layout.addWidget(self.box_profit)

        # KPI 5: New vs Used Ratio
        self.lbl_kpi_cond = QLabel("0 جديد / 0 مستعمل")
        self.lbl_kpi_cond.setStyleSheet("font-size: 14px; font-weight: bold; color: #C084FC;")
        k_layout.addWidget(self._make_kpi_box("🏷️ جديد / مستعمل", self.lbl_kpi_cond))

        layout.addWidget(kpi_frame)

        # 2. Filter & Search Toolbar
        filter_card = QFrame()
        filter_card.setStyleSheet("background-color: #161622; border: 1px solid #28283C; border-radius: 8px; padding: 6px;")
        f_layout = QHBoxLayout(filter_card)
        f_layout.setContentsMargins(10, 6, 10, 6)
        f_layout.setSpacing(8)

        lbl_s = QLabel("🔍 بحث المخزن:")
        lbl_s.setStyleSheet("color: #D4AF37; font-weight: bold;")
        f_layout.addWidget(lbl_s)

        self.txt_search = QLineEdit()
        self.txt_search.setPlaceholderText("ابحث بالموديل، الماركة، السريال، IMEI، أو اللون...")
        self.txt_search.setStyleSheet("background-color: #0E0E14; color: #fff; border: 1px solid #38384A; border-radius: 5px; padding: 6px 10px; font-size: 12px;")
        self.txt_search.textChanged.connect(self.refresh_inventory)
        f_layout.addWidget(self.txt_search, 1)

        f_layout.addWidget(QLabel("الحالة:"))
        self.cb_status = QComboBox()
        self.cb_status.addItems(["in_stock (المتوفر بالمخزن)", "sold (المباع)", "ALL (كافة الحالات)"])
        self.cb_status.currentIndexChanged.connect(self.refresh_inventory)
        f_layout.addWidget(self.cb_status)

        f_layout.addWidget(QLabel("النوع:"))
        self.cb_condition = QComboBox()
        self.cb_condition.addItems(["ALL (الكل)", "New (جديد متبرشم)", "Used (مستعمل كسر زيرو)"])
        self.cb_condition.currentIndexChanged.connect(self.refresh_inventory)
        f_layout.addWidget(self.cb_condition)

        f_layout.addWidget(QLabel("الماركة:"))
        self.cb_brand = QComboBox()
        self.cb_brand.addItems(["ALL", "Apple", "Samsung", "Xiaomi", "Oppo", "Realme", "Vivo", "Honor", "Infinix"])
        self.cb_brand.currentIndexChanged.connect(self.refresh_inventory)
        f_layout.addWidget(self.cb_brand)

        btn_refresh = QPushButton("🔄 تحديث")
        btn_refresh.setStyleSheet("background-color: #1E1E2C; color: #D4AF37; border: 1px solid #D4AF37; border-radius: 5px; font-weight: bold; padding: 6px 12px;")
        btn_refresh.clicked.connect(self.refresh_inventory)
        f_layout.addWidget(btn_refresh)

        layout.addWidget(filter_card)

        # 3. Main Full Inventory Table
        self.table_inventory = QTableWidget()
        self.table_inventory.setColumnCount(13)
        self.table_inventory.setHorizontalHeaderLabels([
            "كود السريال", "الماركة", "الموديل والسعة", "اللون", "الحالة والضريبة",
            "سعر الشراء (التكلفة)", "سعر البيع المطلوب", "الحد الأدنى للبيع", "الأرباح المتوقعة",
            "البطارية", "السريال / IMEI", "تاريخ الإدخال", "إجراءات سريعة"
        ])
        self.table_inventory.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.table_inventory.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.table_inventory.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.table_inventory.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self.table_inventory.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        self.table_inventory.horizontalHeader().setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        self.table_inventory.horizontalHeader().setSectionResizeMode(6, QHeaderView.ResizeMode.ResizeToContents)
        self.table_inventory.horizontalHeader().setSectionResizeMode(7, QHeaderView.ResizeMode.ResizeToContents)
        self.table_inventory.horizontalHeader().setSectionResizeMode(8, QHeaderView.ResizeMode.ResizeToContents)
        self.table_inventory.horizontalHeader().setSectionResizeMode(9, QHeaderView.ResizeMode.ResizeToContents)
        self.table_inventory.horizontalHeader().setSectionResizeMode(10, QHeaderView.ResizeMode.ResizeToContents)
        self.table_inventory.horizontalHeader().setSectionResizeMode(11, QHeaderView.ResizeMode.ResizeToContents)
        self.table_inventory.horizontalHeader().setSectionResizeMode(12, QHeaderView.ResizeMode.ResizeToContents)
        self.table_inventory.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table_inventory.setStyleSheet("""
            QTableWidget {
                background-color: #0D0D12;
                gridline-color: #20202E;
                color: #F3F4F6;
                font-size: 12px;
                border: 1px solid #232332;
                border-radius: 6px;
            }
            QHeaderView::section {
                background-color: #161622;
                color: #D4AF37;
                font-weight: bold;
                border: 1px solid #232332;
                padding: 6px;
                font-size: 11px;
            }
            QTableWidget::item:selected {
                background-color: #28283C;
                color: #D4AF37;
            }
        """)
        layout.addWidget(self.table_inventory, 1)

    def _make_kpi_box(self, title: str, value_lbl: QLabel) -> QFrame:
        box = QFrame()
        box.setStyleSheet("background-color: #171722; border: 1px solid #262638; border-radius: 6px; padding: 4px;")
        l = QVBoxLayout(box)
        l.setContentsMargins(8, 4, 8, 4)
        l.setSpacing(2)
        lbl_t = QLabel(title)
        lbl_t.setStyleSheet("font-size: 11px; color: #9CA3AF; font-weight: bold;")
        l.addWidget(lbl_t)
        l.addWidget(value_lbl)
        return box

    def refresh_inventory(self):
        """Fetches and displays live inventory according to active filters."""
        query = self.txt_search.text().strip()
        status_text = self.cb_status.currentText().split()[0]
        cond_text = self.cb_condition.currentText().split()[0]
        brand_text = self.cb_brand.currentText().strip()

        devices = self.db.search_devices(
            query=query,
            status=status_text,
            condition=cond_text,
            brand=brand_text,
            limit=500
        )

        # Update KPI Summary Cards
        in_stock_devices = [d for d in devices if d.get("status") == "in_stock"]
        total_count = len(in_stock_devices)
        total_capital = sum(float(d.get("buy_price") or 0) for d in in_stock_devices)
        total_target = sum(float(d.get("target_selling_price") or 0) for d in in_stock_devices)
        total_profit = total_target - total_capital
        new_count = sum(1 for d in in_stock_devices if d.get("condition") == "New")
        used_count = total_count - new_count

        self.lbl_kpi_count.setText(f"{total_count} جهاز")
        self.lbl_kpi_sales_val.setText(f"{total_target:,.0f} ج.م")
        self.lbl_kpi_cond.setText(f"🆕 {new_count} جديد | ✨ {used_count} مستعمل")

        is_owner = (self.current_role == "Owner")
        self.box_capital.setVisible(is_owner)
        self.box_profit.setVisible(is_owner)
        if is_owner:
            self.lbl_kpi_capital.setText(f"{total_capital:,.0f} ج.م")
            self.lbl_kpi_profit.setText(f"+{total_profit:,.0f} ج.م")

        # Populate Table
        self.table_inventory.setRowCount(len(devices))
        for r, d in enumerate(devices):
            st_no = d.get("stock_no") or f"ID-{d.get('id')}"
            brand = d.get("brand") or "-"
            model = f"{d.get('model_name') or '-'} ({d.get('storage') or '-'})"
            color = d.get("color") or "-"
            cond = "🆕 جديد" if d.get("condition") == "New" else "✨ مستعمل"
            tax = d.get("tax_status") or "-"
            batt = f"{d.get('battery_health')}%" if d.get("battery_health") else "-"
            imei_code = d.get("imei1") or d.get("serial_number") or "-"
            in_date = (d.get("created_at") or "").split()[0]

            buy_price = float(d.get("buy_price") or 0)
            target_price = float(d.get("target_selling_price") or 0)
            min_price = float(d.get("min_allowed_price") or 0)
            exp_profit = target_price - buy_price

            if is_owner:
                buy_str = f"{buy_price:,.0f} ج.م ({d.get('secret_cost_cipher') or '-'})"
                profit_str = f"+{exp_profit:,.0f} ج.م"
            else:
                buy_str = f"🤫 ({d.get('secret_cost_cipher') or '-'})"
                profit_str = "🔒 للمالك فقط"

            sell_str = f"{target_price:,.0f} ج.م"
            min_str = f"{min_price:,.0f} ج.م"

            item_st = QTableWidgetItem(st_no)
            item_st.setForeground(QColor("#D4AF37"))
            item_st.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table_inventory.setItem(r, 0, item_st)

            self.table_inventory.setItem(r, 1, QTableWidgetItem(brand))
            self.table_inventory.setItem(r, 2, QTableWidgetItem(model))
            self.table_inventory.setItem(r, 3, QTableWidgetItem(color))
            self.table_inventory.setItem(r, 4, QTableWidgetItem(f"{cond} | {tax}"))

            item_buy = QTableWidgetItem(buy_str)
            item_buy.setForeground(QColor("#F59E0B" if is_owner else "#9CA3AF"))
            self.table_inventory.setItem(r, 5, item_buy)

            item_sell = QTableWidgetItem(sell_str)
            item_sell.setForeground(QColor("#FFFFFF"))
            self.table_inventory.setItem(r, 6, item_sell)

            item_min = QTableWidgetItem(min_str)
            item_min.setForeground(QColor("#E5E7EB"))
            self.table_inventory.setItem(r, 7, item_min)

            item_p = QTableWidgetItem(profit_str)
            item_p.setForeground(QColor("#10B981" if is_owner else "#6B7280"))
            self.table_inventory.setItem(r, 8, item_p)

            item_bat = QTableWidgetItem(batt)
            item_bat.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table_inventory.setItem(r, 9, item_bat)

            self.table_inventory.setItem(r, 10, QTableWidgetItem(imei_code))
            self.table_inventory.setItem(r, 11, QTableWidgetItem(in_date))

            # Action Buttons Box: Print Label, Edit Price
            act_box = QWidget()
            act_lay = QHBoxLayout(act_box)
            act_lay.setContentsMargins(2, 2, 2, 2)
            act_lay.setSpacing(4)

            btn_p = QPushButton("🖨️ طباعة")
            btn_p.setFixedHeight(24)
            btn_p.setStyleSheet("background-color: #1A1A26; color: #D4AF37; border: 1px solid #D4AF37; border-radius: 3px; font-size: 11px; font-weight: bold; padding: 0 6px;")
            btn_p.clicked.connect(lambda _, dev_obj=d: self.request_print_label.emit(dev_obj))
            act_lay.addWidget(btn_p)

            if is_owner:
                btn_edit = QPushButton("💰 تعديل")
                btn_edit.setFixedHeight(24)
                btn_edit.setStyleSheet("background-color: #1A261E; color: #10B981; border: 1px solid #10B981; border-radius: 3px; font-size: 11px; font-weight: bold; padding: 0 6px;")
                btn_edit.clicked.connect(lambda _, dev_obj=d: self._open_quick_reprice(dev_obj))
                act_lay.addWidget(btn_edit)

            self.table_inventory.setCellWidget(r, 12, act_box)

    def _open_quick_reprice(self, dev: dict):
        dlg = QuickPriceEditDialog(self.db, dev, self.current_role, self)
        dlg.prices_updated.connect(self.refresh_inventory)
        dlg.exec()
