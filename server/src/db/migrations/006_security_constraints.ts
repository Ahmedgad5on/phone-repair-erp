import type { Database } from 'better-sqlite3';
import { Migration } from './001_initial_extensions';

export const migration006: Migration = {
  version: 6,
  name: '006_security_constraints',
  up: (db: Database) => {
    // Disable foreign key constraints during table rebuilding
    db.pragma('foreign_keys = OFF');

    // -------------------------------------------------------------------------
    // 1. Enforce CHECK (stock_quantity >= 0) on items table
    // -------------------------------------------------------------------------
    const existingItemCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('items') as { name: string }[]).map(c => c.name);

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
        description TEXT
      );
    `);

    const newItemCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('items_new') as { name: string }[]).map(c => c.name);
    const itemIntersection = existingItemCols.filter(c => newItemCols.includes(c));
    const itemColsSql = itemIntersection.map(c => `"${c}"`).join(', ');

    db.exec(`
      INSERT INTO items_new (${itemColsSql})
      SELECT ${itemColsSql} FROM items;

      DROP TABLE items;
      ALTER TABLE items_new RENAME TO items;

      CREATE INDEX IF NOT EXISTS idx_items_category_stock ON items(category, stock_quantity);
      CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
      CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
    `);

    // Check if items_fts virtual table exists; if so, recreate the synchronization triggers
    const ftsCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='items_fts'").get();
    if (ftsCheck) {
      db.exec(`
        DROP TRIGGER IF EXISTS items_fts_ai;
        DROP TRIGGER IF EXISTS items_fts_ad;
        DROP TRIGGER IF EXISTS items_fts_au;

        CREATE TRIGGER items_fts_ai AFTER INSERT ON items BEGIN
          INSERT INTO items_fts(rowid, id, name, sku, description)
          VALUES (new.rowid, new.id, new.name, new.sku, coalesce(new.description, ''));
        END;

        CREATE TRIGGER items_fts_ad AFTER DELETE ON items BEGIN
          INSERT INTO items_fts(items_fts, rowid, id, name, sku, description)
          VALUES ('delete', old.rowid, old.id, old.name, old.sku, coalesce(old.description, ''));
        END;

        CREATE TRIGGER items_fts_au AFTER UPDATE ON items BEGIN
          INSERT INTO items_fts(items_fts, rowid, id, name, sku, description)
          VALUES ('delete', old.rowid, old.id, old.name, old.sku, coalesce(old.description, ''));
          INSERT INTO items_fts(rowid, id, name, sku, description)
          VALUES (new.rowid, new.id, new.name, new.sku, coalesce(new.description, ''));
        END;
      `);
      try {
        db.exec(`INSERT INTO items_fts(items_fts) VALUES('rebuild');`);
      } catch (err: any) {
        console.warn('[Migration 006] items_fts rebuild notice:', err.message);
      }
    }

    // -------------------------------------------------------------------------
    // 2. Enforce ON DELETE RESTRICT on tickets -> customers
    // -------------------------------------------------------------------------
    const existingTicketCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('repair_tickets') as { name: string }[]).map(c => c.name);

    db.exec(`
      CREATE TABLE repair_tickets_new (
        id TEXT PRIMARY KEY,
        ticket_number INTEGER UNIQUE,
        store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
        customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
        assigned_tech_id TEXT REFERENCES users(id),
        device_brand TEXT NOT NULL,
        device_model TEXT NOT NULL,
        imei_sn TEXT,
        passcode TEXT,
        pattern_code TEXT,
        physical_condition TEXT,
        checklist_json TEXT,
        reported_defects TEXT NOT NULL,
        intake_media_url TEXT,
        status TEXT DEFAULT 'INTAKE',
        priority TEXT DEFAULT 'NORMAL',
        estimated_cost REAL DEFAULT 0.0,
        labor_charge REAL DEFAULT 0.0,
        parts_cost REAL DEFAULT 0.0,
        tech_commission REAL DEFAULT 0.0,
        sla_deadline TEXT,
        tat_minutes INTEGER DEFAULT 0,
        release_otp TEXT,
        otp_verified INTEGER DEFAULT 0,
        customer_signature TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        delivered_at TEXT,
        deleted_at TEXT,
        branch_id TEXT DEFAULT 'WH-MAIN',
        insurance_claim_id TEXT,
        warranty_cert_code TEXT,
        version INTEGER DEFAULT 1,
        sla_started_at TEXT,
        qa_checklist TEXT
      );
    `);

    const newTicketCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('repair_tickets_new') as { name: string }[]).map(c => c.name);
    const ticketIntersection = existingTicketCols.filter(c => newTicketCols.includes(c));
    const ticketColsSql = ticketIntersection.map(c => `"${c}"`).join(', ');

    db.exec(`
      INSERT INTO repair_tickets_new (${ticketColsSql})
      SELECT ${ticketColsSql} FROM repair_tickets;

      DROP TABLE repair_tickets;
      ALTER TABLE repair_tickets_new RENAME TO repair_tickets;

      CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status ON repair_tickets(assigned_tech_id, status);
      CREATE INDEX IF NOT EXISTS idx_tickets_store ON repair_tickets(store_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON repair_tickets(status);
      CREATE INDEX IF NOT EXISTS idx_repair_tickets_imei_status ON repair_tickets(imei_sn, status);
    `);

    // -------------------------------------------------------------------------
    // 3. Enforce ON DELETE RESTRICT on sale_items -> items
    // -------------------------------------------------------------------------
    const existingSaleItemCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('sale_items') as { name: string }[]).map(c => c.name);

    db.exec(`
      CREATE TABLE sale_items_new (
        id TEXT PRIMARY KEY,
        sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
        item_id TEXT REFERENCES items(id) ON DELETE RESTRICT,
        item_name TEXT NOT NULL,
        imei TEXT,
        unit_price REAL NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        total_price REAL NOT NULL
      );
    `);

    const newSaleItemCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('sale_items_new') as { name: string }[]).map(c => c.name);
    const saleItemIntersection = existingSaleItemCols.filter(c => newSaleItemCols.includes(c));
    const saleItemColsSql = saleItemIntersection.map(c => `"${c}"`).join(', ');

    db.exec(`
      INSERT INTO sale_items_new (${saleItemColsSql})
      SELECT ${saleItemColsSql} FROM sale_items;

      DROP TABLE sale_items;
      ALTER TABLE sale_items_new RENAME TO sale_items;
    `);

    // -------------------------------------------------------------------------
    // 4. Enforce ON DELETE RESTRICT on journal_entry_lines -> accounts
    // -------------------------------------------------------------------------
    const existingJLinesCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('journal_entry_lines') as { name: string }[]).map(c => c.name);

    db.exec(`
      CREATE TABLE journal_entry_lines_new (
        id TEXT PRIMARY KEY,
        entry_id TEXT REFERENCES journal_entries(id) ON DELETE CASCADE,
        account_id TEXT REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
        debit REAL DEFAULT 0.0,
        credit REAL DEFAULT 0.0,
        memo TEXT
      );
    `);

    const newJLinesCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('journal_entry_lines_new') as { name: string }[]).map(c => c.name);
    const jLinesIntersection = existingJLinesCols.filter(c => newJLinesCols.includes(c));
    const jLinesColsSql = jLinesIntersection.map(c => `"${c}"`).join(', ');

    db.exec(`
      INSERT INTO journal_entry_lines_new (${jLinesColsSql})
      SELECT ${jLinesColsSql} FROM journal_entry_lines;

      DROP TABLE journal_entry_lines;
      ALTER TABLE journal_entry_lines_new RENAME TO journal_entry_lines;

      CREATE INDEX IF NOT EXISTS idx_journal_lines_acc ON journal_entry_lines(account_id);
    `);

    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');

    // Perform relational consistency check
    const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
    if (fkCheck.length > 0) {
      console.warn('[Migration 006] Note: foreign_key_check reported discrepancies:', fkCheck);
    }
  }
};

export default migration006;
