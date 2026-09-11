# Original User Request

## 2026-09-10T02:45:05Z

Implement all High-Impact (🔴) development and maintenance proposals across the seven
modules of a production-grade Modular Mobile Repair Lab, Retail POS, Spare Parts
Wholesale, and Fintech ERP system. The codebase is complete and in production;
every change must integrate cleanly without breaking existing functionality.

Working directory: c:\Users\Eng_Ahmed\Desktop\pro
Integrity mode: development

---

## Project Context

**Stack (fixed — do not change):**
- Server: Node.js v24, Express 5, TypeScript (CommonJS), Better-SQLite3 (WAL mode), port 5000
- Client: React 19, Vite 8, Tailwind CSS v4, TypeScript (ESM), port 5173
- Desktop: Electron wrapper (`electron/main.cjs` + `electron/preload.cjs`)
- Database: `server/data/erp.db` — SQLite with auto-migrations on startup
- Tests: `tsx test/api.test.ts` — custom assertion framework, currently 117 passing tests

**What already exists (do NOT re-implement):**
- Boot amperage curve logger, 24-point rapid inspection, diode mode DB, TrueTone/BMS serializer sync
- Workstation queue dispatcher, customer-facing display (CFD), loaner phone management, OCR ID scanner
- 2.5D bin micro-locator, pick-to-light integration
- Automated SMS TxID matching (Vodafone Cash / InstaPay), dual-custody shift rebalancing, fintech ceiling alerts
- AI demand forecasting, fraud detection engine, dynamic pricing
- B2B fleet management, NPS/CSAT surveys, insurance claims module
- WebSerial API, HID barcode interceptor, ESC/POS thermal printing, Electron IPC printing
- JWT/RBAC auth, AES-256 encryption, cryptographic audit chain
- 34 server modules under `server/src/modules/`

---

## Requirements

### R1. Repair Lab & Technician Workflow — High-Impact Features

Implement the following in `server/src/modules/repair/` and `client/src/views/RepairLabView.tsx`
plus any new component files under `client/src/components/repair/`:

1. **Kanban Board (تفاعلي):** Add a Kanban view to RepairLabView.tsx with drag-and-drop columns
   (Received → Diagnosed → In Repair → QA → Ready → Delivered). Use @dnd-kit/core.
   Persist state changes to the existing repair tickets table via PATCH endpoint.

2. **QR Code Customer Tracking URL:** When a repair ticket is created/printed, generate a
   QR code linking to `<base_url>/portal/track?ticket=<ticket_number>`. Use the existing
   `bwip-js` package. The portal page must show status, technician name, and estimated ready date.

3. **Pre-Authorization WhatsApp Cost Approval:** Add a PATCH `/api/repairs/:id/send-estimate`
   endpoint that formats the diagnosis and cost estimate and triggers a WhatsApp notification
   (use the existing notification infrastructure). Record the customer response (approved/rejected)
   via a webhook or manual status update endpoint.

4. **SLA Escalation Auto-Alerts:** Add a cron-style check (run every 5 minutes via `setInterval`
   at server startup) that scans open tickets where `NOW() - created_at > sla_hours`. When
   breached, emit a WebSocket event `TICKET_SLA_BREACH` and update ticket priority to URGENT.

5. **Ticket Status Transition Validation:** Enforce allowed state machine transitions server-side
   in the PATCH ticket endpoint. Reject invalid transitions (e.g., RECEIVED → DELIVERED) with
   HTTP 422 and a clear error message.

6. **Post-Repair QA Checklist Enforcement:** Add a `qa_checklist` JSONB field to the tickets
   table. Create a `QAChecklistModal` component that must be completed before the status can
   be changed to READY. Backend must reject the status change if `qa_checklist` is null/empty.

7. **Repair Ticket Search by IMEI/Serial:** Add a dedicated search endpoint
   `GET /api/repairs/search?imei=<val>` with a composite index on `(imei_sn, status)`.
   Wire a search bar into RepairLabView.

8. **Photo Evidence Timeline:** Add a `ticket_photos` table with (ticket_id, url, stage, taken_at).
   Create a `PhotoTimelinePanel` component that shows Before/During/After photos in a timeline.
   Add upload endpoints using the existing upload module.

9. **Parts Out-of-Stock Warning at Ticket Creation:** When a technician selects a part for a
   ticket, call `GET /api/inventory/items/:id/stock` and show a prominent warning badge if
   stock quantity ≤ reorder point.

10. **Repair Notes Template Library:** Add a `repair_notes_templates` table and a UI picker
    in the ticket form. Templates are branch-specific and created by admins.

### R2. POS & Retail Sales — High-Impact Features

Implement in `server/src/modules/retail/` and `client/src/views/PosView.tsx`:

1. **Split Payment Multi-Method:** Allow a single invoice to be paid across multiple methods
   (Cash + Vodafone Cash + Card). Add `invoice_payments` table with (invoice_id, method, amount).
   UI must show per-method amount fields that sum to the invoice total.

2. **Installment Sales Engine:** Add an `installment_plans` table and `installment_payments`
   table. The POS flow must allow creating a sale with a down payment and a payment schedule.
   Add `GET /api/installments/:id/schedule` and send WhatsApp reminders 2 days before each
   due date via the existing notification module.

3. **Trade-In Device Valuation:** Add a `trade_in_assessments` table. Create a `TradeInModal`
   component that captures device condition, IMEI, and suggested trade-in value. Apply the
   trade-in credit against the current invoice.

4. **Dynamic Discount Engine:** Add a `discount_rules` table with conditions (min_qty,
   customer_tier, time_window, coupon_code) and effects (percent_off, amount_off). Evaluate
   rules server-side on POST to `/api/sales/cart/apply-discounts`. Enforce role-based discount
   limits (CASHIER ≤ 10%, MANAGER ≤ 30%, ADMIN unlimited).

5. **Return & Exchange Management:** Add RETURN flow: `POST /api/sales/:id/return` with items
   to return and reason code. Restore stock, create a credit note, and generate a refund
   transaction. Prevent returning more than originally sold.

6. **Tax Rounding & Precision Fix:** Replace all JavaScript floating-point arithmetic in
   tax/total calculations with integer-cent arithmetic (store amounts in piastres/millimes
   internally). Add a migration to convert existing money columns.

7. **Void Sale Audit Log:** Every call to DELETE or void on a sale must insert a record in
   `audit_log` with (action=VOID_SALE, user_id, sale_id, reason, timestamp). The reason field
   must be non-null.

8. **Negative Inventory Prevention:** Add a DB-level CHECK constraint and a server-side guard
   in the sale completion endpoint. Reject any sale line where the requested quantity > current
   stock. Return HTTP 409 with itemized stock errors.

9. **Cart State Persistence:** Persist the active cart to `sessionStorage` on every change.
   Restore the cart from `sessionStorage` on page load/refresh in PosView.

10. **IMEI Tracked Sales Strict Validation:** Before completing a sale of any phone-category item,
    verify `imei_records.status = 'IN_STOCK'` for the specific IMEI. Reject if not found or not
    IN_STOCK. Update `imei_records.status` to 'SOLD' on sale completion.

### R3. Inventory & Spare Parts — High-Impact Features

Implement in `server/src/modules/inventory/`, `server/src/modules/spare-parts/`, and
`client/src/views/SparePartsView.tsx` / `WarehouseView.tsx`:

1. **Negative Stock DB Constraint:** Add a migration to put `CHECK (stock_quantity >= 0)` on
   the items table. Add a server-side guard in all stock-decrement operations.

2. **Dead Stock Identification Report:** Add `GET /api/inventory/reports/dead-stock?days=90`
   that returns items with no movement in the specified period. Add a "Dead Stock" tab in
   SparePartsView with a sortable table and a "Mark for Clearance" action.

3. **Automatic Reorder Point Calculation:** Add a background job (run daily at midnight) that
   calculates `avg_daily_usage * lead_time_days * safety_factor` for each item and updates the
   `reorder_point` column. Expose `GET /api/inventory/items/:id/reorder-analysis`.

4. **Supplier Scorecard:** Add a `supplier_scores` table that tracks (on_time_rate, quality_rate,
   return_rate) per supplier, updated automatically when POs are received or returns processed.
   Add a Supplier Performance tab in the procurement view.

5. **Inter-Branch Stock Transfer Requests:** Add `stock_transfer_requests` table and endpoints:
   `POST /api/inventory/transfers` and `PATCH /api/inventory/transfers/:id/approve`. Emit
   WebSocket event on approval. Show pending transfers in WarehouseView.

6. **Item Full-Text Search (FTS5):** Add a SQLite FTS5 virtual table for items (name, sku,
   description). Use it in `GET /api/inventory/items/search?q=` for fast fuzzy matching.

7. **Cost Price History Preservation:** Replace the single `cost_price` column with a
   `item_cost_history` table (item_id, cost_price, effective_from, po_id). Use the most
   recent cost for FIFO calculations.

8. **Batch Goods Receipt Rollback:** Add `POST /api/procurement/receipts/:id/rollback` that
   reverses all stock increments from a goods receipt within a single DB transaction. Require
   MANAGER role.

9. **Inventory Valuation Report (FIFO):** Add `GET /api/inventory/reports/valuation?method=fifo`
   using the `item_cost_history` table. Show total value, cost per unit, and unrealized gain/loss.
   Add to ReportsView.

10. **Part Cross-Model Compatibility Map:** Add `item_compatibility` table (item_id, device_model,
    device_brand). In the item detail page, show a compatibility list. Add endpoints for
    CRUD of compatibility records.

### R4. Fintech & Financial Management — High-Impact Features

Implement in `server/src/modules/fintech/`, `server/src/modules/accounting/`, and
`client/src/views/FintechView.tsx` / `AccountingView.tsx`:

1. **Double-Entry Accounting Validation:** In every journal entry creation, validate that
   `SUM(debit_amounts) === SUM(credit_amounts)`. Reject with HTTP 422 if unbalanced.
   Add a DB trigger or application-level check.

2. **Wallet Balance Atomic Updates:** Wrap all wallet credit/debit operations in SQLite
   `BEGIN IMMEDIATE` transactions. Add an optimistic lock (wallet version field) to prevent
   concurrent balance corruption.

3. **Prevent Journal Entry Modification:** Once a journal entry status is 'POSTED', block
   all PATCH/DELETE operations on it. Return HTTP 403. Allow only ADMIN to create a
   reversal entry.

4. **Cash Flow Projection (30-Day):** Add `GET /api/fintech/cashflow/projection?days=30`
   that aggregates: incoming installments due, recurring expenses, outstanding supplier
   payables. Return a day-by-day projected balance array. Add a line chart in FintechView.

5. **Financial Approval Hierarchy for Large Payments:** Add an `approval_requests` table.
   Any payment > configurable threshold (default: 5000 EGP) must go through a multi-step
   approval (CASHIER → MANAGER → CFO) before execution. Show pending approvals in
   FintechView as a badge.

6. **Expense Management Module:** Add `expenses` table and full CRUD API. Categories are
   configurable. Attach receipt images via the existing upload module. Auto-post journal
   entries on expense approval.

7. **Customer Credit Limit Management:** Add `credit_limit` and `credit_used` fields to
   the customers table. Block sale completion via API if credit_used + new_sale_total >
   credit_limit. Show credit usage bar in the POS customer panel.

8. **FintechView Bundle Split:** Refactor `FintechView.tsx` (63KB) into focused sub-components
   using `React.lazy` + `Suspense`. Each tab (Wallets, Journal, Expenses, Approval) becomes
   a lazily loaded chunk.

9. **Bank Reconciliation Module:** Add `bank_statement_entries` table and import endpoint
   `POST /api/fintech/bank/import-csv`. Match entries against existing transactions by amount
   and date (±1 day tolerance). Show matched/unmatched counts in a reconciliation UI.

10. **Automatic Tax Withholding Calculator:** Add a `withholding_tax_rules` table (supplier_type,
    rate). On supplier payment creation, calculate and deduct withholding tax, post it to the
    correct liability account, and include it in the payment voucher PDF.

### R5. Security & DevOps — High-Impact Fixes

Implement cross-cutting improvements:

1. **SLA Timer Persistence:** Change the SLA check to use `tickets.sla_started_at` (DB column)
   not in-memory timestamps. Add the column via migration if missing.

2. **All Endpoints Feature-Flag Check:** Add `requireModule(moduleName)` middleware to every
   module router. If the module is disabled in business rules, return HTTP 503.

3. **Cascade Delete Protection:** Add FK constraints `ON DELETE RESTRICT` for tickets→customers,
   sale_items→items, and journal_entries→accounts using a migration.

4. **Pending Tests — Add 10+ New Test Cases:** In `test/api.test.ts`, add test suites for:
   - Split payments (suite 53)
   - Installment plan creation (suite 54)
   - Trade-in valuation (suite 55)
   - Negative stock prevention (suite 56)
   - Double-entry balance validation (suite 57)
   - Wallet atomic update (suite 58)
   - Ticket status transition validation (suite 59)
   - Dead stock report (suite 60)
   - SLA breach detection (suite 61)
   - Credit limit enforcement (suite 62)

5. **Rate Limiting Tightening:** Add stricter rate limits on `/api/fintech/transfer` (10 req/min),
   `/api/auth/login` (5 req/min), and `/api/repairs/:id/send-estimate` (20 req/hour).

6. **Concurrent Write Locking for Stock:** All stock decrement operations must use
   `BEGIN IMMEDIATE` transaction and re-validate stock within the transaction.

7. **PosView & SparePartsView Code Split:** Apply `React.lazy` to both views and their
   heavy modals to reduce initial bundle size below Vite's 500KB warning threshold.

---

## Acceptance Criteria

### Build & Type Safety
- [ ] `npm run build` in `client/` completes with 0 TypeScript errors and 0 Vite warnings
      about chunk size (after code splitting is applied)
- [ ] `npm run build` in `server/` or `npx tsc --noEmit` completes with 0 type errors

### Tests
- [ ] `tsx test/api.test.ts` runs and all previously passing 117 tests still pass
- [ ] At least 10 new test suites (suites 53–62) are added and all pass
- [ ] Total passing test count ≥ 127

### Database Integrity
- [ ] All new tables are created via migrations in `server/src/db/migrations/`
- [ ] Negative stock CHECK constraint is verified by a test (attempt to set quantity < 0
      must fail with a DB error)
- [ ] All FK constraints are in place (verified via `PRAGMA foreign_key_list` in a test)

### Feature Functionality
- [ ] Kanban board renders in RepairLabView with drag-and-drop working between 6 columns
- [ ] Split payment UI allows entering amounts for 3+ payment methods that sum correctly
- [ ] Installment plan creates a schedule with correct due dates and sends a WhatsApp
      notification (verifiable via the notification log table)
- [ ] Trade-in modal reduces invoice total by the assessed trade-in value
- [ ] Discount rules are evaluated correctly (≥1 test per discount type)
- [ ] Dead stock report returns items with no movement in 90 days
- [ ] Cashflow projection returns a 30-element array with day-by-day balances
- [ ] Journal entries with debit ≠ credit are rejected with HTTP 422
- [ ] IMEI sold status is updated to SOLD on sale completion

### Security
- [ ] Attempting a ticket status transition RECEIVED → DELIVERED returns HTTP 422
- [ ] Attempting to void a sale without a reason returns HTTP 400
- [ ] Attempting a payment > threshold without approval returns HTTP 403
- [ ] Rate limit on `/api/auth/login` returns HTTP 429 after 5 rapid requests

---

*Expecting this to run as a full project team — parallel agents per module (R1–R5).
All changes must target `c:\Users\Eng_Ahmed\Desktop\pro`.*
