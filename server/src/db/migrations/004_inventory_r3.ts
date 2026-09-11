import type { Database } from 'better-sqlite3';
import { Migration } from './001_initial_extensions';

export const migration004: Migration = {
  version: 4,
  name: '004_inventory_r3',
  up: (db: Database) => {
    // 0. Ensure suppliers table exists so foreign key references resolve
    db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure description column on items table for external content items_fts
    const itemCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('items') as { name: string }[]).map(c => c.name);
    if (!itemCols.includes('description')) {
      db.exec(`ALTER TABLE items ADD COLUMN description TEXT;`);
    }

    // 1. Supplier Performance Scorecard
    db.exec(`
      CREATE TABLE IF NOT EXISTS supplier_scores (
        id TEXT PRIMARY KEY,
        supplier_id TEXT NOT NULL UNIQUE,
        on_time_rate REAL NOT NULL DEFAULT 100.0,
        quality_rate REAL NOT NULL DEFAULT 100.0,
        return_rate REAL NOT NULL DEFAULT 0.0,
        total_orders INTEGER NOT NULL DEFAULT 0,
        last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      );
    `);

    // 2. Inter-Branch Stock Transfer Requests
    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_transfer_requests (
        id TEXT PRIMARY KEY,
        transfer_number TEXT NOT NULL UNIQUE,
        from_branch_id TEXT NOT NULL,
        to_branch_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        requested_by TEXT NOT NULL,
        approved_by TEXT,
        requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
        approved_at TEXT
      );
    `);

    // 3. Historical Item Cost Price (FIFO tracking)
    db.exec(`
      CREATE TABLE IF NOT EXISTS item_cost_history (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        cost_price REAL NOT NULL,
        effective_from TEXT DEFAULT CURRENT_TIMESTAMP,
        po_id TEXT,
        quantity_received INTEGER DEFAULT 0,
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // 4. Cross-Model Device Compatibility
    db.exec(`
      CREATE TABLE IF NOT EXISTS item_compatibility (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        device_brand TEXT NOT NULL,
        device_model TEXT NOT NULL,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // 5. Full-Text Search 5 (FTS5) Virtual Table for Inventory Items
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
        id UNINDEXED,
        name,
        sku,
        description,
        content='items',
        content_rowid='rowid'
      );
    `);

    // 6. Synchronization Triggers for items_fts
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS items_fts_ai AFTER INSERT ON items BEGIN
        INSERT INTO items_fts(rowid, id, name, sku, description)
        VALUES (new.rowid, new.id, new.name, new.sku, coalesce(new.description, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS items_fts_ad AFTER DELETE ON items BEGIN
        INSERT INTO items_fts(items_fts, rowid, id, name, sku, description)
        VALUES ('delete', old.rowid, old.id, old.name, old.sku, coalesce(old.description, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS items_fts_au AFTER UPDATE ON items BEGIN
        INSERT INTO items_fts(items_fts, rowid, id, name, sku, description)
        VALUES ('delete', old.rowid, old.id, old.name, old.sku, coalesce(old.description, ''));
        INSERT INTO items_fts(rowid, id, name, sku, description)
        VALUES (new.rowid, new.id, new.name, new.sku, coalesce(new.description, ''));
      END;
    `);

    // Initial FTS index populate/rebuild
    try {
      db.exec(`INSERT INTO items_fts(items_fts) VALUES('rebuild');`);
    } catch (err: any) {
      console.warn('[Migration 004] items_fts rebuild notice:', err.message);
    }
  }
};

export default migration004;
