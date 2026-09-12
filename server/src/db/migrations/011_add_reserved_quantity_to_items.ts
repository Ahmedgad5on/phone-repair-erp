import type { Database } from 'better-sqlite3';
import { Migration } from './001_initial_extensions';

export const migration011: Migration = {
  version: 11,
  name: '011_add_reserved_quantity_to_items',
  up: (db: Database) => {
    db.pragma('foreign_keys = OFF');

    // 1. Check existing columns of items
    const existingCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('items') as { name: string }[]).map(c => c.name);

    if (!existingCols.includes('reserved_quantity')) {
      // Rebuild items table with reserved_quantity and CHECK (stock_quantity >= reserved_quantity)
      db.exec(`
        CREATE TABLE items_new (
          id TEXT PRIMARY KEY,
          store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
          sku TEXT UNIQUE NOT NULL,
          barcode TEXT,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          quality_grade TEXT,
          purchase_price REAL NOT NULL DEFAULT 0.0,
          wholesale_price REAL NOT NULL DEFAULT 0.0,
          retail_price REAL NOT NULL DEFAULT 0.0,
          bulk_price REAL NOT NULL DEFAULT 0.0,
          stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
          reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
          min_limit INTEGER NOT NULL DEFAULT 2,
          warranty_days INTEGER DEFAULT 0,
          last_sold_date TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          warehouse_id TEXT,
          reorder_level INTEGER DEFAULT 5,
          reorder_qty INTEGER DEFAULT 20,
          unit_type TEXT DEFAULT 'PIECE',
          version INTEGER DEFAULT 1,
          location_id TEXT,
          description TEXT,
          reorder_point INTEGER DEFAULT 5,
          CHECK (stock_quantity >= reserved_quantity)
        );
      `);

      const newItemCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('items_new') as { name: string }[]).map(c => c.name);
      const commonCols = existingCols.filter(c => newItemCols.includes(c));
      const colsSql = commonCols.map(c => `"${c}"`).join(', ');

      db.exec(`
        INSERT INTO items_new (${colsSql}, "reserved_quantity")
        SELECT ${colsSql}, 0 FROM items;

        DROP TABLE items;
        ALTER TABLE items_new RENAME TO items;

        CREATE INDEX IF NOT EXISTS idx_items_category_stock ON items(category, stock_quantity);
        CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
        CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
        CREATE INDEX IF NOT EXISTS idx_items_reserved_quantity ON items(reserved_quantity);
      `);
    }

    // 2. Add is_reserved column to repair_consumed_parts for granular tracking
    const rcpCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('repair_consumed_parts') as { name: string }[]).map(c => c.name);
    if (!rcpCols.includes('is_reserved')) {
      db.exec(`ALTER TABLE repair_consumed_parts ADD COLUMN is_reserved INTEGER NOT NULL DEFAULT 0`);
    }

    db.pragma('foreign_keys = ON');
  }
};
