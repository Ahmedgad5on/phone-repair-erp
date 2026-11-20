"""
license_manager/api_client.py — Central Licensing API Client for License Manager
Communicates with the central backend over HTTPS/HTTP with JWT Bearer authentication.
"""
import json
import logging
from typing import Any, Dict, List, Optional, Tuple
import requests

logger = logging.getLogger(__name__)


class LicenseManagerAPIClient:
    """HTTP REST client for administrative operations on the licensing backend."""

    def __init__(self, base_url: str = "http://127.0.0.1:8000"):
        self.base_url = base_url.rstrip("/")
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.current_user: Optional[str] = None
        self.current_role: Optional[str] = None

    def set_base_url(self, url: str):
        self.base_url = url.rstrip("/")

    def _headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "ThermalLabPro-LicenseManager/1.0"
        }
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        return headers

    def login(self, username: str, password: str) -> Tuple[bool, str]:
        """Authenticates administrative staff with the licensing backend."""
        try:
            url = f"{self.base_url}/api/v1/auth/login"
            resp = requests.post(url, json={
                "username_or_phone": username.strip(),
                "password": password
            }, timeout=10.0)
            if resp.status_code == 200:
                data = resp.json()
                self.access_token = data.get("access_token")
                self.refresh_token = data.get("refresh_token")
                self.current_user = data.get("username")
                self.current_role = data.get("role")
                if self.current_role not in ("super_admin", "licensing_admin", "support_admin", "financial_admin"):
                    self.access_token = None
                    return False, "هذا الحساب ليس لديه صلاحيات إدارية لاستخدام مدير التراخيص."
                return True, "تم تسجيل الدخول بنجاح."
            err = resp.json().get("detail", "بيانات الدخول غير صحيحة.")
            return False, str(err)
        except Exception as e:
            err_str = str(e)
            if "10061" in err_str or "actively refused" in err_str or "Max retries" in err_str:
                return False, f"تعذر الاتصال بالخادم المركزي ({self.base_url}): خادم التراخيص غير قيد التشغيل حالياً على هذا المنفذ."
            return False, f"تعذر الاتصال بالخادم المركزي ({self.base_url}): {err_str}"

    def get_stats(self) -> Optional[Dict[str, Any]]:
        try:
            resp = requests.get(f"{self.base_url}/api/v1/admin/stats", headers=self._headers(), timeout=10.0)
            return resp.json() if resp.status_code == 200 else None
        except Exception as e:
            logger.error(f"get_stats error: {e}")
            return None

    def get_customers(self, search: str = "", status_filter: str = "") -> List[Dict[str, Any]]:
        try:
            url = f"{self.base_url}/api/v1/admin/customers?limit=200"
            if search:
                url += f"&search={requests.utils.quote(search)}"
            if status_filter:
                url += f"&status_filter={requests.utils.quote(status_filter)}"
            resp = requests.get(url, headers=self._headers(), timeout=10.0)
            return resp.json().get("customers", []) if resp.status_code == 200 else []
        except Exception as e:
            logger.error(f"get_customers error: {e}")
            return []

    def get_customer_details(self, customer_id: str) -> Optional[Dict[str, Any]]:
        try:
            url = f"{self.base_url}/api/v1/admin/customers/{customer_id}"
            resp = requests.get(url, headers=self._headers(), timeout=10.0)
            return resp.json() if resp.status_code == 200 else None
        except Exception as e:
            logger.error(f"get_customer_details error: {e}")
            return None

    def approve_customer(
        self,
        customer_id: str,
        action: str,
        plan_id: Optional[str] = None,
        notes: str = "",
        custom_days: Optional[int] = None,
        device_id: Optional[str] = None
    ) -> Tuple[bool, str, Optional[str]]:
        try:
            url = f"{self.base_url}/api/v1/admin/customers/approval"
            payload = {
                "customer_id": customer_id,
                "action": action.upper(),
                "plan_id": plan_id,
                "notes": notes,
                "custom_days": custom_days,
                "device_id": device_id
            }
            resp = requests.post(url, json=payload, headers=self._headers(), timeout=15.0)
            if resp.status_code == 200:
                data = resp.json()
                return True, data.get("message", "تم بنجاح"), data.get("issued_license_key")
            err = resp.json().get("detail", "فشل تنفيذ العملية.")
            return False, str(err), None
        except Exception as e:
            return False, f"خطأ في الاتصال: {e}", None

    def renew_customer(
        self,
        customer_id: str,
        plan_id: str = "annual_pro",
        custom_days: Optional[int] = None,
        notes: str = ""
    ) -> Tuple[bool, str, Optional[str], Optional[str]]:
        try:
            url = f"{self.base_url}/api/v1/admin/customers/renew"
            payload = {
                "customer_id": customer_id,
                "plan_id": plan_id,
                "custom_days": custom_days,
                "notes": notes
            }
            resp = requests.post(url, json=payload, headers=self._headers(), timeout=15.0)
            if resp.status_code == 200:
                data = resp.json()
                return True, data.get("message", "تم التجديد بنجاح"), data.get("license_key"), data.get("expires_date_utc")
            err = resp.json().get("detail", "فشل تجديد الاشتراك.")
            return False, str(err), None, None
        except Exception as e:
            return False, f"خطأ في الاتصال: {e}", None, None

    def quick_register(
        self,
        full_name: str,
        shop_name: str,
        phone_number: str,
        city: str,
        device_id: str,
        username: Optional[str] = None
    ) -> Tuple[bool, str, Optional[str]]:
        try:
            import re
            u_clean = username.strip() if username else re.sub(r"[^a-zA-Z0-9_]", "", phone_number) or f"user_{phone_number[-4:]}"
            url = f"{self.base_url}/api/v1/auth/register"
            payload = {
                "username": u_clean,
                "password": f"Pass@{phone_number[-4:]}#2026",
                "full_name": full_name.strip(),
                "shop_name": shop_name.strip(),
                "phone_number": phone_number.strip(),
                "city": city.strip() or "Cairo",
                "device_id": device_id.strip()
            }
            resp = requests.post(url, json=payload, timeout=15.0)
            if resp.status_code in (200, 201):
                data = resp.json()
                return True, "تم تسجيل الحساب بنجاح", data.get("customer_id")
            err = resp.json().get("detail", "فشل تسجيل الحساب.")
            return False, str(err), None
        except Exception as e:
            return False, f"خطأ في الاتصال: {e}", None

    def issue_license(
        self,
        customer_id: str,
        plan_id: str,
        custom_days: Optional[int] = None,
        custom_device_limit: Optional[int] = None
    ) -> Tuple[bool, str, Optional[str]]:
        try:
            url = f"{self.base_url}/api/v1/admin/licenses/issue"
            payload = {
                "customer_id": customer_id,
                "plan_id": plan_id,
                "custom_days": custom_days,
                "custom_device_limit": custom_device_limit
            }
            resp = requests.post(url, json=payload, headers=self._headers(), timeout=15.0)
            if resp.status_code == 200:
                data = resp.json()
                return True, data.get("message", "تم إصدار الترخيص بنجاح"), data.get("license_key")
            err = resp.json().get("detail", "فشل إصدار الترخيص.")
            return False, str(err), None
        except Exception as e:
            return False, f"خطأ في الاتصال: {e}", None

    def revoke_license(self, license_key: str, reason: str) -> Tuple[bool, str]:
        try:
            url = f"{self.base_url}/api/v1/admin/licenses/revoke"
            resp = requests.post(url, json={"license_key": license_key, "reason": reason}, headers=self._headers(), timeout=15.0)
            if resp.status_code == 200:
                return True, resp.json().get("message", "تم إلغاء الترخيص بنجاح.")
            return False, resp.json().get("detail", "فشل إلغاء الترخيص.")
        except Exception as e:
            return False, f"خطأ في الاتصال: {e}"

    def get_devices(self, customer_id: Optional[str] = None) -> List[Dict[str, Any]]:
        try:
            url = f"{self.base_url}/api/v1/admin/devices"
            if customer_id:
                url += f"?customer_id={customer_id}"
            resp = requests.get(url, headers=self._headers(), timeout=10.0)
            return resp.json().get("devices", []) if resp.status_code == 200 else []
        except Exception as e:
            logger.error(f"get_devices error: {e}")
            return []

    def release_device(self, customer_id: str, device_id: str, reason: str = "Released by Admin") -> Tuple[bool, str]:
        try:
            url = f"{self.base_url}/api/v1/admin/devices/release"
            resp = requests.post(url, json={
                "customer_id": customer_id,
                "device_id": device_id,
                "reason": reason
            }, headers=self._headers(), timeout=10.0)
            if resp.status_code == 200:
                return True, resp.json().get("message", "تم تحرير الجهاز بنجاح.")
            return False, resp.json().get("detail", "فشل تحرير الجهاز.")
        except Exception as e:
            return False, f"خطأ في الاتصال: {e}"

    def generate_offline_package(self, license_key: str, device_id: str, device_name: str) -> Tuple[bool, str, Optional[str]]:
        try:
            url = f"{self.base_url}/api/v1/licensing/offline-activate"
            resp = requests.post(url, json={
                "license_key": license_key.strip().upper(),
                "device_id": device_id.strip(),
                "device_name": device_name.strip()
            }, timeout=15.0)
            if resp.status_code == 200:
                data = resp.json()
                return True, "تم توليد الحزمة غير المتصلة الموقعة بنجاح.", data.get("signed_package_b64")
            return False, resp.json().get("detail", "فشل توليد الحزمة."), None
        except Exception as e:
            return False, f"خطأ في الاتصال: {e}", None

    def get_plans(self) -> List[Dict[str, Any]]:
        try:
            resp = requests.get(f"{self.base_url}/api/v1/subscriptions/plans", timeout=10.0)
            return resp.json() if resp.status_code == 200 else []
        except Exception:
            return []

    def get_payments(self) -> List[Dict[str, Any]]:
        try:
            resp = requests.get(f"{self.base_url}/api/v1/admin/payments", headers=self._headers(), timeout=10.0)
            return resp.json().get("payments", []) if resp.status_code == 200 else []
        except Exception:
            return []

    def confirm_payment(self, payment_id: str, status: str, plan_id: Optional[str] = None) -> Tuple[bool, str]:
        try:
            url = f"{self.base_url}/api/v1/admin/payments/confirm"
            resp = requests.post(url, json={
                "payment_id": payment_id,
                "status": status,
                "plan_id": plan_id
            }, headers=self._headers(), timeout=15.0)
            if resp.status_code == 200:
                return True, resp.json().get("message", "تم تأكيد الدفع بنجاح.")
            return False, resp.json().get("detail", "فشل تأكيد الدفع.")
        except Exception as e:
            return False, f"خطأ في الاتصال: {e}"

    def get_audit_logs(self) -> List[Dict[str, Any]]:
        try:
            resp = requests.get(f"{self.base_url}/api/v1/admin/audit-logs?limit=100", headers=self._headers(), timeout=10.0)
            return resp.json().get("audit_logs", []) if resp.status_code == 200 else []
        except Exception:
            return []
