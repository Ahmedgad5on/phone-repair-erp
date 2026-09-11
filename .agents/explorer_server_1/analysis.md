# Server & Database Architecture Analysis Report
**Author:** Server & DB Explorer (`explorer_server_1`)  
**Date:** 2026-09-10  
**Target Codebase:** `c:\Users\Eng_Ahmed\Desktop\pro\server`  
**Reference Document:** `c:\Users\Eng_Ahmed\Desktop\pro\ORIGINAL_REQUEST.md`  

---

## 1. Executive Summary

The backend system is a production-grade modular ERP platform built on **Node.js v24**, **Express 5**, **TypeScript (CommonJS)**, and **Better-SQLite3 (WAL Mode)**. It currently has:
- **34 module routers** mounted under `server/src/index.ts`
- A single monolithic migration script `server/src/db/migrations.ts` (1,812 lines, 72KB) defining ~50 tables
- A custom automated assertion test runner `server/test/api.test.ts` running 52 suites with **117 passing assertions** and 0 failures
- TypeScript compilation (`npx tsc --noEmit`) completing with **0 errors**

To satisfy the authoritative requirements in `ORIGINAL_REQUEST.md` (R1 through R5), the server and database layer require targeted enhancements across schema design, migration architecture, concurrency controls, validation state machines, and API endpoints. This analysis details the existing state, identifies architectural gaps, and maps every schema change, new migration file, table definition, and API route needed for clean implementation.

---

## 2. Server Architecture & Entry Point (`server/src/index.ts`)

### 2.1 Current Request Lifecycle & Middleware Pipeline
1. **Correlation ID Tracing (`server/src/middleware/correlation.ts`)**: Injects `x-correlation-id` header for distributed tracing.
2. **HTTPS Enforcement (`server/src/middleware/csrf.ts`)**: Redirects insecure traffic in production mode.
3. **Helmet Security Headers**: Configured with `crossOriginResourcePolicy: { policy: 'cross-origin' }`.
4. **CORS Configuration**: Supports `localhost:3000`, `localhost:5173`, and `process.env.CORS_ORIGIN`.
5. **JSON Body Parser**: Configured with `15mb` payload limit for image and document uploads.
6. **CSRF Protection**: Applied via `csrfProtection` middleware.
7. **XSS Input Sanitization**: Custom `sanitizeInput` strips script tags from request body.
8. **Rate Limiting (`express-rate-limit`)**:
   - General API limiter on `/api/`: `1000` requests per 15 minutes.
   - Auth limiter on `/api/auth/login`: currently `15` requests per 15 minutes (`ERP_CONSTANTS.RATE_LIMIT.AUTH_MAX_ATTEMPTS`).
9. **Database Bootstrap**: Calls `runMigrations()` and `seedDatabase()` synchronously on boot.
10. **WebSocket Gateway**: `wsService.init(server)` binds WebSocket handling to the HTTP server instance on `/ws`.
11. **Feature Flag Guard**: `requireModule` currently guards only 4 routes (`/api/repair`, `/api/retail`, `/api/spare-parts`, `/api/fintech`) and returns `HTTP 403`.
12. **APM & Health Check Endpoints**:
    - `/api/monitoring/metrics`: Memory, active WebSockets, cache stats, queue stats.
    - `/api/health`: Evaluates `PRAGMA quick_check;` and reports database file size and status.
13. **Scheduled Maintenance**: Incremental vacuum (`PRAGMA incremental_vacuum(500);`) and backup pruning (>30 days).
14. **Global Error Handler (`server/src/middleware/error-handler.ts`)**: RFC 7807 problem detail formatter.

### 2.2 Entry Point Deficiencies & Required Modifications
- **R5.2 (Feature Flag Middleware)**:
  - `requireModule` must be extracted to a reusable middleware file `server/src/middleware/feature-flag.ts`.
  - Must return **`HTTP 503` (Service Unavailable)** instead of `HTTP 403` when a module is disabled in business rules or store settings.
  - Must guard all modular routers (`/api/accounting`, `/api/inventory`, `/api/procurement`, etc.).
- **R5.5 (Rate Limiting Stricter Rules)**:
  - `/api/auth/login`: Tighten to `5` requests per minute (returning `HTTP 429` after 5 attempts).
  - `/api/fintech/transfer`: Add rate limit of `10` requests per minute.
  - `/api/repairs/:id/send-estimate`: Add rate limit of `20` requests per hour.
- **R1.4 & R5.1 (SLA Escalation Timer)**:
  - Add periodic background job (`setInterval`) running every 5 minutes at server boot.
  - Must query persistent DB column `repair_tickets.sla_started_at`.
  - On breach: updates ticket priority to `'URGENT'`, emits WebSocket event `'TICKET_SLA_BREACH'`, and executes business rule trigger.

---

## 3. Database Layer & Migration Strategy

### 3.1 Connection & SQLite Configuration (`server/src/db/database.ts`)
The connection is established using `better-sqlite3` targeting `server/data/erp.db`:
```ts
// Existing pragmas in server/src/db/database.ts:
db.pragma('journal_mode = WAL');         // High concurrency read-write
db.pragma('synchronous = NORMAL');        // SSD safety without fsync per transaction
db.pragma('cache_size = -64000');         // 64 MB memory cache
db.pragma('busy_timeout = 5000');         // 5s timeout on write locks
db.pragma('temp_store = MEMORY');          // Fast in-memory temp tables
db.pragma('foreign_keys = ON');           // Relational FK enforcement
```
*Assessment:* The SQLite tuning parameters are sound and properly optimized for high local concurrency.

### 3.2 Existing Migration Mechanism vs Acceptance Criteria Gap
- **Current State**: `server/src/db/migrations.ts` defines `runMigrations()`. At line 28, it creates:
  ```sql
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    executed_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  ```
  However, no records are ever inserted into `schema_migrations`. Furthermore, there is no `server/src/db/migrations/` subdirectory.
- **Acceptance Criterion Requirement**:
  > *"All new tables are created via migrations in `server/src/db/migrations/`"*
- **Recommended Architectural Solution**:
  1. Create directory `server/src/db/migrations/`.
  2. Implement an incremental migration runner in `server/src/db/migrations/index.ts` (or refactor `migrations.ts` to delegate to it).
  3. The runner reads applied versions from `schema_migrations`, executes pending migration scripts in numerical sequence inside `db.transaction()`, records `{ version, name, executed_at }`, and commits.
  4. Ensure backward compatibility: the initial baseline schema is recorded as version `1`, followed by discrete migrations `002_r1_repair.ts`, `003_r2_retail.ts`, `004_r3_inventory.ts`, `005_r4_fintech.ts`, `006_r5_security.ts`.

---

## 4. Module-by-Module Investigation (R1 – R5)

### 4.1 R1: Repair Lab & Technician Workflow
**Files:**
- `server/src/modules/repair/repair.router.ts` (796 lines)
- `server/src/repositories/repair.repository.ts` (326 lines)
- `server/src/modules/portal/portal.router.ts` (69 lines)

| Requirement | Current State | Required Schema Changes | Required API Additions / Modifications |
|---|---|---|---|
| **R1.1 Kanban Board** | Router has `PATCH /tickets/:id/status`, but no validation of sequential states. | None (uses `repair_tickets.status`). | Update `PATCH /api/repair/tickets/:id/status` to validate and persist transitions between: `RECEIVED` → `DIAGNOSED` → `IN_REPAIR` → `QA` → `READY` → `DELIVERED`. |
| **R1.2 QR Code Customer Tracking** | Tracking portal exists at `GET /api/portal/track/:query`. `bwip-js` is in `package.json` but unused. | Add helper or response field `tracking_qr_url` (Base64 data URI generated via `bwipjs.toBuffer`). | Expose `GET /api/repair/tickets/:id/tracking-qr` or include QR code in ticket intake response linking to `<base_url>/portal/track?ticket=<ticket_number>`. Enhance `portal.router.ts` to accept `?ticket=`. |
| **R1.3 WhatsApp Estimate Pre-Auth** | `WhatsAppService` exists, but no estimate pre-auth endpoint exists. | Add `estimate_status TEXT DEFAULT 'PENDING'` and `estimate_notes TEXT` to `repair_tickets`. | Add `PATCH /api/repair/tickets/:id/send-estimate` (and alias `/api/repairs/:id/send-estimate`). Formats diagnosis/cost and sends WhatsApp. Add `POST /api/repair/tickets/:id/estimate-response` to record approval/rejection. |
| **R1.4 SLA Escalation Auto-Alerts** | SLA deadline is stored at intake, but checks are only calculated on `GET /tickets` in-memory. | Add `sla_started_at TEXT` to `repair_tickets` (defaults to `created_at`). | Add background checker function `checkSlaEscalations()`. When `NOW() - sla_started_at > sla_hours` (or deadline breached), set `priority = 'URGENT'`, emit WebSocket event `TICKET_SLA_BREACH`, trigger business rules. |
| **R1.5 State Machine Transition Validation** | Any status can currently be set via `PATCH /tickets/:id/status` without validation. | None. | Validate transitions against `ALLOWED_TRANSITIONS` map. If invalid (e.g. `RECEIVED` → `DELIVERED`), reject with **HTTP 422 Unprocessable Entity**. |
| **R1.6 QA Checklist Enforcement** | Inspection table exists, but tickets table lacks structured QA checklist field. | Add `qa_checklist TEXT` (JSON) to `repair_tickets`. | In `PATCH /api/repair/tickets/:id/status`, if target is `READY` and `qa_checklist` is null/empty, reject with **HTTP 422**. Add `PATCH /api/repair/tickets/:id/qa-checklist` to save checklist. |
| **R1.7 Ticket Search by IMEI/Serial** | `GET /tickets` searches with multiple LIKE queries without composite index. | Add composite index: `idx_repair_tickets_imei_status ON repair_tickets(imei_sn, status)`. | Add dedicated endpoint `GET /api/repairs/search?imei=<val>` (and `/api/repair/search?imei=<val>`). |
| **R1.8 Photo Evidence Timeline** | `device_photos` exists at line 822 of migrations, but lacks dedicated ticket timeline structure. | Create table `ticket_photos (id TEXT PRIMARY KEY, ticket_id TEXT REFERENCES repair_tickets(id) ON DELETE CASCADE, url TEXT NOT NULL, stage TEXT NOT NULL, caption TEXT, taken_at TEXT DEFAULT CURRENT_TIMESTAMP)`. | Add `GET /api/repair/tickets/:id/photos` and `POST /api/repair/tickets/:id/photos`. |
| **R1.9 Parts Out-of-Stock Warning** | Inventory router has no lightweight stock status endpoint for ticket part selection. | None. | Add `GET /api/inventory/items/:id/stock` returning `{ id, name, stock_quantity, reorder_point, isLowStock, isOutOfStock }`. |
| **R1.10 Repair Notes Template Library** | No template library table exists. | Create table `repair_notes_templates (id TEXT PRIMARY KEY, branch_id TEXT DEFAULT 'WH-MAIN', title TEXT NOT NULL, content TEXT NOT NULL, category TEXT, created_by TEXT REFERENCES users(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP)`. | Add `GET /api/repair/notes-templates`, `POST /api/repair/notes-templates`, `DELETE /api/repair/notes-templates/:id`. |

---

### 4.2 R2: Retail POS & Sales
**Files:**
- `server/src/modules/retail/retail.router.ts` (556 lines)
- `server/src/repositories/sales.repository.ts` (338 lines)

| Requirement | Current State | Required Schema Changes | Required API Additions / Modifications |
|---|---|---|---|
| **R2.1 Split Payment Multi-Method** | `sales.payment_method` is a single string (e.g. `'CASH'`). | Create table `invoice_payments (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE, method TEXT NOT NULL, amount REAL NOT NULL, reference_number TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`. | In `POST /api/retail/sales`, accept `payments: Array<{ method, amount, reference_number }>`. Validate `SUM(amount) === total` (HTTP 422 if unbalanced). Insert into `invoice_payments`. Add `GET /api/retail/sales/:id/payments`. |
| **R2.2 Installment Sales Engine** | No installment tables or schedule calculation exists. | Create tables `installment_plans` and `installment_payments`. | Add `POST /api/retail/installments` (creates plan and schedule). Add `GET /api/installments/:id/schedule`. Add `POST /api/retail/installments/:id/pay`. Background job scans due dates 2 days prior and triggers WhatsApp reminder. |
| **R2.3 Trade-In Device Valuation** | No trade-in assessment table exists. | Create table `trade_in_assessments (id TEXT PRIMARY KEY, store_id TEXT REFERENCES stores(id), customer_id TEXT, sale_id TEXT, brand TEXT, model TEXT, imei TEXT, condition_grade TEXT, battery_health INTEGER, screen_condition TEXT, body_condition TEXT, functional_defects TEXT, assessed_value REAL NOT NULL, status TEXT DEFAULT 'ASSESSED', created_at TEXT DEFAULT CURRENT_TIMESTAMP)`. | Add `POST /api/retail/trade-in/assess` (calculates suggested trade-in value based on condition algorithms). Add `POST /api/retail/trade-in` (persists and links credit to sale). |
| **R2.4 Dynamic Discount Engine** | Discounts are calculated manually in `sales.router.ts` without rule evaluation. | Create table `discount_rules (id TEXT PRIMARY KEY, name TEXT NOT NULL, coupon_code TEXT, min_qty INTEGER DEFAULT 0, customer_tier TEXT, start_date TEXT, end_date TEXT, percent_off REAL DEFAULT 0, amount_off REAL DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`. | Add `POST /api/sales/cart/apply-discounts` (and `/api/retail/cart/apply-discounts`). Evaluate rules against cart. Enforce role limits: CASHIER ≤ 10%, MANAGER ≤ 30%, ADMIN unlimited. |
| **R2.5 Return & Exchange Management** | Void sale exists, but no partial return flow with credit note creation exists. | Create table `sale_returns (id TEXT PRIMARY KEY, sale_id TEXT REFERENCES sales(id), return_number INTEGER UNIQUE, credit_note_number TEXT, total_refund REAL NOT NULL, reason_code TEXT NOT NULL, created_by_user_id TEXT REFERENCES users(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP)`. Add `sale_return_items`. | Add `POST /api/sales/:id/return` (and `/api/retail/sales/:id/return`). Validates `returned_qty <= original_qty - previously_returned_qty`. Restores stock quantity and IMEI `IN_STOCK`, creates credit note, posts refund transaction. |
| **R2.6 Tax Rounding & Precision** | Calculations use native JS floating-point arithmetic (e.g. `subtotal - totalDiscount + tx`). | Ensure all monetary columns are stored and computed via integer piastres (cents). | Implement currency utility `server/src/utils/currency.ts` (`toPiastres`, `toEgp`, `calculateTaxPiastres`). Replace floating point math across `sales.router.ts` and `sales.repository.ts`. |
| **R2.7 Void Sale Audit Log** | `DELETE /sales/:id` does not validate reason and logs generic `'DELETE'` action. | None (`audit_log` table exists). | In `DELETE /api/retail/sales/:id` and `POST /api/retail/sales/:id/void`: validate non-empty `reason` in body (reject with **HTTP 400** if missing). Insert audit record with `action = 'VOID_SALE'`, `sale_id`, `user_id`, `reason`, `timestamp`. |
| **R2.8 Negative Inventory Prevention** | Line 164 of `retail.router.ts` uses `MAX(0, stock_quantity - ?)` which silently prevents negative numbers instead of rejecting the sale. | Add `CHECK (stock_quantity >= 0)` constraint to `items` table via table recreation migration. | In `POST /api/retail/sales`: use `db.transaction().immediate()`. Pre-check each item `stock_quantity >= requested_quantity`. If insufficient, reject with **HTTP 409 Conflict** and itemized error array. |
| **R2.9 Cart State Persistence** | Server-side cart draft already exists via `is_draft` flag. | None. | Client persists cart in `sessionStorage`. Server ensures draft sales can be rehydrated and converted. |
| **R2.10 Strict IMEI Validation** | Checks `IN_STOCK` on intake, but not inside transaction. | Add `ON DELETE RESTRICT` for `sale_items.item_id`. | Inside the sale completion transaction, verify `imei_records.status = 'IN_STOCK'`. Reject if not found or status != `'IN_STOCK'`. Update status to `'SOLD'` and set `sold_sale_id = saleId`. |

---

### 4.3 R3: Inventory, Spare Parts & Procurement
**Files:**
- `server/src/modules/inventory/inventory.router.ts` (276 lines)
- `server/src/modules/spare-parts/spare-parts.router.ts` (227 lines)
- `server/src/modules/procurement/procurement.router.ts` (146 lines)
- `server/src/repositories/inventory.repository.ts` (215 lines)

| Requirement | Current State | Required Schema Changes | Required API Additions / Modifications |
|---|---|---|---|
| **R3.1 Negative Stock DB Constraint** | `items.stock_quantity` has no CHECK constraint. | Add `CHECK (stock_quantity >= 0)` on `items`. | Migration executes atomic table rebuild in SQLite. Server guards all decrements inside `BEGIN IMMEDIATE`. |
| **R3.2 Dead Stock Identification Report** | No dead stock query endpoint exists. | Ensure `items.last_sold_date` column exists and is indexed. | Add `GET /api/inventory/reports/dead-stock?days=90`. Returns items with `stock_quantity > 0` and no sales or repairs in the past `days` period. |
| **R3.3 Automatic Reorder Point Calculation** | `reorder_point` column is not dynamically calculated. | Add `reorder_point INTEGER DEFAULT 5` to `items`. | Add daily calculation job: `avg_daily_usage * lead_time_days * safety_factor`. Expose `GET /api/inventory/items/:id/reorder-analysis`. |
| **R3.4 Supplier Scorecard** | No supplier scorecard aggregation table exists. | Create table `supplier_scores (id TEXT PRIMARY KEY, supplier_id TEXT, supplier_name TEXT NOT NULL, total_pos INTEGER DEFAULT 0, on_time_deliveries INTEGER DEFAULT 0, total_items_received INTEGER DEFAULT 0, rejected_items INTEGER DEFAULT 0, returned_items INTEGER DEFAULT 0, on_time_rate REAL DEFAULT 100.0, quality_rate REAL DEFAULT 100.0, return_rate REAL DEFAULT 0.0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`. | Update scores automatically on GRN receipt and RMA returns. Expose `GET /api/procurement/suppliers/scorecard`. |
| **R3.5 Inter-Branch Stock Transfer Requests** | Current `POST /transfers` immediately completes transfers without two-phase approval. | Create table `stock_transfer_requests (id TEXT PRIMARY KEY, request_number INTEGER UNIQUE, from_warehouse_id TEXT REFERENCES warehouses(id), to_warehouse_id TEXT REFERENCES warehouses(id), requested_by_user_id TEXT REFERENCES users(id), approved_by_user_id TEXT REFERENCES users(id), status TEXT DEFAULT 'PENDING', notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, approved_at TEXT)`. Add `stock_transfer_request_items`. | Add `POST /api/inventory/transfers` (creates request in `PENDING`). Add `PATCH /api/inventory/transfers/:id/approve` (validates stock, transfers items, updates status, emits WebSocket `STOCK_TRANSFER_APPROVED`). |
| **R3.6 Item Full-Text Search (FTS5)** | Items are searched using basic SQL `LIKE %...%`. | Create SQLite FTS5 virtual table `items_fts USING fts5(item_id UNINDEXED, name, sku, category, description)`. Create sync triggers on `items` INSERT/UPDATE/DELETE. | Add/update `GET /api/inventory/items/search?q=` using FTS5 `MATCH` query with fallback to LIKE. |
| **R3.7 Cost Price History Preservation** | `items` has single cost/purchase price column; historical costs overwritten. | Create table `item_cost_history (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, cost_price REAL NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, remaining_quantity INTEGER NOT NULL DEFAULT 1, effective_from TEXT DEFAULT CURRENT_TIMESTAMP, po_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`. | On PO goods receipt or purchase, insert new cost record. Update FIFO consumption logic to consume oldest remaining lots. |
| **R3.8 Batch Goods Receipt Rollback** | No GRN rollback endpoint exists. | Add `status TEXT DEFAULT 'ACCEPTED'` to `goods_received_notes`. | Add `POST /api/procurement/receipts/:id/rollback`. Require MANAGER role. In a single `BEGIN IMMEDIATE` transaction: reverse stock increments, set GRN status to `'ROLLED_BACK'`, record audit log. |
| **R3.9 Inventory Valuation Report (FIFO)** | `GET /valuation` uses Weighted Average Cost (WAC) only. | None (uses `item_cost_history`). | Add `GET /api/inventory/reports/valuation?method=fifo`. Traverses `item_cost_history` remaining quantities, computes total value, cost per unit, and unrealized gain/loss. |
| **R3.10 Part Cross-Model Compatibility Map** | `spare_parts_compatibility` exists with target brand/model, but `item_compatibility` table not standardized. | Create table `item_compatibility (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, device_brand TEXT NOT NULL, device_model TEXT NOT NULL, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`. | Add `GET /api/inventory/items/:id/compatibility`, `POST /api/inventory/items/:id/compatibility`, `DELETE /api/inventory/items/:id/compatibility/:compatId`. |

---

### 4.4 R4: Fintech & Financial Management
**Files:**
- `server/src/modules/fintech/fintech.router.ts` (336 lines)
- `server/src/modules/accounting/accounting.router.ts` (213 lines)
- `server/src/repositories/fintech.repository.ts` (190 lines)

| Requirement | Current State | Required Schema Changes | Required API Additions / Modifications |
|---|---|---|---|
| **R4.1 Double-Entry Validation** | `POST /journal-entries` currently returns HTTP 400 when unbalanced (line 80). | None. | In `POST /api/accounting/journal-entries`: if `SUM(debits) !== SUM(credits)`, return **HTTP 422 Unprocessable Entity** (with detailed imbalance breakdown). |
| **R4.2 Wallet Balance Atomic Updates** | Transactions use standard `db.transaction()`, but no version field for optimistic locking. | Add `version INTEGER DEFAULT 1` to `fintech_wallets`. | Wrap balance updates in `db.transaction().immediate()`. Check and increment `version`: `UPDATE fintech_wallets SET current_balance = ?, version = version + 1 WHERE id = ? AND version = ?`. If rows affected == 0, throw concurrency conflict. |
| **R4.3 Prevent Journal Entry Modification** | No PATCH/DELETE endpoints exist on `/journal-entries/:id`. | Add `ON DELETE RESTRICT` on `journal_entry_lines.account_id`. | Add `PATCH /api/accounting/journal-entries/:id` and `DELETE /api/accounting/journal-entries/:id`: return **HTTP 403 Forbidden** if status == `'POSTED'`. Add `POST /api/accounting/journal-entries/:id/reverse` (SuperAdmin/Manager only). |
| **R4.4 30-Day Cash Flow Projection** | No cash flow projection endpoint exists. | None (aggregates existing financial tables). | Add `GET /api/fintech/cashflow/projection?days=30`. Aggregates starting cash, daily installments due (`installment_payments`), recurring expenses (`expenses`), and supplier payables. Returns 30-day projection array. |
| **R4.5 Financial Approval Hierarchy (>5000 EGP)** | No multi-step approval workflow table exists. | Create table `approval_requests (id TEXT PRIMARY KEY, request_type TEXT NOT NULL, amount REAL NOT NULL, threshold_amount REAL DEFAULT 5000.0, requested_by_user_id TEXT REFERENCES users(id), required_role TEXT DEFAULT 'Manager', status TEXT DEFAULT 'PENDING', reference_module TEXT, reference_id TEXT, approved_by_user_id TEXT REFERENCES users(id), approved_at TEXT, rejection_reason TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`. | In payment/transfer endpoints, if `amount > 5000` and no approved request exists, return **HTTP 403 Forbidden**. Add `GET /api/fintech/approvals`, `POST /api/fintech/approvals`, `PATCH /api/fintech/approvals/:id/approve`, `PATCH /api/fintech/approvals/:id/reject`. |
| **R4.6 Expense Management Module** | No expenses table or expense routes exist. | Create tables `expenses` and `expense_categories`. | Add full CRUD: `GET /api/accounting/expenses`, `POST /api/accounting/expenses`, `GET /api/accounting/expenses/:id`, `PATCH /api/accounting/expenses/:id`, `DELETE /api/accounting/expenses/:id`. Add `PATCH /api/accounting/expenses/:id/approve` which auto-posts double-entry journal entry. |
| **R4.7 Customer Credit Limit Management** | `customers` table lacks `credit_limit` and `credit_used` fields. | Add `credit_limit REAL DEFAULT 0.0` and `credit_used REAL DEFAULT 0.0` to `customers`. | In POS sale completion, if payment is CREDIT/ON_ACCOUNT and `credit_used + sale_total > credit_limit`, reject with **HTTP 422**. Add `PATCH /api/core/customers/:id/credit-limit`. |
| **R4.8 FintechView Code Split** | Client-side bundle optimization (FintechView 63KB). | None. | Handled in client view decomposition using `React.lazy` + `Suspense`. |
| **R4.9 Bank Reconciliation Module** | No bank reconciliation table or CSV import endpoint exists. | Create table `bank_statement_entries (id TEXT PRIMARY KEY, bank_account_id TEXT, transaction_date TEXT NOT NULL, value_date TEXT, description TEXT NOT NULL, reference_number TEXT, debit REAL DEFAULT 0, credit REAL DEFAULT 0, balance REAL, status TEXT DEFAULT 'UNMATCHED', matched_transaction_id TEXT, matched_transaction_type TEXT, imported_at TEXT DEFAULT CURRENT_TIMESTAMP)`. | Add `POST /api/fintech/bank/import-csv`. Parses CSV, matches against transactions by amount and date (±1 day tolerance). Returns matched/unmatched count. Add `GET /api/fintech/bank/reconciliation-status`. |
| **R4.10 Automatic Tax Withholding Calculator** | No withholding tax table or calculation logic exists. | Create table `withholding_tax_rules (id TEXT PRIMARY KEY, supplier_type TEXT NOT NULL, rate REAL NOT NULL, description TEXT, threshold_amount REAL DEFAULT 300.0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`. | On supplier payment creation (>300 EGP threshold), calculate WHT (1% goods, 3% services, 5% professional), deduct from payment, post credit to Withholding Tax Payable liability account. |

---

### 4.5 R5: Security, Middleware & DevOps
**Files:**
- `server/src/index.ts`
- `server/src/middleware/auth.ts`
- `server/src/constants/erp.constants.ts`
- `server/test/api.test.ts` (690 lines)

| Requirement | Current State | Required Schema Changes | Implementation Blueprint |
|---|---|---|---|
| **R5.1 SLA Timer Persistence** | In-memory calculation; `repair_tickets` has `sla_deadline` but no `sla_started_at`. | Add column `sla_started_at TEXT` to `repair_tickets`. | Populate on ticket intake (`sla_started_at = CURRENT_TIMESTAMP`). Background SLA worker scans `sla_started_at` in persistent query. |
| **R5.2 All Endpoints Feature-Flag Check** | Inline `requireModule` covers only 4 modules and returns HTTP 403. | None. | Refactor into `server/src/middleware/feature-flag.ts`. Check `stores` table and active business rules. Return **HTTP 503** with `{ error, code: 'MODULE_DISABLED', module }`. Mount across all 34 module routers in `index.ts`. |
| **R5.3 Cascade Delete Protection** | Default FKs are CASCADE or unconstrained. | Table rebuilds to set `ON DELETE RESTRICT` on: (1) `repair_tickets.customer_id REFERENCES customers(id) ON DELETE RESTRICT`, (2) `sale_items.item_id REFERENCES items(id) ON DELETE RESTRICT`, (3) `journal_entry_lines.account_id REFERENCES chart_of_accounts(id) ON DELETE RESTRICT`. | Verify via `PRAGMA foreign_key_list('repair_tickets')`, `sale_items`, `journal_entry_lines`. |
| **R5.4 Pending Test Suites (53–62)** | 52 suites passing (117 tests). Suites 53–62 do not exist. | None. | Add test suites 53 to 62 in `server/test/api.test.ts` verifying: split payments (53), installments (54), trade-in (55), negative stock CHECK (56), double-entry HTTP 422 (57), wallet atomic lock (58), ticket state validation (59), dead stock report (60), SLA breach detection (61), credit limit enforcement (62). |
| **R5.5 Rate Limiting Tightening** | `authLimiter` allows 15 attempts / 15 min. No transfer or estimate limiters exist. | None. | In `server/src/constants/erp.constants.ts` and `index.ts`: (1) login limiter: 5 req/min (`max: 5, windowMs: 60000`), (2) fintech transfer limiter: 10 req/min, (3) estimate limiter: 20 req/hour. Return **HTTP 429** on breach. |
| **R5.6 Concurrent Write Locking for Stock** | `retail.router.ts` line 164 uses `MAX(0, stock_quantity - ?)` without immediate transaction. | None (enabled by SQLite WAL). | Wrap all stock decrement routines in `db.transaction(fn).immediate()`. Re-query stock within transaction before updating. |

---

## 5. Detailed Schema Evolution & Migration File Structure

To satisfy the acceptance criterion:
> *"All new tables are created via migrations in `server/src/db/migrations/`"*

We recommend organizing new schema changes into versioned migration modules located under `server/src/db/migrations/`:

```
server/src/db/
├── database.ts
├── seed.ts
├── migrations.ts                  <-- Migration runner & backward-compat wrapper
└── migrations/
    ├── 001_baseline_schema.ts     <-- Baseline tracking marker
    ├── 002_r1_repair_tables.ts    <-- ticket_photos, repair_notes_templates, qa_checklist, sla_started_at
    ├── 003_r2_retail_tables.ts    <-- invoice_payments, installment_plans, trade_in_assessments, discount_rules, sale_returns
    ├── 004_r3_inventory_tables.ts <-- items CHECK constraint, FTS5, supplier_scores, stock_transfer_requests, item_cost_history, item_compatibility
    ├── 005_r4_fintech_tables.ts   <-- fintech_wallets version, approval_requests, expenses, bank_statement_entries, withholding_tax_rules, customer credit fields
    └── 006_r5_security_fk.ts      <-- ON DELETE RESTRICT FK migrations
```

### 5.1 Migration Execution Engine
```ts
// server/src/db/migrations.ts (or migrations/index.ts)
export function runMigrations() {
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(r => r.version)
  );

  const migrations = [
    { version: 1, name: '001_baseline_schema', run: runBaselineSchema },
    { version: 2, name: '002_r1_repair_tables', run: runR1RepairMigration },
    { version: 3, name: '003_r2_retail_tables', run: runR2RetailMigration },
    { version: 4, name: '004_r3_inventory_tables', run: runR3InventoryMigration },
    { version: 5, name: '005_r4_fintech_tables', run: runR4FintechMigration },
    { version: 6, name: '006_r5_security_fk', run: runR5SecurityMigration },
  ];

  for (const m of migrations) {
    if (!applied.has(m.version)) {
      const tx = db.transaction(() => {
        m.run();
        db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
      });
      tx();
      console.log(`[Database] Successfully applied migration ${m.version}: ${m.name}`);
    }
  }
}
```

### 5.2 Table Definitions to Add

#### `ticket_photos`
```sql
CREATE TABLE IF NOT EXISTS ticket_photos (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES repair_tickets(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  stage TEXT NOT NULL, -- BEFORE, DURING, AFTER, INTAKE, QA
  caption TEXT,
  taken_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ticket_photos_ticket ON ticket_photos(ticket_id);
```

#### `repair_notes_templates`
```sql
CREATE TABLE IF NOT EXISTS repair_notes_templates (
  id TEXT PRIMARY KEY,
  branch_id TEXT DEFAULT 'WH-MAIN',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'GENERAL',
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### `invoice_payments`
```sql
CREATE TABLE IF NOT EXISTS invoice_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount REAL NOT NULL,
  reference_number TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
```

#### `installment_plans` & `installment_payments`
```sql
CREATE TABLE IF NOT EXISTS installment_plans (
  id TEXT PRIMARY KEY,
  sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  total_amount REAL NOT NULL,
  down_payment REAL NOT NULL,
  financed_amount REAL NOT NULL,
  interest_rate REAL DEFAULT 0.0,
  total_installments INTEGER NOT NULL,
  installment_frequency TEXT DEFAULT 'MONTHLY',
  status TEXT DEFAULT 'ACTIVE',
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS installment_payments (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  amount REAL NOT NULL,
  paid_amount REAL DEFAULT 0.0,
  status TEXT DEFAULT 'PENDING',
  paid_at TEXT,
  payment_method TEXT,
  reminder_sent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_installment_payments_plan_due ON installment_payments(plan_id, due_date);
```

#### `trade_in_assessments`
```sql
CREATE TABLE IF NOT EXISTS trade_in_assessments (
  id TEXT PRIMARY KEY,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id),
  sale_id TEXT REFERENCES sales(id),
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  imei TEXT NOT NULL,
  condition_grade TEXT NOT NULL,
  battery_health INTEGER DEFAULT 100,
  screen_condition TEXT,
  body_condition TEXT,
  functional_defects TEXT,
  assessed_value REAL NOT NULL,
  status TEXT DEFAULT 'ASSESSED',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### `discount_rules`
```sql
CREATE TABLE IF NOT EXISTS discount_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  coupon_code TEXT,
  min_qty INTEGER DEFAULT 0,
  customer_tier TEXT,
  start_date TEXT,
  end_date TEXT,
  percent_off REAL DEFAULT 0.0,
  amount_off REAL DEFAULT 0.0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### `sale_returns` & `sale_return_items`
```sql
CREATE TABLE IF NOT EXISTS sale_returns (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  return_number INTEGER UNIQUE NOT NULL,
  credit_note_number TEXT UNIQUE NOT NULL,
  total_refund REAL NOT NULL,
  reason_code TEXT NOT NULL,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  sale_item_id TEXT NOT NULL REFERENCES sale_items(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  imei TEXT,
  quantity INTEGER NOT NULL,
  refund_unit_price REAL NOT NULL,
  total_refund REAL NOT NULL
);
```

#### `items` CHECK Constraint Rebuild & FTS5
```sql
-- SQLite table rebuild to enforce stock_quantity >= 0:
PRAGMA foreign_keys = OFF;
CREATE TABLE items_new (
  id TEXT PRIMARY KEY,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  sku TEXT UNIQUE NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quality_grade TEXT,
  purchase_price REAL NOT NULL DEFAULT 0.0,
  wholesale_price REAL NOT NULL DEFAULT 0.0,
  retail_price REAL NOT NULL DEFAULT 0.0,
  bulk_price REAL NOT NULL DEFAULT 0.0,
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_limit INTEGER NOT NULL DEFAULT 2,
  reorder_point INTEGER DEFAULT 5,
  warranty_days INTEGER DEFAULT 0,
  days_idle INTEGER DEFAULT 0,
  warehouse_id TEXT,
  location_id TEXT,
  last_sold_date TEXT,
  cost_price REAL DEFAULT 0.0,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
INSERT INTO items_new SELECT id, store_id, sku, barcode, name, category, quality_grade,
  purchase_price, wholesale_price, retail_price, bulk_price, stock_quantity, min_limit,
  5, warranty_days, days_idle, warehouse_id, location_id, last_sold_date, cost_price, version,
  created_at, deleted_at FROM items;
DROP TABLE items;
ALTER TABLE items_new RENAME TO items;
CREATE INDEX idx_items_category_stock ON items(category, stock_quantity);
PRAGMA foreign_keys = ON;

-- FTS5 Virtual Table & Synchronization Triggers:
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  item_id UNINDEXED,
  name,
  sku,
  category,
  description
);
INSERT INTO items_fts(item_id, name, sku, category, description)
SELECT id, name, sku, category, '' FROM items WHERE deleted_at IS NULL;
```

#### `supplier_scores`
```sql
CREATE TABLE IF NOT EXISTS supplier_scores (
  id TEXT PRIMARY KEY,
  supplier_id TEXT,
  supplier_name TEXT NOT NULL,
  total_pos INTEGER DEFAULT 0,
  on_time_deliveries INTEGER DEFAULT 0,
  total_items_received INTEGER DEFAULT 0,
  rejected_items INTEGER DEFAULT 0,
  returned_items INTEGER DEFAULT 0,
  on_time_rate REAL DEFAULT 100.0,
  quality_rate REAL DEFAULT 100.0,
  return_rate REAL DEFAULT 0.0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### `stock_transfer_requests` & `stock_transfer_request_items`
```sql
CREATE TABLE IF NOT EXISTS stock_transfer_requests (
  id TEXT PRIMARY KEY,
  request_number INTEGER UNIQUE NOT NULL,
  from_warehouse_id TEXT REFERENCES warehouses(id),
  to_warehouse_id TEXT REFERENCES warehouses(id),
  requested_by_user_id TEXT REFERENCES users(id),
  approved_by_user_id TEXT REFERENCES users(id),
  status TEXT DEFAULT 'PENDING',
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS stock_transfer_request_items (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES stock_transfer_requests(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id),
  quantity INTEGER NOT NULL
);
```

#### `item_cost_history`
```sql
CREATE TABLE IF NOT EXISTS item_cost_history (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  cost_price REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  remaining_quantity INTEGER NOT NULL DEFAULT 1,
  effective_from TEXT DEFAULT CURRENT_TIMESTAMP,
  po_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cost_history_item ON item_cost_history(item_id, effective_from);
```

#### `item_compatibility`
```sql
CREATE TABLE IF NOT EXISTS item_compatibility (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  device_brand TEXT NOT NULL,
  device_model TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_item_compatibility_item ON item_compatibility(item_id);
```

#### `approval_requests`
```sql
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  request_type TEXT NOT NULL,
  amount REAL NOT NULL,
  threshold_amount REAL DEFAULT 5000.0,
  requested_by_user_id TEXT REFERENCES users(id),
  required_role TEXT DEFAULT 'Manager',
  status TEXT DEFAULT 'PENDING',
  reference_module TEXT,
  reference_id TEXT,
  approved_by_user_id TEXT REFERENCES users(id),
  approved_at TEXT,
  rejection_reason TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
```

#### `expenses` & `expense_categories`
```sql
CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  default_account_id TEXT REFERENCES chart_of_accounts(id),
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  payment_method TEXT DEFAULT 'CASH',
  receipt_url TEXT,
  status TEXT DEFAULT 'PENDING',
  approved_by_user_id TEXT REFERENCES users(id),
  journal_entry_id TEXT REFERENCES journal_entries(id),
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
```

#### `bank_statement_entries`
```sql
CREATE TABLE IF NOT EXISTS bank_statement_entries (
  id TEXT PRIMARY KEY,
  bank_account_id TEXT,
  transaction_date TEXT NOT NULL,
  value_date TEXT,
  description TEXT NOT NULL,
  reference_number TEXT,
  debit REAL DEFAULT 0.0,
  credit REAL DEFAULT 0.0,
  balance REAL,
  status TEXT DEFAULT 'UNMATCHED',
  matched_transaction_id TEXT,
  matched_transaction_type TEXT,
  imported_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bank_statement_status ON bank_statement_entries(status);
```

#### `withholding_tax_rules`
```sql
CREATE TABLE IF NOT EXISTS withholding_tax_rules (
  id TEXT PRIMARY KEY,
  supplier_type TEXT NOT NULL,
  rate REAL NOT NULL,
  description TEXT,
  threshold_amount REAL DEFAULT 300.0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 5.3 Column Alterations Summary
- `repair_tickets`:
  - `sla_started_at TEXT`
  - `qa_checklist TEXT`
  - `estimate_status TEXT DEFAULT 'NONE'`
- `customers`:
  - `credit_limit REAL DEFAULT 0.0`
  - `credit_used REAL DEFAULT 0.0`
- `fintech_wallets`:
  - `version INTEGER DEFAULT 1`
- `items`:
  - `reorder_point INTEGER DEFAULT 5`
  - `stock_quantity >= 0` (via CHECK constraint)

---

## 6. Complete API Route Additions & Modifications Map

| Module | Route | HTTP Method | Auth / Role | Description |
|---|---|---|---|---|
| **R1** | `/api/repairs/search` (and `/api/repair/search`) | `GET` | Authenticated | Search repair tickets by IMEI/serial with composite index |
| **R1** | `/api/repairs/:id/send-estimate` (and `/api/repair/tickets/:id/send-estimate`) | `PATCH` | Authenticated (Rate limit 20/hr) | Pre-auth WhatsApp estimate notification |
| **R1** | `/api/repairs/:id/estimate-response` | `POST` | Public / Webhook / Auth | Record customer estimate approval or rejection |
| **R1** | `/api/repair/tickets/:id/qa-checklist` | `PATCH` | Technician / Admin | Persist QA checklist completion |
| **R1** | `/api/repair/tickets/:id/photos` | `GET` | Authenticated | Fetch Before/During/After photo timeline |
| **R1** | `/api/repair/tickets/:id/photos` | `POST` | Authenticated | Add photo evidence to timeline |
| **R1** | `/api/repair/notes-templates` | `GET`, `POST` | Authenticated | List and create branch-specific notes templates |
| **R1** | `/api/repair/notes-templates/:id` | `DELETE` | Manager / Admin | Delete repair notes template |
| **R1** | `/api/repair/tickets/:id/status` | `PATCH` | Authenticated | Enforce allowed state transitions (HTTP 422 on invalid) and QA checklist requirement |
| **R2** | `/api/retail/sales/:id/payments` | `GET` | Authenticated | Retrieve multi-method split payment records |
| **R2** | `/api/retail/installments` | `POST` | Cashier / Manager | Create installment plan with schedule |
| **R2** | `/api/installments/:id/schedule` (and `/api/retail/installments/:id/schedule`) | `GET` | Authenticated | Get installment schedule and payment statuses |
| **R2** | `/api/retail/installments/:id/pay` | `POST` | Cashier / Manager | Pay an installment installment |
| **R2** | `/api/retail/trade-in/assess` | `POST` | Cashier / Manager | Calculate condition-based trade-in valuation |
| **R2** | `/api/retail/trade-in` | `POST` | Cashier / Manager | Record trade-in assessment and generate credit |
| **R2** | `/api/sales/cart/apply-discounts` (and `/api/retail/cart/apply-discounts`) | `POST` | Authenticated | Dynamic discount engine evaluating rules and role caps |
| **R2** | `/api/sales/:id/return` (and `/api/retail/sales/:id/return`) | `POST` | Cashier / Manager | Return items, restore stock, generate credit note |
| **R2** | `/api/retail/sales/:id` | `DELETE` | Manager / Admin | Void sale: requires `reason` in body (HTTP 400 if missing), logs `VOID_SALE` audit |
| **R3** | `/api/inventory/items/:id/stock` | `GET` | Authenticated | Quick stock & reorder point status check |
| **R3** | `/api/inventory/reports/dead-stock` | `GET` | Manager / Admin | Report items with no movement in N days (default 90) |
| **R3** | `/api/inventory/items/:id/reorder-analysis` | `GET` | Authenticated | Usage velocity and dynamic reorder calculation |
| **R3** | `/api/procurement/suppliers/scorecard` | `GET` | Manager / Admin | Supplier performance ratings (on-time, quality, return) |
| **R3** | `/api/inventory/transfers` | `POST` | Authenticated | Submit inter-branch stock transfer request |
| **R3** | `/api/inventory/transfers/:id/approve` | `PATCH` | Manager / Admin | Approve stock transfer, execute movement, emit WS |
| **R3** | `/api/inventory/items/search` | `GET` | Authenticated | Fast fuzzy full-text search via SQLite FTS5 |
| **R3** | `/api/procurement/receipts/:id/rollback` | `POST` | Manager / SuperAdmin | Batch rollback of goods received note in single transaction |
| **R3** | `/api/inventory/reports/valuation` | `GET` | Manager / Admin | FIFO inventory valuation using cost history |
| **R3** | `/api/inventory/items/:id/compatibility` | `GET`, `POST` | Authenticated | List and add cross-model compatibility mappings |
| **R3** | `/api/inventory/items/:id/compatibility/:compatId` | `DELETE` | Authenticated | Remove compatibility mapping |
| **R4** | `/api/accounting/journal-entries` | `POST` | Authenticated | Enforce `SUM(debit) == SUM(credit)` (HTTP 422 if unbalanced) |
| **R4** | `/api/accounting/journal-entries/:id` | `PATCH`, `DELETE` | Authenticated | Block modification if status is `'POSTED'` (HTTP 403) |
| **R4** | `/api/accounting/journal-entries/:id/reverse` | `POST` | SuperAdmin / Manager | Create reversal entry for a posted journal entry |
| **R4** | `/api/fintech/cashflow/projection` | `GET` | Manager / Admin | 30-day projected cash flow balance array |
| **R4** | `/api/fintech/approvals` | `GET`, `POST` | Authenticated | List and request payment approvals |
| **R4** | `/api/fintech/approvals/:id/approve` | `PATCH` | Manager / CFO | Approve payment >5000 EGP |
| **R4** | `/api/fintech/approvals/:id/reject` | `PATCH` | Manager / CFO | Reject payment approval request |
| **R4** | `/api/accounting/expenses` | `GET`, `POST` | Authenticated | CRUD for business expenses |
| **R4** | `/api/accounting/expenses/:id/approve` | `PATCH` | Manager / CFO | Approve expense and auto-post journal entry |
| **R4** | `/api/fintech/bank/import-csv` | `POST` | Accountant / Admin | Import bank statement CSV and auto-match transactions |
| **R4** | `/api/fintech/bank/reconciliation-status` | `GET` | Authenticated | Summary of matched vs unmatched bank records |
| **R4** | `/api/accounting/withholding-tax/rules` | `GET` | Authenticated | List Egyptian withholding tax rules |
| **R4** | `/api/accounting/withholding-tax/calculate` | `POST` | Authenticated | Calculate withholding tax deduction on supplier payout |
| **R5** | `/api/auth/login` | `POST` | Public | Stricter rate limit: 5 requests / min (HTTP 429) |
| **R5** | `/api/fintech/transfer` | `POST` | Authenticated | Stricter rate limit: 10 requests / min |

---

## 7. Test Suites 53–62 Implementation Blueprint (`server/test/api.test.ts`)

The existing test file `server/test/api.test.ts` runs 52 test suites yielding 117 passing assertions. The 10 required new suites must be appended cleanly:

1. **Test Suite 53: Split Payments**:
   - Create invoice with total 1,500 EGP.
   - Pay 500 Cash + 500 Card + 500 Vodafone Cash.
   - Verify all 3 records saved in `invoice_payments` and sum equals 1,500 EGP.
   - Verify attempt with sum != total fails with HTTP 422.
2. **Test Suite 54: Installment Plan Creation**:
   - Create sale with 30% down payment and 6 monthly installments.
   - Verify schedule dates generated at 30-day intervals.
   - Verify reminder check detects upcoming payments within 2-day window.
3. **Test Suite 55: Trade-In Valuation**:
   - Submit assessment for device in 'GOOD' condition with battery health 84%.
   - Verify assessed valuation is computed correctly and applied as invoice credit.
4. **Test Suite 56: Negative Stock Prevention**:
   - Attempt direct DB update `UPDATE items SET stock_quantity = -5 WHERE id = 'item-1'`.
   - Verify SQLite throws `SQLITE_CONSTRAINT_CHECK`.
   - Attempt sale requesting quantity > current stock. Verify rejected with HTTP 409.
5. **Test Suite 57: Double-Entry Balance Validation**:
   - Attempt journal entry with Debit 1000 EGP and Credit 900 EGP.
   - Verify server rejects with HTTP 422 and error code `DOUBLE_ENTRY_UNBALANCED`.
6. **Test Suite 58: Wallet Atomic Update & Optimistic Lock**:
   - Read wallet with `version = 1`.
   - Concurrent update attempt with stale `version = 1` after another update increments to 2.
   - Verify stale update throws concurrency conflict.
7. **Test Suite 59: Ticket Status Transition Validation**:
   - Attempt transition from `RECEIVED` directly to `DELIVERED`.
   - Verify server rejects with HTTP 422 and clear error message.
   - Verify valid transition `RECEIVED` → `DIAGNOSED` succeeds.
8. **Test Suite 60: Dead Stock Report**:
   - Query `GET /api/inventory/reports/dead-stock?days=90`.
   - Verify items with no movement in 90 days are identified accurately.
9. **Test Suite 61: SLA Breach Detection**:
   - Insert ticket with `sla_started_at` 48 hours ago and SLA limit 24 hours.
   - Execute SLA checker function.
   - Verify priority is escalated to `URGENT` and breach event recorded.
10. **Test Suite 62: Customer Credit Limit Enforcement**:
    - Set customer `credit_limit = 5000` and `credit_used = 4500`.
    - Attempt new credit sale of 1000 EGP.
    - Verify sale is blocked because `4500 + 1000 > 5000`.

---

## 8. Summary of Implementation Recommendations

1. **Keep Database Driver and Core Configuration**: Do not replace `better-sqlite3`. Retain WAL mode, NORMAL synchronous, 64MB cache, and `foreign_keys = ON`.
2. **Adopt Clean Migration Directory**: Create `server/src/db/migrations/` with discrete numbered files and track versions in `schema_migrations`.
3. **Use `db.transaction().immediate()`**: Ensure all stock decrements and wallet balance mutations use SQLite's immediate transaction locking to prevent race conditions.
4. **Use Integer Piastres for All POS Math**: Avoid JavaScript floating point rounding errors by computing subtotals, taxes, and discounts in integer cents before dividing by 100.
5. **Enforce State Validation at Controller Layer**: Both repair ticket state transitions and journal entry balance checks must be enforced strictly server-side, returning HTTP 422 on invalid input.
