# Handoff Report: Server & Database Architecture Exploration
**Agent:** `explorer_server_1` (Server & DB Explorer)  
**Date:** 2026-09-10  
**Recipient:** Orchestrator & Backend Implementation Agents  

---

## 1. Observation

1. **Server Entry Point & Health**:
   - `server/src/index.ts:1-309`: Express 5 app mounting 34 routers.
   - Line 138-139: `runMigrations()` and `seedDatabase()` run synchronously on server boot.
   - Line 122-136: Rate limiting uses `ERP_CONSTANTS.RATE_LIMIT.AUTH_MAX_ATTEMPTS` (currently 15 attempts in `server/src/constants/erp.constants.ts:31`).
   - Line 145-159: `requireModule` is an inline function returning `HTTP 403` instead of `HTTP 503`, and only guards 4 routes (`/api/repair`, `/api/retail`, `/api/spare-parts`, `/api/fintech`).
   - Line 299-308: Server listens on `PORT = process.env.PORT || 5000`.

2. **Database Engine & Configuration**:
   - `server/src/db/database.ts:1-23`: Uses `better-sqlite3` targeting `server/data/erp.db`. Pragmas set WAL mode, NORMAL synchronous, 64MB cache, 5s busy timeout, MEMORY temp store, and `foreign_keys = ON`.
   - `server/src/db/migrations.ts:28-32`: Creates `schema_migrations` table:
     ```sql
     CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       executed_at TEXT DEFAULT CURRENT_TIMESTAMP
     );
     ```
     However, ripgrep across `server/src/db` confirms no records are ever inserted into `schema_migrations`.
   - Directory search confirms there is currently no `server/src/db/migrations/` subdirectory; the entire schema is in the single monolithic file `migrations.ts` (1,812 lines).

3. **Current Automated Tests**:
   - `server/test/api.test.ts:1-690`: Contains 52 test suites running against `better-sqlite3`.
   - Execution command `npx tsx test/api.test.ts` completed with exit code 0:
     ```
     ==============================================
     🏁 AUTOMATED TEST RESULTS: 117 PASSED, 0 FAILED
     ==============================================
     ```
   - TypeScript verification `npx tsc --noEmit` completed with exit code 0 and zero type errors.

4. **Module Gaps vs Authoritative Requirements**:
   - **R1 (Repair)**:
     - `repair.router.ts:189-238`: `PATCH /tickets/:id/status` does not validate status transitions (allowing arbitrary status jumps like `RECEIVED` → `DELIVERED`).
     - `repair_tickets` table (`migrations.ts:146-176`) lacks `sla_started_at` and `qa_checklist` columns.
     - `repair_notes_templates` and `ticket_photos` tables do not exist.
     - No search endpoint `GET /api/repairs/search?imei=` exists with `(imei_sn, status)` composite index.
   - **R2 (Retail)**:
     - `retail.router.ts:42-245`: Single payment method per sale (`sales.payment_method`). `invoice_payments`, `installment_plans`, `installment_payments`, `trade_in_assessments`, and `discount_rules` tables do not exist.
     - `retail.router.ts:164`: Stock deduction uses `MAX(0, stock_quantity - ?)`, silently preventing negative stock instead of rejecting with HTTP 409.
     - `items` table (`migrations.ts:108-126`) has no `CHECK (stock_quantity >= 0)` constraint.
     - `retail.router.ts:304-333`: `DELETE /sales/:id` does not validate a non-empty `reason` and logs generic action `'DELETE'` instead of `'VOID_SALE'`.
   - **R3 (Inventory & Procurement)**:
     - No dead stock endpoint (`GET /api/inventory/reports/dead-stock?days=90`).
     - No dynamic reorder point calculation job or endpoint (`GET /api/inventory/items/:id/reorder-analysis`).
     - No `supplier_scores`, `stock_transfer_requests`, `item_cost_history`, or `item_compatibility` tables exist.
     - No FTS5 virtual table for items.
     - No goods receipt rollback endpoint (`POST /api/procurement/receipts/:id/rollback`).
   - **R4 (Fintech & Accounting)**:
     - `accounting.router.ts:80`: Unbalanced journal entries currently return `HTTP 400` instead of `HTTP 422`.
     - `accounting.router.ts`: No `PATCH` or `DELETE` endpoints on `/journal-entries/:id` exist to prevent modifications to `'POSTED'` entries with `HTTP 403`.
     - `fintech_wallets` table (`migrations.ts:303-316`) lacks an optimistic concurrency `version` column.
     - No 30-day cash flow projection endpoint (`GET /api/fintech/cashflow/projection?days=30`).
     - No `approval_requests`, `expenses`, `expense_categories`, `bank_statement_entries`, or `withholding_tax_rules` tables exist.
     - `customers` table (`migrations.ts:92-105`) lacks `credit_limit` and `credit_used` fields.
   - **R5 (Security)**:
     - `repair_tickets` has no persistent `sla_started_at` column.
     - `ON DELETE RESTRICT` constraints are not yet in place on tickets→customers, sale_items→items, and journal_entries→accounts.
     - Rate limits on `/api/auth/login` allow 15 attempts instead of 5, and no rate limiters exist on `/api/fintech/transfer` (10/min) or `/api/repairs/:id/send-estimate` (20/hr).
     - Test suites 53 through 62 do not yet exist in `server/test/api.test.ts`.

---

## 2. Logic Chain

1. **Step 1 (Migration Structure Compliance)**:
   - *Premise*: Acceptance Criteria states: *"All new tables are created via migrations in `server/src/db/migrations/`"*.
   - *Observation*: `schema_migrations` table already exists in the database schema (`migrations.ts:28`), but no files exist in `server/src/db/migrations/`.
   - *Inference*: Creating `server/src/db/migrations/` with discrete numbered migration scripts and updating `runMigrations()` to track versions in `schema_migrations` satisfies this criterion cleanly without destabilizing existing data.

2. **Step 2 (Data Integrity via Table Rebuilds)**:
   - *Premise*: R3.1 requires `CHECK (stock_quantity >= 0)` on `items`, and R5.3 requires `ON DELETE RESTRICT` on key foreign keys.
   - *Observation*: SQLite ALTER TABLE does not support adding CHECK constraints or modifying foreign key actions on existing tables in-place.
   - *Inference*: A table rebuild migration using SQLite standard procedure (`PRAGMA foreign_keys=OFF; CREATE TABLE ..._new; INSERT INTO ..._new SELECT ...; DROP TABLE ...; ALTER TABLE ..._new RENAME TO ...; PRAGMA foreign_keys=ON;`) is necessary. This will enforce both `stock_quantity >= 0` and `ON DELETE RESTRICT` at the database engine level.

3. **Step 3 (Race Condition Prevention via Immediate Transactions)**:
   - *Premise*: R4.2 and R5.6 mandate atomic balance updates and concurrent write locking for stock.
   - *Observation*: Better-SQLite3 defaults to deferred transactions unless specified. WAL mode allows concurrent readers while blocking writers.
   - *Inference*: Wrapping stock decrement operations and fintech wallet mutations in `db.transaction(fn).immediate()` guarantees that write locks are acquired upfront, preventing race conditions and phantom updates.

4. **Step 4 (Validation Error Protocol Alignment)**:
   - *Premise*: Acceptance Criteria and R1.5/R4.1 explicitly mandate HTTP 422 for invalid status transitions and unbalanced journal entries, HTTP 400 for voiding sales without reason, HTTP 403 for large payments without approval or modifying posted journals, and HTTP 429 after 5 login attempts.
   - *Observation*: Existing controllers currently return HTTP 400 for unbalanced journal entries and lack status transition checks.
   - *Inference*: Adjusting HTTP status codes in the Express router handlers to exact specified codes (422, 403, 400, 409, 429, 503) is required to pass the test suite and acceptance criteria.

---

## 3. Caveats

1. **Existing Database File (`server/data/erp.db`)**:
   - The database file already exists on disk and contains seeded rows. Any table rebuild migration (`items`, `repair_tickets`) must copy existing rows across to prevent losing test seed records.
2. **Client-Side Dependency on Route Paths**:
   - Some requirements specify `/api/repairs/...` while the existing router is mounted as `/api/repair`.
   - *Recommendation*: Support both paths (e.g. mounting `repairRouter` at `/api/repair` and `/api/repairs` or creating express route aliases) to ensure both old and new client code and test scripts work seamlessly.
3. **FTS5 Virtual Table Support**:
   - SQLite FTS5 extension is standard in modern `better-sqlite3` builds, but triggers must maintain synchronization when rows are inserted, updated, or deleted in `items`.

---

## 4. Conclusion

The server architecture is solid, modular, and performant, with all 117 baseline tests passing and clean TypeScript compilation. The required features can be implemented without breaking existing capabilities by:
1. Creating `server/src/db/migrations/` to manage schema evolution via tracked migrations.
2. Rebuilding `items` with `CHECK (stock_quantity >= 0)` and foreign keys with `ON DELETE RESTRICT`.
3. Adding 12 new tables (`ticket_photos`, `repair_notes_templates`, `invoice_payments`, `installment_plans`, `installment_payments`, `trade_in_assessments`, `discount_rules`, `sale_returns`, `supplier_scores`, `stock_transfer_requests`, `item_cost_history`, `item_compatibility`, `approval_requests`, `expenses`, `bank_statement_entries`, `withholding_tax_rules`).
4. Enforcing HTTP 422 for status transitions and unbalanced journal entries, HTTP 403 for posted journals and unapproved large payments, HTTP 409 for negative stock requests, HTTP 400 for void without reason, HTTP 429 for rate limit breaches, and HTTP 503 for disabled modules.
5. Implementing Test Suites 53–62 in `server/test/api.test.ts` to expand passing test coverage from 117 to 127+ passing tests.

---

## 5. Verification Method

To independently verify these findings and confirm server baseline health:

1. **Verify Existing Passing Test Count (117 tests)**:
   ```powershell
   # In c:\Users\Eng_Ahmed\Desktop\pro\server
   npx tsx test/api.test.ts
   ```
   *Expected Output:* `🏁 AUTOMATED TEST RESULTS: 117 PASSED, 0 FAILED`

2. **Verify TypeScript Compilation (0 errors)**:
   ```powershell
   # In c:\Users\Eng_Ahmed\Desktop\pro\server
   npx tsc --noEmit
   ```
   *Expected Output:* Exit code 0, 0 errors.

3. **Verify Database Configuration & Schema Migrations Absence**:
   Inspect `server/src/db/database.ts` (lines 14–20) and verify PRAGMAs:
   - `journal_mode = WAL`
   - `foreign_keys = ON`
   Run query against `server/data/erp.db` to verify `schema_migrations` row count is 0:
   ```powershell
   node -e "const db = require('better-sqlite3')('server/data/erp.db'); console.log('Migrations count:', db.prepare('SELECT COUNT(*) as c FROM schema_migrations').get());"
   ```

4. **Invalidation Conditions**:
   - If `npx tsx test/api.test.ts` fails, baseline has been compromised.
   - If `items` table rejects existing seed data during rebuild, table schema definition must be reconciled.
