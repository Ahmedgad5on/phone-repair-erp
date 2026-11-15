"""
ui/main_window.py — Executive Vertical Sidebar Trading ERP & 203 DPI Thermal CAD Studio
Mobile Phone Trading Store ERP (Strict Trading Focus: Owner & Salesperson).

Features:
1. Executive Vertical Navigation Sidebar (9 Workspaces):
   - 📱 المخزن والإدخال الذكي
   - 🛒 نقطة البيع والصناديق (F2)
   - 🔄 الاستبدال الفوري (F3)
   - 🤝 حسابات التجار والميمو (F4)
   - 📊 التحليلات ورادار الركود
   - 🔍 الجرد السريع (F5)
   - 🏷️ استوديو الملصقات CAD
   - 🤖 ربط بوت تيليجرام (Telegram Cloud Hub)
   - 🛡️ الأمان والإعدادات
2. Real-time Device Telemetry & Non-Overlapping Action Box.
3. Fast POS Shortcuts (F1 - F5, Ctrl+P, Ctrl+S).
4. Sleek 48px Top Telemetry Bar with Breadcrumbs.
"""
from datetime import datetime
import logging
import os
import time
from typing import Optional, Dict, Any, List
from PIL import Image, ImageDraw

from PyQt6.QtCore import Qt, pyqtSlot, QKeyCombination
from PyQt6.QtGui import QKeySequence, QShortcut, QFont, QAction, QIcon
from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QStackedWidget, QSplitter, QMessageBox, QFrame, QLabel,
    QComboBox, QSpinBox, QPushButton, QButtonGroup, QScrollArea, QSizePolicy
)

from core.database import DatabaseManager
from core.models import DeviceSpecs, DeviceRecord, SaleRecord, UserRole
from core.label_template_model import (
    PrintLabelTemplate, LabelElement, TemplateRepository,
    create_sample_template, resolve_field_value
)
from core.label_template_renderer import render_template_to_pil
from core.label_renderer import mm_to_dots, get_font, generate_code128_barcode, DOTS_PER_MM
from core.printer_win32 import print_label_image, save_virtual_print, calibrate_thermal_gap
from core.telegram_bot import TradingTelegramBot

from ui.status_bar import StatusBarPanel
from ui.intake_trading_tab import IntakeTradingTab
from ui.inventory_tab import InventoryTab
from ui.pos_tab import PosTab
from ui.traders_tab import TradersTab
from ui.analytics_tab import AnalyticsTab
from ui.reports_tab import ReportsTab
from ui.audit_tab import InventoryAuditTab
from ui.security_tab import SecurityTab
from ui.telegram_hub_tab import TelegramHubTab
from ui.pos_sale_dialog import PosSaleDialog
from ui.trade_in_dialog import TradeInDialog, TradeInWidget
from ui.trader_payment_dialog import TraderPaymentDialog
from ui.fast_adb_dialog import FastAdbDialog
from ui.pin_dialog import PinDialog

from ui.print_labels_canvas import PrintLabelsCanvas
from ui.printer_panel import PrinterManagerPanel
from ui.styles import load_theme
from ui.about_dialog import AboutDialog
from core.version import get_version, get_window_title, get_full_version
from core.licensing.client import get_licensing_client, LicensingClient
from core.licensing.license_verifier import LicenseStatusInfo
from core.licensing.update_checker import UpdateChecker
from ui.license_dialog import LicenseDialog
from ui.update_dialog import UpdateDialog
from ui.auth_dialog import AuthDialog
from ui.customer_profile_dialog import CustomerProfileDialog

logger = logging.getLogger(__name__)


class MainWindow(QMainWindow):
    """
    Primary Commercial Desktop Window for Mobile Phone Trading Store.
    Features an Executive Vertical Sidebar and QStackedWidget architecture.
    """

    def __init__(self, db: Optional[DatabaseManager] = None, license_status: Optional[Any] = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle(get_window_title())
        self.setMinimumSize(1280, 760)
        self.resize(1480, 920)

        self.db = db or DatabaseManager()
        self.lic_client = get_licensing_client()
        self.license_status = license_status or self.lic_client.get_license_status()

        self.current_role = "Owner"
        self.current_user = "Owner"
        self._current_specs: DeviceSpecs = DeviceSpecs.empty()
        self._stock_number: str = "001"

        # Apply Global Obsidian & Metallic Gold Theme
        self.setStyleSheet(load_theme())

        self._init_layout()
        self._init_shortcuts()
        self._wire_events()
        self._init_telegram_bot()
        self._sync_initial_state()
        self._init_github_sync()

    def _init_layout(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        main_hbox = QHBoxLayout(central_widget)
        main_hbox.setContentsMargins(0, 0, 0, 0)
        main_hbox.setSpacing(0)

        # ===================================================================
        # 1. EXECUTIVE VERTICAL NAVIGATION SIDEBAR (Left Panel, 280px)
        # ===================================================================
        self.sidebar_frame = QFrame()
        self.sidebar_frame.setObjectName("SidebarFrame")
        self.sidebar_frame.setFixedWidth(280)
        sidebar_layout = QVBoxLayout(self.sidebar_frame)
        sidebar_layout.setContentsMargins(12, 12, 12, 12)
        sidebar_layout.setSpacing(8)

        # Brand / Logo Header (Fixed Height to Prevent Vertical Squashing)
        brand_card = QFrame()
        brand_card.setObjectName("card")
        brand_card.setMinimumHeight(66)
        brand_card.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Fixed)
        brand_layout = QVBoxLayout(brand_card)
        brand_layout.setContentsMargins(10, 8, 10, 8)
        brand_layout.setSpacing(2)

        lbl_logo_title = QLabel("👑 THERMALLABPRO")
        lbl_logo_title.setObjectName("title")
        lbl_logo_title.setStyleSheet("font-size: 15px; font-weight: 800; color: #D4AF37;")
        brand_layout.addWidget(lbl_logo_title)

        lbl_logo_sub = QLabel(f"Commercial ERP Studio v{get_version()}")
        lbl_logo_sub.setStyleSheet("font-size: 11px; color: #9CA3AF;")
        brand_layout.addWidget(lbl_logo_sub)
        brand_card.setCursor(Qt.CursorShape.PointingHandCursor)
        brand_card.mousePressEvent = lambda e: self._show_about_dialog()
        sidebar_layout.addWidget(brand_card)

        # Connected Device Live Telemetry Card (Fixed Height to Prevent Vertical Clipping)
        self.dev_telemetry_card = QFrame()
        self.dev_telemetry_card.setObjectName("card-highlight")
        self.dev_telemetry_card.setMinimumHeight(116)
        self.dev_telemetry_card.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Fixed)
        telemetry_layout = QVBoxLayout(self.dev_telemetry_card)
        telemetry_layout.setContentsMargins(10, 8, 10, 8)
        telemetry_layout.setSpacing(6)

        self.lbl_device_status = QLabel("📱 في انتظار توصيل هاتف...")
        self.lbl_device_status.setStyleSheet("font-size: 12px; font-weight: bold; color: #9CA3AF;")
        self.lbl_device_status.setWordWrap(True)
        telemetry_layout.addWidget(self.lbl_device_status)

        self.lbl_device_details = QLabel("USB Auto-Detect | 203 DPI")
        self.lbl_device_details.setStyleSheet("font-size: 10px; color: #6B7280;")
        telemetry_layout.addWidget(self.lbl_device_details)

        # Action Buttons in Side-by-Side Row
        btn_box = QHBoxLayout()
        btn_box.setContentsMargins(0, 4, 0, 0)
        btn_box.setSpacing(6)

        self.btn_fast_adb = QPushButton("⚡ تفعيل ADB")
        self.btn_fast_adb.setFixedHeight(30)
        self.btn_fast_adb.setToolTip("إرشادات وتفعيل وضع نقل البيانات وتصحيح الأخطاء لهاتفك")
        self.btn_fast_adb.setProperty("class", "primary")
        self.btn_fast_adb.clicked.connect(self._open_fast_adb_dialog)
        btn_box.addWidget(self.btn_fast_adb)

        self.btn_reread_usb = QPushButton("🔄 فحص (F1)")
        self.btn_reread_usb.setFixedHeight(30)
        self.btn_reread_usb.setProperty("class", "secondary")
        self.btn_reread_usb.clicked.connect(self._on_f1_reread)
        btn_box.addWidget(self.btn_reread_usb)

        telemetry_layout.addLayout(btn_box)
        sidebar_layout.addWidget(self.dev_telemetry_card)

        # Navigation Section Separator
        lbl_nav_hdr = QLabel("قوائم ووظائف النظام")
        lbl_nav_hdr.setStyleSheet("color: #6B7280; font-size: 10px; font-weight: bold; margin-top: 2px;")
        sidebar_layout.addWidget(lbl_nav_hdr)

        # Nav Buttons in Smooth Scroll Container
        scroll_nav = QScrollArea()
        scroll_nav.setWidgetResizable(True)
        scroll_nav.setFrameShape(QFrame.Shape.NoFrame)
        scroll_nav.setStyleSheet("""
            QScrollArea { background: transparent; border: none; }
            QScrollBar:vertical { width: 4px; background: transparent; }
            QScrollBar::handle:vertical { background: #28283C; border-radius: 2px; }
            QScrollBar::handle:vertical:hover { background: #D4AF37; }
        """)

        nav_container = QWidget()
        nav_container.setStyleSheet("background: transparent;")
        nav_lay = QVBoxLayout(nav_container)
        nav_lay.setContentsMargins(0, 0, 4, 0)
        nav_lay.setSpacing(5)

        self.nav_button_group = QButtonGroup(self)
        self.nav_button_group.setExclusive(True)

        nav_items = [
            ("📱 إدخال هاتف وطباعة (F1)", 0),
            ("📦 إدارة المخزن الشاملة", 1),
            ("🛒 نقطة البيع والصناديق (F2)", 2),
            ("🔄 الاستبدال الفوري (F3)", 3),
            ("🤝 حسابات التجار والميمو (F4)", 4),
            ("📑 مركز التقارير والطباعة", 5),
            ("📊 التحليلات ورادار الركود", 6),
            ("🔍 الجرد السريع (F5)", 7),
            ("🏷️ استوديو الملصقات CAD", 8),
            ("🤖 ربط بوت تيليجرام", 9),
            ("🛡️ الأمان والإعدادات", 10),
        ]

        self.nav_buttons: List[QPushButton] = []
        for text, idx in nav_items:
            btn = QPushButton(text)
            btn.setProperty("class", "nav-btn")
            btn.setCheckable(True)
            btn.setFixedHeight(34)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            self.nav_button_group.addButton(btn, idx)
            nav_lay.addWidget(btn)
            self.nav_buttons.append(btn)

        nav_lay.addStretch()
        scroll_nav.setWidget(nav_container)
        sidebar_layout.addWidget(scroll_nav, 1)

        self.nav_button_group.idClicked.connect(self._on_sidebar_nav_clicked)
        # Select first tab by default
        self.nav_buttons[0].setChecked(True)

        # Bottom Sidebar Utilities (Thermal Print + Role Switcher + Version)
        bottom_box = QFrame()
        bottom_box.setObjectName("card")
        bottom_box.setMinimumHeight(118)
        bottom_box.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Fixed)
        b_layout = QVBoxLayout(bottom_box)
        b_layout.setContentsMargins(8, 8, 8, 8)
        b_layout.setSpacing(6)

        self.btn_master_print = QPushButton("🖨️ طباعة الملصق (Ctrl+P)")
        self.btn_master_print.setFixedHeight(36)
        self.btn_master_print.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #D4AF37, stop:1 #E5C158);
                color: #0D0D11;
                font-weight: 800;
                font-size: 12px;
                border-radius: 5px;
                border: none;
            }
            QPushButton:hover {
                background: #F5D77F;
            }
        """)
        self.btn_master_print.clicked.connect(lambda: self._execute_print_active_label())
        b_layout.addWidget(self.btn_master_print)

        self.btn_role_switch = QPushButton("👑 صاحب المحل (Owner)")
        self.btn_role_switch.setFixedHeight(30)
        self.btn_role_switch.setStyleSheet("""
            QPushButton {
                background-color: #1A1A24;
                color: #D4AF37;
                border: 1px solid #D4AF37;
                border-radius: 4px;
                font-size: 11px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #2D2D3E;
            }
        """)
        self.btn_role_switch.clicked.connect(self._toggle_role_interactive)
        b_layout.addWidget(self.btn_role_switch)

        self.btn_customer_account = QPushButton("👤 تسجيل الدخول / حساب جديد")
        self.btn_customer_account.setFixedHeight(28)
        self.btn_customer_account.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_customer_account.clicked.connect(self._open_customer_account_dialog)
        b_layout.addWidget(self.btn_customer_account)

        self.btn_license_status = QPushButton("🛡️ فحص الترخيص...")
        self.btn_license_status.setFixedHeight(28)
        self.btn_license_status.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_license_status.clicked.connect(self._open_license_dialog)
        b_layout.addWidget(self.btn_license_status)

        self.btn_github_sync = QPushButton("🔄 مزامنة GitHub (لحظية)")
        self.btn_github_sync.setFixedHeight(28)
        self.btn_github_sync.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_github_sync.setStyleSheet("""
            QPushButton {
                background-color: #121A28;
                color: #60A5FA;
                border: 1px solid #2563EB;
                border-radius: 4px;
                font-size: 11px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #1E293B;
                color: #93C5FD;
                border-color: #3B82F6;
            }
        """)
        self.btn_github_sync.clicked.connect(self._manual_github_sync)
        b_layout.addWidget(self.btn_github_sync)

        self.btn_version_about = QPushButton(f"ℹ️ الإصدار {get_full_version()}")
        self.btn_version_about.setFixedHeight(24)
        self.btn_version_about.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_version_about.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                color: #9CA3AF;
                border: 1px solid #282834;
                border-radius: 4px;
                font-size: 10px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #1A1A24;
                color: #10B981;
                border-color: #10B981;
            }
        """)
        self.btn_version_about.clicked.connect(self._show_about_dialog)
        b_layout.addWidget(self.btn_version_about)

        sidebar_layout.addWidget(bottom_box)
        main_hbox.addWidget(self.sidebar_frame)

        # ===================================================================
        # 2. MAIN WORKSPACE AREA (Right Side with Top Bar + Stacked Pages)
        # ===================================================================
        right_container = QWidget()
        right_vbox = QVBoxLayout(right_container)
        right_vbox.setContentsMargins(10, 8, 10, 8)
        right_vbox.setSpacing(8)

        # Top Command & Telemetry Bar (Sleek 48px)
        self.top_bar = StatusBarPanel(self)
        right_vbox.addWidget(self.top_bar)

        # Read-Only Lockout Banner (Visible when license is expired/missing)
        self.read_only_banner = QFrame()
        self.read_only_banner.setStyleSheet("""
            QFrame {
                background-color: #2D1515;
                border: 1px solid #EF4444;
                border-radius: 6px;
                padding: 4px 10px;
            }
        """)
        ro_layout = QHBoxLayout(self.read_only_banner)
        ro_layout.setContentsMargins(8, 2, 8, 2)
        self.lbl_ro_msg = QLabel("🔒 وضع القراءة فقط نشط — اشتراك البرنامج غير مفعل أو انتهت صلاحيته. يمكنك تصفح البيانات والنسخ الاحتياطي، ولكن تم إيقاف إضافة عمليات جديدة.")
        self.lbl_ro_msg.setStyleSheet("color: #FCA5A5; font-weight: bold; font-size: 11px;")
        ro_layout.addWidget(self.lbl_ro_msg)

        ro_layout.addStretch()

        btn_ro_activate = QPushButton("تفعيل الترخيص الآن")
        btn_ro_activate.setStyleSheet("background-color: #EF4444; color: white; font-weight: bold; border-radius: 4px; padding: 3px 10px; font-size: 11px;")
        btn_ro_activate.clicked.connect(self._open_license_dialog)
        ro_layout.addWidget(btn_ro_activate)

        right_vbox.addWidget(self.read_only_banner)
        self.read_only_banner.hide()

        # Central Stack of Workspaces (9 Pages)
        self.stack = QStackedWidget()

        # Page 0: Stock Intake & Smart Pricing
        self.tab_intake = IntakeTradingTab(db=self.db, current_role=self.current_role)
        self.stack.addWidget(self.tab_intake)

        # Page 1: Full Warehouse & Stock Management
        self.tab_inventory = InventoryTab(db=self.db, current_role=self.current_role, current_user=self.current_user, parent=self)
        self.tab_inventory.request_print_label.connect(self._on_request_print_from_intake)
        self.tab_inventory.checkout_device.connect(self._on_checkout_from_inventory)
        self.stack.addWidget(self.tab_inventory)

        # Page 2: POS Sales & Multi-Wallet Vaults
        self.tab_pos = PosTab(db=self.db, current_role=self.current_role, current_user=self.current_user)
        self.stack.addWidget(self.tab_pos)

        # Page 3: 1-Click Unified Trade-In Page
        self.tab_trade_in = TradeInWidget(db=self.db, current_role=self.current_role, current_user=self.current_user)
        self.tab_trade_in.trade_in_completed.connect(self._on_trade_in_completed)
        self.stack.addWidget(self.tab_trade_in)

        # Page 4: Traders Ledger & Memos
        self.tab_traders = TradersTab(db=self.db, current_role=self.current_role, current_user=self.current_user)
        self.stack.addWidget(self.tab_traders)

        # Page 5: Dedicated Commercial Reports & PDF Printing Center
        self.tab_reports = ReportsTab(db=self.db, current_role=self.current_role, current_user=self.current_user)
        self.stack.addWidget(self.tab_reports)

        # Page 6: Hierarchical Analytics & Aging Radar
        self.tab_analytics = AnalyticsTab(db=self.db, current_role=self.current_role, current_user=self.current_user)
        self.stack.addWidget(self.tab_analytics)

        # Page 7: 5-Minute Inventory Audit
        self.tab_audit = InventoryAuditTab(db=self.db, current_role=self.current_role, current_user=self.current_user)
        self.stack.addWidget(self.tab_audit)

        # Page 8: CAD Studio Splitter (Center Canvas + Right Printer Dock)
        self.studio_splitter = QSplitter(Qt.Orientation.Horizontal)
        self.studio_splitter.setHandleWidth(4)

        # Studio Canvas & Formatting Toolbar
        center_widget = QWidget()
        center_layout = QVBoxLayout(center_widget)
        center_layout.setContentsMargins(0, 0, 0, 0)
        center_layout.setSpacing(6)

        self.toolbar_card = QFrame()
        self.toolbar_card.setObjectName("PanelCard")
        tb_layout = QHBoxLayout(self.toolbar_card)
        tb_layout.setContentsMargins(10, 6, 10, 6)
        tb_layout.setSpacing(6)

        # Font Family
        self.combo_font = QComboBox()
        self.combo_font.setFixedWidth(110)
        for f in ["Segoe UI", "Microsoft YaHei", "Arial", "Tahoma"]:
            self.combo_font.addItem(f)
        self.combo_font.currentIndexChanged.connect(self._on_typo_changed)
        tb_layout.addWidget(self.combo_font)

        # Font Size
        self.spin_size = QSpinBox()
        self.spin_size.setRange(5, 36)
        self.spin_size.setValue(8)
        self.spin_size.setFixedWidth(54)
        self.spin_size.setSuffix(" pt")
        self.spin_size.valueChanged.connect(self._on_typo_changed)
        tb_layout.addWidget(self.spin_size)

        # Bold Toggle
        self.btn_bold = QPushButton("B")
        self.btn_bold.setCheckable(True)
        self.btn_bold.setFixedSize(28, 28)
        self.btn_bold.setToolTip("خط عريض (Bold)")
        self.btn_bold.setStyleSheet("""
            QPushButton {
                font-weight: 900; font-family: Arial, sans-serif; font-size: 13px;
                padding: 0px; background-color: #1A1A24; color: #F4F4F6;
                border: 1px solid #282834; border-radius: 4px;
            }
            QPushButton:hover { border-color: #D4AF37; }
            QPushButton:checked { background-color: #D4AF37; color: #0D0D11; border-color: #D4AF37; }
        """)
        self.btn_bold.toggled.connect(self._on_typo_changed)
        tb_layout.addWidget(self.btn_bold)

        tb_btn_style = """
            QPushButton {
                font-family: Arial, sans-serif; font-size: 11px; font-weight: bold;
                padding: 0px; background-color: #1A1A24; color: #F4F4F6;
                border: 1px solid #282834; border-radius: 4px;
            }
            QPushButton:hover { border-color: #D4AF37; }
            QPushButton:checked { background-color: #D4AF37; color: #0D0D11; border-color: #D4AF37; }
        """

        self.btn_align_left = QPushButton("◀")
        self.btn_align_left.setToolTip("محاذاة لليسار")
        self.btn_align_left.setFixedSize(28, 28)
        self.btn_align_left.setCheckable(True)
        self.btn_align_left.setChecked(True)
        self.btn_align_left.setStyleSheet(tb_btn_style)

        self.btn_align_center = QPushButton("≡")
        self.btn_align_center.setToolTip("توسيط")
        self.btn_align_center.setFixedSize(28, 28)
        self.btn_align_center.setCheckable(True)
        self.btn_align_center.setStyleSheet(tb_btn_style)

        self.btn_align_right = QPushButton("▶")
        self.btn_align_right.setToolTip("محاذاة لليمين")
        self.btn_align_right.setFixedSize(28, 28)
        self.btn_align_right.setCheckable(True)
        self.btn_align_right.setStyleSheet(tb_btn_style)

        self.align_group = QButtonGroup(self)
        self.align_group.addButton(self.btn_align_left, 1)
        self.align_group.addButton(self.btn_align_center, 2)
        self.align_group.addButton(self.btn_align_right, 3)
        self.align_group.idClicked.connect(self._on_typo_changed)

        tb_layout.addWidget(self.btn_align_left)
        tb_layout.addWidget(self.btn_align_center)
        tb_layout.addWidget(self.btn_align_right)

        # Compact Smart Merge Button
        self.btn_smart_merge = QPushButton("⚡ دمج ذكي (38x25)")
        self.btn_smart_merge.setFixedHeight(28)
        self.btn_smart_merge.setToolTip("دمج الموديل والمساحة واللون والبطارية والشفرة للملصقات الصغيرة")
        self.btn_smart_merge.setStyleSheet("""
            QPushButton {
                background-color: #1A1A24;
                color: #D4AF37;
                border: 1px solid #D4AF37;
                border-radius: 4px;
                padding: 2px 8px;
                font-weight: bold;
                font-size: 11px;
            }
            QPushButton:hover {
                background-color: #D4AF37;
                color: #0D0D11;
            }
        """)
        self.btn_smart_merge.clicked.connect(self._on_compact_smart_merge)
        tb_layout.addWidget(self.btn_smart_merge)

        # Snap to Grid
        self.btn_snap = QPushButton("⊞ شبكة")
        self.btn_snap.setFixedHeight(28)
        self.btn_snap.setCheckable(True)
        self.btn_snap.setToolTip("محاذاة العناصر للشبكة بمقدار 0.5 مم")
        self.btn_snap.setStyleSheet("""
            QPushButton {
                background-color: #1A1A24;
                color: #9CA3AF;
                border: 1px solid #282834;
                border-radius: 4px;
                padding: 2px 8px;
                font-size: 11px;
            }
            QPushButton:hover { border-color: #D4AF37; color: #F4F4F6; }
            QPushButton:checked { background-color: #2D2D3E; color: #D4AF37; border-color: #D4AF37; font-weight: bold; }
        """)
        self.btn_snap.toggled.connect(lambda ch: self.canvas.set_snap_to_grid(ch))
        tb_layout.addWidget(self.btn_snap)

        tb_layout.addStretch()

        # Zoom Selector
        self.combo_zoom = QComboBox()
        self.combo_zoom.setFixedHeight(28)
        self.combo_zoom.setFixedWidth(84)
        self.combo_zoom.addItem("🔍 Fit", "fit")
        self.combo_zoom.addItem("100%", "1.0")
        self.combo_zoom.addItem("150%", "1.5")
        self.combo_zoom.addItem("200%", "2.0")
        self.combo_zoom.currentIndexChanged.connect(self._on_zoom_changed)
        tb_layout.addWidget(self.combo_zoom)

        center_layout.addWidget(self.toolbar_card)

        # Center Interactive Canvas
        self.canvas = PrintLabelsCanvas(self)
        center_layout.addWidget(self.canvas, 1)

        self.studio_splitter.addWidget(center_widget)

        # Right Dock (Printer, Paper Geometry & Template Manager)
        self.right_panel = PrinterManagerPanel(self)
        self.studio_splitter.addWidget(self.right_panel)
        self.studio_splitter.setSizes([750, 350])

        self.stack.addWidget(self.studio_splitter)

        # Page 8: Dedicated Telegram Cloud Bridge & Complete Setup Guide
        self.tab_telegram = TelegramHubTab(db=self.db, parent=self)
        self.tab_telegram.credentials_updated.connect(self._restart_telegram_bot)
        self.tab_telegram.start_bot_requested.connect(self._restart_telegram_bot)
        self.tab_telegram.stop_bot_requested.connect(lambda: self.bot.stop() if hasattr(self, 'bot') and self.bot else None)
        if hasattr(self, 'bot') and self.bot:
            self.tab_telegram.set_bot_instance(self.bot)
        self.stack.addWidget(self.tab_telegram)

        # Page 9: Security Audit Log & Settings
        self.tab_security = SecurityTab(db=self.db, current_role=self.current_role, current_user=self.current_user)
        self.stack.addWidget(self.tab_security)

        right_vbox.addWidget(self.stack, 1)
        main_hbox.addWidget(right_container, 1)

    # -----------------------------------------------------------------------
    # Fast POS Function Keys & Wiring
    # -----------------------------------------------------------------------

    def _init_shortcuts(self):
        # F1: Instant USB Device Read & Auto-Fill
        sc_f1 = QShortcut(QKeySequence(Qt.Key.Key_F1), self)
        sc_f1.activated.connect(self._on_f1_reread)

        # F2: Open Quick POS Sale Modal / Page
        sc_f2 = QShortcut(QKeySequence(Qt.Key.Key_F2), self)
        sc_f2.activated.connect(self._open_f2_sale)

        # F3: Open 1-Click Trade-In Unified Modal / Page
        sc_f3 = QShortcut(QKeySequence(Qt.Key.Key_F3), self)
        sc_f3.activated.connect(self._open_f3_trade_in)

        # F4: Record Trader Credit Payment / Collection
        sc_f4 = QShortcut(QKeySequence(Qt.Key.Key_F4), self)
        sc_f4.activated.connect(self._open_f4_trader_payment)

        # F5: Launch 5-Minute Inventory Audit
        sc_f5 = QShortcut(QKeySequence(Qt.Key.Key_F5), self)
        sc_f5.activated.connect(self._open_f5_inventory_audit)

        # Ctrl+P: Silent Thermal Print of Current Label
        sc_print = QShortcut(QKeySequence("Ctrl+P"), self)
        sc_print.activated.connect(self._execute_print_active_label)

        # Ctrl+S: Save Template
        sc_save = QShortcut(QKeySequence("Ctrl+S"), self)
        sc_save.activated.connect(self.right_panel._on_save_template_clicked)

    def _wire_events(self):
        # Top Bar signals
        self.top_bar.device_detected.connect(self._on_device_connected)
        self.top_bar.device_lost.connect(self._on_device_disconnected)
        self.top_bar.auto_print_triggered.connect(self._on_auto_print)
        self.top_bar.role_switched.connect(self._on_role_switched)

        # Intake Tab signals
        self.tab_intake.device_intake_saved.connect(self._on_device_intake_saved)
        self.tab_intake.request_print_label.connect(self._on_request_print_from_intake)

        # POS Tab signals
        self.tab_pos.sale_processed.connect(self._on_sale_processed)

        # Canvas signals
        self.canvas.element_selected.connect(self._on_canvas_element_selected)
        self.canvas.element_moved.connect(self._on_canvas_element_moved)
        self.canvas.element_resized.connect(self._on_canvas_element_resized)
        self.canvas.element_deleted.connect(self._on_canvas_element_deleted)

        # Right Panel signals
        self.right_panel.template_selected.connect(self._on_template_selected)
        self.right_panel.geometry_changed.connect(self._on_geometry_changed)
        self.right_panel.print_requested.connect(self._execute_print_active_label)
        self.right_panel.calibrate_requested.connect(self._execute_calibration_test)
        self.right_panel.printer_changed.connect(self.top_bar.set_current_printer)
        self.top_bar.printer_selected.connect(self.right_panel.set_selected_printer)

        # Licensing & Updates Background Engine
        self._update_license_ui()
        from PyQt6.QtCore import QTimer
        QTimer.singleShot(2500, self._check_updates_and_heartbeat)

    def _update_license_ui(self):
        """Refreshes status pill, read-only banner, and window title based on license state."""
        st = self.license_status
        base_title = get_window_title()

        if st.status == "ACTIVE":
            plan_lbl = st.plan_name or st.plan_code or "اشتراك تجاري"
            self.btn_license_status.setText(f"🛡️ الترخيص: نشط ({plan_lbl})")
            self.btn_license_status.setStyleSheet("""
                QPushButton {
                    background-color: #06281E;
                    color: #10B981;
                    border: 1px solid #10B981;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: bold;
                }
                QPushButton:hover { background-color: #0B4232; }
            """)
            self.setWindowTitle(f"{base_title} [الترخيص: نشط ({plan_lbl})]")
            self.read_only_banner.hide()

        elif st.status == "GRACE_PERIOD":
            self.btn_license_status.setText(f"⏳ فترة السماح ({st.grace_hours_remaining}h متبقية)")
            self.btn_license_status.setStyleSheet("""
                QPushButton {
                    background-color: #2D2010;
                    color: #F59E0B;
                    border: 1px solid #F59E0B;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: bold;
                }
                QPushButton:hover { background-color: #453018; }
            """)
            self.setWindowTitle(f"{base_title} [تنبيه: فترة السماح ({st.grace_hours_remaining}h)]")
            self.read_only_banner.hide()

        else:
            self.btn_license_status.setText("🔒 وضع القراءة فقط")
            self.btn_license_status.setStyleSheet("""
                QPushButton {
                    background-color: #2D1515;
                    color: #EF4444;
                    border: 1px solid #EF4444;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: bold;
                }
                QPushButton:hover { background-color: #451E1E; }
            """)
            self.setWindowTitle(f"{base_title} [وضع القراءة فقط — الترخيص غير نشط]")
            self.read_only_banner.show()

        # Update customer account button
        if hasattr(self, "btn_customer_account"):
            if self.lic_client.is_logged_in():
                cust = self.lic_client._customer_data or {}
                shop = cust.get("shop_name") or cust.get("username") or "المشترك"
                self.btn_customer_account.setText(f"👤 {shop}")
                self.btn_customer_account.setStyleSheet("""
                    QPushButton {
                        background-color: #1A1A28;
                        color: #60A5FA;
                        border: 1px solid #3B82F6;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: bold;
                    }
                    QPushButton:hover {
                        background-color: #2563EB;
                        color: #FFFFFF;
                    }
                """)
            else:
                self.btn_customer_account.setText("👤 تسجيل الدخول / حساب جديد")
                self.btn_customer_account.setStyleSheet("""
                    QPushButton {
                        background-color: #1C2333;
                        color: #F59E0B;
                        border: 1px dashed #F59E0B;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: bold;
                    }
                    QPushButton:hover {
                        background-color: #F59E0B;
                        color: #000000;
                    }
                """)

    def _open_customer_account_dialog(self):
        """Opens customer profile if logged in, or AuthDialog if not."""
        if self.lic_client.is_logged_in():
            dlg = CustomerProfileDialog(parent=self, client=self.lic_client)
            dlg.exec()
        else:
            dlg = AuthDialog(parent=self, client=self.lic_client)
            dlg.exec()
        self.license_status = self.lic_client.get_license_status()
        self._update_license_ui()

    def _open_license_dialog(self):
        """Opens license activation and subscription management dialog."""
        dlg = LicenseDialog(parent=self, client=self.lic_client)
        dlg.exec()
        self.license_status = self.lic_client.get_license_status()
        self._update_license_ui()

    def _check_updates_and_heartbeat(self):
        """Asynchronously validates license heartbeat and checks for software releases."""
        try:
            # 1. Heartbeat sync
            self.lic_client.sync_heartbeat()
            self.license_status = self.lic_client.get_license_status()
            self._update_license_ui()

            # 2. Release update check
            checker = UpdateChecker()
            has_update, update_info, _ = checker.check_for_updates()
            if has_update and update_info:
                up_dlg = UpdateDialog(update_info=update_info, parent=self, checker=checker)
                up_dlg.exec()
        except Exception as e:
            logger.debug("Background update/heartbeat exception: %s", e)

    def _init_telegram_bot(self):
        """Starts background Telegram bot and connects signals."""
        self.bot = TradingTelegramBot(db=self.db)
        self.bot.signals.device_price_updated.connect(self._on_telegram_price_updated)
        self.bot.signals.audit_scanned_code.connect(self.tab_audit.on_external_telegram_scan)
        self.bot.signals.proof_photo_received.connect(self._on_telegram_photo_received)
        self.bot.signals.request_remote_print.connect(self._on_remote_print_requested)
        self.bot.signals.sale_completed_remote.connect(self._on_sale_completed_remote)
        self.bot.signals.device_added_remote.connect(self._on_device_added_remote)
        self.bot.start()
        if hasattr(self, 'tab_telegram'):
            self.tab_telegram.set_bot_instance(self.bot)

    def _restart_telegram_bot(self):
        """Restarts telegram bot when credentials are updated."""
        if hasattr(self, 'bot') and self.bot:
            self.bot.stop()
        self._init_telegram_bot()

    def _sync_initial_state(self):
        tpl = self.right_panel.get_current_template()
        self.canvas.set_template(tpl)
        self.canvas.set_specs(self._current_specs, self._stock_number)

        printers = [self.right_panel.combo_printers.itemText(i) for i in range(self.right_panel.combo_printers.count())]
        cur_printer = self.right_panel.get_selected_printer()
        self.top_bar.populate_printers(printers, cur_printer)

    # -----------------------------------------------------------------------
    # Sidebar Navigation & Modals
    # -----------------------------------------------------------------------

    def _on_sidebar_nav_clicked(self, page_index: int):
        """Switches the active workspace stack page when sidebar button is clicked."""
        if 0 <= page_index < self.stack.count():
            self.stack.setCurrentIndex(page_index)
            if page_index == 1 and hasattr(self, "tab_inventory"):
                self.tab_inventory.refresh_inventory()
            elif page_index == 3 and hasattr(self, "tab_trade_in"):
                self.tab_trade_in.load_store_devices()
            elif page_index == 5 and hasattr(self, "tab_reports"):
                self.tab_reports.refresh_report_data()
            elif page_index == 0 and hasattr(self, "tab_intake"):
                self.tab_intake.refresh_recent_intakes()

            section_names = [
                "📱 إدخال هاتف للمخزن وطباعة الملصق (F1)",
                "📦 إدارة المخزن الشاملة والبحث السريع في الأجهزة",
                "🛒 نقطة البيع والصناديق المالية (F2)",
                "🔄 الاستبدال الفوري للأجهزة (F3)",
                "🤝 حسابات التجار وبضاعة الأمانة (F4)",
                "📑 مركز التقارير المالية والطباعة الشاملة",
                "📊 التحليلات المتقدمة ورادار الركود",
                "🔍 الجرد السريع بالباركود والكاميرا (F5)",
                "🏷️ استوديو تصميم الملصقات CAD (203 DPI)",
                "🤖 منصة ربط وإدارة بوت تيليجرام السحابي",
                "🛡️ الأمان والإعدادات وسجل العمليات",
            ]
            if page_index < len(section_names):
                self.top_bar.set_active_section(section_names[page_index])

    def _open_fast_adb_dialog(self):
        """Opens Fast ADB Enabler dialog with screen wake and brand dial code support."""
        brand = self._current_specs.brand or "Android"
        model = self._current_specs.marketing_name or ""
        dlg = FastAdbDialog(brand_hint=brand, model_hint=model, parent=self)
        dlg.adb_connected.connect(self._on_f1_reread)
        dlg.exec()

    def _toggle_role_interactive(self):
        """Switches between Owner and Salesperson with PIN verification for Owner."""
        if self.current_role == "Owner":
            # Demote to Salesperson directly
            self._on_role_switched("Salesperson", "Salesperson")
        else:
            # Promote to Owner via PIN
            dlg = PinDialog(db=self.db, required_role="Owner", parent=self, title="التحقق من هوية المالك (Owner PIN)")
            if dlg.exec():
                if dlg.authorized or dlg.is_correct(self.db.get_owner_pin() if hasattr(self.db, "get_owner_pin") else None):
                    self._on_role_switched("Owner", "Owner")
                else:
                    QMessageBox.warning(self, "خطأ في الرمز", "رمز الدخول غير صحيح!")

    def _show_about_dialog(self):
        """Displays software version, build info, and release changelog."""
        dlg = AboutDialog(self)
        dlg.exec()

    # -----------------------------------------------------------------------
    # Shortcut Event Handlers (F1 - F5, Ctrl+P)
    # -----------------------------------------------------------------------

    def _on_f1_reread(self):
        """F1: Instant USB Device Read & Auto-Fill."""
        self.top_bar._on_reread_clicked()
        self.nav_buttons[0].setChecked(True)
        self._on_sidebar_nav_clicked(0)

    def _open_f2_sale(self):
        """F2: Open Quick POS Sale Modal."""
        if self.license_status and self.license_status.is_read_only:
            ans = QMessageBox.warning(
                self,
                "🔒 وضع القراءة فقط نشط",
                "إتمام المبيعات غير متاح في وضع القراءة فقط.\nيرجى تفعيل أو تجديد الترخيص للمتابعة.\n\nهل تود فتح نافذة التفعيل الآن؟",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.Yes
            )
            if ans == QMessageBox.StandardButton.Yes:
                self._open_license_dialog()
            return
        self.tab_pos.open_quick_sale_modal()

    def _open_f3_trade_in(self):
        """F3: Open 1-Click Trade-In Unified Workspace."""
        if self.license_status and self.license_status.is_read_only:
            ans = QMessageBox.warning(
                self,
                "🔒 وضع القراءة فقط نشط",
                "عمليات الاستبدال غير متاحة في وضع القراءة فقط.\nيرجى تفعيل أو تجديد الترخيص للمتابعة.\n\nهل تود فتح نافذة التفعيل الآن؟",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.Yes
            )
            if ans == QMessageBox.StandardButton.Yes:
                self._open_license_dialog()
            return
        self.nav_buttons[3].setChecked(True)
        self._on_sidebar_nav_clicked(3)

    def _open_f4_trader_payment(self):
        """F4: Record Trader Credit Payment / Collection."""
        if self.license_status and self.license_status.is_read_only:
            ans = QMessageBox.warning(
                self,
                "🔒 وضع القراءة فقط نشط",
                "تسجيل دفعات التجار غير متاح في وضع القراءة فقط.\nيرجى تفعيل أو تجديد الترخيص للمتابعة.\n\nهل تود فتح نافذة التفعيل الآن؟",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.Yes
            )
            if ans == QMessageBox.StandardButton.Yes:
                self._open_license_dialog()
            return
        dlg = TraderPaymentDialog(db=self.db, current_role=self.current_role, current_user=self.current_user, parent=self)
        dlg.payment_recorded.connect(lambda _: self.tab_traders.refresh_all())
        dlg.exec()

    def _open_f5_inventory_audit(self):
        """F5: Launch 5-Minute Inventory Audit."""
        self.nav_buttons[7].setChecked(True)
        self._on_sidebar_nav_clicked(7)
        self.tab_audit.txt_scan.setFocus()
        self.tab_audit.txt_scan.selectAll()

    @pyqtSlot(int)
    def _on_remote_print_requested(self, device_id: int):
        """Remote print signal from Telegram bot to desktop thermal printer."""
        dev = self.db.get_device_by_id(device_id)
        if not dev:
            return
        self._on_request_print_from_intake(dev)

    @pyqtSlot(dict)
    def _on_sale_completed_remote(self, sale_dict: dict):
        """Remote sale completed via Telegram bot."""
        self._on_sale_processed(sale_dict)
        if hasattr(self, "tab_inventory"):
            self.tab_inventory.refresh_inventory()
        if hasattr(self, "tab_pos"):
            self.tab_pos.refresh_sales()

    @pyqtSlot(dict)
    def _on_device_added_remote(self, dev_dict: dict):
        """Remote device added via Telegram bot."""
        self._on_device_intake_saved(dev_dict)
        if hasattr(self, "tab_inventory"):
            self.tab_inventory.refresh_inventory()

    def _on_checkout_from_inventory(self, dev_dict: dict):
        """Quick checkout triggered from the inventory table."""
        if self.license_status and self.license_status.is_read_only:
            ans = QMessageBox.warning(
                self,
                "🔒 وضع القراءة فقط نشط",
                "إتمام المبيعات غير متاح في وضع القراءة فقط.\nيرجى تفعيل أو تجديد الترخيص للمتابعة.\n\nهل تود فتح نافذة التفعيل الآن؟",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.Yes
            )
            if ans == QMessageBox.StandardButton.Yes:
                self._open_license_dialog()
            return
        self.nav_buttons[2].setChecked(True)
        self._on_sidebar_nav_clicked(2)
        dlg = PosSaleDialog(db=self.db, current_role=self.current_role, current_user=self.current_user, parent=self)
        dlg.set_preselected_device(dev_dict)
        dlg.sale_completed.connect(self._on_sale_processed)
        dlg.exec()

    # -----------------------------------------------------------------------
    # Role Switching (Owner vs Salesperson)
    # -----------------------------------------------------------------------

    def _on_role_switched(self, new_role: str, user_name: str):
        self.current_role = new_role
        self.current_user = user_name
        self.tab_intake.set_user_role(new_role, user_name)
        self.tab_pos.set_user_role(new_role, user_name)
        self.tab_trade_in.set_user_role(new_role, user_name)
        self.tab_traders.set_user_role(new_role, user_name)
        self.tab_reports.set_user_role(new_role, user_name)
        self.tab_analytics.set_user_role(new_role, user_name)
        self.tab_audit.set_user_role(new_role, user_name)
        self.tab_security.set_user_role(new_role, user_name)
        self.top_bar.set_role(new_role)

        if new_role == "Owner":
            self.btn_role_switch.setText("👑 صاحب المحل (Owner)")
            self.btn_role_switch.setStyleSheet("""
                QPushButton {
                    background-color: #1A1A24; color: #D4AF37;
                    border: 1px solid #D4AF37; border-radius: 4px;
                    font-size: 11px; font-weight: bold;
                }
                QPushButton:hover { background-color: #2D2D3E; }
            """)
        else:
            self.btn_role_switch.setText("💼 موظف المبيعات (Staff)")
            self.btn_role_switch.setStyleSheet("""
                QPushButton {
                    background-color: #1A1A24; color: #9CA3AF;
                    border: 1px solid #38384A; border-radius: 4px;
                    font-size: 11px; font-weight: bold;
                }
                QPushButton:hover { background-color: #2D2D3E; color: #F4F4F6; }
            """)

        self.right_panel.set_status_message(f"Active Role: {new_role}", success=True)

    # -----------------------------------------------------------------------
    # Telegram Bot Signals
    # -----------------------------------------------------------------------

    @pyqtSlot(dict)
    def _on_telegram_price_updated(self, data: dict):
        """Triggered when Owner reprices an item remotely via Telegram."""
        self.tab_analytics.refresh_analytics()
        self.tab_pos.refresh_sales()
        msg = f"🔔 تحديث سعر من المالك عبر تيليجرام:\n{data.get('brand')} {data.get('model_name')} (كود: {data.get('stock_no')})\nسعر البيع الجديد: {data.get('target_selling_price'):,.0f} ج.م"
        QMessageBox.information(self, "تحديث سعر عن بعد", msg)

    @pyqtSlot(str, str)
    def _on_telegram_photo_received(self, photo_type: str, file_path: str):
        if self.stack.currentIndex() == 0:
            self.tab_intake.set_kyc_photo_direct(file_path)

    # -----------------------------------------------------------------------
    # Hardware & Intake Events
    # -----------------------------------------------------------------------

    @pyqtSlot(object)
    def _on_device_connected(self, specs: DeviceSpecs):
        self._current_specs = specs
        self.tab_intake.populate_from_specs(specs)
        self.canvas.set_specs(specs, self._stock_number)

        # Update sidebar live telemetry card with Commercial Name & RAM
        model_display = specs.marketing_name or f"{specs.brand} {specs.model_code}"
        storage_display = specs.storage or "Unknown"
        ram_display = specs.ram or ""
        capacity_str = f"{storage_display} / {ram_display} RAM" if ram_display else storage_display

        self.lbl_device_status.setText(f"✅ {model_display}")
        self.lbl_device_status.setStyleSheet("font-size: 12px; font-weight: bold; color: #10B981;")
        self.lbl_device_details.setText(f"{capacity_str} | بطارية: {specs.battery_health or 'N/A'}%")

        self.right_panel.set_status_message(f"Connected: {model_display}", success=True)

    @pyqtSlot()
    def _on_device_disconnected(self):
        self._current_specs = DeviceSpecs.empty()
        self.canvas.set_specs(self._current_specs, self._stock_number)
        self.lbl_device_status.setText("📱 في انتظار توصيل هاتف...")
        self.lbl_device_status.setStyleSheet("font-size: 12px; font-weight: bold; color: #9CA3AF;")
        self.lbl_device_details.setText("USB Auto-Detect | 203 DPI")
        self.right_panel.set_status_message("Device disconnected", success=False)

    @pyqtSlot(object)
    def _on_auto_print(self, specs: DeviceSpecs):
        self._execute_print_active_label()

    def _on_device_intake_saved(self, dev_dict: dict):
        if hasattr(self, "tab_intake"):
            self.tab_intake.refresh_recent_intakes()
        if hasattr(self, "tab_inventory"):
            self.tab_inventory.refresh_inventory()
        if hasattr(self, "tab_trade_in"):
            self.tab_trade_in.load_store_devices()
        if hasattr(self, "tab_reports"):
            self.tab_reports.refresh_report_data()
        if hasattr(self, "tab_aging"):
            self.tab_aging.refresh_radar()
        self.tab_pos.refresh_sales()
        self.tab_analytics.refresh_analytics()
        self.tab_traders.refresh_all()

    def _on_trade_in_completed(self, data: dict):
        self.tab_pos.refresh_sales()
        self.tab_analytics.refresh_analytics()
        self.tab_traders.refresh_all()
        if hasattr(self, "tab_trade_in"):
            self.tab_trade_in.load_store_devices()
        if hasattr(self, "tab_inventory"):
            self.tab_inventory.refresh_inventory()
        # Switch to POS page to show transaction
        self.nav_buttons[2].setChecked(True)
        self._on_sidebar_nav_clicked(2)

    def _on_request_print_from_intake(self, dev_dict: dict):
        self._stock_number = dev_dict.get("stock_no", self._stock_number)
        specs = DeviceSpecs.empty()
        specs.brand = dev_dict.get("brand", "")
        specs.marketing_name = dev_dict.get("model_name", "")
        specs.storage = dev_dict.get("storage", "")
        specs.ram = dev_dict.get("ram", "")
        specs.color = dev_dict.get("color", "")
        specs.serial_number = dev_dict.get("serial_number", "")
        specs.imei1 = dev_dict.get("imei1", "")
        specs.battery_health = dev_dict.get("battery_health")
        specs.raw_properties = {
            "tax_status": dev_dict.get("tax_status", ""),
            "secret_cost_cipher": dev_dict.get("secret_cost_cipher", "")
        }
        self._current_specs = specs
        self.canvas.set_specs(specs, self._stock_number)
        self.tab_reports.refresh_report_data()
        self._execute_print_active_label(is_initial_intake=True)

    def _on_sale_processed(self, sale_dict: dict):
        self.tab_analytics.refresh_analytics()
        self.tab_traders.refresh_all()
        if hasattr(self, "tab_trade_in"):
            self.tab_trade_in.load_store_devices()
        if hasattr(self, "tab_inventory"):
            self.tab_inventory.refresh_inventory()
        self.tab_reports.refresh_report_data()

    # -----------------------------------------------------------------------
    # Canvas & Template Synchronization
    # -----------------------------------------------------------------------

    def _on_template_selected(self, tpl: PrintLabelTemplate):
        self.canvas.set_template(tpl)
        self.canvas.set_specs(self._current_specs, self._stock_number)

    def _on_geometry_changed(self):
        tpl = self.right_panel.get_current_template()
        self.canvas.set_template(tpl)

    def _on_canvas_element_selected(self, element_id: str):
        tpl = self.right_panel.get_current_template()
        el = next((e for e in tpl.elements if e.id == element_id), None)
        if el:
            idx_f = self.combo_font.findText(el.font_family)
            if idx_f >= 0:
                self.combo_font.setCurrentIndex(idx_f)
            self.spin_size.setValue(el.font_size)
            self.btn_bold.setChecked(el.bold)
            if el.align == "center":
                self.btn_align_center.setChecked(True)
            elif el.align == "right":
                self.btn_align_right.setChecked(True)
            else:
                self.btn_align_left.setChecked(True)

    def _on_canvas_element_moved(self, element_id: str, x_mm: float, y_mm: float):
        pass

    def _on_canvas_element_resized(self, element_id: str, new_font_size: int):
        self.spin_size.setValue(new_font_size)

    def _on_canvas_element_deleted(self, element_id: str):
        tpl = self.right_panel.get_current_template()
        tpl.elements = [e for e in tpl.elements if e.id != element_id]
        self.canvas.set_template(tpl)

    def _on_typo_changed(self):
        sel_id = self.canvas.get_selected_id()
        if not sel_id:
            return
        tpl = self.right_panel.get_current_template()
        el = next((e for e in tpl.elements if e.id == sel_id), None)
        if el:
            el.font_family = self.combo_font.currentText()
            el.font_size = self.spin_size.value()
            el.bold = self.btn_bold.isChecked()
            if self.btn_align_center.isChecked():
                el.align = "center"
            elif self.btn_align_right.isChecked():
                el.align = "right"
            else:
                el.align = "left"
            self.canvas.set_template(tpl)

    def _on_compact_smart_merge(self):
        """Auto-packs essential trading fields with secret cost cipher (Zero raw selling price on label)."""
        tpl = self.right_panel.get_current_template()
        tpl.paper_length_mm = 25.0
        tpl.paper_width_mm = 38.0
        tpl.margin_top_mm = 1.0
        tpl.margin_bottom_mm = 1.0
        tpl.margin_left_mm = 1.0
        tpl.margin_right_mm = 1.0
        tpl.orientation = "landscape"

        elements = [
            LabelElement(id="c_model", field_key="model_name", title="Model", content="Model Name", show_title=False, x_mm=1.0, y_mm=1.5, font_size=8, bold=True),
            LabelElement(id="c_cap", field_key="capacity", title="Cap", content="128GB", show_title=False, x_mm=1.0, y_mm=5.5, font_size=7),
            LabelElement(id="c_bat", field_key="battery_life", title="Bat", content="100%", show_title=True, x_mm=12.0, y_mm=5.5, font_size=7),
            LabelElement(id="c_col", field_key="color", title="Col", content="Color", show_title=False, x_mm=23.0, y_mm=5.5, font_size=7),
            LabelElement(id="c_cipher", field_key="secret_cost_cipher", title="Cipher", content="LHABB", show_title=False, x_mm=31.0, y_mm=5.5, font_size=7, bold=True),
            LabelElement(id="c_bc", field_key="imei", title="IMEI", content="352123456789012", show_title=False, is_barcode=True, x_mm=1.0, y_mm=9.5, font_size=7, height_mm=11.0),
        ]

        tpl.elements = elements
        self.right_panel.apply_template_to_ui(tpl)
        self.canvas.set_template(tpl)
        self.right_panel.set_status_message("Applied Smart Trading Label (38x25mm)", success=True)

    def _on_zoom_changed(self):
        mode = self.combo_zoom.currentData()
        self.canvas.set_zoom(mode)

    # -----------------------------------------------------------------------
    # Printing & Calibration (203 DPI Silent GDI)
    # -----------------------------------------------------------------------

    def _execute_print_active_label(self, printer_name: Optional[str] = None, is_initial_intake: bool = False):
        """Renders current canvas template to PIL and sends to physical thermal printer."""
        # If user is on Intake tab and has entered a model, route through save & print!
        if hasattr(self, "tab_intake") and hasattr(self, "stack") and self.stack.currentIndex() == 0:
            if not is_initial_intake and self.tab_intake.txt_model.text().strip():
                self.tab_intake._save_device_intake()
                return

        printer = printer_name or self.top_bar.get_selected_printer() or self.right_panel.get_selected_printer()
        tpl = self.right_panel.get_current_template()
        w_mm, h_mm = tpl.effective_dimensions_mm()

        try:
            pil_img = render_template_to_pil(tpl, self._current_specs, self._stock_number, draw_margin_guide=False)
            success, msg = print_label_image(
                pil_img,
                printer_name=printer,
                paper_width_mm=w_mm,
                paper_length_mm=h_mm,
                orientation="portrait"
            )

            # Security audit log (silent to prevent duplicate Telegram alerts on everyday printing)
            self.db.log_security_event(
                action_type="label_print" if is_initial_intake else "label_reprint",
                user_role=self.current_role,
                user_name=self.current_user,
                device_imei=self._current_specs.imei1,
                details=f"Printed label for stock: {self._stock_number}",
                notify_telegram=False
            )
            self.right_panel.set_status_message(f"Printed: {msg}", success=success)

        except Exception as e:
            logger.error("Print error: %s", e)
            self.right_panel.set_status_message(f"Print Failed: {e}", success=False)
            QMessageBox.critical(self, "خطأ في الطباعة", f"تعذر طباعة الملصق:\n{e}")

    def _execute_calibration_test(self, printer_name: str):
        tpl = self.right_panel.get_current_template()
        w_mm, h_mm = tpl.effective_dimensions_mm()
        w_px = max(64, mm_to_dots(w_mm))
        h_px = max(64, mm_to_dots(h_mm))

        calibrate_thermal_gap(printer_name, width_mm=w_mm, length_mm=h_mm, gap_mm=2.0)

        img = Image.new("1", (w_px, h_px), 1)
        draw = ImageDraw.Draw(img)
        inset = mm_to_dots(1.0)
        draw.rectangle([inset, inset, w_px - inset, h_px - inset], outline=0, width=2)

        cx, cy = w_px // 2, h_px // 2
        draw.line([cx - 20, cy, cx + 20, cy], fill=0, width=1)
        draw.line([cx, cy - 20, cx, cy + 20], fill=0, width=1)

        font = get_font(size_pt=8, bold=True)
        draw.text((inset + 4, inset + 4), "203 DPI CALIBRATION", fill=0, font=font)
        draw.text((inset + 4, inset + 20), f"{w_mm:.1f} x {h_mm:.1f} mm", fill=0, font=font)

        try:
            bc = generate_code128_barcode("TEST-203DPI", width_dots=w_px - (inset * 2) - 8, height_dots=36)
            img.paste(bc, (inset + 4, h_px - inset - 40))
        except Exception:
            pass

        success, msg = print_label_image(
            img,
            printer_name=printer_name,
            paper_width_mm=w_mm,
            paper_length_mm=h_mm,
            orientation="portrait"
        )
        self.right_panel.set_status_message(f"Calibration: {msg}", success=success)

    # -----------------------------------------------------------------------
    # GitHub Two-Way Synchronization
    # -----------------------------------------------------------------------

    def _init_github_sync(self):
        """Starts background two-way synchronization with GitHub."""
        try:
            from core.github_sync import GitHubSyncWorker
            self.github_sync_worker = GitHubSyncWorker(interval_seconds=60, parent=self)
            self.github_sync_worker.signals.status_changed.connect(self._on_github_status_changed)
            self.github_sync_worker.signals.sync_completed.connect(self._on_github_sync_completed)
            self.github_sync_worker.start()
        except Exception as e:
            logger.warning("Could not initialize GitHub sync worker: %s", e)

    def _manual_github_sync(self):
        """Triggered when the user clicks the GitHub sync button in sidebar."""
        self.btn_github_sync.setText("🔄 جاري المزامنة...")
        self.btn_github_sync.setEnabled(False)
        from PyQt6.QtCore import QTimer
        if hasattr(self, "github_sync_worker") and self.github_sync_worker:
            self.github_sync_worker.trigger_sync()
        QTimer.singleShot(2000, lambda: self.btn_github_sync.setEnabled(True))

    @pyqtSlot(str, str)
    def _on_github_status_changed(self, code: str, text: str):
        if hasattr(self, "btn_github_sync"):
            if code == "SYNCED":
                self.btn_github_sync.setText("✅ GitHub متزامن")
                self.btn_github_sync.setStyleSheet("background-color: #06281E; color: #34D399; border: 1px solid #059669; font-size: 11px; font-weight: bold; border-radius: 4px;")
            elif code == "SYNCING":
                self.btn_github_sync.setText("🔄 جاري المزامنة...")
                self.btn_github_sync.setStyleSheet("background-color: #1E1B4B; color: #A5B4FC; border: 1px solid #6366F1; font-size: 11px; font-weight: bold; border-radius: 4px;")
            elif code == "ERROR":
                self.btn_github_sync.setText("⚠️ تنبيه مزامنة GitHub")
                self.btn_github_sync.setStyleSheet("background-color: #2D1515; color: #F87171; border: 1px solid #EF4444; font-size: 11px; font-weight: bold; border-radius: 4px;")

    @pyqtSlot(bool, str)
    def _on_github_sync_completed(self, success: bool, msg: str):
        if hasattr(self, "right_panel") and self.right_panel:
            self.right_panel.set_status_message(msg, success=success)

    def closeEvent(self, event):
        if hasattr(self, "github_sync_worker") and self.github_sync_worker:
            self.github_sync_worker.stop()
        if hasattr(self, "bot") and self.bot:
            self.bot.stop()
        if hasattr(self, "top_bar") and self.top_bar:
            self.top_bar.stop_worker()
        super().closeEvent(event)
