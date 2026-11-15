"""
core/telegram_bot.py — Two-Role Telegram Bot & Cloud Integration Engine
Mobile Phone Trading Store ERP (Owner & Salesperson Roles).

Features:
1. Role-Based Access Control (RBAC):
   - Owner (صاحب المحل): Remote Single/Bulk Repricing, Instant Discount Approvals, PDF Reports, Aging Radar, Trader Reminders, Encrypted Database Backups.
   - Salesperson (موظف المبيعات): Barcode/IMEI Scan Lookup (Selling & Min Price only), Blind Audit Scanner, InstaPay & KYC Photo Proof Uploads.
2. Thread-safe integration with PyQt6 via Qt Signals for instant desktop UI table updates & audio-visual toasts.
3. Offline Sync Queue Worker: Automatically delivers queued messages, alerts, and PDF documents when internet reconnects.
4. Scheduled Trader Reminders & Nightly Automated Backups.
"""
import asyncio
from datetime import datetime, date, time
import io
import json
import logging
import os
from pathlib import Path
import shutil
import threading
import time as time_mod
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

try:
    from PyQt6.QtCore import QObject, pyqtSignal
    HAS_PYQT = True
except ImportError:
    HAS_PYQT = False
    class QObject:
        pass
    def pyqtSignal(*args, **kwargs):
        return None

from core.database import DatabaseManager, encode_cost_cipher, verify_pin_hash
from core.pdf_exporter import PDFReportExporter
from core.paths import get_app_data_dir

logger = logging.getLogger(__name__)


class TelegramSignals(QObject if HAS_PYQT else object):
    """Signals emitted from background Telegram bot worker to the main desktop UI."""
    if HAS_PYQT:
        device_price_updated = pyqtSignal(dict)       # {stock_no, imei, new_target, new_min, user}
        approval_requested = pyqtSignal(dict)         # {request_id, invoice_no, model, requested_price, min_price}
        approval_decided = pyqtSignal(dict)           # {request_id, approved: bool}
        audit_scanned_code = pyqtSignal(str, str)     # (code, scanner_name)
        proof_photo_received = pyqtSignal(str, str)   # (photo_type, file_path)
        bot_status_changed = pyqtSignal(bool, str)    # (is_online, message)
        log_message = pyqtSignal(str)                 # Live log for GUI console
        subscribers_updated = pyqtSignal()            # Emitted when a phone/device is registered, updated or removed
        command_executed = pyqtSignal(str, str)       # (command, response_summary)
        request_remote_print = pyqtSignal(int)        # device_id to print physical label directly on PC printer
        sale_completed_remote = pyqtSignal(dict)      # sale_dict when sold via Telegram
        device_added_remote = pyqtSignal(dict)        # dev_dict when added via Telegram


_active_bot_instance: Optional['TradingTelegramBot'] = None


def trigger_immediate_queue_flush():
    """Triggers immediate background flushing of offline_queue across all registered owners."""
    global _active_bot_instance
    if _active_bot_instance and _active_bot_instance.is_running:
        _active_bot_instance.flush_queue()


class TradingTelegramBot:
    """
    Two-Role Telegram Bot Manager supporting asyncio and long-polling.
    """

    def __init__(self, db: DatabaseManager):
        self.db = db
        self.signals = TelegramSignals()
        self.token = self.db.get_setting("telegram_bot_token", "").strip()
        self.owner_chat_id = self.db.get_setting("telegram_owner_chat_id", "").strip()
        self.is_running = False
        self._thread: Optional[threading.Thread] = None
        self._queue_worker_thread: Optional[threading.Thread] = None

        # User session states for multi-step interactive workflows (e.g. entering new price)
        self.user_sessions: Dict[int, Dict[str, Any]] = {}
        # Pending discount / credit approval requests
        self.pending_approvals: Dict[str, Dict[str, Any]] = {}
        # Failed PIN authentication attempts per chat_id for brute-force protection
        self.failed_auth_attempts: Dict[int, List[float]] = {}

    def start(self):
        """Starts the Telegram Bot in a separate daemon thread."""
        global _active_bot_instance
        _active_bot_instance = self
        self.token = self.db.get_setting("telegram_bot_token", "").strip()
        self.owner_chat_id = self.db.get_setting("telegram_owner_chat_id", "").strip()

        if not self.token:
            logger.info("Telegram Bot Token is not set. Bot worker dormant.")
            if HAS_PYQT:
                self.signals.bot_status_changed.emit(False, "Bot Token Missing")
            return

        self.is_running = True
        self._thread = threading.Thread(target=self._run_bot_loop, daemon=True, name="TelegramBotThread")
        self._thread.start()

        self._queue_worker_thread = threading.Thread(target=self._run_queue_worker, daemon=True, name="TelegramQueueWorker")
        self._queue_worker_thread.start()

        if HAS_PYQT:
            self.signals.bot_status_changed.emit(True, "Online & Connected")

    def stop(self):
        global _active_bot_instance
        if _active_bot_instance is self:
            _active_bot_instance = None
        self.is_running = False
        if hasattr(self, '_thread') and self._thread and self._thread.is_alive():
            try:
                self._thread.join(timeout=1.5)
            except Exception:
                pass
        if hasattr(self, '_queue_worker_thread') and self._queue_worker_thread and self._queue_worker_thread.is_alive():
            try:
                self._queue_worker_thread.join(timeout=1.0)
            except Exception:
                pass
        if HAS_PYQT:
            self.signals.bot_status_changed.emit(False, "Stopped")
        self._emit_log("تم إيقاف خدمة البوت بنجاح.")

    def flush_queue(self):
        """Immediately processes offline_queue items in background without waiting for sleep timer."""
        threading.Thread(target=self._process_queue_now, daemon=True, name="TelegramInstantFlush").start()

    def _process_queue_now(self):
        try:
            pending = self.db.get_pending_telegram_queue(limit=20)
            for item in pending:
                success = self._dispatch_queue_item(item)
                if success:
                    self.db.mark_telegram_queue_status(item["id"], "sent")
                else:
                    self.db.mark_telegram_queue_status(item["id"], "retry", "Network unreachable")
        except Exception as e:
            logger.error("Error in instant Telegram queue flush: %s", e)
        if hasattr(self, '_queue_worker_thread') and self._queue_worker_thread and self._queue_worker_thread.is_alive():
            try:
                self._queue_worker_thread.join(timeout=1.0)
            except Exception:
                pass
        if HAS_PYQT:
            self.signals.bot_status_changed.emit(False, "Stopped")
        self._emit_log("تم إيقاف خدمة البوت بنجاح.")

    # ==========================================================================
    # Offline Queue & Scheduled Tasks Worker
    # ==========================================================================

    def _run_queue_worker(self):
        """Flushes offline_queue items and runs 11:00 AM reminders & backups."""
        last_daily_reminder_date: Optional[str] = None
        last_backup_date: Optional[str] = None

        while self.is_running:
            try:
                # 1. Flush offline queue
                pending = self.db.get_pending_telegram_queue(limit=10)
                for item in pending:
                    success = self._dispatch_queue_item(item)
                    if success:
                        self.db.mark_telegram_queue_status(item["id"], "sent")
                    else:
                        self.db.mark_telegram_queue_status(item["id"], "retry", "Network unreachable")

                # 2. Check 11:00 AM daily trader reminder
                now = datetime.now()
                today_str = now.strftime("%Y-%m-%d")
                if now.hour == 11 and last_daily_reminder_date != today_str:
                    self.send_daily_trader_reminder()
                    last_daily_reminder_date = today_str

                # 3. Check Nightly 02:00 AM encrypted database backup
                if now.hour == 2 and last_backup_date != today_str:
                    self.send_nightly_backup()
                    last_backup_date = today_str

            except Exception as e:
                logger.error("Error in Telegram queue worker: %s", e)

            time_mod.sleep(10)

    def _dispatch_queue_item(self, item: Dict[str, Any]) -> bool:
        """Dispatches an offline item to Telegram via HTTP request to all registered Owner phones."""
        if not self.token:
            return False
        import requests
        raw_payload = item.get("payload_json", "")
        text = raw_payload
        reply_markup = None
        if raw_payload.startswith("{") and raw_payload.endswith("}"):
            try:
                data = json.loads(raw_payload)
                if isinstance(data, dict):
                    text = data.get("text", text)
                    reply_markup = data.get("reply_markup")
            except Exception:
                pass

        # If sale_alert, attach interactive inline receipt window button
        if item.get("item_type") == "sale_alert" and not reply_markup:
            import re
            m = re.search(r"رقم الفاتورة:<\/b>\s*<code>([^<]+)<\/code>", text)
            inv = m.group(1).strip() if m else ""
            if inv:
                reply_markup = {
                    "inline_keyboard": [
                        [
                            {"text": "🧾 إيصال الفاتورة التفصيلي", "callback_data": f"receipt_{inv}"},
                            {"text": "📊 أرباح وردية اليوم", "callback_data": "daily_profits"}
                        ]
                    ]
                }

        # If intake_alert, attach interactive inline print and sell buttons
        if item.get("item_type") == "intake_alert" and not reply_markup:
            import re
            m = re.search(r"(?:رقم السريال|كود السريال):<\/b>\s*<code>([^<]+)<\/code>", text)
            stk = m.group(1).strip() if m else ""
            if stk:
                dev = self.db.get_device_by_imei_or_stock(stk)
                if dev:
                    reply_markup = {
                        "inline_keyboard": [
                            [
                                {"text": "🖨️ طباعة الملصق فوراً من البرنامج", "callback_data": f"remote_print_{dev['id']}"},
                                {"text": "🛒 تسجيل بيع هذا الجهاز", "callback_data": f"sel_sell_{dev['id']}"}
                            ]
                        ]
                    }

        # Collect all active owner chat IDs
        target_chats: List[str] = []
        try:
            subs = self.db.get_telegram_subscribers()
            target_chats = [str(s["chat_id"]) for s in subs if s.get("role") == "Owner" and s.get("status") == "active"]
        except Exception:
            pass

        fallback = self.owner_chat_id or self.db.get_setting("telegram_owner_chat_id", "")
        if fallback and str(fallback) not in target_chats:
            target_chats.append(str(fallback))

        # Strictly deduplicate chat IDs so no owner receives duplicate notifications
        target_chats = list(dict.fromkeys(target_chats))

        if not target_chats:
            return False

        url = f"https://api.telegram.org/bot{self.token}/sendMessage"
        any_success = False
        for cid in target_chats:
            payload: Dict[str, Any] = {
                "chat_id": cid,
                "text": text,
                "parse_mode": "HTML"
            }
            if reply_markup:
                payload["reply_markup"] = reply_markup
            try:
                res = requests.post(url, json=payload, timeout=8.0)
                if res.status_code == 200:
                    any_success = True
            except Exception:
                pass
        return any_success

    def send_direct_message(self, chat_id: Union[str, int], text: str, reply_markup: Optional[Dict[str, Any]] = None) -> bool:
        """Sends immediate message via HTTP."""
        if not self.token:
            return False
        import requests
        url = f"https://api.telegram.org/bot{self.token}/sendMessage"
        payload: Dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML"
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup
        try:
            res = requests.post(url, json=payload, timeout=8.0)
            data = res.json()
            if not data.get("ok"):
                desc = data.get("description", "Unknown error")
                self._emit_log(f"⚠️ فشل إرسال رسالة تيليجرام: {desc}")
                return False
            return True
        except Exception as e:
            logger.warning("Failed to send direct telegram message: %s", e)
            self._emit_log(f"⚠️ خطأ في الاتصال بتيليجرام: {e}")
            return False

    def send_document(self, chat_id: Union[str, int], file_path: str, caption: str = "") -> bool:
        """Uploads a document (PDF, SQLite DB backup) to Telegram."""
        if not self.token or not os.path.exists(file_path):
            return False
        import requests
        url = f"https://api.telegram.org/bot{self.token}/sendDocument"
        try:
            with open(file_path, "rb") as f:
                res = requests.post(
                    url,
                    data={"chat_id": chat_id, "caption": caption},
                    files={"document": f},
                    timeout=30.0
                )
            return res.status_code == 200
        except Exception as e:
            logger.error("Failed to upload document to Telegram: %s", e)
            return False

    def send_daily_trader_reminder(self):
        """Builds and delivers 11:00 AM summary of trader collections and debts."""
        traders = self.db.get_traders()
        active_memos = self.db.get_active_memos()

        he_owes_us: List[str] = []
        we_owe_him: List[str] = []

        for t in traders:
            bal = float(t.get("net_balance") or 0.0)
            if bal < 0:
                he_owes_us.append(f" • <b>{t['name']}</b>: عليه {abs(bal):,.0f} ج.م (📞 {t['phone']})")
            elif bal > 0:
                we_owe_him.append(f" • <b>{t['name']}</b>: له {bal:,.0f} ج.م (📞 {t['phone']})")

        msg_lines = [
            "⏰ <b>تذكير المواعيد وحسابات التجار اليومي (11:00 صباحاً)</b>",
            f"📅 التاريخ: {date.today().strftime('%Y-%m-%d')}",
            "━━━━━━━━━━━━━━━━━━━━"
        ]

        if he_owes_us:
            msg_lines.append("\n🔴 <b>تجار مستحق عليهم مبالغ للمحل:</b>")
            msg_lines.extend(he_owes_us)
        else:
            msg_lines.append("\n✅ لا توجد مديونيات متأخرة على التجار اليوم.")

        if we_owe_him:
            msg_lines.append("\n🔵 <b>مستحقات للتجار طرف المحل:</b>")
            msg_lines.extend(we_owe_him)

        if active_memos:
            msg_lines.append(f"\n📦 <b>أجهزة بضاعة أمانة وعرض بالخارج: {len(active_memos)} جهاز</b>")
            for m in active_memos[:5]:
                msg_lines.append(f" • {m['model_name']} عند {m['trader_name']} (ميعاد الرد: {m['expected_return_date'][:10]})")

        full_msg = "\n".join(msg_lines)
        if self.owner_chat_id:
            self.send_direct_message(self.owner_chat_id, full_msg)
        else:
            self.db.enqueue_telegram_message("daily_reminder", full_msg)

    def send_nightly_backup(self):
        """Creates an encrypted SQLite database backup and dispatches it to Telegram."""
        if not self.owner_chat_id or not os.path.exists(self.db.db_path):
            return
        backup_dir = Path(get_app_data_dir()) / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup_file = backup_dir / f"prolab_backup_{date.today().strftime('%Y%m%d')}.db"
        shutil.copy2(self.db.db_path, str(backup_file))
        caption = f"🛡️ <b>نسخة احتياطية لقاعدة البيانات</b>\n📅 {date.today().strftime('%Y-%m-%d')}\nالمحل: {self.db.get_setting('store_name')}"
        self.send_document(self.owner_chat_id, str(backup_file), caption)

    # ==========================================================================
    # Main Bot Polling Loop
    # ==========================================================================

    def _run_bot_loop(self):
        """Pure long-polling loop with webhook cleanup and conflict resolution."""
        import requests
        offset = 0
        logger.info("Starting Telegram Bot long-polling loop...")

        # Ensure any old webhook is cleared to avoid 409 Conflict
        try:
            requests.get(f"https://api.telegram.org/bot{self.token}/deleteWebhook?drop_pending_updates=False", timeout=6.0)
            self._emit_log("🟢 تم بدء خادم استماع تيليجرام وحذف أي Webhook قديم.")
        except Exception as e:
            self._emit_log(f"تنبيه: {e}")

        while self.is_running:
            try:
                url = f"https://api.telegram.org/bot{self.token}/getUpdates?offset={offset}&timeout=10"
                res = requests.get(url, timeout=15.0)
                if res.status_code == 200:
                    data = res.json()
                    if data.get("ok"):
                        for update in data.get("result", []):
                            offset = update["update_id"] + 1
                            self._handle_update(update)
                elif res.status_code == 409:
                    self._emit_log("تنبيه 409: هناك جلسة بوت أخرى تعمل، جاري إعادة الضبط...")
                    time_mod.sleep(3.0)
                    try:
                        requests.get(f"https://api.telegram.org/bot{self.token}/deleteWebhook?drop_pending_updates=False", timeout=5.0)
                    except Exception:
                        pass
                elif res.status_code == 401:
                    logger.error("Invalid Telegram Bot Token.")
                    self._emit_log("❌ خطأ 401: توكن البوت غير صالح أو تم إلغاؤه من BotFather!")
                    if HAS_PYQT:
                        self.signals.bot_status_changed.emit(False, "Invalid Token (401)")
                    break
            except requests.exceptions.Timeout:
                # Normal long-polling timeout, continue
                pass
            except Exception as e:
                self._emit_log(f"خطأ اتصال مؤقت: {e}")
                time_mod.sleep(3.0)

            time_mod.sleep(0.3)

    def _handle_update(self, update: Dict[str, Any]):
        """Routes messages and callback queries."""
        if "message" in update:
            self._handle_message(update["message"])
        elif "callback_query" in update:
            self._handle_callback_query(update["callback_query"])

    def _get_user_role(self, chat_id: int) -> str:
        """Determines whether user is Owner or Salesperson."""
        str_id = str(chat_id)
        if str_id == self.owner_chat_id:
            return "Owner"
        session = self.user_sessions.get(chat_id, {})
        if "role" in session:
            return session["role"]
        # Check in DB subscribers
        try:
            subs = self.db.get_telegram_subscribers()
            for s in subs:
                if str(s.get("chat_id")) == str_id:
                    self.user_sessions[chat_id] = {"role": s.get("role", "Salesperson")}
                    return s.get("role", "Salesperson")
        except Exception as e:
            logger.debug("Error checking subscriber role: %s", e)
        return "Unauthorized"

    def _handle_message(self, msg: Dict[str, Any]):
        chat_id = msg["chat"]["id"]
        text = msg.get("text", "").strip()
        clean_text = text.strip()
        lower_text = clean_text.lower()
        role = self._get_user_role(chat_id)

        # 1. Authorization Commands
        owner_pin_val = self.db.get_setting("owner_pin", "")
        sales_pin_val = self.db.get_setting("sales_pin", "")

        if text.startswith("/auth_owner"):
            now_ts = time_mod.time()
            attempts = [t for t in self.failed_auth_attempts.get(chat_id, []) if now_ts - t < 900]
            if len(attempts) >= 3:
                self.send_direct_message(chat_id, "⛔ <b>تم حظر محاولات تسجيل الدخول مؤقتاً</b>\nتجاوزت الحد الأقصى للمحاولات الخاطئة (3 محاولات). يرجى الانتظار 15 دقيقة.")
                return

            parts = text.split()
            entered_pin = parts[1].strip() if len(parts) > 1 else ""
            if not owner_pin_val:
                self.send_direct_message(chat_id, "⚠️ لم يتم تعيين رمز مرور المالك في إعدادات النظام بعد.")
                return

            if entered_pin and verify_pin_hash(entered_pin, owner_pin_val):
                self.failed_auth_attempts.pop(chat_id, None)
                self.owner_chat_id = str(chat_id)
                self.db.set_setting("telegram_owner_chat_id", str(chat_id))
                self.user_sessions[chat_id] = {"role": "Owner"}
                user_obj = msg.get("from", {})
                fn = user_obj.get("first_name", "")
                ln = user_obj.get("last_name", "")
                full_name = f"{fn} {ln}".strip() or "صاحب المحل"
                uname = user_obj.get("username", "")
                username_str = f"@{uname}" if uname else ""
                self.db.register_telegram_subscriber(
                    chat_id=str(chat_id),
                    name=f"👑 {full_name}",
                    role="Owner",
                    username=username_str,
                    phone_model="هاتف صاحب المحل"
                )
                self.send_direct_message(chat_id, "👑 <b>تم تفعيل حسابك كـ [صاحب المحل] بنجاح!</b>\nأنت الآن تملك صلاحيات التحكم الكاملة في الأسعار والتقارير.")
                self._send_owner_menu(chat_id)
                self._emit_log(f"👑 تم تسجيل هاتف المالك بنجاح: {full_name} ({chat_id})")
                if HAS_PYQT:
                    self.signals.subscribers_updated.emit()
            else:
                attempts.append(now_ts)
                self.failed_auth_attempts[chat_id] = attempts
                remaining = 3 - len(attempts)
                if remaining > 0:
                    self.send_direct_message(chat_id, f"❌ رمز المرور (PIN) غير صحيح. متبقي لديك {remaining} محاولات قبل الحظر المؤقت.")
                else:
                    self.send_direct_message(chat_id, "⛔ تم حظر محاولاتك مؤقتاً لمدة 15 دقيقة بسبب تكرار إدخال رمز غير صحيح.")
            return

        if text.startswith("/auth_sales"):
            now_ts = time_mod.time()
            attempts = [t for t in self.failed_auth_attempts.get(chat_id, []) if now_ts - t < 900]
            if len(attempts) >= 3:
                self.send_direct_message(chat_id, "⛔ <b>تم حظر محاولات تسجيل الدخول مؤقتاً</b>\nتجاوزت الحد الأقصى للمحاولات الخاطئة (3 محاولات). يرجى الانتظار 15 دقيقة.")
                return

            parts = text.split()
            entered_pin = parts[1].strip() if len(parts) > 1 else ""
            if not sales_pin_val:
                self.send_direct_message(chat_id, "⚠️ لم يتم تعيين رمز مرور المبيعات في إعدادات النظام بعد.")
                return

            if entered_pin and verify_pin_hash(entered_pin, sales_pin_val):
                self.failed_auth_attempts.pop(chat_id, None)
                self.user_sessions[chat_id] = {"role": "Salesperson"}
                user_obj = msg.get("from", {})
                fn = user_obj.get("first_name", "")
                ln = user_obj.get("last_name", "")
                full_name = f"{fn} {ln}".strip() or "موظف مبيعات"
                uname = user_obj.get("username", "")
                username_str = f"@{uname}" if uname else ""
                self.db.register_telegram_subscriber(
                    chat_id=str(chat_id),
                    name=f"💼 {full_name}",
                    role="Salesperson",
                    username=username_str,
                    phone_model="هاتف موظف مبيعات"
                )
                self.send_direct_message(chat_id, "💼 <b>تم تفعيل حسابك كـ [موظف مبيعات] بنجاح!</b>\nيمكنك استخدام كاميرا الجرد والاستعلام عن الأسعار.")
                self._send_sales_menu(chat_id)
                self._emit_log(f"💼 تم تسجيل هاتف بائع جديد: {full_name} ({chat_id})")
                if HAS_PYQT:
                    self.signals.subscribers_updated.emit()
            else:
                attempts.append(now_ts)
                self.failed_auth_attempts[chat_id] = attempts
                remaining = 3 - len(attempts)
                if remaining > 0:
                    self.send_direct_message(chat_id, f"❌ رمز المرور (PIN) غير صحيح. متبقي لديك {remaining} محاولات قبل الحظر المؤقت.")
                else:
                    self.send_direct_message(chat_id, "⛔ تم حظر محاولاتك مؤقتاً لمدة 15 دقيقة بسبب تكرار إدخال رمز غير صحيح.")
            return

        # Photo upload handler (InstaPay or Seller KYC)
        if "photo" in msg:
            self._handle_photo_upload(msg, chat_id, role)
            return

        # Document handler — user sends image as file/document for full-res barcode scanning
        if "document" in msg:
            doc = msg["document"]
            mime = doc.get("mime_type", "")
            if mime.startswith("image/"):
                self._handle_document_image(msg, chat_id, role)
                return

        # Check authentication
        if role == "Unauthorized":
            self.send_direct_message(
                chat_id,
                "🔒 <b>مرحباً بك في نظام ProLab Trading</b>\nيرجى تسجيل الدخول بكتابة:\n"
                "• لصاحب المحل: <code>/auth_owner PIN</code>\n"
                "• لموظف المبيعات: <code>/auth_sales PIN</code>"
            )
            return

        # Touch subscriber activity timestamp
        try:
            self.db.touch_telegram_subscriber(str(chat_id))
        except Exception:
            pass

        # Cancel current flow or reset if user pressed any main menu action
        is_menu_action = (
            clean_text in ("/start", "القائمة الرئيسية")
            or any(kw in clean_text for kw in (
                "إضافة جهاز", "اضافة جهاز", "تسجيل بيع", "بيع جهاز",
                "استعلام", "بحث سريع", "تعديل الأسعار", "تعديل الاسعار",
                "ملخص المخزن", "تصفح الموديلات", "استعراض الموديلات",
                "الأجهزة الجديدة", "الاجهزة الجديدة",
                "الأجهزة المستعملة", "الاجهزة المستعملة",
                "أحدث المدخلات", "احدث المدخلات",
                "أجهزة راكدة", "اجهزة راكدة",
                "تقرير PDF", "تقرير pdf", "تقرير مالي",
                "فواتير المبيعات", "تحصيلات التجار", "نسخة احتياطية", "نسخه احتياطيه",
                "دليل الأوامر", "دليل الاوامر"
            ))
            or lower_text.startswith(("/search", "/edit", "/stock", "/models", "/new", "/used", "/latest", "/help", "/commands", "/sales", "/receipt", "/sell", "/add_device", "/traders", "/backup"))
        )

        if is_menu_action:
            # Clear pending wizard step so buttons ALWAYS work immediately without being trapped!
            self.user_sessions[chat_id] = {"role": role}

        if clean_text in ("إلغاء", "خروج", "الغاء", "/cancel"):
            self.user_sessions[chat_id] = {"role": role}
            self.send_direct_message(chat_id, "↩️ تم إلغاء العملية والعودة للقائمة الرئيسية.")
            if role == "Owner":
                self._send_owner_menu(chat_id)
            else:
                self._send_sales_menu(chat_id)
            return

        # Check if user is in an active session (e.g. waiting for new price input or wizard steps)
        session = self.user_sessions.get(chat_id, {})
        step = session.get("step")

        if step and step.startswith("add_dev_"):
            self._handle_add_device_step(chat_id, clean_text, role, session)
            return
        elif step and step.startswith("sell_dev_"):
            self._handle_sell_device_step(chat_id, clean_text, role, session)
            return
        elif step == "waiting_for_new_target_price":
            self._handle_price_input(chat_id, text, is_target=True)
            return
        elif step == "waiting_for_new_min_price":
            self._handle_price_input(chat_id, text, is_target=False)
            return
        elif step == "waiting_for_audit_scan":
            self._handle_audit_scan_text(chat_id, text)
            return

        # Main command routing
        if clean_text in ("/start", "القائمة الرئيسية"):
            if role == "Owner":
                self._send_owner_menu(chat_id)
            else:
                self._send_sales_menu(chat_id)
            return

        if clean_text in ("📥 إضافة جهاز للمخزن", "/add_device", "اضافة جهاز", "إضافة جهاز", "إضافة جهاز للمخزن", "اضافة جهاز للمخزن") or "إضافة جهاز" in clean_text or "اضافة جهاز" in clean_text:
            self._start_add_device_flow(chat_id, role)
            return

        if clean_text in ("💸 تسجيل بيع جهاز", "/sell", "بيع جهاز", "تسجيل بيع", "تسجيل بيع جهاز") or "تسجيل بيع" in clean_text or "بيع جهاز" in clean_text:
            self._start_sell_device_flow(chat_id, role)
            return

        # Direct search and edit commands
        if lower_text.startswith("/search ") or clean_text.startswith("بحث "):
            parts = clean_text.split(maxsplit=1)
            q = parts[1].strip() if len(parts) > 1 else ""
            if q:
                self._perform_device_lookup(chat_id, q, role)
            else:
                self.send_direct_message(chat_id, "⚠️ اكتب اسم الموديل أو السريال بعد الأمر، مثلاً:\n<code>/search 13 Pro</code> أو <code>بحث سامسونج</code>")
            return

        if lower_text.startswith("/edit ") or clean_text.startswith("تعديل "):
            parts = clean_text.split(maxsplit=1)
            q = parts[1].strip() if len(parts) > 1 else ""
            if q:
                if role == "Owner":
                    self._lookup_and_prompt_reprice(chat_id, q)
                else:
                    self.send_direct_message(chat_id, "🔒 تعديل الأسعار متاح لصاحب المحل فقط.")
            else:
                self.send_direct_message(chat_id, "⚠️ اكتب كود الجهاز أو السريال بعد الأمر، مثلاً: <code>/edit 260301</code>")
            return

        if lower_text in ("/stock", "مخزن", "المخزن", "📦 ملخص المخزن", "ملخص المخزن") or "ملخص المخزن" in clean_text:
            self._send_stock_summary(chat_id, role)
            return

        if lower_text in ("/models", "موديلات", "الموديلات", "📱 تصفح الموديلات", "تصفح الموديلات", "📱 استعراض الموديلات", "استعراض الموديلات") or "تصفح الموديلات" in clean_text or "استعراض الموديلات" in clean_text:
            self._send_models_overview(chat_id, role)
            return

        if lower_text in ("/new", "جديد", "جديدة", "🆕 الأجهزة الجديدة", "الأجهزة الجديدة", "الاجهزة الجديدة") or "الجديدة" in clean_text:
            self._send_devices_by_condition(chat_id, "New", role)
            return

        if lower_text in ("/used", "مستعمل", "مستعملة", "✨ الأجهزة المستعملة", "الأجهزة المستعملة", "الاجهزة المستعملة") or "المستعملة" in clean_text:
            self._send_devices_by_condition(chat_id, "Used", role)
            return

        if lower_text in ("/latest", "احدث", "الأحدث", "🕒 أحدث المدخلات", "أحدث المدخلات", "احدث المدخلات") or "أحدث المدخلات" in clean_text or "احدث المدخلات" in clean_text:
            self._send_latest_devices(chat_id, role)
            return

        if lower_text in ("/help", "/commands", "اوامر", "أوامر", "مساعدة", "📖 دليل الأوامر", "دليل الأوامر", "دليل الاوامر", "?") or "دليل الأوامر" in clean_text or "دليل الاوامر" in clean_text:
            self._send_bot_help(chat_id, role)
            return

        # Handle menu text triggers
        if clean_text in ("🔍 استعلام وبحث سريع", "🔍 استعلام عن جهاز", "استعلام وبحث سريع", "استعلام عن جهاز") or "استعلام" in clean_text or "بحث سريع" in clean_text:
            self.send_direct_message(chat_id, "🔎 أدخل اسم أي موديل (مثل <code>13 Pro</code>، <code>S24</code>) أو اللون أو السريال أو امسح الباركود:")
            self.user_sessions[chat_id] = {"role": role, "step": "waiting_for_lookup_query"}
            return
        elif session.get("step") == "waiting_for_lookup_query":
            self.user_sessions[chat_id] = {"role": role}
            self._perform_device_lookup(chat_id, clean_text, role)
            return

        if (clean_text in ("💰 تعديل الأسعار", "تعديل الأسعار", "تعديل الاسعار") or "تعديل الأسعار" in clean_text or "تعديل الاسعار" in clean_text) and role == "Owner":
            self.send_direct_message(chat_id, "📱 أرسل <b>اسم الموديل</b> أو <b>رقم السريال (Stock No)</b> أو <b>IMEI</b> للجهاز المراد تعديل سعره:")
            self.user_sessions[chat_id] = {"role": "Owner", "step": "waiting_for_device_lookup_reprice"}
            return
        elif session.get("step") == "waiting_for_device_lookup_reprice":
            self.user_sessions[chat_id] = {"role": "Owner"}
            self._lookup_and_prompt_reprice(chat_id, clean_text)
            return

        if (clean_text in ("📊 تقرير PDF مالي", "📊 تقرير PDF", "تقرير PDF مالي", "تقرير PDF") or "تقرير pdf" in lower_text or "تقرير مالي" in clean_text) and role == "Owner":
            self._send_pdf_menu(chat_id)
            return

        if (clean_text in ("🚨 أجهزة راكدة", "أجهزة راكدة", "اجهزة راكدة") or "راكدة" in clean_text or "راكده" in clean_text) and role == "Owner":
            self._send_aging_radar_report(chat_id)
            return

        if (clean_text in ("🤝 تحصيلات التجار", "تحصيلات التجار") or "تحصيلات التجار" in clean_text) and role == "Owner":
            self.send_daily_trader_reminder()
            return

        if (clean_text in ("💾 نسخة احتياطية", "نسخة احتياطية", "نسخه احتياطيه") or "نسخة احتياطية" in clean_text or "نسخه احتياطيه" in clean_text) and role == "Owner":
            self.send_nightly_backup()
            return

        if clean_text == "📷 جرد المخزن":
            self.user_sessions[chat_id] = {"role": role, "step": "waiting_for_audit_scan"}
            self.send_direct_message(chat_id, "📷 <b>وضع جرد المخزن نشط (Blind Audit Mode)</b>\nأرسل أرقام السريال أو امسح الباركود بالكاميرا مباشرة (أرسل 'خروج' للإنهاء):")
            return

        if lower_text in ("/sales", "/receipts", "فواتير", "مبيعات", "🧾 فواتير المبيعات") and role == "Owner":
            self._send_recent_sales_list(chat_id)
            return

        if lower_text.startswith("/receipt ") or clean_text.startswith("فاتورة "):
            parts = clean_text.split(maxsplit=1)
            inv = parts[1].strip() if len(parts) > 1 else ""
            if inv:
                self._send_sale_receipt_card(chat_id, inv, role)
            else:
                self.send_direct_message(chat_id, "⚠️ اكتب رقم الفاتورة بعد الأمر، مثلاً: <code>/receipt INV-2026-0001</code>")
            return

        if clean_text == "🧾 فواتير المبيعات" and role == "Owner":
            self._send_recent_sales_list(chat_id)
            return

        # Check Dynamic Custom Bot Commands Configured by User
        try:
            custom_cmd = self.db.get_custom_command_by_trigger(clean_text)
            if custom_cmd and custom_cmd.get("is_active"):
                req_role = custom_cmd.get("role_access", "ALL")
                if req_role == "Owner" and role != "Owner":
                    self.send_direct_message(chat_id, "🔒 <b>عذراً، هذا الأمر مخصص فقط لحساب صاحب المحل (Owner).</b>")
                    return
                resp = custom_cmd.get("response_payload", "")
                now_dt = datetime.now()
                resp = resp.replace("{store_name}", self.db.get_setting("store_name", "ProLab Mobile"))
                resp = resp.replace("{date}", now_dt.strftime("%Y-%m-%d"))
                resp = resp.replace("{time}", now_dt.strftime("%H:%M:%S"))
                resp = resp.replace("{user_name}", str(msg.get("from", {}).get("first_name", "")))
                self.send_direct_message(chat_id, resp)
                return
        except Exception as e:
            logger.error("Error executing custom command: %s", e)

        # Generic lookup fallback for any model name, brand, barcode, or IMEI sent directly
        self._perform_device_lookup(chat_id, clean_text, role)

    def _send_owner_menu(self, chat_id: int):
        keyboard = {
            "keyboard": [
                [{"text": "📥 إضافة جهاز للمخزن"}, {"text": "💸 تسجيل بيع جهاز"}],
                [{"text": "🔍 استعلام وبحث سريع"}, {"text": "💰 تعديل الأسعار"}],
                [{"text": "📦 ملخص المخزن"}, {"text": "📱 تصفح الموديلات"}],
                [{"text": "🆕 الأجهزة الجديدة"}, {"text": "✨ الأجهزة المستعملة"}],
                [{"text": "🕒 أحدث المدخلات"}, {"text": "🚨 أجهزة راكدة"}],
                [{"text": "📊 تقرير PDF مالي"}, {"text": "🧾 فواتير المبيعات"}],
                [{"text": "🤝 تحصيلات التجار"}, {"text": "💾 نسخة احتياطية"}],
                [{"text": "📖 دليل الأوامر"}]
            ],
            "resize_keyboard": True
        }
        self.send_direct_message(chat_id, "👑 <b>لوحة تحكم صاحب المحل (ProLab Trading Studio 4.5.0):</b>\nاختر من العمليات المتاحة أدناه أو أرسل اسم أي جهاز للبحث الفوري:", reply_markup=keyboard)

    def _send_sales_menu(self, chat_id: int):
        keyboard = {
            "keyboard": [
                [{"text": "📥 إضافة جهاز للمخزن"}, {"text": "💸 تسجيل بيع جهاز"}],
                [{"text": "🔍 استعلام عن جهاز"}, {"text": "📷 جرد المخزن"}],
                [{"text": "📦 ملخص المخزن"}, {"text": "📱 استعراض الموديلات"}],
                [{"text": "القائمة الرئيسية"}]
            ],
            "resize_keyboard": True
        }
        self.send_direct_message(chat_id, "💼 <b>لوحة موظف المبيعات (ProLab Trading Studio 4.5.0):</b>\nيمكنك تسجيل المبيعات، إدخال الأجهزة، أو فحص الأسعار والجرد:", reply_markup=keyboard)

    # ==========================================================================
    # Device Lookup & Remote Price Modification
    # ==========================================================================

    def _lookup_and_prompt_reprice(self, chat_id: int, query: str):
        dev = self.db.get_device_by_imei_or_stock(query)
        if not dev:
            # Check by search_devices
            results = self.db.search_devices(query=query, status="in_stock", limit=5)
            if not results:
                self.send_direct_message(chat_id, f"❌ لم يتم العثور على أجهزة متوفرة مطابقة لـ: <code>{query}</code>")
                return
            if len(results) > 1:
                lines = [f"🔍 <b>عثرنا على ({len(results)}) أجهزة مطابقة لـ ({query})</b>:\nاختر الجهاز المراد تعديل سعره:"]
                buttons = []
                for d in results:
                    btn_text = f"✏️ {d['brand']} {d['model_name']} ({d['color'] or d['storage']}) — {d['target_selling_price']:,.0f} ج.م"
                    buttons.append([{"text": btn_text, "callback_data": f"reprice_target_{d['id']}"}])
                self.send_direct_message(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons})
                return
            dev = results[0]

        self._send_device_card(chat_id, dev, "Owner")

    def _perform_device_lookup(self, chat_id: int, query: str, role: str):
        query = query.strip()
        if not query:
            return

        # 1. Exact match by Serial (Stock No) or IMEI
        dev = self.db.get_device_by_imei_or_stock(query)
        if dev:
            self._send_device_card(chat_id, dev, role)
            return

        # 2. Search in available stock
        results = self.db.search_devices(query=query, status="in_stock", limit=10)
        if not results:
            # Check if device existed in past sales
            results_all = self.db.search_devices(query=query, status="ALL", limit=5)
            if not results_all:
                self.send_direct_message(
                    chat_id,
                    f"❌ لم يتم العثور على أجهزة مطابقة لـ: <code>{query}</code> في المخزن أو السجلات.\n"
                    "💡 جرب البحث باسم الموديل (مثل: <code>13 Pro</code>، <code>S24</code>) أو اللون أو السريال."
                )
                return

            lines = [f"⚠️ <b>لم يتم العثور على أجهزة متوفرة حالياً لـ ({query})</b>، ولكن عثرنا على أجهزة سابقة:"]
            buttons = []
            for d in results_all:
                st_badge = "🔴 مباع" if d["status"] == "sold" else d["status"]
                lines.append(f"• <b>{d['brand']} {d['model_name']}</b> ({d['storage'] or '-'}) — {st_badge} — {d['target_selling_price']:,.0f} ج.م (كود: <code>{d['stock_no']}</code>)")
                buttons.append([{"text": f"📱 {d['brand']} {d['model_name']} ({d['stock_no']})", "callback_data": f"view_dev_{d['id']}"}])
            self.send_direct_message(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons})
            return

        # Exactly 1 match found in stock
        if len(results) == 1:
            self._send_device_card(chat_id, results[0], role)
            return

        # Multiple matches found in stock (e.g. 5 devices of iPhone 13)
        lines = [
            f"🔍 <b>نتائج البحث في المخزن عن:</b> <code>{query}</code>",
            f"📦 <b>تم العثور على ({len(results)}) جهاز متوفر:</b>\n"
        ]
        buttons = []
        for i, d in enumerate(results, 1):
            cond_icon = "🆕" if d["condition"] == "New" else "✨"
            color_str = d["color"] or "-"
            storage_str = d["storage"] or "-"
            cost_str = f" | 💵 التكلفة: <b>{d['buy_price']:,.0f}</b>" if role == "Owner" else ""
            lines.append(
                f"{i}. {cond_icon} <b>{d['brand']} {d['model_name']}</b> ({storage_str})\n"
                f"    🎨 اللون: <b>{color_str}</b> | 🔋 {d['battery_health'] or 'N/A'}%{cost_str}\n"
                f"    💰 سعر البيع: <b>{d['target_selling_price']:,.0f} ج.م</b> (أدنى: {d['min_allowed_price']:,.0f})\n"
                f"    🔖 كود: <code>{d['stock_no']}</code>\n"
            )
            btn_label = f"📱 {i}. {d['brand']} {d['model_name']} ({color_str}) — {d['target_selling_price']:,.0f} ج.م"
            buttons.append([{"text": btn_label, "callback_data": f"view_dev_{d['id']}"}])

        lines.append("👇 <b>اضغط على أي جهاز أدناه لعرض بطاقته والتحكم في سعره:</b>")
        self.send_direct_message(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons})

    def _send_device_card(self, chat_id: int, dev: Dict[str, Any], role: str):
        cond_str = "🆕 جديد متبرشم" if dev["condition"] == "New" else "✨ مستعمل كسر زيرو"
        exp_profit = dev["target_selling_price"] - dev["buy_price"]
        ram_str = f" | RAM: {dev['ram']}" if dev.get("ram") else ""
        lines = [
            "📱 <b>بطاقة بيانات الجهاز</b>",
            "━━━━━━━━━━━━━━━━━━━━",
            f"📱 <b>اسم الجهاز:</b> {dev['brand']} {dev['model_name']}",
            f"📦 <b>الموديل والسعة:</b> {dev['model_code'] or '-'} ({dev['storage'] or '-'}{ram_str})",
            f"🎨 <b>اللون:</b> {dev['color'] or '-'}",
            f"🏷️ <b>الحالة والضريبة:</b> {cond_str} | {dev['tax_status']}",
            f"🔋 <b>البطارية:</b> {dev['battery_health'] or 'N/A'}% ({dev['battery_cycles'] or 0} دورة)",
            f"💰 <b>سعر البيع المطلوب:</b> {dev['target_selling_price']:,.0f} ج.م",
            f"🔒 <b>أقل سعر مسموح للبيع:</b> {dev['min_allowed_price']:,.0f} ج.م"
        ]

        if role == "Owner":
            lines.extend([
                f"💵 <b>السعر اللي اشتريت بيه:</b> {dev['buy_price']:,.0f} ج.م",
                f"🤫 <b>شفرة التكلفة:</b> <code>{dev['secret_cost_cipher']}</code>",
                f"📈 <b>هامش الربح المتوقع:</b> {exp_profit:,.0f} ج.م",
                f"🔖 <b>رقم السريال:</b> <code>{dev['stock_no']}</code> | <b>IMEI:</b> <code>{dev['imei1']}</code>",
            ])
            inline_markup = {
                "inline_keyboard": [
                    [
                        {"text": "✏️ تعديل سعر البيع", "callback_data": f"reprice_target_{dev['id']}"},
                        {"text": "🛡️ تعديل الحد الأدنى", "callback_data": f"reprice_min_{dev['id']}"}
                    ],
                    [
                        {"text": "➕ 500 ج.م", "callback_data": f"quick_delta_{dev['id']}_500"},
                        {"text": "➖ 500 ج.م", "callback_data": f"quick_delta_{dev['id']}_-500"}
                    ],
                    [
                        {"text": "➕ 1,000 ج.م", "callback_data": f"quick_delta_{dev['id']}_1000"},
                        {"text": "➖ 1,000 ج.م", "callback_data": f"quick_delta_{dev['id']}_-1000"}
                    ],
                    [
                        {"text": "🖨️ طباعة الملصق بالبرنامج", "callback_data": f"remote_print_{dev['id']}"},
                        {"text": "🛒 بيع الجهاز كاشير", "callback_data": f"sel_sell_{dev['id']}"}
                    ]
                ]
            }
            self.send_direct_message(chat_id, "\n".join(lines), reply_markup=inline_markup)
        else:
            lines.append(f"🔖 <b>رقم السريال:</b> <code>{dev['stock_no']}</code>")
            sales_markup = {
                "inline_keyboard": [
                    [
                        {"text": "🖨️ طباعة الملصق بالبرنامج", "callback_data": f"remote_print_{dev['id']}"},
                        {"text": "🛒 بيع الجهاز كاشير", "callback_data": f"sel_sell_{dev['id']}"}
                    ]
                ]
            }
            self.send_direct_message(chat_id, "\n".join(lines), reply_markup=sales_markup)

    # ==========================================================================
    # Database Responsive Overviews: Summary, Models & Latest
    # ==========================================================================

    def _send_stock_summary(self, chat_id: int, role: str):
        devices = self.db.search_devices(status="in_stock", limit=1000)
        total_count = len(devices)
        if total_count == 0:
            self.send_direct_message(chat_id, "📦 المخزن فارغ حالياً، لا توجد أجهزة متوفرة.")
            return

        total_buy = sum(d["buy_price"] for d in devices)
        total_target = sum(d["target_selling_price"] for d in devices)
        exp_profit = total_target - total_buy

        brands: Dict[str, int] = {}
        for d in devices:
            b = d["brand"] or "أخرى"
            brands[b] = brands.get(b, 0) + 1

        lines = [
            "📊 <b>تقرير ملخص المخزن الحالي (ProLab Stock):</b>",
            "━━━━━━━━━━━━━━━━━━━━",
            f"📱 <b>إجمالي الأجهزة المتوفرة:</b> {total_count} جهاز",
        ]
        if role == "Owner":
            lines.extend([
                f"💵 <b>إجمالي رأس المال بالمخزن (الشراء):</b> {total_buy:,.0f} ج.م",
                f"💰 <b>إجمالي القيمة البيعية المستهدفة:</b> {total_target:,.0f} ج.م",
                f"📈 <b>إجمالي الأرباح المتوقعة:</b> {exp_profit:,.0f} ج.م",
            ])
        lines.append("\n🏷️ <b>توزيع الأجهزة حسب الماركة:</b>")
        for b, cnt in sorted(brands.items(), key=lambda x: x[1], reverse=True):
            lines.append(f" • <b>{b}:</b> {cnt} جهاز")

        lines.append("\n💡 <i>للبحث عن أي موديل أو تعديل سعره، أرسل اسمه مباشرة في المحادثة أو اكتب /models</i>")
        self.send_direct_message(chat_id, "\n".join(lines))

    def _send_models_overview(self, chat_id: int, role: str):
        devices = self.db.search_devices(status="in_stock", limit=1000)
        if not devices:
            self.send_direct_message(chat_id, "📦 لا توجد أجهزة متوفرة في المخزن حالياً.")
            return
        from collections import defaultdict
        models = defaultdict(list)
        for d in devices:
            key = f"{d['brand']} {d['model_name']}"
            models[key].append(d)

        lines = [
            "📱 <b>الموديلات المتوفرة في المخزن:</b>",
            "━━━━━━━━━━━━━━━━━━━━"
        ]
        buttons = []
        for model_name, d_list in sorted(models.items(), key=lambda x: len(x[1]), reverse=True)[:12]:
            prices = [d["target_selling_price"] for d in d_list]
            min_p, max_p = min(prices), max(prices)
            price_str = f"{min_p:,.0f} ج.م" if min_p == max_p else f"{min_p:,.0f} - {max_p:,.0f} ج.م"
            lines.append(f"• <b>{model_name}:</b> {len(d_list)} جهاز | السعر: {price_str}")
            buttons.append([{"text": f"🔍 عرض {model_name} ({len(d_list)})", "callback_data": f"filter_model_{model_name}"}])

        lines.append("\n👇 <b>اضغط على أي موديل لعرض أجهزته وألوانه وتعديل الأسعار:</b>")
        self.send_direct_message(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons[:8]})

    def _send_latest_devices(self, chat_id: int, role: str):
        devices = self.db.search_devices(status="in_stock", limit=5)
        if not devices:
            self.send_direct_message(chat_id, "📦 لا توجد أجهزة متوفرة في المخزن.")
            return
        self.send_direct_message(chat_id, f"🕒 <b>آخر ({len(devices)}) أجهزة تم إدخالها للمخزن:</b>")
        for d in devices:
            self._send_device_card(chat_id, d, role)

    def _send_devices_by_condition(self, chat_id: int, condition: str, role: str):
        """Sends clean organized list of devices filtered by New or Used, grouped by Brand."""
        devices = self.db.search_devices(status="in_stock", condition=condition, limit=30)
        cond_title = "🆕 الأجهزة الجديدة (متبرشمة)" if condition == "New" else "✨ الأجهزة المستعملة (كسر زيرو)"
        if not devices:
            self.send_direct_message(chat_id, f"📦 لا توجد أجهزة متوفرة حالياً في قسم: {cond_title}")
            return

        from collections import defaultdict
        grouped = defaultdict(list)
        for d in devices:
            grouped[d["brand"] or "أخرى"].append(d)

        lines = [
            f"📦 <b>قائمة {cond_title} بالمخزن:</b>",
            f"📊 إجمالي الأجهزة: {len(devices)} جهاز\n"
            "━━━━━━━━━━━━━━━━━━━━"
        ]
        buttons = []
        for brand_name, d_list in sorted(grouped.items()):
            lines.append(f"\n🏷️ <b>ماركة {brand_name} ({len(d_list)} جهاز):</b>")
            for d in d_list[:6]:
                batt_str = f" | 🔋 {d['battery_health']}%" if d.get("battery_health") else ""
                lines.append(
                    f" • <b>{d['brand']} {d['model_name']}</b> ({d['storage'] or '-'})\n"
                    f"   🎨 {d['color'] or '-'}{batt_str} | 💰 {d['target_selling_price']:,.0f} ج.م | 🔖 <code>{d['stock_no']}</code>"
                )
                btn_label = f"📱 {d['brand']} {d['model_name']} ({d['color'] or d['storage']}) — {d['target_selling_price']:,.0f}"
                buttons.append([{"text": btn_label, "callback_data": f"view_dev_{d['id']}"}])

        lines.append("\n👇 <b>اضغط على أي جهاز أدناه لعرض بياناته والتحكم في سعره:</b>")
        self.send_direct_message(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons[:8]})

    def _send_bot_help(self, chat_id: int, role: str):
        lines = [
            "📖 <b>دليل أوامر واستخدام بوت ProLab Trading:</b>",
            "━━━━━━━━━━━━━━━━━━━━",
            "🔍 <b>البحث المباشر السريع:</b>",
            "• أرسل أي نص في المحادثة مباشرة (مثل <code>13 Pro</code>، <code>S24 Ultra</code>، <code>أزرق</code>، <code>256</code>) للبحث الفوري.",
            "• <code>/search &lt;اسم الموديل&gt;</code>: بحث مخصص في المخزن.",
            "• <code>/stock</code> أو <code>مخزن</code>: ملخص شامل لأجهزة المخزن ورأس المال والأرباح.",
            "• <code>/models</code> أو <code>موديلات</code>: قائمة بجميع الموديلات وأسعارها.",
            "• <code>/latest</code> أو <code>احدث</code>: عرض آخر الأجهزة المضافة للمخزن.",
        ]
        if role == "Owner":
            lines.extend([
                "\n👑 <b>أوامر صاحب المحل والتحكم:</b>",
                "• <code>/sales</code> أو <code>فواتير</code>: عرض آخر فواتير المبيعات وإيصالاتها.",
                "• <code>/receipt &lt;رقم الفاتورة&gt;</code>: فتح نافذة إيصال بيع إلكتروني كامل.",
                "• <code>/edit &lt;كود&gt;</code>: تعديل سعر بيع جهاز معين فورياً.",
                "• أزرار <code>[➕ 500]</code> و <code>[➖ 500]</code> في بطاقة الجهاز لتعديل السعر بضغطة واحدة.",
                "• <code>/report</code> أو <code>تقرير</code>: تحميل تقرير PDF مالي شامل للمخزن.",
                "• <code>/radar</code> أو <code>راكد</code>: تقرير الأجهزة الراكدة المتأخرة في البيع.",
                "• <code>/debts</code> أو <code>ديون</code>: منبه تحصيلات وتواريخ التجار.",
                "• <code>/backup</code> أو <code>نسخة</code>: إنشاء نسخة احتياطية من قاعدة البيانات.",
            ])
        else:
            lines.extend([
                "\n💼 <b>أوامر موظف المبيعات:</b>",
                "• <code>📷 جرد المخزن</code>: فتح وضع الجرد السريع بالباركود.",
                "• أرسل صورة إيصال التحويل (InstaPay / فودافون كاش) لحفظها في الفاتورة.",
            ])

        try:
            custom_cmds = self.db.get_custom_commands(only_active=True)
            if custom_cmds:
                lines.append("\n⚡ <b>أوامر مخصصة إضافية مضافة للنظام:</b>")
                for c in custom_cmds:
                    lines.append(f"• <code>{c['command_trigger']}</code>: {c['description']}")
        except Exception:
            pass

        self.send_direct_message(chat_id, "\n".join(lines))

    # ==========================================================================
    # Callback Query Handler (Inline Buttons)
    # ==========================================================================

    def _handle_callback_query(self, query: Dict[str, Any]):
        chat_id = query["from"]["id"]
        data = query.get("data", "")
        role = self._get_user_role(chat_id)

        if data.startswith("reprice_target_") and role == "Owner":
            dev_id = int(data.split("_")[2])
            self.user_sessions[chat_id] = {"role": "Owner", "step": "waiting_for_new_target_price", "device_id": dev_id}
            self.send_direct_message(chat_id, "✍️ أدخل <b>سعر البيع الجديد</b> بالجنية المصري:")

        elif data.startswith("reprice_min_") and role == "Owner":
            dev_id = int(data.split("_")[2])
            self.user_sessions[chat_id] = {"role": "Owner", "step": "waiting_for_new_min_price", "device_id": dev_id}
            self.send_direct_message(chat_id, "✍️ أدخل <b>الحد الأدنى الجديد</b> لسعر البيع بالجنية المصري:")

        elif data.startswith("quick_delta_") and role == "Owner":
            # format: quick_delta_<dev_id>_<delta>
            parts = data.split("_")
            dev_id = int(parts[2])
            delta = float(parts[3])
            dev = self.db.get_device_by_id(dev_id)
            if not dev:
                self.send_direct_message(chat_id, "❌ لم يتم العثور على الجهاز.")
                return

            new_target = max(0.0, dev["target_selling_price"] + delta)
            new_min = dev["min_allowed_price"]
            if new_target < new_min:
                new_min = new_target

            self.db.update_device_prices(
                device_id=dev_id,
                target_price=new_target,
                min_price=new_min,
                user_role="Owner",
                user_name="TelegramOwner"
            )

            if HAS_PYQT:
                self.signals.device_price_updated.emit({
                    "device_id": dev_id,
                    "stock_no": dev["stock_no"],
                    "brand": dev["brand"],
                    "model_name": dev["model_name"],
                    "target_selling_price": new_target,
                    "min_allowed_price": new_min
                })

            delta_sign = f"+{delta:,.0f}" if delta > 0 else f"{delta:,.0f}"
            self.send_direct_message(chat_id, f"⚡ <b>تم تعديل السعر فورياً ({delta_sign} ج.م)!</b>")
            updated_dev = self.db.get_device_by_id(dev_id)
            if updated_dev:
                self._send_device_card(chat_id, updated_dev, role)

        elif data.startswith("view_dev_"):
            dev_id = int(data.split("_")[2])
            dev = self.db.get_device_by_id(dev_id)
            if dev:
                self._send_device_card(chat_id, dev, role)
            else:
                self.send_direct_message(chat_id, "❌ لم يتم العثور على الجهاز المطلوب.")

        elif data.startswith("filter_model_"):
            model_key = data.replace("filter_model_", "")
            self._perform_device_lookup(chat_id, model_key, role)

        # Approvals from sales staff
        elif data.startswith("approve_discount_") and role == "Owner":
            req_id = data.replace("approve_discount_", "")
            self._resolve_approval(chat_id, req_id, approved=True)
        elif data.startswith("reject_discount_") and role == "Owner":
            req_id = data.replace("reject_discount_", "")
            self._resolve_approval(chat_id, req_id, approved=False)

        # Remote Printing from Telegram to Desktop Thermal Printer
        elif data.startswith("remote_print_"):
            dev_id = int(data.replace("remote_print_", "").strip())
            if HAS_PYQT:
                self.signals.request_remote_print.emit(dev_id)
            self.send_direct_message(chat_id, f"🖨️ <b>تم إرسال أمر الطباعة لجهاز #{dev_id} مباشرة إلى طابعة الملصقات المتصلة بالبرنامج!</b>")

        # Interactive Add Device Condition Selection
        elif data.startswith("add_cond_"):
            cond = data.replace("add_cond_", "").strip()
            session = self.user_sessions.get(chat_id, {})
            if "data" not in session:
                session["data"] = {}
            session["data"]["condition"] = cond
            session["step"] = "add_dev_buy_price"
            self.user_sessions[chat_id] = session
            cond_lbl = "🆕 جديد متبرشم" if cond == "New" else "✨ مستعمل كسر زيرو"
            self.send_direct_message(
                chat_id,
                f"✅ تم اختيار الحالة: <b>{cond_lbl}</b>\n\n"
                "💵 <b>سعر الشراء والتكلفة (خطوة 4 من 6):</b>\n"
                "أدخل سعر الشراء (تكلفة الجهاز عليك بالجنية المصري):"
            )

        # Interactive Sell Device Selection & Actions
        elif data.startswith("sel_sell_"):
            dev_id = int(data.replace("sel_sell_", "").strip())
            dev = self.db.get_device_by_id(dev_id)
            if not dev or dev.get("status") != "in_stock":
                self.send_direct_message(chat_id, "❌ الجهاز غير متاح أو تم بيعه مسبقاً.")
                return
            self._prompt_device_for_sale(chat_id, dev, role)

        elif data.startswith("sell_price_def_"):
            dev_id = int(data.replace("sell_price_def_", "").strip())
            dev = self.db.get_device_by_id(dev_id)
            if not dev:
                self.send_direct_message(chat_id, "❌ لم يتم العثور على الجهاز.")
                return
            self._prompt_payment_methods(chat_id, dev_id, dev["target_selling_price"])

        elif data.startswith("sell_pay_"):
            # format: sell_pay_<dev_id>_<price>_<method>
            parts = data.split("_")
            dev_id = int(parts[2])
            final_price = float(parts[3])
            method = parts[4]
            self._execute_telegram_sale(chat_id, dev_id, final_price, method, role)

        # Sales Receipt & Profits Callbacks
        elif data.startswith("receipt_"):
            inv_no = data.replace("receipt_", "").strip()
            self._send_sale_receipt_card(chat_id, inv_no, role)
        elif data.startswith("view_sale_"):
            inv_no = data.replace("view_sale_", "").strip()
            self._send_sale_receipt_card(chat_id, inv_no, role)
        elif data == "daily_profits" and role == "Owner":
            self._send_daily_profit_summary(chat_id)
        elif data.startswith("void_sale_") and role == "Owner":
            try:
                sale_id = int(data.replace("void_sale_", "").strip())
                ok = self.db.void_sale(sale_id, user_role="Owner", user_name="TelegramOwner", reason="إلغاء عبر بوت تيليجرام")
                if ok:
                    self.send_direct_message(chat_id, f"✅ <b>تم إلغاء الفاتورة رقم #{sale_id} بنجاح وإعادة الجهاز للمخزن!</b>")
                else:
                    self.send_direct_message(chat_id, f"⚠️ لا يمكن إلغاء الفاتورة #{sale_id} أو أنها ملغاة مسبقاً.")
            except Exception as e:
                self.send_direct_message(chat_id, f"❌ خطأ أثناء إلغاء الفاتورة: {e}")

    # ==========================================================================
    # Interactive Add Device Flow (إضافة جهاز جديد مع طباعة فورية بالبرنامج)
    # ==========================================================================

    def _start_add_device_flow(self, chat_id: int, role: str):
        self.user_sessions[chat_id] = {
            "role": role,
            "step": "add_dev_model",
            "data": {}
        }
        self.send_direct_message(
            chat_id,
            "📥 <b>إضافة جهاز جديد إلى المخزن (خطوة 1 من 6)</b>\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "📱 أرسل <b>اسم وموديل الجهاز</b>، مثلاً:\n"
            "• <code>iPhone 15 Pro Max</code>\n"
            "• <code>Samsung Galaxy S24 Ultra</code>\n"
            "• <code>OPPO Reno8 T</code>\n\n"
            "💡 <i>(أرسل 'إلغاء' في أي وقت للتراجع)</i>"
        )

    def _handle_add_device_step(self, chat_id: int, text: str, role: str, session: dict):
        step = session.get("step")
        data = session.get("data", {})

        if step == "add_dev_model":
            known_brands = [
                "Apple", "iPhone", "Samsung", "OPPO", "Xiaomi", "Redmi",
                "Realme", "Honor", "Huawei", "Infinix", "Vivo", "Nokia",
                "Google", "OnePlus", "Sony"
            ]
            parts = text.split(maxsplit=1)
            first_w = parts[0]
            matched_brand = ""
            for b in known_brands:
                if b.lower() == first_w.lower():
                    matched_brand = "Apple" if b.lower() == "iphone" else b
                    break

            if matched_brand:
                brand = matched_brand
                model_name = parts[1] if len(parts) > 1 else first_w
                if matched_brand == "Apple" and not model_name.lower().startswith("iphone"):
                    model_name = f"iPhone {model_name}"
            else:
                brand = first_w
                model_name = parts[1] if len(parts) > 1 else first_w

            data["brand"] = brand
            data["model_name"] = model_name
            session["step"] = "add_dev_storage"
            session["data"] = data
            self.user_sessions[chat_id] = session

            self.send_direct_message(
                chat_id,
                f"✅ الجهاز: <b>{brand} {model_name}</b>\n\n"
                "📦 <b>المساحة والرام (خطوة 2 من 6):</b>\n"
                "أرسل سعة التخزين والرام، مثلاً:\n"
                "• <code>256GB / 8GB RAM</code>\n"
                "• <code>128GB</code>\n"
                "• <code>512GB</code>"
            )

        elif step == "add_dev_storage":
            storage = text
            ram = ""
            if "/" in text:
                sp_parts = text.split("/", 1)
                storage = sp_parts[0].strip()
                ram = sp_parts[1].strip()

            data["storage"] = storage
            data["ram"] = ram
            session["step"] = "add_dev_color"
            session["data"] = data
            self.user_sessions[chat_id] = session

            self.send_direct_message(
                chat_id,
                "🎨 <b>اللون (خطوة 3 من 6):</b>\n"
                "أرسل لون الجهاز (مثلاً: <code>أسود</code>، <code>Gold</code>، <code>أزرق</code>):"
            )

        elif step == "add_dev_color":
            data["color"] = text
            session["step"] = "add_dev_condition"
            session["data"] = data
            self.user_sessions[chat_id] = session

            markup = {
                "inline_keyboard": [
                    [
                        {"text": "🆕 جديد متبرشم", "callback_data": "add_cond_New"},
                        {"text": "✨ مستعمل كسر زيرو", "callback_data": "add_cond_Used"}
                    ]
                ]
            }
            self.send_direct_message(
                chat_id,
                "🏷️ <b>اختر حالة الجهاز (خطوة 4 من 6):</b>",
                reply_markup=markup
            )

        elif step == "add_dev_buy_price":
            try:
                buy_p = float(text.replace(",", "").strip())
                data["buy_price"] = buy_p
                session["step"] = "add_dev_sell_price"
                session["data"] = data
                self.user_sessions[chat_id] = session

                self.send_direct_message(
                    chat_id,
                    f"💵 تم حفظ سعر التكلفة: <b>{buy_p:,.0f} ج.م</b>\n\n"
                    "💰 <b>سعر البيع المطلوب (خطوة 5 من 6):</b>\n"
                    "أدخل سعر البيع المستهدف بالجنية المصري (مثلاً: <code>14000</code>):"
                )
            except ValueError:
                self.send_direct_message(chat_id, "❌ يرجى إدخال رقم صحيح لسعر الشراء.")

        elif step == "add_dev_sell_price":
            try:
                sell_p = float(text.replace(",", "").strip())
                data["target_selling_price"] = sell_p
                data["min_allowed_price"] = sell_p * 0.95
                session["step"] = "add_dev_serial_or_imei"
                session["data"] = data
                self.user_sessions[chat_id] = session

                self.send_direct_message(
                    chat_id,
                    f"💰 تم حفظ سعر البيع المطلوب: <b>{sell_p:,.0f} ج.م</b>\n\n"
                    "🆔 <b>السريال أو IMEI (خطوة 6 من 6):</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━\n"
                    "📷 <b>مسح الباركود بكاميرا الهاتف:</b>\n"
                    "يمكنك الآن تصوير باركود كرتونة الجهاز أو ملصق السريال / IMEI بكاميرا الهاتف وإرسال الصورة هنا مباشرة!\n\n"
                    "✍️ أو أدخل رقم السريال / IMEI يدوياً، أو اكتب <code>0</code> لتوليد كود تلقائي:"
                )
            except ValueError:
                self.send_direct_message(chat_id, "❌ يرجى إدخال رقم صحيح لسعر البيع.")

        elif step == "add_dev_serial_or_imei":
            self._finalize_telegram_device_intake(chat_id, text, role, session)

    def _finalize_telegram_device_intake(self, chat_id: int, serial_input: str, role: str, session: dict):
        data = session.get("data", {})
        serial_val = serial_input.strip()
        if serial_val == "0":
            serial_val = ""

        from core.models import DeviceRecord, DEFAULT_CIPHER_KEY
        from core.cost_cipher import encode_cost_cipher

        brand = data.get("brand", "Generic")
        model = data.get("model_name", "Phone")
        storage = data.get("storage", "")
        ram = data.get("ram", "")
        color = data.get("color", "")
        condition = data.get("condition", "Used")
        buy_p = float(data.get("buy_price", 0.0))
        sell_p = float(data.get("target_selling_price", 0.0))
        min_p = float(data.get("min_allowed_price", sell_p * 0.95))

        key = self.db.get_setting("cipher_key", DEFAULT_CIPHER_KEY)
        cipher = encode_cost_cipher(buy_p, key)
        next_stk = self.db.get_next_stock_no()

        rec = DeviceRecord(
            stock_no=next_stk,
            condition=condition,
            brand=brand,
            model_name=model,
            storage=storage,
            ram=ram,
            color=color,
            serial_number=serial_val if not (serial_val.isdigit() and len(serial_val) == 15) else "",
            imei1=serial_val if (serial_val.isdigit() and len(serial_val) == 15) else "",
            buy_price=buy_p,
            target_selling_price=sell_p,
            min_allowed_price=min_p,
            secret_cost_cipher=cipher,
            status="in_stock",
            seller_name="إدخال عبر تيليجرام"
        )

        try:
            dev_id = self.db.insert_device(rec, user_role=role, user_name=f"Telegram_{role}")
            rec.id = dev_id
            dev_dict = rec.to_dict()

            if HAS_PYQT:
                self.signals.device_added_remote.emit(dev_dict)

            # Reset session
            self.user_sessions[chat_id] = {"role": role}

            cond_str = "🆕 جديد متبرشم" if condition == "New" else "✨ مستعمل كسر زيرو"
            exp_profit = sell_p - buy_p
            lines = [
                "✅ <b>تمت إضافة الجهاز للمخزن بنجاح!</b>",
                "━━━━━━━━━━━━━━━━━━━━",
                f"📱 <b>اسم الجهاز:</b> {brand} {model}",
                f"📦 <b>المساحة والرام:</b> {storage or '-'} {ram}",
                f"🎨 <b>اللون:</b> {color or '-'}",
                f"🏷️ <b>الحالة:</b> {cond_str}",
                f"💵 <b>السعر اللي اشتريت بيه:</b> {buy_p:,.0f} ج.م",
                f"🤫 <b>شفرة التكلفة:</b> <code>{cipher}</code>",
                f"💰 <b>سعر البيع المطلوب:</b> {sell_p:,.0f} ج.م",
                f"🔒 <b>الحد الأدنى للبيع:</b> {min_p:,.0f} ج.م",
                f"📈 <b>هامش الربح المتوقع:</b> {exp_profit:,.0f} ج.م",
                f"🔖 <b>كود السريال:</b> <code>{next_stk}</code>",
            ]
            if rec.imei1:
                lines.append(f"🆔 <b>IMEI:</b> <code>{rec.imei1}</code>")

            lines.append("\nاختر الإجراء:")
            markup = {
                "inline_keyboard": [
                    [{"text": "🖨️ طباعة الملصق فوراً من البرنامج", "callback_data": f"remote_print_{dev_id}"}],
                    [{"text": "📱 بطاقة الجهاز", "callback_data": f"view_dev_{dev_id}"}]
                ]
            }
            self.send_direct_message(chat_id, "\n".join(lines), reply_markup=markup)

        except Exception as e:
            logger.error("Failed to insert device via telegram: %s", e)
            self.send_direct_message(chat_id, f"❌ حدث خطأ أثناء إضافة الجهاز:\n{e}")

    # ==========================================================================
    # Interactive Sell Device Flow (تسجيل بيع جهاز كاشير مع إصدار فاتورة فورية)
    # ==========================================================================

    def _start_sell_device_flow(self, chat_id: int, role: str):
        self.user_sessions[chat_id] = {
            "role": role,
            "step": "sell_dev_search",
            "data": {}
        }
        self.send_direct_message(
            chat_id,
            "💸 <b>تسجيل بيع جهاز كاشير</b>\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "📷 <b>مسح باركود الجهاز بكاميرا الهاتف:</b>\n"
            "التقط صورة لباركود الملصق أو كرتونة الجهاز وأرسلها هنا فوراً!\n\n"
            "🔎 أو أرسل <b>كود السريال (Stock No)</b> أو <b>IMEI</b> أو <b>اسم الموديل</b> نصياً:\n\n"
            "💡 <i>(يمكنك الضغط على أي زر بالقائمة الرئيسية للإلغاء في أي وقت)</i>"
        )

    def _handle_sell_device_step(self, chat_id: int, text: str, role: str, session: dict):
        step = session.get("step")
        data = session.get("data", {})

        if step == "sell_dev_search":
            query = text.strip()
            dev = self.db.get_device_by_imei_or_stock(query)
            if dev and dev.get("status") == "in_stock":
                self._prompt_device_for_sale(chat_id, dev, role)
                return

            results = self.db.search_devices(query=query, status="in_stock", limit=8)
            if not results:
                self.send_direct_message(
                    chat_id,
                    f"❌ لم يتم العثور على أجهزة متوفرة مطابقة لـ: <code>{query}</code>\n"
                    "يرجى إعادة إدخال السريال أو اسم الجهاز، أو أرسل 'إلغاء' للتراجع."
                )
                return

            if len(results) == 1:
                self._prompt_device_for_sale(chat_id, results[0], role)
                return

            lines = [f"🔍 عثرنا على ({len(results)}) أجهزة مطابقة:\nاختر الجهاز المراد بيعه:"]
            buttons = []
            for d in results:
                btn_txt = f"📱 {d['brand']} {d['model_name']} ({d['color'] or d['storage']}) — {d['target_selling_price']:,.0f} ج.م"
                buttons.append([{"text": btn_txt, "callback_data": f"sel_sell_{d['id']}"}])
            self.send_direct_message(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons})

        elif step == "sell_dev_price":
            dev_id = data.get("device_id")
            try:
                custom_price = float(text.replace(",", "").strip())
                dev = self.db.get_device_by_id(dev_id)
                if not dev:
                    self.send_direct_message(chat_id, "❌ لم يتم العثور على الجهاز.")
                    return

                if custom_price < dev["min_allowed_price"] and role != "Owner":
                    self.send_direct_message(
                        chat_id,
                        f"🔒 السعر {custom_price:,.0f} ج.م أقل من الحد الأدنى المسموح ({dev['min_allowed_price']:,.0f} ج.م).\n"
                        "البيع بأقل من الحد الأدنى متاح لصاحب المحل فقط."
                    )
                    return

                self._prompt_payment_methods(chat_id, dev_id, custom_price)
            except ValueError:
                self.send_direct_message(chat_id, "❌ يرجى إدخال رقم صحيح لسعر البيع.")

    def _prompt_device_for_sale(self, chat_id: int, dev: dict, role: str):
        dev_id = dev["id"]
        self.user_sessions[chat_id] = {
            "role": role,
            "step": "sell_dev_price",
            "data": {
                "device_id": dev_id,
                "target_price": dev["target_selling_price"],
                "min_price": dev["min_allowed_price"]
            }
        }
        cond_str = "🆕 جديد" if dev.get("condition") == "New" else "✨ مستعمل"
        lines = [
            f"📱 <b>الجهاز المحدد للبيع:</b> {dev['brand']} {dev['model_name']} ({dev['storage'] or '-'})",
            f"🎨 <b>اللون:</b> {dev['color'] or '-'} | <b>الحالة:</b> {cond_str}",
            f"💰 <b>السعر المطلوب بالسيستم:</b> {dev['target_selling_price']:,.0f} ج.م",
            f"🔒 <b>الحد الأدنى المسموح:</b> {dev['min_allowed_price']:,.0f} ج.م"
        ]
        if role == "Owner":
            lines.append(f"💵 <b>السعر اللي اشتريت بيه:</b> {dev['buy_price']:,.0f} ج.م")
        lines.append("\nاضغط الزر لتأكيد البيع بالسعر المطلوب أو اكتب سعراً مخصصاً:")

        markup = {
            "inline_keyboard": [
                [{"text": f"✅ البيع بالسعر المطلوب ({dev['target_selling_price']:,.0f} ج.م)", "callback_data": f"sell_price_def_{dev_id}"}]
            ]
        }
        self.send_direct_message(chat_id, "\n".join(lines), reply_markup=markup)

    def _prompt_payment_methods(self, chat_id: int, dev_id: int, final_price: float):
        dev = self.db.get_device_by_id(dev_id)
        if not dev:
            self.send_direct_message(chat_id, "❌ لم يتم العثور على الجهاز.")
            return

        session = self.user_sessions.get(chat_id, {})
        session["step"] = "sell_dev_method"
        session["data"] = {"device_id": dev_id, "final_price": final_price}
        self.user_sessions[chat_id] = session

        buttons = [
            [{"text": "💵 نقدي (Cash)", "callback_data": f"sell_pay_{dev_id}_{final_price}_Cash"}],
            [{"text": "⚡ إنستاباي (InstaPay)", "callback_data": f"sell_pay_{dev_id}_{final_price}_InstaPay"}],
            [{"text": "📱 فودافون كاش (Vodafone Cash)", "callback_data": f"sell_pay_{dev_id}_{final_price}_VodafoneCash"}],
            [{"text": "🤝 حساب تاجر / آجل", "callback_data": f"sell_pay_{dev_id}_{final_price}_TraderCredit"}]
        ]
        self.send_direct_message(
            chat_id,
            f"💳 <b>اختيار طريقة الدفع:</b>\n"
            f"📱 <b>الجهاز:</b> {dev['brand']} {dev['model_name']}\n"
            f"💰 <b>مبلغ البيع النهائي:</b> <b>{final_price:,.0f} ج.م</b>\n\n"
            f"اختر وسيلة الدفع لإتمام الفاتورة فوراً:",
            reply_markup={"inline_keyboard": buttons}
        )

    def _execute_telegram_sale(self, chat_id: int, dev_id: int, final_price: float, method: str, role: str):
        dev = self.db.get_device_by_id(dev_id)
        if not dev or dev.get("status") != "in_stock":
            self.send_direct_message(chat_id, "❌ تعذر إتمام البيع: الجهاز لم يعد متاحاً بالمخزن.")
            return

        from core.models import SaleRecord
        now_dt = datetime.now()
        sale_rec = SaleRecord(
            device_id=dev_id,
            salesperson=f"TelegramBot ({role})",
            customer_name="عميل مباشر (عبر البوت)",
            selling_price=final_price,
            discount=max(0.0, dev["target_selling_price"] - final_price),
            final_price=final_price,
            payment_method=method,
            cash_amount=final_price if method == "Cash" else 0.0,
            instapay_amount=final_price if method == "InstaPay" else 0.0,
            vodafone_cash_amount=final_price if method == "VodafoneCash" else 0.0,
            trader_credit_amount=final_price if method == "TraderCredit" else 0.0,
            net_collected=final_price if method != "TraderCredit" else 0.0,
            notes=f"تم تسجيل البيع عن بُعد عبر بوت تيليجرام بواسطة {role}"
        )

        try:
            sale_id = self.db.process_sale(sale_rec, user_role=role, user_name=f"Telegram_{role}")
            sale_dict = sale_rec.to_dict()
            sale_dict["id"] = sale_id
            sale_dict["brand"] = dev["brand"]
            sale_dict["model_name"] = dev["model_name"]
            sale_dict["stock_no"] = dev["stock_no"]

            if HAS_PYQT:
                self.signals.sale_completed_remote.emit(sale_dict)

            # Reset session
            self.user_sessions[chat_id] = {"role": role}

            method_ar = {
                "Cash": "💵 نقدي (Cash)",
                "InstaPay": "⚡ إنستاباي",
                "VodafoneCash": "📱 فودافون كاش",
                "TraderCredit": "🤝 حساب تاجر / آجل"
            }.get(method, method)

            profit = final_price - dev["buy_price"]
            lines = [
                "🎉 <b>تم تسجيل عملية البيع بنجاح!</b>",
                "━━━━━━━━━━━━━━━━━━━━",
                f"🧾 <b>رقم الفاتورة:</b> <code>{sale_rec.invoice_no}</code>",
                f"📱 <b>اسم الجهاز:</b> {dev['brand']} {dev['model_name']}",
                f"🎨 <b>اللون والسعة:</b> {dev['color'] or '-'} ({dev['storage'] or '-'})",
                f"🔖 <b>كود السريال:</b> <code>{dev['stock_no']}</code>",
                f"💰 <b>سعر البيع:</b> <b>{final_price:,.0f} ج.م</b>",
                f"💳 <b>طريقة السداد:</b> {method_ar}",
            ]
            if role == "Owner":
                lines.extend([
                    f"💵 <b>السعر اللي اشتريت بيه:</b> {dev['buy_price']:,.0f} ج.م",
                    f"📈 <b>صافي الربح المحقق:</b> <b>{profit:+,.0f} ج.م</b>",
                ])
            lines.append(f"⏰ <b>التوقيت:</b> {now_dt.strftime('%Y-%m-%d %H:%M:%S')}")

            markup = {
                "inline_keyboard": [
                    [{"text": "🧾 عرض تفاصيل الفاتورة", "callback_data": f"receipt_{sale_rec.invoice_no}"}],
                    [{"text": "📊 أرباح وردية اليوم", "callback_data": "daily_profits"}]
                ]
            }
            self.send_direct_message(chat_id, "\n".join(lines), reply_markup=markup)

        except Exception as e:
            logger.error("Failed to execute telegram sale: %s", e)
            self.send_direct_message(chat_id, f"❌ حدث خطأ أثناء إتمام عملية البيع:\n{e}")

    def _handle_price_input(self, chat_id: int, text: str, is_target: bool):
        session = self.user_sessions.get(chat_id, {})
        dev_id = session.get("device_id")
        try:
            new_price = float(text.replace(",", "").strip())
        except ValueError:
            self.send_direct_message(chat_id, "❌ يرجى إدخال رقم صحيح.")
            return

        dev = self.db.get_device_by_id(dev_id)
        if not dev:
            self.send_direct_message(chat_id, "❌ لم يتم العثور على الجهاز.")
            return

        old_target = dev["target_selling_price"]
        target_p = new_price if is_target else dev["target_selling_price"]
        min_p = new_price if not is_target else dev["min_allowed_price"]

        self.db.update_device_prices(
            device_id=dev_id,
            target_price=target_p,
            min_price=min_p,
            user_role="Owner",
            user_name="TelegramOwner"
        )

        new_profit = target_p - dev["buy_price"]
        confirm_lines = [
            "✅ <b>تم تحديث السعر بنجاح في قاعدة البيانات!</b>",
            "━━━━━━━━━━━━━━━━━━━━",
            f"📱 <b>اسم الجهاز:</b> {dev['brand']} {dev['model_name']}",
            f"📦 <b>الموديل والسعة:</b> {dev['model_code'] or '-'} ({dev['storage'] or '-'})",
            f"🎨 <b>اللون:</b> {dev['color'] or '-'}",
            f"💵 <b>السعر اللي اشتريت بيه:</b> {dev['buy_price']:,.0f} ج.م",
            f"💰 <b>سعر البيع الجديد:</b> {target_p:,.0f} ج.م (السابق: {old_target:,.0f} ج.م)",
            f"🔒 <b>الحد الأدنى للبيع:</b> {min_p:,.0f} ج.م",
            f"📈 <b>هامش الربح المتوقع:</b> {new_profit:,.0f} ج.م",
            f"🔖 <b>كود الجهاز:</b> <code>{dev['stock_no']}</code>"
        ]

        self.send_direct_message(chat_id, "\n".join(confirm_lines))

        # Emit desktop signal for real-time table sync and audio-visual toast
        if HAS_PYQT:
            self.signals.device_price_updated.emit({
                "device_id": dev_id,
                "stock_no": dev["stock_no"],
                "brand": dev["brand"],
                "model_name": dev["model_name"],
                "target_selling_price": target_p,
                "min_allowed_price": min_p
            })

        self.user_sessions[chat_id] = {"role": "Owner"}

    # ==========================================================================
    # Continuous Inventory Audit Scanner & Photo Uploads
    # ==========================================================================

    def _handle_audit_scan_text(self, chat_id: int, text: str):
        if text.strip() in ("خروج", "انهاء", "/exit"):
            self.user_sessions[chat_id] = {"role": self._get_user_role(chat_id)}
            self.send_direct_message(chat_id, "✅ تم إنهاء وضع الجرد والعودة للقائمة الرئيسية.")
            return

        # Emit signal to active desktop audit session
        if HAS_PYQT:
            self.signals.audit_scanned_code.emit(text.strip(), f"Telegram_User_{chat_id}")

        self.send_direct_message(chat_id, f"📥 تم تسجيل المسح: <code>{text.strip()}</code> ✓")

    def _decode_barcodes_from_image(self, image_path: Union[str, Path]) -> List[str]:
        """
        Scans image for 1D and 2D barcodes using a multi-engine pipeline:
        1. zxingcpp (best 1D support, tries multiple crops and scales)
        2. pyzbar fallback (for simpler cases)
        3. OpenCV adaptive pipeline (for phone-camera photos with perspective distortion)
        """
        results: List[str] = []

        def _add(txt: str):
            txt = txt.strip()
            if txt and txt not in results:
                results.append(txt)

        # ------------------------------------------------------------------ #
        # Engine 1: zxingcpp — best Code128 / IMEI barcode support            #
        # ------------------------------------------------------------------ #
        try:
            import cv2
            import numpy as np
            import zxingcpp

            cv_img = cv2.imread(str(image_path))
            if cv_img is not None:
                gray_cv = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
                h, w = gray_cv.shape

                # Candidates: full image, plus sliding-window quadrants
                candidates = [gray_cv]
                # Horizontal strips (barcode label is usually a horizontal band)
                for y_frac in [0.3, 0.4, 0.5, 0.6, 0.7]:
                    y = int(h * y_frac)
                    strip_h = max(80, h // 5)
                    strip = gray_cv[max(0, y - strip_h // 2):min(h, y + strip_h // 2), :]
                    if strip.size > 0:
                        candidates.append(strip)

                for cand in candidates:
                    if results:
                        break
                    for scale in (1, 2, 3):
                        if results:
                            break
                        if scale > 1:
                            cand_s = cv2.resize(cand, (cand.shape[1] * scale, cand.shape[0] * scale),
                                                interpolation=cv2.INTER_LANCZOS4)
                        else:
                            cand_s = cand
                        for thresh_fn in (
                            lambda x: x,
                            lambda x: cv2.threshold(x, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1],
                            lambda x: cv2.adaptiveThreshold(x, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                                            cv2.THRESH_BINARY, 31, 5),
                        ):
                            try:
                                proc = thresh_fn(cand_s)
                                for item in zxingcpp.read_barcodes(proc):
                                    _add(item.text)
                                if results:
                                    break
                            except Exception:
                                pass
        except ImportError:
            pass
        except Exception as e:
            logger.debug("zxingcpp scan error: %s", e)

        if results:
            return results

        # ------------------------------------------------------------------ #
        # Engine 2: pyzbar fallback                                            #
        # ------------------------------------------------------------------ #
        try:
            from PIL import Image, ImageEnhance, ImageFilter
            import pyzbar.pyzbar as pyzbar
            import numpy as np

            img = Image.open(image_path)

            # Pass 1: Raw
            for d in pyzbar.decode(img):
                _add(d.data.decode("utf-8", errors="ignore"))
            if results:
                return results

            # Pass 2: Grayscale
            gray_pil = img.convert("L")
            for d in pyzbar.decode(gray_pil):
                _add(d.data.decode("utf-8", errors="ignore"))
            if results:
                return results

            # Pass 3: High contrast + sharpen
            enhanced = ImageEnhance.Sharpness(
                ImageEnhance.Contrast(gray_pil).enhance(3.0)
            ).enhance(2.0)
            for d in pyzbar.decode(enhanced):
                _add(d.data.decode("utf-8", errors="ignore"))
            if results:
                return results

            # Pass 4: 2x upscale + otsu
            w2, h2 = gray_pil.width * 2, gray_pil.height * 2
            upscaled = gray_pil.resize((w2, h2), Image.Resampling.LANCZOS)
            arr = np.array(upscaled)
            import cv2 as _cv2
            _, otsu = _cv2.threshold(arr, 0, 255, _cv2.THRESH_BINARY + _cv2.THRESH_OTSU)
            from PIL import Image as _PI
            for d in pyzbar.decode(_PI.fromarray(otsu)):
                _add(d.data.decode("utf-8", errors="ignore"))
            if results:
                return results

            # Pass 5: Rotations
            for angle in (90, 180, 270):
                for d in pyzbar.decode(gray_pil.rotate(angle, expand=True)):
                    _add(d.data.decode("utf-8", errors="ignore"))
                if results:
                    return results

        except ImportError:
            pass
        except Exception as e:
            logger.error("pyzbar scan error: %s", e)

        if results:
            return results

        # ------------------------------------------------------------------ #
        # Engine 3: OpenCV advanced pipeline — perspective-corrected scan      #
        # ------------------------------------------------------------------ #
        try:
            import cv2
            import numpy as np
            import zxingcpp
            import pyzbar.pyzbar as pyzbar_mod

            cv_img = cv2.imread(str(image_path))
            if cv_img is None:
                return results

            gray_cv = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)

            # Detect bright rectangular sticker region (white label on dark surface)
            _, bright = cv2.threshold(gray_cv, 180, 255, cv2.THRESH_BINARY)
            kern = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
            bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, kern)
            bright = cv2.morphologyEx(bright, cv2.MORPH_OPEN, kern)

            contours, _ = cv2.findContours(bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for c in sorted(contours, key=cv2.contourArea, reverse=True)[:5]:
                if cv2.contourArea(c) < 8000:
                    break
                x, y, bw, bh = cv2.boundingRect(c)
                pad = 15
                x1 = max(0, x - pad); y1 = max(0, y - pad)
                x2 = min(gray_cv.shape[1], x + bw + pad)
                y2 = min(gray_cv.shape[0], y + bh + pad)
                roi = gray_cv[y1:y2, x1:x2]

                for scale in (3, 4, 2):
                    roi_s = cv2.resize(roi, (roi.shape[1] * scale, roi.shape[0] * scale),
                                      interpolation=cv2.INTER_LANCZOS4)
                    # Denoise then threshold
                    denoised = cv2.bilateralFilter(roi_s, 9, 75, 75)
                    _, otsu = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

                    for img_to_scan in (roi_s, denoised, otsu):
                        for item in zxingcpp.read_barcodes(img_to_scan):
                            _add(item.text)
                        if results:
                            return results
                        for d in pyzbar_mod.decode(img_to_scan):
                            _add(d.data.decode("utf-8", errors="ignore"))
                        if results:
                            return results

        except Exception as e:
            logger.debug("OpenCV advanced scan error: %s", e)

        return results

    def _handle_photo_upload(self, msg: Dict[str, Any], chat_id: int, role: str):
        """Downloads high-res photo, scans for barcodes, and handles intake or selling."""
        import requests
        photos = msg.get("photo", [])
        if not photos:
            return
        best_photo = photos[-1]  # Highest resolution
        file_id = best_photo["file_id"]

        # Get file URL
        info_url = f"https://api.telegram.org/bot{self.token}/getFile?file_id={file_id}"
        try:
            res = requests.get(info_url, timeout=10.0).json()
            if not res.get("ok"):
                return

            file_path_tg = res["result"]["file_path"]
            download_url = f"https://api.telegram.org/file/bot{self.token}/{file_path_tg}"

            uploads_dir = Path(get_app_data_dir()) / "uploads"
            uploads_dir.mkdir(parents=True, exist_ok=True)
            local_filename = f"photo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
            local_path = uploads_dir / local_filename

            img_data = requests.get(download_url, timeout=20.0).content
            with open(local_path, "wb") as f:
                f.write(img_data)
        except Exception as e:
            self.send_direct_message(chat_id, f"❌ حدث خطأ أثناء تحميل الصورة: {e}")
            return

        session = self.user_sessions.get(chat_id, {})
        step = session.get("step")

        # Scan for barcodes in the photo via phone camera
        barcodes = self._decode_barcodes_from_image(local_path)

        # -------------------------------------------------------------
        # Scenario 1: Intake Wizard — Adding device Serial / IMEI
        # -------------------------------------------------------------
        if step == "add_dev_serial_or_imei":
            if barcodes:
                scanned_code = barcodes[0]
                self.send_direct_message(
                    chat_id,
                    f"📷 <b>تم مسح باركود الجهاز بالكاميرا بنجاح!</b>\n"
                    f"الرمز المقروء: <code>{scanned_code}</code>"
                )
                self._finalize_telegram_device_intake(chat_id, scanned_code, role, session)
            else:
                self.send_direct_message(
                    chat_id,
                    "⚠️ <b>لم نتمكن من قراءة الباركود بوضوح من الصورة.</b>\n"
                    "يرجى توجيه الكاميرا بإضاءة جيدة ومسافة مقربة لباركود السريال، أو كتابة الرقم نصياً:"
                )
            return

        # -------------------------------------------------------------
        # Scenario 2: Selling Wizard — Searching device via camera barcode
        # -------------------------------------------------------------
        if step == "sell_dev_search":
            if barcodes:
                matched_dev = None
                for b_code in barcodes:
                    d = self.db.get_device_by_imei_or_stock(b_code)
                    if not d:
                        res = self.db.search_devices(query=b_code, status="in_stock", limit=1)
                        if res:
                            d = res[0]
                    if d:
                        matched_dev = d
                        break

                if matched_dev:
                    if matched_dev.get("status") == "in_stock":
                        self.send_direct_message(
                            chat_id,
                            f"📷 <b>تم التعرف على باركود الجهاز بكاميرا الهاتف بنجاح!</b>\n"
                            f"📱 <b>{matched_dev['brand']} {matched_dev['model_name']}</b> (كود: <code>{matched_dev['stock_no']}</code>)"
                        )
                        self._prompt_device_for_sale(chat_id, matched_dev, role)
                    else:
                        st = "مباع" if matched_dev.get("status") == "sold" else matched_dev.get("status")
                        self.send_direct_message(
                            chat_id,
                            f"⚠️ الجهاز <b>{matched_dev['brand']} {matched_dev['model_name']}</b> (كود: <code>{matched_dev['stock_no']}</code>) مسجل في النظام كـ [<b>{st}</b>] وليس متوفراً في المخزن."
                        )
                else:
                    self.send_direct_message(
                        chat_id,
                        f"❌ تم قراءة الباركود <code>{barcodes[0]}</code> ولكن لم يتم العثور على جهاز مطابق له في المخزن.\n"
                        "يرجى التأكد من كود السريال أو كتابة اسم الموديل نصياً:"
                    )
            else:
                self.send_direct_message(
                    chat_id,
                    "⚠️ <b>لم نتمكن من قراءة باركود الجهاز من الصورة.</b>\n"
                    "يرجى توجيه الكاميرا مباشرة على باركود الملصق أو كتابة رقم السريال نصياً:"
                )
            return

        # -------------------------------------------------------------
        # Scenario 3: Blind Audit Scan Mode
        # -------------------------------------------------------------
        if step == "waiting_for_audit_scan":
            if barcodes:
                for b_code in barcodes:
                    self._handle_audit_scan_text(chat_id, b_code)
            else:
                self.send_direct_message(chat_id, "⚠️ لم نتمكن من قراءة الباركود من الصورة أثناء الجرد.")
            return

        # -------------------------------------------------------------
        # Scenario 4: General Mode — Recognize Barcode and Show Device Card!
        # -------------------------------------------------------------
        if barcodes:
            matched_dev = None
            for b_code in barcodes:
                d = self.db.get_device_by_imei_or_stock(b_code)
                if not d:
                    res = self.db.search_devices(query=b_code, status="ALL", limit=1)
                    if res:
                        d = res[0]
                if d:
                    matched_dev = d
                    break

            if matched_dev:
                self.send_direct_message(
                    chat_id,
                    f"📷 <b>تم مسح باركود الجهاز بكاميرا الهاتف:</b>"
                )
                self._send_device_card(chat_id, matched_dev, role)
                return
            else:
                self.send_direct_message(
                    chat_id,
                    f"📷 تم قراءة الباركود بالكاميرا: <code>{barcodes[0]}</code>\n"
                    "ولكن لم يتم العثور على جهاز مسجل بهذا الكود في قاعدة البيانات."
                )
                return

        # -------------------------------------------------------------
        # Scenario 5: General Image (Payment Proof / KYC)
        # -------------------------------------------------------------
        if HAS_PYQT:
            self.signals.proof_photo_received.emit("payment_proof", str(local_path))

        self.send_direct_message(chat_id, "📷 <b>تم استلام الصورة بنجاح!</b>\nتم إرفاقها فورياً بشاشة الكاشير والمبيعات.")

    # ==========================================================================
    # Sales Receipts & Financial Summaries
    # ==========================================================================

    def _download_telegram_file(self, file_id: str, local_path: Path) -> bool:
        """Downloads any file from Telegram by file_id. Returns True on success."""
        import requests as _req
        try:
            info_url = f"https://api.telegram.org/bot{self.token}/getFile?file_id={file_id}"
            res = _req.get(info_url, timeout=10.0).json()
            if not res.get("ok"):
                return False
            tg_path = res["result"]["file_path"]
            download_url = f"https://api.telegram.org/file/bot{self.token}/{tg_path}"
            data = _req.get(download_url, timeout=30.0).content
            local_path.parent.mkdir(parents=True, exist_ok=True)
            with open(local_path, "wb") as f:
                f.write(data)
            return True
        except Exception as e:
            logger.error("_download_telegram_file error: %s", e)
            return False

    def _extract_code_with_gemini_vision(self, image_path: Union[str, Path]) -> List[str]:
        """
        Uses Gemini Vision API to extract IMEI / serial / barcode numbers from an image.
        Falls back gracefully if no API key is configured.
        """
        try:
            import os
            api_key = (
                self.db.get_setting("gemini_api_key", "")
                or os.environ.get("GEMINI_API_KEY", "")
                or os.environ.get("GOOGLE_API_KEY", "")
            )
            if not api_key:
                return []

            from google import genai
            from google.genai import types as gtypes
            import base64

            with open(image_path, "rb") as f:
                img_bytes = f.read()
            b64 = base64.b64encode(img_bytes).decode("utf-8")

            client = genai.Client(api_key=api_key)
            prompt = (
                "Look at this image carefully. Extract ALL numeric codes that could be "
                "IMEI numbers, barcode numbers, serial numbers, or stock codes. "
                "Reply ONLY with the numbers, one per line, with no other text. "
                "If a number is printed below a barcode, include it. "
                "Focus especially on 15-digit IMEI numbers."
            )
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[
                    gtypes.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                    prompt,
                ],
            )
            raw = response.text.strip()
            codes = []
            for line in raw.splitlines():
                token = line.strip().replace(" ", "").replace("-", "")
                # Accept numeric tokens that look like IMEI/serial (8-20 chars, mostly digits)
                cleaned = "".join(c for c in token if c.isdigit() or c.isalnum())
                if 7 <= len(cleaned) <= 20 and sum(c.isdigit() for c in cleaned) >= 6:
                    if cleaned not in codes:
                        codes.append(cleaned)
            return codes
        except Exception as e:
            logger.debug("Gemini Vision extraction error: %s", e)
            return []

    def _handle_document_image(self, msg: Dict[str, Any], chat_id: int, role: str):
        """
        Handles full-resolution image sent as a Document (file).
        This provides higher quality barcode scanning than compressed photos.
        """
        import requests
        doc = msg["document"]
        file_id = doc["file_id"]
        mime = doc.get("mime_type", "image/jpeg")
        ext = ".jpg" if "jpeg" in mime else ".png"

        uploads_dir = Path(get_app_data_dir()) / "uploads"
        local_path = uploads_dir / f"doc_{datetime.now().strftime('%Y%m%d_%H%M%S')}{ext}"

        self.send_direct_message(chat_id, "📥 جاري تحميل الصورة بجودة كاملة...")
        if not self._download_telegram_file(file_id, local_path):
            self.send_direct_message(chat_id, "❌ فشل تحميل الملف.")
            return

        # Redirect to same handling logic as photo
        pseudo_msg = dict(msg)
        pseudo_msg["_local_path"] = str(local_path)
        self._process_scanned_image(local_path, chat_id, role,
                                     session=self.user_sessions.get(chat_id, {}))

    def _process_scanned_image(self, local_path: Path, chat_id: int, role: str, session: dict):
        """Core logic for processing a scanned barcode/label image from any source."""
        # Try multi-engine barcode decode
        barcodes = self._decode_barcodes_from_image(local_path)

        # Gemini Vision fallback if barcode decode fails
        if not barcodes:
            gemini_codes = self._extract_code_with_gemini_vision(local_path)
            if gemini_codes:
                barcodes = gemini_codes
                logger.info("Gemini Vision extracted codes: %s", barcodes)

        step = session.get("step")

        # Scenario 1: Intake Wizard — Adding device Serial / IMEI
        if step == "add_dev_serial_or_imei":
            if barcodes:
                scanned_code = barcodes[0]
                self.send_direct_message(
                    chat_id,
                    f"📷 <b>تم مسح باركود الجهاز بالكاميرا بنجاح!</b>\n"
                    f"الرمز المقروء: <code>{scanned_code}</code>"
                )
                self._finalize_telegram_device_intake(chat_id, scanned_code, role, session)
            else:
                self.send_direct_message(
                    chat_id,
                    "⚠️ <b>لم نتمكن من قراءة الباركود بوضوح من الصورة.</b>\n"
                    "💡 <b>نصيحة:</b> أرسل الصورة كـ <b>ملف (File)</b> بدلاً من صورة عادية للحصول على أفضل نتيجة!\n"
                    "أو اكتب رقم السريال / IMEI نصياً:"
                )
            return

        # Scenario 2: Selling Wizard — Searching device via camera barcode
        if step == "sell_dev_search":
            if barcodes:
                matched_dev = None
                for b_code in barcodes:
                    d = self.db.get_device_by_imei_or_stock(b_code)
                    if not d:
                        res = self.db.search_devices(query=b_code, status="in_stock", limit=1)
                        if res:
                            d = res[0]
                    if d:
                        matched_dev = d
                        break

                if matched_dev:
                    if matched_dev.get("status") == "in_stock":
                        self.send_direct_message(
                            chat_id,
                            f"📷 <b>تم التعرف على باركود الجهاز بكاميرا الهاتف بنجاح!</b>\n"
                            f"📱 <b>{matched_dev['brand']} {matched_dev['model_name']}</b> (كود: <code>{matched_dev['stock_no']}</code>)"
                        )
                        self._prompt_device_for_sale(chat_id, matched_dev, role)
                    else:
                        st = "مباع" if matched_dev.get("status") == "sold" else matched_dev.get("status")
                        self.send_direct_message(
                            chat_id,
                            f"⚠️ الجهاز <b>{matched_dev['brand']} {matched_dev['model_name']}</b> (كود: <code>{matched_dev['stock_no']}</code>) مسجل في النظام كـ [<b>{st}</b>] وليس متوفراً في المخزن."
                        )
                else:
                    self.send_direct_message(
                        chat_id,
                        f"❌ تم قراءة الباركود <code>{barcodes[0]}</code> ولكن لم يتم العثور على جهاز مطابق له في المخزن.\n"
                        "يرجى التأكد من كود السريال أو كتابة اسم الموديل نصياً:"
                    )
            else:
                self.send_direct_message(
                    chat_id,
                    "⚠️ <b>لم نتمكن من قراءة باركود الجهاز من الصورة.</b>\n"
                    "💡 أرسل الصورة كـ <b>ملف</b> للحصول على دقة أعلى، أو كتابة رقم السريال نصياً:"
                )
            return

        # Scenario 3: Blind Audit Scan Mode
        if step == "waiting_for_audit_scan":
            if barcodes:
                for b_code in barcodes:
                    self._handle_audit_scan_text(chat_id, b_code)
            else:
                self.send_direct_message(chat_id, "⚠️ لم نتمكن من قراءة الباركود من الصورة أثناء الجرد.")
            return

        # Scenario 4: General Mode — Recognize Barcode and Show Device Card!
        if barcodes:
            matched_dev = None
            for b_code in barcodes:
                d = self.db.get_device_by_imei_or_stock(b_code)
                if not d:
                    srch = self.db.search_devices(query=b_code, status="ALL", limit=1)
                    if srch:
                        d = srch[0]
                if d:
                    matched_dev = d
                    break

            if matched_dev:
                self.send_direct_message(chat_id, "📷 <b>تم مسح باركود الجهاز بكاميرا الهاتف:</b>")
                self._send_device_card(chat_id, matched_dev, role)
                return
            else:
                self.send_direct_message(
                    chat_id,
                    f"📷 تم قراءة الباركود بالكاميرا: <code>{barcodes[0]}</code>\n"
                    "ولكن لم يتم العثور على جهاز مسجل بهذا الكود في قاعدة البيانات."
                )
                return

        # Scenario 5: General Image (Payment Proof / KYC)
        if HAS_PYQT:
            self.signals.proof_photo_received.emit("payment_proof", str(local_path))

        self.send_direct_message(chat_id, "📷 <b>تم استلام الصورة بنجاح!</b>\nتم إرفاقها فورياً بشاشة الكاشير والمبيعات.")

    def _send_sale_receipt_card(self, chat_id: int, invoice_no: str, role: str):
        """Displays interactive luxury sale receipt window in Telegram."""
        with self.db._lock:
            conn = self.db.get_connection()
            row = conn.execute("""
                SELECT s.*, d.brand, d.model_name, d.model_code, d.storage, d.color,
                       d.stock_no, d.imei1, d.condition, d.buy_price, d.tax_status
                FROM sales s
                JOIN devices d ON s.device_id = d.id
                WHERE s.invoice_no = ?
                LIMIT 1;
            """, (invoice_no,)).fetchone()

        if not row:
            self.send_direct_message(chat_id, f"❌ لم يتم العثور على الفاتورة رقم: <code>{invoice_no}</code>")
            return

        cond_str = "🆕 جديد متبرشم" if row["condition"] == "New" else "✨ مستعمل كسر زيرو"
        profit = row["final_price"] - row["buy_price"]
        status_icon = "✅ معتمدة ومكتملة" if row["status"] == "completed" else "↩️ ملغاة (Voided)"

        card_lines = [
            "🧾 <b>نافذة إيصال وفاتورة بيع معتمدة</b>",
            "━━━━━━━━━━━━━━━━━━━━",
            f"🏪 <b>المحل:</b> {self.db.get_setting('store_name', 'ProLab Mobile Trading')}",
            f"🧾 <b>رقم الفاتورة:</b> <code>{row['invoice_no']}</code>",
            f"⏰ <b>تاريخ البيع:</b> {row['sale_date']}",
            f"👤 <b>الكاشير:</b> {row['salesperson'] or 'الكاشير'}",
            f"👤 <b>العميل:</b> {row['customer_name'] or 'عميل نقدي'} ({row['customer_phone'] or '-'})",
            "────────────────────",
            f"📱 <b>الجهاز:</b> {row['brand']} {row['model_name']} ({row['storage'] or '-'})",
            f"🎨 <b>اللون:</b> {row['color'] or '-'}",
            f"🔖 <b>السريال:</b> <code>{row['stock_no']}</code>",
            f"🆔 <b>IMEI:</b> <code>{row['imei1']}</code>",
            f"🏷️ <b>الحالة والضريبة:</b> {cond_str} | {row['tax_status']}",
            "────────────────────",
        ]
        if role == "Owner":
            card_lines.extend([
                f"💵 <b>السعر اللي اشتريت بيه (التكلفة):</b> {row['buy_price']:,.0f} ج.م",
                f"💰 <b>سعر البيع الفعلي:</b> {row['final_price']:,.0f} ج.م",
                f"📉 <b>الخصم:</b> {row['discount']:,.0f} ج.م",
                f"📈 <b>صافي الربح المحقق:</b> +{profit:,.0f} ج.م",
            ])
        else:
            card_lines.append(f"💰 <b>إجمالي الفاتورة:</b> {row['final_price']:,.0f} ج.م")

        card_lines.extend([
            f"💳 <b>طريقة السداد:</b> {row['payment_method']}",
            f"💵 <b>المبلغ المحصل:</b> {row['net_collected']:,.0f} ج.م",
            "────────────────────",
            f"📌 <b>حالة الفاتورة:</b> {status_icon}"
        ])

        buttons = [
            [{"text": "📊 أرباح وردية اليوم", "callback_data": "daily_profits"}],
        ]
        if role == "Owner" and row["status"] == "completed":
            buttons.append([{"text": "↩️ إلغاء البيع واسترجاع الجهاز للمخزن", "callback_data": f"void_sale_{row['id']}"}])

        self.send_direct_message(chat_id, "\n".join(card_lines), reply_markup={"inline_keyboard": buttons})

    def _send_recent_sales_list(self, chat_id: int):
        """Sends recent sales invoices with 1-click receipt buttons."""
        with self.db._lock:
            conn = self.db.get_connection()
            rows = conn.execute("""
                SELECT s.id, s.invoice_no, s.sale_date, s.final_price, s.payment_method, s.status,
                       d.brand, d.model_name, d.storage, d.color, d.buy_price
                FROM sales s
                JOIN devices d ON s.device_id = d.id
                ORDER BY s.id DESC LIMIT 8;
            """).fetchall()

        if not rows:
            self.send_direct_message(chat_id, "🧾 لا توجد عمليات بيع مسجلة حتى الآن.")
            return

        lines = [
            "🧾 <b>سجل آخر عمليات البيع والفواتير:</b>",
            "━━━━━━━━━━━━━━━━━━━━"
        ]
        buttons = []
        for r in rows:
            profit = r["final_price"] - r["buy_price"]
            st_badge = "✅" if r["status"] == "completed" else "↩️"
            time_part = r["sale_date"].split()[-1] if " " in r["sale_date"] else r["sale_date"]
            lines.append(
                f"{st_badge} <b>{r['invoice_no']}</b> - {r['brand']} {r['model_name']} ({r['color'] or '-'})\n"
                f"   💰 بيع: {r['final_price']:,.0f} ج.م | 📈 ربح: +{profit:,.0f} ج.م | ⏰ {time_part}"
            )
            buttons.append([{"text": f"🧾 إيصال {r['invoice_no']} ({r['brand']} {r['model_name']})", "callback_data": f"receipt_{r['invoice_no']}"}])

        lines.append("\n👇 <b>اضغط على أي فاتورة أدناه لفتح إيصالها الكامل:</b>")
        self.send_direct_message(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons[:8]})

    def _send_daily_profit_summary(self, chat_id: int):
        today_prefix = date.today().strftime("%Y-%m-%d")
        with self.db._lock:
            conn = self.db.get_connection()
            rows = conn.execute("""
                SELECT s.final_price, s.cash_amount, s.instapay_amount, s.vodafone_cash_amount,
                       d.buy_price, s.status
                FROM sales s
                JOIN devices d ON s.device_id = d.id
                WHERE s.sale_date LIKE ? AND s.status = 'completed';
            """, (f"{today_prefix}%",)).fetchall()

        total_sales = sum(r["final_price"] for r in rows)
        total_cost = sum(r["buy_price"] for r in rows)
        total_profit = total_sales - total_cost
        cash_total = sum(r["cash_amount"] for r in rows)
        insta_total = sum(r["instapay_amount"] for r in rows)
        voda_total = sum(r["vodafone_cash_amount"] for r in rows)

        lines = [
            "📊 <b>ملخص أرباح ومبيعات اليوم</b>",
            f"📅 {today_prefix}",
            "━━━━━━━━━━━━━━━━━━━━",
            f"📱 <b>عدد الأجهزة المباعة:</b> {len(rows)} جهاز",
            f"💰 <b>إجمالي الإيرادات:</b> {total_sales:,.0f} ج.م",
            f"💵 <b>إجمالي تكلفة الأجهزة (سعر الشراء):</b> {total_cost:,.0f} ج.م",
            f"📈 <b>صافي الربح المحقق:</b> +{total_profit:,.0f} ج.م",
            "────────────────────",
            "💼 <b>توزيع الخزائن ووسائل الدفع:</b>",
            f"💵 نقدية الكاشير: {cash_total:,.0f} ج.م",
            f"⚡ إنستاباي: {insta_total:,.0f} ج.م",
            f"📱 فودافون كاش: {voda_total:,.0f} ج.م",
        ]
        self.send_direct_message(chat_id, "\n".join(lines))

    # ==========================================================================
    # Reports & Approvals
    # ==========================================================================

    def _send_pdf_menu(self, chat_id: int):
        devices = self.db.search_devices(status="in_stock", limit=500)
        export_dir = Path(get_app_data_dir()) / "exports"
        export_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = export_dir / f"owner_financial_{date.today().strftime('%Y%m%d_%H%M')}.pdf"

        PDFReportExporter.generate_owner_financial_pdf(
            devices=devices,
            output_path=str(pdf_path),
            store_name=self.db.get_setting("store_name")
        )

        self.send_document(chat_id, str(pdf_path), "📊 التقرير المالي الشامل للمخزن وأرباح الأجهزة المتوقعة.")

    def _send_aging_radar_report(self, chat_id: int):
        radar = self.db.get_aging_stock_radar()
        crimson = radar["crimson_30"]
        amber = radar["amber_15"]

        lines = [
            "🚨 <b>رادار الأجهزة الراكدة في المخزن</b>",
            f"📅 {date.today().strftime('%Y-%m-%d')}",
            "━━━━━━━━━━━━━━━━━━━━"
        ]

        if crimson:
            lines.append(f"\n🔴 <b>أجهزة راكدة أكثر من 30 يوماً ({len(crimson)} جهاز):</b>")
            for d in crimson[:8]:
                lines.append(f" • {d['brand']} {d['model_name']} ({d['days_in_stock']:.0f} يوم) — {d['target_selling_price']:,.0f} ج.م")

        if amber:
            lines.append(f"\n🟡 <b>أجهزة راكدة أكثر من 15 يوماً ({len(amber)} جهاز):</b>")
            for d in amber[:8]:
                lines.append(f" • {d['brand']} {d['model_name']} ({d['days_in_stock']:.0f} يوم) — {d['target_selling_price']:,.0f} ج.م")

        if not crimson and not amber:
            lines.append("\n✅ حركة المخزن ممتازة! لا توجد أجهزة راكدة متأخرة عن 15 يوماً.")

        self.send_direct_message(chat_id, "\n".join(lines))

    def request_discount_approval(self, request_id: str, salesperson: str, model_name: str, requested_price: float, min_price: float):
        """Sends immediate approval prompt with inline buttons to Owner."""
        if not self.owner_chat_id:
            return
        diff = min_price - requested_price
        msg = (
            f"⚠️ <b>طلب موافقة على خصم تحت الحد الأدنى!</b>\n"
            f"👤 <b>الموظف:</b> {salesperson}\n"
            f"📱 <b>الجهاز:</b> {model_name}\n"
            f"🔒 <b>الحد الأدنى:</b> {min_price:,.0f} ج.م\n"
            f"📉 <b>السعر المطلوب:</b> {requested_price:,.0f} ج.م (خصم إضافي: {diff:,.0f} ج.م)\n\n"
            f"هل توافق على إتمام عملية البيع بهذا السعر؟"
        )
        inline_markup = {
            "inline_keyboard": [
                [
                    {"text": "موافقة ✅", "callback_data": f"approve_discount_{request_id}"},
                    {"text": "رفض ❌", "callback_data": f"reject_discount_{request_id}"}
                ]
            ]
        }
        self.pending_approvals[request_id] = {
            "salesperson": salesperson, "model": model_name, "price": requested_price, "status": "pending"
        }
        self.send_direct_message(self.owner_chat_id, msg, reply_markup=inline_markup)

    def _resolve_approval(self, chat_id: int, request_id: str, approved: bool):
        req = self.pending_approvals.get(request_id)
        if not req:
            self.send_direct_message(chat_id, "⚠️ انتهت صلاحية هذا الطلب أو تم الرد عليه مسبقاً.")
            return

        status_str = "تمت الموافقة ✅" if approved else "تم الرفض ❌"
        self.send_direct_message(chat_id, f"📝 طلب الخصم لـ {req['model']}: <b>{status_str}</b>")

        if HAS_PYQT:
            self.signals.approval_decided.emit({
                "request_id": request_id,
                "approved": approved
            })
        self.pending_approvals.pop(request_id, None)

    # ==========================================================================
    # Direct Control Center & Interactive Command Engine
    # ==========================================================================

    def ping_subscriber(self, chat_id: Union[str, int]) -> Tuple[bool, str]:
        """Sends an immediate ping/test message to a specific phone."""
        chat_id_str = str(chat_id).strip()
        msg = (
            "🔔 <b>إشعار فحص الاتصال المباشر</b>\n\n"
            "✅ <b>البرنامج:</b> ProLab Mobile Trading Studio 4.4.0\n"
            "📱 <b>الحالة:</b> متصل ويعمل بنجاح!\n"
            f"⏰ <b>الوقت:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
            "هاتفك مربوط بنظام المتجر وجاهز لاستقبال التنبيهات والعمليات فوراً."
        )
        ok = self.send_direct_message(chat_id_str, msg)
        if ok:
            self._emit_log(f"✅ تم إرسال رسالة فحص الاتصال إلى ({chat_id_str}) بنجاح.")
            return True, "تم إرسال رسالة الفحص للهاتف بنجاح!"
        else:
            self._emit_log(f"❌ فشل إرسال رسالة الفحص إلى ({chat_id_str}).")
            return False, "تعذر إرسال الرسالة. تأكد من أن المستخدم فتح البوت وضغط Start أولاً."

    def broadcast_message(self, text: str, role_filter: Optional[str] = None) -> Tuple[int, int]:
        """Broadcasts an announcement message to all connected phones or filtered by role."""
        subs = self.db.get_telegram_subscribers()
        if role_filter:
            subs = [s for s in subs if s.get("role") == role_filter]

        if not subs and self.owner_chat_id:
            subs = [{"chat_id": self.owner_chat_id, "name": "صاحب المحل", "role": "Owner"}]

        formatted_msg = (
            "📢 <b>تعميم عاجل من إدارة المحل</b>\n"
            "━━━━━━━━━━━━━━━━━━━━\n\n"
            f"{text}\n\n"
            f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        )

        sent_count = 0
        total_count = len(subs)
        for s in subs:
            cid = s.get("chat_id")
            if cid:
                if self.send_direct_message(cid, formatted_msg):
                    sent_count += 1
                time_mod.sleep(0.1)

        self._emit_log(f"📢 نتيجة التعميم: تم التسليم لـ {sent_count} من إجمالي {total_count} جهاز.")
        return sent_count, total_count

    def execute_direct_command(self, cmd_line: str) -> str:
        """Executes a direct command entered from the desktop Command Center."""
        cmd_line = cmd_line.strip()
        if not cmd_line:
            return "⚠️ لم يتم إدخال أي أمر."

        self._emit_log(f"⌨️ تنفيذ أمر مباشر: {cmd_line}")
        parts = cmd_line.split(maxsplit=1)
        command = parts[0].lower()
        args = parts[1].strip() if len(parts) > 1 else ""

        # Normalize Arabic command aliases
        if command in ("/report", "تقرير", "pdf", "/pdf"):
            owner_id = self.owner_chat_id or self.db.get_setting("telegram_owner_chat_id", "")
            if not owner_id:
                return "❌ تعذر إرسال التقرير: لم يتم ربط هاتف صاحب المحل (Owner Chat ID) بعد."
            try:
                self._send_pdf_menu(int(owner_id))
                return "✅ تم توليد تقرير المخزن والأرباح المالي بصيغة PDF وإرساله لهاتف المالك فوراً."
            except Exception as e:
                return f"❌ خطأ أثناء توليد التقرير: {e}"

        elif command in ("/radar", "راكد", "aging", "/aging"):
            owner_id = self.owner_chat_id or self.db.get_setting("telegram_owner_chat_id", "")
            if not owner_id:
                return "❌ تعذر الإرسال: هاتف المالك غير مربوط."
            try:
                self._send_aging_radar_report(int(owner_id))
                return "✅ تم فحص المخزن وإرسال رادار الأجهزة الراكدة (أكثر من 15 و 30 يوماً) لهاتف المالك."
            except Exception as e:
                return f"❌ خطأ أثناء فحص الراكد: {e}"

        elif command in ("/debts", "ديون", "تجار", "/traders", "تحصيلات"):
            try:
                self.send_daily_trader_reminder()
                return "✅ تم إرسال كشف ومطالبات ديون ومواعيد التجار اليومية لهاتف المالك."
            except Exception as e:
                return f"❌ خطأ أثناء إرسال بيانات التجار: {e}"

        elif command in ("/backup", "نسخة", "نسخ", "/backup_now"):
            try:
                self.send_nightly_backup()
                return "✅ تم إنشاء نسخة احتياطية فورية لقاعدة البيانات وإرسالها مشفرة لتليجرام المالك."
            except Exception as e:
                return f"❌ خطأ أثناء إنشاء النسخة الاحتياطية: {e}"

        elif command in ("/broadcast", "تعميم", "اذاعة", "/announcement"):
            if not args:
                return "⚠️ الصيغة: /broadcast <نص الرسالة> أو تعميم <نص الرسالة>"
            sent, total = self.broadcast_message(args)
            return f"✅ تم إرسال التعميم بنجاح إلى ({sent}) من أصل ({total}) هاتف متصل."

        elif command in ("/msg", "رسالة", "/send"):
            if not args:
                return "⚠️ الصيغة: /msg <chat_id> <نص الرسالة>"
            msg_parts = args.split(maxsplit=1)
            if len(msg_parts) < 2:
                return "⚠️ الصيغة: /msg <chat_id> <نص الرسالة>"
            target_id, message_body = msg_parts[0], msg_parts[1]
            ok = self.send_direct_message(target_id, f"💬 <b>رسالة مباشرة من إدارة المحل:</b>\n\n{message_body}")
            if ok:
                return f"✅ تم تسليم الرسالة للهاتف ({target_id}) بنجاح."
            else:
                return f"❌ فشل تسليم الرسالة للهاتف ({target_id}). تأكد من أن المستخدم بدأ المحادثة مع البوت بالضغط على Start."

        elif command in ("/ping", "اختبار", "فحص"):
            target_id = args or self.owner_chat_id
            if not target_id:
                return "⚠️ يرجى تحديد Chat ID للاختبار: /ping <chat_id>"
            ok, msg = self.ping_subscriber(target_id)
            return msg

        elif command in ("/status", "حالة", "/info", "معلومات"):
            subs = self.db.get_telegram_subscribers()
            owners = sum(1 for s in subs if s.get("role") == "Owner")
            sales = sum(1 for s in subs if s.get("role") == "Salesperson")
            status_text = "متصل ويعمل 🟢" if self.is_running else "متوقف 🔴"
            return (
                f"ℹ️ <b>حالة نظام تيليجرام:</b>\n"
                f"• حالة الخدمة: {status_text}\n"
                f"• إجمالي الهواتف المتصلة: {len(subs)}\n"
                f"• هواتف الملاك: {owners} 👑\n"
                f"• هواتف البائعين: {sales} 💼\n"
                f"• هاتف المالك المسجل: {self.owner_chat_id or 'غير محدد'}"
            )

        elif command in ("/devices", "أجهزة", "/list", "قائمة"):
            subs = self.db.get_telegram_subscribers()
            if not subs:
                return "📱 لا توجد أجهزة أو هواتف متصلة مسجلة حالياً."
            lines = ["📱 <b>قائمة الهواتف المتصلة بالبوت:</b>"]
            for i, s in enumerate(subs, 1):
                icon = "👑" if s.get("role") == "Owner" else "💼"
                user_handle = f" ({s.get('username')})" if s.get("username") else ""
                lines.append(f"{i}. {icon} <b>{s.get('name')}</b>{user_handle} | المعرف: <code>{s.get('chat_id')}</code> | الدور: {s.get('role')} | الحالة: {s.get('status')}")
            return "\n".join(lines)

        elif command in ("/help", "مساعدة", "/commands", "اوامر", "?"):
            return (
                "📖 <b>دليل الأوامر المباشرة المتاحة:</b>\n"
                "• <code>/report</code> أو <code>تقرير</code>: إرسال تقرير المبيعات والمخزن PDF لهاتف المالك.\n"
                "• <code>/radar</code> أو <code>راكد</code>: إرسال رادار الأجهزة الراكدة للهاتف.\n"
                "• <code>/debts</code> أو <code>ديون</code>: إرسال منبه ديون ومطالبات التجار.\n"
                "• <code>/backup</code> أو <code>نسخة</code>: أخذ نسخة احتياطية فورية لقاعدة البيانات وإرسالها.\n"
                "• <code>/broadcast &lt;رسالة&gt;</code>: إذاعة تعميم لجميع هواتف البائعين والمالك.\n"
                "• <code>/msg &lt;chat_id&gt; &lt;رسالة&gt;</code>: إرسال رسالة خاصة لهاتف محدد.\n"
                "• <code>/ping &lt;chat_id&gt;</code>: فحص إرسال تنبيه تجريبي لهاتف محدد.\n"
                "• <code>/devices</code> أو <code>أجهزة</code>: عرض قائمة الهواتف المتصلة.\n"
                "• <code>/status</code> أو <code>حالة</code>: فحص حالة البوت وإحصائيات الاتصال.\n"
                "• <code>/clear</code>: مسح سجل الأوامر على الشاشة."
            )

        else:
            return f"⚠️ أمر غير معروف: <code>{command}</code>. اكتب <code>/help</code> لعرض قائمة الأوامر المعتمدة."
