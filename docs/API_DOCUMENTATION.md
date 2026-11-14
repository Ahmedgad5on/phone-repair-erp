# ProLab Central Licensing Server — API Reference Documentation

**Version:** 1.0.0  
**Base URL:** `https://licensing.prolab.com/api/v1` (or `http://localhost:8000/api/v1` in local development)  
**Authentication Scheme:** HTTP Bearer JSON Web Tokens (JWT) signed with HMAC-SHA256.  
**Digital Signatures:** Ed25519 (RFC 8032) pure elliptic curve asymmetric signatures.

---

## 1. Authentication & Security Architecture

### 1.1 Password Hashing (Argon2id)
All user passwords are encrypted using pure Argon2id:
- **Memory Cost:** 65,536 KiB (64 MB)
- **Time Cost:** 3 iterations
- **Parallelism:** 4 lanes
- **Salt:** 16 bytes of cryptographically secure random entropy (`os.urandom(16)`)

### 1.2 JWT Tokens
- **Access Token:** Valid for 60 minutes (`exp`), contains user claims (`sub`, `username`, `role`).
- **Refresh Token:** Valid for 30 days (`exp`), supports single-use rotation.

---

## 2. Authentication Endpoints (`/api/v1/auth`)

### 2.1 Self-Service Customer Registration
- **Endpoint:** `POST /api/v1/auth/register`
- **Description:** Allows new retail workshop owners to register directly from the desktop login screen.
- **Request Body:**
```json
{
  "full_name": "أحمد محمد محمود",
  "shop_name": "سنتر الأهرام للمحمول",
  "username": "ahram_mobile",
  "phone_number": "01012345678",
  "password": "SecurePassword2026!",
  "confirm_password": "SecurePassword2026!",
  "city": "القاهرة",
  "email": "ahram@example.com",
  "referral_code": "PROMO2026",
  "accept_terms": true
}
```
- **Response (201 Created):**
```json
{
  "success": true,
  "message": "تم إنشاء الحساب بنجاح. يرجى إدخال رمز التحقق المرسل إلى هاتفك.",
  "customer_id": "CUST-A1B2C3D4",
  "phone_number": "+201012345678",
  "account_status": "PENDING_VERIFICATION",
  "debug_otp": "489214"
}
```

### 2.2 Send Phone OTP Code
- **Endpoint:** `POST /api/v1/auth/send-otp`
- **Rate Limit:** 1 request per 60 seconds per phone number; maximum 5 requests per day.
- **Request Body:**
```json
{
  "phone_number": "01012345678",
  "purpose": "REGISTRATION"
}
```

### 2.3 Verify Phone OTP Code
- **Endpoint:** `POST /api/v1/auth/verify-otp`
- **Request Body:**
```json
{
  "phone_number": "01012345678",
  "otp_code": "489214",
  "purpose": "REGISTRATION"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "تم التحقق من رقم الهاتف بنجاح.",
  "phone_verified": true
}
```

### 2.4 User & Administrator Login
- **Endpoint:** `POST /api/v1/auth/login`
- **Request Body:**
```json
{
  "username_or_phone": "superadmin",
  "password": "ProLabAdmin2026!Secure"
}
```
- **Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user_id": "USR-ADMIN-001",
  "username": "superadmin",
  "role": "super_admin",
  "customer": null
}
```

---

## 3. Cryptographic Licensing (`/api/v1/licensing`)

### 3.1 Online Device Activation
- **Endpoint:** `POST /api/v1/licensing/activate`
- **Description:** Binds a hardware Installation ID to an active license key.
- **Request Body:**
```json
{
  "customer_id": "CUST-A1B2C3D4",
  "license_key": "TPRO-7A8B-9C0D-1E2F-3A4B",
  "device_id": "TLP-BA99-B824-FD7F-33CD-03C9",
  "device_name": "Cashier-PC-01",
  "device_metadata": {
    "hostname": "DESKTOP-POS",
    "os_name": "Windows",
    "os_version": "10.0.26200"
  }
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "تم تفعيل الجهاز بنجاح.",
  "license_id": "LIC-11223344",
  "license_key": "TPRO-7A8B-9C0D-1E2F-3A4B",
  "status": "ACTIVE",
  "device_id": "TLP-BA99-B824-FD7F-33CD-03C9",
  "expires_at_utc": "2027-11-14T18:00:00Z",
  "remaining_days": 365,
  "grace_period_hours": 168,
  "features": ["trading", "pos", "thermal_cad", "audits", "telegram_bot"],
  "signed_token": "eyJhbGciOiJFZDI1NTE5In0.eyJjdXN0b21lcl9pZCI6...e7F6...",
  "public_key_pem": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAJoX3Bd5Nq/jZ9AS8wtVd7kOtEAW2yPxTD4nYOELyBz0=\n-----END PUBLIC KEY-----"
}
```

### 3.2 Heartbeat License Validation
- **Endpoint:** `POST /api/v1/licensing/validate`
- **Request Body:**
```json
{
  "device_id": "TLP-BA99-B824-FD7F-33CD-03C9",
  "license_token": "eyJhbGciOiJFZDI1NTE5In0..."
}
```
- **Response (200 OK):**
```json
{
  "valid": true,
  "status": "ACTIVE",
  "message": "الترخيص نشط وصالح للعمل.",
  "remaining_days": 364,
  "grace_period_hours": 168,
  "in_grace_period": false,
  "license_token": "eyJhbGciOiJFZDI1NTE5In0...updated..."
}
```

### 3.3 Offline License Package Generation
- **Endpoint:** `POST /api/v1/licensing/offline-activate`
- **Description:** Generates a signed `.prolablic` air-gapped activation package for offline devices.
- **Request Body:**
```json
{
  "customer_id": "CUST-A1B2C3D4",
  "license_key": "TPRO-7A8B-9C0D-1E2F-3A4B",
  "device_id": "TLP-BA99-B824-FD7F-33CD-03C9",
  "notes": "صيدلية ومحل في منطقة ريفية بدون إنترنت"
}
```

---

## 4. Automatic Update Infrastructure (`/api/v1/updates`)

### 4.1 Check for Software Updates
- **Endpoint:** `POST /api/v1/updates/check`
- **Request Body:**
```json
{
  "current_version": "4.5.0",
  "channel": "stable",
  "platform": "win32"
}
```
- **Response (200 OK):**
```json
{
  "update_available": true,
  "latest_version": "4.6.0",
  "channel": "stable",
  "min_supported_version": "4.0.0",
  "is_mandatory": false,
  "download_url": "https://licensing.prolab.com/api/v1/updates/download/ThermalLabPro-4.6.0.zip",
  "package_filename": "ThermalLabPro-4.6.0.zip",
  "package_size_bytes": 45892304,
  "package_sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "manifest_signature": "eyJhbGciOiJFZDI1NTE5In0.eyJ2ZXJzaW9uIjoiNC42LjAi...sig",
  "release_notes": "تحديث شامل يتضمن حماية التراخيص وتثبيت معدل استهلاك بطارية آيفون."
}
```

---

## 5. Administrative Gateway (`/api/v1/admin`)
*Requires Bearer Token with role `super_admin` or `licensing_admin`.*

- `GET /api/v1/admin/stats`: Real-time KPI metrics (revenue, active licenses, expiring soon).
- `GET /api/v1/admin/customers`: Searchable customer list with account statuses and filters.
- `POST /api/v1/admin/approval`: Approve, reject, suspend, or reactivate customer accounts.
- `POST /api/v1/admin/licenses/issue`: Provisions a subscription and issues an Ed25519 signed license.
- `POST /api/v1/admin/licenses/revoke`: Revokes a license immediately.
- `POST /api/v1/admin/devices/release`: Deactivates a device registration to free up an activation slot.
- `POST /api/v1/admin/releases/publish`: Uploads and signs a new software release bundle.
- `GET /api/v1/admin/audit-logs`: Paginated immutable security audit trails.
