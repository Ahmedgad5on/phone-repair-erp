"""
core/licensing/license_verifier.py — Client-Side Cryptographic License Verification
Verifies Ed25519 digital signatures completely offline using the embedded public key.
Zero access to private signing keys.
"""
import base64
import json
import logging
from datetime import datetime, timezone
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, Tuple

from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization

logger = logging.getLogger("thermal_lab.licensing.verifier")

# Default embedded master public key (Ed25519 SubjectPublicKeyInfo)
EMBEDDED_PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAJoX3Bd5Nq/jZ9AS8wtVd7kOtEAW2yPxTD4nYOELyBz0=
-----END PUBLIC KEY-----"""


@dataclass
class LicenseStatusInfo:
    is_valid: bool
    status: str  # "ACTIVE", "GRACE_PERIOD", "EXPIRED", "DEVICE_MISMATCH", "TAMPERED", "INVALID_SIGNATURE", "MISSING"
    message: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    license_key: Optional[str] = None
    device_id: Optional[str] = None
    plan_code: Optional[str] = None
    plan_name: Optional[str] = None
    valid_until_utc: Optional[datetime] = None
    days_remaining: int = 0
    hours_remaining: int = 0
    grace_hours_remaining: int = 0
    is_in_grace: bool = False
    is_read_only: bool = False
    features: list = field(default_factory=list)
    raw_payload: Dict[str, Any] = field(default_factory=dict)


def _b64_url_decode(data: str) -> bytes:
    """Restores padding and decodes URL-safe base64."""
    padding = 4 - (len(data) % 4)
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data.encode("ascii"))


class LicenseVerifier:
    """Verifies Ed25519 signed license tokens and policies offline."""

    def __init__(self, public_key_pem: Optional[str] = None):
        if public_key_pem:
            self.public_key_pem = public_key_pem
        else:
            loaded = None
            try:
                from server.config import config
                from pathlib import Path
                pub_p = Path(config.ED25519_PUBLIC_KEY_PATH)
                if pub_p.exists():
                    loaded = pub_p.read_text(encoding="utf-8")
            except Exception:
                pass
            self.public_key_pem = loaded or EMBEDDED_PUBLIC_KEY_PEM

        self._pub_key = None
        self._load_key()

    def _load_key(self):
        try:
            self._pub_key = serialization.load_pem_public_key(
                self.public_key_pem.strip().encode("utf-8")
            )
        except Exception as e:
            logger.error("Failed to load embedded public key: %s", e)
            self._pub_key = None

    def verify_token_signature(self, token: str) -> Tuple[bool, Optional[Dict[str, Any]], str]:
        """
        Cryptographically verifies the token using Ed25519.
        Returns (is_valid, payload_dict, error_string).
        """
        if not self._pub_key:
            return False, None, "Public key not loaded"

        try:
            parts = token.strip().split(".")
            if len(parts) != 3:
                return False, None, "Invalid license format (token must have 3 segments)"

            hdr_b64, pay_b64, sig_b64 = parts

            # Decode components
            hdr_bytes = _b64_url_decode(hdr_b64)
            pay_bytes = _b64_url_decode(pay_b64)
            sig_bytes = _b64_url_decode(sig_b64)

            header = json.loads(hdr_bytes.decode("utf-8"))
            payload = json.loads(pay_bytes.decode("utf-8"))

            if header.get("alg") != "Ed25519":
                return False, None, f"Unsupported algorithm {header.get('alg')}"

            # Verify signature over header.payload
            signing_input = f"{hdr_b64}.{pay_b64}".encode("ascii")
            self._pub_key.verify(sig_bytes, signing_input)

            return True, payload, ""
        except Exception as e:
            return False, None, f"Signature verification failed: {str(e)}"

    def evaluate_license(
        self,
        token: Optional[str],
        current_device_id: str,
        now_utc: Optional[datetime] = None
    ) -> LicenseStatusInfo:
        """
        Full offline evaluation of license token:
        1. Signature check.
        2. Hardware/device ID binding.
        3. UTC expiration and offline grace period calculation.
        """
        if not token or not token.strip():
            return LicenseStatusInfo(
                is_valid=False,
                status="MISSING",
                message="لا يوجد ترخيص مسجل على هذا الجهاز. يرجى التفعيل للمتابعة.",
                is_read_only=True
            )

        sig_ok, payload, err = self.verify_token_signature(token)
        if not sig_ok or not payload:
            return LicenseStatusInfo(
                is_valid=False,
                status="INVALID_SIGNATURE",
                message=f"توقيع الترخيص غير صالح أو تالف ({err}).",
                is_read_only=True
            )

        # Check Hardware Binding
        token_device_id = payload.get("device_id")
        if token_device_id and token_device_id != current_device_id:
            return LicenseStatusInfo(
                is_valid=False,
                status="DEVICE_MISMATCH",
                message=f"هذا الترخيص مخصص لجهاز آخر ({token_device_id}). جهازك الحالي ({current_device_id}).",
                customer_id=payload.get("customer_id"),
                license_key=payload.get("license_key"),
                device_id=token_device_id,
                is_read_only=True,
                raw_payload=payload
            )

        # Expiration calculation
        if now_utc is None:
            now_utc = datetime.now(timezone.utc)

        valid_until_str = payload.get("valid_until") or payload.get("expires_at_utc")
        if not valid_until_str:
            return LicenseStatusInfo(
                is_valid=False,
                status="INVALID_PAYLOAD",
                message="تاريخ انتهاء الترخيص مفقود في البيانات المشفرة.",
                is_read_only=True
            )

        try:
            # Handle ISO format with Z or +00:00
            clean_str = valid_until_str.replace("Z", "+00:00")
            exp_date = datetime.fromisoformat(clean_str)
            if exp_date.tzinfo is None:
                exp_date = exp_date.replace(tzinfo=timezone.utc)
        except Exception as e:
            return LicenseStatusInfo(
                is_valid=False,
                status="INVALID_PAYLOAD",
                message=f"تنسيق تاريخ الانتهاء غير صحيح: {e}",
                is_read_only=True
            )

        # Calculate difference
        delta = exp_date - now_utc
        grace_hours = int(payload.get("grace_hours", 168))  # 7 days default
        total_seconds = delta.total_seconds()

        customer_id = payload.get("customer_id")
        customer_name = payload.get("customer_name") or payload.get("shop_name")
        license_key = payload.get("license_key")
        plan_code = payload.get("plan_code") or payload.get("plan_id")
        plan_name = payload.get("plan_name", plan_code)
        features = payload.get("features", ["all"])

        if total_seconds >= 0:
            # Still fully active
            days = int(delta.days)
            hours = int((total_seconds % 86400) // 3600)
            return LicenseStatusInfo(
                is_valid=True,
                status="ACTIVE",
                message="الترخيص نشط وصالح للعمل.",
                customer_id=customer_id,
                customer_name=customer_name,
                license_key=license_key,
                device_id=token_device_id,
                plan_code=plan_code,
                plan_name=plan_name,
                valid_until_utc=exp_date,
                days_remaining=days,
                hours_remaining=hours,
                grace_hours_remaining=grace_hours,
                is_in_grace=False,
                is_read_only=False,
                features=features,
                raw_payload=payload
            )
        else:
            # Expired — check grace period
            overdue_seconds = abs(total_seconds)
            overdue_hours = overdue_seconds / 3600.0

            if overdue_hours <= grace_hours:
                # Within grace period
                remaining_grace_hours = int(grace_hours - overdue_hours)
                return LicenseStatusInfo(
                    is_valid=True,
                    status="GRACE_PERIOD",
                    message=f"انتهى اشتراكك الأساسي ولكنك في فترة السماح المؤقتة (متبقي {remaining_grace_hours} ساعة). يرجى التجديد لتجنب الإغلاق.",
                    customer_id=customer_id,
                    customer_name=customer_name,
                    license_key=license_key,
                    device_id=token_device_id,
                    plan_code=plan_code,
                    plan_name=plan_name,
                    valid_until_utc=exp_date,
                    days_remaining=0,
                    hours_remaining=0,
                    grace_hours_remaining=remaining_grace_hours,
                    is_in_grace=True,
                    is_read_only=False,  # Still allows work in grace
                    features=features,
                    raw_payload=payload
                )
            else:
                # Completely expired past grace
                return LicenseStatusInfo(
                    is_valid=False,
                    status="EXPIRED",
                    message="انتهى اشتراك البرنامج وفترة السماح. تم قفل التعديل والعمليات الجديدة. يمكنك الاطلاع على بياناتك السابقة وعمل نسخ احتياطي.",
                    customer_id=customer_id,
                    customer_name=customer_name,
                    license_key=license_key,
                    device_id=token_device_id,
                    plan_code=plan_code,
                    plan_name=plan_name,
                    valid_until_utc=exp_date,
                    days_remaining=0,
                    hours_remaining=0,
                    grace_hours_remaining=0,
                    is_in_grace=False,
                    is_read_only=True,  # Read-Only Lockout mode
                    features=features,
                    raw_payload=payload
                )
