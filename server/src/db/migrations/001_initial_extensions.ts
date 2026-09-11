import type { Database } from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

function addColumnIfNotExists(db: Database, table: string, column: string, columnDef: string) {
  try {
    const columns = db.prepare('SELECT name FROM pragma_table_info(?)').all(table) as { name: string }[];
    if (columns.length > 0 && !columns.some(col => col.name === column)) {
      db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${columnDef}`);
    }
  } catch (err: any) {
    console.error(`[Migration 001] Failed to add column ${column} to ${table}:`, err.message);
    throw err;
  }
}

export const migration001: Migration = {
  version: 1,
  name: '001_initial_extensions',
  up: (db: Database) => {
    // 1. Repair SLA and QA checklist persistence
    addColumnIfNotExists(db, 'repair_tickets', 'sla_started_at', 'TEXT');
    addColumnIfNotExists(db, 'repair_tickets', 'qa_checklist', 'TEXT');

    // 2. Fintech wallet optimistic concurrency lock
    addColumnIfNotExists(db, 'fintech_wallets', 'version', 'INTEGER NOT NULL DEFAULT 1');

    // 3. Customer CRM credit limit and credit usage tracking
    addColumnIfNotExists(db, 'customers', 'credit_limit', 'REAL NOT NULL DEFAULT 0');
    addColumnIfNotExists(db, 'customers', 'credit_used', 'REAL NOT NULL DEFAULT 0');
  }
};

export default migration001;
