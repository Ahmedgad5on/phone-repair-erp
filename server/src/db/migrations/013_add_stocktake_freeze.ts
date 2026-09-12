import type { Database } from 'better-sqlite3';
import { Migration } from './001_initial_extensions';

export const migration013: Migration = {
  version: 13,
  name: '013_add_stocktake_freeze',
  up: (db: Database) => {
    const existingCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('items') as { name: string }[]).map(c => c.name);

    if (!existingCols.includes('is_frozen')) {
      db.exec('ALTER TABLE items ADD COLUMN is_frozen INTEGER DEFAULT 0');
    }
    if (!existingCols.includes('freeze_reason')) {
      db.exec('ALTER TABLE items ADD COLUMN freeze_reason TEXT');
    }
    if (!existingCols.includes('frozen_at')) {
      db.exec('ALTER TABLE items ADD COLUMN frozen_at TEXT');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_count_items (
        id TEXT PRIMARY KEY,
        stock_count_id TEXT REFERENCES stock_counts(id) ON DELETE CASCADE,
        item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
        pre_freeze_quantity INTEGER NOT NULL,
        override_sales_quantity INTEGER DEFAULT 0,
        counted_quantity INTEGER,
        variance INTEGER,
        status TEXT DEFAULT 'FROZEN',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        reconciled_at TEXT
      );
    `);
  }
};
