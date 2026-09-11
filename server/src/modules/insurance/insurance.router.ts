import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { logAudit } from '../../services/audit.service';

export const insuranceRouter = Router();

/**
 * 1. List Carriers
 */
insuranceRouter.get('/carriers', (_req: Request, res: Response) => {
  try {
    const carriers = db.prepare('SELECT * FROM insurance_carriers ORDER BY name ASC').all();
    res.json(carriers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. Create Carrier
 */
insuranceRouter.post('/carriers', (req: Request, res: Response) => {
  try {
    const { name, contactEmail, contactPhone, laborRatePerHour = 150.0, requiresPreauth = 1 } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const id = `carrier-${Date.now()}`;
    db.prepare(`
      INSERT INTO insurance_carriers (id, name, contact_email, contact_phone, labor_rate_per_hour, requires_preauth)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, contactEmail || '', contactPhone || '', laborRatePerHour, requiresPreauth ? 1 : 0);

    res.status(201).json({ id, name, laborRatePerHour, requiresPreauth });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. List Claims
 */
insuranceRouter.get('/claims', (_req: Request, res: Response) => {
  try {
    const claims = db.prepare(`
      SELECT c.*, ic.name as carrier_name, t.device_brand, t.device_model, t.imei_sn, t.reported_defects
      FROM insurance_claims c
      JOIN insurance_carriers ic ON c.carrier_id = ic.id
      JOIN repair_tickets t ON c.ticket_id = t.id
      ORDER BY c.created_at DESC
    `).all();
    res.json(claims);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Submit New Insurance Claim
 */
insuranceRouter.post('/claims', (req: Request, res: Response) => {
  try {
    const { ticketId, carrierId, claimNumber, policyNumber, estimateAmount = 1200.0, deductiblePct = 10, flatDeductible = 150.0 } = req.body;
    if (!ticketId || !carrierId || !claimNumber) {
      return res.status(400).json({ error: 'ticketId, carrierId, and claimNumber are required' });
    }

    const carrier = db.prepare('SELECT * FROM insurance_carriers WHERE id = ?').get(carrierId) as any;
    if (!carrier) return res.status(404).json({ error: 'Carrier not found' });

    // Deductible is max of percentage or flat minimum
    const calculatedDeductible = Math.max(Number((estimateAmount * (deductiblePct / 100)).toFixed(2)), flatDeductible);
    const carrierPayable = Math.max(0, estimateAmount - calculatedDeductible);

    const claimId = `claim-${Date.now()}`;
    db.prepare(`
      INSERT INTO insurance_claims (id, ticket_id, carrier_id, claim_number, policy_number, deductible_amount, deductible_paid, carrier_estimate_amount, carrier_approved_amount, claim_status)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'SUBMITTED')
    `).run(claimId, ticketId, carrierId, claimNumber, policyNumber || 'POL-DEFAULT', calculatedDeductible, estimateAmount, carrierPayable);

    // Link claim into repair ticket
    db.prepare('UPDATE repair_tickets SET insurance_claim_id = ? WHERE id = ?').run(claimId, ticketId);

    logAudit({
      action: 'SUBMIT_INSURANCE_CLAIM',
      entityType: 'INSURANCE_CLAIM',
      entityId: claimId,
      newValues: { ticketId, claimNumber, calculatedDeductible, carrierPayable }
    });

    res.status(201).json({
      id: claimId,
      ticketId,
      carrierName: carrier.name,
      claimNumber,
      totalEstimate: estimateAmount,
      customerDeductible: calculatedDeductible,
      carrierPayableEstimate: carrierPayable,
      status: 'SUBMITTED'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. Adjudicate Claim (Approve, Deny, Mark BER)
 */
insuranceRouter.post('/claims/:id/adjudicate', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, approvedAmount, denialReason } = req.body;

    const claim = db.prepare('SELECT * FROM insurance_claims WHERE id = ?').get(id) as any;
    if (!claim) return res.status(404).json({ error: 'Claim not found' });

    db.prepare(`
      UPDATE insurance_claims
      SET claim_status = ?, carrier_approved_amount = COALESCE(?, carrier_approved_amount), denial_reason = ?
      WHERE id = ?
    `).run(status, approvedAmount, denialReason || null, id);

    res.json({ success: true, message: `Claim updated to ${status}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6. Export Claim Dossier
 */
insuranceRouter.get('/claims/:id/export', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const claim = db.prepare(`
      SELECT c.*, ic.name as carrier_name, ic.labor_rate_per_hour,
             t.device_brand, t.device_model, t.imei_sn, t.reported_defects, t.estimated_cost,
             cust.name as customer_name, cust.phone as customer_phone
      FROM insurance_claims c
      JOIN insurance_carriers ic ON c.carrier_id = ic.id
      JOIN repair_tickets t ON c.ticket_id = t.id
      JOIN customers cust ON t.customer_id = cust.id
      WHERE c.id = ?
    `).get(id) as any;

    if (!claim) return res.status(404).json({ error: 'Claim not found' });

    res.json({
      dossierVersion: '1.0-INS-EDI',
      generatedAt: new Date().toISOString(),
      claim
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
