"""
ui/pos_tab.py — POS Sales, 1-Click Trade-In & Multi-Wallet Financial Vaults
Module 3: Fast Desktop Checkout Terminal & Sales Ledger
"""
from datetime import datetime, date
import logging
from typing import Optional, Dict, Any, List

from PyQt6.QtCore import Qt, pyqtSignal, pyqtSlot
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QTableWidget, QTableWidgetItem, QHeaderView,
    QMessageBox, QFrame, QSplitter
)

from core.database import DatabaseManager
from ui.pos_sale_dialog import PosSaleDialog
from ui.trade_in_dialog import TradeInDialog

logger = logging.getLogger(__name__)


class PosTab(QWidget):
    """POS terminal showing today's sales, wallet balances, and quick checkout buttons."""
    sale_processed = pyqtSignal(dict)

    def __init__(self, db: DatabaseManager, current_role: str = "Owner", current_user: str = "Staff", parent=None):
        super().__init__(parent)
        self.db = db
        self.current_role = current_role
        self.current_user = current_user

        self._init_ui()
        self.refresh_sales()

    def set_user_role(self, role: str, user_name: str):
        self.current_role = role
        self.current_user = user_name

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(10)

        # ----------------------------------------------------------------------
        # Top Fast Action Buttons
        # ----------------------------------------------------------------------
        top_card = QFrame()
        top_card.setObjectName("card")
        top_layout = QHBoxLayout(top_card)

        lbl_title = QLabel("🛒 نقطة البيع والصناديق المالية (POS & Cash Vaults)")
        lbl_title.setObjectName("title")
        top_layout.addWidget(lbl_title)

        top_layout.addStretch()

        self.btn_trade_in = QPushButton("🔄 استبدال فوري موحد (F3)")
        self.btn_trade_in.setStyleSheet("background-color: #282838; border: 1px solid #D4AF37; color: #E5C158; font-weight: bold;")
        self.btn_trade_in.clicked.connect(self.open_trade_in_modal)
        top_layout.addWidget(self.btn_trade_in)

        self.btn_quick_sale = QPushButton("⚡ بيع فوري سريع (F2)")
        self.btn_quick_sale.setObjectName("btnPrimary")
        self.btn_quick_sale.clicked.connect(self.open_quick_sale_modal)
        top_layout.addWidget(self.btn_quick_sale)

        layout.addWidget(top_card)

        # ----------------------------------------------------------------------
        # Multi-Wallet Vault Metrics Cards
        # ----------------------------------------------------------------------
        vault_card = QFrame()
        vault_card.setObjectName("card")
        v_layout = QHBoxLayout(vault_card)
        v_layout.setSpacing(14)

        # Card 1: Cash Drawer
        self.lbl_cash_val = self._create_metric_pill(v_layout, "💵 درج النقدية (Cash)", "0.00 ج.م", "#10B981")
        # Card 2: InstaPay Vault
        self.lbl_insta_val = self._create_metric_pill(v_layout, "⚡ محفظة InstaPay", "0.00 ج.م", "#38BDF8")
        # Card 3: Vodafone & E-Wallets
        self.lbl_ewallet_val = self._create_metric_pill(v_layout, "📱 محافظ فودافون كاش", "0.00 ج.م", "#F59E0B")
        # Card 4: Total Today Sales
        self.lbl_total_sales = self._create_metric_pill(v_layout, "📊 إجمالي مبيعات اليوم", "0.00 ج.م", "#D4AF37")

        layout.addWidget(vault_card)

        # ----------------------------------------------------------------------
        # Search & Filter Bar
        # ----------------------------------------------------------------------
        filter_card = QFrame()
        filter_card.setObjectName("card")
        f_layout = QHBoxLayout(filter_card)

        f_layout.addWidget(QLabel("بحث في المبيعات:"))
        self.txt_search = QLineEdit()
        self.txt_search.setPlaceholderText("رقم الفاتورة، اسم العميل، الهاتف، أو السريال...")
        self.txt_search.textChanged.connect(self._filter_sales_table)
        f_layout.addWidget(self.txt_search)

        self.btn_refresh = QPushButton("تحديث")
        self.btn_refresh.clicked.connect(self.refresh_sales)
        f_layout.addWidget(self.btn_refresh)

        layout.addWidget(filter_card)

        # ----------------------------------------------------------------------
        # Recent Sales Table
        # ----------------------------------------------------------------------
        self.table = QTableWidget()
        self.table.setColumnCount(10)
        self.table.setHorizontalHeaderLabels([
            "رقم الفاتورة", "التاريخ والوقت", "الجهاز المباع", "السريال / IMEI",
            "البائع", "العميل", "السعر النهائي", "طريقة السداد", "الحالة", "إجراء"
        ])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)

        layout.addWidget(self.table)

    def _create_metric_pill(self, parent_layout: QHBoxLayout, title: str, init_val: str, color: str) -> QLabel:
        frame = QFrame()
        frame.setStyleSheet("background-color: #1F1F28; border: 1px solid #282834; border-radius: 6px; padding: 6px;")
        fl = QVBoxLayout(frame)
        fl.setContentsMargins(6, 4, 6, 4)
        fl.setSpacing(2)

        t_lbl = QLabel(title)
        t_lbl.setStyleSheet("color: #9CA3AF; font-size: 11px;")
        fl.addWidget(t_lbl)

        v_lbl = QLabel(init_val)
        v_lbl.setStyleSheet(f"color: {color}; font-weight: bold; font-size: 15px;")
        fl.addWidget(v_lbl)

        parent_layout.addWidget(frame)
        return v_lbl

    def open_quick_sale_modal(self):
        dlg = PosSaleDialog(db=self.db, current_role=self.current_role, current_user=self.current_user, parent=self)
        dlg.sale_completed.connect(self._on_sale_completed)
        dlg.exec()

    def open_trade_in_modal(self):
        dlg = TradeInDialog(db=self.db, current_role=self.current_role, current_user=self.current_user, parent=self)
        dlg.trade_in_completed.connect(self._on_trade_in_completed)
        dlg.exec()

    def _on_sale_completed(self, sale_dict: dict):
        self.refresh_sales()
        self.sale_processed.emit(sale_dict)

    def _on_trade_in_completed(self, data: dict):
        self.refresh_sales()
        self.sale_processed.emit(data.get("sale", {}))

    def refresh_sales(self):
        sales = self.db.get_recent_sales(limit=150)
        self._all_sales = sales
        self._populate_table(sales)
        self._update_vault_metrics(sales)

    def _populate_table(self, sales: List[Dict[str, Any]]):
        self.table.setRowCount(len(sales))
        for row_idx, s in enumerate(sales):
            self.table.setItem(row_idx, 0, QTableWidgetItem(s.get("invoice_no", "")))
            self.table.setItem(row_idx, 1, QTableWidgetItem(s.get("sale_date", "")[:16]))

            dev_name = f"{s.get('brand', '')} {s.get('model_name', '')}"
            self.table.setItem(row_idx, 2, QTableWidgetItem(dev_name))
            self.table.setItem(row_idx, 3, QTableWidgetItem(s.get("imei1", "") or s.get("stock_no", "")))
            self.table.setItem(row_idx, 4, QTableWidgetItem(s.get("salesperson", "")))
            self.table.setItem(row_idx, 5, QTableWidgetItem(s.get("customer_name", "") or "عميل نقدي"))

            price_item = QTableWidgetItem(f"{float(s.get('final_price') or 0.0):,.2f} ج.م")
            price_item.setForeground(Qt.GlobalColor.darkYellow)
            self.table.setItem(row_idx, 6, price_item)

            self.table.setItem(row_idx, 7, QTableWidgetItem(s.get("payment_method", "")))

            status = s.get("status", "")
            status_item = QTableWidgetItem("مكتملة ✓" if status == "completed" else "ملغاة ❌")
            status_item.setForeground(Qt.GlobalColor.green if status == "completed" else Qt.GlobalColor.red)
            self.table.setItem(row_idx, 8, status_item)

            # Void button
            btn_void = QPushButton("إلغاء ❌")
            btn_void.setEnabled(status == "completed")
            btn_void.setStyleSheet("background-color: #EF4444; color: white; padding: 2px 8px; font-size: 11px;")
            btn_void.clicked.connect(lambda _, sid=s["id"]: self._void_sale(sid))
            self.table.setCellWidget(row_idx, 9, btn_void)

    def _update_vault_metrics(self, sales: List[Dict[str, Any]]):
        today_str = date.today().strftime("%Y-%m-%d")
        today_sales = [s for s in sales if s.get("sale_date", "").startswith(today_str) and s.get("status") == "completed"]

        total_cash = sum(float(s.get("cash_amount") or 0.0) for s in today_sales)
        total_insta = sum(float(s.get("instapay_amount") or 0.0) for s in today_sales)
        total_voda = sum(float(s.get("vodafone_cash_amount") or 0.0) for s in today_sales)
        total_rev = sum(float(s.get("final_price") or 0.0) for s in today_sales)

        self.lbl_cash_val.setText(f"{total_cash:,.2f} ج.م")
        self.lbl_insta_val.setText(f"{total_insta:,.2f} ج.م")
        self.lbl_ewallet_val.setText(f"{total_voda:,.2f} ج.م")
        self.lbl_total_sales.setText(f"{total_rev:,.2f} ج.م ({len(today_sales)} عملية)")

    def _filter_sales_table(self):
        query = self.txt_search.text().strip().lower()
        if not query:
            self._populate_table(self._all_sales)
            return

        filtered = [
            s for s in self._all_sales
            if query in str(s.get("invoice_no", "")).lower()
            or query in str(s.get("customer_name", "")).lower()
            or query in str(s.get("customer_phone", "")).lower()
            or query in str(s.get("model_name", "")).lower()
            or query in str(s.get("imei1", "")).lower()
            or query in str(s.get("stock_no", "")).lower()
        ]
        self._populate_table(filtered)

    def _void_sale(self, sale_id: int):
        if self.current_role != "Owner":
            from ui.pin_dialog import PinDialog
            dlg = PinDialog(db=self.db, required_role="Owner", parent=self)
            if dlg.exec() != dlg.DialogCode.Accepted:
                QMessageBox.warning(self, "مرفوض", "لا يمكن إلغاء الفاتورة إلا بواسطة صاحب المحل!")
                return

        reply = QMessageBox.question(
            self, "تأكيد الإلغاء",
            "هل أنت متأكد من إلغاء هذه الفاتورة؟\nسيتم إعادة الجهاز فورياً إلى المخزن.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply == QMessageBox.StandardButton.Yes:
            success = self.db.void_sale(
                sale_id=sale_id,
                user_role=self.current_role,
                user_name=self.current_user,
                reason="Voided by Owner via Desktop POS"
            )
            if success:
                QMessageBox.information(self, "تم الإلغاء", "تم إلغاء الفاتورة وإعادة الجهاز للمخزن.")
                self.refresh_sales()
            else:
                QMessageBox.critical(self, "خطأ", "تعذر إلغاء الفاتورة!")
