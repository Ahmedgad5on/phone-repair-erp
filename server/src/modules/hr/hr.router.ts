import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../../services/audit.service';

export const hrRouter = Router();

// 1. Attendance Records
hrRouter.get('/attendance', (req: Request, res: Response) => {
  const { date } = req.query;
  let sql = `
    SELECT a.*, u.name as employee_name, u.role, u.username
    FROM employee_attendance a
    JOIN users u ON a.user_id = u.id
  `;
  const params: any[] = [];
  if (date) {
    sql += ' WHERE a.attendance_date = ?';
    params.push(date);
  }
  sql += ' ORDER BY a.attendance_date DESC, a.created_at DESC LIMIT 100';

  const records = db.prepare(sql).all(...params);
  res.json(records);
});

hrRouter.post('/attendance/check-in', (req: Request, res: Response) => {
  const { user_id, notes } = req.body;
  const today = new Date().toISOString().split('T')[0];
  const nowTime = new Date().toLocaleTimeString('ar-EG');

  const existing = db.prepare('SELECT id FROM employee_attendance WHERE user_id = ? AND attendance_date = ?').get(user_id, today) as any;
  if (existing) {
    return res.status(400).json({ error: 'Employee already checked in today.' });
  }

  const id = `att-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO employee_attendance (id, user_id, attendance_date, check_in, status, notes)
    VALUES (?, ?, ?, ?, 'PRESENT', ?)
  `).run(id, user_id, today, nowTime, notes || 'On-time lab arrival');

  res.status(201).json({ id, message: 'Check-in recorded successfully', checkInTime: nowTime });
});

hrRouter.post('/attendance/check-out', (req: Request, res: Response) => {
  const { user_id } = req.body;
  const today = new Date().toISOString().split('T')[0];
  const nowTime = new Date().toLocaleTimeString('ar-EG');

  const record = db.prepare('SELECT id FROM employee_attendance WHERE user_id = ? AND attendance_date = ?').get(user_id, today) as any;
  if (!record) {
    return res.status(404).json({ error: 'No check-in record found for today' });
  }

  db.prepare('UPDATE employee_attendance SET check_out = ? WHERE id = ?').run(nowTime, record.id);
  res.json({ message: 'Check-out recorded successfully', checkOutTime: nowTime });
});

// 2. Employee Leaves
hrRouter.get('/leaves', (req: Request, res: Response) => {
  const leaves = db.prepare(`
    SELECT l.*, u.name as employee_name, u.role
    FROM employee_leaves l
    JOIN users u ON l.user_id = u.id
    ORDER BY l.created_at DESC
  `).all();
  res.json(leaves);
});

hrRouter.post('/leaves', (req: Request, res: Response) => {
  const { user_id, leave_type, start_date, end_date, reason } = req.body;
  const id = `lv-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO employee_leaves (id, user_id, leave_type, start_date, end_date, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, 'APPROVED')
  `).run(id, user_id, leave_type, start_date, end_date, reason || '');

  res.status(201).json({ id, message: 'Leave request registered and approved' });
});

// 3. Payroll Records & Commission Calculation
hrRouter.get('/payroll', (req: Request, res: Response) => {
  const payroll = db.prepare(`
    SELECT p.*, u.name as employee_name, u.role
    FROM payroll_records p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.payroll_month DESC
  `).all();
  res.json(payroll);
});

hrRouter.post('/payroll/generate', (req: Request, res: Response) => {
  const { month } = req.body; // format: 'YYYY-MM'
  const targetMonth = month || new Date().toISOString().substring(0, 7);

  const employees = db.prepare("SELECT id, name, role, commission_rate FROM users WHERE is_active = 1 AND deleted_at IS NULL").all() as any[];

  const insertPayroll = db.prepare(`
    INSERT INTO payroll_records (id, user_id, payroll_month, base_salary, commission_earned, bonuses, deductions, net_salary, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PAID')
  `);

  const generatedList: any[] = [];

  const processPayroll = db.transaction(() => {
    // Delete existing for month if re-generating
    db.prepare('DELETE FROM payroll_records WHERE payroll_month = ?').run(targetMonth);

    for (const emp of employees) {
      // Calculate commissions earned in target month
      const commQuery = db.prepare(`
        SELECT COALESCE(SUM(tech_commission), 0.0) as total_comm
        FROM repair_tickets
        WHERE assigned_tech_id = ? AND status = 'DELIVERED' AND strftime('%Y-%m', delivered_at) = ?
      `).get(emp.id, targetMonth) as any;

      const commission = commQuery ? commQuery.total_comm : 0.0;
      const baseSalary = emp.role === 'Manager' ? 12000 : emp.role === 'MaintenanceEngineer' ? 7000 : 5000;
      const bonuses = commission > 2000 ? 500 : 0;
      const deductions = 0;
      const netSalary = baseSalary + commission + bonuses - deductions;

      const id = `pay-${uuidv4().substring(0, 8)}`;
      insertPayroll.run(id, emp.id, targetMonth, baseSalary, commission, bonuses, deductions, netSalary);
      generatedList.push({ employee: emp.name, baseSalary, commission, netSalary });
    }
  });

  processPayroll();

  logAudit({
    action: 'CREATE',
    entityType: 'PAYROLL',
    entityId: targetMonth,
    newValues: { month: targetMonth, employeeCount: employees.length },
    ipAddress: req.ip
  });

  res.status(201).json({
    success: true,
    month: targetMonth,
    payrollRecords: generatedList,
    message: `Payroll generated and calculated for ${employees.length} employees`
  });
});
