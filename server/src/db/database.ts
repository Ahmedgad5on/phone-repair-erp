import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../data/erp.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// Enable SQLite Write-Ahead Logging for high concurrency & performance (Maintenance Proposal 43)
db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL'); // FULL fsync on every commit per DEC-001/ADR-001
db.pragma('cache_size = -64000'); // 64 MB cache
db.pragma('busy_timeout = 5000'); // 5s timeout on contention
db.pragma('temp_store = MEMORY');
db.pragma('foreign_keys = ON');

export default db;
