"""
server/routers/customer.py — Customer Profile & Self-Service Router
"""
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status

from server.database import CentralDatabaseManager
from server.dependencies import get_current_user_claims
from server.schemas import (
    CustomerProfileResponse, UpdateProfileRequest, ChangePasswordRequest
)
from server.security import hash_password, verify_password

router = APIRouter(prefix="/api/v1/customer", tags=["Customer Self-Service"])


@router.get("/profile", response_model=CustomerProfileResponse)
def get_customer_profile(claims: Dict[str, Any] = Depends(get_current_user_claims)):
    """Retrieves full profile of the authenticated customer."""
    cust_id = claims.get("customer_id")
    if not cust_id:
        raise HTTPException(status_code=400, detail="الحساب الحالي غير مرتبط بملف عميل تجاري.")

    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT c.customer_id, c.user_id, c.full_name, c.shop_name, c.phone_number,
               c.phone_verified, c.email, c.city, c.account_status, c.registration_policy,
               c.created_at, c.approved_at,
               s.plan_id AS active_plan, s.status AS sub_status, s.expires_date_utc AS sub_expires,
               l.license_key, l.device_limit
        FROM server_customers c
        LEFT JOIN server_subscriptions s ON c.customer_id = s.customer_id AND s.status IN ('ACTIVE', 'TRIAL', 'LIFETIME')
        LEFT JOIN server_licenses l ON s.subscription_id = l.subscription_id AND l.status = 'ACTIVE'
        WHERE c.customer_id = ?
        ORDER BY s.id DESC LIMIT 1;
    """, (cust_id,))
    row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="ملف العميل غير موجود.")

    # Count registered devices
    cur.execute("""
        SELECT COUNT(*) FROM server_devices
        WHERE customer_id = ? AND status = 'ACTIVE';
    """, (cust_id,))
    dev_count = cur.fetchone()[0]

    return CustomerProfileResponse(
        customer_id=row["customer_id"],
        user_id=row["user_id"],
        full_name=row["full_name"],
        shop_name=row["shop_name"],
        phone_number=row["phone_number"],
        phone_verified=bool(row["phone_verified"]),
        email=row["email"] or None,
        city=row["city"],
        account_status=row["account_status"],
        registration_policy=row["registration_policy"],
        created_at=row["created_at"],
        approved_at=row["approved_at"],
        active_plan=row["active_plan"],
        subscription_status=row["sub_status"],
        subscription_expires_at=row["sub_expires"],
        license_key=row["license_key"],
        device_count=dev_count,
        device_limit=row["device_limit"] or 1
    )


@router.put("/profile")
def update_customer_profile(
    payload: UpdateProfileRequest,
    claims: Dict[str, Any] = Depends(get_current_user_claims)
):
    """Updates permitted business profile fields."""
    cust_id = claims.get("customer_id")
    if not cust_id:
        raise HTTPException(status_code=400, detail="الحساب الحالي غير مرتبط بملف عميل تجاري.")

    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    updates = []
    params = []
    if payload.full_name:
        updates.append("full_name = ?")
        params.append(payload.full_name.strip())
    if payload.shop_name:
        updates.append("shop_name = ?")
        params.append(payload.shop_name.strip())
    if payload.email is not None:
        updates.append("email = ?")
        params.append(str(payload.email).strip().lower())
    if payload.city:
        updates.append("city = ?")
        params.append(payload.city.strip())

    if not updates:
        return {"success": True, "message": "لم يتم تقديم أية تعديلات."}

    params.append(cust_id)
    cur.execute(f"UPDATE server_customers SET {', '.join(updates)} WHERE customer_id = ?;", params)
    conn.commit()

    return {"success": True, "message": "تم تحديث بيانات الملف التجاري بنجاح."}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    claims: Dict[str, Any] = Depends(get_current_user_claims)
):
    """Securely updates customer password using Argon2id."""
    user_id = claims["sub"]
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cur.execute("SELECT password_hash FROM server_users WHERE user_id = ?;", (user_id,))
    row = cur.fetchone()
    if not row or not verify_password(payload.current_password, row["password_hash"]):
        raise HTTPException(status_code=400, detail="كلمة المرور الحالية غير صحيحة.")

    new_hash = hash_password(payload.new_password)
    cur.execute("UPDATE server_users SET password_hash = ? WHERE user_id = ?;", (new_hash, user_id))
    conn.commit()

    db.log_audit(
        actor_id=user_id,
        actor_username=claims.get("username", ""),
        actor_role=claims.get("role", "customer"),
        action_type="PASSWORD_CHANGE",
        target_type="USER",
        target_id=user_id,
        result="SUCCESS"
    )

    return {"success": True, "message": "تم تغيير كلمة المرور بنجاح."}
