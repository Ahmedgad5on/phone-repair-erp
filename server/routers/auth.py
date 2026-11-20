"""
server/routers/auth.py — Authentication, Registration & Phone Verification Router
"""
from datetime import datetime, timezone
import logging
import secrets
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, status

from server.config import config
from server.database import CentralDatabaseManager
from server.otp_service import OTPVerificationService
from server.schemas import (
    RegisterRequest, SendOTPRequest, VerifyOTPRequest,
    LoginRequest, LoginResponse, TokenRefreshRequest,
    ForgotPasswordRequest, ResetPasswordRequest
)
from server.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth", tags=["Authentication & Registration"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_customer(payload: RegisterRequest, req: Request):
    """Self-service customer registration from the desktop login screen."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()
    otp_svc = OTPVerificationService(db)

    clean_phone = otp_svc._normalize_phone(payload.phone_number)
    if not clean_phone:
        raise HTTPException(status_code=400, detail="رقم الهاتف غير صالح.")

    username = payload.username.strip().lower()

    # Check for duplicate username
    cur.execute("SELECT id FROM server_users WHERE lower(username) = ?;", (username,))
    if cur.fetchone():
        raise HTTPException(status_code=400, detail="اسم المستخدم مسجل مسبقاً. يرجى اختيار اسم آخر.")

    # Check for duplicate phone number
    cur.execute("SELECT id FROM server_customers WHERE phone_number = ?;", (clean_phone,))
    if cur.fetchone():
        raise HTTPException(status_code=400, detail="رقم الهاتف مسجل مسبقاً بحساب آخر.")

    # Check duplicate email if provided
    if payload.email:
        clean_email = str(payload.email).strip().lower()
        cur.execute("SELECT id FROM server_customers WHERE lower(email) = ?;", (clean_email,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل مسبقاً بحساب آخر.")
    else:
        clean_email = ""

    now_utc = datetime.now(timezone.utc).isoformat()
    user_id = f"USR-{secrets.token_hex(4).upper()}"
    customer_id = f"CUST-{secrets.token_hex(4).upper()}"
    request_id = f"REQ-{secrets.token_hex(4).upper()}"

    # Hash password via Argon2id
    pwd_hash = hash_password(payload.password)

    # Check OTP verification status
    phone_verified = 0
    if payload.otp_code:
        v_ok, _ = otp_svc.verify_otp(clean_phone, payload.otp_code, purpose="REGISTRATION")
        if v_ok:
            phone_verified = 1

    if not phone_verified:
        # Check if phone was verified in an OTP step just before clicking register
        cur.execute("""
            SELECT id FROM server_otp_records
            WHERE phone_number = ? AND purpose = 'REGISTRATION' AND is_verified = 1
            ORDER BY id DESC LIMIT 1;
        """, (clean_phone,))
        if cur.fetchone():
            phone_verified = 1

    # Determine initial account status
    initial_status = "PENDING_VERIFICATION"
    if phone_verified:
        initial_status = "APPROVED" if config.DEFAULT_REGISTRATION_POLICY == "AUTOMATIC" else "PENDING_APPROVAL"

    # Insert user
    cur.execute("""
        INSERT INTO server_users (user_id, username, password_hash, role, is_active, created_at)
        VALUES (?, ?, ?, 'customer', 1, ?);
    """, (user_id, username, pwd_hash, now_utc))

    # Insert customer profile
    cur.execute("""
        INSERT INTO server_customers (
            customer_id, user_id, full_name, shop_name, phone_number,
            phone_verified, email, city, account_status, registration_policy,
            notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (
        customer_id, user_id, payload.full_name.strip(), payload.shop_name.strip(),
        clean_phone, phone_verified, clean_email, payload.city.strip(), initial_status, config.DEFAULT_REGISTRATION_POLICY,
        f"Referral: {payload.referral_code or 'Direct'}", now_utc
    ))

    # Insert registration request
    client_ip = req.client.host if req.client else ""
    cur.execute("""
        INSERT INTO server_registration_requests (
            request_id, customer_id, phone_number, status, ip_address, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?);
    """, (request_id, customer_id, clean_phone, initial_status, client_ip, now_utc))

    # If license key was entered at registration, link it
    activated_key = None
    if payload.license_key:
        lic_clean = payload.license_key.strip().upper()
        cur.execute("SELECT id, license_id, subscription_id, status FROM server_licenses WHERE license_key = ?;", (lic_clean,))
        lic_row = cur.fetchone()
        if lic_row and lic_row["status"] == "ACTIVE":
            cur.execute("UPDATE server_licenses SET customer_id = ? WHERE id = ?;", (customer_id, lic_row["id"]))
            cur.execute("UPDATE server_subscriptions SET customer_id = ? WHERE subscription_id = ?;", (customer_id, lic_row["subscription_id"]))
            cur.execute("UPDATE server_customers SET account_status = 'ACTIVE', approved_at = ? WHERE customer_id = ?;", (now_utc, customer_id))
            initial_status = "ACTIVE"
            activated_key = lic_clean

    # If device_id was supplied, register device record
    if getattr(payload, "device_id", None) and payload.device_id.strip():
        cur.execute("""
            INSERT OR REPLACE INTO server_devices (
                device_id, customer_id, license_id, device_name,
                os_info, app_version, status, registered_at_utc, last_validated_utc
            ) VALUES (?, ?, ?, ?, 'Windows Workstation', '4.7.1', ?, ?, ?);
        """, (payload.device_id.strip(), customer_id, activated_key or "", f"محطة {payload.shop_name.strip()}", initial_status, now_utc, now_utc))

    conn.commit()

    debug_otp = None
    if not phone_verified:
        # Automatically dispatch phone verification OTP
        res = otp_svc.generate_and_send_otp(clean_phone, purpose="REGISTRATION", ip_address=client_ip)
        debug_otp = res[2] if len(res) > 2 else None

    # Log audit event
    db.log_audit(
        actor_id=user_id,
        actor_username=username,
        actor_role="customer",
        action_type="CUSTOMER_REGISTER",
        target_type="CUSTOMER",
        target_id=customer_id,
        result="SUCCESS",
        ip_address=client_ip,
        metadata={"shop_name": payload.shop_name, "phone": clean_phone, "license_key": activated_key}
    )

    success_msg = "تم إنشاء الحساب بنجاح وتفعيل الاشتراك!" if activated_key else (
        "تم إنشاء الحساب والتحقق من الهاتف بنجاح!" if phone_verified else "تم إنشاء الحساب بنجاح. تم إرسال رمز التحقق إلى هاتفك."
    )

    resp = {
        "success": True,
        "message": success_msg,
        "customer_id": customer_id,
        "username": username,
        "phone_number": clean_phone,
        "account_status": initial_status,
        "phone_verified": bool(phone_verified),
        "license_key": activated_key,
    }
    if config.DEBUG and debug_otp:
        resp["debug_otp"] = debug_otp
    return resp


@router.post("/send-otp")
def send_phone_otp(payload: SendOTPRequest, req: Request):
    """Requests a new SMS / WhatsApp verification code."""
    db = CentralDatabaseManager.get_instance()
    otp_svc = OTPVerificationService(db)
    client_ip = req.client.host if req.client else ""
    res = otp_svc.generate_and_send_otp(payload.phone_number, purpose=payload.purpose, ip_address=client_ip)
    ok, msg = res[0], res[1]
    debug_otp = res[2] if len(res) > 2 else None
    wa_url = res[3] if len(res) > 3 else None
    if not ok:
        raise HTTPException(status_code=429, detail=msg)
    resp = {"success": True, "message": msg, "whatsapp_url": wa_url}
    if config.DEBUG and debug_otp:
        resp["debug_otp"] = debug_otp
    return resp


@router.post("/verify-otp")
def verify_phone_otp(payload: VerifyOTPRequest):
    """Verifies the SMS code and updates account status."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()
    otp_svc = OTPVerificationService(db)

    ok, msg = otp_svc.verify_otp(payload.phone_number, payload.otp_code, purpose=payload.purpose)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    clean_phone = otp_svc._normalize_phone(payload.phone_number)
    now_utc = datetime.now(timezone.utc).isoformat()

    if payload.purpose == "REGISTRATION":
        # Check customer record
        cur.execute("SELECT customer_id, registration_policy FROM server_customers WHERE phone_number = ?;", (clean_phone,))
        cust = cur.fetchone()
        if cust:
            cust_id = cust["customer_id"]
            policy = cust["registration_policy"]

            # Mark phone verified
            cur.execute("UPDATE server_customers SET phone_verified = 1 WHERE customer_id = ?;", (cust_id,))

            # Check policy: AUTOMATIC approval or ADMIN approval
            if policy == "AUTOMATIC":
                new_status = "APPROVED"
                approved_at = now_utc
            else:
                new_status = "PENDING_APPROVAL"
                approved_at = None

            cur.execute("""
                UPDATE server_customers
                SET account_status = ?, approved_at = ?
                WHERE customer_id = ?;
            """, (new_status, approved_at, cust_id))

            cur.execute("""
                UPDATE server_registration_requests
                SET status = ?
                WHERE customer_id = ?;
            """, (new_status, cust_id))

            conn.commit()

            return {
                "success": True,
                "message": msg,
                "customer_id": cust_id,
                "phone_verified": True,
                "account_status": new_status
            }

    return {"success": True, "message": msg, "phone_verified": True}


@router.post("/login", response_model=LoginResponse)
def login_user(payload: LoginRequest, req: Request):
    """Authenticates customer or administrator using Argon2id."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()
    otp_svc = OTPVerificationService(db)

    user_input = payload.username_or_phone.strip()
    norm_phone = otp_svc._normalize_phone(user_input)

    # Find user by username or phone
    cur.execute("""
        SELECT u.id, u.user_id, u.username, u.password_hash, u.role, u.is_active,
               c.customer_id, c.account_status, c.shop_name, c.phone_verified
        FROM server_users u
        LEFT JOIN server_customers c ON u.user_id = c.user_id
        WHERE lower(u.username) = ? OR c.phone_number = ?;
    """, (user_input.lower(), norm_phone))
    user_row = cur.fetchone()

    if not user_row:
        raise HTTPException(status_code=401, detail="اسم المستخدم أو كلمة المرور غير صحيحة.")

    if not user_row["is_active"]:
        raise HTTPException(status_code=403, detail="تم تعطيل هذا الحساب. يرجى مراجعة إدارة النظام.")

    # Verify Argon2id password
    if not verify_password(payload.password, user_row["password_hash"]):
        raise HTTPException(status_code=401, detail="اسم المستخدم أو كلمة المرور غير صحيحة.")

    role = user_row["role"]
    cust_status = user_row["account_status"]

    # Blocked or suspended check for customers
    if role == "customer":
        if cust_status == "BLOCKED":
            raise HTTPException(status_code=403, detail="تم حظر هذا الحساب لمخالفة الشروط. تواصل مع الدعم الفني.")
        elif cust_status == "SUSPENDED":
            raise HTTPException(status_code=403, detail="تم إيقاف الحساب مؤقتاً. يرجى التواصل مع الإدارة لتفعيله.")
        elif cust_status == "REJECTED":
            raise HTTPException(status_code=403, detail="تم رفض طلب التسجيل لهذا الحساب.")

    # Update last login
    now_utc = datetime.now(timezone.utc).isoformat()
    cur.execute("UPDATE server_users SET last_login_at = ? WHERE id = ?;", (now_utc, user_row["id"]))
    conn.commit()

    # Generate JWT Tokens
    token_claims = {
        "sub": user_row["user_id"],
        "username": user_row["username"],
        "role": role,
        "customer_id": user_row["customer_id"],
        "shop_name": user_row["shop_name"]
    }
    access_token = create_access_token(token_claims)
    refresh_token = create_refresh_token(token_claims)

    client_ip = req.client.host if req.client else ""
    db.log_audit(
        actor_id=user_row["user_id"],
        actor_username=user_row["username"],
        actor_role=role,
        action_type="USER_LOGIN",
        target_type="USER",
        target_id=user_row["user_id"],
        result="SUCCESS",
        ip_address=client_ip
    )

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user_row["user_id"],
        username=user_row["username"],
        role=role,
        customer_id=user_row["customer_id"],
        account_status=cust_status,
        shop_name=user_row["shop_name"]
    )


@router.post("/refresh")
def refresh_access_token(payload: TokenRefreshRequest):
    """Rotates refresh token and generates a new access token."""
    claims = decode_token(payload.refresh_token)
    if not claims or claims.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="رمز التحديث (Refresh Token) غير صالح أو منتهي.")

    new_claims = {
        "sub": claims["sub"],
        "username": claims.get("username", ""),
        "role": claims.get("role", "customer"),
        "customer_id": claims.get("customer_id"),
        "shop_name": claims.get("shop_name")
    }
    new_access_token = create_access_token(new_claims)
    new_refresh_token = create_refresh_token(new_claims)
    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest):
    """Dispatches password reset OTP code."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()
    otp_svc = OTPVerificationService(db)

    clean_phone = otp_svc._normalize_phone(payload.phone_number)
    # Generic safe response to prevent phone enumeration and OTP disclosure
    cur.execute("SELECT id FROM server_customers WHERE phone_number = ?;", (clean_phone,))
    if cur.fetchone():
        otp_svc.generate_and_send_otp(clean_phone, purpose="PASSWORD_RESET")
    return {"success": True, "message": "إذا كان هذا الرقم مسجلاً لدينا، فسيتم إرسال رمز التحقق إليه."}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest):
    """Verifies OTP and resets account password using Argon2id."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()
    otp_svc = OTPVerificationService(db)

    clean_phone = otp_svc._normalize_phone(payload.phone_number)
    ok, msg = otp_svc.verify_otp(clean_phone, payload.otp_code, purpose="PASSWORD_RESET")
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    # Find customer user
    cur.execute("SELECT user_id FROM server_customers WHERE phone_number = ?;", (clean_phone,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="الحساب غير موجود.")

    user_id = row["user_id"]
    new_hash = hash_password(payload.new_password)
    cur.execute("UPDATE server_users SET password_hash = ? WHERE user_id = ?;", (new_hash, user_id))
    conn.commit()

    db.log_audit(
        actor_id=user_id,
        actor_username="phone:" + clean_phone,
        actor_role="customer",
        action_type="PASSWORD_RESET",
        target_type="USER",
        target_id=user_id,
        result="SUCCESS"
    )

    return {"success": True, "message": "تم إعادة تعيين كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن."}
