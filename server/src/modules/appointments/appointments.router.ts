import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../../services/audit.service';
import { wsService } from '../../services/ws.service';

export const appointmentsRouter = Router();

// 1. Get Appointments
appointmentsRouter.get('/', (req: Request, res: Response) => {
  const { date } = req.query;
  let sql = `
    SELECT a.*, u.name as technician_name
    FROM service_appointments a
    LEFT JOIN users u ON a.assigned_tech_id = u.id
  `;
  const params: any[] = [];
  if (date) {
    sql += ' WHERE a.appointment_date = ?';
    params.push(date);
  }
  sql += ' ORDER BY a.appointment_date ASC, a.appointment_time ASC';

  const appointments = db.prepare(sql).all(...params);
  res.json(appointments);
});

// 2. Book Appointment
appointmentsRouter.post('/', (req: Request, res: Response) => {
  const { customer_name, customer_phone, device_brand, device_model, issue_description, appointment_date, appointment_time, assigned_tech_id, notes } = req.body;
  if (!customer_name || !customer_phone || !device_model || !appointment_date || !appointment_time) {
    return res.status(400).json({ error: 'Customer name, phone, device model, appointment date and time are required' });
  }

  const id = `apt-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO service_appointments (
      id, customer_name, customer_phone, device_brand, device_model,
      issue_description, appointment_date, appointment_time, status, assigned_tech_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?)
  `).run(
    id, customer_name, customer_phone, device_brand || 'Apple', device_model,
    issue_description || '', appointment_date, appointment_time, assigned_tech_id || null, notes || ''
  );

  logAudit({
    action: 'CREATE',
    entityType: 'APPOINTMENT',
    entityId: id,
    newValues: { customer_name, appointment_date, appointment_time, device_model },
    ipAddress: req.ip
  });

  wsService.broadcast('APPOINTMENT_BOOKED', { id, customer_name, appointment_date, appointment_time });

  const created = db.prepare('SELECT * FROM service_appointments WHERE id = ?').get(id);
  res.status(201).json(created);
});

// 3. Update Status
appointmentsRouter.patch('/:id/status', (req: Request, res: Response) => {
  const { status } = req.body;
  db.prepare('UPDATE service_appointments SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true, status });
});

// 4. Available Slots for Date
appointmentsRouter.get('/slots', (req: Request, res: Response) => {
  const { date } = req.query;
  const targetDate = (date as string) || new Date().toISOString().split('T')[0];

  const standardSlots = [
    '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM',
    '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
    '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM'
  ];

  const bookedAppointments = db.prepare(`
    SELECT appointment_time FROM service_appointments
    WHERE appointment_date = ? AND status != 'CANCELLED'
  `).all(targetDate) as { appointment_time: string }[];

  const bookedSet = new Set(bookedAppointments.map(b => b.appointment_time));

  const slots = standardSlots.map(slot => ({
    time: slot,
    isAvailable: !bookedSet.has(slot)
  }));

  res.json({ date: targetDate, slots });
});
