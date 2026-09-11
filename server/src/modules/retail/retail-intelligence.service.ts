import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';

// ========================================
// F1: كاشف تكلفة ركود الرف (Holding Cost Calculator)
// ========================================
export function calculateHoldingCosts(storeId: string): any[] {
  const items = db.prepare(`
    SELECT i.id, i.name, i.category, i.stock_quantity, i.purchase_price, i.retail_price,
           COALESCE(i.last_sold_date, i.created_at) as last_activity,
           CAST(julianday(datetime('now')) - julianday(COALESCE(i.last_sold_date, i.created_at)) AS INTEGER) as days_idle
    FROM items i
    WHERE i.store_id = ? AND i.stock_quantity > 0 AND i.deleted_at IS NULL
    ORDER BY days_idle DESC
  `).all(storeId) as any[];

  const holdingRule = db.prepare('SELECT daily_holding_cost_pct FROM holding_cost_rules WHERE store_id = ? AND is_active = 1 LIMIT 1').get(storeId) as any;
  const dailyPct = holdingRule?.daily_holding_cost_pct || 0.01;

  return items.map(item => {
    const holdingCost = item.purchase_price * item.stock_quantity * dailyPct * item.days_idle;
    const suggestedDiscount = item.days_idle > 60 ? 20 : item.days_idle > 30 ? 10 : 0;

    return {
      ...item,
      holding_cost: Math.round(holdingCost * 100) / 100,
      suggested_discount_pct: suggestedDiscount,
      action_needed: item.days_idle > 60 ? 'CLEARANCE' : item.days_idle > 30 ? 'DISCOUNT' : 'OK'
    };
  });
}

// ========================================
// F2: سجل النواقص التلقائي التراكمي (Lost Sales Logger)
// ========================================
export function logLostSale(data: {
  store_id: string;
  item_name: string;
  item_category?: string;
  customer_phone?: string;
  customer_name?: string;
}): string {
  const existing = db.prepare(`
    SELECT id, request_count FROM lost_sales_log 
    WHERE store_id = ? AND item_name = ? AND is_po_created = 0
    ORDER BY last_requested_at DESC LIMIT 1
  `).get(data.store_id, data.item_name) as any;

  if (existing) {
    db.prepare(`
      UPDATE lost_sales_log 
      SET request_count = request_count + 1, last_requested_at = datetime('now')
      WHERE id = ?
    `).run(existing.id);
    return existing.id;
  }

  const id = `ls-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO lost_sales_log (id, store_id, item_name, item_category, customer_phone, customer_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.item_name, data.item_category || '', data.customer_phone || '', data.customer_name || '');

  return id;
}

export function getFrequentLostSales(storeId: string, minRequests: number = 3): any[] {
  return db.prepare(`
    SELECT item_name, item_category, SUM(request_count) as total_requests, 
           MAX(last_requested_at) as last_requested,
           GROUP_CONCAT(DISTINCT customer_phone) as customer_phones
    FROM lost_sales_log
    WHERE store_id = ? AND is_po_created = 0
    GROUP BY item_name
    HAVING total_requests >= ?
    ORDER BY total_requests DESC
  `).all(storeId, minRequests);
}

// ========================================
// F3: البيع الإجباري عبر التحقق المزدوج (IMEI-Enforced Checkout)
// ========================================
export function verifyIMEICheckout(saleId: string, itemId: string, imei: string, userId: string): { verified: boolean; error?: string } {
  const imeiRecord = db.prepare(`
    SELECT * FROM imei_records 
    WHERE item_id = ? AND imei = ? AND status = 'IN_STOCK'
  `).get(itemId, imei) as any;

  if (!imeiRecord) {
    return { verified: false, error: 'IMEI not found or not in stock' };
  }

  const logId = `icl-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO imei_checkout_log (id, sale_id, item_id, imei_scanned, scanned_by_user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(logId, saleId, itemId, imei, userId);

  return { verified: true };
}

// ========================================
// F4: عقد البيع المستعمل المؤتمت (Auto-Generated Used Phone Contract)
// ========================================
export function generateUsedPhoneContract(data: {
  store_id: string;
  sale_id?: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  customer_id_number?: string;
  device_brand: string;
  device_model: string;
  device_imei: string;
  device_condition: string;
  sale_price: number;
  warranty_days?: number;
}): string {
  const id = `upc-${uuidv4().substring(0, 8)}`;
  const contractTerms = `USED DEVICE PURCHASE & SALE CONTRACT\n\nDevice: ${data.device_brand} ${data.device_model}\nIMEI: ${data.device_imei}\nCondition: ${data.device_condition}\nSale Price: ${data.sale_price} EGP\nWarranty: ${data.warranty_days || 7} days (hardware defects only)\n\nTerms:\n1. Device sold as-is with declared condition\n2. Warranty covers manufacturing defects only\n3. No returns for buyer's remorse\n4. Customer confirms device was tested before purchase\n5. Store not responsible for software issues post-sale`;

  const contractHash = require('crypto').createHash('sha256').update(contractTerms + data.device_imei + data.customer_name).digest('hex');

  db.prepare(`
    INSERT INTO used_phone_contracts (id, store_id, sale_id, customer_id, customer_name, customer_phone, customer_id_number, device_brand, device_model, device_imei, device_condition, sale_price, warranty_days, contract_terms, contract_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.sale_id || null, data.customer_id || null, data.customer_name, data.customer_phone, data.customer_id_number || '', data.device_brand, data.device_model, data.device_imei, data.device_condition, data.sale_price, data.warranty_days || 7, contractTerms, contractHash);

  return id;
}

// ========================================
// F5: سقف الائتمان للآجل (Dynamic Credit Limit)
// ========================================
export function checkCreditLimit(customerId: string, saleAmount: number): { allowed: boolean; current_credit: number; credit_limit: number; remaining: number } {
  const customer = db.prepare('SELECT credit_limit, credit_used FROM customers WHERE id = ?').get(customerId) as any;
  if (!customer) return { allowed: false, current_credit: 0, credit_limit: 0, remaining: 0 };

  const limit = customer.credit_limit || 0;
  const used = customer.credit_used || 0;
  const remaining = limit - used;

  return {
    allowed: saleAmount <= remaining,
    current_credit: used,
    credit_limit: limit,
    remaining: Math.max(0, remaining)
  };
}

export function recordCreditTransaction(customerId: string, saleId: string, amount: number, type: string): string {
  const id = `ct-${uuidv4().substring(0, 8)}`;
  const customer = db.prepare('SELECT credit_used FROM customers WHERE id = ?').get(customerId) as any;
  const newBalance = type === 'DEBIT' ? (customer?.credit_used || 0) + amount : Math.max(0, (customer?.credit_used || 0) - amount);

  db.prepare(`
    INSERT INTO credit_transactions (id, customer_id, sale_id, amount, transaction_type, balance_after)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, customerId, saleId, amount, type, newBalance);

  db.prepare('UPDATE customers SET credit_used = ? WHERE id = ?').run(newBalance, customerId);
  return id;
}

// ========================================
// F6: إعادة الطلب الذكية متعددة المتغيرات (Smart Reorder Point)
// ========================================
export function calculateSmartReorderPoints(storeId: string): any[] {
  const items = db.prepare(`
    SELECT i.id, i.name, i.stock_quantity, i.reorder_level
    FROM items i
    WHERE i.store_id = ? AND i.stock_quantity > 0 AND i.deleted_at IS NULL
  `).all(storeId) as any[];

  return items.map(item => {
    const salesData = db.prepare(`
      SELECT AVG(daily_count) as avg_daily_sales
      FROM (
        SELECT DATE(s.created_at) as sale_date, SUM(si.quantity) as daily_count
        FROM sales s
        JOIN sale_items si ON s.id = si.sale_id
        WHERE si.item_id = ? AND s.created_at >= datetime('now', '-30 days')
        GROUP BY DATE(s.created_at)
      )
    `).get(item.id) as any;

    const avgDailySales = salesData?.avg_daily_sales || 0;
    const leadTimeDays = 7;
    const safetyStockDays = 3;
    const reorderPoint = (avgDailySales * leadTimeDays) + (avgDailySales * safetyStockDays);
    const reorderQty = avgDailySales * leadTimeDays * 2;

    return {
      ...item,
      avg_daily_sales: Math.round(avgDailySales * 100) / 100,
      reorder_point: Math.ceil(reorderPoint),
      reorder_quantity: Math.ceil(reorderQty),
      needs_reorder: item.stock_quantity <= Math.ceil(reorderPoint)
    };
  });
}

// ========================================
// F7: كشف المنتجات التكميلية (Cross-Selling Engine)
// ========================================
export function getCrossSellSuggestions(deviceModel: string): any[] {
  return db.prepare(`
    SELECT csr.*, i.name as item_name, i.retail_price, i.stock_quantity
    FROM cross_sell_rules csr
    JOIN items i ON csr.target_item_id = i.id
    WHERE (csr.source_model LIKE ? OR csr.source_model = 'ALL')
      AND csr.is_active = 1
      AND i.stock_quantity > 0
    ORDER BY csr.relevance_score DESC
    LIMIT 5
  `).all(`%${deviceModel}%`);
}

// ========================================
// F8: نظام سلة الطلب المعلقة (Draft Order Handover)
// ========================================
export function createDraftOrder(storeId: string, salespersonId: string, itemsJson: string): string {
  const id = `dor-${uuidv4().substring(0, 8)}`;
  const items = JSON.parse(itemsJson);
  const subtotal = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);

  db.prepare(`
    INSERT INTO draft_orders (id, store_id, salesperson_user_id, items_json, subtotal)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, storeId, salespersonId, itemsJson, subtotal);

  return id;
}

export function getPendingDraftOrders(storeId: string): any[] {
  return db.prepare(`
    SELECT do.*, u.name as salesperson_name
    FROM draft_orders do
    LEFT JOIN users u ON do.salesperson_user_id = u.id
    WHERE do.store_id = ? AND do.status = 'DRAFT'
    ORDER BY do.created_at ASC
  `).all(storeId);
}

// ========================================
// F9: معدل استرجاع العلامات التجارية (Brand Failure Ratio)
// ========================================
export function updateBrandReturnStats(storeId: string): void {
  const brands = db.prepare(`
    SELECT i.category as brand_name,
           SUM(si.quantity) as total_sold
    FROM sale_items si
    JOIN items i ON si.item_id = i.id
    JOIN sales s ON si.sale_id = s.id
    WHERE s.store_id = ? AND s.created_at >= datetime('now', '-90 days')
    GROUP BY i.category
  `).all(storeId) as any[];

  for (const brand of brands) {
    const returns = db.prepare(`
      SELECT COUNT(*) as count FROM sale_return_items sri
      JOIN items i ON sri.item_id = i.id
      WHERE i.category = ? AND i.store_id = ?
    `).get(brand.brand_name, storeId) as any;

    const returnRatio = brand.total_sold > 0 ? (returns.count / brand.total_sold) * 100 : 0;

    db.prepare(`
      INSERT OR REPLACE INTO brand_return_stats (id, store_id, brand_name, total_sold, total_returned, return_ratio, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(`brs-${uuidv4().substring(0, 8)}`, storeId, brand.brand_name, brand.total_sold, returns.count, Math.round(returnRatio * 100) / 100);
  }
}

export function getBrandReturnReport(storeId: string): any[] {
  updateBrandReturnStats(storeId);
  return db.prepare(`
    SELECT * FROM brand_return_stats
    WHERE store_id = ?
    ORDER BY return_ratio DESC
  `).all(storeId);
}

// ========================================
// F10: تحليل حركة المبيعات بالساعة (Hourly Sales Footfall)
// ========================================
export function calculateHourlyFootfall(storeId: string, date?: string): any[] {
  const targetDate = date || new Date().toISOString().split('T')[0];

  const hourlyData = db.prepare(`
    SELECT 
      CAST(strftime('%H', s.created_at) AS INTEGER) as sale_hour,
      COUNT(s.id) as transaction_count,
      SUM(s.total) as total_revenue,
      ROUND(AVG(s.total), 2) as avg_transaction_value
    FROM sales s
    WHERE s.store_id = ? AND DATE(s.created_at) = ? AND s.status != 'VOID'
    GROUP BY sale_hour
    ORDER BY sale_hour
  `).all(storeId, targetDate) as any[];

  // Fill missing hours
  const allHours = Array.from({ length: 24 }, (_, i) => i);
  return allHours.map(hour => {
    const existing = hourlyData.find((h: any) => h.sale_hour === hour);
    return {
      sale_hour: hour,
      transaction_count: existing?.transaction_count || 0,
      total_revenue: existing?.total_revenue || 0,
      avg_transaction_value: existing?.avg_transaction_value || 0,
      is_peak: existing && existing.transaction_count > 5
    };
  });
}

// ========================================
// F11: التسعير المرن بحسب حجم الشراء (Tiered Quantity Discounts)
// ========================================
export function calculateQuantityDiscount(itemId: string, quantity: number): { discount_pct: number; final_price: number } {
  const tier = db.prepare(`
    SELECT * FROM quantity_discount_tiers
    WHERE (item_id = ? OR item_id IS NULL)
      AND min_quantity <= ?
      AND (max_quantity IS NULL OR max_quantity >= ?)
      AND is_active = 1
    ORDER BY min_quantity DESC
    LIMIT 1
  `).get(itemId, quantity, quantity) as any;

  const item = db.prepare('SELECT retail_price FROM items WHERE id = ?').get(itemId) as any;
  const basePrice = item?.retail_price || 0;
  const discountPct = tier?.discount_pct || 0;
  const finalPrice = basePrice * quantity * (1 - discountPct / 100);

  return { discount_pct: discountPct, final_price: Math.round(finalPrice * 100) / 100 };
}

// ========================================
// F12: سجل تتبع أداء البائعين (Salesperson Conversion Rate)
// ========================================
export function calculateSalespersonPerformance(storeId: string, periodMonth: string): any[] {
  const salespeople = db.prepare(`
    SELECT DISTINCT s.salesperson_user_id, u.name
    FROM sales s
    JOIN users u ON s.salesperson_user_id = u.id
    WHERE s.store_id = ? AND strftime('%Y-%m', s.created_at) = ?
  `).all(storeId, periodMonth) as any[];

  return salespeople.map(sp => {
    const stats = db.prepare(`
      SELECT COUNT(s.id) as total_invoices,
             SUM(s.total) as total_revenue,
             ROUND(AVG(s.total), 2) as avg_invoice_value,
             SUM((SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id)) as items_sold
      FROM sales s
      WHERE s.salesperson_user_id = ? AND s.store_id = ? AND strftime('%Y-%m', s.created_at) = ?
    `).get(sp.salesperson_user_id, storeId, periodMonth) as any;

    return {
      user_id: sp.salesperson_user_id,
      name: sp.name,
      period: periodMonth,
      ...stats,
      conversion_rate: stats?.total_invoices || 0
    };
  });
}

// ========================================
// F13: تحويل مرتجعات الصيانة لمبيعات (Upselling Dead Devices)
// ========================================
export function suggestUpsell(storeId: string, ticketId: string): any {
  const ticket = db.prepare(`
    SELECT t.*, c.id as customer_id, c.name as customer_name
    FROM repair_tickets t
    JOIN customers c ON t.customer_id = c.id
    WHERE t.id = ?
  `).get(ticketId) as any;

  if (!ticket) return null;

  const estimatedCost = ticket.estimated_cost || 0;
  const deviceValue = estimatedCost * 0.5; // Assume device value is roughly 2x repair cost

  if (estimatedCost >= deviceValue * 0.7) {
    const replacement = db.prepare(`
      SELECT * FROM items 
      WHERE category = 'USED_PHONES' 
        AND name LIKE ? AND stock_quantity > 0
      ORDER BY retail_price ASC
      LIMIT 1
    `).get(`%${ticket.device_brand}%`) as any;

    if (replacement) {
      const id = `ups-${uuidv4().substring(0, 8)}`;
      db.prepare(`
        INSERT INTO upsell_opportunities (id, store_id, ticket_id, customer_id, original_device, repair_cost, device_value, suggested_replacement_id, suggested_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, storeId, ticketId, ticket.customer_id, `${ticket.device_brand} ${ticket.device_model}`, estimatedCost, deviceValue, replacement.id, replacement.retail_price);

      return {
        upsell_id: id,
        original_device: `${ticket.device_brand} ${ticket.device_model}`,
        repair_cost: estimatedCost,
        suggested_replacement: replacement.name,
        suggested_price: replacement.retail_price,
        savings: Math.round((estimatedCost - replacement.retail_price * 0.1) * 100) / 100
      };
    }
  }
  return null;
}

// ========================================
// F14: تتبع تواريخ انتهاء صلاحية البطاريات (Battery Shelf-Life Alert)
// ========================================
export function getBatteryShelfLifeAlerts(storeId: string): any[] {
  return db.prepare(`
    SELECT bsl.*, i.name as item_name, i.stock_quantity
    FROM battery_shelf_life bsl
    JOIN items i ON bsl.item_id = i.id
    WHERE bsl.store_id = ? 
      AND bsl.health_status != 'EXPIRED'
      AND (julianday(datetime('now')) - julianday(bsl.last_charge_date)) > 90
    ORDER BY bsl.last_charge_date ASC
  `).all(storeId);
}

// ========================================
// F15: جرد الفئات السريع (Spot-Check Cycle Counting)
// ========================================
export function createSpotCheck(storeId: string, itemId: string, userId: string, actualQuantity: number): string {
  const item = db.prepare('SELECT stock_quantity FROM items WHERE id = ?').get(itemId) as any;
  const expectedQuantity = item?.stock_quantity || 0;
  const variance = actualQuantity - expectedQuantity;
  const variancePct = expectedQuantity > 0 ? (variance / expectedQuantity) * 100 : 0;

  const id = `scc-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO spot_check_counts (id, store_id, item_id, expected_quantity, actual_quantity, variance, variance_pct, counted_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, storeId, itemId, expectedQuantity, actualQuantity, variance, Math.round(variancePct * 100) / 100, userId);

  // Update actual stock if variance is significant
  if (Math.abs(variance) > 0) {
    db.prepare('UPDATE items SET stock_quantity = ? WHERE id = ?').run(actualQuantity, itemId);
  }

  return id;
}

// ========================================
// F16: حساب ربحية المتر المربع للواجهات
// ========================================
export function calculateZonePerformance(storeId: string, periodMonth: string): any[] {
  return db.prepare(`
    SELECT * FROM display_zone_performance
    WHERE store_id = ? AND period_month = ?
    ORDER BY revenue_per_sqm DESC
  `).all(storeId, periodMonth);
}

// ========================================
// F17: حماية التخفيضات (Discount Authority Matrix)
// ========================================
export function initializeDiscountAuthority(): void {
  const count = (db.prepare('SELECT COUNT(*) as count FROM discount_authority_matrix').get() as any)?.count || 0;
  if (count === 0) {
    const defaults = [
      { role: 'Cashier', max_discount_pct: 5, requires_approval_above_pct: 10, max_daily_discount_amount: 500 },
      { role: 'Salesperson', max_discount_pct: 8, requires_approval_above_pct: 15, max_daily_discount_amount: 800 },
      { role: 'Manager', max_discount_pct: 20, requires_approval_above_pct: 30, max_daily_discount_amount: 3000 },
      { role: 'SuperAdmin', max_discount_pct: 50, requires_approval_above_pct: 50, max_daily_discount_amount: 10000 }
    ];

    const stmt = db.prepare('INSERT INTO discount_authority_matrix (id, role, max_discount_pct, requires_approval_above_pct, max_daily_discount_amount) VALUES (?, ?, ?, ?, ?)');
    for (const d of defaults) {
      stmt.run(`dam-${uuidv4().substring(0, 8)}`, d.role, d.max_discount_pct, d.requires_approval_above_pct, d.max_daily_discount_amount);
    }
  }
}

export function checkDiscountAuthority(role: string, discountPct: number): { allowed: boolean; requires_approval: boolean; max_allowed: number } {
  initializeDiscountAuthority();
  const authority = db.prepare('SELECT * FROM discount_authority_matrix WHERE role = ?').get(role) as any;
  
  if (!authority) return { allowed: false, requires_approval: true, max_allowed: 0 };

  return {
    allowed: discountPct <= authority.max_discount_pct,
    requires_approval: discountPct > authority.requires_approval_above_pct,
    max_allowed: authority.max_discount_pct
  };
}

// ========================================
// F18: ربط الشواحن بمواصفات وات الهواتف
// ========================================
export function validateChargerCompatibility(chargerItemId: string, deviceModel: string): { compatible: boolean; message: string } {
  const compatibility = db.prepare(`
    SELECT * FROM charger_device_compatibility
    WHERE charger_item_id = ? AND compatible_models LIKE ?
    LIMIT 1
  `).get(chargerItemId, `%${deviceModel}%`) as any;

  if (compatibility) {
    return { compatible: true, message: `Charger is compatible with ${deviceModel}` };
  }

  const incompatible = db.prepare(`
    SELECT * FROM charger_device_compatibility
    WHERE charger_item_id = ? AND incompatible_models LIKE ?
    LIMIT 1
  `).get(chargerItemId, `%${deviceModel}%`) as any;

  if (incompatible) {
    return { compatible: false, message: `WARNING: Charger is NOT compatible with ${deviceModel}. May cause damage.` };
  }

  return { compatible: true, message: 'Compatibility unverified. Please check device specifications.' };
}

// ========================================
// F19: تقييم العملاء الائتماني (Customer Trust Score)
// ========================================
export function calculateCustomerTrustScore(customerId: string): any {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
  if (!customer) return null;

  const salesCount = (db.prepare('SELECT COUNT(*) as count FROM sales WHERE customer_id = ? AND status != "VOID"').get(customerId) as any)?.count || 0;
  const returnsCount = (db.prepare('SELECT COUNT(*) as count FROM sale_returns sr JOIN sales s ON sr.sale_id = s.id WHERE s.customer_id = ?').get(customerId) as any)?.count || 0;
  const totalSpent = customer.total_spent || 0;
  const creditUsed = customer.credit_used || 0;

  let trustScore = 50;
  if (salesCount > 10) trustScore += 15;
  else if (salesCount > 5) trustScore += 10;
  if (returnsCount === 0) trustScore += 10;
  else if (returnsCount > 3) trustScore -= 15;
  if (totalSpent > 10000) trustScore += 10;
  if (creditUsed === 0) trustScore += 5;

  trustScore = Math.max(0, Math.min(100, trustScore));
  const riskLevel = trustScore >= 80 ? 'EXCELLENT' : trustScore >= 60 ? 'GOOD' : trustScore >= 40 ? 'STANDARD' : 'HIGH_RISK';

  const id = `cts-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT OR REPLACE INTO customer_trust_scores (id, customer_id, total_transactions, returns_count, trust_score, risk_level, last_calculated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(id, customerId, salesCount, returnsCount, trustScore, riskLevel);

  return { customer_id: customerId, trust_score: trustScore, risk_level: riskLevel, total_transactions: salesCount, returns_count: returnsCount };
}

// ========================================
// F20: حصر النثريات والهدايا الترويجية
// ========================================
export function recordPromotionalGiveaway(data: {
  store_id: string;
  sale_id?: string;
  item_id?: string;
  item_name: string;
  quantity?: number;
  unit_cost?: number;
  campaign_name?: string;
  given_to_customer?: string;
}): string {
  const id = `pg-${uuidv4().substring(0, 8)}`;
  const qty = data.quantity || 1;
  const cost = data.unit_cost || 0;

  db.prepare(`
    INSERT INTO promotional_giveaways (id, store_id, sale_id, item_id, item_name, quantity, unit_cost, total_cost, campaign_name, given_to_customer)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.sale_id || null, data.item_id || null, data.item_name, qty, cost, qty * cost, data.campaign_name || '', data.given_to_customer || '');

  return id;
}

export function getPromotionalGiveawayReport(storeId: string, days: number = 30): any {
  const total = db.prepare(`
    SELECT COUNT(*) as count, SUM(total_cost) as total_cost
    FROM promotional_giveaways
    WHERE store_id = ? AND given_at >= datetime('now', ?)
  `).get(storeId, `-${days} days`) as any;

  const byCampaign = db.prepare(`
    SELECT campaign_name, COUNT(*) as count, SUM(total_cost) as total_cost
    FROM promotional_giveaways
    WHERE store_id = ? AND given_at >= datetime('now', ?)
    GROUP BY campaign_name
    ORDER BY total_cost DESC
  `).all(storeId, `-${days} days`);

  return { total_giveaways: total.count, total_cost: total.total_cost, by_campaign: byCampaign };
}

// ========================================
// F21: مراقبة هامش الربح الحدي (Margin Erosion Alert)
// ========================================
export function checkMarginErosion(saleId: string): any[] {
  const items = db.prepare(`
    SELECT si.*, i.purchase_price, i.name as item_name
    FROM sale_items si
    JOIN items i ON si.item_id = i.id
    WHERE si.sale_id = ?
  `).all(saleId) as any[];

  const alerts: any[] = [];
  for (const item of items) {
    const marginPct = item.purchase_price > 0 ? ((item.unit_price - item.purchase_price) / item.purchase_price) * 100 : 100;
    
    if (marginPct < 5) {
      const alertId = `ma-${uuidv4().substring(0, 8)}`;
      const alertLevel = marginPct < 0 ? 'CRITICAL' : 'WARNING';
      
      db.prepare(`
        INSERT INTO margin_alerts (id, sale_id, item_id, item_name, original_price, final_sale_price, purchase_price, margin_pct, alert_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(alertId, saleId, item.item_id, item.item_name, item.unit_price, item.unit_price, item.purchase_price, Math.round(marginPct * 100) / 100, alertLevel);

      alerts.push({ item_name: item.item_name, margin_pct: Math.round(marginPct * 100) / 100, alert_level: alertLevel });
    }
  }
  return alerts;
}

// ========================================
// F22: تتبع البضاعة المعارة للتجربة
// ========================================
export function checkoutLoanerItem(data: {
  store_id: string;
  item_id: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  deposit_amount?: number;
  due_days?: number;
}): string {
  const id = `li-${uuidv4().substring(0, 8)}`;
  const dueDate = new Date(Date.now() + (data.due_days || 1) * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO loaner_items (id, store_id, item_id, loaned_to_customer_id, loaned_to_name, loaned_to_phone, due_date, deposit_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.item_id, data.customer_id || null, data.customer_name, data.customer_phone, dueDate, data.deposit_amount || 0);

  return id;
}

export function checkinLoanerItem(loanId: string): { success: boolean; message: string } {
  const loan = db.prepare('SELECT * FROM loaner_items WHERE id = ? AND status = "OUT"').get(loanId) as any;
  if (!loan) return { success: false, message: 'Loan record not found or already returned' };

  db.prepare('UPDATE loaner_items SET status = "RETURNED", returned_at = datetime("now") WHERE id = ?').run(loanId);
  return { success: true, message: 'Item returned successfully' };
}

// ========================================
// F23: توليد عروض التصفية التلقائية
// ========================================
export function generateClearanceSuggestions(storeId: string): any[] {
  return db.prepare(`
    SELECT i.id, i.name, i.category, i.stock_quantity, i.purchase_price, i.retail_price,
           COALESCE(i.last_sold_date, i.created_at) as last_activity,
           CAST(julianday(datetime('now')) - julianday(COALESCE(i.last_sold_date, i.created_at)) AS INTEGER) as days_idle
    FROM items i
    WHERE i.store_id = ? AND i.stock_quantity > 0 AND i.deleted_at IS NULL
      AND (julianday(datetime('now')) - julianday(COALESCE(i.last_sold_date, i.created_at))) > 90
    ORDER BY days_idle DESC
  `).all(storeId).map((item: any) => ({
    ...item,
    suggested_clearance_price: Math.round(item.retail_price * 0.7 * 100) / 100,
    potential_loss: Math.round((item.retail_price - item.purchase_price) * item.stock_quantity * 100) / 100
  }));
}

// ========================================
// F24: إدارة الشحنات الجزئية للموردين
// ========================================
export function recordPartialShipment(data: {
  po_id: string;
  supplier_name: string;
  shipment_number?: string;
  items: any[];
  received_quantity: number;
  notes?: string;
}): string {
  const id = `ps-${uuidv4().substring(0, 8)}`;
  const totalExpected = data.items.reduce((sum: number, item: any) => sum + (item.expected_quantity || 0), 0);
  const status = data.received_quantity >= totalExpected ? 'COMPLETE' : 'PARTIAL';

  db.prepare(`
    INSERT INTO partial_shipments (id, po_id, supplier_name, shipment_number, items_json, expected_quantity, received_quantity, shipment_status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.po_id, data.supplier_name, data.shipment_number || '', JSON.stringify(data.items), totalExpected, data.received_quantity, status, data.notes || '');

  return id;
}

// ========================================
// F25: مزامنة أسعار السوق المتقلبة
// ========================================
export function applyBulkPriceAdjustment(storeId: string, category: string, adjustmentPct: number, userId: string): { success: boolean; affected_items: number } {
  const items = db.prepare(`
    SELECT id, name, retail_price FROM items
    WHERE store_id = ? AND category = ? AND deleted_at IS NULL
  `).all(storeId, category) as any[];

  let affectedCount = 0;
  for (const item of items) {
    const newPrice = Math.round(item.retail_price * (1 + adjustmentPct / 100) * 100) / 100;
    if (newPrice > 0) {
      db.prepare('UPDATE items SET retail_price = ? WHERE id = ?').run(newPrice, item.id);
      affectedCount++;
    }
  }

  const logId = `mpa-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO market_price_adjustments (id, store_id, category, adjustment_pct, applied_items_count, applied_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(logId, storeId, category, adjustmentPct, affectedCount, userId);

  return { success: true, affected_items: affectedCount };
}
