import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db/database';
import { logAudit } from '../../services/audit.service';
import { WhatsAppService } from '../../services/whatsapp.service';
import {
  generateLiquidityForecast,
  getWalletLimitUsage,
  validateTransactionReference,
  reconcileStatement,
  reconcilePaymentTerminal,
  flagSuspiciousActivity,
  performTripleReconciliation,
  createShiftHandover,
  acceptShiftHandover,
  calculateCashVelocity,
  getWalletLineExpiryAlerts,
  getTopDestinationNumbers,
  calculateOpportunityCost,
  allocateCashDrawer,
  calculateGovernmentFees,
  logChangeLeakage,
  getChangeLeakageReport,
  recordMicroLedgerEntry,
  getCustomerMicroLedger,
  validateGeoFence,
  calculateToolROI,
  generateDigitalReceipt,
  calculateATMWithdrawalCost,
  calculateServiceProfitability,
  checkCashDrawerThreshold,
  monitorVoidTransactions,
  getWalletLineRegistry,
  logTransactionSpeed,
  getTransactionSpeedReport
} from './fintech-intelligence.service';

export const fintechIntelligenceRouter = Router();

// ========================================
// F1: التنبؤ بالعجز النقدي في المحافظ (Liquidity Forecasting)
// ========================================
fintechIntelligenceRouter.get('/liquidity-forecast', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const forecast = generateLiquidityForecast(store.id);
  res.json(forecast);
});

// ========================================
// F2: شريط استهلاك الليمت التفاعلي (Dynamic Limit Progress Bar)
// ========================================
fintechIntelligenceRouter.get('/wallet-limit-usage', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const usage = getWalletLimitUsage(store.id);
  res.json(usage);
});

// ========================================
// F3: منع السحب بدون كود المعاملة (Reference TxID Enforcement)
// ========================================
fintechIntelligenceRouter.post('/validate-reference', (req: Request, res: Response) => {
  const { transaction_id, reference_tx_id } = req.body;
  
  if (!transaction_id || !reference_tx_id) {
    return res.status(400).json({ error: 'transaction_id and reference_tx_id are required' });
  }

  const result = validateTransactionReference(transaction_id, reference_tx_id);
  if (result.valid) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// ========================================
// F4: المطابقة الآلية لكشوف الحساب (Instant Statement Reconciliation)
// ========================================
fintechIntelligenceRouter.post('/reconcile-statement', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { provider, entries } = req.body;
  
  if (!provider || !entries || !Array.isArray(entries)) {
    return res.status(400).json({ error: 'provider and entries array are required' });
  }

  const result = reconcileStatement(store.id, provider, entries);
  res.json(result);
});

// ========================================
// F5: جرد ماكينات الدفع الموحد
// ========================================
fintechIntelligenceRouter.post('/terminal-reconciliation', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { terminal_id, terminal_name, shift_id, opening_balance, closing_balance, expected_sales, actual_sales, commission_earned } = req.body;
  
  if (!terminal_id || !shift_id || actual_sales === undefined) {
    return res.status(400).json({ error: 'terminal_id, shift_id, and actual_sales are required' });
  }

  const id = reconcilePaymentTerminal({ store_id: store.id, terminal_id, terminal_name: terminal_name || '', shift_id, opening_balance: Number(opening_balance || 0), closing_balance: Number(closing_balance || 0), expected_sales: Number(expected_sales || 0), actual_sales: Number(actual_sales), commission_earned: Number(commission_earned || 0) });
  res.status(201).json({ success: true, id });
});

// ========================================
// F6: مؤشر العملاء ذوي العمليات المشبوهة (AML & Fraud Flag)
// ========================================
fintechIntelligenceRouter.post('/flag-suspicious', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { customer_phone, activity_type, transaction_ids, description } = req.body;
  
  if (!customer_phone || !activity_type) {
    return res.status(400).json({ error: 'customer_phone and activity_type are required' });
  }

  const id = flagSuspiciousActivity(store.id, customer_phone, activity_type, transaction_ids || [], description || '');
  logAudit({ action: 'FLAG_SUSPICIOUS', entityType: 'FINTECH', entityId: id, newValues: req.body, ipAddress: req.ip });
  res.status(201).json({ success: true, id });
});

// ========================================
// F7: إلزام الجرد الثلاثي لإغلاق الوردية
// ========================================
fintechIntelligenceRouter.post('/triple-reconciliation', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { shift_id, cash_drawer_balance, digital_wallet_balance, repair_devices_received } = req.body;
  
  if (!shift_id || cash_drawer_balance === undefined || digital_wallet_balance === undefined) {
    return res.status(400).json({ error: 'shift_id, cash_drawer_balance, and digital_wallet_balance are required' });
  }

  const id = performTripleReconciliation({ shift_id, store_id: store.id, cash_drawer_balance: Number(cash_drawer_balance), digital_wallet_balance: Number(digital_wallet_balance), repair_devices_received: Number(repair_devices_received || 0) });
  res.status(201).json({ success: true, id });
});

// ========================================
// F8: تقفيل الشفت المشروط بموافقة المستلم (Cascading Handover Acceptance)
// ========================================
fintechIntelligenceRouter.post('/shift-handover', (req: Request, res: Response) => {
  const { shift_id, handed_by_user_id, cash_variance, digital_variance, repair_variance } = req.body;
  
  if (!shift_id || !handed_by_user_id) {
    return res.status(400).json({ error: 'shift_id and handed_by_user_id are required' });
  }

  const id = createShiftHandover({ shift_id, handed_by_user_id, cash_variance: Number(cash_variance || 0), digital_variance: Number(digital_variance || 0), repair_variance: Number(repair_variance || 0) });
  res.status(201).json({ success: true, id });
});

fintechIntelligenceRouter.post('/shift-handover/accept', (req: Request, res: Response) => {
  const { handover_id, accepted_by_user_id } = req.body;
  
  if (!handover_id || !accepted_by_user_id) {
    return res.status(400).json({ error: 'handover_id and accepted_by_user_id are required' });
  }

  const result = acceptShiftHandover(handover_id, accepted_by_user_id);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// ========================================
// F9: حساب صافي عائد تدوير الجنيه (Cash Velocity Return)
// ========================================
fintechIntelligenceRouter.get('/cash-velocity/:wallet_id', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const velocity = calculateCashVelocity(store.id, String(req.params.wallet_id));
  
  if (velocity) {
    res.json(velocity);
  } else {
    res.status(404).json({ error: 'Wallet not found' });
  }
});

// ========================================
// F10: التنبيه باقتراب صلاحية خطوط المحافظ
// ========================================
fintechIntelligenceRouter.get('/wallet-line-expiry', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const alerts = getWalletLineExpiryAlerts(store.id);
  res.json({ count: alerts.length, alerts });
});

// ========================================
// F11: تحليل أكثر الأرقام تعاملاً (Top Destination Numbers)
// ========================================
fintechIntelligenceRouter.get('/top-destinations', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { limit } = req.query;
  const topNumbers = getTopDestinationNumbers(store.id, Number(limit) || 20);
  res.json(topNumbers);
});

// ========================================
// F12: حساب تكلفة الفرصة البديلة للنقدية
// ========================================
fintechIntelligenceRouter.get('/opportunity-cost', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const analysis = calculateOpportunityCost(store.id);
  res.json(analysis);
});

// ========================================
// F13: الفصل التام بين درج الصيانة ودرج التحويلات
// ========================================
fintechIntelligenceRouter.post('/allocate-drawer', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { drawer_type, amount } = req.body;
  
  if (!drawer_type || amount === undefined) {
    return res.status(400).json({ error: 'drawer_type and amount are required' });
  }

  const id = allocateCashDrawer(store.id, drawer_type, Number(amount));
  res.status(201).json({ success: true, id });
});

// ========================================
// F14: احتساب رسوم التحويل الحكومية تلقائياً
// ========================================
fintechIntelligenceRouter.post('/government-fees', (req: Request, res: Response) => {
  const { transaction_type, amount } = req.body;
  
  if (!transaction_type || amount === undefined) {
    return res.status(400).json({ error: 'transaction_type and amount are required' });
  }

  const result = calculateGovernmentFees(transaction_type, Number(amount));
  res.json(result);
});

// ========================================
// F15: مراقبة تسرب الفكة والكسور النقدية (Change Leakage Ledger)
// ========================================
fintechIntelligenceRouter.post('/change-leakage', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { shift_id, transaction_type, expected_change, actual_change_given } = req.body;
  
  if (!transaction_type || expected_change === undefined || actual_change_given === undefined) {
    return res.status(400).json({ error: 'transaction_type, expected_change, and actual_change_given are required' });
  }

  const id = logChangeLeakage({ store_id: store.id, shift_id, transaction_type, expected_change: Number(expected_change), actual_change_given: Number(actual_change_given) });
  res.status(201).json({ success: true, id });
});

fintechIntelligenceRouter.get('/change-leakage/report', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { days } = req.query;
  const report = getChangeLeakageReport(store.id, Number(days) || 30);
  res.json(report);
});

// ========================================
// F16: نظام القروض المصغرة للعملاء (Customer Micro-Ledger)
// ========================================
fintechIntelligenceRouter.post('/micro-ledger', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { customer_id, transaction_type, amount, description, related_sale_id } = req.body;
  
  if (!customer_id || !transaction_type || amount === undefined) {
    return res.status(400).json({ error: 'customer_id, transaction_type, and amount are required' });
  }

  const id = recordMicroLedgerEntry({ customer_id, store_id: store.id, transaction_type, amount: Number(amount), description, related_sale_id });
  res.status(201).json({ success: true, id });
});

fintechIntelligenceRouter.get('/micro-ledger/:customer_id', (req: Request, res: Response) => {
  const ledger = getCustomerMicroLedger(String(req.params.customer_id));
  res.json(ledger);
});

// ========================================
// F17: حظر إجراء المعاملات من خارج الفرع
// ========================================
fintechIntelligenceRouter.post('/validate-geo-fence', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { client_ip } = req.body;
  
  if (!client_ip) {
    return res.status(400).json({ error: 'client_ip is required' });
  }

  const result = validateGeoFence(store.id, client_ip);
  if (result.allowed) {
    res.json(result);
  } else {
    res.status(403).json(result);
  }
});

// ========================================
// F18: تتبع اشتراكات الدونجلات والبوكسات (Dongle ROI Tracker)
// ========================================
fintechIntelligenceRouter.get('/tool-roi', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const roi = calculateToolROI(store.id);
  res.json(roi);
});

// ========================================
// F19: توليد إيصال تحويل رقمي عبر واتساب
// ========================================
fintechIntelligenceRouter.post('/digital-receipt', (req: Request, res: Response) => {
  const { transaction_id, customer_phone } = req.body;
  
  if (!transaction_id || !customer_phone) {
    return res.status(400).json({ error: 'transaction_id and customer_phone are required' });
  }

  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const receiptId = generateDigitalReceipt(transaction_id, customer_phone);
  
  const transaction = db.prepare('SELECT * FROM fintech_transactions WHERE id = ?').get(transaction_id) as any;
  if (transaction) {
    const msg = `Transfer receipt: Amount: ${transaction.amount} EGP, Type: ${transaction.trans_type}, Reference: ${transaction.reference_tx_id}, Time: ${transaction.created_at}`;
    WhatsAppService.sendNotification(store.id, customer_phone, 'TRANSFER_RECEIPT' as any, msg);
    db.prepare('UPDATE digital_transfer_receipts SET whatsapp_status = "SENT", sent_at = datetime("now") WHERE id = ?').run(receiptId);
  }

  res.status(201).json({ success: true, receipt_id: receiptId });
});

// ========================================
// F20: حساب تكلفة السحب من الـ ATM
// ========================================
fintechIntelligenceRouter.post('/atm-withdrawal-cost', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { amount_withdrawn, atm_fee, transportation_cost, staff_time_minutes } = req.body;
  
  if (amount_withdrawn === undefined) {
    return res.status(400).json({ error: 'amount_withdrawn is required' });
  }

  const id = calculateATMWithdrawalCost({ store_id: store.id, amount_withdrawn: Number(amount_withdrawn), atm_fee: Number(atm_fee || 0), transportation_cost: Number(transportation_cost || 0), staff_time_minutes: Number(staff_time_minutes || 0) });
  res.status(201).json({ success: true, id });
});

// ========================================
// F21: مؤشر ربحية أنواع الخدمات (Service Profitability Breakdown)
// ========================================
fintechIntelligenceRouter.get('/service-profitability', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { period } = req.query;
  const periodMonth = period as string || new Date().toISOString().substring(0, 7);
  const profitability = calculateServiceProfitability(store.id, periodMonth);
  res.json(profitability);
});

// ========================================
// F22: سقف الرصيد النقدي في الدرج (Cash Drawer Threshold)
// ========================================
fintechIntelligenceRouter.post('/check-drawer-threshold', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { drawer_type, current_balance } = req.body;
  
  if (!drawer_type || current_balance === undefined) {
    return res.status(400).json({ error: 'drawer_type and current_balance are required' });
  }

  const result = checkCashDrawerThreshold(store.id, drawer_type, Number(current_balance));
  res.json(result);
});

// ========================================
// F23: كشف العمليات الوهمية الملغاة
// ========================================
fintechIntelligenceRouter.get('/void-transaction-monitor', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { hours } = req.query;
  const suspicious = monitorVoidTransactions(store.id, Number(hours) || 24);
  res.json(suspicious);
});

// ========================================
// F24: متابعة خطوط الكاش متعددة الأسماء
// ========================================
fintechIntelligenceRouter.get('/wallet-line-registry', (_req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const registry = getWalletLineRegistry(store.id);
  res.json(registry);
});

// ========================================
// F25: مؤشر زمن إنهاء عملية الكاش (Fintech Service Speed)
// ========================================
fintechIntelligenceRouter.post('/transaction-speed', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { cashier_user_id, transaction_type, start_time, end_time } = req.body;
  
  if (!cashier_user_id || !transaction_type || !start_time || !end_time) {
    return res.status(400).json({ error: 'cashier_user_id, transaction_type, start_time, and end_time are required' });
  }

  const id = logTransactionSpeed({ store_id: store.id, cashier_user_id, transaction_type, start_time, end_time });
  res.status(201).json({ success: true, id });
});

fintechIntelligenceRouter.get('/transaction-speed/report', (req: Request, res: Response) => {
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const { days } = req.query;
  const report = getTransactionSpeedReport(store.id, Number(days) || 30);
  res.json(report);
});
