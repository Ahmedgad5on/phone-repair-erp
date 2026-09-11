import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db/database';
import { logAudit } from '../../services/audit.service';
import {
  createQualityMatrixEntry,
  getQualityMatrixForItem,
  addCrossModelCompatibility,
  findCompatibleModels,
  generateSecurityBarcode,
  validateSecurityBarcode,
  getWholesalePrice,
  updateVendorQualityScore,
  createTestingWindowRMA,
  completeTestingWindowRMA,
  trackBatch,
  findBatchByVendor,
  getRefurbishingSupplies,
  consumeRefurbishingSupply,
  holdItemForTech,
  releaseItemHold,
  addScrapMetalWeight,
  getScrapMetalSummary,
  checkMinimumOrder,
  logTransitDamage,
  createVendorCompensationClaim,
  createRarePartPreorder,
  getPendingPreorders,
  recordScreenPriceChange,
  getScreenPriceTrends,
  attachManufacturerDefectPhoto,
  logInspectionBreakage,
  getInspectorBreakageReport,
  logInternalRepairWaste,
  getInternalWasteReport,
  getScreenTechnicalComparison,
  getRevolvingCreditStatus,
  searchICComponents,
  addHarvestedPart,
  getHarvestInventory,
  getPairedComponentAlerts,
  calculateSeasonalConsumption,
  getFastenerTracking
} from './spare-parts-intelligence.service';

export const sparePartsIntelligenceRouter = Router();

// ========================================
// F1: مصفوفة الجودات المتعددة (Quality Matrix per SKU)
// ========================================
sparePartsIntelligenceRouter.post('/quality-matrix', (req: Request, res: Response) => {
  const { item_id, quality_grade, grade_label, purchase_price, wholesale_price, retail_price, bulk_price, warranty_days, supplier_name } = req.body;
  
  if (!item_id || !quality_grade || !grade_label || purchase_price === undefined || wholesale_price === undefined || retail_price === undefined) {
    return res.status(400).json({ error: 'item_id, quality_grade, grade_label, purchase_price, wholesale_price, and retail_price are required' });
  }

  const id = createQualityMatrixEntry({ item_id, quality_grade, grade_label, purchase_price: Number(purchase_price), wholesale_price: Number(wholesale_price), retail_price: Number(retail_price), bulk_price: bulk_price ? Number(bulk_price) : undefined, warranty_days: warranty_days ? Number(warranty_days) : undefined, supplier_name });
  res.status(201).json({ success: true, id });
});

sparePartsIntelligenceRouter.get('/quality-matrix/:item_id', (req: Request, res: Response) => {
  const matrix = getQualityMatrixForItem(String(req.params.item_id));
  res.json(matrix);
});

// ========================================
// F2: محرك التوافق التبادلي (Cross-Model Compatibility Engine)
// ========================================
sparePartsIntelligenceRouter.post('/cross-model-compatibility', (req: Request, res: Response) => {
  const { source_item_id, source_brand, source_model, target_brand, target_model, compatibility_notes } = req.body;
  
  if (!source_item_id || !source_brand || !source_model || !target_brand || !target_model) {
    return res.status(400).json({ error: 'source_item_id, source_brand, source_model, target_brand, and target_model are required' });
  }

  const id = addCrossModelCompatibility({ source_item_id, source_brand, source_model, target_brand, target_model, compatibility_notes });
  res.status(201).json({ success: true, id });
});

sparePartsIntelligenceRouter.get('/cross-model-compatibility/:brand/:model', (req: Request, res: Response) => {
  const compatible = findCompatibleModels(String(req.params.brand), String(req.params.model));
  res.json(compatible);
});

// ========================================
// F3: توليد باركود الحماية المضاد للغش (Security Tamper Barcode)
// ========================================
sparePartsIntelligenceRouter.post('/security-barcode/generate', (req: Request, res: Response) => {
  const { item_id, ticket_id } = req.body;
  
  if (!item_id) {
    return res.status(400).json({ error: 'item_id is required' });
  }

  const serialNumber = generateSecurityBarcode(item_id, ticket_id);
  res.status(201).json({ success: true, serial_number: serialNumber });
});

sparePartsIntelligenceRouter.get('/security-barcode/validate/:serial', (req: Request, res: Response) => {
  const result = validateSecurityBarcode(String(req.params.serial));
  res.json(result);
});

// ========================================
// F4: التسعير الطبقي الآلي (Multi-Tier Wholesale Rules)
// ========================================
sparePartsIntelligenceRouter.get('/wholesale-price/:item_id', (req: Request, res: Response) => {
  const { account_type, quantity } = req.query;
  const result = getWholesalePrice(String(req.params.item_id), (account_type as string) || 'TECH', Number(quantity) || 1);
  res.json(result);
});

// ========================================
// F5: مؤشر جودة الموردين (Vendor Defect Rating)
// ========================================
sparePartsIntelligenceRouter.post('/vendor-quality/update', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { vendor_name, has_defect, defect_value } = req.body;
  
  if (!vendor_name) {
    return res.status(400).json({ error: 'vendor_name is required' });
  }

  updateVendorQualityScore(vendor_name, store.id, !!has_defect, Number(defect_value || 0));
  res.json({ success: true });
});

sparePartsIntelligenceRouter.get('/vendor-quality/report', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const report = db.prepare('SELECT * FROM vendor_quality_scores WHERE store_id = ? ORDER BY defect_rate_pct DESC').all(store.id);
  res.json(report);
});

// ========================================
// F6: إدارة مرحلة اختبار الفنيين (Testing Window RMA)
// ========================================
sparePartsIntelligenceRouter.post('/testing-window/create', (req: Request, res: Response) => {
  const { item_id, ticket_id, tech_user_id, testing_window_hours } = req.body;
  
  if (!item_id || !tech_user_id) {
    return res.status(400).json({ error: 'item_id and tech_user_id are required' });
  }

  const id = createTestingWindowRMA({ item_id, ticket_id, tech_user_id, testing_window_hours: testing_window_hours ? Number(testing_window_hours) : undefined });
  res.status(201).json({ success: true, id });
});

sparePartsIntelligenceRouter.post('/testing-window/complete', (req: Request, res: Response) => {
  const { rma_id, seal_intact, no_soldering_detected, notes } = req.body;
  
  if (!rma_id) {
    return res.status(400).json({ error: 'rma_id is required' });
  }

  const status = completeTestingWindowRMA(rma_id, !!seal_intact, !!no_soldering_detected, notes);
  res.json({ success: true, rma_status: status });
});

// ========================================
// F7: كشف مطابقة الباتش للموردين
// ========================================
sparePartsIntelligenceRouter.post('/batch-tracking', (req: Request, res: Response) => {
  const { item_id, batch_number, vendor_name, purchase_order_id, quantity_received, warranty_batch_expiry } = req.body;
  
  if (!item_id || !batch_number || !vendor_name || quantity_received === undefined) {
    return res.status(400).json({ error: 'item_id, batch_number, vendor_name, and quantity_received are required' });
  }

  const id = trackBatch({ item_id, batch_number, vendor_name, purchase_order_id, quantity_received: Number(quantity_received), warranty_batch_expiry });
  res.status(201).json({ success: true, id });
});

sparePartsIntelligenceRouter.get('/batch-tracking/vendor/:vendor_name', (req: Request, res: Response) => {
  const batches = findBatchByVendor(String(req.params.vendor_name));
  res.json(batches);
});

// ========================================
// F8: إدارة مخزون الباغات والتجديد (Refurbishing Supply Ledger)
// ========================================
sparePartsIntelligenceRouter.get('/refurbishing-supplies', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const supplies = getRefurbishingSupplies(store.id);
  res.json(supplies);
});

sparePartsIntelligenceRouter.post('/refurbishing-supplies/consume', (req: Request, res: Response) => {
  const { supply_id, quantity } = req.body;
  
  if (!supply_id || quantity === undefined) {
    return res.status(400).json({ error: 'supply_id and quantity are required' });
  }

  consumeRefurbishingSupply(supply_id, Number(quantity));
  res.json({ success: true });
});

// ========================================
// F9: حجز القطع المؤقت لمهندسي الصيانة
// ========================================
sparePartsIntelligenceRouter.post('/item-hold', (req: Request, res: Response) => {
  const { item_id, tech_user_id, ticket_id, hold_minutes } = req.body;
  
  if (!item_id || !tech_user_id) {
    return res.status(400).json({ error: 'item_id and tech_user_id are required' });
  }

  const id = holdItemForTech(item_id, tech_user_id, ticket_id, hold_minutes ? Number(hold_minutes) : undefined);
  res.status(201).json({ success: true, id });
});

sparePartsIntelligenceRouter.post('/item-hold/release', (req: Request, res: Response) => {
  const { hold_id } = req.body;
  
  if (!hold_id) {
    return res.status(400).json({ error: 'hold_id is required' });
  }

  releaseItemHold(hold_id);
  res.json({ success: true });
});

// ========================================
// F10: حساب أرباح وزن السكراب النحاسي والذهب
// ========================================
sparePartsIntelligenceRouter.post('/scrap-metal', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { metal_type, weight_grams, purity_pct, market_price_per_gram, boarded_ticket_ids } = req.body;
  
  if (!metal_type || weight_grams === undefined || purity_pct === undefined || market_price_per_gram === undefined) {
    return res.status(400).json({ error: 'metal_type, weight_grams, purity_pct, and market_price_per_gram are required' });
  }

  const id = addScrapMetalWeight({ store_id: store.id, metal_type, weight_grams: Number(weight_grams), purity_pct: Number(purity_pct), market_price_per_gram: Number(market_price_per_gram), boarded_ticket_ids });
  res.status(201).json({ success: true, id });
});

sparePartsIntelligenceRouter.get('/scrap-metal/summary', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const summary = getScrapMetalSummary(store.id);
  res.json(summary);
});

// ========================================
// F11: حد التوريد الأدنى لورش الصيانة
// ========================================
sparePartsIntelligenceRouter.post('/minimum-order/check', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { customer_type, order_amount, order_items } = req.body;
  
  if (!customer_type || order_amount === undefined || order_items === undefined) {
    return res.status(400).json({ error: 'customer_type, order_amount, and order_items are required' });
  }

  const result = checkMinimumOrder(store.id, customer_type, Number(order_amount), Number(order_items));
  res.json(result);
});

// ========================================
// F12: تتبع القطع سريعة التلف أثناء النقل
// ========================================
sparePartsIntelligenceRouter.post('/transit-damage', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { item_id, delivery_method, driver_name, damage_description, damage_photo_url, estimated_loss } = req.body;
  
  if (!item_id || !delivery_method || !driver_name || !damage_description) {
    return res.status(400).json({ error: 'item_id, delivery_method, driver_name, and damage_description are required' });
  }

  const id = logTransitDamage({ store_id: store.id, item_id, delivery_method, driver_name, damage_description, damage_photo_url, estimated_loss: Number(estimated_loss || 0) });
  logAudit({ action: 'CREATE', entityType: 'TRANSIT_DAMAGE', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

// ========================================
// F13: حساب تعويضات فحص القطع التالفة
// ========================================
sparePartsIntelligenceRouter.post('/vendor-compensation', (req: Request, res: Response) => {
  const { vendor_name, batch_id, total_items_claimed, total_defect_value, compensation_amount, notes } = req.body;
  
  if (!vendor_name || total_items_claimed === undefined || total_defect_value === undefined || compensation_amount === undefined) {
    return res.status(400).json({ error: 'vendor_name, total_items_claimed, total_defect_value, and compensation_amount are required' });
  }

  const id = createVendorCompensationClaim({ vendor_name, batch_id, total_items_claimed: Number(total_items_claimed), total_defect_value: Number(total_defect_value), compensation_amount: Number(compensation_amount), notes });
  res.status(201).json({ success: true, id });
});

// ========================================
// F14: جدولة طلبات القطع النادرة (Rare Parts Pre-Order)
// ========================================
sparePartsIntelligenceRouter.post('/rare-parts/preorder', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { customer_id, customer_name, customer_phone, item_description, device_brand, device_model, estimated_price, deposit_amount } = req.body;
  
  if (!customer_name || !customer_phone || !item_description || estimated_price === undefined) {
    return res.status(400).json({ error: 'customer_name, customer_phone, item_description, and estimated_price are required' });
  }

  const id = createRarePartPreorder({ store_id: store.id, customer_id, customer_name, customer_phone, item_description, device_brand, device_model, estimated_price: Number(estimated_price), deposit_amount: Number(deposit_amount || 0) });
  res.status(201).json({ success: true, id });
});

sparePartsIntelligenceRouter.get('/rare-parts/preorders/pending', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const preorders = getPendingPreorders(store.id);
  res.json(preorders);
});

// ========================================
// F15: مؤشر تغير أسعار شاشات الفئات العليا
// ========================================
sparePartsIntelligenceRouter.get('/screen-price-trends/:item_id', (req: Request, res: Response) => {
  const trends = getScreenPriceTrends(String(req.params.item_id));
  res.json(trends);
});

// ========================================
// F16: إلزام إرفاق صورة العيب المصنعي
// ========================================
sparePartsIntelligenceRouter.post('/manufacturer-defect-photo', (req: Request, res: Response) => {
  const { rma_ticket_id, photo_url, defect_type, description } = req.body;
  
  if (!rma_ticket_id || !photo_url || !defect_type) {
    return res.status(400).json({ error: 'rma_ticket_id, photo_url, and defect_type are required' });
  }

  const id = attachManufacturerDefectPhoto(rma_ticket_id, photo_url, defect_type, description);
  res.status(201).json({ success: true, id });
});

// ========================================
// F17: حساب نسبة كسر الباغات بالفحص
// ========================================
sparePartsIntelligenceRouter.post('/inspection-breakage', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { inspector_user_id, item_id, breakage_type, breakage_description, estimated_cost } = req.body;
  
  if (!inspector_user_id || !breakage_type || !breakage_description) {
    return res.status(400).json({ error: 'inspector_user_id, breakage_type, and breakage_description are required' });
  }

  const id = logInspectionBreakage({ store_id: store.id, inspector_user_id, item_id, breakage_type, breakage_description, estimated_cost: Number(estimated_cost || 0) });
  res.status(201).json({ success: true, id });
});

sparePartsIntelligenceRouter.get('/inspection-breakage/report', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { days } = req.query;
  const report = getInspectorBreakageReport(store.id, Number(days) || 30);
  res.json(report);
});

// ========================================
// F18: تسجيل هوالك الصيانة الداخلية
// ========================================
sparePartsIntelligenceRouter.post('/internal-waste', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { ticket_id, technician_id, item_id, damage_description, estimated_cost, fault_category } = req.body;
  
  if (!technician_id || !damage_description) {
    return res.status(400).json({ error: 'technician_id and damage_description are required' });
  }

  const id = logInternalRepairWaste({ store_id: store.id, ticket_id, technician_id, item_id, damage_description, estimated_cost: Number(estimated_cost || 0), fault_category });
  res.status(201).json({ success: true, id });
});

sparePartsIntelligenceRouter.get('/internal-waste/report', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { days } = req.query;
  const report = getInternalWasteReport(store.id, Number(days) || 30);
  res.json(report);
});

// ========================================
// F19: لوحة المقارنة التقنية للشاشات
// ========================================
sparePartsIntelligenceRouter.post('/screen-comparison', (req: Request, res: Response) => {
  const { item_ids } = req.body;
  
  if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
    return res.status(400).json({ error: 'item_ids array is required' });
  }

  const comparison = getScreenTechnicalComparison(item_ids);
  res.json(comparison);
});

// ========================================
// F20: إدارة خطوط الائتمان الدوارة لمراكز الصيانة
// ========================================
sparePartsIntelligenceRouter.get('/revolving-credit/:customer_id', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const status = getRevolvingCreditStatus(String(req.params.customer_id), store.id);
  
  if (status) {
    res.json(status);
  } else {
    res.status(404).json({ error: 'No revolving credit account found' });
  }
});

// ========================================
// F21: تكويد الآيسيهات والدوائر الدقيقة (IC & Component Indexing)
// ========================================
sparePartsIntelligenceRouter.get('/ic-components/search', (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Search query is required' });
  
  const results = searchICComponents(q as string);
  res.json(results);
});

// ========================================
// F22: جرد مخزن الخلع المنفصل
// ========================================
sparePartsIntelligenceRouter.post('/harvest-inventory', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { item_id, donor_device_brand, donor_device_model, donor_imei, condition_grade } = req.body;
  
  if (!item_id || !donor_device_brand || !donor_device_model) {
    return res.status(400).json({ error: 'item_id, donor_device_brand, and donor_device_model are required' });
  }

  const id = addHarvestedPart({ store_id: store.id, item_id, donor_device_brand, donor_device_model, donor_imei, condition_grade });
  res.status(201).json({ success: true, id });
});

sparePartsIntelligenceRouter.get('/harvest-inventory', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const inventory = getHarvestInventory(store.id);
  res.json(inventory);
});

// ========================================
// F23: تنبيه نقص القطع المرتبطة (Paired Components Alert)
// ========================================
sparePartsIntelligenceRouter.get('/paired-component-alerts', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const alerts = getPairedComponentAlerts(store.id);
  res.json(alerts);
});

// ========================================
// F24: معدل استهلاك البطاريات الموسمي
// ========================================
sparePartsIntelligenceRouter.get('/seasonal-consumption/:category', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const stats = calculateSeasonalConsumption(store.id, String(req.params.category));
  res.json(stats);
});

// ========================================
// F25: تتبع حركة مسامير وشاسيهات التثبيت
// ========================================
sparePartsIntelligenceRouter.get('/fastener-tracking', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const tracking = getFastenerTracking(store.id);
  res.json(tracking);
});
