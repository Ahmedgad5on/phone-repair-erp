"""
ui/telegram_hub_tab.py — Luxury Minimalist Telegram Bot Hub & Step-by-Step Multi-Device Manager.
Redesigned with:
- Zero text clutter / minimal clean microcopy.
- Elegant modern Obsidian & Gold modular design.
- True 3-Step Interactive Guided Setup (1: Bot Token -> 2: Owner -> 3: Sales Staff).
- Live Connected Devices Table with one-click actions.
- Direct Command Center with fast visual triggers and sleek terminal.
"""
import logging
import requests
from datetime import datetime
from typing import Optional, Dict, Any

from PyQt6.QtCore import Qt, pyqtSignal, pyqtSlot, QThread
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QPushButton, QFrame, QMessageBox, QTextEdit,
    QScrollArea, QTabWidget, QProgressBar, QTableWidget,
    QTableWidgetItem, QHeaderView, QDialog, QComboBox,
    QAbstractItemView, QApplication
)
from PyQt6.QtGui import QColor

from core.database import DatabaseManager
from core.telegram_bot import TradingTelegramBot

logger = logging.getLogger(__name__)


# ==============================================================================
# Background Worker Threads
# ==============================================================================

class TelegramTestWorker(QThread):
    test_finished = pyqtSignal(bool, str, dict)

    def __init__(self, token: str, chat_id: str):
        super().__init__()
        self.token = token.strip()
        self.chat_id = chat_id.strip()

    def run(self):
        if not self.token:
            self.test_finished.emit(False, "أدخل توكن البوت أولاً", {})
            return

        try:
            requests.get(f"https://api.telegram.org/bot{self.token}/deleteWebhook?drop_pending_updates=False", timeout=5)
        except Exception:
            pass

        try:
            resp = requests.get(f"https://api.telegram.org/bot{self.token}/getMe", timeout=8)
            data = resp.json()
            if not data.get("ok"):
                self.test_finished.emit(False, data.get("description", "توكن غير صالح"), {})
                return
            bot_info = data.get("result", {})
        except Exception as e:
            self.test_finished.emit(False, f"فشل الاتصال بالإنترنت: {e}", {})
            return

        if self.chat_id:
            try:
                payload = {
                    "chat_id": self.chat_id,
                    "text": "🌟 <b>تم ربط هاتف المالك بنجاح!</b>\nنظام ProLab Trading 4.0 متصل وجاهز لإرسال الإشعارات والتقارير.",
                    "parse_mode": "HTML"
                }
                res = requests.post(f"https://api.telegram.org/bot{self.token}/sendMessage", json=payload, timeout=8)
                if not res.json().get("ok"):
                    self.test_finished.emit(True, "تم توثيق البوت، ولكن تعذر إرسال رسالة للهاتف. اضغط Start في البوت أولاً.", bot_info)
                    return
            except Exception:
                pass

        self.test_finished.emit(True, f"تم الاتصال بنجاح بالبوت: @{bot_info.get('username')}", bot_info)


class CommandExecuteWorker(QThread):
    finished = pyqtSignal(str, str)

    def __init__(self, bot: TradingTelegramBot, cmd: str):
        super().__init__()
        self.bot = bot
        self.cmd = cmd

    def run(self):
        try:
            if not self.bot:
                self.finished.emit(self.cmd, "البوت متوقف حالياً.")
                return
            res = self.bot.execute_direct_command(self.cmd)
            self.finished.emit(self.cmd, res)
        except Exception as e:
            self.finished.emit(self.cmd, f"خطأ: {e}")


# ==============================================================================
# Clean Minimalist Dialogs
# ==============================================================================

class AddDeviceDialog(QDialog):
    def __init__(self, db: DatabaseManager, parent=None):
        super().__init__(parent)
        self.db = db
        self.setWindowTitle("إضافة هاتف جديد")
        self.setFixedWidth(460)
        self.setStyleSheet("""
            QDialog { background-color: #14141E; color: #F4F4F6; border: 1px solid #282838; border-radius: 10px; }
            QLabel { color: #A1A1AA; font-size: 12px; }
            QLineEdit, QComboBox {
                background-color: #1A1A28; color: #FFFFFF; border: 1px solid #2E2E40;
                border-radius: 6px; padding: 7px 10px; font-size: 13px;
            }
            QLineEdit:focus, QComboBox:focus { border: 1px solid #D4AF37; }
        """)

        layout = QVBoxLayout(self)
        layout.setSpacing(12)
        layout.setContentsMargins(18, 18, 18, 18)

        lbl = QLabel("📱 تسجيل هاتف جديد")
        lbl.setStyleSheet("font-size: 15px; font-weight: bold; color: #D4AF37;")
        layout.addWidget(lbl)

        grid = QGridLayout()
        grid.setSpacing(8)

        grid.addWidget(QLabel("اسم المستخدم:"), 0, 0)
        self.txt_name = QLineEdit()
        self.txt_name.setPlaceholderText("مثال: أحمد مصطفى")
        grid.addWidget(self.txt_name, 0, 1)

        grid.addWidget(QLabel("Chat ID:"), 1, 0)
        cid_box = QHBoxLayout()
        cid_box.setSpacing(6)
        self.txt_chat_id = QLineEdit()
        self.txt_chat_id.setPlaceholderText("أرقام فقط (مثال: 1065573291)")
        cid_box.addWidget(self.txt_chat_id, 1)

        btn_get_id = QPushButton("🆔 استخراج ID")
        btn_get_id.setFixedHeight(32)
        btn_get_id.setToolTip("اضغط لفتح بوت @tg_raw_data_bot على تيليجرام لمعرفة رقم الـ Chat ID")
        btn_get_id.setStyleSheet("""
            QPushButton {
                background-color: #1E293B;
                color: #38BDF8;
                font-weight: bold;
                border: 1px solid #0284C7;
                border-radius: 6px;
                padding: 0 10px;
                font-size: 11px;
            }
            QPushButton:hover {
                background-color: #0284C7;
                color: #FFFFFF;
            }
        """)
        btn_get_id.clicked.connect(lambda: self._open_url("https://t.me/tg_raw_data_bot"))
        cid_box.addWidget(btn_get_id)
        grid.addLayout(cid_box, 1, 1)

        grid.addWidget(QLabel("الرتبة:"), 2, 0)
        self.combo_role = QComboBox()
        self.combo_role.addItem("💼 موظف مبيعات", "Salesperson")
        self.combo_role.addItem("👑 صاحب المحل", "Owner")
        grid.addWidget(self.combo_role, 2, 1)

        grid.addWidget(QLabel("نوع الهاتف:"), 3, 0)
        self.txt_phone = QLineEdit()
        self.txt_phone.setPlaceholderText("iPhone 14 Pro")
        grid.addWidget(self.txt_phone, 3, 1)

        layout.addLayout(grid)

        lbl_hint = QLabel("💡 لمعرفة الـ Chat ID: اضغط على 'استخراج ID' لفتح بوت @tg_raw_data_bot واضغط Start.")
        lbl_hint.setStyleSheet("color: #94A3B8; font-size: 11px;")
        layout.addWidget(lbl_hint)

        btn_box = QHBoxLayout()
        btn_box.setSpacing(8)

        btn_save = QPushButton("حفظ وإضافة")
        btn_save.setFixedHeight(34)
        btn_save.setStyleSheet("background-color: #10B981; color: #000000; font-weight: bold; border-radius: 6px; padding: 0 16px;")
        btn_save.clicked.connect(self._save)
        btn_box.addWidget(btn_save)

        btn_cancel = QPushButton("إلغاء")
        btn_cancel.setFixedHeight(34)
        btn_cancel.setStyleSheet("background-color: #262636; color: #A1A1AA; border-radius: 6px; padding: 0 14px;")
        btn_cancel.clicked.connect(self.reject)
        btn_box.addWidget(btn_cancel)

        layout.addLayout(btn_box)

    def _open_url(self, url: str):
        import webbrowser
        try:
            webbrowser.open(url)
        except Exception:
            pass

    def _save(self):
        name = self.txt_name.text().strip()
        chat_id = self.txt_chat_id.text().strip()
        role = self.combo_role.currentData()
        phone = self.txt_phone.text().strip()

        if not name or not chat_id or not chat_id.isdigit():
            QMessageBox.warning(self, "تنبيه", "أدخل اسم المستخدم ورقم Chat ID صحيح.")
            return

        display_name = f"{'👑 ' if role == 'Owner' else '💼 '}{name}"
        self.db.register_telegram_subscriber(chat_id, display_name, role=role, phone_model=phone)
        if role == "Owner":
            self.db.set_setting("telegram_owner_chat_id", chat_id)
        self.accept()


class BroadcastDialog(QDialog):
    def __init__(self, bot: TradingTelegramBot, parent=None):
        super().__init__(parent)
        self.bot = bot
        self.setWindowTitle("إرسال تعميم")
        self.setFixedWidth(440)
        self.setStyleSheet("""
            QDialog { background-color: #14141E; color: #F4F4F6; border: 1px solid #282838; border-radius: 10px; }
            QLabel { color: #A1A1AA; font-size: 12px; }
            QTextEdit, QComboBox {
                background-color: #1A1A28; color: #FFFFFF; border: 1px solid #2E2E40;
                border-radius: 6px; padding: 8px; font-size: 13px;
            }
            QTextEdit:focus, QComboBox:focus { border: 1px solid #D4AF37; }
        """)

        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        layout.setContentsMargins(18, 18, 18, 18)

        lbl = QLabel("📢 تعميم فوري لهواتف المحل")
        lbl.setStyleSheet("font-size: 15px; font-weight: bold; color: #D4AF37;")
        layout.addWidget(lbl)

        layout.addWidget(QLabel("المستلمون:"))
        self.combo_target = QComboBox()
        self.combo_target.addItem("📢 جميع الهواتف (الكل)", "")
        self.combo_target.addItem("💼 موظفو المبيعات فقط", "Salesperson")
        self.combo_target.addItem("👑 أصحاب المحل فقط", "Owner")
        layout.addWidget(self.combo_target)

        layout.addWidget(QLabel("نص التعميم:"))
        self.txt_msg = QTextEdit()
        self.txt_msg.setFixedHeight(100)
        self.txt_msg.setPlaceholderText("اكتب نص الرسالة هنا...")
        layout.addWidget(self.txt_msg)

        btn_box = QHBoxLayout()
        btn_box.setSpacing(8)

        btn_send = QPushButton("إرسال الآن 🚀")
        btn_send.setFixedHeight(34)
        btn_send.setStyleSheet("background-color: #D4AF37; color: #0D0D11; font-weight: bold; border-radius: 6px; padding: 0 16px;")
        btn_send.clicked.connect(self._send)
        btn_box.addWidget(btn_send)

        btn_cancel = QPushButton("إلغاء")
        btn_cancel.setFixedHeight(34)
        btn_cancel.setStyleSheet("background-color: #262636; color: #A1A1AA; border-radius: 6px; padding: 0 14px;")
        btn_cancel.clicked.connect(self.reject)
        btn_box.addWidget(btn_cancel)

        layout.addLayout(btn_box)

    def _send(self):
        txt = self.txt_msg.toPlainText().strip()
        if not txt:
            return
        if not self.bot:
            QMessageBox.warning(self, "خطأ", "خدمة البوت غير متصلة.")
            return
        sent, total = self.bot.broadcast_message(txt, role_filter=self.combo_target.currentData() or None)
        QMessageBox.information(self, "تم الإرسال", f"تم تسليم التعميم لـ ({sent}) من أصل ({total}) هاتف.")
        self.accept()


class AddCustomCommandDialog(QDialog):
    """Modal dialog allowing the owner to add a new custom bot command dynamically."""
    command_saved = pyqtSignal()

    def __init__(self, db: DatabaseManager, parent=None):
        super().__init__(parent)
        self.db = db
        self.setWindowTitle("➕ إضافة أمر مخصص جديد لبوت تيليجرام")
        self.setFixedSize(540, 480)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)
        self.setStyleSheet("""
            QDialog {
                background-color: #0E0E14;
                color: #F3F4F6;
                font-family: 'Segoe UI', sans-serif;
            }
            QLabel {
                font-size: 12px;
                font-weight: bold;
                color: #D4AF37;
            }
            QLineEdit, QTextEdit, QComboBox {
                background-color: #161622;
                border: 1px solid #28283C;
                border-radius: 6px;
                color: #FFFFFF;
                padding: 6px 10px;
                font-size: 12px;
            }
            QLineEdit:focus, QTextEdit:focus, QComboBox:focus {
                border: 1px solid #D4AF37;
            }
        """)
        self._init_ui()

    def _init_ui(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(18, 18, 18, 18)
        lay.setSpacing(10)

        lbl_hdr = QLabel("⚡ تخصيص أمر ذكي جديد للبوت")
        lbl_hdr.setStyleSheet("font-size: 15px; font-weight: 800; color: #10B981;")
        lay.addWidget(lbl_hdr)

        lbl_desc = QLabel("يمكنك إضافة أمر جديد يستجيب له البوت فورياً عند كتابته من المالك أو الزبائن.")
        lbl_desc.setStyleSheet("color: #9CA3AF; font-size: 11px; font-weight: normal;")
        lay.addWidget(lbl_desc)

        grid = QGridLayout()
        grid.setSpacing(8)

        grid.addWidget(QLabel("الكلمة المفتاحية / الأمر (Trigger):"), 0, 0)
        self.txt_trigger = QLineEdit()
        self.txt_trigger.setPlaceholderText("مثال: /offers أو /wifi أو العنوان")
        grid.addWidget(self.txt_trigger, 0, 1)

        grid.addWidget(QLabel("الوصف المختصر للأمر:"), 1, 0)
        self.txt_desc = QLineEdit()
        self.txt_desc.setPlaceholderText("مثال: إرسال عروض وخصومات اليوم")
        grid.addWidget(self.txt_desc, 1, 1)

        grid.addWidget(QLabel("الصلاحية المطلوبة لتنفيذه:"), 2, 0)
        self.cb_role = QComboBox()
        self.cb_role.addItems(["ALL (متاح لجميع المستخدمين)", "Owner (متاح لصاحب المحل فقط)"])
        grid.addWidget(self.cb_role, 2, 1)

        lay.addLayout(grid)

        lay.addWidget(QLabel("الرد التلقائي للبوت (يدعم تنسيق HTML ومتغيرات {store_name}, {date}, {time}):"))
        self.txt_response = QTextEdit()
        self.txt_response.setPlaceholderText("اكتب نص الرسالة التي سيرد بها البوت تلقائياً عند طلب الأمر...")
        lay.addWidget(self.txt_response)

        # Quick Variable Insertion Buttons
        v_box = QHBoxLayout()
        v_box.setSpacing(6)
        btn_v1 = QPushButton("+ اسم المتجر")
        btn_v1.setStyleSheet("background-color: #1A1A26; color: #D4AF37; border: 1px solid #38384A; border-radius: 4px; font-size: 10px; padding: 2px 6px;")
        btn_v1.clicked.connect(lambda: self.txt_response.insertPlainText("{store_name}"))
        v_box.addWidget(btn_v1)

        btn_v2 = QPushButton("+ التاريخ")
        btn_v2.setStyleSheet("background-color: #1A1A26; color: #38BDF8; border: 1px solid #38384A; border-radius: 4px; font-size: 10px; padding: 2px 6px;")
        btn_v2.clicked.connect(lambda: self.txt_response.insertPlainText("{date}"))
        v_box.addWidget(btn_v2)

        btn_v3 = QPushButton("+ الوقت")
        btn_v3.setStyleSheet("background-color: #1A1A26; color: #10B981; border: 1px solid #38384A; border-radius: 4px; font-size: 10px; padding: 2px 6px;")
        btn_v3.clicked.connect(lambda: self.txt_response.insertPlainText("{time}"))
        v_box.addWidget(btn_v3)

        btn_v4 = QPushButton("+ اسم المستخدم")
        btn_v4.setStyleSheet("background-color: #1A1A26; color: #C084FC; border: 1px solid #38384A; border-radius: 4px; font-size: 10px; padding: 2px 6px;")
        btn_v4.clicked.connect(lambda: self.txt_response.insertPlainText("{user_name}"))
        v_box.addWidget(btn_v4)

        v_box.addStretch()
        lay.addLayout(v_box)

        # Action Buttons
        btn_row = QHBoxLayout()
        btn_cancel = QPushButton("إلغاء")
        btn_cancel.clicked.connect(self.reject)
        btn_row.addWidget(btn_cancel)

        btn_row.addStretch()

        btn_save = QPushButton("💾 حفظ وإضافة الأمر للبوت")
        btn_save.setFixedHeight(34)
        btn_save.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #10B981, stop:1 #059669);
                color: #FFFFFF;
                border: none;
                border-radius: 5px;
                font-weight: bold;
                font-size: 12px;
                padding: 0 16px;
            }
            QPushButton:hover { background: #10B981; }
        """)
        btn_save.clicked.connect(self._save_command)
        btn_row.addWidget(btn_save)

        lay.addLayout(btn_row)

    def _save_command(self):
        trig = self.txt_trigger.text().strip()
        desc = self.txt_desc.text().strip()
        resp = self.txt_response.toPlainText().strip()
        role = "Owner" if "Owner" in self.cb_role.currentText() else "ALL"

        if not trig:
            QMessageBox.warning(self, "تنبيه", "يرجى كتابة الكلمة المفتاحية أو الأمر (Trigger)!")
            self.txt_trigger.setFocus()
            return

        if not resp:
            QMessageBox.warning(self, "تنبيه", "يرجى كتابة نص الرد التلقائي للبوت!")
            self.txt_response.setFocus()
            return

        if not desc:
            desc = f"أمر {trig}"

        try:
            self.db.add_custom_command(
                command_trigger=trig,
                description=desc,
                response_payload=resp,
                response_type="text",
                role_access=role
            )
            QMessageBox.information(self, "نجاح", f"✅ تم إضافة الأمر {trig} بنجاح وأصبح جاهزاً للاستجابة في البوت!")
            self.command_saved.emit()
            self.accept()
        except Exception as e:
            QMessageBox.critical(self, "خطأ", f"فشل حفظ الأمر في قاعدة البيانات: {e}")


# ==============================================================================
# TelegramHubTab Component
# ==============================================================================

class TelegramHubTab(QWidget):
    credentials_updated = pyqtSignal()
    start_bot_requested = pyqtSignal()
    stop_bot_requested = pyqtSignal()

    def __init__(self, db: DatabaseManager, bot_instance: Optional[TradingTelegramBot] = None, parent=None):
        super().__init__(parent)
        self.db = db
        self.bot = bot_instance
        self._test_worker: Optional[TelegramTestWorker] = None
        self._cmd_worker: Optional[CommandExecuteWorker] = None

        self._init_ui()
        self._load_current_credentials()
        self._refresh_subscribers_table()
        self._refresh_custom_commands_table()
        self._wire_bot_signals()

    def set_bot_instance(self, bot_instance: TradingTelegramBot):
        self.bot = bot_instance
        self._wire_bot_signals()
        self._refresh_subscribers_table()
        self._update_status_badges()

    def _wire_bot_signals(self):
        if self.bot and hasattr(self.bot, 'signals'):
            for sig, slot in [
                (self.bot.signals.log_message, self.append_log),
                (self.bot.signals.bot_status_changed, self._on_bot_status_changed),
                (getattr(self.bot.signals, 'subscribers_updated', None), self._refresh_subscribers_table)
            ]:
                if sig is not None:
                    try:
                        sig.disconnect(slot)
                    except Exception:
                        pass
                    try:
                        sig.connect(slot)
                    except Exception:
                        pass

    # --------------------------------------------------------------------------
    # Main Modern Shell
    # --------------------------------------------------------------------------

    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(14, 14, 14, 14)
        root.setSpacing(12)

        # 1. Ultra-Clean Top Bar
        header = QFrame()
        header.setStyleSheet("""
            QFrame {
                background-color: #14141E;
                border: 1px solid #262636;
                border-radius: 8px;
            }
        """)
        h_lay = QHBoxLayout(header)
        h_lay.setContentsMargins(14, 8, 14, 8)
        h_lay.setSpacing(10)

        # Title & Compact Badges
        lbl_brand = QLabel("🤖 Telegram Hub")
        lbl_brand.setStyleSheet("font-size: 15px; font-weight: 800; color: #D4AF37;")
        h_lay.addWidget(lbl_brand)

        self.lbl_status_badge = QLabel("🔴 متوقف")
        self.lbl_status_badge.setStyleSheet(
            "background-color: #2A1717; color: #EF4444; border: 1px solid #EF4444; "
            "border-radius: 4px; padding: 3px 8px; font-weight: bold; font-size: 11px;"
        )
        h_lay.addWidget(self.lbl_status_badge)

        self.lbl_devices_badge = QLabel("📱 0 هواتف")
        self.lbl_devices_badge.setStyleSheet(
            "background-color: #162032; color: #38BDF8; border: 1px solid #0284C7; "
            "border-radius: 4px; padding: 3px 8px; font-weight: bold; font-size: 11px;"
        )
        h_lay.addWidget(self.lbl_devices_badge)

        h_lay.addStretch()

        # Clean Header Actions
        self.btn_start = QPushButton("▶ تشغيل")
        self.btn_start.setFixedHeight(30)
        self.btn_start.setStyleSheet("""
            QPushButton { background-color: #122B1E; color: #10B981; border: 1px solid #10B981; border-radius: 5px; font-weight: bold; padding: 0 12px; }
            QPushButton:hover { background-color: #10B981; color: #000; }
        """)
        self.btn_start.clicked.connect(self._on_start_bot_clicked)
        h_lay.addWidget(self.btn_start)

        self.btn_stop = QPushButton("⏹ إيقاف")
        self.btn_stop.setFixedHeight(30)
        self.btn_stop.setStyleSheet("""
            QPushButton { background-color: #2D1A1A; color: #EF4444; border: 1px solid #EF4444; border-radius: 5px; font-weight: bold; padding: 0 10px; }
            QPushButton:hover { background-color: #EF4444; color: #fff; }
        """)
        self.btn_stop.clicked.connect(self._on_stop_bot_clicked)
        h_lay.addWidget(self.btn_stop)

        self.btn_reset_wh = QPushButton("🔄 فك تعارض")
        self.btn_reset_wh.setFixedHeight(30)
        self.btn_reset_wh.setStyleSheet("""
            QPushButton { background-color: #2D2410; color: #F59E0B; border: 1px solid #F59E0B; border-radius: 5px; font-weight: bold; padding: 0 10px; }
            QPushButton:hover { background-color: #F59E0B; color: #000; }
        """)
        self.btn_reset_wh.clicked.connect(self._reset_webhook_conflict)
        h_lay.addWidget(self.btn_reset_wh)

        self.btn_open_app = QPushButton("📱 فتح البوت")
        self.btn_open_app.setFixedHeight(30)
        self.btn_open_app.setStyleSheet("""
            QPushButton { background-color: #1E293B; color: #38BDF8; border: 1px solid #38BDF8; border-radius: 5px; font-weight: bold; padding: 0 10px; }
            QPushButton:hover { background-color: #38BDF8; color: #000; }
        """)
        self.btn_open_app.clicked.connect(self._open_telegram_web_or_app)
        h_lay.addWidget(self.btn_open_app)

        root.addWidget(header)

        # 2. Main Tabbed Workspace (Minimalist Tabs)
        self.tabs = QTabWidget()
        self.tabs.setStyleSheet("""
            QTabWidget::pane { border: 1px solid #262636; background-color: #12121A; border-radius: 8px; top: -1px; }
            QTabBar::tab {
                background-color: #181824; color: #8E8EA0; border: 1px solid #262636;
                border-bottom: none; border-top-left-radius: 6px; border-top-right-radius: 6px;
                padding: 8px 18px; font-size: 13px; font-weight: bold; margin-right: 4px;
            }
            QTabBar::tab:selected { background-color: #12121A; color: #D4AF37; border: 1px solid #D4AF37; border-bottom: 2px solid #12121A; }
            QTabBar::tab:hover:!selected { background-color: #1E1E2C; color: #F4F4F6; }
        """)

        # Tab 1: 3-Step Guided Wizard
        self.tabs.addTab(self._build_stepper_tab(), "🧭 خطوات الربط خطوة بخطوة")

        # Tab 2: Connected Devices
        self.tabs.addTab(self._build_devices_tab(), "📱 الأجهزة والهواتف المتصلة")

        # Tab 3: Command Center & Terminal
        self.tabs.addTab(self._build_commands_tab(), "⚡ مركز الأوامر والتحكم المباشر")

        root.addWidget(self.tabs, 1)

    # --------------------------------------------------------------------------
    # TAB 1: 3-Step Guided Stepper (No verbose paragraphs)
    # --------------------------------------------------------------------------

    def _build_stepper_tab(self) -> QWidget:
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("QScrollArea { border: none; background: transparent; }")

        container = QWidget()
        lay = QVBoxLayout(container)
        lay.setContentsMargins(16, 16, 16, 16)
        lay.setSpacing(14)

        # STEP 1: Bot Token Card
        step1 = self._create_step_card(
            number="1",
            title="إنشاء البوت وتفعيل التوكن",
            badge_text="بانتظار التوكن ⏳",
            accent="#D4AF37"
        )
        self.badge_s1 = step1.findChild(QLabel, "badge")

        s1_grid = QGridLayout()
        s1_grid.setSpacing(8)

        s1_grid.addWidget(QLabel("توكن البوت (API Token):"), 0, 0)
        self.txt_token = QLineEdit()
        self.txt_token.setEchoMode(QLineEdit.EchoMode.Password)
        self.txt_token.setPlaceholderText("ألصق التوكن المستخرج من @BotFather هنا...")
        s1_grid.addWidget(self.txt_token, 0, 1)

        self.btn_eye = QPushButton("👁️")
        self.btn_eye.setFixedWidth(38)
        self.btn_eye.clicked.connect(self._toggle_token_visibility)
        s1_grid.addWidget(self.btn_eye, 0, 2)

        s1_grid.addWidget(QLabel("معرف البوت (Username):"), 1, 0)
        self.txt_bot_username = QLineEdit()
        self.txt_bot_username.setPlaceholderText("@MyStore_bot")
        s1_grid.addWidget(self.txt_bot_username, 1, 1, 1, 2)

        step1.layout().addLayout(s1_grid)

        s1_actions = QHBoxLayout()
        s1_actions.setSpacing(8)

        btn_open_bf = QPushButton("🔗 فتح @BotFather")
        btn_open_bf.setFixedHeight(32)
        btn_open_bf.setStyleSheet("background-color: #1E293B; color: #38BDF8; font-weight: bold; border-radius: 5px; padding: 0 12px;")
        btn_open_bf.clicked.connect(lambda: self._open_url("https://t.me/BotFather"))
        s1_actions.addWidget(btn_open_bf)

        self.btn_verify_token = QPushButton("🧪 فحص وحفظ التوكن")
        self.btn_verify_token.setFixedHeight(32)
        self.btn_verify_token.setStyleSheet("background-color: #10B981; color: #000; font-weight: bold; border-radius: 5px; padding: 0 14px;")
        self.btn_verify_token.clicked.connect(self._verify_and_save_step1)
        s1_actions.addWidget(self.btn_verify_token)

        s1_actions.addStretch()
        step1.layout().addLayout(s1_actions)

        self.progress_s1 = QProgressBar()
        self.progress_s1.setRange(0, 0)
        self.progress_s1.setFixedHeight(3)
        self.progress_s1.setVisible(False)
        step1.layout().addWidget(self.progress_s1)

        lay.addWidget(step1)

        # STEP 2: Owner Phone Card
        step2 = self._create_step_card(
            number="2",
            title="ربط هاتف صاحب المحل (المالك)",
            badge_text="بانتظار الربط ⏳",
            accent="#38BDF8"
        )
        self.badge_s2 = step2.findChild(QLabel, "badge")

        s2_box = QHBoxLayout()
        s2_box.setSpacing(10)

        # Quick Code Box
        code_card = QFrame()
        code_card.setStyleSheet("background-color: #1A1A28; border: 1px dashed #38BDF8; border-radius: 6px; padding: 8px;")
        cc_lay = QVBoxLayout(code_card)
        cc_lay.setSpacing(4)
        lbl_cc_hint = QLabel("كود التفعيل الفوري (أرسله للبوت من هاتفك):")
        lbl_cc_hint.setStyleSheet("font-size: 11px; color: #A1A1AA;")
        cc_lay.addWidget(lbl_cc_hint)

        self.lbl_owner_cmd = QLabel("/auth_owner 1234")
        self.lbl_owner_cmd.setStyleSheet("font-family: 'Consolas', monospace; font-size: 15px; font-weight: bold; color: #38BDF8;")
        cc_lay.addWidget(self.lbl_owner_cmd)

        btn_copy_cmd = QPushButton("📋 نسخ الكود")
        btn_copy_cmd.setFixedHeight(24)
        btn_copy_cmd.setStyleSheet("background-color: #262638; color: #F4F4F6; border-radius: 4px; font-size: 11px;")
        btn_copy_cmd.clicked.connect(lambda: self._copy_to_clipboard(self.lbl_owner_cmd.text()))
        cc_lay.addWidget(btn_copy_cmd)

        btn_card_id = QPushButton("🆔 استخراج ID (@tg_raw_data_bot)")
        btn_card_id.setFixedHeight(24)
        btn_card_id.setStyleSheet("background-color: #1E293B; color: #38BDF8; border-radius: 4px; font-size: 11px;")
        btn_card_id.setToolTip("اضغط لفتح بوت @tg_raw_data_bot لمعرفة رقم الـ Chat ID الخاص بك")
        btn_card_id.clicked.connect(lambda: self._open_url("https://t.me/tg_raw_data_bot"))
        cc_lay.addWidget(btn_card_id)

        s2_box.addWidget(code_card)

        # Owner Inputs
        s2_inputs = QVBoxLayout()
        s2_inputs.setSpacing(6)

        s2_grid = QGridLayout()
        s2_grid.setSpacing(6)
        s2_grid.addWidget(QLabel("معرف شات المالك (Chat ID):"), 0, 0)
        owner_cid_box = QHBoxLayout()
        owner_cid_box.setSpacing(6)
        self.txt_owner_chat_id = QLineEdit()
        self.txt_owner_chat_id.setPlaceholderText("مثال: 123456789")
        owner_cid_box.addWidget(self.txt_owner_chat_id, 1)

        btn_get_owner_cid = QPushButton("🆔 استخراج ID")
        btn_get_owner_cid.setFixedHeight(30)
        btn_get_owner_cid.setToolTip("اضغط لفتح بوت @tg_raw_data_bot على تيليجرام لمعرفة رقم الـ Chat ID الخاص بك")
        btn_get_owner_cid.setStyleSheet("""
            QPushButton {
                background-color: #1E293B;
                color: #38BDF8;
                border: 1px solid #0284C7;
                font-weight: bold;
                border-radius: 5px;
                padding: 0 10px;
                font-size: 11px;
            }
            QPushButton:hover {
                background-color: #0284C7;
                color: #FFFFFF;
            }
        """)
        btn_get_owner_cid.clicked.connect(lambda: self._open_url("https://t.me/tg_raw_data_bot"))
        owner_cid_box.addWidget(btn_get_owner_cid)
        s2_grid.addLayout(owner_cid_box, 0, 1)

        s2_grid.addWidget(QLabel("رمز PIN المالك:"), 1, 0)
        self.txt_owner_pin = QLineEdit()
        self.txt_owner_pin.setPlaceholderText("1234")
        self.txt_owner_pin.textChanged.connect(lambda t: self.lbl_owner_cmd.setText(f"/auth_owner {t.strip() or '1234'}"))
        s2_grid.addWidget(self.txt_owner_pin, 1, 1)
        s2_inputs.addLayout(s2_grid)

        lbl_s2_hint = QLabel("💡 لمعرفة رقم المعرف (Chat ID): افتح بوت @tg_raw_data_bot واضغط Start لنسخ الرقم فوراً.")
        lbl_s2_hint.setStyleSheet("font-size: 11px; color: #94A3B8;")
        s2_inputs.addWidget(lbl_s2_hint)

        s2_btns = QHBoxLayout()
        btn_ping_owner = QPushButton("✉️ إرسال فحص لهاتف المالك")
        btn_ping_owner.setFixedHeight(30)
        btn_ping_owner.setStyleSheet("background-color: #1E293B; color: #38BDF8; font-weight: bold; border-radius: 5px; padding: 0 12px;")
        btn_ping_owner.clicked.connect(self._ping_owner_phone)
        s2_btns.addWidget(btn_ping_owner)

        btn_open_id_bot = QPushButton("🆔 استخراج الـ Chat ID (@tg_raw_data_bot)")
        btn_open_id_bot.setFixedHeight(30)
        btn_open_id_bot.setStyleSheet("""
            QPushButton {
                background-color: #1E293B;
                color: #38BDF8;
                font-weight: bold;
                border: 1px solid #0284C7;
                border-radius: 5px;
                padding: 0 12px;
            }
            QPushButton:hover {
                background-color: #0284C7;
                color: #FFFFFF;
            }
        """)
        btn_open_id_bot.setToolTip("اضغط لفتح بوت @tg_raw_data_bot على تيليجرام واستخراج رقم الـ Chat ID فوراً")
        btn_open_id_bot.clicked.connect(lambda: self._open_url("https://t.me/tg_raw_data_bot"))
        s2_btns.addWidget(btn_open_id_bot)

        btn_save_owner = QPushButton("💾 حفظ")
        btn_save_owner.setFixedHeight(30)
        btn_save_owner.setStyleSheet("background-color: #262638; color: #D4AF37; font-weight: bold; border-radius: 5px; padding: 0 14px;")
        btn_save_owner.clicked.connect(self._save_credentials)
        s2_btns.addWidget(btn_save_owner)

        s2_btns.addStretch()
        s2_inputs.addLayout(s2_btns)

        s2_box.addLayout(s2_inputs, 1)
        step2.layout().addLayout(s2_box)
        lay.addWidget(step2)

        # STEP 3: Sales Staff Phones Card
        step3 = self._create_step_card(
            number="3",
            title="ربط هواتف موظفي المبيعات (الجرد والاستعلام)",
            badge_text="0 هواتف مرتبطة",
            accent="#10B981"
        )
        self.badge_s3 = step3.findChild(QLabel, "badge")

        s3_box = QHBoxLayout()
        s3_box.setSpacing(10)

        # Staff Code Box
        staff_code_card = QFrame()
        staff_code_card.setStyleSheet("background-color: #1A1A28; border: 1px dashed #10B981; border-radius: 6px; padding: 8px;")
        scc_lay = QVBoxLayout(staff_code_card)
        scc_lay.setSpacing(4)
        lbl_scc_hint = QLabel("كود تفعيل البائع (يرسله البائع للبوت من هاتفه):")
        lbl_scc_hint.setStyleSheet("font-size: 11px; color: #A1A1AA;")
        scc_lay.addWidget(lbl_scc_hint)

        self.lbl_sales_cmd = QLabel("/auth_sales 0000")
        self.lbl_sales_cmd.setStyleSheet("font-family: 'Consolas', monospace; font-size: 15px; font-weight: bold; color: #10B981;")
        scc_lay.addWidget(self.lbl_sales_cmd)

        btn_copy_staff = QPushButton("📋 نسخ الكود")
        btn_copy_staff.setFixedHeight(24)
        btn_copy_staff.setStyleSheet("background-color: #262638; color: #F4F4F6; border-radius: 4px; font-size: 11px;")
        btn_copy_staff.clicked.connect(lambda: self._copy_to_clipboard(self.lbl_sales_cmd.text()))
        scc_lay.addWidget(btn_copy_staff)

        btn_card_staff_id = QPushButton("🆔 استخراج ID (@tg_raw_data_bot)")
        btn_card_staff_id.setFixedHeight(24)
        btn_card_staff_id.setStyleSheet("background-color: #1E293B; color: #38BDF8; border-radius: 4px; font-size: 11px;")
        btn_card_staff_id.setToolTip("اضغط لفتح بوت @tg_raw_data_bot لمعرفة رقم الـ Chat ID للموظف")
        btn_card_staff_id.clicked.connect(lambda: self._open_url("https://t.me/tg_raw_data_bot"))
        scc_lay.addWidget(btn_card_staff_id)

        s3_box.addWidget(staff_code_card)

        # Staff Controls
        s3_inputs = QVBoxLayout()
        s3_inputs.setSpacing(6)

        s3_grid = QGridLayout()
        s3_grid.setSpacing(6)
        s3_grid.addWidget(QLabel("رمز PIN البائعين:"), 0, 0)
        self.txt_sales_pin = QLineEdit()
        self.txt_sales_pin.setPlaceholderText("0000")
        self.txt_sales_pin.textChanged.connect(lambda t: self.lbl_sales_cmd.setText(f"/auth_sales {t.strip() or '0000'}"))
        s3_grid.addWidget(self.txt_sales_pin, 0, 1)

        s3_grid.addWidget(QLabel("معرفات إضافية يدوية:"), 1, 0)
        self.txt_staff_chat_ids = QLineEdit()
        self.txt_staff_chat_ids.setPlaceholderText("أرقام مفصولة بفواصل...")
        s3_grid.addWidget(self.txt_staff_chat_ids, 1, 1)
        s3_inputs.addLayout(s3_grid)

        s3_btns = QHBoxLayout()
        btn_add_device = QPushButton("➕ إضافة هاتف بائع يدوياً")
        btn_add_device.setFixedHeight(30)
        btn_add_device.setStyleSheet("background-color: #10B981; color: #000; font-weight: bold; border-radius: 5px; padding: 0 12px;")
        btn_add_device.clicked.connect(self._open_add_device_dialog)
        s3_btns.addWidget(btn_add_device)

        btn_staff_get_id = QPushButton("🆔 استخراج Chat ID (@tg_raw_data_bot)")
        btn_staff_get_id.setFixedHeight(30)
        btn_staff_get_id.setStyleSheet("""
            QPushButton {
                background-color: #1E293B;
                color: #38BDF8;
                font-weight: bold;
                border: 1px solid #0284C7;
                border-radius: 5px;
                padding: 0 12px;
            }
            QPushButton:hover {
                background-color: #0284C7;
                color: #FFFFFF;
            }
        """)
        btn_staff_get_id.setToolTip("فتح بوت @tg_raw_data_bot على تيليجرام لمعرفة رقم الـ Chat ID للموظف")
        btn_staff_get_id.clicked.connect(lambda: self._open_url("https://t.me/tg_raw_data_bot"))
        s3_btns.addWidget(btn_staff_get_id)

        btn_view_devs = QPushButton("استعراض الأجهزة المتصلة ⬅️")
        btn_view_devs.setFixedHeight(30)
        btn_view_devs.setStyleSheet("background-color: #262638; color: #D4AF37; font-weight: bold; border-radius: 5px; padding: 0 12px;")
        btn_view_devs.clicked.connect(lambda: self.tabs.setCurrentIndex(1))
        s3_btns.addWidget(btn_view_devs)

        s3_btns.addStretch()
        s3_inputs.addLayout(s3_btns)

        s3_box.addLayout(s3_inputs, 1)
        step3.layout().addLayout(s3_box)
        lay.addWidget(step3)

        scroll.setWidget(container)
        return scroll

    def _create_step_card(self, number: str, title: str, badge_text: str, accent: str) -> QFrame:
        card = QFrame()
        card.setStyleSheet("""
            QFrame {
                background-color: #161622;
                border: 1px solid #282838;
                border-radius: 8px;
            }
        """)
        lay = QVBoxLayout(card)
        lay.setContentsMargins(14, 12, 14, 12)
        lay.setSpacing(10)

        header = QHBoxLayout()
        header.setSpacing(10)

        # Number Badge
        lbl_num = QLabel(number)
        lbl_num.setFixedSize(26, 26)
        lbl_num.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl_num.setStyleSheet(f"background-color: {accent}; color: #0D0D11; font-weight: 800; border-radius: 13px; font-size: 13px;")
        header.addWidget(lbl_num)

        lbl_t = QLabel(title)
        lbl_t.setStyleSheet("font-size: 14px; font-weight: bold; color: #F4F4F6;")
        header.addWidget(lbl_t)

        header.addStretch()

        lbl_badge = QLabel(badge_text)
        lbl_badge.setObjectName("badge")
        lbl_badge.setStyleSheet("background-color: #222230; color: #A1A1AA; border-radius: 4px; padding: 3px 8px; font-size: 11px;")
        header.addWidget(lbl_badge)

        lay.addLayout(header)
        return card

    # --------------------------------------------------------------------------
    # TAB 2: Connected Devices Manager
    # --------------------------------------------------------------------------

    def _build_devices_tab(self) -> QWidget:
        widget = QWidget()
        lay = QVBoxLayout(widget)
        lay.setContentsMargins(14, 14, 14, 14)
        lay.setSpacing(10)

        # Header with action buttons
        top_row = QHBoxLayout()
        lbl_title = QLabel("📱 سجل الهواتف المتصلة بالبوت")
        lbl_title.setStyleSheet("font-size: 14px; font-weight: bold; color: #D4AF37;")
        top_row.addWidget(lbl_title)

        top_row.addStretch()

        btn_add = QPushButton("➕ إضافة هاتف")
        btn_add.setFixedHeight(28)
        btn_add.setStyleSheet("background-color: #10B981; color: #000; font-weight: bold; border-radius: 4px; padding: 0 10px; font-size: 11px;")
        btn_add.clicked.connect(self._open_add_device_dialog)
        top_row.addWidget(btn_add)

        btn_broadcast = QPushButton("📢 تعميم")
        btn_broadcast.setFixedHeight(28)
        btn_broadcast.setStyleSheet("background-color: #8B5CF6; color: #fff; font-weight: bold; border-radius: 4px; padding: 0 10px; font-size: 11px;")
        btn_broadcast.clicked.connect(self._open_broadcast_dialog)
        top_row.addWidget(btn_broadcast)

        btn_refresh = QPushButton("🔄 تحديث")
        btn_refresh.setFixedHeight(28)
        btn_refresh.setStyleSheet("background-color: #242434; color: #D4AF37; border-radius: 4px; padding: 0 10px; font-size: 11px;")
        btn_refresh.clicked.connect(self._refresh_subscribers_table)
        top_row.addWidget(btn_refresh)

        lay.addLayout(top_row)

        # Clean Table
        self.table_subscribers = QTableWidget()
        self.table_subscribers.setColumnCount(5)
        self.table_subscribers.setHorizontalHeaderLabels([
            "الرتبة",
            "اسم المستخدم",
            "Chat ID",
            "الحالة",
            "آخر نشاط"
        ])
        self.table_subscribers.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.table_subscribers.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.table_subscribers.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        self.table_subscribers.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self.table_subscribers.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table_subscribers.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table_subscribers.setAlternatingRowColors(True)
        self.table_subscribers.setStyleSheet("""
            QTableWidget {
                background-color: #14141E;
                alternate-background-color: #181826;
                color: #F4F4F6;
                gridline-color: #262636;
                border: 1px solid #262636;
                border-radius: 6px;
                font-size: 12px;
            }
            QHeaderView::section {
                background-color: #1A1A28;
                color: #D4AF37;
                padding: 6px;
                border: 1px solid #262636;
                font-weight: bold;
                font-size: 12px;
            }
            QTableWidget::item:selected {
                background-color: #2D2818;
                color: #D4AF37;
            }
        """)
        lay.addWidget(self.table_subscribers, 1)

        # Row actions
        row_actions = QHBoxLayout()
        row_actions.setSpacing(8)

        btn_ping = QPushButton("✉️ إرسال فحص للهاتف المحدد")
        btn_ping.setFixedHeight(30)
        btn_ping.setStyleSheet("background-color: #1E293B; color: #38BDF8; font-weight: bold; border-radius: 4px; padding: 0 12px;")
        btn_ping.clicked.connect(self._ping_selected_subscriber)
        row_actions.addWidget(btn_ping)

        btn_toggle = QPushButton("🔄 تبديل الدور (مالك ⇋ بائع)")
        btn_toggle.setFixedHeight(30)
        btn_toggle.setStyleSheet("background-color: #2D2410; color: #F59E0B; font-weight: bold; border-radius: 4px; padding: 0 12px;")
        btn_toggle.clicked.connect(self._toggle_selected_role)
        row_actions.addWidget(btn_toggle)

        btn_del = QPushButton("🗑️ حذف الهاتف")
        btn_del.setFixedHeight(30)
        btn_del.setStyleSheet("background-color: #2D1A1A; color: #EF4444; font-weight: bold; border-radius: 4px; padding: 0 12px;")
        btn_del.clicked.connect(self._delete_selected_subscriber)
        row_actions.addWidget(btn_del)

        row_actions.addStretch()
        lay.addLayout(row_actions)

        return widget

    # --------------------------------------------------------------------------
    # TAB 3: Direct Command Center & Interactive Terminal
    # --------------------------------------------------------------------------

    def _build_commands_tab(self) -> QWidget:
        widget = QWidget()
        lay = QVBoxLayout(widget)
        lay.setContentsMargins(14, 14, 14, 14)
        lay.setSpacing(10)

        # 1-Click Fast Triggers Grid
        btn_grid = QGridLayout()
        btn_grid.setSpacing(8)

        actions = [
            ("📊 إرسال تقرير المخزن والأرباح PDF", "/report", "#1E293B", "#38BDF8"),
            ("🚨 رادار الأجهزة الراكدة (15 و 30 يوماً)", "/radar", "#2D1A1A", "#EF4444"),
            ("🤝 كشف ديون ومواعيد التجار", "/debts", "#2D2410", "#F59E0B"),
            ("💾 أخذ نسخة احتياطية مشفرة", "/backup", "#122B1E", "#10B981"),
            ("📱 استعراض قائمة الهواتف المتصلة", "/devices", "#221C35", "#C084FC"),
            ("ℹ️ فحص حالة وتشخيص البوت", "/status", "#1C2430", "#94A3B8"),
        ]

        for i, (label, cmd, bg, accent) in enumerate(actions):
            r, c = divmod(i, 3)
            b = QPushButton(label)
            b.setFixedHeight(34)
            b.setStyleSheet(f"""
                QPushButton {{ background-color: {bg}; color: {accent}; border: 1px solid {accent}; border-radius: 5px; font-weight: bold; font-size: 11px; }}
                QPushButton:hover {{ background-color: {accent}; color: #0D0D11; }}
            """)
            b.clicked.connect(lambda checked, cm=cmd: self._dispatch_terminal_command(cm))
            btn_grid.addWidget(b, r, c)

        lay.addLayout(btn_grid)

        # ----------------------------------------------------------------------
        # Custom Bot Commands Manager Card
        # ----------------------------------------------------------------------
        cmd_card = QFrame()
        cmd_card.setStyleSheet("background-color: #0E0E14; border: 1px solid #232332; border-radius: 8px;")
        cc_layout = QVBoxLayout(cmd_card)
        cc_layout.setContentsMargins(10, 8, 10, 10)
        cc_layout.setSpacing(8)

        cc_top = QHBoxLayout()
        lbl_cc_title = QLabel("⚡ إدارة وتخصيص أوامر البوت المباشرة (Custom Bot Commands Manager)")
        lbl_cc_title.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 12px;")
        cc_top.addWidget(lbl_cc_title)
        cc_top.addStretch()

        btn_add_cmd = QPushButton("➕ إضافة أمر جديد للبوت")
        btn_add_cmd.setFixedHeight(28)
        btn_add_cmd.setStyleSheet("background-color: #10B981; color: #000; font-weight: bold; border-radius: 4px; padding: 0 10px; font-size: 11px;")
        btn_add_cmd.clicked.connect(self._open_add_custom_command_dialog)
        cc_top.addWidget(btn_add_cmd)

        btn_toggle_cmd = QPushButton("🔄 تفعيل / تعطيل")
        btn_toggle_cmd.setFixedHeight(28)
        btn_toggle_cmd.setStyleSheet("background-color: #2D2410; color: #F59E0B; font-weight: bold; border-radius: 4px; padding: 0 10px; font-size: 11px;")
        btn_toggle_cmd.clicked.connect(self._toggle_selected_custom_command)
        cc_top.addWidget(btn_toggle_cmd)

        btn_del_cmd = QPushButton("🗑️ حذف الأمر")
        btn_del_cmd.setFixedHeight(28)
        btn_del_cmd.setStyleSheet("background-color: #2D1A1A; color: #EF4444; font-weight: bold; border-radius: 4px; padding: 0 10px; font-size: 11px;")
        btn_del_cmd.clicked.connect(self._delete_selected_custom_command)
        cc_top.addWidget(btn_del_cmd)

        cc_layout.addLayout(cc_top)

        self.table_custom_cmds = QTableWidget()
        self.table_custom_cmds.setColumnCount(5)
        self.table_custom_cmds.setHorizontalHeaderLabels([
            "الأمر (Trigger)", "الوصف والوظيفة", "الرد التلقائي للبوت", "الصلاحية", "الحالة"
        ])
        self.table_custom_cmds.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.table_custom_cmds.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.table_custom_cmds.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.table_custom_cmds.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self.table_custom_cmds.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        self.table_custom_cmds.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table_custom_cmds.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table_custom_cmds.setMaximumHeight(140)
        self.table_custom_cmds.setStyleSheet("""
            QTableWidget {
                background-color: #060609;
                gridline-color: #1A1A24;
                color: #F3F4F6;
                font-size: 11px;
                border: 1px solid #1E1E28;
                border-radius: 4px;
            }
            QHeaderView::section {
                background-color: #12121A;
                color: #D4AF37;
                font-weight: bold;
                border: 1px solid #1E1E28;
                padding: 4px;
            }
            QTableWidget::item:selected {
                background-color: #282834;
                color: #D4AF37;
            }
        """)
        cc_layout.addWidget(self.table_custom_cmds)

        lay.addWidget(cmd_card)

        # Interactive Terminal Frame
        term_frame = QFrame()
        term_frame.setStyleSheet("background-color: #0A0A0E; border: 1px solid #262636; border-radius: 8px;")
        t_lay = QVBoxLayout(term_frame)
        t_lay.setContentsMargins(10, 8, 10, 10)
        t_lay.setSpacing(6)

        t_top = QHBoxLayout()
        lbl_cons = QLabel("💻 وحدة الأوامر المباشرة (Direct Command Console)")
        lbl_cons.setStyleSheet("color: #10B981; font-family: 'Consolas', monospace; font-size: 11px; font-weight: bold;")
        t_top.addWidget(lbl_cons)
        t_top.addStretch()

        btn_cls = QPushButton("مسح 🧹")
        btn_cls.setFixedHeight(22)
        btn_cls.setStyleSheet("background-color: #1E1E28; color: #8E8EA0; border-radius: 3px; font-size: 10px; padding: 0 6px;")
        btn_cls.clicked.connect(self._clear_terminal)
        t_top.addWidget(btn_cls)
        t_lay.addLayout(t_top)

        self.txt_terminal = QTextEdit()
        self.txt_terminal.setReadOnly(True)
        self.txt_terminal.setStyleSheet("""
            QTextEdit {
                background-color: #060609;
                color: #10B981;
                font-family: 'Consolas', monospace;
                font-size: 11px;
                border: 1px solid #1A1A24;
                border-radius: 4px;
                padding: 6px;
            }
        """)
        t_lay.addWidget(self.txt_terminal, 1)

        # Command Input
        cmd_bar = QHBoxLayout()
        cmd_bar.setSpacing(6)

        lbl_p = QLabel("PROLAB >")
        lbl_p.setStyleSheet("color: #D4AF37; font-weight: bold; font-family: 'Consolas', monospace;")
        cmd_bar.addWidget(lbl_p)

        self.txt_cmd_input = QLineEdit()
        self.txt_cmd_input.setFixedHeight(32)
        self.txt_cmd_input.setStyleSheet("""
            QLineEdit { background-color: #12121A; color: #fff; border: 1px solid #2E2E40; border-radius: 4px; padding: 0 8px; font-family: 'Consolas', monospace; font-size: 12px; }
            QLineEdit:focus { border: 1px solid #D4AF37; }
        """)
        self.txt_cmd_input.setPlaceholderText("اكتب الأمر هنا ثم اضغط Enter (مثال: /report أو /broadcast تنبيه عاجل أو /help)...")
        self.txt_cmd_input.returnPressed.connect(self._on_command_entered)
        cmd_bar.addWidget(self.txt_cmd_input, 1)

        btn_run = QPushButton("إرسال ⏎")
        btn_run.setFixedHeight(32)
        btn_run.setStyleSheet("background-color: #10B981; color: #000; font-weight: bold; border-radius: 4px; padding: 0 14px;")
        btn_run.clicked.connect(self._on_command_entered)
        cmd_bar.addWidget(btn_run)

        t_lay.addLayout(cmd_bar)
        lay.addWidget(term_frame, 1)

        self._print_terminal_banner()
        return widget

    # --------------------------------------------------------------------------
    # Logic & Event Handlers
    # --------------------------------------------------------------------------

    def append_log(self, text: str):
        if hasattr(self, 'txt_terminal'):
            ts = datetime.now().strftime("%H:%M:%S")
            self.txt_terminal.append(f"<span style='color: #94A3B8;'>[{ts}] {text}</span>")
            sb = self.txt_terminal.verticalScrollBar()
            sb.setValue(sb.maximum())

    def _copy_to_clipboard(self, text: str):
        QApplication.clipboard().setText(text)
        QMessageBox.information(self, "تم النسخ", f"تم نسخ الكود للحافظة:\n{text}")

    def _open_url(self, url: str):
        import webbrowser
        try:
            webbrowser.open(url)
        except Exception:
            pass

    def _open_telegram_web_or_app(self):
        username = self.txt_bot_username.text().strip().replace("@", "")
        if not username:
            QMessageBox.information(self, "تنبيه", "أدخل معرف البوت أولاً في الخطوة 1.")
            return
        self._open_url(f"https://t.me/{username}")

    def _toggle_token_visibility(self):
        if self.txt_token.echoMode() == QLineEdit.EchoMode.Password:
            self.txt_token.setEchoMode(QLineEdit.EchoMode.Normal)
            self.btn_eye.setText("🔒")
        else:
            self.txt_token.setEchoMode(QLineEdit.EchoMode.Password)
            self.btn_eye.setText("👁️")

    def _load_current_credentials(self):
        token = self.db.get_setting("telegram_bot_token", "")
        owner_id = self.db.get_setting("telegram_owner_chat_id", "")
        staff_ids = self.db.get_setting("telegram_staff_chat_ids", "")
        username = self.db.get_setting("telegram_bot_username", "")
        owner_pin = self.db.get_setting("owner_pin", "1234")
        sales_pin = self.db.get_setting("sales_pin", "0000")

        # Sanitize any accidental hash string to clean readable defaults
        if "$" in owner_pin:
            owner_pin = "1234"
            self.db.set_setting("owner_pin", "1234")
        if "$" in sales_pin:
            sales_pin = "0000"
            self.db.set_setting("sales_pin", "0000")

        self.txt_token.setText(token)
        self.txt_owner_chat_id.setText(owner_id)
        self.txt_staff_chat_ids.setText(staff_ids)
        self.txt_bot_username.setText(username)
        self.txt_owner_pin.setText(owner_pin)
        self.txt_sales_pin.setText(sales_pin)

        self.lbl_owner_cmd.setText(f"/auth_owner {owner_pin}")
        self.lbl_sales_cmd.setText(f"/auth_sales {sales_pin}")
        self._update_status_badges()

    def _update_status_badges(self):
        token = self.txt_token.text().strip()
        owner_id = self.txt_owner_chat_id.text().strip()

        if token:
            self.badge_s1.setText("✅ التوكن مدخل")
            self.badge_s1.setStyleSheet("background-color: #122B1E; color: #10B981; border-radius: 4px; padding: 3px 8px; font-size: 11px;")
        else:
            self.badge_s1.setText("بانتظار التوكن ⏳")
            self.badge_s1.setStyleSheet("background-color: #222230; color: #A1A1AA; border-radius: 4px; padding: 3px 8px; font-size: 11px;")

        if owner_id:
            self.badge_s2.setText(f"✅ مربوط ({owner_id})")
            self.badge_s2.setStyleSheet("background-color: #122B1E; color: #10B981; border-radius: 4px; padding: 3px 8px; font-size: 11px;")
        else:
            self.badge_s2.setText("بانتظار الربط ⏳")
            self.badge_s2.setStyleSheet("background-color: #222230; color: #A1A1AA; border-radius: 4px; padding: 3px 8px; font-size: 11px;")

        is_bot_running = bool(self.bot and getattr(self.bot, 'is_running', False))
        if is_bot_running:
            self.lbl_status_badge.setText("🟢 متصل")
            self.lbl_status_badge.setStyleSheet("background-color: #122B1E; color: #10B981; border: 1px solid #10B981; border-radius: 4px; padding: 3px 8px; font-weight: bold; font-size: 11px;")
            self.btn_start.setEnabled(False)
            self.btn_stop.setEnabled(True)
        elif token and owner_id:
            self.lbl_status_badge.setText("🟡 جاهز للتشغيل")
            self.lbl_status_badge.setStyleSheet("background-color: #2D2410; color: #F59E0B; border: 1px solid #F59E0B; border-radius: 4px; padding: 3px 8px; font-weight: bold; font-size: 11px;")
            self.btn_start.setEnabled(True)
            self.btn_stop.setEnabled(False)
        else:
            self.lbl_status_badge.setText("🔴 غير مكتمل")
            self.lbl_status_badge.setStyleSheet("background-color: #2D1A1A; color: #EF4444; border: 1px solid #EF4444; border-radius: 4px; padding: 3px 8px; font-weight: bold; font-size: 11px;")
            self.btn_start.setEnabled(True)
            self.btn_stop.setEnabled(False)

    def _verify_and_save_step1(self):
        token = self.txt_token.text().strip()
        if not token:
            QMessageBox.warning(self, "تنبيه", "أدخل التوكن أولاً.")
            return

        self.progress_s1.setVisible(True)
        self.btn_verify_token.setEnabled(False)

        self._test_worker = TelegramTestWorker(token, self.txt_owner_chat_id.text().strip())
        self._test_worker.test_finished.connect(self._on_step1_verified)
        self._test_worker.start()

    @pyqtSlot(bool, str, dict)
    def _on_step1_verified(self, success: bool, message: str, bot_info: dict):
        self.progress_s1.setVisible(False)
        self.btn_verify_token.setEnabled(True)

        if bot_info.get("username"):
            self.txt_bot_username.setText(f"@{bot_info.get('username')}")

        if success:
            self._save_credentials()
            QMessageBox.information(self, "نجاح", f"✅ {message}")
        else:
            QMessageBox.critical(self, "فشل التحقق", f"❌ {message}")

    def _save_credentials(self):
        token = self.txt_token.text().strip()
        owner_id = self.txt_owner_chat_id.text().strip()
        staff_ids = self.txt_staff_chat_ids.text().strip()
        username = self.txt_bot_username.text().strip()
        owner_pin = self.txt_owner_pin.text().strip() or "1234"
        sales_pin = self.txt_sales_pin.text().strip() or "0000"

        # Validate that user did not paste bot token into chat_id field
        if ":" in owner_id and len(owner_id) > 20:
            QMessageBox.warning(self, "تنبيه", "يبدو أنك ألصقت توكن البوت في حقل Chat ID للمالك! يرجى إدخال رقم المعرف الرقمي الخاص بحسابك (مثال: 1065573291).")
            return

        if ":" in staff_ids and len(staff_ids) > 20:
            QMessageBox.warning(self, "تنبيه", "يبدو أنك ألصقت توكن البوت في حقل معرفات الموظفين!")
            return

        self.db.set_setting("telegram_bot_token", token)
        self.db.set_setting("telegram_owner_chat_id", owner_id)
        self.db.set_setting("telegram_staff_chat_ids", staff_ids)
        self.db.set_setting("telegram_bot_username", username)
        self.db.set_setting("owner_pin", owner_pin)
        self.db.set_setting("sales_pin", sales_pin)

        if owner_id:
            self.db.register_telegram_subscriber(owner_id, "👑 صاحب المحل (المالك)", role="Owner", username=username)

        self._load_current_credentials()
        self._refresh_subscribers_table()
        self.credentials_updated.emit()

    def _refresh_subscribers_table(self):
        try:
            subs = self.db.get_telegram_subscribers()
        except Exception:
            subs = []

        self.table_subscribers.setRowCount(len(subs))
        owners = 0
        sales = 0

        for r, s in enumerate(subs):
            role = s.get("role", "Salesperson")
            if role == "Owner":
                owners += 1
                r_item = QTableWidgetItem("👑 صاحب المحل")
                r_item.setForeground(QColor("#D4AF37"))
            else:
                sales += 1
                r_item = QTableWidgetItem("💼 موظف مبيعات")
                r_item.setForeground(QColor("#38BDF8"))
            r_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table_subscribers.setItem(r, 0, r_item)

            name = s.get("name", "")
            if s.get("username"):
                name += f" ({s.get('username')})"
            self.table_subscribers.setItem(r, 1, QTableWidgetItem(name))

            cid = QTableWidgetItem(str(s.get("chat_id", "")))
            cid.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table_subscribers.setItem(r, 2, cid)

            stat = QTableWidgetItem("🟢 نشط" if s.get("status") == "active" else "⚪ غير متصل")
            stat.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            if s.get("status") == "active":
                stat.setForeground(QColor("#10B981"))
            self.table_subscribers.setItem(r, 3, stat)

            act = QTableWidgetItem(s.get("last_active", ""))
            act.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table_subscribers.setItem(r, 4, act)

        total = len(subs)
        self.lbl_devices_badge.setText(f"📱 {total} هواتف ({owners} مالك - {sales} بائع)")
        self.badge_s3.setText(f"{sales} هواتف مرتبطة")

    def _ping_owner_phone(self):
        owner_id = self.txt_owner_chat_id.text().strip()
        if not owner_id:
            QMessageBox.warning(self, "تنبيه", "أدخل رقم Chat ID للمالك أولاً.")
            return
        if not self.bot:
            QMessageBox.warning(self, "خطأ", "خدمة البوت غير متصلة.")
            return
        ok, msg = self.bot.ping_subscriber(owner_id)
        if ok:
            QMessageBox.information(self, "نجاح", f"✅ {msg}")
        else:
            QMessageBox.warning(self, "تنبيه", f"❌ {msg}")

    def _open_add_device_dialog(self):
        dlg = AddDeviceDialog(self.db, self)
        if dlg.exec() == QDialog.DialogCode.Accepted:
            self._load_current_credentials()
            self._refresh_subscribers_table()

    def _open_broadcast_dialog(self):
        dlg = BroadcastDialog(self.bot, self)
        dlg.exec()

    def _ping_selected_subscriber(self):
        row = self.table_subscribers.currentRow()
        if row < 0:
            QMessageBox.warning(self, "تنبيه", "حدد هاتفاً من الجدول أولاً.")
            return
        cid = self.table_subscribers.item(row, 2).text()
        if not self.bot:
            return
        ok, msg = self.bot.ping_subscriber(cid)
        if ok:
            QMessageBox.information(self, "نجاح", f"✅ {msg}")
        else:
            QMessageBox.warning(self, "فشل", f"❌ {msg}")

    def _toggle_selected_role(self):
        row = self.table_subscribers.currentRow()
        if row < 0:
            return
        cid = self.table_subscribers.item(row, 2).text()
        cur_role = self.table_subscribers.item(row, 0).text()
        new_role = "Salesperson" if "صاحب المحل" in cur_role else "Owner"
        self.db.update_telegram_subscriber_role(cid, new_role)
        if new_role == "Owner":
            self.db.set_setting("telegram_owner_chat_id", cid)
            self._load_current_credentials()
        self._refresh_subscribers_table()

    def _delete_selected_subscriber(self):
        row = self.table_subscribers.currentRow()
        if row < 0:
            return
        cid = self.table_subscribers.item(row, 2).text()
        if QMessageBox.question(self, "تأكيد", f"هل تريد حذف الهاتف ({cid})؟") == QMessageBox.StandardButton.Yes:
            self.db.delete_telegram_subscriber(cid)
            if self.db.get_setting("telegram_owner_chat_id", "") == cid:
                self.db.set_setting("telegram_owner_chat_id", "")
                self._load_current_credentials()
            self._refresh_subscribers_table()

    def _on_bot_status_changed(self, is_online: bool, msg: str):
        if is_online:
            self.lbl_status_badge.setText("🟢 متصل")
            self.lbl_status_badge.setStyleSheet("background-color: #122B1E; color: #10B981; border: 1px solid #10B981; border-radius: 4px; padding: 3px 8px; font-weight: bold; font-size: 11px;")
            self.btn_start.setEnabled(False)
            self.btn_stop.setEnabled(True)
        else:
            self.lbl_status_badge.setText("🔴 متوقف")
            self.lbl_status_badge.setStyleSheet("background-color: #2D1A1A; color: #EF4444; border: 1px solid #EF4444; border-radius: 4px; padding: 3px 8px; font-weight: bold; font-size: 11px;")
            self.btn_start.setEnabled(True)
            self.btn_stop.setEnabled(False)

    def _on_start_bot_clicked(self):
        self.lbl_status_badge.setText("⏳ جاري التشغيل...")
        self.lbl_status_badge.setStyleSheet("background-color: #2D2410; color: #F59E0B; border: 1px solid #F59E0B; border-radius: 4px; padding: 3px 8px; font-weight: bold; font-size: 11px;")
        self.start_bot_requested.emit()

    def _on_stop_bot_clicked(self):
        self.lbl_status_badge.setText("⏳ جاري الإيقاف...")
        self.lbl_status_badge.setStyleSheet("background-color: #2D1A1A; color: #EF4444; border: 1px solid #EF4444; border-radius: 4px; padding: 3px 8px; font-weight: bold; font-size: 11px;")
        self.stop_bot_requested.emit()

    def _reset_webhook_conflict(self):
        token = self.txt_token.text().strip()
        if not token:
            QMessageBox.warning(self, "تنبيه", "أدخل توكن البوت أولاً.")
            return
        try:
            r = requests.get(f"https://api.telegram.org/bot{token}/deleteWebhook?drop_pending_updates=True", timeout=6)
            if self.bot and hasattr(self.bot, 'failed_auth_attempts'):
                self.bot.failed_auth_attempts.clear()
            if r.json().get("ok"):
                QMessageBox.information(self, "نجاح", "تم فك التعارض، ومسح التحديثات العالقة، وإلغاء أي حظر مؤقت بنجاح.")
                self.append_log("🔄 تم فك التعارض ومسح التحديثات العالقة بنجاح.")
            else:
                QMessageBox.warning(self, "تنبيه", f"رد تيليجرام: {r.json().get('description')}")
        except Exception as e:
            QMessageBox.critical(self, "خطأ", f"تعذر الاتصال: {e}")

    # --------------------------------------------------------------------------
    # Custom Bot Commands Manager Handlers
    # --------------------------------------------------------------------------

    def _open_add_custom_command_dialog(self):
        dlg = AddCustomCommandDialog(self.db, self)
        dlg.command_saved.connect(self._refresh_custom_commands_table)
        dlg.exec()

    def _refresh_custom_commands_table(self):
        """Reloads custom commands from database into table."""
        if not hasattr(self, "table_custom_cmds"):
            return
        cmds = self.db.get_custom_commands()
        self.table_custom_cmds.setRowCount(len(cmds))
        for r, c in enumerate(cmds):
            item_trig = QTableWidgetItem(c.get("command_trigger", ""))
            item_trig.setForeground(QColor("#D4AF37"))
            item_trig.setData(Qt.ItemDataRole.UserRole, c.get("id"))
            self.table_custom_cmds.setItem(r, 0, item_trig)

            self.table_custom_cmds.setItem(r, 1, QTableWidgetItem(c.get("description", "")))

            resp_preview = c.get("response_payload", "").replace("\n", " ")
            if len(resp_preview) > 60:
                resp_preview = resp_preview[:60] + "..."
            self.table_custom_cmds.setItem(r, 2, QTableWidgetItem(resp_preview))

            role_str = "👑 المالك فقط" if c.get("role_access") == "Owner" else "🌐 متاح للكل"
            self.table_custom_cmds.setItem(r, 3, QTableWidgetItem(role_str))

            status_str = "🟢 نشط" if c.get("is_active") else "🔴 معطل"
            item_st = QTableWidgetItem(status_str)
            item_st.setForeground(QColor("#10B981" if c.get("is_active") else "#EF4444"))
            self.table_custom_cmds.setItem(r, 4, item_st)

    def _toggle_selected_custom_command(self):
        row = self.table_custom_cmds.currentRow()
        if row < 0:
            QMessageBox.warning(self, "تنبيه", "حدد أمراً من الجدول أولاً.")
            return
        item_trig = self.table_custom_cmds.item(row, 0)
        cmd_id = item_trig.data(Qt.ItemDataRole.UserRole)
        st_text = self.table_custom_cmds.item(row, 4).text()
        new_active = "معطل" in st_text
        self.db.toggle_custom_command(cmd_id, new_active)
        self._refresh_custom_commands_table()

    def _delete_selected_custom_command(self):
        row = self.table_custom_cmds.currentRow()
        if row < 0:
            QMessageBox.warning(self, "تنبيه", "حدد أمراً من الجدول أولاً.")
            return
        item_trig = self.table_custom_cmds.item(row, 0)
        cmd_id = item_trig.data(Qt.ItemDataRole.UserRole)
        trig_name = item_trig.text()
        if QMessageBox.question(self, "تأكيد الحذف", f"هل تريد بالتأكيد حذف الأمر ({trig_name}) نهائياً من البوت؟") == QMessageBox.StandardButton.Yes:
            self.db.delete_custom_command(cmd_id)
            self._refresh_custom_commands_table()

    # --------------------------------------------------------------------------
    # Terminal Execution
    # --------------------------------------------------------------------------

    def _print_terminal_banner(self):
        self.txt_terminal.setText(
            "=== PROLAB BOT COMMAND CENTER v4.4.0 ===\n"
            "جاهز لتنفيذ الأوامر الفورية وتخصيص البوت. اكتب /help أو /addcmd لعرض الأوامر.\n"
        )

    def _clear_terminal(self):
        self.txt_terminal.clear()
        self._print_terminal_banner()

    def _dispatch_terminal_command(self, cmd_text: str):
        self.txt_cmd_input.setText(cmd_text)
        self._on_command_entered()

    def _on_command_entered(self):
        cmd = self.txt_cmd_input.text().strip()
        if not cmd:
            return
        self.txt_cmd_input.clear()

        ts = datetime.now().strftime("%H:%M:%S")
        self.txt_terminal.append(f"\n<span style='color: #D4AF37;'>[{ts}] &gt; {cmd}</span>")

        if cmd.lower() in ("/clear", "مسح"):
            self._clear_terminal()
            return

        if cmd.startswith("/addcmd "):
            # Format: /addcmd <trigger> | <desc> | <response>
            parts = cmd[8:].split("|")
            if len(parts) >= 2:
                trig = parts[0].strip()
                desc = parts[1].strip()
                resp = parts[2].strip() if len(parts) > 2 else desc
                try:
                    self.db.add_custom_command(trig, desc, resp)
                    self._refresh_custom_commands_table()
                    self.txt_terminal.append(f"<span style='color: #10B981;'>[OK] تم إضافة الأمر {trig} بنجاح!</span>")
                    return
                except Exception as e:
                    self.txt_terminal.append(f"<span style='color: #EF4444;'>[ERROR] فشل إضافة الأمر: {e}</span>")
                    return
            else:
                self.txt_terminal.append("<span style='color: #F59E0B;'>صيغة الأمر: /addcmd trigger | description | response</span>")
                return

        if cmd.startswith("/delcmd "):
            trig = cmd[8:].strip()
            c = self.db.get_custom_command_by_trigger(trig)
            if c:
                self.db.delete_custom_command(c["id"])
                self._refresh_custom_commands_table()
                self.txt_terminal.append(f"<span style='color: #10B981;'>[OK] تم حذف الأمر {trig} بنجاح!</span>")
            else:
                self.txt_terminal.append(f"<span style='color: #EF4444;'>[ERROR] الأمر {trig} غير موجود.</span>")
            return

        if not self.bot:
            self.txt_terminal.append("<span style='color: #EF4444;'>البوت غير متصل حالياً. اضغط على 'تشغيل' بالأعلى.</span>")
            return

        self._cmd_worker = CommandExecuteWorker(self.bot, cmd)
        self._cmd_worker.finished.connect(self._on_command_finished)
        self._cmd_worker.start()

    @pyqtSlot(str, str)
    def _on_command_finished(self, cmd: str, result: str):
        ts = datetime.now().strftime("%H:%M:%S")
        formatted = result.replace("\n", "<br>")
        self.txt_terminal.append(f"<span style='color: #10B981;'>[{ts}] {formatted}</span>")
        sb = self.txt_terminal.verticalScrollBar()
        sb.setValue(sb.maximum())
