# Tasks: Foundation Hardening (Ratified Invariants Enforcement)
 
**Feature Dir:** `specs/001-foundation-hardening`  
**Spec Reference:** `specs/001-foundation-hardening/spec.md`  
**Plan Reference:** `specs/001-foundation-hardening/plan.md`  
**Status:** Completed & Ratified  
**Last Updated:** 2026-09-12  

---

## Task List & Execution Status

| Task ID | Priority | Description | Target Files | Dependencies | Status | Completed Date | Verification & Commit |
|---|---|---|---|---|---|---|---|
| **TASK-1.1** | `P0` | Centralize SQLite Durability & Enforce `synchronous = FULL` | `server/src/db/database.ts`, `server/test/api.test.ts` | None | **DONE** | 2026-09-12 | Test Suite 52 asserts `synchronous === 2`. Commit `8132a57`. |
| **TASK-1.2** | `P0` | Subnet Guard Default-DENY & Workstation Token Gate (DEC-043) | `server/src/middleware/subnet-guard.ts`, `server/src/db/seed.ts`, `server/src/index.ts`, `server/test/api.test.ts` | TASK-1.1 | **DONE** | 2026-09-12 | Test Suite 67 (8 passing vectors). Commit `54c190a`. |
| **TASK-1.3** | `P0` | Database Schema Migration for `items.reserved_quantity` & CHECK constraints | `server/src/db/migrations/011_add_reserved_quantity_to_items.ts`, `server/src/db/migrations/index.ts`, `server/src/db/migrations.ts` | TASK-1.1 | **DONE** | 2026-09-12 | Migration 11 applied; DB CHECK constraint rejects `reserved > stock` and negative reservation. Commit `d7a187e`. |
| **TASK-1.4** | `P0` | Repair Intake Stock Reservation & Double Lifecycle Integration (`IN_REPAIR`, `DELIVERED`, `CANCELLED`) | `server/src/modules/repair/repair.service.ts`, `server/src/modules/repair/repair.router.ts` | TASK-1.3 | **DONE** | 2026-09-12 | Asymmetric double lifecycle verified in Test Suite 68 vectors (c).1-(c).10. Commit `d7a187e`. |
| **TASK-1.5** | `P0` | POS Retail Checkout Contention Defense (HTTP 409) & Test Suite 68 | `server/src/modules/retail/retail.router.ts`, `server/test/api.test.ts` | TASK-1.4 | **DONE** | 2026-09-12 | Test Suite 68 (19 assertions) passing. POS returns HTTP 409 on contention. Commit `d7a187e`. |
