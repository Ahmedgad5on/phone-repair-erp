"""
ui/trade_in_dialog.py — 1-Click Unified Trade-In Terminal & Modal (Shortcut: F3)
Combines Customer Old Device Intake + Store Device Checkout + Net Collection Calculation.
"""
from datetime import datetime
import os
from typing import Optional, Dict, Any

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QWidget, QDialog, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QDoubleSpinBox, QPushButton, QMessageBox, QFrame,
    QComboBox, QFileDialog, QSplitter
)

from core.database import DatabaseManager, encode_cost_cipher, DEFAULT_CIPHER_KEY
from core.models import DeviceRecord, SaleRecord


class TradeInWidget(QWidget):
    """Full-page Trade-in terminal view."""
    trade_in_completed = pyqtSignal(dict)

    def __init__(self, db: DatabaseManager, current_role: str = "Owner", current_user: str = "Staff", parent=None):
        super().__init__(parent)
        self.db = db
        self.current_role = current_role
        self.current_user = current_user
        self.store_device: Optional[Dict[str, Any]] = None
        self._kyc_photo: str = ""

        self._init_ui()

    def set_user_role(self, role: str, user_name: str):
        self.current_role = role
        self.current_user = user_name

    def _init_ui(self):
        root_layout = QVBoxLayout(self)
        root_layout.setContentsMargins(14, 14, 14, 14)
        root_layout.setSpacing(10)

        title_card = QFrame()
        title_card.setObjectName("card")
        t_layout = QHBoxLayout(title_card)
        lbl_title = QLabel("🔄 عملية استبدال جهاز قديم بآخر من المحل (1-Click Unified Trade-In)")
        lbl_title.setObjectName("title")
        t_layout.addWidget(lbl_title)
        root_layout.addWidget(title_card)

        # Splitter: Left (Store Device Out) | Right (Customer Old Device In)
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # PANE 1: Customer Old Device (Intake / Trade-in)
        pane_in = QFrame()
        pane_in.setObjectName("card")
        l_in = QGridLayout(pane_in)
        l_in.setSpacing(8)

        lbl_in_hdr = QLabel("📥 1. بيانات جهاز العميل القديم (المستبدل)")
        lbl_in_hdr.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 13px;")
        l_in.addWidget(lbl_in_hdr, 0, 0, 1, 2)

        l_in.addWidget(QLabel("ماركة / موديل القديم:"), 1, 0)
        self.txt_in_model = QLineEdit()
        self.txt_in_model.setPlaceholderText("مثال: iPhone 12 Pro 128GB")
        l_in.addWidget(self.txt_in_model, 1, 1)

        l_in.addWidget(QLabel("السريال / IMEI:"), 2, 0)
        self.txt_in_imei = QLineEdit()
        self.txt_in_imei.setPlaceholderText("15 رقماً")
        l_in.addWidget(self.txt_in_imei, 2, 1)

        l_in.addWidget(QLabel("حالة الجهاز والبطارية:"), 3, 0)
        h_cond = QHBoxLayout()
        self.txt_in_color = QLineEdit()
        self.txt_in_color.setPlaceholderText("اللون")
        h_cond.addWidget(self.txt_in_color)

        self.txt_in_batt = QLineEdit()
        self.txt_in_batt.setPlaceholderText("البطارية %")
        h_cond.addWidget(self.txt_in_batt)
        l_in.addLayout(h_cond, 3, 1)

        l_in.addWidget(QLabel("قيمة التثمين المقدرة (Allowance):"), 4, 0)
        self.sp_in_allowance = QDoubleSpinBox()
        self.sp_in_allowance.setRange(0, 500000)
        self.sp_in_allowance.setSingleStep(100)
        self.sp_in_allowance.valueChanged.connect(self._recalc_net)
        l_in.addWidget(self.sp_in_allowance, 4, 1)

        l_in.addWidget(QLabel("اسم ورقم هاتف العميل:"), 5, 0)
        h_cust = QHBoxLayout()
        self.txt_cust_name = QLineEdit()
        self.txt_cust_name.setPlaceholderText("الاسم")
        h_cust.addWidget(self.txt_cust_name)
        self.txt_cust_phone = QLineEdit()
        self.txt_cust_phone.setPlaceholderText("الهاتف")
        h_cust.addWidget(self.txt_cust_phone)
        l_in.addLayout(h_cust, 5, 1)

        self.btn_in_kyc = QPushButton("📷 إرفاق بطاقة العميل")
        self.btn_in_kyc.clicked.connect(self._choose_kyc)
        l_in.addWidget(self.btn_in_kyc, 6, 0)

        self.lbl_in_kyc_status = QLabel("بدون صورة")
        self.lbl_in_kyc_status.setStyleSheet("color: #9CA3AF;")
        l_in.addWidget(self.lbl_in_kyc_status, 6, 1)

        splitter.addWidget(pane_in)

        # PANE 2: Store Device (Checkout / Sell)
        pane_out = QFrame()
        pane_out.setObjectName("card")
        l_out = QGridLayout(pane_out)
        l_out.setSpacing(8)

        lbl_out_hdr = QLabel("📤 2. اختيار جهاز المحل المراد بيعه للعميل")
        lbl_out_hdr.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 13px;")
        l_out.addWidget(lbl_out_hdr, 0, 0, 1, 2)

        l_out.addWidget(QLabel("بحث في مخزن المحل:"), 1, 0)
        h_scan = QHBoxLayout()
        self.txt_out_code = QLineEdit()
        self.txt_out_code.setPlaceholderText("اكتب اسم الموديل أو الماركة أو امسح الباركود...")
        self.txt_out_code.returnPressed.connect(self._find_store_device)
        self.txt_out_code.textChanged.connect(self._on_search_text_changed)
        h_scan.addWidget(self.txt_out_code)
        btn_scan = QPushButton("🔍 بحث")
        btn_scan.clicked.connect(self._find_store_device)
        h_scan.addWidget(btn_scan)
        l_out.addLayout(h_scan, 1, 1)

        l_out.addWidget(QLabel("قائمة الأجهزة المتوفرة:"), 2, 0)
        self.cb_store_devices = QComboBox()
        self.cb_store_devices.currentIndexChanged.connect(self._on_store_device_selected)
        l_out.addWidget(self.cb_store_devices, 2, 1)

        l_out.addWidget(QLabel("جهاز المحل المختار:"), 3, 0)
        self.lbl_out_dev = QLabel("— لم يتم الاختيار —")
        self.lbl_out_dev.setStyleSheet("color: #10B981; font-weight: bold; font-size: 13px;")
        l_out.addWidget(self.lbl_out_dev, 3, 1)

        l_out.addWidget(QLabel("سعر بيع جهاز المحل:"), 4, 0)
        self.sp_out_price = QDoubleSpinBox()
        self.sp_out_price.setRange(0, 1000000)
        self.sp_out_price.setSingleStep(100)
        self.sp_out_price.valueChanged.connect(self._recalc_net)
        l_out.addWidget(self.sp_out_price, 4, 1)

        l_out.addWidget(QLabel("أقل سعر مسموح (Min):"), 5, 0)
        self.lbl_out_min = QLabel("0.00 ج.م")
        self.lbl_out_min.setStyleSheet("color: #EF4444; font-weight: bold;")
        l_out.addWidget(self.lbl_out_min, 5, 1)

        l_out.addWidget(QLabel("طريقة سداد الفرق:"), 6, 0)
        self.cb_diff_method = QComboBox()
        self.cb_diff_method.addItems(["Cash (نقدي)", "InstaPay (إنستاباي)", "Vodafone Cash", "Trader Credit"])
        l_out.addWidget(self.cb_diff_method, 6, 1)

        splitter.addWidget(pane_out)
        root_layout.addWidget(splitter)

        # Preload store in-stock devices
        self._populate_store_devices()

        # Financial Settlement Footer
        settle_card = QFrame()
        settle_card.setObjectName("card-highlight")
        s_layout = QHBoxLayout(settle_card)

        s_layout.addWidget(QLabel("💰 صافي المبلغ المطلوب تحصيله من العميل:"))
        self.lbl_net_diff = QLabel("0.00 ج.م")
        self.lbl_net_diff.setStyleSheet("font-size: 20px; font-weight: 800; color: #D4AF37;")
        s_layout.addWidget(self.lbl_net_diff)

        s_layout.addStretch()

        self.btn_execute = QPushButton("🔄 إتمام الاستبدال وطباعة الملصق والفاتورة")
        self.btn_execute.setObjectName("btnPrimary")
        self.btn_execute.clicked.connect(self._execute_trade_in)
        s_layout.addWidget(self.btn_execute)

        root_layout.addWidget(settle_card)

        # Initial populate of in-stock store devices from database
        self._populate_store_devices()

    def load_store_devices(self):
        """Public refresh method to sync live inventory with database."""
        self._populate_store_devices()

    def showEvent(self, event):
        super().showEvent(event)
        self.load_store_devices()

    def _choose_kyc(self):
        f, _ = QFileDialog.getOpenFileName(self, "اختيار صورة البطاقة", "", "Images (*.png *.jpg *.jpeg)")
        if f:
            self._kyc_photo = f
            self.lbl_in_kyc_status.setText(f"✓ {os.path.basename(f)}")
            self.lbl_in_kyc_status.setStyleSheet("color: #10B981; font-weight: bold;")

    def _populate_store_devices(self, filter_query: str = ""):
        """Populates the in-stock store devices combobox."""
        self.cb_store_devices.blockSignals(True)
        self.cb_store_devices.clear()
        self.cb_store_devices.addItem("— اختر جهاز المحل من القائمة —", None)

        if filter_query:
            devices = self.db.search_devices(query=filter_query, status="in_stock", limit=50)
        else:
            devices = self.db.search_devices(status="in_stock", limit=100)

        for d in devices:
            cond_str = "جديد" if d.get("condition") == "New" else "مستعمل"
            label = f"📱 {d.get('brand')} {d.get('model_name')} ({d.get('storage') or '-'}) - {d.get('color') or '-'} | {float(d.get('target_selling_price') or 0):,.0f} ج.م [{cond_str} - كود: {d.get('stock_no')}]"
            self.cb_store_devices.addItem(label, d)

        self.cb_store_devices.blockSignals(False)

    def _on_search_text_changed(self, text: str):
        query = text.strip()
        self._populate_store_devices(filter_query=query)
        if self.cb_store_devices.count() > 1:
            self.cb_store_devices.setCurrentIndex(1)
        else:
            self.cb_store_devices.setCurrentIndex(0)

    def _on_store_device_selected(self, index: int):
        data = self.cb_store_devices.currentData()
        if not data:
            self.store_device = None
            self.lbl_out_dev.setText("— لم يتم الاختيار —")
            self.sp_out_price.setValue(0)
            self.lbl_out_min.setText("0.00 ج.م")
            self._recalc_net()
            return

        self.store_device = data
        cond_str = "🆕 جديد" if data.get("condition") == "New" else "✨ مستعمل"
        self.lbl_out_dev.setText(f"✓ {data['brand']} {data['model_name']} ({data['storage'] or '-'}) — {data['color'] or '-'} [{cond_str}]")
        self.sp_out_price.setValue(float(data.get("target_selling_price") or 0.0))
        self.lbl_out_min.setText(f"{float(data.get('min_allowed_price') or 0.0):,.0f} ج.م")
        self._recalc_net()

    def _find_store_device(self):
        code = self.txt_out_code.text().strip()
        if not code:
            self._populate_store_devices()
            return

        # 1. Exact lookup by Stock No or IMEI
        dev = self.db.get_device_by_imei_or_stock(code)
        if dev and dev.get("status") == "in_stock":
            self.store_device = dev
            self._populate_store_devices(filter_query=code)
            if self.cb_store_devices.count() > 1:
                self.cb_store_devices.setCurrentIndex(1)
        else:
            # 2. Multi-field search in stock across brand, model, storage, color, imei
            matches = self.db.search_devices(query=code, status="in_stock", limit=50)
            if matches:
                dev = matches[0]
                self.store_device = dev
                self._populate_store_devices(filter_query=code)
                if self.cb_store_devices.count() > 1:
                    self.cb_store_devices.setCurrentIndex(1)
            else:
                QMessageBox.warning(self, "غير متاح بالمخزن", f"لم يتم العثور على أجهزة متوفرة بالمخزن مطابقة لـ: '{code}'.\nتأكد من إدخال اسم الموديل أو السريال بشكل صحيح.")
                return

        cond_str = "🆕 جديد" if dev.get("condition") == "New" else "✨ مستعمل"
        self.lbl_out_dev.setText(f"✓ {dev['brand']} {dev['model_name']} ({dev['storage'] or '-'}) — {dev['color'] or '-'} [{cond_str}]")
        self.sp_out_price.setValue(float(dev.get("target_selling_price") or 0.0))
        self.lbl_out_min.setText(f"{float(dev.get('min_allowed_price') or 0.0):,.0f} ج.م")
        self._recalc_net()

    def _recalc_net(self):
        store_p = self.sp_out_price.value()
        allowance = self.sp_in_allowance.value()
        net = store_p - allowance
        self.lbl_net_diff.setText(f"{net:,.2f} ج.م")
        if net < 0:
            self.lbl_net_diff.setStyleSheet("font-size: 20px; font-weight: 800; color: #EF4444;")
        else:
            self.lbl_net_diff.setStyleSheet("font-size: 20px; font-weight: 800; color: #10B981;")

    def _execute_trade_in(self) -> bool:
        if not self.store_device:
            QMessageBox.warning(self, "تنبيه", "يرجى اختيار جهاز المحل المراد بيعه أولاً!")
            self.txt_out_code.setFocus()
            return False

        in_model = self.txt_in_model.text().strip()
        if not in_model:
            QMessageBox.warning(self, "تنبيه", "يرجى إدخال اسم وموديل جهاز العميل القديم!")
            self.txt_in_model.setFocus()
            return False

        store_p = self.sp_out_price.value()
        min_p = self.store_device["min_allowed_price"]
        if store_p < min_p and self.current_role != "Owner":
            from ui.pin_dialog import PinDialog
            dlg = PinDialog(db=self.db, required_role="Owner", parent=self)
            if dlg.exec() != QDialog.DialogCode.Accepted:
                QMessageBox.warning(self, "مرفوض", "تم رفض العملية! سعر الجهاز أقل من الحد الأدنى ويتطلب موافقة المالك.")
                return False

        allowance = self.sp_in_allowance.value()
        net_diff = store_p - allowance

        # 1. Intake customer old device
        cipher_key = self.db.get_setting("cipher_key", DEFAULT_CIPHER_KEY)
        in_stock_no = self.db.get_next_stock_no()
        cust_dev = DeviceRecord(
            stock_no=in_stock_no,
            condition="Used",
            brand="Trade-In",
            model_name=in_model,
            color=self.txt_in_color.text().strip(),
            imei1=self.txt_in_imei.text().strip(),
            buy_price=allowance,
            target_selling_price=allowance * 1.2,
            min_allowed_price=allowance * 1.1,
            secret_cost_cipher=encode_cost_cipher(allowance, cipher_key),
            status="in_stock",
            seller_name=self.txt_cust_name.text().strip(),
            seller_phone=self.txt_cust_phone.text().strip(),
            seller_id_photo=self._kyc_photo,
            remarks=f"Trade-in exchange for {self.store_device['stock_no']}"
        )
        in_dev_id = self.db.insert_device(
            device=cust_dev,
            user_role=self.current_role,
            user_name=self.current_user
        )

        # 2. Checkout store device with trade-in link
        sale = SaleRecord(
            invoice_no=self.db.get_next_invoice_no(),
            sale_date=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            device_id=self.store_device["id"],
            salesperson=self.current_user,
            customer_name=self.txt_cust_name.text().strip(),
            customer_phone=self.txt_cust_phone.text().strip(),
            selling_price=self.store_device["target_selling_price"],
            discount=max(0.0, self.store_device["target_selling_price"] - store_p),
            final_price=store_p,
            payment_method=self.cb_diff_method.currentText(),
            cash_amount=net_diff if "Cash" in self.cb_diff_method.currentText() else 0.0,
            instapay_amount=net_diff if "InstaPay" in self.cb_diff_method.currentText() else 0.0,
            trade_in_device_id=in_dev_id,
            trade_in_allowance=allowance,
            net_collected=net_diff,
            status="completed",
            notes=f"Trade-In Old: {in_model} (STK: {in_stock_no})"
        )

        try:
            sale_id = self.db.process_sale(
                sale=sale,
                user_role=self.current_role,
                user_name=self.current_user
            )
            QMessageBox.information(
                self, "تم الاستبدال بنجاح",
                f"✅ تمت عملية الاستبدال بنجاح!\n"
                f"• تم إدخال القديم للمخزن بكود: {in_stock_no}\n"
                f"• تم بيع جهاز المحل بفاتورة: {sale.invoice_no}\n"
                f"• صافي التحصيل: {net_diff:,.2f} ج.م"
            )
            data = {"sale": sale.to_dict(), "intake_device": cust_dev.to_dict()}
            self.trade_in_completed.emit(data)
            self._clear_form()
            return True
        except Exception as e:
            QMessageBox.critical(self, "خطأ", f"فشلت عملية الاستبدال: {e}")
            return False

    def _clear_form(self):
        self.txt_in_model.clear()
        self.txt_in_imei.clear()
        self.txt_in_color.clear()
        self.txt_in_batt.clear()
        self.sp_in_allowance.setValue(0)
        self.txt_cust_name.clear()
        self.txt_cust_phone.clear()
        self._kyc_photo = ""
        self.lbl_in_kyc_status.setText("بدون صورة")
        self.txt_out_code.clear()
        self.lbl_out_dev.setText("— لم يتم الاختيار —")
        self.sp_out_price.setValue(0)
        self.lbl_out_min.setText("0.00 ج.م")
        self.lbl_net_diff.setText("0.00 ج.م")
        self.store_device = None


class TradeInDialog(QDialog):
    """Unified 1-Click Trade-in Modal (F3)."""
    trade_in_completed = pyqtSignal(dict)

    def __init__(self, db: DatabaseManager, current_role: str = "Owner", current_user: str = "Staff", parent=None):
        super().__init__(parent)
        self.setWindowTitle("🔄 استبدال فوري موحد (1-Click Unified Trade-In — F3)")
        self.setMinimumSize(920, 620)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)
        self.widget = TradeInWidget(db=db, current_role=current_role, current_user=current_user, parent=self)
        self.widget.trade_in_completed.connect(self._on_done)
        layout.addWidget(self.widget)

    def _on_done(self, data: dict):
        self.trade_in_completed.emit(data)
        self.accept()
