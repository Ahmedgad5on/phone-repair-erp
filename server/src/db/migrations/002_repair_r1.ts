import type { Database } from 'better-sqlite3';
import { Migration } from './001_initial_extensions';

export const migration002: Migration = {
  version: 2,
  name: '002_repair_r1',
  up: (db: Database) => {
    // 1. Photo Evidence Timeline Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ticket_photos (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        url TEXT NOT NULL,
        stage TEXT NOT NULL,
        taken_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id) ON DELETE CASCADE
      );
    `);

    // 2. Repair Notes Template Library Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS repair_notes_templates (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Composite Search Index for IMEI & Ticket Status
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_repair_tickets_imei_status ON repair_tickets(imei_sn, status);
    `);
  }
};

export default migration002;
