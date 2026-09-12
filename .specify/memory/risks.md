# Project Risk Register (Active Governance)

**Document Version:** 1.0.0  
**Status:** Active Living Document  
**Canonical Path:** `.specify/memory/risks.md`  
**Governing Authorities:** DEC-001 through DEC-043 | Constitution v1.0.1  
**Last Updated:** 2026-09-12  

---

> [!IMPORTANT]
> **Living Document Protocol & Update Rule:**  
> This register is an active, immutable-counter governance instrument maintained across the entire project lifecycle.  
> **Rule:** Every Review Brief must link touched `RISK-NNN` identifiers; risk statuses change only with verified, reproducible evidence. The `Mitigated` status is strictly reserved for verified, executed automated tests or certified audit sign-offs.

---

## Active Risk Register (11 Risks)

| Risk ID | Severity | Description | Mitigation | Status | Source |
|---|---|---|---|---|---|
| **RISK-001** | High | Divergence between existing code implementation and written architectural specifications across discovery rounds | Comprehensive project report completed (`project-comprehension.md`); protocol ratified; full cross-artifact audit scheduled as Phase 3 begins | **Mitigating** | `project-comprehension.md` |
| **RISK-002** | High | Multi-station POS retail checkout and digital wallet balance concurrency race conditions | Enforce SQLite `BEGIN IMMEDIATE` transaction boundaries, optimistic concurrency version checks on accounts/items, and database-level `CHECK` constraints | **Mitigating** | `PROJECT.md#L8` |
| **RISK-003** | Medium | Frontend JavaScript bundle size bloat exceeding the Vite 500KB chunk budget and 80KB entry target | Route-based and modal-level code-splitting via `React.lazy`; manual chunking in `client/vite.config.ts`; automated build-time bundle budget assertions (< 80KB `index.js`, < 500KB vendor chunks per `ADR-037`) | **Mitigating** | `PROJECT.md#L10`, `PROJECT.md#L63` |
| **RISK-004** | High | Unauthorized financial mutation, cashier discount manipulation, or voided sale without audit justification | Enforce synchronous append-only audit trail in `audit_log` with HTTP 400 Bad Request on empty reason; role-based access control (RBAC) restricting voids and price edits to MANAGER/ADMIN | **Mitigating** | `PROJECT.md#L39` |
| **RISK-005** | High | Amendment log pollution and architectural drift if unpopulated SpecKit template is treated as an amended document | Clean replacement and ratification of unified System Constitution v1.0.0 (amended to v1.0.1) in `.specify/memory/constitution.md` with explicit Section 8 amendment logging protocol | **Mitigating** | User Directive / `AMB-012` |
| **RISK-006** | Medium | SQLite PRAGMA contention, lockouts, or configuration drift if PRAGMA statements are called decentrally across call sites | Centralize all SQLite PRAGMAs (`WAL`, `foreign_keys = ON`, `synchronous = FULL`, `busy_timeout = 5000`) exclusively within the single database factory connection in `server/src/db/database.ts#L15-L20` | **Mitigating** | `server/src/db/database.ts` |
| **RISK-007** | Critical | Irrecoverable loss of committed retail sales and repair ticket data on sudden shop power loss when running `synchronous = NORMAL` | Mandate `PRAGMA synchronous = FULL` in SQLite WAL mode via ADR-001 / DEC-001, forcing physical fsync flushes to persistent disk before transaction commit confirmation. Verified in Test Suite 52 asserting `synchronous === 2`. | **Mitigated** | FIX-6 Decision / `ADR-001` |
| **RISK-008** | High | Database corruption, file system bitrot, or primary host drive failure without verified external backups | Immediate automated snapshot on shift close (`/shifts/close`), midnight safety backup, external USB drive mirroring (`E:\\ERP_Backups`), weekly automated `PRAGMA integrity_check` drills, and persistent red visual alerts on failure | **Mitigating (DEC-002, via ADR-002/003/014/015)** | `server/src/services/backup.service.ts` |
| **RISK-009** | High | Legal and tax exposure from local offline e-invoices (cryptographic QR and UUID hash generation without live ETA server synchronization) | Independent legal/tax accountant review required to verify Egyptian e-receipt compliance for local offline operations with batch transmission. **Action Owner: HUMAN (Shop Owner & External Certified Accountant — outside the repo boundary)** | **Open** | User Directive (Q19 review) / `DEC-008` |
| **RISK-010** | High | Spare part contention race condition between lab technician repair allocation and POS retail cashier checkout | Enforce logical stock reservation (`reserved_quantity` column + DB `CHECK (stock_quantity >= reserved_quantity)` + `CHECK (reserved_quantity >= 0)`) upon `IN_REPAIR`, release on `CANCELLED`, physical deduction and reservation clearance on `DELIVERED` (DEC-036 / ADR-036), and POS retail check on `availableStock = stock - reserved` with HTTP 409 Conflict. Mitigated per risks.md lifecycle: evidenced by verbatim passing output in Test Suite 68. | **Mitigated** | `server/src/modules/repair/repair.router.ts#L652` |
| **RISK-011** | High | LAN perimeter middleware default-allow defeats `trusted_devices` token gate for unregistered LAN devices | Refactor `subnetAndDeviceGuard` to enforce strict subnet whitelist (DEC-020, DEC-043) and mandatory `x-device-token`, returning HTTP 403 Forbidden by default. Verified in Test Suite 67 (WAN IP, non-ratified subnet, missing token, unregistered token). | **Mitigated** | `server/src/middleware/subnet-guard.ts` |

---

## Status Definitions & Lifecycle Rules

1. **Open:** The risk has been identified and ratified, but the mitigation strategy requires external human action outside the repository.
   - `RISK-009`: Requires external certified accountant consultation (Action Owner: HUMAN).
2. **Mitigating:** An architectural decision (ADR) and technical design have been formally ratified, and the implementation/verification is actively tracked in the implementation plan (includes technical tasks like RISK-011 whose design is ratified via ADR-020 pending test verification).
3. **Mitigated:** The technical mitigation has been implemented in code and verified by automated tests running in CI, or certified by official external documentation. Status cannot transition to `Mitigated` without citation of passing test suite execution or written human sign-off.
