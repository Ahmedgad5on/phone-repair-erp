import { Router, Request, Response } from 'express';
import db from '../../db/database';

export const portalRouter = Router();

// Customer Self-Service Tracking Portal (Dev Proposal 27)
portalRouter.get('/track/:query', (req: Request, res: Response) => {
  const query = req.params.query;

  // Search by ticket number, secret release OTP, or phone number
  const ticket = db.prepare(`
    SELECT t.id, t.ticket_number, t.device_brand, t.device_model, t.reported_defects,
           t.status, t.priority, t.estimated_cost, t.labor_charge, t.parts_cost,
           t.sla_deadline, t.completed_at, t.delivered_at, t.created_at,
           c.name as customer_name, c.phone as customer_phone,
           s.name as store_name, s.phone as store_phone, s.address as store_address
    FROM repair_tickets t
    JOIN customers c ON t.customer_id = c.id
    CROSS JOIN stores s
    WHERE (CAST(t.ticket_number AS TEXT) = ? OR t.release_otp = ? OR c.phone = ?)
      AND t.deleted_at IS NULL
    ORDER BY t.created_at DESC
    LIMIT 1
  `).get(query, query, query) as any;

  if (!ticket) {
    return res.status(404).json({ error: 'No active repair ticket found matching the provided reference number or phone.' });
  }

  // Fetch photos & evidence for the ticket
  const photos = db.prepare('SELECT stage, photo_url, caption, created_at FROM device_photos WHERE ticket_id = ? ORDER BY created_at ASC').all(ticket.id);

  // Fetch rapid inspection results
  const inspections = db.prepare('SELECT stage, checklist_json, pass_count, fail_count, advisory_count, created_at FROM rapid_inspections WHERE ticket_id = ?').all(ticket.id);

  res.json({
    ticket: {
      ...ticket,
      // Mask customer phone for public privacy
      customer_phone: ticket.customer_phone ? ticket.customer_phone.slice(0, 4) + '****' + ticket.customer_phone.slice(-3) : null
    },
    photos,
    inspections,
    timeline: [
      { step: 'INTAKE', completed: true, timestamp: ticket.created_at, label: 'Device Received & Inspected' },
      { step: 'DIAGNOSIS', completed: ['IN_PROGRESS', 'READY', 'DELIVERED'].includes(ticket.status), label: 'Lab Technical Diagnosis' },
      { step: 'REPAIRING', completed: ['READY', 'DELIVERED'].includes(ticket.status), label: 'Board Rework & Reassembly' },
      { step: 'QUALITY_CHECK', completed: ['READY', 'DELIVERED'].includes(ticket.status), label: '24-Point QC Verification' },
      { step: 'READY_PICKUP', completed: ['READY', 'DELIVERED'].includes(ticket.status), timestamp: ticket.completed_at, label: 'Ready For Handover' },
      { step: 'DELIVERED', completed: ticket.status === 'DELIVERED', timestamp: ticket.delivered_at, label: 'Delivered With 30-Day Warranty' }
    ]
  });
});

portalRouter.post('/approve-quote', (req: Request, res: Response) => {
  const { ticket_id, approved, customer_notes } = req.body;
  if (!ticket_id) return res.status(400).json({ error: 'ticket_id is required' });

  const newStatus = approved ? 'IN_PROGRESS' : 'CANCELLED';
  db.prepare(`
    UPDATE repair_tickets
    SET status = ?,
        reported_defects = reported_defects || ?
    WHERE id = ?
  `).run(newStatus, customer_notes ? `\n[Customer Portal Decision]: ${approved ? 'APPROVED' : 'REJECTED'} - Notes: ${customer_notes}` : '', ticket_id);

  res.json({ success: true, status: newStatus, message: approved ? 'Quotation approved by customer. Technician notified.' : 'Quotation rejected by customer.' });
});
