# Technical Implementation Plan: Financial Governance & Operational Continuity

**Document Version:** 1.0.0  
**Status:** Draft / Pending Owner Approval  
**Plan Path:** `specs/002-financial-governance-continuity/plan.md`  
**Specification Reference:** `specs/002-financial-governance-continuity/spec.md`  
**Target Milestone:** Phase 3 — Milestone 2  
**Target Git Branch:** `feature/002-financial-governance-continuity`  
**Governing Architecture:** Constitution v1.0.1 | DEC-002, DEC-028, DEC-030, DEC-034 | ADR-002, ADR-030, ADR-034  

---

## 1. Architectural Blueprint per Item

```text
       +--------------------------------------------------------------------------------+
       |             FEATURE 002: FINANCIAL GOVERNANCE & CONTINUITY                     |
       |                                                                                |
       |  [ITEM 1: PO APPROVAL CEILING (DEC-034)]                                       |
       |  POST /api/spare-parts/purchase-orders                                         |
       |          |                                                                     |
       |          |-- total_amount > 10,000 EGP? ---> Status = 'PENDING_APPROVAL'       |
       |          |                                          |                          |
       |          |                                 Warehouse Receipt Attempt           |
       |          |                                          |                          |
       |          |                                 403 Forbidden (Blocked)             |
       |          |                                          |                          |
       |          |                                 POST /purchase-orders/:id/approve   |
       |          |                                 (Manager/Admin JWT Required)        |
       |          |                                          v                          |
       |          \-- total_amount <= 10,000 EGP ---> Status = 'ORDERED'                |
       |                                                     |                          |
       |                                            Warehouse Receipt Allowed           |
       |                                                                                |
       |  [ITEM 2: SHIFT-CLOSE BACKUP TRIGGER (DEC-002 / RISK-008 RETIREMENT)]          |
       |  POST /api/core/shifts/close                                                   |
       |          |                                                                     |
       |          +---> Cash Variance Handover Settled                                  |
       |          +---> Non-blocking async invoke: backupService.createBackup()         |
       |          \---> Emit audit_log: SHIFT_CLOSE_BACKUP (RISK-008 -> Mitigated)      |
       |                                                                                |
       |  [ITEM 3: STOCKTAKE POS CONFLICT DEFENSE (DEC-030)]                            |
       |  POST /api/retail/sales (Cart Checkout)                                        |
       |          |                                                                     |
       |          +-- Item in active stocktake (is_frozen = 1)?                         |
       |                 |-- No manager_override_token  ---> 409 Conflict (Blocked)     |
       |                 \-- Valid Manager Override OTP ---> ALLOW + Audit Log Event    |
       +--------------------------------------------------------------------------------+
```

---

## 2. Dependency-Ordered Task Breakdown (≤ 2h Granularity)

| Task ID | Priority | Description & Scope | Dependencies | Est. Time | Verification / Test Pass Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TASK-2.1** | `P0` | **Purchase Order Approval Ceiling & Workflow (`DEC-034`, `FR-004`)**<br>Refactor PO creation in `spare-parts.router.ts` (and `procurement.router.ts`) to initialize status as `PENDING_APPROVAL` when `total_amount > 10000` EGP (or 1,000,000 piastres). Add endpoint `POST /purchase-orders/:id/approve` requiring `MANAGER` or `ADMIN`. Guard receipt route `POST /purchase-orders/:id/receive` to block unapproved POs with `HTTP 403 Forbidden`. Add Test Suite 69. | None | 1.5h | Test Suite 69: (1) PO > 10k EGP sets status `PENDING_APPROVAL`, (2) Receipt without approval rejected with 403, (3) Non-manager approval rejected with 403, (4) Manager approval succeeds and allows receipt. |
| **TASK-2.2** | `P0` | **Shift-Close Backup Trigger & `RISK-008` Retirement (`DEC-002`, `FR-005`)**<br>Wire `backupService.createBackup()` directly into `POST /api/core/shifts/close`. Ensure execution is non-blocking. Log `SHIFT_CLOSE_BACKUP` in `audit_log`. Add Test Suite 70. | None | 1.0h | Test Suite 70: Closing a shift triggers immediate SQLite backup snapshot creation and audit log entry. Verifiable file on disk. Retires `RISK-008` to `Mitigated`. |
| **TASK-2.3** | `P0` | **Stocktake POS Contention Defense & Manager Override (`DEC-030`, `FR-006`)**<br>Add `is_frozen` tracking to active cycle count sessions in `stock_counts` / `items`. Update `POST /api/retail/sales` cart validation to check if any item is frozen. Reject with `HTTP 409 Conflict` (`ITEM_FROZEN_IN_STOCKTAKE`) unless valid `manager_override_token` is supplied. Add Test Suite 71. | TASK-2.1 | 1.5h | Test Suite 71: (1) Active count freezes item, (2) POS checkout rejected with 409, (3) Invalid override token rejected, (4) Valid Manager override token permits sale with audit log entry. |

---

## 3. Forced Review Checkpoints & Batching Rule

In accordance with [CONTRIBUTING.md Section 2.3](file:///c:/Users/Eng_Ahmed/Desktop/pro/CONTRIBUTING.md#L72-L79):
- **Batch 1 (Financial Governance & Operational Continuity):** Execute **TASK-2.1** + **TASK-2.2** $\to$ **STOP for Adversarial Review Brief 1**.
- **Batch 2 (Inventory Integrity & Contention Defense):** Execute **TASK-2.3** $\to$ **STOP for Adversarial Review Brief 2**.

---

## 4. Adversarial Test Plan

- **Test Suite 69 (PO Approval Ceiling):**
  - Vector 1: Attempt to create 15,000 EGP PO $\to$ status must be `PENDING_APPROVAL`.
  - Vector 2: Attempt to receive 15,000 EGP PO while in `PENDING_APPROVAL` $\to$ `HTTP 403 Forbidden`.
  - Vector 3: Cashier/Technician attempts to call `/purchase-orders/:id/approve` $\to$ `HTTP 403 Forbidden`.
  - Vector 4: Manager approves PO $\to$ status transitions to `ORDERED`, audit entry emitted, warehouse receipt succeeds.
- **Test Suite 70 (Shift-Close Backup):**
  - Vector 1: Cashier closes shift via `POST /api/core/shifts/close` $\to$ `backupService.createBackup()` produces timestamped `.db` file in `server/backups/`.
  - Vector 2: Audit log records `SHIFT_CLOSE_BACKUP` with filename and byte size.
- **Test Suite 71 (Stocktake Freeze & Manager Override):**
  - Vector 1: Initiate cycle count session marking item frozen $\to$ POS sale checkout returns `HTTP 409 Conflict`.
  - Vector 2: POS sale checkout with valid Manager override OTP consumes OTP and completes sale (`HTTP 201 Created`).
