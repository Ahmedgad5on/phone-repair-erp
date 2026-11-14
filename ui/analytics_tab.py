"""
ui/analytics_tab.py — Hierarchical Brand Analytics, Aging Stock Radar & Custom PDF Builder
Module 5: Commercial Business Intelligence & Report Engine
"""
from datetime import datetime, date, timedelta
import logging
import os
from pathlib import Path
from typing import Optional, Dict, Any, List

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QComboBox, QPushButton, QTableWidget, QTableWidgetItem,
    QHeaderView, QMessageBox, QFrame, QSplitter, QTextEdit,
    QDateEdit, QCheckBox, QDialog, QFileDialog, QApplication
)

from core.database import DatabaseManager
from core.pdf_exporter import PDFReportExporter
from core.paths import get_app_data_dir

logger = logging.getLogger(__name__)


class CustomPdfColumnsDialog(QDialog):
    """Checklist modal to cherry-pick custom columns for PDF export."""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("تخصيص أعمدة تقرير PDF (Custom Columns)")
        self.setFixedSize(380, 420)
        self.selected_columns: List[str] = []

        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(10)

        card = QFrame()
        card.setObjectName("card")
        c = QVBoxLayout(card)
        c.setSpacing(8)

        lbl = QLabel("اختر الأعمدة المراد تضمينها في التقرير:")
        lbl.setStyleSheet("color: #D4AF37; font-weight: bold;")
        c.addWidget(lbl)

        self.col_checkboxes = {}
        columns_def = [
            ("stock_no", "رقم السريال بالمخزن (Stock No)", True),
            ("brand", "الماركة (Brand)", True),
            ("model_name", "اسم الموديل (Model)", True),
            ("storage", "المساحة (Storage)", True),
            ("color", "اللون (Color)", True),
            ("condition", "الحالة (New / Used)", True),
            ("battery_health", "صحة البطارية %", False),
            ("tax_status", "الموقف الضريبي", True),
            ("ownership", "الملكية", False),
            ("buy_price", "سعر الشراء (التكلفة)", True),
            ("target_selling_price", "سعر البيع المطلوب", True),
            ("status", "حالة الجهاز بالمخزن", True)
        ]

        for col_key, label_ar, default_checked in columns_def:
            cb = QCheckBox(label_ar)
            cb.setChecked(default_checked)
            self.col_checkboxes[col_key] = cb
            c.addWidget(cb)

        layout.addWidget(card)

        btn_row = QHBoxLayout()
        btn_cancel = QPushButton("إلغاء")
        btn_cancel.clicked.connect(self.reject)
        btn_row.addWidget(btn_cancel)

        btn_ok = QPushButton("تصدير الآن")
        btn_ok.setObjectName("btnPrimary")
        btn_ok.clicked.connect(self._collect_and_accept)
        btn_row.addWidget(btn_ok)

        layout.addLayout(btn_row)

    def _collect_and_accept(self):
        self.selected_columns = [k for k, cb in self.col_checkboxes.items() if cb.isChecked()]
        if not self.selected_columns:
            QMessageBox.warning(self, "تنبيه", "يرجى اختيار عمود واحد على الأقل!")
            return
        self.accept()


class AnalyticsTab(QWidget):
    """Hierarchical Analytics, Aging Stock Radar, Broadcast Generator, and PDF Exporter."""

    def __init__(self, db: DatabaseManager, current_role: str = "Owner", current_user: str = "Staff", parent=None):
        super().__init__(parent)
        self.db = db
        self.current_role = current_role
        self.current_user = current_user

        self._init_ui()
        self.refresh_analytics()

    def set_user_role(self, role: str, user_name: str):
        self.current_role = role
        self.current_user = user_name
        is_owner = (role == "Owner")
        self.btn_preset1.setEnabled(is_owner)
        self.lbl_capital_val.setVisible(is_owner)
        self.lbl_profit_val.setVisible(is_owner)

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(12, 12, 12, 12)
        main_layout.setSpacing(10)

        # ----------------------------------------------------------------------
        # Top KPI Financial Cards
        # ----------------------------------------------------------------------
        kpi_card = QFrame()
        kpi_card.setObjectName("card")
        k_layout = QHBoxLayout(kpi_card)
        k_layout.setSpacing(14)

        self.lbl_stock_count = self._create_kpi_box(k_layout, "📦 إجمالي الأجهزة بالمخزن", "0 جهاز", "#38BDF8")
        self.lbl_capital_val = self._create_kpi_box(k_layout, "💵 رأس المال المستثمر (شراء)", "0.00 ج.م", "#D4AF37")
        self.lbl_target_rev = self._create_kpi_box(k_layout, "🎯 القيمة البيعية المتوقعة", "0.00 ج.م", "#10B981")
        self.lbl_profit_val = self._create_kpi_box(k_layout, "📈 صافي الربح المحقق", "0.00 ج.م", "#F59E0B")

        main_layout.addWidget(kpi_card)

        # ----------------------------------------------------------------------
        # Filter & Preset Controls Bar
        # ----------------------------------------------------------------------
        filter_card = QFrame()
        filter_card.setObjectName("card")
        f_layout = QHBoxLayout(filter_card)

        f_layout.addWidget(QLabel("تصفية التحليلات:"))

        self.cb_filter_cond = QComboBox()
        self.cb_filter_cond.addItems(["ALL (الكل)", "New (جديد متبرشم)", "Used (مستعمل كسر زيرو)"])
        self.cb_filter_cond.currentIndexChanged.connect(self.refresh_analytics)
        f_layout.addWidget(self.cb_filter_cond)

        self.cb_filter_brand = QComboBox()
        self.cb_filter_brand.addItems(["ALL (جميع الماركات)", "Apple", "Samsung", "Xiaomi", "Oppo", "Realme", "Other"])
        self.cb_filter_brand.currentIndexChanged.connect(self.refresh_analytics)
        f_layout.addWidget(self.cb_filter_brand)

        f_layout.addStretch()

        self.btn_preset1 = QPushButton("🔒 Preset 1: تقرير الأرباح السري للمالك (PDF)")
        self.btn_preset1.setStyleSheet("border: 1px solid #D4AF37; color: #E5C158; font-weight: bold;")
        self.btn_preset1.clicked.connect(self._export_preset1)
        f_layout.addWidget(self.btn_preset1)

        self.btn_preset2 = QPushButton("📢 Preset 2: قائمة الأسعار للعملاء والتجار (PDF)")
        self.btn_preset2.clicked.connect(self._export_preset2)
        f_layout.addWidget(self.btn_preset2)

        self.btn_custom_pdf = QPushButton("📑 تقرير مخصص (Select Columns)")
        self.btn_custom_pdf.clicked.connect(self._export_custom_pdf)
        f_layout.addWidget(self.btn_custom_pdf)

        main_layout.addWidget(filter_card)

        # ----------------------------------------------------------------------
        # Main Splitter: Left (Aging Stock Radar & Broadcast) | Right (Hierarchical Tables)
        # ----------------------------------------------------------------------
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # LEFT PANE: Aging Radar & Broadcast Generator
        left_pane = QFrame()
        left_pane.setObjectName("card")
        l_layout = QVBoxLayout(left_pane)
        l_layout.setContentsMargins(8, 8, 8, 8)

        # 1. Aging Stock Radar Header
        lbl_radar_hdr = QLabel("🚨 رادار الأجهزة الراكدة (Aging Stock Radar):")
        lbl_radar_hdr.setStyleSheet("font-weight: bold; color: #EF4444; font-size: 13px;")
        l_layout.addWidget(lbl_radar_hdr)

        self.aging_table = QTableWidget()
        self.aging_table.setColumnCount(4)
        self.aging_table.setHorizontalHeaderLabels(["الجهاز والموديل", "السريال", "أيام الركود", "السعر المطلوب"])
        self.aging_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.aging_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.aging_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        l_layout.addWidget(self.aging_table)

        # 2. Wholesale Broadcast Generator
        bcast_bar = QHBoxLayout()
        lbl_bcast = QLabel("📢 منشئ برودكاست الواتساب والتيليجرام (1-Click Broadcast):")
        lbl_bcast.setStyleSheet("font-weight: bold; color: #D4AF37; font-size: 12px;")
        bcast_bar.addWidget(lbl_bcast)
        bcast_bar.addStretch()

        self.btn_copy_bcast = QPushButton("📋 نسخ القائمة")
        self.btn_copy_bcast.clicked.connect(self._copy_broadcast)
        bcast_bar.addWidget(self.btn_copy_bcast)

        l_layout.addLayout(bcast_bar)

        self.txt_broadcast = QTextEdit()
        self.txt_broadcast.setReadOnly(True)
        self.txt_broadcast.setMaximumHeight(160)
        l_layout.addWidget(self.txt_broadcast)

        splitter.addWidget(left_pane)

        # RIGHT PANE: Hierarchical Inventory & Sales Breakdown
        right_pane = QFrame()
        right_pane.setObjectName("card")
        r_layout = QVBoxLayout(right_pane)
        r_layout.setContentsMargins(8, 8, 8, 8)

        lbl_break_hdr = QLabel("📊 تصنيف المخزن والمبيعات حسب الماركة والحالة:")
        lbl_break_hdr.setStyleSheet("font-weight: bold; color: #D4AF37; font-size: 13px;")
        r_layout.addWidget(lbl_break_hdr)

        self.breakdown_table = QTableWidget()
        self.breakdown_table.setColumnCount(5)
        self.breakdown_table.setHorizontalHeaderLabels([
            "الماركة (Brand)", "الحالة", "العدد بالمخزن", "رأس المال المستثمر", "القيمة البيعية المتوقعة"
        ])
        self.breakdown_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.breakdown_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.breakdown_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        r_layout.addWidget(self.breakdown_table)

        splitter.addWidget(right_pane)
        main_layout.addWidget(splitter)

    def _create_kpi_box(self, parent_layout: QHBoxLayout, title: str, init_val: str, color: str) -> QLabel:
        frame = QFrame()
        frame.setStyleSheet("background-color: #1F1F28; border: 1px solid #282834; border-radius: 6px; padding: 6px;")
        fl = QVBoxLayout(frame)
        fl.setContentsMargins(8, 6, 8, 6)
        fl.setSpacing(2)

        t_lbl = QLabel(title)
        t_lbl.setStyleSheet("color: #9CA3AF; font-size: 11px;")
        fl.addWidget(t_lbl)

        v_lbl = QLabel(init_val)
        v_lbl.setStyleSheet(f"color: {color}; font-weight: bold; font-size: 16px;")
        fl.addWidget(v_lbl)

        parent_layout.addWidget(frame)
        return v_lbl

    def refresh_analytics(self):
        cond_text = self.cb_filter_cond.currentText()
        brand_text = self.cb_filter_brand.currentText()

        cond_filter = "New" if "New" in cond_text else ("Used" if "Used" in cond_text else "ALL")
        brand_filter = brand_text.split()[0] if "ALL" not in brand_text else "ALL"

        analytics = self.db.get_brand_analytics(condition=cond_filter, brand=brand_filter)

        self.lbl_stock_count.setText(f"{analytics['total_stock_count']} جهاز")
        self.lbl_capital_val.setText(f"{analytics['total_capital_buy']:,.2f} ج.م")
        self.lbl_target_rev.setText(f"{analytics['total_target_revenue']:,.2f} ج.م")
        self.lbl_profit_val.setText(f"{analytics['total_net_profit']:,.2f} ج.م")

        # Breakdown Table
        inv_rows = analytics["inventory_breakdown"]
        self.breakdown_table.setRowCount(len(inv_rows))
        for idx, r in enumerate(inv_rows):
            self.breakdown_table.setItem(idx, 0, QTableWidgetItem(r.get("brand", "")))
            self.breakdown_table.setItem(idx, 1, QTableWidgetItem(r.get("condition", "")))
            self.breakdown_table.setItem(idx, 2, QTableWidgetItem(str(r.get("qty", 0))))
            self.breakdown_table.setItem(idx, 3, QTableWidgetItem(f"{float(r.get('capital_buy') or 0.0):,.0f} ج.م"))
            self.breakdown_table.setItem(idx, 4, QTableWidgetItem(f"{float(r.get('target_revenue') or 0.0):,.0f} ج.م"))

        # Aging Stock Radar
        radar = self.db.get_aging_stock_radar()
        stagnant = radar["crimson_30"] + radar["amber_15"]
        self.aging_table.setRowCount(len(stagnant))
        for idx, d in enumerate(stagnant):
            self.aging_table.setItem(idx, 0, QTableWidgetItem(f"{d.get('brand','')} {d.get('model_name','')}"))
            self.aging_table.setItem(idx, 1, QTableWidgetItem(d.get("stock_no", "")))

            days = float(d.get("days_in_stock") or 0)
            day_item = QTableWidgetItem(f"{days:.0f} يوم")
            if days >= 30:
                day_item.setForeground(Qt.GlobalColor.red)
            else:
                day_item.setForeground(Qt.GlobalColor.darkYellow)
            self.aging_table.setItem(idx, 2, day_item)

            self.aging_table.setItem(idx, 3, QTableWidgetItem(f"{float(d.get('target_selling_price') or 0.0):,.0f} ج.م"))

        # Broadcast text
        bcast_str = self.db.generate_wholesale_broadcast_text(condition=cond_filter)
        self.txt_broadcast.setText(bcast_str)

    def _copy_broadcast(self):
        text = self.txt_broadcast.toPlainText()
        if text:
            clipboard = QApplication.clipboard()
            clipboard.setText(text)
            QMessageBox.information(self, "تم النسخ", "✅ تم نسخ القائمة بنجاح لمشاركتها عبر الواتساب أو تيليجرام!")

    def _export_preset1(self):
        """Preset 1: Owner Full Secret Financial & Profit PDF."""
        devices = self.db.search_devices(status="in_stock", limit=1000)
        exp_dir = Path(get_app_data_dir()) / "exports"
        exp_dir.mkdir(parents=True, exist_ok=True)
        out_pdf = exp_dir / f"owner_financial_report_{date.today().strftime('%Y%m%d_%H%M')}.pdf"

        PDFReportExporter.generate_owner_financial_pdf(
            devices=devices,
            output_path=str(out_pdf),
            store_name=self.db.get_setting("store_name")
        )
        QMessageBox.information(self, "نجاح التصدير", f"✅ تم تصدير تقرير المالك المالي بنجاح:\n{out_pdf}")
        try:
            os.startfile(str(out_pdf))
        except Exception:
            pass

    def _export_preset2(self):
        """Preset 2: Public Trader/Customer Price List PDF."""
        devices = self.db.search_devices(status="in_stock", limit=1000)
        exp_dir = Path(get_app_data_dir()) / "exports"
        exp_dir.mkdir(parents=True, exist_ok=True)
        out_pdf = exp_dir / f"public_pricelist_{date.today().strftime('%Y%m%d_%H%M')}.pdf"

        PDFReportExporter.generate_public_pricelist_pdf(
            devices=devices,
            output_path=str(out_pdf),
            store_name=self.db.get_setting("store_name"),
            store_phone=self.db.get_setting("store_phone")
        )
        QMessageBox.information(self, "نجاح التصدير", f"✅ تم تصدير قائمة الأسعار العامة بنجاح:\n{out_pdf}")
        try:
            os.startfile(str(out_pdf))
        except Exception:
            pass

    def _export_custom_pdf(self):
        dlg = CustomPdfColumnsDialog(parent=self)
        if dlg.exec() == QDialog.DialogCode.Accepted:
            cols = dlg.selected_columns
            devices = self.db.search_devices(status="in_stock", limit=1000)
            exp_dir = Path(get_app_data_dir()) / "exports"
            exp_dir.mkdir(parents=True, exist_ok=True)
            out_pdf = exp_dir / f"custom_inventory_{date.today().strftime('%Y%m%d_%H%M')}.pdf"

            PDFReportExporter.generate_custom_inventory_pdf(
                devices=devices,
                selected_columns=cols,
                output_path=str(out_pdf),
                store_name=self.db.get_setting("store_name")
            )
            QMessageBox.information(self, "نجاح التصدير", f"✅ تم تصدير التقرير المخصص بنجاح:\n{out_pdf}")
            try:
                os.startfile(str(out_pdf))
            except Exception:
                pass
