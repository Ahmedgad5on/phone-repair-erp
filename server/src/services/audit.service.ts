import db from '../db/database';
import { cryptoService } from './crypto.service';

export interface ImmutableAuditRecord {
  id?: number;
  action: string;
  actorId?: string;
  actorIp?: string;
  entityType: string;
  entityId: string;
  payload?: any;
}

export const auditService = {
  /**
   * Appends an immutable, cryptographically chained audit record (Proposal 35)
   */
  log(record: ImmutableAuditRecord): void {
    try {
      // 1. Fetch latest record's hash, or use genesis hash
      const latest = db.prepare('SELECT current_hash FROM audit_trail_immutable ORDER BY id DESC LIMIT 1').get() as { current_hash: string } | undefined;
      const prevHash = latest ? latest.current_hash : '0000000000000000000000000000000000000000000000000000000000000000'; // Genesis hash

      const timestamp = new Date().toISOString();
      const currentHash = cryptoService.generateChainedHash(
        prevHash,
        record.action,
        record.actorId || 'system',
        record.payload || {},
        timestamp
      );

      db.prepare(`
        INSERT INTO audit_trail_immutable (prev_hash, current_hash, action, actor_id, actor_ip, entity_type, entity_id, delta_payload, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        prevHash,
        currentHash,
        record.action,
        record.actorId || 'system',
        record.actorIp || '127.0.0.1',
        record.entityType,
        record.entityId,
        record.payload ? JSON.stringify(record.payload) : null,
        timestamp
      );
    } catch (err) {
      console.error('[AuditService] Failed to record immutable audit:', err);
    }
  },

  /**
   * Verifies the cryptographic integrity of the entire audit chain
   */
  verifyChainIntegrity(): { isValid: boolean; totalRecords: number; tamperedRecordId?: number } {
    const records = db.prepare('SELECT * FROM audit_trail_immutable ORDER BY id ASC').all() as any[];
    let expectedPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';

    for (const r of records) {
      if (r.prev_hash !== expectedPrevHash) {
        return { isValid: false, totalRecords: records.length, tamperedRecordId: r.id };
      }

      let payloadObj = {};
      try {
        if (r.delta_payload) payloadObj = JSON.parse(r.delta_payload);
      } catch (e) {
        payloadObj = {};
      }

      const computedHash = cryptoService.generateChainedHash(
        expectedPrevHash,
        r.action,
        r.actor_id,
        payloadObj,
        r.timestamp
      );

      if (computedHash !== r.current_hash) {
        return { isValid: false, totalRecords: records.length, tamperedRecordId: r.id };
      }

      expectedPrevHash = r.current_hash;
    }

    return { isValid: true, totalRecords: records.length };
  }
};

/**
 * Standard audit logger backwards compatibility
 */
export function logAudit(entry: {
  userId?: string;
  username?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
}) {
  try {
    const id = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.userId || 'system',
      entry.action,
      entry.entityType,
      entry.entityId || 'system',
      entry.oldValues ? JSON.stringify(entry.oldValues) : null,
      entry.newValues ? JSON.stringify(entry.newValues) : null,
      entry.ipAddress || '127.0.0.1'
    );

    // Also link into cryptographic immutable audit chain (Defense-in-depth)
    auditService.log({
      action: entry.action,
      actorId: entry.userId || 'system',
      actorIp: entry.ipAddress || '127.0.0.1',
      entityType: entry.entityType,
      entityId: entry.entityId || 'system',
      payload: entry.newValues
    });
  } catch (err) {
    console.error('[AuditService] logAudit failed:', err);
  }
}

/**
 * Retrieve recent standard audit logs
 */
export function getRecentAuditLogs(limit: number = 20) {
  return db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
}

