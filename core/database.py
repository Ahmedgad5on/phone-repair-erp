"""
core/database.py — High-Concurrency SQLite Engine & Security Architecture
Mobile Phone Trading Store ERP (Strict Trading Focus).

Features:
- SQLite WAL mode with synchronous=NORMAL and foreign_keys=ON
- Thread-safe connection pool with re-entrant locks preventing "database is locked"
- Complete Trading Data: Devices (New & Used), Sales, Multi-Wallet Vaults, Trade-In
- Traders Double-Entry Credit Ledger (له / عليه) & Memo / Consignment Tracking
- Immutable Security Audit Log (un-deletable trigger and logger)
- Offline Telegram Sync Queue with automatic ordering & retry counter
- Secret Cost Cipher engine (10-letter substitution cipher)
- Aging Stock Radar queries (>15 days, >30 days)
- Hierarchical Brand Analytics queries
- 5-Minute Inventory Audit engine with blind multi-scanner support
"""
import base64
import csv
from datetime import datetime, date, timedelta
import hashlib
import hmac
import io
import json
import logging
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
from typing import Any, Dict, List, Optional, Tuple, Union

from core.models import (
    DeviceSpecs, DeviceRecord, SaleRecord, TraderRecord,
    TraderLedgerEntry, MemoRecord, SecurityAuditLog, UserRole
)
from core.paths import get_database_path

logger = logging.getLogger(__name__)


# ==============================================================================
# Secure PIN Hashing & Verification
# ==============================================================================

def hash_pin(pin: str, salt: Optional[str] = None) -> str:
    """Hashes a PIN using salted SHA-256."""
    if not salt:
        salt = secrets.token_hex(8)
    h = hashlib.sha256(f"{salt}:{pin}".encode("utf-8")).hexdigest()
    return f"{salt}${h}"


def verify_pin_hash(pin: str, stored_val: str) -> bool:
    """Timing-safe verification of entered PIN against stored hash or plaintext."""
    if not stored_val or not pin:
        return False
    if "$" in stored_val:
        parts = stored_val.split("$", 1)
        if len(parts) == 2:
            salt, expected_hash = parts
            actual_hash = hashlib.sha256(f"{salt}:{pin}".encode("utf-8")).hexdigest()
            return hmac.compare_digest(actual_hash, expected_hash)
    # Plaintext fallback for legacy unmigrated databases with timing-safe comparison
    return hmac.compare_digest(str(pin).strip(), str(stored_val).strip())


# ==============================================================================
# Secret Cost Cipher Engine (Digit to Letter Substitution)
# ==============================================================================

DEFAULT_CIPHER_KEY = "BLACKHORSE"  # 0=B, 1=L, 2=A, 3=C, 4=K, 5=H, 6=O, 7=R, 8=S, 9=E


def encode_cost_cipher(amount: Union[int, float], cipher_key: str = DEFAULT_CIPHER_KEY) -> str:
    """Encodes numeric purchase cost into a secret alphabet cipher string."""
    if amount is None or amount <= 0:
        return ""
    key = cipher_key.strip().upper()
    if len(key) < 10:
        key = DEFAULT_CIPHER_KEY
    digits = str(int(round(float(amount))))
    cipher = "".join(key[int(d)] for d in digits if d.isdigit())
    return cipher


def decode_cost_cipher(cipher: str, cipher_key: str = DEFAULT_CIPHER_KEY) -> float:
    """Decodes secret alphabet cipher string back to numeric amount."""
    if not cipher:
        return 0.0
    key = cipher_key.strip().upper()
    if len(key) < 10:
        key = DEFAULT_CIPHER_KEY
    digit_map = {char: str(idx) for idx, char in enumerate(key[:10])}
    digits = "".join(digit_map.get(ch.upper(), "") for ch in cipher)
    try:
        return float(digits) if digits else 0.0
    except ValueError:
        return 0.0


# ==============================================================================
# Database Manager
# ==============================================================================

class DatabaseManager:
    """
    High-concurrency SQLite3 persistence manager with WAL mode,
    thread-safe transaction locks, and comprehensive trading domain operations.
    """

    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            self.db_path = str(get_database_path())
        else:
            self.db_path = str(db_path)

        db_dir = os.path.dirname(os.path.abspath(self.db_path))
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)

        self._lock = threading.RLock()
        self._local = threading.local()
        self.init_database()

    def get_connection(self) -> sqlite3.Connection:
        """Retrieves or creates a thread-local SQLite connection with WAL enabled."""
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(
                self.db_path,
                timeout=30.0,
                check_same_thread=False
            )
            conn.row_factory = sqlite3.Row
            # Enable SQLite concurrency and integrity pragmas
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.execute("PRAGMA foreign_keys=ON;")
            conn.execute("PRAGMA busy_timeout=30000;")
            self._local.conn = conn
        return conn

    def close(self):
        """Closes the current thread-local connection."""
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
            self._local.conn = None

    def init_database(self):
        """Creates the full trading schema and indexes if they do not already exist."""
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()

            # 1. Devices Table (Smart Stock Intake)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS devices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stock_no TEXT UNIQUE NOT NULL,
                    condition TEXT NOT NULL DEFAULT 'Used',
                    brand TEXT NOT NULL,
                    model_name TEXT NOT NULL,
                    model_code TEXT DEFAULT '',
                    storage TEXT DEFAULT '',
                    ram TEXT DEFAULT '',
                    color TEXT DEFAULT '',
                    serial_number TEXT DEFAULT '',
                    imei1 TEXT DEFAULT '',
                    imei2 TEXT DEFAULT '',
                    ecid TEXT DEFAULT '',
                    os_version TEXT DEFAULT '',
                    sales_region TEXT DEFAULT '',
                    battery_health INTEGER DEFAULT NULL,
                    battery_cycles INTEGER DEFAULT NULL,
                    warranty_status TEXT DEFAULT 'ساري',
                    tax_status TEXT DEFAULT 'ضمان محلي / مسدد الضريبة',
                    ownership TEXT DEFAULT 'ملك المحل',
                    buy_price REAL DEFAULT 0.0,
                    prep_cost REAL DEFAULT 0.0,
                    target_selling_price REAL DEFAULT 0.0,
                    min_allowed_price REAL DEFAULT 0.0,
                    secret_cost_cipher TEXT DEFAULT '',
                    status TEXT DEFAULT 'in_stock',
                    intake_date TEXT NOT NULL,
                    seller_name TEXT DEFAULT '',
                    seller_phone TEXT DEFAULT '',
                    seller_id_photo TEXT DEFAULT '',
                    trader_id INTEGER DEFAULT NULL,
                    remarks TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (trader_id) REFERENCES traders (id) ON DELETE SET NULL
                );
            """)

            cur.execute("CREATE INDEX IF NOT EXISTS idx_devices_imei1 ON devices (imei1);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_devices_stock_no ON devices (stock_no);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_devices_status ON devices (status);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_devices_brand ON devices (brand);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_devices_condition ON devices (condition);")

            # 2. Sales / POS Transactions Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invoice_no TEXT UNIQUE NOT NULL,
                    sale_date TEXT NOT NULL,
                    device_id INTEGER NOT NULL,
                    salesperson TEXT NOT NULL,
                    customer_name TEXT DEFAULT '',
                    customer_phone TEXT DEFAULT '',
                    selling_price REAL NOT NULL,
                    discount REAL DEFAULT 0.0,
                    final_price REAL NOT NULL,
                    payment_method TEXT NOT NULL DEFAULT 'Cash',
                    cash_amount REAL DEFAULT 0.0,
                    instapay_amount REAL DEFAULT 0.0,
                    vodafone_cash_amount REAL DEFAULT 0.0,
                    other_wallet_amount REAL DEFAULT 0.0,
                    trader_credit_amount REAL DEFAULT 0.0,
                    instapay_ref TEXT DEFAULT '',
                    proof_photo TEXT DEFAULT '',
                    trade_in_device_id INTEGER DEFAULT NULL,
                    trade_in_allowance REAL DEFAULT 0.0,
                    net_collected REAL NOT NULL,
                    status TEXT DEFAULT 'completed',
                    notes TEXT DEFAULT '',
                    FOREIGN KEY (device_id) REFERENCES devices (id),
                    FOREIGN KEY (trade_in_device_id) REFERENCES devices (id)
                );
            """)

            cur.execute("CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales (invoice_no);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (sale_date);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_sales_device_id ON sales (device_id);")

            # 3. Traders Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS traders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    phone TEXT DEFAULT '',
                    company TEXT DEFAULT '',
                    net_balance REAL DEFAULT 0.0,
                    notes TEXT DEFAULT '',
                    created_at TEXT NOT NULL
                );
            """)

            # 4. Trader Double-Entry Ledger Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS trader_ledger (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trader_id INTEGER NOT NULL,
                    trans_date TEXT NOT NULL,
                    trans_type TEXT NOT NULL,
                    amount REAL NOT NULL,
                    device_id INTEGER DEFAULT NULL,
                    reference_no TEXT DEFAULT '',
                    payment_method TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    balance_after REAL NOT NULL,
                    FOREIGN KEY (trader_id) REFERENCES traders (id) ON DELETE CASCADE,
                    FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE SET NULL
                );
            """)

            cur.execute("CREATE INDEX IF NOT EXISTS idx_ledger_trader ON trader_ledger (trader_id);")

            # 5. Memos & Consignment Tracking Table (بضاعة عرض وأمانة)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS memos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trader_id INTEGER NOT NULL,
                    device_id INTEGER NOT NULL,
                    out_date TEXT NOT NULL,
                    expected_return_date TEXT NOT NULL,
                    returned_date TEXT DEFAULT NULL,
                    status TEXT DEFAULT 'active',
                    notes TEXT DEFAULT '',
                    FOREIGN KEY (trader_id) REFERENCES traders (id),
                    FOREIGN KEY (device_id) REFERENCES devices (id)
                );
            """)

            # 6. Inventory Audits Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS inventory_audits (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    audit_date TEXT NOT NULL,
                    auditor TEXT NOT NULL,
                    filter_condition TEXT DEFAULT 'ALL',
                    filter_brand TEXT DEFAULT 'ALL',
                    total_expected INTEGER DEFAULT 0,
                    total_scanned INTEGER DEFAULT 0,
                    missing_count INTEGER DEFAULT 0,
                    surplus_count INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'completed'
                );
            """)

            # 7. Audit Items Table
            cur.execute("PRAGMA table_info(audit_items);")
            existing_audit_cols = [r["name"] for r in cur.fetchall()]
            if existing_audit_cols and "audit_id" not in existing_audit_cols:
                try:
                    cur.execute("ALTER TABLE audit_items ADD COLUMN audit_id INTEGER DEFAULT 0;")
                except Exception as e:
                    logger.debug("Non-destructive schema migration note: %s", e)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS audit_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    audit_id INTEGER NOT NULL,
                    imei TEXT NOT NULL,
                    device_id INTEGER DEFAULT NULL,
                    scanned_at TEXT NOT NULL,
                    scanner_type TEXT DEFAULT 'desktop_usb',
                    status TEXT NOT NULL,
                    FOREIGN KEY (audit_id) REFERENCES inventory_audits (id) ON DELETE CASCADE
                );
            """)

            # 8. Offline Telegram Sync Queue Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS offline_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    item_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    retry_count INTEGER DEFAULT 0,
                    error_msg TEXT DEFAULT ''
                );
            """)

            cur.execute("CREATE INDEX IF NOT EXISTS idx_queue_status ON offline_queue (status);")

            # 9. Immutable Security Audit Log Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS security_audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    user_role TEXT NOT NULL,
                    user_name TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    device_imei TEXT DEFAULT '',
                    old_value TEXT DEFAULT '',
                    new_value TEXT DEFAULT '',
                    details TEXT DEFAULT ''
                );
            """)

            # Prevent deletion/modification of security audit log rows via trigger
            cur.execute("""
                CREATE TRIGGER IF NOT EXISTS trg_prevent_audit_log_delete
                BEFORE DELETE ON security_audit_log
                BEGIN
                    SELECT RAISE(ABORT, 'Security audit log entries are immutable and cannot be deleted.');
                END;
            """)
            cur.execute("""
                CREATE TRIGGER IF NOT EXISTS trg_prevent_audit_log_update
                BEFORE UPDATE ON security_audit_log
                BEGIN
                    SELECT RAISE(ABORT, 'Security audit log entries are immutable and cannot be updated.');
                END;
            """)

            # 10. Schema Migrations Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    applied_at TEXT NOT NULL
                );
            """)

            # 11. Legacy Workshop & Compatibility Tables
            cur.execute("""
                CREATE TABLE IF NOT EXISTS printed_labels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stock_number TEXT UNIQUE NOT NULL,
                    label_type TEXT NOT NULL,
                    brand TEXT,
                    marketing_name TEXT,
                    model_code TEXT,
                    storage TEXT,
                    ram TEXT,
                    color TEXT,
                    os_version TEXT,
                    serial_number TEXT,
                    imei1 TEXT,
                    imei2 TEXT,
                    battery_health INTEGER,
                    battery_cycles INTEGER,
                    sales_region TEXT,
                    condition_grade TEXT,
                    remarks TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS repair_tickets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticket_id TEXT UNIQUE NOT NULL,
                    customer_name TEXT NOT NULL,
                    customer_phone TEXT NOT NULL,
                    device_model TEXT NOT NULL,
                    reported_fault TEXT NOT NULL,
                    passcode TEXT,
                    sim_removed INTEGER DEFAULT 1,
                    back_cracked INTEGER DEFAULT 0,
                    dead_device INTEGER DEFAULT 0,
                    estimated_cost REAL DEFAULT 0.0,
                    intake_datetime TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS inventory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stock_number TEXT UNIQUE NOT NULL,
                    model TEXT NOT NULL,
                    color TEXT,
                    storage TEXT,
                    imei1 TEXT,
                    status TEXT NOT NULL DEFAULT 'In Stock',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS tac_color_map (
                    tac TEXT NOT NULL,
                    model TEXT NOT NULL,
                    color TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(tac, model)
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS audit_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Compatibility Indexes
            cur.execute("CREATE INDEX IF NOT EXISTS idx_labels_serial ON printed_labels(serial_number);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_labels_imei1 ON printed_labels(imei1);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_labels_model ON printed_labels(marketing_name);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_labels_stock ON printed_labels(stock_number);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_tickets_phone ON repair_tickets(customer_phone);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_tickets_model ON repair_tickets(device_model);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id ON repair_tickets(ticket_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_tickets_customer ON repair_tickets(customer_name);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_inventory_imei ON inventory(imei1);")

            # 12. App Settings Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            """)

            # 11. Telegram Connected Subscribers / Phones Table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS telegram_subscribers (
                    chat_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'Salesperson',
                    username TEXT DEFAULT '',
                    phone_model TEXT DEFAULT '',
                    status TEXT DEFAULT 'active',
                    registered_at TEXT NOT NULL,
                    last_active TEXT NOT NULL
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_telegram_subscribers_role ON telegram_subscribers (role);")

            # 12. Telegram Custom Commands Table (إدارة الأوامر المخصصة للبوت)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS telegram_custom_commands (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    command_trigger TEXT UNIQUE NOT NULL,
                    description TEXT DEFAULT '',
                    response_type TEXT DEFAULT 'text',
                    response_payload TEXT NOT NULL,
                    role_access TEXT DEFAULT 'ALL',
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT NOT NULL
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_custom_commands_trigger ON telegram_custom_commands (command_trigger);")

            # Initialize Default Settings if not present
            defaults = [
                ("store_name", "ProLab Mobile Trading"),
                ("store_phone", "01000000000"),
                ("store_address", "Alexandria, Egypt"),
                ("currency", "EGP"),
                ("cipher_key", DEFAULT_CIPHER_KEY),
                ("owner_pin", "1234"),
                ("sales_pin", "0000"),
                ("telegram_bot_token", ""),
                ("telegram_owner_chat_id", ""),
                ("telegram_staff_chat_ids", ""),
                ("telegram_bot_username", ""),
                ("thermal_printer_name", ""),
                ("default_paper_size", "40x30"),
                ("auto_print_on_intake", "0")
            ]
            for k, v in defaults:
                cur.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?);", (k, v))

            # Auto-heal: sanitize any accidental salted hash stored in PIN settings to clean defaults
            cur.execute("UPDATE app_settings SET value = '1234' WHERE key = 'owner_pin' AND value LIKE '%$%';")
            cur.execute("UPDATE app_settings SET value = '0000' WHERE key = 'sales_pin' AND value LIKE '%$%';")

            conn.commit()
            logger.info("Database schema verified and initialized in WAL mode.")

    # ==========================================================================
    # Settings Management
    # ==========================================================================

    def get_setting(self, key: str, default: str = "") -> str:
        with self._lock:
            conn = self.get_connection()
            row = conn.execute("SELECT value FROM app_settings WHERE key = ?;", (key,)).fetchone()
            return row["value"] if row else default

    def set_setting(self, key: str, value: str):
        with self._lock:
            conn = self.get_connection()
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
                (key, str(value))
            )
            conn.commit()

    def verify_pin(self, pin: str, role: str = "Owner") -> bool:
        """Verifies entered PIN for given role using timing-safe comparison."""
        key = "owner_pin" if role == "Owner" else "sales_pin"
        default = "1234" if role == "Owner" else "0000"
        stored = self.get_setting(key, default)
        return verify_pin_hash(pin, stored)

    def get_owner_pin(self) -> str:
        """Returns the configured owner PIN."""
        return self.get_setting("owner_pin", "1234")

    def get_sales_pin(self) -> str:
        """Returns the configured salesperson PIN."""
        return self.get_setting("sales_pin", "0000")

    def set_pin(self, pin: str, role: str = "Owner") -> bool:
        """Sets a new securely hashed PIN for Owner or Salesperson."""
        if not pin or len(pin) < 4:
            raise ValueError("PIN must be at least 4 digits.")
        key = "owner_pin" if role == "Owner" else "sales_pin"
        hashed = hash_pin(pin)
        self.set_setting(key, hashed)
        self.log_security_event(
            action_type="pin_updated",
            user_role=role,
            user_name="Admin",
            details=f"{role} PIN updated securely"
        )
        return True

    def backup_database(self, destination_path: Optional[str] = None) -> Tuple[bool, str]:
        """
        Creates an atomic, consistent SQLite snapshot using the online backup API.
        Verifies the backup with PRAGMA integrity_check before returning.
        """
        with self._lock:
            try:
                if not destination_path:
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    backups_dir = os.path.join(os.path.dirname(os.path.abspath(self.db_path)), "backups")
                    os.makedirs(backups_dir, exist_ok=True)
                    destination_path = os.path.join(backups_dir, f"backup_{timestamp}.db")
                else:
                    os.makedirs(os.path.dirname(os.path.abspath(destination_path)), exist_ok=True)

                source_conn = self.get_connection()
                dest_conn = sqlite3.connect(destination_path)
                with dest_conn:
                    source_conn.backup(dest_conn, pages=100)
                dest_conn.close()

                # Verify integrity of the backup file
                verify_conn = sqlite3.connect(destination_path)
                cur = verify_conn.cursor()
                cur.execute("PRAGMA integrity_check;")
                check_result = cur.fetchone()[0]
                verify_conn.close()

                if check_result.lower() != "ok":
                    if os.path.exists(destination_path):
                        os.remove(destination_path)
                    return False, f"Backup integrity check failed: {check_result}"

                self.log_security_event(
                    action_type="database_backup",
                    user_role="Owner",
                    user_name="System",
                    details=f"Consistent online backup saved to: {destination_path}"
                )
                return True, destination_path
            except Exception as e:
                logger.error("Failed to perform SQLite online backup: %s", e)
                return False, str(e)

    # ==========================================================================
    # Security Audit Trail
    # ==========================================================================

    def log_security_event(
        self,
        action_type: str,
        user_role: str,
        user_name: str,
        device_imei: str = "",
        old_value: str = "",
        new_value: str = "",
        details: str = "",
        notify_telegram: bool = True
    ) -> int:
        """Records an un-deletable security log entry and optionally queues a Telegram alert."""
        with self._lock:
            conn = self.get_connection()
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO security_audit_log (
                    timestamp, user_role, user_name, action_type, device_imei, old_value, new_value, details
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """, (now_iso, user_role, user_name, action_type, device_imei, str(old_value), str(new_value), details))
            log_id = cur.lastrowid
            conn.commit()

            if not notify_telegram:
                return log_id

            # Resolve device details if possible for rich audit alert
            device = None
            if device_imei:
                device = cur.execute("""
                    SELECT * FROM devices 
                    WHERE imei1 = ? OR imei2 = ? OR stock_no = ? OR serial_number = ?
                    LIMIT 1;
                """, (device_imei, device_imei, device_imei, device_imei)).fetchone()
            if not device and (new_value or old_value):
                check_code = (new_value or old_value).strip()
                padded = f"STK-{int(check_code):06d}" if check_code.isdigit() else check_code
                device = cur.execute("""
                    SELECT * FROM devices 
                    WHERE stock_no = ? OR stock_no = ? OR imei1 = ? OR serial_number = ?
                    LIMIT 1;
                """, (check_code, padded, check_code, check_code)).fetchone()
            if not device and details and ("stock:" in details.lower() or "كود" in details or "سريال" in details):
                import re
                m = re.search(r"(?:stock|كود|سريال):\s*([^\s,]+)", details, re.IGNORECASE)
                if m:
                    st_code = m.group(1).strip()
                    padded = f"STK-{int(st_code):06d}" if st_code.isdigit() else st_code
                    device = cur.execute("""
                        SELECT * FROM devices 
                        WHERE stock_no = ? OR stock_no = ? OR imei1 = ? OR serial_number = ?
                        LIMIT 1;
                    """, (st_code, padded, st_code, st_code)).fetchone()

            action_map = {
                "label_reprint": "🖨️ طباعة / إعادة طباعة ملصق",
                "label_print": "🖨️ طباعة ملصق الباركود",
                "stock_intake": "📥 إدخال جهاز للمخزن",
                "pos_sale": "💸 عملية بيع كاشير جديدة",
                "void_sale": "↩️ إلغاء فاتورة بيع واسترجاع الجهاز",
                "price_update": "💰 تعديل أسعار جهاز",
                "bulk_price_update": "⚡ تعديل جماعي لأسعار موديل",
                "database_backup": "💾 نسخة احتياطية لقاعدة البيانات",
            }
            action_ar = action_map.get(action_type, f"⚡ {action_type}")

            if device:
                cond_str = "🆕 جديد متبرشم" if device["condition"] == "New" else "✨ مستعمل كسر زيرو"
                exp_profit = device["target_selling_price"] - device["buy_price"]
                alert_msg = (
                    "🚨 <b>إشعار نشاط أمني على جهاز</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━\n"
                    f"⚡ <b>العملية:</b> {action_ar}\n"
                    f"👤 <b>المستخدم:</b> {user_name} ({user_role})\n"
                    f"📱 <b>اسم الجهاز:</b> {device['brand']} {device['model_name']}\n"
                    f"📦 <b>الموديل والسعة:</b> {device['model_code'] or '-'} ({device['storage'] or '-'})\n"
                    f"🎨 <b>اللون:</b> {device['color'] or '-'}\n"
                    f"💵 <b>السعر اللي اشتريت بيه:</b> {device['buy_price']:,.0f} ج.م\n"
                    f"🤫 <b>شفرة التكلفة:</b> <code>{device['secret_cost_cipher']}</code>\n"
                    f"💰 <b>سعر البيع المطلوب:</b> {device['target_selling_price']:,.0f} ج.م\n"
                    f"🔒 <b>الحد الأدنى للبيع:</b> {device['min_allowed_price']:,.0f} ج.م\n"
                    f"📈 <b>هامش الربح المتوقع:</b> {exp_profit:,.0f} ج.م\n"
                    f"🔋 <b>حالة البطارية:</b> {device['battery_health'] or 'N/A'}%\n"
                    f"🏷️ <b>الحالة والضريبة:</b> {cond_str} | {device['tax_status']}\n"
                    f"🔖 <b>كود السريال:</b> <code>{device['stock_no']}</code>\n"
                    f"🆔 <b>IMEI:</b> <code>{device['imei1']}</code>\n"
                    f"📝 <b>تفاصيل:</b> {details}\n"
                    f"⏰ <b>الوقت:</b> {now_iso}"
                )
            else:
                alert_msg = (
                    "🚨 <b>إشعار نشاط أمني بالنظام</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━\n"
                    f"⚡ <b>العملية:</b> {action_ar}\n"
                    f"👤 <b>المستخدم:</b> {user_name} ({user_role})\n"
                    f"📱 <b>السريال / IMEI:</b> <code>{device_imei or old_value or new_value or 'N/A'}</code>\n"
                    f"📝 <b>البيان:</b> {details}\n"
                    f"⏰ <b>الوقت:</b> {now_iso}"
                )

            # Avoid double sending if this was stock_intake or pos_sale which have their own rich alert, or normal label printing/reprinting
            if action_type not in ("stock_intake", "pos_sale", "label_print", "label_reprint"):
                self.enqueue_telegram_message("alert", alert_msg)
            return log_id

    def get_security_logs(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self.get_connection()
            rows = conn.execute(
                "SELECT * FROM security_audit_log ORDER BY id DESC LIMIT ?;", (limit,)
            ).fetchall()
            return [dict(r) for r in rows]

    # ==========================================================================
    # Offline Telegram Sync Queue
    # ==========================================================================

    def enqueue_telegram_message(self, item_type: str, payload_text_or_dict: Union[str, Dict[str, Any]]) -> int:
        with self._lock:
            conn = self.get_connection()
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            payload_str = json.dumps(payload_text_or_dict) if isinstance(payload_text_or_dict, dict) else str(payload_text_or_dict)
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO offline_queue (created_at, item_type, payload_json, status, retry_count)
                VALUES (?, ?, ?, 'pending', 0);
            """, (now_iso, item_type, payload_str))
            item_id = cur.lastrowid
            conn.commit()

        # Trigger immediate background flush so Telegram notification is dispatched instantaneously
        try:
            from core.telegram_bot import trigger_immediate_queue_flush
            trigger_immediate_queue_flush()
        except Exception:
            pass

        return item_id

    def get_pending_telegram_queue(self, limit: int = 20) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self.get_connection()
            rows = conn.execute("""
                SELECT * FROM offline_queue
                WHERE status IN ('pending', 'retry')
                ORDER BY id ASC LIMIT ?;
            """, (limit,)).fetchall()
            return [dict(r) for r in rows]

    def mark_telegram_queue_status(self, item_id: int, status: str, error_msg: str = ""):
        with self._lock:
            conn = self.get_connection()
            if status == "sent":
                conn.execute("UPDATE offline_queue SET status = 'sent', error_msg = '' WHERE id = ?;", (item_id,))
            else:
                conn.execute("""
                    UPDATE offline_queue
                    SET status = 'retry', retry_count = retry_count + 1, error_msg = ?
                    WHERE id = ?;
                """, (error_msg, item_id))
            conn.commit()

    # ==========================================================================
    # Telegram Subscribers & Connected Devices
    # ==========================================================================

    def register_telegram_subscriber(
        self,
        chat_id: str,
        name: str,
        role: str = "Salesperson",
        username: str = "",
        phone_model: str = "",
        status: str = "active"
    ) -> bool:
        """Registers or updates a connected Telegram user/phone."""
        chat_id = str(chat_id).strip()
        if not chat_id:
            return False
        with self._lock:
            conn = self.get_connection()
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur = conn.cursor()
            cur.execute("SELECT chat_id FROM telegram_subscribers WHERE chat_id = ?;", (chat_id,))
            exists = cur.fetchone()
            if exists:
                cur.execute("""
                    UPDATE telegram_subscribers
                    SET name = ?, role = ?, username = ?, phone_model = ?, status = ?, last_active = ?
                    WHERE chat_id = ?;
                """, (name, role, username, phone_model, status, now_iso, chat_id))
            else:
                cur.execute("""
                    INSERT INTO telegram_subscribers
                    (chat_id, name, role, username, phone_model, status, registered_at, last_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """, (chat_id, name, role, username, phone_model, status, now_iso, now_iso))
            conn.commit()
            return True

    def get_telegram_subscribers(self) -> List[Dict[str, Any]]:
        """Returns all registered Telegram users/phones, auto-syncing owner if empty."""
        with self._lock:
            conn = self.get_connection()
            # Ensure table exists in case of existing db file
            conn.execute("""
                CREATE TABLE IF NOT EXISTS telegram_subscribers (
                    chat_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'Salesperson',
                    username TEXT DEFAULT '',
                    phone_model TEXT DEFAULT '',
                    status TEXT DEFAULT 'active',
                    registered_at TEXT NOT NULL,
                    last_active TEXT NOT NULL
                );
            """)
            conn.commit()

            rows = conn.execute("""
                SELECT chat_id, name, role, username, phone_model, status, registered_at, last_active
                FROM telegram_subscribers
                ORDER BY CASE WHEN role = 'Owner' THEN 0 ELSE 1 END, last_active DESC;
            """).fetchall()
            subs = [dict(r) for r in rows]

            # If table is empty or owner not present, check telegram_owner_chat_id
            owner_id = self.get_setting("telegram_owner_chat_id", "").strip()
            if owner_id and not any(str(s["chat_id"]) == owner_id for s in subs):
                now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                conn.execute("""
                    INSERT OR IGNORE INTO telegram_subscribers
                    (chat_id, name, role, username, phone_model, status, registered_at, last_active)
                    VALUES (?, '👑 صاحب المحل (المالك)', 'Owner', '', 'هاتف المالك الرئيسي', 'active', ?, ?);
                """, (owner_id, now_iso, now_iso))
                conn.commit()
                rows = conn.execute("""
                    SELECT chat_id, name, role, username, phone_model, status, registered_at, last_active
                    FROM telegram_subscribers
                    ORDER BY CASE WHEN role = 'Owner' THEN 0 ELSE 1 END, last_active DESC;
                """).fetchall()
                subs = [dict(r) for r in rows]

            # Check if staff_chat_ids exist in settings and seed any missing ones
            staff_ids_str = self.get_setting("telegram_staff_chat_ids", "").strip()
            if staff_ids_str:
                for sid in [x.strip() for x in staff_ids_str.split(",") if x.strip()]:
                    if not any(str(s["chat_id"]) == sid for s in subs):
                        now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        conn.execute("""
                            INSERT OR IGNORE INTO telegram_subscribers
                            (chat_id, name, role, username, phone_model, status, registered_at, last_active)
                            VALUES (?, ?, 'Salesperson', '', 'هاتف موظف مبيعات', 'active', ?, ?);
                        """, (sid, f"💼 موظف مبيعات ({sid})", now_iso, now_iso))
                        conn.commit()
                rows = conn.execute("""
                    SELECT chat_id, name, role, username, phone_model, status, registered_at, last_active
                    FROM telegram_subscribers
                    ORDER BY CASE WHEN role = 'Owner' THEN 0 ELSE 1 END, last_active DESC;
                """).fetchall()
                subs = [dict(r) for r in rows]

            return subs

    def delete_telegram_subscriber(self, chat_id: str) -> bool:
        """Deletes a subscriber by chat_id."""
        chat_id = str(chat_id).strip()
        with self._lock:
            conn = self.get_connection()
            conn.execute("DELETE FROM telegram_subscribers WHERE chat_id = ?;", (chat_id,))
            conn.commit()
            owner_id = self.get_setting("telegram_owner_chat_id", "").strip()
            if owner_id == chat_id:
                self.set_setting("telegram_owner_chat_id", "")
            return True

    def update_telegram_subscriber_role(self, chat_id: str, new_role: str) -> bool:
        """Updates subscriber role ('Owner' or 'Salesperson')."""
        chat_id = str(chat_id).strip()
        with self._lock:
            conn = self.get_connection()
            conn.execute("UPDATE telegram_subscribers SET role = ? WHERE chat_id = ?;", (new_role, chat_id))
            conn.commit()
            if new_role == "Owner":
                self.set_setting("telegram_owner_chat_id", chat_id)
            return True

    def touch_telegram_subscriber(self, chat_id: str):
        """Updates last_active timestamp and sets status to active."""
        chat_id = str(chat_id).strip()
        with self._lock:
            conn = self.get_connection()
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            conn.execute("""
                UPDATE telegram_subscribers
                SET last_active = ?, status = 'active'
                WHERE chat_id = ?;
            """, (now_iso, chat_id))
            conn.commit()

    # ==========================================================================
    # Telegram Custom Commands Engine
    # ==========================================================================

    def add_custom_command(
        self,
        command_trigger: str,
        description: str,
        response_payload: str,
        response_type: str = "text",
        role_access: str = "ALL"
    ) -> int:
        """Registers a new custom bot command."""
        trigger = command_trigger.strip()
        if not trigger.startswith("/"):
            trigger = f"/{trigger}"
        with self._lock:
            conn = self.get_connection()
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur = conn.cursor()
            cur.execute("""
                INSERT OR REPLACE INTO telegram_custom_commands
                (command_trigger, description, response_type, response_payload, role_access, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?);
            """, (trigger, description.strip(), response_type, response_payload.strip(), role_access, now_iso))
            cmd_id = cur.lastrowid
            conn.commit()
            return cmd_id

    def get_custom_commands(self, only_active: bool = False) -> List[Dict[str, Any]]:
        """Returns all configured custom bot commands."""
        with self._lock:
            conn = self.get_connection()
            sql = "SELECT * FROM telegram_custom_commands"
            if only_active:
                sql += " WHERE is_active = 1"
            sql += " ORDER BY id DESC;"
            rows = conn.execute(sql).fetchall()
            return [dict(r) for r in rows]

    def get_custom_command_by_trigger(self, trigger: str) -> Optional[Dict[str, Any]]:
        """Finds custom command by trigger name (e.g. '/offers' or 'offers')."""
        clean_trig = trigger.strip().lower()
        if not clean_trig.startswith("/"):
            clean_trig_slash = f"/{clean_trig}"
        else:
            clean_trig_slash = clean_trig
        with self._lock:
            conn = self.get_connection()
            row = conn.execute("""
                SELECT * FROM telegram_custom_commands
                WHERE is_active = 1 AND (LOWER(command_trigger) = ? OR LOWER(command_trigger) = ?)
                LIMIT 1;
            """, (clean_trig, clean_trig_slash)).fetchone()
            return dict(row) if row else None

    def delete_custom_command(self, command_id: int) -> bool:
        """Deletes a custom bot command."""
        with self._lock:
            conn = self.get_connection()
            conn.execute("DELETE FROM telegram_custom_commands WHERE id = ?;", (command_id,))
            conn.commit()
            return True

    def toggle_custom_command(self, command_id: int, is_active: bool) -> bool:
        """Enables or disables a custom bot command."""
        with self._lock:
            conn = self.get_connection()
            conn.execute("UPDATE telegram_custom_commands SET is_active = ? WHERE id = ?;", (1 if is_active else 0, command_id))
            conn.commit()
            return True

    # ==========================================================================
    # Stock Numbers & Invoices Generation
    # ==========================================================================

    def get_next_stock_no(self) -> str:
        with self._lock:
            conn = self.get_connection()
            row = conn.execute("SELECT MAX(id) AS max_id FROM devices;").fetchone()
            next_id = (row["max_id"] or 0) + 1
            return f"STK-{next_id:06d}"

    def get_next_invoice_no(self) -> str:
        with self._lock:
            conn = self.get_connection()
            row = conn.execute("SELECT MAX(id) AS max_id FROM sales;").fetchone()
            next_id = (row["max_id"] or 0) + 1
            today_str = date.today().strftime("%Y%m%d")
            return f"INV-{today_str}-{next_id:04d}"

    # ==========================================================================
    # Device Inventory Management (New & Used)
    # ==========================================================================

    def insert_device(self, device: DeviceRecord, user_role: str = "Owner", user_name: str = "Admin") -> int:
        with self._lock:
            conn = self.get_connection()
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            if not device.stock_no:
                device.stock_no = self.get_next_stock_no()
            if not device.intake_date:
                device.intake_date = now_iso
            device.created_at = now_iso
            device.updated_at = now_iso

            cipher_key = self.get_setting("cipher_key", DEFAULT_CIPHER_KEY)
            if not device.secret_cost_cipher and device.buy_price > 0:
                device.secret_cost_cipher = encode_cost_cipher(device.buy_price, cipher_key)

            cur = conn.cursor()
            cur.execute("""
                INSERT INTO devices (
                    stock_no, condition, brand, model_name, model_code, storage, ram, color,
                    serial_number, imei1, imei2, ecid, os_version, sales_region, battery_health,
                    battery_cycles, warranty_status, tax_status, ownership, buy_price, prep_cost,
                    target_selling_price, min_allowed_price, secret_cost_cipher, status, intake_date,
                    seller_name, seller_phone, seller_id_photo, trader_id, remarks, created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?
                );
            """, (
                device.stock_no, device.condition, device.brand, device.model_name, device.model_code,
                device.storage, device.ram, device.color, device.serial_number, device.imei1,
                device.imei2, device.ecid, device.os_version, device.sales_region, device.battery_health,
                device.battery_cycles, device.warranty_status, device.tax_status, device.ownership,
                device.buy_price, device.prep_cost, device.target_selling_price, device.min_allowed_price,
                device.secret_cost_cipher, device.status, device.intake_date, device.seller_name,
                device.seller_phone, device.seller_id_photo, device.trader_id, device.remarks,
                device.created_at, device.updated_at
            ))
            dev_id = cur.lastrowid

            try:
                # If device belongs to a trader (credit purchase), record in ledger
                if device.trader_id and device.buy_price > 0 and device.ownership == "ملك المحل":
                    self.record_trader_transaction(
                        trader_id=device.trader_id,
                        trans_type="شراء آجل",
                        amount=device.buy_price,
                        device_id=dev_id,
                        notes=f"شراء جهاز {device.brand} {device.model_name} (سريال {device.stock_no})",
                        user_role=user_role,
                        user_name=user_name,
                        conn=conn
                    )
                elif device.trader_id and device.ownership == "بضاعة أمانة":
                    self.record_trader_transaction(
                        trader_id=device.trader_id,
                        trans_type="بضاعة أمانة",
                        amount=0.0,
                        device_id=dev_id,
                        notes=f"استلام أمانة {device.brand} {device.model_name}",
                        user_role=user_role,
                        user_name=user_name,
                        conn=conn
                    )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

            self.log_security_event(
                action_type="stock_intake",
                user_role=user_role,
                user_name=user_name,
                device_imei=device.imei1,
                old_value="",
                new_value=device.stock_no,
                details=f"Intake {device.condition} {device.brand} {device.model_name} Price: {device.target_selling_price}",
                notify_telegram=False
            )

            # Enqueue rich Telegram Intake Alert for connected owners
            try:
                cond_str = "🆕 جديد متبرشم" if device.condition == "New" else "✨ مستعمل كسر زيرو"
                exp_profit = device.target_selling_price - device.buy_price
                is_apple = (device.brand or "").strip().lower() == "apple" or "iphone" in (device.model_name or "").strip().lower()
                batt_line = f"🔋 <b>حالة البطارية:</b> {device.battery_health}%\n" if (is_apple and device.battery_health) else ""
                intake_msg = (
                    "📥 <b>إشعار إضافة جهاز جديد للمخزن</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━\n"
                    f"📱 <b>اسم الجهاز:</b> {device.brand} {device.model_name}\n"
                    f"📦 <b>الموديل والسعة:</b> {device.model_code or '-'} ({device.storage or '-'})\n"
                    f"🎨 <b>اللون:</b> {device.color or '-'}\n"
                    f"💵 <b>السعر اللي اشتريت بيه:</b> {device.buy_price:,.0f} ج.م\n"
                    f"🤫 <b>شفرة التكلفة:</b> <code>{device.secret_cost_cipher}</code>\n"
                    f"💰 <b>سعر البيع المطلوب:</b> {device.target_selling_price:,.0f} ج.م\n"
                    f"🔒 <b>الحد الأدنى للبيع:</b> {device.min_allowed_price:,.0f} ج.م\n"
                    f"📈 <b>هامش الربح المتوقع:</b> {exp_profit:,.0f} ج.م\n"
                    f"{batt_line}"
                    f"🏷️ <b>الحالة والضريبة:</b> {cond_str} | {device.tax_status}\n"
                    f"🔖 <b>رقم السريال:</b> <code>{device.stock_no}</code>\n"
                    f"👤 <b>المصدر / البائع:</b> {device.seller_name or 'تاجر'}\n"
                    f"⏰ <b>الوقت:</b> {now_iso}"
                )
                self.enqueue_telegram_message("intake_alert", intake_msg)
            except Exception as e:
                logger.error("Failed to enqueue intake telegram alert: %s", e)

            return dev_id

    def update_device_prices(
        self,
        device_id: int,
        target_price: float,
        min_price: float,
        buy_price: Optional[float] = None,
        user_role: str = "Owner",
        user_name: str = "Admin"
    ) -> bool:
        """Updates prices for a single device with security audit logging."""
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            old = cur.execute("SELECT * FROM devices WHERE id = ?;", (device_id,)).fetchone()
            if not old:
                return False

            old_info = f"Sell: {old['target_selling_price']}, Min: {old['min_allowed_price']}, Buy: {old['buy_price']}"
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            cipher_key = self.get_setting("cipher_key", DEFAULT_CIPHER_KEY)
            new_buy = buy_price if buy_price is not None else old["buy_price"]
            new_cipher = encode_cost_cipher(new_buy, cipher_key)

            cur.execute("""
                UPDATE devices
                SET target_selling_price = ?,
                    min_allowed_price = ?,
                    buy_price = ?,
                    secret_cost_cipher = ?,
                    updated_at = ?
                WHERE id = ?;
            """, (target_price, min_price, new_buy, new_cipher, now_iso, device_id))
            conn.commit()

            new_info = f"Sell: {target_price}, Min: {min_price}, Buy: {new_buy}"
            self.log_security_event(
                action_type="price_edit",
                user_role=user_role,
                user_name=user_name,
                device_imei=old["imei1"],
                old_value=old_info,
                new_value=new_info,
                details=f"Updated prices for {old['stock_no']} ({old['brand']} {old['model_name']})"
            )
            return True

    def bulk_update_prices_by_model(
        self,
        condition: str,
        brand: str,
        model_name: str,
        target_price: float,
        min_price: float,
        user_role: str = "Owner",
        user_name: str = "Admin"
    ) -> int:
        """Bulk updates selling and min allowed price for all in-stock units matching criteria."""
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute("""
                UPDATE devices
                SET target_selling_price = ?,
                    min_allowed_price = ?,
                    updated_at = ?
                WHERE status = 'in_stock'
                  AND condition = ?
                  AND brand = ?
                  AND model_name = ?;
            """, (target_price, min_price, now_iso, condition, brand, model_name))
            count = cur.rowcount
            conn.commit()

            self.log_security_event(
                action_type="bulk_price_edit",
                user_role=user_role,
                user_name=user_name,
                device_imei="",
                old_value="",
                new_value=f"Target: {target_price}, Min: {min_price}",
                details=f"Bulk repriced {count} units of {condition} {brand} {model_name}"
            )
            return count

    def get_device_by_id(self, device_id: int) -> Optional[Dict[str, Any]]:
        with self._lock:
            conn = self.get_connection()
            row = conn.execute("SELECT * FROM devices WHERE id = ?;", (device_id,)).fetchone()
            return dict(row) if row else None

    def get_device_by_imei_or_stock(self, query: str) -> Optional[Dict[str, Any]]:
        clean_q = query.strip()
        if not clean_q:
            return None
        with self._lock:
            conn = self.get_connection()
            padded = f"STK-{int(clean_q):06d}" if clean_q.isdigit() else clean_q
            row = conn.execute("""
                SELECT * FROM devices
                WHERE stock_no = ? OR stock_no = ? OR imei1 = ? OR imei2 = ? OR serial_number = ?
                LIMIT 1;
            """, (clean_q, padded, clean_q, clean_q, clean_q)).fetchone()
            if row:
                return dict(row)
            # Fallback partial search if query is 3+ chars
            if len(clean_q) >= 3:
                pattern = f"%{clean_q}%"
                row_like = conn.execute("""
                    SELECT * FROM devices
                    WHERE (stock_no LIKE ? OR imei1 LIKE ? OR serial_number LIKE ?) AND status = 'in_stock'
                    LIMIT 1;
                """, (pattern, pattern, pattern)).fetchone()
                if row_like:
                    return dict(row_like)
            return None

    def search_devices(
        self,
        query: str = "",
        status: str = "in_stock",
        condition: str = "ALL",
        brand: str = "ALL",
        limit: int = 200
    ) -> List[Dict[str, Any]]:
        """Multi-field search with Arabic synonym expansion and brand/condition sorting."""
        with self._lock:
            conn = self.get_connection()
            sql = "SELECT * FROM devices WHERE 1=1"
            params: List[Any] = []

            if status and status != "ALL":
                sql += " AND status = ?"
                params.append(status)

            if condition and condition != "ALL":
                sql += " AND condition = ?"
                params.append(condition)

            if brand and brand != "ALL":
                sql += " AND brand = ?"
                params.append(brand)

            if query:
                clean_q = query.strip()
                arabic_synonyms = {
                    "ايفون": ["Apple", "iPhone"],
                    "آيفون": ["Apple", "iPhone"],
                    "سامسونج": ["Samsung"],
                    "اوبو": ["OPPO"],
                    "أوبو": ["OPPO"],
                    "شاومي": ["Xiaomi"],
                    "ريدمي": ["Redmi"],
                    "ريلمي": ["Realme"],
                    "هونر": ["Honor"],
                    "هواوي": ["Huawei"],
                    "انفينكس": ["Infinix"],
                    "فيفو": ["Vivo"],
                    "نوكيا": ["Nokia"],
                }
                expanded_tokens = [clean_q]
                lower_q = clean_q.lower()
                for ar_word, syns in arabic_synonyms.items():
                    if ar_word in lower_q:
                        expanded_tokens.extend(syns)
                if clean_q.isdigit():
                    expanded_tokens.append(f"STK-{int(clean_q):06d}")

                or_clauses = []
                for token in expanded_tokens:
                    pat = f"%{token}%"
                    or_clauses.append("""(
                        stock_no LIKE ? OR imei1 LIKE ? OR imei2 LIKE ? OR serial_number LIKE ?
                        OR model_name LIKE ? OR model_code LIKE ? OR storage LIKE ? OR brand LIKE ? OR color LIKE ? OR seller_name LIKE ?
                    )""")
                    params.extend([pat] * 10)

                if or_clauses:
                    sql += " AND (" + " OR ".join(or_clauses) + ")"

            # Order by Condition (New first, then Used), then by Brand, Model, and ID
            sql += " ORDER BY CASE WHEN condition = 'New' THEN 0 ELSE 1 END, brand ASC, model_name ASC, id DESC LIMIT ?"
            params.append(limit)

            rows = conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]

    # ==========================================================================
    # POS Sales & 1-Click Unified Trade-In
    # ==========================================================================

    def process_sale(
        self,
        sale: SaleRecord,
        user_role: str = "Salesperson",
        user_name: str = "SalesStaff"
    ) -> int:
        """
        Executes POS Sale atomically:
        - Validates non-negative monetary amounts and split payment consistency.
        - Verifies device is in stock.
        - Validates price against min_allowed_price.
        - Updates device status to 'sold'.
        - If trade-in device included, updates trade-in device to 'trade_in' or 'in_stock'.
        - If trader credit amount > 0, records debit in trader ledger within the same transaction.
        - Commits once or cleanly rolls back on any error.
        - Logs immutable security audit entry.
        """
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()

            # Monetary invariants validation (TASK-002)
            if (sale.final_price or 0) < 0 or (sale.selling_price or 0) < 0 or (sale.discount or 0) < 0:
                raise ValueError("Monetary prices and discounts cannot be negative.")
            if (
                (sale.cash_amount or 0) < 0 or (sale.instapay_amount or 0) < 0
                or (sale.vodafone_cash_amount or 0) < 0 or (sale.other_wallet_amount or 0) < 0
                or (sale.trader_credit_amount or 0) < 0 or (sale.trade_in_allowance or 0) < 0
            ):
                raise ValueError("Payment components cannot be negative.")

            components_sum = (
                (sale.cash_amount or 0.0) +
                (sale.instapay_amount or 0.0) +
                (sale.vodafone_cash_amount or 0.0) +
                (sale.other_wallet_amount or 0.0) +
                (sale.trader_credit_amount or 0.0) +
                (sale.trade_in_allowance or 0.0)
            )
            if abs(components_sum - float(sale.final_price)) > 0.01:
                raise ValueError(
                    f"Payment components sum ({components_sum:,.2f}) does not match final price ({sale.final_price:,.2f})."
                )

            device = cur.execute("SELECT * FROM devices WHERE id = ?;", (sale.device_id,)).fetchone()
            if not device:
                raise ValueError("Target device not found in inventory.")
            if device["status"] != "in_stock":
                raise ValueError(f"Device {device['stock_no']} is already marked as {device['status']}.")

            # Validate min price requirement
            if sale.final_price < device["min_allowed_price"]:
                if user_role != "Owner":
                    raise PermissionError(
                        f"Price {sale.final_price} is below minimum allowed price {device['min_allowed_price']}. Owner PIN or approval required."
                    )

            if not sale.invoice_no:
                sale.invoice_no = self.get_next_invoice_no()
            if not sale.sale_date:
                sale.sale_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            try:
                # Insert Sale record
                cur.execute("""
                    INSERT INTO sales (
                        invoice_no, sale_date, device_id, salesperson, customer_name, customer_phone,
                        selling_price, discount, final_price, payment_method, cash_amount, instapay_amount,
                        vodafone_cash_amount, other_wallet_amount, trader_credit_amount, instapay_ref,
                        proof_photo, trade_in_device_id, trade_in_allowance, net_collected, status, notes
                    ) VALUES (
                        ?, ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?, ?, ?
                    );
                """, (
                    sale.invoice_no, sale.sale_date, sale.device_id, sale.salesperson, sale.customer_name,
                    sale.customer_phone, sale.selling_price, sale.discount, sale.final_price, sale.payment_method,
                    sale.cash_amount, sale.instapay_amount, sale.vodafone_cash_amount, sale.other_wallet_amount,
                    sale.trader_credit_amount, sale.instapay_ref, sale.proof_photo, sale.trade_in_device_id,
                    sale.trade_in_allowance, sale.net_collected, sale.status, sale.notes
                ))
                sale_id = cur.lastrowid

                # Mark sold device
                now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cur.execute("UPDATE devices SET status = 'sold', updated_at = ? WHERE id = ?;", (now_iso, sale.device_id))

                # If trade-in device intake was performed, mark as in_stock / trade_in
                if sale.trade_in_device_id:
                    cur.execute(
                        "UPDATE devices SET status = 'in_stock', remarks = remarks || ' [Trade-in from invoice ' || ? || ']', updated_at = ? WHERE id = ?;",
                        (sale.invoice_no, now_iso, sale.trade_in_device_id)
                    )

                # If Trader Credit part of payment, record ledger atomically on same connection
                if sale.trader_credit_amount > 0 and device["trader_id"]:
                    self.record_trader_transaction(
                        trader_id=device["trader_id"],
                        trans_type="بيع آجل",
                        amount=sale.trader_credit_amount,
                        device_id=sale.device_id,
                        reference_no=sale.invoice_no,
                        notes=f"بيع آجل فاتورة {sale.invoice_no}",
                        user_role=user_role,
                        user_name=user_name,
                        conn=conn
                    )

                conn.commit()
            except Exception:
                conn.rollback()
                raise

            profit = sale.final_price - (device["buy_price"] + device["prep_cost"])
            self.log_security_event(
                action_type="pos_sale",
                user_role=user_role,
                user_name=user_name,
                device_imei=device["imei1"],
                old_value=device["stock_no"],
                new_value=sale.invoice_no,
                details=f"Sold {device['brand']} {device['model_name']} for {sale.final_price} (Net Collected: {sale.net_collected}, Est. Profit: {profit})",
                notify_telegram=False
            )

            # Enqueue rich Telegram Sale Alert for connected owners
            try:
                sale_msg = (
                    "💸 <b>إشعار عملية بيع جديدة من الكاشير</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━\n"
                    f"📱 <b>اسم الجهاز:</b> {device['brand']} {device['model_name']}\n"
                    f"📦 <b>الموديل والسعة:</b> {device['model_code'] or '-'} ({device['storage'] or '-'})\n"
                    f"🎨 <b>اللون:</b> {device['color'] or '-'}\n"
                    f"💵 <b>السعر اللي اشتريت بيه (التكلفة):</b> {device['buy_price']:,.0f} ج.م\n"
                    f"🏷️ <b>سعر البيع الفعلي:</b> {sale.final_price:,.0f} ج.م\n"
                    f"📈 <b>صافي الربح المحقق:</b> {profit:,.0f} ج.م\n"
                    f"💳 <b>طريقة الدفع:</b> {sale.payment_method}\n"
                    f"🧾 <b>رقم الفاتورة:</b> <code>{sale.invoice_no}</code>\n"
                    f"👤 <b>الكاشير:</b> {sale.salesperson or 'الكاشير'}\n"
                    f"🔖 <b>السريال:</b> <code>{device['stock_no']}</code>\n"
                    f"⏰ <b>الوقت:</b> {now_iso}"
                )
                self.enqueue_telegram_message("sale_alert", sale_msg)
            except Exception as e:
                logger.error("Failed to enqueue sale telegram alert: %s", e)

            return sale_id

    def void_sale(self, sale_id: int, user_role: str = "Owner", user_name: str = "Admin", reason: str = "") -> bool:
        """Voids a sale and returns the device back to in_stock. Strictly enforces Owner role."""
        if user_role != "Owner":
            logger.warning("Unauthorized void attempt by non-Owner: role=%s, user=%s", user_role, user_name)
            self.log_security_event(
                action_type="unauthorized_void_attempt",
                user_role=user_role,
                user_name=user_name,
                device_imei="",
                old_value=str(sale_id),
                new_value="REJECTED",
                details=f"Unauthorized void attempt on sale ID {sale_id} by {user_name} ({user_role})"
            )
            return False

        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            sale = cur.execute("SELECT * FROM sales WHERE id = ?;", (sale_id,)).fetchone()
            if not sale:
                return False
            if sale["status"] == "voided":
                return False

            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            try:
                cur.execute("UPDATE sales SET status = 'voided', notes = notes || ' [VOIDED: ' || ? || ']' WHERE id = ?;", (reason, sale_id))
                cur.execute("UPDATE devices SET status = 'in_stock', updated_at = ? WHERE id = ?;", (now_iso, sale["device_id"]))

                # If trade-in device was part of this sale, return it to 'returned'
                if sale["trade_in_device_id"]:
                    cur.execute("UPDATE devices SET status = 'returned', updated_at = ? WHERE id = ?;", (now_iso, sale["trade_in_device_id"]))

                conn.commit()
            except Exception:
                conn.rollback()
                raise

            self.log_security_event(
                action_type="sale_void",
                user_role=user_role,
                user_name=user_name,
                device_imei="",
                old_value=sale["invoice_no"],
                new_value="VOIDED",
                details=f"Sale {sale['invoice_no']} voided. Reason: {reason}"
            )
            return True

    def get_recent_sales(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT s.*, d.stock_no, d.brand, d.model_name, d.imei1, d.buy_price, d.prep_cost
                FROM sales s
                JOIN devices d ON s.device_id = d.id
                ORDER BY s.id DESC LIMIT ?;
            """, (limit,))
            return [dict(r) for r in cur.fetchall()]

    # ==========================================================================
    # Traders & Double-Entry Credit Ledger (له / عليه)
    # ==========================================================================

    def create_trader(self, trader: TraderRecord) -> int:
        with self._lock:
            conn = self.get_connection()
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO traders (name, phone, company, net_balance, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?);
            """, (trader.name, trader.phone, trader.company, trader.net_balance, trader.notes, now_iso))
            tid = cur.lastrowid
            conn.commit()
            return tid

    def get_traders(self) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self.get_connection()
            rows = conn.execute("SELECT * FROM traders ORDER BY name ASC;").fetchall()
            return [dict(r) for r in rows]

    def get_trader_by_id(self, trader_id: int) -> Optional[Dict[str, Any]]:
        with self._lock:
            conn = self.get_connection()
            row = conn.execute("SELECT * FROM traders WHERE id = ?;", (trader_id,)).fetchone()
            return dict(row) if row else None

    def record_trader_transaction(
        self,
        trader_id: int,
        trans_type: str,
        amount: float,
        device_id: Optional[int] = None,
        reference_no: str = "",
        payment_method: str = "Cash",
        notes: str = "",
        user_role: str = "Owner",
        user_name: str = "Admin",
        conn: Optional[sqlite3.Connection] = None
    ) -> int:
        """
        Records transaction in trader_ledger and updates trader net_balance:
        - شراء آجل (Credit purchase from trader): We owe him more -> net_balance += amount (له)
        - بيع آجل (Credit sale to trader): He owes us more -> net_balance -= amount (عليه)
        - دفعة مدفوعة (Payment to trader): We paid him -> net_balance -= amount
        - دفعة مقبوضة (Collection from trader): He paid us -> net_balance += amount
        - تسوية (Adjustment): Handled per notes / sign
        """
        should_commit = False
        with self._lock:
            if conn is None:
                conn = self.get_connection()
                should_commit = True
            cur = conn.cursor()
            trader = cur.execute("SELECT * FROM traders WHERE id = ?;", (trader_id,)).fetchone()
            if not trader:
                raise ValueError(f"Trader ID {trader_id} not found.")

            current_bal = float(trader["net_balance"] or 0.0)
            diff = 0.0

            if trans_type in ("شراء آجل", "دفعة مقبوضة"):
                diff = amount
            elif trans_type in ("بيع آجل", "دفعة مدفوعة"):
                diff = -amount
            elif trans_type == "تسوية":
                diff = amount
            else:
                diff = 0.0

            new_bal = current_bal + diff
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            cur.execute("""
                INSERT INTO trader_ledger (
                    trader_id, trans_date, trans_type, amount, device_id, reference_no,
                    payment_method, notes, balance_after
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (trader_id, now_iso, trans_type, amount, device_id, reference_no, payment_method, notes, new_bal))
            ledger_id = cur.lastrowid

            cur.execute("UPDATE traders SET net_balance = ? WHERE id = ?;", (new_bal, trader_id))
            if should_commit:
                conn.commit()

            self.log_security_event(
                action_type="trader_transaction",
                user_role=user_role,
                user_name=user_name,
                device_imei="",
                old_value=f"Bal: {current_bal}",
                new_value=f"Bal: {new_bal}",
                details=f"Trader: {trader['name']} | Type: {trans_type} | Amount: {amount} | Ref: {reference_no}"
            )
            return ledger_id

    def get_trader_statement(self, trader_id: int) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT tl.*, d.stock_no, d.model_name, d.imei1
                FROM trader_ledger tl
                LEFT JOIN devices d ON tl.device_id = d.id
                WHERE tl.trader_id = ?
                ORDER BY tl.id ASC;
            """, (trader_id,))
            return [dict(r) for r in cur.fetchall()]

    # ==========================================================================
    # Memo & Consignment Tracker (بضاعة عرض وأمانة)
    # ==========================================================================

    def issue_memo(self, trader_id: int, device_id: int, return_days: int = 1, notes: str = "", user_role: str = "Owner", user_name: str = "Admin") -> int:
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            device = cur.execute("SELECT * FROM devices WHERE id = ?;", (device_id,)).fetchone()
            if not device or device["status"] != "in_stock":
                raise ValueError("Device is not available in stock to put on memo.")

            now = datetime.now()
            out_iso = now.strftime("%Y-%m-%d %H:%M:%S")
            exp_iso = (now + timedelta(days=return_days)).strftime("%Y-%m-%d %H:%M:%S")

            cur.execute("""
                INSERT INTO memos (trader_id, device_id, out_date, expected_return_date, status, notes)
                VALUES (?, ?, ?, ?, 'active', ?);
            """, (trader_id, device_id, out_iso, exp_iso, notes))
            memo_id = cur.lastrowid

            cur.execute("UPDATE devices SET status = 'on_memo', updated_at = ? WHERE id = ?;", (out_iso, device_id))
            conn.commit()

            self.log_security_event(
                action_type="memo_out",
                user_role=user_role,
                user_name=user_name,
                device_imei=device["imei1"],
                old_value="in_stock",
                new_value="on_memo",
                details=f"Lent to trader ID {trader_id} on memo until {exp_iso}"
            )
            return memo_id

    def return_memo(self, memo_id: int, user_role: str = "Owner", user_name: str = "Admin") -> bool:
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            memo = cur.execute("SELECT * FROM memos WHERE id = ?;", (memo_id,)).fetchone()
            if not memo or memo["status"] != "active":
                return False

            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute("UPDATE memos SET status = 'returned', returned_date = ? WHERE id = ?;", (now_iso, memo_id))
            cur.execute("UPDATE devices SET status = 'in_stock', updated_at = ? WHERE id = ?;", (now_iso, memo["device_id"]))
            conn.commit()

            self.log_security_event(
                action_type="memo_return",
                user_role=user_role,
                user_name=user_name,
                device_imei="",
                old_value="on_memo",
                new_value="in_stock",
                details=f"Returned memo ID {memo_id} for device ID {memo['device_id']}"
            )
            return True

    def get_active_memos(self) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT m.*, t.name as trader_name, t.phone as trader_phone,
                       d.stock_no, d.brand, d.model_name, d.imei1, d.target_selling_price
                FROM memos m
                JOIN traders t ON m.trader_id = t.id
                JOIN devices d ON m.device_id = d.id
                WHERE m.status = 'active'
                ORDER BY m.expected_return_date ASC;
            """)
            return [dict(r) for r in cur.fetchall()]

    # ==========================================================================
    # Aging Stock Radar (>15 Days, >30 Days)
    # ==========================================================================

    def get_aging_stock_radar(self) -> Dict[str, List[Dict[str, Any]]]:
        """Categorizes in-stock used devices stagnating past 15 and 30 days."""
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT *,
                       ROUND(JULIANDAY('now') - JULIANDAY(intake_date)) as days_in_stock
                FROM devices
                WHERE status = 'in_stock'
                ORDER BY days_in_stock DESC;
            """)
            rows = [dict(r) for r in cur.fetchall()]

            amber_15: List[Dict[str, Any]] = []
            crimson_30: List[Dict[str, Any]] = []
            normal: List[Dict[str, Any]] = []

            for r in rows:
                days = r.get("days_in_stock") or 0
                if days >= 30:
                    crimson_30.append(r)
                elif days >= 15:
                    amber_15.append(r)
                else:
                    normal.append(r)

            return {
                "crimson_30": crimson_30,
                "amber_15": amber_15,
                "normal": normal,
                "total_stagnant": len(amber_15) + len(crimson_30)
            }

    # ==========================================================================
    # Hierarchical Brand Analytics
    # ==========================================================================

    def get_brand_analytics(
        self,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        condition: str = "ALL",
        brand: str = "ALL"
    ) -> Dict[str, Any]:
        """Computes hierarchical stock, capital value, sales revenue, and net profit."""
        with self._lock:
            conn = self.get_connection()

            # 1. In-stock capital summary
            inv_sql = "SELECT brand, condition, COUNT(*) as qty, SUM(buy_price) as capital_buy, SUM(target_selling_price) as target_revenue FROM devices WHERE status = 'in_stock'"
            inv_params: List[Any] = []
            if condition != "ALL":
                inv_sql += " AND condition = ?"
                inv_params.append(condition)
            if brand != "ALL":
                inv_sql += " AND brand = ?"
                inv_params.append(brand)
            inv_sql += " GROUP BY brand, condition ORDER BY qty DESC;"
            inv_rows = [dict(r) for r in conn.execute(inv_sql, inv_params).fetchall()]

            # 2. Sales & profit summary
            sales_sql = """
                SELECT d.brand, d.condition, COUNT(s.id) as sales_count,
                       SUM(s.final_price) as total_sales,
                       SUM(d.buy_price + d.prep_cost) as total_cogs,
                       SUM(s.final_price - (d.buy_price + d.prep_cost)) as net_profit
                FROM sales s
                JOIN devices d ON s.device_id = d.id
                WHERE s.status = 'completed'
            """
            sales_params: List[Any] = []
            if date_from:
                sales_sql += " AND s.sale_date >= ?"
                sales_params.append(date_from)
            if date_to:
                sales_sql += " AND s.sale_date <= ?"
                sales_params.append(date_to)
            if condition != "ALL":
                sales_sql += " AND d.condition = ?"
                sales_params.append(condition)
            if brand != "ALL":
                sales_sql += " AND d.brand = ?"
                sales_params.append(brand)
            sales_sql += " GROUP BY d.brand, d.condition ORDER BY net_profit DESC;"
            sales_rows = [dict(r) for r in conn.execute(sales_sql, sales_params).fetchall()]

            # Totals
            total_stock_count = sum(r["qty"] for r in inv_rows)
            total_capital_buy = sum(r["capital_buy"] or 0.0 for r in inv_rows)
            total_target_revenue = sum(r["target_revenue"] or 0.0 for r in inv_rows)

            total_sales_revenue = sum(r["total_sales"] or 0.0 for r in sales_rows)
            total_net_profit = sum(r["net_profit"] or 0.0 for r in sales_rows)

            return {
                "inventory_breakdown": inv_rows,
                "sales_breakdown": sales_rows,
                "total_stock_count": total_stock_count,
                "total_capital_buy": total_capital_buy,
                "total_target_revenue": total_target_revenue,
                "total_sales_revenue": total_sales_revenue,
                "total_net_profit": total_net_profit
            }

    # ==========================================================================
    # 1-Click Wholesale Broadcast Generator
    # ==========================================================================

    def generate_wholesale_broadcast_text(self, condition: str = "ALL") -> str:
        """Formats in-stock catalog into a clean Arabic telegram/whatsapp broadcast text."""
        with self._lock:
            conn = self.get_connection()
            sql = "SELECT brand, model_name, storage, color, condition, target_selling_price FROM devices WHERE status = 'in_stock'"
            params: List[Any] = []
            if condition != "ALL":
                sql += " AND condition = ?"
                params.append(condition)
            sql += " ORDER BY brand ASC, model_name ASC;"

            rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
            if not rows:
                return "لا توجد أجهزة متوفرة في المخزن حالياً."

            store_name = self.get_setting("store_name", "ProLab Trading")
            store_phone = self.get_setting("store_phone", "")
            today_str = date.today().strftime("%Y-%m-%d")

            lines = [
                f"🌟 قائمة الأجهزة المتاحة بالجملة والقطاعي — {store_name}",
                f"📅 التاريخ: {today_str}",
                f"📞 للتواصل والحجز: {store_phone}",
                "━━━━━━━━━━━━━━━━━━━━"
            ]

            current_brand = ""
            for r in rows:
                brand = r["brand"]
                if brand != current_brand:
                    current_brand = brand
                    lines.append(f"\n🔹 {current_brand}:")
                cond_tag = "🆕 متبرشم" if r["condition"] == "New" else "✨ كسر زيرو"
                lines.append(
                    f" • {r['model_name']} | {r['storage']} | {r['color']} | {cond_tag} — {r['target_selling_price']:,.0f} ج.م"
                )

            lines.append("\n━━━━━━━━━━━━━━━━━━━━")
            lines.append("🚚 متاح الشحن والمعاينة بجميع المحافظات.")
            return "\n".join(lines)

    # ==========================================================================
    # 5-Minute Hybrid Inventory Audit Engine
    # ==========================================================================

    def start_inventory_audit(
        self,
        auditor: str,
        filter_condition: str = "ALL",
        filter_brand: str = "ALL"
    ) -> int:
        with self._lock:
            conn = self.get_connection()
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # Count expected in-stock devices
            sql = "SELECT COUNT(*) as cnt FROM devices WHERE status = 'in_stock'"
            params: List[Any] = []
            if filter_condition != "ALL":
                sql += " AND condition = ?"
                params.append(filter_condition)
            if filter_brand != "ALL":
                sql += " AND brand = ?"
                params.append(filter_brand)

            cnt = conn.execute(sql, params).fetchone()["cnt"]

            cur = conn.cursor()
            cur.execute("""
                INSERT INTO inventory_audits (
                    audit_date, auditor, filter_condition, filter_brand,
                    total_expected, total_scanned, missing_count, surplus_count, status
                ) VALUES (?, ?, ?, ?, ?, 0, ?, 0, 'in_progress');
            """, (now_iso, auditor, filter_condition, filter_brand, cnt, cnt))
            audit_id = cur.lastrowid
            conn.commit()
            return audit_id

    def record_audit_scan(
        self,
        audit_id: int,
        imei_or_stock: str,
        scanner_type: str = "desktop_usb"
    ) -> Dict[str, Any]:
        """Records scanned item in audit and checks against expected inventory."""
        with self._lock:
            conn = self.get_connection()
            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            clean_code = imei_or_stock.strip()

            cur = conn.cursor()
            audit = cur.execute("SELECT * FROM inventory_audits WHERE id = ?;", (audit_id,)).fetchone()
            if not audit:
                raise ValueError("Audit session not found.")

            # Check if this item is already scanned in this audit session
            existing = cur.execute(
                "SELECT * FROM audit_items WHERE audit_id = ? AND imei = ?;", (audit_id, clean_code)
            ).fetchone()
            if existing:
                return {"status": "duplicate", "message": f"Code {clean_code} already scanned in this audit."}

            # Find device
            device = cur.execute("""
                SELECT * FROM devices
                WHERE (imei1 = ? OR imei2 = ? OR stock_no = ? OR serial_number = ?)
                LIMIT 1;
            """, (clean_code, clean_code, clean_code, clean_code)).fetchone()

            status = "matched" if (device and device["status"] == "in_stock") else "unexpected"
            dev_id = device["id"] if device else None

            cur.execute("""
                INSERT INTO audit_items (audit_id, imei, device_id, scanned_at, scanner_type, status)
                VALUES (?, ?, ?, ?, ?, ?);
            """, (audit_id, clean_code, dev_id, now_iso, scanner_type, status))

            # Update audit totals
            cur.execute("""
                UPDATE inventory_audits
                SET total_scanned = total_scanned + 1,
                    surplus_count = (SELECT COUNT(*) FROM audit_items WHERE audit_id = ? AND status = 'unexpected'),
                    missing_count = MAX(0, total_expected - (SELECT COUNT(*) FROM audit_items WHERE audit_id = ? AND status = 'matched'))
                WHERE id = ?;
            """, (audit_id, audit_id, audit_id))
            conn.commit()

            return {
                "status": status,
                "clean_code": clean_code,
                "device": dict(device) if device else None
            }

    def finish_inventory_audit(self, audit_id: int) -> Dict[str, Any]:
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("UPDATE inventory_audits SET status = 'completed' WHERE id = ?;", (audit_id,))
            conn.commit()
            row = cur.execute("SELECT * FROM inventory_audits WHERE id = ?;", (audit_id,)).fetchone()
            return dict(row) if row else {}

    def get_audit_results(self, audit_id: int) -> Dict[str, Any]:
        with self._lock:
            conn = self.get_connection()
            audit = conn.execute("SELECT * FROM inventory_audits WHERE id = ?;", (audit_id,)).fetchone()
            if not audit:
                return {}

            items = conn.execute("""
                SELECT ai.*, d.stock_no, d.brand, d.model_name
                FROM audit_items ai
                LEFT JOIN devices d ON ai.device_id = d.id
                WHERE ai.audit_id = ?
                ORDER BY ai.id DESC;
            """, (audit_id,)).fetchall()

            # Find missing devices
            filter_cond = audit["filter_condition"]
            filter_brand = audit["filter_brand"]
            sql = """
                SELECT d.* FROM devices d
                WHERE d.status = 'in_stock'
                  AND d.id NOT IN (SELECT device_id FROM audit_items WHERE audit_id = ? AND device_id IS NOT NULL)
            """
            params: List[Any] = [audit_id]
            if filter_cond != "ALL":
                sql += " AND d.condition = ?"
                params.append(filter_cond)
            if filter_brand != "ALL":
                sql += " AND d.brand = ?"
                params.append(filter_brand)

            missing_devs = conn.execute(sql, params).fetchall()

            return {
                "audit": dict(audit),
                "scanned_items": [dict(i) for i in items],
                "missing_devices": [dict(m) for m in missing_devs]
            }

    # ==========================================================================
    # Legacy Workshop & History Compatibility Layer (Milestones 2 & 3 Support)
    # ==========================================================================

    def get_next_stock_number(self) -> str:
        """Sequential stock number generator for printed labels (STK-000001)."""
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("SELECT id FROM printed_labels ORDER BY id DESC LIMIT 1;")
            row = cur.fetchone()
            next_id = (row["id"] + 1) if row else 1
            return f"STK-{next_id:06d}"

    def get_next_ticket_id(self) -> str:
        """Sequential repair ticket generator (TKT-000001)."""
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("SELECT id FROM repair_tickets ORDER BY id DESC LIMIT 1;")
            row = cur.fetchone()
            next_id = (row["id"] + 1) if row else 1
            return f"TKT-{next_id:06d}"

    def log_printed_label(self, specs: Any, stock_number: str, label_type: str = "device_specs") -> int:
        """Logs a printed thermal label to the printed_labels table."""
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO printed_labels (
                    stock_number, label_type, brand, marketing_name, model_code,
                    storage, ram, color, os_version, serial_number, imei1, imei2,
                    battery_health, battery_cycles, sales_region, condition_grade, remarks
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                stock_number,
                label_type,
                getattr(specs, "brand", ""),
                getattr(specs, "marketing_name", ""),
                getattr(specs, "model_code", ""),
                getattr(specs, "storage", ""),
                getattr(specs, "ram", ""),
                getattr(specs, "color", ""),
                getattr(specs, "os_version", ""),
                getattr(specs, "serial_number", ""),
                getattr(specs, "imei1", ""),
                getattr(specs, "imei2", None),
                getattr(specs, "battery_health", None),
                getattr(specs, "battery_cycles", None),
                getattr(specs, "sales_region", None),
                getattr(specs, "condition_grade", "A+"),
                getattr(specs, "remarks", "")
            ))
            conn.commit()
            return cur.lastrowid

    def log_repair_ticket(self, ticket: Any) -> int:
        """Logs a workshop repair ticket."""
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO repair_tickets (
                    ticket_id, customer_name, customer_phone, device_model, reported_fault,
                    passcode, sim_removed, back_cracked, dead_device, estimated_cost, intake_datetime
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                getattr(ticket, "ticket_id", ""),
                getattr(ticket, "customer_name", ""),
                getattr(ticket, "customer_phone", ""),
                getattr(ticket, "device_model", ""),
                getattr(ticket, "reported_fault", ""),
                getattr(ticket, "passcode", ""),
                1 if getattr(ticket, "sim_removed", True) else 0,
                1 if getattr(ticket, "back_cracked", False) else 0,
                1 if getattr(ticket, "dead_device", False) else 0,
                float(getattr(ticket, "estimated_cost", 0.0) or 0.0),
                getattr(ticket, "intake_datetime", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            ))
            conn.commit()
            return cur.lastrowid

    def search_history(self, query: str = "") -> List[Dict[str, Any]]:
        """Searches historical printed labels and repair tickets across all fields."""
        query_pattern = f"%{str(query).strip()}%"
        results: List[Dict[str, Any]] = []
        with self._lock:
            conn = self.get_connection()
            cur = conn.cursor()

            # Search labels
            cur.execute("""
                SELECT 'specs' as source, id, stock_number as ref_id, marketing_name as model,
                       serial_number, imei1, remarks as details, created_at
                FROM printed_labels
                WHERE serial_number LIKE ? OR imei1 LIKE ? OR marketing_name LIKE ? OR stock_number LIKE ?
                ORDER BY id DESC LIMIT 200;
            """, (query_pattern, query_pattern, query_pattern, query_pattern))
            for row in cur.fetchall():
                results.append(dict(row))

            # Search tickets
            cur.execute("""
                SELECT 'ticket' as source, id, ticket_id as ref_id, device_model as model,
                       customer_phone as serial_number, customer_name as imei1, reported_fault as details, created_at
                FROM repair_tickets
                WHERE customer_phone LIKE ? OR customer_name LIKE ? OR device_model LIKE ? OR ticket_id LIKE ?
                ORDER BY id DESC LIMIT 200;
            """, (query_pattern, query_pattern, query_pattern, query_pattern))
            for row in cur.fetchall():
                results.append(dict(row))

            return results

    def export_history_to_excel(self, file_path: str) -> bool:
        """Exports printed labels and repair tickets to a multi-sheet Excel file."""
        try:
            import openpyxl
            from openpyxl.styles import Font, PatternFill, Alignment

            os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
            wb = openpyxl.Workbook()

            # Sheet 1: Device Specs History
            ws_specs = wb.active
            ws_specs.title = "Device Specs History"

            header_fill = PatternFill(start_color="1E1E1E", end_color="1E1E1E", fill_type="solid")
            header_font = Font(name="Segoe UI", size=11, bold=True, color="D4AF37")

            specs_headers = [
                "Row", "Stock Number", "Label Type", "Brand", "Marketing Name", "Model Code",
                "Storage", "RAM", "Color", "OS Version", "Serial Number",
                "IMEI1", "IMEI2", "Battery Health", "Battery Cycles",
                "Sales Region", "Condition", "Remarks", "Created At"
            ]
            ws_specs.append(specs_headers)
            for col_idx in range(1, len(specs_headers) + 1):
                cell = ws_specs.cell(row=1, column=col_idx)
                cell.fill = header_fill
                cell.font = header_font

            with self._lock:
                conn = self.get_connection()
                cur = conn.cursor()
                cur.execute("SELECT * FROM printed_labels ORDER BY id ASC;")
                rows = cur.fetchall()
                for idx, r in enumerate(rows, start=1):
                    ws_specs.append([
                        idx, r["stock_number"], r["label_type"], r["brand"], r["marketing_name"], r["model_code"],
                        r["storage"], r["ram"], r["color"], r["os_version"], r["serial_number"],
                        r["imei1"], r["imei2"], r["battery_health"], r["battery_cycles"],
                        r["sales_region"], r["condition_grade"], r["remarks"], r["created_at"]
                    ])

            # Sheet 2: Repair Tickets History
            ws_tickets = wb.create_sheet(title="Repair Tickets History")
            ticket_headers = [
                "Row", "Ticket ID", "Customer Name", "Customer Phone", "Device Model",
                "Reported Fault", "Passcode", "SIM Removed", "Back Cracked",
                "Dead Device", "Estimated Cost", "Intake Datetime", "Created At"
            ]
            ws_tickets.append(ticket_headers)
            for col_idx in range(1, len(ticket_headers) + 1):
                cell = ws_tickets.cell(row=1, column=col_idx)
                cell.fill = header_fill
                cell.font = header_font

            with self._lock:
                cur.execute("SELECT * FROM repair_tickets ORDER BY id ASC;")
                rows = cur.fetchall()
                for idx, r in enumerate(rows, start=1):
                    ws_tickets.append([
                        idx, r["ticket_id"], r["customer_name"], r["customer_phone"], r["device_model"],
                        r["reported_fault"], r["passcode"], r["sim_removed"], r["back_cracked"],
                        r["dead_device"], r["estimated_cost"], r["intake_datetime"], r["created_at"]
                    ])

            wb.save(file_path)
            return True
        except Exception as e:
            logger.error("Failed to export history to Excel: %s", e)
            return False

    def export_history_to_csv(self, file_path: str, source: str = "specs") -> bool:
        """Exports specs or tickets history to a RFC 4180 CSV with UTF-8 BOM encoding."""
        try:
            os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
            with self._lock:
                conn = self.get_connection()
                cur = conn.cursor()
                if source == "specs":
                    cur.execute("SELECT * FROM printed_labels ORDER BY id ASC;")
                    rows = cur.fetchall()
                    headers = [
                        "id", "stock_number", "label_type", "brand", "marketing_name", "model_code",
                        "storage", "ram", "color", "os_version", "serial_number", "imei1", "imei2",
                        "battery_health", "battery_cycles", "sales_region", "condition_grade", "remarks", "created_at"
                    ]
                else:
                    cur.execute("SELECT * FROM repair_tickets ORDER BY id ASC;")
                    rows = cur.fetchall()
                    headers = [
                        "id", "ticket_id", "customer_name", "customer_phone", "device_model",
                        "reported_fault", "passcode", "sim_removed", "back_cracked", "dead_device",
                        "estimated_cost", "intake_datetime", "created_at"
                    ]

            with open(file_path, "w", encoding="utf-8-sig", newline="") as f:
                writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
                writer.writerow(headers)
                for r in rows:
                    writer.writerow([r[h] if h in r.keys() else "" for h in headers])

            return True
        except Exception as e:
            logger.error("Failed to export history to CSV: %s", e)
            return False

    def learn_tac_color(self, tac: str, model: str, color: str) -> bool:
        """
        Stores or updates learned TAC-to-color mapping for automatic color recognition.
        tac: First 8 digits of IMEI
        model: Device marketing name or model
        color: Known valid color name
        """
        if not tac or not color or len(tac.strip()) < 8:
            return False
        clean_tac = tac.strip()[:8]
        clean_model = (model or "").strip()
        clean_color = color.strip()
        if not clean_color or clean_color.lower() in ("unknown", "none", "") or clean_color.startswith("#"):
            return False

        with self._lock:
            try:
                conn = self.get_connection()
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO tac_color_map (tac, model, color, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(tac, model) DO UPDATE SET
                        color=excluded.color,
                        updated_at=CURRENT_TIMESTAMP;
                """, (clean_tac, clean_model, clean_color))
                conn.commit()
                return True
            except Exception as e:
                logger.error("Failed to learn TAC color: %s", e)
                return False

    def lookup_tac_color(self, tac: str, model: str = "") -> Optional[str]:
        """
        Looks up a learned color by TAC and optionally model.
        Returns the color name or None if not found.
        """
        if not tac or len(tac.strip()) < 8:
            return None
        clean_tac = tac.strip()[:8]
        clean_model = (model or "").strip()

        with self._lock:
            try:
                conn = self.get_connection()
                cur = conn.cursor()
                if clean_model:
                    cur.execute(
                        "SELECT color FROM tac_color_map WHERE tac = ? AND model = ? ORDER BY updated_at DESC LIMIT 1;",
                        (clean_tac, clean_model)
                    )
                    row = cur.fetchone()
                    if row and row["color"]:
                        return str(row["color"])

                # Fallback to TAC match regardless of model
                cur.execute(
                    "SELECT color FROM tac_color_map WHERE tac = ? ORDER BY updated_at DESC LIMIT 1;",
                    (clean_tac,)
                )
                row = cur.fetchone()
                if row and row["color"]:
                    return str(row["color"])
                return None
            except Exception as e:
                logger.error("Failed to lookup TAC color: %s", e)
                return None
