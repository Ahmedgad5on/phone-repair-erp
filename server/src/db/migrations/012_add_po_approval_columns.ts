import type { Database } from 'better-sqlite3';
import { Migration } from './001_initial_extensions';

export const migration012: Migration = {
  version: 12,
  name: '012_add_po_approval_columns',
  up: (db: Database) => {
    const existingCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('purchase_orders') as { name: string }[]).map(c => c.name);

    if (!existingCols.includes('approved_by')) {
      db.exec('ALTER TABLE purchase_orders ADD COLUMN approved_by TEXT');
    }
    if (!existingCols.includes('approved_at')) {
      db.exec('ALTER TABLE purchase_orders ADD COLUMN approved_at TEXT');
    }
  }
};
