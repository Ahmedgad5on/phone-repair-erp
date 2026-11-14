"""
server/routers/payments.py — Customer Payment Submission & Tracking Router
"""
from datetime import datetime, timezone
import secrets
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status

from server.database import CentralDatabaseManager
from server.dependencies import get_current_user_claims
from server.schemas import SubmitPaymentRequest, PaymentRecordResponse

router = APIRouter(prefix="/api/v1/payments", tags=["Payments"])


@router.post("/submit")
def submit_payment(
    payload: SubmitPaymentRequest,
    claims: Dict[str, Any] = Depends(get_current_user_claims)
):
    """Submits a customer payment record for administrative review."""
    cust_id = claims.get("customer_id")
    if not cust_id:
        raise HTTPException(status_code=400, detail="الحساب الحالي غير مرتبط بملف عميل.")

    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    now_utc = datetime.now(timezone.utc).isoformat()
    payment_id = f"PAY-{secrets.token_hex(4).upper()}"

    cur.execute("""
        INSERT INTO server_payments (
            payment_id, customer_id, subscription_id, amount, currency,
            payment_method, reference_number, status, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?);
    """, (
        payment_id, cust_id, payload.subscription_id or "", payload.amount,
        payload.currency, payload.payment_method, payload.reference_number or "",
        payload.notes or "", now_utc
    ))
    conn.commit()

    db.log_audit(
        actor_id=cust_id,
        actor_username=claims.get("username", ""),
        actor_role="customer",
        action_type="PAYMENT_SUBMIT",
        target_type="PAYMENT",
        target_id=payment_id,
        result="SUCCESS",
        metadata={"amount": payload.amount, "method": payload.payment_method}
    )

    return {
        "success": True,
        "message": f"تم استلام تفاصيل الدفع بنجاح برقم إشعار {payment_id}. سيتم مراجعته وتأكيد التفعيل.",
        "payment_id": payment_id
    }


@router.get("/my-payments", response_model=List[PaymentRecordResponse])
def get_my_payments(claims: Dict[str, Any] = Depends(get_current_user_claims)):
    """Lists customer payment history."""
    cust_id = claims.get("customer_id")
    if not cust_id:
        raise HTTPException(status_code=400, detail="الحساب الحالي غير مرتبط بملف عميل.")

    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT payment_id, customer_id, amount, currency, payment_method,
               reference_number, status, created_at, confirmed_at, confirmed_by, notes
        FROM server_payments
        WHERE customer_id = ?
        ORDER BY id DESC;
    """, (cust_id,))
    rows = cur.fetchall()

    return [
        PaymentRecordResponse(
            payment_id=r["payment_id"],
            customer_id=r["customer_id"],
            amount=r["amount"],
            currency=r["currency"],
            payment_method=r["payment_method"],
            reference_number=r["reference_number"],
            status=r["status"],
            created_at=r["created_at"],
            confirmed_at=r["confirmed_at"],
            confirmed_by=r["confirmed_by"],
            notes=r["notes"]
        ) for r in rows
    ]
