import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { logAudit } from '../../services/audit.service';

export const stolenRegistryRouter = Router();

/**
 * 1. Check IMEI against Stolen Device Registry & GSMA Blacklist
 */
stolenRegistryRouter.get('/imei-check/:imei', (req: Request, res: Response) => {
  try {
    const { imei } = req.params;
    if (!imei || imei.length < 8) {
      return res.status(400).json({ error: 'Valid IMEI (minimum 8 digits) is required' });
    }

    const matchedRecord = db.prepare('SELECT * FROM stolen_device_registry WHERE imei = ? AND is_blacklisted = 1').get(imei) as any;

    if (matchedRecord) {
      return res.json({
        isStolen: true,
        alertLevel: 'HIGH_ALERT_LAW_ENFORCEMENT',
        imei: matchedRecord.imei,
        brand: matchedRecord.brand,
        model: matchedRecord.model,
        incidentNumber: matchedRecord.incident_number,
        reportedBy: matchedRecord.reported_by,
        reportDate: matchedRecord.report_date,
        warningMessage: `⚠️ WARNING: This device (IMEI: ${imei}) is flagged as STOLEN under incident ${matchedRecord.incident_number}. DO NOT ADMIT TO REPAIR LAB OR PURCHASE.`
      });
    }

    res.json({
      isStolen: false,
      alertLevel: 'CLEAN',
      imei,
      status: 'Device is clean and clear of theft/GSMA blacklist reports'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. Report Stolen Device
 */
stolenRegistryRouter.post('/stolen-reports', (req: Request, res: Response) => {
  try {
    const { imei, brand, model, incidentNumber, reportedBy = 'POLICE_REPORT', notes = '' } = req.body;
    if (!imei || !brand || !model) {
      return res.status(400).json({ error: 'imei, brand, and model are required' });
    }

    const id = `stl-${Date.now()}`;
    db.prepare(`
      INSERT INTO stolen_device_registry (id, imei, brand, model, incident_number, reported_by, is_blacklisted, notes)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(imei) DO UPDATE SET is_blacklisted = 1, incident_number = excluded.incident_number, notes = excluded.notes
    `).run(id, imei, brand, model, incidentNumber || 'N/A', reportedBy, notes);

    logAudit({
      action: 'FLAG_STOLEN_DEVICE',
      entityType: 'STOLEN_REGISTRY',
      entityId: id,
      newValues: { imei, incidentNumber, reportedBy }
    });

    res.status(201).json({
      id,
      imei,
      isBlacklisted: true,
      message: 'IMEI successfully logged into Stolen Device Blacklist'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. List Stolen Device Reports
 */
stolenRegistryRouter.get('/stolen-reports', (_req: Request, res: Response) => {
  try {
    const records = db.prepare('SELECT * FROM stolen_device_registry ORDER BY report_date DESC').all();
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
