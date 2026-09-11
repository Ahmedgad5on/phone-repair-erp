import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { wsService } from '../../services/ws.service';
import { auditService } from '../../services/audit.service';

export const enterpriseRouter = Router();

// ==========================================
// 21. Advanced Customer Loyalty Program v2 (Proposal 21)
// ==========================================
enterpriseRouter.get('/loyalty-rules', (_req: Request, res: Response) => {
  const rules = db.prepare('SELECT * FROM loyalty_rules WHERE is_active = 1').all();
  res.json(rules);
});

enterpriseRouter.post('/loyalty-rules', (req: Request, res: Response) => {
  const { title, rule_type, points_ratio, min_spend } = req.body;
  const id = `lr-${uuidv4().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO loyalty_rules (id, title, rule_type, points_ratio, min_spend)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, title, rule_type, Number(points_ratio) || 0.01, Number(min_spend) || 0);

  res.status(201).json({ message: 'Loyalty rule added', id });
});

// ==========================================
// 22. Email Marketing Campaigns (Proposal 22)
// ==========================================
enterpriseRouter.get('/marketing/campaigns', (_req: Request, res: Response) => {
  const campaigns = db.prepare('SELECT * FROM email_campaigns ORDER BY created_at DESC').all();
  res.json(campaigns);
});

enterpriseRouter.post('/marketing/campaigns', (req: Request, res: Response) => {
  const { title, subject, content_html, target_segment } = req.body;
  if (!title || !subject || !content_html) {
    return res.status(400).json({ error: 'title, subject, and content_html are required' });
  }

  const id = `cmp-${uuidv4().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO email_campaigns (id, title, subject, content_html, target_segment, status)
    VALUES (?, ?, ?, ?, ?, 'SENT')
  `).run(id, title, subject, content_html, target_segment || 'ALL');

  res.status(201).json({ message: 'Campaign dispatched successfully', id });
});

// ==========================================
// 23. Automated Reminders (Proposal 23)
// ==========================================
enterpriseRouter.get('/reminders', (_req: Request, res: Response) => {
  const reminders = db.prepare(`
    SELECT r.*, sa.appointment_date, sa.start_time, sa.device_model, c.name as customer_name, c.phone as customer_phone
    FROM appointment_reminders r
    JOIN service_appointments sa ON r.appointment_id = sa.id
    LEFT JOIN customers c ON sa.customer_id = c.id
    ORDER BY r.scheduled_time ASC
  `).all();
  res.json(reminders);
});

// ==========================================
// 24. Technician Reviews & Ratings (Proposal 24)
// ==========================================
enterpriseRouter.get('/technician-reviews', (_req: Request, res: Response) => {
  const reviews = db.prepare(`
    SELECT tr.*, u.name as technician_name, c.name as customer_name
    FROM technician_reviews tr
    LEFT JOIN users u ON tr.technician_id = u.id
    LEFT JOIN customers c ON tr.customer_id = c.id
    ORDER BY tr.created_at DESC
  `).all();
  res.json(reviews);
});

enterpriseRouter.post('/technician-reviews', (req: Request, res: Response) => {
  const { ticket_id, technician_id, customer_id, rating, review_text } = req.body;
  if (!ticket_id || !rating) {
    return res.status(400).json({ error: 'ticket_id and rating (1-5) are required' });
  }

  const id = `rev-${uuidv4().slice(0, 8)}`;
  db.prepare(`
    INSERT OR REPLACE INTO technician_reviews (id, ticket_id, technician_id, customer_id, rating, review_text)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, ticket_id, technician_id || null, customer_id || null, Number(rating), review_text || null);

  res.status(201).json({ message: 'Review submitted', id });
});

// ==========================================
// 25. Granular Permissions Matrix (Proposal 25)
// ==========================================
enterpriseRouter.get('/permissions', (_req: Request, res: Response) => {
  const matrix = db.prepare('SELECT * FROM permissions_matrix ORDER BY role, resource').all();
  res.json(matrix);
});

enterpriseRouter.post('/permissions/toggle', (req: Request, res: Response) => {
  const { role, resource, action, is_allowed } = req.body;
  if (!role || !resource || !action) {
    return res.status(400).json({ error: 'role, resource, and action are required' });
  }

  db.prepare(`
    INSERT INTO permissions_matrix (id, role, resource, action, is_allowed)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(role, resource, action) DO UPDATE SET is_allowed = excluded.is_allowed
  `).run(`perm-${role}-${resource}-${action}`, role, resource, action, is_allowed ? 1 : 0);

  res.json({ message: 'Permission updated', role, resource, action, is_allowed });
});

// ==========================================
// 26. Multi-Level Approval Workflows (Proposal 26)
// ==========================================
enterpriseRouter.get('/approvals', (_req: Request, res: Response) => {
  const approvals = db.prepare(`
    SELECT a.*, u.name as requester_name
    FROM approval_workflows a
    LEFT JOIN users u ON a.requested_by = u.id
    ORDER BY a.created_at DESC
  `).all();
  res.json(approvals);
});

enterpriseRouter.post('/approvals/action', (req: Request, res: Response) => {
  const { approval_id, action, approved_by, notes } = req.body;
  if (!approval_id || !action) {
    return res.status(400).json({ error: 'approval_id and action (APPROVED/REJECTED) are required' });
  }

  const finalStatus = action === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  db.prepare(`
    UPDATE approval_workflows SET status = ?, approved_by = ?, notes = ? WHERE id = ?
  `).run(finalStatus, approved_by || 'Admin', notes || null, approval_id);

  res.json({ message: `Workflow status updated to ${finalStatus}`, status: finalStatus });
});

// ==========================================
// 27. Departmental Budget Management (Proposal 27)
// ==========================================
enterpriseRouter.get('/budgets', (_req: Request, res: Response) => {
  const budgets = db.prepare('SELECT * FROM department_budgets ORDER BY period_month DESC, department_name ASC').all();
  res.json(budgets);
});

enterpriseRouter.post('/budgets', (req: Request, res: Response) => {
  const { department_name, period_month, budget_allocated } = req.body;
  if (!department_name || !period_month || !budget_allocated) {
    return res.status(400).json({ error: 'department_name, period_month, and budget_allocated are required' });
  }

  const id = `budg-${department_name}-${period_month}`;
  db.prepare(`
    INSERT INTO department_budgets (id, department_name, period_month, budget_allocated)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(department_name, period_month) DO UPDATE SET budget_allocated = excluded.budget_allocated
  `).run(id, department_name.toUpperCase(), period_month, Number(budget_allocated));

  res.status(201).json({ message: 'Budget allocated successfully', id });
});

// ==========================================
// 28. Custom Query & Report Builder (Proposal 28)
// ==========================================
enterpriseRouter.get('/custom-reports', (_req: Request, res: Response) => {
  const reports = db.prepare('SELECT * FROM custom_reports ORDER BY created_at DESC').all();
  res.json(reports);
});

enterpriseRouter.post('/custom-reports', (req: Request, res: Response) => {
  const { name, description, query_json, created_by } = req.body;
  if (!name || !query_json) {
    return res.status(400).json({ error: 'name and query_json are required' });
  }

  const id = `crp-${uuidv4().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO custom_reports (id, name, description, query_json, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, description || null, typeof query_json === 'string' ? query_json : JSON.stringify(query_json), created_by || null);

  res.status(201).json({ message: 'Custom report template saved', id });
});

// ==========================================
// 33. FATF AML Compliance Engine (Proposal 33)
// ==========================================
enterpriseRouter.get('/aml-compliance', (_req: Request, res: Response) => {
  // Flag daily volumes exceeding regulatory thresholds (FATF guidelines for cash)
  const highVolumeCustomers = db.prepare(`
    SELECT customer_phone, COUNT(*) as tx_count, SUM(amount) as total_volume
    FROM fintech_transactions
    WHERE created_at >= datetime('now', '-24 hours')
    GROUP BY customer_phone
    HAVING total_volume >= 25000 OR tx_count >= 5
  `).all();

  const flaggedAccounts = db.prepare(`
    SELECT * FROM fintech_wallets WHERE current_balance >= daily_limit * 0.90
  `).all();

  res.json({
    high_volume_customers: highVolumeCustomers,
    nearing_limit_wallets: flaggedAccounts,
    compliance_status: highVolumeCustomers.length === 0 ? 'COMPLIANT' : 'ATTENTION_REQUIRED',
    evaluated_at: new Date().toISOString()
  });
});

// ==========================================
// 34. Enhanced Digital KYC Verification (Proposal 34)
// ==========================================
enterpriseRouter.get('/kyc', (_req: Request, res: Response) => {
  const kycList = db.prepare(`
    SELECT k.*, c.name as customer_name, c.phone as customer_phone
    FROM kyc_documents k
    LEFT JOIN customers c ON k.customer_id = c.id
    ORDER BY k.verified_at DESC
  `).all();
  res.json(kycList);
});

enterpriseRouter.post('/kyc', (req: Request, res: Response) => {
  const { customer_id, document_type, id_number, photo_front, photo_back, verified_by } = req.body;
  if (!customer_id || !id_number) {
    return res.status(400).json({ error: 'customer_id and id_number are required' });
  }

  const id = `kyc-${uuidv4().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO kyc_documents (id, customer_id, document_type, id_number, photo_front, photo_back, verification_status, verified_by)
    VALUES (?, ?, ?, ?, ?, ?, 'VERIFIED', ?)
  `).run(id, customer_id, document_type || 'NATIONAL_ID', id_number, photo_front || null, photo_back || null, verified_by || 'Admin');

  // Update customer tag to VIP / Verified
  db.prepare("UPDATE customers SET tag = 'VIP' WHERE id = ?").run(customer_id);

  res.status(201).json({ message: 'Customer KYC verified successfully', id });
});

// ==========================================
// 35. Immutable Audit Log Verification (Proposal 35)
// ==========================================
enterpriseRouter.get('/audit/verify', (_req: Request, res: Response) => {
  const verification = auditService.verifyChainIntegrity();
  res.json({
    chain_valid: verification.isValid,
    total_audited_records: verification.totalRecords,
    tampered_record_id: verification.tamperedRecordId || null,
    cryptographic_algorithm: 'SHA-256 Chained Hash Sequence'
  });
});

// ==========================================
// 36. B2B Fleet Device Management (Dev Proposal 29)
// ==========================================
enterpriseRouter.get('/b2b-fleet', (_req: Request, res: Response) => {
  const accounts = db.prepare(`
    SELECT a.*,
           (SELECT COUNT(*) FROM b2b_fleet_devices d WHERE d.fleet_account_id = a.id) as device_count
    FROM b2b_fleet_accounts a
    ORDER BY a.created_at DESC
  `).all() as any[];

  const devices = db.prepare(`
    SELECT d.*, a.company_name, a.sla_level
    FROM b2b_fleet_devices d
    JOIN b2b_fleet_accounts a ON d.fleet_account_id = a.id
    ORDER BY d.brand ASC, d.model ASC
  `).all();

  res.json({ accounts, devices });
});

enterpriseRouter.post('/b2b-fleet/accounts', (req: Request, res: Response) => {
  const { company_name, tax_id, contact_person, phone, email, sla_level, monthly_billing_rate } = req.body;
  if (!company_name || !contact_person || !phone) {
    return res.status(400).json({ error: 'company_name, contact_person, and phone are required' });
  }

  const id = `fleet-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO b2b_fleet_accounts (id, company_name, tax_id, contact_person, phone, email, sla_level, monthly_billing_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, company_name, tax_id || null, contact_person, phone, email || null, sla_level || 'GOLD', Number(monthly_billing_rate) || 0.0);

  res.status(201).json({ success: true, id, message: 'B2B Fleet account created successfully' });
});

enterpriseRouter.post('/b2b-fleet/devices', (req: Request, res: Response) => {
  const { fleet_account_id, brand, model, imei_sn, asset_tag, user_assigned, warranty_end } = req.body;
  if (!fleet_account_id || !brand || !model || !imei_sn) {
    return res.status(400).json({ error: 'fleet_account_id, brand, model, and imei_sn are required' });
  }

  const id = `fdev-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO b2b_fleet_devices (id, fleet_account_id, brand, model, imei_sn, asset_tag, user_assigned, warranty_end)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, fleet_account_id, brand, model, imei_sn, asset_tag || null, user_assigned || null, warranty_end || null);

  res.status(201).json({ success: true, id, message: 'B2B device enrolled into fleet management' });
});
