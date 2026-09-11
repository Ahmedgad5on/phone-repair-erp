import type { Database } from 'better-sqlite3';
import { Migration } from './001_initial_extensions';

export const migration005: Migration = {
  version: 5,
  name: '005_fintech_r4',
  up: (db: Database) => {
    // 1. Multi-Step Payment Approval Requests (>5000 EGP)
    db.exec(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        id TEXT PRIMARY KEY,
        request_type TEXT NOT NULL,
        reference_id TEXT,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'EGP',
        status TEXT NOT NULL DEFAULT 'PENDING',
        current_level TEXT NOT NULL DEFAULT 'CASHIER',
        requested_by TEXT NOT NULL,
        approved_by TEXT,
        reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT
      );
    `);

    // 2. Operational Expense Management
    db.exec(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        expense_number TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        tax_amount REAL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'EGP',
        payment_method TEXT NOT NULL,
        receipt_url TEXT,
        description TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        approved_by TEXT,
        journal_entry_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Bank Statement Reconciliation Entries
    db.exec(`
      CREATE TABLE IF NOT EXISTS bank_statement_entries (
        id TEXT PRIMARY KEY,
        statement_date TEXT NOT NULL,
        reference TEXT,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        matched_transaction_id TEXT,
        match_status TEXT NOT NULL DEFAULT 'UNMATCHED',
        imported_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Statutory Withholding Tax (WHT) Rules
    db.exec(`
      CREATE TABLE IF NOT EXISTS withholding_tax_rules (
        id TEXT PRIMARY KEY,
        supplier_type TEXT NOT NULL UNIQUE,
        rate REAL NOT NULL,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1
      );
    `);
  }
};

export default migration005;
