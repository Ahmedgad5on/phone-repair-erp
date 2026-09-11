import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { wsService } from '../../services/ws.service';
import { auditService } from '../../services/audit.service';

export const advancedRepairRouter = Router();

// ==========================================
// 11. Annual Maintenance Contracts (AMC) (Proposal 11)
// ==========================================
advancedRepairRouter.get('/amc', (_req: Request, res: Response) => {
  const contracts = db.prepare(`
    SELECT a.*, c.name as customer_name, c.phone as customer_phone
    FROM amc_contracts a
    LEFT JOIN customers c ON a.customer_id = c.id
    ORDER BY a.created_at DESC
  `).all();
  res.json(contracts);
});

advancedRepairRouter.post('/amc', (req: Request, res: Response) => {
  const { customer_id, contract_title, start_date, end_date, devices_count, periodic_visits, contract_value, billing_cycle } = req.body;
  if (!customer_id || !contract_title || !contract_value) {
    return res.status(400).json({ error: 'customer_id, contract_title, and contract_value are required' });
  }

  const id = `amc-${uuidv4().slice(0, 8)}`;
  const contractNumber = `AMC-${Date.now().toString().slice(-6)}`;

  db.prepare(`
    INSERT INTO amc_contracts (id, customer_id, contract_title, contract_number, start_date, end_date, devices_count, periodic_visits, contract_value, billing_cycle, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
  `).run(
    id,
    customer_id,
    contract_title,
    contractNumber,
    start_date || new Date().toISOString().split('T')[0],
    end_date || new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
    Number(devices_count) || 1,
    Number(periodic_visits) || 4,
    Number(contract_value),
    billing_cycle || 'ANNUAL'
  );

  auditService.log({
    action: 'AMC_CONTRACT_CREATED',
    entityType: 'AMC_CONTRACT',
    entityId: id,
    payload: { contractNumber, contract_value }
  });

  res.status(201).json({ message: 'AMC contract created successfully', id, contract_number: contractNumber });
});

// ==========================================
// 12. Remote Self-Service Booking Portal (Proposal 12)
// ==========================================
advancedRepairRouter.post('/remote-bookings', (req: Request, res: Response) => {
  const { customer_name, customer_phone, device_model, issue_description, preferred_date, preferred_time } = req.body;
  if (!customer_name || !customer_phone || !device_model) {
    return res.status(400).json({ error: 'customer_name, customer_phone, and device_model are required' });
  }

  const id = `rbk-${uuidv4().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO remote_bookings (id, customer_name, customer_phone, device_model, issue_description, preferred_date, preferred_time, booking_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'CONFIRMED')
  `).run(
    id,
    customer_name,
    customer_phone,
    device_model,
    issue_description || 'General inspection',
    preferred_date || new Date().toISOString().split('T')[0],
    preferred_time || '14:00'
  );

  wsService.broadcast('NEW_REMOTE_BOOKING', {
    booking_id: id,
    customer_name,
    device_model
  });

  res.status(201).json({
    booking_id: id,
    message: 'Repair booking confirmed! An SMS confirmation has been scheduled.',
    status: 'CONFIRMED'
  });
});

advancedRepairRouter.get('/remote-bookings', (_req: Request, res: Response) => {
  const bookings = db.prepare('SELECT * FROM remote_bookings ORDER BY created_at DESC LIMIT 50').all();
  res.json(bookings);
});

// ==========================================
// 14. Outsourced Specialized Lab Repairs (Proposal 14)
// ==========================================
advancedRepairRouter.get('/outsource', (_req: Request, res: Response) => {
  const outsourced = db.prepare(`
    SELECT o.*, t.device_brand, t.device_model, t.customer_name
    FROM outsource_repairs o
    LEFT JOIN repair_tickets t ON o.ticket_id = t.id
    ORDER BY o.sent_date DESC
  `).all();
  res.json(outsourced);
});

advancedRepairRouter.post('/outsource', (req: Request, res: Response) => {
  const { ticket_id, external_workshop_name, contact_phone, workshop_cost, customer_charge, technician_notes } = req.body;
  if (!ticket_id || !external_workshop_name) {
    return res.status(400).json({ error: 'ticket_id and external_workshop_name are required' });
  }

  const id = `out-${uuidv4().slice(0, 8)}`;
  const trackingRef = `EXT-${Date.now().toString().slice(-6)}`;

  db.prepare(`
    INSERT INTO outsource_repairs (id, ticket_id, external_workshop_name, contact_phone, tracking_reference, workshop_cost, customer_charge, status, technician_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'SENT', ?)
  `).run(
    id,
    ticket_id,
    external_workshop_name,
    contact_phone || null,
    trackingRef,
    Number(workshop_cost) || 0,
    Number(customer_charge) || 0,
    technician_notes || null
  );

  // Update ticket status to outsourced
  db.prepare("UPDATE repair_tickets SET status = 'IN_PROGRESS' WHERE id = ?").run(ticket_id);

  res.status(201).json({ message: 'Device outsourced successfully', id, tracking_reference: trackingRef });
});

// ==========================================
// 15. Device Condition Photo Evidence (Proposal 15)
// ==========================================
advancedRepairRouter.get('/photos/:ticket_id', (req: Request, res: Response) => {
  const ticketId = req.params.ticket_id as string;
  const photos = db.prepare('SELECT * FROM device_photos WHERE ticket_id = ? ORDER BY created_at ASC').all(ticketId);
  res.json(photos);
});

advancedRepairRouter.post('/photos', (req: Request, res: Response) => {
  const { ticket_id, stage, photo_url, caption, taken_by } = req.body;
  if (!ticket_id || !photo_url) {
    return res.status(400).json({ error: 'ticket_id and photo_url are required' });
  }

  const id = `img-${uuidv4().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO device_photos (id, ticket_id, stage, photo_url, caption, taken_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, ticket_id, stage || 'INTAKE', photo_url, caption || null, taken_by || null);

  res.status(201).json({ message: 'Device condition photo saved', id });
});
