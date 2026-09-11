import type { Database } from 'better-sqlite3';
import { Migration } from './001_initial_extensions';

export const migration003: Migration = {
  version: 3,
  name: '003_retail_r2',
  up: (db: Database) => {
    // 1. Multi-Method Split Invoice Payments
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        method TEXT NOT NULL,
        amount REAL NOT NULL,
        reference_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Installment Plans
    db.exec(`
      CREATE TABLE IF NOT EXISTS installment_plans (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        total_amount REAL NOT NULL,
        down_payment REAL NOT NULL,
        financed_amount REAL NOT NULL,
        interest_rate REAL NOT NULL DEFAULT 0,
        months INTEGER NOT NULL,
        monthly_amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Installment Payments Schedule
    db.exec(`
      CREATE TABLE IF NOT EXISTS installment_payments (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        installment_no INTEGER NOT NULL,
        due_date TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        paid_at TEXT,
        receipt_id TEXT,
        FOREIGN KEY (plan_id) REFERENCES installment_plans(id) ON DELETE CASCADE
      );
    `);

    // 4. Trade-In Device Valuation & Credit
    db.exec(`
      CREATE TABLE IF NOT EXISTS trade_in_assessments (
        id TEXT PRIMARY KEY,
        invoice_id TEXT,
        customer_id TEXT NOT NULL,
        device_model TEXT NOT NULL,
        imei TEXT NOT NULL,
        condition_grade TEXT NOT NULL,
        assessed_value REAL NOT NULL,
        applied_credit REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'APPLIED',
        assessed_by TEXT NOT NULL,
        assessed_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Dynamic Tiered Discount Rules Engine
    db.exec(`
      CREATE TABLE IF NOT EXISTS discount_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        condition_type TEXT NOT NULL,
        condition_value TEXT,
        min_qty INTEGER DEFAULT 0,
        customer_tier TEXT,
        time_start TEXT,
        time_end TEXT,
        coupon_code TEXT,
        effect_type TEXT NOT NULL,
        effect_value REAL NOT NULL,
        max_discount_pct REAL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. Partial/Full Sale Returns & Credit Notes
    db.exec(`
      CREATE TABLE IF NOT EXISTS sale_returns (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        credit_note_number TEXT NOT NULL UNIQUE,
        total_refund_amount REAL NOT NULL,
        reason TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. Returned Line Items
    db.exec(`
      CREATE TABLE IF NOT EXISTS sale_return_items (
        id TEXT PRIMARY KEY,
        return_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        refund_amount REAL NOT NULL,
        FOREIGN KEY (return_id) REFERENCES sale_returns(id) ON DELETE CASCADE
      );
    `);
  }
};

export default migration003;
