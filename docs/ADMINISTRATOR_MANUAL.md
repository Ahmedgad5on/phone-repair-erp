# ProLab Studio Commercial Ecosystem — Administrator & Owner Manual

**Document Version:** 1.0.0  
**Target Audience:** System Owner, Sales Managers, Operations Team, Technical Support Engineers.

---

## 1. Overview of Administrative Tools

The commercial ecosystem gives the owner two interconnected administrative interfaces:

1. **Owner Admin Web Dashboard (Component B):**
   - Accessible from any web browser: `https://licensing.prolab.com/admin/dashboard`
   - Ideal for monitoring business KPIs, reviewing incoming registrations on mobile/laptop, approving accounts, and confirming customer payments.
2. **ThermalLabPro License Manager (Component C):**
   - Independent desktop application: `license_manager/main.py`
   - Designed for support engineers: offline `.prolablic` license file generation, detailed device inspect/release, hardware transfer authoring, and license revocation.

---

## 2. Customer Lifecycle Management

### 2.1 Registration Approval Flow
When a customer registers from the desktop login screen:
1. The customer enters their name, shop name, username, Egyptian phone number, and city.
2. An SMS OTP code is dispatched to their phone. Upon successful verification, their account transitions to `PENDING_APPROVAL`.
3. In the **Owner Admin Dashboard**:
   - Navigate to the **"طلبات التسجيل المعلقة"** tab.
   - Review the customer's phone number, shop name, and city.
   - Click **"موافقة (Approve)"** to authorize the account, or **"رفض (Reject)"** with an optional rejection reason.

### 2.2 Account Status Reference
- `PENDING_VERIFICATION`: Customer has submitted the form but has not verified their phone OTP.
- `PENDING_APPROVAL`: Phone verified, awaiting administrative review.
- `APPROVED`: Customer account is verified and ready for subscription assignment.
- `ACTIVE`: Customer has an active paid or trial subscription.
- `SUSPENDED`: Temporarily halted by administrator.
- `BLOCKED`: Access permanently denied.

---

## 3. Subscription & License Provisioning

### 3.1 Standard Subscription Plans
| Plan ID | Plan Name | Duration | Device Limit | Grace Period | Price |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `trial_14d` | تجربة مجانية (14 يوماً) | 14 Days | 1 PC | 3 Days | 0 EGP |
| `monthly_standard` | باقة شهرية أساسية | 30 Days | 1 PC | 5 Days | 450 EGP |
| `quarterly_pro` | باقة 3 أشهر المتقدمة | 90 Days | 2 PCs | 7 Days | 1,200 EGP |
| `annual_pro` | باقة سنوية شاملة | 365 Days | 3 PCs | 14 Days | 4,200 EGP |
| `lifetime_vip` | باقة دائمة غير محدودة | Lifetime (2099) | 5 PCs | 30 Days | 15,000 EGP |

### 3.2 Issuing a License Key
1. From the **Owner Dashboard** or **License Manager**, select **"إصدار ترخيص جديد (Issue License)"**.
2. Select the customer and choose the plan.
3. If the customer requires additional workstations (e.g., 4 cashiers instead of 2), override the **"حد الأجهزة (Device Limit)"**.
4. Click **"إصدار وتوقيع الترخيص (Issue & Sign)"**.
5. The system generates an unforgeable license key (format: `TPRO-XXXX-XXXX-XXXX-XXXX`) and records an audit log. Provide this key to the customer via WhatsApp.

### 3.3 Early Renewal Behavior
If a customer renews their subscription before it expires:
- The system automatically adds the new plan duration to their **current expiration date**.
- Customers never lose paid days by renewing early!

---

## 4. Workstation & Device Management

### 4.1 Device Limits
Each subscription defines the maximum number of simultaneous PC activations allowed (e.g., 1, 2, 3, or 5).

### 4.2 Releasing / Deactivating a Device
If a customer replaces their computer or reformats their hard drive:
1. Open the **"إدارة الأجهزة (Devices)"** tab.
2. Locate the customer's old device (identified by Installation ID, Hostname, and last seen date).
3. Click **"تحرير الجهاز (Release Device)"**.
4. This immediately frees up an activation slot so the customer can activate their new machine without needing a new license key.

---

## 5. Offline Activation Packages (`.prolablic`)

For clients with air-gapped computers or intermittent internet connectivity:
1. Ask the customer to copy their **معرف الجهاز (Installation ID)** from the desktop license activation dialog (format: `TLP-XXXX-XXXX-XXXX-XXXX-XXXX`).
2. Open **ThermalLabPro License Manager**.
3. Select **"تصدير ترخيص بدون إنترنت (Export Offline Package)"**.
4. Enter the customer's License Key and their Device Installation ID.
5. Click **"إنشاء وحفظ ملف الترخيص (.prolablic)"**.
6. Send the generated `.prolablic` file to the customer via WhatsApp or flash drive.
7. The customer clicks **"استيراد ملف (.prolablic)"** in their desktop application to activate instantly without internet access!

---

## 6. Software Release Management & Auto-Updates

### 6.1 Publishing a Release
1. Build and test the new client application release (`ThermalLabPro-X.Y.Z.zip`).
2. Open the **Owner Dashboard** -> **"إدارة التحديثات (Releases)"**.
3. Enter the new version number (e.g., `4.6.0`).
4. Select the release channel:
   - `stable`: General distribution to all customers.
   - `beta`: Early access for pilot shops.
5. Choose whether the update is mandatory (`is_mandatory`).
6. Paste the formatted Arabic Release Notes (سجل التحسينات).
7. Attach the zip package and click **"رفع ونشر التحديث (Publish & Sign)"**.
8. The server computes the SHA-256 package hash, generates an Ed25519 digital signature over the release manifest, and stages the package for download.
