"""
ui/trader_payment_dialog.py — Trader Credit Payment & Collection Modal (Shortcut: F4)
Records cash/InstaPay settlements for traders with live net balance tracking.
"""
from datetime import datetime
from typing import Optional, Dict, Any, List

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QDoubleSpinBox, QPushButton, QMessageBox, QFrame,
    QComboBox
)

from core.database import DatabaseManager


class TraderPaymentDialog(QDialog):
    """F4 Modal for recording payments to or collections from traders."""
    payment_recorded = pyqtSignal(dict)

    def __init__(self, db: DatabaseManager, current_role: str = "Owner", current_user: str = "Staff", parent=None):
        super().__init__(parent)
        self.db = db
        self.current_role = current_role
        self.current_user = current_user
        self.traders: List[Dict[str, Any]] = []

        self.setWindowTitle("🤝 سداد / تحصيل دفعة تاجر (Trader Payment — F4)")
        self.setFixedSize(500, 420)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)

        self._init_ui()
        self._load_traders()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 18, 20, 18)
        layout.setSpacing(12)

        card = QFrame()
        card.setObjectName("card")
        c_layout = QGridLayout(card)
        c_layout.setHorizontalSpacing(14)
        c_layout.setVerticalSpacing(10)

        lbl_hdr = QLabel("🤝 تسجيل حركة مالية لحساب تاجر")
        lbl_hdr.setObjectName("title")
        c_layout.addWidget(lbl_hdr, 0, 0, 1, 2)

        # Trader Selector
        c_layout.addWidget(QLabel("اختر التاجر:"), 1, 0)
        self.cb_trader = QComboBox()
        self.cb_trader.currentIndexChanged.connect(self._on_trader_changed)
        c_layout.addWidget(self.cb_trader, 1, 1)

        # Current Balance Pill
        c_layout.addWidget(QLabel("الرصيد الحالي:"), 2, 0)
        self.lbl_cur_bal = QLabel("0.00 ج.م")
        self.lbl_cur_bal.setStyleSheet("font-weight: bold; font-size: 15px; color: #D4AF37;")
        c_layout.addWidget(self.lbl_cur_bal, 2, 1)

        # Transaction Type
        c_layout.addWidget(QLabel("نوع الحركة:"), 3, 0)
        self.cb_type = QComboBox()
        self.cb_type.addItems([
            "دفعة مدفوعة للتاجر (سداد من المحل له)",
            "دفعة مقبوضة من التاجر (تحصيل لصالح المحل)",
            "تسوية رصيد"
        ])
        c_layout.addWidget(self.cb_type, 3, 1)

        # Amount
        c_layout.addWidget(QLabel("المبلغ (جنية):"), 4, 0)
        self.sp_amount = QDoubleSpinBox()
        self.sp_amount.setRange(0, 5000000)
        self.sp_amount.setSingleStep(100)
        c_layout.addWidget(self.sp_amount, 4, 1)

        # Payment Method
        c_layout.addWidget(QLabel("طريقة السداد:"), 5, 0)
        self.cb_method = QComboBox()
        self.cb_method.addItems(["Cash (نقدي من الخزينة)", "InstaPay (إنستاباي)", "Vodafone Cash", "شيك بنكي"])
        c_layout.addWidget(self.cb_method, 5, 1)

        # Reference No & Notes
        c_layout.addWidget(QLabel("رقم المرجع / الإيصال:"), 6, 0)
        self.txt_ref = QLineEdit()
        self.txt_ref.setPlaceholderText("رقم العملية")
        c_layout.addWidget(self.txt_ref, 6, 1)

        c_layout.addWidget(QLabel("ملاحظات:"), 7, 0)
        self.txt_notes = QLineEdit()
        self.txt_notes.setPlaceholderText("سبب الدفعة أو التفاصيل")
        c_layout.addWidget(self.txt_notes, 7, 1)

        layout.addWidget(card)

        # Action Buttons
        btn_row = QHBoxLayout()
        btn_cancel = QPushButton("إلغاء")
        btn_cancel.clicked.connect(self.reject)
        btn_row.addWidget(btn_cancel)

        btn_row.addStretch()

        self.btn_save = QPushButton("💾 تسجيل الدفعة وتحديث الرصيد")
        self.btn_save.setObjectName("btnPrimary")
        self.btn_save.clicked.connect(self._save_transaction)
        btn_row.addWidget(self.btn_save)

        layout.addLayout(btn_row)

    def _load_traders(self):
        self.traders = self.db.get_traders()
        self.cb_trader.clear()
        for t in self.traders:
            self.cb_trader.addItem(f"{t['name']} ({t.get('company','')})", t["id"])
        self._on_trader_changed()

    def _on_trader_changed(self):
        idx = self.cb_trader.currentIndex()
        if idx < 0 or idx >= len(self.traders):
            return
        t = self.traders[idx]
        bal = float(t.get("net_balance") or 0.0)
        label = "له (دائن)" if bal >= 0 else "عليه (مدين)"
        color = "#10B981" if bal >= 0 else "#EF4444"
        self.lbl_cur_bal.setText(f"{abs(bal):,.2f} ج.م ({label})")
        self.lbl_cur_bal.setStyleSheet(f"font-weight: bold; font-size: 15px; color: {color};")

    def _save_transaction(self):
        idx = self.cb_trader.currentIndex()
        if idx < 0 or idx >= len(self.traders):
            QMessageBox.warning(self, "تنبيه", "يرجى اختيار تاجر!")
            return

        amount = self.sp_amount.value()
        if amount <= 0:
            QMessageBox.warning(self, "تنبيه", "يرجى إدخال مبلغ أكبر من صفر!")
            self.sp_amount.setFocus()
            return

        trader_id = self.traders[idx]["id"]
        type_text = self.cb_type.currentText()
        if "مدفوعة" in type_text:
            clean_type = "دفعة مدفوعة"
        elif "مقبوضة" in type_text:
            clean_type = "دفعة مقبوضة"
        else:
            clean_type = "تسوية"

        try:
            ledger_id = self.db.record_trader_transaction(
                trader_id=trader_id,
                trans_type=clean_type,
                amount=amount,
                reference_no=self.txt_ref.text().strip(),
                payment_method=self.cb_method.currentText(),
                notes=self.txt_notes.text().strip(),
                user_role=self.current_role,
                user_name=self.current_user
            )

            # Queue Telegram alert to Owner
            t_name = self.traders[idx]["name"]
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M")
            msg = (
                f"🤝 <b>تسجيل دفعة تاجر</b>\n"
                f"👤 <b>التاجر:</b> {t_name}\n"
                f"⚡ <b>النوع:</b> {clean_type}\n"
                f"💰 <b>المبلغ:</b> {amount:,.2f} ج.م ({self.cb_method.currentText()})\n"
                f"📝 <b>ملاحظة:</b> {self.txt_notes.text().strip() or 'لا توجد'}\n"
                f"⏰ {now_iso}"
            )
            self.db.enqueue_telegram_message("trader_payment", msg)

            QMessageBox.information(self, "تم التسجيل", f"✅ تم تسجيل {clean_type} بمبلغ {amount:,.2f} ج.م بنجاح.")
            self.payment_recorded.emit({"ledger_id": ledger_id, "amount": amount})
            self.accept()
        except Exception as e:
            QMessageBox.critical(self, "خطأ", f"تعذر تسجيل الدفعة: {e}")
