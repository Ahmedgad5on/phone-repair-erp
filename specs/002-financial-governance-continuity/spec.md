# Feature Specification: Financial Governance & Operational Continuity

**Document Version:** 1.0.0  
**Status:** Draft / Pending Owner Review  
**Specification Path:** `specs/002-financial-governance-continuity/spec.md`  
**Target Milestone:** Phase 3 — Milestone 2  
**Governing Architecture:** Constitution v1.0.1 | DEC-002, DEC-028, DEC-030, DEC-034 | ADR-002, ADR-030, ADR-034  
**Target Git Branch:** `feature/002-financial-governance-continuity`  
**Created:** 2026-09-12  

---

## 1. Executive Summary & Problem Statement (The "WHY")

Following the successful hardening of the system foundation (Durability, Perimeter Firewall, and Spare Parts Reservation in Feature 001), Feature 002 addresses the remaining ratified operational and financial invariants identified during Discovery.

Specifically, the system currently contains an active **financial governance bypass**:
- In the Purchase Orders module, any user can create a purchase order of any magnitude (e.g. 100,000 EGP) and it transitions directly to `ORDERED` without management approval, violating ratified decision **DEC-034** (> 10,000 EGP ceiling).
- Shift close (`/api/shifts/close`) records cash variance but does NOT trigger an immediate database backup, relying purely on midnight cron and leaving unmitigated operational risk (**DEC-002**, **RISK-008**).
- Items undergoing an active physical cycle count (stocktake) are not defended at the POS checkout counter, allowing inventory drift while counting is underway (**DEC-030**).

Closing these gaps protects shop financial liability, ensures business continuity upon shift change, and maintains inventory audit truth.

---

## 2. Scope Boundaries

### In-Scope (Strictly Bounded to Ratified As-Decided Invariants)
1. **PO Approval Ceiling (`DEC-034`):**
   - Purchase orders exceeding 10,000 EGP (1,000,000 piastres) default to `PENDING_APPROVAL`.
   - Dedicated approval endpoint (`POST /api/inventory/purchase-orders/:id/approve`) restricted to `MANAGER` and `ADMIN`.
   - Warehouse receipt (`RECEIVED`) strictly blocked if PO is in `PENDING_APPROVAL`.
2. **Shift-Close Backup Trigger (`DEC-002`, `RISK-008` Retirement):**
   - Wire non-blocking online backup snapshot directly into shift handover closure (`/shifts/close`).
   - Emit synchronous `audit_log` event with backup filename and byte size.
3. **Stocktake Active Count POS Defense (`DEC-030`):**
   - POS cart validation evaluates whether any line item is marked as frozen in active stocktake session.
   - Rejects with `HTTP 409 Conflict` (`ITEM_FROZEN_IN_STOCKTAKE`) unless valid Manager Override OTP is provided.

### Explicitly Out-of-Scope
- Audit table structural unification (`audit_log` vs `audit_logs`) — deferred to maintenance cleanup.
- External WhatsApp Cloud API transmission — remains internal simulated service (DEC-019).
- Customer-facing WhatsApp quote pre-authorization web portal — remains verbal/text per DEC-029.

---

## 3. Functional Requirements (The "WHAT")

### FR-004: Purchase Order Approval Ceiling & Dual-State Workflow (DEC-034)
- **FR-004.1:** When a purchase order is created via `POST /api/inventory/purchase-orders`, the backend must evaluate `total_amount`.
- **FR-004.2:** If `total_amount > 1000000` (10,000 EGP in piastres, or 10,000 EGP nominal if stored in EGP), the initial status MUST be set to `PENDING_APPROVAL`. If `<= 10000 EGP`, status may initialize to `ORDERED`.
- **FR-004.3:** Add endpoint `POST /api/inventory/purchase-orders/:id/approve`. Requires JWT role `MANAGER` or `ADMIN`. Upon approval, status transitions to `ORDERED`, records `approved_by` and `approved_at`, and emits synchronous audit log.
- **FR-004.4:** Attempting to transition a PO in `PENDING_APPROVAL` to `RECEIVED` without prior approval MUST be rejected with `HTTP 403 Forbidden` (`PO_APPROVAL_REQUIRED`).

### FR-005: Automated Shift-Close Non-Blocking Backup Trigger (DEC-002)
- **FR-005.1:** Upon successful execution of `POST /api/core/shifts/:id/close` (or equivalent shift closing route), the server must immediately invoke `backupService.createBackup()`.
- **FR-005.2:** Backup execution must be non-blocking (asynchronous via SQLite Online Backup API) so cashier handover response latency is not degraded.
- **FR-005.3:** A successful snapshot writes an audit log entry with action `SHIFT_CLOSE_BACKUP` and filename.
- **FR-005.4:** Execution and verification retire `RISK-008` from `Mitigating` to `Mitigated`.

### FR-006: Active Stocktake Cycle Count POS Defense (DEC-030)
- **FR-006.1:** During POS retail checkout (`POST /api/retail/sales`), items present in the cart are checked against active stocktake sessions where `is_frozen = 1`.
- **FR-006.2:** If a cart item is frozen, the server strictly returns `HTTP 409 Conflict` with error code `ITEM_FROZEN_IN_STOCKTAKE`.
- **FR-006.3:** Cashier may bypass the freeze ONLY if a valid `manager_override_token` is supplied in the checkout payload (verified via `SalesRepository.validateAndConsumeOverrideToken`), emitting an audit log entry.

---

## 4. Non-Functional Requirements (NFRs)

- **NFR-004 (Financial Precision):** All monetary thresholds and PO comparisons must operate with zero floating-point drift, respecting Constitution §1 Principle II.
- **NFR-005 (Response Latency):** Shift-close backup snapshot must complete in background or < 150ms on SSD so cashier is not delayed.
- **NFR-006 (Role-Based Access):** Only `SuperAdmin`, `Admin`, or `Manager` can approve high-value POs or generate override tokens; cashiers and technicians are rejected with `HTTP 403 Forbidden`.

---

## 5. Risk Retirement Matrix

| Requirement | Target Risk | Current Status | Target Status | Verification Vehicle |
|---|---|---|---|---|
| **FR-004** | Unauthorized Procurement Liability | Unmitigated (Live Bypass) | Enforced Invariant | Test Suite 69: High-value PO creation, non-manager approval block, 403 on receipt without approval |
| **FR-005** | **RISK-008** (Database corruption/loss on shift close) | **Mitigating (DEC-002)** | **Mitigated** | Test Suite 70: Shift close automatically generates verified SQLite snapshot and audit log |
| **FR-006** | Inventory Variance & Stocktake Contention | Open Invariant | Enforced Invariant | Test Suite 71: POS checkout rejected on frozen item; manager override token bypasses with audit |
