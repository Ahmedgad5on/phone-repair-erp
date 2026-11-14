"""
ui/reports_tab.py — Dedicated Commercial Financial Reports & PDF Export Center
Strict Trading Focus (Owner & Salesperson Roles).

Features:
1. 4 Instant Commercial Presets:
   - 👑 Owner Secret Financial & Profit Report (Buy price, Prep cost, Sold price, Net profit, Margin %).
   - 🏷️ Public Wholesale Price List (Hides buy price, secret cipher, IMEI — perfect for traders/customers).
   - 🤝 Detailed Trader Account Statement (Full credit ledger & running balance).
   - 🚨 Aging Stock Radar Report (15-day Amber & 30-day Crimson stagnation).
2. Custom Column Checklist Report Builder:
   - Checkbox matrix for cherry-picking exact report columns.
3. Multi-Format Output:
   - Instant Commercial PDF export (ReportLab).
   - Silent print to Windows printer.
   - 1-Click dispatch to Owner's Telegram.
   - 1-Click Wholesale Broadcast copy to clipboard (WhatsApp/Telegram).
"""
from datetime import datetime, date, timedelta
import logging
import os
from pathlib import Path
from typing import Optional, Dict, Any, List

from PyQt6.QtCore import Qt, pyqtSignal, pyqtSlot, QDate
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QPushButton, QTableWidget, QTableWidgetItem, QHeaderView,
    QComboBox, QDateEdit, QCheckBox, QFrame, QMessageBox,
    QFileDialog, QScrollArea, QApplication
)
from PyQt6.QtGui import QFont, QColor

from core.database import DatabaseManager
from core.pdf_exporter import PDFReportExporter
from core.paths import get_app_data_dir

logger = logging.getLogger(__name__)

BRANDS = [
    "الكل", "Apple", "Samsung", "Xiaomi", "Oppo", "Realme",
    "Vivo", "Honor", "Huawei", "Google Pixel", "Other"
]


class ReportsTab(QWidget):
    """
    Dedicated Financial & Inventory Reporting Center.
    """
    report_generated = pyqtSignal(str)

    def __init__(self, db: DatabaseManager, current_role: str = "Owner", current_user: str = "Owner", parent=None):
        super().__init__(parent)
        self.db = db
        self.current_role = current_role
        self.current_user = current_user
        self._current_report_type = "owner_financial"

        self._init_ui()
        self.refresh_report_data()

    def set_user_role(self, role: str, user_name: str):
        self.current_role = role
        self.current_user = user_name
        is_owner = (role == "Owner")
        self.btn_preset_owner.setVisible(is_owner)
        self.card_kpi_profit.setVisible(is_owner)
        self.card_kpi_cost.setVisible(is_owner)
        self.refresh_report_data()

    def _init_ui(self):
        root_vbox = QVBoxLayout(self)
        root_vbox.setContentsMargins(14, 12, 14, 12)
        root_vbox.setSpacing(10)

        # 1. Title Header Card
        title_card = QFrame()
        title_card.setObjectName("card")
        t_layout = QHBoxLayout(title_card)
        t_layout.setContentsMargins(12, 10, 12, 10)

        lbl_title = QLabel("📑 مركز التقارير والطباعة المالية الشاملة (Reports & Financial Center)")
        lbl_title.setObjectName("title")
        lbl_title.setStyleSheet("font-size: 15px; font-weight: 800; color: #D4AF37;")
        t_layout.addWidget(lbl_title)
        t_layout.addStretch()

        self.lbl_report_badge = QLabel("👑 تقرير الأرباح الشامل (المالك)")
        self.lbl_report_badge.setStyleSheet(
            "background-color: #2D2410; color: #D4AF37; border: 1px solid #D4AF37; "
            "border-radius: 4px; padding: 4px 10px; font-weight: bold; font-size: 11px;"
        )
        t_layout.addWidget(self.lbl_report_badge)
        root_vbox.addWidget(title_card)

        # 2. Preset Selection Toolbar
        preset_card = QFrame()
        preset_card.setObjectName("card-highlight")
        p_layout = QHBoxLayout(preset_card)
        p_layout.setContentsMargins(10, 8, 10, 8)
        p_layout.setSpacing(8)

        self.btn_preset_owner = QPushButton("👑 تقرير الأرباح والخزينة")
        self.btn_preset_owner.setCheckable(True)
        self.btn_preset_owner.setChecked(True)
        self.btn_preset_owner.setFixedHeight(34)
        self.btn_preset_owner.clicked.connect(lambda: self._select_preset("owner_financial"))
        p_layout.addWidget(self.btn_preset_owner)

        self.btn_preset_public = QPushButton("🏷️ قائمة أسعار الجملة للزبائن")
        self.btn_preset_public.setCheckable(True)
        self.btn_preset_public.setFixedHeight(34)
        self.btn_preset_public.clicked.connect(lambda: self._select_preset("public_pricelist"))
        p_layout.addWidget(self.btn_preset_public)

        self.btn_preset_trader = QPushButton("🤝 كشف حساب تاجر تفصيلي")
        self.btn_preset_trader.setCheckable(True)
        self.btn_preset_trader.setFixedHeight(34)
        self.btn_preset_trader.clicked.connect(lambda: self._select_preset("trader_statement"))
        p_layout.addWidget(self.btn_preset_trader)

        self.btn_preset_aging = QPushButton("🚨 رادار الأجهزة الراكدة")
        self.btn_preset_aging.setCheckable(True)
        self.btn_preset_aging.setFixedHeight(34)
        self.btn_preset_aging.clicked.connect(lambda: self._select_preset("aging_stock"))
        p_layout.addWidget(self.btn_preset_aging)

        self.btn_preset_custom = QPushButton("🛠️ منشئ تقارير مخصص")
        self.btn_preset_custom.setCheckable(True)
        self.btn_preset_custom.setFixedHeight(34)
        self.btn_preset_custom.clicked.connect(lambda: self._select_preset("custom_builder"))
        p_layout.addWidget(self.btn_preset_custom)

        self.preset_buttons = [
            self.btn_preset_owner, self.btn_preset_public,
            self.btn_preset_trader, self.btn_preset_aging, self.btn_preset_custom
        ]
        self._style_preset_buttons()
        root_vbox.addWidget(preset_card)

        # 3. Filters Control Bar
        filter_card = QFrame()
        filter_card.setObjectName("card")
        f_layout = QHBoxLayout(filter_card)
        f_layout.setContentsMargins(10, 8, 10, 8)
        f_layout.setSpacing(10)

        # Date Range
        f_layout.addWidget(QLabel("من تاريخ:"))
        self.date_from = QDateEdit()
        self.date_from.setCalendarPopup(True)
        self.date_from.setDate(QDate.currentDate().addDays(-30))
        self.date_from.dateChanged.connect(self.refresh_report_data)
        f_layout.addWidget(self.date_from)

        f_layout.addWidget(QLabel("إلى تاريخ:"))
        self.date_to = QDateEdit()
        self.date_to.setCalendarPopup(True)
        self.date_to.setDate(QDate.currentDate())
        self.date_to.dateChanged.connect(self.refresh_report_data)
        f_layout.addWidget(self.date_to)

        # Condition Filter
        f_layout.addWidget(QLabel("الحالة:"))
        self.combo_cond = QComboBox()
        self.combo_cond.addItems(["الكل", "جديد متبرشم (New)", "مستعمل كسر زيرو (Used)"])
        self.combo_cond.currentIndexChanged.connect(self.refresh_report_data)
        f_layout.addWidget(self.combo_cond)

        # Brand Filter
        f_layout.addWidget(QLabel("الشركة:"))
        self.combo_brand = QComboBox()
        self.combo_brand.addItems(BRANDS)
        self.combo_brand.currentIndexChanged.connect(self.refresh_report_data)
        f_layout.addWidget(self.combo_brand)

        # Trader Selector (Only for trader statement)
        self.lbl_trader = QLabel("التاجر:")
        self.combo_trader = QComboBox()
        self.combo_trader.currentIndexChanged.connect(self.refresh_report_data)
        self.lbl_trader.setVisible(False)
        self.combo_trader.setVisible(False)
        f_layout.addWidget(self.lbl_trader)
        f_layout.addWidget(self.combo_trader)

        btn_refresh = QPushButton("↻ تحديث البيانات")
        btn_refresh.setFixedHeight(28)
        btn_refresh.clicked.connect(self.refresh_report_data)
        f_layout.addWidget(btn_refresh)

        f_layout.addStretch()
        root_vbox.addWidget(filter_card)

        # 4. Custom Checklist Options Area (Hidden unless custom preset selected)
        self.custom_cols_frame = QFrame()
        self.custom_cols_frame.setObjectName("card")
        c_layout = QGridLayout(self.custom_cols_frame)
        c_layout.setContentsMargins(10, 8, 10, 8)
        c_layout.setSpacing(6)

        lbl_custom_tip = QLabel("اختر الأعمدة المراد تضمينها في تقرير PDF والجدول:")
        lbl_custom_tip.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 11px;")
        c_layout.addWidget(lbl_custom_tip, 0, 0, 1, 6)

        self.chk_cols = {
            "stock_no": QCheckBox("كود السريال"),
            "brand": QCheckBox("الشركة"),
            "model_name": QCheckBox("الموديل"),
            "storage_ram": QCheckBox("المساحة والرام"),
            "color": QCheckBox("اللون"),
            "condition": QCheckBox("حالة الجهاز"),
            "imei1": QCheckBox("رقم IMEI"),
            "tax_status": QCheckBox("الضريبة والجمارك"),
            "buy_price": QCheckBox("سعر الشراء (سري)"),
            "target_selling_price": QCheckBox("سعر البيع المطلوب"),
            "net_profit": QCheckBox("صافي الربح المتوقع"),
            "status": QCheckBox("حالة المخزن")
        }

        # Check default columns
        for k in ["stock_no", "brand", "model_name", "storage_ram", "color", "condition", "target_selling_price", "net_profit"]:
            self.chk_cols[k].setChecked(True)

        col_idx = 0
        row_idx = 1
        for k, chk in self.chk_cols.items():
            chk.toggled.connect(self.refresh_report_data)
            c_layout.addWidget(chk, row_idx, col_idx)
            col_idx += 1
            if col_idx >= 6:
                col_idx = 0
                row_idx += 1

        self.custom_cols_frame.setVisible(False)
        root_vbox.addWidget(self.custom_cols_frame)

        # 5. KPI Summary Cards Row
        kpi_row = QHBoxLayout()
        kpi_row.setSpacing(10)

        # Card 1: Count
        self.card_kpi_count = self._create_kpi_card("إجمالي الأجهزة بالتقرير", "0 جهاز", "#9CA3AF")
        kpi_row.addWidget(self.card_kpi_count)

        # Card 2: Revenue / Sales Value
        self.card_kpi_sales = self._create_kpi_card("إجمالي القيمة السوقية", "0.00 ج.م", "#D4AF37")
        kpi_row.addWidget(self.card_kpi_sales)

        # Card 3: Buy Cost
        self.card_kpi_cost = self._create_kpi_card("إجمالي تكلفة الشراء", "0.00 ج.م", "#F59E0B")
        kpi_row.addWidget(self.card_kpi_cost)

        # Card 4: Net Profit
        self.card_kpi_profit = self._create_kpi_card("صافي الأرباح التقديرية", "0.00 ج.م", "#10B981")
        kpi_row.addWidget(self.card_kpi_profit)

        root_vbox.addLayout(kpi_row)

        # 6. Interactive Data Table
        self.table = QTableWidget()
        self.table.setAlternatingRowColors(True)
        self.table.setStyleSheet("""
            QTableWidget {
                background-color: #121217;
                border: 1px solid #282834;
                border-radius: 6px;
                gridline-color: #1F1F28;
                color: #F4F4F6;
            }
            QHeaderView::section {
                background-color: #1A1A24;
                color: #D4AF37;
                font-weight: bold;
                padding: 6px;
                border: 1px solid #282834;
            }
        """)
        root_vbox.addWidget(self.table, 1)

        # 7. Action Export Toolbar (PDF, Print, Telegram, Broadcast)
        action_card = QFrame()
        action_card.setObjectName("card")
        act_layout = QHBoxLayout(action_card)
        act_layout.setContentsMargins(10, 8, 10, 8)
        act_layout.setSpacing(10)

        self.btn_export_pdf = QPushButton("📄 تصدير كـ PDF احترافي فوري")
        self.btn_export_pdf.setFixedHeight(36)
        self.btn_export_pdf.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #D4AF37, stop:1 #E5C158);
                color: #0D0D11; font-weight: 800; font-size: 12px; border-radius: 5px; padding: 0 16px;
            }
            QPushButton:hover { background: #F5D77F; }
        """)
        self.btn_export_pdf.clicked.connect(self._export_pdf)
        act_layout.addWidget(self.btn_export_pdf)

        self.btn_copy_broadcast = QPushButton("📋 نسخ نص برودكاست (واتساب / تليجرام)")
        self.btn_copy_broadcast.setFixedHeight(36)
        self.btn_copy_broadcast.setStyleSheet("""
            QPushButton {
                background-color: #1A1A24; color: #10B981; border: 1px solid #10B981;
                border-radius: 5px; font-weight: bold; padding: 0 14px;
            }
            QPushButton:hover { background-color: #10B981; color: #0D0D11; }
        """)
        self.btn_copy_broadcast.clicked.connect(self._copy_broadcast_text)
        act_layout.addWidget(self.btn_copy_broadcast)

        self.btn_send_telegram = QPushButton("📱 إرسال التقرير لتليجرام المالك")
        self.btn_send_telegram.setFixedHeight(36)
        self.btn_send_telegram.setStyleSheet("""
            QPushButton {
                background-color: #1A1A24; color: #38BDF8; border: 1px solid #38BDF8;
                border-radius: 5px; font-weight: bold; padding: 0 14px;
            }
            QPushButton:hover { background-color: #38BDF8; color: #0D0D11; }
        """)
        self.btn_send_telegram.clicked.connect(self._send_pdf_to_telegram)
        act_layout.addWidget(self.btn_send_telegram)

        act_layout.addStretch()
        root_vbox.addWidget(action_card)

        self._populate_traders_combo()

    def _create_kpi_card(self, title: str, val: str, color_hex: str) -> QFrame:
        card = QFrame()
        card.setObjectName("card")
        v = QVBoxLayout(card)
        v.setContentsMargins(10, 8, 10, 8)
        v.setSpacing(2)
        lbl_t = QLabel(title)
        lbl_t.setStyleSheet("font-size: 11px; color: #9CA3AF;")
        v.addWidget(lbl_t)
        lbl_v = QLabel(val)
        lbl_v.setStyleSheet(f"font-size: 15px; font-weight: 800; color: {color_hex};")
        v.addWidget(lbl_v)
        card.lbl_val = lbl_v
        return card

    def _style_preset_buttons(self):
        for btn in self.preset_buttons:
            btn.setStyleSheet("""
                QPushButton {
                    background-color: #1A1A24; color: #9CA3AF; border: 1px solid #282834;
                    border-radius: 5px; font-weight: 600; font-size: 12px; padding: 0 12px;
                }
                QPushButton:hover { color: #F4F4F6; border-color: #D4AF37; }
                QPushButton:checked {
                    background-color: #2D2410; color: #D4AF37; border: 1px solid #D4AF37; font-weight: 800;
                }
            """)

    def _select_preset(self, preset_key: str):
        self._current_report_type = preset_key
        for b in self.preset_buttons:
            b.setChecked(False)

        if preset_key == "owner_financial":
            self.btn_preset_owner.setChecked(True)
            self.lbl_report_badge.setText("👑 تقرير الأرباح الشامل (المالك)")
            self.custom_cols_frame.setVisible(False)
            self.lbl_trader.setVisible(False)
            self.combo_trader.setVisible(False)
        elif preset_key == "public_pricelist":
            self.btn_preset_public.setChecked(True)
            self.lbl_report_badge.setText("🏷️ قائمة أسعار الجملة للزبائن والتجار")
            self.custom_cols_frame.setVisible(False)
            self.lbl_trader.setVisible(False)
            self.combo_trader.setVisible(False)
        elif preset_key == "trader_statement":
            self.btn_preset_trader.setChecked(True)
            self.lbl_report_badge.setText("🤝 كشف حساب تاجر تفصيلي")
            self.custom_cols_frame.setVisible(False)
            self.lbl_trader.setVisible(True)
            self.combo_trader.setVisible(True)
        elif preset_key == "aging_stock":
            self.btn_preset_aging.setChecked(True)
            self.lbl_report_badge.setText("🚨 رادار الأجهزة الراكدة في المخزن")
            self.custom_cols_frame.setVisible(False)
            self.lbl_trader.setVisible(False)
            self.combo_trader.setVisible(False)
        elif preset_key == "custom_builder":
            self.btn_preset_custom.setChecked(True)
            self.lbl_report_badge.setText("🛠️ منشئ التقارير المخصص")
            self.custom_cols_frame.setVisible(True)
            self.lbl_trader.setVisible(False)
            self.combo_trader.setVisible(False)

        self.refresh_report_data()

    def _populate_traders_combo(self):
        self.combo_trader.blockSignals(True)
        self.combo_trader.clear()
        traders = self.db.get_traders()
        for t in traders:
            bal = float(t.get("net_balance") or 0.0)
            bal_str = f"عليه {abs(bal):,.0f}" if bal < 0 else (f"له {bal:,.0f}" if bal > 0 else "خالص")
            self.combo_trader.addItem(f"{t['name']} ({bal_str})", t['id'])
        self.combo_trader.blockSignals(False)

    def refresh_report_data(self):
        """Fetches and renders the current report table and KPI metrics."""
        cond_filter = self.combo_cond.currentText()
        condition = "New" if "New" in cond_filter else ("Used" if "Used" in cond_filter else None)
        brand_filter = self.combo_brand.currentText()
        brand = None if brand_filter == "الكل" else brand_filter

        # 1. Fetch In-Stock Devices
        devices = self.db.search_devices(status="in_stock", condition=condition, brand=brand, limit=500)

        # Sort devices: New first, then Used; then by Brand, then Model
        def _sort_key(d):
            cond_order = 0 if d.get("condition") == "New" else 1
            brand_str = (d.get("brand") or "").lower()
            model_str = (d.get("model_name") or "").lower()
            return (cond_order, brand_str, model_str)

        devices = sorted(devices, key=_sort_key)

        # 2. Render based on report preset
        if self._current_report_type == "owner_financial":
            self._render_owner_financial(devices)
        elif self._current_report_type == "public_pricelist":
            self._render_public_pricelist(devices)
        elif self._current_report_type == "trader_statement":
            self._render_trader_statement()
        elif self._current_report_type == "aging_stock":
            self._render_aging_stock()
        elif self._current_report_type == "custom_builder":
            self._render_custom_builder(devices)

    def _render_owner_financial(self, devices: List[Dict[str, Any]]):
        headers = ["الكود", "الشركة", "الموديل", "المساحة والرام", "اللون", "الحالة", "سعر الشراء", "مصاريف التجهيز", "سعر البيع المطلوب", "الحد الأدنى", "صافي الربح", "الضريبة"]
        self.table.setColumnCount(len(headers))
        self.table.setHorizontalHeaderLabels(headers)
        self.table.setRowCount(len(devices))

        total_buy = 0.0
        total_sell = 0.0
        total_profit = 0.0

        for r, d in enumerate(devices):
            buy = float(d.get("buy_price") or 0.0)
            prep = float(d.get("prep_cost") or 0.0)
            sell = float(d.get("target_selling_price") or 0.0)
            min_p = float(d.get("min_allowed_price") or 0.0)
            profit = sell - (buy + prep)

            total_buy += (buy + prep)
            total_sell += sell
            total_profit += profit

            ram_str = f" / {d.get('ram')}" if d.get('ram') else ""
            cap_display = f"{d.get('storage', '')}{ram_str}"

            self.table.setItem(r, 0, QTableWidgetItem(d.get("stock_no", "")))
            self.table.setItem(r, 1, QTableWidgetItem(d.get("brand", "")))
            self.table.setItem(r, 2, QTableWidgetItem(d.get("model_name", "")))
            self.table.setItem(r, 3, QTableWidgetItem(cap_display))
            self.table.setItem(r, 4, QTableWidgetItem(d.get("color", "") or "-"))
            self.table.setItem(r, 5, QTableWidgetItem(d.get("condition", "")))
            self.table.setItem(r, 6, QTableWidgetItem(f"{buy:,.0f} ج.م"))
            self.table.setItem(r, 7, QTableWidgetItem(f"{prep:,.0f} ج.م"))
            self.table.setItem(r, 8, QTableWidgetItem(f"{sell:,.0f} ج.م"))
            self.table.setItem(r, 9, QTableWidgetItem(f"{min_p:,.0f} ج.م"))

            item_profit = QTableWidgetItem(f"{profit:+,.0f} ج.م")
            item_profit.setForeground(QColor("#10B981" if profit >= 0 else "#EF4444"))
            self.table.setItem(r, 10, item_profit)

            self.table.setItem(r, 11, QTableWidgetItem(d.get("tax_status", "")))

        self.table.resizeColumnsToContents()
        self.card_kpi_count.lbl_val.setText(f"{len(devices)} جهاز")
        self.card_kpi_sales.lbl_val.setText(f"{total_sell:,.0f} ج.م")
        self.card_kpi_cost.lbl_val.setText(f"{total_buy:,.0f} ج.م")
        self.card_kpi_profit.lbl_val.setText(f"{total_profit:+,.0f} ج.م")

    def _render_public_pricelist(self, devices: List[Dict[str, Any]]):
        headers = ["الشركة", "الموديل", "المساحة والرام", "اللون", "الحالة", "سعر البيع النقدي", "الضريبة والضمان"]
        self.table.setColumnCount(len(headers))
        self.table.setHorizontalHeaderLabels(headers)
        self.table.setRowCount(len(devices))

        total_sell = 0.0

        for r, d in enumerate(devices):
            sell = float(d.get("target_selling_price") or 0.0)
            total_sell += sell

            ram_str = f" / {d.get('ram')}" if d.get('ram') else ""
            cap_display = f"{d.get('storage', '')}{ram_str}"
            cond_str = "جديد متبرشم" if d.get("condition") == "New" else "مستعمل كسر زيرو"

            self.table.setItem(r, 0, QTableWidgetItem(d.get("brand", "")))
            self.table.setItem(r, 1, QTableWidgetItem(d.get("model_name", "")))
            self.table.setItem(r, 2, QTableWidgetItem(cap_display))
            self.table.setItem(r, 3, QTableWidgetItem(d.get("color", "") or "-"))
            self.table.setItem(r, 4, QTableWidgetItem(cond_str))

            item_sell = QTableWidgetItem(f"{sell:,.0f} ج.م")
            item_sell.setForeground(QColor("#D4AF37"))
            item_sell.setFont(QFont("Segoe UI", 10, QFont.Weight.Bold))
            self.table.setItem(r, 5, item_sell)

            self.table.setItem(r, 6, QTableWidgetItem(d.get("tax_status", "")))

        self.table.resizeColumnsToContents()
        self.card_kpi_count.lbl_val.setText(f"{len(devices)} جهاز")
        self.card_kpi_sales.lbl_val.setText(f"{total_sell:,.0f} ج.م")
        self.card_kpi_cost.lbl_val.setText("— (محجوب)")
        self.card_kpi_profit.lbl_val.setText("— (محجوب)")

    def _render_trader_statement(self):
        trader_id = self.combo_trader.currentData()
        if not trader_id:
            self.table.setRowCount(0)
            return

        entries = self.db.get_trader_ledger(trader_id)
        headers = ["التاريخ", "النوع", "البيان / الموديل", "مدين (له)", "دائن (عليه)", "طريقة الدفع", "رقم الإيصال"]
        self.table.setColumnCount(len(headers))
        self.table.setHorizontalHeaderLabels(headers)
        self.table.setRowCount(len(entries))

        total_debit = 0.0
        total_credit = 0.0

        for r, e in enumerate(entries):
            deb = float(e.get("debit") or 0.0)
            crd = float(e.get("credit") or 0.0)
            total_debit += deb
            total_credit += crd

            self.table.setItem(r, 0, QTableWidgetItem(str(e.get("created_at", ""))[:16]))
            self.table.setItem(r, 1, QTableWidgetItem(e.get("tx_type", "")))
            self.table.setItem(r, 2, QTableWidgetItem(e.get("description", "")))
            self.table.setItem(r, 3, QTableWidgetItem(f"{deb:,.0f} ج.م" if deb else "-"))
            self.table.setItem(r, 4, QTableWidgetItem(f"{crd:,.0f} ج.م" if crd else "-"))
            self.table.setItem(r, 5, QTableWidgetItem(e.get("payment_method", "-")))
            self.table.setItem(r, 6, QTableWidgetItem(e.get("reference_no", "-")))

        self.table.resizeColumnsToContents()
        net = total_debit - total_credit
        self.card_kpi_count.lbl_val.setText(f"{len(entries)} حركة")
        self.card_kpi_sales.lbl_val.setText(f"له: {total_debit:,.0f} ج.م")
        self.card_kpi_cost.lbl_val.setText(f"عليه: {total_credit:,.0f} ج.م")
        self.card_kpi_profit.lbl_val.setText(f"الرصيد: {net:+,.0f} ج.م")

    def _render_aging_stock(self):
        radar = self.db.get_aging_stock_radar()
        devices = radar["crimson_30"] + radar["amber_15"]
        headers = ["حالة الركود", "أيام بالمخزن", "الكود", "الشركة", "الموديل", "المساحة والرام", "سعر الشراء", "سعر البيع المطلوب", "الحد الأدنى"]
        self.table.setColumnCount(len(headers))
        self.table.setHorizontalHeaderLabels(headers)
        self.table.setRowCount(len(devices))

        total_cost = 0.0

        for r, d in enumerate(devices):
            days = float(d.get("days_in_stock") or 0.0)
            buy = float(d.get("buy_price") or 0.0)
            sell = float(d.get("target_selling_price") or 0.0)
            min_p = float(d.get("min_allowed_price") or 0.0)
            total_cost += buy

            is_crimson = days >= 30
            badge_text = "🔴 ركود حرج (+30 يوم)" if is_crimson else "🟡 راكد (+15 يوم)"
            badge_color = "#EF4444" if is_crimson else "#F59E0B"

            ram_str = f" / {d.get('ram')}" if d.get('ram') else ""
            cap_display = f"{d.get('storage', '')}{ram_str}"

            item_badge = QTableWidgetItem(badge_text)
            item_badge.setForeground(QColor(badge_color))
            item_badge.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
            self.table.setItem(r, 0, item_badge)

            self.table.setItem(r, 1, QTableWidgetItem(f"{days:.0f} يوم"))
            self.table.setItem(r, 2, QTableWidgetItem(d.get("stock_no", "")))
            self.table.setItem(r, 3, QTableWidgetItem(d.get("brand", "")))
            self.table.setItem(r, 4, QTableWidgetItem(d.get("model_name", "")))
            self.table.setItem(r, 5, QTableWidgetItem(cap_display))
            self.table.setItem(r, 6, QTableWidgetItem(f"{buy:,.0f} ج.م"))
            self.table.setItem(r, 7, QTableWidgetItem(f"{sell:,.0f} ج.م"))
            self.table.setItem(r, 8, QTableWidgetItem(f"{min_p:,.0f} ج.م"))

        self.table.resizeColumnsToContents()
        self.card_kpi_count.lbl_val.setText(f"{len(devices)} جهاز راكد")
        self.card_kpi_sales.lbl_val.setText(f"رأس مال معطل: {total_cost:,.0f} ج.م")
        self.card_kpi_cost.lbl_val.setText(f"فوق 30 يوم: {len(radar['crimson_30'])}")
        self.card_kpi_profit.lbl_val.setText(f"فوق 15 يوم: {len(radar['amber_15'])}")

    def _render_custom_builder(self, devices: List[Dict[str, Any]]):
        active_cols = [(k, chk.text()) for k, chk in self.chk_cols.items() if chk.isChecked()]
        if not active_cols:
            self.table.setRowCount(0)
            return

        self.table.setColumnCount(len(active_cols))
        self.table.setHorizontalHeaderLabels([title for _, title in active_cols])
        self.table.setRowCount(len(devices))

        for r, d in enumerate(devices):
            for c, (k, _) in enumerate(active_cols):
                val_str = ""
                if k == "storage_ram":
                    ram_str = f" / {d.get('ram')}" if d.get('ram') else ""
                    val_str = f"{d.get('storage', '')}{ram_str}"
                elif k == "net_profit":
                    buy = float(d.get("buy_price") or 0.0)
                    sell = float(d.get("target_selling_price") or 0.0)
                    val_str = f"{sell - buy:+,.0f} ج.م"
                elif "price" in k:
                    val_str = f"{float(d.get(k) or 0.0):,.0f} ج.م"
                else:
                    val_str = str(d.get(k, "") or "-")
                self.table.setItem(r, c, QTableWidgetItem(val_str))

        self.table.resizeColumnsToContents()
        self.card_kpi_count.lbl_val.setText(f"{len(devices)} جهاز")

    # =========================================================================
    # Export Actions (PDF, Broadcast, Telegram)
    # =========================================================================

    def _export_pdf(self):
        """Generates and opens the corresponding PDF report."""
        export_dir = Path(get_app_data_dir()) / "exports"
        export_dir.mkdir(parents=True, exist_ok=True)
        store_name = self.db.get_setting("store_name", "ProLab Trading")

        cond_filter = self.combo_cond.currentText()
        condition = "New" if "New" in cond_filter else ("Used" if "Used" in cond_filter else None)
        brand = None if self.combo_brand.currentText() == "الكل" else self.combo_brand.currentText()
        devices = self.db.search_devices(status="in_stock", condition=condition, brand=brand, limit=500)

        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")

        try:
            if self._current_report_type == "owner_financial":
                out_path = export_dir / f"owner_financial_{timestamp_str}.pdf"
                PDFReportExporter.generate_owner_financial_pdf(devices, str(out_path), store_name=store_name)
            elif self._current_report_type == "public_pricelist":
                out_path = export_dir / f"public_pricelist_{timestamp_str}.pdf"
                PDFReportExporter.generate_public_pricelist_pdf(devices, str(out_path), store_name=store_name)
            elif self._current_report_type == "trader_statement":
                trader_id = self.combo_trader.currentData()
                if not trader_id:
                    QMessageBox.warning(self, "تنبيه", "يرجى اختيار تاجر أولاً!")
                    return
                traders = self.db.get_traders()
                trader_dict = next((t for t in traders if t["id"] == trader_id), {"name": "تاجر", "phone": ""})
                ledger = self.db.get_trader_ledger(trader_id)
                out_path = export_dir / f"trader_statement_{timestamp_str}.pdf"
                PDFReportExporter.generate_trader_statement_pdf(trader_dict, ledger, str(out_path), store_name=store_name)
            else:
                # Custom builder or aging
                out_path = export_dir / f"inventory_report_{timestamp_str}.pdf"
                active_col_keys = [k for k, chk in self.chk_cols.items() if chk.isChecked()]
                PDFReportExporter.generate_custom_inventory_pdf(devices, active_col_keys, str(out_path), store_name=store_name)

            self.report_generated.emit(str(out_path))
            QMessageBox.information(self, "تم تصدير التقرير", f"✅ تم توليد تقرير PDF بنجاح:\n{out_path}")
            # Open with Windows default PDF reader
            os.startfile(str(out_path))

        except Exception as e:
            logger.error("PDF Export error: %s", e)
            QMessageBox.critical(self, "خطأ في التصدير", f"تعذر توليد ملف PDF:\n{e}")

    def _copy_broadcast_text(self):
        """Generates clean formatted Arabic text for WhatsApp/Telegram channels."""
        cond_filter = self.combo_cond.currentText()
        condition = "New" if "New" in cond_filter else ("Used" if "Used" in cond_filter else None)
        brand = None if self.combo_brand.currentText() == "الكل" else self.combo_brand.currentText()
        devices = self.db.search_devices(status="in_stock", condition=condition, brand=brand, limit=500)

        store_name = self.db.get_setting("store_name", "محل الهواتف")
        store_phone = self.db.get_setting("store_phone", "")

        lines = [
            f"🌟 <b>قائمة الأجهزة المتاحة بالمحل — {store_name}</b>",
            f"📅 التاريخ: {date.today().strftime('%Y-%m-%d')}",
            "━━━━━━━━━━━━━━━━━━━━"
        ]

        # Group by brand
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for d in devices:
            b = d.get("brand", "أخرى")
            grouped.setdefault(b, []).append(d)

        for b, d_list in grouped.items():
            lines.append(f"\n📱 <b>شركة {b}:</b>")
            for d in d_list:
                ram_str = f" / {d.get('ram')}" if d.get('ram') else ""
                cap = f"{d.get('storage', '')}{ram_str}"
                cond = "متبرشم" if d.get("condition") == "New" else "كسر زيرو"
                col = d.get("color") or ""
                price = float(d.get("target_selling_price") or 0.0)
                lines.append(f" • {d['model_name']} ({cap}) {col} [{cond}] — <b>{price:,.0f} ج.م</b>")

        if store_phone:
            lines.append(f"\n📞 للاستفسار والحجز: {store_phone}")

        full_text = "\n".join(lines)
        QApplication.clipboard().setText(full_text)
        QMessageBox.information(self, "تم النسخ", "✅ تم نسخ نص البرودكاست المنسق للحافظة بنجاح!\nيمكنك الآن لصقه مباشرة في واتساب أو تيليجرام.")

    def _send_pdf_to_telegram(self):
        """Sends the active report PDF to Owner's Telegram."""
        owner_chat_id = self.db.get_setting("telegram_owner_chat_id", "")
        token = self.db.get_setting("telegram_bot_token", "")
        if not token or not owner_chat_id:
            QMessageBox.warning(self, "تنبيه", "يرجى ربط بوت تيليجرام وإدخال معرف شات المالك أولاً من تبويب (🤖 ربط بوت تيليجرام)!")
            return

        export_dir = Path(get_app_data_dir()) / "exports"
        export_dir.mkdir(parents=True, exist_ok=True)
        store_name = self.db.get_setting("store_name", "ProLab Trading")
        out_path = export_dir / f"telegram_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"

        devices = self.db.search_devices(status="in_stock", limit=500)
        PDFReportExporter.generate_owner_financial_pdf(devices, str(out_path), store_name=store_name)

        from core.telegram_bot import TradingTelegramBot
        bot = TradingTelegramBot(db=self.db)
        success = bot.send_document(owner_chat_id, str(out_path), f"📊 تقرير مالي فوري مطلوب من البرنامج — {store_name}")
        if success:
            QMessageBox.information(self, "تم الإرسال", "✅ تم إرسال تقرير PDF مباشرة إلى تيليجرام المالك بنجاح!")
        else:
            QMessageBox.critical(self, "فشل الإرسال", "❌ تعذر إرسال التقرير لتيليجرام. تأكد من تفعيل البوت بالضغط على Start في هاتفك.")
