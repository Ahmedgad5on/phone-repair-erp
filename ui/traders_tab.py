"""
ui/traders_tab.py — Traders Credit Ledger, Memo Tracker & Scheduled Reminders
Module 4: B2B Dealer Accounting, Memos (بضاعة أمانة وعرض), and Statement Exporter
"""
from datetime import datetime, date
import logging
import os
from pathlib import Path
from typing import Optional, Dict, Any, List

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QPushButton, QTableWidget, QTableWidgetItem,
    QHeaderView, QMessageBox, QFrame, QSplitter, QComboBox,
    QDialog, QFileDialog
)

from core.database import DatabaseManager
from core.models import TraderRecord
from core.pdf_exporter import PDFReportExporter
from core.paths import get_app_data_dir
from ui.trader_payment_dialog import TraderPaymentDialog

logger = logging.getLogger(__name__)


class AddTraderDialog(QDialog):
    """Dialog to register a new trader account."""
    def __init__(self, db: DatabaseManager, parent=None):
        super().__init__(parent)
        self.db = db
        self.setWindowTitle("إضافة تاجر جديد")
        self.setFixedSize(400, 320)
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(10)

        card = QFrame()
        card.setObjectName("card")
        c = QGridLayout(card)
        c.setSpacing(10)

        c.addWidget(QLabel("اسم التاجر:"), 0, 0)
        self.txt_name = QLineEdit()
        c.addWidget(self.txt_name, 0, 1)

        c.addWidget(QLabel("رقم الهاتف:"), 1, 0)
        self.txt_phone = QLineEdit()
        c.addWidget(self.txt_phone, 1, 1)

        c.addWidget(QLabel("اسم المحل / الشركة:"), 2, 0)
        self.txt_company = QLineEdit()
        c.addWidget(self.txt_company, 2, 1)

        c.addWidget(QLabel("ملاحظات:"), 3, 0)
        self.txt_notes = QLineEdit()
        c.addWidget(self.txt_notes, 3, 1)

        layout.addWidget(card)

        btn_row = QHBoxLayout()
        btn_cancel = QPushButton("إلغاء")
        btn_cancel.clicked.connect(self.reject)
        btn_row.addWidget(btn_cancel)

        btn_ok = QPushButton("حفظ التاجر")
        btn_ok.setObjectName("btnPrimary")
        btn_ok.clicked.connect(self._save)
        btn_row.addWidget(btn_ok)

        layout.addLayout(btn_row)

    def _save(self):
        name = self.txt_name.text().strip()
        if not name:
            QMessageBox.warning(self, "تنبيه", "يرجى إدخال اسم التاجر!")
            return
        t = TraderRecord(
            name=name,
            phone=self.txt_phone.text().strip(),
            company=self.txt_company.text().strip(),
            notes=self.txt_notes.text().strip()
        )
        self.db.create_trader(t)
        self.accept()


class AddMemoDialog(QDialog):
    """Dialog to issue an in-stock phone out on memo to a trader."""
    def __init__(self, db: DatabaseManager, parent=None):
        super().__init__(parent)
        self.db = db
        self.setWindowTitle("تسجيل خروج بضاعة عرض / أمانة (On Memo)")
        self.setFixedSize(450, 320)
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(10)

        card = QFrame()
        card.setObjectName("card")
        c = QGridLayout(card)
        c.setSpacing(10)

        c.addWidget(QLabel("التاجر المستلم:"), 0, 0)
        self.cb_trader = QComboBox()
        self.traders = self.db.get_traders()
        for t in self.traders:
            self.cb_trader.addItem(t["name"], t["id"])
        c.addWidget(self.cb_trader, 0, 1)

        c.addWidget(QLabel("كود / IMEI الجهاز:"), 1, 0)
        self.txt_code = QLineEdit()
        self.txt_code.setPlaceholderText("امسح باركود الجهاز...")
        c.addWidget(self.txt_code, 1, 1)

        c.addWidget(QLabel("فترة العرض (أيام):"), 2, 0)
        self.cb_days = QComboBox()
        self.cb_days.addItems(["1 يوم (24 ساعة)", "2 يوم", "3 أيام", "7 أيام"])
        c.addWidget(self.cb_days, 2, 1)

        c.addWidget(QLabel("ملاحظات:"), 3, 0)
        self.txt_notes = QLineEdit()
        self.txt_notes.setPlaceholderText("سبب خروج الجهاز للعرض")
        c.addWidget(self.txt_notes, 3, 1)

        layout.addWidget(card)

        btn_row = QHBoxLayout()
        btn_cancel = QPushButton("إلغاء")
        btn_cancel.clicked.connect(self.reject)
        btn_row.addWidget(btn_cancel)

        btn_ok = QPushButton("تأكيد خروج الجهاز")
        btn_ok.setObjectName("btnPrimary")
        btn_ok.clicked.connect(self._save)
        btn_row.addWidget(btn_ok)

        layout.addLayout(btn_row)

    def _save(self):
        idx = self.cb_trader.currentIndex()
        if idx < 0:
            return
        trader_id = self.traders[idx]["id"]
        code = self.txt_code.text().strip()
        dev = self.db.get_device_by_imei_or_stock(code)
        if not dev or dev["status"] != "in_stock":
            QMessageBox.warning(self, "تنبيه", "الجهاز غير متوفر في المخزن!")
            return

        days_map = {"1 يوم (24 ساعة)": 1, "2 يوم": 2, "3 أيام": 3, "7 أيام": 7}
        days = days_map.get(self.cb_days.currentText(), 1)

        try:
            self.db.issue_memo(
                trader_id=trader_id,
                device_id=dev["id"],
                return_days=days,
                notes=self.txt_notes.text().strip()
            )
            QMessageBox.information(self, "نجاح", "تم تسجيل خروج الجهاز على ذمة التاجر للعرض بنجاح.")
            self.accept()
        except Exception as e:
            QMessageBox.critical(self, "خطأ", f"فشل تسجيل البضاعة: {e}")


class TradersTab(QWidget):
    """Master Traders & Memos tab."""

    def __init__(self, db: DatabaseManager, current_role: str = "Owner", current_user: str = "Staff", parent=None):
        super().__init__(parent)
        self.db = db
        self.current_role = current_role
        self.current_user = current_user
        self.selected_trader_id: Optional[int] = None

        self._init_ui()
        self.refresh_all()

    def set_user_role(self, role: str, user_name: str):
        self.current_role = role
        self.current_user = user_name

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(12, 12, 12, 12)
        main_layout.setSpacing(10)

        # ----------------------------------------------------------------------
        # Top Bar & Actions
        # ----------------------------------------------------------------------
        top_card = QFrame()
        top_card.setObjectName("card")
        top_layout = QHBoxLayout(top_card)

        lbl_title = QLabel("🤝 حسابات التجار وبضاعة الأمانة والعرض (Traders & Memos)")
        lbl_title.setObjectName("title")
        top_layout.addWidget(lbl_title)

        top_layout.addStretch()

        self.btn_send_reminders = QPushButton("⏰ إرسال تذكير 11:00 صباحاً لتيليجرام")
        self.btn_send_reminders.clicked.connect(self._trigger_reminders)
        top_layout.addWidget(self.btn_send_reminders)

        self.btn_add_memo = QPushButton("📦 خروج بضاعة عرض (On Memo)")
        self.btn_add_memo.clicked.connect(self._open_add_memo)
        top_layout.addWidget(self.btn_add_memo)

        self.btn_payment = QPushButton("💰 سداد / تحصيل دفعة (F4)")
        self.btn_payment.setObjectName("btnPrimary")
        self.btn_payment.clicked.connect(self._open_payment_dialog)
        top_layout.addWidget(self.btn_payment)

        self.btn_new_trader = QPushButton("+ إضافة تاجر")
        self.btn_new_trader.clicked.connect(self._open_add_trader)
        top_layout.addWidget(self.btn_new_trader)

        main_layout.addWidget(top_card)

        # ----------------------------------------------------------------------
        # Splitter: Left (Trader List) | Right (Ledger Statement & Memos)
        # ----------------------------------------------------------------------
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # LEFT PANE: Traders List
        left_pane = QFrame()
        left_pane.setObjectName("card")
        l_layout = QVBoxLayout(left_pane)
        l_layout.setContentsMargins(8, 8, 8, 8)

        lbl_tr_hdr = QLabel("👥 دليل التجار والحسابات:")
        lbl_tr_hdr.setStyleSheet("font-weight: bold; color: #D4AF37;")
        l_layout.addWidget(lbl_tr_hdr)

        self.traders_table = QTableWidget()
        self.traders_table.setColumnCount(4)
        self.traders_table.setHorizontalHeaderLabels(["الاسم", "الشركة", "الهاتف", "الرصيد"])
        self.traders_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.traders_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.traders_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.traders_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.traders_table.itemSelectionChanged.connect(self._on_trader_selected)
        l_layout.addWidget(self.traders_table)

        splitter.addWidget(left_pane)

        # RIGHT PANE: Statement & Active Memos
        right_pane = QFrame()
        right_pane.setObjectName("card")
        r_layout = QVBoxLayout(right_pane)
        r_layout.setContentsMargins(8, 8, 8, 8)

        # Statement Header Bar
        stmt_bar = QHBoxLayout()
        self.lbl_selected_trader = QLabel("— اختر تاجراً لعرض كشف الحساب —")
        self.lbl_selected_trader.setStyleSheet("font-weight: bold; font-size: 14px; color: #D4AF37;")
        stmt_bar.addWidget(self.lbl_selected_trader)

        stmt_bar.addStretch()

        self.btn_export_pdf = QPushButton("📄 تصدير كشف حساب PDF")
        self.btn_export_pdf.clicked.connect(self._export_statement_pdf)
        stmt_bar.addWidget(self.btn_export_pdf)

        r_layout.addLayout(stmt_bar)

        self.statement_table = QTableWidget()
        self.statement_table.setColumnCount(6)
        self.statement_table.setHorizontalHeaderLabels([
            "التاريخ", "نوع الحركة", "المبلغ", "المرجع / الجهاز", "طريقة السداد", "الرصيد بعد الحركة"
        ])
        self.statement_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.statement_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        self.statement_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        r_layout.addWidget(self.statement_table)

        # Bottom section of Right Pane: Active Memos
        lbl_memo_hdr = QLabel("📦 أجهزة بضاعة أمانة وعرض بالخارج حالياً (Active Memos):")
        lbl_memo_hdr.setStyleSheet("font-weight: bold; color: #F59E0B; margin-top: 8px;")
        r_layout.addWidget(lbl_memo_hdr)

        self.memo_table = QTableWidget()
        self.memo_table.setColumnCount(6)
        self.memo_table.setHorizontalHeaderLabels([
            "التاجر", "الجهاز والموديل", "IMEI", "تاريخ الخروج", "موعد الإرجاع", "إجراء"
        ])
        self.memo_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.memo_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.memo_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        r_layout.addWidget(self.memo_table)

        splitter.addWidget(right_pane)
        main_layout.addWidget(splitter)

    def refresh_all(self):
        self._load_traders_table()
        self._load_active_memos()
        if self.selected_trader_id:
            self._load_statement(self.selected_trader_id)

    def _load_traders_table(self):
        traders = self.db.get_traders()
        self._all_traders = traders
        self.traders_table.setRowCount(len(traders))
        for idx, t in enumerate(traders):
            self.traders_table.setItem(idx, 0, QTableWidgetItem(t.get("name", "")))
            self.traders_table.setItem(idx, 1, QTableWidgetItem(t.get("company", "")))
            self.traders_table.setItem(idx, 2, QTableWidgetItem(t.get("phone", "")))

            bal = float(t.get("net_balance") or 0.0)
            tag = "له" if bal >= 0 else "عليه"
            item = QTableWidgetItem(f"{abs(bal):,.0f} ج.م ({tag})")
            item.setForeground(Qt.GlobalColor.green if bal >= 0 else Qt.GlobalColor.red)
            self.traders_table.setItem(idx, 3, item)

    def _on_trader_selected(self):
        row = self.traders_table.currentRow()
        if row < 0 or row >= len(self._all_traders):
            return
        t = self._all_traders[row]
        self.selected_trader_id = t["id"]
        bal = float(t.get("net_balance") or 0.0)
        tag = "له (دائن)" if bal >= 0 else "عليه (مدين)"
        self.lbl_selected_trader.setText(f"كشف حساب: {t['name']} ({t.get('company','')}) — الرصيد: {abs(bal):,.2f} ج.م ({tag})")
        self._load_statement(t["id"])

    def _load_statement(self, trader_id: int):
        entries = self.db.get_trader_statement(trader_id)
        self.statement_table.setRowCount(len(entries))
        for idx, e in enumerate(entries):
            self.statement_table.setItem(idx, 0, QTableWidgetItem(e.get("trans_date", "")[:16]))
            self.statement_table.setItem(idx, 1, QTableWidgetItem(e.get("trans_type", "")))
            self.statement_table.setItem(idx, 2, QTableWidgetItem(f"{float(e.get('amount') or 0.0):,.2f}"))

            ref = e.get("reference_no", "") or ""
            if e.get("model_name"):
                ref += f" ({e.get('model_name')})"
            self.statement_table.setItem(idx, 3, QTableWidgetItem(ref))
            self.statement_table.setItem(idx, 4, QTableWidgetItem(e.get("payment_method", "") or "-"))

            bal_item = QTableWidgetItem(f"{float(e.get('balance_after') or 0.0):,.2f}")
            bal_item.setForeground(Qt.GlobalColor.darkYellow)
            self.statement_table.setItem(idx, 5, bal_item)

    def _load_active_memos(self):
        memos = self.db.get_active_memos()
        self.memo_table.setRowCount(len(memos))
        now_str = date.today().strftime("%Y-%m-%d")

        for idx, m in enumerate(memos):
            self.memo_table.setItem(idx, 0, QTableWidgetItem(m.get("trader_name", "")))
            self.memo_table.setItem(idx, 1, QTableWidgetItem(f"{m.get('brand','')} {m.get('model_name','')}"))
            self.memo_table.setItem(idx, 2, QTableWidgetItem(m.get("imei1", "") or m.get("stock_no", "")))
            self.memo_table.setItem(idx, 3, QTableWidgetItem(m.get("out_date", "")[:10]))

            exp_item = QTableWidgetItem(m.get("expected_return_date", "")[:10])
            if m.get("expected_return_date", "")[:10] <= now_str:
                exp_item.setForeground(Qt.GlobalColor.red)
            self.memo_table.setItem(idx, 4, exp_item)

            btn_return = QPushButton("إرجاع للمخزن ↩️")
            btn_return.setStyleSheet("background-color: #10B981; color: white; padding: 2px 8px;")
            btn_return.clicked.connect(lambda _, mid=m["id"]: self._return_memo(mid))
            self.memo_table.setCellWidget(idx, 5, btn_return)

    def _return_memo(self, memo_id: int):
        reply = QMessageBox.question(
            self, "تأكيد الإرجاع", "هل تم استلام الجهاز من التاجر وإعادته للمخزن؟",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply == QMessageBox.StandardButton.Yes:
            self.db.return_memo(memo_id=memo_id, user_role=self.current_role, user_name=self.current_user)
            self.refresh_all()

    def _open_payment_dialog(self):
        dlg = TraderPaymentDialog(db=self.db, current_role=self.current_role, current_user=self.current_user, parent=self)
        dlg.payment_recorded.connect(lambda _: self.refresh_all())
        dlg.exec()

    def _open_add_trader(self):
        dlg = AddTraderDialog(db=self.db, parent=self)
        if dlg.exec() == QDialog.DialogCode.Accepted:
            self.refresh_all()

    def _open_add_memo(self):
        dlg = AddMemoDialog(db=self.db, parent=self)
        if dlg.exec() == QDialog.DialogCode.Accepted:
            self.refresh_all()

    def _trigger_reminders(self):
        # Enqueue telegram notification
        traders = self.db.get_traders()
        active_memos = self.db.get_active_memos()

        he_owes_us: List[str] = []
        for t in traders:
            bal = float(t.get("net_balance") or 0.0)
            if bal < 0:
                he_owes_us.append(f" • <b>{t['name']}</b>: عليه {abs(bal):,.0f} ج.م")

        msg = (
            f"⏰ <b>تذكير حسابات التجار اليومي</b>\n"
            f"عدد التجار المدينين: {len(he_owes_us)}\n"
            f"عدد أجهزة الميمو بالخارج: {len(active_memos)}\n"
            f"تم الإرسال من لوحة تحكم سطح المكتب."
        )
        self.db.enqueue_telegram_message("daily_reminder", msg)
        QMessageBox.information(self, "تم الإرسال", "✅ تم إدراج التذكير في طابور إشعارات تيليجرام بنجاح!")

    def _export_statement_pdf(self):
        if not self.selected_trader_id:
            QMessageBox.warning(self, "تنبيه", "يرجى اختيار تاجر أولاً!")
            return

        trader = self.db.get_trader_by_id(self.selected_trader_id)
        if not trader:
            return

        txs = self.db.get_trader_statement(self.selected_trader_id)
        exp_dir = Path(get_app_data_dir()) / "exports"
        exp_dir.mkdir(parents=True, exist_ok=True)
        out_pdf = exp_dir / f"trader_stmt_{trader['id']}_{date.today().strftime('%Y%m%d')}.pdf"

        PDFReportExporter.generate_trader_statement_pdf(
            trader=trader,
            transactions=txs,
            output_path=str(out_pdf),
            store_name=self.db.get_setting("store_name")
        )

        QMessageBox.information(self, "نجاح التصدير", f"✅ تم تصدير كشف الحساب بصيغة PDF بنجاح إلى:\n{out_pdf}")
        try:
            os.startfile(str(out_pdf))
        except Exception:
            pass
