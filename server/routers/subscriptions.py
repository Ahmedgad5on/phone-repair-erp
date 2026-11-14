"""
server/routers/subscriptions.py — Subscription Engine & Renewal Router
Handles plan listings, UTC expiration date arithmetic, early renewal extension, and grace period calculations.
"""
from datetime import datetime, timezone, timedelta
import json
import logging
import secrets
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status

from server.config import config
from server.database import CentralDatabaseManager
from server.dependencies import get_current_user_claims
from server.schemas import (
    SubscriptionPlanResponse, SubscriptionRenewalRequest
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/subscriptions", tags=["Subscriptions"])


@router.get("/plans", response_model=List[SubscriptionPlanResponse])
def list_active_plans():
    """Lists all active subscription plans available for purchase or renewal."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT plan_id, plan_name, duration_days, price, currency,
               device_limit, grace_period_days, is_trial, features_json, description
        FROM server_subscription_plans
        WHERE is_active = 1
        ORDER BY duration_days ASC;
    """)
    rows = cur.fetchall()

    plans = []
    for r in rows:
        feats = json.loads(r["features_json"]) if r["features_json"] else []
        plans.append(SubscriptionPlanResponse(
            plan_id=r["plan_id"],
            plan_name=r["plan_name"],
            duration_days=r["duration_days"],
            price=r["price"],
            currency=r["currency"],
            device_limit=r["device_limit"],
            grace_period_days=r["grace_period_days"],
            is_trial=bool(r["is_trial"]),
            features=feats,
            description=r["description"] or ""
        ))
    return plans


@router.get("/my-status")
def get_my_subscription(claims: Dict[str, Any] = Depends(get_current_user_claims)):
    """Returns the customer's authoritative subscription details, remaining days, and grace status."""
    cust_id = claims.get("customer_id")
    if not cust_id:
        raise HTTPException(status_code=400, detail="الحساب الحالي غير مرتبط بملف عميل.")

    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT s.subscription_id, s.plan_id, s.status, s.start_date_utc,
               s.expires_date_utc, s.grace_expires_utc,
               p.plan_name, p.device_limit, p.features_json,
               l.license_key
        FROM server_subscriptions s
        JOIN server_subscription_plans p ON s.plan_id = p.plan_id
        LEFT JOIN server_licenses l ON s.subscription_id = l.subscription_id AND l.status = 'ACTIVE'
        WHERE s.customer_id = ?
        ORDER BY s.id DESC LIMIT 1;
    """, (cust_id,))
    row = cur.fetchone()

    if not row:
        return {
            "has_subscription": False,
            "status": "NO_SUBSCRIPTION",
            "message": "لا يوجد اشتراك نشط لهذا الحساب حالياً."
        }

    now_utc = datetime.now(timezone.utc)
    expires_dt = datetime.fromisoformat(row["expires_date_utc"])
    grace_dt = datetime.fromisoformat(row["grace_expires_utc"])

    is_lifetime = expires_dt.year > 2090
    if is_lifetime:
        remaining_days = 99999
        sub_status = "LIFETIME"
    elif now_utc <= expires_dt:
        remaining_days = (expires_dt - now_utc).days
        sub_status = "ACTIVE" if remaining_days > 7 else "EXPIRING_SOON"
    elif now_utc <= grace_dt:
        remaining_days = 0
        sub_status = "IN_GRACE_PERIOD"
    else:
        remaining_days = 0
        sub_status = "EXPIRED"

    features = json.loads(row["features_json"]) if row["features_json"] else []

    # Get WhatsApp contact for renewal
    cur.execute("SELECT value FROM server_system_settings WHERE key = 'whatsapp_support_phone';")
    wa_row = cur.fetchone()
    wa_phone = wa_row["value"] if wa_row else config.WHATSAPP_SUPPORT_PHONE

    return {
        "has_subscription": True,
        "subscription_id": row["subscription_id"],
        "plan_id": row["plan_id"],
        "plan_name": row["plan_name"],
        "status": sub_status,
        "start_date_utc": row["start_date_utc"],
        "expires_date_utc": row["expires_date_utc"],
        "remaining_days": remaining_days,
        "device_limit": row["device_limit"],
        "license_key": row["license_key"],
        "features": features,
        "whatsapp_renewal_phone": wa_phone
    }


@router.post("/renew")
def request_subscription_renewal(
    payload: SubscriptionRenewalRequest,
    claims: Dict[str, Any] = Depends(get_current_user_claims)
):
    """
    Submits a renewal request. Creates a pending payment record.
    Adheres to Section 7.3:
    - Early renewal adds new duration to current expiration date.
    - Renewal after expiration starts from today's date.
    """
    cust_id = claims.get("customer_id")
    if not cust_id:
        raise HTTPException(status_code=400, detail="الحساب الحالي غير مرتبط بملف عميل.")

    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cur.execute("SELECT plan_id, plan_name, duration_days, price, currency FROM server_subscription_plans WHERE plan_id = ? AND is_active = 1;", (payload.plan_id,))
    plan = cur.fetchone()
    if not plan:
        raise HTTPException(status_code=404, detail="الباقة المطلوبة غير متوفرة أو معطلة.")

    now_utc = datetime.now(timezone.utc)
    payment_id = f"PAY-{secrets.token_hex(4).upper()}"

    cur.execute("""
        INSERT INTO server_payments (
            payment_id, customer_id, amount, currency, payment_method,
            reference_number, status, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?);
    """, (
        payment_id, cust_id, plan["price"], plan["currency"], payload.payment_method,
        payload.reference_number or "",
        f"طلب تجديد لباقة: {plan['plan_name']} (مدة {plan['duration_days']} يوم). {payload.notes or ''}",
        now_utc.isoformat()
    ))
    conn.commit()

    db.log_audit(
        actor_id=cust_id,
        actor_username=claims.get("username", ""),
        actor_role="customer",
        action_type="SUBSCRIPTION_RENEW_REQUEST",
        target_type="PAYMENT",
        target_id=payment_id,
        result="SUCCESS",
        metadata={"plan_id": payload.plan_id, "amount": plan["price"]}
    )

    return {
        "success": True,
        "message": f"تم تسجيل طلب التجديد للباقة ({plan['plan_name']}) بنجاح برقم {payment_id}. بانتظار مراجعة وتأكيد التحويل.",
        "payment_id": payment_id,
        "amount": plan["price"],
        "currency": plan["currency"]
    }
