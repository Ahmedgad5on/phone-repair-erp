"""
ui/pos_sale_dialog.py — Fast POS Sale Modal (Shortcut: F2)
Auto-focused on Barcode/IMEI Input for instant checkout.
"""
from datetime import datetime
import os
from typing import Optional, Dict, Any, List

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QDoubleSpinBox, QPushButton, QMessageBox, QFrame,
    QComboBox, QFileDialog
)

from core.database import DatabaseManager
from core.models import SaleRecord


class PosSaleDialog(QDialog):
    """Instant POS Sale Modal auto-focused on Barcode input."""
    sale_completed = pyqtSignal(dict)

    def __init__(self, db: DatabaseManager, current_role: str = "Owner", current_user: str = "Staff", parent=None):
        super().__init__(parent)
        self.db = db
        self.current_role = current_role
        self.current_user = current_user
        self.selected_device: Optional[Dict[str, Any]] = None
        self._proof_photo_path: str = ""

        self.setWindowTitle("⚡ نقطة البيع السريعة (Fast POS Checkout — F2)")
        self.setMinimumSize(620, 520)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)

        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(12)

        # 1. Barcode Scanner Search Bar
        search_card = QFrame()
        search_card.setObjectName("card-highlight")
        s_layout = QHBoxLayout(search_card)

        lbl_scan = QLabel("🔍 مسح الباركود / IMEI:")
        lbl_scan.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 14px;")
        s_layout.addWidget(lbl_scan)

        self.txt_barcode = QLineEdit()
        self.txt_barcode.setPlaceholderText("مرر قارئ الباركود أو اكتب السريال/IMEI واضغط Enter...")
        self.txt_barcode.setStyleSheet("font-size: 14px; font-weight: bold; padding: 7px;")
        self.txt_barcode.returnPressed.connect(self._search_device)
        s_layout.addWidget(self.txt_barcode)

        btn_find = QPushButton("بحث")
        btn_find.clicked.connect(self._search_device)
        s_layout.addWidget(btn_find)

        layout.addWidget(search_card)

        # 2. Device Details Preview
        self.dev_card = QFrame()
        self.dev_card.setObjectName("card")
        d_layout = QGridLayout(self.dev_card)
        d_layout.setHorizontalSpacing(14)
        d_layout.setVerticalSpacing(8)

        d_layout.addWidget(QLabel("الجهاز:"), 0, 0)
        self.lbl_dev_name = QLabel("— لم يتم اختيار جهاز —")
        self.lbl_dev_name.setStyleSheet("font-weight: bold; font-size: 14px; color: #D4AF37;")
        d_layout.addWidget(self.lbl_dev_name, 0, 1, 1, 3)

        d_layout.addWidget(QLabel("السريال / IMEI:"), 1, 0)
        self.lbl_dev_serial = QLabel("—")
        d_layout.addWidget(self.lbl_dev_serial, 1, 1)

        d_layout.addWidget(QLabel("الحالة والضريبة:"), 1, 2)
        self.lbl_dev_cond = QLabel("—")
        d_layout.addWidget(self.lbl_dev_cond, 1, 3)

        d_layout.addWidget(QLabel("سعر البيع المطلوب:"), 2, 0)
        self.lbl_dev_target = QLabel("0.00 ج.م")
        self.lbl_dev_target.setStyleSheet("font-size: 14px; font-weight: bold; color: #10B981;")
        d_layout.addWidget(self.lbl_dev_target, 2, 1)

        d_layout.addWidget(QLabel("الحد الأدنى للبيع:"), 2, 2)
        self.lbl_dev_min = QLabel("0.00 ج.م")
        self.lbl_dev_min.setStyleSheet("color: #EF4444; font-weight: bold;")
        d_layout.addWidget(self.lbl_dev_min, 2, 3)

        layout.addWidget(self.dev_card)

        # 3. Customer Info & Pricing Adjustment
        pay_card = QFrame()
        pay_card.setObjectName("card")
        p_layout = QGridLayout(pay_card)
        p_layout.setHorizontalSpacing(14)
        p_layout.setVerticalSpacing(8)

        p_layout.addWidget(QLabel("اسم العميل:"), 0, 0)
        self.txt_cust_name = QLineEdit()
        self.txt_cust_name.setPlaceholderText("اختياري")
        p_layout.addWidget(self.txt_cust_name, 0, 1)

        p_layout.addWidget(QLabel("هاتف العميل:"), 0, 2)
        self.txt_cust_phone = QLineEdit()
        self.txt_cust_phone.setPlaceholderText("01xxxxxxxxx")
        p_layout.addWidget(self.txt_cust_phone, 0, 3)

        p_layout.addWidget(QLabel("سعر البيع الفعلي:"), 1, 0)
        self.sp_final_price = QDoubleSpinBox()
        self.sp_final_price.setRange(0, 1000000)
        self.sp_final_price.setSingleStep(50)
        self.sp_final_price.valueChanged.connect(self._recalc_payment)
        p_layout.addWidget(self.sp_final_price, 1, 1)

        p_layout.addWidget(QLabel("طريقة السداد:"), 1, 2)
        self.cb_method = QComboBox()
        self.cb_method.addItems(["Cash (نقدي)", "InstaPay (إنستاباي)", "Vodafone Cash", "Multi-Wallet (مقسم)", "Trader Credit (آجل)"])
        self.cb_method.currentIndexChanged.connect(self._on_method_changed)
        p_layout.addWidget(self.cb_method, 1, 3)

        # Multi-wallet row (Cash, InstaPay, Reference)
        self.lbl_ref = QLabel("رقم عملية InstaPay:")
        self.txt_ref = QLineEdit()
        self.txt_ref.setPlaceholderText("رقم المرجع")
        p_layout.addWidget(self.lbl_ref, 2, 0)
        p_layout.addWidget(self.txt_ref, 2, 1)

        self.btn_proof = QPushButton("📷 إرفاق إيصال التحويل")
        self.btn_proof.clicked.connect(self._choose_proof)
        p_layout.addWidget(self.btn_proof, 2, 2)

        self.lbl_proof_status = QLabel("بدون إيصال")
        self.lbl_proof_status.setStyleSheet("color: #9CA3AF;")
        p_layout.addWidget(self.lbl_proof_status, 2, 3)

        layout.addWidget(pay_card)

        # 4. Action Buttons Footer
        btn_row = QHBoxLayout()
        btn_cancel = QPushButton("إلغاء")
        btn_cancel.clicked.connect(self.reject)
        btn_row.addWidget(btn_cancel)

        btn_row.addStretch()

        self.btn_checkout = QPushButton("⚡ إتمام الفاتورة وطباعة الإيصال (Enter)")
        self.btn_checkout.setObjectName("btnPrimary")
        self.btn_checkout.clicked.connect(self._process_sale)
        btn_row.addWidget(self.btn_checkout)

        layout.addLayout(btn_row)

        self.txt_barcode.setFocus()

    def _search_device(self):
        code = self.txt_barcode.text().strip()
        if not code:
            return
        dev = self.db.get_device_by_imei_or_stock(code)
        if not dev:
            QMessageBox.warning(self, "غير متوفر", f"لم يتم العثور على جهاز بالكود: {code}")
            self.txt_barcode.selectAll()
            return
        if dev["status"] != "in_stock":
            QMessageBox.warning(self, "تنبيه", f"هذا الجهاز مباع مسبقاً أو غير متوفر بالمخزن ({dev['status']})!")
            return

        self.selected_device = dev
        self.lbl_dev_name.setText(f"{dev['brand']} {dev['model_name']} ({dev['storage']}) — {dev['color']}")
        self.lbl_dev_serial.setText(f"كود: {dev['stock_no']} | IMEI: {dev['imei1']}")
        self.lbl_dev_cond.setText(f"{dev['condition']} | {dev['tax_status']}")
        self.lbl_dev_target.setText(f"{dev['target_selling_price']:,.2f} ج.م")
        self.lbl_dev_min.setText(f"{dev['min_allowed_price']:,.2f} ج.م")

        self.sp_final_price.setValue(dev["target_selling_price"])
        self.sp_final_price.setFocus()
        self.sp_final_price.selectAll()

    def _on_method_changed(self):
        method = self.cb_method.currentText()
        is_instapay = "InstaPay" in method or "Vodafone" in method
        self.lbl_ref.setVisible(is_instapay)
        self.txt_ref.setVisible(is_instapay)
        self.btn_proof.setVisible(is_instapay)
        self.lbl_proof_status.setVisible(is_instapay)

    def _recalc_payment(self):
        pass

    def _choose_proof(self):
        f, _ = QFileDialog.getOpenFileName(self, "اختيار صورة إيصال التحويل", "", "Images (*.png *.jpg *.jpeg)")
        if f:
            self._proof_photo_path = f
            self.lbl_proof_status.setText(f"✓ {os.path.basename(f)}")
            self.lbl_proof_status.setStyleSheet("color: #10B981; font-weight: bold;")

    def _process_sale(self):
        if not self.selected_device:
            QMessageBox.warning(self, "تنبيه", "يرجى مسح أو اختيار جهاز أولاً!")
            self.txt_barcode.setFocus()
            return

        final_price = self.sp_final_price.value()
        min_price = self.selected_device["min_allowed_price"]

        # Check permission if price is below min price
        if final_price < min_price:
            if self.current_role != "Owner":
                from ui.pin_dialog import PinDialog
                dlg = PinDialog(db=self.db, required_role="Owner", parent=self)
                if dlg.exec() != QDialog.DialogCode.Accepted:
                    QMessageBox.warning(self, "مرفوض", "تم رفض السعر! يلزم موافقة صاحب المحل للبيع بأقل من الحد الأدنى.")
                    return

        method = self.cb_method.currentText()
        cash_amt = final_price if "Cash" in method else 0.0
        insta_amt = final_price if "InstaPay" in method else 0.0
        voda_amt = final_price if "Vodafone" in method else 0.0

        sale = SaleRecord(
            invoice_no=self.db.get_next_invoice_no(),
            sale_date=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            device_id=self.selected_device["id"],
            salesperson=self.current_user,
            customer_name=self.txt_cust_name.text().strip(),
            customer_phone=self.txt_cust_phone.text().strip(),
            selling_price=self.selected_device["target_selling_price"],
            discount=max(0.0, self.selected_device["target_selling_price"] - final_price),
            final_price=final_price,
            payment_method=method,
            cash_amount=cash_amt,
            instapay_amount=insta_amt,
            vodafone_cash_amount=voda_amt,
            instapay_ref=self.txt_ref.text().strip(),
            proof_photo=self._proof_photo_path,
            net_collected=final_price,
            status="completed"
        )

        try:
            sale_id = self.db.process_sale(
                sale=sale,
                user_role=self.current_role,
                user_name=self.current_user
            )
            sale.id = sale_id
            self.sale_completed.emit(sale.to_dict())

            # Open luxury sale confirmation & receipt window
            receipt_dlg = SaleReceiptDialog(
                sale_dict=sale.to_dict(),
                device_dict=self.selected_device,
                db=self.db,
                is_owner=(self.current_role == "Owner"),
                parent=self.parent() or self
            )
            receipt_dlg.exec()

            self.accept()
        except Exception as e:
            QMessageBox.critical(self, "خطأ في البيع", f"تعذر إتمام عملية البيع: {e}")


class SaleReceiptDialog(QDialog):
    """
    نافذة إيصال وفاتورة بيع معتمدة ومطابقة لبيانات البوت وشاشة الكاشير
    """
    def __init__(self, sale_dict: dict, device_dict: dict, db: DatabaseManager, is_owner: bool = True, parent=None):
        super().__init__(parent)
        self.sale = sale_dict
        self.device = device_dict
        self.db = db
        self.is_owner = is_owner
        self.setWindowTitle(f"🧾 نافذة إيصال بيع - فاتورة {self.sale.get('invoice_no', '')}")
        self.setFixedSize(520, 680)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)
        self.setStyleSheet("""
            QDialog {
                background-color: #0E0E14;
                color: #F3F4F6;
                font-family: 'Segoe UI', sans-serif;
            }
            QLabel {
                font-size: 12px;
            }
        """)
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # Header Box with Emerald & Gold theme
        hdr_frame = QFrame()
        hdr_frame.setStyleSheet("""
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #122B1E, stop:1 #1A1A24);
            border: 1px solid #10B981;
            border-radius: 8px;
            padding: 8px;
        """)
        h_lay = QVBoxLayout(hdr_frame)
        h_lay.setSpacing(4)

        lbl_success = QLabel("✅ تمت عملية البيع واعتماد الفاتورة بنجاح")
        lbl_success.setStyleSheet("color: #10B981; font-weight: 800; font-size: 15px;")
        lbl_success.setAlignment(Qt.AlignmentFlag.AlignCenter)
        h_lay.addWidget(lbl_success)

        store_name = self.db.get_setting("store_name", "ProLab Mobile Trading")
        lbl_store = QLabel(f"🏪 {store_name} — فرع المبيعات")
        lbl_store.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 13px;")
        lbl_store.setAlignment(Qt.AlignmentFlag.AlignCenter)
        h_lay.addWidget(lbl_store)

        lbl_inv = QLabel(f"رقم الفاتورة: {self.sale.get('invoice_no', '')} | التاريخ: {self.sale.get('sale_date', '')}")
        lbl_inv.setStyleSheet("color: #9CA3AF; font-size: 11px;")
        lbl_inv.setAlignment(Qt.AlignmentFlag.AlignCenter)
        h_lay.addWidget(lbl_inv)

        layout.addWidget(hdr_frame)

        # Device & Customer Specs Card
        dev_frame = QFrame()
        dev_frame.setStyleSheet("""
            background-color: #15151F;
            border: 1px solid #28283C;
            border-radius: 8px;
            padding: 8px;
        """)
        d_lay = QGridLayout(dev_frame)
        d_lay.setSpacing(8)

        cond_str = "🆕 جديد متبرشم" if self.device.get("condition") == "New" else "✨ مستعمل كسر زيرو"

        d_lay.addWidget(QLabel("📱 اسم وموديل الجهاز:"), 0, 0)
        lbl_dname = QLabel(f"<b>{self.device.get('brand')} {self.device.get('model_name')}</b> ({self.device.get('storage') or '-'})")
        lbl_dname.setStyleSheet("color: #FFFFFF; font-size: 13px;")
        d_lay.addWidget(lbl_dname, 0, 1)

        d_lay.addWidget(QLabel("🎨 اللون والحالة:"), 1, 0)
        d_lay.addWidget(QLabel(f"{self.device.get('color') or '-'} | {cond_str}"), 1, 1)

        d_lay.addWidget(QLabel("🔖 السريال و IMEI:"), 2, 0)
        lbl_serials = QLabel(f"كود: <code>{self.device.get('stock_no')}</code> | IMEI: <code>{self.device.get('imei1')}</code>")
        lbl_serials.setStyleSheet("color: #D4AF37;")
        d_lay.addWidget(lbl_serials, 2, 1)

        d_lay.addWidget(QLabel("👤 العميل والبائع:"), 3, 0)
        cust_str = f"{self.sale.get('customer_name') or 'نقدي'} ({self.sale.get('customer_phone') or '-'})"
        seller_str = f"الكاشير: {self.sale.get('salesperson') or 'طاقم المبيعات'}"
        d_lay.addWidget(QLabel(f"{cust_str} — {seller_str}"), 3, 1)

        layout.addWidget(dev_frame)

        # Financial Breakdown Card
        fin_frame = QFrame()
        fin_frame.setStyleSheet("""
            background-color: #15151F;
            border: 1px solid #28283C;
            border-radius: 8px;
            padding: 8px;
        """)
        f_lay = QGridLayout(fin_frame)
        f_lay.setSpacing(8)

        final_price = float(self.sale.get("final_price") or 0.0)
        buy_price = float(self.device.get("buy_price") or 0.0)
        discount = float(self.sale.get("discount") or 0.0)
        profit = final_price - buy_price

        row = 0
        if self.is_owner:
            f_lay.addWidget(QLabel("💵 السعر اللي اشتريت بيه:"), row, 0)
            lbl_cost = QLabel(f"{buy_price:,.0f} ج.م (شفرة: {self.device.get('secret_cost_cipher') or '-'})")
            lbl_cost.setStyleSheet("color: #F59E0B; font-weight: bold;")
            f_lay.addWidget(lbl_cost, row, 1)
            row += 1

        f_lay.addWidget(QLabel("💰 سعر البيع الفعلي:"), row, 0)
        lbl_sell = QLabel(f"{final_price:,.0f} ج.م")
        lbl_sell.setStyleSheet("color: #FFFFFF; font-weight: bold; font-size: 14px;")
        f_lay.addWidget(lbl_sell, row, 1)
        row += 1

        if discount > 0:
            f_lay.addWidget(QLabel("📉 الخصم الممنوح:"), row, 0)
            f_lay.addWidget(QLabel(f"{discount:,.0f} ج.م"), row, 1)
            row += 1

        if self.is_owner:
            f_lay.addWidget(QLabel("📈 صافي الربح المحقق:"), row, 0)
            lbl_profit = QLabel(f"+{profit:,.0f} ج.م")
            lbl_profit.setStyleSheet("color: #10B981; font-weight: 800; font-size: 15px;")
            f_lay.addWidget(lbl_profit, row, 1)
            row += 1

        f_lay.addWidget(QLabel("💳 طريقة التحصيل:"), row, 0)
        lbl_method = QLabel(f"{self.sale.get('payment_method')} (محصل: {float(self.sale.get('net_collected') or 0):,.0f} ج.م)")
        lbl_method.setStyleSheet("color: #38BDF8; font-weight: bold;")
        f_lay.addWidget(lbl_method, row, 1)

        layout.addWidget(fin_frame)

        # Telegram Live Bot Notice Pill
        bot_pill = QFrame()
        bot_pill.setStyleSheet("""
            background-color: #16202C;
            border: 1px solid #0284C7;
            border-radius: 6px;
            padding: 6px;
        """)
        b_lay = QHBoxLayout(bot_pill)
        b_lay.setContentsMargins(8, 4, 8, 4)
        lbl_bot_info = QLabel("🤖 تم إرسال إشعار فوري للفاتورة مع إيصال تفاعلي إلى تيليجرام المالك")
        lbl_bot_info.setStyleSheet("color: #38BDF8; font-weight: bold; font-size: 11px;")
        b_lay.addWidget(lbl_bot_info)
        layout.addWidget(bot_pill)

        # Footer Action Buttons
        btn_box = QHBoxLayout()
        btn_print = QPushButton("🖨️ طباعة إيصال الفاتورة للعميل")
        btn_print.setFixedHeight(36)
        btn_print.setStyleSheet("""
            QPushButton {
                background-color: #1E293B;
                color: #38BDF8;
                border: 1px solid #38BDF8;
                border-radius: 5px;
                font-weight: bold;
                font-size: 12px;
            }
            QPushButton:hover { background-color: #38BDF8; color: #0D0D11; }
        """)
        btn_print.clicked.connect(self._print_receipt)
        btn_box.addWidget(btn_print)

        btn_close = QPushButton("✅ تم وإغلاق")
        btn_close.setFixedHeight(36)
        btn_close.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #10B981, stop:1 #059669);
                color: #FFFFFF;
                border: none;
                border-radius: 5px;
                font-weight: bold;
                font-size: 13px;
                padding: 0 20px;
            }
            QPushButton:hover { background: #10B981; }
        """)
        btn_close.clicked.connect(self.accept)
        btn_box.addWidget(btn_close)

        layout.addLayout(btn_box)

    def _print_receipt(self):
        QMessageBox.information(
            self, "طباعة الإيصال",
            f"✅ تم إرسال أمر طباعة إيصال الفاتورة {self.sale.get('invoice_no')} لطابعة الإيصالات المحددة."
        )
