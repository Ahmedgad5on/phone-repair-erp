# Changes Summary — Worker M0 (Database Migrations & Common Infrastructure)

## 1. Structured Database Migrations (`server/src/db/migrations/`)
Created modular TypeScript migrations implementing all required schema extensions:

- **`001_initial_extensions.ts`**:
  - `repair_tickets`: Added `sla_started_at TEXT`, `qa_checklist TEXT`
  - `fintech_wallets`: Added `version INTEGER NOT NULL DEFAULT 1`
  - `customers`: Added `credit_limit REAL NOT NULL DEFAULT 0`, `credit_used REAL NOT NULL DEFAULT 0`
- **`002_repair_r1.ts`**:
  - Created `ticket_photos` table with cascade delete on `repair_tickets(id)`
  - Created `repair_notes_templates` table
  - Created composite index `idx_repair_tickets_imei_status` on `repair_tickets(imei_sn, status)`
- **`003_retail_r2.ts`**:
  - Created `invoice_payments` table
  - Created `installment_plans` and `installment_payments` tables
  - Created `trade_in_assessments` table
  - Created `discount_rules` table
  - Created `sale_returns` and `sale_return_items` tables
- **`004_inventory_r3.ts`**:
  - Ensured `suppliers` table definition exists
  - Created `supplier_scores` table referencing `suppliers(id)`
  - Created `stock_transfer_requests` table
  - Created `item_cost_history` table referencing `items(id)`
  - Created `item_compatibility` table referencing `items(id)`
  - Ensured `items.description` column exists
  - Created FTS5 virtual table `items_fts` with external content `'items'`
  - Created FTS synchronization triggers `items_fts_ai`, `items_fts_ad`, `items_fts_au`
- **`005_fintech_r4.ts`**:
  - Created `approval_requests` table for multi-step approval hierarchy
  - Created `expenses` table
  - Created `bank_statement_entries` table for reconciliation
  - Created `withholding_tax_rules` table
- **`006_security_constraints.ts`**:
  - Rebuilt `items` table to enforce `CHECK (stock_quantity >= 0)`, preserving all data, columns, indexes, and FTS triggers
  - Rebuilt `repair_tickets` to enforce `customer_id REFERENCES customers(id) ON DELETE RESTRICT`
  - Rebuilt `sale_items` to enforce `item_id REFERENCES items(id) ON DELETE RESTRICT`
  - Rebuilt `journal_entry_lines` to enforce `account_id REFERENCES chart_of_accounts(id) ON DELETE RESTRICT`
- **`index.ts`**:
  - Exported `Migration` interface and `migrations: Migration[]` array containing migrations 001 through 006.

## 2. Migration Execution Engine (`server/src/db/migrations.ts`)
- Updated `runMigrations()` to import `migrations` from `./migrations/index`.
- Query `schema_migrations` for applied versions.
- Sequentially execute pending migrations in transaction / order and record `{ version, name, executed_at }`.

## 3. Rate Limiting Hardening (`server/src/constants/erp.constants.ts` & `server/src/index.ts`)
- Updated `ERP_CONSTANTS.RATE_LIMIT`:
  - `AUTH_WINDOW_MS: 60 * 1000` (1 minute)
  - `AUTH_MAX_ATTEMPTS: 5` (5 requests / min)
  - `FINTECH_TRANSFER_WINDOW_MS: 60 * 1000` (1 minute)
  - `FINTECH_TRANSFER_MAX_REQUESTS: 10` (10 requests / min)
  - `REPAIR_ESTIMATE_WINDOW_MS: 60 * 60 * 1000` (1 hour)
  - `REPAIR_ESTIMATE_MAX_REQUESTS: 20` (20 requests / hour)
- Mounted rate limiters in `server/src/index.ts`:
  - `/api/auth/login` -> `authLimiter`
  - `/api/fintech/transfer` -> `fintechTransferLimiter`
  - `/api/repairs/:id/send-estimate`, `/api/repair/tickets/:id/send-estimate`, `/api/repair/:id/send-estimate` -> `repairEstimateLimiter`

## 4. Feature-Flag & Modular Middleware (`server/src/middleware/feature-flag.ts` & `server/src/index.ts`)
- Created `server/src/middleware/feature-flag.ts` implementing `requireModule`.
- Returns `HTTP 503` (Service Unavailable) with `{ error: 'Module <name> is disabled', code: 'MODULE_DISABLED', module: '<name>' }` if disabled by business rules or store settings.
- Attached `requireModule` cleanly across modular routers in `index.ts`.
