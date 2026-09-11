import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { wsService } from '../../services/ws.service';
import { logAudit } from '../../services/audit.service';

// ========================================
// F1: مؤشر العائد على الدقيقة الفنية (Labor Yield Per Minute)
// ========================================
export function recordTechnicianLaborMetric(data: {
  technician_id: string;
  ticket_id: string;
  device_brand?: string;
  device_model?: string;
  repair_category?: string;
  minutes_spent: number;
  labor_revenue: number;
  parts_cost: number;
}): string {
  const id = `tlm-${uuidv4().substring(0, 8)}`;
  const net_profit = data.labor_revenue - data.parts_cost;
  const yield_per_minute = data.minutes_spent > 0 ? net_profit / data.minutes_spent : 0;

  db.prepare(`
    INSERT INTO technician_labor_metrics (id, technician_id, ticket_id, device_brand, device_model, repair_category, minutes_spent, labor_revenue, parts_cost, net_profit, yield_per_minute)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.technician_id, data.ticket_id, data.device_brand || '', data.device_model || '', data.repair_category || 'GENERAL', data.minutes_spent, data.labor_revenue, data.parts_cost, net_profit, yield_per_minute);

  return id;
}

export function getTechnicianYieldReport(technicianId?: string, days: number = 30): any[] {
  let sql = `
    SELECT 
      tlm.technician_id,
      u.name as technician_name,
      COUNT(tlm.id) as total_repairs,
      SUM(tlm.minutes_spent) as total_minutes,
      SUM(tlm.labor_revenue) as total_revenue,
      SUM(tlm.parts_cost) as total_parts_cost,
      SUM(tlm.net_profit) as total_net_profit,
      ROUND(AVG(tlm.yield_per_minute), 4) as avg_yield_per_minute,
      ROUND(SUM(tlm.net_profit) / NULLIF(SUM(tlm.minutes_spent), 0), 4) as overall_yield_per_minute,
      ROUND(AVG(tlm.minutes_spent), 1) as avg_minutes_per_repair
    FROM technician_labor_metrics tlm
    JOIN users u ON tlm.technician_id = u.id
    WHERE tlm.recorded_at >= datetime('now', ?)
  `;
  const params: any[] = [`-${days} days`];

  if (technicianId) {
    sql += ' AND tlm.technician_id = ?';
    params.push(technicianId);
  }

  sql += ' GROUP BY tlm.technician_id ORDER BY overall_yield_per_minute DESC';
  return db.prepare(sql).all(...params);
}

export function compareRepairCategoryYield(): any[] {
  return db.prepare(`
    SELECT 
      repair_category,
      COUNT(*) as total_repairs,
      ROUND(AVG(minutes_spent), 1) as avg_minutes,
      ROUND(AVG(yield_per_minute), 4) as avg_yield_per_minute,
      ROUND(AVG(net_profit), 2) as avg_net_profit,
      SUM(net_profit) as total_profit
    FROM technician_labor_metrics
    WHERE recorded_at >= datetime('now', '-30 days')
    GROUP BY repair_category
    ORDER BY avg_yield_per_minute DESC
  `).all();
}

// ========================================
// F2: التوجيه التلقائي للمهام (Smart Task Dispatcher)
// ========================================
export function smartDispatchTicket(ticketId: string, repairCategory: string): { assigned_tech_id: string; reason: string } | null {
  // Find best available technician for this repair category
  const tech = db.prepare(`
    SELECT 
      u.id, u.name,
      COUNT(t.id) as active_tickets,
      COALESCE(AVG(tlm.yield_per_minute), 0) as avg_yield
    FROM users u
    LEFT JOIN repair_tickets t ON u.id = t.assigned_tech_id AND t.status IN ('IN_REPAIR', 'DIAGNOSED')
    LEFT JOIN technician_labor_metrics tlm ON u.id = tlm.technician_id AND tlm.repair_category = ?
    WHERE u.role = 'MaintenanceEngineer' AND u.is_active = 1 AND u.deleted_at IS NULL
    GROUP BY u.id
    HAVING active_tickets < (
      SELECT COALESCE(max_concurrent_tickets, 3) FROM task_dispatch_rules WHERE repair_category = ? AND preferred_tech_id = u.id AND is_active = 1
      UNION SELECT 3
      LIMIT 1
    )
    ORDER BY avg_yield DESC, active_tickets ASC
    LIMIT 1
  `).get(repairCategory, repairCategory) as any;

  if (tech) {
    db.prepare('UPDATE repair_tickets SET assigned_tech_id = ? WHERE id = ?').run(tech.id, ticketId);
    return { assigned_tech_id: tech.id, reason: `Auto-dispatched to ${tech.name} (highest yield, lowest load)` };
  }
  return null;
}

// ========================================
// F3: الفحص الرقمي الإلزامي ذو البوابات (Gated QA Checklist)
// ========================================
export function validateGatedQA(qaChecklist: any): { passed: boolean; failedGates: string[] } {
  const requiredGates = [
    'network_test',
    'camera_test',
    'charging_test',
    'proximity_sensor',
    'audio_test',
    'fingerprint_test'
  ];

  const failedGates: string[] = [];
  
  if (!qaChecklist || typeof qaChecklist !== 'object') {
    return { passed: false, failedGates: requiredGates };
  }

  for (const gate of requiredGates) {
    if (!qaChecklist[gate] || qaChecklist[gate] !== 'PASS') {
      failedGates.push(gate);
    }
  }

  return { passed: failedGates.length === 0, failedGates };
}

// ========================================
// F4: تتبع معدل عودة الأجهزة الفردي (Technician RMA Tracker)
// ========================================
export function getTechnicianRMATracker(days: number = 30): any[] {
  return db.prepare(`
    SELECT 
      t.assigned_tech_id as technician_id,
      u.name as technician_name,
      COUNT(t.id) as total_delivered,
      SUM(CASE WHEN t.status = 'DELIVERED' AND EXISTS (
        SELECT 1 FROM repair_tickets t2 
        WHERE t2.imei_sn = t.imei_sn AND t2.id != t.id AND t2.created_at > t.delivered_at
      ) THEN 1 ELSE 0 END) as rma_count,
      ROUND(
        CAST(SUM(CASE WHEN EXISTS (
          SELECT 1 FROM repair_tickets t2 
          WHERE t2.imei_sn = t.imei_sn AND t2.id != t.id AND t2.created_at > t.delivered_at
        ) THEN 1 ELSE 0 END) AS REAL) / NULLIF(COUNT(t.id), 0) * 100, 2
      ) as rma_rate_pct
    FROM repair_tickets t
    JOIN users u ON t.assigned_tech_id = u.id
    WHERE t.status = 'DELIVERED' 
      AND t.delivered_at >= datetime('now', ?)
      AND t.deleted_at IS NULL
    GROUP BY t.assigned_tech_id
    HAVING rma_rate_pct > 5
    ORDER BY rma_rate_pct DESC
  `).all(`-${days} days`);
}

// ========================================
// F5: مقياس إهلاك أدوات الصيانة (Tooling Lifecycle & Consumables)
// ========================================
export function recordToolingUsage(consumableId: string, ticketId: string, technicianId: string, quantity: number): string {
  const id = `tul-${uuidv4().substring(0, 8)}`;
  
  db.prepare(`
    INSERT INTO tooling_usage_log (id, consumable_id, ticket_id, technician_id, quantity_used)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, consumableId, ticketId, technicianId, quantity);

  db.prepare(`
    UPDATE tooling_consumables 
    SET total_consumed = total_consumed + ?, current_stock = MAX(0, current_stock - ?)
    WHERE id = ?
  `).run(quantity, quantity, consumableId);

  return id;
}

export function getToolingCostPerDevice(): any[] {
  return db.prepare(`
    SELECT 
      tc.item_name,
      tc.item_category,
      tc.unit_cost,
      tc.usage_per_repair,
      tc.current_stock,
      tc.total_consumed,
      ROUND(tc.unit_cost * tc.usage_per_repair, 2) as cost_per_repair,
      CASE WHEN tc.current_stock <= tc.min_stock THEN 'LOW_STOCK' ELSE 'OK' END as stock_status
    FROM tooling_consumables tc
    WHERE tc.current_stock > 0
    ORDER BY cost_per_repair DESC
  `).all();
}

// ========================================
// F6: خوارزمية تسعير التفكيك (Algorithmic Scrap Pricing)
// ========================================
export function calculateScrapPartValue(partName: string, conditionGrade: string, originalDevicePrice: number): number {
  const baseValue = originalDevicePrice * 0.15; // 15% of device value as base
  
  const conditionMultipliers: Record<string, number> = {
    'EXCELLENT': 0.9,
    'GOOD': 0.75,
    'FAIR': 0.5,
    'POOR': 0.3,
    'TESTED_WORKING': 0.85,
    'DAMAGED': 0.15
  };

  const multiplier = conditionMultipliers[conditionGrade] || 0.5;
  const harvestCost = baseValue * 0.1;
  
  return Math.max(0, (baseValue * multiplier) - harvestCost);
}

export function distributePurchasePriceToDeviceParts(deviceModel: string, purchasePrice: number): any[] {
  // Typical part value distribution for a smartphone
  const partDistribution = [
    { part_name: 'Screen Assembly', percentage: 0.35 },
    { part_name: 'Battery', percentage: 0.12 },
    { part_name: 'Main Board', percentage: 0.25 },
    { part_name: 'Camera Module', percentage: 0.15 },
    { part_name: 'Charging Port Assembly', percentage: 0.05 },
    { part_name: 'Housing/Frame', percentage: 0.08 }
  ];

  return partDistribution.map(p => ({
    part_name: p.part_name,
    device_model: deviceModel,
    original_purchase_price: purchasePrice,
    allocated_cost: Math.round(purchasePrice * p.percentage * 100) / 100,
    estimated_resale_value: Math.round(purchasePrice * p.percentage * 0.6 * 100) / 100,
    condition_grade: 'UNKNOWN'
  }));
}

// ========================================
// F7: إلزام التصوير المجهري والحراري (Micro-Visual Proof)
// ========================================
export function getMicroVisualProofs(ticketId: string): any[] {
  return db.prepare(`
    SELECT * FROM thermal_inspection_logs 
    WHERE ticket_id = ? 
    ORDER BY created_at ASC
  `).all(ticketId);
}

// ========================================
// F8: سجل المقايسات المرفوضة الذكي (Dead Quote Intelligence)
// ========================================
export function recordDeadQuote(data: {
  store_id: string;
  ticket_id?: string;
  customer_id?: string;
  device_brand?: string;
  device_model?: string;
  quoted_amount: number;
  rejection_reason: string;
  rejection_category: string;
  competitor_price?: number;
  notes?: string;
}): string {
  const id = `dq-${uuidv4().substring(0, 8)}`;
  
  db.prepare(`
    INSERT INTO dead_quotes (id, store_id, ticket_id, customer_id, device_brand, device_model, quoted_amount, rejection_reason, rejection_category, competitor_price, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.ticket_id || null, data.customer_id || null, data.device_brand || '', data.device_model || '', data.quoted_amount, data.rejection_reason, data.rejection_category, data.competitor_price || null, data.notes || null);

  return id;
}

export function getDeadQuoteAnalytics(storeId: string): any {
  const totalQuotes = db.prepare('SELECT COUNT(*) as count FROM dead_quotes WHERE store_id = ?').get(storeId) as any;
  const byCategory = db.prepare(`
    SELECT rejection_category, COUNT(*) as count, ROUND(AVG(quoted_amount), 2) as avg_amount
    FROM dead_quotes WHERE store_id = ?
    GROUP BY rejection_category ORDER BY count DESC
  `).all(storeId);
  const byModel = db.prepare(`
    SELECT device_brand, device_model, COUNT(*) as rejection_count, ROUND(AVG(quoted_amount), 2) as avg_quoted
    FROM dead_quotes WHERE store_id = ?
    GROUP BY device_brand, device_model ORDER BY rejection_count DESC LIMIT 10
  `).all(storeId);

  return {
    total_rejected_quotes: totalQuotes.count,
    by_rejection_category: byCategory,
    top_rejected_models: byModel
  };
}

// ========================================
// F9: حساب الضمان المتgrad (Component-Level Warranty Rules)
// ========================================
export function initializeWarrantyTiers(): void {
  const count = (db.prepare('SELECT COUNT(*) as count FROM warranty_tiers').get() as any)?.count || 0;
  if (count === 0) {
    const defaults = [
      { service_category: 'SOFTWARE', warranty_days: 2, warranty_terms: 'Software repair and flashing - 48 hours limited warranty' },
      { service_category: 'BAGH', warranty_days: 14, warranty_terms: 'Frame straightening and housing replacement - 14 days limited warranty' },
      { service_category: 'ORIGINAL_SCREEN', warranty_days: 90, warranty_terms: 'Original service pack screen replacement - 90 days limited warranty' },
      { service_category: 'AFTERMARKET_SCREEN', warranty_days: 30, warranty_terms: 'Aftermarket OLED/TFT screen - 30 days limited warranty' },
      { service_category: 'BATTERY', warranty_days: 60, warranty_terms: 'Battery replacement with BMS transfer - 60 days limited warranty' },
      { service_category: 'CHARGING_PORT', warranty_days: 30, warranty_terms: 'Charging port and Tristar IC repair - 30 days limited warranty' },
      { service_category: 'WATER_DAMAGE', warranty_days: 14, warranty_terms: 'Ultrasonic cleaning for liquid damage - 14 days limited warranty' },
      { service_category: 'MICRO_SOLDERING', warranty_days: 60, warranty_terms: 'Board-level micro-soldering repair - 60 days limited warranty' },
      { service_category: 'CAMERA', warranty_days: 30, warranty_terms: 'Camera module replacement - 30 days limited warranty' },
      { service_category: 'GENERAL', warranty_days: 30, warranty_terms: 'Standard repair warranty - 30 days limited warranty' }
    ];

    const stmt = db.prepare('INSERT INTO warranty_tiers (id, service_category, warranty_days, warranty_terms) VALUES (?, ?, ?, ?)');
    for (const tier of defaults) {
      stmt.run(`wt-${uuidv4().substring(0, 8)}`, tier.service_category, tier.warranty_days, tier.warranty_terms);
    }
  }
}

export function getWarrantyTierForService(serviceCategory: string): any {
  initializeWarrantyTiers();
  return db.prepare('SELECT * FROM warranty_tiers WHERE service_category = ? AND is_active = 1').get(serviceCategory) ||
    db.prepare('SELECT * FROM warranty_tiers WHERE service_category = ? AND is_active = 1').get('GENERAL');
}

// ========================================
// F10: مؤشر كفاءة التشخيص الأولي (Intake Triage Accuracy)
// ========================================
export function getIntakeTriageAccuracy(storeId?: string, days: number = 30): any[] {
  let sql = `
    SELECT 
      rt.id as receptionist_id,
      u.name as receptionist_name,
      COUNT(t.id) as total_tickets,
      SUM(CASE WHEN t.reported_defects LIKE '%' || t.status || '%' OR t.status = 'IN_REPAIR' THEN 1 ELSE 0 END) as accurately_triaged,
      ROUND(
        CAST(SUM(CASE WHEN t.reported_defects LIKE '%' || t.status || '%' OR t.status = 'IN_REPAIR' THEN 1 ELSE 0 END) AS REAL) / NULLIF(COUNT(t.id), 0) * 100, 2
      ) as accuracy_pct
    FROM repair_tickets t
    JOIN users rt ON t.branch_id = rt.id
    JOIN users u ON rt.id = u.id
    WHERE t.created_at >= datetime('now', ?)
      AND t.deleted_at IS NULL
  `;
  const params: any[] = [`-${days} days`];

  if (storeId) {
    sql += ' AND t.store_id = ?';
    params.push(storeId);
  }

  sql += ' GROUP BY rt.id ORDER BY accuracy_pct DESC';
  return db.prepare(sql).all(...params);
}

// ========================================
// F15: مؤشر سرعة استجابة العميل (Customer Approval Latency)
// ========================================
export function getCustomerApprovalLatency(storeId?: string, days: number = 30): any[] {
  let sql = `
    SELECT 
      t.ticket_number,
      t.device_brand || ' ' || t.device_model as device,
      t.estimated_cost,
      t.created_at as intake_date,
      t.completed_at as estimate_sent_date,
      t.delivered_at,
      ROUND((julianday(COALESCE(t.delivered_at, datetime('now'))) - julianday(t.created_at)) * 24, 1) as hours_to_complete
    FROM repair_tickets t
    WHERE t.status IN ('DELIVERED', 'READY')
      AND t.created_at >= datetime('now', ?)
      AND t.deleted_at IS NULL
  `;
  const params: any[] = [`-${days} days`];

  if (storeId) {
    sql += ' AND t.store_id = ?';
    params.push(storeId);
  }

  sql += ' ORDER BY hours_to_complete DESC';
  return db.prepare(sql).all(...params);
}

// ========================================
// F16: حساب عمولة الصيانة بالربح الحقيقي
// ========================================
export function calculateRealProfitCommission(ticketId: string): any {
  const ticket = db.prepare(`
    SELECT t.*, u.commission_rate
    FROM repair_tickets t
    LEFT JOIN users u ON t.assigned_tech_id = u.id
    WHERE t.id = ?
  `).get(ticketId) as any;

  if (!ticket) return null;

  const partsConsumedCost = (db.prepare('SELECT SUM(cost_price) as total FROM repair_consumed_parts WHERE ticket_id = ?').get(ticketId) as any)?.total || 0;
  const sharedConsumablesCost = (db.prepare(`
    SELECT SUM(cu.quantity_used * sc.unit_cost) as total
    FROM consumable_usage_log cu
    JOIN shared_consumables sc ON cu.consumable_id = sc.id
    WHERE cu.ticket_id = ?
  `).get(ticketId) as any)?.total || 0;

  const totalDirectCosts = partsConsumedCost + sharedConsumablesCost;
  const laborRevenue = ticket.labor_charge || 0;
  const realProfit = Math.max(0, laborRevenue - totalDirectCosts);
  const commissionRate = ticket.commission_rate || 0;
  const commission = realProfit * commissionRate;

  return {
    ticket_id: ticketId,
    labor_revenue: laborRevenue,
    parts_cost: partsConsumedCost,
    consumables_cost: sharedConsumablesCost,
    total_direct_costs: totalDirectCosts,
    real_profit: realProfit,
    commission_rate: commissionRate,
    calculated_commission: Math.round(commission * 100) / 100
  };
}

// ========================================
// F17: كاشف عيوب الموديلات الشائعة (Model Fault Hotspots)
// ========================================
export function updateModelFaultHotspots(): void {
  const faults = db.prepare(`
    SELECT 
      device_brand, device_model,
      reported_defects as fault_category,
      COUNT(*) as occurrence_count,
      AVG(labor_charge + parts_cost) as avg_repair_cost,
      AVG(COALESCE(tat_minutes, 45)) as avg_repair_minutes
    FROM repair_tickets
    WHERE status = 'DELIVERED' AND deleted_at IS NULL
    GROUP BY device_brand, device_model, reported_defects
    HAVING COUNT(*) >= 2
  `).all() as any[];

  for (const fault of faults) {
    const existing = db.prepare('SELECT id FROM model_fault_hotspots WHERE device_brand = ? AND device_model = ? AND fault_category = ?').get(fault.device_brand, fault.device_model, fault.fault_category) as any;

    if (existing) {
      db.prepare(`
        UPDATE model_fault_hotspots 
        SET occurrence_count = ?, avg_repair_cost = ?, avg_repair_minutes = ?, last_updated = datetime('now')
        WHERE id = ?
      `).run(fault.occurrence_count, fault.avg_repair_cost, fault.avg_repair_minutes, existing.id);
    } else {
      db.prepare(`
        INSERT INTO model_fault_hotspots (id, device_brand, device_model, fault_category, occurrence_count, avg_repair_cost, avg_repair_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(`mfh-${uuidv4().substring(0, 8)}`, fault.device_brand, fault.device_model, fault.fault_category, fault.occurrence_count, fault.avg_repair_cost, fault.avg_repair_minutes);
    }
  }
}

export function getModelFaultReport(): any[] {
  updateModelFaultHotspots();
  return db.prepare(`
    SELECT * FROM model_fault_hotspots
    ORDER BY occurrence_count DESC
    LIMIT 20
  `).all();
}

// ========================================
// F18: تتبع وقت الانتظار على الرف (Shelf Dwell Time)
// ========================================
export function getShelfDwellAlerts(hoursThreshold: number = 24): any[] {
  return db.prepare(`
    SELECT 
      t.id, t.ticket_number, t.device_brand, t.device_model, t.status,
      t.created_at, t.sla_deadline,
      ROUND((julianday(datetime('now')) - julianday(t.created_at)) * 24, 1) as hours_on_shelf,
      u.name as assigned_tech_name,
      c.name as customer_name, c.phone as customer_phone
    FROM repair_tickets t
    LEFT JOIN users u ON t.assigned_tech_id = u.id
    LEFT JOIN customers c ON t.customer_id = c.id
    WHERE t.status IN ('RECEIVED', 'DIAGNOSED')
      AND (julianday(datetime('now')) - julianday(t.created_at)) * 24 > ?
      AND t.deleted_at IS NULL
    ORDER BY hours_on_shelf DESC
  `).all(hoursThreshold);
}

// ========================================
// F19: إغلاق الحساب عند الشغل الخارجي (Subcontracting Ledger)
// ========================================
export function createOutsourceEntry(data: {
  store_id: string;
  ticket_id: string;
  external_workshop_name: string;
  workshop_contact?: string;
  board_description: string;
  workshop_quote: number;
  customer_charge: number;
}): string {
  const id = `osr-${uuidv4().substring(0, 8)}`;
  const margin = data.customer_charge - data.workshop_quote;

  db.prepare(`
    INSERT INTO outsource_ledger (id, store_id, ticket_id, external_workshop_name, workshop_contact, board_description, workshop_quote, customer_charge, internal_margin, status, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SENT', datetime('now'))
  `).run(id, data.store_id, data.ticket_id, data.external_workshop_name, data.workshop_contact || '', data.board_description, data.workshop_quote, data.customer_charge, margin);

  return id;
}

export function getOutsourceReport(storeId: string): any {
  const total = db.prepare('SELECT COUNT(*) as count, SUM(internal_margin) as total_margin FROM outsource_ledger WHERE store_id = ?').get(storeId) as any;
  const byWorkshop = db.prepare(`
    SELECT external_workshop_name, COUNT(*) as count, ROUND(SUM(internal_margin), 2) as total_margin
    FROM outsource_ledger WHERE store_id = ?
    GROUP BY external_workshop_name ORDER BY count DESC
  `).all(storeId);

  return { total_outsourced: total.count, total_margin: total.total_margin, by_workshop: byWorkshop };
}

// ========================================
// F20: استرجاع التوالف للموردين (Vendor Defect Return Flow)
// ========================================
export function createVendorDefectReturn(data: {
  store_id: string;
  item_id: string;
  vendor_name: string;
  invoice_reference?: string;
  defect_description: string;
  defect_photo_url?: string;
}): string {
  const id = `vdr-${uuidv4().substring(0, 8)}`;
  const barcode = `VDR-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

  db.prepare(`
    INSERT INTO vendor_defect_returns (id, store_id, item_id, vendor_name, invoice_reference, defect_description, defect_photo_url, return_barcode, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IDENTIFIED')
  `).run(id, data.store_id, data.item_id, data.vendor_name, data.invoice_reference || '', data.defect_description, data.defect_photo_url || '', barcode);

  return id;
}

// ========================================
// F21: كشف الأجهزة المكررة (Repeat Device Detection)
// ========================================
export function recordDeviceVisit(storeId: string, deviceImei: string, customerId?: string, visitType?: string, ticketId?: string, saleId?: string): string {
  const id = `dvh-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO device_visit_history (id, store_id, device_imei, customer_id, visit_type, ticket_id, sale_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, storeId, deviceImei, customerId || null, visitType || 'REPAIR', ticketId || null, saleId || null);

  return id;
}

export function checkRepeatDevice(deviceImei: string): any {
  const visits = db.prepare(`
    SELECT dvh.*, c.name as customer_name
    FROM device_visit_history dvh
    LEFT JOIN customers c ON dvh.customer_id = c.id
    WHERE dvh.device_imei = ?
    ORDER BY dvh.visit_date DESC
  `).all(deviceImei) as any[];

  return {
    is_repeat: visits.length > 1,
    total_visits: visits.length,
    first_visit: visits.length > 0 ? visits[visits.length - 1].visit_date : null,
    last_visit: visits.length > 0 ? visits[0].visit_date : null,
    visit_history: visits
  };
}

// ========================================
// F22: التسعير الديناميكي بناءً على ضغط العمل (Dynamic Labor Surge)
// ========================================
export function calculateSurgePrice(baseLaborCharge: number, storeId: string): { surge_active: boolean; surge_multiplier: number; final_price: number; current_queue_size: number; threshold: number } {
  const activeTickets = db.prepare(`
    SELECT COUNT(*) as count FROM repair_tickets 
    WHERE store_id = ? AND status IN ('RECEIVED', 'DIAGNOSED', 'IN_REPAIR') AND deleted_at IS NULL
  `).get(storeId) as any;

  const rule = db.prepare('SELECT * FROM labor_surge_rules WHERE store_id = ? AND is_active = 1').get(storeId) as any;
  const threshold = rule?.active_tickets_threshold || 5;
  const multiplier = rule?.surge_multiplier || 1.5;

  const surgeActive = activeTickets.count >= threshold;
  const finalPrice = surgeActive ? baseLaborCharge * multiplier : baseLaborCharge;

  return {
    surge_active: surgeActive,
    surge_multiplier: surgeActive ? multiplier : 1.0,
    final_price: Math.round(finalPrice * 100) / 100,
    current_queue_size: activeTickets.count,
    threshold
  };
}

// ========================================
// F23: مكتبة الممانعات والجهود التفاعلية
// ========================================
export function addResistanceReference(data: {
  device_brand: string;
  device_model: string;
  line_name: string;
  connector_type?: string;
  expected_resistance_ohms: number;
  tolerance_pct?: number;
  reading_type?: string;
  reported_by_tech_id?: string;
}): string {
  const id = `rrd-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO resistance_reference_db (id, device_brand, device_model, line_name, connector_type, expected_resistance_ohms, tolerance_pct, reading_type, reported_by_tech_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.device_brand, data.device_model, data.line_name, data.connector_type || 'USB-C', data.expected_resistance_ohms, data.tolerance_pct || 10, data.reading_type || 'DIODE_MODE', data.reported_by_tech_id || null);

  return id;
}

export function compareResistance(model: string, lineName: string, measuredValue: number): any {
  const reference = db.prepare(`
    SELECT * FROM resistance_reference_db 
    WHERE device_model LIKE ? AND line_name LIKE ?
    ORDER BY verified_count DESC
    LIMIT 1
  `).get(`%${model}%`, `%${lineName}%`) as any;

  if (!reference) {
    return { found: false, message: 'No reference data available for this model/line' };
  }

  const minExpected = reference.expected_resistance_ohms * (1 - reference.tolerance_pct / 100);
  const maxExpected = reference.expected_resistance_ohms * (1 + reference.tolerance_pct / 100);
  const isWithinTolerance = measuredValue >= minExpected && measuredValue <= maxExpected;

  return {
    found: true,
    reference,
    measured_value: measuredValue,
    expected_range: { min: minExpected, max: maxExpected },
    within_tolerance: isWithinTolerance,
    verdict: isWithinTolerance ? 'NORMAL' : 'ABNORMAL_CHECK_CONNECTION'
  };
}

// ========================================
// F24: التأمين على الأجهزة الحساسة (Risk-Assessment Score)
// ========================================
export function assessDeviceRisk(data: {
  ticket_id: string;
  customer_id?: string;
  has_bent_frame: boolean;
  has_liquid_damage: boolean;
  has_previous_repair: boolean;
  board_condition_notes?: string;
  assessed_by_user_id?: string;
}): { risk_score: number; risk_level: string; disclaimer_required: boolean; assessment_id: string } {
  const id = `dra-${uuidv4().substring(0, 8)}`;
  let riskScore = 0;

  if (data.has_bent_frame) riskScore += 30;
  if (data.has_liquid_damage) riskScore += 40;
  if (data.has_previous_repair) riskScore += 15;
  if (data.board_condition_notes && data.board_condition_notes.length > 50) riskScore += 10;

  const riskLevel = riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';
  const disclaimerRequired = riskScore >= 40;

  db.prepare(`
    INSERT INTO device_risk_assessments (id, ticket_id, customer_id, risk_score, has_bent_frame, has_liquid_damage, has_previous_repair, board_condition_notes, assessed_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.ticket_id, data.customer_id || null, riskScore, data.has_bent_frame ? 1 : 0, data.has_liquid_damage ? 1 : 0, data.has_previous_repair ? 1 : 0, data.board_condition_notes || '', data.assessed_by_user_id || null);

  return {
    risk_score: riskScore,
    risk_level: riskLevel,
    disclaimer_required: disclaimerRequired,
    assessment_id: id
  };
}

// ========================================
// F25: تتبع ملحقات الأجهزة المهملة
// ========================================
export function recordAbandonedAccessory(data: {
  store_id: string;
  accessory_type: string;
  brand?: string;
  model_compatibility?: string;
  serial_or_barcode?: string;
  customer_id?: string;
  customer_phone?: string;
}): string {
  const id = `aba-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO abandoned_accessories (id, store_id, accessory_type, brand, model_compatibility, serial_or_barcode, customer_id, customer_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.accessory_type, data.brand || '', data.model_compatibility || '', data.serial_or_barcode || '', data.customer_id || null, data.customer_phone || null);

  return id;
}

export function getAbandonedAccessoriesReport(storeId: string, daysOld: number = 30): any[] {
  return db.prepare(`
    SELECT aa.*, c.name as customer_name
    FROM abandoned_accessories aa
    LEFT JOIN customers c ON aa.customer_id = c.id
    WHERE aa.store_id = ? 
      AND aa.status = 'STORED'
      AND (julianday(datetime('now')) - julianday(aa.deposit_date)) > ?
    ORDER BY aa.deposit_date ASC
  `).all(storeId, daysOld);
}
