# Technical Implementation Plan: Profitability & Margin Analytics Engine

**Document Version:** 1.0.0  
**Status:** Draft / Pending Wave Gate Review  
**Plan Path:** `specs/005-profitability-analytics/plan.md`  
**Specification Reference:** `specs/005-profitability-analytics/spec.md`  
**Target Milestone:** Phase 3 — Wave: Profitability & Collections (Feature 005)  
**Governing Architecture:** Constitution v1.0.2 | DEC-007, DEC-011, DEC-028, DEC-031, DEC-046 | ADR-031  
**Target Git Branch:** `feature/005-profitability-analytics`  
**Created:** 2026-09-13  

---

## 1. Architectural Blueprint

```text
       +-----------------------------------------------------------------------------------------+
       |             FEATURE 005: PROFITABILITY & MARGIN ANALYTICS ENGINE                        |
       |                                                                                         |
       |  [ITEM 1: FIFO GROSS MARGIN PRE-AGGREGATED PIPELINE (FR-014)]                           |
       |  sales + sale_items + item_cost_history                                                 |
       |          |                                                                              |
       |          +--> Pre-aggregated View: view_sales_cogs_daily                                 |
       |                 (Computes subtotal_piastres, cogs_piastres, margin_piastres)            |
       |          +--> GET /api/reports/profitability/margins                                    |
       |                 |-- Role != MANAGER / ADMIN ---> HTTP 403 Forbidden                      |
       |                 \-- Category & SKU Gross Margin aggregation (Executed < 50ms)           |
       |                                                                                         |
       |  [ITEM 2: TECHNICIAN QUALITY & REWORK ATTRIBUTION (FR-015)]                             |
       |  repair_tickets (Parent vs Rework Child Link)                                           |
       |          |                                                                              |
       |          +--> Pre-aggregated View: view_tech_quality_metrics                             |
       |                 |-- Delivered Tickets Count                                             |
       |                 |-- Warranty Rework Tickets (where parent_ticket.assigned_tech = user)  |
       |                 |-- Rework Rate % = (rework_count / completed_count) * 100              |
       |                 |-- Labor Revenue Generated                                             |
       |                 \-- Warranty Parts Expense Absorbed (acc-5040 / DEC-031)                |
       |          +--> GET /api/reports/profitability/technicians                                |
       |                 (Returns net contribution per technician)                               |
       |                                                                                         |
       |  [ITEM 3: WARRANTY DRAG TREND & DEAD STOCK REPORT (FR-016)]                             |
       |  GET /api/reports/profitability/warranty-impact                                          |
       |          +--> Aggregates monthly acc-5040 debits vs Repair Revenue                      |
       |  GET /api/reports/profitability/dead-stock                                              |
       |          +--> Query items with no sales or repair movements in 90+ days                 |
       |          +--> Computes capital value at risk: SUM(stock * purchase_price)               |
       +-----------------------------------------------------------------------------------------+
```

---

## 2. Target Files & Database Schema Modifications

### Files Touched / Created:
1. **Migration File:** `server/src/db/migrations/016_profitability_and_collections.ts`
   - Create SQLite pre-aggregated views:
     - `view_sales_cogs_daily`: Groups sales and cost of goods sold by date, category, and item.
     - `view_technician_quality_summary`: Groups tickets, rework counts, and warranty expense by technician.
     - `view_dead_stock_candidates`: Filters active items with zero transactions in 90+ days.
   - Create supporting composite indexes:
     - `idx_sales_date_status ON sales(created_at, status)`
     - `idx_repair_tech_delivered ON repair_tickets(assigned_tech_id, status, parent_ticket_id)`
     - `idx_journal_acc_date ON journal_entry_lines(account_id, created_at)`
2. **Router & Service Files:**
   - [NEW] [`server/src/modules/reports/profitability.service.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/modules/reports/profitability.service.ts)
   - [MODIFY] [`server/src/modules/reports/reports.router.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/modules/reports/reports.router.ts) (mount `/profitability/*` routes with `requireRole(['Manager', 'Admin'])`)
3. **Automated Verification Suites:**
   - `server/test/api.test.ts`
     - **Test Suite 79:** FIFO Gross Margin Analytics & Pre-Aggregated Views (FR-014)
     - **Test Suite 80:** Technician Performance, Rework Rate & Warranty Cost Trend (FR-015, FR-016.1)
     - **Test Suite 81:** Dead Stock Capital at Risk & Manager-Only Reporting RBAC (FR-016.2, NFR-009)

---

## 3. Dependency-Ordered Task Breakdown (≤ 2h Granularity)

| Task ID | Priority | Description & Scope | Dependencies | Est. Time | Verification / Test Pass Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TASK-5.1** | `P0` | **Analytics Views & Index Migration (`016`)**<br>Create database views `view_sales_cogs_daily`, `view_technician_quality_summary`, and `view_dead_stock_candidates`. Add composite indexes for sub-50ms query latency (`NFR-008`). | Migration Batch 1 | 1.0h | **Vector B:** Views exist and are queryable.<br>**Vector E:** `EXPLAIN QUERY PLAN` confirms index utilization on sales and repair ticket scans. |
| **TASK-5.2** | `P0` | **FIFO Gross Margin Reporting Service & RBAC Gate (`FR-014`, `NFR-009`)**<br>Implement `GET /api/reports/profitability/margins`. Restrict to `MANAGER` / `ADMIN` (HTTP 403 for others). Compute revenue, COGS, and gross margin per category and item in integer piastres. | TASK-5.1 | 1.5h | Test Suite 79: (1) Cashier blocked with HTTP 403, (2) Manager receives category and item margin in integer piastres, (3) FIFO math correctly matches cost history. |
| **TASK-5.3** | `P0` | **Technician Performance & Warranty Rework Attribution (`FR-015`)**<br>Implement `GET /api/reports/profitability/technicians`. Compute completed tickets, warranty rework tickets, rework percentage, labor revenue, warranty expense (`acc-5040`), and net contribution. | TASK-5.1 | 1.5h | Test Suite 80: (1) Tech rework accurately linked to original completing technician, (2) Warranty parts cost deducted from net contribution, (3) Rework % formula verified. |
| **TASK-5.4** | `P1` | **Warranty Expense Impact Trend Analysis (`FR-016.1`)**<br>Implement `GET /api/reports/profitability/warranty-impact`. Query monthly debit totals for `acc-5040` vs repair revenue, computing warranty drag percentage. | TASK-5.1 | 1.0h | Test Suite 80: Verifies monthly trend calculation across consecutive calendar months in integer piastres. |
| **TASK-5.5** | `P1` | **Dead Stock Capital at Risk Report (`FR-016.2`, `FR-016.3`)**<br>Implement `GET /api/reports/profitability/dead-stock`. Query active inventory with zero sales and repair usage in 90+ days. Compute total capital value at risk. | TASK-5.1 | 1.0h | Test Suite 81: (1) Item sold 10 days ago excluded, (2) Item unmoved for 95 days included with correct total capital at risk. |
