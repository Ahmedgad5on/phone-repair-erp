"""
tests/test_security_audit_fixes.py — Regression Test Suite for Security Audit Remediations
Validates fixes for:
1. AUTH-ATO-OTP-LEAK: No OTP leak in forgot-password.
2. AUTH-JWT-HARDCODED-SECRET: Forged tokens rejected by database RBAC check.
3. SUPPLY-ZIP-SLIP-TRAVERSAL: Directory traversal blocked in zip extraction and uploads.
4. TG-OWNER-PIN-BRUTEFORCE: Telegram bot brute-force lockout and timing-safe PIN verification.
5. WEB-CORS-WILDCARD-CREDENTIALS: Explicit CORS origin configuration.
"""
import io
from pathlib import Path
import tempfile
import time
import unittest
import zipfile

from fastapi.testclient import TestClient
import jwt

from core.database import DatabaseManager, hash_pin
from core.telegram_bot import TradingTelegramBot
from server.config import config
from server.database import CentralDatabaseManager
from server.main import app
from updater.updater import apply_update


class TestSecurityAuditFixes(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_01_forgot_password_does_not_leak_otp(self):
        """AUTH-ATO-OTP-LEAK: /forgot-password must never return debug_otp."""
        resp = self.client.post("/api/v1/auth/forgot-password", json={
            "phone_number": "01012345678"
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertNotIn("debug_otp", data, "CRITICAL: debug_otp was leaked in /forgot-password response!")

    def test_02_forged_admin_jwt_is_rejected(self):
        """AUTH-JWT-HARDCODED-SECRET: Forged token with fake user must be rejected by RBAC dependency."""
        forged_token = jwt.encode(
            {
                "sub": "fake_attacker_uuid",
                "role": "super_admin",
                "type": "access",
                "exp": int(time.time()) + 3600
            },
            config.SECRET_KEY,
            algorithm="HS256"
        )
        resp = self.client.get("/api/v1/admin/stats", headers={
            "Authorization": f"Bearer {forged_token}"
        })
        # Must be rejected because fake_attacker_uuid does not exist in CentralDatabaseManager
        self.assertIn(resp.status_code, (401, 403), "Forged admin token must be rejected!")

    def test_03_cors_is_not_wildcard_with_credentials(self):
        """WEB-CORS-WILDCARD-CREDENTIALS: Origins must not be ['*'] when credentials are True."""
        self.assertNotIn("*", config.ALLOWED_ORIGINS, "CORS allow_origins must not contain wildcard '*'!")

    def test_04_zip_slip_traversal_is_blocked(self):
        """SUPPLY-ZIP-SLIP-TRAVERSAL: Unsafe zip paths must raise ValueError."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            target_dir = tmp_path / "app_dir"
            target_dir.mkdir()
            pkg_zip = tmp_path / "malicious.zip"

            with zipfile.ZipFile(pkg_zip, "w") as z:
                z.writestr("../../escaped.txt", "MALICIOUS PAYLOAD")

            success = apply_update(target_dir, pkg_zip)
            self.assertFalse(success, "apply_update must fail and abort on malicious zip traversal!")
            escaped_file = tmp_path / "escaped.txt"
            self.assertFalse(escaped_file.exists(), "Zip slip payload must never be extracted outside target directory!")

    def test_05_telegram_bot_bruteforce_lockout(self):
        """TG-OWNER-PIN-BRUTEFORCE: Consecutive invalid PINs trigger a lockout."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_file = Path(tmp_dir) / "test_bot.db"
            db = DatabaseManager(str(db_file))
            # Set owner pin
            db.set_setting("owner_pin", hash_pin("9876"))

            bot = TradingTelegramBot(db)
            chat_id = 999999

            # Send 3 wrong PIN attempts
            for i in range(3):
                bot._handle_message({
                    "chat": {"id": chat_id},
                    "text": f"/auth_owner wrong_{i}",
                    "from": {"first_name": "Attacker"}
                })

            self.assertEqual(len(bot.failed_auth_attempts[chat_id]), 3)
            self.assertNotEqual(bot.owner_chat_id, str(chat_id))

            # 4th attempt with CORRECT pin must be locked out
            bot._handle_message({
                "chat": {"id": chat_id},
                "text": "/auth_owner 9876",
                "from": {"first_name": "Attacker"}
            })
            self.assertNotEqual(bot.owner_chat_id, str(chat_id), "Locked-out chat ID must not be authenticated even with correct PIN!")
            db.close()
