"""
license_manager/main.py — ThermalLabPro License Manager Desktop Application (Component C)
Independent Administrative Licensing Tool for the Software Owner & Licensing Engineers.
Features:
- Customer Lookup & Approval Workflow
- Cryptographic License Issuance, Renewal & Extension
- Device Management & Seat Deallocation / Transfer
- Offline Signed License Package Generator (.prolablic)
- Payment Auditing & Real-time KPI Dashboard
"""
import json
import logging
import os
import sys
from pathlib import Path
from typing import Optional, Tuple, Dict, Any, List

# Ensure project root and package directories are in sys.path
_current_dir = Path(__file__).resolve().parent
_root_dir = _current_dir.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))
if str(_current_dir) not in sys.path:
    sys.path.insert(0, str(_current_dir))

from PyQt6.QtCore import Qt, QSize
from PyQt6.QtGui import QIcon, QFont, QColor
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QLineEdit, QTableWidget, QTableWidgetItem,
    QHeaderView, QMessageBox, QTabWidget, QDialog, QComboBox,
    QSpinBox, QTextEdit, QFrame, QFileDialog, QSplitter, QStackedWidget
)

try:
    from license_manager.api_client import LicenseManagerAPIClient
except ImportError:
    from api_client import LicenseManagerAPIClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("license_manager")

THEME_QSS = """
QMainWindow, QDialog {
    background-color: #0F0F13;
    color: #E5E7EB;
    font-family: 'Segoe UI', Tahoma, Arial;
}
QFrame#sidebar {
    background-color: #14141B;
    border-left: 1px solid #282834;
}
QFrame#card {
    background-color: #16161D;
    border: 1px solid #282834;
    border-radius: 8px;
}
QPushButton {
    background-color: #1F1F2A;
    color: #E5E7EB;
    border: 1px solid #282834;
    border-radius: 5px;
    padding: 6px 12px;
    font-weight: bold;
}
QPushButton:hover {
    background-color: #282837;
    border-color: #D4AF37;
    color: #D4AF37;
}
QPushButton#primary {
    background-color: #D4AF37;
    color: #000000;
    border: none;
}
QPushButton#primary:hover {
    background-color: #E5C158;
}
QPushButton#danger {
    background-color: #7F1D1D;
    color: #FCA5A5;
    border: 1px solid #991B1B;
}
QPushButton#danger:hover {
    background-color: #991B1B;
}
QLineEdit, QComboBox, QSpinBox, QTextEdit {
    background-color: #0B0B0F;
    color: #F3F4F6;
    border: 1px solid #282834;
    border-radius: 5px;
    padding: 6px 10px;
    selection-background-color: #D4AF37;
    selection-color: #000;
}
QLineEdit:focus, QComboBox:focus, QTextEdit:focus {
    border-color: #D4AF37;
}
QTableWidget {
    background-color: #121218;
    color: #E5E7EB;
    border: 1px solid #282834;
    border-radius: 6px;
    gridline-color: #20202C;
}
QHeaderView::section {
    background-color: #181822;
    color: #D4AF37;
    font-weight: bold;
    border: none;
    border-bottom: 1px solid #282834;
    padding: 6px;
}
QTableWidget::item:selected {
    background-color: #282837;
    color: #D4AF37;
}
"""


class LoginDialog(QDialog):
    """Administrative authentication dialog connecting to central backend."""

    def __init__(self, client: LicenseManagerAPIClient, parent=None):
        super().__init__(parent)
        self.client = client
        self.setWindowTitle("دخول مدير التراخيص — ProLab License Manager")
        self.setFixedSize(400, 320)
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

    def _launch_server_process(self) -> Tuple[bool, str]:
        import socket, subprocess, sys, os, time, shutil
        from pathlib import Path

        # Check if already running on port 8000
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            if s.connect_ex(("127.0.0.1", 8000)) == 0:
                return True, "الخادم يعمل بالفعل على المنفذ 8000."

        # Find python binary
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

        # Determine project root where server/ resides
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

        # Spawn uvicorn server in detached background process
        CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0
        cmd = [py_exe, "-m", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
        try:
            subprocess.Popen(cmd, cwd=proj_dir, creationflags=CREATE_NO_WINDOW, close_fds=True)
            for _ in range(6):
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
            if ("10061" in msg or "Max retries" in msg or "Connection Refused" in msg or "غير قيد التشغيل" in msg) and ("127.0.0.1" in url or "localhost" in url):
                ans = QMessageBox.question(
                    self,
                    "الخادم غير مشغل",
                    "خادم التراخيص المركزي غير قيد التشغيل حالياً على المنفذ (127.0.0.1:8000).\n\nهل تريد تشغيل خادم التراخيص المحلي الآن تلقائياً ومتابعة تسجيل الدخول؟",
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
        self.setWindowTitle("ThermalLabPro — License Manager Studio (إدارة التراخيص والاشتراكات)")
        self.resize(1300, 800)
        self.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
        self.setStyleSheet(THEME_QSS)

        self._init_ui()
        self.refresh_all_data()

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
        lbl_logo = QLabel("👑 PROLAB LICENSE")
        lbl_logo.setStyleSheet("font-size: 16px; font-weight: 800; color: #D4AF37;")
        sb_layout.addWidget(lbl_logo)

        lbl_user = QLabel(f"المستخدم: {self.client.current_user or 'Admin'} ({self.client.current_role})")
        lbl_user.setStyleSheet("font-size: 11px; color: #10B981; margin-bottom: 12px;")
        sb_layout.addWidget(lbl_user)

        # Navigation Buttons
        self.nav_btns = []
        nav_items = [
            ("📊 المؤشرات العامة", 0),
            ("👥 طلبات وسجل العملاء", 1),
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

        btn_refresh = QPushButton("🔄 تحديث البيانات")
        btn_refresh.clicked.connect(self.refresh_all_data)
        sb_layout.addWidget(btn_refresh)

        main_layout.addWidget(sidebar)

        # 2. Right Content Stack
        self.tabs = QStackedWidget()

        # View 0: Dashboard Stats
        self.tab_stats = self._build_stats_view()
        self.tabs.addWidget(self.tab_stats)

        # View 1: Customers & Approvals
        self.tab_customers = self._build_customers_view()
        self.tabs.addWidget(self.tab_customers)

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

    def switch_view(self, index: int):
        self.tabs.setCurrentIndex(index)
        for i, b in enumerate(self.nav_btns):
            b.setStyleSheet("border-color: #D4AF37; color: #D4AF37;" if i == index else "")

    # ==========================================================================
    # View Builders
    # ==========================================================================

    def _build_stats_view(self) -> QWidget:
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(16)

        header = QLabel("📊 لوحة مؤشرات التراخيص والاشتراكات المركزية")
        header.setStyleSheet("font-size: 18px; font-weight: bold; color: #D4AF37;")
        layout.addWidget(header)

        grid = QHBoxLayout()
        self.card_customers = self._make_kpi_card("إجمالي العملاء", "0", "#D4AF37")
        self.card_pending = self._make_kpi_card("انتظار الموافقة", "0", "#F59E0B")
        self.card_active_subs = self._make_kpi_card("اشتراكات نشطة", "0", "#10B981")
        self.card_revenue = self._make_kpi_card("الإيرادات المؤكدة", "0 ج.م", "#34D399")
        grid.addWidget(self.card_customers)
        grid.addWidget(self.card_pending)
        grid.addWidget(self.card_active_subs)
        grid.addWidget(self.card_revenue)
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

        b2 = QPushButton("👥 مراجعة طلبات التسجيل المعلقة")
        b2.clicked.connect(lambda: self.switch_view(1))
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

    def _build_customers_view(self) -> QWidget:
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(12)

        # Filter bar
        bar = QHBoxLayout()
        self.txt_cust_search = QLineEdit()
        self.txt_cust_search.setPlaceholderText("بحث بالاسم، المحل، الهاتف، الترخيص...")
        self.txt_cust_search.returnPressed.connect(self.load_customers_table)
        bar.addWidget(self.txt_cust_search)

        self.cb_cust_filter = QComboBox()
        self.cb_cust_filter.addItems(["جميع الحالات", "PENDING_APPROVAL", "APPROVED", "PENDING_VERIFICATION", "SUSPENDED", "BLOCKED"])
        self.cb_cust_filter.currentIndexChanged.connect(self.load_customers_table)
        bar.addWidget(self.cb_cust_filter)

        btn_search = QPushButton("بحث")
        btn_search.clicked.connect(self.load_customers_table)
        bar.addWidget(btn_search)
        layout.addLayout(bar)

        # Table
        self.table_customers = QTableWidget()
        self.table_customers.setColumnCount(8)
        self.table_customers.setHorizontalHeaderLabels([
            "كود العميل", "الاسم والنشاط التجاري", "رقم الهاتف", "المحافظة", "الحالة", "الترخيص", "تاريخ التسجيل", "الإجراء"
        ])
        self.table_customers.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        layout.addWidget(self.table_customers)
        return w

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
        self.txt_off_name = QLineEdit("POS Counter Station")
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

    # ==========================================================================
    # Business Operations
    # ==========================================================================

    def refresh_all_data(self):
        stats = self.client.get_stats()
        if stats:
            self.card_customers.val_label.setText(str(stats["total_customers"]))
            self.card_pending.val_label.setText(str(stats["pending_approvals"]))
            self.card_active_subs.val_label.setText(str(stats["active_subscriptions"]))
            self.card_revenue.val_label.setText(f"{stats['total_revenue_egp']:,.0f} ج.م")

        self.load_customers_table()
        self.load_devices_table()
        self.load_payments_table()
        self.load_audit_table()

    def load_customers_table(self):
        search = self.txt_cust_search.text().strip()
        flt = self.cb_cust_filter.currentText()
        if flt == "جميع الحالات":
            flt = ""
        custs = self.client.get_customers(search=search, status_filter=flt)
        self.table_customers.setRowCount(len(custs))
        for r, c in enumerate(custs):
            self.table_customers.setItem(r, 0, QTableWidgetItem(c["customer_id"]))
            self.table_customers.setItem(r, 1, QTableWidgetItem(f"{c['full_name']} ({c['shop_name']})"))
            self.table_customers.setItem(r, 2, QTableWidgetItem(c["phone_number"]))
            self.table_customers.setItem(r, 3, QTableWidgetItem(c["city"]))
            self.table_customers.setItem(r, 4, QTableWidgetItem(c["account_status"]))
            self.table_customers.setItem(r, 5, QTableWidgetItem(c.get("license_key") or "-"))
            self.table_customers.setItem(r, 6, QTableWidgetItem(c["created_at"][:10]))

            # Action button
            if c["account_status"] == "PENDING_APPROVAL":
                btn = QPushButton("قبول وتفعيل")
                btn.setObjectName("primary")
                btn.clicked.connect(lambda _, cid=c["customer_id"]: self._approve_cust(cid))
                self.table_customers.setCellWidget(r, 7, btn)
            else:
                btn = QPushButton("تفاصيل")
                btn.clicked.connect(lambda _, cid=c["customer_id"]: self._view_cust(cid))
                self.table_customers.setCellWidget(r, 7, btn)

    def _approve_cust(self, cust_id: str):
        ok, msg, key = self.client.approve_customer(cust_id, "APPROVE", plan_id="annual_pro", notes="Approved via License Manager")
        if ok:
            QMessageBox.information(self, "نجاح", f"تم اعتماد العميل بنجاح وتم توليد الترخيص:\n{key or 'تم التفعيل'}")
            self.refresh_all_data()
        else:
            QMessageBox.critical(self, "خطأ", msg)

    def _view_cust(self, cust_id: str):
        det = self.client.get_customer_details(cust_id)
        if det:
            c = det["customer"]
            QMessageBox.information(
                self, "بيانات العميل",
                f"الاسم: {c['full_name']}\nالمحل: {c['shop_name']}\nالهاتف: {c['phone_number']}\nالحالة: {c['account_status']}\nالمدينة: {c['city']}"
            )

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

    def load_devices_table(self):
        devs = self.client.get_devices()
        self.table_devices.setRowCount(len(devs))
        for r, d in enumerate(devs):
            self.table_devices.setItem(r, 0, QTableWidgetItem(d["device_id"][:16] + "..."))
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

    # Show Login Dialog
    login = LoginDialog(client)
    if login.exec() != QDialog.DialogCode.Accepted:
        sys.exit(0)

    window = LicenseManagerWindow(client)
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
