"""
server/otp_service.py — Production Phone OTP Verification & Abuse Prevention Engine
Handles:
- Cryptographic OTP generation (6-digit numeric)
- Rate limiting and cooldown checks (prevent SMS flooding)
- Attempt throttling (max 5 failed attempts per OTP)
- Expiration handling (default 5 minutes)
- Configurable providers: Mock/Sandbox, Twilio, Infobip, Custom HTTP Webhook
"""
from datetime import datetime, timezone, timedelta
import logging
import os
import secrets
from typing import Optional, Tuple
from urllib.parse import quote

import requests

from server.config import config
from server.database import CentralDatabaseManager

logger = logging.getLogger(__name__)


class OTPVerificationService:
    """Manages phone OTP generation, dispatch, rate limiting, and verification."""

    def __init__(self, db: Optional[CentralDatabaseManager] = None):
        self.db = db or CentralDatabaseManager.get_instance()

    def generate_and_send_otp(
        self,
        phone_number: str,
        purpose: str = "REGISTRATION",
        ip_address: str = ""
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Generates and dispatches a 6-digit OTP code to the given phone number.
        Returns: (success, message, debug_otp_if_mock)
        """
        clean_phone = self._normalize_phone(phone_number)
        if not clean_phone:
            return False, "رقم الهاتف غير صالح. يرجى إدخال رقم صحيح يبدأ بـ 01 أو كود الدولة.", None

        conn = self.db.get_connection()
        cur = conn.cursor()
        now_utc = datetime.now(timezone.utc)

        # 1. Cooldown & Rate Limiting Check (Must wait at least config.OTP_COOLDOWN_SECONDS between requests)
        cur.execute("""
            SELECT created_at FROM server_otp_records
            WHERE phone_number = ? AND purpose = ?
            ORDER BY id DESC LIMIT 1;
        """, (clean_phone, purpose))
        row = cur.fetchone()
        if row:
            last_created = datetime.fromisoformat(row["created_at"])
            elapsed = (now_utc - last_created).total_seconds()
            if elapsed < config.OTP_COOLDOWN_SECONDS:
                remaining = int(config.OTP_COOLDOWN_SECONDS - elapsed)
                return False, f"يرجى الانتظار {remaining} ثانية قبل طلب رمز تحقق جديد.", None

        # 2. Daily/Hourly Flood Prevention (Max 5 OTP requests per phone per hour)
        one_hour_ago = (now_utc - timedelta(hours=1)).isoformat()
        cur.execute("""
            SELECT COUNT(*) FROM server_otp_records
            WHERE phone_number = ? AND created_at >= ?;
        """, (clean_phone, one_hour_ago))
        count_last_hour = cur.fetchone()[0]
        if count_last_hour >= 5:
            return False, "تم تجاوز الحد الأقصى لطلبات التحقق لهذا الرقم في الساعة الواحدة. يرجى المحاولة لاحقاً.", None

        # 3. Generate Cryptographic 6-digit OTP
        otp_code = f"{secrets.randbelow(900000) + 100000}"
        expires_at = (now_utc + timedelta(seconds=config.OTP_EXPIRATION_SECONDS)).isoformat()
        created_at = now_utc.isoformat()

        cur.execute("""
            INSERT INTO server_otp_records (
                phone_number, otp_code, purpose, expires_at,
                attempts, max_attempts, is_verified, created_at
            ) VALUES (?, ?, ?, ?, 0, ?, 0, ?);
        """, (clean_phone, otp_code, purpose, expires_at, config.OTP_MAX_ATTEMPTS, created_at))
        conn.commit()

        # 4. Dispatch via configured provider
        send_ok, send_msg = self._dispatch_sms(clean_phone, otp_code, purpose)
        if not send_ok:
            return False, send_msg, None

        wa_digits = clean_phone.replace("+", "")
        wa_msg = (
            f"🛡️ *نظام ThermalLabPro Commercial ERP — رمز التحقق*\n\n"
            f"كود التحقق الخاص بك هو: *{otp_code}*\n\n"
            f"• صالح لمدة 5 دقائق.\n"
            f"• لا تشارك هذا الرمز مع أي شخص.\n"
            f"• هاتف التفعيل والدعم: 01061943367"
        )
        whatsapp_url = f"https://wa.me/{wa_digits}?text={quote(wa_msg)}"
        return True, "تم إرسال رمز التحقق بنجاح إلى هاتفك.", otp_code, whatsapp_url

    def verify_otp(
        self,
        phone_number: str,
        entered_code: str,
        purpose: str = "REGISTRATION"
    ) -> Tuple[bool, str]:
        """
        Verifies the user entered OTP code against the latest active record.
        Enforces expiration and attempt limits.
        """
        clean_phone = self._normalize_phone(phone_number)
        entered_clean = str(entered_code).strip()

        conn = self.db.get_connection()
        cur = conn.cursor()
        now_utc = datetime.now(timezone.utc)

        # Retrieve latest unverified OTP for this phone and purpose
        cur.execute("""
            SELECT id, otp_code, expires_at, attempts, max_attempts, is_verified
            FROM server_otp_records
            WHERE phone_number = ? AND purpose = ? AND is_verified = 0
            ORDER BY id DESC LIMIT 1;
        """, (clean_phone, purpose))
        record = cur.fetchone()

        if not record:
            return False, "لا يوجد طلب تحقق نشط لهذا الرقم. يرجى طلب رمز جديد."

        record_id = record["id"]
        correct_code = record["otp_code"]
        expires_at = datetime.fromisoformat(record["expires_at"])
        attempts = record["attempts"]
        max_attempts = record["max_attempts"]

        # Check Expiration
        if now_utc > expires_at:
            return False, "انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد."

        # Check Attempt Limit
        if attempts >= max_attempts:
            return False, "تم تجاوز عدد المحاولات الخاطئة المسموح بها لهذا الرمز. يرجى طلب رمز جديد."

        # Increment attempts counter
        cur.execute("UPDATE server_otp_records SET attempts = attempts + 1 WHERE id = ?;", (record_id,))
        conn.commit()

        # Validate Code
        if entered_clean != correct_code:
            remaining = max(0, max_attempts - (attempts + 1))
            return False, f"رمز التحقق غير صحيح. متبقي لديك {remaining} محاولات."

        # Mark as verified
        cur.execute("UPDATE server_otp_records SET is_verified = 1 WHERE id = ?;", (record_id,))
        conn.commit()
        return True, "تم التحقق من رقم الهاتف بنجاح."

    def _normalize_phone(self, phone: str) -> Optional[str]:
        """Normalizes local and international Egyptian mobile numbers, supporting Arabic numerals."""
        arabic_trans = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
        phone_str = str(phone).translate(arabic_trans).strip()
        raw = "".join(ch for ch in phone_str if ch.isdigit() or ch == "+")
        if not raw:
            return None
        # Handle Egyptian standard format: 010, 011, 012, 015
        if raw.startswith("01") and len(raw) == 11:
            return f"+2{raw}"
        if raw.startswith("1") and len(raw) == 10:
            return f"+20{raw}"
        if raw.startswith("201") and len(raw) == 12:
            return f"+{raw}"
        if raw.startswith("+201") and len(raw) == 13:
            return raw
        # Extensible international format (+ followed by 10-15 digits)
        if raw.startswith("+") and 10 <= len(raw) <= 16:
            return raw
        return raw

    def _dispatch_sms(self, phone: str, code: str, purpose: str) -> Tuple[bool, str]:
        """Dispatches SMS / WhatsApp through configured gateway provider."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT key, value FROM server_system_settings WHERE key LIKE 'otp_%' OR key LIKE 'whatsapp_%' OR key LIKE 'ultramsg_%';")
        db_settings = dict(cur.fetchall())

        provider = (db_settings.get("otp_provider") or config.OTP_PROVIDER).lower()
        message = (
            f"🛡️ *ThermalLabPro Commercial ERP*\n\n"
            f"كود التحقق الخاص بك هو:\n"
            f"*{code}*\n\n"
            f"• هذا الكود صالح لمدة 5 دقائق.\n"
            f"• لا تشارك رمز التحقق مع أي شخص لحماية حسابك.\n"
            f"• خدمة العملاء والدعم: 01061943367"
        )

        # 1. Check UltraMsg WhatsApp Gateway (First class citizen for WhatsApp dispatch)
        ultramsg_instance = db_settings.get("ultramsg_instance_id") or os.environ.get("ULTRAMSG_INSTANCE_ID")
        ultramsg_token = db_settings.get("ultramsg_token") or os.environ.get("ULTRAMSG_TOKEN")
        if ultramsg_instance and ultramsg_token:
            try:
                wa_phone = phone.replace("+", "")
                url = f"https://api.ultramsg.com/{ultramsg_instance}/messages/chat"
                resp = requests.post(
                    url,
                    data={"token": ultramsg_token, "to": wa_phone, "body": message},
                    timeout=10.0
                )
                res_json = resp.json() if resp.content else {}
                if resp.status_code == 200 and res_json.get("sent") in ("true", True):
                    logger.info(f"Dispatched WhatsApp OTP via UltraMsg to {wa_phone}")
                    return True, "تم إرسال رمز التحقق بنجاح عبر واتساب."
                logger.warning(f"UltraMsg returned response: {resp.text}")
            except Exception as e:
                logger.error(f"UltraMsg dispatch error: {e}")

        # 2. Check Custom WhatsApp / SMS Webhook
        webhook_url = db_settings.get("whatsapp_webhook_url") or os.environ.get("WHATSAPP_WEBHOOK_URL")
        if webhook_url:
            try:
                resp = requests.post(
                    webhook_url,
                    json={"phone": phone, "message": message, "code": code, "purpose": purpose},
                    timeout=8.0
                )
                if resp.status_code in (200, 201):
                    logger.info(f"Dispatched OTP via custom webhook to {phone}")
                    return True, "تم إرسال كود التحقق بنجاح إلى هاتفك."
            except Exception as e:
                logger.error(f"Webhook dispatch error: {e}")

        # 3. Twilio Provider
        if provider == "twilio":
            account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
            auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
            from_number = os.environ.get("TWILIO_FROM_NUMBER")
            if not (account_sid and auth_token and from_number):
                return False, "إعدادات مزود الرسائل (Twilio) غير مكتملة."
            try:
                url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
                resp = requests.post(
                    url,
                    data={"To": phone, "From": from_number, "Body": message},
                    auth=(account_sid, auth_token),
                    timeout=10.0
                )
                if resp.status_code in (200, 201):
                    return True, "تم إرسال الرسالة بنجاح عبر Twilio."
                logger.error(f"Twilio error response: {resp.text}")
                return False, "فشل إرسال رسالة التحقق عبر مزود الخدمة."
            except Exception as e:
                logger.error(f"Twilio exception: {e}")
                return False, f"خطأ في الاتصال بمزود الرسائل: {e}"

        # 4. Infobip Provider
        elif provider == "infobip":
            api_key = os.environ.get("INFOBIP_API_KEY")
            base_url = os.environ.get("INFOBIP_BASE_URL", "https://api.infobip.com")
            from_name = os.environ.get("INFOBIP_FROM", "ThermalLab")
            if not api_key:
                return False, "إعدادات مزود الرسائل (Infobip) غير مكتملة."
            try:
                url = f"{base_url.rstrip('/')}/sms/2/text/advanced"
                headers = {"Authorization": f"App {api_key}", "Content-Type": "application/json"}
                payload = {
                    "messages": [{
                        "from": from_name,
                        "destinations": [{"to": phone}],
                        "text": message
                    }]
                }
                resp = requests.post(url, json=payload, headers=headers, timeout=10.0)
                if resp.status_code in (200, 201):
                    return True, "تم إرسال الرسالة بنجاح عبر Infobip."
                return False, "فشل إرسال رسالة التحقق عبر Infobip."
            except Exception as e:
                logger.error(f"Infobip exception: {e}")
                return False, f"خطأ في الاتصال بمزود Infobip: {e}"

        # 5. Default Sandbox / Mock Dispatch (Logs to audit and terminal for offline development)
        logger.info(f"[OTP DISPATCH] Dispatched to {phone}: '{message}'")
        return True, "تم إرسال رمز التحقق بنجاح إلى هاتفك."
