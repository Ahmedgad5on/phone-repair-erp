# Feature Specification: Installments Collections Command Center

**Document Version:** 1.0.0  
**Status:** Draft / Pending Wave Gate Review  
**Specification Path:** `specs/004-installments-command-center/spec.md`  
**Target Milestone:** Phase 3 — Wave: Profitability & Collections (Feature 004)  
**Governing Architecture:** Constitution v1.0.2 | DEC-011, DEC-022, DEC-028, DEC-046 | ADR-022  
**Target Git Branch:** `feature/004-installments-command-center`  
**Created:** 2026-09-13  

---

## 1. Executive Summary & Problem Statement (The "WHY")

In retail electronics and mobile repair, selling higher-ticket hardware (smartphones, premium screens, refurbished flagships) relies heavily on installment plans (`DEC-022`). While the existing codebase generates basic installment amortization schedules upon sales checkout (`installments.service.ts`), it treats them as passive records:
1. **Zero Visibility into Delinquency:** The shop has no centralized dashboard or aged debtor view. Installments that slip past their due date remain quietly marked as `PENDING` without aging bucket categorization (1–7, 8–30, 31–60, 60+ days).
2. **Inflexible All-or-Nothing Payments:** Customers in economic distress frequently offer partial installment payments (e.g. paying 500 EGP towards a 1,200 EGP monthly installment). The current service lacks partial payment tracking, forcing clerks to hold cash off-book or reject money.
3. **Absence of Governance & Escalation Workflow:** There is no auditable lifecycle transition between missed payments, formal reminders, delinquency risk, and legal recovery holds. Without strict RBAC, clerks can arbitrarily forgive or freeze accounts.
4. **Blind POS Re-Engagement:** A customer with overdue, delinquent installments can walk into the shop and purchase more accessories or book a new repair without the cashier being warned of their outstanding delinquent debt.

Feature 004 deepens `DEC-022` to transform static schedules into an **Active Collections Command Center**: money owed becomes money visible, money tracked, and money collected.

---

## 2. Scope Boundaries

### In-Scope
1. **Aged Overdue Dashboard (`FR-011`):**
   - Pre-computed aging buckets: **1–7 days**, **8–30 days**, **31–60 days**, and **60+ days** past due date.
   - Summarized metrics: Total overdue capital at risk, count of delinquent customers, upcoming installments.
   - Filterable view showing customer name, phone, linked invoice/sale, days overdue, total due, and remaining plan balance.
2. **Piastres-Exact Partial Payment Recording (`FR-012`):**
   - Endpoint: `POST /api/installments/:id/pay` supporting exact payments and partial payments.
   - Strict integer piastres calculation: `amount_paid` decrements installment `remaining_amount`. If `remaining_amount == 0`, status transitions to `PAID`. If `remaining_amount > 0`, status transitions to `PARTIALLY_PAID`.
   - Formal thermal receipt generation (`ESC/POS` receipt payload + receipt ID).
   - Synchronous audit log recording real authenticated actor ID and before/after balances.
3. **Escalation State Machine & Governance (`FR-013`):**
   - Payment status state machine: `PENDING` $\to$ `REMINDER_SENT` $\to$ `OVERDUE` $\to$ `AT_RISK` $\to$ `LEGAL_HOLD` $\to$ `PAID` / `WRITTEN_OFF`.
   - Escalation transition endpoint: `POST /api/installments/:id/escalate`.
   - `LEGAL_HOLD` role gate: Transition to `LEGAL_HOLD` strictly requires `MANAGER` or `ADMIN` role (`HTTP 403 Forbidden` for cashiers/technicians).
   - Collection action log: Appends non-empty collection note and contact timestamp.
4. **POS Re-Engagement Warning ("Warn-Not-Block") (`FR-013.4`):**
   - Retail sales customer lookup (`GET /api/retail/customers/:id/delinquency-status` or integrated into cart customer selection) flags whether the customer has active overdue installments.
   - Cashier interface displays high-contrast Amber/Rose warning banner indicating outstanding debt without hard blocking the cash transaction (universal warn-not-block: cashier decides at the counter; legal escalation is an administrative recovery path).
5. **Configurable Settings Governance:**
   - Aging bucket thresholds (e.g. 7, 30, 60 days) and automated reminder offsets (default 2 days prior) stored in `settings` table, never hardcoded.

### Explicitly Out-of-Scope
- Automated bank auto-debit / credit card recurring billing (Egyptian local shop cash/wallet context).
- External legal court API integrations.
- Public online debtor portal.

---

## 3. Functional Requirements (The "WHAT")

### FR-011: Aged Overdue Dashboard & Collections Command Center
- **FR-011.1:** Dedicated manager/cashier endpoint `GET /api/installments/collections/dashboard` providing pre-aggregated debtor summaries.
- **FR-011.2 (Aging Buckets):** Overdue installments (`status NOT IN ('PAID', 'CANCELLED', 'WRITTEN_OFF')` AND `due_date < date('now')`) are classified into:
  - Bucket A (Mild): 1–7 days overdue.
  - Bucket B (Moderate): 8–30 days overdue.
  - Bucket C (Severe): 31–60 days overdue.
  - Bucket D (Critical / At-Risk): 60+ days overdue.
- **FR-011.3:** Response payload returns aggregated metrics (total overdue piastres per bucket, total customer count) and an itemized debtor list with customer contact info, linked sale ID, installment number, amount due, amount paid, and escalation status.

### FR-012: Integer Piastres Partial Payment & Receipt Engine
- **FR-012.1:** Endpoint `POST /api/installments/:id/pay` accepts `{ amount: number, payment_method: string, notes?: string }`.
- **FR-012.2 (Integer Piastres Math):** All financial amounts are converted to integer piastres (`DEC-011`). Floating point math is strictly forbidden.
- **FR-012.3 (Partial Payment Logic):**
  - If `payment_amount_piastres < remaining_piastres`: Updates `paid_amount`, computes new `remaining_amount`, and sets installment status to `PARTIALLY_PAID`. Plan status remains `ACTIVE`.
  - If `payment_amount_piastres == remaining_piastres`: Updates `paid_amount`, sets `remaining_amount = 0`, sets installment status to `PAID`, sets `paid_at = CURRENT_TIMESTAMP`. If all installments in plan are `PAID`, plan status transitions to `COMPLETED`.
  - If `payment_amount_piastres > remaining_piastres`: Strictly rejected with `HTTP 422 Unprocessable Entity` (`EXCESSIVE_PAYMENT_AMOUNT`).
- **FR-012.4 (Receipt & Audit):** Generates a unique receipt reference (`rec-inst-<uuid>`), appends transaction to `invoice_payments`, and writes synchronous audit log `INSTALLMENT_PAYMENT_COLLECTED` with real authenticated actor ID (`DEC-046`).

### FR-013: Escalation State Machine, LEGAL_HOLD Role Gate & POS Warning
- **FR-013.1 (State Machine):** Installments follow linear escalation states:
  - `PENDING` $\to$ `REMINDER_SENT` $\to$ `OVERDUE` $\to$ `AT_RISK` $\to$ `LEGAL_HOLD`.
- **FR-013.2 (Escalation Endpoint):** `POST /api/installments/:id/escalate` accepts `{ target_state: string, reason: string }`.
- **FR-013.3 (LEGAL_HOLD Role Gate):** Transitioning to `LEGAL_HOLD` requires JWT role `MANAGER` or `ADMIN`. Cashiers attempting `LEGAL_HOLD` are rejected with `HTTP 403 Forbidden` (`code: 'MANAGER_ROLE_REQUIRED'`).
- **FR-013.4 (POS Universal Warn-Not-Block):** Endpoint `GET /api/retail/customers/:id/delinquency-status` returns `{ has_overdue: boolean, total_overdue_piastres: number, worst_bucket: string, legal_hold: boolean }`. POS frontend renders a high-contrast visual banner alerting the cashier, but DOES NOT block checkout under any state (universal warn-not-block: the cashier retains discretion at the counter; legal escalation is an administrative recovery track).
- **FR-013.5 (Audit & WhatsApp Trigger Hooks):** All escalation state transitions (`POST /api/installments/:id/escalate`) synchronously write to `audit_logs` capturing the real authenticated actor ID (`DEC-046`), the previous status, the new status, and the mandatory reason. When moving to `REMINDER_SENT` or executing automated daily scans, queued notification records are generated in `whatsapp_messages_log` adhering to offline LAN simulation (`DEC-019`).

---

## 4. Non-Functional Requirements (NFR)

- **NFR-006 (Sub-50ms Dashboard Query Performance):** Collections dashboard queries must execute in < 50ms on a 10,000 installment dataset using composite indexes on `installment_payments(status, due_date)` and `installment_plans(customer_id)`.
- **NFR-007 (Audit Integrity):** Every financial mutation and state escalation must capture the verified JWT user ID without fallback to synthetic accounts (`DEC-046`).
