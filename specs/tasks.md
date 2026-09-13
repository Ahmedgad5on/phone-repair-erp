# Consolidated Tasks Tracker: Wave "Profitability & Collections" (Features 004 / 005 / 006)

**Wave Title:** Profitability & Collections  
**Document Version:** 1.0.0  
**Status:** Ready for Wave Gate Approval (Pre-Implementation)  
**Tracker Path:** `specs/tasks.md`  
**Governing Architecture:** Constitution v1.0.2 | DEC-007, DEC-011, DEC-022, DEC-024, DEC-028, DEC-031, DEC-046  
**Target Git Branch:** `wave/profitability-and-collections`  
**Test Suite Allocation:** Suites 77, 78, 79, 80, 81, 82, 83 (77+ onwards)  
**Created:** 2026-09-13  

---

## 1. Cross-Feature Batched Execution Plan

To maximize execution efficiency, minimize schema churn, and prevent migration fragmentation, the wave is organized into **4 ordered implementation batches**:

```text
+--------------------------------------------------------------------------------------------------+
| BATCH 1: UNIFIED DATABASE MIGRATION & VIEWS (TASK-4.1, TASK-5.1, TASK-6.1)                       |
| - Migration 016: installment columns/tables + profitability views/indexes + loyalty columns/settings|
| - Concrete Schema Verification Vectors (Pre-Execution Gate):                                    |
|     * Vector A: Migration 016 runs cleanly on fresh AND existing DBs                             |
|     * Vector B: view_sales_cogs_daily + view_technician_quality_summary exist and are queryable  |
|     * Vector C: New installment columns exist with correct types/defaults                         |
|     * Vector D: Default loyalty/tier settings seeded into settings table                          |
|     * Vector E: Query plan of each report endpoint uses the intended index (EXPLAIN QUERY PLAN)   |
+--------------------------------------------------------------------------------------------------+
                                                 |
+--------------------------------------------------------------------------------------------------+
| BATCH 2: FEATURE 004 — INSTALLMENTS COLLECTIONS COMMAND CENTER (TASK-4.2 .. TASK-4.5)            |
| - Partial payments in integer piastres + receipt generation + audit log (TASK-4.2)               |
| - Aged overdue buckets dashboard (1-7, 8-30, 31-60, 60+ days) (TASK-4.3)                         |
| - Escalation state machine + LEGAL_HOLD Manager RBAC gate + POS universal warn-not-block (4.4,4.5)|
| - All escalation transitions audited with real actor IDs (DEC-046)                               |
| - Verification: Test Suites 77 & 78                                                              |
+--------------------------------------------------------------------------------------------------+
                                                 |
+--------------------------------------------------------------------------------------------------+
| BATCH 3: FEATURE 005 — PROFITABILITY & MARGIN ANALYTICS ENGINE (TASK-5.2 .. TASK-5.5)           |
| - Pre-aggregated FIFO gross margin analytics per category and SKU (TASK-5.2)                     |
| - Technician performance & warranty rework rate attribution (TASK-5.3)                           |
| - Monthly warranty expense drag trend vs repair revenue (TASK-5.4)                               |
| - Dead stock report (90+ days without movement) with stock capital at risk (TASK-5.5)            |
| - Manager/Admin RBAC protection on all reports (HTTP 403)                                        |
| - Verification: Test Suites 79, 80 & 81                                                          |
+--------------------------------------------------------------------------------------------------+
                                                 |
+--------------------------------------------------------------------------------------------------+
| BATCH 4: FEATURE 006 — CUSTOMER LOYALTY TIERS (LIGHT-WEIGHT) (TASK-6.2 .. TASK-6.5)             |
| - Configurable settings table integration for tier thresholds & bonus % (TASK-6.2)               |
| - DiscountService cart evaluation: tier bonus stacking clamped UNDER 30% ceiling (TASK-6.3)      |
|   (Explicit exemption: Admin/SuperAdmin/Owner 100% uncapped per ratified role hierarchy)        |
| - Sale/Repair completion automatic tier recalculation hooks (TASK-6.4)                           |
| - Manual tier override endpoint with Manager RBAC + mandatory reason + audit log (TASK-6.5)      |
| - Verification: Test Suites 82 & 83                                                              |
+--------------------------------------------------------------------------------------------------+
```

---

## 2. Master Task Register (≤ 2h Granularity)

| Task ID | Feature | Priority | Description & Technical Scope | Target Files | Dependencies | Status | Verification Suite |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TASK-4.1** | 004 | `P0` | **Installment Schema & Migration (`016`)**<br>Add `paid_amount_piastres`, `remaining_amount_piastres`, `escalation_status` to `installment_payments`. Create `installment_collection_logs` and indexes. | `server/src/db/migrations/016_profitability_and_collections.ts` | None | `PENDING` | **Vector A:** Migration runs cleanly.<br>**Vector C:** Columns exist with types/defaults.<br>**Vector E:** Composite index on `(status, due_date)`. |
| **TASK-5.1** | 005 | `P0` | **Analytics Views & Composite Indexes (`016`)**<br>Create views `view_sales_cogs_daily`, `view_technician_quality_summary`, and `view_dead_stock_candidates` with supporting composite indexes. | `server/src/db/migrations/016_profitability_and_collections.ts` | None | `PENDING` | **Vector B:** Views exist and are queryable.<br>**Vector E:** `EXPLAIN QUERY PLAN` confirms index usage. |
| **TASK-6.1** | 006 | `P0` | **Loyalty Schema & Settings Migration (`016`)**<br>Add `loyalty_tier`, `lifetime_spend_piastres`, `tier_override` to `customers`. Seed dynamic settings rows for thresholds and bonuses. | `server/src/db/migrations/016_profitability_and_collections.ts` | None | `PENDING` | **Vector D:** Default settings seeded.<br>**Vector C:** `customers` columns & CHECK constraint. |
| **TASK-4.2** | 004 | `P0` | **Piastres Partial Payment & Receipt Engine**<br>Implement `POST /api/installments/:id/pay`. Piastres-exact decrement, partial vs full completion, receipt generation, `INSTALLMENT_PAYMENT_COLLECTED` audit log with real actor ID (`DEC-046`). | `installments.service.ts`, `installments.router.ts` | TASK-4.1 | `PENDING` | Test Suite 77 (Vectors 1–4) |
| **TASK-4.3** | 004 | `P0` | **Aged Overdue Buckets Dashboard**<br>Implement `GET /api/installments/collections/dashboard`. Categorize overdue debts into 1–7, 8–30, 31–60, 60+ days. Aggregate debtor queue. | `installments.service.ts`, `installments.router.ts` | TASK-4.1 | `PENDING` | Test Suite 77 (Vectors 5–8) |
| **TASK-4.4** | 004 | `P0` | **Escalation State Machine & LEGAL_HOLD RBAC**<br>Implement `POST /api/installments/:id/escalate`. Linear state machine: `REMINDER_SENT` $\to$ `OVERDUE` $\to$ `AT_RISK` $\to$ `LEGAL_HOLD`. Enforce Manager RBAC for `LEGAL_HOLD`. Synchronous audit log with real actor ID (`DEC-046`). | `installments.service.ts`, `installments.router.ts` | TASK-4.2 | `PENDING` | Test Suite 78 (Vectors 1–4) |
| **TASK-4.5** | 004 | `P1` | **POS Universal Delinquency Warn-Not-Block Hook**<br>Implement `GET /api/retail/customers/:id/delinquency-status`. Integrate delinquency warning into cashier cart workflow. Warn cashier with high-contrast alert without blocking sale under any state (warn-not-block doctrine). | `retail.router.ts` | TASK-4.3 | `PENDING` | Test Suite 78 (Vectors 5–6) |
| **TASK-5.2** | 005 | `P0` | **FIFO Gross Margin Reporting Service & RBAC**<br>Implement `GET /api/reports/profitability/margins`. Restrict to Manager/Admin (HTTP 403). Compute revenue, COGS, and gross margin per category and SKU in integer piastres. | `profitability.service.ts`, `reports.router.ts` | TASK-5.1 | `PENDING` | Test Suite 79 (Vectors 1–6) |
| **TASK-5.3** | 005 | `P0` | **Technician Quality & Rework Rate Attribution**<br>Implement `GET /api/reports/profitability/technicians`. Compute completed repairs, warranty rework tickets, rework %, labor revenue, and attributed `acc-5040` warranty expense. | `profitability.service.ts`, `reports.router.ts` | TASK-5.1 | `PENDING` | Test Suite 80 (Vectors 1–4) |
| **TASK-5.4** | 005 | `P1` | **Warranty Expense Impact Monthly Trend**<br>Implement `GET /api/reports/profitability/warranty-impact`. Track monthly `WARRANTY_EXPENSE` debits vs repair revenue; compute warranty drag ratio. | `profitability.service.ts`, `reports.router.ts` | TASK-5.1 | `PENDING` | Test Suite 80 (Vectors 5–6) |
| **TASK-5.5** | 005 | `P1` | **Dead Stock Capital at Risk Report**<br>Implement `GET /api/reports/profitability/dead-stock`. Identify items with zero movement in 90+ days. Compute total stock value at risk in integer piastres. | `profitability.service.ts`, `reports.router.ts` | TASK-5.1 | `PENDING` | Test Suite 81 (Vectors 1–4) |
| **TASK-6.2** | 006 | `P0` | **Dynamic Tier Settings & LTV Engine**<br>Implement `LoyaltyService.calculateCustomerLTV()` and settings reader/updater endpoints `GET/PUT /api/loyalty/tiers/settings`. | `loyalty.service.ts`, `loyalty.router.ts` | TASK-6.1 | `PENDING` | Test Suite 82 (Vectors 1–4) |
| **TASK-6.3** | 006 | `P0` | **Tier Discount Stacking & 30% Ceiling Clamp**<br>Integrate tier bonus into `DiscountService.evaluateCart()`. Combine role max discount + tier bonus, strictly clamped under Manager 30% ceiling. Admin/Owner exempt (100%). | `discount.service.ts` | TASK-6.2 | `PENDING` | Test Suite 83 (Vectors 1–5) |
| **TASK-6.4** | 006 | `P1` | **Sale & Repair Completion Tier Recalculation**<br>Hook into `POST /api/retail/sales` and repair ticket delivery to trigger automatic LTV update and tier promotion with audit logging. | `retail.router.ts`, `repair.router.ts` | TASK-6.2 | `PENDING` | Test Suite 82 (Vectors 5–7) |
| **TASK-6.5** | 006 | `P0` | **Manual Tier Override RBAC & Audit Trail**<br>Implement `POST /api/customers/:id/tier-override`. Manager/Admin role gate (HTTP 403), non-empty reason validation (HTTP 422), `CUSTOMER_TIER_OVERRIDDEN` audit event with real actor ID (`DEC-046`). | `loyalty.router.ts` | TASK-6.1 | `PENDING` | Test Suite 83 (Vectors 6–8) |

---

## 3. Risk & Governance Matrix

| Risk ID | Feature Linkage | Technical Defense Mechanism | Verification Target |
| :--- | :--- | :--- | :--- |
| **RISK-002** (Concurrency Race) | Feature 004 (Installments) | `BEGIN IMMEDIATE` transactions during partial payment recording (`TASK-4.2`) preventing balance corruption on concurrent station payments. | Test Suite 77 |
| **RISK-004** (Financial Mutation / Discount Fraud) | Feature 004 & Feature 006 | Strict RBAC (`requireRole(['Manager', 'Admin'])`) on `LEGAL_HOLD` and tier overrides; hard mathematical clamping of discount stacking to `\min(30\%, \text{discount})`. | Test Suites 78 & 83 |
| **RISK-006** (PRAGMA Contention) | Feature 005 (Analytics) | Pre-aggregated database views (`view_sales_cogs_daily`, `view_technician_quality_summary`) ensure reporting queries read quickly without blocking write-ahead logging. | Test Suites 79, 80, 81 |
| **RISK-007** (Durability) | All Features | Integer piastres persisted under `synchronous = FULL` guarantees zero data loss on unexpected power cuts (`DEC-001`, `DEC-011`). | All Test Suites |

---

## 4. Acceptance Criteria for Wave Gate Approval

1. **Zero Hardcoded Business Constants:** All aging bucket days, reminder lead times, tier LTV cutoffs, and tier bonus percentages reside in the `settings` table with verified fallback defaults.
2. **Strict Integer Currency Invariant:** All amounts, balances, COGS calculations, and expenses are expressed in integer piastres (`1 EGP = 100 Piastres`).
3. **Double-Entry & Ledger Truth Preservation:** Warranty rework expenses continue debiting `acc-5040` (`DEC-031`), ensuring analytics reflect real financial truth.
4. **Adversarial Review Protocol Active:** Every batch must pass independent subagent adversarial review before brief submission.
