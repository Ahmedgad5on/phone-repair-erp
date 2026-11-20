"""
ui/auth_dialog.py — Customer Authentication & Self-Service Registration Dialog
Conforming to ThermalLabPro Obsidian & Metallic Gold Design System.
Supports Login, Show/Hide Password, OTP Phone Verification, and Self-Registration.
"""
import logging
from typing import Optional, Dict, Any
from PyQt6.QtCore import Qt, QTimer, QUrl
from PyQt6.QtGui import QIcon, QDesktopServices
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QMessageBox, QFrame, QTabWidget, QWidget,
    QCheckBox, QComboBox, QProgressBar, QScrollArea
)

from core.licensing.client import get_licensing_client, LicensingClient
from core.licensing.machine_id import get_installation_id
from ui.styles import (
    LUXURY_DARK_QSS, ACCENT_GOLD, BG_CARD, BORDER_GLASS,
    TEXT_WHITE, TEXT_SILVER, TEXT_MUTED, STATUS_CONNECTED, STATUS_ALERT, STATUS_WARNING
)

logger = logging.getLogger("thermal_lab.ui.auth_dialog")

EGYPT_CITIES = [
    "القاهرة (Cairo)", "الجيزة (Giza)", "الإسكندرية (Alexandria)",
    "الدقهلية - المنصورة (Mansoura)", "الغربية - طنطا (Tanta)", "الشرقية - الزقازيق (Zagazig)",
    "القليوبية - بنها (Banha)", "المنوفية - شبين الكوم", "البحيرة - دمنهور",
    "دمياط (Damietta)", "بورسعيد (Port Said)", "الإسماعيلية (Ismailia)",
    "السويس (Suez)", "كفر الشيخ (Kafr El Sheikh)", "الفيوم (Fayoum)",
    "بني سويف (Beni Suef)", "المنيا (Minya)", "أسيوط (Assiut)",
    "سوهاج (Sohag)", "قنا (Qena)", "الأقصر (Luxor)", "أسوان (Aswan)",
    "البحر الأحمر - الغردقة", "جنوب سيناء - شرم الشيخ", "شمال سيناء", "مطروح"
]


class AuthDialog(QDialog):
    """Integrated Login and Customer Self-Registration Dialog."""

    def __init__(self, parent=None, client: Optional[LicensingClient] = None):
        super().__init__(parent)
        self.client = client or get_licensing_client()
        self.authenticated = False
        self.customer_data: Optional[Dict[str, Any]] = None

        self._otp_timer = QTimer(self)
        self._otp_cooldown = 0
        self._otp_timer.timeout.connect(self._update_otp_countdown)

        self.setWindowTitle("تسجيل الدخول وإدارة الحساب — ProLab Studio")
        self.setMinimumSize(520, 680)
        self.resize(540, 720)
        self.setStyleSheet(LUXURY_DARK_QSS)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)

        self._init_ui()

    def _init_ui(self):
        root_layout = QVBoxLayout(self)
        root_layout.setContentsMargins(20, 20, 20, 20)
        root_layout.setSpacing(14)

        # Header branding
        header_card = QFrame()
        header_card.setStyleSheet(f"""
            QFrame {{
                background-color: {BG_CARD};
                border: 1px solid {BORDER_GLASS};
                border-radius: 8px;
                padding: 10px;
            }}
        """)
        h_layout = QVBoxLayout(header_card)
        h_layout.setSpacing(4)
        h_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        title_lbl = QLabel("🛡️ ProLab Commercial Licensing")
        title_lbl.setStyleSheet(f"color: {ACCENT_GOLD}; font-size: 17px; font-weight: bold;")
        title_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        h_layout.addWidget(title_lbl)

        sub_lbl = QLabel(f"معرف الجهاز: {get_installation_id()}")
        sub_lbl.setStyleSheet(f"color: {TEXT_MUTED}; font-size: 11px;")
        sub_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        h_layout.addWidget(sub_lbl)

        root_layout.addWidget(header_card)

        # Tabs: Login vs Register
        self.tabs = QTabWidget()
        self.tabs.setStyleSheet(f"""
            QTabWidget::pane {{
                border: 1px solid {BORDER_GLASS};
                background: {BG_CARD};
                border-radius: 8px;
            }}
            QTabBar::tab {{
                background: #14141E;
                color: {TEXT_SILVER};
                font-weight: bold;
                padding: 10px 24px;
                border-top-left-radius: 6px;
                border-top-right-radius: 6px;
                margin-right: 4px;
            }}
            QTabBar::tab:selected {{
                background: {BG_CARD};
                color: {ACCENT_GOLD};
                border-bottom: 2px solid {ACCENT_GOLD};
            }}
        """)

        self.tab_login = QWidget()
        self.tab_register = QWidget()

        self._build_login_tab()
        self._build_register_tab()

        self.tabs.addTab(self.tab_login, "تسجيل الدخول")
        self.tabs.addTab(self.tab_register, "إنشاء حساب جديد")
        root_layout.addWidget(self.tabs)

        # Status / Error Banner
        self.lbl_status = QLabel("")
        self.lbl_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_status.setWordWrap(True)
        self.lbl_status.hide()
        root_layout.addWidget(self.lbl_status)

        # Bottom help & support links
        footer_layout = QHBoxLayout()
        btn_offline = QPushButton("🔑 إدخال ترخيص / بدون إنترنت")
        btn_offline.setStyleSheet(f"color: {ACCENT_GOLD}; background: transparent; border: none; font-size: 12px; font-weight: bold; text-decoration: underline;")
        btn_offline.clicked.connect(self._open_license_dialog)
        footer_layout.addWidget(btn_offline)

        footer_layout.addStretch()

        btn_support = QPushButton("💬 دعم واتساب: 01061943367")
        btn_support.setStyleSheet(f"color: {STATUS_CONNECTED}; background: transparent; border: none; font-size: 12px; font-weight: bold; text-decoration: underline;")
        btn_support.clicked.connect(self._open_whatsapp_support)
        footer_layout.addWidget(btn_support)

        root_layout.addLayout(footer_layout)

    # -------------------------------------------------------------
    # Login Tab
    # -------------------------------------------------------------

    def _build_login_tab(self):
        layout = QVBoxLayout(self.tab_login)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(12)

        lbl_user = QLabel("اسم المستخدم أو رقم الهاتف:")
        lbl_user.setStyleSheet(f"color: {TEXT_SILVER}; font-size: 12px; font-weight: bold;")
        self.txt_login_user = QLineEdit()
        self.txt_login_user.setPlaceholderText("مثال: ahmed_shop أو 01012345678")
        layout.addWidget(lbl_user)
        layout.addWidget(self.txt_login_user)

        lbl_pass = QLabel("كلمة المرور:")
        lbl_pass.setStyleSheet(f"color: {TEXT_SILVER}; font-size: 12px; font-weight: bold;")
        layout.addWidget(lbl_pass)

        pass_row = QHBoxLayout()
        self.txt_login_pass = QLineEdit()
        self.txt_login_pass.setEchoMode(QLineEdit.EchoMode.Password)
        self.txt_login_pass.setPlaceholderText("اكتب كلمة المرور هنا")
        self.txt_login_pass.setStyleSheet("color: #FFFFFF; font-size: 13px; font-weight: bold; background-color: #1E1E28; border: 1px solid #38384A; border-radius: 6px; padding: 6px 10px;")
        pass_row.addWidget(self.txt_login_pass)

        self.btn_toggle_pass = QPushButton("👁️")
        self.btn_toggle_pass.setFixedWidth(40)
        self.btn_toggle_pass.setToolTip("إظهار / إخفاء كلمة المرور")
        self.btn_toggle_pass.clicked.connect(self._toggle_password_visibility)
        pass_row.addWidget(self.btn_toggle_pass)
        layout.addLayout(pass_row)

        # Stay logged in & Remember options
        self.chk_stay_logged_in = QCheckBox("☑️ البقاء مسجلاً في البرنامج دائماً (عدم طلب تسجيل الدخول لاحقاً)")
        self.chk_stay_logged_in.setChecked(True)
        self.chk_stay_logged_in.setStyleSheet(f"color: {ACCENT_GOLD}; font-size: 12px; font-weight: bold; padding: 4px 0px;")
        layout.addWidget(self.chk_stay_logged_in)

        opts_row = QHBoxLayout()
        self.chk_remember = QCheckBox("تذكر اسم المستخدم")
        self.chk_remember.setChecked(True)
        opts_row.addWidget(self.chk_remember)

        opts_row.addStretch()

        btn_forgot = QPushButton("نسيت كلمة المرور؟")
        btn_forgot.setStyleSheet(f"color: {TEXT_MUTED}; background: transparent; border: none; font-size: 11px;")
        btn_forgot.clicked.connect(self._forgot_password_clicked)
        opts_row.addWidget(btn_forgot)
        layout.addLayout(opts_row)

        layout.addSpacing(10)

        self.btn_do_login = QPushButton("تسجيل الدخول للمنظومة")
        self.btn_do_login.setObjectName("btnPrimary")
        self.btn_do_login.setFixedHeight(40)
        self.btn_do_login.clicked.connect(self._handle_login)
        layout.addWidget(self.btn_do_login)

        # License Key Activation Button on Login Tab
        self.btn_open_license = QPushButton("🔑 تفعيل مفتاح ترخيص أو تجديد اشتراك (License Key)")
        self.btn_open_license.setFixedHeight(36)
        self.btn_open_license.setStyleSheet(f"background: #181824; color: {ACCENT_GOLD}; border: 1px solid {ACCENT_GOLD}; font-weight: bold; border-radius: 6px;")
        self.btn_open_license.clicked.connect(self._open_license_dialog)
        layout.addWidget(self.btn_open_license)

        # WhatsApp Activation Button on Login Tab
        self.btn_wa_login = QPushButton("💬 تفعيل وطلب اشتراك عبر واتساب (01061943367)")
        self.btn_wa_login.setFixedHeight(36)
        self.btn_wa_login.setStyleSheet(f"background: #065F46; color: #ECFDF5; border: 1px solid {STATUS_CONNECTED}; font-weight: bold; border-radius: 6px;")
        self.btn_wa_login.clicked.connect(self._open_whatsapp_activation)
        layout.addWidget(self.btn_wa_login)

        layout.addStretch()

    # -------------------------------------------------------------
    # Registration Tab
    # -------------------------------------------------------------

    def _build_register_tab(self):
        tab_vbox = QVBoxLayout(self.tab_register)
        tab_vbox.setContentsMargins(0, 0, 0, 0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("QScrollArea { border: none; background: transparent; }")
        scroll_content = QWidget()
        layout = QVBoxLayout(scroll_content)
        layout.setContentsMargins(16, 12, 16, 12)
        layout.setSpacing(8)

        # Full Name & Shop Name
        name_row = QHBoxLayout()
        v1 = QVBoxLayout()
        v1.addWidget(QLabel("الاسم بالكامل:"))
        self.txt_reg_name = QLineEdit()
        self.txt_reg_name.setPlaceholderText("الاسم ثلاثي")
        self.txt_reg_name.setStyleSheet("color: #FFFFFF; font-size: 13px; font-weight: bold; background-color: #1E1E28; border: 1px solid #38384A; border-radius: 6px; padding: 6px 10px;")
        v1.addWidget(self.txt_reg_name)
        name_row.addLayout(v1)

        v2 = QVBoxLayout()
        v2.addWidget(QLabel("اسم المحل / النشاط:"))
        self.txt_reg_shop = QLineEdit()
        self.txt_reg_shop.setPlaceholderText("مثال: البرنس فون")
        self.txt_reg_shop.setStyleSheet("color: #FFFFFF; font-size: 13px; font-weight: bold; background-color: #1E1E28; border: 1px solid #38384A; border-radius: 6px; padding: 6px 10px;")
        v2.addWidget(self.txt_reg_shop)
        name_row.addLayout(v2)
        layout.addLayout(name_row)

        # Username & City
        user_row = QHBoxLayout()
        v3 = QVBoxLayout()
        v3.addWidget(QLabel("اسم المستخدم:"))
        self.txt_reg_username = QLineEdit()
        self.txt_reg_username.setPlaceholderText("prince_mobile أو اسمك")
        self.txt_reg_username.setStyleSheet("color: #FFFFFF; font-size: 13px; font-weight: bold; background-color: #1E1E28; border: 1px solid #38384A; border-radius: 6px; padding: 6px 10px;")
        v3.addWidget(self.txt_reg_username)
        user_row.addLayout(v3)

        v4 = QVBoxLayout()
        v4.addWidget(QLabel("المحافظة / المدينة:"))
        self.cmb_reg_city = QComboBox()
        self.cmb_reg_city.addItems(EGYPT_CITIES)
        v4.addWidget(self.cmb_reg_city)
        user_row.addLayout(v4)
        layout.addLayout(user_row)

        # Phone with OTP & WhatsApp
        layout.addWidget(QLabel("رقم الهاتف للتفعيل والتحقق:"))
        phone_row = QHBoxLayout()
        self.txt_reg_phone = QLineEdit()
        self.txt_reg_phone.setPlaceholderText("01061943367")
        self.txt_reg_phone.setStyleSheet("color: #FFFFFF; font-size: 13px; font-weight: bold; background-color: #1E1E28; border: 1px solid #38384A; border-radius: 6px; padding: 6px 10px;")
        phone_row.addWidget(self.txt_reg_phone)

        self.btn_send_otp = QPushButton("⚡ إرسال كود OTP مباشر")
        self.btn_send_otp.setStyleSheet("background: #065F46; color: #ECFDF5; border: 1px solid #10B981; font-weight: bold; border-radius: 6px; padding: 6px 10px;")
        self.btn_send_otp.clicked.connect(self._handle_send_otp)
        phone_row.addWidget(self.btn_send_otp)

        self.btn_wa_register = QPushButton("📱 تفعيل مباشر (01061943367)")
        self.btn_wa_register.setStyleSheet("background: #1E293B; color: #34D399; border: 1px solid #10B981; font-weight: bold; border-radius: 6px; padding: 6px 10px;")
        self.btn_wa_register.clicked.connect(self._open_whatsapp_activation)
        phone_row.addWidget(self.btn_wa_register)
        layout.addLayout(phone_row)

        # OTP Code row
        otp_row = QHBoxLayout()
        self.txt_reg_otp = QLineEdit()
        self.txt_reg_otp.setPlaceholderText("أدخل كود التحقق المكون من 6 أرقام")
        self.txt_reg_otp.setMaxLength(6)
        self.txt_reg_otp.setStyleSheet("color: #FFFFFF; font-size: 13px; font-weight: bold; background-color: #1E1E28; border: 1px solid #38384A; border-radius: 6px; padding: 6px 10px;")
        otp_row.addWidget(self.txt_reg_otp)

        self.btn_verify_otp = QPushButton("تأكيد الكود")
        self.btn_verify_otp.setFixedWidth(110)
        self.btn_verify_otp.clicked.connect(self._handle_verify_otp)
        otp_row.addWidget(self.btn_verify_otp)
        layout.addLayout(otp_row)

        # Password & Confirm with Show/Hide toggles
        pass_row = QHBoxLayout()
        vp1 = QVBoxLayout()
        vp1.addWidget(QLabel("كلمة المرور (اكتب كلمة السر هنا):"))
        p1_h = QHBoxLayout()
        self.txt_reg_pass = QLineEdit()
        self.txt_reg_pass.setPlaceholderText("اكتب كلمة المرور")
        self.txt_reg_pass.setStyleSheet("color: #FFFFFF; font-size: 13px; font-weight: bold; background-color: #1E1E28; border: 1px solid #3B82F6; border-radius: 6px; padding: 6px 10px;")
        p1_h.addWidget(self.txt_reg_pass)
        self.btn_toggle_reg_pass1 = QPushButton("👁️")
        self.btn_toggle_reg_pass1.setFixedWidth(36)
        self.btn_toggle_reg_pass1.setToolTip("إظهار / إخفاء كلمة المرور")
        self.btn_toggle_reg_pass1.clicked.connect(self._toggle_reg_pass1)
        p1_h.addWidget(self.btn_toggle_reg_pass1)
        vp1.addLayout(p1_h)
        pass_row.addLayout(vp1)

        vp2 = QVBoxLayout()
        vp2.addWidget(QLabel("تأكيد كلمة المرور:"))
        p2_h = QHBoxLayout()
        self.txt_reg_pass2 = QLineEdit()
        self.txt_reg_pass2.setPlaceholderText("أعد كتابة كلمة المرور")
        self.txt_reg_pass2.setStyleSheet("color: #FFFFFF; font-size: 13px; font-weight: bold; background-color: #1E1E28; border: 1px solid #3B82F6; border-radius: 6px; padding: 6px 10px;")
        p2_h.addWidget(self.txt_reg_pass2)
        self.btn_toggle_reg_pass2 = QPushButton("👁️")
        self.btn_toggle_reg_pass2.setFixedWidth(36)
        self.btn_toggle_reg_pass2.setToolTip("إظهار / إخفاء تأكيد كلمة المرور")
        self.btn_toggle_reg_pass2.clicked.connect(self._toggle_reg_pass2)
        p2_h.addWidget(self.btn_toggle_reg_pass2)
        vp2.addLayout(p2_h)
        pass_row.addLayout(vp2)
        layout.addLayout(pass_row)

        # Checkbox to show password in plain text by default
        self.chk_show_pass_reg = QCheckBox("👁️ إظهار كلمة المرور بنص صريح ومقروء أثناء الكتابة")
        self.chk_show_pass_reg.setChecked(True)
        self.chk_show_pass_reg.toggled.connect(self._toggle_both_passwords)
        layout.addWidget(self.chk_show_pass_reg)

        # Start with plain text visible so typing is completely unblocked
        self.txt_reg_pass.setEchoMode(QLineEdit.EchoMode.Normal)
        self.txt_reg_pass2.setEchoMode(QLineEdit.EchoMode.Normal)

        # Optional License Key
        lic_box = QVBoxLayout()
        lbl_lic = QLabel("كود الاشتراك / مفتاح الترخيص (اختياري - إذا كنت تملك مفتاحاً مسبقاً):")
        lbl_lic.setStyleSheet(f"color: {ACCENT_GOLD}; font-size: 11px; font-weight: bold;")
        self.txt_reg_license = QLineEdit()
        self.txt_reg_license.setPlaceholderText("TPRO-XXXX-XXXX-XXXX-XXXX")
        self.txt_reg_license.setStyleSheet("color: #FFFFFF; font-size: 13px; font-weight: bold; background-color: #1E1E28; border: 1px solid #38384A; border-radius: 6px; padding: 6px 10px;")
        lic_box.addWidget(lbl_lic)
        lic_box.addWidget(self.txt_reg_license)
        layout.addLayout(lic_box)

        # Checkbox for Terms
        self.chk_terms = QCheckBox("أوافق على اتفاقية الترخيص وسياسة الخصوصية التجارية")
        self.chk_terms.setChecked(True)
        layout.addWidget(self.chk_terms)

        self.btn_do_register = QPushButton("إنشاء الحساب وإرسال الطلب")
        self.btn_do_register.setObjectName("btnSuccess")
        self.btn_do_register.setFixedHeight(40)
        self.btn_do_register.clicked.connect(self._handle_register)
        layout.addWidget(self.btn_do_register)

        scroll.setWidget(scroll_content)
        tab_vbox.addWidget(scroll)

    # -------------------------------------------------------------
    # Logic & Handlers
    # -------------------------------------------------------------

    def _show_status(self, message: Any, is_error: bool = False):
        msg_str = str(message) if not isinstance(message, str) else message
        self.lbl_status.setText(msg_str)
        color = STATUS_ALERT if is_error else STATUS_CONNECTED
        self.lbl_status.setStyleSheet(f"color: {color}; font-size: 12px; font-weight: bold; padding: 4px;")
        self.lbl_status.show()

    def _toggle_password_visibility(self):
        if self.txt_login_pass.echoMode() == QLineEdit.EchoMode.Password:
            self.txt_login_pass.setEchoMode(QLineEdit.EchoMode.Normal)
            self.btn_toggle_pass.setText("🙈")
        else:
            self.txt_login_pass.setEchoMode(QLineEdit.EchoMode.Password)
            self.btn_toggle_pass.setText("👁️")

    def _toggle_reg_pass1(self):
        if self.txt_reg_pass.echoMode() == QLineEdit.EchoMode.Password:
            self.txt_reg_pass.setEchoMode(QLineEdit.EchoMode.Normal)
            self.btn_toggle_reg_pass1.setText("🙈")
        else:
            self.txt_reg_pass.setEchoMode(QLineEdit.EchoMode.Password)
            self.btn_toggle_reg_pass1.setText("👁️")

    def _toggle_reg_pass2(self):
        if self.txt_reg_pass2.echoMode() == QLineEdit.EchoMode.Password:
            self.txt_reg_pass2.setEchoMode(QLineEdit.EchoMode.Normal)
            self.btn_toggle_reg_pass2.setText("🙈")
        else:
            self.txt_reg_pass2.setEchoMode(QLineEdit.EchoMode.Password)
            self.btn_toggle_reg_pass2.setText("👁️")

    def _toggle_both_passwords(self, checked: bool):
        mode = QLineEdit.EchoMode.Normal if checked else QLineEdit.EchoMode.Password
        self.txt_reg_pass.setEchoMode(mode)
        self.txt_reg_pass2.setEchoMode(mode)
        self.btn_toggle_reg_pass1.setText("🙈" if checked else "👁️")
        self.btn_toggle_reg_pass2.setText("🙈" if checked else "👁️")

    def _handle_login(self):
        user = self.txt_login_user.text().strip()
        pwd = self.txt_login_pass.text()

        if not user or not pwd:
            self._show_status("يرجى إدخال اسم المستخدم وكلمة المرور.", is_error=True)
            return

        self.btn_do_login.setEnabled(False)
        self.btn_do_login.setText("جاري تسجيل الدخول...")

        success, msg, data = self.client.login(user, pwd)
        self.btn_do_login.setEnabled(True)
        self.btn_do_login.setText("تسجيل الدخول للمنظومة")

        if success and data:
            self.authenticated = True
            cust = data.get("customer") or self.client._customer_data or {}
            self.customer_data = cust

            stay_logged = self.chk_stay_logged_in.isChecked()
            payload = dict(data)
            payload["customer"] = cust
            payload["stay_logged_in"] = stay_logged

            if stay_logged:
                self.client.save_session(payload)
            else:
                self.client.clear_session()
                self.client._auth_token = data.get("access_token")
                self.client._customer_data = cust

            # Sync customer profile and license
            try:
                self.client.get_customer_profile()
            except Exception:
                pass
            self._show_status("تم تسجيل الدخول بنجاح! جاري فتح البرنامج...", is_error=False)
            self.accept()
        else:
            self._show_status(msg, is_error=True)

    def reject(self):
        """Called when dialog is cancelled or Escape is pressed."""
        if not self.authenticated and not self.client.is_logged_in():
            self.authenticated = False
        super().reject()

    def closeEvent(self, event):
        """Called when dialog is closed via window X button."""
        if not self.authenticated and not self.client.is_logged_in():
            self.authenticated = False
        super().closeEvent(event)

    def _handle_send_otp(self):
        phone = self.txt_reg_phone.text().strip()
        if not phone or len(phone) < 10:
            self._show_status("يرجى إدخال رقم هاتف صحيح أولاً.", is_error=True)
            return

        self.btn_send_otp.setEnabled(False)
        self.btn_send_otp.setText("جاري إرسال الكود...")
        ok, msg, debug_otp, wa_url = self.client.request_otp(phone)
        self.btn_send_otp.setEnabled(True)
        self.btn_send_otp.setText("⚡ إرسال كود OTP مباشر")

        if ok:
            self._last_whatsapp_url = wa_url
            self._last_otp = debug_otp

            # Do NOT auto-type the code - the client must enter the code they received
            self.txt_reg_otp.clear()
            self.txt_reg_otp.setFocus()

            # Display direct message informing the client to enter the received code
            self._show_status(f"✅ تم إرسال كود التحقق بنجاح إلى رقم هاتفك ({phone}). اكتب الكود المستلم هنا.", is_error=False)

            self._otp_cooldown = 60
            self._otp_timer.start(1000)
            self.btn_send_otp.setText(f"إعادة ({self._otp_cooldown})")

            # Pop up prominent clear dialog showing the sent OTP to the client
            msg_box = QMessageBox(self)
            msg_box.setWindowTitle("تم إرسال كود التحقق (OTP)")
            msg_box.setIcon(QMessageBox.Icon.Information)
            otp_display_line = f"كود التحقق الخاص بك هو: 【 {debug_otp} 】\n\n" if debug_otp else "تم إرسال الرمز عبر رسالة نصية قصيرة / واتساب.\n\n"
            msg_box.setText(
                f"📩 تم إرسال كود التحقق بنجاح إلى الرقم: {phone}\n\n"
                f"{otp_display_line}"
                f"• يرجى كتابة هذا الكود في خانة 'رمز التحقق' أدناه لتأكيد الحساب.\n"
                f"• الكود صالح لمدة 5 دقائق."
            )
            btn_wa_send = msg_box.addButton("💬 فتح واتساب لإرسال الكود للعميل", QMessageBox.ButtonRole.ActionRole)
            btn_ok = msg_box.addButton("حسناً، سأكتب الكود الآن", QMessageBox.ButtonRole.AcceptRole)
            msg_box.exec()
            if msg_box.clickedButton() == btn_wa_send and wa_url:
                try:
                    import webbrowser
                    webbrowser.open(wa_url)
                except Exception as e:
                    logger.error("Error opening WhatsApp: %s", e)
        else:
            self._show_status(msg, is_error=True)

    def _update_otp_countdown(self):
        self._otp_cooldown -= 1
        if self._otp_cooldown <= 0:
            self._otp_timer.stop()
            self.btn_send_otp.setEnabled(True)
            self.btn_send_otp.setText("⚡ إرسال كود التحقق (OTP)")
        else:
            self.btn_send_otp.setText(f"إعادة ({self._otp_cooldown})")

    def _handle_verify_otp(self):
        phone = self.txt_reg_phone.text().strip()
        otp = self.txt_reg_otp.text().strip()
        if not phone or not otp:
            self._show_status("يرجى إدخال الهاتف وكود التحقق.", is_error=True)
            return

        ok, msg = self.client.verify_otp(phone, otp)
        if ok:
            self._show_status("✅ تم التحقق من رقم الهاتف بنجاح!", is_error=False)
            self.txt_reg_otp.setEnabled(False)
            self.btn_verify_otp.setEnabled(False)
            self.btn_send_otp.setEnabled(False)
        else:
            self._show_status(msg, is_error=True)

    def _handle_register(self):
        try:
            name = self.txt_reg_name.text().strip()
            shop = self.txt_reg_shop.text().strip()
            uname = self.txt_reg_username.text().strip()
            phone = self.txt_reg_phone.text().strip()
            city = self.cmb_reg_city.currentText()
            pwd = self.txt_reg_pass.text()
            pwd2 = self.txt_reg_pass2.text()
            otp = self.txt_reg_otp.text().strip()
            lic = self.txt_reg_license.text().strip()

            if not name or not shop or not uname or not phone or not pwd:
                self._show_status("يرجى ملء جميع الحقول المطلوبة.", is_error=True)
                return

            if pwd != pwd2:
                self._show_status("كلمة المرور وتأكيد كلمة المرور غير متطابقين.", is_error=True)
                return

            if len(pwd) < 6:
                self._show_status("كلمة المرور يجب أن لا تقل عن 6 خانات.", is_error=True)
                return

            if not self.chk_terms.isChecked():
                self._show_status("يجب الموافقة على شروط الاستخدام وسياسة الخصوصية.", is_error=True)
                return

            payload = {
                "full_name": name,
                "shop_name": shop,
                "username": uname,
                "phone_number": phone,
                "password": pwd,
                "confirm_password": pwd2,
                "city": city,
                "device_id": self.client.device_id,
                "accept_terms": True
            }
            if otp:
                payload["otp_code"] = otp
            if lic:
                payload["license_key"] = lic

            self.btn_do_register.setEnabled(False)
            self.btn_do_register.setText("جاري إنشاء الحساب...")

            ok, msg, data = self.client.register(payload)
            self.btn_do_register.setEnabled(True)
            self.btn_do_register.setText("إنشاء الحساب وإرسال الطلب")

            if not ok:
                self._show_status(str(msg), is_error=True)
                QMessageBox.warning(self, "تنبيه في التسجيل", str(msg))
                return

            cust_id = (data or {}).get("customer_id", "")
            registered_phone = (data or {}).get("phone_number", phone)

            # Auto-login newly registered account so session is active
            self.authenticated = True
            cust = (data or {}).get("customer") or self.client._customer_data or {}
            if not cust:
                cust = {
                    "customer_id": cust_id,
                    "username": uname,
                    "full_name": name,
                    "shop_name": shop,
                    "phone_number": registered_phone,
                    "city": city,
                    "role": "owner",
                    "account_status": "ACTIVE"
                }
            self.customer_data = cust
            if self.chk_stay_logged_in.isChecked():
                self.client.save_session({
                    "access_token": self.client._auth_token or "offline_session",
                    "customer": cust,
                    "stay_logged_in": True
                })

            # If user provided a license key or one was auto-activated
            if lic or (data and data.get("license_key")):
                active_key = lic or data.get("license_key")
                act_ok, act_msg = self.client.import_offline_license(active_key)
                if not act_ok:
                    act_ok, act_msg, _ = self.client.activate_online(cust_id, active_key)
                if act_ok:
                    self.authenticated = True
                    QMessageBox.information(
                        self,
                        "تم التسجيل وتفعيل الترخيص بنجاح!",
                        f"أهلاً بك يا {name}!\nتم إنشاء حسابك وتفعيل مفتاح الترخيص بنجاح على هذا الجهاز.\nجاري فتح المنظومة..."
                    )
                    self.accept()
                    return

            # Prompt user with actionable post-registration options
            self._prompt_post_registration_action(name, cust_id, registered_phone, uname)

        except Exception as e:
            logger.exception("Error during registration: %s", e)
            self._show_status(f"حدث خطأ غير متوقع: {str(e)}", is_error=True)
            QMessageBox.critical(self, "خطأ غير متوقع", f"حدث خطأ أثناء معالجة الطلب:\n{str(e)}")

    def _prompt_post_registration_action(self, name: str, cust_id: str, phone: str, uname: str):
        """Shows post-registration action dialog: Activate Key, Start 14-day Trial, WhatsApp support, or Login."""
        dlg = QDialog(self)
        dlg.setWindowTitle("تم تسجيل الحساب بنجاح — تفعيل الاشتراك")
        dlg.setFixedSize(500, 440)
        dlg.setStyleSheet(self.styleSheet())
        l = QVBoxLayout(dlg)
        l.setContentsMargins(22, 22, 22, 22)
        l.setSpacing(12)

        icon_lbl = QLabel("🎉")
        icon_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_lbl.setStyleSheet("font-size: 36px;")
        l.addWidget(icon_lbl)

        title = QLabel(f"أهلاً بك يا {name} في ProLab Trading Studio!")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title.setStyleSheet(f"font-size: 16px; font-weight: bold; color: {ACCENT_GOLD};")
        l.addWidget(title)

        info_lbl = QLabel(
            f"تم تسجيل حسابك بنجاح وحفظه على السيرفر المركزي!\n"
            f"• كود العميل: {cust_id}\n"
            f"• رقم الهاتف: {phone}\n\n"
            "لتشغيل البرنامج وتفعيل مميزات النظام، يرجى اختيار الإجراء:"
        )
        info_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        info_lbl.setStyleSheet(f"color: {TEXT_SILVER}; font-size: 12px;")
        l.addWidget(info_lbl)

        # 1. Activate License Key
        btn_key = QPushButton("🔑 إدخال كود الترخيص وتفعيل البرنامج فوراً")
        btn_key.setFixedHeight(40)
        btn_key.setObjectName("btnPrimary")

        def _do_enter_key():
            dlg.close()
            from ui.license_dialog import LicenseDialog
            ld = LicenseDialog(self, client=self.client)
            ld.txt_customer_id.setText(cust_id)
            if ld.exec() == QDialog.DialogCode.Accepted:
                self.authenticated = True
                self.accept()
            else:
                self.authenticated = True
                self.accept()

        btn_key.clicked.connect(_do_enter_key)
        l.addWidget(btn_key)

        # 2. Activate Free Trial
        btn_trial = QPushButton("🚀 بدء فترة تجربة مجانية فورية (14 يوماً)")
        btn_trial.setFixedHeight(40)
        btn_trial.setStyleSheet(f"background: #065F46; color: #ECFDF5; border: 1px solid {STATUS_CONNECTED}; font-weight: bold; border-radius: 6px;")

        def _do_trial():
            btn_trial.setEnabled(False)
            btn_trial.setText("جاري تفعيل التجربة...")
            ok, msg, _ = self.client.activate_trial(customer_id=cust_id)
            if ok:
                self.authenticated = True
                QMessageBox.information(
                    dlg,
                    "تم تفعيل التجربة بنجاح!",
                    f"تم تفعيل باقة التجربة المجانية لمدة 14 يوماً بنجاح على هذا الجهاز!\nجاري فتح البرنامج..."
                )
                dlg.accept()
                self.accept()
            else:
                btn_trial.setEnabled(True)
                btn_trial.setText("🚀 بدء فترة تجربة مجانية فورية (14 يوماً)")
                QMessageBox.warning(dlg, "تنبيه", msg)

        btn_trial.clicked.connect(_do_trial)
        l.addWidget(btn_trial)

        # 3. WhatsApp Support
        btn_wa = QPushButton("💬 طلب كود التفعيل عبر واتساب (01061943367)")
        btn_wa.setFixedHeight(36)
        btn_wa.setStyleSheet(f"background: #1F2937; color: #60A5FA; border: 1px solid #3B82F6; font-weight: bold; border-radius: 6px;")

        def _do_wa():
            try:
                import webbrowser
                from urllib.parse import quote
                shop = getattr(self, "txt_reg_shop", None)
                shop_str = shop.text().strip() if shop else "ورشة الصيانة"
                msg_text = (
                    f"🔔 طلب تفعيل واشتراك جديد — ThermalLabPro\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"• اسم العميل: {name}\n"
                    f"• اسم المحل: {shop_str}\n"
                    f"• رقم الهاتف: {phone}\n"
                    f"• كود العميل: {cust_id}\n"
                    f"• معرف الجهاز (Device ID):\n{self.client.device_id}\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"أرجو مراجعة الطلب وتفعيل البرنامج."
                )
                url = f"https://wa.me/201061943367?text={quote(msg_text)}"
                webbrowser.open(url)
            except Exception as e:
                logger.error("Error opening WhatsApp: %s", e)

        btn_wa.clicked.connect(_do_wa)
        l.addWidget(btn_wa)

        # 4. Open Application (Read-Only / Active)
        btn_open_app = QPushButton("🚀 المتابعة وفتح البرنامج الآن")
        btn_open_app.setFixedHeight(36)
        btn_open_app.setStyleSheet(f"background: #181824; color: {ACCENT_GOLD}; border: 1px solid {ACCENT_GOLD}; font-weight: bold; border-radius: 6px;")

        def _do_open_app():
            self.authenticated = True
            dlg.accept()
            self.accept()

        btn_open_app.clicked.connect(_do_open_app)
        l.addWidget(btn_open_app)

        dlg.exec()

    def _open_license_dialog(self):
        from ui.license_dialog import LicenseDialog
        dlg = LicenseDialog(self, client=self.client)
        if dlg.exec() == QDialog.DialogCode.Accepted:
            self.authenticated = True
            self.accept()

    def _open_whatsapp_activation(self):
        try:
            import webbrowser
            from urllib.parse import quote
            phone = ""
            if hasattr(self, "txt_reg_phone"):
                phone = self.txt_reg_phone.text().strip()
            if not phone and hasattr(self, "txt_login_user"):
                phone = self.txt_login_user.text().strip()
            name = ""
            if hasattr(self, "txt_reg_name"):
                name = self.txt_reg_name.text().strip()
            dev_id = getattr(self.client, "device_id", "")
            msg = (
                f"مرحباً م/ أحمد جادالله،\n"
                f"أود تفعيل ترخيص واشتراك برنامج ThermalLabPro Commercial ERP.\n"
                f"• الاسم: {name or 'عميل جديد'}\n"
                f"• رقم الهاتف: {phone or '01061943367'}\n"
                f"• معرف الجهاز:\n{dev_id}\n\n"
                f"يرجى إرسال مفتاح الترخيص وتفعيل الاشتراك."
            )
            url = f"https://wa.me/201061943367?text={quote(msg)}"
            webbrowser.open(url)
        except Exception as e:
            logger.error("Error opening WhatsApp activation: %s", e)

    def _open_whatsapp_support(self):
        try:
            import webbrowser
            from urllib.parse import quote
            msg = "مرحباً م/ أحمد، أود الاستفسار عن تفعيل ترخيص واشتراك ThermalLabPro Commercial ERP"
            url = f"https://wa.me/201061943367?text={quote(msg)}"
            webbrowser.open(url)
        except Exception as e:
            logger.error("Error opening WhatsApp support: %s", e)

    def _direct_wa_activation_clicked(self):
        self._open_whatsapp_activation()

    def _forgot_password_clicked(self):
        QMessageBox.information(
            self,
            "استعادة كلمة المرور",
            "لاستعادة كلمة المرور، يرجى التواصل مع إدارة الترخيص مباشرة عبر واتساب (01061943367) مع ذكر اسم المستخدم ورقم هاتفك المسجل."
        )
