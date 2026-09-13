# Feature Specification: Warranty Governance, Voiding Authorization & Defective Parts Lifecycle

**Document Version:** 1.0.0  
**Status:** Draft / Pending Owner Review  
**Specification Path:** `specs/003-warranty-governance-lifecycle/spec.md`  
**Target Milestone:** Phase 3 — Milestone 3  
**Governing Architecture:** Constitution v1.0.1 | DEC-031, DEC-032, DEC-033, DEC-035, DEC-041, DEC-042, DEC-045 | ADR-031, ADR-032, ADR-033, ADR-035, ADR-041, ADR-042  
**Target Git Branch:** `feature/003-warranty-governance-lifecycle`  
**Created:** 2026-09-12  

---

## 1. Executive Summary & Problem Statement (The "WHY")

Following the hardening of Core Durability, Network Perimeter Firewall, Spare Parts Reservation (Feature 001), and Financial Approval Continuity (Feature 002), Feature 003 targets the critical domain of **Warranty Lifecycle Governance, Fraud Protection, and Defective Parts Accounting**.

In the current codebase:
1. **Unbounded Warranty Extension & Arbitrary Durations (`DEC-041`, `DEC-032`):**
   - Repair warranties currently default to static 30 days without distinguishing between sensitive part categories (e.g. OLED screens vs batteries vs micro-soldering labor).
   - Replaced parts during warranty claims do not inherit the original ticket's warranty window, risking rolling infinite warranties.
   - Customers returning near the expiration window lack a guaranteed testing grace period.
2. **Unverified & Unauthorized Warranty Voiding (`DEC-033`, `DEC-042`):**
   - Technicians currently have the ability to void a customer's warranty on grounds of physical damage or liquid ingress without mandatory photographic proof or management oversight.
   - This opens severe customer dispute vectors and shop liability.
3. **Silent Warranty Parts Cost Absorption (`DEC-031`):**
   - Spare parts consumed during warranty repairs are silently deducted without explicit ledger classification, distorting gross margin reports and hiding true supplier component failure rates.
4. **Unregulated Defective Scrap from Supplier Return Rejections (`DEC-035`):**
   - When a supplier rejects a returned defective part (RTV), the system lacks a formal transition to `DEFECTIVE_SCRAP`, risking accidental re-shelving or uncontrolled liquidation.
5. **Test-Run Backup Catalogue Pollution (Operational Hygiene):**
   - Automated test suite executions have generated 86+ database backup snapshots in `server/backups/`, requiring test-run backup isolation and catalogue cleanup.

---

## 2. Scope Boundaries

### In-Scope (Strictly Bounded to Ratified Decisions)
1. **Warranty Duration Matrix, Inheritance & Grace Policy (`DEC-041`, `DEC-032` / `FR-007`):**
   - Dynamic warranty duration calculation by part category:
     - Screens / Displays: **90 days**
     - Batteries: **60 days**
     - Motherboard Repairs / Other Labor: **30 days**
   - Replaced warranty parts inherit the remaining duration of the original repair ticket; if remaining duration is < 3 days, a minimum 3-day testing grace period applies.
2. **Warranty Void Authority & Mandatory Photographic Evidence (`DEC-033`, `DEC-042` / `FR-008`):**
   - Voiding customer repair warranty requires mandatory JWT role `MANAGER` or `ADMIN`.
   - Dedicated endpoint `POST /api/repair/tickets/:id/void-warranty`.
   - Requires attached photographic evidence stored in dedicated directory (`server/uploads/warranty-evidence/`) with SHA-256 integrity hash recorded in SQLite (No raw BLOBs in DB to keep WAL light and shift-close snapshots sub-second per Constitution §III.3).
   - Dedicated external durability: `server/uploads/` joins automated external USB mirroring (`USB_BACKUP_PATH/uploads`) per Option (a).
   - Synchronous audit logging with action `WARRANTY_VOIDED` and real manager actor ID.
3. **Warranty Parts Operating Expense Accounting (`DEC-031` / `FR-009`):**
   - Parts consumed on warranty repairs debit `acc-5040` (code `5040`, `Warranty Parts Expense`, EXPENSE) and credit `acc-1040` (code `1040`, `Spare Parts Inventory`, ASSET).
   - Line-item tracking in repair ticket and financial ledger. Customer invoice total is 0 piastres.
4. **Supplier Rejected Returns to Defective Scrap (`DEC-035` / `FR-010`):**
   - Create RTV rejection endpoint `POST /api/procurement/rtv/:id/reject` in `procurement.router.ts`, transitioning item state to `DEFECTIVE_SCRAP`.
   - Scrap liquidation / salvage sale requires Manager authorization.
5. **Test-Run Backup Suppression & Catalogue Hygiene (`NFR-004`):**
   - Isolate test backup creations to ephemeral scratch directory (`server/backups/test_scratch/`) and clean up upon runner completion, preserving clean production catalogue.

### Explicitly Out-of-Scope
- Customer-facing online warranty claim web portal (remains internal POS/Lab workflow).
- Third-party insurance underwriter integration.
- Direct ETA Egyptian Tax Authority e-invoice synchronization (Action Owner: HUMAN per RISK-009).

---

## 3. Functional Requirements (The "WHAT")

### FR-007: Warranty Duration Matrix, Window Inheritance & Grace Policy (DEC-041, DEC-032)
- **FR-007.1 (Duration Matrix & Start Trigger):** Warranty starts at DELIVERED only (delivery date = warranty start date). Duration by primary part category, configurable in settings table with strict DEC-041 defaults: SCREEN/DISPLAY: 90 days. BATTERY: 60 days. MOTHERBOARD/LABOR/OTHER: 30 days. Unclassified fallback: 30 days.
- **FR-007.2 (Claim Acceptance Gate):** A warranty return (parent_ticket_id set) is accepted ONLY if current_date <= original_expiry_date. Claims after expiry are rejected with HTTP 422 WARRANTY_EXPIRED. NOTHING extends claim acceptance — not the grace, not anything.
- **FR-007.3 (Granted Window for accepted claims):** The replacement inherits original_expiry_date - current_date remaining days. If remaining < 3 days, the GRANTED replacement window is set to exactly 3 days (minimum testing grace for the NEW part). This grace applies to the granted window only — it NEVER extends claim acceptance (anti-abuse: lateness buys nothing).

### FR-008: Warranty Voiding RBAC & Mandatory Photographic Evidence (DEC-033, DEC-042)
- **FR-008.1:** Dedicated endpoint: `POST /api/repair/tickets/:id/void-warranty`.
- **FR-008.2:** Role Gate: Only `MANAGER` or `ADMIN` may execute this endpoint. Technician requests rejected with `HTTP 403 Forbidden` (`WARRANTY_VOID_FORBIDDEN`).
- **FR-008.3 (Evidence Gate + Hardening):** Request must supply non-empty reason and evidence_file (or base64 image). Validation: MIME ∈ {image/jpeg, image/png}; size ≤ 5MB. Missing → HTTP 400 PHOTO_EVIDENCE_REQUIRED; wrong type → HTTP 400 EVIDENCE_FORMAT_INVALID; oversized → HTTP 400 EVIDENCE_TOO_LARGE. Each condition has its own test vector in Test Suite 73.
- **FR-008.4 (Storage & Mirroring Contract):**
  - File saved to: `server/uploads/warranty-evidence/<ticket-id>-<timestamp>.<ext>`.
  - External Persistence (Option a): The `server/uploads/` directory joins automated external USB mirroring (`USB_BACKUP_PATH/uploads`) during backup operations so warranty forensic evidence survives host drive failure.
  - Database updates in `repair_tickets`:
    - `warranty_status = 'VOIDED'`
    - `warranty_void_reason = ?`
    - `warranty_void_evidence_path = ?`
    - `warranty_void_evidence_hash = ?` (SHA-256)
    - `warranty_void_approved_by = ?` (manager user id)
    - `warranty_void_approved_at = CURRENT_TIMESTAMP`
- **FR-008.5:** Synchronous audit log emitted: `WARRANTY_VOIDED` with real manager actor ID, reason, file path, and file hash.

### FR-009: Warranty Parts Operating Expense Tracking (DEC-031)
- **FR-009.1:** When parts are allocated or consumed on a warranty ticket (`is_warranty_repair = 1`), cost price is recorded as `warranty_cost_amount`.
- **FR-009.2:** Automatic journal entry lines generated:
  - Debit: `acc-5040` (code `5040`, `مصروفات قطع غيار الضمان (Warranty Parts Expense)`, type `EXPENSE`)
  - Credit: `acc-1040` (code `1040`, `مخزون قطع الغيار والشاشات (Spare Parts Inventory)`, type `ASSET`)
- **FR-009.3:** Part cost is explicitly excluded from customer invoice total (`total = 0 piastres` for warranty coverage) while preserving financial operating expense ledger truth.

### FR-010: Rejected Supplier Returns to DEFECTIVE_SCRAP & Liquidation Gate (DEC-035)
- **FR-010.1:** In `POST /api/procurement/rtv/:id/reject`, rejected items are flagged with `status = 'DEFECTIVE_SCRAP'`.
- **FR-010.2:** Items in `DEFECTIVE_SCRAP` are excluded from regular POS checkout (`HTTP 409 Conflict: ITEM_IS_DEFECTIVE_SCRAP`).
- **FR-010.3:** Salvage sale or scrap liquidation requires Manager authorization (`POST /api/inventory/scrap/liquidate` with Manager JWT).
- **FR-010.4 (Active Repair Reservation Defense):** If an item targeted for RTV rejection is currently reserved by one or more active repair tickets (`reserved_quantity > 0` or active reservation in `repair_tickets` where status ∈ `('PENDING', 'DIAGNOSED', 'IN_PROGRESS')`), the scrap transition must be rejected with `HTTP 409 Conflict` (`{ error: 'Cannot transition item to DEFECTIVE_SCRAP while reserved by active repair tickets', code: 'UNTIL_REPAIRS_SETTLE' }`). Active repairs must settle (reassign part or release reservation) before the item can be decommissioned as scrap.

---

## 4. Non-Functional Requirements (NFR)

- **NFR-004 (Test-Run Backup Isolation & Hygiene):**
  - When `NODE_ENV === 'test'`, backup snapshot writes are directed to `server/backups/test_scratch/`.
  - Ephemeral test snapshots are cleaned up upon test process completion, leaving production catalogue pristine.
- **NFR-005 (Zero WAL Bloat & High Performance):**
  - Binary photos are stored on disk; database strictly holds relative path and SHA-256 hash.
  - Sub-second shift-close snapshot guarantee (ADR-002) is protected from multi-megabyte image bloat.
