# ProLab Commercial Ecosystem — Backup & Disaster Recovery Architecture

**Version:** 1.0.0  
**Scope:** Data Protection, Fault Tolerance, Local ERP Isolation, Cryptographic Recovery.

---

## 1. Architectural Backup Separation

ProLab uses a **zero-trust, hybrid data isolation model**:

```
+--------------------------------------------------------+
| 1. Customer Workstation (Client Side)                 |
|    Local SQLite Database: data/app.db                  |
|    Contains: Sales, Invoices, Devices, Ledger, Stock.  |
|    PRIVACY: NEVER TRANSMITTED TO CENTRAL SERVERS.      |
|    Automatic Pre-Update Backups: data/backups/*.db     |
+--------------------------------------------------------+
                           |
                     (HTTPS API)
                           |
+--------------------------------------------------------+
| 2. Central Licensing Server (Cloud/Owner Side)         |
|    Central Database: server_data/licensing.db          |
|    Contains: Customer Accounts, Subscriptions, Keys.   |
|    Master Cryptographic Keys: server_data/keys/        |
|    Automated Daily Snapshots & Offsite S3 Replication. |
+--------------------------------------------------------+
```

---

## 2. Customer Workstation ERP Protection

### 2.1 Automated Pre-Update Snapshot
Whenever an automatic software update is initiated:
1. The host application gracefully shuts down database connections.
2. The independent updater (`updater/updater.py`) takes an immediate physical snapshot of `data/app.db` and writes it to `data/backups/pre_update_backup_YYYYMMDD_HHMMSS.db`.
3. If the binary file update encounters any filesystem lock or crash, the updater automatically rolls back binaries and leaves the database completely untouched.

### 2.2 Manual Customer Backup
Customers can take on-demand backups at any time from the **الأمان والإعدادات (Security)** tab in the desktop application, even when in **Read-Only Mode** after subscription expiration.

---

## 3. Central Licensing Server Backup Strategy

### 3.1 SQLite WAL Replication & Snapshots
The central database runs in SQLite Write-Ahead Logging (WAL) mode with a 60-second busy timeout.

#### Automated Daily Backup Cron Job:
Add the following to `/etc/cron.d/prolab-backup`:
```bash
# Every day at 03:00 AM UTC
0 3 * * * www-data sqlite3 /opt/prolab-server/server_data/licensing.db ".backup '/opt/prolab-backups/licensing_$(date +\%Y\%m\%d_\%H\%M\%S).db'"
```

#### Retention Policy:
- Keep hourly backups for 24 hours.
- Keep daily backups for 30 days.
- Keep monthly backups for 12 months.

---

## 4. Cryptographic Key Disaster Recovery

### 4.1 Master Ed25519 Key Backup
The private signing key (`ed25519_private.pem`) is the cryptographic root of trust for the entire commercial ecosystem.

#### Safe Cold Storage Protocol:
1. Export `ed25519_private.pem` to an air-gapped encrypted USB drive (AES-256 encrypted with a strong 32-character master passphrase).
2. Store two physical copies in separate secure physical safes (e.g., Owner safe and company safe deposit box).
3. Under no circumstances should the private key be sent over unencrypted email, public cloud drives, or messaging platforms.

### 4.2 Emergency Key Rotation Protocol
In the unlikely event of private key compromise:
1. Generate a new Ed25519 keypair on the central server:
   ```bash
   python -c "from server.security import Ed25519LicensingEngine; Ed25519LicensingEngine.get_or_create_keys()"
   ```
2. Update the public key on the server.
3. Publish a mandatory software update (`is_mandatory=True`) containing the new public key.
4. The server automatically re-signs active licenses upon each customer's next heartbeat validation (`/api/v1/licensing/validate`).

---

## 5. Server Disaster Recovery Runbook

### Step 1: Server Provisioning
In case of complete server failure, provision a new Ubuntu 22.04 LTS instance.

### Step 2: Restore Master Keys
Restore `ed25519_private.pem` and `ed25519_public.pem` from secure cold backup into `/opt/prolab-server/server_data/keys/`.
```bash
chmod 600 /opt/prolab-server/server_data/keys/ed25519_private.pem
chmod 644 /opt/prolab-server/server_data/keys/ed25519_public.pem
```

### Step 3: Restore Database Snapshot
Copy the latest database backup file into place:
```bash
cp /opt/prolab-backups/latest.db /opt/prolab-server/server_data/licensing.db
```

### Step 4: Verification
Execute database integrity check:
```bash
sqlite3 /opt/prolab-server/server_data/licensing.db "PRAGMA integrity_check;"
```
Expected output: `ok`.

### Step 5: Start Service & Verify Health
```bash
sudo systemctl restart prolab-licensing
curl http://127.0.0.1:8000/api/v1/health
```
Once verified, switch DNS records to point to the new IP address.
