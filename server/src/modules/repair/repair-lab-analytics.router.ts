import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db/database';
import { logAudit } from '../../services/audit.service';
import { WhatsAppService } from '../../services/whatsapp.service';
import {
  recordTechnicianLaborMetric,
  getTechnicianYieldReport,
  compareRepairCategoryYield,
  smartDispatchTicket,
  validateGatedQA,
  getTechnicianRMATracker,
  recordToolingUsage,
  getToolingCostPerDevice,
  calculateScrapPartValue,
  distributePurchasePriceToDeviceParts,
  recordDeadQuote,
  getDeadQuoteAnalytics,
  getWarrantyTierForService,
  getIntakeTriageAccuracy,
  getCustomerApprovalLatency,
  calculateRealProfitCommission,
  getModelFaultReport,
  getShelfDwellAlerts,
  createOutsourceEntry,
  getOutsourceReport,
  createVendorDefectReturn,
  recordDeviceVisit,
  checkRepeatDevice,
  calculateSurgePrice,
  addResistanceReference,
  compareResistance,
  assessDeviceRisk,
  recordAbandonedAccessory,
  getAbandonedAccessoriesReport
} from './repair-lab-analytics.service';

export const repairLabAnalyticsRouter = Router();

// ========================================
// F1: مؤشر العائد على الدقيقة الفنية (Labor Yield Per Minute)
// ========================================
repairLabAnalyticsRouter.post('/labor-metrics', (req: Request, res: Response) => {
  const { technician_id, ticket_id, device_brand, device_model, repair_category, minutes_spent, labor_revenue, parts_cost } = req.body;
  
  if (!technician_id || !ticket_id || minutes_spent === undefined || labor_revenue === undefined) {
    return res.status(400).json({ error: 'technician_id, ticket_id, minutes_spent, and labor_revenue are required' });
  }

  const id = recordTechnicianLaborMetric({
    technician_id, ticket_id, device_brand, device_model, repair_category,
    minutes_spent: Number(minutes_spent), labor_revenue: Number(labor_revenue), parts_cost: Number(parts_cost || 0)
  });

  logAudit({ action: 'CREATE', entityType: 'TECHNICIAN_LABOR_METRIC', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

repairLabAnalyticsRouter.get('/labor-yield-report', (req: Request, res: Response) => {
  const { technician_id, days } = req.query;
  const report = getTechnicianYieldReport(technician_id as string, Number(days) || 30);
  res.json(report);
});

repairLabAnalyticsRouter.get('/labor-yield-by-category', (_req: Request, res: Response) => {
  const report = compareRepairCategoryYield();
  res.json(report);
});

// ========================================
// F2: التوجيه التلقائي للمهام (Smart Task Dispatcher)
// ========================================
repairLabAnalyticsRouter.post('/smart-dispatch', (req: Request, res: Response) => {
  const { ticket_id, repair_category } = req.body;
  
  if (!ticket_id || !repair_category) {
    return res.status(400).json({ error: 'ticket_id and repair_category are required' });
  }

  const result = smartDispatchTicket(ticket_id, repair_category);
  
  if (result) {
    logAudit({ action: 'AUTO_DISPATCH', entityType: 'REPAIR_TICKET', entityId: ticket_id, newValues: result, ipAddress: req.ip });
    res.json({ success: true, ...result });
  } else {
    res.json({ success: false, message: 'No available technician found for this category' });
  }
});

// ========================================
// F3: الفحص الرقمي الإلزامي ذو البوابات (Gated QA Checklist)
// ========================================
repairLabAnalyticsRouter.post('/gated-qa-validate', (req: Request, res: Response) => {
  const { qa_checklist } = req.body;
  
  if (!qa_checklist) {
    return res.status(400).json({ error: 'qa_checklist object is required' });
  }

  const result = validateGatedQA(qa_checklist);
  res.json(result);
});

// ========================================
// F4: تتبع معدل عودة الأجهزة الفردي (Technician RMA Tracker)
// ========================================
repairLabAnalyticsRouter.get('/technician-rma-tracker', (req: Request, res: Response) => {
  const { days } = req.query;
  const tracker = getTechnicianRMATracker(Number(days) || 30);
  res.json(tracker);
});

// ========================================
// F5: مقياس إهلاك أدوات الصيانة (Tooling Lifecycle & Consumables)
// ========================================
repairLabAnalyticsRouter.post('/tooling-usage', (req: Request, res: Response) => {
  const { consumable_id, ticket_id, technician_id, quantity } = req.body;
  
  if (!consumable_id || !ticket_id || !technician_id || quantity === undefined) {
    return res.status(400).json({ error: 'consumable_id, ticket_id, technician_id, and quantity are required' });
  }

  const id = recordToolingUsage(consumable_id, ticket_id, technician_id, Number(quantity));
  logAudit({ action: 'CREATE', entityType: 'TOOLING_USAGE', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

repairLabAnalyticsRouter.get('/tooling-cost-per-device', (_req: Request, res: Response) => {
  const report = getToolingCostPerDevice();
  res.json(report);
});

// ========================================
// F6: خوارزمية تسعير التفكيك (Algorithmic Scrap Pricing)
// ========================================
repairLabAnalyticsRouter.post('/scrap-pricing/calculate', (req: Request, res: Response) => {
  const { part_name, condition_grade, original_device_price } = req.body;
  
  if (!part_name || !condition_grade || original_device_price === undefined) {
    return res.status(400).json({ error: 'part_name, condition_grade, and original_device_price are required' });
  }

  const value = calculateScrapPartValue(part_name, condition_grade, Number(original_device_price));
  res.json({ part_name, condition_grade, original_device_price, estimated_value: value });
});

repairLabAnalyticsRouter.post('/scrap-pricing/distribute', (req: Request, res: Response) => {
  const { device_model, purchase_price } = req.body;
  
  if (!device_model || purchase_price === undefined) {
    return res.status(400).json({ error: 'device_model and purchase_price are required' });
  }

  const distribution = distributePurchasePriceToDeviceParts(device_model, Number(purchase_price));
  res.json({ device_model, purchase_price, parts_distribution: distribution });
});

// ========================================
// F7: إلزام التصوير المجهري والحراري (Micro-Visual Proof)
// ========================================
repairLabAnalyticsRouter.get('/micro-visual-proofs/:ticket_id', (req: Request, res: Response) => {
  const proofs = db.prepare(`
    SELECT * FROM thermal_inspection_logs WHERE ticket_id = ? ORDER BY created_at ASC
  `).all(req.params.ticket_id);
  res.json(proofs);
});

// ========================================
// F8: سجل المقايسات المرفوضة الذكي (Dead Quote Intelligence)
// ========================================
repairLabAnalyticsRouter.post('/dead-quotes', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { ticket_id, customer_id, device_brand, device_model, quoted_amount, rejection_reason, rejection_category, competitor_price, notes } = req.body;
  
  if (!quoted_amount || !rejection_reason || !rejection_category) {
    return res.status(400).json({ error: 'quoted_amount, rejection_reason, and rejection_category are required' });
  }

  const id = recordDeadQuote({
    store_id: store.id, ticket_id, customer_id, device_brand, device_model,
    quoted_amount: Number(quoted_amount), rejection_reason, rejection_category,
    competitor_price: competitor_price ? Number(competitor_price) : undefined, notes
  });

  logAudit({ action: 'CREATE', entityType: 'DEAD_QUOTE', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

repairLabAnalyticsRouter.get('/dead-quotes/analytics', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const analytics = getDeadQuoteAnalytics(store.id);
  res.json(analytics);
});

// ========================================
// F9: حساب الضمان المتgrad (Component-Level Warranty Rules)
// ========================================
repairLabAnalyticsRouter.get('/warranty-tier/:serviceCategory', (req: Request, res: Response) => {
  const tier = getWarrantyTierForService(String(req.params.serviceCategory));
  if (tier) {
    res.json(tier);
  } else {
    res.status(404).json({ error: 'Warranty tier not found' });
  }
});

repairLabAnalyticsRouter.get('/warranty-tiers', (_req: Request, res: Response) => {
  const tiers = db.prepare('SELECT * FROM warranty_tiers WHERE is_active = 1 ORDER BY warranty_days ASC').all();
  res.json(tiers);
});

// ========================================
// F10: مؤشر كفاءة التشخيص الأولي (Intake Triage Accuracy)
// ========================================
repairLabAnalyticsRouter.get('/intake-triage-accuracy', (req: Request, res: Response) => {
  const { days } = req.query;
  const report = getIntakeTriageAccuracy(undefined, Number(days) || 30);
  res.json(report);
});

// ========================================
// F11: لوحة العداد التنازلي المرئية (Real-Time SLA Wallboard)
// ========================================
repairLabAnalyticsRouter.get('/sla-wallboard', (_req: Request, res: Response) => {
  const tickets = db.prepare(`
    SELECT 
      t.id, t.ticket_number, t.device_brand, t.device_model, t.status, t.priority,
      t.sla_deadline, t.created_at, t.completed_at,
      u.name as tech_name,
      c.name as customer_name,
      ROUND((julianday(t.sla_deadline) - julianday(datetime('now'))) * 24 * 60, 0) as minutes_remaining,
      CASE 
        WHEN t.status IN ('READY', 'DELIVERED', 'CANCELLED') THEN 'COMPLETED'
        WHEN julianday(t.sla_deadline) < julianday(datetime('now')) THEN 'BREACHED'
        WHEN (julianday(t.sla_deadline) - julianday(datetime('now'))) * 24 * 60 <= 60 THEN 'WARNING'
        ELSE 'ON_TRACK'
      END as sla_indicator
    FROM repair_tickets t
    LEFT JOIN users u ON t.assigned_tech_id = u.id
    LEFT JOIN customers c ON t.customer_id = c.id
    WHERE t.status NOT IN ('DELIVERED', 'CANCELLED') AND t.deleted_at IS NULL
    ORDER BY minutes_remaining ASC
  `).all();

  const summary = {
    total_active: tickets.length,
    on_track: tickets.filter((t: any) => t.sla_indicator === 'ON_TRACK').length,
    warning: tickets.filter((t: any) => t.sla_indicator === 'WARNING').length,
    breached: tickets.filter((t: any) => t.sla_indicator === 'BREACHED').length
  };

  res.json({ summary, tickets });
});

// ========================================
// F12: حظر تسليم العهدة دون كود تحقق (OTP Custody Release)
// ========================================
repairLabAnalyticsRouter.post('/custody-release', (req: Request, res: Response) => {
  const { ticket_id, released_to_name, released_to_phone, released_to_id_number, id_photo_url } = req.body;
  
  if (!ticket_id || !released_to_name || !released_to_phone) {
    return res.status(400).json({ error: 'ticket_id, released_to_name, and released_to_phone are required' });
  }

  const ticket = db.prepare('SELECT * FROM repair_tickets WHERE id = ? AND deleted_at IS NULL').get(ticket_id) as any;
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const otpCode = crypto.randomInt(1000, 10000).toString();
  const id = `cr-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO custody_releases (id, ticket_id, device_imei, released_to_name, released_to_phone, released_to_id_number, otp_code, id_photo_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, ticket_id, ticket.imei_sn, released_to_name, released_to_phone, released_to_id_number || '', otpCode, id_photo_url || null);

  // Send OTP to customer phone
  const store = db.prepare('SELECT * FROM stores LIMIT 1').get() as any;
  WhatsAppService.sendNotification(store.id, released_to_phone, 'OTP_DELIVERY' as any, `Your device delivery OTP: ${otpCode}`);

  logAudit({ action: 'CREATE', entityType: 'CUSTODY_RELEASE', entityId: id, newValues: { ticket_id, released_to_name }, ipAddress: req.ip });
  res.status(201).json({ success: true, id, otp_sent: true, message: 'OTP sent to customer phone' });
});

repairLabAnalyticsRouter.post('/custody-release/verify', (req: Request, res: Response) => {
  const { release_id, entered_otp } = req.body;
  
  if (!release_id || !entered_otp) {
    return res.status(400).json({ error: 'release_id and entered_otp are required' });
  }

  const release = db.prepare('SELECT * FROM custody_releases WHERE id = ?').get(release_id) as any;
  if (!release) return res.status(404).json({ error: 'Release record not found' });

  if (release.otp_code === entered_otp) {
    db.prepare('UPDATE custody_releases SET otp_verified = 1, released_at = datetime("now") WHERE id = ?').run(release_id);
    db.prepare('UPDATE repair_tickets SET otp_verified = 1 WHERE id = ?').run(release.ticket_id);
    
    logAudit({ action: 'VERIFY_OTP', entityType: 'CUSTODY_RELEASE', entityId: release_id, newValues: { verified: true }, ipAddress: req.ip });
    res.json({ verified: true, message: 'OTP verified. Device authorized for release.' });
  } else {
    logAudit({ action: 'AUTH_FAILURE', entityType: 'CUSTODY_RELEASE_OTP', entityId: release_id, newValues: { entered_otp }, ipAddress: req.ip });
    res.status(400).json({ verified: false, error: 'Invalid OTP. Device release blocked.' });
  }
});

// ========================================
// F13: أرشفة سيريالات الهاردوير (Serial Number Archiving)
// ========================================
repairLabAnalyticsRouter.post('/hardware-serials', (req: Request, res: Response) => {
  const { ticket_id, device_brand, device_model, original_screen_serial, current_screen_serial, original_bms_serial, current_bms_serial, programmer_used, sync_status } = req.body;
  
  if (!ticket_id) {
    return res.status(400).json({ error: 'ticket_id is required' });
  }

  const id = `hsa-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO hardware_serial_archive (id, ticket_id, device_brand, device_model, original_screen_serial, current_screen_serial, original_bms_serial, current_bms_serial, programmer_used, sync_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, ticket_id, device_brand || '', device_model || '', original_screen_serial || '', current_screen_serial || '', original_bms_serial || '', current_bms_serial || '', programmer_used || '', sync_status || 'PENDING');

  logAudit({ action: 'CREATE', entityType: 'HARDWARE_SERIAL_ARCHIVE', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

repairLabAnalyticsRouter.get('/hardware-serials/:ticket_id', (req: Request, res: Response) => {
  const records = db.prepare('SELECT * FROM hardware_serial_archive WHERE ticket_id = ? ORDER BY recorded_at ASC').all(req.params.ticket_id);
  res.json(records);
});

// ========================================
// F15: مؤشر سرعة استجابة العميل (Customer Approval Latency)
// ========================================
repairLabAnalyticsRouter.get('/customer-approval-latency', (req: Request, res: Response) => {
  const { days } = req.query;
  const report = getCustomerApprovalLatency(undefined, Number(days) || 30);
  res.json(report);
});

// ========================================
// F16: حساب عمولة الصيانة بالربح الحقيقي
// ========================================
repairLabAnalyticsRouter.get('/real-profit-commission/:ticket_id', (req: Request, res: Response) => {
  const commission = calculateRealProfitCommission(String(req.params.ticket_id));
  if (commission) {
    res.json(commission);
  } else {
    res.status(404).json({ error: 'Ticket not found' });
  }
});

// ========================================
// F17: كاشف عيوب الموديلات الشائعة (Model Fault Hotspots)
// ========================================
repairLabAnalyticsRouter.get('/model-fault-hotspots', (_req: Request, res: Response) => {
  const report = getModelFaultReport();
  res.json(report);
});

// ========================================
// F18: تتبع وقت الانتظار على الرف (Shelf Dwell Time)
// ========================================
repairLabAnalyticsRouter.get('/shelf-dwell-alerts', (req: Request, res: Response) => {
  const { hours } = req.query;
  const alerts = getShelfDwellAlerts(Number(hours) || 24);
  res.json({ count: alerts.length, threshold_hours: Number(hours) || 24, tickets: alerts });
});

// ========================================
// F19: إغلاق الحساب عند الشغل الخارجي (Subcontracting Ledger)
// ========================================
repairLabAnalyticsRouter.post('/outsource', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { ticket_id, external_workshop_name, workshop_contact, board_description, workshop_quote, customer_charge } = req.body;
  
  if (!ticket_id || !external_workshop_name || !board_description || workshop_quote === undefined || customer_charge === undefined) {
    return res.status(400).json({ error: 'ticket_id, external_workshop_name, board_description, workshop_quote, and customer_charge are required' });
  }

  const id = createOutsourceEntry({
    store_id: store.id, ticket_id, external_workshop_name, workshop_contact, board_description,
    workshop_quote: Number(workshop_quote), customer_charge: Number(customer_charge)
  });

  logAudit({ action: 'CREATE', entityType: 'OUTSOURCE_LEDGER', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

repairLabAnalyticsRouter.get('/outsource/report', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const report = getOutsourceReport(store.id);
  res.json(report);
});

// ========================================
// F20: استرجاع التوالف للموردين (Vendor Defect Return Flow)
// ========================================
repairLabAnalyticsRouter.post('/vendor-defect-returns', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { item_id, vendor_name, invoice_reference, defect_description, defect_photo_url } = req.body;
  
  if (!item_id || !vendor_name || !defect_description) {
    return res.status(400).json({ error: 'item_id, vendor_name, and defect_description are required' });
  }

  const id = createVendorDefectReturn({
    store_id: store.id, item_id, vendor_name, invoice_reference, defect_description, defect_photo_url
  });

  logAudit({ action: 'CREATE', entityType: 'VENDOR_DEFECT_RETURN', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

// ========================================
// F21: كشف الأجهزة المكررة (Repeat Device Detection)
// ========================================
repairLabAnalyticsRouter.post('/device-visit', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { device_imei, customer_id, visit_type, ticket_id, sale_id } = req.body;
  
  if (!device_imei) {
    return res.status(400).json({ error: 'device_imei is required' });
  }

  const id = recordDeviceVisit(store.id, device_imei, customer_id, visit_type, ticket_id, sale_id);
  res.status(201).json({ success: true, id });
});

repairLabAnalyticsRouter.get('/device-visit/check/:imei', (req: Request, res: Response) => {
  const result = checkRepeatDevice(String(req.params.imei));
  res.json(result);
});

// ========================================
// F22: التسعير الديناميكي بناءً على ضغط العمل (Dynamic Labor Surge)
// ========================================
repairLabAnalyticsRouter.post('/surge-pricing', (req: Request, res: Response) => {
  const { base_labor_charge } = req.body;
  
  if (base_labor_charge === undefined) {
    return res.status(400).json({ error: 'base_labor_charge is required' });
  }

  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const result = calculateSurgePrice(Number(base_labor_charge), store.id);
  res.json(result);
});

// ========================================
// F23: مكتبة الممانعات والجهود التفاعلية
// ========================================
repairLabAnalyticsRouter.post('/resistance-references', (req: Request, res: Response) => {
  const { device_brand, device_model, line_name, connector_type, expected_resistance_ohms, tolerance_pct, reading_type, reported_by_tech_id } = req.body;
  
  if (!device_brand || !device_model || !line_name || expected_resistance_ohms === undefined) {
    return res.status(400).json({ error: 'device_brand, device_model, line_name, and expected_resistance_ohms are required' });
  }

  const id = addResistanceReference({
    device_brand, device_model, line_name, connector_type, expected_resistance_ohms: Number(expected_resistance_ohms),
    tolerance_pct: tolerance_pct ? Number(tolerance_pct) : undefined, reading_type, reported_by_tech_id
  });

  res.status(201).json({ success: true, id });
});

repairLabAnalyticsRouter.post('/resistance-compare', (req: Request, res: Response) => {
  const { model, line_name, measured_value } = req.body;
  
  if (!model || !line_name || measured_value === undefined) {
    return res.status(400).json({ error: 'model, line_name, and measured_value are required' });
  }

  const result = compareResistance(model, line_name, Number(measured_value));
  res.json(result);
});

// ========================================
// F24: التأمين على الأجهزة الحساسة (Risk-Assessment Score)
// ========================================
repairLabAnalyticsRouter.post('/risk-assessment', (req: Request, res: Response) => {
  const { ticket_id, customer_id, has_bent_frame, has_liquid_damage, has_previous_repair, board_condition_notes, assessed_by_user_id } = req.body;
  
  if (!ticket_id) {
    return res.status(400).json({ error: 'ticket_id is required' });
  }

  const result = assessDeviceRisk({
    ticket_id, customer_id, has_bent_frame: !!has_bent_frame, has_liquid_damage: !!has_liquid_damage,
    has_previous_repair: !!has_previous_repair, board_condition_notes, assessed_by_user_id
  });

  logAudit({ action: 'CREATE', entityType: 'DEVICE_RISK_ASSESSMENT', entityId: result.assessment_id, newValues: result, ipAddress: req.ip });
  res.status(201).json(result);
});

// ========================================
// F25: تتبع ملحقات الأجهزة المهملة
// ========================================
repairLabAnalyticsRouter.post('/abandoned-accessories', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { accessory_type, brand, model_compatibility, serial_or_barcode, customer_id, customer_phone } = req.body;
  
  if (!accessory_type) {
    return res.status(400).json({ error: 'accessory_type is required' });
  }

  const id = recordAbandonedAccessory({
    store_id: store.id, accessory_type, brand, model_compatibility, serial_or_barcode, customer_id, customer_phone
  });

  logAudit({ action: 'CREATE', entityType: 'ABANDONED_ACCESSORY', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

repairLabAnalyticsRouter.get('/abandoned-accessories/report', (req: Request, res: Response) => {
  const { days_old } = req.query;
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const report = getAbandonedAccessoriesReport(store.id, Number(days_old) || 30);
  res.json({ count: report.length, items: report });
});

// Auto-send reminders for abandoned accessories
repairLabAnalyticsRouter.post('/abandoned-accessories/send-reminders', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT * FROM stores LIMIT 1').get() as any;
  const abandoned = getAbandonedAccessoriesReport(store.id, 30);
  
  let remindersSent = 0;
  for (const item of abandoned) {
    if (item.customer_phone) {
      const msg = `Dear customer, your ${item.accessory_type} (${item.brand} ${item.model_compatibility}) has been stored at ${store.name} for over 30 days. Please collect it within 7 days to avoid disposal.`;
      WhatsAppService.sendNotification(store.id, item.customer_phone, 'ABANDONED_ACCESSORY' as any, msg);
      db.prepare('UPDATE abandoned_accessories SET last_reminder_sent = datetime("now") WHERE id = ?').run(item.id);
      remindersSent++;
    }
  }

  res.json({ success: true, reminders_sent: remindersSent, total_eligible: abandoned.length });
});
