"""
ui/security_tab.py — Immutable Security Audit Log & System Settings
Security Architecture, Driver Doctor Repair Badge & Telegram Bot Control
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
    QHeaderView, QMessageBox, QFrame, QSplitter, QComboBox
)

from core.database import DatabaseManager, DEFAULT_CIPHER_KEY
from core.driver_manager import DriverDoctorDialog, check_driver_health
from core.paths import get_app_data_dir
from core.version import get_full_version, get_version, BUILD_CODENAME
from ui.about_dialog import AboutDialog

logger = logging.getLogger(__name__)


class SecurityTab(QWidget):
    """Immutable Security Audit Log & ERP System Configuration."""

    def __init__(self, db: DatabaseManager, current_role: str = "Owner", current_user: str = "Staff", parent=None):
        super().__init__(parent)
        self.db = db
        self.current_role = current_role
        self.current_user = current_user

        self._init_ui()
        self.refresh_logs()
        self._load_settings()

    def set_user_role(self, role: str, user_name: str):
        self.current_role = role
        self.current_user = user_name
        is_owner = (role == "Owner")
        self.btn_save_settings.setEnabled(is_owner)
        self.txt_owner_pin.setEnabled(is_owner)
        self.txt_cipher_key.setEnabled(is_owner)
        self.txt_bot_token.setEnabled(is_owner)
        self.txt_owner_chat_id.setEnabled(is_owner)

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(12, 12, 12, 12)
        main_layout.setSpacing(10)

        # Top Command Bar
        top_card = QFrame()
        top_card.setObjectName("card")
        top_layout = QHBoxLayout(top_card)

        lbl_title = QLabel("🛡️ سجل الأمان غير القابل للحذف وإعدادات النظام (Security & Settings)")
        lbl_title.setObjectName("title")
        top_layout.addWidget(lbl_title)

        top_layout.addStretch()

        self.btn_driver_doctor = QPushButton("🩺 فحص وإصلاح تعريفات USB (Driver Doctor)")
        self.btn_driver_doctor.setStyleSheet("background-color: #0E2938; border: 1px solid #0284C7; color: #38BDF8; font-weight: bold;")
        self.btn_driver_doctor.clicked.connect(self._open_driver_doctor)
        top_layout.addWidget(self.btn_driver_doctor)

        self.btn_backup = QPushButton("💾 إنشاء نسخة احتياطية فورية")
        self.btn_backup.setObjectName("btnPrimary")
        self.btn_backup.clicked.connect(self._create_instant_backup)
        top_layout.addWidget(self.btn_backup)

        main_layout.addWidget(top_card)

        # Main Splitter: Left (Security Log) | Right (Settings Form)
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # LEFT: Immutable Audit Log Table
        left_pane = QFrame()
        left_pane.setObjectName("card")
        l_layout = QVBoxLayout(left_pane)
        l_layout.setContentsMargins(8, 8, 8, 8)

        lbl_log_hdr = QLabel("📜 سجل العمليات الرقابية المشفرة (Security Audit Trail):")
        lbl_log_hdr.setStyleSheet("font-weight: bold; color: #D4AF37; font-size: 13px;")
        l_layout.addWidget(lbl_log_hdr)

        self.table_logs = QTableWidget()
        self.table_logs.setColumnCount(7)
        self.table_logs.setHorizontalHeaderLabels([
            "التوقيت", "المستخدم", "الرتبة", "نوع العملية", "IMEI", "التغيير", "التفاصيل"
        ])
        self.table_logs.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.table_logs.horizontalHeader().setSectionResizeMode(6, QHeaderView.ResizeMode.Stretch)
        self.table_logs.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        l_layout.addWidget(self.table_logs)

        splitter.addWidget(left_pane)

        # RIGHT: Settings Form
        right_pane = QFrame()
        right_pane.setObjectName("card")
        r_layout = QVBoxLayout(right_pane)
        r_layout.setContentsMargins(12, 12, 12, 12)

        lbl_set_hdr = QLabel("⚙️ إعدادات المتجر والتكامل السحابي:")
        lbl_set_hdr.setStyleSheet("font-weight: bold; color: #D4AF37; font-size: 13px;")
        r_layout.addWidget(lbl_set_hdr)

        form_grid = QGridLayout()
        form_grid.setSpacing(10)

        # Store Info
        form_grid.addWidget(QLabel("اسم المحل / المعرض:"), 0, 0)
        self.txt_store_name = QLineEdit()
        form_grid.addWidget(self.txt_store_name, 0, 1)

        form_grid.addWidget(QLabel("رقم الهاتف للتواصل:"), 1, 0)
        self.txt_store_phone = QLineEdit()
        form_grid.addWidget(self.txt_store_phone, 1, 1)

        form_grid.addWidget(QLabel("عنوان المحل:"), 2, 0)
        self.txt_store_addr = QLineEdit()
        form_grid.addWidget(self.txt_store_addr, 2, 1)

        # PINs
        form_grid.addWidget(QLabel("رمز مرور المالك (Owner PIN):"), 3, 0)
        self.txt_owner_pin = QLineEdit()
        self.txt_owner_pin.setEchoMode(QLineEdit.EchoMode.Password)
        form_grid.addWidget(self.txt_owner_pin, 3, 1)

        form_grid.addWidget(QLabel("رمز موظف المبيعات (Sales PIN):"), 4, 0)
        self.txt_sales_pin = QLineEdit()
        self.txt_sales_pin.setEchoMode(QLineEdit.EchoMode.Password)
        form_grid.addWidget(self.txt_sales_pin, 4, 1)

        # Secret Cost Cipher Key (10-Letters)
        form_grid.addWidget(QLabel("شفرة التكلفة (10 حروف):"), 5, 0)
        self.txt_cipher_key = QLineEdit()
        self.txt_cipher_key.setMaxLength(10)
        self.txt_cipher_key.setPlaceholderText("BLACKHORSE")
        form_grid.addWidget(self.txt_cipher_key, 5, 1)

        # Telegram Bot
        form_grid.addWidget(QLabel("توكن بوت تيليجرام (Bot Token):"), 6, 0)
        self.txt_bot_token = QLineEdit()
        self.txt_bot_token.setEchoMode(QLineEdit.EchoMode.Password)
        self.txt_bot_token.setPlaceholderText("123456789:ABCdefGHIjklMNOpqrSTUvwxYZ")
        form_grid.addWidget(self.txt_bot_token, 6, 1)

        form_grid.addWidget(QLabel("Chat ID للمالك:"), 7, 0)
        self.txt_owner_chat_id = QLineEdit()
        self.txt_owner_chat_id.setPlaceholderText("أرسل /auth_owner للبوت للربط التلقائي")
        form_grid.addWidget(self.txt_owner_chat_id, 7, 1)

        r_layout.addLayout(form_grid)

        # Version & Build Information Card
        ver_card = QFrame()
        ver_card.setStyleSheet("""
            background-color: #121217;
            border: 1px solid #282834;
            border-radius: 6px;
            padding: 8px;
            margin-top: 6px;
        """)
        v_box = QVBoxLayout(ver_card)
        v_box.setContentsMargins(8, 8, 8, 8)
        v_box.setSpacing(6)

        v_top = QHBoxLayout()
        lbl_v_title = QLabel("🏷️ إصدار النظام الحالي:")
        lbl_v_title.setStyleSheet("font-weight: bold; color: #D4AF37; font-size: 11px;")
        v_top.addWidget(lbl_v_title)

        lbl_v_val = QLabel(f"{get_full_version()}  •  {BUILD_CODENAME}")
        lbl_v_val.setStyleSheet("color: #10B981; font-weight: bold; font-size: 11px;")
        v_top.addWidget(lbl_v_val)
        v_top.addStretch()
        v_box.addLayout(v_top)

        btn_view_changelog = QPushButton("📋 استعراض سجل التحديثات والتغييرات (Changelog)")
        btn_view_changelog.setFixedHeight(28)
        btn_view_changelog.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_view_changelog.setStyleSheet("""
            QPushButton {
                background-color: #1A1A24;
                color: #D4AF37;
                border: 1px solid #D4AF37;
                border-radius: 4px;
                font-size: 11px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #D4AF37;
                color: #0D0D11;
            }
        """)
        btn_view_changelog.clicked.connect(self._open_about_dialog)
        v_box.addWidget(btn_view_changelog)
        r_layout.addWidget(ver_card)

        r_layout.addStretch()

        self.btn_save_settings = QPushButton("💾 حفظ وتطبيق الإعدادات")
        self.btn_save_settings.setObjectName("btnPrimary")
        self.btn_save_settings.clicked.connect(self._save_settings)
        r_layout.addWidget(self.btn_save_settings)

        splitter.addWidget(right_pane)
        main_layout.addWidget(splitter)

    def refresh_logs(self):
        logs = self.db.get_security_logs(limit=200)
        self.table_logs.setRowCount(len(logs))
        for idx, l in enumerate(logs):
            self.table_logs.setItem(idx, 0, QTableWidgetItem(l.get("timestamp", "")[:19]))
            self.table_logs.setItem(idx, 1, QTableWidgetItem(l.get("user_name", "")))
            self.table_logs.setItem(idx, 2, QTableWidgetItem(l.get("user_role", "")))

            action_item = QTableWidgetItem(l.get("action_type", ""))
            action = l.get("action_type", "")
            if "void" in action or "delete" in action:
                action_item.setForeground(Qt.GlobalColor.red)
            elif "price" in action:
                action_item.setForeground(Qt.GlobalColor.darkYellow)
            else:
                action_item.setForeground(Qt.GlobalColor.green)
            self.table_logs.setItem(idx, 3, action_item)

            self.table_logs.setItem(idx, 4, QTableWidgetItem(l.get("device_imei", "") or "-"))

            change_str = f"{l.get('old_value','')} ➔ {l.get('new_value','')}" if l.get("old_value") else l.get("new_value", "")
            self.table_logs.setItem(idx, 5, QTableWidgetItem(change_str))
            self.table_logs.setItem(idx, 6, QTableWidgetItem(l.get("details", "")))

    def _load_settings(self):
        self.txt_store_name.setText(self.db.get_setting("store_name", "ProLab Mobile Trading"))
        self.txt_store_phone.setText(self.db.get_setting("store_phone", "01000000000"))
        self.txt_store_addr.setText(self.db.get_setting("store_address", "Alexandria, Egypt"))
        self.txt_owner_pin.setText(self.db.get_setting("owner_pin", "1234"))
        self.txt_sales_pin.setText(self.db.get_setting("sales_pin", "0000"))
        self.txt_cipher_key.setText(self.db.get_setting("cipher_key", DEFAULT_CIPHER_KEY))
        self.txt_bot_token.setText(self.db.get_setting("telegram_bot_token", ""))
        self.txt_owner_chat_id.setText(self.db.get_setting("telegram_owner_chat_id", ""))

    def _save_settings(self):
        if self.current_role != "Owner":
            QMessageBox.warning(self, "مرفوض", "لا يمكن تعديل الإعدادات إلا بواسطة صاحب المحل!")
            return

        cipher = self.txt_cipher_key.text().strip().upper()
        if len(cipher) != 10 or len(set(cipher)) != 10:
            QMessageBox.warning(self, "تنبيه", "يجب أن تتكون شفرة التكلفة من 10 حروف إنجليزية فريدة غير مكررة!")
            return

        self.db.set_setting("store_name", self.txt_store_name.text().strip())
        self.db.set_setting("store_phone", self.txt_store_phone.text().strip())
        self.db.set_setting("store_address", self.txt_store_addr.text().strip())
        self.db.set_setting("owner_pin", self.txt_owner_pin.text().strip())
        self.db.set_setting("sales_pin", self.txt_sales_pin.text().strip())
        self.db.set_setting("cipher_key", cipher)
        self.db.set_setting("telegram_bot_token", self.txt_bot_token.text().strip())
        self.db.set_setting("telegram_owner_chat_id", self.txt_owner_chat_id.text().strip())

        self.db.log_security_event(
            action_type="settings_update",
            user_role=self.current_role,
            user_name=self.current_user,
            details="Updated store and security settings"
        )
        self.refresh_logs()
        QMessageBox.information(self, "تم الحفظ", "✅ تم حفظ وتطبيق الإعدادات بنجاح.")

    def _open_driver_doctor(self):
        dlg = DriverDoctorDialog(parent=self)
        dlg.exec()

    def _open_about_dialog(self):
        dlg = AboutDialog(parent=self)
        dlg.exec()

    def _create_instant_backup(self):
        backup_dir = Path(get_app_data_dir()) / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup_file = backup_dir / f"prolab_manual_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
        import shutil
        shutil.copy2(self.db.db_path, str(backup_file))
        QMessageBox.information(self, "تم النسخ الاحتياطي", f"✅ تم حفظ نسخة كاملة من قاعدة البيانات في:\n{backup_file}")
