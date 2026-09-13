# Feature Specification: Profitability & Margin Analytics Engine

**Document Version:** 1.0.0  
**Status:** Draft / Pending Wave Gate Review  
**Specification Path:** `specs/005-profitability-analytics/spec.md`  
**Target Milestone:** Phase 3 — Wave: Profitability & Collections (Feature 005)  
**Governing Architecture:** Constitution v1.0.2 | DEC-007, DEC-011, DEC-028, DEC-031, DEC-046 | ADR-031  
**Target Git Branch:** `feature/005-profitability-analytics`  
**Created:** 2026-09-13  

---

## 1. Executive Summary & Problem Statement (The "WHY")

For an electronics repair workshop and retail shop, gross revenue figures are deceptive. A shop may report 150,000 EGP in monthly sales while losing money due to unmonitored component acquisition costs, excessive warranty rework, and capital trapped in dead inventory:
1. **Blindness to Real Item & Category Margins:** Sales reports show top-line revenue, but do not calculate true gross margin using First-In-First-Out (`FIFO`) acquisition batches (`item_cost_history`). The owner cannot tell which accessory categories or screen brands yield healthy profits versus which barely break even.
2. **Untracked Technician Quality & Warranty Bleed:** Technicians are currently evaluated solely on ticket count. If a technician rushes repairs and causes a 25% warranty return rate, the shop bears the warranty parts expense (`acc-5040` / `DEC-031`) without attributing this financial bleeding to the responsible technician.
3. **Invisible Warranty Cost Drag:** Following Feature 003's warranty parts expense tracking (`acc-5040`), the shop records warranty costs, but lacks a comparative monthly trend showing `WARRANTY_EXPENSE` as an explicit percentage of repair and retail revenue.
4. **Stagnant Capital in Dead Stock:** Fast-depreciating smartphone screens and batteries sit on shelves. Without an automated dead stock report (zero movement in 90+ days), capital at risk is hidden until physical liquidation.
5. **Database Concurrency Protection (`DEC-007`):** Generating complex analytical reports via live multi-table joins on every request locks SQLite tables and degrades POS cashier responsiveness. Analytics must be served from pre-aggregated views or materialized summaries.

Feature 005 builds the **Profitability & Margin Analytics Engine** to give the shop owner the absolute truth about money in and money out across every operational dimension.

---

## 2. Scope Boundaries

### In-Scope
1. **FIFO-Aware Category & Item Gross Margin Analytics (`FR-014`):**
   - Calculates exact gross margin in integer piastres: $\text{Margin} = \text{Revenue} - \text{COGS (FIFO Cost)}$.
   - Breakdown by item category (e.g. Screens, Batteries, Accessories, Audio) and individual fast-moving SKUs.
   - Margin percentage calculation: $(\text{Margin Piastres} / \text{Revenue Piastres}) \times 100$.
2. **Technician Performance & Rework Rate Attribution (`FR-015`):**
   - Repairs completed count per technician.
   - **Rework Rate Formula:** $(\text{Warranty Return Tickets} / \text{Total Completed Repairs}) \times 100$.
   - Attributed labor revenue generated vs attributed warranty parts expense absorbed (`acc-5040`).
   - Net technician profitability contribution in integer piastres.
3. **Warranty Expense vs Revenue Trend (`FR-016.1`):**
   - Monthly trend tracking: Total Repair Revenue, Total Warranty Parts Expense (`acc-5040`), and Warranty Drag Percentage.
4. **Dead Stock Capital at Risk Report (`FR-016.2`):**
   - Identifies items with zero stock movements (sales or repair consumption) over configurable window (default 90+ days).
   - Calculates Total Stock Value at Risk: $\sum (\text{stock\_quantity} \times \text{purchase\_price})$.
5. **Architectural & Governance Guardrails:**
   - Pre-aggregated views / optimized summary queries ensuring sub-50ms execution without read/write table contention (`DEC-007`).
   - Manager / Admin Role Gate: All profitability and margin endpoints strictly require `MANAGER` or `ADMIN` role (`HTTP 403 Forbidden` for Cashiers/Technicians per `DEC-028`).
   - Currency: Strict integer piastres across all computations (`DEC-011`).

### Explicitly Out-of-Scope
- Complex multi-year machine-learning forecasting (frozen per `DEC-039`).
- Inter-branch margin comparison (frozen per `DEC-026`).
- Live external tax portal sync (Action Owner: HUMAN per `RISK-009`).

---

## 3. Functional Requirements (The "WHAT")

### FR-014: FIFO-Aware Category & Item Gross Margin Analytics
- **FR-014.1:** Endpoint `GET /api/reports/profitability/margins` returns gross profit analysis filterable by date range (`startDate`, `endDate`).
- **FR-014.2 (RBAC Gate):** Request strictly requires authenticated JWT with role `MANAGER` or `ADMIN`. Unauthorized roles receive `HTTP 403 Forbidden` (`code: 'PROFITABILITY_ACCESS_FORBIDDEN'`).
- **FR-014.3 (FIFO Computation):** Cost of Goods Sold (`COGS`) is derived from `sale_items` linked to `item_cost_history` / `item_batches`. Margin is computed as `subtotal_piastres - cogs_piastres`.
- **FR-014.4:** Response payload provides category-level summaries (revenue, COGS, margin, margin percentage) and top 10 most profitable and least profitable individual items.

### FR-015: Technician Performance & Warranty Rework Attribution
- **FR-015.1:** Endpoint `GET /api/reports/profitability/technicians` returns technician scorecards.
- **FR-015.2 (Rework Rate Calculation):**
  - Counts total tickets where `assigned_tech_id = user_id` and `status = 'DELIVERED'`.
  - Counts warranty rework tickets where `parent_ticket_id` references a ticket previously completed by this technician.
  - Computes `rework_rate_pct = (rework_count / completed_count) * 100`.
- **FR-015.3 (Expense Attribution):** Sums `warranty_cost_amount` for all rework tickets linked to the technician, comparing it directly against the technician's total generated `labor_charge`.
- **FR-015.4:** Net technician contribution is computed: `net_contribution_piastres = labor_revenue_piastres - warranty_expense_piastres`.

### FR-016: Warranty Cost Impact Trend & Dead Stock Capital at Risk
- **FR-016.1 (Warranty Drag Trend):** Endpoint `GET /api/reports/profitability/warranty-impact` returns monthly data:
  - Total Repair Revenue (in integer piastres).
  - Total Warranty Expense (`acc-5040` debit postings).
  - Warranty Drag Ratio: `(warranty_expense / repair_revenue) * 100`.
- **FR-016.2 (Dead Stock Report):** Endpoint `GET /api/reports/profitability/dead-stock` returns items with zero movements in past $N$ days (configurable via query/settings, default 90 days).
- **FR-016.3:** Dead stock payload includes: item ID, SKU, item name, category, current quantity, unit purchase price, and total capital at risk (`stock_quantity * purchase_price`).

---

## 4. Non-Functional Requirements (NFR)

- **NFR-008 (Pre-Aggregated Views & Zero Read-Lock Contention):** Analytics queries must be backed by pre-aggregated database views or indexed aggregation pipelines to ensure query execution completes in < 50ms without blocking active POS checkouts.
- **NFR-009 (Strict Role Separation):** Access is strictly blocked for non-managerial staff to prevent unauthorized disclosure of markup margins, technician salaries/contributions, and wholesale cost structures.
