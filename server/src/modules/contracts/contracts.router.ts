import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { logAudit } from '../../services/audit.service';
import crypto from 'crypto';

export const contractsRouter = Router();

/**
 * 1. Create and E-Sign a Digital Custody or Wholesale Contract
 */
contractsRouter.post('/sign', (req: Request, res: Response) => {
  try {
    const {
      ticketId,
      contractType = 'INTAKE_CUSTODY',
      customerName,
      customerPhone,
      deviceModel,
      imeiSn,
      termsBody,
      signaturePng
    } = req.body;

    if (!customerName || !signaturePng || !termsBody) {
      return res.status(400).json({ error: 'customerName, signaturePng, and termsBody are required' });
    }

    const contractId = `ct-${Date.now()}`;
    const signedAt = new Date().toISOString();
    const signerIp = req.ip || '127.0.0.1';

    // Compute Cryptographic Proof Hash (Egyptian E-Signature Compliance Law 15/2004)
    const rawPayloadToHash = `${termsBody}|${customerName}|${customerPhone || ''}|${deviceModel || ''}|${imeiSn || ''}|${signaturePng}|${signedAt}`;
    const cryptographicHash = crypto.createHash('sha256').update(rawPayloadToHash).digest('hex');

    db.prepare(`
      INSERT INTO custody_contracts (id, ticket_id, contract_type, customer_name, customer_phone, device_model, imei_sn, terms_body, signature_png, cryptographic_hash, signed_at, signer_ip, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALID')
    `).run(
      contractId,
      ticketId || null,
      contractType,
      customerName,
      customerPhone || '',
      deviceModel || 'N/A',
      imeiSn || 'N/A',
      termsBody,
      signaturePng,
      cryptographicHash,
      signedAt,
      signerIp
    );

    logAudit({
      action: 'SIGN_DIGITAL_CONTRACT',
      entityType: 'DIGITAL_CONTRACT',
      entityId: contractId,
      newValues: { customerName, contractType, cryptographicHash }
    });

    res.status(201).json({
      contractId,
      status: 'VALID',
      cryptographicHash,
      signedAt,
      message: 'Digital contract legally e-signed and cryptographically sealed'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. Get Contract by ID
 */
contractsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contract = db.prepare('SELECT * FROM custody_contracts WHERE id = ?').get(id) as any;
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    res.json(contract);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. Verify Cryptographic Integrity of Contract
 */
contractsRouter.get('/verify/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contract = db.prepare('SELECT * FROM custody_contracts WHERE id = ?').get(id) as any;
    if (!contract) return res.status(404).json({ error: 'Contract not found' });

    const rawPayloadToHash = `${contract.terms_body}|${contract.customer_name}|${contract.customer_phone || ''}|${contract.device_model || ''}|${contract.imei_sn || ''}|${contract.signature_png}|${contract.signed_at}`;
    const recomputedHash = crypto.createHash('sha256').update(rawPayloadToHash).digest('hex');

    const isValid = recomputedHash === contract.cryptographic_hash;

    res.json({
      contractId: contract.id,
      isValid,
      storedHash: contract.cryptographic_hash,
      recomputedHash,
      signedAt: contract.signed_at,
      tampered: !isValid
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. List Contracts Linked to a Ticket
 */
contractsRouter.get('/ticket/:ticketId', (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;
    const contracts = db.prepare('SELECT * FROM custody_contracts WHERE ticket_id = ? ORDER BY signed_at DESC').all(ticketId);
    res.json(contracts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
