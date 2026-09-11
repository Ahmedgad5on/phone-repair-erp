import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import bwipjs from 'bwip-js';
import db from '../../db/database';
import { WhatsAppService } from '../../services/whatsapp.service';
import { wsService } from '../../services/ws.service';
import { logAudit } from '../../services/audit.service';

export const STATUS_ALIASES: Record<string, string> = {
  INTAKE: 'RECEIVED',
  RECEIVED: 'RECEIVED',
  DIAGNOSING: 'DIAGNOSED',
  DIAGNOSED: 'DIAGNOSED',
  IN_REPAIR: 'IN_REPAIR',
  IN_PROGRESS: 'IN_REPAIR',
  WAITING_APPROVAL: 'QA',
  QA: 'QA',
  READY: 'READY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED'
};

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  RECEIVED: ['DIAGNOSED', 'CANCELLED'],
  DIAGNOSED: ['IN_REPAIR', 'QA', 'RECEIVED', 'CANCELLED'],
  IN_REPAIR: ['QA', 'READY', 'DIAGNOSED', 'CANCELLED'],
  QA: ['READY', 'IN_REPAIR', 'DIAGNOSED', 'CANCELLED'],
  READY: ['DELIVERED', 'QA', 'IN_REPAIR', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: ['RECEIVED']
};

export function normalizeStatus(status: string): string {
  const upper = (status || '').toUpperCase().trim();
  return STATUS_ALIASES[upper] || upper;
}

export function validateStatusTransition(
  currentStatus: string,
  targetStatus: string,
  qaChecklist?: any,
  existingChecklist?: any
): { valid: boolean; error?: string; code?: string } {
  const normCurrent = normalizeStatus(currentStatus);
  const normTarget = normalizeStatus(targetStatus);

  // Idempotent transitions are allowed
  if (normCurrent !== normTarget) {
    const allowed = ALLOWED_TRANSITIONS[normCurrent] || [];
    if (!allowed.includes(normTarget)) {
      return {
        valid: false,
        error: 'Invalid status transition',
        code: 'INVALID_STATUS_TRANSITION'
      };
    }
  }

  // QA checklist validation when marking READY
  if (normTarget === 'READY') {
    let hasChecklist = false;

    if (qaChecklist) {
      if (typeof qaChecklist === 'object' && Object.keys(qaChecklist).length > 0) {
        hasChecklist = true;
      } else if (typeof qaChecklist === 'string' && qaChecklist.trim().length > 2 && qaChecklist.trim() !== '{}') {
        hasChecklist = true;
      }
    } else if (existingChecklist) {
      try {
        const parsed = typeof existingChecklist === 'string' ? JSON.parse(existingChecklist) : existingChecklist;
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          hasChecklist = true;
        }
      } catch {
        hasChecklist = false;
      }
    }

    if (!hasChecklist) {
      return {
        valid: false,
        error: 'QA checklist must be completed and non-empty before marking ticket as READY',
        code: 'QA_CHECKLIST_REQUIRED'
      };
    }
  }

  return { valid: true };
}

// SLA Escalation Auto-Alerts
export function checkSlaEscalations(): any[] {
  try {
    const openTickets = db.prepare(`
      SELECT t.id, t.ticket_number, t.device_brand, t.device_model, t.priority, t.status,
             t.sla_deadline, t.sla_started_at, t.created_at
      FROM repair_tickets t
      WHERE t.status NOT IN ('READY', 'DELIVERED', 'CANCELLED')
        AND t.deleted_at IS NULL
    `).all() as any[];

    const now = Date.now();
    const breachedTickets: any[] = [];

    const updateStmt = db.prepare(`
      UPDATE repair_tickets
      SET priority = 'URGENT'
      WHERE id = ?
    `);

    for (const t of openTickets) {
      let isBreached = false;

      if (t.sla_deadline) {
        const deadlineMs = new Date(t.sla_deadline).getTime();
        if (now > deadlineMs) {
          isBreached = true;
        }
      }

      const startTimeStr = t.sla_started_at || t.created_at;
      if (startTimeStr && !isBreached) {
        const startMs = new Date(startTimeStr).getTime();
        const elapsedHours = (now - startMs) / (1000 * 60 * 60);
        const slaHours = t.priority === 'VIP' ? 2 : t.priority === 'URGENT' ? 1 : 4;
        if (elapsedHours > slaHours) {
          isBreached = true;
        }
      }

      if (isBreached) {
        breachedTickets.push(t);
        if (t.priority !== 'URGENT') {
          updateStmt.run(t.id);
          wsService.broadcast('TICKET_SLA_BREACH', {
            ticket_id: t.id,
            ticket_number: t.ticket_number,
            device: `${t.device_brand} ${t.device_model}`,
            previous_priority: t.priority,
            priority: 'URGENT',
            breached_at: new Date().toISOString()
          });
          logAudit({
            action: 'SLA_BREACH',
            entityType: 'REPAIR_TICKET',
            entityId: t.id,
            newValues: { priority: 'URGENT', reason: 'Automatic SLA breach escalation' }
          });
        }
      }
    }

    return breachedTickets;
  } catch (err: any) {
    console.error('[SLA Escalation Worker Error]:', err.message);
    return [];
  }
}

// Background SLA scanner running every 5 minutes (300,000 ms)
export const slaInterval = setInterval(() => {
  checkSlaEscalations();
}, 5 * 60 * 1000);

if (slaInterval.unref) {
  slaInterval.unref();
}

// Ensure sla_started_at is initialized for historical rows
try {
  db.exec("UPDATE repair_tickets SET sla_started_at = created_at WHERE sla_started_at IS NULL;");
} catch (e) {
  // column might not exist if migration hasn't run yet
}

// QR Code generation helper
export async function generateTrackingQrBuffer(trackingUrl: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'qrcode',
    text: trackingUrl,
    scale: 3,
    height: 15,
    width: 15
  });
}

// Ensure default repair notes templates exist
export function ensureDefaultTemplates(): void {
  try {
    const count = (db.prepare('SELECT COUNT(*) as count FROM repair_notes_templates').get() as any)?.count || 0;
    if (count === 0) {
      const defaultTemplates = [
        {
          id: 'tmpl-01',
          title: 'Screen OLED Replacement + TrueTone',
          content: 'Original OLED panel replacement with TrueTone EEPROM transfer and perimeter dust/water seal installed. 10-point touch test passed.',
          branch_id: 'WH-MAIN',
          created_by: 'system'
        },
        {
          id: 'tmpl-02',
          title: 'OEM Battery Replacement + BMS Tag-on',
          content: 'Replaced degraded cell with OEM capacity battery. Transferred OEM BMS board and reset battery health cycle counter to 100%.',
          branch_id: 'WH-MAIN',
          created_by: 'system'
        },
        {
          id: 'tmpl-03',
          title: 'Charging Port & Tristar IC Repair',
          content: 'Replaced damaged USB-C flex assembly and reflowed/replaced USB charging IC. Validated steady 5V/2.1A and 9V/2.2A fast-charge handshake.',
          branch_id: 'WH-MAIN',
          created_by: 'system'
        },
        {
          id: 'tmpl-04',
          title: 'Liquid Damage Ultrasonic Cleaning',
          content: 'Ultrasonic bath cleaning in 99% electronic-grade isopropanol. Removed corrosion under shields. Diode mode scan confirms no remaining shorts.',
          branch_id: 'WH-MAIN',
          created_by: 'system'
        },
        {
          id: 'tmpl-05',
          title: 'FaceID Dot Projector / Prism Realignment',
          content: 'Micro-soldered dot projector flex and realigned flood illuminator. Validated full FaceID enrollment and 3D depth map registration.',
          branch_id: 'WH-MAIN',
          created_by: 'system'
        }
      ];

      const insertTmpl = db.prepare('INSERT INTO repair_notes_templates (id, title, content, branch_id, created_by) VALUES (?, ?, ?, ?, ?)');
      for (const tmpl of defaultTemplates) {
        insertTmpl.run(tmpl.id, tmpl.title, tmpl.content, tmpl.branch_id, tmpl.created_by);
      }
    }
  } catch (err: any) {
    console.warn('[Repair Templates Init Warning]:', err.message);
  }
}

// Initialize templates on module load
ensureDefaultTemplates();
