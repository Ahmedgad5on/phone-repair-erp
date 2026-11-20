"""
license_manager/main.py — ThermalLabPro License Manager Studio (Executive Edition)
Central Administrative Licensing & Activation Studio for Eng. Ahmed Gadallah.
Features:
- Instant Auto-Server Start & Silent Auto-Login
- Smart WhatsApp Assistant (Paste & 1-Click Auto-Parse Name, Shop, Phone, Device ID)
- Real-time Customer Request Pipeline & Full Administrative Controls:
  * Approve & Activate with flexible duration (Trial, 1M, 3M, 6M, 1Y, Lifetime, Custom)
  * Early-Renewal Subscription Extension without losing remaining days
  * Reject / Suspend / Reactivate
  * Instant Ed25519 Cryptographic Signing
  * Automatic Desktop .prolablic package export
  * Direct 1-Click WhatsApp Dispatch with formatted Arabic notification
- Device & Seat Management
- Complete Audit Trail & KPI Dashboards
"""
import base64
from datetime import datetime, timezone, timedelta
import json
import logging
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time
from typing import Optional, Tuple, Dict, Any, List
import urllib.parse
import webbrowser

# Ensure project root and package directories are in sys.path
_current_dir = Path(__file__).resolve().parent
_root_dir = _current_dir.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))
if str(_current_dir) not in sys.path:
    sys.path.insert(0, str(_current_dir))

from PyQt6.QtCore import Qt, QSize, QTimer
from PyQt6.QtGui import QIcon, QFont, QColor
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QLineEdit, QTableWidget, QTableWidgetItem,
    QHeaderView, QMessageBox, QTabWidget, QDialog, QComboBox,
    QSpinBox, QTextEdit, QPlainTextEdit, QFrame, QFileDialog, QSplitter,
    QStackedWidget, QCheckBox, QGroupBox, QScrollArea, QSizePolicy
)

try:
    from license_manager.api_client import LicenseManagerAPIClient
except ImportError:
    from api_client import LicenseManagerAPIClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("license_manager")

THEME_QSS = """
QMainWindow, QDialog {
    background-color: #0A0A0F;
    color: #E2E8F0;
    font-family: 'Segoe UI', Tahoma, Arial;
    font-size: 13px;
}
QFrame#sidebar {
    background-color: #0F1017;
    border-left: 1px solid #1E2235;
}
QFrame#card {
    background-color: #131522;
    border: 1px solid #22273D;
    border-radius: 8px;
}
QFrame#smart-box {
    background-color: #121424;
    border: 1px solid #2F3657;
    border-radius: 8px;
}
QPushButton {
    background-color: #1A1D2E;
    color: #E2E8F0;
    border: 1px solid #2A304D;
    border-radius: 6px;
    padding: 6px 14px;
    font-weight: 600;
}
QPushButton:hover {
    background-color: #252B44;
    border-color: #D4AF37;
    color: #F8FAFC;
}
QPushButton#primary {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #D4AF37, stop:1 #E5C158);
    color: #0A0A0F;
    border: none;
    font-weight: bold;
}
QPushButton#primary:hover {
    background: #F3CD68;
}
QPushButton#success {
    background-color: #059669;
    color: #FFFFFF;
    border: 1px solid #10B981;
}
QPushButton#success:hover {
    background-color: #10B981;
}
QPushButton#renew {
    background-color: #1D4ED8;
    color: #FFFFFF;
    border: 1px solid #3B82F6;
}
QPushButton#renew:hover {
    background-color: #2563EB;
}
QPushButton#whatsapp {
    background-color: #15803D;
    color: #FFFFFF;
    border: 1px solid #22C55E;
}
QPushButton#whatsapp:hover {
    background-color: #16A34A;
}
QPushButton#danger {
    background-color: #881337;
    color: #FECDD3;
    border: 1px solid #BE123C;
}
QPushButton#danger:hover {
    background-color: #BE123C;
    color: #FFFFFF;
}
QLineEdit, QComboBox, QSpinBox, QTextEdit, QPlainTextEdit {
    background-color: #0B0C14;
    color: #F8FAFC;
    border: 1px solid #262C47;
    border-radius: 6px;
    padding: 6px 10px;
    selection-background-color: #D4AF37;
    selection-color: #000;
}
QLineEdit:focus, QComboBox:focus, QTextEdit:focus, QPlainTextEdit:focus {
    border-color: #D4AF37;
}
QTableWidget {
    background-color: #0E101A;
    color: #E2E8F0;
    border: 1px solid #1F243B;
    border-radius: 8px;
    gridline-color: #1A1F33;
    selection-background-color: #232944;
}
QHeaderView::section {
    background-color: #141726;
    color: #D4AF37;
    font-weight: bold;
    border: none;
    border-bottom: 2px solid #2A304D;
    padding: 8px 6px;
}
QTableWidget::item:selected {
    background-color: #252D4A;
    color: #F8FAFC;
}
QScrollBar:vertical {
    border: none;
    background: #0E101A;
    width: 6px;
    margin: 0px;
}
QScrollBar::handle:vertical {
    background: #2A304D;
    min-height: 20px;
    border-radius: 3px;
}
QScrollBar::handle:vertical:hover {
    background: #D4AF37;
}
"""


def get_desktop_dir() -> Path:
    candidates = [
        Path(os.environ.get("USERPROFILE", "")) / "Desktop",
        Path.home() / "Desktop",
        Path("C:/Users/Eng_Ahmed/Desktop")
    ]
    for c in candidates:
        if c.exists():
            return c
    return Path.cwd()


def copy_to_clipboard(text: str):
    clipboard = QApplication.clipboard()
    if clipboard:
        clipboard.setText(text)


def open_whatsapp_chat(phone: str, text: str):
    clean_p = re.sub(r"[^0-9]", "", phone)
    if clean_p.startswith("01"):
        clean_p = "20" + clean_p[1:]
    elif clean_p.startswith("1"):
        clean_p = "20" + clean_p
    encoded = urllib.parse.quote(text)
    url = f"https://wa.me/{clean_p}?text={encoded}"
    webbrowser.open(url)


def parse_whatsapp_text(raw_text: str) -> Dict[str, str]:
    """Smart parser extracting customer attributes from unstructured WhatsApp messages."""
    info = {
        "name": "",
        "shop": "",
        "phone": "",
        "device_id": "",
        "username": "",
        "city": "Cairo"
    }

    # Phone Regex: Egyptian standard 010, 011, 012, 015
    m_phone = re.search(r'(?:\+?20|0)?(1[0125][0-9]{8})\b', raw_text)
    if m_phone:
        info["phone"] = "0" + m_phone.group(1)

    # Device ID: Priority to TLP-XXXX-XXXX-XXXX-XXXX format
    m_dev = re.search(r'TLP-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}', raw_text, re.IGNORECASE)
    if not m_dev:
        m_dev = re.search(r'(?:معرف\s*الجهاز|الجهاز|Device\s*ID|Hardware\s*ID)\s*[:=]\s*([A-Za-z0-9\-]+)', raw_text, re.IGNORECASE)
    if m_dev:
        val = m_dev.group(0) if 'TLP-' in m_dev.group(0).upper() else m_dev.group(1)
        info["device_id"] = val.strip().upper()

    # Name
    m_name = re.search(r'(?:اسم\s*العميل|العميل|الاسم|المهندس|الاسم\s*بالكامل)\s*[:=]\s*([^\n\r,،]+)', raw_text)
    if m_name:
        info["name"] = m_name.group(1).strip()

    # Shop Name
    m_shop = re.search(r'(?:اسم\s*المحل|المحل|السنتر|المركز|الورشة|اسم\s*النشاط)\s*[:=]\s*([^\n\r,،]+)', raw_text)
    if m_shop:
        info["shop"] = m_shop.group(1).strip()

    # Username
    m_user = re.search(r'(?:اسم\s*المستخدم|اليوزر|user|username|حساب)\s*[:=]\s*([a-zA-Z0-9_]+)', raw_text, re.IGNORECASE)
    if m_user:
        info["username"] = m_user.group(1).strip()

    # City
    m_city = re.search(r'(?:المدينة|المحافظة|العنوان)\s*[:=]\s*([^\n\r,،]+)', raw_text)
    if m_city:
        info["city"] = m_city.group(1).strip()

    # Fallbacks
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    if not info["name"] and lines:
        for l in lines:
            if not any(k in l for k in ["TLP-", "01", "معرف", "كود", "محل", "برنامج", "تفعيل"]):
                info["name"] = l
                break
    if not info["shop"] and info["name"]:
        info["shop"] = f"محل {info['name']}"
    if not info["username"]:
        if info["phone"]:
            info["username"] = f"user_{info['phone'][-6:]}"
        elif info["name"]:
            info["username"] = re.sub(r'[^a-zA-Z0-9_]', '', info["name"]) or "user_client"

    return info


def format_whatsapp_activation_message(
    name: str,
    shop: str,
    license_key: str,
    device_id: str,
    plan_name: str,
    expires_date: str,
    offline_file_name: str
) -> str:
    return (
        f"👑 *تم تفعيل نظام ThermalLabPro بنجاح*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 *العميل:* {name}\n"
        f"🏬 *المحل:* {shop}\n"
        f"🔑 *مفتاح الترخيص:* `{license_key}`\n"
        f"💻 *الجهاز المصرح:* `{device_id}`\n"
        f"📅 *الباقة والصلاحية:* {plan_name} (حتى {expires_date[:10]})\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📦 *ملف التفعيل المرفق:* `{offline_file_name}`\n\n"
        f"📌 *طريقة التفعيل المباشر (بدون إنترنت):*\n"
        f"1. افتح البرنامج على جهازك.\n"
        f"2. اضغط على 'استيراد ملف الترخيص (.prolablic)' أو 'تفعيل بدون إنترنت'.\n"
        f"3. اختر الملف المرفق، وسيعمل البرنامج فوراً بكامل الصلاحيات.\n\n"
        f"🤝 نسعد بخدمتكم دائماً • الدعم الفني: 01061943367"
    )


def format_whatsapp_renewal_message(
    name: str,
    shop: str,
    license_key: str,
    device_id: str,
    plan_name: str,
    expires_date: str
) -> str:
    return (
        f"👑 *تم تجديد اشتراككم في ThermalLabPro بنجاح*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 *العميل:* {name}\n"
        f"🏬 *المحل:* {shop}\n"
        f"🔑 *مفتاح الترخيص:* `{license_key}`\n"
        f"💻 *الجهاز المعتمد:* `{device_id}`\n"
        f"📅 *تاريخ الصلاحية الجديد:* {expires_date[:10]} ({plan_name})\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"✓ تم تمديد فترة التشغيل بنجاح مع تطبيق قواعد التجديد المبكر.\n\n"
        f"🤝 شكراً لثقتكم المستمرة بنا • الدعم الفني: 01061943367"
    )


class ActionSuccessDialog(QDialog):
    """Rich visual dialog presenting activation/renewal results and 1-click actions."""

    def __init__(
        self,
        title: str,
        message: str,
        license_key: str,
        device_id: str,
        phone_number: str,
        whatsapp_text: str,
        prolablic_path: Optional[Path] = None,
        parent=None
    ):
        super().__init__(parent)
        self.license_key = license_key
        self.phone_number = phone_number
        self.whatsapp_text = whatsapp_text
        self.prolablic_path = prolablic_path

        self.setWindowTitle(title)
        self.setFixedSize(540, 420)
        self.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        self.setStyleSheet(THEME_QSS)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(12)

        hdr = QLabel(f"🎉 {title}")
        hdr.setStyleSheet("font-size: 16px; font-weight: bold; color: #10B981;")
        hdr.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(hdr)

        lbl_msg = QLabel(message)
        lbl_msg.setStyleSheet("font-size: 13px; color: #E2E8F0;")
        lbl_msg.setWordWrap(True)
        layout.addWidget(lbl_msg)

        box = QFrame()
        box.setObjectName("smart-box")
        b_lay = QVBoxLayout(box)
        b_lay.setContentsMargins(14, 12, 14, 12)
        b_lay.setSpacing(8)

        # License Key display
        row_key = QHBoxLayout()
        row_key.addWidget(QLabel("🔑 مفتاح الترخيص:"))
        txt_k = QLineEdit(license_key)
        txt_k.setReadOnly(True)
        txt_k.setStyleSheet("color: #D4AF37; font-weight: bold; font-family: Consolas;")
        row_key.addWidget(txt_k)
        btn_copy_k = QPushButton("📋 نسخ")
        btn_copy_k.clicked.connect(lambda: copy_to_clipboard(license_key))
        row_key.addWidget(btn_copy_k)
        b_lay.addLayout(row_key)

        # Device ID display
        if device_id:
            row_dev = QHBoxLayout()
            row_dev.addWidget(QLabel("💻 معرف الجهاز:"))
            txt_d = QLineEdit(device_id)
            txt_d.setReadOnly(True)
            txt_d.setStyleSheet("color: #60A5FA; font-family: Consolas;")
            row_dev.addWidget(txt_d)
            btn_copy_d = QPushButton("📋 نسخ")
            btn_copy_d.clicked.connect(lambda: copy_to_clipboard(device_id))
            row_dev.addWidget(btn_copy_d)
            b_lay.addLayout(row_dev)

        # ProLabLic path display
        if prolablic_path and prolablic_path.exists():
            row_p = QHBoxLayout()
            row_p.addWidget(QLabel("📦 ملف التفعيل:"))
            txt_p = QLineEdit(str(prolablic_path))
            txt_p.setReadOnly(True)
            row_p.addWidget(txt_p)
            btn_open_f = QPushButton("📂 فتح المجلد")
            btn_open_f.clicked.connect(self._open_in_explorer)
            row_p.addWidget(btn_open_f)
            b_lay.addLayout(row_p)

        layout.addWidget(box)

        # Action Buttons
        btn_layout = QHBoxLayout()

        btn_wa = QPushButton("💬 إرسال رسالة الواتساب للعميل الآن")
        btn_wa.setObjectName("whatsapp")
        btn_wa.setFixedHeight(38)
        btn_wa.clicked.connect(self._launch_whatsapp)
        btn_layout.addWidget(btn_wa)

        btn_copy_wa = QPushButton("📋 نسخ نص الرسالة")
        btn_copy_wa.setFixedHeight(38)
        btn_copy_wa.clicked.connect(self._copy_wa_text)
        btn_layout.addWidget(btn_copy_wa)

        btn_close = QPushButton("إغلاق")
        btn_close.setFixedHeight(38)
        btn_close.clicked.connect(self.accept)
        btn_layout.addWidget(btn_close)

        layout.addLayout(btn_layout)

    def _open_in_explorer(self):
        if self.prolablic_path and self.prolablic_path.exists():
            subprocess.Popen(f'explorer /select,"{str(self.prolablic_path)}"')

    def _launch_whatsapp(self):
        if self.phone_number:
            open_whatsapp_chat(self.phone_number, self.whatsapp_text)
        else:
            QMessageBox.warning(self, "تنبيه", "لا يوجد رقم هاتف مسجل لهذا العميل.")

    def _copy_wa_text(self):
        copy_to_clipboard(self.whatsapp_text)
        QMessageBox.information(self, "نجاح", "تم نسخ نص رسالة الواتساب إلى الحافظة بنجاح.")


class ApproveDialog(QDialog):
    """Modal dialog for approving customer registration and generating an Ed25519 license."""

    def __init__(self, cust_data: Dict[str, Any], client: LicenseManagerAPIClient, parent=None):
        super().__init__(parent)
        self.cust = cust_data
        self.client = client
        self.result_data: Optional[Dict[str, Any]] = None

        self.setWindowTitle("موافقة وتفعيل ترخيص العميل — ProLab License Studio")
        self.setFixedSize(500, 480)
        self.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        self.setStyleSheet(THEME_QSS)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(12)

        # Header
        hdr = QLabel(f"👑 تفعيل اشتراك: {self.cust.get('full_name')} ({self.cust.get('shop_name')})")
        hdr.setStyleSheet("font-size: 15px; font-weight: bold; color: #D4AF37;")
        layout.addWidget(hdr)

        info_box = QFrame()
        info_box.setObjectName("card")
        i_lay = QVBoxLayout(info_box)
        i_lay.setContentsMargins(12, 10, 12, 10)
        i_lay.setSpacing(4)
        i_lay.addWidget(QLabel(f"كود العميل: {self.cust.get('customer_id')} | اسم المستخدم: {self.cust.get('username') or '-'}"))
        i_lay.addWidget(QLabel(f"الهاتف: {self.cust.get('phone_number')} | المدينة: {self.cust.get('city')}"))
        layout.addWidget(info_box)

        # Plan Picker
        layout.addWidget(QLabel("اختر خطة ومدة التفعيل:"))
        self.cb_plan = QComboBox()
        self.cb_plan.addItem("🌟 باقة سنوية شاملة VIP (365 يوماً)", ("annual_pro", 365))
        self.cb_plan.addItem("💎 باقة مدى الحياة (Lifetime VIP - 10 سنوات)", ("lifetime_vip", 0))
        self.cb_plan.addItem("📅 باقة نصف سنوية (6 أشهر - 180 يوماً)", ("annual_pro", 180))
        self.cb_plan.addItem("📅 باقة ربع سنوية (3 أشهر - 90 يوماً)", ("quarterly_pro", 90))
        self.cb_plan.addItem("📅 باقة شهرية (30 يوماً)", ("monthly_standard", 30))
        self.cb_plan.addItem("⏱️ باقة تجربة مجانية (14 يوماً)", ("trial_14d", 14))
        self.cb_plan.addItem("⚙️ عدد أيام مخصص...", ("custom", -1))
        self.cb_plan.currentIndexChanged.connect(self._on_plan_changed)
        layout.addWidget(self.cb_plan)

        self.row_custom = QHBoxLayout()
        self.row_custom.addWidget(QLabel("عدد الأيام المخصصة:"))
        self.sp_days = QSpinBox()
        self.sp_days.setRange(1, 3650)
        self.sp_days.setValue(60)
        self.row_custom.addWidget(self.sp_days)
        self.w_custom = QWidget()
        self.w_custom.setLayout(self.row_custom)
        self.w_custom.setVisible(False)
        layout.addWidget(self.w_custom)

        # Device ID
        layout.addWidget(QLabel("معرف جهاز العميل (Device Hardware ID):"))
        self.txt_dev_id = QLineEdit(self.cust.get("device_id") or "")
        self.txt_dev_id.setPlaceholderText("TLP-XXXX-XXXX-XXXX-XXXX")
        layout.addWidget(self.txt_dev_id)

        # Checkboxes
        self.chk_save_desktop = QCheckBox("💾 حفظ ملف الترخيص (.prolablic) تلقائياً على سطح المكتب")
        self.chk_save_desktop.setChecked(True)
        layout.addWidget(self.chk_save_desktop)

        self.chk_open_wa = QCheckBox("💬 فتح محادثة الواتساب مع العميل وتجهيز الرسالة")
        self.chk_open_wa.setChecked(True)
        layout.addWidget(self.chk_open_wa)

        layout.addStretch()

        # Buttons
        btns = QHBoxLayout()
        self.btn_confirm = QPushButton("✓ تأكيد التفعيل والتوقيع الرقمي")
        self.btn_confirm.setObjectName("primary")
        self.btn_confirm.setFixedHeight(38)
        self.btn_confirm.clicked.connect(self._do_approve)
        btns.addWidget(self.btn_confirm)

        self.btn_cancel = QPushButton("إلغاء")
        self.btn_cancel.setFixedHeight(38)
        self.btn_cancel.clicked.connect(self.reject)
        btns.addWidget(self.btn_cancel)
        layout.addLayout(btns)

    def _on_plan_changed(self, idx):
        plan_id, days = self.cb_plan.currentData()
        self.w_custom.setVisible(plan_id == "custom")

    def _do_approve(self):
        plan_id, days = self.cb_plan.currentData()
        cust_id = self.cust.get("customer_id")
        dev_id = self.txt_dev_id.text().strip()

        custom_days = None
        if plan_id == "custom":
            plan_id = "annual_pro"
            custom_days = self.sp_days.value()
        elif days > 0 and days != 365:
            custom_days = days

        self.btn_confirm.setEnabled(False)
        self.btn_confirm.setText("جاري التفعيل وتوقيع الحزمة...")
        QApplication.processEvents()

        ok, msg, key = self.client.approve_customer(
            customer_id=cust_id,
            action="APPROVE",
            plan_id=plan_id,
            notes="Approved via License Manager Studio",
            custom_days=custom_days,
            device_id=dev_id
        )

        self.btn_confirm.setEnabled(True)
        self.btn_confirm.setText("✓ تأكيد التفعيل والتوقيع الرقمي")

        if not ok:
            QMessageBox.critical(self, "خطأ", f"فشل التفعيل:\n{msg}")
            return

        # Generate Offline Package if Device ID is present
        pkg_file = None
        if key and dev_id:
            gen_ok, _, b64 = self.client.generate_offline_package(
                key, dev_id, self.cust.get("shop_name") or "Main Station"
            )
            if gen_ok and b64 and self.chk_save_desktop.isChecked():
                desktop = get_desktop_dir()
                safe_shop = re.sub(r'[^a-zA-Z0-9_\u0600-\u06FF]', '_', self.cust.get("shop_name", "customer")).strip('_')
                pkg_file = desktop / f"license_{safe_shop}.prolablic"
                try:
                    with open(pkg_file, "w", encoding="utf-8") as f:
                        f.write(b64)
                except Exception as e:
                    logger.error(f"Failed to write license file: {e}")

        # WhatsApp text
        exp_text = "سنة كاملة" if (days == 365 or not custom_days) else f"{custom_days} يوماً"
        wa_text = format_whatsapp_activation_message(
            name=self.cust.get("full_name", ""),
            shop=self.cust.get("shop_name", ""),
            license_key=key or "ACTIVE",
            device_id=dev_id or "Registered",
            plan_name=self.cb_plan.currentText(),
            expires_date=datetime.now().strftime("%Y-%m-%d"),
            offline_file_name=pkg_file.name if pkg_file else f"license_{self.cust.get('customer_id')}.prolablic"
        )
        copy_to_clipboard(wa_text)

        if self.chk_open_wa.isChecked() and self.cust.get("phone_number"):
            open_whatsapp_chat(self.cust.get("phone_number"), wa_text)

        self.result_data = {
            "key": key,
            "device_id": dev_id,
            "wa_text": wa_text,
            "pkg_file": pkg_file
        }
        self.accept()


class RenewDialog(QDialog):
    """Modal dialog for early-renewal and subscription extension."""

    def __init__(self, cust_data: Dict[str, Any], client: LicenseManagerAPIClient, parent=None):
        super().__init__(parent)
        self.cust = cust_data
        self.client = client
        self.result_data: Optional[Dict[str, Any]] = None

        self.setWindowTitle("تجديد الاشتراك وتمديد المدة — ProLab License Studio")
        self.setFixedSize(500, 440)
        self.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        self.setStyleSheet(THEME_QSS)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(12)

        hdr = QLabel(f"🔄 تجديد اشتراك: {self.cust.get('full_name')} ({self.cust.get('shop_name')})")
        hdr.setStyleSheet("font-size: 15px; font-weight: bold; color: #3B82F6;")
        layout.addWidget(hdr)

        box = QFrame()
        box.setObjectName("card")
        b_lay = QVBoxLayout(box)
        b_lay.setContentsMargins(12, 10, 12, 10)
        b_lay.setSpacing(4)
        cur_exp = self.cust.get("sub_expires") or "-"
        b_lay.addWidget(QLabel(f"تاريخ الانتهاء الحالي: {cur_exp[:10] if cur_exp != '-' else 'غير محدد'}"))
        b_lay.addWidget(QLabel("ℹ️ سيتم إضافة المدة تلقائياً إلى تاريخ الانتهاء الحالي دون خسارة أي يوم متبقي."))
        layout.addWidget(box)

        layout.addWidget(QLabel("اختر المدة الإضافية للتجديد:"))
        self.cb_duration = QComboBox()
        self.cb_duration.addItem("➕ سنة كاملة إضافية (365 يوماً)", ("annual_pro", 365))
        self.cb_duration.addItem("➕ 6 أشهر إضافية (180 يوماً)", ("annual_pro", 180))
        self.cb_duration.addItem("➕ 3 أشهر إضافية (90 يوماً)", ("quarterly_pro", 90))
        self.cb_duration.addItem("➕ شهر واحد إضافي (30 يوماً)", ("monthly_standard", 30))
        self.cb_duration.addItem("💎 ترقية إلى مدى الحياة (Lifetime VIP)", ("lifetime_vip", 0))
        self.cb_duration.addItem("⚙️ عدد أيام مخصص...", ("custom", -1))
        self.cb_duration.currentIndexChanged.connect(self._on_dur_changed)
        layout.addWidget(self.cb_duration)

        self.row_custom = QHBoxLayout()
        self.row_custom.addWidget(QLabel("عدد الأيام الإضافية:"))
        self.sp_days = QSpinBox()
        self.sp_days.setRange(1, 3650)
        self.sp_days.setValue(30)
        self.row_custom.addWidget(self.sp_days)
        self.w_custom = QWidget()
        self.w_custom.setLayout(self.row_custom)
        self.w_custom.setVisible(False)
        layout.addWidget(self.w_custom)

        self.chk_save_desktop = QCheckBox("💾 حفظ حزمة الترخيص المحدثة (.prolablic) على سطح المكتب")
        self.chk_save_desktop.setChecked(True)
        layout.addWidget(self.chk_save_desktop)

        self.chk_open_wa = QCheckBox("💬 إرسال إشعار التجديد عبر الواتساب للعميل")
        self.chk_open_wa.setChecked(True)
        layout.addWidget(self.chk_open_wa)

        layout.addStretch()

        btns = QHBoxLayout()
        self.btn_confirm = QPushButton("✓ تأكيد التجديد وتحديث الصلاحية")
        self.btn_confirm.setObjectName("renew")
        self.btn_confirm.setFixedHeight(38)
        self.btn_confirm.clicked.connect(self._do_renew)
        btns.addWidget(self.btn_confirm)

        self.btn_cancel = QPushButton("إلغاء")
        self.btn_cancel.setFixedHeight(38)
        self.btn_cancel.clicked.connect(self.reject)
        btns.addWidget(self.btn_cancel)
        layout.addLayout(btns)

    def _on_dur_changed(self, idx):
        plan_id, days = self.cb_duration.currentData()
        self.w_custom.setVisible(plan_id == "custom")

    def _do_renew(self):
        plan_id, days = self.cb_duration.currentData()
        cust_id = self.cust.get("customer_id")
        dev_id = self.cust.get("device_id") or ""

        custom_days = None
        if plan_id == "custom":
            plan_id = "annual_pro"
            custom_days = self.sp_days.value()
        elif days > 0 and days != 365:
            custom_days = days

        self.btn_confirm.setEnabled(False)
        self.btn_confirm.setText("جاري التجديد وتحديث البيانات...")
        QApplication.processEvents()

        ok, msg, key, new_exp = self.client.renew_customer(
            customer_id=cust_id,
            plan_id=plan_id,
            custom_days=custom_days,
            notes="Renewed via License Manager Studio"
        )

        self.btn_confirm.setEnabled(True)
        self.btn_confirm.setText("✓ تأكيد التجديد وتحديث الصلاحية")

        if not ok:
            QMessageBox.critical(self, "خطأ", f"فشل التجديد:\n{msg}")
            return

        # Generate Offline Package
        pkg_file = None
        if key and dev_id:
            gen_ok, _, b64 = self.client.generate_offline_package(
                key, dev_id, self.cust.get("shop_name") or "Main Station"
            )
            if gen_ok and b64 and self.chk_save_desktop.isChecked():
                desktop = get_desktop_dir()
                safe_shop = re.sub(r'[^a-zA-Z0-9_\u0600-\u06FF]', '_', self.cust.get("shop_name", "customer")).strip('_')
                pkg_file = desktop / f"license_{safe_shop}.prolablic"
                try:
                    with open(pkg_file, "w", encoding="utf-8") as f:
                        f.write(b64)
                except Exception as e:
                    logger.error(f"Failed to write license file: {e}")

        # Format WhatsApp text
        wa_text = format_whatsapp_renewal_message(
            name=self.cust.get("full_name", ""),
            shop=self.cust.get("shop_name", ""),
            license_key=key or self.cust.get("license_key") or "ACTIVE",
            device_id=dev_id or "Registered",
            plan_name=self.cb_duration.currentText(),
            expires_date=new_exp or datetime.now().strftime("%Y-%m-%d")
        )
        copy_to_clipboard(wa_text)

        if self.chk_open_wa.isChecked() and self.cust.get("phone_number"):
            open_whatsapp_chat(self.cust.get("phone_number"), wa_text)

        self.result_data = {
            "key": key,
            "device_id": dev_id,
            "wa_text": wa_text,
            "pkg_file": pkg_file
        }
        self.accept()


class RejectDialog(QDialog):
    """Modal dialog for rejecting registration with reasons."""

    def __init__(self, cust_data: Dict[str, Any], client: LicenseManagerAPIClient, parent=None):
        super().__init__(parent)
        self.cust = cust_data
        self.client = client

        self.setWindowTitle("رفض طلب التسجيل")
        self.setFixedSize(420, 260)
        self.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        self.setStyleSheet(THEME_QSS)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 16, 20, 16)
        layout.setSpacing(10)

        layout.addWidget(QLabel(f"رفض طلب العميل: {self.cust.get('full_name')} ({self.cust.get('shop_name')})"))
        layout.addWidget(QLabel("سبب الرفض وملاحظات الإدارة:"))
        self.txt_reason = QLineEdit("بيانات غير مكتملة أو لم يتم تأكيد الدفع")
        layout.addWidget(self.txt_reason)

        layout.addStretch()

        btns = QHBoxLayout()
        btn_rej = QPushButton("تأكيد الرفض")
        btn_rej.setObjectName("danger")
        btn_rej.clicked.connect(self._do_reject)
        btns.addWidget(btn_rej)

        btn_can = QPushButton("إلغاء")
        btn_can.clicked.connect(self.reject)
        btns.addWidget(btn_can)
        layout.addLayout(btns)

    def _do_reject(self):
        ok, msg, _ = self.client.approve_customer(
            customer_id=self.cust.get("customer_id"),
            action="REJECT",
            notes=self.txt_reason.text().strip()
        )
        if ok:
            QMessageBox.information(self, "نجاح", "تم رفض الطلب بنجاح وتحديث السجلات.")
            self.accept()
        else:
            QMessageBox.critical(self, "خطأ", msg)


class LoginDialog(QDialog):
    """Administrative authentication dialog connecting to central backend."""

    def __init__(self, client: LicenseManagerAPIClient, parent=None):
        super().__init__(parent)
        self.client = client
        self.setWindowTitle("دخول مدير التراخيص — ProLab License Manager")
        self.setFixedSize(420, 340)
        self.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        self.setStyleSheet(THEME_QSS)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(30, 24, 30, 24)
        layout.setSpacing(12)

        title = QLabel("👑 تسجيل دخول الإدارة والترخيص")
        title.setStyleSheet("font-size: 16px; font-weight: bold; color: #D4AF37;")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(title)

        layout.addWidget(QLabel("رابط الخادم المركزي (Server URL):"))
        self.txt_url = QLineEdit(self.client.base_url)
        layout.addWidget(self.txt_url)

        layout.addWidget(QLabel("اسم المستخدم الإداري:"))
        self.txt_user = QLineEdit("superadmin")
        layout.addWidget(self.txt_user)

        layout.addWidget(QLabel("كلمة المرور:"))
        self.txt_pass = QLineEdit("ProLabAdmin2026!Secure")
        self.txt_pass.setEchoMode(QLineEdit.EchoMode.Password)
        layout.addWidget(self.txt_pass)

        # Quick Server Launcher for Local Development
        self.btn_start_server = QPushButton("⚡ تشغيل الخادم المحلي (Start Local Server)")
        self.btn_start_server.setStyleSheet("""
            QPushButton {
                background: #1C2333;
                color: #60A5FA;
                border: 1px solid #2563EB;
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 11px;
                font-weight: bold;
            }
            QPushButton:hover {
                background: #2563EB;
                color: #FFFFFF;
            }
        """)
        self.btn_start_server.clicked.connect(self._start_local_server)
        layout.addWidget(self.btn_start_server)

        btn_layout = QHBoxLayout()
        self.btn_login = QPushButton("تسجيل الدخول")
        self.btn_login.setObjectName("primary")
        self.btn_login.clicked.connect(self._do_login)
        btn_layout.addWidget(self.btn_login)

        self.btn_cancel = QPushButton("إلغاء")
        self.btn_cancel.clicked.connect(self.reject)
        btn_layout.addWidget(self.btn_cancel)
        layout.addLayout(btn_layout)

    def _start_local_server(self):
        self.btn_start_server.setEnabled(False)
        self.btn_start_server.setText("جاري تشغيل الخادم...")
        QApplication.processEvents()

        ok, msg = self._launch_server_process()
        self.btn_start_server.setEnabled(True)
        self.btn_start_server.setText("⚡ تشغيل الخادم المحلي (Start Local Server)")
        if ok:
            QMessageBox.information(self, "نجاح", "تم تشغيل خادم التراخيص بنجاح (127.0.0.1:8000). يمكنك تسجيل الدخول الآن.")
        else:
            QMessageBox.warning(self, "تنبيه", msg)

    @classmethod
    def _launch_server_process(cls) -> Tuple[bool, str]:
        # Check if already running on port 8000
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            if s.connect_ex(("127.0.0.1", 8000)) == 0:
                return True, "الخادم يعمل بالفعل على المنفذ 8000."

        py_candidates = [
            r"C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\python.exe",
            sys.executable,
            shutil.which("python"),
            shutil.which("python3"),
        ]
        py_exe = None
        for cand in py_candidates:
            if cand and os.path.exists(cand) and "python" in os.path.basename(cand).lower():
                py_exe = cand
                break

        if not py_exe:
            return False, "تعذر العثور على مفسر بايثون لتشغيل السيرفر تلقائياً."

        candidates_dir = [
            r"C:\Users\Eng_Ahmed\Desktop\label",
            str(Path(__file__).resolve().parent.parent),
            str(Path(sys.executable).parent.resolve()),
        ]
        proj_dir = None
        for d in candidates_dir:
            if os.path.exists(os.path.join(d, "server", "main.py")):
                proj_dir = d
                break

        if not proj_dir:
            return False, "تعذر تحديد مجلد مشروع الخادم (server/main.py)."

        CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0
        cmd = [py_exe, "-m", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
        try:
            subprocess.Popen(cmd, cwd=proj_dir, creationflags=CREATE_NO_WINDOW, close_fds=True)
            for _ in range(8):
                time.sleep(0.5)
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.5)
                    if s.connect_ex(("127.0.0.1", 8000)) == 0:
                        return True, "تم تشغيل الخادم بنجاح."
            return True, "تم إصدار أمر تشغيل الخادم."
        except Exception as e:
            return False, f"فشل تشغيل الخادم: {e}"

    def _do_login(self):
        url = self.txt_url.text().strip()
        u = self.txt_user.text().strip()
        p = self.txt_pass.text().strip()

        if not u or not p:
            QMessageBox.warning(self, "تنبيه", "يرجى إدخال اسم المستخدم وكلمة المرور.")
            return

        self.client.set_base_url(url)
        self.btn_login.setEnabled(False)
        self.btn_login.setText("جاري التحقق...")
        QApplication.processEvents()

        ok, msg = self.client.login(u, p)
        self.btn_login.setEnabled(True)
        self.btn_login.setText("تسجيل الدخول")

        if ok:
            self.accept()
        else:
            if ("10061" in msg or "Max retries" in msg or "Connection Refused" in msg) and ("127.0.0.1" in url or "localhost" in url):
                ans = QMessageBox.question(
                    self,
                    "الخادم غير مشغل",
                    "خادم التراخيص غير قيد التشغيل حالياً على المنفذ (127.0.0.1:8000).\n\nهل تريد تشغيل الخادم المحلي الآن تلقائياً ومتابعة تسجيل الدخول؟",
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                    QMessageBox.StandardButton.Yes
                )
                if ans == QMessageBox.StandardButton.Yes:
                    self._start_local_server()
                    ok2, msg2 = self.client.login(u, p)
                    if ok2:
                        self.accept()
                        return
                    else:
                        QMessageBox.critical(self, "فشل تسجيل الدخول", msg2)
                        return
            QMessageBox.critical(self, "فشل تسجيل الدخول", msg)


class LicenseManagerWindow(QMainWindow):
    """Main administrative desktop window."""

    def __init__(self, client: LicenseManagerAPIClient):
        super().__init__()
        self.client = client
        self.setWindowTitle("ThermalLabPro — License Manager Studio (إدارة التراخيص والتفعيلات المركزية)")
        self.resize(1380, 840)
        self.setMinimumSize(1100, 700)
        self.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        self.setStyleSheet(THEME_QSS)

        self._cached_customers: List[Dict[str, Any]] = []
        self._current_filter: str = "ALL"

        self._init_ui()
        self.refresh_all_data()

        # Background live poller for new registration requests (every 20s)
        self.timer = QTimer(self)
        self.timer.timeout.connect(self._silent_poll)
        self.timer.start(20000)

    def _init_ui(self):
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        main_layout = QHBoxLayout(main_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # 1. Left Sidebar
        sidebar = QFrame()
        sidebar.setObjectName("sidebar")
        sidebar.setFixedWidth(240)
        sb_layout = QVBoxLayout(sidebar)
        sb_layout.setContentsMargins(12, 16, 12, 16)
        sb_layout.setSpacing(8)

        # Brand Header
        lbl_logo = QLabel("👑 PROLAB STUDIO")
        lbl_logo.setStyleSheet("font-size: 16px; font-weight: 800; color: #D4AF37;")
        sb_layout.addWidget(lbl_logo)

        lbl_user = QLabel(f"المسؤول: {self.client.current_user or 'superadmin'} ({self.client.current_role or 'Owner'})")
        lbl_user.setStyleSheet("font-size: 11px; color: #10B981; margin-bottom: 8px;")
        sb_layout.addWidget(lbl_user)

        # Navigation Buttons
        self.nav_btns = []
        nav_items = [
            ("👥 طلبات وسجل العملاء", 0),
            ("📊 المؤشرات والتقارير العامة", 1),
            ("🔑 إصدار وتجديد التراخيص", 2),
            ("💻 إدارة الأجهزة والمحطات", 3),
            ("📦 تفعيل بدون إنترنت (Offline)", 4),
            ("💳 سجل المدفوعات", 5),
            ("🛡️ سجل الرقابة والأمان", 6),
        ]
        for text, idx in nav_items:
            btn = QPushButton(text)
            btn.setFixedHeight(38)
            btn.clicked.connect(lambda _, i=idx: self.switch_view(i))
            sb_layout.addWidget(btn)
            self.nav_btns.append(btn)

        sb_layout.addStretch()

        btn_refresh = QPushButton("🔄 تحديث شامل")
        btn_refresh.clicked.connect(self.refresh_all_data)
        sb_layout.addWidget(btn_refresh)

        main_layout.addWidget(sidebar)

        # 2. Right Content Stack
        self.tabs = QStackedWidget()

        # View 0: Primary Unified Customers & Activation View
        self.tab_customers = self._build_customers_view()
        self.tabs.addWidget(self.tab_customers)

        # View 1: Stats & Overview
        self.tab_stats = self._build_stats_view()
        self.tabs.addWidget(self.tab_stats)

        # View 2: License Operations
        self.tab_licenses = self._build_licenses_view()
        self.tabs.addWidget(self.tab_licenses)

        # View 3: Devices
        self.tab_devices = self._build_devices_view()
        self.tabs.addWidget(self.tab_devices)

        # View 4: Offline Packages
        self.tab_offline = self._build_offline_view()
        self.tabs.addWidget(self.tab_offline)

        # View 5: Payments
        self.tab_payments = self._build_payments_view()
        self.tabs.addWidget(self.tab_payments)

        # View 6: Audit Logs
        self.tab_audit = self._build_audit_view()
        self.tabs.addWidget(self.tab_audit)

        main_layout.addWidget(self.tabs)
        self.switch_view(0)

    def switch_view(self, index: int):
        self.tabs.setCurrentIndex(index)
        for i, b in enumerate(self.nav_btns):
            b.setStyleSheet("border-color: #D4AF37; color: #D4AF37; background-color: #252B44;" if i == index else "")

    # ==========================================================================
    # View 0: Primary Unified Customer Activation Studio
    # ==========================================================================

    def _build_customers_view(self) -> QWidget:
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(20, 16, 20, 16)
        layout.setSpacing(12)

        # Top Executive Header & KPI Ribbon
        kpi_row = QHBoxLayout()
        self.card_pending = self._make_kpi_card("🔔 طلبات بانتظار الموافقة", "0", "#F59E0B")
        self.card_pending.setCursor(Qt.CursorShape.PointingHandCursor)
        self.card_pending.mousePressEvent = lambda e: self._set_filter("PENDING")

        self.card_active = self._make_kpi_card("🟢 اشتراكات نشطة", "0", "#10B981")
        self.card_active.setCursor(Qt.CursorShape.PointingHandCursor)
        self.card_active.mousePressEvent = lambda e: self._set_filter("APPROVED")

        self.card_total = self._make_kpi_card("👥 إجمالي العملاء", "0", "#D4AF37")
        self.card_total.setCursor(Qt.CursorShape.PointingHandCursor)
        self.card_total.mousePressEvent = lambda e: self._set_filter("ALL")

        self.card_devs = self._make_kpi_card("💻 محطات وأجهزة", "0", "#60A5FA")

        kpi_row.addWidget(self.card_pending)
        kpi_row.addWidget(self.card_active)
        kpi_row.addWidget(self.card_total)
        kpi_row.addWidget(self.card_devs)
        layout.addLayout(kpi_row)

        # Smart WhatsApp Assistant Card (Collapsible Box)
        smart_card = QFrame()
        smart_card.setObjectName("smart-box")
        s_lay = QVBoxLayout(smart_card)
        s_lay.setContentsMargins(14, 12, 14, 12)
        s_lay.setSpacing(8)

        # Assistant Header
        s_hdr = QHBoxLayout()
        lbl_ast = QLabel("⚡ المساعد الذكي للتفعيل السريع واستخراج رسائل الواتساب")
        lbl_ast.setStyleSheet("font-size: 13px; font-weight: bold; color: #D4AF37;")
        s_hdr.addWidget(lbl_ast)
        s_hdr.addStretch()
        lbl_tip = QLabel("الصق رسالة العميل وسيتكفل النظام بملء البيانات وتجهيز ملف الترخيص فوراً")
        lbl_tip.setStyleSheet("font-size: 11px; color: #9CA3AF;")
        s_hdr.addWidget(lbl_tip)
        s_lay.addLayout(s_hdr)

        # Raw Paste Area + Auto-Extract Button
        paste_row = QHBoxLayout()
        self.txt_smart_paste = QPlainTextEdit()
        self.txt_smart_paste.setPlaceholderText("الصق هنا الرسالة الواردة من العميل عبر الواتساب (تحتوي على الاسم، المحل، الهاتف، كود الجهاز)...")
        self.txt_smart_paste.setFixedHeight(46)
        paste_row.addWidget(self.txt_smart_paste, 1)

        btn_parse = QPushButton("🔍 استخراج البيانات تلقائياً")
        btn_parse.setObjectName("primary")
        btn_parse.setFixedHeight(46)
        btn_parse.clicked.connect(self._do_smart_parse)
        paste_row.addWidget(btn_parse)
        s_lay.addLayout(paste_row)

        # Extracted Editable Fields
        fields_row = QHBoxLayout()
        fields_row.setSpacing(8)

        self.txt_sm_name = QLineEdit()
        self.txt_sm_name.setPlaceholderText("اسم العميل (الاسم بالكامل)")
        fields_row.addWidget(self.txt_sm_name)

        self.txt_sm_user = QLineEdit()
        self.txt_sm_user.setPlaceholderText("اسم المستخدم (النيم)")
        fields_row.addWidget(self.txt_sm_user)

        self.txt_sm_shop = QLineEdit()
        self.txt_sm_shop.setPlaceholderText("اسم المحل / النشاط")
        fields_row.addWidget(self.txt_sm_shop)

        self.txt_sm_phone = QLineEdit()
        self.txt_sm_phone.setPlaceholderText("رقم الهاتف (01xxxxxxxxx)")
        fields_row.addWidget(self.txt_sm_phone)

        self.txt_sm_devid = QLineEdit()
        self.txt_sm_devid.setPlaceholderText("معرف الجهاز (TLP-...)")
        fields_row.addWidget(self.txt_sm_devid)

        s_lay.addLayout(fields_row)

        # Duration & 1-Click Action
        act_row = QHBoxLayout()
        act_row.addWidget(QLabel("مدة التفعيل:"))
        self.cb_sm_plan = QComboBox()
        self.cb_sm_plan.addItem("🌟 باقة سنوية VIP (365 يوماً)", ("annual_pro", 365))
        self.cb_sm_plan.addItem("💎 باقة مدى الحياة (Lifetime VIP)", ("lifetime_vip", 0))
        self.cb_sm_plan.addItem("📅 باقة نصف سنوية (180 يوماً)", ("annual_pro", 180))
        self.cb_sm_plan.addItem("📅 باقة 3 أشهر (90 يوماً)", ("quarterly_pro", 90))
        self.cb_sm_plan.addItem("📅 باقة شهرية (30 يوماً)", ("monthly_standard", 30))
        self.cb_sm_plan.addItem("⏱️ باقة تجربة مجانية (14 يوماً)", ("trial_14d", 14))
        act_row.addWidget(self.cb_sm_plan)

        self.chk_sm_desktop = QCheckBox("💾 حفظ .prolablic على سطح المكتب")
        self.chk_sm_desktop.setChecked(True)
        act_row.addWidget(self.chk_sm_desktop)

        self.chk_sm_wa = QCheckBox("💬 فتح محادثة الواتساب فوراً")
        self.chk_sm_wa.setChecked(True)
        act_row.addWidget(self.chk_sm_wa)

        act_row.addStretch()

        btn_sm_launch = QPushButton("🚀 تفعيل وتوقيع الترخيص فوراً بنقرة واحدة")
        btn_sm_launch.setObjectName("success")
        btn_sm_launch.setFixedHeight(34)
        btn_sm_launch.clicked.connect(self._do_smart_quick_activate)
        act_row.addWidget(btn_sm_launch)
        s_lay.addLayout(act_row)

        layout.addWidget(smart_card)

        # Filter & Search Ribbon
        filter_bar = QHBoxLayout()
        self.txt_cust_search = QLineEdit()
        self.txt_cust_search.setPlaceholderText("🔍 بحث بالاسم، اسم المستخدم (النيم)، المحل، الهاتف، كود الجهاز، كود الترخيص...")
        self.txt_cust_search.textChanged.connect(self._apply_local_filters)
        filter_bar.addWidget(self.txt_cust_search, 1)

        self.btn_flt_all = QPushButton("🌐 جميع السجلات")
        self.btn_flt_all.clicked.connect(lambda: self._set_filter("ALL"))
        filter_bar.addWidget(self.btn_flt_all)

        self.btn_flt_pending = QPushButton("🔔 بانتظار الموافقة")
        self.btn_flt_pending.clicked.connect(lambda: self._set_filter("PENDING"))
        filter_bar.addWidget(self.btn_flt_pending)

        self.btn_flt_active = QPushButton("🟢 المفعلين والنشطين")
        self.btn_flt_active.clicked.connect(lambda: self._set_filter("APPROVED"))
        filter_bar.addWidget(self.btn_flt_active)

        self.btn_flt_rejected = QPushButton("🔴 المرفوضة والموقوفة")
        self.btn_flt_rejected.clicked.connect(lambda: self._set_filter("REJECTED"))
        filter_bar.addWidget(self.btn_flt_rejected)

        btn_reload = QPushButton("🔄 تحديث")
        btn_reload.clicked.connect(self.load_customers_table)
        filter_bar.addWidget(btn_reload)

        layout.addLayout(filter_bar)

        # Main Enhanced Customers Table
        self.table_customers = QTableWidget()
        self.table_customers.setColumnCount(10)
        self.table_customers.setHorizontalHeaderLabels([
            "الكود", "اسم المستخدم (النيم)", "اسم العميل", "اسم المحل",
            "معرف الجهاز (Device ID)", "الهاتف والمدينة", "الباقة والصلاحية",
            "الحالة", "تاريخ التسجيل", "⚙️ الإجراءات والقرارات الإدارية"
        ])
        header = self.table_customers.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(6, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(7, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(8, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(9, QHeaderView.ResizeMode.ResizeToContents)

        self.table_customers.verticalHeader().setDefaultSectionSize(48)
        layout.addWidget(self.table_customers, 1)

        return w

    def _do_smart_parse(self):
        text = self.txt_smart_paste.toPlainText().strip()
        if not text:
            QMessageBox.warning(self, "تنبيه", "يرجى لصق نص رسالة الواتساب أولاً.")
            return

        parsed = parse_whatsapp_text(text)
        self.txt_sm_name.setText(parsed.get("name", ""))
        self.txt_sm_user.setText(parsed.get("username", ""))
        self.txt_sm_shop.setText(parsed.get("shop", ""))
        self.txt_sm_phone.setText(parsed.get("phone", ""))
        self.txt_sm_devid.setText(parsed.get("device_id", ""))

        QMessageBox.information(
            self, "تم الاستخراج",
            f"تم استخراج البيانات بنجاح:\n"
            f"الاسم: {parsed.get('name')}\n"
            f"اسم المستخدم: {parsed.get('username')}\n"
            f"المحل: {parsed.get('shop')}\n"
            f"الهاتف: {parsed.get('phone')}\n"
            f"الجهاز: {parsed.get('device_id')}"
        )

    def _do_smart_quick_activate(self):
        name = self.txt_sm_name.text().strip()
        user = self.txt_sm_user.text().strip()
        shop = self.txt_sm_shop.text().strip()
        phone = self.txt_sm_phone.text().strip()
        dev_id = self.txt_sm_devid.text().strip()

        if not name or not phone:
            QMessageBox.warning(self, "بيانات ناقصة", "يرجى إدخال اسم العميل ورقم الهاتف على الأقل.")
            return

        plan_id, days = self.cb_sm_plan.currentData()
        custom_days = days if (days > 0 and days != 365) else None

        # Check if customer already exists in cached list
        matched_cust = None
        for c in self._cached_customers:
            if c.get("phone_number") == phone or (user and c.get("username") == user):
                matched_cust = c
                break

        cust_id = None
        if matched_cust:
            cust_id = matched_cust.get("customer_id")
        else:
            # Register customer first
            reg_ok, reg_msg, new_cid = self.client.quick_register(
                full_name=name,
                shop_name=shop or f"محل {name}",
                phone_number=phone,
                city="Cairo",
                device_id=dev_id,
                username=user
            )
            if not reg_ok:
                QMessageBox.critical(self, "فشل التسجيل", f"تعذر تسجيل العميل:\n{reg_msg}")
                return
            cust_id = new_cid

        # Now approve & issue license
        ok, msg, key = self.client.approve_customer(
            customer_id=cust_id,
            action="APPROVE",
            plan_id=plan_id,
            notes="Activated via Smart WhatsApp Assistant",
            custom_days=custom_days,
            device_id=dev_id
        )

        if not ok:
            QMessageBox.critical(self, "فشل التفعيل", f"تعذر إصدار الترخيص:\n{msg}")
            return

        # Generate Offline package
        pkg_file = None
        if key and dev_id:
            gen_ok, _, b64 = self.client.generate_offline_package(key, dev_id, shop or "Main Station")
            if gen_ok and b64 and self.chk_sm_desktop.isChecked():
                desktop = get_desktop_dir()
                safe_shop = re.sub(r'[^a-zA-Z0-9_\u0600-\u06FF]', '_', shop or "customer").strip('_')
                pkg_file = desktop / f"license_{safe_shop}.prolablic"
                try:
                    with open(pkg_file, "w", encoding="utf-8") as f:
                        f.write(b64)
                except Exception as e:
                    logger.error(f"Failed to write license file: {e}")

        # Prepare WhatsApp notification
        wa_text = format_whatsapp_activation_message(
            name=name,
            shop=shop or name,
            license_key=key or "ACTIVE",
            device_id=dev_id or "Registered",
            plan_name=self.cb_sm_plan.currentText(),
            expires_date=datetime.now().strftime("%Y-%m-%d"),
            offline_file_name=pkg_file.name if pkg_file else f"license_{cust_id}.prolablic"
        )
        copy_to_clipboard(wa_text)

        if self.chk_sm_wa.isChecked() and phone:
            open_whatsapp_chat(phone, wa_text)

        # Show Action Success Dialog
        dlg = ActionSuccessDialog(
            title="تم تفعيل ترخيص العميل وتوقيعه بنجاح",
            message=f"تم إصدار وتوقيع الترخيص للعميل ({name}) بنجاح وربط الجهاز المعتمد.",
            license_key=key or "ACTIVE",
            device_id=dev_id,
            phone_number=phone,
            whatsapp_text=wa_text,
            prolablic_path=pkg_file,
            parent=self
        )
        dlg.exec()

        # Reset fields and refresh
        self.txt_smart_paste.clear()
        self.txt_sm_name.clear()
        self.txt_sm_user.clear()
        self.txt_sm_shop.clear()
        self.txt_sm_phone.clear()
        self.txt_sm_devid.clear()

        self.refresh_all_data()

    def _set_filter(self, flt: str):
        self._current_filter = flt
        for b in (self.btn_flt_all, self.btn_flt_pending, self.btn_flt_active, self.btn_flt_rejected):
            b.setStyleSheet("")
        if flt == "ALL":
            self.btn_flt_all.setStyleSheet("border-color: #D4AF37; color: #D4AF37; font-weight: bold;")
        elif flt == "PENDING":
            self.btn_flt_pending.setStyleSheet("border-color: #F59E0B; color: #F59E0B; font-weight: bold;")
        elif flt == "APPROVED":
            self.btn_flt_active.setStyleSheet("border-color: #10B981; color: #10B981; font-weight: bold;")
        elif flt == "REJECTED":
            self.btn_flt_rejected.setStyleSheet("border-color: #EF4444; color: #EF4444; font-weight: bold;")
        self._apply_local_filters()

    def _apply_local_filters(self):
        search = self.txt_cust_search.text().strip().lower()
        flt = self._current_filter

        filtered = []
        for c in self._cached_customers:
            st = c.get("account_status", "")
            if flt == "PENDING" and st != "PENDING_APPROVAL":
                continue
            elif flt == "APPROVED" and st not in ("APPROVED", "ACTIVE"):
                continue
            elif flt == "REJECTED" and st not in ("REJECTED", "SUSPENDED", "BLOCKED"):
                continue

            if search:
                haystack = " ".join([
                    str(c.get("customer_id") or ""),
                    str(c.get("username") or ""),
                    str(c.get("full_name") or ""),
                    str(c.get("shop_name") or ""),
                    str(c.get("phone_number") or ""),
                    str(c.get("device_id") or ""),
                    str(c.get("license_key") or ""),
                    str(c.get("city") or "")
                ]).lower()
                if search not in haystack:
                    continue

            filtered.append(c)

        self._populate_customers_table(filtered)

    def _populate_customers_table(self, custs: List[Dict[str, Any]]):
        self.table_customers.setRowCount(len(custs))
        for r, c in enumerate(custs):
            # 0: Customer ID
            self.table_customers.setItem(r, 0, QTableWidgetItem(c.get("customer_id", "")))

            # 1: Username (النيم بتاعه)
            it_user = QTableWidgetItem(c.get("username") or "-")
            it_user.setForeground(QColor("#60A5FA"))
            self.table_customers.setItem(r, 1, it_user)

            # 2: Customer Name (اسمه)
            self.table_customers.setItem(r, 2, QTableWidgetItem(c.get("full_name", "")))

            # 3: Shop Name (اسم المحل بتاعه)
            it_shop = QTableWidgetItem(c.get("shop_name", ""))
            it_shop.setForeground(QColor("#D4AF37"))
            self.table_customers.setItem(r, 3, it_shop)

            # 4: Device ID (عنوان الجهاز بتاعه) + Copy button
            dev_w = QWidget()
            dev_lay = QHBoxLayout(dev_w)
            dev_lay.setContentsMargins(4, 2, 4, 2)
            dev_lay.setSpacing(4)
            dev_id_str = c.get("device_id") or "-"
            lbl_dev = QLabel(dev_id_str[:20] + ("..." if len(dev_id_str) > 20 else ""))
            lbl_dev.setStyleSheet("font-family: Consolas; font-size: 11px; color: #CBD5E1;")
            dev_lay.addWidget(lbl_dev, 1)
            if dev_id_str != "-":
                btn_copy_dev = QPushButton("📋")
                btn_copy_dev.setFixedSize(26, 26)
                btn_copy_dev.setToolTip("نسخ كود الجهاز")
                btn_copy_dev.clicked.connect(lambda _, d=dev_id_str: copy_to_clipboard(d))
                dev_lay.addWidget(btn_copy_dev)
            self.table_customers.setCellWidget(r, 4, dev_w)

            # 5: Phone & City + WhatsApp button
            ph_w = QWidget()
            ph_lay = QHBoxLayout(ph_w)
            ph_lay.setContentsMargins(4, 2, 4, 2)
            ph_lay.setSpacing(4)
            ph_str = c.get("phone_number", "")
            lbl_ph = QLabel(f"{ph_str} ({c.get('city', '')})")
            ph_lay.addWidget(lbl_ph, 1)
            if ph_str:
                btn_wa = QPushButton("💬")
                btn_wa.setObjectName("whatsapp")
                btn_wa.setFixedSize(26, 26)
                btn_wa.setToolTip("فتح محادثة واتساب مع العميل")
                btn_wa.clicked.connect(lambda _, p=ph_str, n=c.get("full_name", ""): open_whatsapp_chat(p, f"مرحباً أستاذ {n}، معك الدعم الفني لنظام ThermalLabPro."))
                ph_lay.addWidget(btn_wa)
            self.table_customers.setCellWidget(r, 5, ph_w)

            # 6: Plan & Expiry
            sub_exp = c.get("sub_expires") or ""
            plan_id = c.get("active_plan") or "-"
            exp_text = f"{plan_id}"
            if sub_exp:
                exp_text += f"\nينتهي: {sub_exp[:10]}"
            self.table_customers.setItem(r, 6, QTableWidgetItem(exp_text))

            # 7: Status Badge
            st = c.get("account_status", "")
            lbl_st = QLabel(st)
            lbl_st.setAlignment(Qt.AlignmentFlag.AlignCenter)
            if st in ("APPROVED", "ACTIVE"):
                lbl_st.setStyleSheet("background-color: #064E3B; color: #6EE7B7; border-radius: 4px; font-weight: bold; padding: 2px;")
            elif st == "PENDING_APPROVAL":
                lbl_st.setStyleSheet("background-color: #78350F; color: #FDE68A; border-radius: 4px; font-weight: bold; padding: 2px;")
            elif st in ("REJECTED", "BLOCKED"):
                lbl_st.setStyleSheet("background-color: #881337; color: #FECDD3; border-radius: 4px; font-weight: bold; padding: 2px;")
            else:
                lbl_st.setStyleSheet("background-color: #1F2937; color: #9CA3AF; border-radius: 4px; padding: 2px;")
            self.table_customers.setCellWidget(r, 7, lbl_st)

            # 8: Created At
            self.table_customers.setItem(r, 8, QTableWidgetItem(c.get("created_at", "")[:10]))

            # 9: Administrative Actions Container
            act_w = QWidget()
            act_lay = QHBoxLayout(act_w)
            act_lay.setContentsMargins(4, 2, 4, 2)
            act_lay.setSpacing(6)

            if st == "PENDING_APPROVAL":
                # Pending Approval: Show 🟢 تفعيل and 🔴 رفض
                btn_app = QPushButton("🟢 موافقة وتفعيل")
                btn_app.setObjectName("success")
                btn_app.clicked.connect(lambda _, cust=c: self._open_approve_dialog(cust))
                act_lay.addWidget(btn_app)

                btn_rej = QPushButton("🔴 رفض")
                btn_rej.setObjectName("danger")
                btn_rej.clicked.connect(lambda _, cust=c: self._open_reject_dialog(cust))
                act_lay.addWidget(btn_rej)
            else:
                # Active / Approved: Show 🔄 تجديد المدة, 📦 تصدير, ⏸️ إيقاف
                btn_rn = QPushButton("🔄 تجديد")
                btn_rn.setObjectName("renew")
                btn_rn.setToolTip("تجديد وإضافة مدة للاشتراك")
                btn_rn.clicked.connect(lambda _, cust=c: self._open_renew_dialog(cust))
                act_lay.addWidget(btn_rn)

                btn_exp = QPushButton("📦 تصدير")
                btn_exp.setToolTip("حفظ ملف الترخيص .prolablic على سطح المكتب")
                btn_exp.clicked.connect(lambda _, cust=c: self._quick_export_offline(cust))
                act_lay.addWidget(btn_exp)

                if st in ("APPROVED", "ACTIVE"):
                    btn_susp = QPushButton("⏸️ إيقاف")
                    btn_susp.setToolTip("إيقاف الاشتراك مؤقتاً")
                    btn_susp.clicked.connect(lambda _, cid=c.get("customer_id"): self._toggle_suspend(cid, "SUSPEND"))
                    act_lay.addWidget(btn_susp)
                else:
                    btn_react = QPushButton("🟢 تنشيط")
                    btn_react.setObjectName("success")
                    btn_react.clicked.connect(lambda _, cid=c.get("customer_id"): self._toggle_suspend(cid, "REACTIVATE"))
                    act_lay.addWidget(btn_react)

            self.table_customers.setCellWidget(r, 9, act_w)

    def _open_approve_dialog(self, cust: Dict[str, Any]):
        dlg = ApproveDialog(cust, self.client, self)
        if dlg.exec() == QDialog.DialogCode.Accepted and dlg.result_data:
            res = dlg.result_data
            ActionSuccessDialog(
                title="تم اعتماد وتفعيل ترخيص العميل بنجاح",
                message=f"تم اعتماد العميل ({cust.get('full_name')}) وإصدار ترخيصه وحفظ الملف على سطح المكتب.",
                license_key=res.get("key", ""),
                device_id=res.get("device_id", ""),
                phone_number=cust.get("phone_number", ""),
                whatsapp_text=res.get("wa_text", ""),
                prolablic_path=res.get("pkg_file"),
                parent=self
            ).exec()
            self.refresh_all_data()

    def _open_renew_dialog(self, cust: Dict[str, Any]):
        dlg = RenewDialog(cust, self.client, self)
        if dlg.exec() == QDialog.DialogCode.Accepted and dlg.result_data:
            res = dlg.result_data
            ActionSuccessDialog(
                title="تم تجديد اشتراك العميل بنجاح",
                message=f"تم تمديد صلاحية اشتراك ({cust.get('full_name')}) وتحديث حزمة الترخيص.",
                license_key=res.get("key", ""),
                device_id=res.get("device_id", ""),
                phone_number=cust.get("phone_number", ""),
                whatsapp_text=res.get("wa_text", ""),
                prolablic_path=res.get("pkg_file"),
                parent=self
            ).exec()
            self.refresh_all_data()

    def _open_reject_dialog(self, cust: Dict[str, Any]):
        dlg = RejectDialog(cust, self.client, self)
        if dlg.exec() == QDialog.DialogCode.Accepted:
            self.refresh_all_data()

    def _quick_export_offline(self, cust: Dict[str, Any]):
        key = cust.get("license_key")
        dev_id = cust.get("device_id")
        shop = cust.get("shop_name") or "customer"

        if not key or key == "-":
            QMessageBox.warning(self, "تنبيه", "لا يوجد مفتاح ترخيص نشط لهذا العميل بعد.")
            return
        if not dev_id:
            QMessageBox.warning(self, "تنبيه", "لا يوجد معرف جهاز مسجل لهذا العميل لتوليد حزمة بدون إنترنت.")
            return

        ok, msg, b64 = self.client.generate_offline_package(key, dev_id, shop)
        if ok and b64:
            desktop = get_desktop_dir()
            safe_shop = re.sub(r'[^a-zA-Z0-9_\u0600-\u06FF]', '_', shop).strip('_')
            target_path = desktop / f"license_{safe_shop}.prolablic"
            try:
                with open(target_path, "w", encoding="utf-8") as f:
                    f.write(b64)
                ans = QMessageBox.information(
                    self, "تم الحفظ بنجاح",
                    f"تم تصدير حزمة الترخيص الموقعة (.prolablic) بنجاح إلى:\n{target_path}\n\nهل تريد فتح موقع الملف في سطح المكتب؟",
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                    QMessageBox.StandardButton.Yes
                )
                if ans == QMessageBox.StandardButton.Yes:
                    subprocess.Popen(f'explorer /select,"{str(target_path)}"')
            except Exception as e:
                QMessageBox.critical(self, "خطأ في الكتابة", f"فشل حفظ الملف: {e}")
        else:
            QMessageBox.critical(self, "فشل التوليد", msg)

    def _toggle_suspend(self, cust_id: str, action: str):
        label = "إيقاف" if action == "SUSPEND" else "تنشيط"
        if QMessageBox.question(self, f"تأكيد {label}", f"هل أنت متأكد من {label} حساب هذا العميل؟") == QMessageBox.StandardButton.Yes:
            ok, msg, _ = self.client.approve_customer(customer_id=cust_id, action=action, notes=f"{label} by admin")
            if ok:
                QMessageBox.information(self, "نجاح", f"تم {label} الحساب بنجاح.")
                self.refresh_all_data()
            else:
                QMessageBox.critical(self, "خطأ", msg)

    # ==========================================================================
    # View 1: Stats & Overview
    # ==========================================================================

    def _build_stats_view(self) -> QWidget:
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(16)

        header = QLabel("📊 المؤشرات العامة والرقابة المركزية")
        header.setStyleSheet("font-size: 18px; font-weight: bold; color: #D4AF37;")
        layout.addWidget(header)

        grid = QHBoxLayout()
        self.card_customers_v1 = self._make_kpi_card("إجمالي العملاء", "0", "#D4AF37")
        self.card_pending_v1 = self._make_kpi_card("انتظار الموافقة", "0", "#F59E0B")
        self.card_active_subs_v1 = self._make_kpi_card("اشتراكات نشطة", "0", "#10B981")
        self.card_revenue_v1 = self._make_kpi_card("الإيرادات المؤكدة", "0 ج.م", "#34D399")
        grid.addWidget(self.card_customers_v1)
        grid.addWidget(self.card_pending_v1)
        grid.addWidget(self.card_active_subs_v1)
        grid.addWidget(self.card_revenue_v1)
        layout.addLayout(grid)

        # Quick actions
        act_box = QFrame()
        act_box.setObjectName("card")
        act_layout = QVBoxLayout(act_box)
        act_layout.setContentsMargins(16, 16, 16, 16)
        act_lbl = QLabel("⚡ إجراءات سريعة:")
        act_lbl.setStyleSheet("font-weight: bold; color: #D4AF37;")
        act_layout.addWidget(act_lbl)

        btn_row = QHBoxLayout()
        b1 = QPushButton("+ إصدار ترخيص مباشر")
        b1.setObjectName("primary")
        b1.clicked.connect(lambda: self.switch_view(2))
        btn_row.addWidget(b1)

        b2 = QPushButton("👥 الانتقال لطلبات العملاء")
        b2.clicked.connect(lambda: self.switch_view(0))
        btn_row.addWidget(b2)

        b3 = QPushButton("📦 توليد حزمة تفعيل بدون إنترنت")
        b3.clicked.connect(lambda: self.switch_view(4))
        btn_row.addWidget(b3)
        act_layout.addLayout(btn_row)
        layout.addWidget(act_box)

        layout.addStretch()
        return w

    def _make_kpi_card(self, title: str, val: str, color: str) -> QFrame:
        f = QFrame()
        f.setObjectName("card")
        l = QVBoxLayout(f)
        l.setContentsMargins(16, 14, 16, 14)
        t = QLabel(title)
        t.setStyleSheet("font-size: 12px; color: #9CA3AF;")
        v = QLabel(val)
        v.setStyleSheet(f"font-size: 22px; font-weight: bold; color: {color};")
        l.addWidget(t)
        l.addWidget(v)
        f.val_label = v
        return f

    # ==========================================================================
    # View 2: License Operations
    # ==========================================================================

    def _build_licenses_view(self) -> QWidget:
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(16)

        title = QLabel("🔑 إصدار وتجديد التراخيص المشفرة رقمياً (Ed25519)")
        title.setStyleSheet("font-size: 16px; font-weight: bold; color: #D4AF37;")
        layout.addWidget(title)

        form_card = QFrame()
        form_card.setObjectName("card")
        form_layout = QVBoxLayout(form_card)
        form_layout.setContentsMargins(20, 20, 20, 20)
        form_layout.setSpacing(10)

        form_layout.addWidget(QLabel("كود العميل (Customer ID - مثل CUST-XXXX):"))
        self.txt_lic_cust_id = QLineEdit()
        self.txt_lic_cust_id.setPlaceholderText("CUST-XXXX")
        form_layout.addWidget(self.txt_lic_cust_id)

        form_layout.addWidget(QLabel("خطة الاشتراك:"))
        self.cb_lic_plan = QComboBox()
        self.cb_lic_plan.addItem("باقة التجربة المجانية (14 يوماً)", "trial_14d")
        self.cb_lic_plan.addItem("الباقة الشهرية (30 يوماً)", "monthly_standard")
        self.cb_lic_plan.addItem("الباقة الربع سنوية (90 يوماً)", "quarterly_pro")
        self.cb_lic_plan.addItem("الباقة السنوية الشاملة (365 يوماً - VIP)", "annual_pro")
        self.cb_lic_plan.addItem("الباقة الدائمة مدى الحياة (Lifetime VIP)", "lifetime_vip")
        form_layout.addWidget(self.cb_lic_plan)

        form_layout.addWidget(QLabel("الحد الأقصى للأجهزة المصرح بها (Device Limit):"))
        self.sp_device_limit = QSpinBox()
        self.sp_device_limit.setRange(1, 20)
        self.sp_device_limit.setValue(1)
        form_layout.addWidget(self.sp_device_limit)

        btn_issue = QPushButton("توقيع وإصدار الترخيص الآن بواسطة Ed25519")
        btn_issue.setObjectName("primary")
        btn_issue.setFixedHeight(40)
        btn_issue.clicked.connect(self._do_issue_license)
        form_layout.addWidget(btn_issue)

        self.lbl_lic_result = QLabel("")
        self.lbl_lic_result.setStyleSheet("font-size: 14px; font-weight: bold; color: #10B981; padding: 10px;")
        form_layout.addWidget(self.lbl_lic_result)

        layout.addWidget(form_card)
        layout.addStretch()
        return w

    def _do_issue_license(self):
        cid = self.txt_lic_cust_id.text().strip()
        plan = self.cb_lic_plan.currentData()
        lim = self.sp_device_limit.value()

        if not cid:
            QMessageBox.warning(self, "تنبيه", "يرجى إدخال كود العميل.")
            return

        ok, msg, key = self.client.issue_license(cid, plan, custom_device_limit=lim)
        if ok:
            self.lbl_lic_result.setText(f"✓ تم إصدار الترخيص بنجاح:\n{key}")
            QMessageBox.information(self, "تم بنجاح", f"تم إصدار الترخيص المشفر وتوقيعه رقمياً بنجاح:\n\n{key}")
            self.refresh_all_data()
        else:
            QMessageBox.critical(self, "فشل الإصدار", msg)

    # ==========================================================================
    # View 3: Devices Management
    # ==========================================================================

    def _build_devices_view(self) -> QWidget:
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(12)

        lbl = QLabel("💻 قائمة محطات العمل والأجهزة النشطة المسجلة")
        lbl.setStyleSheet("font-size: 16px; font-weight: bold; color: #D4AF37;")
        layout.addWidget(lbl)

        self.table_devices = QTableWidget()
        self.table_devices.setColumnCount(7)
        self.table_devices.setHorizontalHeaderLabels([
            "معرف الجهاز (ID)", "اسم المحطة", "كود العميل", "كود الترخيص", "الحالة", "آخر فحص", "تحرير المقعد"
        ])
        self.table_devices.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        layout.addWidget(self.table_devices)
        return w

    def load_devices_table(self):
        devs = self.client.get_devices()
        self.table_devices.setRowCount(len(devs))
        for r, d in enumerate(devs):
            self.table_devices.setItem(r, 0, QTableWidgetItem(d["device_id"][:18] + "..."))
            self.table_devices.setItem(r, 1, QTableWidgetItem(d["device_name"]))
            self.table_devices.setItem(r, 2, QTableWidgetItem(d["customer_id"]))
            self.table_devices.setItem(r, 3, QTableWidgetItem(d["license_id"]))
            self.table_devices.setItem(r, 4, QTableWidgetItem(d["status"]))
            self.table_devices.setItem(r, 5, QTableWidgetItem(d["last_validated_utc"][:16] if d.get("last_validated_utc") else "-"))

            if d["status"] == "ACTIVE":
                btn = QPushButton("تحرير المقعد")
                btn.setObjectName("danger")
                btn.clicked.connect(lambda _, cid=d["customer_id"], did=d["device_id"]: self._release_dev(cid, did))
                self.table_devices.setCellWidget(r, 6, btn)

    def _release_dev(self, cust_id: str, device_id: str):
        if QMessageBox.question(self, "تأكيد", "هل أنت متأكد من تحرير هذا الجهاز؟") == QMessageBox.StandardButton.Yes:
            ok, msg = self.client.release_device(cust_id, device_id)
            if ok:
                QMessageBox.information(self, "نجاح", msg)
                self.load_devices_table()
            else:
                QMessageBox.critical(self, "خطأ", msg)

    # ==========================================================================
    # View 4: Offline Packages
    # ==========================================================================

    def _build_offline_view(self) -> QWidget:
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(14)

        title = QLabel("📦 توليد وتصدير حزم التفعيل بدون إنترنت (Air-gapped Offline Licenses)")
        title.setStyleSheet("font-size: 16px; font-weight: bold; color: #D4AF37;")
        layout.addWidget(title)

        card = QFrame()
        card.setObjectName("card")
        c_layout = QVBoxLayout(card)
        c_layout.setContentsMargins(20, 20, 20, 20)
        c_layout.setSpacing(10)

        c_layout.addWidget(QLabel("مفتاح الترخيص (License Key):"))
        self.txt_off_key = QLineEdit()
        self.txt_off_key.setPlaceholderText("TPRO-XXXX-XXXX-XXXX-XXXX")
        c_layout.addWidget(self.txt_off_key)

        c_layout.addWidget(QLabel("معرف الجهاز (Installation Device ID من شاشة التفعيل):"))
        self.txt_off_devid = QLineEdit()
        self.txt_off_devid.setPlaceholderText("انسخ المعرف المعروض في جهاز العميل هنا...")
        c_layout.addWidget(self.txt_off_devid)

        c_layout.addWidget(QLabel("اسم الجهاز أو المحطة:"))
        self.txt_off_name = QLineEdit("Main Workstation")
        c_layout.addWidget(self.txt_off_name)

        btn_gen = QPushButton("توليد وتوقيع الحزمة بدون إنترنت (.prolablic)")
        btn_gen.setObjectName("primary")
        btn_gen.setFixedHeight(38)
        btn_gen.clicked.connect(self._do_generate_offline_pkg)
        c_layout.addWidget(btn_gen)

        self.txt_off_output = QTextEdit()
        self.txt_off_output.setPlaceholderText("ستظهر الحزمة المشفرة الموقعة هنا...")
        self.txt_off_output.setFixedHeight(120)
        c_layout.addWidget(self.txt_off_output)

        btn_save = QPushButton("💾 حفظ الملف باسم license.prolablic وإرساله للعميل")
        btn_save.clicked.connect(self._save_offline_file)
        c_layout.addWidget(btn_save)

        layout.addWidget(card)
        layout.addStretch()
        return w

    def _do_generate_offline_pkg(self):
        k = self.txt_off_key.text().strip()
        d = self.txt_off_devid.text().strip()
        n = self.txt_off_name.text().strip()
        if not k or not d:
            QMessageBox.warning(self, "تنبيه", "يرجى إدخال مفتاح الترخيص ومعرف الجهاز.")
            return

        ok, msg, b64 = self.client.generate_offline_package(k, d, n)
        if ok:
            self.txt_off_output.setPlainText(b64)
            QMessageBox.information(self, "تم التوليد", "تم توليد وتوقيع حزمة التفعيل بنجاح.")
        else:
            QMessageBox.critical(self, "خطأ", msg)

    def _save_offline_file(self):
        content = self.txt_off_output.toPlainText().strip()
        if not content:
            QMessageBox.warning(self, "تنبيه", "لا توجد حزمة لتصديرها. قم بتوليد الحزمة أولاً.")
            return
        path, _ = QFileDialog.getSaveFileName(self, "حفظ حزمة التفعيل", "license.prolablic", "ProLab License (*.prolablic)")
        if path:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            QMessageBox.information(self, "نجاح", f"تم حفظ الحزمة في:\n{path}")

    # ==========================================================================
    # View 5: Payments
    # ==========================================================================

    def _build_payments_view(self) -> QWidget:
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(12)

        title = QLabel("💳 مراجعة سجلات التحصيل والمدفوعات")
        title.setStyleSheet("font-size: 16px; font-weight: bold; color: #D4AF37;")
        layout.addWidget(title)

        self.table_payments = QTableWidget()
        self.table_payments.setColumnCount(8)
        self.table_payments.setHorizontalHeaderLabels([
            "رقم الإشعار", "كود العميل", "المبلغ", "وسيلة الدفع", "رقم المرجع / المحفظة", "الحالة", "التاريخ", "تأكيد التفعيل"
        ])
        self.table_payments.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        layout.addWidget(self.table_payments)
        return w

    def load_payments_table(self):
        pays = self.client.get_payments()
        self.table_payments.setRowCount(len(pays))
        for r, p in enumerate(pays):
            self.table_payments.setItem(r, 0, QTableWidgetItem(p["payment_id"]))
            self.table_payments.setItem(r, 1, QTableWidgetItem(p["customer_id"]))
            self.table_payments.setItem(r, 2, QTableWidgetItem(f"{p['amount']} {p['currency']}"))
            self.table_payments.setItem(r, 3, QTableWidgetItem(p["payment_method"]))
            self.table_payments.setItem(r, 4, QTableWidgetItem(p.get("reference_number") or "-"))
            self.table_payments.setItem(r, 5, QTableWidgetItem(p["status"]))
            self.table_payments.setItem(r, 6, QTableWidgetItem(p["created_at"][:10]))

            if p["status"] == "PENDING":
                btn = QPushButton("تأكيد وتفعيل")
                btn.setObjectName("primary")
                btn.clicked.connect(lambda _, pid=p["payment_id"]: self._confirm_pay(pid))
                self.table_payments.setCellWidget(r, 7, btn)

    def _confirm_pay(self, payment_id: str):
        ok, msg = self.client.confirm_payment(payment_id, "CONFIRMED", plan_id="annual_pro")
        if ok:
            QMessageBox.information(self, "نجاح", msg)
            self.refresh_all_data()
        else:
            QMessageBox.critical(self, "خطأ", msg)

    # ==========================================================================
    # View 6: Audit Logs
    # ==========================================================================

    def _build_audit_view(self) -> QWidget:
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(12)

        title = QLabel("🛡️ سجل الرقابة والأمان الإداري الموحد (Audit Trail)")
        title.setStyleSheet("font-size: 16px; font-weight: bold; color: #D4AF37;")
        layout.addWidget(title)

        self.table_audit = QTableWidget()
        self.table_audit.setColumnCount(7)
        self.table_audit.setHorizontalHeaderLabels([
            "التوقيت (UTC)", "المسؤول", "الصلاحية", "نوع الإجراء", "الهدف", "النتيجة", "عنوان IP"
        ])
        self.table_audit.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        layout.addWidget(self.table_audit)
        return w

    def load_audit_table(self):
        logs = self.client.get_audit_logs()
        self.table_audit.setRowCount(len(logs))
        for r, a in enumerate(logs):
            self.table_audit.setItem(r, 0, QTableWidgetItem(a["timestamp_utc"][:19].replace("T", " ")))
            self.table_audit.setItem(r, 1, QTableWidgetItem(a["actor_username"]))
            self.table_audit.setItem(r, 2, QTableWidgetItem(a["actor_role"]))
            self.table_audit.setItem(r, 3, QTableWidgetItem(a["action_type"]))
            self.table_audit.setItem(r, 4, QTableWidgetItem(a.get("target_id") or "-"))
            self.table_audit.setItem(r, 5, QTableWidgetItem(a["result"]))
            self.table_audit.setItem(r, 6, QTableWidgetItem(a.get("ip_address") or "-"))

    # ==========================================================================
    # Core Data Refreshers
    # ==========================================================================

    def refresh_all_data(self):
        stats = self.client.get_stats()
        if stats:
            p_count = stats.get("pending_approvals", 0)
            t_count = stats.get("total_customers", 0)
            a_count = stats.get("active_subscriptions", 0)
            d_count = stats.get("active_devices", 0)

            # View 0 KPIs
            self.card_pending.val_label.setText(str(p_count))
            self.card_active.val_label.setText(str(a_count))
            self.card_total.val_label.setText(str(t_count))
            self.card_devs.val_label.setText(str(d_count))

            # View 1 KPIs
            self.card_customers_v1.val_label.setText(str(t_count))
            self.card_pending_v1.val_label.setText(str(p_count))
            self.card_active_subs_v1.val_label.setText(str(a_count))
            self.card_revenue_v1.val_label.setText(f"{stats.get('total_revenue_egp', 0):,.0f} ج.م")

        self.load_customers_table()
        self.load_devices_table()
        self.load_payments_table()
        self.load_audit_table()

    def load_customers_table(self):
        custs = self.client.get_customers()
        self._cached_customers = custs
        self._apply_local_filters()

    def _silent_poll(self):
        """Silently refreshes counters and new customer registrations in the background."""
        try:
            stats = self.client.get_stats()
            if stats:
                p_count = stats.get("pending_approvals", 0)
                if str(p_count) != self.card_pending.val_label.text():
                    self.refresh_all_data()
        except Exception:
            pass


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("ThermalLabPro License Manager")
    app.setOrganizationName("ProLab")

    # Set Application Icon
    icon_candidates = [
        _root_dir / "assets" / "app_icon.ico",
        Path(sys.executable).parent / "assets" / "app_icon.ico",
        _current_dir / "app_icon.ico"
    ]
    for ic in icon_candidates:
        if ic.exists():
            app.setWindowIcon(QIcon(str(ic)))
            break

    client = LicenseManagerAPIClient(os.environ.get("LICENSING_SERVER_URL", "http://127.0.0.1:8000"))

    # Attempt Instant Silent Auto-Login to local server
    auto_ok, _ = client.login("superadmin", "ProLabAdmin2026!Secure")
    if not auto_ok:
        # Check if local server needs to be launched
        LoginDialog._launch_server_process()
        auto_ok, _ = client.login("superadmin", "ProLabAdmin2026!Secure")

    if auto_ok:
        window = LicenseManagerWindow(client)
        window.show()
        sys.exit(app.exec())
    else:
        # Fall back to interactive Login Dialog if credentials or remote host differ
        login = LoginDialog(client)
        if login.exec() != QDialog.DialogCode.Accepted:
            sys.exit(0)

        window = LicenseManagerWindow(client)
        window.show()
        sys.exit(app.exec())


if __name__ == "__main__":
    main()
