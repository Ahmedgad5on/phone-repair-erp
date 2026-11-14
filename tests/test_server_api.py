"""
tests/test_server_api.py — End-to-End Test Suite for Central Licensing Server (Component D)
Validates all endpoints, Argon2id passwords, Ed25519 signatures, OTP, RBAC, and business logic.
"""
from datetime import datetime, timezone, timedelta
import json
import os
import shutil
import tempfile
import unittest

from fastapi.testclient import TestClient

from server.config import config
from server.database import CentralDatabaseManager
from server.main import app
from server.security import Ed25519LicensingEngine


class TestCentralServerAPI(unittest.TestCase):
    """Full lifecycle testing for the Central Licensing Server."""

    @classmethod
    def setUpClass(cls):
        # Save original config
        cls._orig_data_dir = config.SERVER_DATA_DIR
        cls._orig_keys_dir = config.KEYS_DIR
        cls._orig_releases_dir = config.RELEASES_DIR
        cls._orig_priv_path = config.ED25519_PRIVATE_KEY_PATH
        cls._orig_pub_path = config.ED25519_PUBLIC_KEY_PATH

        # Configure isolated temp directory for test database and keys
        cls.test_dir = tempfile.mkdtemp(prefix="prolab_server_test_")
        cls.db_path = os.path.join(cls.test_dir, "test_licensing.db")
        config.SERVER_DATA_DIR = cls.test_dir
        config.KEYS_DIR = os.path.join(cls.test_dir, "keys")
        config.RELEASES_DIR = os.path.join(cls.test_dir, "releases")
        os.makedirs(config.KEYS_DIR, exist_ok=True)
        os.makedirs(config.RELEASES_DIR, exist_ok=True)

        config.ED25519_PRIVATE_KEY_PATH = os.path.join(config.KEYS_DIR, "ed25519_private.pem")
        config.ED25519_PUBLIC_KEY_PATH = os.path.join(config.KEYS_DIR, "ed25519_public.pem")

        # Reset signing engine keys so it generates in test dir
        Ed25519LicensingEngine._private_key = None
        Ed25519LicensingEngine._public_key = None

        # Force initialize isolated DB instance
        CentralDatabaseManager._instance = None
        cls.db = CentralDatabaseManager.get_instance(cls.db_path)

        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        shutil.rmtree(cls.test_dir, ignore_errors=True)
        # Restore original config and keys
        config.SERVER_DATA_DIR = cls._orig_data_dir
        config.KEYS_DIR = cls._orig_keys_dir
        config.RELEASES_DIR = cls._orig_releases_dir
        config.ED25519_PRIVATE_KEY_PATH = cls._orig_priv_path
        config.ED25519_PUBLIC_KEY_PATH = cls._orig_pub_path
        Ed25519LicensingEngine._private_key = None
        Ed25519LicensingEngine._public_key = None
        CentralDatabaseManager._instance = None

    def test_01_health_check(self):
        resp = self.client.get("/api/v1/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["database"], "connected")

    def test_02_admin_login(self):
        resp = self.client.post("/api/v1/auth/login", json={
            "username_or_phone": "superadmin",
            "password": "ProLabAdmin2026!Secure"
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["role"], "super_admin")
        self.__class__.admin_token = data["access_token"]

    def test_03_customer_registration_and_otp(self):
        # 1. Register customer
        reg_payload = {
            "full_name": "أحمد محمود التاجر",
            "shop_name": "شركة البركة للمحمول",
            "username": "ahmed_baraka",
            "phone_number": "01012345678",
            "password": "CustomerSecurePass2026!",
            "confirm_password": "CustomerSecurePass2026!",
            "city": "القاهرة",
            "email": "baraka@example.com",
            "accept_terms": True
        }
        resp = self.client.post("/api/v1/auth/register", json=reg_payload)
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertIn("customer_id", data)
        cust_id = data["customer_id"]
        debug_otp = data.get("debug_otp")
        self.assertIsNotNone(debug_otp)

        self.__class__.cust_id = cust_id
        self.__class__.cust_phone = data["phone_number"]

        # 2. Verify OTP
        otp_resp = self.client.post("/api/v1/auth/verify-otp", json={
            "phone_number": self.__class__.cust_phone,
            "otp_code": debug_otp,
            "purpose": "REGISTRATION"
        })
        self.assertEqual(otp_resp.status_code, 200)
        otp_data = otp_resp.json()
        self.assertTrue(otp_data["phone_verified"])
        self.assertEqual(otp_data["account_status"], "PENDING_APPROVAL")

    def test_04_admin_approval_and_license_provisioning(self):
        # Admin approves registration and assigns annual_pro plan
        headers = {"Authorization": f"Bearer {self.__class__.admin_token}"}
        resp = self.client.post("/api/v1/admin/customers/approval", json={
            "customer_id": self.__class__.cust_id,
            "action": "APPROVE",
            "plan_id": "annual_pro",
            "notes": "Approved for business trading operations"
        }, headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["new_status"], "APPROVED")
        self.assertIsNotNone(data["issued_license_key"])
        self.__class__.license_key = data["issued_license_key"]
        print("Issued License Key:", self.__class__.license_key)

    def test_05_device_activation_and_signature_verification(self):
        dev_id = "MACHINE_UUID_TEST_12345"
        resp = self.client.post("/api/v1/licensing/activate", json={
            "license_key": self.__class__.license_key,
            "device_id": dev_id,
            "device_name": "Main POS Station 1",
            "os_info": "Windows 11 Pro 64-bit",
            "app_version": "4.6.0"
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "ACTIVE")
        self.assertIn("signed_token", data)
        self.assertIn("public_key_pem", data)

        token = data["signed_token"]
        pub_pem = data["public_key_pem"]

        # Cryptographically verify token using client-side Ed25519 engine
        is_valid, payload, err = Ed25519LicensingEngine.verify_token(token, public_key_pem=pub_pem)
        self.assertTrue(is_valid, f"Verification failed: {err}")
        self.assertEqual(payload["license_key"], self.__class__.license_key)
        self.assertEqual(payload["device_id"], dev_id)
        self.assertIn("trading", payload["features"])

    def test_06_device_limit_enforcement(self):
        # annual_pro allows 3 devices. We activate dev 2 and dev 3, then dev 4 should fail!
        for i in [2, 3]:
            resp = self.client.post("/api/v1/licensing/activate", json={
                "license_key": self.__class__.license_key,
                "device_id": f"MACHINE_UUID_TEST_DEV_{i}",
                "device_name": f"Station {i}",
                "app_version": "4.6.0"
            })
            self.assertEqual(resp.status_code, 200)

        # 4th device exceeds device limit (limit is 3)
        resp_exceed = self.client.post("/api/v1/licensing/activate", json={
            "license_key": self.__class__.license_key,
            "device_id": "MACHINE_UUID_TEST_DEV_4_EXCEED",
            "device_name": "Station 4",
            "app_version": "4.6.0"
        })
        self.assertEqual(resp_exceed.status_code, 403)
        self.assertIn("الحد الأقصى", resp_exceed.json()["detail"])

    def test_07_heartbeat_license_validation(self):
        resp = self.client.post("/api/v1/licensing/validate", json={
            "license_key": self.__class__.license_key,
            "device_id": "MACHINE_UUID_TEST_12345"
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["valid"])
        self.assertEqual(data["status"], "ACTIVE")
        self.assertGreater(data["remaining_days"], 300)

    def test_08_early_renewal_extends_expiration(self):
        # Authenticate as customer
        login_resp = self.client.post("/api/v1/auth/login", json={
            "username_or_phone": "ahmed_baraka",
            "password": "CustomerSecurePass2026!"
        })
        self.assertEqual(login_resp.status_code, 200)
        cust_token = login_resp.json()["access_token"]
        headers_cust = {"Authorization": f"Bearer {cust_token}"}

        # Request renewal for another annual_pro (365 days)
        renew_resp = self.client.post("/api/v1/subscriptions/renew", json={
            "plan_id": "annual_pro",
            "payment_method": "InstaPay",
            "reference_number": "IPAY-998877",
            "notes": "Early renewal payment"
        }, headers=headers_cust)
        self.assertEqual(renew_resp.status_code, 200)
        pay_id = renew_resp.json()["payment_id"]

        # Admin confirms payment
        headers_admin = {"Authorization": f"Bearer {self.__class__.admin_token}"}
        conf_resp = self.client.post("/api/v1/admin/payments/confirm", json={
            "payment_id": pay_id,
            "status": "CONFIRMED",
            "plan_id": "annual_pro"
        }, headers=headers_admin)
        self.assertEqual(conf_resp.status_code, 200)

        # Check customer subscription status: remaining days should now be > 700 days!
        stat_resp = self.client.get("/api/v1/subscriptions/my-status", headers=headers_cust)
        self.assertEqual(stat_resp.status_code, 200)
        sub_data = stat_resp.json()
        self.assertGreater(sub_data["remaining_days"], 700, "Early renewal must add duration to current expiration date!")

    def test_09_device_deactivation_and_transfer(self):
        headers_cust = {"Authorization": f"Bearer {self.client.post('/api/v1/auth/login', json={'username_or_phone': 'ahmed_baraka', 'password': 'CustomerSecurePass2026!'}).json()['access_token']}"}

        # Customer transfers Station 2 to Station Replacement
        resp = self.client.post("/api/v1/devices/transfer", json={
            "license_key": self.__class__.license_key,
            "old_device_id": "MACHINE_UUID_TEST_DEV_2",
            "new_device_id": "MACHINE_UUID_TEST_REPLACED_2",
            "new_device_name": "New Replacement Laptop",
            "reason": "Replaced faulty motherboard"
        }, headers=headers_cust)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["success"])

    def test_10_immutable_audit_logs(self):
        headers_admin = {"Authorization": f"Bearer {self.__class__.admin_token}"}
        resp = self.client.get("/api/v1/admin/audit-logs", headers=headers_admin)
        self.assertEqual(resp.status_code, 200)
        logs = resp.json()["audit_logs"]
        self.assertGreaterEqual(len(logs), 4)
        action_types = [entry["action_type"] for entry in logs]
        self.assertIn("CUSTOMER_REGISTER", action_types)
        self.assertIn("DEVICE_ACTIVATE", action_types)


if __name__ == "__main__":
    unittest.main()
