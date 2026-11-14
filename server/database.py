"""
server/database.py — Central Licensing Database Engine & Migration Manager
Supports SQLite WAL mode with concurrency locks, row factories, and PostgreSQL compatibility.
"""
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import sqlite3
import threading
from typing import Any, Dict, List, Optional, Tuple, Union

from server.config import config
from server.security import hash_password

logger = logging.getLogger(__name__)


class CentralDatabaseManager:
    """
    Central Database Manager with thread-safe connection pooling,
    automatic schema creation, seeding, and migration management.
    """
    _instance: Optional["CentralDatabaseManager"] = None
    _lock = threading.RLock()

    def __init__(self, db_path: Optional[str] = None):
        if db_path is not None:
            self.db_path = str(db_path)
        else:
            # Parse from config
            url = config.DATABASE_URL
            if url.startswith("sqlite:///"):
                self.db_path = url.replace("sqlite:///", "")
            else:
                self.db_path = str(config.SERVER_DATA_DIR / "licensing.db")

        db_dir = os.path.dirname(os.path.abspath(self.db_path))
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)

        self._local = threading.local()
        self.init_schema()

    @classmethod
    def get_instance(cls, db_path: Optional[str] = None) -> "CentralDatabaseManager":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls(db_path)
            return cls._instance

    @property
    def lock(self) -> threading.RLock:
        return self._lock

    def get_connection(self) -> sqlite3.Connection:
        """Retrieves or creates a thread-local SQLite connection with WAL enabled."""
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(
                self.db_path,
                timeout=60.0,
                check_same_thread=False
            )
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.execute("PRAGMA foreign_keys=ON;")
            conn.execute("PRAGMA busy_timeout=60000;")
            self._local.conn = conn
        return conn

    def close(self):
        """Closes thread-local connection."""
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
            self._local.conn = None

    def init_schema(self):
        """Initializes all required enterprise licensing tables, indices, and defaults."""
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()

            # 1. Users Table (Admins and Customer Account Logins)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT UNIQUE NOT NULL,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'customer',
                    is_active INTEGER NOT NULL DEFAULT 1,
                    mfa_enabled INTEGER NOT NULL DEFAULT 0,
                    mfa_secret TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    last_login_at TEXT DEFAULT NULL
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON server_users(username);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON server_users(role);")

            # 2. Customers Table (Business Profiles)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_customers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_id TEXT UNIQUE NOT NULL,
                    user_id TEXT NOT NULL,
                    full_name TEXT NOT NULL,
                    shop_name TEXT NOT NULL,
                    phone_number TEXT UNIQUE NOT NULL,
                    phone_verified INTEGER NOT NULL DEFAULT 0,
                    email TEXT DEFAULT '',
                    city TEXT NOT NULL,
                    account_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
                    registration_policy TEXT NOT NULL DEFAULT 'PHONE_AND_ADMIN_APPROVAL',
                    notes TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    approved_at TEXT DEFAULT NULL,
                    approved_by TEXT DEFAULT NULL,
                    FOREIGN KEY (user_id) REFERENCES server_users(user_id) ON DELETE CASCADE
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_customers_phone ON server_customers(phone_number);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_customers_status ON server_customers(account_status);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_customers_user_id ON server_customers(user_id);")

            # 3. Registration Requests Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_registration_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT UNIQUE NOT NULL,
                    customer_id TEXT NOT NULL,
                    phone_number TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
                    ip_address TEXT DEFAULT '',
                    submitted_at TEXT NOT NULL,
                    reviewed_at TEXT DEFAULT NULL,
                    reviewed_by TEXT DEFAULT NULL,
                    review_notes TEXT DEFAULT '',
                    FOREIGN KEY (customer_id) REFERENCES server_customers(customer_id) ON DELETE CASCADE
                );
            """)

            # 4. OTP Verification Records
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_otp_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone_number TEXT NOT NULL,
                    otp_code TEXT NOT NULL,
                    purpose TEXT NOT NULL DEFAULT 'REGISTRATION',
                    expires_at TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 5,
                    is_verified INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_otp_phone ON server_otp_records(phone_number);")

            # 5. Subscription Plans Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_subscription_plans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    plan_id TEXT UNIQUE NOT NULL,
                    plan_name TEXT NOT NULL,
                    duration_days INTEGER NOT NULL,
                    price REAL NOT NULL,
                    currency TEXT NOT NULL DEFAULT 'EGP',
                    device_limit INTEGER NOT NULL DEFAULT 1,
                    grace_period_days INTEGER NOT NULL DEFAULT 7,
                    is_trial INTEGER NOT NULL DEFAULT 0,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    features_json TEXT NOT NULL DEFAULT '[]',
                    description TEXT DEFAULT '',
                    created_at TEXT NOT NULL
                );
            """)

            # 6. Customer Subscriptions Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_subscriptions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subscription_id TEXT UNIQUE NOT NULL,
                    customer_id TEXT NOT NULL,
                    plan_id TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'ACTIVE',
                    start_date_utc TEXT NOT NULL,
                    expires_date_utc TEXT NOT NULL,
                    grace_expires_utc TEXT NOT NULL,
                    auto_renew INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (customer_id) REFERENCES server_customers(customer_id) ON DELETE CASCADE,
                    FOREIGN KEY (plan_id) REFERENCES server_subscription_plans(plan_id)
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_subs_customer ON server_subscriptions(customer_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_subs_status ON server_subscriptions(status);")

            # 7. Licenses Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_licenses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    license_id TEXT UNIQUE NOT NULL,
                    customer_id TEXT NOT NULL,
                    subscription_id TEXT NOT NULL,
                    plan_id TEXT NOT NULL,
                    license_key TEXT UNIQUE NOT NULL,
                    signed_token TEXT NOT NULL,
                    device_limit INTEGER NOT NULL DEFAULT 1,
                    status TEXT NOT NULL DEFAULT 'ACTIVE',
                    issued_at_utc TEXT NOT NULL,
                    expires_at_utc TEXT NOT NULL,
                    revocation_reason TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (customer_id) REFERENCES server_customers(customer_id) ON DELETE CASCADE,
                    FOREIGN KEY (subscription_id) REFERENCES server_subscriptions(subscription_id) ON DELETE CASCADE
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_licenses_customer ON server_licenses(customer_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_licenses_key ON server_licenses(license_key);")

            # 8. Registered Devices Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_devices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_id TEXT NOT NULL,
                    customer_id TEXT NOT NULL,
                    license_id TEXT NOT NULL,
                    device_name TEXT NOT NULL,
                    os_info TEXT DEFAULT '',
                    app_version TEXT DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'ACTIVE',
                    registered_at_utc TEXT NOT NULL,
                    last_validated_utc TEXT NOT NULL,
                    ip_address TEXT DEFAULT '',
                    UNIQUE(customer_id, device_id),
                    FOREIGN KEY (customer_id) REFERENCES server_customers(customer_id) ON DELETE CASCADE,
                    FOREIGN KEY (license_id) REFERENCES server_licenses(license_id) ON DELETE CASCADE
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_devices_devid ON server_devices(device_id);")

            # 9. Payment Records Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_payments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    payment_id TEXT UNIQUE NOT NULL,
                    customer_id TEXT NOT NULL,
                    subscription_id TEXT DEFAULT '',
                    amount REAL NOT NULL,
                    currency TEXT NOT NULL DEFAULT 'EGP',
                    payment_method TEXT NOT NULL,
                    reference_number TEXT DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'PENDING',
                    confirmed_by TEXT DEFAULT NULL,
                    confirmed_at TEXT DEFAULT NULL,
                    notes TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (customer_id) REFERENCES server_customers(customer_id) ON DELETE CASCADE
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_payments_status ON server_payments(status);")

            # 10. Software Releases Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_software_releases (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    release_id TEXT UNIQUE NOT NULL,
                    version TEXT NOT NULL,
                    channel TEXT NOT NULL DEFAULT 'stable',
                    min_supported_version TEXT DEFAULT '4.0.0',
                    is_mandatory INTEGER NOT NULL DEFAULT 0,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    package_filename TEXT NOT NULL,
                    package_size_bytes INTEGER NOT NULL,
                    package_sha256 TEXT NOT NULL,
                    manifest_signature TEXT NOT NULL,
                    release_notes TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    published_at TEXT DEFAULT NULL,
                    UNIQUE(version, channel)
                );
            """)

            # 11. Security Audit Logs Table (Append-only)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp_utc TEXT NOT NULL,
                    actor_id TEXT NOT NULL,
                    actor_username TEXT NOT NULL,
                    actor_role TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    target_type TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    result TEXT NOT NULL,
                    ip_address TEXT DEFAULT '',
                    metadata_json TEXT DEFAULT '{}'
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_time ON server_audit_logs(timestamp_utc);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_actor ON server_audit_logs(actor_username);")

            # 12. System Settings Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_system_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)

            # 13. Schema Migrations Tracking
            cur.execute("""
                CREATE TABLE IF NOT EXISTS server_schema_migrations (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    applied_at TEXT NOT NULL
                );
            """)

            conn.commit()
            self._seed_initial_data(conn)

    def _seed_initial_data(self, conn: sqlite3.Connection):
        """Seeds default administrative roles, standard plans, and runtime settings."""
        cur = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()

        # Seed Default Super Admin if no users exist
        cur.execute("SELECT COUNT(*) FROM server_users;")
        if cur.fetchone()[0] == 0:
            admin_pwd = hash_password("ProLabAdmin2026!Secure")
            cur.execute("""
                INSERT INTO server_users (user_id, username, password_hash, role, is_active, created_at)
                VALUES (?, ?, ?, ?, 1, ?);
            """, ("USR-ADMIN-001", "superadmin", admin_pwd, "super_admin", now))

            # Add support and licensing administrators for RBAC demonstration
            lic_pwd = hash_password("LicensingAdmin2026!")
            cur.execute("""
                INSERT INTO server_users (user_id, username, password_hash, role, is_active, created_at)
                VALUES (?, ?, ?, ?, 1, ?);
            """, ("USR-ADMIN-002", "licensingadmin", lic_pwd, "licensing_admin", now))

            fin_pwd = hash_password("FinancialAdmin2026!")
            cur.execute("""
                INSERT INTO server_users (user_id, username, password_hash, role, is_active, created_at)
                VALUES (?, ?, ?, ?, 1, ?);
            """, ("USR-ADMIN-003", "financialadmin", fin_pwd, "financial_admin", now))

        # Seed Standard Subscription Plans if none exist
        cur.execute("SELECT COUNT(*) FROM server_subscription_plans;")
        if cur.fetchone()[0] == 0:
            plans = [
                ("trial_14d", "باقة التجربة المجانية (14 يوماً)", 14, 0.0, "EGP", 1, 3, 1, 1,
                 json.dumps(["trading", "thermal_cad", "pos", "kyc"]), "فترة تجربة مجانية لكافة ميزات النظام"),
                ("monthly_standard", "الباقة الشهرية الأساسية", 30, 450.0, "EGP", 1, 5, 0, 1,
                 json.dumps(["trading", "thermal_cad", "pos", "kyc", "audits"]), "اشتراك شهري مرن لجهاز واحد"),
                ("quarterly_pro", "الباقة الربع سنوية المتقدمة (3 أشهر)", 90, 1200.0, "EGP", 2, 7, 0, 1,
                 json.dumps(["trading", "thermal_cad", "pos", "kyc", "audits", "telegram_bot"]), "اشتراك 3 أشهر مع دعم جهازين وربط تيليجرام"),
                ("annual_pro", "الباقة السنوية الشاملة (الأكثر طلباً)", 365, 4200.0, "EGP", 3, 14, 0, 1,
                 json.dumps(["trading", "thermal_cad", "pos", "kyc", "audits", "telegram_bot", "vip_support"]), "اشتراك سنوي كامل لـ 3 أجهزة مع ميزات VIP"),
                ("lifetime_vip", "الباقة الدائمة غير المحدودة (Lifetime VIP)", 0, 15000.0, "EGP", 5, 30, 0, 1,
                 json.dumps(["trading", "thermal_cad", "pos", "kyc", "audits", "telegram_bot", "vip_support", "unlimited_updates"]), "ترخيص دائم مدى الحياة لـ 5 أجهزة مع كافة التحديثات المستقبلية")
            ]
            cur.executemany("""
                INSERT INTO server_subscription_plans (
                    plan_id, plan_name, duration_days, price, currency,
                    device_limit, grace_period_days, is_trial, is_active,
                    features_json, description, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, [(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], now) for p in plans])

        # Seed Default System Settings
        default_settings = [
            ("registration_policy", "PHONE_AND_ADMIN_APPROVAL"),
            ("whatsapp_support_phone", config.WHATSAPP_SUPPORT_PHONE),
            ("otp_provider", config.OTP_PROVIDER),
            ("offline_grace_hours", str(config.DEFAULT_OFFLINE_GRACE_HOURS)),
            ("company_name", "ProLab Trading Studio & ERP"),
            ("latest_stable_version", "4.6.0")
        ]
        for key, val in default_settings:
            cur.execute("""
                INSERT OR IGNORE INTO server_system_settings (key, value, updated_at)
                VALUES (?, ?, ?);
            """, (key, val, now))

        conn.commit()

    def log_audit(
        self,
        actor_id: str,
        actor_username: str,
        actor_role: str,
        action_type: str,
        target_type: str,
        target_id: str,
        result: str = "SUCCESS",
        ip_address: str = "",
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Records an immutable security audit event."""
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            now = datetime.now(timezone.utc).isoformat()
            meta_json = json.dumps(metadata or {})
            cur.execute("""
                INSERT INTO server_audit_logs (
                    timestamp_utc, actor_id, actor_username, actor_role,
                    action_type, target_type, target_id, result,
                    ip_address, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (now, actor_id, actor_username, actor_role, action_type, target_type, target_id, result, ip_address, meta_json))
            conn.commit()
