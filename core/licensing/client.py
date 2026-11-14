"""
core/licensing/client.py — Desktop Licensing Coordinator & API Client
Coordinates authentication, device registration, offline verification,
tamper detection, online heartbeats, and offline grace periods.
"""
import os
from pathlib import Path
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
import requests

from core.licensing.machine_id import get_installation_id, get_device_metadata
from core.licensing.license_verifier import LicenseVerifier, LicenseStatusInfo
from core.licensing.license_cache import LicenseCacheManager
from core.paths import get_app_data_dir

logger = logging.getLogger("thermal_lab.licensing.client")

DEFAULT_SERVER_URL = os.environ.get("THERMALLAB_SERVER_URL", "http://127.0.0.1:8000")


ARABIC_INDIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def ensure_local_server_running(server_url: str = DEFAULT_SERVER_URL) -> bool:
    """Checks if local licensing server is responding on port 8000; if not, attempts to spawn it silently."""
    if "127.0.0.1" not in server_url and "localhost" not in server_url:
        return False
    import socket, subprocess, sys, time, shutil
    from pathlib import Path

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.4)
            if s.connect_ex(("127.0.0.1", 8000)) == 0:
                return True
    except Exception:
        pass

    py_candidates = [
        r"C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\python.exe",
        shutil.which("python"),
        shutil.which("python3"),
        sys.executable,
    ]
    py_exe = None
    for cand in py_candidates:
        if cand and os.path.exists(cand) and "python" in os.path.basename(cand).lower():
            py_exe = cand
            break

    candidates_dir = [
        r"C:\Users\Eng_Ahmed\Desktop\label",
        os.getcwd(),
        str(Path(__file__).resolve().parent.parent.parent),
        str(Path(sys.executable).parent.resolve()),
    ]
    proj_dir = None
    for d in candidates_dir:
        if os.path.exists(os.path.join(d, "server", "main.py")):
            proj_dir = d
            break

    if not py_exe or not proj_dir:
        return False

    CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0
    cmd = [py_exe, "-m", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
    try:
        subprocess.Popen(cmd, cwd=proj_dir, creationflags=CREATE_NO_WINDOW, close_fds=True)
        for _ in range(10):
            time.sleep(0.5)
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.4)
                if s.connect_ex(("127.0.0.1", 8000)) == 0:
                    logger.info("Auto-spawned local licensing server successfully.")
                    return True
    except Exception as e:
        logger.debug("Failed spawning local server: %s", e)
    return False


def _format_network_error(e: Exception) -> str:
    err_str = str(e)
    if "10061" in err_str or "actively refused" in err_str or "Max retries" in err_str:
        return "تعذر الاتصال بخادم التراخيص: السيرفر المركزي غير قيد التشغيل حالياً (Connection Refused).\nتأكد من تشغيل ThermalLabPro Central Server."
    if "timed out" in err_str.lower() or "timeout" in err_str.lower():
        return "انتهت مهلة الاتصال بخادم التراخيص. يرجى التحقق من سرعة الإنترنت."
    return f"تعذر الاتصال بالخادم: {err_str}"


def _format_api_error(detail: Any) -> str:
    """Safely converts any FastAPI or server error detail into a user-friendly Arabic string."""
    if not detail:
        return "حدث خطأ غير معروف."
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        errors = []
        for item in detail:
            if isinstance(item, dict):
                loc = item.get("loc", [])
                field_name = loc[-1] if loc else ""
                field_map = {
                    "password": "كلمة المرور",
                    "confirm_password": "تأكيد كلمة المرور",
                    "username": "اسم المستخدم",
                    "phone_number": "رقم الهاتف",
                    "full_name": "الاسم الكامل",
                    "shop_name": "اسم المحل",
                    "city": "المحافظة",
                    "accept_terms": "الموافقة على الشروط",
                    "license_key": "مفتاح الترخيص",
                    "otp_code": "رمز التحقق",
                }
                arabic_name = field_map.get(str(field_name), str(field_name))
                msg = item.get("msg", "")
                if "at least 8 characters" in msg or "at least 6 characters" in msg:
                    errors.append(f"• {arabic_name}: يجب ألا تقل عن 6 خانات.")
                elif "pattern" in msg or "match pattern" in msg:
                    errors.append(f"• {arabic_name}: صيغة غير صالحة. يرجى استخدام أحرف وأرقام فقط.")
                elif "passwords_match" in str(item.get("type", "")):
                    errors.append("• كلمة المرور وتأكيد كلمة المرور غير متطابقين.")
                else:
                    errors.append(f"• {arabic_name}: {msg}")
            else:
                errors.append(f"• {str(item)}")
        return "\n".join(errors) if errors else "حدث خطأ في البيانات المدخلة."
    if isinstance(detail, dict):
        return str(detail.get("msg") or detail.get("message") or detail.get("detail") or detail)
    return str(detail)


class LicensingClient:
    """Coordinates all licensing operations on the desktop ERP client."""

    def __init__(self, server_url: Optional[str] = None):
        self.server_url = (server_url or DEFAULT_SERVER_URL).rstrip("/")
        self.verifier = LicenseVerifier()
        self.cache = LicenseCacheManager()
        self.device_id = get_installation_id()
        self._auth_token: Optional[str] = None
        self._customer_data: Optional[Dict[str, Any]] = None
        self.load_session()

    # -------------------------------------------------------------
    # Session Persistence & Profile Management
    # -------------------------------------------------------------

    def _get_session_path(self):
        return get_app_data_dir() / "customer_session.json"

    def save_session(self, data: Dict[str, Any]):
        """Persists customer JWT and profile metadata locally."""
        try:
            p = self._get_session_path()
            p.parent.mkdir(parents=True, exist_ok=True)
            self._auth_token = data.get("access_token") or self._auth_token
            # Store customer dict
            cust = data.get("customer") or self._customer_data or {}
            if not cust:
                cust = {
                    "user_id": data.get("user_id"),
                    "customer_id": data.get("customer_id") or data.get("user_id"),
                    "username": data.get("username"),
                    "role": data.get("role"),
                    "shop_name": data.get("shop_name") or "",
                    "account_status": data.get("account_status") or "ACTIVE"
                }
            self._customer_data = cust
            payload = {
                "access_token": self._auth_token,
                "customer": self._customer_data,
                "stay_logged_in": data.get("stay_logged_in", True),
                "saved_at": datetime.now(timezone.utc).isoformat()
            }
            with open(p, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            logger.info("Saved customer session locally to %s", p)

            # Mirror to alternative location (e.g. data/ folder in project dir)
            try:
                alt_dir = Path("data").resolve()
                alt_dir.mkdir(parents=True, exist_ok=True)
                alt_p = alt_dir / "customer_session.json"
                if alt_p != p:
                    with open(alt_p, "w", encoding="utf-8") as f:
                        json.dump(payload, f, ensure_ascii=False, indent=2)
            except Exception:
                pass
        except Exception as e:
            logger.warning("Failed saving customer session: %s", e)

    def load_session(self) -> Optional[Dict[str, Any]]:
        """Loads remembered customer session if available."""
        paths = [self._get_session_path(), Path("data/customer_session.json").resolve()]
        for p in paths:
            try:
                if p.exists():
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if data.get("stay_logged_in", True):
                        self._auth_token = data.get("access_token")
                        self._customer_data = data.get("customer")
                        return data
            except Exception as e:
                logger.debug("Could not load session from %s: %s", p, e)
        return None

    def clear_session(self):
        """Clears local session on logout."""
        self._auth_token = None
        self._customer_data = None
        try:
            p = self._get_session_path()
            if p.exists():
                p.unlink()
            logger.info("Cleared customer session file %s", p)
        except Exception as e:
            logger.warning("Error clearing session: %s", e)

    def is_logged_in(self) -> bool:
        return bool(self._auth_token and self._customer_data and (self._customer_data.get("username") or self._customer_data.get("customer_id")))

    def get_customer_profile(self) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """Fetches full customer profile from central server."""
        if not self._auth_token:
            return False, "غير مسجل الدخول.", None

        url = f"{self.server_url}/api/v1/customer/profile"
        headers = {"Authorization": f"Bearer {self._auth_token}"}
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                profile = resp.json()
                self._customer_data = profile
                self.save_session({"access_token": self._auth_token, "customer": profile})

                # If license key exists on server profile, verify or activate locally
                lic_key = profile.get("license_key")
                if lic_key:
                    st = self.get_license_status()
                    if not st.is_valid or st.status in ("MISSING", "EXPIRED"):
                        self.activate_online(profile.get("customer_id"), lic_key)

                return True, "تم جلب بيانات الحساب بنجاح.", profile
            return False, resp.json().get("detail", "تعذر جلب الملف الشخصي."), None
        except Exception as e:
            return False, _format_network_error(e), None

    # -------------------------------------------------------------
    # Local & Offline Status Evaluation
    # -------------------------------------------------------------

    def get_license_status(self) -> LicenseStatusInfo:
        """
        Evaluates the local license state completely offline:
        1. Checks local cache and tests for clock rollback.
        2. Validates Ed25519 cryptographic signature.
        3. Checks hardware binding to this machine ID.
        4. Calculates remaining days and grace period.
        """
        token, clock_rollback = self.cache.get_token()

        if clock_rollback:
            return LicenseStatusInfo(
                is_valid=False,
                status="CLOCK_ROLLBACK_DETECTED",
                message="تم رصد تلاعب في توقيت النظام أو إرجاع ساعة الجهاز للخلف! يرجى ضبط الساعة الحقيقية والاتصال بالإنترنت للتحقق.",
                is_read_only=True
            )

        if not token:
            return LicenseStatusInfo(
                is_valid=False,
                status="MISSING",
                message="البرنامج غير مفعل على هذا الجهاز. يرجى تسجيل الدخول أو إدخال مفتاح الترخيص.",
                device_id=self.device_id,
                is_read_only=True
            )

        # Cryptographically evaluate token
        info = self.verifier.evaluate_license(token, self.device_id)
        return info

    def import_offline_license(self, package_content_or_path: str) -> Tuple[bool, str]:
        """
        Imports and activates an offline license package (.prolablic or JSON string).
        """
        try:
            content = package_content_or_path.strip()
            # If it's a file path, read file
            if os.path.exists(content):
                with open(content, "r", encoding="utf-8") as f:
                    content = f.read().strip()

            # Parse JSON
            data = json.loads(content)
            token = data.get("license_token") or data.get("token")
            pkg_device_id = data.get("device_id")

            if not token:
                return False, "ملف الترخيص غير صالح: لم يتم العثور على رمز الترخيص المشفر."

            # Verify signature
            valid, payload, err = self.verifier.verify_token_signature(token)
            if not valid or not payload:
                return False, f"توقيع ملف الترخيص غير صالح: {err}"

            # Verify hardware binding
            token_dev = payload.get("device_id")
            if token_dev and token_dev != self.device_id:
                return False, f"ملف الترخيص مخصص لجهاز آخر ({token_dev}). جهازك الحالي ({self.device_id})."

            # Save in secure cache
            self.cache.save_cache(token, self.device_id)
            logger.info("Successfully imported offline license for customer %s", payload.get("customer_id"))
            return True, "تم تفعيل الترخيص بدون اتصال بنجاح!"
        except Exception as e:
            logger.error("Failed importing offline license: %s", e)
            return False, f"حدث خطأ أثناء قراءة ملف الترخيص: {str(e)}"

    # -------------------------------------------------------------
    # Online Server Communication
    # -------------------------------------------------------------

    def _post_with_autostart(self, url: str, json_data: dict, timeout: int = 12) -> requests.Response:
        """Executes POST request; auto-starts local licensing server if offline and retries."""
        try:
            return requests.post(url, json=json_data, timeout=timeout)
        except Exception as e:
            err_str = str(e)
            if ("10061" in err_str or "actively refused" in err_str or "Max retries" in err_str) and ("127.0.0.1" in self.server_url or "localhost" in self.server_url):
                if ensure_local_server_running(self.server_url):
                    return requests.post(url, json=json_data, timeout=timeout)
            raise e

    def request_otp(self, phone: str) -> Tuple[bool, str, Optional[str], Optional[str]]:
        """Requests an SMS / WhatsApp OTP verification code, returning (success, message, debug_otp, whatsapp_url)."""
        url = f"{self.server_url}/api/v1/auth/send-otp"
        clean_p = str(phone).translate(ARABIC_INDIC_DIGITS).strip()
        try:
            resp = self._post_with_autostart(url, {"phone_number": clean_p}, timeout=10)
            data = resp.json() if resp.content else {}
            if resp.status_code == 200 and data.get("success"):
                debug_otp = data.get("debug_otp")
                whatsapp_url = data.get("whatsapp_url")
                return True, data.get("message", "تم توليد كود التحقق بنجاح."), debug_otp, whatsapp_url
            err_msg = _format_api_error(data.get("detail") or data.get("message") or "فشل إرسال كود التحقق.")
            return False, err_msg, None, None
        except Exception as e:
            return False, _format_network_error(e), None, None

    def verify_otp(self, phone: str, otp_code: str) -> Tuple[bool, str]:
        """Submits and validates an OTP code."""
        url = f"{self.server_url}/api/v1/auth/verify-otp"
        clean_p = str(phone).translate(ARABIC_INDIC_DIGITS).strip()
        clean_otp = str(otp_code).translate(ARABIC_INDIC_DIGITS).strip()
        try:
            resp = self._post_with_autostart(url, {"phone_number": clean_p, "otp_code": clean_otp}, timeout=10)
            data = resp.json() if resp.content else {}
            if resp.status_code == 200 and data.get("success"):
                return True, data.get("message", "تم تأكيد رقم الهاتف بنجاح.")
            err_msg = _format_api_error(data.get("detail") or data.get("message") or "كود التحقق غير صحيح أو منتهي الصلاحية.")
            return False, err_msg
        except Exception as e:
            return False, _format_network_error(e)

    def register(self, reg_data: Dict[str, Any]) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """Submits new customer account self-registration."""
        url = f"{self.server_url}/api/v1/auth/register"
        # Normalize keys to match RegisterRequest schema
        normalized = dict(reg_data)
        if "shop_name" not in normalized and "business_name" in normalized:
            normalized["shop_name"] = normalized["business_name"]
        if "phone_number" not in normalized and "phone" in normalized:
            normalized["phone_number"] = normalized["phone"]
        if "confirm_password" not in normalized and "password" in normalized:
            normalized["confirm_password"] = normalized["password"]
        if "accept_terms" not in normalized and "terms_accepted" in normalized:
            normalized["accept_terms"] = normalized["terms_accepted"]

        if "phone_number" in normalized:
            normalized["phone_number"] = str(normalized["phone_number"]).translate(ARABIC_INDIC_DIGITS).strip()
        if "otp_code" in normalized and normalized["otp_code"]:
            normalized["otp_code"] = str(normalized["otp_code"]).translate(ARABIC_INDIC_DIGITS).strip()
        if "license_key" in normalized and normalized["license_key"]:
            normalized["license_key"] = str(normalized["license_key"]).translate(ARABIC_INDIC_DIGITS).strip().upper()

        try:
            resp = self._post_with_autostart(url, normalized, timeout=15)
            data = resp.json() if resp.content else {}
            if resp.status_code == 201:
                return True, data.get("message", "تم إنشاء الحساب بنجاح."), data
            err_msg = _format_api_error(data.get("detail") or data.get("message") or "فشل إنشاء الحساب.")
            return False, err_msg, None
        except Exception as e:
            return False, _format_network_error(e), None

    def login(self, username_or_phone: str, password: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """Logs into customer account and stores JWT token."""
        url = f"{self.server_url}/api/v1/auth/login"
        clean_user = str(username_or_phone).translate(ARABIC_INDIC_DIGITS).strip()
        payload = {
            "username_or_phone": clean_user,
            "password": password
        }
        try:
            resp = self._post_with_autostart(url, payload, timeout=12)
            data = resp.json() if resp.content else {}
            if resp.status_code == 200:
                self._auth_token = data.get("access_token")
                cust = data.get("customer")
                if not cust:
                    cust = {
                        "user_id": data.get("user_id"),
                        "customer_id": data.get("customer_id") or data.get("user_id"),
                        "username": data.get("username"),
                        "role": data.get("role"),
                        "shop_name": data.get("shop_name") or "",
                        "account_status": data.get("account_status") or "ACTIVE"
                    }
                self._customer_data = cust
                return True, "تم تسجيل الدخول بنجاح.", data
            err_msg = _format_api_error(data.get("detail") or data.get("message") or "فشل تسجيل الدخول.")
            return False, err_msg, None
        except Exception as e:
            return False, _format_network_error(e), None

    def activate_online(
        self,
        customer_id: Optional[str],
        license_key: str,
        device_name: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Activates this machine online using license key.
        Binds device ID and saves signed token in cache.
        """
        url = f"{self.server_url}/api/v1/licensing/activate"
        metadata = get_device_metadata()
        clean_key = str(license_key).translate(ARABIC_INDIC_DIGITS).strip().upper()
        payload = {
            "license_key": clean_key,
            "device_id": self.device_id,
            "device_name": device_name or metadata.get("hostname", "Workstation"),
            "os_info": metadata.get("os_release", "Windows"),
            "app_version": "4.7.0"
        }
        if customer_id:
            payload["customer_id"] = str(customer_id).strip()

        try:
            resp = self._post_with_autostart(url, payload, timeout=15)
            data = resp.json() if resp.content else {}
            if resp.status_code == 200 and data.get("success"):
                token = data.get("signed_token") or data.get("license_token")
                if token:
                    self.cache.save_cache(token, self.device_id)
                return True, "تم تفعيل الترخيص وربط الجهاز بنجاح!", data
            err_msg = _format_api_error(data.get("detail") or data.get("message") or "فشل تفعيل الترخيص.")
            return False, err_msg, None
        except Exception as e:
            return False, f"تعذر الاتصال بالخادم أثناء التفعيل: {str(e)}", None

    def activate_trial(
        self,
        customer_id: Optional[str] = None,
        username_or_phone: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Activates a 14-day free trial on the central server for this device.
        """
        url = f"{self.server_url}/api/v1/licensing/activate-trial"
        metadata = get_device_metadata()
        payload = {
            "customer_id": customer_id,
            "username_or_phone": username_or_phone,
            "device_id": self.device_id,
            "device_name": metadata.get("hostname", "Workstation"),
            "os_info": metadata.get("os_release", "Windows"),
            "app_version": "4.7.0"
        }
        try:
            resp = self._post_with_autostart(url, payload, timeout=15)
            data = resp.json() if resp.content else {}
            if resp.status_code == 200 and data.get("success"):
                token = data.get("signed_token") or data.get("license_token")
                if token:
                    self.cache.save_cache(token, self.device_id)
                return True, "تم تفعيل باقة التجربة المجانية (14 يوماً) بنجاح!", data
            err_msg = _format_api_error(data.get("detail") or data.get("message") or "فشل تفعيل التجربة المجانية.")
            return False, err_msg, None
        except Exception as e:
            return False, _format_network_error(e), None

    def sync_heartbeat(self) -> Tuple[bool, str]:
        """
        Sends heartbeat validation to server.
        If renewed or extended on server, updates local cached token seamlessly.
        """
        url = f"{self.server_url}/api/v1/licensing/validate"
        cached_token, rollback = self.cache.get_token()
        if not cached_token or rollback:
            return False, "لا يوجد ترخيص صالح للمزامنة"

        # Extract license key from cached token
        lic_key = ""
        try:
            valid, token_data, _ = self.verifier.verify_token_signature(cached_token)
            if valid and token_data:
                lic_key = token_data.get("license_key", "")
        except Exception:
            pass

        payload = {
            "license_key": lic_key,
            "device_id": self.device_id,
            "token": cached_token,
            "app_version": "4.7.0"
        }
        try:
            resp = self._post_with_autostart(url, payload, timeout=8)
            data = resp.json()
            if resp.status_code == 200 and data.get("valid"):
                # If server sent refreshed token, update cache
                new_token = data.get("signed_token") or data.get("license_token")
                if new_token and new_token != cached_token:
                    self.cache.save_cache(new_token, self.device_id)
                    logger.info("Updated cached license token with newly issued server token.")
                return True, "تمت المزامنة بنجاح."
            return False, data.get("message", "الترخيص غير صالح على الخادم.")
        except Exception as e:
            logger.debug("Heartbeat skipped (offline or unreachable): %s", e)
            return False, f"الخادم غير متاح حالياً: {e}"


# Singleton instance for the desktop ERP process
_client_instance: Optional[LicensingClient] = None


def get_licensing_client() -> LicensingClient:
    global _client_instance
    if _client_instance is None:
        _client_instance = LicensingClient()
    return _client_instance
