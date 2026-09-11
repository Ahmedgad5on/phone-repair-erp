import fs from 'fs';
import path from 'path';
import db from '../db/database';
import { logAudit } from './audit.service';

const BACKUP_DIR = path.resolve(process.cwd(), 'backups');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export interface BackupInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  path: string;
}

export async function createDatabaseBackup(requestedBy: string = 'system'): Promise<BackupInfo> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `erp-backup-${timestamp}.db`;
  const destPath = path.join(BACKUP_DIR, filename);

  await db.backup(destPath);

  const stats = fs.statSync(destPath);
  const info: BackupInfo = {
    filename,
    sizeBytes: stats.size,
    createdAt: new Date().toISOString(),
    path: destPath
  };

  logAudit({
    action: 'BACKUP',
    entityType: 'DATABASE',
    entityId: filename,
    newValues: { filename, sizeBytes: stats.size, requestedBy }
  });

  return info;
}

export function listBackups(): BackupInfo[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'));
  return files.map(filename => {
    const filePath = path.join(BACKUP_DIR, filename);
    const stats = fs.statSync(filePath);
    return {
      filename,
      sizeBytes: stats.size,
      createdAt: stats.mtime.toISOString(),
      path: filePath
    };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function restoreDatabaseBackup(filename: string, requestedBy: string = 'admin'): boolean {
  const backupPath = path.join(BACKUP_DIR, path.basename(filename));
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file '${filename}' not found.`);
  }

  const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || 'data/erp.db');

  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(backupPath, dbPath);

  logAudit({
    action: 'RESTORE',
    entityType: 'DATABASE',
    entityId: filename,
    newValues: { restoredFrom: filename, requestedBy }
  });

  return true;
}

// Auto-Backup to External USB Drive (Hardware Proposal 54)
export async function backupToExternalDrive(targetDirPath?: string): Promise<BackupInfo> {
  const destDir = targetDirPath || (process.platform === 'win32' ? 'E:\\ERP_Backups' : '/mnt/usb/backups');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `erp-usb-backup-${timestamp}.db`;
  const destPath = path.join(destDir, filename);

  await db.backup(destPath);
  const stats = fs.statSync(destPath);

  logAudit({
    action: 'BACKUP_USB',
    entityType: 'DATABASE',
    entityId: filename,
    newValues: { path: destPath, sizeBytes: stats.size }
  });

  return {
    filename,
    sizeBytes: stats.size,
    createdAt: new Date().toISOString(),
    path: destPath
  };
}

// Data Archiving & VACUUM Strategy (Maint Proposal 66)
export function archiveAndVacuumDatabase(pruneOlderThanDays: number = 365) {
  const cutoffDate = new Date(Date.now() - pruneOlderThanDays * 24 * 60 * 60 * 1000).toISOString();

  // Prune historical audit logs older than cutoff
  const prunedLogs = db.prepare('DELETE FROM audit_logs WHERE timestamp < ?').run(cutoffDate);

  // Prune old closed user sessions
  const prunedSessions = db.prepare('DELETE FROM user_sessions WHERE expires_at < ?').run(cutoffDate);

  // Execute incremental vacuum
  db.exec('PRAGMA incremental_vacuum(1000);');

  return {
    success: true,
    prunedAuditLogsCount: prunedLogs.changes,
    prunedSessionsCount: prunedSessions.changes,
    vacuumExecuted: true,
    archivedAt: new Date().toISOString()
  };
}
