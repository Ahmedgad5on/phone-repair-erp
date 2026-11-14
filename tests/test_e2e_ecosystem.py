"""
tests/test_e2e_ecosystem.py — Comprehensive End-to-End Ecosystem Verification
Verifies the complete commercial flow:
Registration -> OTP Verification -> Admin Approval -> License Issuance ->
Online Device Activation -> Offline Cryptographic Verification ->
Offline Package Import -> Update Integrity & Updater Backup.
"""
import os
import json
import zipfile
import shutil
from pathlib import Path
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from server.main import app
from server.database import CentralDatabaseManager
from server.config import config
from core.licensing.machine_id import get_installation_id, get_device_metadata
from core.licensing.license_verifier import LicenseVerifier, EMBEDDED_PUBLIC_KEY_PEM
from core.licensing.license_cache import LicenseCacheManager
from core.licensing.client import LicensingClient
from updater.updater import backup_database, apply_update


@pytest.fixture(scope="module")
def client():
    # Ensure database is clean and seeded
    db = CentralDatabaseManager.get_instance()
    db.init_schema()
    with TestClient(app) as test_client:
        yield test_client


def test_full_commercial_lifecycle_e2e(client, tmp_path):
    """Executes the full end-to-end commercial subscription lifecycle."""
    # -------------------------------------------------------------
    # 1. Self-Service Customer Registration
    # -------------------------------------------------------------
    import time
    ts = int(time.time())
    customer_phone = f"010{ts % 100000000:08d}"
    username = f"alamal_{ts}"
    reg_payload = {
        "full_name": "المهندس أحمد جادالله",
        "shop_name": "سنتر الأمل للمحمول",
        "username": username,
        "phone_number": customer_phone,
        "password": "StrongPassword123#",
        "confirm_password": "StrongPassword123#",
        "city": "القاهرة",
        "accept_terms": True
    }
    r = client.post("/api/v1/auth/register", json=reg_payload)
    assert r.status_code == 201, f"Registration failed: {r.text}"
    reg_resp = r.json()
    customer_id = reg_resp["customer_id"]
    assert customer_id.startswith("CUST-")

    # -------------------------------------------------------------
    # 2. Phone OTP Verification
    # (Registration automatically sends OTP to customer's phone)
    # -------------------------------------------------------------
    norm_phone = reg_resp["phone_number"]
    otp_code = reg_resp.get("debug_otp")
    if not otp_code:
        db = CentralDatabaseManager.get_instance()
        conn = db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT otp_code FROM server_otp_records WHERE phone_number = ? ORDER BY id DESC LIMIT 1;", (norm_phone,))
        row = cur.fetchone()
        assert row is not None
        otp_code = row["otp_code"]

    # Verify OTP
    r_verify = client.post("/api/v1/auth/verify-otp", json={"phone_number": norm_phone, "otp_code": otp_code})
    assert r_verify.status_code == 200
    assert r_verify.json()["success"] is True

    # -------------------------------------------------------------
    # 3. Admin Login & Customer Approval
    # -------------------------------------------------------------
    # Login as admin
    admin_login = client.post("/api/v1/auth/login", json={
        "username_or_phone": "superadmin",
        "password": "ProLabAdmin2026!Secure"
    })
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Approve customer
    r_appr = client.post("/api/v1/admin/approval", json={
        "customer_id": customer_id,
        "action": "APPROVE",
        "internal_notes": "تمت مراجعة بيانات المحل والاتصال بالعميل - عميل معتمد."
    }, headers=headers)
    assert r_appr.status_code == 200
    assert r_appr.json()["account_status"] == "APPROVED"

    # -------------------------------------------------------------
    # 4. License Issuance (Annual Plan)
    # -------------------------------------------------------------
    r_lic = client.post("/api/v1/admin/licenses/issue", json={
        "customer_id": customer_id,
        "plan_id": "annual_pro",
        "notes": "تم استلام التحويل عبر فودافون كاش - اشتراك سنوي."
    }, headers=headers)
    assert r_lic.status_code == 200
    lic_info = r_lic.json()
    license_key = lic_info["license_key"]
    assert license_key is not None

    # -------------------------------------------------------------
    # 5. Online Device Activation
    # -------------------------------------------------------------
    device_id = get_installation_id()
    metadata = get_device_metadata()

    r_act = client.post("/api/v1/licensing/activate", json={
        "customer_id": customer_id,
        "license_key": license_key,
        "device_id": device_id,
        "device_name": "Main Cashier PC",
        "device_metadata": metadata
    })
    assert r_act.status_code == 200
    act_data = r_act.json()
    assert act_data["success"] is True
    token = act_data.get("signed_token") or act_data.get("license_token")
    assert token is not None

    # -------------------------------------------------------------
    # 6. Offline Cryptographic Verification on Customer Desktop
    # -------------------------------------------------------------
    verifier = LicenseVerifier()
    status_info = verifier.evaluate_license(token, current_device_id=device_id)

    assert status_info.is_valid is True
    assert status_info.status == "ACTIVE"
    assert status_info.customer_id == customer_id
    assert status_info.license_key == license_key
    assert status_info.device_id == device_id
    assert status_info.days_remaining >= 364
    assert status_info.is_read_only is False

    # -------------------------------------------------------------
    # 7. Offline License Package Import (.prolablic)
    # -------------------------------------------------------------
    offline_pkg = {
        "version": "1.0",
        "format": "prolab_offline_license",
        "customer_id": customer_id,
        "device_id": device_id,
        "license_token": token,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
    offline_file = tmp_path / "customer_license.prolablic"
    offline_file.write_text(json.dumps(offline_pkg, indent=2), encoding="utf-8")

    # Simulate client importing file
    lic_client = LicensingClient()
    ok, msg = lic_client.import_offline_license(str(offline_file))
    assert ok is True
    assert "بنجاح" in msg

    # -------------------------------------------------------------
    # 8. Release Staging & Signed Manifest Verification
    # -------------------------------------------------------------
    # Create fake release package zip
    rel_zip = tmp_path / "ThermalLabPro-4.6.0.zip"
    with zipfile.ZipFile(rel_zip, "w") as z:
        z.writestr("app_version.txt", "4.6.0")

    with open(rel_zip, "rb") as f:
        r_pub = client.post("/api/v1/admin/releases/publish", data={
            "version": "4.6.0",
            "channel": "stable",
            "min_supported_version": "4.0.0",
            "is_mandatory": "false",
            "release_notes": "التحديث السنوي الشامل لمنظومة الفواتير والملصقات."
        }, files={"package_file": ("ThermalLabPro-4.6.0.zip", f, "application/zip")}, headers=headers)
    assert r_pub.status_code == 200

    # Query check updates
    r_check = client.post("/api/v1/updates/check", json={
        "current_version": "4.5.0",
        "channel": "stable",
        "platform": "win32"
    })
    assert r_check.status_code == 200
    update_data = r_check.json()
    assert update_data["update_available"] is True
    assert update_data["latest_version"] == "4.6.0"
    assert update_data["manifest_signature"] is not None

    # Verify manifest signature with Ed25519 public key
    manifest_token = update_data["manifest_signature"]
    sig_ok, manifest_payload, _ = verifier.verify_token_signature(manifest_token)
    assert sig_ok is True
    assert manifest_payload["version"] == "4.6.0"

    # -------------------------------------------------------------
    # 9. Standalone Updater Database Backup & Extraction Safety
    # -------------------------------------------------------------
    fake_app_dir = tmp_path / "app_install"
    fake_data_dir = fake_app_dir / "data"
    fake_data_dir.mkdir(parents=True)
    fake_db = fake_data_dir / "app.db"
    fake_db.write_text("DUMMY_SQLITE_HEADER_CONTENT", encoding="utf-8")

    # Run backup
    assert backup_database(fake_app_dir) is True
    backups = list((fake_data_dir / "backups").glob("*.db"))
    assert len(backups) == 1
    assert backups[0].read_text(encoding="utf-8") == "DUMMY_SQLITE_HEADER_CONTENT"

    # Run apply update
    update_pkg_zip = tmp_path / "update.zip"
    with zipfile.ZipFile(update_pkg_zip, "w") as z:
        z.writestr("ThermalLabPro.exe", "NEW_BINARY_v4.6.0")

    assert apply_update(fake_app_dir, update_pkg_zip) is True
    assert (fake_app_dir / "ThermalLabPro.exe").read_text(encoding="utf-8") == "NEW_BINARY_v4.6.0"
    # Verify local database was NOT touched or deleted
    assert fake_db.exists()
    assert fake_db.read_text(encoding="utf-8") == "DUMMY_SQLITE_HEADER_CONTENT"
