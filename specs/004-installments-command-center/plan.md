# Technical Implementation Plan: Installments Collections Command Center

**Document Version:** 1.0.0  
**Status:** Draft / Pending Wave Gate Review  
**Plan Path:** `specs/004-installments-command-center/plan.md`  
**Specification Reference:** `specs/004-installments-command-center/spec.md`  
**Target Milestone:** Phase 3 — Wave: Profitability & Collections (Feature 004)  
**Governing Architecture:** Constitution v1.0.2 | DEC-011, DEC-022, DEC-028, DEC-046 | ADR-022  
**Target Git Branch:** `feature/004-installments-command-center`  
**Created:** 2026-09-13  

---

## 1. Architectural Blueprint

```text
       +-----------------------------------------------------------------------------------------+
       |             FEATURE 004: INSTALLMENTS COLLECTIONS COMMAND CENTER                        |
       |                                                                                         |
       |  [ITEM 1: AGED OVERDUE BUCKETING ENGINE (FR-011)]                                       |
       |  Installment Payments in SQLite                                                         |
       |          |                                                                              |
       |          +--> Evaluates (due_date vs current_date) where status != 'PAID'               |
       |                 |-- 1 to 7 Days Overdue   ---> Bucket A (Mild)                          |
       |                 |-- 8 to 30 Days Overdue  ---> Bucket B (Moderate)                      |
       |                 |-- 31 to 60 Days Overdue ---> Bucket C (Severe)                        |
       |                 \-- 60+ Days Overdue      ---> Bucket D (At-Risk / Default)             |
       |          +--> GET /api/installments/collections/dashboard                                |
       |                 (Returns aggregated metrics + debtor queue in < 50ms)                   |
       |                                                                                         |
       |  [ITEM 2: PIASTRES-EXACT PARTIAL PAYMENT & RECEIPT ENGINE (FR-012)]                     |
       |  POST /api/installments/:id/pay                                                         |
       |          |                                                                              |
       |          +--> Convert input to integer piastres (DEC-011)                               |
       |          +--> Check: payment > remaining_amount? ---> HTTP 422 Unprocessable            |
       |          +--> SQLite BEGIN IMMEDIATE Transaction:                                       |
       |                 |-- Decrement remaining_piastres                                        |
       |                 |-- If remaining == 0 ---> status = 'PAID', paid_at = now()             |
       |                 |-- If remaining > 0  ---> status = 'PARTIALLY_PAID'                    |
       |                 |-- Check if all installments in plan PAID ---> plan = 'COMPLETED'      |
       |                 |-- Insert into invoice_payments & generate receipt payload             |
       |                 \-- Synchronous audit_log: INSTALLMENT_PAYMENT_COLLECTED (real actor)   |
       |                                                                                         |
       |  [ITEM 3: ESCALATION STATE MACHINE & LEGAL_HOLD GATE (FR-013)]                          |
       |  POST /api/installments/:id/escalate                                                    |
       |          |                                                                              |
       |          +--> Target = 'LEGAL_HOLD' AND role != MANAGER/ADMIN?                          |
       |                 \---> HTTP 403 Forbidden (MANAGER_ROLE_REQUIRED)                        |
       |          +--> Authorized transition:                                                    |
       |                 \---> Update status, record collection note, audit log                  |
       |                                                                                         |
       |  [ITEM 4: POS RE-ENGAGEMENT UNIVERSAL WARN-NOT-BLOCK (FR-013.4)]                        |
       |  GET /api/retail/customers/:id/delinquency-status                                       |
       |          +--> Returns delinquency summary: Cashier UI displays warning banner           |
       |          \--> Checkout proceeds without blocking under all states (warn-not-block)      |
       +-----------------------------------------------------------------------------------------+
```

---

## 2. Target Files & Database Schema Modifications

### Files Touched / Created:
1. **Migration File:** `server/src/db/migrations/016_profitability_and_collections.ts`
   - Add columns to `installment_payments`:
     - `paid_amount_piastres INTEGER DEFAULT 0`
     - `remaining_amount_piastres INTEGER NOT NULL DEFAULT 0`
     - `escalation_status TEXT DEFAULT 'PENDING'` (PENDING, REMINDER_SENT, OVERDUE, AT_RISK, LEGAL_HOLD)
     - `escalation_notes TEXT`
     - `last_escalated_at TEXT`
     - `last_escalated_by TEXT REFERENCES users(id)`
   - Create table `installment_collection_logs`:
     - `id TEXT PRIMARY KEY`, `payment_id TEXT`, `plan_id TEXT`, `action_type TEXT`, `notes TEXT`, `actor_id TEXT`, `created_at TEXT`
   - Create composite index: `idx_inst_payments_due_status ON installment_payments(status, due_date)`
2. **Router & Service Files:**
   - [MODIFY] [`server/src/modules/retail/installments.service.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/modules/retail/installments.service.ts)
   - [NEW] [`server/src/modules/retail/installments.router.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/modules/retail/installments.router.ts)
   - [MODIFY] [`server/src/modules/retail/retail.router.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/modules/retail/retail.router.ts) (mount delinquency check hook)
   - [MODIFY] [`server/src/index.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/index.ts) (mount `/api/installments` router)
3. **Automated Verification Suites:**
   - `server/test/api.test.ts`
     - **Test Suite 77:** Installments Command Center, Aging Buckets & Partial Payments (FR-011, FR-012)
     - **Test Suite 78:** Installments Escalation State Machine, LEGAL_HOLD RBAC & POS Warning (FR-013)

---

## 3. Dependency-Ordered Task Breakdown (≤ 2h Granularity)

| Task ID | Priority | Description & Scope | Dependencies | Est. Time | Verification / Test Pass Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TASK-4.1** | `P0` | **Installment Schema Enhancement & Migration (`016`)**<br>Add columns `paid_amount_piastres`, `remaining_amount_piastres`, `escalation_status`, `escalation_notes` to `installment_payments`. Create table `installment_collection_logs` and index `idx_inst_payments_due_status`. | Migration Batch 1 | 1.0h | **Vector A:** Migration runs cleanly.<br>**Vector C:** Columns exist with types/defaults.<br>**Vector E:** `EXPLAIN QUERY PLAN` confirms index usage on `(status, due_date)`. |
| **TASK-4.2** | `P0` | **Piastres-Exact Partial Payment Recording & Receipting (`FR-012`)**<br>Implement `POST /api/installments/:id/pay`. Support partial and full payments in integer piastres. Update plan completion on final payment. Emit `INSTALLMENT_PAYMENT_COLLECTED` audit log with real actor ID (`DEC-046`). | TASK-4.1 | 1.5h | Test Suite 77: (1) Partial payment updates remaining piastres, (2) Final payment completes plan, (3) Overpayment rejected with HTTP 422, (4) Audit log captures real actor. |
| **TASK-4.3** | `P0` | **Aged Overdue Buckets & Command Center Dashboard (`FR-011`)**<br>Implement `GET /api/installments/collections/dashboard`. Categorize overdue debts into 1–7, 8–30, 31–60, 60+ day buckets. Expose total overdue exposure and debtor list. | TASK-4.1 | 1.0h | Test Suite 77: Verifies exact bucket placement based on date fixtures, total sums match integer piastres. |
| **TASK-4.4** | `P0` | **Escalation State Machine & Manager LEGAL_HOLD Role Gate (`FR-013.1`–`FR-013.3`)**<br>Implement `POST /api/installments/:id/escalate`. Enforce RBAC: Cashier rejected with HTTP 403 on `LEGAL_HOLD`; Manager/Admin authorized. Append collection log entry. Synchronously audit transitions with real actor ID (`DEC-046`). | TASK-4.2 | 1.0h | Test Suite 78: (1) Cashier escalates to REMINDER_SENT / OVERDUE, (2) Cashier blocked with 403 on LEGAL_HOLD, (3) Manager succeeds on LEGAL_HOLD, (4) Audit logs real actor. |
| **TASK-4.5** | `P1` | **POS Universal Warn-Not-Block Hook (`FR-013.4`)**<br>Implement `GET /api/retail/customers/:id/delinquency-status`. Return delinquent status, worst bucket, and total overdue. Render high-contrast banner in cashier cart, proceeding without hard blocking checkout under all states. | TASK-4.3 | 0.5h | Test Suite 78: POS customer inquiry returns correct delinquency warning flag and overdue amount; checkout proceeds without block even under LEGAL_HOLD. |
