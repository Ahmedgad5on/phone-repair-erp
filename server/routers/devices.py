"""
server/routers/devices.py — Customer Device Management & Transfer Router
"""
from datetime import datetime, timezone
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from server.database import CentralDatabaseManager
from server.dependencies import get_current_user_claims
from server.schemas import RegisteredDeviceResponse, DeviceTransferRequest

router = APIRouter(prefix="/api/v1/devices", tags=["Device Management"])


class DeactivateDeviceRequest(BaseModel):
    device_id: str


@router.get("/my-devices", response_model=List[RegisteredDeviceResponse])
def list_my_devices(claims: Dict[str, Any] = Depends(get_current_user_claims)):
    """Lists all active and registered devices for the current customer."""
    cust_id = claims.get("customer_id")
    if not cust_id:
        raise HTTPException(status_code=400, detail="الحساب الحالي غير مرتبط بملف عميل.")

    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT device_id, device_name, status, registered_at_utc, last_validated_utc, os_info, app_version
        FROM server_devices
        WHERE customer_id = ?
        ORDER BY id DESC;
    """, (cust_id,))
    rows = cur.fetchall()

    return [
        RegisteredDeviceResponse(
            device_id=r["device_id"],
            device_name=r["device_name"],
            status=r["status"],
            registered_at_utc=r["registered_at_utc"],
            last_validated_utc=r["last_validated_utc"],
            os_info=r["os_info"],
            app_version=r["app_version"]
        ) for r in rows
    ]


@router.post("/deactivate")
def deactivate_device(
    payload: DeactivateDeviceRequest,
    claims: Dict[str, Any] = Depends(get_current_user_claims)
):
    """Deactivates a device to free up an activation slot."""
    cust_id = claims.get("customer_id")
    if not cust_id:
        raise HTTPException(status_code=400, detail="الحساب الحالي غير مرتبط بملف عميل.")

    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, device_name FROM server_devices
        WHERE customer_id = ? AND device_id = ?;
    """, (cust_id, payload.device_id.strip()))
    row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود في قائمة أجهزتك المسجلة.")

    cur.execute("""
        UPDATE server_devices
        SET status = 'DEACTIVATED'
        WHERE id = ?;
    """, (row["id"],))
    conn.commit()

    db.log_audit(
        actor_id=cust_id,
        actor_username=claims.get("username", ""),
        actor_role="customer",
        action_type="DEVICE_DEACTIVATE",
        target_type="DEVICE",
        target_id=payload.device_id.strip(),
        result="SUCCESS",
        metadata={"device_name": row["device_name"]}
    )

    return {"success": True, "message": f"تم إلغاء تفعيل الجهاز ({row['device_name']}) بنجاح وإتاحة مقعد جديد في الترخيص."}


@router.post("/transfer")
def transfer_device_activation(
    payload: DeviceTransferRequest,
    claims: Dict[str, Any] = Depends(get_current_user_claims)
):
    """
    Transfers license activation from an old device to a new device
    (e.g. after computer replacement or Windows reinstallation).
    """
    cust_id = claims.get("customer_id")
    if not cust_id:
        raise HTTPException(status_code=400, detail="الحساب الحالي غير مرتبط بملف عميل.")

    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    old_id = payload.old_device_id.strip()
    new_id = payload.new_device_id.strip()

    # Verify old device belongs to this customer
    cur.execute("""
        SELECT id, license_id, device_name FROM server_devices
        WHERE customer_id = ? AND device_id = ? AND status = 'ACTIVE';
    """, (cust_id, old_id))
    old_row = cur.fetchone()
    if not old_row:
        raise HTTPException(status_code=404, detail="الجهاز القديم غير موجود أو غير نشط.")

    now_iso = datetime.now(timezone.utc).isoformat()

    # Deactivate old device
    cur.execute("UPDATE server_devices SET status = 'TRANSFERRED' WHERE id = ?;", (old_row["id"],))

    # Register new device under same license
    cur.execute("""
        INSERT OR REPLACE INTO server_devices (
            device_id, customer_id, license_id, device_name,
            os_info, app_version, status, registered_at_utc, last_validated_utc
        ) VALUES (?, ?, ?, ?, 'Windows Reinstall / Replacement', '4.6.0', 'ACTIVE', ?, ?);
    """, (new_id, cust_id, old_row["license_id"], payload.new_device_name.strip(), now_iso, now_iso))

    conn.commit()

    db.log_audit(
        actor_id=cust_id,
        actor_username=claims.get("username", ""),
        actor_role="customer",
        action_type="DEVICE_TRANSFER",
        target_type="DEVICE",
        target_id=new_id,
        result="SUCCESS",
        metadata={"old_device": old_id, "reason": payload.reason}
    )

    return {
        "success": True,
        "message": f"تم نقل الترخيص بنجاح من ({old_row['device_name']}) إلى ({payload.new_device_name})."
    }
