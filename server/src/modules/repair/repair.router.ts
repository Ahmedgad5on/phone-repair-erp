import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bwipjs from 'bwip-js';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { WhatsAppService } from '../../services/whatsapp.service';
import { ReceiptService } from '../../services/receipt.service';
import { logAudit } from '../../services/audit.service';
import { RepairRepository } from '../../repositories/repair.repository';
import { SmartPricingEngine } from '../../services/smart-pricing.service';
import { requireAuth, requireRole, AuthenticatedRequest } from '../../middleware/auth';
import {
  validateStatusTransition,
  checkSlaEscalations,
  generateTrackingQrBuffer,
  ensureDefaultTemplates,
  reservePartsForTicket,
  reconcileDeliveredPartsForTicket,
  releaseReservedPartsForTicket,
  calculateWarrantyForTicket
} from './repair.service';

export const repairRouter = Router();

// 1. Get All Tickets (with SLA status calculation, filtering & search)
repairRouter.get('/tickets', (req: Request, res: Response) => {
  const { status, priority, tech_id, q } = req.query;
  let sql = `
    SELECT t.*, c.name as customer_name, c.phone as customer_phone, c.tag as customer_tag,
           u.name as tech_name, u.commission_rate as tech_commission_rate
    FROM repair_tickets t
    LEFT JOIN customers c ON t.customer_id = c.id
    LEFT JOIN users u ON t.assigned_tech_id = u.id
    WHERE t.deleted_at IS NULL
  `;
  const params: any[] = [];

  if (status) {
    sql += ' AND t.status = ?';
    params.push(status);
  }
  if (priority) {
    sql += ' AND t.priority = ?';
    params.push(priority);
  }
  if (tech_id) {
    sql += ' AND t.assigned_tech_id = ?';
    params.push(tech_id);
  }
  if (q) {
    sql += ' AND (t.device_model LIKE ? OR t.imei_sn LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR CAST(t.ticket_number AS TEXT) LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += " ORDER BY CASE t.priority WHEN 'URGENT' THEN 1 WHEN 'VIP' THEN 2 ELSE 3 END, t.created_at DESC";

  const rawTickets = db.prepare(sql).all(...params) as any[];

  // Calculate live SLA indicators
  const now = Date.now();
  const tickets = rawTickets.map(t => {
    let slaStatus = 'NORMAL';
    let slaRemainingMinutes = 0;
    if (t.sla_deadline) {
      const deadline = new Date(t.sla_deadline).getTime();
      slaRemainingMinutes = Math.round((deadline - now) / 60000);
      if (t.status !== 'DELIVERED' && t.status !== 'CANCELLED') {
        if (slaRemainingMinutes <= 0) {
          slaStatus = 'BREACHED';
        } else if (slaRemainingMinutes <= 60) {
          slaStatus = 'WARNING';
        } else {
          slaStatus = 'ON_TRACK';
        }
      } else {
        slaStatus = 'RESOLVED';
      }
    }
    return {
      ...t,
      slaStatus,
      slaRemainingMinutes
    };
  });

  res.json(tickets);
});

// 2. Ticket Intake Wizard (with CSPRNG OTP and Audit Log)
repairRouter.post('/tickets', (req: Request, res: Response) => {
  const {
    customer_id, customer_name, customer_phone,
    assigned_tech_id, device_brand, device_model, imei_sn,
    passcode, pattern_code, physical_condition, checklist_json,
    reported_defects, intake_media_url, priority, estimated_cost, labor_charge,
    parent_ticket_id, is_warranty_repair
  } = req.body;

  let isWarranty = is_warranty_repair ? 1 : 0;
  if (parent_ticket_id) {
    const parentTicket = db.prepare('SELECT * FROM repair_tickets WHERE id = ?').get(parent_ticket_id) as any;
    if (!parentTicket) {
      return res.status(404).json({ error: 'Parent repair ticket not found', code: 'PARENT_TICKET_NOT_FOUND' });
    }
    isWarranty = 1;

    // Enforce warranty claim acceptance gate (DEC-041, FR-007.2): reject after expiry, HTTP 422
    if (!parentTicket.warranty_expiry_date) {
      return res.status(422).json({
        error: 'WARRANTY_RECORD_INCOMPLETE',
        message: 'Parent ticket has no warranty expiry date — warranty record incomplete',
        code: 'WARRANTY_RECORD_INCOMPLETE'
      });
    }
    const parentExpiryMs = new Date(parentTicket.warranty_expiry_date).getTime();
    if (Date.now() > parentExpiryMs) {
      return res.status(422).json({
        error: 'WARRANTY_EXPIRED',
        message: 'Warranty claim rejected: original expiry date has passed',
        code: 'WARRANTY_EXPIRED'
      });
    }
  }

  const store = db.prepare('SELECT * FROM stores LIMIT 1').get() as any;

  // Find or create customer
  let custId = customer_id;
  if (!custId) {
    let existingCust = db.prepare('SELECT id FROM customers WHERE phone = ? AND deleted_at IS NULL').get(customer_phone) as { id: string } | undefined;
    if (existingCust) {
      custId = existingCust.id;
    } else {
      custId = `cust-${uuidv4().substring(0, 8)}`;
      db.prepare(`
        INSERT INTO customers (id, store_id, name, phone, tag)
        VALUES (?, ?, ?, ?, 'REGULAR')
      `).run(custId, store.id, customer_name, customer_phone);
    }
  }

  // Generate unique ticket number
  const maxTicket = db.prepare('SELECT COALESCE(MAX(ticket_number), 1000) as maxNum FROM repair_tickets').get() as { maxNum: number };
  const ticketNumber = maxTicket.maxNum + 1;

  // Cryptographically secure 4-digit release OTP using CSPRNG
  const releaseOtp = crypto.randomInt(1000, 10000).toString();

  // SLA Deadline
  const minutesToAdd = priority === 'URGENT' ? 60 : priority === 'VIP' ? 120 : 240;
  const slaDeadline = new Date(Date.now() + minutesToAdd * 60000).toISOString();

  const id = `tkt-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO repair_tickets (
      id, ticket_number, store_id, customer_id, assigned_tech_id,
      device_brand, device_model, imei_sn, passcode, pattern_code,
      physical_condition, checklist_json, reported_defects, intake_media_url,
      status, priority, estimated_cost, labor_charge, parts_cost, tech_commission,
      sla_deadline, release_otp, sla_started_at, parent_ticket_id, is_warranty_repair
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INTAKE', ?, ?, ?, 0.0, 0.0, ?, ?, CURRENT_TIMESTAMP, ?, ?)
  `).run(
    id, ticketNumber, store.id, custId, assigned_tech_id || null,
    device_brand, device_model, imei_sn || '', passcode || '', pattern_code || '',
    physical_condition || '', typeof checklist_json === 'object' ? JSON.stringify(checklist_json) : checklist_json || '{}',
    reported_defects, intake_media_url || '', priority || 'NORMAL',
    estimated_cost || 0.0, labor_charge || 0.0, slaDeadline, releaseOtp,
    parent_ticket_id || null, isWarranty
  );

  const created = db.prepare(`
    SELECT t.*, c.name as customer_name, c.phone as customer_phone, u.name as tech_name
    FROM repair_tickets t
    LEFT JOIN customers c ON t.customer_id = c.id
    LEFT JOIN users u ON t.assigned_tech_id = u.id
    WHERE t.id = ?
  `).get(id) as any;

  // Record Audit Log
  logAudit({
    action: 'CREATE',
    entityType: 'REPAIR_TICKET',
    entityId: id,
    newValues: { ticketNumber, device: `${device_brand} ${device_model}`, customer: customer_name, priority },
    ipAddress: req.ip
  });

  // Generate ESC/POS Thermal Receipt for Intake
  const receiptText = ReceiptService.generateEscPosText({
    storeName: store.name,
    storePhone: store.phone,
    storeAddress: store.address,
    receiptHeader: store.receipt_header,
    receiptFooter: store.receipt_footer,
    invoiceNumber: ticketNumber,
    type: 'REPAIR_INTAKE',
    date: new Date().toISOString(),
    customerName: created.customer_name,
    customerPhone: created.customer_phone,
    technicianName: created.tech_name,
    slaDeadline: created.sla_deadline,
    otpCode: releaseOtp,
    qrOrBarcodeData: `TKT-${ticketNumber}`,
    items: [
      {
        name: `${device_brand} ${device_model}`,
        price: estimated_cost || 0.0,
        imei: imei_sn,
        notes: reported_defects
      }
    ],
    subtotal: estimated_cost || 0.0,
    total: estimated_cost || 0.0
  });

  // WhatsApp Intake Trigger
  const waMsg = `Welcome to ${store.name}! Your ${device_brand} ${device_model} was registered under Ticket #${ticketNumber}. Priority: ${priority}. Estimated Ready: ${slaDeadline.substring(11, 16)}. Secret Delivery OTP: ${releaseOtp}. Track: https://erp.local/track/${ticketNumber}`;
  WhatsAppService.sendNotification(store.id, created.customer_phone, 'INTAKE_RECEIPT', waMsg);

  res.status(201).json({
    ticket: created,
    receiptText,
    releaseOtp
  });
});

// 3. Update Ticket Status & Transitions with State Machine Validation & QA Checklist Enforcement
repairRouter.patch(['/tickets/:id/status', '/:id/status'], (req: Request, res: Response) => {
  const { status, tat_minutes, qa_checklist } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });

  const store = db.prepare('SELECT * FROM stores LIMIT 1').get() as any;

  const ticket = db.prepare(`
    SELECT t.*, c.name as customer_name, c.phone as customer_phone
    FROM repair_tickets t
    JOIN customers c ON t.customer_id = c.id
    WHERE t.id = ? AND t.deleted_at IS NULL
  `).get(req.params.id) as any;

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  // State Machine Validation & QA Checklist Enforcement
  const validation = validateStatusTransition(ticket.status, status, qa_checklist, ticket.qa_checklist);
  if (!validation.valid) {
    return res.status(422).json({ error: validation.error, code: validation.code });
  }

  const now = new Date().toISOString();
  let completedAt = ticket.completed_at;
  let deliveredAt = ticket.delivered_at;

  const upperStatus = status.toUpperCase().trim();

  // Logical Stock Reservation Lifecycle (DEC-036 / ADR-036 / FR-003)
  if (upperStatus === 'IN_REPAIR') {
    const resResult = reservePartsForTicket(ticket.id);
    if (!resResult.success && resResult.errors && resResult.errors.length > 0) {
      return res.status(409).json({
        error: 'INSUFFICIENT_AVAILABLE_STOCK',
        message: resResult.errors.join('; '),
        code: 'PARTS_RESERVATION_FAILED'
      });
    }
  } else if (upperStatus === 'DELIVERED') {
    deliveredAt = now;
    reconcileDeliveredPartsForTicket(ticket.id);
    WhatsAppService.scheduleGoogleReviewPrompt(store.id, ticket.customer_phone, ticket.customer_name, store.google_maps_url);
    db.prepare('UPDATE customers SET total_spent = total_spent + ? WHERE id = ?').run(ticket.estimated_cost, ticket.customer_id);

    // Calculate warranty duration and expiry date (DEC-041 / DEC-032 / FR-007)
    const warranty = calculateWarrantyForTicket(ticket.id, new Date(now));
    db.prepare(`
      UPDATE repair_tickets
      SET warranty_duration_days = ?,
          warranty_expiry_date = ?
      WHERE id = ?
    `).run(warranty.durationDays, warranty.expiryDate, ticket.id);

    // FR-009: Warranty Parts Expense Tracking (DEC-031)
    if (ticket.is_warranty_repair) {
      // Sum cost of parts consumed on this ticket
      const partsCost = db.prepare(`
        SELECT COALESCE(SUM(COALESCE(i.cost_price, 0) * cp.quantity), 0) as total_cost
        FROM repair_consumed_parts cp
        LEFT JOIN items i ON cp.item_id = i.id
        WHERE cp.ticket_id = ?
      `).get(ticket.id) as { total_cost: number };

      const costAmount = partsCost.total_cost || 0;

      if (costAmount > 0) {
        // Record warranty cost on ticket
        db.prepare('UPDATE repair_tickets SET warranty_cost_amount = ? WHERE id = ?').run(costAmount, ticket.id);

        // Post journal entry: debit acc-5040 (Warranty Expense), credit acc-1040 (Spare Parts Inventory)
        const maxEntry = db.prepare('SELECT COALESCE(MAX(entry_number), 1000) as maxNum FROM journal_entries').get() as { maxNum: number };
        const entryNumber = maxEntry.maxNum + 1;
        const entryId = `je-${uuidv4().substring(0, 8)}`;
        const actorId = (req as any).user?.userId || 'system';

        const expenseTx = db.transaction(() => {
          db.prepare(`
            INSERT INTO journal_entries (id, entry_number, description, reference_type, reference_id, created_by_user_id, status)
            VALUES (?, ?, ?, 'REPAIR_TICKET', ?, ?, 'POSTED')
          `).run(entryId, entryNumber, `Warranty parts expense for ticket ${ticket.ticket_number}`, ticket.id, actorId);

          // Debit: acc-5040 (Warranty Parts Expense)
          db.prepare(`
            INSERT INTO journal_entry_lines (id, entry_id, account_id, debit, credit, memo)
            VALUES (?, ?, 'acc-5040', ?, 0, ?)
          `).run(`jl-${uuidv4().substring(0, 8)}`, entryId, costAmount, `Warranty parts: ${ticket.ticket_number}`);

          // Credit: acc-1040 (Spare Parts Inventory)
          db.prepare(`
            INSERT INTO journal_entry_lines (id, entry_id, account_id, debit, credit, memo)
            VALUES (?, ?, 'acc-1040', 0, ?, ?)
          `).run(`jl-${uuidv4().substring(0, 8)}`, entryId, costAmount, `Inventory reduction: ${ticket.ticket_number}`);
        });
        expenseTx();

        logAudit({
          action: 'WARRANTY_EXPENSE_POSTED',
          userId: actorId,
          entityType: 'REPAIR_TICKET',
          entityId: ticket.id,
          newValues: { costAmount, entryId, debit: 'acc-5040', credit: 'acc-1040' },
          ipAddress: req.ip
        });
      }
    }
  } else if (upperStatus === 'CANCELLED') {
    releaseReservedPartsForTicket(ticket.id);
  }

  if (upperStatus === 'READY' && !completedAt) {
    completedAt = now;
    const msg = `Dear ${ticket.customer_name}, your ${ticket.device_brand} ${ticket.device_model} (Ticket #${ticket.ticket_number}) is REPAIRED & READY for pickup! Total: ${ticket.estimated_cost} EGP. Secret Release OTP: ${ticket.release_otp}`;
    WhatsAppService.sendNotification(store.id, ticket.customer_phone, 'READY_FOR_PICKUP', msg);
  }

  const checklistStr = qa_checklist !== undefined
    ? (typeof qa_checklist === 'object' ? JSON.stringify(qa_checklist) : String(qa_checklist))
    : ticket.qa_checklist;

  db.prepare(`
    UPDATE repair_tickets
    SET status = ?,
        tat_minutes = COALESCE(?, tat_minutes),
        completed_at = ?,
        delivered_at = ?,
        qa_checklist = ?
    WHERE id = ?
  `).run(status, tat_minutes || null, completedAt, deliveredAt, checklistStr, req.params.id);

  logAudit({
    action: 'UPDATE',
    entityType: 'REPAIR_TICKET',
    entityId: req.params.id as string,
    oldValues: { status: ticket.status },
    newValues: { status, completedAt, deliveredAt, qa_checklist: checklistStr },
    ipAddress: req.ip
  });

  const updated = db.prepare('SELECT * FROM repair_tickets WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Dedicated QA Checklist Update Endpoint
repairRouter.patch(['/tickets/:id/qa-checklist', '/:id/qa-checklist'], (req: Request, res: Response) => {
  const { qa_checklist } = req.body;
  if (!qa_checklist) {
    return res.status(400).json({ error: 'qa_checklist is required' });
  }

  const ticket = db.prepare('SELECT id FROM repair_tickets WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const checklistStr = typeof qa_checklist === 'object' ? JSON.stringify(qa_checklist) : String(qa_checklist);
  db.prepare('UPDATE repair_tickets SET qa_checklist = ? WHERE id = ?').run(checklistStr, req.params.id);

  res.json({ success: true, qa_checklist: checklistStr });
});

// Pre-Authorization WhatsApp Cost Approval Endpoint
repairRouter.patch(['/tickets/:id/send-estimate', '/:id/send-estimate'], (req: Request, res: Response) => {
  const { cost_estimate, diagnosis, notes } = req.body;
  const ticketId = req.params.id as string;

  const ticket = db.prepare(`
    SELECT t.*, c.name as customer_name, c.phone as customer_phone, s.name as store_name
    FROM repair_tickets t
    JOIN customers c ON t.customer_id = c.id
    JOIN stores s ON t.store_id = s.id
    WHERE t.id = ? AND t.deleted_at IS NULL
  `).get(ticketId) as any;

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const cost = cost_estimate !== undefined ? Number(cost_estimate) : ticket.estimated_cost;
  const diag = diagnosis || notes || ticket.reported_defects || 'Component inspection and hardware service required.';

  db.prepare(`
    UPDATE repair_tickets
    SET estimated_cost = ?,
        reported_defects = ?
    WHERE id = ?
  `).run(cost, diag, ticketId);

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const trackUrl = `${baseUrl}/portal/track?ticket=${ticket.ticket_number}`;

  const message = `Hello ${ticket.customer_name}! Technical diagnosis for your ${ticket.device_brand} ${ticket.device_model} (Ticket #${ticket.ticket_number}): ${diag}. Estimated repair cost: ${cost} EGP. Please review and approve: ${trackUrl}`;

  const waRes = WhatsAppService.sendNotification(
    ticket.store_id,
    ticket.customer_phone,
    'INTAKE_RECEIPT' as any,
    message
  );

  logAudit({
    action: 'SEND_ESTIMATE',
    entityType: 'REPAIR_TICKET',
    entityId: ticketId,
    newValues: { cost, diagnosis: diag, notification_id: waRes.id },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    notification_id: waRes.id,
    message: 'Cost estimate sent to customer via WhatsApp',
    estimated_cost: cost,
    diagnosis: diag
  });
});

// Estimate Customer Response Recording (Approval / Rejection)
repairRouter.patch(['/tickets/:id/estimate-response', '/:id/estimate-response'], (req: Request, res: Response) => {
  const { approved, response: actionResponse, customer_notes } = req.body;
  const isApproved = approved === true || actionResponse === 'APPROVED' || actionResponse === 'approve';
  const ticketId = req.params.id as string;

  const ticket = db.prepare('SELECT * FROM repair_tickets WHERE id = ? AND deleted_at IS NULL').get(ticketId) as any;
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const targetStatus = isApproved ? 'IN_REPAIR' : 'CANCELLED';
  const decisionText = isApproved ? 'APPROVED' : 'REJECTED';

  db.prepare(`
    UPDATE repair_tickets
    SET status = ?,
        reported_defects = reported_defects || ?
    WHERE id = ?
  `).run(
    targetStatus,
    customer_notes ? `\n[Customer Decision ${new Date().toISOString()}]: ${decisionText} - ${customer_notes}` : `\n[Customer Decision]: ${decisionText}`,
    ticketId
  );

  logAudit({
    action: 'ESTIMATE_RESPONSE',
    entityType: 'REPAIR_TICKET',
    entityId: ticketId,
    newValues: { decision: decisionText, newStatus: targetStatus },
    ipAddress: req.ip
  });

  const updated = db.prepare('SELECT * FROM repair_tickets WHERE id = ?').get(ticketId);
  res.json({
    success: true,
    approved: isApproved,
    status: targetStatus,
    ticket: updated
  });
});

// Dedicated Repair Ticket Search Endpoint (Index-backed on imei_sn, status)
repairRouter.get(['/search', '/tickets/search'], (req: Request, res: Response) => {
  const imei = (req.query.imei || req.query.q || req.query.serial || '') as string;
  const status = req.query.status as string | undefined;

  let sql = `
    SELECT t.*, c.name as customer_name, c.phone as customer_phone, u.name as tech_name
    FROM repair_tickets t
    LEFT JOIN customers c ON t.customer_id = c.id
    LEFT JOIN users u ON t.assigned_tech_id = u.id
    WHERE t.deleted_at IS NULL
  `;
  const params: any[] = [];

  if (imei) {
    sql += ' AND (t.imei_sn = ? OR t.imei_sn LIKE ? OR CAST(t.ticket_number AS TEXT) = ?)';
    params.push(imei.trim(), `%${imei.trim()}%`, imei.trim());
  }

  if (status) {
    sql += ' AND t.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY t.created_at DESC';

  const results = db.prepare(sql).all(...params);
  res.json(results);
});

// QR Code Customer Tracking URL Generator (using bwip-js)
repairRouter.get(['/tickets/:id/tracking-qr', '/:id/tracking-qr'], async (req: Request, res: Response) => {
  const ticket = db.prepare('SELECT id, ticket_number FROM repair_tickets WHERE id = ? OR CAST(ticket_number AS TEXT) = ?').get(req.params.id, req.params.id) as any;
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const trackingUrl = `${baseUrl}/portal/track?ticket=${ticket.ticket_number}`;

  try {
    const pngBuffer = await generateTrackingQrBuffer(trackingUrl);
    const qrDataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

    if (req.headers.accept?.includes('image/png')) {
      res.setHeader('Content-Type', 'image/png');
      return res.send(pngBuffer);
    }

    res.json({
      ticket_number: ticket.ticket_number,
      tracking_url: trackingUrl,
      qr_data_url: qrDataUrl
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate QR code', details: err.message });
  }
});

// Public Customer Tracking Portal Data Endpoint
repairRouter.get('/portal/track', (req: Request, res: Response) => {
  const queryParam = req.query.ticket || req.query.query;
  if (!queryParam) {
    return res.status(400).json({ error: 'Ticket query parameter is required' });
  }

  const queryStr = String(queryParam);
  const ticket = db.prepare(`
    SELECT t.id, t.ticket_number, t.device_brand, t.device_model, t.reported_defects,
           t.status, t.priority, t.estimated_cost, t.labor_charge, t.parts_cost,
           t.sla_deadline, t.sla_started_at, t.completed_at, t.delivered_at, t.created_at,
           t.release_otp,
           c.name as customer_name, c.phone as customer_phone,
           u.name as technician_name,
           s.name as store_name, s.phone as store_phone, s.address as store_address
    FROM repair_tickets t
    JOIN customers c ON t.customer_id = c.id
    LEFT JOIN users u ON t.assigned_tech_id = u.id
    CROSS JOIN stores s
    WHERE (CAST(t.ticket_number AS TEXT) = ? OR t.id = ? OR t.release_otp = ? OR c.phone = ?)
      AND t.deleted_at IS NULL
    ORDER BY t.created_at DESC
    LIMIT 1
  `).get(queryStr, queryStr, queryStr, queryStr) as any;

  if (!ticket) {
    return res.status(404).json({ error: 'No active repair ticket found' });
  }

  const photos = db.prepare('SELECT * FROM ticket_photos WHERE ticket_id = ? ORDER BY taken_at ASC').all(ticket.id);

  res.json({
    ticket: {
      ...ticket,
      customer_phone: ticket.customer_phone ? ticket.customer_phone.slice(0, 4) + '****' + ticket.customer_phone.slice(-3) : null
    },
    technician_name: ticket.technician_name || 'Lab Technician',
    estimated_ready_date: ticket.sla_deadline || ticket.completed_at || null,
    photos,
    timeline: [
      { step: 'RECEIVED', label: 'Device Received & Inspected', completed: true, timestamp: ticket.created_at },
      { step: 'DIAGNOSED', label: 'Lab Technical Diagnosis', completed: ['DIAGNOSED', 'DIAGNOSING', 'IN_REPAIR', 'QA', 'WAITING_APPROVAL', 'READY', 'DELIVERED'].includes(ticket.status) },
      { step: 'IN_REPAIR', label: 'Board Rework & Component Replacement', completed: ['IN_REPAIR', 'QA', 'WAITING_APPROVAL', 'READY', 'DELIVERED'].includes(ticket.status) },
      { step: 'QA', label: '10-Point Post-Repair Quality Assurance', completed: ['READY', 'DELIVERED'].includes(ticket.status) },
      { step: 'READY', label: 'Device Ready for Pickup', completed: ['READY', 'DELIVERED'].includes(ticket.status), timestamp: ticket.completed_at },
      { step: 'DELIVERED', label: 'Delivered to Customer with Warranty', completed: ticket.status === 'DELIVERED', timestamp: ticket.delivered_at }
    ]
  });
});

// Photo Evidence Timeline Endpoints
repairRouter.get(['/tickets/:id/photos', '/:id/photos'], (req: Request, res: Response) => {
  const ticketId = req.params.id;
  const photos = db.prepare(`
    SELECT * FROM ticket_photos
    WHERE ticket_id = ?
    ORDER BY taken_at ASC, id ASC
  `).all(ticketId);
  res.json(photos);
});

repairRouter.post(['/tickets/:id/photos', '/:id/photos'], (req: Request, res: Response) => {
  const ticketId = req.params.id;
  const { url, data, stage, caption } = req.body;

  const ticket = db.prepare('SELECT id FROM repair_tickets WHERE id = ? AND deleted_at IS NULL').get(ticketId);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  let photoUrl = url;

  if (!photoUrl && data) {
    const UPLOADS_DIR = path.join(__dirname, '../../../data/uploads');
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer: Buffer;
    let ext = '.jpg';
    if (matches && matches.length === 3) {
      const mime = matches[1];
      ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(data, 'base64');
    }
    const savedFilename = `ticket-${ticketId}-${stage || 'evidence'}-${uuidv4().substring(0, 8)}${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, savedFilename), buffer);
    photoUrl = `/api/uploads/${savedFilename}`;
  }

  if (!photoUrl) {
    return res.status(400).json({ error: 'Either url or data (base64) is required' });
  }

  const validStage = ['BEFORE', 'DURING', 'AFTER'].includes((stage || '').toUpperCase())
    ? (stage || '').toUpperCase()
    : 'DURING';

  const photoId = `tp-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO ticket_photos (id, ticket_id, url, stage, taken_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(photoId, ticketId, photoUrl, validStage);

  const created = db.prepare('SELECT * FROM ticket_photos WHERE id = ?').get(photoId);
  res.status(201).json({ success: true, photo: created });
});

repairRouter.delete(['/tickets/:id/photos/:photoId', '/photos/:photoId'], (req: Request, res: Response) => {
  const photoId = req.params.photoId;
  db.prepare('DELETE FROM ticket_photos WHERE id = ?').run(photoId);
  res.json({ success: true, message: 'Photo deleted' });
});

// Repair Notes Template Library Endpoints
repairRouter.get(['/templates', '/notes-templates'], (req: Request, res: Response) => {
  ensureDefaultTemplates();
  const branchId = (req.query.branch_id as string) || 'WH-MAIN';
  const templates = db.prepare('SELECT * FROM repair_notes_templates WHERE branch_id = ? OR branch_id = "WH-MAIN" ORDER BY created_at ASC').all(branchId);
  res.json(templates);
});

repairRouter.post(['/templates', '/notes-templates'], (req: Request, res: Response) => {
  const { title, content, branch_id, created_by } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  const id = `tmpl-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO repair_notes_templates (id, title, content, branch_id, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, title, content, branch_id || 'WH-MAIN', created_by || 'admin');

  const created = db.prepare('SELECT * FROM repair_notes_templates WHERE id = ?').get(id);
  res.status(201).json(created);
});

repairRouter.delete(['/templates/:id', '/notes-templates/:id'], (req: Request, res: Response) => {
  db.prepare('DELETE FROM repair_notes_templates WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Template deleted' });
});

// Parts Out-of-Stock Warning & Availability Helper Endpoints
repairRouter.get('/parts/stock/:id', (req: Request, res: Response) => {
  const item = db.prepare('SELECT id, name, sku, stock_quantity, COALESCE(reorder_point, 5) as reorder_point, selling_price, cost_price FROM items WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as any;
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const isOutOfStock = item.stock_quantity <= 0;
  const isLowStock = item.stock_quantity <= item.reorder_point;

  res.json({
    id: item.id,
    name: item.name,
    sku: item.sku,
    stock_quantity: item.stock_quantity,
    reorder_point: item.reorder_point,
    isLowStock,
    isOutOfStock,
    warning: isOutOfStock
      ? 'CRITICAL: Part is completely OUT OF STOCK!'
      : isLowStock
      ? `WARNING: Low stock! Current quantity (${item.stock_quantity}) is at or below reorder point (${item.reorder_point}).`
      : null
  });
});

repairRouter.get('/parts/available', (req: Request, res: Response) => {
  const items = db.prepare(`
    SELECT id, name, sku, category, stock_quantity, COALESCE(reorder_point, 5) as reorder_point, selling_price, cost_price
    FROM items
    WHERE deleted_at IS NULL
    ORDER BY name ASC
  `).all() as any[];

  const formatted = items.map(i => ({
    ...i,
    isLowStock: i.stock_quantity <= i.reorder_point,
    isOutOfStock: i.stock_quantity <= 0
  }));

  res.json(formatted);
});

// 4. Update Financials & Commission
repairRouter.patch('/tickets/:id/financials', (req: Request, res: Response) => {
  const { labor_charge, parts_cost, assigned_tech_id } = req.body;

  const ticket = db.prepare('SELECT * FROM repair_tickets WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as any;
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const techId = assigned_tech_id || ticket.assigned_tech_id;
  let commissionRate = 0.0;

  if (techId) {
    const tech = db.prepare('SELECT commission_rate FROM users WHERE id = ?').get(techId) as any;
    if (tech) commissionRate = tech.commission_rate || 0.0;
  }

  const finalLabor = labor_charge !== undefined ? labor_charge : ticket.labor_charge;
  const finalParts = parts_cost !== undefined ? parts_cost : ticket.parts_cost;
  const totalCost = finalLabor + finalParts;

  const profitBasis = Math.max(0, finalLabor);
  const commission = Number((profitBasis * commissionRate).toFixed(2));

  db.prepare(`
    UPDATE repair_tickets
    SET labor_charge = ?,
        parts_cost = ?,
        estimated_cost = ?,
        assigned_tech_id = ?,
        tech_commission = ?
    WHERE id = ?
  `).run(finalLabor, finalParts, totalCost, techId, commission, req.params.id);

  const updated = db.prepare('SELECT * FROM repair_tickets WHERE id = ?').get(req.params.id);
  res.json({ ticket: updated, commissionDetails: { profitBasis, commissionRate, calculatedCommission: commission } });
});

// 5. Consume / Allocate Replacement Part (DEC-036 / FR-003 Logical Stock Reservation)
repairRouter.post(['/tickets/:id/consume-part', '/tickets/:id/parts'], (req: Request, res: Response) => {
  const { item_id, scrap_id, part_name, cost_price, selling_price, vendor_batch_code } = req.body;
  const ticketId = req.params.id;

  const ticket = db.prepare('SELECT * FROM repair_tickets WHERE id = ? AND deleted_at IS NULL').get(ticketId) as any;
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const id = `rcp-${uuidv4().substring(0, 8)}`;
  let isReserved = 0;

  if (item_id) {
    const item = db.prepare('SELECT id, name, stock_quantity, reserved_quantity FROM items WHERE id = ? AND deleted_at IS NULL').get(item_id) as any;
    if (!item) return res.status(404).json({ error: 'Part item not found in inventory' });

    const available = item.stock_quantity - (item.reserved_quantity || 0);
    if (available < 1) {
      return res.status(409).json({
        error: 'INSUFFICIENT_AVAILABLE_STOCK',
        message: `Not enough available unreserved stock for part "${item.name}". Stock: ${item.stock_quantity}, Reserved: ${item.reserved_quantity || 0}`,
        available,
        reserved: item.reserved_quantity || 0
      });
    }

    const activeStatuses = ['IN_REPAIR', 'QA', 'READY'];
    if (activeStatuses.includes(ticket.status)) {
      db.prepare('UPDATE items SET reserved_quantity = reserved_quantity + 1 WHERE id = ?').run(item_id);
      isReserved = 1;
    }
  }

  if (scrap_id) {
    db.prepare("UPDATE scrap_warehouse SET status = 'CONSUMED' WHERE id = ?").run(scrap_id);
  }

  db.prepare(`
    INSERT INTO repair_consumed_parts (id, ticket_id, item_id, part_name, vendor_batch_code, cost_price, selling_price, is_reserved)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, ticketId, item_id || null, part_name, vendor_batch_code || 'DIRECT_STOCK', cost_price, selling_price, isReserved);

  const totalPartsCost = (db.prepare('SELECT SUM(cost_price) as sumCost FROM repair_consumed_parts WHERE ticket_id = ?').get(ticketId) as any).sumCost || 0.0;
  db.prepare('UPDATE repair_tickets SET parts_cost = ? WHERE id = ?').run(totalPartsCost, ticketId);

  res.status(201).json({ message: 'Part allocated successfully', consumedPartId: id, totalPartsCost, is_reserved: isReserved });
});

// 6. OTP Release Verification (CSPRNG Verified)
repairRouter.post(['/tickets/:id/verify-release', '/tickets/:id/verify-otp', '/:id/verify-release', '/:id/verify-otp'], (req: Request, res: Response) => {
  const entered_otp = req.body.entered_otp || req.body.otp;
  const ticket = db.prepare('SELECT * FROM repair_tickets WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as any;
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  if (ticket.release_otp === entered_otp) {
    db.prepare('UPDATE repair_tickets SET otp_verified = 1 WHERE id = ?').run(req.params.id);
    logAudit({
      action: 'UPDATE',
      entityType: 'REPAIR_TICKET',
      entityId: req.params.id as string,
      newValues: { otp_verified: 1, entered_otp },
      ipAddress: req.ip
    });
    return res.json({ verified: true, message: 'OTP verified successfully! Device is safe to deliver.' });
  } else {
    logAudit({
      action: 'AUTH_FAILURE',
      entityType: 'REPAIR_OTP',
      entityId: req.params.id as string,
      newValues: { entered_otp, expected: 'REDACTED' },
      ipAddress: req.ip
    });
    return res.status(400).json({ verified: false, error: 'Invalid Release OTP. Device handover blocked.' });
  }
});

// 7. Soft Delete Ticket
repairRouter.delete('/tickets/:id', (req: Request, res: Response) => {
  const ticket = db.prepare('SELECT * FROM repair_tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  db.prepare('UPDATE repair_tickets SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  logAudit({
    action: 'DELETE',
    entityType: 'REPAIR_TICKET',
    entityId: req.params.id as string,
    ipAddress: req.ip
  });

  res.json({ success: true, message: 'Ticket soft-deleted successfully' });
});

// 8. Technician Performance & Commissions Ledger
repairRouter.get('/technicians/performance', (req: Request, res: Response) => {
  const stats = db.prepare(`
    SELECT u.id, u.name, u.role, u.commission_rate,
           COUNT(t.id) as total_assigned,
           SUM(CASE WHEN t.status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_tickets,
           COALESCE(SUM(CASE WHEN t.status = 'DELIVERED' THEN t.tech_commission ELSE 0 END), 0.0) as earned_commissions,
           COALESCE(AVG(CASE WHEN t.status = 'DELIVERED' AND t.tat_minutes > 0 THEN t.tat_minutes ELSE NULL END), 0) as avg_tat_minutes
    FROM users u
    LEFT JOIN repair_tickets t ON u.id = t.assigned_tech_id AND t.deleted_at IS NULL
    WHERE u.role IN ('MaintenanceEngineer', 'SuperAdmin', 'Manager') AND u.deleted_at IS NULL
    GROUP BY u.id
    ORDER BY earned_commissions DESC
  `).all();

  res.json(stats);
});

// 9. Warranty Certificate Generation & Retrieval
repairRouter.get('/tickets/:id/warranty-cert', (req: Request, res: Response) => {
  const cert = db.prepare(`
    SELECT * FROM warranty_certificates
    WHERE ticket_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(req.params.id);

  if (!cert) {
    return res.status(404).json({ error: 'No warranty certificate found for this ticket' });
  }
  res.json(cert);
});

repairRouter.post('/tickets/:id/warranty-cert', (req: Request, res: Response) => {
  const ticket = db.prepare(`
    SELECT t.*, c.name as customer_name, c.phone as customer_phone
    FROM repair_tickets t
    JOIN customers c ON t.customer_id = c.id
    WHERE t.id = ? AND t.deleted_at IS NULL
  `).get(req.params.id) as any;

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const maxCert = db.prepare('SELECT COALESCE(MAX(cert_number), 5000) as maxNum FROM warranty_certificates').get() as { maxNum: number };
  const certNumber = maxCert.maxNum + 1;
  const id = `wc-${uuidv4().substring(0, 8)}`;

  // Calculate dynamic warranty terms per DEC-041 / DEC-032
  const warranty = calculateWarrantyForTicket(ticket.id, new Date());
  const startDate = new Date();
  const endDate = new Date(warranty.expiryDate);

  const terms = `${warranty.durationDays}-Day Limited Repair Warranty on replaced parts (${warranty.category}) and labor. Warranty void if liquid damage, accidental drops, or unauthorized opening detected.`;

  db.prepare(`
    INSERT INTO warranty_certificates (
      id, cert_number, ticket_id, customer_name, customer_phone,
      device_model, imei_sn, warranty_terms, start_date, end_date, status,
      warranty_days, warranty_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(
    id, certNumber, ticket.id, ticket.customer_name, ticket.customer_phone,
    `${ticket.device_brand} ${ticket.device_model}`, ticket.imei_sn || 'N/A',
    terms, startDate.toISOString(), endDate.toISOString(),
    warranty.durationDays, warranty.category
  );

  // Also sync ticket columns
  db.prepare(`
    UPDATE repair_tickets
    SET warranty_duration_days = ?,
        warranty_expiry_date = ?
    WHERE id = ?
  `).run(warranty.durationDays, warranty.expiryDate, ticket.id);

  const created = db.prepare('SELECT * FROM warranty_certificates WHERE id = ?').get(id);
  res.status(201).json(created);
});

// 10. Scrap Warehouse
repairRouter.get('/scrap', (req: Request, res: Response) => {
  const scrap = db.prepare('SELECT * FROM scrap_warehouse WHERE deleted_at IS NULL ORDER BY created_at DESC').all();
  res.json(scrap);
});

repairRouter.post('/scrap/harvest', (req: Request, res: Response) => {
  const { donor_device_model, donor_imei, parts } = req.body;
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string };

  const insertedParts: any[] = [];
  const stmt = db.prepare(`
    INSERT INTO scrap_warehouse (id, store_id, donor_device_model, donor_imei, part_name, condition_grade, estimated_value, barcode_label, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN_STOCK')
  `);

  for (const p of parts) {
    const id = `scrp-${uuidv4().substring(0, 8)}`;
    const barcode = `SCRAP-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    stmt.run(id, store.id, donor_device_model, donor_imei || '', p.part_name, p.condition_grade || 'TESTED_WORKING', p.estimated_value || 0.0, barcode);
    insertedParts.push({ id, barcode, ...p });
  }

  res.status(201).json({ message: `${insertedParts.length} parts harvested into scrap warehouse`, parts: insertedParts });
});

// 11. Technical Diagnostics KB
repairRouter.get('/diagnostics', (req: Request, res: Response) => {
  const { q } = req.query;
  let sql = 'SELECT * FROM diagnostics_kb';
  const params: any[] = [];
  if (q) {
    sql += ' WHERE device_brand LIKE ? OR device_model LIKE ? OR symptom LIKE ? OR schematic_reference LIKE ?';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const kb = db.prepare(sql).all(...params);
  res.json(kb);
});

repairRouter.post('/diagnostics/ai-assistant', (req: Request, res: Response) => {
  const { device_brand, device_model, observed_symptoms, current_draw } = req.body;

  const matches = db.prepare(`
    SELECT * FROM diagnostics_kb
    WHERE (device_brand LIKE ? OR device_model LIKE ?) AND (symptom LIKE ? OR ? != '')
    LIMIT 2
  `).all(`%${device_brand}%`, `%${device_model}%`, `%${observed_symptoms}%`, observed_symptoms);

  let guidanceSteps = [
    `1. Disconnect battery and check main power rail (VDD_MAIN / VPH_PWR) for short to ground using multimeter diode mode.`,
    `2. Connect to DC bench power supply with current limiter at 4.2V / 2.0A. Note standby draw (expected: 0.000A before power button).`,
    `3. If current draw is ${current_draw || 'abnormal'}, thermal scan board using freeze spray or thermal camera to isolate hotspot IC.`
  ];

  if (matches.length > 0) {
    guidanceSteps.push(`Known Board Solution (${(matches[0] as any).symptom}):\n${(matches[0] as any).diagnostic_steps}`);
  }

  res.json({
    aiDiagnosis: {
      model: `${device_brand} ${device_model}`,
      severity: current_draw && parseFloat(current_draw) > 0.5 ? 'CRITICAL_SHORT' : 'MODERATE',
      guidance: guidanceSteps,
      schematicHints: matches.map((m: any) => ({ symptom: m.symptom, diode: m.diode_readings, schematic: m.schematic_reference }))
    }
  });
});

// ==========================================
// 12. Boot Amperage Curve Logger (Dev Proposal 1)
// ==========================================
repairRouter.post('/boot-amperage', (req: Request, res: Response) => {
  const { ticket_id, sample_ms, current_ma, voltage_v, stage, diagnosis_tag, samples } = req.body;
  if (!ticket_id) return res.status(400).json({ error: 'ticket_id is required' });

  // If a batch of samples is provided
  if (Array.isArray(samples) && samples.length > 0) {
    const analysis = RepairRepository.analyzeAmperageCurve(samples);
    for (const s of samples) {
      RepairRepository.logBootAmperage({
        ticket_id,
        sample_ms: s.sample_ms,
        current_ma: s.current_ma,
        voltage_v: s.voltage_v || 4.2,
        stage: s.stage || 'BOOTING',
        diagnosis_tag: analysis.pattern
      });
    }
    return res.status(201).json({ success: true, count: samples.length, analysis });
  }

  const id = RepairRepository.logBootAmperage({
    ticket_id,
    sample_ms: Number(sample_ms) || 0,
    current_ma: Number(current_ma) || 0,
    voltage_v: Number(voltage_v) || 4.2,
    stage,
    diagnosis_tag
  });

  res.status(201).json({ success: true, id });
});

repairRouter.get('/boot-amperage/:ticket_id', (req: Request, res: Response) => {
  const logs = RepairRepository.getBootAmperageLogs(req.params.ticket_id as string);
  const analysis = RepairRepository.analyzeAmperageCurve(logs as any[]);
  res.json({ logs, analysis });
});

// ==========================================
// 13. Diode Mode Readings Database (Dev Proposal 2)
// ==========================================
repairRouter.get('/diode-readings', (req: Request, res: Response) => {
  const { model, connector_type } = req.query;
  const readings = RepairRepository.getDiodeReadings(model as string, connector_type as string);
  res.json(readings);
});

repairRouter.post('/diode-readings/compare', (req: Request, res: Response) => {
  const { model, connector_type, measured_pins } = req.body;
  if (!model || !connector_type || !Array.isArray(measured_pins)) {
    return res.status(400).json({ error: 'model, connector_type, and measured_pins array are required' });
  }

  const result = RepairRepository.compareDiodeReadings(model, connector_type, measured_pins);
  res.json(result);
});

// ==========================================
// 14. TrueTone & BMS Serializer Sync (Dev Proposal 3)
// ==========================================
repairRouter.post('/serializer-sync', (req: Request, res: Response) => {
  const { ticket_id, device_serial, screen_mt_sn, cover_code, bms_sn, cycle_count, battery_health_pct, programmer_model, sync_status } = req.body;
  if (!ticket_id) return res.status(400).json({ error: 'ticket_id is required' });

  const id = RepairRepository.recordSerializerSync({
    ticket_id,
    device_serial,
    screen_mt_sn,
    cover_code,
    bms_sn,
    cycle_count: Number(cycle_count) || 0,
    battery_health_pct: Number(battery_health_pct) || 100,
    programmer_model,
    sync_status
  });

  res.status(201).json({ success: true, id, message: 'TrueTone & BMS programmer sync logged' });
});

repairRouter.get('/serializer-sync/:ticket_id', (req: Request, res: Response) => {
  const logs = RepairRepository.getSerializerSyncLogs(req.params.ticket_id as string);
  res.json(logs);
});

// ==========================================
// 15. Thermal & Microscope Attachment (Dev Proposal 4)
// ==========================================
repairRouter.post('/thermal-logs', (req: Request, res: Response) => {
  const { ticket_id, media_url, media_type, max_temp_c, min_temp_c, hot_spot_x, hot_spot_y, component_ref, notes } = req.body;
  if (!ticket_id || !media_url) return res.status(400).json({ error: 'ticket_id and media_url are required' });

  const id = RepairRepository.recordThermalLog({
    ticket_id,
    media_url,
    media_type,
    max_temp_c: Number(max_temp_c) || 0,
    min_temp_c: min_temp_c ? Number(min_temp_c) : undefined,
    hot_spot_x: hot_spot_x ? Number(hot_spot_x) : undefined,
    hot_spot_y: hot_spot_y ? Number(hot_spot_y) : undefined,
    component_ref,
    notes
  });

  res.status(201).json({ success: true, id });
});

repairRouter.get('/thermal-logs/:ticket_id', (req: Request, res: Response) => {
  const logs = RepairRepository.getThermalLogs(req.params.ticket_id as string);
  res.json(logs);
});

// ==========================================
// 16. Workstation Queue Dispatcher (Dev Proposal 5)
// ==========================================
repairRouter.get('/workstations', (_req: Request, res: Response) => {
  const stations = RepairRepository.getWorkstations();
  res.json(stations);
});

repairRouter.post('/workstations/dispatch', (req: Request, res: Response) => {
  const { workstation_id, ticket_id, tech_id } = req.body;
  if (!workstation_id || !ticket_id) {
    return res.status(400).json({ error: 'workstation_id and ticket_id are required' });
  }

  const result = RepairRepository.dispatchTicketToWorkstation(workstation_id, ticket_id, tech_id);
  res.json(result);
});

// ==========================================
// 17. Rapid 24-Point Digital Inspection (Dev Proposal 6)
// ==========================================
repairRouter.post('/rapid-inspection', (req: Request, res: Response) => {
  const { ticket_id, stage, checklist, inspector_id } = req.body;
  if (!ticket_id || !checklist) {
    return res.status(400).json({ error: 'ticket_id and checklist object are required' });
  }

  const result = RepairRepository.recordRapidInspection({
    ticket_id,
    stage: stage || 'PRE_REPAIR',
    checklist,
    inspector_id
  });

  res.status(201).json({ success: true, ...result });
});

repairRouter.get('/rapid-inspection/:ticket_id', (req: Request, res: Response) => {
  const records = RepairRepository.getRapidInspections(req.params.ticket_id as string);
  res.json(records);
});

// ==========================================
// 18. Boardview & Schematic Viewer (Dev Proposal 33)
// ==========================================
repairRouter.get('/boardview/:model', (req: Request, res: Response) => {
  const model = req.params.model as string;
  // Dynamic boardview netlist & test points
  const boardviewData = {
    deviceModel: model,
    pcbLayers: 10,
    testPoints: [
      { id: 'TP1', net: 'PP_VDD_MAIN', x: 142.5, y: 88.2, nominalVoltage: 4.2, diodeMode: 0.385 },
      { id: 'TP2', net: 'PP_BATT_VCC', x: 110.0, y: 45.1, nominalVoltage: 3.8, diodeMode: 0.440 },
      { id: 'TP3', net: 'PP1V8_S2', x: 89.3, y: 120.7, nominalVoltage: 1.8, diodeMode: 0.310 },
      { id: 'TP4', net: 'PP_CPU_CORE', x: 180.2, y: 155.0, nominalVoltage: 0.9, diodeMode: 0.045 },
      { id: 'TP5', net: 'PP_GPU', x: 195.4, y: 162.1, nominalVoltage: 0.85, diodeMode: 0.038 },
      { id: 'TP6', net: 'I2C0_SCL', x: 65.0, y: 92.4, nominalVoltage: 1.8, diodeMode: 0.520 },
      { id: 'TP7', net: 'I2C0_SDA', x: 68.1, y: 92.4, nominalVoltage: 1.8, diodeMode: 0.520 }
    ],
    schematicPdfUrl: `/api/docs/schematics/${encodeURIComponent(model)}.pdf`,
    hotspots: [
      { component: 'U1000', name: 'Main Power Management IC (PMIC)', x: 135, y: 95, radius: 15 },
      { component: 'U2100', name: 'NAND Flash Memory (256GB/512GB)', x: 210, y: 130, radius: 25 },
      { component: 'U3000', name: 'Application Processor (CPU / SoC)', x: 185, y: 155, radius: 30 }
    ]
  };
  res.json(boardviewData);
});

// ==========================================
// 19. Audio/Video Disclaimer Consent (Dev Proposal 32)
// ==========================================
repairRouter.post('/consents', (req: Request, res: Response) => {
  const { ticket_id, consent_type, media_url, transcription, customer_agreed } = req.body;
  if (!ticket_id || !media_url) return res.status(400).json({ error: 'ticket_id and media_url are required' });

  const id = RepairRepository.recordConsent({
    ticket_id,
    consent_type: consent_type || 'AUDIO',
    media_url,
    transcription,
    customer_agreed
  });

  res.status(201).json({ success: true, id });
});

repairRouter.get('/consents/:ticket_id', (req: Request, res: Response) => {
  const consents = RepairRepository.getConsents(req.params.ticket_id as string);
  res.json(consents);
});

// ==========================================
// 20. Gamified Workshop Leaderboard (Dev Proposal 31)
// ==========================================
repairRouter.get('/leaderboard', (_req: Request, res: Response) => {
  const techs = db.prepare(`
    SELECT u.id, u.name, u.role,
           COUNT(t.id) as total_repairs,
           SUM(CASE WHEN t.status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_repairs,
           COALESCE(AVG(CASE WHEN t.status = 'DELIVERED' AND t.tat_minutes > 0 THEN t.tat_minutes ELSE NULL END), 45) as avg_tat,
           COALESCE(SUM(t.tech_commission), 0.0) as total_earnings
    FROM users u
    LEFT JOIN repair_tickets t ON u.id = t.assigned_tech_id AND t.deleted_at IS NULL
    WHERE u.role IN ('MaintenanceEngineer', 'SuperAdmin', 'Manager') AND u.deleted_at IS NULL
    GROUP BY u.id
    ORDER BY completed_repairs DESC, total_earnings DESC
  `).all() as any[];

  const enriched = techs.map((t, index) => {
    const points = t.completed_repairs * 100 + Math.max(0, Math.round(500 - t.avg_tat * 2));
    let badge = 'BRONZE_TECH';
    if (index === 0 && t.completed_repairs > 0) badge = 'MASTER_SURGEON';
    else if (t.completed_repairs >= 5) badge = 'GOLD_ENGINEER';
    else if (t.completed_repairs >= 2) badge = 'SILVER_SPECIALIST';

    return {
      rank: index + 1,
      ...t,
      gamifiedPoints: points,
      badge,
      streakDays: Math.min(index + 3, 14),
      csatRating: 4.8 + (index === 0 ? 0.2 : -0.1 * index)
    };
  });

  res.json(enriched);
});

// ==========================================
// 21. Warranty Fraud Detection (Dev Proposal 35)
// ==========================================
repairRouter.post('/warranty-fraud-check', (req: Request, res: Response) => {
  const { imei_sn, customer_phone, issue_reported, liquid_indicator_tripped } = req.body;

  let fraudRiskScore = 0;
  const flags: string[] = [];

  // 1. Check if IMEI was reported in stolen registry
  if (imei_sn) {
    const stolen = db.prepare('SELECT * FROM stolen_device_registry WHERE imei = ? AND is_blacklisted = 1').get(imei_sn);
    if (stolen) {
      fraudRiskScore += 70;
      flags.push('IMEI is listed in Police Stolen Registry blacklist');
    }

    // 2. Check previous repair frequency on this IMEI
    const pastRepairs = db.prepare('SELECT COUNT(*) as cnt FROM repair_tickets WHERE imei_sn = ?').get(imei_sn) as { cnt: number };
    if (pastRepairs.cnt >= 3) {
      fraudRiskScore += 25;
      flags.push(`Repeated warranty claims on same IMEI (${pastRepairs.cnt} past claims detected)`);
    }
  }

  // 3. Liquid contact indicator check
  if (liquid_indicator_tripped) {
    fraudRiskScore += 40;
    flags.push('Liquid Contact Indicator (LCI) tripped / red color detected');
  }

  // 4. Customer tag check
  if (customer_phone) {
    const customer = db.prepare('SELECT tag FROM customers WHERE phone = ?').get(customer_phone) as any;
    if (customer && customer.tag === 'HIGH_RETURN') {
      fraudRiskScore += 20;
      flags.push('Customer account tagged with HIGH_RETURN history');
    }
  }

  const isApproved = fraudRiskScore < 50;
  res.json({
    approved: isApproved,
    riskScore: Math.min(fraudRiskScore, 100),
    riskLevel: fraudRiskScore >= 70 ? 'CRITICAL' : fraudRiskScore >= 40 ? 'MEDIUM' : 'LOW',
    flags,
    recommendation: isApproved ? 'Normal warranty intake approved.' : 'REJECT_WARRANTY: Evidence of tamper or fraud policy violation.'
  });
});

// ==========================================
// 22. Dynamic Repair Price Calculator (Dev Proposal 28)
// ==========================================
repairRouter.post('/quote-calculator', (req: Request, res: Response) => {
  const { device_brand, device_model, fault_category, parts_cost } = req.body;
  if (!device_brand || !device_model || !fault_category) {
    return res.status(400).json({ error: 'device_brand, device_model, and fault_category are required' });
  }

  const quote = SmartPricingEngine.calculateSmartEstimate({
    device_brand,
    device_model,
    fault_category,
    parts_cost: Number(parts_cost) || 0
  });

  res.json(quote);
});

// ==========================================
// 23. Void Warranty — RBAC + Mandatory Photo Evidence (DEC-033, DEC-042, FR-008)
// ==========================================
const VOID_EVIDENCE_DIR = path.resolve(process.cwd(), 'uploads/warranty-evidence');
const ALLOWED_MIME = ['image/jpeg', 'image/png'];
const MAX_EVIDENCE_SIZE = 5 * 1024 * 1024; // 5MB

repairRouter.post('/tickets/:id/void-warranty', requireAuth, requireRole(['Manager', 'Admin']), (req: AuthenticatedRequest, res: Response) => {
  const { reason, evidence_file, evidence_base64 } = req.body;
  const ticketId = req.params.id;

  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: 'reason is required', code: 'PHOTO_EVIDENCE_REQUIRED' });
  }

  const ticket = db.prepare('SELECT * FROM repair_tickets WHERE id = ? AND deleted_at IS NULL').get(ticketId) as any;
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found', code: 'TICKET_NOT_FOUND' });
  }

  // Determine evidence source: base64 inline or file path
  let evidenceBuffer: Buffer;
  let ext = 'jpg';

  if (evidence_base64) {
    const match = evidence_base64.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid base64 image data', code: 'EVIDENCE_FORMAT_INVALID' });
    }
    ext = match[1].toLowerCase();
    if (ext === 'jpg') ext = 'jpeg';
    const mime = `image/${ext}`;
    if (!ALLOWED_MIME.includes(mime)) {
      return res.status(400).json({ error: `MIME type ${mime} not allowed. Allowed: ${ALLOWED_MIME.join(', ')}`, code: 'EVIDENCE_FORMAT_INVALID' });
    }
    evidenceBuffer = Buffer.from(match[2], 'base64');
  } else if (evidence_file) {
    const resolvedFile = path.resolve(evidence_file);
    const allowedBase = path.resolve(process.cwd(), 'uploads');
    if (!resolvedFile.startsWith(allowedBase)) {
      return res.status(400).json({ error: 'Evidence file path must be within uploads directory', code: 'EVIDENCE_FORMAT_INVALID' });
    }
    if (!fs.existsSync(resolvedFile)) {
      return res.status(400).json({ error: 'Evidence file not found on disk', code: 'PHOTO_EVIDENCE_REQUIRED' });
    }
    evidenceBuffer = fs.readFileSync(resolvedFile);
    ext = path.extname(resolvedFile).slice(1) || 'jpg';
    if (ext === 'jpg') ext = 'jpeg';
    const mime = `image/${ext}`;
    if (!ALLOWED_MIME.includes(mime)) {
      return res.status(400).json({ error: `MIME type ${mime} not allowed. Allowed: ${ALLOWED_MIME.join(', ')}`, code: 'EVIDENCE_FORMAT_INVALID' });
    }
  } else {
    return res.status(400).json({ error: 'Missing evidence_file or evidence_base64', code: 'PHOTO_EVIDENCE_REQUIRED' });
  }

  if (evidenceBuffer.length > MAX_EVIDENCE_SIZE) {
    return res.status(400).json({ error: `Evidence size ${evidenceBuffer.length} exceeds 5MB limit`, code: 'EVIDENCE_TOO_LARGE' });
  }

  // Save evidence file
  if (!fs.existsSync(VOID_EVIDENCE_DIR)) {
    fs.mkdirSync(VOID_EVIDENCE_DIR, { recursive: true });
  }
  const timestamp = Date.now();
  const filename = `${ticketId}-${timestamp}.${ext}`;
  const filepath = path.join(VOID_EVIDENCE_DIR, filename);

  const evidenceHash = crypto.createHash('sha256').update(evidenceBuffer).digest('hex');
  const managerId = req.user!.userId;

  try {
    fs.writeFileSync(filepath, evidenceBuffer);

    // Update ticket
    db.prepare(`
      UPDATE repair_tickets
      SET warranty_status = 'VOIDED',
          warranty_void_reason = ?,
          warranty_void_evidence_path = ?,
          warranty_void_evidence_hash = ?,
          warranty_void_approved_by = ?,
          warranty_void_approved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason, `warranty-evidence/${filename}`, evidenceHash, managerId, ticketId);
  } catch (err) {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    throw err;
  }

  // Synchronous audit log
  logAudit({
    action: 'WARRANTY_VOIDED',
    entityType: 'REPAIR_TICKET',
    entityId: ticketId,
    userId: managerId,
    newValues: {
      reason,
      evidencePath: `warranty-evidence/${filename}`,
      evidenceHash,
      approvedBy: managerId
    },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    ticket_id: ticketId,
    warranty_status: 'VOIDED',
    evidence_hash: evidenceHash,
    approved_by: managerId
  });
});

// ==========================================
// 24. Warranty Parts Expense Tracking (DEC-031, FR-009) — hook into DELIVERED transition
// ==========================================
// This logic is integrated into the status transition handler above (line ~267-280).
// When status = DELIVERED and is_warranty_repair = 1:
//   1. Record warranty_cost_amount from consumed parts
//   2. Post journal entry: debit acc-5040, credit acc-1040
//   3. Customer invoice total remains 0 piastres
// See the DELIVERED branch in the PATCH /tickets/:id/status handler.
