import type { Database } from 'better-sqlite3';
import { Migration } from './001_initial_extensions';

export const migration014: Migration = {
  version: 14,
  name: '014_add_warranty_governance_columns',
  up: (db: Database) => {
    // 1. Add warranty governance columns to repair_tickets
    const existingCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('repair_tickets') as { name: string }[]).map(c => c.name);

    if (!existingCols.includes('warranty_duration_days')) {
      db.exec('ALTER TABLE repair_tickets ADD COLUMN warranty_duration_days INTEGER');
    }
    if (!existingCols.includes('warranty_expiry_date')) {
      db.exec('ALTER TABLE repair_tickets ADD COLUMN warranty_expiry_date TEXT');
    }
    if (!existingCols.includes('is_warranty_repair')) {
      db.exec('ALTER TABLE repair_tickets ADD COLUMN is_warranty_repair INTEGER DEFAULT 0');
    }
    if (!existingCols.includes('parent_ticket_id')) {
      db.exec('ALTER TABLE repair_tickets ADD COLUMN parent_ticket_id TEXT REFERENCES repair_tickets(id)');
    }
    if (!existingCols.includes('warranty_status')) {
      db.exec("ALTER TABLE repair_tickets ADD COLUMN warranty_status TEXT DEFAULT 'VALID'");
    }
    if (!existingCols.includes('warranty_void_reason')) {
      db.exec('ALTER TABLE repair_tickets ADD COLUMN warranty_void_reason TEXT');
    }
    if (!existingCols.includes('warranty_void_evidence_path')) {
      db.exec('ALTER TABLE repair_tickets ADD COLUMN warranty_void_evidence_path TEXT');
    }
    if (!existingCols.includes('warranty_void_evidence_hash')) {
      db.exec('ALTER TABLE repair_tickets ADD COLUMN warranty_void_evidence_hash TEXT');
    }
    if (!existingCols.includes('warranty_void_approved_by')) {
      db.exec('ALTER TABLE repair_tickets ADD COLUMN warranty_void_approved_by TEXT REFERENCES users(id)');
    }
    if (!existingCols.includes('warranty_void_approved_at')) {
      db.exec('ALTER TABLE repair_tickets ADD COLUMN warranty_void_approved_at TEXT');
    }
    if (!existingCols.includes('warranty_cost_amount')) {
      db.exec('ALTER TABLE repair_tickets ADD COLUMN warranty_cost_amount INTEGER DEFAULT 0');
    }

    // Defensive columns for warranty_certificates table
    const certCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('warranty_certificates') as { name: string }[]).map(c => c.name);
    if (!certCols.includes('warranty_days')) {
      db.exec('ALTER TABLE warranty_certificates ADD COLUMN warranty_days INTEGER');
    }
    if (!certCols.includes('warranty_type')) {
      db.exec('ALTER TABLE warranty_certificates ADD COLUMN warranty_type TEXT');
    }
    if (!certCols.includes('warranty_terms')) {
      db.exec('ALTER TABLE warranty_certificates ADD COLUMN warranty_terms TEXT');
    }
    if (!certCols.includes('device_model')) {
      db.exec('ALTER TABLE warranty_certificates ADD COLUMN device_model TEXT');
    }
    if (!certCols.includes('imei_sn')) {
      db.exec('ALTER TABLE warranty_certificates ADD COLUMN imei_sn TEXT');
    }

    // 2. Ensure warranty_tiers table exists and default tiers are seeded (DEC-041)
    db.exec(`
      CREATE TABLE IF NOT EXISTS warranty_tiers (
        id TEXT PRIMARY KEY,
        service_category TEXT NOT NULL UNIQUE,
        warranty_days INTEGER NOT NULL DEFAULT 30,
        warranty_terms TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    const defaultTiers = [
      { id: 'wt-screen', cat: 'SCREEN', days: 90, terms: '90-Day Screen & Display Limited Warranty' },
      { id: 'wt-battery', cat: 'BATTERY', days: 60, terms: '60-Day Battery Performance & Degradation Warranty' },
      { id: 'wt-motherboard', cat: 'MOTHERBOARD', days: 30, terms: '30-Day Logic Board Micro-Soldering Warranty' },
      { id: 'wt-labor', cat: 'LABOR', days: 30, terms: '30-Day General Labor Warranty' },
      { id: 'wt-other', cat: 'OTHER', days: 30, terms: '30-Day General Repair Warranty' }
    ];

    const insertTier = db.prepare(`
      INSERT OR IGNORE INTO warranty_tiers (id, service_category, warranty_days, warranty_terms, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);

    for (const t of defaultTiers) {
      insertTier.run(t.id, t.cat, t.days, t.terms);
    }

    // 3. Ensure Chart of Accounts has acc-5040 (Warranty Parts Expense) seeded (DEC-031 / W6)
    const accCheck = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5040'").get();
    if (!accCheck) {
      db.prepare(`
        INSERT INTO chart_of_accounts (id, code, name, account_type, balance, currency, is_active)
        VALUES ('acc-5040', '5040', 'مصروفات قطع غيار الضمان (Warranty Parts Expense)', 'EXPENSE', 0.0, 'EGP', 1)
      `).run();
    }
  }
};
