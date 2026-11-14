"""
ui/customer_profile_dialog.py — Customer Account Profile & Subscription Details (Component A, 5.7)
Displays customer credentials, subscription plan, device bindings, and license status.
"""
import logging
from typing import Optional, Dict, Any
from PyQt6.QtCore import Qt, QUrl
from PyQt6.QtGui import QIcon, QDesktopServices, QClipboard, QGuiApplication
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QFrame, QMessageBox, QWidget, QGridLayout, QScrollArea
)

from core.licensing.client import get_licensing_client, LicensingClient
from core.licensing.machine_id import get_installation_id
from ui.styles import (
    LUXURY_DARK_QSS, ACCENT_GOLD, BG_CARD, BORDER_GLASS,
    TEXT_WHITE, TEXT_SILVER, TEXT_MUTED, STATUS_CONNECTED, STATUS_ALERT, STATUS_WARNING
)

logger = logging.getLogger("thermal_lab.ui.customer_profile")


class CustomerProfileDialog(QDialog):
    """Customer account profile, subscription validity, and device management dialog."""

    def __init__(self, parent=None, client: Optional[LicensingClient] = None):
        super().__init__(parent)
        self.client = client or get_licensing_client()
        self.setWindowTitle("الملف الشخصي للمشترك — ProLab Account Profile")
        self.setFixedSize(520, 680)
        self.setStyleSheet(LUXURY_DARK_QSS)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)

        self._init_ui()
        self._load_data()

    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(20, 20, 20, 20)
        root.setSpacing(14)

        # Header Profile Banner
        header = QFrame()
        header.setStyleSheet(f"""
            QFrame {{
                background-color: {BG_CARD};
                border: 1px solid {BORDER_GLASS};
                border-radius: 8px;
                padding: 12px;
            }}
        """)
        h_layout = QVBoxLayout(header)
        h_layout.setSpacing(4)
        h_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.lbl_avatar = QLabel("👤")
        self.lbl_avatar.setStyleSheet("font-size: 32px;")
        self.lbl_avatar.setAlignment(Qt.AlignmentFlag.AlignCenter)
        h_layout.addWidget(self.lbl_avatar)

        self.lbl_shop_name = QLabel("اسم المحل / النشاط")
        self.lbl_shop_name.setStyleSheet(f"font-size: 17px; font-weight: bold; color: {ACCENT_GOLD};")
        self.lbl_shop_name.setAlignment(Qt.AlignmentFlag.AlignCenter)
        h_layout.addWidget(self.lbl_shop_name)

        self.lbl_full_name = QLabel("الاسم بالكامل")
        self.lbl_full_name.setStyleSheet(f"font-size: 13px; color: {TEXT_SILVER};")
        self.lbl_full_name.setAlignment(Qt.AlignmentFlag.AlignCenter)
        h_layout.addWidget(self.lbl_full_name)

        self.lbl_badge_status = QLabel("● الحساب نشط")
        self.lbl_badge_status.setStyleSheet(f"font-size: 11px; font-weight: bold; color: {STATUS_CONNECTED}; padding-top: 4px;")
        self.lbl_badge_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        h_layout.addWidget(self.lbl_badge_status)

        root.addWidget(header)

        # Details Grid Card
        grid_card = QFrame()
        grid_card.setStyleSheet(f"""
            QFrame {{
                background-color: #14141E;
                border: 1px solid {BORDER_GLASS};
                border-radius: 8px;
                padding: 14px;
            }}
        """)
        g_layout = QGridLayout(grid_card)
        g_layout.setVerticalSpacing(10)
        g_layout.setHorizontalSpacing(16)

        fields = [
            ("كود العميل (ID):", "lbl_cust_id", 0, 0),
            ("اسم المستخدم:", "lbl_username", 0, 1),
            ("رقم الهاتف المسجل:", "lbl_phone", 1, 0),
            ("المحافظة / المدينة:", "lbl_city", 1, 1),
            ("باقة الاشتراك:", "lbl_plan", 2, 0),
            ("صلاحية الاشتراك:", "lbl_expires", 2, 1),
            ("مفتاح الترخيص:", "lbl_license_key", 3, 0),
            ("الأجهزة المصرح بها:", "lbl_devices", 3, 1),
        ]

        self.labels: Dict[str, QLabel] = {}
        for title, key, r, c in fields:
            box = QVBoxLayout()
            box.setSpacing(2)
            t_lbl = QLabel(title)
            t_lbl.setStyleSheet(f"font-size: 11px; color: {TEXT_MUTED}; font-weight: bold;")
            v_lbl = QLabel("-")
            v_lbl.setStyleSheet(f"font-size: 12px; color: {TEXT_WHITE}; font-weight: bold;")
            box.addWidget(t_lbl)
            box.addWidget(v_lbl)
            g_layout.addLayout(box, r, c)
            self.labels[key] = v_lbl

        root.addWidget(grid_card)

        # Device ID Card
        dev_card = QFrame()
        dev_card.setStyleSheet(f"QFrame {{ background: #181824; border: 1px solid {BORDER_GLASS}; border-radius: 6px; padding: 8px; }}")
        d_layout = QHBoxLayout(dev_card)
        d_layout.addWidget(QLabel("معرف جهازك الحالي:"))
        self.lbl_cur_dev = QLabel(get_installation_id())
        self.lbl_cur_dev.setStyleSheet(f"font-weight: bold; color: {ACCENT_GOLD};")
        d_layout.addWidget(self.lbl_cur_dev)
        d_layout.addStretch()
        btn_copy = QPushButton("📋 نسخ")
        btn_copy.setFixedWidth(60)
        btn_copy.clicked.connect(self._copy_dev_id)
        d_layout.addWidget(btn_copy)
        root.addWidget(dev_card)

        # Action Buttons
        btn_row = QHBoxLayout()
        btn_sync = QPushButton("🔄 تحديث ومزامنة")
        btn_sync.clicked.connect(self._sync_profile)
        btn_row.addWidget(btn_sync)

        btn_manage_lic = QPushButton("🔑 إدارة الترخيص والتجديد")
        btn_manage_lic.setObjectName("btnPrimary")
        btn_manage_lic.clicked.connect(self._open_license_dialog)
        btn_row.addWidget(btn_manage_lic)
        root.addLayout(btn_row)

        # Bottom row: Logout / Close
        bottom_row = QHBoxLayout()
        btn_logout = QPushButton("🚪 تسجيل الخروج")
        btn_logout.setStyleSheet(f"color: {STATUS_ALERT}; background: transparent; border: 1px solid {STATUS_ALERT}; border-radius: 4px; padding: 6px 12px; font-weight: bold;")
        btn_logout.clicked.connect(self._logout)
        bottom_row.addWidget(btn_logout)

        bottom_row.addStretch()

        btn_close = QPushButton("إغلاق")
        btn_close.clicked.connect(self.accept)
        bottom_row.addWidget(btn_close)
        root.addLayout(bottom_row)

    def _copy_dev_id(self):
        cb: QClipboard = QGuiApplication.clipboard()
        cb.setText(get_installation_id())
        QMessageBox.information(self, "تم النسخ", "تم نسخ معرف الجهاز إلى الحافظة بنجاح.")

    def _load_data(self):
        cust = self.client._customer_data or {}
        st = self.client.get_license_status()

        shop = cust.get("shop_name") or cust.get("business_name") or "المشترك التجاري"
        name = cust.get("full_name") or "غير محدد"
        self.lbl_shop_name.setText(f"👑 {shop}")
        self.lbl_full_name.setText(name)

        status_text = cust.get("account_status") or ("نشط" if st.is_valid else "غير مفعل")
        self.lbl_badge_status.setText(f"● حالة الحساب: {status_text}")
        if status_text in ("APPROVED", "ACTIVE"):
            self.lbl_badge_status.setStyleSheet(f"color: {STATUS_CONNECTED}; font-weight: bold;")
        elif status_text == "PENDING_APPROVAL":
            self.lbl_badge_status.setStyleSheet(f"color: {STATUS_WARNING}; font-weight: bold;")
        else:
            self.lbl_badge_status.setStyleSheet(f"color: {STATUS_ALERT}; font-weight: bold;")

        self.labels["lbl_cust_id"].setText(cust.get("customer_id") or "CUST-LOCAL")
        self.labels["lbl_username"].setText(cust.get("username") or "-")
        self.labels["lbl_phone"].setText(cust.get("phone_number") or "-")
        self.labels["lbl_city"].setText(cust.get("city") or "-")
        self.labels["lbl_plan"].setText(st.plan_name or cust.get("active_plan") or "باقة أساسية")
        
        expires_str = st.valid_until_utc.strftime("%Y-%m-%d") if st.valid_until_utc else "دائم (Lifetime)"
        self.labels["lbl_expires"].setText(expires_str)
        
        key_str = st.license_key or cust.get("license_key") or "-"
        self.labels["lbl_license_key"].setText(key_str[:16] + "..." if len(key_str) > 16 else key_str)
        self.labels["lbl_devices"].setText(f"{cust.get('device_count', 1)} / {cust.get('device_limit', 1)}")

    def _sync_profile(self):
        ok, msg, data = self.client.get_customer_profile()
        if ok and data:
            self._load_data()
            QMessageBox.information(self, "نجاح", "تم تحديث بيانات الحساب والاشتراك بنجاح من الخادم.")
        else:
            QMessageBox.warning(self, "تنبيه", f"تعذر تحديث البيانات: {msg}")

    def _open_license_dialog(self):
        from ui.license_dialog import LicenseDialog
        dlg = LicenseDialog(self, client=self.client)
        dlg.exec()
        self._load_data()

    def _logout(self):
        if QMessageBox.question(self, "تأكيد تسجيل الخروج", "هل أنت متأكد من تسجيل الخروج من هذا الحساب؟") == QMessageBox.StandardButton.Yes:
            self.client.clear_session()
            QMessageBox.information(self, "تم تسجيل الخروج", "تم تسجيل الخروج بنجاح. يمكنك تسجيل الدخول بحساب آخر.")
            self.reject()
