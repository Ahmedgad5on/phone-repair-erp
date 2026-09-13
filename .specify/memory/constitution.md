# System Constitution: Phone Repair Lab, Retail POS & Fintech ERP

**Document Version:** 1.0.2  
**Status:** Ratified (Owner Authorization: "Discovery complete" / "الحزمة معتمدة بشرط سطر واحد" / CA1 v1.0.2)  
**Ratification Date:** 2026-09-13  
**Canonical File:** `.specify/memory/constitution.md`  
**Governing Authorities:** DEC-001 through DEC-048  
**Scope:** Universal architectural, financial, operational, and development invariants for the entire repository.

---

## Preamble

This Constitution establishes the foundational laws, architectural constraints, and operational invariants governing the Mobile Phone Repair Lab, Point-of-Sale (POS), Spare Parts Wholesale, and Financial Services ERP system. All specifications, architecture decision records (ADRs), source code implementations, database schemas, code reviews, and automated verification suites MUST strictly comply with the principles ratified herein.

Where any specification, pull request, or development practice conflicts with this Constitution, this Constitution strictly prevails.

---

## Section 1: Core System Invariants (The Five Pillars)

### Principle I: Universal Integer-Piastre Precision (Financial Integrity)
1. **Zero Floating-Point Representation:** Floating-point arithmetic (`float`, `double`, or IEEE 754 representations) is strictly forbidden for representing or calculating any monetary value across client and server layers (`DEC-011`).
2. **Standard Base Unit:** All monetary amounts, line items, taxes, discounts, split payment tenders, installment schedules, technician commissions, and ledger balances MUST be stored and computed in integer piastres (`1 EGP = 100 Piastres`).
3. **Egyptian VAT Invariant:** Value Added Tax (standard 14% Egyptian VAT) MUST be calculated on an itemized integer basis with explicit distinction between taxable and tax-exempt lines (`DEC-009`).
4. **Rounding Policy:**
   - **Per-Item VAT:** Strictly round-half-up on integer piastres: `Math.round(piastres * 14 / 100)` (`DEC-009`).
   - **Installment Splits:** Strictly equal integer truncation (`Math.floor(total / months)`), with the entire remainder assigned to the final installment (`DEC-022`).

### Principle II: Double-Entry Balancing & Immutable Ledger (Accounting Core)
1. **Mathematical Invariant:** Every financial transaction impacting accounts MUST generate balanced double-entry journal records strictly satisfying:
   $$\sum \text{Debits} \equiv \sum \text{Credits}$$
   Transactions violating this identity MUST be rejected at the API and database boundary with HTTP 422 Unprocessable Entity.
2. **Posted Record Immutability:** Once a journal entry is posted, it becomes permanent, append-only, and immutable (deletion or mutation forbidden; HTTP 403 Forbidden). Any correction MUST be executed as a compensating counter-entry. Cryptographic hash-chaining is IMPLEMENTED in `audit_trail_immutable` (physical third table, origin: bootstrap Table 28 / Proposal 35, migrations.ts#L1001-L1014) via dual-write with `audit_logs` using `cryptoService.generateChainedHash()`. Primary financial ledger tables (journal_entries, wallet tables) remain UNCHAINED — cryptographic chaining there remains future hardening.
3. **Approval Hierarchies:**
   - **Customer Payments & Outflows:** Any financial disbursement or customer payout exceeding 5,000 EGP requires dual authorization, escalating from Cashier to Manager, with final sign-off by the ADMIN acting as functional Chief Financial Officer (`DEC-028`).
   - **Supplier Procurement:** Supplier Purchase Orders exceeding 10,000 EGP MUST remain in `PENDING_APPROVAL` until approved by MANAGER or ADMIN before transmission (`DEC-034`).
4. **Warranty Accounting:** Spare parts consumed during warranty repairs MUST NOT be charged to customers, but MUST be explicitly debited to a dedicated `WARRANTY EXPENSE` account to guarantee accurate gross margin accounting (`DEC-031`).

### Principle III: Local-First LAN Isolation & Full Durability (Physical Reality)
1. **Strict LAN Security Perimeter:** The ERP system is an on-premise, single-tenant local system. Zero remote or public internet ingress is permitted in v1 (`DEC-020`). All HTTP and WebSocket traffic MUST be filtered through `subnetAndDeviceGuard` restricting access to authorized local IP subnets and registered device tokens.
2. **Single-Branch Architecture:** The system baseline is strictly a single-branch operation. Multi-branch networking and inter-branch stock transfers are explicitly OUT-OF-SCOPE and frozen as non-active legacy code in v1 (`DEC-026`).
3. **Power-Failure Resilience:** In physical environments without automated USB-UPS signaling (`DEC-027`), the database engine MUST guarantee that committed transactions survive abrupt power loss. The database MUST operate with SQLite Write-Ahead Logging (WAL), foreign keys enabled, busy timeout set to 5000ms, and `PRAGMA synchronous = FULL` (`DEC-001`).
4. **Shift Handover & Disaster Recovery:**
   - Cashier shift close (`/api/core/shifts/close`) is the primary physical cash reconciliation checkpoint (`DEC-012`).
   - Closing every shift automatically and immediately triggers a full database snapshot (`DEC-002`), mirrored to external removable storage (path configurable, default `E:\ERP_Backups`) (`DEC-003`).
   - Automated retention enforces a rolling 30-day local backup window (`DEC-004`), verified by automated weekly `PRAGMA integrity_check` drills (`DEC-014`).
   - Backup failures MUST emit persistent visual dashboard alerts to Managers/Admins and insert warning entries into the audit trail (`DEC-015`).

### Principle IV: Non-Destructive, Forward-Only Migrations (Data Preservation)
1. **Schema Evolution:** All database schema changes MUST be forward-only and non-destructive (`DEC-006`).
2. **Migration Registry:** Every structural change MUST be encapsulated in an idempotent transaction recorded in `schema_migrations`.
3. **Zero Data Destruction:** `DROP TABLE`, `DROP COLUMN`, or destructive in-place schema rewrites of production data are strictly forbidden. Schema deprecations MUST introduce additive columns or replacement tables, providing backward-compatible views until formal decommissioning.

### Principle V: Evidence-Based Definition of Done & Forensic Auditability
1. **Automated Verification Baseline & Quality Gates:** No code change, architectural modification, or bug fix is complete without tests actually executed, with the run output shown in the Review Brief. Every new feature or task MUST ship its own automated tests. The regression test suite (159 passing test baseline across 66 suites) MUST maintain a 100% pass rate.
2. **Forensic Auditability & Cryptographic Chaining:** Any privileged, sensitive, or overriding action MUST synchronously write an append-only, immutable entry to `audit_logs` (deletion or mutation forbidden) capturing actor ID, client IP, action type, entity ID, before/after states, and non-empty justification (`DEC-024`). Cryptographic hash-chaining is IMPLEMENTED in `audit_trail_immutable` (physical third table, origin: bootstrap Table 28 / Proposal 35, migrations.ts#L1001-L1014) via dual-write with `audit_logs` using `cryptoService.generateChainedHash()`. Primary financial ledger tables (journal_entries, wallet tables) remain UNCHAINED — cryptographic chaining there remains future hardening.
3. **Mandatory Audit Triggers:**
   - Sales voids and returns (`DEC-021`).
   - Retail and cost price modifications (`DEC-024`).
   - Overriding locked/frozen items during active stocktaking (`DEC-030`).
   - Voiding repair warranty due to physical damage or liquid ingress (`DEC-033`).
   - Manual logging of customer estimate approval via WhatsApp text (`DEC-029`).
   - Purchase order approval or rejection actions (`DEC-034`).
   - Refusal of repair intake for devices flagged in the advisory Stolen IMEI Registry (`DEC-038`).
   - Salary or commission adjustments in HR Payroll (`DEC-040`).

---

## Section 2: Domain & Module Boundaries

### 2.1 Repair Lab Workflow & Contention Prevention
1. **State Machine Lifecycle:** Repair tickets strictly follow the as-built 6-stage lifecycle: `RECEIVED` (alias: `INTAKE`) → `DIAGNOSED` → `IN_REPAIR` → `QA` → `READY` → `DELIVERED`, with `CANCELLED` as the sole abort/terminal state (`server/src/modules/repair/repair.service.ts#L10-L32`). Customer quotation and estimate logging occur within `DIAGNOSED` before repair commencement.
2. **WhatsApp Quote Pre-Auth:** Quotes are dispatched to customers via WhatsApp; customer approvals received via text are manually logged by technicians in the ERP, maintaining zero external inbound web portals (`DEC-029`).
3. **Logical Parts Reservation:** Transitioning a ticket to `IN_REPAIR` MUST activate a logical `reserved_stock` allocation locking the required spare parts from POS checkout (`DEC-036`).
4. **Warranty Governance:** Repaired devices carry an auditable digital warranty certificate whose duration is configurable by part category in settings (defaults: 90 days for screens, 60 days for batteries, 30 days for other repairs/labor per `DEC-041`). Replaced components strictly inherit the remaining warranty duration of the original repair without renewal (`DEC-032`); if remaining warranty is < 3 days at delivery, a minimum 3-day testing grace applies (`DEC-041`). Warranty voiding requires Manager approval (`DEC-033`).

### 2.2 Point of Sale (POS) & Inventory Harmony
1. **Hardware Dispatch:** Thermal printing executes silent raw ESC/POS command dispatch via Electron IPC for 80mm printers (`DEC-016`). Barcode scanning operates via global HID interceptors (< 35ms threshold) (`DEC-017`). Cash drawers kick automatically on cash tender (`DEC-018`).
2. **Cycle Count Protection:** Items undergoing active physical stocktaking are placed in a temporary sales freeze (`DEC-023`). Any POS cart checkout attempting to consume frozen items MUST be rejected with HTTP 409 Conflict unless authorized via audited Manager override (`DEC-030`).
3. **Vendor Returns:** Defective inventory rejected by suppliers MUST be quarantined in `DEFECTIVE_SCRAP`, saleable only upon explicit Manager approval with recorded book loss (`DEC-035`).

### 2.3 Scope Invariants for M5 & M6
1. **HR Payroll (DEC-040):** Included in v1 to calculate technician commissions. Access is strictly restricted to MANAGER and ADMIN roles (HTTP 403 Forbidden). Any compensation override requires an audit entry. Legal compliance of payroll slips is an administrative responsibility.
2. **Stolen IMEI Registry (DEC-038):** Included in v1 as an internal, manually curated advisory list. It is NOT an official police registry and MUST NEVER auto-refuse service. Device refusal requires explicit Manager sign-off in the audit trail.
3. **AI Demand Forecasting (DEC-039):** Formally FROZEN as non-active in v1. Code remains dormant pending transaction volume accumulation in P2.

---

## Section 3: Error-Handling Philosophy

1. **Fail Loudly, Never Swallow:** Silent failure is strictly prohibited. Every error path MUST return a structured HTTP status code and a machine-readable payload `{ error: string, code?: string }`. Empty `catch` blocks or unhandled promise rejections are constitutional violations.
2. **Consolidated Error Boundaries:**
   - **HTTP 400 Bad Request:** Missing mandatory fields, empty justifications, or invalid OTP tender.
   - **HTTP 403 Forbidden:** Unauthorized role action (e.g. Cashier attempting expense approval or technician accessing HR payroll) or attempt to mutate posted accounting records.
   - **HTTP 409 Conflict:** Concurrency or state conflicts, including negative inventory guard rejections and sales checkout of items frozen in active cycle count.
   - **HTTP 422 Unprocessable Entity:** Accounting and financial balance failures (e.g., unbalanced double-entry debits $\neq$ credits) as well as invalid state machine transition requests.

---

## Section 4: Observability Standards

1. **Structured Logging Minimum:** Every HTTP request and critical background event MUST be logged with structured metadata: `timestamp`, `requestId`, `userId`, `clientIp`, `method`, `route`, `statusCode`, and `latencyMs`.
2. **Infrastructure Health Endpoints (M0):** `GET /api/health` and `GET /api/monitoring/metrics` MUST expose real-time database connectivity, SQLite WAL file size, active connection count, disk usage, and Node.js process memory.
3. **Critical Alert Routing (DEC-015):** Backup failures, corrupted backups (`integrity_check` failures), or missing external USB storage MUST immediately route persistent visual red banners to DashboardView for MANAGER and ADMIN roles, while synchronously logging a critical warning entry in the audit trail.

---

## Section 5: Coding Standards

1. **TypeScript Strict Mode:** All client and server TypeScript code MUST operate with strict compiler options enabled (`noImplicitAny: true`, `strictNullChecks: true`, `noUnusedLocals: true`).
2. **Lint & Quality Gates:** Zero ESLint errors or unresolved TypeScript compiler warnings are permitted on the main branch. Every pull request or feature task MUST include its own passing automated test suite.
3. **Naming Conventions:**
   - Components & Types: `PascalCase` (e.g. `RepairLabView`, `ImmutableAuditRecord`)
   - Functions & Variables: `camelCase` (e.g. `processReturn`, `reservedStock`)
   - Constants & Enums: `UPPER_SNAKE_CASE` (e.g. `ALLOWED_TRANSITIONS`, `STATUS_ALIASES`)
   - File Basenames (As-Built Dual Convention):
     - Middleware & Core Services: `kebab-case.ts` (e.g., `subnet-guard.ts`, `error-handler.ts`)
     - Module Routers & Services: `camelCase` + dot role suffix (e.g., `repair.service.ts`, `retail.router.ts`)
     - React Views & Components: `PascalCase.tsx` (e.g., `PosView.tsx`, `RepairLabView.tsx`)
     *(Note: File naming convention unification may be proposed later via a dedicated ADR; it is not mandated in v1)*.
4. **Strict Module Isolation:** Server modules in `server/src/modules/` MUST encapsulate their database models and expose functionality solely via explicit router endpoints and service functions. Direct cross-module SQL mutation of foreign domain tables is strictly forbidden.

---

## Section 6: Performance & Bundle Constraints

1. **Frontend Bundle Limits:** The production frontend bundle MUST NOT exceed:
   - Initial entry bundle: `index.js` $\le$ 80KB (`DEC-037`).
   - Asynchronous vendor/route chunks: $\le$ 500KB per chunk (`PROJECT.md#L10`).
   - Enforced by lazy-loading secondary views and modal dialogues.
2. **Query Latency:** SQLite queries under concurrent LAN operations (up to 10 stations) MUST complete within 50ms under typical operating loads (`DEC-007`).

---

## Section 7: Governance & Amendment Protocol

1. **Constitutional Primacy:** This document represents the supreme architectural law of the codebase. No team member, agent, or prompt instruction may bypass these rules.
2. **Amendment Procedure:**
   - Any proposed amendment MUST be submitted with an accompanying Architectural Decision Record (ADR) detailing the context, options considered, trade-offs, and data migration plan.
   - Amendments require explicit, written ratification by the Project Owner.
   - All amendments MUST increment the constitutional version and be recorded in the Amendment Log below.

---

## Section 8: Constitutional Amendment Log

| Version | Date | Author / Authority | Summary of Changes | Ratification Status |
|---|---|---|---|---|
| **1.0.0** | 2026-09-12 | Owner Ratification (Eng_Ahmed) | Ratified Foundation Constitution: "FINAL CONSTITUTION GATE: The diff is accepted in spirit; three corrections before ratification is final. Constitution v1.0.0 = RATIFIED" (F1–F4 applied). | **Ratified** |
| **1.0.1** | 2026-09-12 | Owner Ratification (Eng_Ahmed) | Owner-ratified amendment: Warranty Governance §2.1.4 updated to incorporate DEC-041 (configurable category durations + 3-day grace). Retroactively approved; logged after the fact — protocol reminder recorded. | **Ratified** |
| **1.0.2** | 2026-09-13 | Owner Ratification (Eng_Ahmed) | **Amendment 1.0.2 — Cryptographic Audit Reality Correction:**<br>1. Principle II.2 & V.2 are amended: cryptographic hash-chaining is IMPLEMENTED in `audit_trail_immutable` (physical third table, origin: bootstrap Table 28 / Proposal 35, migrations.ts#L1001-L1014) via dual-write with `audit_logs` using `cryptoService.generateChainedHash()`.<br>2. Primary financial ledger tables (journal_entries, wallet tables) remain UNCHAINED — cryptographic chaining there remains future hardening.<br>3. Glossary term #11 (Forensic Audit Log) is amended to describe the dual-write architecture: human-readable deltas in audit_logs + tamper-evident chain in audit_trail_immutable.<br>4. Version: 1.0.1 → 1.0.2. | **Ratified** |

---
**Version**: 1.0.2 | **Ratified**: 2026-09-13 (Owner Ratified) | **Last Amended**: 2026-09-13
