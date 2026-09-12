# Tasks: Warranty Governance, Voiding Authorization & Defective Parts Lifecycle

**Feature Dir:** `specs/003-warranty-governance-lifecycle`  
**Spec Reference:** `specs/003-warranty-governance-lifecycle/spec.md`  
**Plan Reference:** `specs/003-warranty-governance-lifecycle/plan.md`  
**Status:** In Progress / Batch 1 Pending Execution  
**Last Updated:** 2026-09-12  

---

## Task List & Execution Status

| Task ID | Priority | Description | Target Files | Dependencies | Status | Completed Date | Verification & Commit |
|---|---|---|---|---|---|---|---|
| **TASK-3.1** | `P1` | Test-Run Backup Isolation & Catalogue Hygiene (`NFR-004`) | `server/src/services/backup.service.ts`, `server/test/api.test.ts` | None | **TODO** | - | Test Suite 76 asserts test backups are isolated in scratch directory without polluting production catalogue. |
| **TASK-3.2** | `P0` | Warranty Duration Matrix, Window Inheritance & 3-Day Grace (`DEC-041`, `DEC-032`, `FR-007`) | `server/src/db/migrations/014_add_warranty_governance_columns.ts`, `server/src/modules/repair/repair.service.ts`, `server/test/api.test.ts` | Soft-ordered after TASK-3.1 | **TODO** | - | Test Suite 72 (5 passing vectors). Category-based duration + inheritance + 3-day grace policy. |
| **TASK-3.3** | `P0` | Warranty Void Authorization RBAC & Photo Evidence Engine (`DEC-033`, `DEC-042`, `FR-008`) | `server/src/modules/repair/repair.router.ts`, `server/src/services/audit.service.ts`, `server/test/api.test.ts` | TASK-3.2 | **TODO** | - | Test Suite 73 (4 passing vectors). Manager RBAC + Mandatory Photo + SHA-256 hash + audit log. |
| **TASK-3.4** | `P0` | Warranty Parts Operating Expense Tracking (`DEC-031`, `FR-009`) | `server/src/modules/repair/repair.service.ts`, `server/src/repositories/fintech.repository.ts`, `server/test/api.test.ts` | TASK-3.2 | **TODO** | - | Test Suite 74 (3 passing vectors). Zero customer charge (0 piastres), debits acc-5040 (Warranty Expense), credits acc-1040 (Spare Parts Inventory). |
| **TASK-3.5** | `P1` | Rejected Supplier Returns to `DEFECTIVE_SCRAP` & Liquidation Gate (`DEC-035`, `FR-010`) | `server/src/modules/procurement/procurement.router.ts`, `server/src/modules/inventory/inventory.router.ts`, `server/test/api.test.ts` | None | **TODO** | - | Test Suite 75 (3 passing vectors). Add RTV reject route `POST /api/procurement/rtv/:id/reject` to transition to DEFECTIVE_SCRAP, POS rejects with 409, Manager liquidates. |
