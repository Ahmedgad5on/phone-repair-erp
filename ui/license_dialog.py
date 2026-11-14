"""
ui/license_dialog.py — Desktop License Activation & Offline Package Dialog
Conforming to ThermalLabPro Obsidian & Metallic Gold Design System.
Supports Online Activation, Offline .prolablic Import, WhatsApp Renewal, and Read-Only Fallback.
"""
import logging
from typing import Optional
from PyQt6.QtCore import Qt, QUrl
from PyQt6.QtGui import QClipboard, QDesktopServices, QGuiApplication
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QMessageBox, QFrame, QFileDialog, QTextEdit
)

from core.licensing.client import get_licensing_client, LicensingClient
from core.licensing.machine_id import get_installation_id
from ui.styles import (
    LUXURY_DARK_QSS, ACCENT_GOLD, BG_CARD, BORDER_GLASS,
    TEXT_WHITE, TEXT_SILVER, TEXT_MUTED, STATUS_CONNECTED, STATUS_ALERT, STATUS_WARNING
)

logger = logging.getLogger("thermal_lab.ui.license_dialog")


class LicenseDialog(QDialog):
    """Dialog for entering license keys, offline activation, and checking subscription."""

    def __init__(self, parent=None, client: Optional[LicensingClient] = None):
        super().__init__(parent)
        self.client = client or get_licensing_client()
        self.activated_successfully = False

        self.setWindowTitle("تفعيل الترخيص وإدارة الاشتراك — ProLab Studio")
        self.setFixedSize(540, 620)
        self.setStyleSheet(LUXURY_DARK_QSS)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)

        self._init_ui()
        self._refresh_status_view()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(22, 22, 22, 22)
        layout.setSpacing(14)

        # Status Banner Card
        self.card_status = QFrame()
        self.card_status.setStyleSheet(f"""
            QFrame {{
                background-color: {BG_CARD};
                border: 1px solid {BORDER_GLASS};
                border-radius: 8px;
                padding: 12px;
            }}
        """)
        s_layout = QVBoxLayout(self.card_status)
        s_layout.setSpacing(6)

        self.lbl_status_icon = QLabel("🛡️")
        self.lbl_status_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_status_icon.setStyleSheet("font-size: 28px;")
        s_layout.addWidget(self.lbl_status_icon)

        self.lbl_status_title = QLabel("حالة الترخيص")
        self.lbl_status_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_status_title.setStyleSheet(f"font-size: 16px; font-weight: bold; color: {TEXT_WHITE};")
        s_layout.addWidget(self.lbl_status_title)

        self.lbl_status_detail = QLabel("")
        self.lbl_status_detail.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_status_detail.setWordWrap(True)
        self.lbl_status_detail.setStyleSheet(f"font-size: 12px; color: {TEXT_SILVER};")
        s_layout.addWidget(self.lbl_status_detail)

        layout.addWidget(self.card_status)

        # Device ID Card
        dev_card = QFrame()
        dev_card.setStyleSheet(f"""
            QFrame {{
                background: #151522;
                border: 1px solid {BORDER_GLASS};
                border-radius: 8px;
                padding: 10px;
            }}
        """)
        d_layout = QVBoxLayout(dev_card)
        d_layout.setSpacing(6)

        d_title = QLabel("معرف الجهاز الحالي (Installation ID):")
        d_title.setStyleSheet(f"font-size: 11px; color: {TEXT_MUTED}; font-weight: bold;")
        d_layout.addWidget(d_title)

        dev_row = QHBoxLayout()
        self.lbl_device_id = QLabel(get_installation_id())
        self.lbl_device_id.setStyleSheet(f"font-size: 13px; font-weight: bold; color: {ACCENT_GOLD}; letter-spacing: 1px;")
        dev_row.addWidget(self.lbl_device_id)

        btn_copy = QPushButton("📋 نسخ")
        btn_copy.setFixedWidth(70)
        btn_copy.setStyleSheet(f"background: #252538; color: {TEXT_WHITE}; border-radius: 4px; padding: 4px;")
        btn_copy.clicked.connect(self._copy_device_id)
        dev_row.addWidget(btn_copy)
        d_layout.addLayout(dev_row)

        layout.addWidget(dev_card)

        # Activation Form Card
        form_card = QFrame()
        form_card.setStyleSheet(f"""
            QFrame {{
                background-color: {BG_CARD};
                border: 1px solid {BORDER_GLASS};
                border-radius: 8px;
                padding: 14px;
            }}
        """)
        f_layout = QVBoxLayout(form_card)
        f_layout.setSpacing(10)

        f_layout.addWidget(QLabel("معرف العميل (اختياري - Customer ID أو رقم الهاتف):"))
        self.txt_customer_id = QLineEdit()
        self.txt_customer_id.setPlaceholderText("اختياري (CUST-XXXXXX أو رقم الهاتف)")
        f_layout.addWidget(self.txt_customer_id)

        f_layout.addWidget(QLabel("مفتاح الترخيص (License Key):"))
        self.txt_license_key = QLineEdit()
        self.txt_license_key.setPlaceholderText("TPRO-XXXX-XXXX-XXXX-XXXX")
        f_layout.addWidget(self.txt_license_key)

        act_row = QHBoxLayout()
        self.btn_activate_online = QPushButton("🌐 تفعيل أونلاين عبر الخادم")
        self.btn_activate_online.setObjectName("btnPrimary")
        self.btn_activate_online.setFixedHeight(36)
        self.btn_activate_online.clicked.connect(self._activate_online)
        act_row.addWidget(self.btn_activate_online)

        self.btn_import_offline = QPushButton("📁 استيراد ملف (.prolablic)")
        self.btn_import_offline.setFixedHeight(36)
        self.btn_import_offline.clicked.connect(self._import_offline_file)
        act_row.addWidget(self.btn_import_offline)
        f_layout.addLayout(act_row)

        self.btn_activate_trial = QPushButton("🚀 تفعيل باقة التجربة المجانية (14 يوماً)")
        self.btn_activate_trial.setFixedHeight(34)
        self.btn_activate_trial.setStyleSheet(f"background: #065F46; color: #ECFDF5; border: 1px solid {STATUS_CONNECTED}; font-weight: bold; border-radius: 6px;")
        self.btn_activate_trial.clicked.connect(self._activate_trial)
        f_layout.addWidget(self.btn_activate_trial)

        layout.addWidget(form_card)

        # Bottom Actions: WhatsApp support & Continue / Cancel
        bottom_row = QHBoxLayout()

        btn_whatsapp = QPushButton("💬 طلب ترخيص عبر واتساب (01061943367)")
        btn_whatsapp.setStyleSheet(f"background: #065F46; color: #ECFDF5; border: 1px solid {STATUS_CONNECTED}; font-weight: bold; border-radius: 6px; padding: 8px;")
        btn_whatsapp.clicked.connect(self._open_whatsapp_request)
        bottom_row.addWidget(btn_whatsapp)

        btn_auth = QPushButton("👤 تسجيل الدخول / حساب جديد")
        btn_auth.setStyleSheet(f"background: #1E293B; color: #60A5FA; border: 1px solid #3B82F6; font-weight: bold; border-radius: 6px; padding: 8px;")
        btn_auth.clicked.connect(self._open_auth_dialog)
        bottom_row.addWidget(btn_auth)

        bottom_row.addStretch()

        self.btn_close = QPushButton("متابعة للبرنامج")
        self.btn_close.clicked.connect(self._on_close_clicked)
        bottom_row.addWidget(self.btn_close)

        layout.addLayout(bottom_row)

    def _refresh_status_view(self):
        status_info = self.client.get_license_status()

        if status_info.status == "ACTIVE":
            self.lbl_status_icon.setText("✅")
            self.lbl_status_title.setText(f"الترخيص نشط — باقة: {status_info.plan_name or status_info.plan_code}")
            self.lbl_status_title.setStyleSheet(f"font-size: 16px; font-weight: bold; color: {STATUS_CONNECTED};")
            self.lbl_status_detail.setText(
                f"صالح حتى: {status_info.valid_until_utc.strftime('%Y-%m-%d %H:%M UTC') if status_info.valid_until_utc else 'دائم'}\n"
                f"المتبقي: {status_info.days_remaining} يوم و {status_info.hours_remaining} ساعة."
            )
            self.card_status.setStyleSheet(f"QFrame {{ background: #06281E; border: 1px solid {STATUS_CONNECTED}; border-radius: 8px; padding: 12px; }}")
            self.btn_close.setText("متابعة للبرنامج")
            self.btn_close.setObjectName("btnPrimary")

        elif status_info.status == "GRACE_PERIOD":
            self.lbl_status_icon.setText("⏳")
            self.lbl_status_title.setText("أنت في فترة السماح المؤقتة!")
            self.lbl_status_title.setStyleSheet(f"font-size: 16px; font-weight: bold; color: {STATUS_WARNING};")
            self.lbl_status_detail.setText(
                f"{status_info.message}\n"
                f"يرجى التجديد لتجنب إيقاف العمليات وتفعيل وضع القراءة فقط."
            )
            self.card_status.setStyleSheet(f"QFrame {{ background: #2B1D0C; border: 1px solid {STATUS_WARNING}; border-radius: 8px; padding: 12px; }}")
            self.btn_close.setText("متابعة خلال فترة السماح")

        elif status_info.status == "EXPIRED":
            self.lbl_status_icon.setText("⚠️")
            self.lbl_status_title.setText("انتهت صلاحية الاشتراك وفترة السماح")
            self.lbl_status_title.setStyleSheet(f"font-size: 16px; font-weight: bold; color: {STATUS_ALERT};")
            self.lbl_status_detail.setText(
                "تم تفعيل وضع القراءة فقط (Read-Only Mode).\n"
                "يمكنك استعراض الفواتير والتقارير والنسخ الاحتياطي، ولكن لا يمكن إضافة عمليات جديدة حتى التجديد."
            )
            self.card_status.setStyleSheet(f"QFrame {{ background: #2D1515; border: 1px solid {STATUS_ALERT}; border-radius: 8px; padding: 12px; }}")
            self.btn_close.setText("متابعة (وضع القراءة فقط)")

        elif status_info.status == "CLOCK_ROLLBACK_DETECTED":
            self.lbl_status_icon.setText("🚨")
            self.lbl_status_title.setText("تنبيه أمان: تم رصد تغيير في توقيت النظام")
            self.lbl_status_title.setStyleSheet(f"font-size: 16px; font-weight: bold; color: {STATUS_ALERT};")
            self.lbl_status_detail.setText(status_info.message)
            self.card_status.setStyleSheet(f"QFrame {{ background: #2D1515; border: 1px solid {STATUS_ALERT}; border-radius: 8px; padding: 12px; }}")
            self.btn_close.setText("متابعة (وضع القراءة فقط)")

        else:
            self.lbl_status_icon.setText("🛡️")
            self.lbl_status_title.setText("البرنامج غير مفعل حالياً")
            self.lbl_status_title.setStyleSheet(f"font-size: 16px; font-weight: bold; color: {TEXT_WHITE};")
            self.lbl_status_detail.setText(status_info.message)
            self.card_status.setStyleSheet(f"QFrame {{ background: {BG_CARD}; border: 1px solid {BORDER_GLASS}; border-radius: 8px; padding: 12px; }}")
            self.btn_close.setText("متابعة (وضع القراءة فقط)")

    def _copy_device_id(self):
        clipboard = QGuiApplication.clipboard()
        clipboard.setText(get_installation_id())
        QMessageBox.information(self, "تم النسخ", "تم نسخ معرف الجهاز إلى الحافظة بنجاح.")

    def _activate_online(self):
        cust_id = self.txt_customer_id.text().strip() or None
        key = self.txt_license_key.text().strip()

        if not key:
            QMessageBox.warning(self, "حقل مطلوب", "يرجى إدخال مفتاح الترخيص (License Key).")
            return

        self.btn_activate_online.setEnabled(False)
        self.btn_activate_online.setText("جاري التفعيل...")

        ok, msg, _ = self.client.activate_online(cust_id, key)
        self.btn_activate_online.setEnabled(True)
        self.btn_activate_online.setText("🌐 تفعيل أونلاين عبر الخادم")

        if ok:
            self.activated_successfully = True
            QMessageBox.information(self, "نجاح التفعيل", "تهانينا! تم تفعيل ترخيص ProLab Studio بنجاح.")
            self._refresh_status_view()
            self.accept()
        else:
            QMessageBox.critical(self, "فشل التفعيل", f"تعذر تفعيل الترخيص:\n{msg}")

    def _activate_trial(self):
        cust_id = self.txt_customer_id.text().strip() or None
        self.btn_activate_trial.setEnabled(False)
        self.btn_activate_trial.setText("جاري تفعيل التجربة...")

        ok, msg, _ = self.client.activate_trial(customer_id=cust_id)
        self.btn_activate_trial.setEnabled(True)
        self.btn_activate_trial.setText("🚀 تفعيل باقة التجربة المجانية (14 يوماً)")

        if ok:
            self.activated_successfully = True
            QMessageBox.information(self, "نجاح التفعيل", "تهانينا! تم تفعيل باقة التجربة المجانية لمدة 14 يوماً بنجاح.")
            self._refresh_status_view()
            self.accept()
        else:
            QMessageBox.warning(self, "تعذر تفعيل التجربة", f"تعذر تفعيل باقة التجربة المجانية:\n{msg}")

    def _import_offline_file(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "اختر ملف الترخيص المشفر",
            "",
            "ProLab License Files (*.prolablic *.json);;All Files (*)"
        )
        if not file_path:
            return

        ok, msg = self.client.import_offline_license(file_path)
        if ok:
            self.activated_successfully = True
            QMessageBox.information(self, "نجاح الاستيراد", "تم استيراد وتفعيل ملف الترخيص المشفر بنجاح!")
            self._refresh_status_view()
            self.accept()
        else:
            QMessageBox.critical(self, "فشل الاستيراد", f"تعذر استيراد الترخيص:\n{msg}")

    def _open_whatsapp_request(self):
        try:
            import webbrowser
            from urllib.parse import quote
            dev_id = get_installation_id()
            cust_id = self.txt_customer_id.text().strip() or "جديد"
            msg_text = (
                f"مرحباً م/ أحمد جادالله،\n"
                f"أود تفعيل ترخيص واشتراك برنامج ThermalLabPro Commercial ERP.\n"
                f"• كود العميل: {cust_id}\n"
                f"• معرف جهازي (Installation ID):\n{dev_id}\n\n"
                f"يرجى تزويدي بمفتاح الترخيص وكود التفعيل."
            )
            url = f"https://wa.me/201061943367?text={quote(msg_text)}"
            webbrowser.open(url)
        except Exception as e:
            logger.error("Error opening WhatsApp request: %s", e)

    def _open_auth_dialog(self):
        from ui.auth_dialog import AuthDialog
        dlg = AuthDialog(self, client=self.client)
        if dlg.exec() == QDialog.DialogCode.Accepted:
            self._refresh_status_view()

    def _on_close_clicked(self):
        self.accept()
