## 2026-09-10T03:00:15Z

You are Worker M0 (Database Migrations & Common Infrastructure).
Your Working Directory: c:\Users\Eng_Ahmed\Desktop\pro\.agents\worker_m0_1
Authoritative Requirements: c:\Users\Eng_Ahmed\Desktop\pro\ORIGINAL_REQUEST.md
Master Plan: c:\Users\Eng_Ahmed\Desktop\pro\PROJECT.md
Detailed Investigation Report: c:\Users\Eng_Ahmed\Desktop\pro\.agents\explorer_server_1\analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Objective:
Implement Milestone M0:
1. Database Migrations directory:
   Create server/src/db/migrations/ directory and implement structured TypeScript migration scripts:
   - 001_initial_extensions.ts:
     * ALTER TABLE repair_tickets ADD COLUMN sla_started_at TEXT;
     * ALTER TABLE repair_tickets ADD COLUMN qa_checklist TEXT;
     * ALTER TABLE fintech_wallets ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
     * ALTER TABLE customers ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0;
     * ALTER TABLE customers ADD COLUMN credit_used REAL NOT NULL DEFAULT 0;
   - 002_repair_r1.ts:
     * CREATE TABLE IF NOT EXISTS ticket_photos (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, url TEXT NOT NULL, stage TEXT NOT NULL, taken_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id) ON DELETE CASCADE);
     * CREATE TABLE IF NOT EXISTS repair_notes_templates (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, branch_id TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
     * CREATE INDEX IF NOT EXISTS idx_repair_tickets_imei_status ON repair_tickets(imei_sn, status);
   - 003_retail_r2.ts:
     * CREATE TABLE IF NOT EXISTS invoice_payments (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, method TEXT NOT NULL, amount REAL NOT NULL, reference_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
     * CREATE TABLE IF NOT EXISTS installment_plans (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, customer_id TEXT NOT NULL, total_amount REAL NOT NULL, down_payment REAL NOT NULL, financed_amount REAL NOT NULL, interest_rate REAL NOT NULL DEFAULT 0, months INTEGER NOT NULL, monthly_amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
     * CREATE TABLE IF NOT EXISTS installment_payments (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, installment_no INTEGER NOT NULL, due_date TEXT NOT NULL, amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', paid_at TEXT, receipt_id TEXT, FOREIGN KEY (plan_id) REFERENCES installment_plans(id) ON DELETE CASCADE);
     * CREATE TABLE IF NOT EXISTS trade_in_assessments (id TEXT PRIMARY KEY, invoice_id TEXT, customer_id TEXT NOT NULL, device_model TEXT NOT NULL, imei TEXT NOT NULL, condition_grade TEXT NOT NULL, assessed_value REAL NOT NULL, applied_credit REAL NOT NULL, status TEXT NOT NULL DEFAULT 'APPLIED', assessed_by TEXT NOT NULL, assessed_at TEXT DEFAULT CURRENT_TIMESTAMP);
     * CREATE TABLE IF NOT EXISTS discount_rules (id TEXT PRIMARY KEY, name TEXT NOT NULL, condition_type TEXT NOT NULL, condition_value TEXT, min_qty INTEGER DEFAULT 0, customer_tier TEXT, time_start TEXT, time_end TEXT, coupon_code TEXT, effect_type TEXT NOT NULL, effect_value REAL NOT NULL, max_discount_pct REAL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
     * CREATE TABLE IF NOT EXISTS sale_returns (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, credit_note_number TEXT NOT NULL UNIQUE, total_refund_amount REAL NOT NULL, reason TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
     * CREATE TABLE IF NOT EXISTS sale_return_items (id TEXT PRIMARY KEY, return_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, refund_amount REAL NOT NULL, FOREIGN KEY (return_id) REFERENCES sale_returns(id) ON DELETE CASCADE);
   - 004_inventory_r3.ts:
     * CREATE TABLE IF NOT EXISTS supplier_scores (id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL UNIQUE, on_time_rate REAL NOT NULL DEFAULT 100.0, quality_rate REAL NOT NULL DEFAULT 100.0, return_rate REAL NOT NULL DEFAULT 0.0, total_orders INTEGER NOT NULL DEFAULT 0, last_updated TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (supplier_id) REFERENCES suppliers(id));
     * CREATE TABLE IF NOT EXISTS stock_transfer_requests (id TEXT PRIMARY KEY, transfer_number TEXT NOT NULL UNIQUE, from_branch_id TEXT NOT NULL, to_branch_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', requested_by TEXT NOT NULL, approved_by TEXT, requested_at TEXT DEFAULT CURRENT_TIMESTAMP, approved_at TEXT);
     * CREATE TABLE IF NOT EXISTS item_cost_history (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, cost_price REAL NOT NULL, effective_from TEXT DEFAULT CURRENT_TIMESTAMP, po_id TEXT, quantity_received INTEGER DEFAULT 0, FOREIGN KEY (item_id) REFERENCES items(id));
     * CREATE TABLE IF NOT EXISTS item_compatibility (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, device_brand TEXT NOT NULL, device_model TEXT NOT NULL, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (item_id) REFERENCES items(id));
     * CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(id UNINDEXED, name, sku, description, content='items', content_rowid='rowid');
     * Triggers to keep items_fts in sync on items insert/update/delete.
   - 005_fintech_r4.ts:
     * CREATE TABLE IF NOT EXISTS approval_requests (id TEXT PRIMARY KEY, request_type TEXT NOT NULL, reference_id TEXT, amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'EGP', status TEXT NOT NULL DEFAULT 'PENDING', current_level TEXT NOT NULL DEFAULT 'CASHIER', requested_by TEXT NOT NULL, approved_by TEXT, reason TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT);
     * CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, expense_number TEXT NOT NULL UNIQUE, category TEXT NOT NULL, amount REAL NOT NULL, tax_amount REAL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'EGP', payment_method TEXT NOT NULL, receipt_url TEXT, description TEXT NOT NULL, branch_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', approved_by TEXT, journal_entry_id TEXT, created_by TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
     * CREATE TABLE IF NOT EXISTS bank_statement_entries (id TEXT PRIMARY KEY, statement_date TEXT NOT NULL, reference TEXT, description TEXT NOT NULL, amount REAL NOT NULL, matched_transaction_id TEXT, match_status TEXT NOT NULL DEFAULT 'UNMATCHED', imported_at TEXT DEFAULT CURRENT_TIMESTAMP);
     * CREATE TABLE IF NOT EXISTS withholding_tax_rules (id TEXT PRIMARY KEY, supplier_type TEXT NOT NULL UNIQUE, rate REAL NOT NULL, description TEXT, is_active INTEGER NOT NULL DEFAULT 1);
   - 006_security_constraints.ts:
     * Enforce CHECK (stock_quantity >= 0) on items. (Rebuild items table carefully copying all columns and data, maintaining foreign keys and indices).
     * Enforce ON DELETE RESTRICT on tickets->customers, sale_items->items, journal_entries->accounts.
   - index.ts: Export all migrations in array.
2. Update server/src/db/migrations.ts:
   - Make runMigrations() call the migration files in server/src/db/migrations/ and record each applied version (1 to 6) in the schema_migrations table with executed_at.
3. Common Server Infrastructure:
   - Tighten rate limiting in server/src/constants/erp.constants.ts and server/src/index.ts:
     * /api/auth/login: 5 requests per minute
     * /api/fintech/transfer: 10 requests per minute
     * /api/repairs/:id/send-estimate: 20 requests per hour
   - Update requireModule middleware:
     * If module is disabled in business rules, return HTTP 503 (not 403) with { error: `Module ${moduleName} is disabled` }.
     * Export and attach requireModule cleanly to modules.

Verification:
- Run in server/: `npm test` -> All 117 existing tests MUST pass with 0 failures!
- Run in server/: `npx tsc --noEmit` -> Must complete with 0 errors!
- Document your changes, commands, and outputs in changes.md and handoff.md in your working directory.
- Send completion message to orchestrator.
