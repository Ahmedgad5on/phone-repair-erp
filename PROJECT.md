# Project: Modular ERP High-Impact System Evolution (R1–R5)

## Architecture
- **Server**: Node.js v24, Express 5, TypeScript (CommonJS), Better-SQLite3 (WAL mode) listening on port 5000.
  - Core database at `server/data/erp.db` with PRAGMAs: `journal_mode = WAL`, `foreign_keys = ON`, `synchronous = NORMAL`, `busy_timeout = 5000`.
  - Migration subsystem in `server/src/db/migrations/` executing sequentially and recorded in `schema_migrations`.
  - Modular routers mounted in `server/src/index.ts` under `/api/<module>`.
  - Concurrency control: Atomic transactions via `db.transaction(fn).immediate()` for stock decrements and wallet balance mutations; optimistic locking via version column on `fintech_wallets`.
- **Client**: React 19, Vite 8, Tailwind CSS v4, TypeScript (ESM) listening on port 5173.
  - Route-level and view-level code splitting using `React.lazy` and `React.Suspense` to guarantee all bundles remain under Vite's 500KB warning threshold.
  - Interactive UI with `@dnd-kit/core` for drag-and-drop repair Kanban, `bwip-js` for QR customer tracking, and modular state management with sessionStorage and Zustand.
- **Testing**: In-process assertion framework in `server/test/api.test.ts` preserving all existing 52 suites (117 tests) and introducing suites 53–62 (+security tests) for total >= 127 passing tests.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | DB Migration Subsystem | Dedicated migration files 001-006 in `server/src/db/migrations/` recorded in `schema_migrations` | M0 | Acceptance Criteria § Database |
| 2 | Items Negative Stock Constraint | Table rebuild with `CHECK (stock_quantity >= 0)` | M0 | R3.1, R5.6 |
| 3 | Cascade Delete Protection | Foreign keys `ON DELETE RESTRICT` on tickets->customers, sale_items->items, journal_entries->accounts | M0 | R5.3 |
| 4 | All Endpoints Feature-Flag Check | `requireModule(moduleName)` middleware returning HTTP 503 if disabled | M0 | R5.2 |
| 5 | Rate Limiting Tightening | `/api/auth/login` (5/min), `/api/fintech/transfer` (10/min), `/api/repairs/:id/send-estimate` (20/hr) | M0 | R5.5 |
| 6 | Repair Kanban Board | Interactive drag-and-drop 6-column board with @dnd-kit/core in `RepairLabView.tsx` | M1 | R1.1 |
| 7 | QR Code Customer Tracking URL | Generate QR code with `bwip-js` linking to `/portal/track?ticket=...` with public tracking page | M1 | R1.2 |
| 8 | Pre-Auth WhatsApp Cost Estimate | `PATCH /api/repairs/:id/send-estimate` formatting diagnosis/estimate and customer response endpoint | M1 | R1.3 |
| 9 | SLA Escalation Auto-Alerts | 5-minute background check for breached tickets emitting `TICKET_SLA_BREACH` and setting priority URGENT | M1 | R1.4 |
| 10 | Ticket Status Transition Validation | Server-side state machine on `PATCH /tickets/:id/status` returning HTTP 422 on invalid transitions | M1 | R1.5 |
| 11 | Post-Repair QA Checklist | `qa_checklist` JSONB column, `QAChecklistModal`, rejection with HTTP 422 if missing before READY | M1 | R1.6 |
| 12 | Repair Ticket Search by IMEI | `GET /api/repairs/search?imei=<val>` with composite index `(imei_sn, status)` and search bar | M1 | R1.7 |
| 13 | Photo Evidence Timeline | `ticket_photos` table, upload endpoints, and `PhotoTimelinePanel` (Before/During/After) | M1 | R1.8 |
| 14 | Parts Out-of-Stock Warning | Warning badge in ticket creation form when part stock <= reorder point | M1 | R1.9 |
| 15 | Repair Notes Template Library | `repair_notes_templates` table and UI picker in ticket form | M1 | R1.10 |
| 16 | SLA Timer Persistence | Persistent `tickets.sla_started_at` column used for SLA breach calculations | M1 | R5.1 |
| 17 | Split Payment Multi-Method | `invoice_payments` table, multi-method payment support summing to invoice total | M2 | R2.1 |
| 18 | Installment Sales Engine | `installment_plans` & `installment_payments` tables, schedule endpoint, WhatsApp notification log | M2 | R2.2 |
| 19 | Trade-In Device Valuation | `trade_in_assessments` table, `TradeInModal`, reducing invoice total by trade-in credit | M2 | R2.3 |
| 20 | Dynamic Discount Engine | `discount_rules` table, rule evaluation endpoint, role limits (CASHIER <=10%, MANAGER <=30%) | M2 | R2.4 |
| 21 | Return & Exchange Management | `POST /api/sales/:id/return`, stock restoration, credit note, refund transaction, over-return guard | M2 | R2.5 |
| 22 | Tax Rounding & Precision Fix | Integer-cent arithmetic (piastres/millimes) for tax/totals | M2 | R2.6 |
| 23 | Void Sale Audit Log | Required non-null reason in void sale, action `VOID_SALE` in `audit_log`, HTTP 400 if reason missing | M2 | R2.7 |
| 24 | Negative Inventory Prevention | Server-side guard returning HTTP 409 with itemized stock errors if quantity > stock | M2 | R2.8 |
| 25 | Cart State Persistence | Active cart persisted to `sessionStorage` on changes and restored on page load | M2 | R2.9 |
| 26 | Strict IMEI Stock Validation | Verify IMEI status is 'IN_STOCK' before completing sale; update to 'SOLD' on completion | M2 | R2.10 |
| 27 | Dead Stock Identification Report | `GET /api/inventory/reports/dead-stock?days=90`, "Dead Stock" tab in UI with clearance action | M3 | R3.2 |
| 28 | Automatic Reorder Calculation | Daily midnight calculation job and `GET /api/inventory/items/:id/reorder-analysis` | M3 | R3.3 |
| 29 | Supplier Scorecard | `supplier_scores` table tracking on-time, quality, return rates; UI tab in procurement | M3 | R3.4 |
| 30 | Inter-Branch Stock Transfers | `stock_transfer_requests` table, request & approve endpoints, WebSocket emit, WarehouseView UI | M3 | R3.5 |
| 31 | Item Full-Text Search (FTS5) | SQLite FTS5 virtual table for items (name, sku, description) for fast fuzzy matching | M3 | R3.6 |
| 32 | Cost Price History (FIFO) | `item_cost_history` table (item_id, cost_price, effective_from, po_id) for FIFO valuation | M3 | R3.7 |
| 33 | Batch Goods Receipt Rollback | `POST /api/procurement/receipts/:id/rollback` reversing stock in single transaction (MANAGER only) | M3 | R3.8 |
| 34 | FIFO Inventory Valuation Report | `GET /api/inventory/reports/valuation?method=fifo` and UI display in ReportsView | M3 | R3.9 |
| 35 | Part Cross-Model Compatibility Map | `item_compatibility` table, CRUD endpoints, and compatibility list in item detail UI | M3 | R3.10 |
| 36 | Double-Entry Accounting Validation | Server validation `SUM(debit) == SUM(credit)`, returning HTTP 422 on unbalanced entry | M4 | R4.1 |
| 37 | Wallet Balance Atomic Updates | `BEGIN IMMEDIATE` transaction and optimistic locking `version` column | M4 | R4.2 |
| 38 | Prevent Posted Journal Modification | Block PATCH/DELETE on 'POSTED' journal entries with HTTP 403; allow only ADMIN reversal | M4 | R4.3 |
| 39 | 30-Day Cash Flow Projection | `GET /api/fintech/cashflow/projection?days=30` and line chart in FintechView | M4 | R4.4 |
| 40 | Financial Approval Hierarchy | `approval_requests` table, payments >5000 EGP requiring approval (HTTP 403 if unapproved), UI badge | M4 | R4.5 |
| 41 | Expense Management Module | `expenses` table, full CRUD API, receipt image upload, auto-post journal entries on approval | M4 | R4.6 |
| 42 | Customer Credit Limit Management | `credit_limit` & `credit_used` in customers table, block sale if exceeded, POS credit usage bar | M4 | R4.7 |
| 43 | FintechView Bundle Split | Refactor 63KB monolith into 7 focused sub-tabs under `views/fintech/` with React.lazy + Suspense | M4 | R4.8 |
| 44 | Bank Reconciliation Module | `bank_statement_entries` table, CSV import endpoint with ±1 day matching, reconciliation UI | M4 | R4.9 |
| 45 | Withholding Tax Calculator | `withholding_tax_rules` table, automatic deduction on supplier payments, PDF voucher integration | M4 | R4.10 |
| 46 | PosView & SparePartsView Code Split | `React.lazy` + Suspense in `App.tsx` and modal code splitting | M5 | R5.7 |
| 47 | Vite Manual Chunks & Bundle Optimization | `manualChunks` in `vite.config.ts`, reducing index.js to <80KB and eliminating >500KB warnings | M5 | Acceptance Criteria § Build |
| 48 | E2E Test Suite Expansion (Suites 53-62) | 10+ new test suites in `server/test/api.test.ts` expanding coverage from 117 to >=127 passing tests | M6 | R5.4 |
| 49 | Negative Stock Test Assertion | Dedicated test attempting stock < 0 asserting database CHECK error | M6 | Acceptance Criteria § DB |
| 50 | Forensic Integrity Audit & Final Verification | Build & test verification, forensic audit ensuring zero cheating, hardcoded strings, or mocks | M7 | Acceptance Criteria & Audit |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | DB Migrations & Common Infra | Migrations 001-006, CHECK constraints, FK ON DELETE RESTRICT, requireModule middleware, rate limiters | none | DONE |
| M1 | Repair Lab & Technician Workflow | R1.1–R1.10 & R5.1 (Kanban, QR tracking, WhatsApp pre-auth, SLA cron, state machine, QA checklist, search, photos, templates) | M0 | DONE |
| M2 | POS & Retail Sales | R2.1–R2.10 (Split payments, installments, trade-in, dynamic discounts, returns, integer-cent tax, void audit, negative stock guard, cart session, IMEI validation) | M0 | DONE |
| M3 | Inventory & Spare Parts | R3.1–R3.10 (Dead stock, auto reorder calculation, supplier scorecard, transfers, FTS5, cost history FIFO, receipt rollback, valuation report, compatibility map) | M0 | DONE |
| M4 | Fintech & Financial Management | R4.1–R4.10 (Double-entry 422, atomic wallet lock, posted journal lock 403, 30-day cashflow, approval >5000 403, expenses CRUD, customer credit limit, FintechView split, bank reconciliation, withholding tax) | M0 | DONE |
| M5 | Client Bundle Splitting & Vite Config | Vite manualChunks, React.lazy + Suspense for PosView, SparePartsView, RepairLabView, all views under 500KB | none | DONE |
| M6 | E2E Test Suite Expansion | Suites 53–62 in `test/api.test.ts` covering all R1–R5 endpoints and security rules, passing >=127 tests | M0, M1, M2, M3, M4 | DONE |
| M7 | Final E2E Build, Verification & Audit Gate | `npm run build` in client (0 errors, 0 warnings), `npm run build` in server (0 errors), `npm test` >=127 passing tests, Forensic Auditor CLEAN verdict | M5, M6 | DONE |

## Interface Contracts
### Client ↔ Server Common Conventions
- Success Response: `{ success: true, data: ... }` or array/object payload.
- Validation Rejection: HTTP 422 with `{ error: "..." }`.
- Permission / Security Rejection: HTTP 403 with `{ error: "..." }`.
- Bad Request (e.g. missing reason): HTTP 400 with `{ error: "..." }`.
- Conflict (e.g. negative stock deficit): HTTP 409 with `{ error: "...", items: [...] }`.
- Rate Limit Rejection: HTTP 429 with `{ error: "..." }`.
- Disabled Module Rejection: HTTP 503 with `{ error: "Module <name> is disabled" }`.

### Module R1 (Repair) Endpoints:
- `PATCH /api/repairs/:id/status` or `/api/repair/tickets/:id/status`: Body `{ status: string, qa_checklist?: object }`. Returns 422 on invalid transition or missing QA checklist before READY.
- `GET /api/repairs/search?imei=<val>`: Returns matching tickets using composite index `(imei_sn, status)`.
- `PATCH /api/repairs/:id/send-estimate`: Body `{ cost_estimate: number, diagnosis: string }`. Returns `{ success: true, notification_id: string }`.
- `GET /api/repairs/templates`: Returns array of repair notes templates.

### Module R2 (Retail POS) Endpoints:
- `POST /api/sales`: Body supports `payments: [{ method: string, amount: number }]` and `trade_in?: { device_model: string, imei: string, value: number }`. Validates IMEI status is `IN_STOCK` and updates to `SOLD`. Returns 409 if requested quantity > current stock.
- `POST /api/sales/:id/return`: Body `{ items: [{ item_id: string, quantity: number, refund_amount: number }], reason: string }`. Restores stock and creates credit note.
- `DELETE /api/sales/:id`: Body `{ reason: string }`. Requires non-empty reason; returns 400 if missing. Logs `VOID_SALE` in `audit_log`.
- `POST /api/sales/cart/apply-discounts`: Body `{ cart: object, customer_tier?: string, coupon_code?: string }`. Evaluates discount rules with role limits.

### Module R3 (Inventory) Endpoints:
- `GET /api/inventory/reports/dead-stock?days=90`: Returns items without stock movements in last 90 days.
- `GET /api/inventory/items/:id/reorder-analysis`: Returns calculated reorder point, avg daily usage, lead time.
- `POST /api/inventory/transfers`: Body `{ from_branch_id: string, to_branch_id: string, item_id: string, quantity: number }`.
- `PATCH /api/inventory/transfers/:id/approve`: Approves transfer and decrements/increments branch stock atomically.
- `GET /api/inventory/items/search?q=<val>`: FTS5 fast search.
- `POST /api/procurement/receipts/:id/rollback`: Reverses all stock increments from goods receipt (MANAGER only).

### Module R4 (Fintech & Accounting) Endpoints:
- `POST /api/accounting/journal-entries`: Validates `SUM(debit) == SUM(credit)`. Returns 422 if unbalanced.
- `PATCH /api/accounting/journal-entries/:id` and `DELETE /api/accounting/journal-entries/:id`: Returns 403 if status is 'POSTED'.
- `GET /api/fintech/cashflow/projection?days=30`: Returns 30-day array of daily projected balances.
- `POST /api/fintech/approval-requests`: Multi-step approval for payments > 5000 EGP.
- `GET /api/fintech/approval-requests/pending`: Returns pending approvals for badge in UI.
- `POST /api/fintech/bank/import-csv`: Parses bank CSV and matches transactions within ±1 day tolerance.

## Code Layout
- `server/src/db/migrations/`: Directory of numbered migrations (001_initial_extensions.ts, 002_repair_r1.ts, etc.)
- `server/src/modules/repair/`: Repair lab router, controller, service, state machine.
- `server/src/modules/retail/`: POS sales, split payments, installments, trade-in, discount engine.
- `server/src/modules/inventory/`: Inventory, dead stock, FTS5 search, reorder calculator.
- `server/src/modules/procurement/`: Goods receipts, supplier scorecards.
- `server/src/modules/fintech/`: Wallets, cash flow projection, approval hierarchy, bank reconciliation.
- `server/src/modules/accounting/`: Double-entry journal, posted entry guard, withholding tax.
- `server/src/middleware/`: requireModule, rate limiters, auth.
- `client/src/components/repair/`: KanbanBoard.tsx, QAChecklistModal.tsx, PhotoTimelinePanel.tsx, NotesTemplatePicker.tsx.
- `client/src/components/retail/`: SplitPaymentModal.tsx, InstallmentSalesModal.tsx, TradeInModal.tsx.
- `client/src/views/fintech/`: Decomposed sub-tabs for Wallets, Ledger, CashFlow, Expenses, Approvals, BankReconciliation.
- `server/test/api.test.ts`: Test suites 1-62.
