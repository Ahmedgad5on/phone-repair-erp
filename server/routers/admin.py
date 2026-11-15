"""
server/routers/admin.py — Owner Administration & Licensing Authority Router
Enforces strict server-side RBAC (Super Admin, Licensing Admin, Support Admin, Financial Admin).
"""
from datetime import datetime, timezone, timedelta
import hashlib
import json
import logging
import os
import secrets
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from server.config import config
from server.database import CentralDatabaseManager
from server.dependencies import require_admin, require_licensing_admin, require_financial_admin
from server.schemas import (
    AdminApprovalRequest, AdminStatsResponse, PaymentRecordResponse
)
from server.security import Ed25519LicensingEngine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/admin", tags=["Owner Administration (RBAC)"])


# ==============================================================================
# Helper Payload Models
# ==============================================================================

class IssueLicenseRequest(BaseModel):
    customer_id: str
    plan_id: str
    custom_days: Optional[int] = None
    custom_device_limit: Optional[int] = None
    notes: Optional[str] = None


class RevokeLicenseRequest(BaseModel):
    license_key: str
    reason: str


class ReleaseDeviceRequest(BaseModel):
    customer_id: str
    device_id: str
    reason: str


class ConfirmPaymentAdminRequest(BaseModel):
    payment_id: str
    status: str = "CONFIRMED"  # CONFIRMED or REJECTED
    plan_id: Optional[str] = None
    notes: Optional[str] = None


# ==============================================================================
# 1. Dashboard Analytics & Statistics
# ==============================================================================

@router.get("/stats", response_model=AdminStatsResponse)
def get_admin_dashboard_stats(claims: Dict[str, Any] = Depends(require_admin)):
    """Calculates live business KPIs from the database."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM server_customers;")
    total_cust = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM server_customers WHERE account_status IN ('PENDING_APPROVAL', 'PENDING_VERIFICATION');")
    pending_app = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM server_customers WHERE account_status = 'APPROVED';")
    approved_cust = cur.fetchone()[0]

    now_iso = datetime.now(timezone.utc).isoformat()
    cur.execute("SELECT COUNT(*) FROM server_subscriptions WHERE status = 'ACTIVE' AND expires_date_utc >= ?;", (now_iso,))
    active_subs = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM server_subscriptions WHERE status = 'EXPIRED' OR (status = 'ACTIVE' AND expires_date_utc < ?);", (now_iso,))
    expired_subs = cur.fetchone()[0]

    week_ahead = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    cur.execute("SELECT COUNT(*) FROM server_subscriptions WHERE status = 'ACTIVE' AND expires_date_utc BETWEEN ? AND ?;", (now_iso, week_ahead))
    expiring_soon = cur.fetchone()[0]

    cur.execute("SELECT COALESCE(SUM(amount), 0.0) FROM server_payments WHERE status = 'CONFIRMED';")
    total_rev = float(cur.fetchone()[0])

    cur.execute("SELECT COUNT(*) FROM server_devices WHERE status = 'ACTIVE';")
    active_devs = cur.fetchone()[0]

    cur.execute("SELECT value FROM server_system_settings WHERE key = 'latest_stable_version';")
    v_row = cur.fetchone()
    ver = v_row["value"] if v_row else "4.6.0"

    return AdminStatsResponse(
        total_customers=total_cust,
        pending_approvals=pending_app,
        approved_customers=approved_cust,
        active_subscriptions=active_subs,
        expired_subscriptions=expired_subs,
        expiring_soon_subscriptions=expiring_soon,
        total_revenue_egp=total_rev,
        active_devices=active_devs,
        latest_version=ver
    )


# ==============================================================================
# 2. Customer Management & Approvals
# ==============================================================================

@router.get("/customers")
def list_customers(
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    claims: Dict[str, Any] = Depends(require_admin)
):
    """Lists, filters, and searches customer accounts."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    query = """
        SELECT c.id, c.customer_id, c.user_id, c.full_name, c.shop_name,
               c.phone_number, c.phone_verified, c.email, c.city,
               c.account_status, c.registration_policy, c.created_at, c.approved_at,
               s.plan_id AS active_plan, s.expires_date_utc AS sub_expires,
               l.license_key
        FROM server_customers c
        LEFT JOIN server_subscriptions s ON c.customer_id = s.customer_id AND s.status = 'ACTIVE'
        LEFT JOIN server_licenses l ON s.subscription_id = l.subscription_id AND l.status = 'ACTIVE'
        WHERE 1=1
    """
    params = []

    if status_filter:
        query += " AND c.account_status = ?"
        params.append(status_filter)

    if search:
        s_term = f"%{search.strip().lower()}%"
        query += " AND (lower(c.full_name) LIKE ? OR lower(c.shop_name) LIKE ? OR c.phone_number LIKE ? OR lower(c.customer_id) LIKE ? OR lower(l.license_key) LIKE ?)"
        params.extend([s_term, s_term, s_term, s_term, s_term])

    query += " ORDER BY c.id DESC LIMIT ? OFFSET ?;"
    params.extend([limit, offset])

    cur.execute(query, params)
    rows = cur.fetchall()

    result = []
    for r in rows:
        result.append(dict(r))
    return {"customers": result, "count": len(result)}


@router.get("/customers/{customer_id}")
def get_customer_details(customer_id: str, claims: Dict[str, Any] = Depends(require_admin)):
    """Retrieves 360-degree customer details: profile, subscriptions, licenses, devices, payments."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cur.execute("SELECT * FROM server_customers WHERE customer_id = ?;", (customer_id,))
    cust = cur.fetchone()
    if not cust:
        raise HTTPException(status_code=404, detail="العميل غير موجود.")

    # Subscriptions
    cur.execute("SELECT * FROM server_subscriptions WHERE customer_id = ? ORDER BY id DESC;", (customer_id,))
    subs = [dict(r) for r in cur.fetchall()]

    # Licenses
    cur.execute("SELECT * FROM server_licenses WHERE customer_id = ? ORDER BY id DESC;", (customer_id,))
    licenses = [dict(r) for r in cur.fetchall()]

    # Devices
    cur.execute("SELECT * FROM server_devices WHERE customer_id = ? ORDER BY id DESC;", (customer_id,))
    devices = [dict(r) for r in cur.fetchall()]

    # Payments
    cur.execute("SELECT * FROM server_payments WHERE customer_id = ? ORDER BY id DESC;", (customer_id,))
    payments = [dict(r) for r in cur.fetchall()]

    return {
        "customer": dict(cust),
        "subscriptions": subs,
        "licenses": licenses,
        "devices": devices,
        "payments": payments
    }


@router.post("/customers/approval")
@router.post("/approval")
def review_customer_approval(
    payload: AdminApprovalRequest,
    claims: Dict[str, Any] = Depends(require_licensing_admin)
):
    """
    Administrative approval or rejection of customer registration.
    If action is 'APPROVE' and plan_id is provided, automatically provisions a subscription & license!
    """
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cust_id = payload.customer_id
    cur.execute("SELECT id, shop_name, account_status FROM server_customers WHERE customer_id = ?;", (cust_id,))
    cust = cur.fetchone()
    if not cust:
        raise HTTPException(status_code=404, detail="العميل غير موجود.")

    act = payload.action.upper()
    now_utc = datetime.now(timezone.utc).isoformat()
    admin_name = claims.get("username", "admin")

    valid_actions = {
        "APPROVE": "APPROVED",
        "REJECT": "REJECTED",
        "SUSPEND": "SUSPENDED",
        "BLOCK": "BLOCKED",
        "REACTIVATE": "APPROVED"
    }

    if act not in valid_actions:
        raise HTTPException(status_code=400, detail=f"إجراء غير صالح: {act}")

    new_status = valid_actions[act]
    cur.execute("""
        UPDATE server_customers
        SET account_status = ?, approved_at = ?, approved_by = ?, notes = notes || ?
        WHERE customer_id = ?;
    """, (new_status, now_utc if act in ("APPROVE", "REACTIVATE") else None, admin_name, f" | Action: {act} by {admin_name}", cust_id))

    # Update registration request record
    cur.execute("""
        UPDATE server_registration_requests
        SET status = ?, reviewed_at = ?, reviewed_by = ?, review_notes = ?
        WHERE customer_id = ?;
    """, (new_status, now_utc, admin_name, payload.notes or act, cust_id))

    conn.commit()

    issued_license_key = None
    # Auto-assign plan if approved
    if act == "APPROVE" and payload.plan_id:
        issued_license_key = _provision_subscription_and_license(db, cust_id, payload.plan_id, admin_name)

    db.log_audit(
        actor_id=claims.get("sub", ""),
        actor_username=admin_name,
        actor_role=claims.get("role", "admin"),
        action_type=f"CUSTOMER_{act}",
        target_type="CUSTOMER",
        target_id=cust_id,
        result="SUCCESS",
        metadata={"new_status": new_status, "plan_id": payload.plan_id, "license_key": issued_license_key}
    )

    return {
        "success": True,
        "message": f"تم تطبيق الإجراء ({act}) على العميل بنجاح.",
        "customer_id": cust_id,
        "new_status": new_status,
        "account_status": new_status,
        "issued_license_key": issued_license_key
    }


# ==============================================================================
# 3. License Generation, Renewal & Revocation
# ==============================================================================

def _provision_subscription_and_license(
    db: CentralDatabaseManager,
    customer_id: str,
    plan_id: str,
    admin_name: str,
    custom_days: Optional[int] = None,
    custom_device_limit: Optional[int] = None
) -> str:
    """Helper that creates subscription and issues an Ed25519 signed license."""
    conn = db.get_connection()
    cur = conn.cursor()

    cur.execute("SELECT * FROM server_subscription_plans WHERE plan_id = ?;", (plan_id,))
    plan = cur.fetchone()
    if not plan:
        raise HTTPException(status_code=404, detail="الباقة المطلوبة غير موجودة.")

    now_dt = datetime.now(timezone.utc)
    duration_days = custom_days if custom_days is not None else plan["duration_days"]
    device_limit = custom_device_limit if custom_device_limit is not None else plan["device_limit"]
    grace_days = plan["grace_period_days"]

    # Calculate expiration
    if duration_days <= 0:  # Lifetime
        expires_dt = now_dt.replace(year=2099, month=12, day=31)
        sub_status = "LIFETIME"
    else:
        # Check if customer has an existing active subscription to extend (Early Renewal rule)
        cur.execute("""
            SELECT expires_date_utc FROM server_subscriptions
            WHERE customer_id = ? AND status IN ('ACTIVE', 'TRIAL')
            ORDER BY id DESC LIMIT 1;
        """, (customer_id,))
        existing_sub = cur.fetchone()
        if existing_sub:
            cur_exp = datetime.fromisoformat(existing_sub["expires_date_utc"])
            if cur_exp > now_dt:
                # Early renewal: add duration to current expiration date!
                expires_dt = cur_exp + timedelta(days=duration_days)
            else:
                expires_dt = now_dt + timedelta(days=duration_days)
        else:
            expires_dt = now_dt + timedelta(days=duration_days)
        sub_status = "ACTIVE"

    grace_dt = expires_dt + timedelta(days=grace_days)

    now_iso = now_dt.isoformat()
    expires_iso = expires_dt.isoformat()
    grace_iso = grace_dt.isoformat()

    sub_id = f"SUB-{secrets.token_hex(4).upper()}"
    lic_id = f"LIC-{secrets.token_hex(4).upper()}"
    lic_key = f"TPRO-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"

    # Insert Subscription
    cur.execute("""
        INSERT INTO server_subscriptions (
            subscription_id, customer_id, plan_id, status,
            start_date_utc, expires_date_utc, grace_expires_utc, auto_renew,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?);
    """, (sub_id, customer_id, plan_id, sub_status, now_iso, expires_iso, grace_iso, now_iso, now_iso))

    # Construct License Payload & Sign with Ed25519
    cur.execute("SELECT shop_name FROM server_customers WHERE customer_id = ?;", (customer_id,))
    shop_name = cur.fetchone()["shop_name"]

    features = json.loads(plan["features_json"]) if plan["features_json"] else []
    license_payload = {
        "license_id": lic_id,
        "license_key": lic_key,
        "customer_id": customer_id,
        "shop_name": shop_name,
        "plan_id": plan_id,
        "issued_at_utc": now_iso,
        "expires_at_utc": expires_iso,
        "grace_hours": grace_days * 24,
        "device_limit": device_limit,
        "features": features,
        "status": "ACTIVE",
        "v": "1.0"
    }
    signed_token = Ed25519LicensingEngine.sign_payload(license_payload)

    # Insert License
    cur.execute("""
        INSERT INTO server_licenses (
            license_id, customer_id, subscription_id, plan_id, license_key,
            signed_token, device_limit, status, issued_at_utc, expires_at_utc,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?);
    """, (lic_id, customer_id, sub_id, plan_id, lic_key, signed_token, device_limit, now_iso, expires_iso, now_iso))

    conn.commit()
    return lic_key


@router.post("/licenses/issue")
def issue_new_license(
    payload: IssueLicenseRequest,
    claims: Dict[str, Any] = Depends(require_licensing_admin)
):
    """Issues a new signed license and subscription for a customer."""
    db = CentralDatabaseManager.get_instance()
    admin_name = claims.get("username", "admin")

    lic_key = _provision_subscription_and_license(
        db, payload.customer_id, payload.plan_id, admin_name,
        custom_days=payload.custom_days, custom_device_limit=payload.custom_device_limit
    )

    db.log_audit(
        actor_id=claims.get("sub", ""),
        actor_username=admin_name,
        actor_role=claims.get("role", "admin"),
        action_type="LICENSE_ISSUE",
        target_type="LICENSE",
        target_id=lic_key,
        result="SUCCESS",
        metadata={"customer_id": payload.customer_id, "plan_id": payload.plan_id}
    )

    return {
        "success": True,
        "message": f"تم إصدار الترخيص بنجاح برقم {lic_key}.",
        "license_key": lic_key
    }


@router.post("/licenses/revoke")
def revoke_license(
    payload: RevokeLicenseRequest,
    claims: Dict[str, Any] = Depends(require_licensing_admin)
):
    """Revokes a license key permanently."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    key_clean = payload.license_key.strip().upper()
    cur.execute("SELECT id, customer_id FROM server_licenses WHERE license_key = ?;", (key_clean,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="مفتاح الترخيص غير موجود.")

    cur.execute("""
        UPDATE server_licenses
        SET status = 'REVOKED', revocation_reason = ?
        WHERE id = ?;
    """, (payload.reason.strip(), row["id"]))

    # Deactivate all active devices under this license
    cur.execute("UPDATE server_devices SET status = 'REVOKED' WHERE license_id = (SELECT license_id FROM server_licenses WHERE id = ?);", (row["id"],))
    conn.commit()

    admin_name = claims.get("username", "admin")
    db.log_audit(
        actor_id=claims.get("sub", ""),
        actor_username=admin_name,
        actor_role=claims.get("role", "admin"),
        action_type="LICENSE_REVOKE",
        target_type="LICENSE",
        target_id=key_clean,
        result="SUCCESS",
        metadata={"reason": payload.reason}
    )

    return {"success": True, "message": f"تم إلغاء الترخيص ({key_clean}) بنجاح وتعطيل كافة الأجهزة المرتبطة به."}


# ==============================================================================
# 4. Device Management & Release
# ==============================================================================

@router.get("/devices")
def list_all_devices(
    customer_id: Optional[str] = None,
    claims: Dict[str, Any] = Depends(require_admin)
):
    """Lists registered devices with filtering."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    if customer_id:
        cur.execute("SELECT * FROM server_devices WHERE customer_id = ? ORDER BY id DESC;", (customer_id,))
    else:
        cur.execute("SELECT * FROM server_devices ORDER BY id DESC LIMIT 200;")
    rows = cur.fetchall()
    return {"devices": [dict(r) for r in rows]}


@router.post("/devices/release")
def release_device_slot(
    payload: ReleaseDeviceRequest,
    claims: Dict[str, Any] = Depends(require_licensing_admin)
):
    """Releases an authorized device seat so customer can activate on another workstation."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, device_name FROM server_devices
        WHERE customer_id = ? AND device_id = ?;
    """, (payload.customer_id, payload.device_id))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود.")

    cur.execute("UPDATE server_devices SET status = 'DEACTIVATED' WHERE id = ?;", (row["id"],))
    conn.commit()

    admin_name = claims.get("username", "admin")
    db.log_audit(
        actor_id=claims.get("sub", ""),
        actor_username=admin_name,
        actor_role=claims.get("role", "admin"),
        action_type="ADMIN_DEVICE_RELEASE",
        target_type="DEVICE",
        target_id=payload.device_id,
        result="SUCCESS",
        metadata={"reason": payload.reason, "customer_id": payload.customer_id}
    )

    return {"success": True, "message": f"تم تحرير مقعد الجهاز ({row['device_name']}) بنجاح."}


# ==============================================================================
# 5. Payment Review & Confirmation
# ==============================================================================

@router.get("/payments")
def list_all_payments(
    status_filter: Optional[str] = None,
    claims: Dict[str, Any] = Depends(require_financial_admin)
):
    """Lists incoming payments for financial auditing."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    if status_filter:
        cur.execute("SELECT * FROM server_payments WHERE status = ? ORDER BY id DESC;", (status_filter,))
    else:
        cur.execute("SELECT * FROM server_payments ORDER BY id DESC LIMIT 100;")
    rows = cur.fetchall()
    return {"payments": [dict(r) for r in rows]}


@router.post("/payments/confirm")
def confirm_payment(
    payload: ConfirmPaymentAdminRequest,
    claims: Dict[str, Any] = Depends(require_financial_admin)
):
    """Confirms payment and automatically provisions/renews license if requested."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cur.execute("SELECT id, customer_id, amount, status FROM server_payments WHERE payment_id = ?;", (payload.payment_id,))
    pay = cur.fetchone()
    if not pay:
        raise HTTPException(status_code=404, detail="سجل الدفع غير موجود.")

    now_iso = datetime.now(timezone.utc).isoformat()
    admin_name = claims.get("username", "admin")

    cur.execute("""
        UPDATE server_payments
        SET status = ?, confirmed_at = ?, confirmed_by = ?, notes = notes || ?
        WHERE payment_id = ?;
    """, (payload.status, now_iso, admin_name, f" | Admin note: {payload.notes or ''}", payload.payment_id))
    conn.commit()

    issued_key = None
    if payload.status == "CONFIRMED" and payload.plan_id:
        issued_key = _provision_subscription_and_license(db, pay["customer_id"], payload.plan_id, admin_name)

    db.log_audit(
        actor_id=claims.get("sub", ""),
        actor_username=admin_name,
        actor_role=claims.get("role", "admin"),
        action_type="PAYMENT_CONFIRM",
        target_type="PAYMENT",
        target_id=payload.payment_id,
        result="SUCCESS",
        metadata={"status": payload.status, "plan_id": payload.plan_id, "license_key": issued_key}
    )

    return {
        "success": True,
        "message": f"تم تحديث حالة الدفع إلى ({payload.status}).",
        "license_key": issued_key
    }


# ==============================================================================
# 6. Release Management & Staged Publishing
# ==============================================================================

@router.post("/releases/publish")
def publish_software_release(
    version: str = Form(...),
    channel: str = Form("stable"),
    min_supported_version: str = Form("4.0.0"),
    is_mandatory: bool = Form(False),
    release_notes: str = Form(""),
    package_file: UploadFile = File(...),
    claims: Dict[str, Any] = Depends(require_licensing_admin)
):
    """
    Uploads a new release binary (.exe / .zip), calculates its SHA-256 hash,
    generates an Ed25519 digital signature of the release manifest, and registers it.
    """
    clean_ver = version.strip().lstrip("v")
    clean_channel = channel.strip().lower()
    if clean_channel not in ("stable", "beta", "internal"):
        clean_channel = "stable"

    # Save package file to releases directory (sanitizing client filename against directory traversal)
    clean_client_filename = os.path.basename(package_file.filename or "update.zip")
    if not clean_client_filename or clean_client_filename in (".", ".."):
        clean_client_filename = f"package_{secrets.token_hex(4)}.zip"
    filename = f"ThermalLabPro_v{clean_ver}_{clean_channel}_{clean_client_filename}"
    dest_path = config.RELEASES_DIR / filename

    hasher = hashlib.sha256()
    size_bytes = 0
    with open(dest_path, "wb") as f:
        while chunk := package_file.file.read(65536):
            hasher.update(chunk)
            size_bytes += len(chunk)
            f.write(chunk)

    sha256_hash = hasher.hexdigest()

    # Generate Ed25519 Signed Manifest
    now_iso = datetime.now(timezone.utc).isoformat()
    manifest_data = {
        "version": clean_ver,
        "channel": clean_channel,
        "min_supported_version": min_supported_version,
        "is_mandatory": is_mandatory,
        "package_filename": filename,
        "package_size_bytes": size_bytes,
        "package_sha256": sha256_hash,
        "published_at_utc": now_iso
    }
    manifest_signature = Ed25519LicensingEngine.sign_payload(manifest_data)

    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    release_id = f"REL-{secrets.token_hex(4).upper()}"
    cur.execute("""
        INSERT OR REPLACE INTO server_software_releases (
            release_id, version, channel, min_supported_version, is_mandatory,
            is_active, package_filename, package_size_bytes, package_sha256,
            manifest_signature, release_notes, created_at, published_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?);
    """, (
        release_id, clean_ver, clean_channel, min_supported_version,
        1 if is_mandatory else 0, filename, size_bytes, sha256_hash,
        manifest_signature, release_notes, now_iso, now_iso
    ))

    # Update latest stable setting if stable
    if clean_channel == "stable":
        cur.execute("UPDATE server_system_settings SET value = ?, updated_at = ? WHERE key = 'latest_stable_version';", (clean_ver, now_iso))

    conn.commit()

    admin_name = claims.get("username", "admin")
    db.log_audit(
        actor_id=claims.get("sub", ""),
        actor_username=admin_name,
        actor_role=claims.get("role", "admin"),
        action_type="RELEASE_PUBLISH",
        target_type="RELEASE",
        target_id=clean_ver,
        result="SUCCESS",
        metadata={"channel": clean_channel, "sha256": sha256_hash, "size": size_bytes}
    )

    return {
        "success": True,
        "message": f"تم نشر الإصدار {clean_ver} على قناة ({clean_channel}) بنجاح وتوقيع البيان رقمياً بواسطة Ed25519.",
        "release_id": release_id,
        "sha256": sha256_hash
    }


# ==============================================================================
# 7. Audit Trail Query
# ==============================================================================

@router.get("/audit-logs")
def get_security_audit_logs(
    limit: int = 100,
    offset: int = 0,
    action_type: Optional[str] = None,
    claims: Dict[str, Any] = Depends(require_admin)
):
    """Retrieves immutable system audit records."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    if action_type:
        cur.execute("""
            SELECT * FROM server_audit_logs
            WHERE action_type = ?
            ORDER BY id DESC LIMIT ? OFFSET ?;
        """, (action_type, limit, offset))
    else:
        cur.execute("""
            SELECT * FROM server_audit_logs
            ORDER BY id DESC LIMIT ? OFFSET ?;
        """, (limit, offset))
    rows = cur.fetchall()
    return {"audit_logs": [dict(r) for r in rows]}
