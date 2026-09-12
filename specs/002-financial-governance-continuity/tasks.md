# Tasks: Financial Governance & Operational Continuity

**Feature Dir:** `specs/002-financial-governance-continuity`  
**Spec Reference:** `specs/002-financial-governance-continuity/spec.md`  
**Plan Reference:** `specs/002-financial-governance-continuity/plan.md`  
**Status:** Completed & Ratified  
**Last Updated:** 2026-09-12  

---

## Task List & Execution Status

| Task ID | Priority | Description | Target Files | Dependencies | Status | Completed Date | Verification & Commit |
|---|---|---|---|---|---|---|---|
| **TASK-2.1** | `P0` | Purchase Order Approval Ceiling & Workflow (`DEC-034`, `FR-004`) | `server/src/modules/spare-parts/spare-parts.router.ts`, `server/src/modules/procurement/procurement.router.ts`, `server/src/db/migrations/012_add_po_approval_columns.ts`, `server/test/api.test.ts` | None | **DONE** | 2026-09-12 | Test Suite 69 (14 passing assertions). Commits `5d5ef64`, `4a51286`. |
| **TASK-2.2** | `P0` | Shift-Close Backup Trigger & `RISK-008` Retirement (`DEC-002`, `FR-005`, `DEC-044`) | `server/src/modules/core/core.router.ts`, `server/src/services/backup.service.ts`, `server/test/api.test.ts` | None | **DONE** | 2026-09-12 | Test Suite 70 (7 passing assertions). Retires `RISK-008` to Mitigated. Commits `5d5ef64`, `4a51286`. |
| **TASK-2.3** | `P0` | Stocktake POS Contention Defense & Canonical Override (`DEC-023`, `DEC-030`, `FR-006`) | `server/src/db/migrations/013_add_stocktake_freeze.ts`, `server/src/repositories/inventory.repository.ts`, `server/src/modules/retail/retail.router.ts`, `server/src/modules/inventory/inventory.router.ts`, `server/test/api.test.ts` | TASK-2.1 | **DONE** | 2026-09-12 | Test Suite 71 (22 passing assertions). Commits `9222cf9`, `6948e51`. |
