"""
server/routers/licensing.py — Cryptographic Device Activation & Validation Router
Handles Ed25519 signed license generation, device registration & limits, and heartbeat checks.
"""
import base64
from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, status

from server.config import config
from server.database import CentralDatabaseManager
from server.schemas import (
    DeviceActivationRequest, DeviceActivationResponse,
    LicenseValidationRequest, LicenseValidationResponse,
    OfflineActivationRequest, OfflineActivationResponse,
    TrialActivationRequest
)
from server.security import Ed25519LicensingEngine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/licensing", tags=["Licensing & Device Activation"])


@router.post("/activate", response_model=DeviceActivationResponse)
def activate_device(payload: DeviceActivationRequest):
    """
    Online Device Activation:
    Validates license key, verifies subscription validity and device limits,
    registers installation identifier, and returns an Ed25519 cryptographically signed token.
    """
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    key_clean = (payload.license_key or "").strip().upper()
    dev_id = (payload.device_id or "").strip()

    if not key_clean and payload.token:
        try:
            signer = Ed25519Signer()
            valid, tdata, _ = signer.verify_token(payload.token)
            if valid and tdata:
                key_clean = (tdata.get("license_key") or "").strip().upper()
        except Exception:
            pass

    # 1. Lookup License
    cur.execute("""
        SELECT l.id, l.license_id, l.customer_id, l.subscription_id, l.plan_id,
               l.license_key, l.device_limit, l.status AS license_status,
               l.issued_at_utc, l.expires_at_utc,
               c.account_status, c.shop_name,
               s.status AS sub_status, s.expires_date_utc, s.grace_expires_utc,
               p.features_json, p.grace_period_days
        FROM server_licenses l
        JOIN server_customers c ON l.customer_id = c.customer_id
        JOIN server_subscriptions s ON l.subscription_id = s.subscription_id
        JOIN server_subscription_plans p ON l.plan_id = p.plan_id
        WHERE l.license_key = ?;
    """, (key_clean,))
    row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="مفتاح الترخيص غير موجود. يرجى التأكد من الرمز المدخل.")

    if row["license_status"] == "REVOKED":
        raise HTTPException(status_code=403, detail="تم إلغاء هذا الترخيص رسمياً من إدارة النظام.")
    if row["license_status"] == "SUSPENDED":
        raise HTTPException(status_code=403, detail="تم تعليق هذا الترخيص مؤقتاً. يرجى التواصل مع الدعم الفني.")
    if row["account_status"] in ("BLOCKED", "SUSPENDED"):
        raise HTTPException(status_code=403, detail="حساب العميل موقف أو محظور. لا يمكن تفعيل أجهزة جديدة.")

    # If customer was pending verification or approval, activating a valid license approves the account
    if row["account_status"] in ("PENDING_APPROVAL", "PENDING_VERIFICATION"):
        cur.execute("UPDATE server_customers SET account_status = 'ACTIVE' WHERE customer_id = ?;", (row["customer_id"],))
        conn.commit()

    now_utc = datetime.now(timezone.utc)
    expires_dt = datetime.fromisoformat(row["expires_at_utc"])
    grace_dt = datetime.fromisoformat(row["grace_expires_utc"])

    if now_utc > grace_dt:
        raise HTTPException(
            status_code=403,
            detail=f"انتهت صلاحية هذا الترخيص وفترة السماح في {row['expires_at_utc'][:10]}. يرجى تجديد الاشتراك أولاً."
        )

    # 2. Check Device Registration and Limits
    cur.execute("""
        SELECT id, device_id, status FROM server_devices
        WHERE customer_id = ? AND device_id = ?;
    """, (row["customer_id"], dev_id))
    existing_dev = cur.fetchone()

    now_iso = now_utc.isoformat()

    if existing_dev:
        # Existing device re-activation: update heartbeat and metadata
        cur.execute("""
            UPDATE server_devices
            SET device_name = ?, os_info = ?, app_version = ?, status = 'ACTIVE', last_validated_utc = ?
            WHERE id = ?;
        """, (payload.device_name.strip(), payload.os_info or "", payload.app_version or "", now_iso, existing_dev["id"]))
    else:
        # New device: Check device limit
        cur.execute("""
            SELECT COUNT(*) FROM server_devices
            WHERE license_id = ? AND status = 'ACTIVE';
        """, (row["license_id"],))
        active_count = cur.fetchone()[0]

        if active_count >= row["device_limit"]:
            raise HTTPException(
                status_code=403,
                detail=f"تم استنفاد الحد الأقصى للأجهزة المصرح بها لهذا الترخيص ({row['device_limit']} جهاز). "
                       f"يرجى إلغاء تفعيل أحد أجهزتك القديمة من لوحة التحكم أو ترقية الباقة."
            )

        # Register new device
        cur.execute("""
            INSERT INTO server_devices (
                device_id, customer_id, license_id, device_name,
                os_info, app_version, status, registered_at_utc, last_validated_utc
            ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?);
        """, (
            dev_id, row["customer_id"], row["license_id"], payload.device_name.strip(),
            payload.os_info or "", payload.app_version or "", now_iso, now_iso
        ))

    conn.commit()

    # 3. Build & Sign Ed25519 License Token
    features = json.loads(row["features_json"]) if row["features_json"] else []
    grace_hours = int(row["grace_period_days"]) * 24

    remaining_days = max(0, (expires_dt - now_utc).days)
    if expires_dt.year > 2090:  # Lifetime
        remaining_days = 99999

    license_payload = {
        "license_id": row["license_id"],
        "license_key": row["license_key"],
        "customer_id": row["customer_id"],
        "shop_name": row["shop_name"],
        "plan_id": row["plan_id"],
        "plan_code": row["plan_id"],
        "device_id": dev_id,
        "device_name": payload.device_name.strip(),
        "issued_at_utc": row["issued_at_utc"],
        "expires_at_utc": row["expires_at_utc"],
        "valid_until": row["expires_at_utc"],
        "grace_hours": grace_hours,
        "device_limit": row["device_limit"],
        "features": features,
        "status": "ACTIVE",
        "timestamp_utc": now_iso,
        "v": "1.0"
    }

    signed_token = Ed25519LicensingEngine.sign_payload(license_payload)
    public_key_pem = Ed25519LicensingEngine.get_public_key_pem()

    # Log audit event
    db.log_audit(
        actor_id=row["customer_id"],
        actor_username=row["shop_name"],
        actor_role="customer",
        action_type="DEVICE_ACTIVATE",
        target_type="DEVICE",
        target_id=dev_id,
        result="SUCCESS",
        metadata={"license_key": key_clean, "device_name": payload.device_name}
    )

    return DeviceActivationResponse(
        success=True,
        message="تم تفعيل الجهاز بنجاح. مرحباً بك في ProLab Trading Studio.",
        license_id=row["license_id"],
        license_key=row["license_key"],
        status="ACTIVE",
        device_id=dev_id,
        expires_at_utc=row["expires_at_utc"],
        remaining_days=remaining_days,
        grace_period_hours=grace_hours,
        features=features,
        signed_token=signed_token,
        public_key_pem=public_key_pem
    )


@router.post("/validate", response_model=LicenseValidationResponse)
def validate_license(payload: LicenseValidationRequest):
    """
    Heartbeat License Validation:
    Enforces server-authoritative UTC expiration, checks device authorization,
    and returns updated signed token with remaining days.
    """
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    key_clean = (payload.license_key or "").strip().upper()
    dev_id = (payload.device_id or "").strip()

    if not key_clean and payload.token:
        try:
            signer = Ed25519Signer()
            valid, tdata, _ = signer.verify_token(payload.token)
            if valid and tdata:
                key_clean = (tdata.get("license_key") or "").strip().upper()
        except Exception:
            pass

    cur.execute("""
        SELECT l.id, l.license_id, l.customer_id, l.subscription_id, l.plan_id,
               l.license_key, l.device_limit, l.status AS license_status,
               l.issued_at_utc, l.expires_at_utc,
               c.account_status, c.shop_name,
               s.status AS sub_status, s.expires_date_utc, s.grace_expires_utc,
               p.features_json, p.grace_period_days,
               d.status AS dev_status
        FROM server_licenses l
        JOIN server_customers c ON l.customer_id = c.customer_id
        JOIN server_subscriptions s ON l.subscription_id = s.subscription_id
        JOIN server_subscription_plans p ON l.plan_id = p.plan_id
        LEFT JOIN server_devices d ON l.license_id = d.license_id AND d.device_id = ?
        WHERE l.license_key = ?;
    """, (dev_id, key_clean))
    row = cur.fetchone()

    if not row:
        return LicenseValidationResponse(
            valid=False,
            status="NOT_FOUND",
            message="مفتاح الترخيص غير مسجل في النظام."
        )

    if not row["dev_status"] or row["dev_status"] != "ACTIVE":
        return LicenseValidationResponse(
            valid=False,
            status="UNAUTHORIZED_DEVICE",
            message="هذا الجهاز غير مصرح له باستخدام هذا الترخيص."
        )

    if row["license_status"] in ("REVOKED", "SUSPENDED") or row["account_status"] in ("BLOCKED", "SUSPENDED"):
        return LicenseValidationResponse(
            valid=False,
            status=row["license_status"],
            message=f"الترخيص غير صالح (الحالة: {row['license_status']})."
        )

    now_utc = datetime.now(timezone.utc)
    expires_dt = datetime.fromisoformat(row["expires_at_utc"])
    grace_dt = datetime.fromisoformat(row["grace_expires_utc"])

    # Update device heartbeat
    now_iso = now_utc.isoformat()
    cur.execute("""
        UPDATE server_devices
        SET last_validated_utc = ?
        WHERE license_id = ? AND device_id = ?;
    """, (now_iso, row["license_id"], dev_id))
    conn.commit()

    features = json.loads(row["features_json"]) if row["features_json"] else []

    # Check Lifetime plan
    if expires_dt.year > 2090:
        return LicenseValidationResponse(
            valid=True,
            status="LIFETIME",
            message="ترخيص دائم نشط مدى الحياة.",
            expires_at_utc=row["expires_at_utc"],
            remaining_days=99999,
            in_grace_period=False,
            features=features
        )

    # Check normal expiration vs grace period
    if now_utc <= expires_dt:
        remaining_days = (expires_dt - now_utc).days
        return LicenseValidationResponse(
            valid=True,
            status="ACTIVE",
            message="الترخيص سارٍ ونشط.",
            expires_at_utc=row["expires_at_utc"],
            remaining_days=remaining_days,
            in_grace_period=False,
            features=features
        )
    elif now_utc <= grace_dt:
        grace_remaining_hours = int((grace_dt - now_utc).total_seconds() / 3600)
        return LicenseValidationResponse(
            valid=True,
            status="IN_GRACE_PERIOD",
            message=f"انتهت صلاحية الاشتراك ولكنك داخل فترة السماح المؤقتة (متبقي {grace_remaining_hours} ساعة). يرجى التجديد لتجنب إيقاف الخدمة.",
            expires_at_utc=row["expires_at_utc"],
            remaining_days=0,
            in_grace_period=True,
            features=features
        )
    else:
        return LicenseValidationResponse(
            valid=False,
            status="EXPIRED",
            message=f"انتهت صلاحية الاشتراك وفترة السماح في {row['expires_at_utc'][:10]}. يرجى تجديد الاشتراك.",
            expires_at_utc=row["expires_at_utc"],
            remaining_days=0,
            in_grace_period=False,
            features=features
        )


@router.post("/offline-activate", response_model=OfflineActivationResponse)
def generate_offline_package(payload: OfflineActivationRequest):
    """
    Generates a cryptographically signed offline activation package
    that can be imported into an air-gapped or offline desktop client.
    """
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    key_clean = (payload.license_key or "").strip().upper()
    dev_id = (payload.device_id or "").strip()

    if not key_clean and payload.token:
        try:
            signer = Ed25519Signer()
            valid, tdata, _ = signer.verify_token(payload.token)
            if valid and tdata:
                key_clean = (tdata.get("license_key") or "").strip().upper()
        except Exception:
            pass

    cur.execute("""
        SELECT l.license_id, l.customer_id, l.plan_id, l.license_key, l.device_limit,
               l.expires_at_utc, c.shop_name, p.features_json, p.grace_period_days
        FROM server_licenses l
        JOIN server_customers c ON l.customer_id = c.customer_id
        JOIN server_subscription_plans p ON l.plan_id = p.plan_id
        WHERE l.license_key = ? AND l.status = 'ACTIVE';
    """, (key_clean,))
    row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="الترخيص غير موجود أو غير نشط.")

    # Register/ensure device
    now_iso = datetime.now(timezone.utc).isoformat()
    cur.execute("""
        INSERT OR REPLACE INTO server_devices (
            device_id, customer_id, license_id, device_name,
            os_info, app_version, status, registered_at_utc, last_validated_utc
        ) VALUES (?, ?, ?, ?, 'Offline Manual', '4.6.0', 'ACTIVE', ?, ?);
    """, (dev_id, row["customer_id"], row["license_id"], payload.device_name.strip(), now_iso, now_iso))
    conn.commit()

    features = json.loads(row["features_json"]) if row["features_json"] else []
    license_payload = {
        "license_id": row["license_id"],
        "license_key": row["license_key"],
        "customer_id": row["customer_id"],
        "shop_name": row["shop_name"],
        "plan_id": row["plan_id"],
        "device_id": dev_id,
        "device_name": payload.device_name.strip(),
        "issued_at_utc": now_iso,
        "expires_at_utc": row["expires_at_utc"],
        "grace_hours": int(row["grace_period_days"]) * 24,
        "device_limit": row["device_limit"],
        "features": features,
        "status": "ACTIVE",
        "offline": True,
        "v": "1.0"
    }

    signed_token = Ed25519LicensingEngine.sign_payload(license_payload)
    pub_key_pem = Ed25519LicensingEngine.get_public_key_pem()

    package = {
        "type": "PROLAB_OFFLINE_LICENSE",
        "version": "1.0",
        "license_key": key_clean,
        "device_id": dev_id,
        "signed_token": signed_token,
        "public_key_pem": pub_key_pem,
        "generated_at": now_iso
    }
    pkg_b64 = base64.b64encode(json.dumps(package).encode("utf-8")).decode("ascii")

    return OfflineActivationResponse(
        success=True,
        license_key=key_clean,
        device_id=dev_id,
        signed_package_b64=pkg_b64,
        expires_at_utc=row["expires_at_utc"],
        instructions="انسخ هذا الكود أو احفظه في ملف باسم license.prolablic وقم باستيراده من شاشة تفعيل الترخيص بدون إنترنت."
    )


@router.get("/public-key")
def get_licensing_public_key():
    """Returns the master Ed25519 public key in PEM format for client verification."""
    pem = Ed25519LicensingEngine.get_public_key_pem()
    raw_b64 = Ed25519LicensingEngine.get_public_key_raw_b64()
    return {
        "algorithm": "Ed25519",
        "key_id": config.ED25519_KEY_ID,
        "public_key_pem": pem,
        "public_key_b64": raw_b64
    }


@router.post("/activate-trial", response_model=DeviceActivationResponse)
def activate_trial_device(payload: TrialActivationRequest):
    """
    Provisions a 14-day free trial license for the customer/device,
    binds the device, and returns the signed Ed25519 license token.
    """
    from server.routers.admin import _provision_subscription_and_license
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cust_id = payload.customer_id
    if not cust_id and payload.username_or_phone:
        u_p = payload.username_or_phone.strip()
        cur.execute("""
            SELECT c.customer_id FROM server_customers c
            LEFT JOIN server_users u ON c.user_id = u.user_id
            WHERE c.customer_id = ? OR c.phone_number = ? OR lower(u.username) = ?;
        """, (u_p, u_p, u_p.lower()))
        row = cur.fetchone()
        if row:
            cust_id = row["customer_id"]

    if not cust_id:
        cur.execute("SELECT customer_id FROM server_customers ORDER BY id DESC LIMIT 1;")
        r = cur.fetchone()
        if r:
            cust_id = r["customer_id"]
        else:
            raise HTTPException(status_code=400, detail="يرجى إنشاء حساب جديد أولاً قبل تفعيل التجربة المجانية.")

    # Check if trial already exists for this customer
    cur.execute("""
        SELECT l.license_key FROM server_subscriptions s
        JOIN server_licenses l ON s.subscription_id = l.subscription_id
        WHERE s.customer_id = ? AND s.plan_id = 'trial_14d';
    """, (cust_id,))
    existing_trial = cur.fetchone()

    if existing_trial:
        lic_key = existing_trial["license_key"]
    else:
        lic_key = _provision_subscription_and_license(db, cust_id, "trial_14d", "system_trial")

    # Activate device
    act_req = DeviceActivationRequest(
        customer_id=cust_id,
        license_key=lic_key,
        device_id=payload.device_id,
        device_name=payload.device_name,
        os_info=payload.os_info,
        app_version=payload.app_version
    )
    return activate_device(act_req)
