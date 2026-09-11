import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db/database';
import { logAudit } from '../../services/audit.service';
import {
  calculateHoldingCosts,
  logLostSale,
  getFrequentLostSales,
  verifyIMEICheckout,
  generateUsedPhoneContract,
  checkCreditLimit,
  recordCreditTransaction,
  calculateSmartReorderPoints,
  getCrossSellSuggestions,
  createDraftOrder,
  getPendingDraftOrders,
  getBrandReturnReport,
  calculateHourlyFootfall,
  calculateQuantityDiscount,
  calculateSalespersonPerformance,
  suggestUpsell,
  getBatteryShelfLifeAlerts,
  createSpotCheck,
  calculateZonePerformance,
  checkDiscountAuthority,
  validateChargerCompatibility,
  calculateCustomerTrustScore,
  recordPromotionalGiveaway,
  getPromotionalGiveawayReport,
  checkMarginErosion,
  checkoutLoanerItem,
  checkinLoanerItem,
  generateClearanceSuggestions,
  recordPartialShipment,
  applyBulkPriceAdjustment
} from './retail-intelligence.service';

export const retailIntelligenceRouter = Router();

// ========================================
// F1: كاشف تكلفة ركود الرف (Holding Cost Calculator)
// ========================================
retailIntelligenceRouter.get('/holding-costs', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const report = calculateHoldingCosts(store.id);
  res.json(report);
});

// ========================================
// F2: سجل النواقص التلقائي التراكمي (Lost Sales Logger)
// ========================================
retailIntelligenceRouter.post('/lost-sales', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { item_name, item_category, customer_phone, customer_name } = req.body;
  
  if (!item_name) {
    return res.status(400).json({ error: 'item_name is required' });
  }

  const id = logLostSale({ store_id: store.id, item_name, item_category, customer_phone, customer_name });
  res.status(201).json({ success: true, id });
});

retailIntelligenceRouter.get('/lost-sales/frequent', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const lostSales = getFrequentLostSales(store.id);
  res.json(lostSales);
});

// ========================================
// F3: البيع الإجباري عبر التحقق المزدوج (IMEI-Enforced Checkout)
// ========================================
retailIntelligenceRouter.post('/imei-verify', (req: Request, res: Response) => {
  const { sale_id, item_id, imei } = req.body;
  
  if (!sale_id || !item_id || !imei) {
    return res.status(400).json({ error: 'sale_id, item_id, and imei are required' });
  }

  const result = verifyIMEICheckout(sale_id, item_id, imei, req.ip || '');
  
  if (result.verified) {
    res.json({ verified: true, message: 'IMEI verified. Checkout allowed.' });
  } else {
    res.status(400).json({ verified: false, error: result.error });
  }
});

// ========================================
// F4: عقد البيع المستعمل المؤتمت (Auto-Generated Used Phone Contract)
// ========================================
retailIntelligenceRouter.post('/used-phone-contract', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { sale_id, customer_id, customer_name, customer_phone, customer_id_number, device_brand, device_model, device_imei, device_condition, sale_price, warranty_days } = req.body;
  
  if (!customer_name || !customer_phone || !device_brand || !device_model || !device_imei || !sale_price) {
    return res.status(400).json({ error: 'customer_name, customer_phone, device_brand, device_model, device_imei, and sale_price are required' });
  }

  const contractId = generateUsedPhoneContract({
    store_id: store.id, sale_id, customer_id, customer_name, customer_phone, customer_id_number,
    device_brand, device_model, device_imei, device_condition, sale_price: Number(sale_price), warranty_days: warranty_days ? Number(warranty_days) : undefined
  });

  logAudit({ action: 'CREATE', entityType: 'USED_PHONE_CONTRACT', entityId: contractId, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, contract_id: contractId });
});

// ========================================
// F5: سقف الائتمان للآجل (Dynamic Credit Limit)
// ========================================
retailIntelligenceRouter.get('/credit-check/:customer_id', (req: Request, res: Response) => {
  const { amount } = req.query;
  const result = checkCreditLimit(String(req.params.customer_id), Number(amount) || 0);
  res.json(result);
});

retailIntelligenceRouter.post('/credit-transaction', (req: Request, res: Response) => {
  const { customer_id, sale_id, amount, transaction_type } = req.body;
  
  if (!customer_id || !amount || !transaction_type) {
    return res.status(400).json({ error: 'customer_id, amount, and transaction_type are required' });
  }

  const id = recordCreditTransaction(customer_id, sale_id || '', Number(amount), transaction_type);
  logAudit({ action: 'CREATE', entityType: 'CREDIT_TRANSACTION', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

// ========================================
// F6: إعادة الطلب الذكية متعددة المتغيرات (Smart Reorder Point)
// ========================================
retailIntelligenceRouter.get('/smart-reorder', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const reorderAnalysis = calculateSmartReorderPoints(store.id);
  const itemsNeedingReorder = reorderAnalysis.filter(item => item.needs_reorder);
  res.json({ total_analyzed: reorderAnalysis.length, items_needing_reorder: itemsNeedingReorder.length, items: itemsNeedingReorder });
});

// ========================================
// F7: كشف المنتجات التكميلية (Cross-Selling Engine)
// ========================================
retailIntelligenceRouter.get('/cross-sell/:device_model', (req: Request, res: Response) => {
  const suggestions = getCrossSellSuggestions(String(req.params.device_model));
  res.json(suggestions);
});

// ========================================
// F8: نظام سلة الطلب المعلقة (Draft Order Handover)
// ========================================
retailIntelligenceRouter.post('/draft-orders', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { salesperson_user_id, items } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' });
  }

  const id = createDraftOrder(store.id, salesperson_user_id || '', JSON.stringify(items));
  res.status(201).json({ success: true, id });
});

retailIntelligenceRouter.get('/draft-orders/pending', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const drafts = getPendingDraftOrders(store.id);
  res.json(drafts);
});

// ========================================
// F9: معدل استرجاع العلامات التجارية (Brand Failure Ratio)
// ========================================
retailIntelligenceRouter.get('/brand-return-report', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const report = getBrandReturnReport(store.id);
  res.json(report);
});

// ========================================
// F10: تحليل حركة المبيعات بالساعة (Hourly Sales Footfall)
// ========================================
retailIntelligenceRouter.get('/hourly-footfall', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { date } = req.query;
  const footfall = calculateHourlyFootfall(store.id, date as string);
  
  const peakHours = footfall.filter(h => h.is_peak);
  const totalRevenue = footfall.reduce((sum, h) => sum + h.total_revenue, 0);
  
  res.json({ date: date || new Date().toISOString().split('T')[0], peak_hours: peakHours, total_revenue: totalRevenue, hourly_data: footfall });
});

// ========================================
// F11: التسعير المرن بحسب حجم الشراء (Tiered Quantity Discounts)
// ========================================
retailIntelligenceRouter.post('/quantity-discount', (req: Request, res: Response) => {
  const { item_id, quantity } = req.body;
  
  if (!item_id || !quantity) {
    return res.status(400).json({ error: 'item_id and quantity are required' });
  }

  const result = calculateQuantityDiscount(item_id, Number(quantity));
  res.json(result);
});

// ========================================
// F12: سجل تتبع أداء البائعين (Salesperson Conversion Rate)
// ========================================
retailIntelligenceRouter.get('/salesperson-performance', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { period } = req.query;
  const periodMonth = period as string || new Date().toISOString().substring(0, 7);
  const performance = calculateSalespersonPerformance(store.id, periodMonth);
  res.json({ period: periodMonth, salespeople: performance });
});

// ========================================
// F13: تحويل مرتجعات الصيانة لمبيعات (Upselling Dead Devices)
// ========================================
retailIntelligenceRouter.get('/upsell-suggestion/:ticket_id', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const suggestion = suggestUpsell(store.id, String(req.params.ticket_id));
  
  if (suggestion) {
    res.json({ has_upsell: true, ...suggestion });
  } else {
    res.json({ has_upsell: false, message: 'No upsell opportunity for this ticket' });
  }
});

// ========================================
// F14: تتبع تواريخ انتهاء صلاحية البطاريات (Battery Shelf-Life Alert)
// ========================================
retailIntelligenceRouter.get('/battery-shelf-alerts', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const alerts = getBatteryShelfLifeAlerts(store.id);
  res.json({ count: alerts.length, items: alerts });
});

// ========================================
// F15: جرد الفئات السريع (Spot-Check Cycle Counting)
// ========================================
retailIntelligenceRouter.post('/spot-check', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { item_id, actual_quantity, counted_by_user_id, notes } = req.body;
  
  if (!item_id || actual_quantity === undefined) {
    return res.status(400).json({ error: 'item_id and actual_quantity are required' });
  }

  const id = createSpotCheck(store.id, item_id, counted_by_user_id || '', Number(actual_quantity));
  logAudit({ action: 'CREATE', entityType: 'SPOT_CHECK', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

// ========================================
// F16: حساب ربحية المتر المربع للواجهات
// ========================================
retailIntelligenceRouter.get('/zone-performance', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { period } = req.query;
  const periodMonth = period as string || new Date().toISOString().substring(0, 7);
  const performance = calculateZonePerformance(store.id, periodMonth);
  res.json(performance);
});

// ========================================
// F17: حماية التخفيضات (Discount Authority Matrix)
// ========================================
retailIntelligenceRouter.get('/discount-authority/:role', (req: Request, res: Response) => {
  const { discount_pct } = req.query;
  const result = checkDiscountAuthority(String(req.params.role), Number(discount_pct) || 0);
  res.json(result);
});

// ========================================
// F18: ربط الشواحن بمواصفات وات الهواتف
// ========================================
retailIntelligenceRouter.post('/charger-compatibility', (req: Request, res: Response) => {
  const { charger_item_id, device_model } = req.body;
  
  if (!charger_item_id || !device_model) {
    return res.status(400).json({ error: 'charger_item_id and device_model are required' });
  }

  const result = validateChargerCompatibility(charger_item_id, device_model);
  res.json(result);
});

// ========================================
// F19: تقييم العملاء الائتماني (Customer Trust Score)
// ========================================
retailIntelligenceRouter.get('/trust-score/:customer_id', (req: Request, res: Response) => {
  const score = calculateCustomerTrustScore(String(req.params.customer_id));
  if (score) {
    res.json(score);
  } else {
    res.status(404).json({ error: 'Customer not found' });
  }
});

// ========================================
// F20: حصر النثريات والهدايا الترويجية
// ========================================
retailIntelligenceRouter.post('/promotional-giveaway', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { sale_id, item_id, item_name, quantity, unit_cost, campaign_name, given_to_customer } = req.body;
  
  if (!item_name) {
    return res.status(400).json({ error: 'item_name is required' });
  }

  const id = recordPromotionalGiveaway({ store_id: store.id, sale_id, item_id, item_name, quantity, unit_cost, campaign_name, given_to_customer });
  logAudit({ action: 'CREATE', entityType: 'PROMOTIONAL_GIVEAWAY', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

retailIntelligenceRouter.get('/promotional-giveaway/report', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { days } = req.query;
  const report = getPromotionalGiveawayReport(store.id, Number(days) || 30);
  res.json(report);
});

// ========================================
// F21: مراقبة هامش الربح الحدي (Margin Erosion Alert)
// ========================================
retailIntelligenceRouter.get('/margin-alerts/:sale_id', (req: Request, res: Response) => {
  const alerts = checkMarginErosion(String(req.params.sale_id));
  res.json({ alerts_count: alerts.length, alerts });
});

// ========================================
// F22: تتبع البضاعة المعارة للتجربة
// ========================================
retailIntelligenceRouter.post('/loaner-checkout', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { item_id, customer_id, customer_name, customer_phone, deposit_amount, due_days } = req.body;
  
  if (!item_id || !customer_name || !customer_phone) {
    return res.status(400).json({ error: 'item_id, customer_name, and customer_phone are required' });
  }

  const id = checkoutLoanerItem({ store_id: store.id, item_id, customer_id, customer_name, customer_phone, deposit_amount, due_days });
  logAudit({ action: 'CREATE', entityType: 'LOANER_ITEM', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

retailIntelligenceRouter.post('/loaner-checkin', (req: Request, res: Response) => {
  const { loan_id } = req.body;
  
  if (!loan_id) {
    return res.status(400).json({ error: 'loan_id is required' });
  }

  const result = checkinLoanerItem(loan_id);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// ========================================
// F23: توليد عروض التصفية التلقائية
// ========================================
retailIntelligenceRouter.get('/clearance-suggestions', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const suggestions = generateClearanceSuggestions(store.id);
  res.json({ count: suggestions.length, items: suggestions });
});

// ========================================
// F24: إدارة الشحنات الجزئية للموردين
// ========================================
retailIntelligenceRouter.post('/partial-shipment', (req: Request, res: Response) => {
  const { po_id, supplier_name, shipment_number, items, received_quantity, notes } = req.body;
  
  if (!po_id || !supplier_name || !items || received_quantity === undefined) {
    return res.status(400).json({ error: 'po_id, supplier_name, items, and received_quantity are required' });
  }

  const id = recordPartialShipment({ po_id, supplier_name, shipment_number, items, received_quantity: Number(received_quantity), notes });
  logAudit({ action: 'CREATE', entityType: 'PARTIAL_SHIPMENT', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

// ========================================
// F25: مزامنة أسعار السوق المتقلبة
// ========================================
retailIntelligenceRouter.post('/bulk-price-adjustment', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { category, adjustment_pct } = req.body;
  
  if (!category || adjustment_pct === undefined) {
    return res.status(400).json({ error: 'category and adjustment_pct are required' });
  }

  const result = applyBulkPriceAdjustment(store.id, category, Number(adjustment_pct), req.ip || '');
  logAudit({ action: 'BULK_PRICE_ADJUSTMENT', entityType: 'ITEMS', entityId: store.id, newValues: { category, adjustment_pct, ...result }, ipAddress: req.ip });
  res.json(result);
});
