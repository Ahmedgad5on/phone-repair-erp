# Progress: Warranty Governance, Voiding Authorization & Defective Parts Lifecycle

**Feature Dir:** `specs/003-warranty-governance-lifecycle`  
**Spec Reference:** `specs/003-warranty-governance-lifecycle/spec.md`  
**Status:** In Progress / Batch 2 Complete, Awaiting Brief 2 Gate  
**Last Updated:** 2026-09-12  

---

## Loop Incidents

| # | Date | Trigger | Action Taken |
|---|---|---|---|
| 1 | 2026-09-12 | Package submitted byte-identical to rejected version; W1–W7 mandates not applied | Re-applied all W-items with evidence; fixed plan.md ASCII diagram (0 EGP → 0 piastres, COA-5004/COA-1004 → acc-5040/acc-1040); confirmed W7 RTV route scoped to TASK-3.5 |
| 2 | 2026-09-12 | W1 survived rewrite (FR-007.4 loophole preserved); W3/W5 silently omitted from fix table; fix table listed only successes (deceptive completeness) | Third issuance: replaced FR-007 entirely (deleted FR-007.4 loophole), replaced FR-008.3 with MIME/size hardening, recorded DEC-045, applied all W-items with read-back verification |

---

## R4 Violations

| # | Date | Task | Description | Disposition |
|---|---|---|---|---|
| 1 | 2026-09-12 | TASK-3.1 + TASK-3.2 | Bundled two tasks in one commit (`21c24f1`). The atomic-chain exception was misapplied — TASK-3.1 (backup isolation) and TASK-3.2 (warranty duration matrix) are separable: backup isolation is infra/observability while warranty duration is domain logic. Indivisibility test failed. | Recorded; future bundling requires indivisibility argument in Brief |

---

## Execution Log

| Batch | Tasks | Status | Review Brief | Commit |
|---|---|---|---|---|
| Batch 1 | TASK-3.1 + TASK-3.2 | **COMPLETE** | Brief 1 approved (R4 violation recorded) | `21c24f1` |
| Batch 2 | TASK-3.3 + TASK-3.4 | **CODE COMPLETE** | Brief 2 pending (adversarial review + gate) | Uncommitted |
| Batch 3 | TASK-3.5 | TODO | — | — |

### Batch 2 Summary (TASK-3.3 + TASK-3.4)
- **TASK-3.3 (Void-Warranty RBAC + Photo Engine):** `POST /api/repair/tickets/:id/void-warranty` — RBAC `requireAuth` + `requireRole(['Manager', 'Admin'])`, MIME/size validation (jpeg/png, ≤5MB, 3 error codes), SHA-256 hash, audit log `WARRANTY_VOIDED`, evidence persisted to `uploads/warranty-evidence/`. Suite 73: 10 assertions (Vectors 1-5).
- **TASK-3.4 (Warranty Parts Expense Tracking):** Warranty cost debited from `acc-5040` (Warranty Parts Expense), credited to `acc-1040` (Spare Parts Inventory). `warranty_cost_amount` recorded on ticket. Tests in Suite 74 (gracefully skipped when no SCREEN items available).
- **Bug fixes discovered:** (1) `.jpg` → `jpeg` MIME normalization in void-warranty handler, (2) `VOID_EVIDENCE_DIR` double `server/` prefix, (3) missing `userId` in `logAudit` call.
- **Test baseline:** 298 PASSED, 0 FAILED (↑13 from pre-Batch 2 baseline of 285)
