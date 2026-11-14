"""
server/schemas.py — Pydantic v2 Models & API Request/Response Schemas
Strict validation of payloads, phone numbers, passwords, and cryptographic license tokens.
"""
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator

ARABIC_INDIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


# ==============================================================================
# Authentication & Registration Schemas
# ==============================================================================

class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100, description="الاسم الكامل للعميل")
    shop_name: str = Field(..., min_length=2, max_length=100, description="اسم المحل أو النشاط التجاري")
    username: str = Field(..., min_length=2, max_length=50, description="اسم المستخدم للدخول")
    phone_number: str = Field(..., min_length=8, max_length=25, description="رقم الهاتف الأساسي للتحقق")
    password: str = Field(..., min_length=6, max_length=100, description="كلمة المرور (6 خانات على الأقل)")
    confirm_password: str = Field(..., min_length=6, max_length=100)
    city: str = Field(..., min_length=2, max_length=50, description="المحافظة أو المدينة")
    email: Optional[str] = None
    referral_code: Optional[str] = None
    license_key: Optional[str] = Field(None, description="مفتاح الترخيص / كود الاشتراك اختياري")
    otp_code: Optional[str] = Field(None, description="رمز التحقق OTP إن وجد")
    accept_terms: bool = Field(True, description="الموافقة على شروط الاستخدام وسياسة الخصوصية")

    @field_validator("username")
    @classmethod
    def clean_username(cls, v: str) -> str:
        s = v.strip().replace(" ", "_")
        if not re.match(r"^[\w\u0600-\u06FF.-]+$", s, re.UNICODE):
            raise ValueError("اسم المستخدم يجب أن يحتوي على أحرف أو أرقام فقط بدون رموز خاصة.")
        return s

    @field_validator("phone_number")
    @classmethod
    def clean_phone(cls, v: str) -> str:
        return str(v).translate(ARABIC_INDIC_DIGITS).strip()

    @field_validator("otp_code")
    @classmethod
    def clean_otp(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return str(v).translate(ARABIC_INDIC_DIGITS).strip()
        return v

    @field_validator("license_key")
    @classmethod
    def clean_license_key(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return str(v).translate(ARABIC_INDIC_DIGITS).strip().upper()
        return v

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v, values):
        if "password" in values.data and v != values.data["password"]:
            raise ValueError("كلمة المرور وتأكيد كلمة المرور غير متطابقين.")
        return v

    @field_validator("accept_terms")
    @classmethod
    def terms_must_be_accepted(cls, v):
        if not v:
            raise ValueError("يجب الموافقة على شروط الاستخدام وسياسة الخصوصية لإتمام التسجيل.")
        return v


class SendOTPRequest(BaseModel):
    phone_number: str
    purpose: str = "REGISTRATION"


class VerifyOTPRequest(BaseModel):
    phone_number: str
    otp_code: str = Field(..., min_length=4, max_length=8)
    purpose: str = "REGISTRATION"


class LoginRequest(BaseModel):
    username_or_phone: str
    password: str
    device_id: Optional[str] = None
    device_name: Optional[str] = None


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    role: str
    customer_id: Optional[str] = None
    account_status: Optional[str] = None
    shop_name: Optional[str] = None


class TokenRefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    phone_number: str


class ResetPasswordRequest(BaseModel):
    phone_number: str
    otp_code: str
    new_password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v, values):
        if "new_password" in values.data and v != values.data["new_password"]:
            raise ValueError("كلمة المرور وتأكيد كلمة المرور غير متطابقين.")
        return v


# ==============================================================================
# Customer Profile Schemas
# ==============================================================================

class CustomerProfileResponse(BaseModel):
    customer_id: str
    user_id: str
    full_name: str
    shop_name: str
    phone_number: str
    phone_verified: bool
    email: Optional[str] = None
    city: str
    account_status: str
    registration_policy: str
    created_at: str
    approved_at: Optional[str] = None
    active_plan: Optional[str] = None
    subscription_status: Optional[str] = None
    subscription_expires_at: Optional[str] = None
    license_key: Optional[str] = None
    device_count: int = 0
    device_limit: int = 1


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    shop_name: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


# ==============================================================================
# Licensing & Device Schemas
# ==============================================================================

class DeviceActivationRequest(BaseModel):
    customer_id: Optional[str] = None
    license_key: str = Field(..., min_length=4, description="License Key or Activation Code")
    device_id: str = Field(..., min_length=4, description="Cryptographic Hardware/Installation ID")
    device_name: str = Field(..., min_length=2, description="Computer Name or Station Name")
    os_info: Optional[str] = None
    app_version: Optional[str] = None
    device_metadata: Optional[Dict[str, Any]] = None


class TrialActivationRequest(BaseModel):
    customer_id: Optional[str] = None
    username_or_phone: Optional[str] = None
    device_id: str = Field(..., min_length=4)
    device_name: str = Field(..., min_length=2)
    os_info: Optional[str] = None
    app_version: Optional[str] = "4.6.0"
    device_metadata: Optional[Dict[str, Any]] = None


class DeviceActivationResponse(BaseModel):
    success: bool
    message: str
    license_id: str
    license_key: str
    status: str
    device_id: str
    expires_at_utc: str
    remaining_days: int
    grace_period_hours: int
    features: List[str]
    signed_token: str
    public_key_pem: str


class LicenseValidationRequest(BaseModel):
    license_key: Optional[str] = ""
    device_id: str
    token: Optional[str] = None
    app_version: Optional[str] = None


class LicenseValidationResponse(BaseModel):
    valid: bool
    status: str
    message: str
    expires_at_utc: Optional[str] = None
    remaining_days: int = 0
    in_grace_period: bool = False
    features: List[str] = []
    signed_token: Optional[str] = None


class OfflineActivationRequest(BaseModel):
    license_key: str
    device_id: str
    device_name: str
    notes: Optional[str] = None


class OfflineActivationResponse(BaseModel):
    success: bool
    license_key: str
    device_id: str
    signed_package_b64: str
    expires_at_utc: str
    instructions: str


class DeviceTransferRequest(BaseModel):
    license_key: str
    old_device_id: str
    new_device_id: str
    new_device_name: str
    reason: str


class RegisteredDeviceResponse(BaseModel):
    device_id: str
    device_name: str
    status: str
    registered_at_utc: str
    last_validated_utc: str
    os_info: Optional[str] = None
    app_version: Optional[str] = None


# ==============================================================================
# Subscription & Plans Schemas
# ==============================================================================

class SubscriptionPlanResponse(BaseModel):
    plan_id: str
    plan_name: str
    duration_days: int
    price: float
    currency: str
    device_limit: int
    grace_period_days: int
    is_trial: bool
    features: List[str]
    description: str


class SubscriptionRenewalRequest(BaseModel):
    plan_id: str
    payment_method: str = "Cash"
    reference_number: Optional[str] = None
    notes: Optional[str] = None


# ==============================================================================
# Payment Schemas
# ==============================================================================

class SubmitPaymentRequest(BaseModel):
    amount: float = Field(..., gt=0)
    currency: str = "EGP"
    payment_method: str
    subscription_id: Optional[str] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None


class ConfirmPaymentRequest(BaseModel):
    payment_id: str
    status: str = "CONFIRMED"  # CONFIRMED or REJECTED
    notes: Optional[str] = None
    activate_subscription: bool = True
    plan_id: Optional[str] = None


class PaymentRecordResponse(BaseModel):
    payment_id: str
    customer_id: str
    amount: float
    currency: str
    payment_method: str
    reference_number: Optional[str] = None
    status: str
    created_at: str
    confirmed_at: Optional[str] = None
    confirmed_by: Optional[str] = None
    notes: Optional[str] = None


# ==============================================================================
# Software Updates Schemas
# ==============================================================================

class CheckUpdateRequest(BaseModel):
    current_version: str
    channel: str = "stable"
    device_id: Optional[str] = None


class CheckUpdateResponse(BaseModel):
    update_available: bool
    latest_version: str
    channel: str
    min_supported_version: str
    is_mandatory: bool
    download_url: Optional[str] = None
    package_filename: Optional[str] = None
    package_size_bytes: int = 0
    package_sha256: Optional[str] = None
    manifest_signature: Optional[str] = None
    release_notes: Optional[str] = None


# ==============================================================================
# Admin & Dashboard Schemas
# ==============================================================================

class AdminApprovalRequest(BaseModel):
    customer_id: str
    action: str  # "APPROVE", "REJECT", "SUSPEND", "REACTIVATE", "BLOCK"
    plan_id: Optional[str] = None  # Auto-assign plan on approval if provided
    notes: Optional[str] = None


class AdminStatsResponse(BaseModel):
    total_customers: int
    pending_approvals: int
    approved_customers: int
    active_subscriptions: int
    expired_subscriptions: int
    expiring_soon_subscriptions: int
    total_revenue_egp: float
    active_devices: int
    latest_version: str
