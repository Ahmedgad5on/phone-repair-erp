import type Database from 'better-sqlite3';
import { Migration } from './001_initial_extensions';

export const migration015: Migration = {
  version: 15,
  name: '015_add_defective_scrap_lifecycle',
  up: (db: Database) => {
    // Add item_status column to items table for DEFECTIVE_SCRAP lifecycle (DEC-035 / FR-010)
    // Values: null (ACTIVE default), 'DEFECTIVE_SCRAP', 'LIQUIDATED'
    const itemsCols = (db.prepare('PRAGMA table_info(items)').all() as { name: string }[]).map(c => c.name);
    if (!itemsCols.includes('item_status')) {
      db.exec(`ALTER TABLE items ADD COLUMN item_status TEXT DEFAULT NULL;`);
    }

    // Supplier returns tracking table (RTV lifecycle)
    db.exec(`
      CREATE TABLE IF NOT EXISTS supplier_returns (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id),
        item_id TEXT NOT NULL REFERENCES items(id),
        purchase_order_id TEXT REFERENCES purchase_orders(id),
        supplier_name TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        rejected_at TEXT,
        rejected_by TEXT REFERENCES users(id),
        liquidated_at TEXT,
        liquidated_by TEXT REFERENCES users(id),
        liquidation_amount REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
};
