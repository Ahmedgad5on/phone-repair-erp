# Technical Implementation Plan: Warranty Governance, Voiding Authorization & Defective Parts Lifecycle

**Document Version:** 1.0.0  
**Status:** Draft / Pending Owner Review  
**Plan Path:** `specs/003-warranty-governance-lifecycle/plan.md`  
**Specification Reference:** `specs/003-warranty-governance-lifecycle/spec.md`  
**Target Milestone:** Phase 3 — Milestone 3  
**Governing Architecture:** Constitution v1.0.1 | DEC-031, DEC-032, DEC-033, DEC-035, DEC-041, DEC-042 | ADR-031, ADR-032, ADR-033, ADR-035, ADR-041, ADR-042  
**Target Git Branch:** `feature/003-warranty-governance-lifecycle`  
**Created:** 2026-09-12  

---

## 1. Architectural Blueprint

```text
       +-----------------------------------------------------------------------------------------+
       |             FEATURE 003: WARRANTY GOVERNANCE & DEFECTIVE PARTS LIFECYCLE                |
       |                                                                                         |
       |  [ITEM 1: DURATION MATRIX & WINDOW INHERITANCE (DEC-041, DEC-032)]                      |
       |  Ticket Completed (DELIVERED)                                                           |
       |          |                                                                              |
       |          +--> Part Category Evaluation: Screen: 90d | Battery: 60d | Other: 30d         |
       |          +--> Warranty Claim / Rework Opened:                                           |
       |                 |-- Inherits original expiry date (no reset to 90d)                     |
       |                 \-- If remaining < 3 days ---> minimum 3-day testing grace enforced    |
       |                                                                                         |
       |  [ITEM 2: WARRANTY VOID AUTHORIZATION & PHOTO STORAGE (DEC-033, DEC-042)]               |
       |  POST /api/repair/tickets/:id/void-warranty                                            |
       |          |                                                                              |
       |          |-- Role != MANAGER / ADMIN? ---> HTTP 403 Forbidden (Blocked)                 |
       |          |-- Missing photo evidence? ---> HTTP 400 Bad Request (Mandatory Photo)       |
       |          \-- Authorized Manager + Photo Attached:                                       |
       |                 +--> Save to: server/uploads/warranty-evidence/<id>-<ts>.png            |
       |                 +--> Compute SHA-256 hash (Zero DB BLOB bloat; RPO=0 preserved)         |
       |                 +--> Update ticket: voided, path, hash, manager_id, timestamp           |
       |                 \--> Emit audit_log: WARRANTY_VOIDED with real manager ID               |
       |                                                                                         |
       |  [ITEM 3: WARRANTY PARTS OPERATING EXPENSE ACCOUNTING (DEC-031)]                        |
       |  Part Consumed on Warranty Repair (is_warranty = 1)                                     |
       |          |                                                                              |
       |          +--> Customer Charge = 0 EGP                                                   |
       |          \--> Post General Ledger:                                                      |
       |                 Debit:  WARRANTY_EXPENSE (COA-5004)                                     |
       |                 Credit: INVENTORY_ASSET  (COA-1004)                                     |
       |                                                                                         |
       |  [ITEM 4: REJECTED SUPPLIER RETURNS DISPOSITION (DEC-035)]                              |
       |  POST /api/procurement/rtv/:id/reject                                                   |
       |          |                                                                              |
       |          +--> Transition to 'DEFECTIVE_SCRAP' status                                    |
       |          +--> POS Checkout Blocked (409 Conflict)                                       |
       |          \--> Liquidation requires Manager Authorization (POST /scrap/liquidate)        |
       |                                                                                         |
       |  [ITEM 5: TEST-RUN BACKUP ISOLATION (NFR-004)]                                          |
       |  NODE_ENV=test redirects snapshots to server/backups/test_scratch/ (auto-purged)        |
       +-----------------------------------------------------------------------------------------+
```

---

## 2. Delta Table Target-State Mapping for Bundled Decisions

| DEC ID | Architectural Decision | Discovery As-Built State | Target As-Decided State (Feature 003) | Target Implementation Vehicle |
|---|---|---|---|---|
| **DEC-031** | Warranty Parts Expense | Absorbed into ticket repair cost (`repair.router.ts#L663`) | Post discrete debit to `WARRANTY_EXPENSE` (`COA-5004`) and credit `INVENTORY_ASSET` on warranty ticket completion | `repair.service.ts`, `journal_entries` |
| **DEC-032** | Warranty Window | Code lacks explicit window inheritance | Replaced warranty part inherits remaining original repair window; resets are blocked | `repair.service.ts` |
| **DEC-033** | Warranty Void Authority | Technician could modify status without check | Warranty voiding restricted strictly to `MANAGER` / `ADMIN` with HTTP 403 enforcement | `repair.router.ts` |
| **DEC-035** | Rejected Supplier Returns | Only GRN rollback exists (`procurement.router.ts#L130`) | Supplier rejection transitions items to `DEFECTIVE_SCRAP`; POS blocked; manager liquidation gate | `procurement.router.ts` |
| **DEC-041** | Warranty Durations & Grace | Static hardcoded 30-day warranty | Category-driven durations (90d screens / 60d batteries / 30d others) + 3-day minimum testing grace | `repair.service.ts` |
| **DEC-042** | Warranty Void Evidence | Text reason only, no evidence requirement | Mandatory photo evidence saved to filesystem + SHA-256 hash in DB + synchronous audit trail | `repair.router.ts`, `server/uploads/warranty-evidence/` |

---

## 3. Storage & Integrity Architecture for DEC-042

### Concrete Home for Photographic Evidence:
- **Filesystem Directory:** `server/uploads/warranty-evidence/` (isolated, created at startup if missing, git-ignored).
- **Naming Pattern:** `<ticket_id>-<timestamp>.<ext>` (e.g. `rep-a1b2c3-1726118400000.jpg`).
- **Database Storage Model:**
  - `repair_tickets.warranty_void_reason TEXT`
  - `repair_tickets.warranty_void_evidence_path TEXT`
  - `repair_tickets.warranty_void_evidence_hash TEXT` (SHA-256 integrity hash)
  - `repair_tickets.warranty_void_approved_by TEXT REFERENCES users(id)`
  - `repair_tickets.warranty_void_approved_at TEXT`
- **Architectural Trade-Off Rationale:**
  - Storing multi-megabyte photo binaries directly inside SQLite tables as raw `BLOB`s violates Constitution §III.3 and SQLite WAL durability guarantees: it severely bloats the write-ahead log, degrades transaction throughput, and inflates shift-close backup duration beyond the sub-second RPO=0 requirement mandated by ADR-002.
  - Storing images on the filesystem with SHA-256 tamper-evident integrity hashes in the database satisfies both forensic auditability and high-speed database performance.

---

## 4. Dependency-Ordered Task Breakdown (≤ 2h Granularity)

| Task ID | Priority | Description & Scope | Dependencies | Est. Time | Verification / Test Pass Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TASK-3.1** | `P1` | **Test-Run Backup Isolation & Catalogue Hygiene (`NFR-004`)**<br>Refactor `backup.service.ts` to detect test executions (`NODE_ENV=test`) and redirect ephemeral test snapshots to `server/backups/test_scratch/` with automated pruning upon runner teardown. Prune accumulated snapshots. | None | 0.5h | Test Suite 76 asserts production catalogue remains unpolluted while backup engine functions normally. |
| **TASK-3.2** | `P0` | **Warranty Duration Matrix, Window Inheritance & 3-Day Grace (`DEC-041`, `DEC-032`, `FR-007`)**<br>Add schema migration `014_add_warranty_governance_columns.ts`. Implement category-based duration calculation in `repair.service.ts` (90d screens / 60d batteries / 30d others). Implement original window inheritance for rework tickets with 3-day minimum testing grace policy. Add Test Suite 72. | TASK-3.1 | 1.5h | Test Suite 72: (1) Screen repair gets 90d warranty, (2) Battery gets 60d, (3) Rework ticket inherits remaining window without reset, (4) <3 days left extends with 3-day grace, (5) Expired window rejected. |
| **TASK-3.3** | `P0` | **Warranty Void Authorization RBAC & Photo Evidence Engine (`DEC-033`, `DEC-042`, `FR-008`)**<br>Implement `POST /api/repair/tickets/:id/void-warranty`. Restrict to `MANAGER` / `ADMIN` with HTTP 403. Require non-empty photo evidence with HTTP 400. Save image to `server/uploads/warranty-evidence/`, compute SHA-256 hash, update ticket columns, emit synchronous `WARRANTY_VOIDED` audit log with manager actor ID. Add Test Suite 73. | TASK-3.2 | 1.5h | Test Suite 73: (1) Tech rejected with 403, (2) Voiding without photo rejected with 400, (3) Manager with photo succeeds, saves image, records hash and real manager ID in audit log. |
| **TASK-3.4** | `P0` | **Warranty Parts Operating Expense Tracking (`DEC-031`, `FR-009`)**<br>Ensure `COA-5004` (`Warranty Expense`) exists in chart of accounts. When parts are consumed on a warranty ticket, post debit to `WARRANTY_EXPENSE` and credit to `INVENTORY_ASSET`. Ensure ticket invoice total remains 0 EGP for customer. Add Test Suite 74. | TASK-3.2 | 1.5h | Test Suite 74: Warranty repair consuming 500 EGP screen writes 0 EGP invoice to customer, generates journal entry lines debiting WARRANTY_EXPENSE and crediting INVENTORY_ASSET. |
| **TASK-3.5** | `P1` | **Rejected Supplier Returns to `DEFECTIVE_SCRAP` & Liquidation Gate (`DEC-035`, `FR-010`)**<br>In `procurement.router.ts`, update RTV rejection endpoint to transition items to `status = 'DEFECTIVE_SCRAP'`. Reject POS sale of scrap with HTTP 409. Add manager salvage sale endpoint `POST /api/inventory/scrap/liquidate`. Add Test Suite 75. | None | 1.0h | Test Suite 75: (1) RTV rejection marks item DEFECTIVE_SCRAP, (2) POS checkout rejected with 409, (3) Manager liquidation authorizes sale with audit log. |

---

## 5. Forced Review Checkpoints & Batching Rule

In strict adherence to [CONTRIBUTING.md Section 2.3](file:///c:/Users/Eng_Ahmed/Desktop/pro/CONTRIBUTING.md#L72-L79):
- **Batch 1 (Operational Hygiene & Warranty Policy Setup):**
  - **TASK-3.1** (Test-Run Backup Isolation) + **TASK-3.2** (Warranty Durations & Grace Policy)
  - $\to$ **STOP for Mandatory Subagent Review & Review Brief 1**.
- **Batch 2 (Fraud Defense & Financial Ledger Accounting):**
  - **TASK-3.3** (Warranty Voiding RBAC & Photo Evidence) + **TASK-3.4** (Warranty Parts Operating Expense Accounting)
  - $\to$ **STOP for Mandatory Subagent Review & Review Brief 2**.
- **Batch 3 (Supplier Return Scrap Disposition & Closure):**
  - **TASK-3.5** (Rejected Supplier Returns to Scrap & Liquidation)
  - $\to$ **STOP for Mandatory Subagent Review & Review Brief 3** $\to$ Merge to `main`.
