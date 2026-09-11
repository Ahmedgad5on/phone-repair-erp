import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';

// ========================================
// F1: مصفوفة الجودات المتعددة (Quality Matrix per SKU)
// ========================================
export function createQualityMatrixEntry(data: {
  item_id: string;
  quality_grade: string;
  grade_label: string;
  purchase_price: number;
  wholesale_price: number;
  retail_price: number;
  bulk_price?: number;
  warranty_days?: number;
  supplier_name?: string;
}): string {
  const id = `qm-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO quality_matrix (id, item_id, quality_grade, grade_label, purchase_price, wholesale_price, retail_price, bulk_price, warranty_days, supplier_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.item_id, data.quality_grade, data.grade_label, data.purchase_price, data.wholesale_price, data.retail_price, data.bulk_price || data.wholesale_price, data.warranty_days || 30, data.supplier_name || '');

  return id;
}

export function getQualityMatrixForItem(itemId: string): any[] {
  return db.prepare('SELECT * FROM quality_matrix WHERE item_id = ? AND is_active = 1 ORDER BY purchase_price ASC').all(itemId);
}

// ========================================
// F2: محرك التوافق التبادلي (Cross-Model Compatibility Engine)
// ========================================
export function addCrossModelCompatibility(data: {
  source_item_id: string;
  source_brand: string;
  source_model: string;
  target_brand: string;
  target_model: string;
  compatibility_notes?: string;
}): string {
  const id = `cmc-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO cross_model_compatibility (id, source_item_id, source_brand, source_model, target_brand, target_model, compatibility_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.source_item_id, data.source_brand, data.source_model, data.target_brand, data.target_model, data.compatibility_notes || '');

  return id;
}

export function findCompatibleModels(brand: string, model: string): any[] {
  return db.prepare(`
    SELECT cmc.*, i.name as item_name, i.stock_quantity, i.retail_price
    FROM cross_model_compatibility cmc
    JOIN items i ON cmc.source_item_id = i.id
    WHERE (cmc.source_brand = ? AND cmc.source_model = ?)
       OR (cmc.target_brand = ? AND cmc.target_model = ?)
    ORDER BY i.stock_quantity DESC
  `).all(brand, model, brand, model);
}

// ========================================
// F3: توليد باركود الحماية المضاد للغش (Security Tamper Barcode)
// ========================================
export function generateSecurityBarcode(itemId: string, ticketId?: string, userId?: string): string {
  const id = `sb-${uuidv4().substring(0, 8)}`;
  const serialNumber = `SEC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  db.prepare(`
    INSERT INTO security_barcodes (id, item_id, ticket_id, serial_number, printed_by_user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, itemId, ticketId || null, serialNumber, userId || null);

  return serialNumber;
}

export function validateSecurityBarcode(serialNumber: string): { valid: boolean; item?: any } {
  const barcode = db.prepare('SELECT * FROM security_barcodes WHERE serial_number = ? AND is_voided = 0').get(serialNumber) as any;
  
  if (!barcode) return { valid: false };
  
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(barcode.item_id);
  return { valid: true, item };
}

// ========================================
// F4: التسعير الطبقي الآلي (Multi-Tier Wholesale Rules)
// ========================================
export function getWholesalePrice(itemId: string, accountType: string, quantity: number): { price: number; tier: string } {
  const tier = db.prepare(`
    SELECT * FROM wholesale_pricing_tiers
    WHERE (item_id = ? OR item_id IS NULL)
      AND account_type = ?
      AND min_quantity <= ?
      AND is_active = 1
    ORDER BY min_quantity DESC
    LIMIT 1
  `).get(itemId, accountType, quantity) as any;

  if (tier) {
    const item = db.prepare('SELECT purchase_price FROM items WHERE id = ?').get(itemId) as any;
    const price = (item?.purchase_price || 0) * tier.price_multiplier;
    return { price: Math.round(price * 100) / 100, tier: tier.tier_name };
  }

  const item = db.prepare('SELECT wholesale_price FROM items WHERE id = ?').get(itemId) as any;
  return { price: item?.wholesale_price || 0, tier: 'DEFAULT' };
}

// ========================================
// F5: مؤشر جودة الموردين (Vendor Defect Rating)
// ========================================
export function updateVendorQualityScore(vendorName: string, storeId: string, hasDefect: boolean, defectValue: number): void {
  const existing = db.prepare('SELECT * FROM vendor_quality_scores WHERE vendor_name = ? AND store_id = ?').get(vendorName, storeId) as any;

  if (existing) {
    const totalShipments = existing.total_shipments + 1;
    const defectShipments = hasDefect ? existing.defect_shipments + 1 : existing.defect_shipments;
    const defectRate = (defectShipments / totalShipments) * 100;
    const totalCredit = existing.total_credit_issued + defectValue;
    
    let qualityRating = 'EXCELLENT';
    if (defectRate > 10) qualityRating = 'POOR';
    else if (defectRate > 5) qualityRating = 'FAIR';
    else if (defectRate > 2) qualityRating = 'GOOD';

    db.prepare(`
      UPDATE vendor_quality_scores 
      SET total_shipments = ?, defect_shipments = ?, defect_rate_pct = ?, total_credit_issued = ?, quality_rating = ?, last_updated = datetime('now')
      WHERE id = ?
    `).run(totalShipments, defectShipments, Math.round(defectRate * 100) / 100, totalCredit, qualityRating, existing.id);
  } else {
    const id = `vqs-${uuidv4().substring(0, 8)}`;
    db.prepare(`
      INSERT INTO vendor_quality_scores (id, vendor_name, store_id, total_shipments, defect_shipments, defect_rate_pct, total_credit_issued, quality_rating)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?)
    `).run(id, vendorName, storeId, hasDefect ? 1 : 0, defectValue, hasDefect ? 100 : 0, hasDefect ? 'FAIR' : 'EXCELLENT');
  }
}

// ========================================
// F6: إدارة مرحلة اختبار الفنيين (Testing Window RMA)
// ========================================
export function createTestingWindowRMA(data: {
  item_id: string;
  ticket_id?: string;
  tech_user_id: string;
  testing_window_hours?: number;
}): string {
  const id = `twr-${uuidv4().substring(0, 8)}`;
  const expiresAt = new Date(Date.now() + (data.testing_window_hours || 48) * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO testing_window_rma (id, item_id, ticket_id, tech_user_id, testing_end_at, testing_window_hours)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.item_id, data.ticket_id || null, data.tech_user_id, expiresAt, data.testing_window_hours || 48);

  return id;
}

export function completeTestingWindowRMA(rmaId: string, sealIntact: boolean, noSoldering: boolean, notes?: string): string {
  const newStatus = sealIntact && noSoldering ? 'APPROVED' : 'REJECTED';
  
  db.prepare(`
    UPDATE testing_window_rma 
    SET seal_intact = ?, no_soldering_detected = ?, rma_status = ?, rma_notes = ?, released_at = datetime('now')
    WHERE id = ?
  `).run(sealIntact ? 1 : 0, noSoldering ? 1 : 0, newStatus, notes || '', rmaId);

  return newStatus;
}

// ========================================
// F7: كشف مطابقة الباتش للموردين
// ========================================
export function trackBatch(data: {
  item_id: string;
  batch_number: string;
  vendor_name: string;
  purchase_order_id?: string;
  quantity_received: number;
  warranty_batch_expiry?: string;
}): string {
  const id = `bt-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO batch_tracking (id, item_id, batch_number, vendor_name, purchase_order_id, quantity_received, warranty_batch_expiry)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.item_id, data.batch_number, data.vendor_name, data.purchase_order_id || null, data.quantity_received, data.warranty_batch_expiry || null);

  return id;
}

export function findBatchByVendor(vendorName: string): any[] {
  return db.prepare(`
    SELECT bt.*, i.name as item_name
    FROM batch_tracking bt
    JOIN items i ON bt.item_id = i.id
    WHERE bt.vendor_name = ?
    ORDER BY bt.received_at DESC
  `).all(vendorName);
}

// ========================================
// F8: إدارة مخزون الباغات والتجديد (Refurbishing Supply Ledger)
// ========================================
export function getRefurbishingSupplies(storeId: string): any[] {
  return db.prepare(`
    SELECT rs.*,
      CASE WHEN rs.current_stock <= rs.min_stock THEN 'LOW_STOCK' ELSE 'OK' END as stock_status,
      ROUND(rs.unit_cost * rs.usage_per_refurb, 2) as cost_per_refurb
    FROM refurbishing_supplies rs
    WHERE rs.store_id = ?
    ORDER BY rs.current_stock ASC
  `).all(storeId);
}

export function consumeRefurbishingSupply(supplyId: string, quantity: number): void {
  db.prepare(`
    UPDATE refurbishing_supplies 
    SET current_stock = MAX(0, current_stock - ?), total_consumed = total_consumed + ?
    WHERE id = ?
  `).run(quantity, quantity, supplyId);
}

// ========================================
// F9: حجز القطع المؤقت لمهندسي الصيانة
// ========================================
export function holdItemForTech(itemId: string, techUserId: string, ticketId?: string, holdMinutes: number = 120): string {
  const id = `ih-${uuidv4().substring(0, 8)}`;
  const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();

  // Release any existing holds for this tech
  db.prepare("UPDATE item_holds SET hold_status = 'EXPIRED', released_at = datetime('now') WHERE tech_user_id = ? AND hold_status = 'ACTIVE'").run(techUserId);

  db.prepare(`
    INSERT INTO item_holds (id, item_id, tech_user_id, ticket_id, hold_expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, itemId, techUserId, ticketId || null, expiresAt);

  return id;
}

export function releaseItemHold(holdId: string): void {
  db.prepare("UPDATE item_holds SET hold_status = 'RELEASED', released_at = datetime('now') WHERE id = ?").run(holdId);
}

// ========================================
// F10: حساب أرباح وزن السكراب النحاسي والذهب
// ========================================
export function addScrapMetalWeight(data: {
  store_id: string;
  metal_type: string;
  weight_grams: number;
  purity_pct: number;
  market_price_per_gram: number;
  boarded_ticket_ids?: string;
}): string {
  const id = `smw-${uuidv4().substring(0, 8)}`;
  const estimatedValue = data.weight_grams * data.purity_pct / 100 * data.market_price_per_gram;

  db.prepare(`
    INSERT INTO scrap_metal_weights (id, store_id, metal_type, weight_grams, purity_pct, market_price_per_gram, estimated_value, boarded_ticket_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.metal_type, data.weight_grams, data.purity_pct, data.market_price_per_gram, Math.round(estimatedValue * 100) / 100, data.boarded_ticket_ids || '');

  return id;
}

export function getScrapMetalSummary(storeId: string): any {
  const summary = db.prepare(`
    SELECT metal_type, 
           SUM(weight_grams) as total_weight,
           ROUND(AVG(purity_pct), 2) as avg_purity,
           SUM(estimated_value) as total_value
    FROM scrap_metal_weights
    WHERE store_id = ?
    GROUP BY metal_type
  `).all(storeId);

  const totalValue = summary.reduce((sum: number, s: any) => sum + s.total_value, 0);
  return { metals: summary, total_estimated_value: Math.round(totalValue * 100) / 100 };
}

// ========================================
// F11: حد التوريد الأدنى لورش الصيانة
// ========================================
export function checkMinimumOrder(storeId: string, customerType: string, orderAmount: number, orderItems: number): { meetsMinimum: boolean; message: string } {
  const rule = db.prepare('SELECT * FROM wholesale_minimum_order WHERE store_id = ? AND customer_type = ? AND is_active = 1').get(storeId, customerType) as any;
  
  if (!rule) return { meetsMinimum: true, message: 'No minimum order rule found' };

  const meetsAmount = orderAmount >= rule.min_order_amount;
  const meetsItems = orderItems >= rule.min_order_items;

  if (meetsAmount && meetsItems) {
    return { meetsMinimum: true, message: 'Order meets minimum requirements' };
  }

  const issues = [];
  if (!meetsAmount) issues.push(`Minimum amount: ${rule.min_order_amount} EGP`);
  if (!meetsItems) issues.push(`Minimum items: ${rule.min_order_items}`);

  return { meetsMinimum: false, message: `Order does not meet minimum: ${issues.join(', ')}` };
}

// ========================================
// F12: تتبع القطع سريعة التلف أثناء النقل
// ========================================
export function logTransitDamage(data: {
  store_id: string;
  item_id: string;
  delivery_method: string;
  driver_name: string;
  damage_description: string;
  damage_photo_url?: string;
  estimated_loss: number;
}): string {
  const id = `td-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO transit_damage_log (id, store_id, item_id, delivery_method, driver_name, damage_description, damage_photo_url, estimated_loss)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.item_id, data.delivery_method, data.driver_name, data.damage_description, data.damage_photo_url || '', data.estimated_loss);

  return id;
}

// ========================================
// F13: حساب تعويضات فحص القطع التالفة
// ========================================
export function createVendorCompensationClaim(data: {
  vendor_name: string;
  batch_id?: string;
  total_items_claimed: number;
  total_defect_value: number;
  compensation_amount: number;
  notes?: string;
}): string {
  const id = `vcc-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO vendor_compensation_claims (id, vendor_name, batch_id, total_items_claimed, total_defect_value, compensation_amount, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.vendor_name, data.batch_id || null, data.total_items_claimed, data.total_defect_value, data.compensation_amount, data.notes || '');

  return id;
}

// ========================================
// F14: جدولة طلبات القطع النادرة (Rare Parts Pre-Order)
// ========================================
export function createRarePartPreorder(data: {
  store_id: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  item_description: string;
  device_brand?: string;
  device_model?: string;
  estimated_price: number;
  deposit_amount: number;
}): string {
  const id = `rpp-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO rare_parts_preorders (id, store_id, customer_id, customer_name, customer_phone, item_description, device_brand, device_model, estimated_price, deposit_amount, deposit_paid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.customer_id || null, data.customer_name, data.customer_phone, data.item_description, data.device_brand || '', data.device_model || '', data.estimated_price, data.deposit_amount, data.deposit_amount > 0 ? 1 : 0);

  return id;
}

export function getPendingPreorders(storeId: string): any[] {
  return db.prepare(`
    SELECT * FROM rare_parts_preorders
    WHERE store_id = ? AND status IN ('PENDING', 'ORDERED')
    ORDER BY created_at ASC
  `).all(storeId);
}

// ========================================
// F15: مؤشر تغير أسعار شاشات الفئات العليا
// ========================================
export function recordScreenPriceChange(itemId: string, oldPrice: number, newPrice: number, marketReference?: string): string {
  const id = `sph-${uuidv4().substring(0, 8)}`;
  const changePct = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;

  db.prepare(`
    INSERT INTO screen_price_history (id, item_id, old_price, new_price, change_pct, market_reference)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, itemId, oldPrice, newPrice, Math.round(changePct * 100) / 100, marketReference || '');

  return id;
}

export function getScreenPriceTrends(itemId: string): any[] {
  return db.prepare('SELECT * FROM screen_price_history WHERE item_id = ? ORDER BY recorded_at DESC LIMIT 10').all(itemId);
}

// ========================================
// F16: إلزام إرفاق صورة العيب المصنعي
// ========================================
export function attachManufacturerDefectPhoto(rmaTicketId: string, photoUrl: string, defectType: string, description: string, userId?: string): string {
  const id = `mdp-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO manufacturer_defect_photos (id, rma_ticket_id, photo_url, defect_type, description, uploaded_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, rmaTicketId, photoUrl, defectType, description, userId || null);

  return id;
}

// ========================================
// F17: حساب نسبة كسر الباغات بالفحص
// ========================================
export function logInspectionBreakage(data: {
  store_id: string;
  inspector_user_id: string;
  item_id?: string;
  breakage_type: string;
  breakage_description: string;
  estimated_cost: number;
}): string {
  const id = `ib-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO inspection_breakage_log (id, store_id, inspector_user_id, item_id, breakage_type, breakage_description, estimated_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.inspector_user_id, data.item_id || null, data.breakage_type, data.breakage_description, data.estimated_cost);

  return id;
}

export function getInspectorBreakageReport(storeId: string, days: number = 30): any[] {
  return db.prepare(`
    SELECT 
      ib.inspector_user_id,
      u.name as inspector_name,
      COUNT(*) as total_breakages,
      SUM(ib.estimated_cost) as total_cost,
      ROUND(AVG(ib.estimated_cost), 2) as avg_cost_per_breakage
    FROM inspection_breakage_log ib
    JOIN users u ON ib.inspector_user_id = u.id
    WHERE ib.store_id = ? AND ib.occurred_at >= datetime('now', ?)
    GROUP BY ib.inspector_user_id
    ORDER BY total_cost DESC
  `).all(storeId, `-${days} days`);
}

// ========================================
// F18: تسجيل هوالك الصيانة الداخلية
// ========================================
export function logInternalRepairWaste(data: {
  store_id: string;
  ticket_id?: string;
  technician_id: string;
  item_id?: string;
  damage_description: string;
  estimated_cost: number;
  fault_category?: string;
}): string {
  const id = `irw-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO internal_repair_waste (id, store_id, ticket_id, technician_id, item_id, damage_description, estimated_cost, fault_category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.ticket_id || null, data.technician_id, data.item_id || null, data.damage_description, data.estimated_cost, data.fault_category || '');

  return id;
}

export function getInternalWasteReport(storeId: string, days: number = 30): any[] {
  return db.prepare(`
    SELECT 
      irw.technician_id,
      u.name as technician_name,
      COUNT(*) as total_waste_incidents,
      SUM(irw.estimated_cost) as total_waste_cost,
      ROUND(AVG(irw.estimated_cost), 2) as avg_cost_per_incident
    FROM internal_repair_waste irw
    JOIN users u ON irw.technician_id = u.id
    WHERE irw.store_id = ? AND irw.recorded_at >= datetime('now', ?)
    GROUP BY irw.technician_id
    ORDER BY total_waste_cost DESC
  `).all(storeId, `-${days} days`);
}

// ========================================
// F19: لوحة المقارنة التقنية للشاشات
// ========================================
export function getScreenTechnicalComparison(itemIds: string[]): any[] {
  if (itemIds.length === 0) return [];

  const placeholders = itemIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT sts.*, i.name as item_name, i.retail_price, i.stock_quantity
    FROM screen_technical_specs sts
    JOIN items i ON sts.item_id = i.id
    WHERE sts.item_id IN (${placeholders})
    ORDER BY sts.brightness_nits DESC, sts.refresh_rate_hz DESC
  `).all(...itemIds);
}

// ========================================
// F20: إدارة خطوط الائتمان الدوارة لمراكز الصيانة
// ========================================
export function getRevolvingCreditStatus(customerId: string, storeId: string): any {
  const account = db.prepare(`
    SELECT rca.*, c.name as customer_name
    FROM revolving_credit_accounts rca
    JOIN customers c ON rca.customer_id = c.id
    WHERE rca.customer_id = ? AND rca.store_id = ?
  `).get(customerId, storeId) as any;

  if (!account) return null;

  return {
    ...account,
    available_credit: account.credit_limit - account.current_balance,
    is_overdue: account.payment_due_date && new Date(account.payment_due_date) < new Date()
  };
}

// ========================================
// F21: تكويد الآيسيهات والدوائر الدقيقة (IC & Component Indexing)
// ========================================
export function searchICComponents(query: string): any[] {
  return db.prepare(`
    SELECT * FROM ic_component_index
    WHERE ic_part_number LIKE ? OR ic_name LIKE ? OR compatible_devices LIKE ?
    ORDER BY ic_name ASC
  `).all(`%${query}%`, `%${query}%`, `%${query}%`);
}

// ========================================
// F22: جرد مخزن الخلع المنفصل
// ========================================
export function addHarvestedPart(data: {
  store_id: string;
  item_id: string;
  donor_device_brand: string;
  donor_device_model: string;
  donor_imei?: string;
  condition_grade?: string;
}): string {
  const id = `hi-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO harvest_inventory (id, store_id, item_id, donor_device_brand, donor_device_model, donor_imei, condition_grade)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.item_id, data.donor_device_brand, data.donor_device_model, data.donor_imei || '', data.condition_grade || 'TESTED_WORKING');

  return id;
}

export function getHarvestInventory(storeId: string): any[] {
  return db.prepare(`
    SELECT hi.*, i.name as item_name
    FROM harvest_inventory hi
    JOIN items i ON hi.item_id = i.id
    WHERE hi.store_id = ? AND hi.is_sold = 0
    ORDER BY hi.harvest_date DESC
  `).all(storeId);
}

// ========================================
// F23: تنبيه نقص القطع المرتبطة (Paired Components Alert)
// ========================================
export function getPairedComponentAlerts(storeId: string): any[] {
  return db.prepare(`
    SELECT 
      pcr.*,
      i1.name as primary_item_name, i1.stock_quantity as primary_stock,
      i2.name as paired_item_name, i2.stock_quantity as paired_stock,
      CASE WHEN i2.stock_quantity < i1.stock_quantity * pcr.pairing_ratio THEN 'LOW_PAIRED' ELSE 'OK' END as alert_status
    FROM paired_component_rules pcr
    JOIN items i1 ON pcr.primary_item_id = i1.id
    JOIN items i2 ON pcr.paired_item_id = i2.id
    WHERE i1.store_id = ?
    ORDER BY alert_status DESC
  `).all(storeId);
}

// ========================================
// F24: معدل استهلاك البطاريات الموسمي
// ========================================
export function calculateSeasonalConsumption(storeId: string, category: string): any {
  const monthlyData = db.prepare(`
    SELECT strftime('%m', s.created_at) as month,
           SUM(si.quantity) as total_sold
    FROM sales s
    JOIN sale_items si ON s.id = si.sale_id
    JOIN items i ON si.item_id = i.id
    WHERE i.store_id = ? AND i.category = ? AND s.created_at >= datetime('now', '-12 months')
    GROUP BY strftime('%m', s.created_at)
    ORDER BY month
  `).all(storeId, category) as any[];

  const avgMonthlyDemand = monthlyData.length > 0 ? monthlyData.reduce((sum: number, m: any) => sum + m.total_sold, 0) / monthlyData.length : 0;
  const peakMonth = monthlyData.sort((a: any, b: any) => b.total_sold - a.total_sold)[0]?.month || '';

  return { category, monthly_data: monthlyData, avg_monthly_demand: Math.round(avgMonthlyDemand), peak_month: peakMonth };
}

// ========================================
// F25: تتبع حركة مسامير وشاسيهات التثبيت
// ========================================
export function getFastenerTracking(storeId: string): any[] {
  return db.prepare(`
    SELECT ft.*, i.name as item_name
    FROM fastener_tracking ft
    JOIN items i ON ft.item_id = i.id
    WHERE ft.store_id = ?
    ORDER BY ft.current_stock ASC
  `).all(storeId);
}
