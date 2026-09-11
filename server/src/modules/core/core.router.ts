import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { WhatsAppService } from '../../services/whatsapp.service';
import { logAudit, getRecentAuditLogs } from '../../services/audit.service';
import { createDatabaseBackup, listBackups, restoreDatabaseBackup } from '../../services/backup.service';
import { FintechRepository } from '../../repositories/fintech.repository';

export const coreRouter = Router();

// Store Info & Modular Flags
coreRouter.get('/store', (req: Request, res: Response) => {
  const store = db.prepare('SELECT * FROM stores LIMIT 1').get();
  if (!store) return res.status(404).json({ error: 'Store not found' });
  res.json(store);
});

coreRouter.patch('/store/modules', (req: Request, res: Response) => {
  const { enable_repair, enable_retail, enable_spare_parts, enable_fintech } = req.body;
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string } | undefined;
  if (!store) return res.status(404).json({ error: 'Store not found' });

  db.prepare(`
    UPDATE stores
    SET enable_repair = COALESCE(?, enable_repair),
        enable_retail = COALESCE(?, enable_retail),
        enable_spare_parts = COALESCE(?, enable_spare_parts),
        enable_fintech = COALESCE(?, enable_fintech)
    WHERE id = ?
  `).run(
    enable_repair !== undefined ? (enable_repair ? 1 : 0) : null,
    enable_retail !== undefined ? (enable_retail ? 1 : 0) : null,
    enable_spare_parts !== undefined ? (enable_spare_parts ? 1 : 0) : null,
    enable_fintech !== undefined ? (enable_fintech ? 1 : 0) : null,
    store.id
  );

  logAudit({
    action: 'UPDATE',
    entityType: 'STORE_MODULES',
    entityId: store.id,
    newValues: { enable_repair, enable_retail, enable_spare_parts, enable_fintech },
    ipAddress: req.ip
  });

  const updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(store.id);
  res.json({ message: 'Store module flags updated successfully', store: updated });
});

coreRouter.patch('/store/info', (req: Request, res: Response) => {
  const { name, phone, address, receipt_header, receipt_footer, google_maps_url } = req.body;
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string } | undefined;
  if (!store) return res.status(404).json({ error: 'Store not found' });

  db.prepare(`
    UPDATE stores
    SET name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        address = COALESCE(?, address),
        receipt_header = COALESCE(?, receipt_header),
        receipt_footer = COALESCE(?, receipt_footer),
        google_maps_url = COALESCE(?, google_maps_url)
    WHERE id = ?
  `).run(name, phone, address, receipt_header, receipt_footer, google_maps_url, store.id);

  const updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(store.id);
  res.json(updated);
});

// Real-Time Dashboard & Analytics Engine
coreRouter.get('/dashboard', (req: Request, res: Response) => {
  // Today's Sales
  const salesToday = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(total), 0.0) as revenue
    FROM sales
    WHERE status = 'COMPLETED' AND date(created_at) = date('now') AND deleted_at IS NULL
  `).get() as { count: number; revenue: number };

  // Repair Tickets by status
  const ticketsByStatus = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM repair_tickets
    WHERE deleted_at IS NULL
    GROUP BY status
  `).all() as { status: string; count: number }[];

  // SLA Breaches
  const slaBreaches = (db.prepare(`
    SELECT COUNT(*) as count
    FROM repair_tickets
    WHERE status NOT IN ('DELIVERED', 'CANCELLED')
      AND sla_deadline < datetime('now')
      AND deleted_at IS NULL
  `).get() as { count: number }).count;

  // Low Stock Items (< min_limit)
  const lowStockCount = (db.prepare(`
    SELECT COUNT(*) as count
    FROM items
    WHERE stock_quantity <= min_limit AND deleted_at IS NULL
  `).get() as { count: number }).count;

  // Total Missing Demand Items
  const missingDemandCount = (db.prepare(`
    SELECT COUNT(*) as count
    FROM missing_demand_log
    WHERE suggested_po_status = 'PENDING'
  `).get() as { count: number }).count;

  // Active Wallets Balance & Locked count
  const walletsSummary = db.prepare(`
    SELECT COALESCE(SUM(current_balance), 0.0) as total_balance,
           SUM(CASE WHEN is_locked = 1 THEN 1 ELSE 0 END) as locked_count,
           COUNT(*) as total_wallets
    FROM fintech_wallets
    WHERE deleted_at IS NULL
  `).get() as any;

  // Current Open Shift Status
  const activeShift = db.prepare(`
    SELECT s.*, u.name as opener_name
    FROM shifts s
    LEFT JOIN users u ON s.opened_by_user_id = u.id
    WHERE s.status = 'OPEN' AND s.deleted_at IS NULL
    ORDER BY s.opened_at DESC LIMIT 1
  `).get();

  res.json({
    todaySales: salesToday,
    ticketsByStatus,
    slaBreaches,
    lowStockCount,
    missingDemandCount,
    walletsSummary,
    activeShift
  });
});

// Users & RBAC
coreRouter.get('/users', (req: Request, res: Response) => {
  const users = db.prepare('SELECT id, username, name, role, is_active, commission_rate, created_at FROM users WHERE deleted_at IS NULL').all();
  res.json(users);
});

coreRouter.post('/users', (req: Request, res: Response) => {
  const { username, password, name, role, commission_rate } = req.body;
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string };
  const id = `usr-${uuidv4().substring(0, 8)}`;
  const passHash = bcrypt.hashSync(password || 'admin123', 12);

  try {
    db.prepare(`
      INSERT INTO users (id, store_id, username, password, name, role, is_active, commission_rate)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(id, store.id, username, passHash, name, role, commission_rate || 0.0);

    logAudit({
      action: 'CREATE',
      entityType: 'USER',
      entityId: id,
      newValues: { username, name, role },
      ipAddress: req.ip
    });

    const user = db.prepare('SELECT id, username, name, role, is_active, commission_rate, created_at FROM users WHERE id = ?').get(id);
    res.status(201).json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Shift Management & Cascading Handover
coreRouter.get('/shifts/current', (req: Request, res: Response) => {
  const shift = db.prepare(`
    SELECT s.*, u.name as opener_name, u2.name as closer_name, u3.name as acceptor_name
    FROM shifts s
    LEFT JOIN users u ON s.opened_by_user_id = u.id
    LEFT JOIN users u2 ON s.closed_by_user_id = u2.id
    LEFT JOIN users u3 ON s.accepted_by_user_id = u3.id
    WHERE s.status IN ('OPEN', 'CLOSED', 'HANDED_OVER') AND s.deleted_at IS NULL
    ORDER BY s.opened_at DESC
    LIMIT 1
  `).get() as any;

  if (!shift) {
    return res.json({ activeShift: null });
  }

  const cashSales = (db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total
    FROM sales
    WHERE payment_method = 'CASH' AND status = 'COMPLETED' AND created_at >= ?
  `).get(shift.opened_at) as any).total;

  const repairCash = (db.prepare(`
    SELECT COALESCE(SUM(estimated_cost), 0) as total
    FROM repair_tickets
    WHERE status = 'DELIVERED' AND delivered_at >= ?
  `).get(shift.opened_at) as any).total;

  const fintechIn = (db.prepare(`
    SELECT COALESCE(SUM(amount + commission), 0) as total
    FROM fintech_transactions
    WHERE trans_type = 'CASH_IN' AND created_at >= ?
  `).get(shift.opened_at) as any).total;

  const fintechOut = (db.prepare(`
    SELECT COALESCE(SUM(amount - commission), 0) as total
    FROM fintech_transactions
    WHERE trans_type = 'CASH_OUT' AND created_at >= ?
  `).get(shift.opened_at) as any).total;

  const expectedCash = shift.opening_cash + cashSales + repairCash + fintechIn - fintechOut;

  res.json({
    activeShift: shift,
    calculatedSummary: {
      openingCash: shift.opening_cash,
      cashSales,
      repairCash,
      fintechCashIn: fintechIn,
      fintechCashOut: fintechOut,
      calculatedExpectedCash: expectedCash
    }
  });
});

coreRouter.post('/shifts/open', (req: Request, res: Response) => {
  const { opening_cash, user_id } = req.body;
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string };

  const id = `shift-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO shifts (id, store_id, opened_by_user_id, opening_cash, expected_cash, status)
    VALUES (?, ?, ?, ?, ?, 'OPEN')
  `).run(id, store.id, user_id || 'usr-cashier', opening_cash || 0.0, opening_cash || 0.0);

  logAudit({
    action: 'CREATE',
    entityType: 'SHIFT',
    entityId: id,
    newValues: { opening_cash, user_id },
    ipAddress: req.ip
  });

  const created = db.prepare('SELECT * FROM shifts WHERE id = ?').get(id);
  res.status(201).json(created);
});

coreRouter.post('/shifts/close', (req: Request, res: Response) => {
  const { shift_id, closed_by_user_id, actual_cash, expected_cash, device_inventory_count, handover_notes } = req.body;

  const diff = actual_cash - expected_cash;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE shifts
    SET closed_by_user_id = ?,
        closed_at = ?,
        expected_cash = ?,
        actual_cash = ?,
        cash_difference = ?,
        device_inventory_count = ?,
        handover_notes = ?,
        status = 'HANDED_OVER'
    WHERE id = ?
  `).run(
    closed_by_user_id,
    now,
    expected_cash,
    actual_cash,
    diff,
    device_inventory_count || 0,
    handover_notes || '',
    shift_id
  );

  logAudit({
    action: 'UPDATE',
    entityType: 'SHIFT',
    entityId: shift_id,
    newValues: { actual_cash, expected_cash, diff },
    ipAddress: req.ip
  });

  const updated = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shift_id);
  res.json({
    message: diff < 0 ? `Shift closed with a CASH DEFICIT of ${Math.abs(diff)} EGP registered against user.` : 'Shift closed successfully.',
    shift: updated,
    hasDeficit: diff < 0,
    deficitAmount: diff < 0 ? Math.abs(diff) : 0
  });
});

coreRouter.post('/shifts/accept-handover', (req: Request, res: Response) => {
  const { shift_id, accepted_by_user_id, is_disputed, dispute_notes } = req.body;
  const now = new Date().toISOString();
  const status = is_disputed ? 'DISPUTED' : 'CLOSED';

  db.prepare(`
    UPDATE shifts
    SET accepted_by_user_id = ?,
        accepted_at = ?,
        status = ?,
        handover_notes = CASE WHEN ? != '' THEN handover_notes || ' [Dispute Note: ' || ? || ']' ELSE handover_notes END
    WHERE id = ?
  `).run(accepted_by_user_id, now, status, dispute_notes || '', dispute_notes || '', shift_id);

  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shift_id);
  res.json({ message: `Shift handover ${status.toLowerCase()} successfully`, shift });
});

// Customer CRM & Ledger
coreRouter.get('/customers', (req: Request, res: Response) => {
  const { q } = req.query;
  let query = 'SELECT * FROM customers WHERE deleted_at IS NULL';
  const params: any[] = [];

  if (q) {
    query += ' AND (name LIKE ? OR phone LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  query += ' ORDER BY total_spent DESC';

  const customers = db.prepare(query).all(...params);
  res.json(customers);
});

coreRouter.post('/customers', (req: Request, res: Response) => {
  const { name, phone, tag, notes } = req.body;
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string };

  const existing = db.prepare('SELECT * FROM customers WHERE phone = ? AND deleted_at IS NULL').get(phone);
  if (existing) {
    return res.status(400).json({ error: 'A customer with this phone number already exists', customer: existing });
  }

  const id = `cust-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO customers (id, store_id, name, phone, tag, loyalty_points, notes)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(id, store.id, name, phone, tag || 'REGULAR', notes || '');

  logAudit({
    action: 'CREATE',
    entityType: 'CUSTOMER',
    entityId: id,
    newValues: { name, phone, tag },
    ipAddress: req.ip
  });

  const created = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  res.status(201).json(created);
});

coreRouter.patch('/customers/:id/tag', (req: Request, res: Response) => {
  const { tag, notes } = req.body;
  db.prepare(`
    UPDATE customers
    SET tag = COALESCE(?, tag),
        notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(tag, notes, req.params.id);

  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  res.json(updated);
});

coreRouter.get('/customers/:id/history', (req: Request, res: Response) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const tickets = db.prepare('SELECT * FROM repair_tickets WHERE customer_id = ? AND deleted_at IS NULL ORDER BY created_at DESC').all(req.params.id);
  const sales = db.prepare('SELECT * FROM sales WHERE customer_id = ? AND deleted_at IS NULL ORDER BY created_at DESC').all(req.params.id);

  res.json({ customer, tickets, sales });
});

// Database Backup & Restore Endpoints
coreRouter.post('/backup', async (req: Request, res: Response) => {
  try {
    const info = await createDatabaseBackup(req.body.user || 'Admin');
    res.json({ success: true, backup: info });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

coreRouter.get('/backups', (req: Request, res: Response) => {
  try {
    const backups = listBackups();
    res.json(backups);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

coreRouter.post('/restore', (req: Request, res: Response) => {
  try {
    const { filename, user } = req.body;
    if (!filename) return res.status(400).json({ error: 'Filename is required' });
    restoreDatabaseBackup(filename, user || 'Admin');
    res.json({ success: true, message: `Database successfully restored from ${filename}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Audit Logs Endpoint
coreRouter.get('/audit-logs', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const logs = getRecentAuditLogs(limit);
  res.json(logs);
});

// CSV Export Endpoint
coreRouter.get('/export/:entity', (req: Request, res: Response) => {
  const { entity } = req.params;
  let data: any[] = [];

  switch (entity) {
    case 'sales':
      data = db.prepare('SELECT id, invoice_number, subtotal, discount, tax, total, payment_method, status, created_at FROM sales ORDER BY created_at DESC').all();
      break;
    case 'items':
      data = db.prepare('SELECT id, sku, barcode, name, category, quality_grade, purchase_price, wholesale_price, retail_price, stock_quantity, warranty_days FROM items WHERE deleted_at IS NULL').all();
      break;
    case 'tickets':
      data = db.prepare('SELECT ticket_number, device_brand, device_model, imei_sn, reported_defects, status, priority, estimated_cost, labor_charge, parts_cost, created_at FROM repair_tickets WHERE deleted_at IS NULL').all();
      break;
    case 'customers':
      data = db.prepare('SELECT id, name, phone, tag, total_spent, loyalty_points, created_at FROM customers WHERE deleted_at IS NULL').all();
      break;
    default:
      return res.status(400).json({ error: `Unsupported export entity: ${entity}` });
  }

  if (data.length === 0) {
    return res.header('Content-Type', 'text/csv').send('No data');
  }

  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row => Object.values(row).map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(','));
  const csv = [headers, ...rows].join('\n');

  logAudit({
    action: 'EXPORT',
    entityType: entity.toUpperCase(),
    newValues: { rowCount: data.length },
    ipAddress: req.ip
  });

  res.header('Content-Type', 'text/csv; charset=utf-8');
  res.attachment(`${entity}-export-${new Date().toISOString().slice(0, 10)}.csv`);
  res.send(csv);
});

// WhatsApp Logs
coreRouter.get('/whatsapp/logs', (req: Request, res: Response) => {
  const logs = db.prepare('SELECT * FROM whatsapp_messages_log ORDER BY created_at DESC LIMIT 50').all();
  res.json(logs);
});

coreRouter.post('/whatsapp/send', (req: Request, res: Response) => {
  const { phone, type, content } = req.body;
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string };
  const result = WhatsAppService.sendNotification(store.id, phone, type || 'INTAKE_RECEIPT', content);
  res.json(result);
});

// ==========================================
// Dual-Custody Shift Rebalancing (Dev Proposal 23)
// ==========================================
coreRouter.post('/shifts/dual-rebalance', (req: Request, res: Response) => {
  const {
    shift_id,
    cashier_user_id,
    cashier_pin,
    manager_user_id,
    manager_pin,
    rebalance_amount,
    rebalance_type,
    reason
  } = req.body;

  if (!shift_id || !cashier_user_id || !cashier_pin || !manager_user_id || !manager_pin || !rebalance_amount) {
    return res.status(400).json({ error: 'All fields (shift_id, cashier credentials, manager credentials, rebalance_amount) are required.' });
  }

  try {
    const result = FintechRepository.dualCustodyRebalance({
      shift_id,
      cashier_user_id,
      cashier_pin,
      manager_user_id,
      manager_pin,
      rebalance_amount: Number(rebalance_amount),
      rebalance_type: rebalance_type || 'SAFE_DROP',
      reason: reason || 'Routine mid-shift safe drop'
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
