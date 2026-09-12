# Architecture Decision Records (ADRs)

**Repository:** Modular Mobile Repair Lab, Retail POS, Spare Parts Wholesale, & Fintech ERP  
**Location:** `.specify/memory/decisions.md`  
**Governing Standard:** SpecKit Foundation Phase 2  
**Status:** Ratified (ADR-001 through ADR-040 Ported & Verified)  
**Total Ratified Decisions:** 44 (DEC-001 through DEC-044 | 42 ADRs)

---

## Document Overview
This repository maintains a permanent, monotonic register of all architectural decisions. Each record documents the context, alternatives evaluated, explicit technical rationale, and systemic consequences.
---

## ADR-001: SQLite Durability Engine & PRAGMA Centralization

- **Status:** Ratified (Synthesized from DEC-001)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/db/database.ts#L15-L20`

### Context
The application operates on an on-premise local server without an external database management system or a USB-signaled uninterruptible power supply (UPS). In retail and electronics repair environments in Egypt, physical power grid cuts are sudden and unannounced. Using default SQLite settings or decentralized PRAGMA statements across disparate connection handles risks losing recently committed transactions still held in the WAL before checkpointing.

### Alternatives Considered
1. **Client/Server DBMS Architecture (PostgreSQL / MySQL):**
   - *Rejection Rationale:* Requires dedicated background system services, higher memory consumption, complex multi-user permission setup, and ongoing database administration beyond the skillset of retail technicians. Single-branch local operations do not warrant external DBMS operational overhead.
2. **SQLite with `synchronous = NORMAL` in WAL Mode:**
   - *Rejection Rationale:* While WAL with NORMAL synchronization achieves high write throughput, it does not fsync every transaction commit to disk immediately. In the event of a sudden unannounced power cut, recently committed transactions residing in the WAL before a checkpoint can be lost.
3. **Decentralized PRAGMA Configuration across Call Sites:**
   - *Rejection Rationale:* Calling PRAGMA statements independently in multiple connection wrappers or routes leads to configuration drift, where one un-configured connection handle can bypass foreign key enforcement or busy timeout settings.
4. **Centralized Connection Factory with `synchronous = FULL` and WAL (Selected):**
   - Enforces WAL journaling, foreign keys, 5000ms busy timeout, and `PRAGMA synchronous = FULL` centrally on database initialization in `database.ts#L15-L20`. Ensures every committed transaction is guaranteed durable on physical storage before returning.

### Rationale
Guarantees zero committed transaction loss (RPO = 0) under physical power cuts without requiring external database servers or dedicated UPS monitoring hardware.

### Consequences
- **Positive:** Complete durability against sudden power cuts; zero data loss for committed sales and repair tickets.
- **Negative:** Introduces slight fsync latency overhead (3–8ms per transaction) compared to synchronous = NORMAL.
- **Mitigations:** Fast local NVMe/SSD storage easily absorbs fsync overhead, keeping transaction response well under the 50ms requirement.

---

## ADR-002: Automated Shift-Close Database Snapshot Architecture

- **Status:** Ratified (Synthesized from DEC-002)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/core/core.router.ts#L251`, `server/src/services/backup.service.ts`

### Context
Cashier shift handover (/api/core/shifts/close) represents the operational demarcation of physical cash reconciliation and business transactions. If database backups rely solely on calendar midnight schedules, afternoon shifts and evening turnovers remain unprotected until the following day.

### Alternatives Considered
1. **Midnight-Only Daily Cron Backup:**
   - *Rejection Rationale:* Leaves up to 14 hours of afternoon retail sales and repair deliveries at risk if a hardware failure or operating system crash occurs before midnight.
2. **Continuous Transaction Streaming / Log Replication:**
   - *Rejection Rationale:* Complex to manage on Windows standalone installations; risks locking the active database file and requires dedicated background replication daemons.
3. **Immediate Event-Driven Snapshot on Shift Close (Selected):**
   - Closing any cashier shift synchronously triggers a full SQLite backup snapshot via `BackupService.createSnapshot()`, paired with a daily midnight safety net. Captures the exact reconciled cash and ticket state.

### Rationale
Aligns database backup frequency directly with the physical cadence of cash reconciliation and cashier accountability.

### Consequences
- **Positive:** Maximum data protection aligned with human shift changes; zero unbacked shifts.
- **Negative:** Shift close request takes 200–500ms longer to complete the snapshot write.
- **Mitigations:** SQLite online backup API runs non-destructively without blocking read queries.

---

## ADR-003: External Removable Storage Mirroring & Persistent Alerting

- **Status:** Ratified (Synthesized from DEC-003)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/services/backup.service.ts#L81-L98`, `client/src/views/DashboardView.tsx`

### Context
Storing database backups exclusively on the local system drive (C:\) provides zero protection if the primary drive suffers physical disk crash, ransomware encryption, or motherboard failure. Backups must be mirrored to external media without stalling store checkout.

### Alternatives Considered
1. **Public Cloud Storage Sync (e.g. AWS S3 / Google Drive):**
   - *Rejection Rationale:* Violates strict offline LAN isolation (Section 1, Principle III.1); fails during frequent local internet outages and incurs recurring cloud bandwidth costs.
2. **Network-Attached Storage (NAS) via SMB Share:**
   - *Rejection Rationale:* Requires secondary server hardware, router port configuration, and credentials management; vulnerable to LAN ransomware propagation across open network shares.
3. **External Removable USB Drive Mirroring with Persistent Alerting (Selected):**
   - Automatically mirrors snapshots to a designated external removable drive (default `E:\\ERP_Backups`, configurable via environment variable). If the drive is missing or full, writes a warning to `audit_log` and displays a persistent visual banner on Manager dashboards without halting sales.

### Rationale
Provides air-gapped physical disaster recovery while respecting local LAN autonomy and operational continuity.

### Consequences
- **Positive:** Survives complete primary server host destruction; zero internet dependency.
- **Negative:** Relies on staff physically leaving the external USB drive connected to the server.
- **Mitigations:** High-visibility dashboard warning alerts management immediately if the drive is disconnected.

---

## ADR-004: 30-Day Automated Backup Retention & Rotation Policy

- **Status:** Ratified (Synthesized from DEC-004)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/index.ts#L283-L295`, `server/src/services/backup.service.ts`

### Context
Generating multiple backup snapshots daily (after every shift close plus midnight safety runs) rapidly consumes local disk capacity on standard shop PC drives (e.g. 120GB–250GB SSDs). Without automated rotation, disk saturation causes write failures and database locks.

### Alternatives Considered
1. **Infinite Backup Retention (Never delete old files):**
   - *Rejection Rationale:* Rapidly exhausts storage on local shop drives within months, triggering catastrophic disk-full errors that crash SQLite and halt retail sales.
2. **External Windows Task Scheduler Batch Script (`forfiles`):**
   - *Rejection Rationale:* Decouples pruning logic from application observability; errors in batch scripts run silently and cannot be reported in the ERP dashboard or audit log.
3. **Rolling 30-Day Pruning within Backup Service (Selected):**
   - `BackupService.cleanupOldBackups()` inspects backup timestamps during daily maintenance, retaining snapshots within a strict 30-day window and deleting older files, while preserving the first-of-month archive.

### Rationale
Prevents disk exhaustion while maintaining full compliance with statutory monthly audit and reconciliation windows.

### Consequences
- **Positive:** Capped disk footprint; automated self-maintaining storage; zero manual file pruning required.
- **Negative:** Backups older than 30 days are purged from daily rotation.
- **Mitigations:** Monthly snapshot archives can be exported manually by Admins to external long-term cold storage.

---

## ADR-005: Disaster Recovery Objectives (RPO = 0, RTO <= 15 Minutes)

- **Status:** Ratified (Synthesized from DEC-005)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `System Architecture / Operational Runbooks`

### Context
Equipment failure, OS corruption, or hardware destruction in a busy phone repair shop halts retail sales and customer device handovers. Formal Recovery Point Objective (RPO) and Recovery Time Objective (RTO) targets must be codified to guide technical decisions and operational recovery runbooks.

### Alternatives Considered
1. **Enterprise Active-Passive High-Availability Cluster:**
   - *Rejection Rationale:* Requires dual server hardware, virtual IP failover, and quorum clustering (e.g. Pacemaker/Corosync) completely disproportionate and unaffordable for a single retail shop.
2. **Relaxed Recovery Targets (RPO = 24 Hours, RTO = 4 Hours):**
   - *Rejection Rationale:* Unacceptable in retail. Losing 24 hours of repair ticket intakes and cash transactions creates unresolvable customer ownership disputes and massive financial ledger imbalances.
3. **Cold-Standby Architecture with RPO = 0 and RTO <= 15 Minutes (Selected):**
   - RPO = 0 is guaranteed for committed data via WAL `synchronous = FULL`. RTO $\le$ 15 minutes is achieved by maintaining a pre-configured installer and hot-swappable USB backup that can be attached to any shop workstation.

### Rationale
Provides robust enterprise-grade business continuity on standard off-the-shelf retail hardware.

### Consequences
- **Positive:** Minimized business downtime; zero lost financial transactions during hardware failure.
- **Negative:** Requires maintaining an operational disaster recovery runbook and testing it periodically.
- **Mitigations:** Weekly automated backup integrity checks guarantee snapshot files are restorable.

---

## ADR-006: Forward-Only Non-Destructive Migrations via schema_migrations

- **Status:** Ratified (Synthesized from DEC-006)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/db/migrations.ts#L1810-L1825`

### Context
Production ERP databases accumulate irreversible business records (financial ledgers, repair history, audit logs). Destructive schema modifications, dropped columns, or unversioned ad-hoc DDL scripts risk irrecoverable data loss and schema divergence across client installations.

### Alternatives Considered
1. **Destructive Auto-Synchronization (e.g. TypeORM / Prisma push):**
   - *Rejection Rationale:* Auto-sync engines inspect entity models and generate silent table drops or column recreations, destroying historical production data and wiping custom triggers.
2. **Bidirectional Up/Down Migrations with Column Deletion:**
   - *Rejection Rationale:* Down migrations are rarely tested and frequently fail in production. Furthermore, SQLite historically lacked native DROP COLUMN support, making rollbacks high-risk operations in offline environments.
3. **Forward-Only, Additive Migration Pipeline via `schema_migrations` (Selected):**
   - Every schema change is encapsulated in an idempotent numbered migration (`m.up(db)`) recorded in `schema_migrations` (`migrations.ts#L1810-L1825`). Alterations are strictly additive (ADD COLUMN, new tables, new indexes); deprecated fields are soft-retired.

### Rationale
Preserves complete historical data integrity and guarantees predictable, idempotent schema evolution across all client workstations.

### Consequences
- **Positive:** Zero risk of accidental column or table drops; idempotent startup migration execution.
- **Negative:** Deprecated columns persist in table schemas until major version restructuring.
- **Mitigations:** Code models ignore deprecated fields, and backward-compatible views bridge legacy queries.

---

## ADR-007: LAN Concurrency Sizing: 10 Concurrent Stations, 5000ms Busy Timeout

- **Status:** Ratified (Synthesized from DEC-007)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/db/database.ts#L18`

### Context
A single shop environment features up to 10 concurrent stations: 2 POS checkout counters, 4 repair lab benches, 1 inventory receiving terminal, 1 manager office, and 2 customer query screens. At peak load (1–2 transactions/minute), multiple stations initiate concurrent read and write transactions.

### Alternatives Considered
1. **Default SQLite Configuration (Zero Timeout):**
   - *Rejection Rationale:* Throws immediate `SQLITE_BUSY` exceptions if a cashier attempts checkout while a technician is updating a ticket checklist, crashing frontend user actions.
2. **Dedicated External DBMS (PostgreSQL / MariaDB):**
   - *Rejection Rationale:* Over-engineered for a 10-station LAN environment; adds severe installation friction and maintenance dependencies for standalone shop owners.
3. **WAL Mode with 5000ms Busy Timeout (Selected):**
   - Centralizes `PRAGMA busy_timeout = 5000` on the single SQLite connection pool (`database.ts#L18`). Because WAL allows simultaneous readers alongside a single writer, queueing write locks for up to 5 seconds completely eliminates lock contention.

### Rationale
Supports full shop LAN concurrency with zero operational database administration.

### Consequences
- **Positive:** Concurrent read/write performance across 10 stations without lock failure errors.
- **Negative:** Writes are serialized; transactions taking > 5 seconds will timeout.
- **Mitigations:** Transactions are kept microsecond-fast by avoiding network I/O or heavy computations inside write blocks.

---

## ADR-008: Egyptian Tax Authority (ETA) Scope: Local Cryptographic QR & UUID Generation

- **Status:** Ratified (Synthesized from DEC-008)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/integrations/integrations.router.ts#L140`

### Context
The Egyptian Tax Authority (ETA) mandates e-invoicing and e-receipt standards featuring universal unique identifiers (UUIDs), cryptographic hash generation, and TLV-encoded QR codes. However, mandatory live cloud API synchronization disrupts retail checkout during frequent internet outages.

### Alternatives Considered
1. **Live Synchronous Cloud Dispatch to ETA API on Checkout:**
   - *Rejection Rationale:* When local internet fails or ETA servers experience latency, retail cashiers cannot print receipts, stalling walk-in customer queues.
2. **Omit Tax Compliance Features in v1:**
   - *Rejection Rationale:* Leaves the business vulnerable to regulatory penalties and forces cashiers to maintain secondary manual paper receipt books.
3. **Local Cryptographic Generation with Offline Buffering (Selected):**
   - System generates compliant RFC 4122 UUIDs, SHA-256 invoice hashes, and TLV Base64 QR codes locally and synchronously upon sale completion (`integrations.router.ts#L140`). Payloads are stored locally for future batch transmission.

### Rationale
Guarantees full fiscal regulatory compliance without sacrificing offline checkout speed and resilience.

### Consequences
- **Positive:** 100% offline checkout availability; valid cryptographic QR codes on all printed receipts.
- **Negative:** Invoices are not submitted to government servers in real-time.
- **Mitigations:** Batch transmission pipeline can synchronize recorded invoices when internet connectivity is available.

---

## ADR-009: Egyptian VAT Standard 14% Integer Computation Model

- **Status:** Ratified (Synthesized from DEC-009)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/retail/currency.ts#L54`

### Context
Egyptian Value Added Tax (VAT) is legally set at standard 14%. In retail and repair operations, invoices mix taxable physical goods (accessories, phones) with exempt services or different tax lines. Rounding errors on gross totals create discrepancies between itemized lines and accounting ledgers.

### Alternatives Considered
1. **Global Invoice Subtotal Percentage Calculation:**
   - *Rejection Rationale:* Computing VAT as `round(subtotal * 0.14)` fails when receipts mix taxable retail goods with tax-exempt repair labor or zero-rated items, producing incorrect tax distributions.
2. **Floating-Point Arithmetic (`price * 0.14`):**
   - *Rejection Rationale:* Introduces IEEE 754 precision drift (e.g. 14.000000000000002 piastres), causing journal ledger debit/credit verification to fail.
3. **Itemized Integer Round-Half-Up Model (Selected):**
   - Computes VAT per item line as `Math.round(piastres * 14 / 100)` (`currency.ts#L54`). Invoice tax is the exact sum of line item taxes, cleanly separating taxable from exempt items.

### Rationale
Provides mathematical and legal precision compliant with Egyptian tax audit regulations and double-entry accounting.

### Consequences
- **Positive:** Exact line-level and invoice-level tax tracking; zero rounding discrepancy in tax reports.
- **Negative:** Tax must be explicitly calculated per line item during cart updates.
- **Mitigations:** `CurrencyUtils.calculateTaxPiastres()` encapsulates the calculation across frontend and backend.

---

## ADR-010: Bilingual UI Architecture: Arabic RTL Default, English LTR Toggle

- **Status:** Ratified (Synthesized from DEC-010)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `client/src/i18n/LanguageContext.tsx#L16-L26`

### Context
The primary user base in Egyptian retail shops and repair labs comprises native Arabic speakers. However, hardware component terminology, foreign technician intake, and diagnostic codes frequently utilize English. The system requires seamless bilingual operation.

### Alternatives Considered
1. **Arabic-Only Hardcoded Interface:**
   - *Rejection Rationale:* Impedes international component search, foreign diagnostic equipment integration, and makes system maintenance cumbersome for English-speaking developers.
2. **English-Only Interface:**
   - *Rejection Rationale:* Completely unacceptable for floor cashiers and junior technicians, leading to high data entry error rates and prolonged training friction.
3. **Bilingual React Context with Arabic RTL Default & English Toggle (Selected):**
   - Provides structured i18n dictionary mapping with Arabic as the primary RTL interface (`dir="rtl"`) and an instant English LTR toggle (`LanguageContext.tsx#L16-L26`), persisted in `localStorage`.

### Rationale
Maximizes operational efficiency and accessibility for local shop staff while preserving technical flexibility.

### Consequences
- **Positive:** Intuitive native language experience; instant UI direction switching without page reload.
- **Negative:** UI designs must support both RTL and LTR layouts without visual clipping.
- **Mitigations:** Modern CSS logical properties and Tailwind RTL utilities ensure layout symmetry.

---

## ADR-011: Universal Integer-Piastre Financial Precision Standard

- **Status:** Ratified (Synthesized from DEC-011)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/retail/currency.ts#L1-L24`

### Context
Standard software architectures using IEEE 754 floating-point types (JavaScript `number` or SQLite `REAL`) inevitably accumulate fractional precision errors (e.g., 0.1 + 0.2 = 0.30000000000000004). In retail POS checkout, split payment balancing, multi-wallet transfers, and tax calculation, a 1-cent discrepancy invalidates ledger balancing and fails accounting audits.

### Alternatives Considered
1. **Floating-Point with UI Display Rounding (`toFixed(2)`):**
   - *Rejection Rationale:* Merely masks precision discrepancies in the user interface while accumulating persistent balance drift in database aggregates and financial journals.
2. **Arbitrary-Precision Decimal Object Libraries (e.g. `bignumber.js`, `decimal.js`):**
   - *Rejection Rationale:* Introduces serialization overhead, requires specialized database converters, and slows down high-frequency calculation loops.
3. **Universal 64-Bit Integer Piastre Representation (Selected):**
   - Stores and calculates all monetary values strictly as integer piastres (1 EGP = 100 Piastres) across both server and client layers (`currency.ts#L1-L24`). Floating-point monetary calculation is constitutionally prohibited.

### Rationale
Integer arithmetic is exact, high-performance, and natively supported by SQLite (`INTEGER`) and JavaScript (`Number.isSafeInteger` up to 9.007 quadrillion piastres, $\approx$ 90 trillion EGP).

### Consequences
- **Positive:** Absolute mathematical precision across all financial calculations; zero rounding drift in double-entry balance verification.
- **Negative:** Developers must convert between user-facing decimal EGP and internal integer piastres at display boundaries.
- **Mitigations:** `CurrencyUtils` provides standardized `fromPiastres()` and `toPiastres()` conversion helpers.

---

## ADR-012: Business Day Demarcation via Explicit Cashier Shift Handover

- **Status:** Ratified (Synthesized from DEC-012)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/core/core.router.ts#L251-L277`

### Context
Electronics repair shops and retail counters in Egypt routinely operate past midnight (e.g., 10:00 AM to 2:00 AM). Automatically rolling financial days at midnight arbitrarily splits cash drawers, customer ticket deliveries, and shift balancing across two calendar days, causing severe cash reconciliation disputes.

### Alternatives Considered
1. **Automated Calendar Midnight Rollover (00:00:00 Cron):**
   - *Rejection Rationale:* Arbitrarily splits an active cashier's physical drawer session and sales volume across two calendar dates, confusing physical cash reconciliation and Z-reports.
2. **Arbitrary Static Time-Offset Rollover (e.g. 04:00 AM):**
   - *Rejection Rationale:* Static clock boundaries fail during Ramadan, seasonal hours, or extended inventory counting, lacking operational awareness of who actually holds physical cash.
3. **Continuous Unbounded Ledger without Shift Boundaries:**
   - *Rejection Rationale:* Eliminating shift demarcation leaves register shortages undetected for days, destroying cashier accountability.
4. **Explicit Shift Handover as Operational Business Day Demarcation (Selected):**
   - Business days and cash accountability are demarcated strictly by explicit cashier shift open and close events (`core.router.ts#L251-L277`). Closing a shift requires physical cash counting (`actual_cash`), records variance against `expected_cash`, and logs device custody counts.

### Rationale
Ties financial accounting boundaries to human operational reality and physical drawer custody rather than arbitrary clock ticks.

### Consequences
- **Positive:** Crystal-clear cashier accountability; zero artificial variance from midnight transitions; precise shift audit trails.
- **Negative:** Cashiers must perform formal shift close procedures before leaving the register.
- **Mitigations:** Streamlined shift handover UI guides cashiers through denomination counting swiftly [As-Decided: UX target < 60 seconds].

---

## ADR-013: Clean Shutdown Hooks: Electron before-quit and Windows Console SIGINT

- **Status:** Ratified (Synthesized from DEC-013)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `electron/main.cjs#L15`, `server/src/db/database.ts#L12`

### Context
When store staff shut down the primary PC at the end of the day or close the Electron desktop window, the operating system attempts to terminate background Node.js processes. Abrupt process termination can interrupt active SQLite WAL checkpointing and leave journal locks active.

### Alternatives Considered
1. **Rely Exclusively on Operating System Process Termination:**
   - *Rejection Rationale:* Windows task termination frequently issues forceful kills without clean signal handling, potentially interrupting WAL autocheckpoints and leaving pending transactions un-checkpointed.
2. **Immediate Synchronous `process.exit(0)` on UI Close:**
   - *Rejection Rationale:* Kills the Node backend before open database handles can flush dirty memory pages and execute checkpoint routines.
3. **Unified Multi-Hook Graceful Teardown Pipeline (Selected):**
   - Registers handlers across Electron IPC (`app.on('before-quit')`), Windows console signals (`SIGINT`, `SIGBREAK`), and process exit events (`main.cjs#L15`, `database.ts#L12`), invoking `db.close()` to flush WAL frames before process termination.

### Rationale
Guarantees clean SQLite handle closure and WAL checkpointing during routine application shutdowns.

### Consequences
- **Positive:** Zero stale database locks or WAL file bloat upon application relaunch; clean system state.
- **Negative:** Application exit takes 100–300ms longer to finalize database closure.
- **Mitigations:** Electron displays a closing indicator preventing users from force-terminating the window.

---

## ADR-014: Weekly Automated PRAGMA integrity_check Backup Drill

- **Status:** Ratified (Synthesized from DEC-014)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/services/backup.service.ts#L60-L75`

### Context
Backing up a corrupted database produces useless backup archives. Silent bitrot, storage sector faults, or improper system shutdowns can compromise internal B-tree structures without raising runtime exceptions during simple SELECT queries.

### Alternatives Considered
1. **Manual Integrity Checks Performed by Shop Owner:**
   - *Rejection Rationale:* Almost never executed in real-world retail environments until catastrophic failure has already occurred and backups are discovered to be corrupt.
2. **Integrity Check on Every Transaction Commit:**
   - *Rejection Rationale:* Scanning the entire database file on every commit introduces crippling disk I/O latency, completely stalling POS checkout throughput.
3. **Automated Weekly Integrity Verification Drill (Selected):**
   - `BackupService` schedules an automated weekly integrity check executing `PRAGMA integrity_check` on the active database and backup snapshots (`backup.service.ts#L60-L75`), recording results in `audit_log` and alerting management on error.

### Rationale
Proactively detects disk and database page corruption before backup rotation overwrites clean historical archives.

### Consequences
- **Positive:** Continuous confidence in disaster recovery reliability; early warning of hardware storage degradation.
- **Negative:** Check consumes disk read I/O during execution (typically 1–3 seconds for 50MB database).
- **Mitigations:** Scheduled during off-hours or low-activity periods to prevent any impact on store operations.

---

## ADR-015: Visual Dashboard Alerting & Audit Trail Warning on Backup Failure

- **Status:** Ratified (Synthesized from DEC-015)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/services/backup.service.ts#L96`, `client/src/views/DashboardView.tsx`

### Context
If external backup storage is unplugged, full, or write-protected, automated backup snapshots fail. If failures are merely logged to silent console streams or backend text files, staff remain unaware that the business is operating without disaster protection.

### Alternatives Considered
1. **Silent Logging to Server Error Files:**
   - *Rejection Rationale:* Retail store owners and cashiers never inspect backend server log files, leaving backup outages undetected for weeks or months.
2. **Hard Checkout Lockout on Backup Failure:**
   - *Rejection Rationale:* Disabling POS sales registers because an external backup drive is unplugged infuriates customers and halts business revenue.
3. **Persistent Visual Alert Banners with Synchronous Audit Logging (Selected):**
   - Backup failures immediately inject high-severity warning entries into `audit_log` and display persistent, prominent visual alert banners across Manager and Admin dashboards (`DashboardView.tsx`), driving remediation without halting sales.

### Rationale
Ensures immediate operational awareness of backup hardware issues while preserving uninterrupted point-of-sale availability.

### Consequences
- **Positive:** Immediate visibility of backup failures to decision-makers; clear forensic audit record.
- **Negative:** Requires managers to dismiss or resolve alerts once storage media is restored.
- **Mitigations:** Alert banner automatically clears upon the next successful snapshot execution.

---

## ADR-016: Electron Direct IPC Raw ESC/POS Thermal Printing Pipeline

- **Status:** Ratified (Synthesized from DEC-016)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `electron/main.cjs#L59`, `client/src/utils/escPosDirect.ts#L2`

### Context
Receipt and invoice printing in retail checkout must be instantaneous and silent. Standard web browser printing (`window.print()`) opens intrusive OS dialogs, prints unneeded browser headers/footers, and cannot control thermal hardware features (e.g. paper cutter, barcode rasterization).

### Alternatives Considered
1. **Standard Browser Print Dialog (`window.print()`):**
   - *Rejection Rationale:* Requires manual cashier clicks on every transaction, misaligns 80mm receipt margins, and introduces multi-second rendering lag.
2. **Third-Party Cloud Print Broker / Webhook Service:**
   - *Rejection Rationale:* Violates local LAN isolation (Section 1, Principle III.1), depends on internet access, and introduces per-print service subscription costs.
3. **Electron Direct IPC Raw ESC/POS Command Dispatch (Selected):**
   - Sends raw binary ESC/POS escape codes directly to thermal receipt printers via Electron IPC native spooler bindings (`main.cjs#L59`, `escPosDirect.ts#L2`), achieving silent, sub-second printing and automated paper cutting.

### Rationale
Delivers ultra-fast, professional thermal printing optimized for fast-paced retail checkout counters.

### Consequences
- **Positive:** Instantaneous silent receipt printing (< 500ms); precise thermal formatting and barcode rendering.
- **Negative:** Relies on Electron runtime; standalone web browsers cannot access raw printer spoolers directly.
- **Mitigations:** Web client falls back to standard printable receipt preview when running outside Electron.

---

## ADR-017: Global HID Barcode Scanner Keystroke Interceptor (< 35ms Threshold)

- **Status:** Ratified (Synthesized from DEC-017)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `client/src/services/hardware.service.ts#L29`

### Context
Hardware barcode scanners emulate Human Interface Devices (USB HID keyboards). In fast-paced retail checkout, forcing cashiers to manually click into an input search field before scanning causes missed scans and corrupts other form inputs if focus is mislocated.

### Alternatives Considered
1. **Explicit Focus Input Field Enforcement:**
   - *Rejection Rationale:* Cashiers frequently scan items while focus is accidentally on customer notes or quantity fields, resulting in corrupted input data and cashier frustration.
2. **Proprietary Serial/COM Port Scanner Drivers:**
   - *Rejection Rationale:* Over-complicates workstation hardware setup; requires installing custom serial drivers and COM port mapping per terminal.
3. **Global Window Keyboard Interceptor with Velocity Filter (< 35ms) (Selected):**
   - Listens globally on the browser `window` for rapid keystroke bursts (< 35ms between characters) terminated by Enter (`hardware.service.ts#L29`), routing barcode data directly to the POS cart regardless of focused element.

### Rationale
Enables frictionless, zero-click barcode scanning compatible with standard off-the-shelf USB scanners.

### Consequences
- **Positive:** Lightning-fast cashier scanning; eliminates misdirected scanner input errors.
- **Negative:** Very fast human typing could theoretically mimic scanner velocity if threshold is too loose.
- **Mitigations:** 35ms character threshold and mandatory minimum character length filter human keystrokes reliably.

---

## ADR-018: Automated Cash Tender Drawer Kick Pulse Protocol

- **Status:** Ratified (Synthesized from DEC-018)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `client/src/utils/escPosDirect.ts#L23`

### Context
Physical cash drawers connect via RJ11 solenoid ports to thermal receipt printers. Requiring cashiers to manually unlock drawers with physical keys on every cash sale slows checkout lines and increases risk of key duplication or theft.

### Alternatives Considered
1. **Manual Key-Turn Operation Only:**
   - *Rejection Rationale:* Substantially slows down customer checkout queues and risks physical key loss or unauthorized drawer opening without an audit trail.
2. **Dedicated USB Relay Solenoid Hardware:**
   - *Rejection Rationale:* Unnecessary hardware expense; standard cash drawers already incorporate built-in solenoids wired directly to receipt printers.
3. **Automated ESC/POS Kick Pulse Injection on Cash Tender (Selected):**
   - Injects standard ESC/POS electrical kick pulse codes (`\x1b\x70\x00\x19\xfa`) directly into the receipt print byte stream whenever a cash tender transaction completes (`escPosDirect.ts#L23`).

### Rationale
Streamlines cash handling while guaranteeing the drawer opens automatically only when a cash sale is registered.

### Consequences
- **Positive:** Hands-free cash drawer opening; synchronized strictly with finalized cash transactions.
- **Negative:** Drawer kick requires receipt printer to be powered on and connected.
- **Mitigations:** Cashiers retain physical emergency master keys for manual access during power outages.

---

## ADR-019: Meta WhatsApp Cloud API Simulation & Target Strategy

- **Status:** Ratified (Synthesized from DEC-019)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/services/whatsapp.service.ts#L6-L25`

### Context
Customer notifications (ticket readiness, estimate approvals, installment reminders) in Egypt rely heavily on WhatsApp. However, deploying the live Meta WhatsApp Cloud API in v1 requires Meta Business Manager verification, webhooks, and recurring messaging expenses.

### Alternatives Considered
1. **Live Meta Cloud API Integration in v1:**
   - *Rejection Rationale:* Incurs recurring per-message costs, requires external internet connectivity (violating local LAN autonomy per Section 1, Principle III.1), and delays system launch pending Meta account verification.
2. **Unofficial Web Scraping (e.g. Puppeteer / WhatsApp Web):**
   - *Rejection Rationale:* High risk of phone number bans by Meta, high memory consumption on POS PCs, and frequent breakage whenever WhatsApp Web updates its frontend.
3. **In-Memory Simulated Dispatch Engine with Persistent Audit Logging (Selected):**
   - `WhatsAppService` formats production-ready notification payloads, simulates network dispatch, and records messages in `whatsapp_notifications` (`whatsapp.service.ts#L6-L25`), decoupled for seamless API activation in future phases.

### Rationale
Enables end-to-end testing and operational logging of customer communication workflows locally with zero third-party fees.

### Consequences
- **Positive:** Zero recurring messaging cost; full audit trail of outgoing notifications; clean architecture ready for cloud activation.
- **Negative:** Customers in v1 do not receive real-time automated WhatsApp texts from the server.
- **Mitigations:** Staff view notification text in the ERP and can dispatch messages directly via local phone or web.

---

## ADR-020: Strict LAN Perimeter Isolation via subnetAndDeviceGuard

- **Status:** Ratified (Synthesized from DEC-020)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/middleware/subnet-guard.ts#L4-L32`

### Context
Phone repair lab ERPs store sensitive customer PII, device IMEI numbers, financial ledgers, and cash balances. Exposing the local server to the public internet creates severe cybersecurity vulnerabilities, ransomware threats, and external attack surfaces.

### Alternatives Considered
1. **Public Cloud Hosting (SaaS Multi-Tenant):**
   - *Rejection Rationale:* Exposes private customer data to cloud security risks, requires recurring cloud subscriptions, and makes store operations entirely dependent on internet uptime.
2. **Unrestricted Open Local Wi-Fi Network:**
   - *Rejection Rationale:* Any customer or visitor connecting to shop Wi-Fi could access the server IP and query internal API endpoints without restriction.
3. **Strict Subnet & Registered Device Guard Middleware (Selected):**
   - Filters all HTTP and WebSocket requests through `subnetAndDeviceGuard` (`subnet-guard.ts#L4-L32`), allowing only authorized internal subnets and whitelisted device tokens, rejecting all external connections with HTTP 403 Forbidden.

### Rationale
Locks the ERP security boundary strictly to authorized shop hardware, completely eliminating remote attack surfaces.

### Consequences
- **Positive:** Impenetrable external security perimeter; zero public internet vulnerability; instant LAN network latency.
- **Negative:** Owner cannot access ERP reports remotely from home without establishing a secure physical VPN.
- **Mitigations:** Discrepancy Note: [As-Built] currently permits localhost and checks `trusted_devices` table; [As-Decided] mandates strict CIDR subnet enforcement (`127.0.0.1`, `192.168.1.0/24`, `10.0.0.0/8`) with default-deny HTTP 403.

---

## ADR-021: Sales Return Integrity: Non-Empty Reason, Over-Return Guard & Restock

- **Status:** Ratified (Synthesized from DEC-021)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/retail/returns.service.ts#L25-L90`

### Context
Sales returns in retail environments are high-risk vectors for employee theft and inventory distortion. Uncontrolled returns permit cashiers to refund more items than were originally sold, process phantom returns, or return defective items to active shelves without inspection.

### Alternatives Considered
1. **Unchecked Return Processing (Ad-hoc Cash Refunds):**
   - *Rejection Rationale:* Allows cashiers to process fraudulent refunds without validating whether the item was ever sold, leading to massive register shortages.
2. **Universal Manager-Only Return Processing:**
   - *Rejection Rationale:* Creates customer checkout bottlenecks for routine small exchanges (e.g. charging cables) when the manager is off-site or occupied in the repair lab.
3. **Validated Return Engine with Over-Return Guard & Restock Flag (Selected):**
   - `ReturnsService.processReturn()` validates original invoice existence, ensures returned quantity does not exceed original sales quantity, mandates a non-empty return reason, and conditionally restocks inventory (`returns.service.ts#L25-L90`).

### Rationale
Enforces strict retail inventory accounting while providing an auditable, controlled customer return workflow.

### Consequences
- **Positive:** Prevents return fraud and negative inventory imbalances; complete audit trail of refund reasons.
- **Negative:** Cashier must reference original invoice number or customer phone to process returns.
- **Mitigations:** POS search allows rapid invoice retrieval by customer phone, date, or item serial number.

---

## ADR-022: Installment Engine: Annual Markup Schedule & Pre-Due WhatsApp Reminders

- **Status:** Ratified (Synthesized from DEC-022)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/retail/installments.service.ts#L20-L95`, `server/src/modules/retail/installments.service.ts#L149-L198`

### Context
Electronics retailers and mobile phone shops in Egypt generate substantial revenue by offering consumer installment plans on smartphones and repair jobs. Managing installment schedules manually on paper ledgers or spreadsheets causes missed payment collections, calculation discrepancies, and uncontrolled customer delinquency.

### Alternatives Considered
1. **Third-Party BNPL / Consumer Finance API Gateways (e.g. ValU, Sympl, Aman):**
   - *Rejection Rationale:* External gateways impose heavy merchant discount fees (5%–10% per transaction), require permanent internet connectivity and external webhooks (violating strict local LAN autonomy per Section 1, Principle III.1), and pass financing profits to third parties instead of keeping lucrative markup in-house.
2. **Flat Unscheduled Informal Credit Ledger (Traditional "Daftar"):**
   - *Rejection Rationale:* Recording customer debts as an open lump-sum without amortized monthly payment installments or penalty calculation makes tracking overdue aging impossible and leads to disputes over agreed interest markups.
3. **In-House Amortized Installment Engine with Pre-Due WhatsApp Reminders (Selected):**
   - Generates strict monthly amortization schedules using integer-piastre precision, applies a configurable annual markup rate (`interest_rate`), verifies Egyptian National ID (14 digits) and guarantor contact info, and dispatches automated local WhatsApp collection notices 2 days prior to each due date (`server/src/modules/retail/installments.service.ts#L149-L198`).

### Rationale
Keeps high-margin consumer installment financing revenue in-house while operating entirely within local shop control with zero external merchant transaction fees. Automated WhatsApp reminders reduce default rates without adding manual clerk workload.

### Consequences
- **Positive:** 100% of installment markup revenue retained in-house; automated 2-day pre-due alerts; exact integer-piastre schedule reconciliation with final-installment fractional cent adjustment (`installments.service.ts#L74-L80`).
- **Negative:** The shop directly assumes default and credit risk from customers.
- **Mitigations:** Mandatory 14-digit Egyptian National ID recording, customer phone verification, and guarantor documentation before plan activation.

---

## ADR-023: Stocktake Sales Freeze on Active Physical Counting Batches

- **Status:** Ratified (Synthesized from DEC-023)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/repositories/inventory.repository.ts#L116-L150`

### Context
During periodic physical inventory cycle counting, if cashiers continue selling items from shelves that inventory clerks are actively counting, physical counts diverge from book stock, producing false inventory variances and phantom shortages during reconciliation.

### Alternatives Considered
1. **Complete Store Closure during Inventory Audits:**
   - *Rejection Rationale:* Halts all customer repair pickups and retail sales for entire days, causing significant revenue loss and customer inconvenience.
2. **Unrestricted Live Sales during Physical Counting:**
   - *Rejection Rationale:* Concurrently decrementing stock while clerks count physical boxes corrupts count reconciliation, making true shrinkage measurement impossible.
3. **Selective Batch-Level Sales Freeze (`is_frozen = 1`) (Selected):**
   - Flags items included in an active physical count batch as frozen from POS checkout (`inventory.repository.ts#L116-L150`). Unaffected categories continue selling normally until the count batch is submitted and reconciled.

### Rationale
Guarantees 100% mathematical audit accuracy during inventory reconciliation without shutting down store operations.

### Consequences
- **Positive:** Accurate physical stock reconciliation; zero phantom shrinkage caused by mid-count sales.
- **Negative:** Cashiers cannot sell items currently locked in an active counting batch.
- **Mitigations:** Open POS cart conflicts are resolved via HTTP 409 and audited Manager override per ADR-030.

---

## ADR-024: Mandatory Dual-Role Price Modification with Synchronous Audit Trail

- **Status:** Ratified (Synthesized from DEC-024)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/inventory/inventory.service.ts#L276-L315`

### Context
In retail electronics and repair shops, unauthorized price modifications represent a major source of shrinkage and fraud. If cashiers or technicians can alter retail prices or supplier cost baselines without authorization, discounts can be forged or margins hidden.

### Alternatives Considered
1. **Unrestricted Price Editing by Any Authenticated User:**
   - *Rejection Rationale:* Exposes store margins to rogue cashier manipulation, allowing staff to discount items for friends without owner awareness.
2. **Hardcoded Database Pricing (Requires Developer Intervention):**
   - *Rejection Rationale:* Paralyzes everyday retail pricing agility in Egypt's volatile electronics market where supplier replacement costs fluctuate weekly.
3. **Role-Restricted Modification with Synchronous Audit Logging (Selected):**
   - Price changes are strictly restricted to MANAGER and ADMIN roles (`inventory.service.ts#L276-L315`). Every change synchronously writes previous price, new price, user ID, client IP, and justification to `audit_log`.

### Rationale
Protects business gross margins while maintaining the agility needed to adjust prices in response to wholesale market changes.

### Consequences
- **Positive:** Strict pricing governance; complete forensic accountability for all margin adjustments.
- **Negative:** Floor cashiers cannot alter prices without escalating to a manager.
- **Mitigations:** Controlled promotional discount vouchers allow structured cashier discounting without mutating base prices.

---

## ADR-025: Constitution Lifecycle: Clean Replacement & Ratification as Version 1.0.0

- **Status:** Ratified (Synthesized from DEC-025)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `.specify/memory/constitution.md`

### Context
During exploratory discovery rounds, constitutional principles evolved across multiple notes and provisional decisions. Operating with scattered rules or partial drafts risks contradictory implementations between repair, POS, and accounting modules.

### Alternatives Considered
1. **Dispersed Module-Specific Rule Documents:**
   - *Rejection Rationale:* Leads to conflicting domain rules where accounting policies contradict POS checkout logic or repair warranty terms.
2. **Informal Verbal Owner Guidelines:**
   - *Rejection Rationale:* Ineffective for autonomous AI coding agents and development teams; leads to forgotten invariants and recurring code regressions.
3. **Ratified Unified System Constitution Version 1.0.0 (Selected):**
   - Consolidates all ratified architectural invariants (DEC-001 through DEC-040) into a single canonical charter (`.specify/memory/constitution.md`) governed by formal amendment rules.

### Rationale
Establishes an immutable, single source of architectural truth governing all specifications, code changes, and quality gates.

### Consequences
- **Positive:** Unified architectural alignment; zero ambiguity regarding system invariants; definitive guidance for all modules.
- **Negative:** Any future architectural divergence requires a formal constitutional amendment.
- **Mitigations:** Constitution Section 8 defines a structured amendment protocol requiring explicit owner ratification.

---

## ADR-026: Single-Branch Scope Invariant & Freezing Inter-Branch Transfer Module

- **Status:** Ratified (Synthesized from DEC-026)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/inventory/inventory.router.ts#L45-L130`

### Context
The existing codebase contains legacy routes and tables for inter-branch inventory transfers and multi-warehouse routing. However, the shop operates as a single physical location. Actively maintaining multi-branch features introduces unnecessary synchronization complexity in v1.

### Alternatives Considered
1. **Full Multi-Branch Network Activation in v1:**
   - *Rejection Rationale:* Introduces distributed database replication, branch routing latency, and complex multi-tenant permissions unneeded for a single-store operation.
2. **Hard Codebase Purge of Inter-Branch Files:**
   - *Rejection Rationale:* Destroys functional code that may be repurposed when the business opens secondary branch locations in future phases (v2).
3. **Declare Single-Branch Invariant & Freeze Module as Non-Active (Selected):**
   - Formally restricts v1 scope to single-branch operations; marks inter-branch transfer routes (`inventory.router.ts#L45-L130`) as frozen non-active legacy code.

### Rationale
Keeps v1 scope sharply focused on core retail, repair, and financial stability while preserving expansion code for v2.

### Consequences
- **Positive:** Simplified single-store mental model; zero distributed synchronization failure modes in v1.
- **Negative:** Multi-branch transfers cannot be executed through the UI in v1.
- **Mitigations:** Code remains cleanly isolated in the repository ready for re-activation upon future expansion.

---

## ADR-027: Power Outage Defense Architecture: Engine Durability over Hardware UPS

- **Status:** Ratified (Synthesized from DEC-027)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/db/database.ts#L16`

### Context
Physical power outages in Egypt occur suddenly without pre-warning. Physical inspection confirmed that no USB-monitored smart UPS is connected to the server. Relying on operating system shutdown scripts or external hardware signaling is physically impossible.

### Alternatives Considered
1. **Mandate Smart-UPS Hardware Installation before Launch:**
   - *Rejection Rationale:* Adds significant upfront hardware procurement costs; physical cables can be accidentally disconnected by staff.
2. **In-Memory Asynchronous Write Buffering (`synchronous = OFF`):**
   - *Rejection Rationale:* Guarantees severe database corruption and lost transactions on unannounced power drops.
3. **Software Engine-Level fsync Durability (`synchronous = FULL`) (Selected):**
   - Enforces immediate physical disk syncing for all committed transactions via SQLite WAL and `PRAGMA synchronous = FULL` (`database.ts#L16`), guaranteeing zero data loss regardless of hardware UPS presence.

### Rationale
Achieves total data durability directly through the software storage engine, eliminating dependency on physical hardware accessories.

### Consequences
- **Positive:** 100% resilient against unannounced physical power cuts; zero data loss for committed transactions.
- **Negative:** Small fsync write latency overhead (3–8ms per transaction).
- **Mitigations:** Fast local NVMe/SSD drives keep transaction execution well within sub-50ms performance budgets.

---

## ADR-028: Financial Approval Hierarchy: Admin as Functional CFO (> 5,000 EGP)

- **Status:** Ratified (Synthesized from DEC-028)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/fintech/fintech.router.ts#L180-L210`

### Context
In small to medium electronics workshops, there is no separate full-time Chief Financial Officer (CFO). The shop owner/Admin functionally serves as the CFO. Historical references to a separate CFO role in code and specifications cause role mapping confusion.

### Alternatives Considered
1. **Formal Separate "CFO" RBAC Role:**
   - *Rejection Rationale:* Creates artificial administrative overhead and requires dummy user provisioning in a single-owner shop where no CFO employee exists.
2. **Blanket Manager Authority for All Cash Payouts:**
   - *Rejection Rationale:* Grants floor managers unconstrained authority to disburse arbitrary cash sums, introducing embezzlement and liquidity depletion risks.
3. **Universal Zero-Threshold Admin Sign-Off:**
   - *Rejection Rationale:* Halts daily shop operations by requiring the owner to sign off on routine 50 EGP customer returns or minor petty cash disbursements.
4. **Two-Tier Hierarchy with ADMIN as Functional CFO (> 5,000 EGP) (Selected):**
   - The ADMIN role holds CFO authority; operations $\le$ 5,000 EGP can be authorized by floor Managers, while disbursements $>$ 5,000 EGP (500,000 piastres) strictly require authenticated ADMIN authorization and an audit trail entry.

### Rationale
Aligns application security boundaries with real-world shop ownership and financial risk management.

### Consequences
- **Positive:** Protects business liquidity from unauthorized large payouts; clear, simplified 4-role hierarchy (ADMIN, MANAGER, TECHNICIAN, CASHIER).
- **Negative:** Admin presence or approval is required to release customer refunds or vendor disbursements exceeding 5,000 EGP.
- **Mitigations:** Configurable threshold allows the owner to adjust the approval ceiling as shop trade expands.

---

## ADR-029: Repair Quote Pre-Auth via WhatsApp Text & Manual Technician Logging

- **Status:** Ratified (Synthesized from DEC-029)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/repair/repair.router.ts#L281-L310`

### Context
Technicians require customer authorization before proceeding with expensive repairs. Proposing a public web approval link violates the strict LAN-only isolation invariant (Section 1, Principle III.1). Relying on verbal phone calls creates customer disputes over agreed costs.

### Alternatives Considered
1. **Public Web Customer Approval Portal:**
   - *Rejection Rationale:* Requires opening public internet ingress to the internal ERP server, violating strict local LAN isolation (Section 1, Principle III.1) and exposing customer data.
2. **Unrecorded Verbal Phone Call Approvals:**
   - *Rejection Rationale:* Leaves zero auditable digital record; customers frequently dispute agreed repair costs when picking up finished devices.
3. **WhatsApp Text Quotation with Technician Manual Approval Logging (Selected):**
   - Technicians dispatch repair quotes via WhatsApp text. When the customer confirms via chat, the technician logs the approval in the ERP with customer timestamp and quote details (`repair.router.ts#L281-L310`).

### Rationale
Maintains complete LAN network isolation while establishing an auditable, timestamped record of customer repair authorization.

### Consequences
- **Positive:** Zero external network perimeter breach; audit-logged customer authorization; protects against cost disputes.
- **Negative:** Requires technicians to manually click confirmation and verify customer chat reply.
- **Mitigations:** Pre-formatted WhatsApp quote templates include clear price totals and repair scope to avoid ambiguity.

---

## ADR-030: Open POS Cart Conflict Resolution during Cycle Count (HTTP 409 & Override)

- **Status:** Ratified (Synthesized from DEC-030)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/retail/retail.router.ts#L133-L174`, `server/src/modules/inventory/inventory.router.ts`, `server/src/repositories/inventory.repository.ts#L116-L150`

### Context
When an item or shelf is locked for physical cycle counting (`is_frozen = 1` per DEC-023), a cashier at a POS counter may already have that item sitting in an active, uncommitted shopping cart from an in-progress walk-in customer interaction. If the cashier attempts to finalize the sale while the item is frozen, a conflict occurs between real-time inventory counting and live sales fulfillment.

### Alternatives Considered
1. **Silent Dropping / Auto-Removal from Cart:**
   - *Rejection Rationale:* Clearing the item from the cashier's active cart without clear notification confuses cashiers and angers customers standing at the checkout register with physical merchandise in hand.
2. **Unchecked Sale Execution (Ignoring Freeze):**
   - *Rejection Rationale:* Allowing the checkout to decrement stock silently corrupts the active stocktake batch, invalidating variance calculations and resulting in false deficit write-offs during reconciliation.
3. **Hard System-Wide Register Lockout during Stocktake:**
   - *Rejection Rationale:* Preventing all POS sales during counting forces the shop to turn away paying walk-in customers and halt retail operations completely.
4. **HTTP 409 Conflict Rejection with Audited Manager Override (Selected):**
   - When a cashier attempts to checkout an item belonging to an active counting batch, the backend rejects the transaction with `HTTP 409 Conflict` (payload: `{ error: 'ITEM_FROZEN_FOR_COUNT', item_id, batch_id }`). The POS client displays a clear dialog explaining the freeze. If the customer insists and cannot wait, the dialog provides an explicit "Manager Override" option requiring a Manager or Admin PIN/credentials. The override permits the sale to complete, records a high-severity entry in `audit_log`, and automatically adjusts the count reconciliation baseline by subtracting the sold quantity from the pre-freeze book quantity.

### Rationale
Protects inventory audit integrity by default, preventing uncoordinated stock changes, while providing an operational escape hatch to preserve revenue and customer goodwill at the physical sales counter.

### Consequences
- **Positive:** Stocktake counts remain mathematically sound; cashiers receive unambiguous HTTP 409 conflict messages; walk-in customer sales are not lost if a manager authorizes the override.
- **Negative:** Requires cashiers to call a manager for override authorization, adding slight checkout delay.
- **Mitigations:** Override events log the approving manager ID, timestamp, and sold quantity to `audit_log`, ensuring accountability and adjusting the physical count reconciliation baseline.

---

## ADR-031: Warranty Spare Parts Accounting as Dedicated Warranty Expense

- **Status:** Ratified (Synthesized from DEC-031)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/accounting/accounting.router.ts`, `server/src/modules/repair/repair.service.ts`

### Context
When a customer returns a device under warranty with a failed replacement part, the lab replaces the part free of charge. If the consumed part's cost is absorbed silently or deleted from inventory without a journal entry, financial statements misstate gross margins and warranty failure costs.

### Alternatives Considered
1. **Customer Invoicing with 100% Discount:**
   - *Rejection Rationale:* Distorts retail sales volume reports with zero-revenue transactions and corrupts average revenue per customer metrics.
2. **Silent Inventory Write-Off to General Shrinkage:**
   - *Rejection Rationale:* Conceals defective supplier component costs within general inventory shrinkage, preventing vendor quality accountability.
3. **Dedicated Double-Entry Posting to WARRANTY EXPENSE (Selected):**
   - Parts consumed during warranty repairs automatically trigger balanced journal entries debiting WARRANTY EXPENSE and crediting INVENTORY at FIFO cost, completely free of charge to the customer.

### Rationale
Accurately reflects supplier part defect costs and lab warranty overhead on the income statement, enabling data-driven vendor scorecards.

### Consequences
- **Positive:** Transparent financial accounting; accurate gross margin tracking; clear visibility into warranty costs.
- **Negative:** Requires chart of accounts to maintain a dedicated WARRANTY EXPENSE account code.
- **Mitigations:** Default seed data initializes the warranty expense account in chart_of_accounts.

---

## ADR-032: Replaced Spare Parts Warranty Window Inheritance Protocol

- **Status:** Ratified (Synthesized from DEC-032 & DEC-041)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/repair/repair.service.ts`, `server/src/modules/repair/repair.router.ts#L743-L790`

### Context
When a repaired device is delivered to a customer, it carries an auditable digital warranty certificate whose duration is determined by configurable category settings per DEC-041 (defaults: 90 days for screens, 60 days for batteries, 30 days for other repairs and labor). If a replacement part subsequently fails and is serviced under warranty, granting a brand new category warranty window on the replacement component would create an infinite rolling warranty cycle vulnerable to customer abuse. This ADR governs window inheritance only; baseline warranty duration lives in system settings and certificate data per DEC-041, not in this ADR.

### Alternatives Considered
1. **Full Warranty Reset (Brand New Category Duration on Every Replacement):**
   - *Rejection Rationale:* Enables customer abuse and infinite warranty rolling loops; customers could repeatedly claim minor issues near the end of their coverage window to receive indefinite free parts and repairs.
2. **Zero Warranty on Replaced Component ("As-Is" Handover):**
   - *Rejection Rationale:* Highly adversarial to customers; if a replacement part is defective out of the box or fails within 24 hours, the customer has zero recourse.
3. **Flat Minimal Grace Period (e.g. Fixed 3 Days Regardless of Remaining Window):**
   - *Rejection Rationale:* Unfairly truncates valid warranty duration if a device was returned early in its coverage window (e.g., on day 10 of a 90-day screen warranty, stripping away 80 days of legitimately paid coverage).
4. **Window Inheritance Protocol with Configurable Grace (Selected):**
   - Replaced spare parts strictly inherit the remaining duration of the original repair ticket's warranty certificate (`end_date - CURRENT_TIMESTAMP`). The expiration date locked in `warranty_certificates` does not extend beyond the original certificate's `end_date` without audited Manager override. [As-Decided: per DEC-041] If remaining warranty is < 3 days upon replacement delivery, a minimum 3-day testing grace period applies.

### Rationale
Protects the shop against perpetual warranty extensions while fairly honoring the customer's full paid warranty duration established on the original certificate.

### Consequences
- **Positive:** Eliminates endless rolling warranty abuse; mathematically bounded shop warranty liability; respects category-based warranty configuration (DEC-041).
- **Negative:** Customers whose parts fail near the end of the warranty window receive only the remaining days.
- **Mitigations:** [As-Decided: per DEC-041] If remaining warranty is < 3 days upon replacement delivery, a minimum 3-day testing grace period applies.

---

## ADR-033: Mandatory Manager Approval & Photographic Evidence for Repair Warranty Voiding

- **Status:** Ratified (Synthesized from DEC-033 & DEC-042)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/repair/repair.router.ts#L743-L790`

### Context
Customers returning devices with shattered screens, internal frame fractures, or liquid ingress sometimes demand free warranty repairs. Conversely, technicians may attempt to void legitimate warranties arbitrarily to avoid difficult rework. Unilateral warranty voiding sparks bitter shop floor disputes. While warranty terms state that accidental drops or liquid damage void coverage (`repair.router.ts#L775`), as-built code lacks an auditable procedure for legally voiding a warranty.

### Alternatives Considered
1. **Unilateral Technician Discretion to Void Warranty:**
   - *Rejection Rationale:* Allows technicians to arbitrarily reject legitimate warranty rework to escape difficult bench tasks, severely alienating customers and damaging store reputation.
2. **Universal Automatic Warranty Acceptance (Zero Voiding Permitted):**
   - *Rejection Rationale:* Forces the shop to absorb massive financial losses replacing screens or components damaged by customers who dropped or submerged their devices post-repair.
3. **Manager Approval via Verbal Confirmation:**
   - *Rejection Rationale:* Lacks persistent forensic evidence; customers contest verbal assertions of liquid damage or physical drops without tangible proof.
4. **Mandatory Manager Approval with Attached Photographic Evidence (Selected):**
   - Voiding a repair warranty on grounds of customer physical damage or liquid ingress strictly requires two conditions: (1) mandatory photographic evidence uploaded to the ticket inspection record [As-Decided per DEC-042], and (2) explicit authentication and approval by a MANAGER or ADMIN role (DEC-033), synchronously logged in `audit_log` with before/after status and justification.

### Rationale
Guarantees objective, indisputable photographic evidence protecting against customer claims while ensuring executive managerial oversight over all warranty rejections.

### Consequences
- **Positive:** Irrefutable photographic evidence protects the shop against customer disputes; fair, auditable warranty decisions; eliminates unilateral technician rejections.
- **Negative:** Technician must wait for manager evaluation before finalizing void status on a ticket.
- **Mitigations:** [As-Decided per DEC-042] Photographic capture and inspection checklist are integrated directly into the warranty inspection UI workflow.

---

## ADR-034: Purchase Order Approval Ceiling: Manager/Admin Authorization for PO > 10,000 EGP

- **Status:** Ratified (Synthesized from DEC-034)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/procurement/procurement.router.ts#L302-L330`, `server/src/modules/spare-parts/spare-parts.router.ts#L283-L310`

### Context
Lab technicians and inventory clerks routinely identify depleted spare parts (e.g. charging ports, adhesive tape, common screens) and raise purchase orders with wholesale suppliers. Without a clear approval ceiling, junior staff could commit the shop to large capital outlays (e.g. bulk screen batches exceeding 50,000 EGP) without owner visibility, causing liquidity crunches and supplier debt disputes.

### Alternatives Considered
1. **Universal Zero-Threshold Approval (Admin must approve every PO):**
   - *Rejection Rationale:* Creates operational bottlenecks. Purchasing routine 150 EGP charging flex cables or cleaning alcohol would require waiting for the owner/admin, slowing down repair turnaround.
2. **Coupling Procurement Ceiling to Customer Payment Threshold (5,000 EGP per DEC-028):**
   - *Rejection Rationale:* Inappropriate threshold alignment. Supplier purchasing dynamics operate at different volume and cost scales than customer retail/repair payments. 5,000 EGP is too low for routine weekly parts restocks, generating excessive admin approval overhead.
3. **No Financial Ceiling / Role-Only Permission (Any Inventory Clerk can order unlimited amounts):**
   - *Rejection Rationale:* Exposes the shop to catastrophic cash flow draining, duplicate orders, and unauthorized vendor commitments.
4. **Two-Tier 10,000 EGP Ceiling with Manager/Admin Sign-Off (Selected):**
   - Purchase orders with total value <= 10,000 EGP (1,000,000 piastres) can be created and dispatched directly by Inventory Managers with status `'ORDERED'`. Any purchase order with total value > 10,000 EGP is created in status `'PENDING_APPROVAL'`. Attempting to mark it `'ORDERED'` without authenticated Manager or Admin credentials returns `HTTP 403 Forbidden`. Approval is recorded in `audit_log` with the approver's user ID and timestamp.

### Rationale
Balances lab agility for routine spare parts replenishment with strict executive cash flow control over major capital purchases, keeping procurement independent from the 5,000 EGP customer transaction threshold (DEC-028).

### Consequences
- **Positive:** Protects store liquidity; guarantees owner/manager oversight on large inventory commitments; keeps daily lab parts replenishment frictionless.
- **Negative:** Large bulk orders > 10,000 EGP require manager or admin authorization before dispatch.
- **Mitigations:** The procurement dashboard displays pending approval POs at the top with distinct visual badging for quick review.

---

## ADR-035: Quarantined Scrap Workflow (DEFECTIVE_SCRAP) for Rejected Supplier Returns

- **Status:** Ratified (Synthesized from DEC-035)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/procurement/procurement.router.ts#L130-L165`

### Context
When defective spare parts or returned customer components cannot be returned to suppliers (e.g. supplier warranty period expired or vendor disputes defect), staff often leave them scattered on lab benches. Unmanaged parts risk accidental re-installation in customer devices or unrecorded shrinkage.

### Alternatives Considered
1. **Immediate Physical Disposal without Ledger Tracking:**
   - *Rejection Rationale:* Prevents parts salvage (e.g. usable camera modules or ICs) and distorts inventory valuation by bypassing formal book loss records.
2. **Returning Damaged Components to Active Shelves:**
   - *Rejection Rationale:* Highly dangerous; technicians mistakenly pick defective parts for customer repairs, causing repeated repair failures and customer outrage.
3. **Quarantined Scrap Isolation (`DEFECTIVE_SCRAP`) with Audited Disposal (Selected):**
   - Moves unreturnable defective parts to a segregated status `DEFECTIVE_SCRAP` (`procurement.router.ts#L130-L165`). Parts are locked from POS and repair allocation, saleable only as raw scrap upon explicit Manager sign-off with recorded book loss.

### Rationale
Prevents defective parts from polluting active repair inventory while maintaining formal accounting tracking of unrecovered component costs.

### Consequences
- **Positive:** Complete isolation of non-viable parts; accurate cost write-off accounting; potential salvage value recovery.
- **Negative:** Requires physical quarantine bins in the workshop matching system quarantine records.
- **Mitigations:** Monthly scrap audit purges zero-value scrap with formal administrative sign-off.

---

## ADR-036: Logical Parts Reservation (reserved_stock) on Ticket Transition to IN_REPAIR

- **Status:** Ratified (Synthesized from DEC-036)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/repair/repair.router.ts#L652-L680`

### Context
A customer approves a repair quote for a screen replacement. However, existing code decremented stock only when the repair was finalized. In the interim, a cashier at the POS counter could sell the very last screen in stock to a walk-in retail customer, leaving the technician unable to repair the committed device.

### Alternatives Considered
1. **Immediate Physical Inventory Decrement on Quote:**
   - *Rejection Rationale:* Prematurely removes stock from warehouse tracking before the customer agrees to the estimate, skewing book balance if the quote is rejected.
2. **Manual Sticky Notes on Physical Boxes:**
   - *Rejection Rationale:* Unreliable, error-prone, and invisible to POS cashier terminals during fast-paced checkout.
3. **Logical reserved_stock Allocation on IN_REPAIR Transition (Selected):**
   - When customer quote is approved and ticket transitions to IN_REPAIR, required parts are immediately marked reserved_stock, reducing available_to_sell without altering physical warehouse on-hand count (`repair.router.ts#L652-L680`).

### Rationale
Prevents POS retail checkout from selling parts committed to approved repairs, resolving stock contention while preserving accurate physical inventory counts.

### Consequences
- **Positive:** Eliminates technician-cashier stock contention; guarantees promised repair completion timelines.
- **Negative:** Stock is locked from retail sale while the device is in the repair queue.
- **Mitigations:** [As-Decided: New spec rule introduced by this ADR; not pre-existing behavior] If a repair ticket is transitioned to CANCELLED, reserved parts are automatically released back to available stock.

---

## ADR-037: Frontend Bundle Size Ceiling: Strict index.js <= 80KB & Vite 500KB Chunk Budget

- **Status:** Ratified (Synthesized from DEC-037)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `PROJECT.md#L10-L63`, `client/vite.config.ts`

### Context
Over time, adding large charting libraries, OCR parsers, and enterprise views causes frontend JavaScript bundles to bloat. On local shop hardware (which may include older Pentium/Core-i3 POS terminals), large bundles cause multi-second white-screen boot latency.

### Alternatives Considered
1. **Monolithic Single-Bundle Output:**
   - *Rejection Rationale:* Produces a multi-megabyte bundle that causes multi-second white-screen boot latency and sluggish rendering on older POS hardware.
2. **Server-Side Rendering (SSR):**
   - *Rejection Rationale:* Introduces complex Node.js rendering tier and hydration overhead unneeded for a local desktop SPA.
3. **Strict Code-Splitting with 80KB Baseline & 500KB Chunk Budget (Selected):**
   - Route-based lazy loading (`React.lazy`) and manual chunk splitting in `vite.config.ts` keep the initial index bundle under 80KB, ensuring sub-second boot times on modest PC hardware.

### Rationale
Guarantees lightning-fast startup and smooth POS performance on modest shop computer hardware.

### Consequences
- **Positive:** Sub-second application startup; optimal memory utilization on legacy POS terminals.
- **Negative:** New heavy views must be lazily loaded rather than imported statically.
- **Mitigations:** Automated CI/build bundle analyzer enforces the 80KB budget on every production build.

---

## ADR-038: Stolen IMEI Registry Scope: Internal Advisory Curated Records with Manager Sign-Off

- **Status:** Ratified (Synthesized from DEC-038)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/stolen-registry/stolen-registry.router.ts#L10-L40`

### Context
Repair labs frequently encounter devices reported lost or stolen by customers or partner shops. The codebase contains a local Stolen IMEI Registry. Clear scope boundaries must prevent false accusations or legal complications with walk-in customers.

### Alternatives Considered
1. **Automated Cloud Sync with External Police/Global Blacklists:**
   - *Rejection Rationale:* Violates offline LAN isolation (Section 1, Principle III.1); external API downtime blocks device intake.
2. **Automatic System Service Refusal:**
   - *Rejection Rationale:* False positives or outdated entries could lead to wrongful customer accusations and violent shop floor conflicts.
3. **Internal Advisory Warning with Mandatory Manager Sign-Off (Selected):**
   - Flags matches as advisory warnings (`stolen-registry.router.ts#L10-L40`); the system never auto-refuses service. Device refusal requires explicit Manager confirmation recorded in `audit_log`.

### Rationale
Protects the shop against handling stolen property while avoiding wrongful customer confrontation through human managerial discretion.

### Consequences
- **Positive:** Reduces legal risk of handling stolen devices; maintains complete internal data privacy.
- **Negative:** Registry is limited to internally recorded IMEIs and does not connect to external police databases.
- **Mitigations:** Clear advisory banner reminds technicians that flagged status is internal and non-official.

---

## ADR-039: AI Demand Forecasting Scope: Frozen Non-Active Status in v1

- **Status:** Ratified (Synthesized from DEC-039)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/ai/ai.router.ts#L12-L45`

### Context
The repository includes advanced AI demand forecasting endpoints utilizing regression models. In a single-branch shop with moderate transaction density (1–2 transactions/minute), statistical demand forecasting lacks sufficient historical data to generate reliable replenishment predictions.

### Alternatives Considered
1. **Active Neural/ML Model in v1:**
   - *Rejection Rationale:* Transaction density (1–2 sales/min in single shop) is mathematically insufficient for statistical demand forecasting; wastes RAM and CPU resources.
2. **Complete Code Purge:**
   - *Rejection Rationale:* Deletes existing algorithms that could be valuable in v2 when historical transaction data has accumulated.
3. **Formally Frozen Dormant Status (Selected):**
   - Code remains in repository (`ai.router.ts#L12-L45`) but endpoints are marked non-active in v1; revisitable in Phase 2/P2 once extensive sales history accumulates.

### Rationale
Conserves system resources and avoids misleading predictive inventory recommendations until adequate transaction volume is reached.

### Consequences
- **Positive:** Zero CPU/RAM waste on uncalibrated models; clean operational focus on safety-stock reordering.
- **Negative:** Predictive AI forecasting UI is disabled in v1.
- **Mitigations:** Simple rule-based reorder points (safety stock thresholds in inventory) handle replenishment reliably.

---

## ADR-040: HR Payroll & Technician Commission Scope: Role-Restricted Access and Auditability

- **Status:** Ratified (Synthesized from DEC-040)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/hr/hr.router.ts#L84-L147`

### Context
The HR module calculates monthly salaries and repair job commissions for lab technicians. Payroll compensation is highly confidential. Unauthorized technician access or un-audited commission alterations create acute workplace toxicity and financial fraud.

### Alternatives Considered
1. **Remove Payroll Entirely (Manage via external Excel):**
   - *Rejection Rationale:* Disconnects technician commission calculations from completed repair ticket volume, increasing payroll calculation disputes and manual data transfer errors.
2. **Open Access to Floor Staff:**
   - *Rejection Rationale:* Technicians viewing colleagues' salaries and commission rates breeds toxic workplace friction and privacy breaches.
3. **Role-Restricted In-House Engine with Audit Logging (Selected):**
   - Accessible exclusively to MANAGER and ADMIN roles (HTTP 403 Forbidden for others) (`hr.router.ts#L84-L147`); any manual commission or salary adjustment requires justification recorded in `audit_log`.

### Rationale
Ensures confidential, automated technician commission calculations directly tied to verified repair completions with strict access security.

### Consequences
- **Positive:** Automated, transparent commission payouts; confidential employee compensation; full auditability.
- **Negative:** Technicians cannot view detailed payroll rosters directly on the terminal.
- **Mitigations:** Technicians view their own individual commission totals on their personal technician dashboard.

---

## DEC-043: LAN Perimeter IPv6 Loopback Authorization & Workstation Crypto Seed Token

- **Status:** Ratified (Feature 001 Hardening)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/middleware/subnet-guard.ts#L4-L20`, `server/src/db/seed.ts#L18-L30`

### Context
On Windows installations with Node 24 and Electron desktop host, localhost connections may resolve over IPv6 loopback (`::1` or `::ffff:127.0.0.1`). Furthermore, seeding hardcoded or predictable workstation tokens creates an immediate perimeter security bypass.

### Decision
1. Explicitly authorize `::1` and `::ffff:127.0.0.1` as loopback addresses in `subnetAndDeviceGuard`.
2. Constrain permitted LAN subnets strictly to `192.168.1.0/24` and `10.0.0.0/8` per ADR-020.
3. Enforce crypto-random 64-character token generation during database seeding for `master-pos-station-token` (never hardcoded values).

---

## DEC-044: Shift-Close Database Backup Failure Blocking & Loud Failure Alerting

- **Status:** Ratified (Feature 002 Hardening / DEC-044)
- **Deciders:** System Architecture / Owner Ratification
- **Date:** 2026-09-12
- **Technical Scope:** `server/src/modules/core/core.router.ts#L287-L315`

### Context
Closing a shift reconciles the cash drawer and marks the handover point between employees. Under ADR-002, closing the shift must trigger a database backup snapshot. If the backup fails due to disk full or permissions, swallowing the error and allowing the shift to close creates false security: staff leaves thinking the shift is backed up, but without a hardware UPS (DEC-027), a power cut overnight leaves unreconciled transactions vulnerable.

### Decision
1. A failure during automated shift-close backup snapshot creation strictly BLOCKS the shift handover, returning `HTTP 500 Internal Server Error` with error code `BACKUP_FAILED`.
2. A synchronous high-severity audit log event `SHIFT_CLOSE_BACKUP_FAILED` is recorded with the error message and actor ID.
3. Persistent red visual alert is triggered per DEC-015 and Constitution §3.1 / §4.3. Conservative-by-design: with no UPS, an unclosed shift beats an unprotected night.

