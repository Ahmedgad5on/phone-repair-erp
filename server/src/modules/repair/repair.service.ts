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

// Logical Spare Parts Reservation Lifecycle (DEC-036 / ADR-036 / FR-003)
export function reservePartsForTicket(ticketId: string): { success: boolean; reservedCount: number; errors?: string[] } {
  const parts = db.prepare(`
    SELECT id, item_id, is_reserved FROM repair_consumed_parts
    WHERE ticket_id = ? AND item_id IS NOT NULL AND (is_reserved = 0 OR is_reserved IS NULL)
  `).all(ticketId) as { id: string; item_id: string; is_reserved: number }[];

  let count = 0;
  const errors: string[] = [];

  const reserveTx = db.transaction(() => {
    for (const part of parts) {
      const item = db.prepare('SELECT id, name, stock_quantity, reserved_quantity FROM items WHERE id = ?').get(part.item_id) as any;
      if (!item) {
        errors.push(`Item not found: ${part.item_id}`);
        continue;
      }
      const available = item.stock_quantity - (item.reserved_quantity || 0);
      if (available < 1) {
        throw new Error(`INSUFFICIENT_STOCK_FOR_RESERVATION: Cannot reserve part "${item.name}" (Stock: ${item.stock_quantity}, Reserved: ${item.reserved_quantity || 0})`);
      }
      db.prepare('UPDATE items SET reserved_quantity = reserved_quantity + 1 WHERE id = ?').run(part.item_id);
      db.prepare('UPDATE repair_consumed_parts SET is_reserved = 1 WHERE id = ?').run(part.id);
      count++;
    }
  });

  try {
    reserveTx();
    if (count > 0) {
      logAudit({
        action: 'RESERVE_PARTS',
        entityType: 'REPAIR_TICKET',
        entityId: ticketId,
        newValues: { reservedCount: count }
      });
    }
    return { success: true, reservedCount: count };
  } catch (err: any) {
    console.error(`[Repair Reservation Error for ticket ${ticketId}]:`, err.message);
    return { success: false, reservedCount: 0, errors: [err.message] };
  }
}

export function reconcileDeliveredPartsForTicket(ticketId: string): { success: boolean; deductedCount: number } {
  const parts = db.prepare(`
    SELECT id, item_id, is_reserved FROM repair_consumed_parts
    WHERE ticket_id = ? AND item_id IS NOT NULL AND is_reserved = 1
  `).all(ticketId) as { id: string; item_id: string; is_reserved: number }[];

  let count = 0;
  const deliverTx = db.transaction(() => {
    for (const part of parts) {
      db.prepare(`
        UPDATE items
        SET stock_quantity = MAX(0, stock_quantity - 1),
            reserved_quantity = MAX(0, reserved_quantity - 1)
        WHERE id = ?
      `).run(part.item_id);
      db.prepare('UPDATE repair_consumed_parts SET is_reserved = 2 WHERE id = ?').run(part.id);
      count++;
    }
  });

  try {
    deliverTx();
    if (count > 0) {
      logAudit({
        action: 'DELIVER_PARTS',
        entityType: 'REPAIR_TICKET',
        entityId: ticketId,
        newValues: { deductedCount: count }
      });
    }
    return { success: true, deductedCount: count };
  } catch (err: any) {
    console.error(`[Repair Part Delivery Error for ticket ${ticketId}]:`, err.message);
    return { success: false, deductedCount: 0 };
  }
}

export function releaseReservedPartsForTicket(ticketId: string): { success: boolean; releasedCount: number } {
  const parts = db.prepare(`
    SELECT id, item_id, is_reserved FROM repair_consumed_parts
    WHERE ticket_id = ? AND item_id IS NOT NULL AND is_reserved = 1
  `).all(ticketId) as { id: string; item_id: string; is_reserved: number }[];

  let count = 0;
  const releaseTx = db.transaction(() => {
    for (const part of parts) {
      db.prepare(`
        UPDATE items
        SET reserved_quantity = MAX(0, reserved_quantity - 1)
        WHERE id = ?
      `).run(part.item_id);
      db.prepare('UPDATE repair_consumed_parts SET is_reserved = 3 WHERE id = ?').run(part.id);
      count++;
    }
  });

  try {
    releaseTx();
    if (count > 0) {
      logAudit({
        action: 'RELEASE_PARTS',
        entityType: 'REPAIR_TICKET',
        entityId: ticketId,
        newValues: { releasedCount: count }
      });
    }
    return { success: true, releasedCount: count };
  } catch (err: any) {
    console.error(`[Repair Part Release Error for ticket ${ticketId}]:`, err.message);
    return { success: false, releasedCount: 0 };
  }
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

// =========================================================================
// Warranty Duration Matrix, Window Inheritance & 3-Day Grace Policy (DEC-041, DEC-032, FR-007)
// =========================================================================

export interface WarrantyCalculationResult {
  durationDays: number;
  expiryDate: string;
  category: string;
  isInherited: boolean;
  isGrace: boolean;
}

export function getCategoryWarrantyDays(category: string): number {
  const upperCat = (category || '').toUpperCase().trim();
  try {
    const tier = db.prepare('SELECT warranty_days FROM warranty_tiers WHERE service_category = ? AND is_active = 1').get(upperCat) as { warranty_days: number } | undefined;
    if (tier && typeof tier.warranty_days === 'number') {
      return tier.warranty_days;
    }
  } catch {}

  // Fallback defaults per DEC-041
  if (upperCat === 'SCREEN' || upperCat === 'DISPLAY') return 90;
  if (upperCat === 'BATTERY') return 60;
  return 30; // MOTHERBOARD, LABOR, OTHER
}

export function detectTicketCategory(ticketId: string): string {
  // Check parts consumed on this ticket
  try {
    const parts = db.prepare(`
      SELECT p.*, i.name as item_name, i.category as item_cat
      FROM repair_consumed_parts p
      LEFT JOIN items i ON p.item_id = i.id
      WHERE p.ticket_id = ?
    `).all(ticketId) as { item_name?: string; item_cat?: string }[];

    for (const part of parts) {
      const name = (part.item_name || '').toUpperCase();
      const cat = (part.item_cat || '').toUpperCase();
      if (cat === 'SCREEN' || cat === 'DISPLAY' || name.includes('SCREEN') || name.includes('DISPLAY') || name.includes('OLED') || name.includes('LCD') || name.includes('INCELL')) {
        return 'SCREEN';
      }
    }

    for (const part of parts) {
      const name = (part.item_name || '').toUpperCase();
      const cat = (part.item_cat || '').toUpperCase();
      if (cat === 'BATTERY' || name.includes('BATTERY') || name.includes('BATT')) {
        return 'BATTERY';
      }
    }

    for (const part of parts) {
      const name = (part.item_name || '').toUpperCase();
      const cat = (part.item_cat || '').toUpperCase();
      if (cat === 'MOTHERBOARD' || name.includes('MOTHERBOARD') || name.includes('BOARD') || name.includes('PORT') || name.includes('FLEX') || name.includes('IC')) {
        return 'MOTHERBOARD';
      }
    }
  } catch {}

  try {
    const ticket = db.prepare('SELECT reported_defects, device_model FROM repair_tickets WHERE id = ?').get(ticketId) as any;
    if (ticket) {
      const defect = (ticket.reported_defects || '').toUpperCase();
      if (defect.includes('SCREEN') || defect.includes('DISPLAY') || defect.includes('OLED') || defect.includes('LCD') || defect.includes('شاشة') || defect.includes('باغة')) {
        return 'SCREEN';
      }
      if (defect.includes('BATTERY') || defect.includes('BATT') || defect.includes('بطارية')) {
        return 'BATTERY';
      }
      if (defect.includes('BOARD') || defect.includes('PORT') || defect.includes('IC') || defect.includes('سوكت') || defect.includes('شحن') || defect.includes('ماذر')) {
        return 'MOTHERBOARD';
      }
    }
  } catch {}

  return 'OTHER';
}

export function calculateWarrantyForTicket(ticketId: string, deliveryDate: Date = new Date()): WarrantyCalculationResult {
  const ticket = db.prepare('SELECT * FROM repair_tickets WHERE id = ?').get(ticketId) as any;
  if (!ticket) {
    throw new Error(`Repair ticket ${ticketId} not found`);
  }

  const deliveryMs = deliveryDate.getTime();

  // Case 1: Warranty claim / rework repair ticket with parent ticket (DEC-032 / DEC-041)
  if (ticket.is_warranty_repair && ticket.parent_ticket_id) {
    const parent = db.prepare('SELECT * FROM repair_tickets WHERE id = ?').get(ticket.parent_ticket_id) as any;
    if (parent && parent.warranty_expiry_date) {
      const parentExpiryMs = new Date(parent.warranty_expiry_date).getTime();
      const remainingMs = parentExpiryMs - deliveryMs;
      const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

      // 3-Day testing grace policy (DEC-041): if remaining days < 3, extend by 3 days
      if (remainingDays < 3) {
        const graceExpiryDate = new Date(deliveryMs + 3 * 24 * 60 * 60 * 1000).toISOString();
        return {
          durationDays: 3,
          expiryDate: graceExpiryDate,
          category: 'INHERITED_GRACE',
          isInherited: true,
          isGrace: true
        };
      }

      return {
        durationDays: remainingDays,
        expiryDate: new Date(parentExpiryMs).toISOString(),
        category: 'INHERITED',
        isInherited: true,
        isGrace: false
      };
    }
  }

  // Case 2: Standard initial repair ticket
  const category = detectTicketCategory(ticketId);
  const durationDays = getCategoryWarrantyDays(category);
  const expiryDate = new Date(deliveryMs + durationDays * 24 * 60 * 60 * 1000).toISOString();

  return {
    durationDays,
    expiryDate,
    category,
    isInherited: false,
    isGrace: false
  };
}
