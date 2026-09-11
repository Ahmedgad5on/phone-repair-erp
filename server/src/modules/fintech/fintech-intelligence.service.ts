import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';

// ========================================
// F1: التنبؤ بالعجز النقدي في المحافظ (Liquidity Forecasting)
// ========================================
export function generateLiquidityForecast(storeId: string): any {
  const wallets = db.prepare('SELECT * FROM fintech_wallets WHERE store_id = ? AND deleted_at IS NULL').all(storeId) as any[];
  const totalBalance = wallets.reduce((sum: number, w: any) => sum + (w.current_balance || 0), 0);

  const avgDailySales = (db.prepare(`
    SELECT AVG(daily_total) as avg_sales FROM (
      SELECT DATE(created_at) as day, SUM(total) as daily_total
      FROM sales WHERE store_id = ? AND created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
    )
  `).get(storeId) as any)?.avg_sales || 0;

  const avgDailyExpenses = (db.prepare(`
    SELECT AVG(daily_total) as avg_expenses FROM (
      SELECT DATE(created_at) as day, SUM(amount) as daily_total
      FROM expenses WHERE store_id = ? AND created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
    )
  `).get(storeId) as any)?.avg_expenses || 0;

  const netDailyFlow = avgDailySales - avgDailyExpenses;
  const daysUntilDeficit = netDailyFlow > 0 ? Math.floor(totalBalance / netDailyFlow) : 0;

  const forecast = {
    current_balance: totalBalance,
    avg_daily_sales: Math.round(avgDailySales),
    avg_daily_expenses: Math.round(avgDailyExpenses),
    net_daily_flow: Math.round(netDailyFlow),
    days_until_deficit: daysUntilDeficit,
    alert_level: daysUntilDeficit <= 3 ? 'CRITICAL' : daysUntilDeficit <= 7 ? 'WARNING' : 'NORMAL'
  };

  const id = `lf-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO liquidity_forecasts (id, store_id, forecast_date, projected_balance, alert_level)
    VALUES (?, ?, date('now'), ?, ?)
  `).run(id, storeId, totalBalance, forecast.alert_level);

  return forecast;
}

// ========================================
// F2: شريط استهلاك الليمت التفاعلي (Dynamic Limit Progress Bar)
// ========================================
export function getWalletLimitUsage(storeId: string): any[] {
  const wallets = db.prepare('SELECT * FROM fintech_wallets WHERE store_id = ? AND deleted_at IS NULL').all(storeId) as any[];

  return wallets.map(wallet => {
    const dailyPct = wallet.daily_limit > 0 ? (wallet.daily_usage / wallet.daily_limit) * 100 : 0;
    const monthlyPct = wallet.monthly_limit > 0 ? (wallet.monthly_usage / wallet.monthly_limit) * 100 : 0;
    const isLocked = dailyPct >= 95 || monthlyPct >= 95;

    if (isLocked && !wallet.is_locked) {
      db.prepare('UPDATE fintech_wallets SET is_locked = 1 WHERE id = ?').run(wallet.id);
    }

    return {
      wallet_id: wallet.id,
      provider_name: wallet.provider_name,
      daily_usage: wallet.daily_usage,
      daily_limit: wallet.daily_limit,
      daily_pct: Math.round(dailyPct * 10) / 10,
      monthly_usage: wallet.monthly_usage,
      monthly_limit: wallet.monthly_limit,
      monthly_pct: Math.round(monthlyPct * 10) / 10,
      is_locked: isLocked,
      status: dailyPct >= 95 ? 'LOCKED' : dailyPct >= 80 ? 'WARNING' : 'OK'
    };
  });
}

// ========================================
// F3: منع السحب بدون كود المعاملة (Reference TxID Enforcement)
// ========================================
export function validateTransactionReference(transactionId: string, referenceTxId: string): { valid: boolean; message: string } {
  if (!referenceTxId || referenceTxId.length < 6) {
    return { valid: false, message: 'Reference TxID is required and must be at least 6 characters' };
  }

  const id = `trl-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO transaction_reference_log (id, transaction_id, reference_tx_id, verified, verified_at)
    VALUES (?, ?, ?, 1, datetime('now'))
  `).run(id, transactionId, referenceTxId);

  return { valid: true, message: 'Transaction reference verified' };
}

// ========================================
// F4: المطابقة الآلية لكشوف الحساب (Instant Statement Reconciliation)
// ========================================
export function reconcileStatement(storeId: string, provider: string, entries: any[]): any {
  const reconciliationId = `sr-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO statement_reconciliation (id, store_id, provider, statement_date, total_entries)
    VALUES (?, ?, ?, date('now'), ?)
  `).run(reconciliationId, storeId, provider, entries.length);

  let matchedCount = 0;
  for (const entry of entries) {
    const matched = db.prepare(`
      SELECT id FROM fintech_transactions 
      WHERE store_id = ? AND reference_tx_id = ? AND ABS(amount - ?) < 0.01
      LIMIT 1
    `).get(storeId, entry.reference, entry.amount) as any;

    const entryId = `se-${uuidv4().substring(0, 8)}`;
    db.prepare(`
      INSERT INTO statement_entries (id, reconciliation_id, entry_date, reference, description, amount, matched_transaction_id, match_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entryId, reconciliationId, entry.date || '', entry.reference || '', entry.description || '', entry.amount, matched?.id || null, matched ? 'MATCHED' : 'UNMATCHED');

    if (matched) matchedCount++;
  }

  const matchRate = entries.length > 0 ? (matchedCount / entries.length) * 100 : 0;
  db.prepare('UPDATE statement_reconciliation SET matched_entries = ?, unmatched_entries = ?, match_rate_pct = ?, reconciliation_status = ? WHERE id = ?').run(matchedCount, entries.length - matchedCount, Math.round(matchRate * 100) / 100, 'COMPLETED', reconciliationId);

  return { reconciliation_id: reconciliationId, total_entries: entries.length, matched: matchedCount, unmatched: entries.length - matchedCount, match_rate: Math.round(matchRate * 100) / 100 };
}

// ========================================
// F5: جرد ماكينات الدفع الموحد
// ========================================
export function reconcilePaymentTerminal(data: {
  store_id: string;
  terminal_id: string;
  terminal_name: string;
  shift_id: string;
  opening_balance: number;
  closing_balance: number;
  expected_sales: number;
  actual_sales: number;
  commission_earned: number;
}): string {
  const id = `ptr-${uuidv4().substring(0, 8)}`;
  const variance = data.actual_sales - data.expected_sales;

  db.prepare(`
    INSERT INTO payment_terminal_reconciliation (id, store_id, terminal_id, terminal_name, shift_id, opening_balance, closing_balance, expected_sales, actual_sales, variance, commission_earned, reconciliation_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.terminal_id, data.terminal_name, data.shift_id, data.opening_balance, data.closing_balance, data.expected_sales, data.actual_sales, variance, data.commission_earned, Math.abs(variance) < 1 ? 'BALANCED' : 'VARIANCE');

  return id;
}

// ========================================
// F6: مؤشر العملاء ذوي العمليات المشبوهة (AML & Fraud Flag)
// ========================================
export function flagSuspiciousActivity(storeId: string, customerPhone: string, activityType: string, transactionIds: string[], description: string): string {
  const recentTxCount = (db.prepare(`
    SELECT COUNT(*) as count FROM fintech_transactions 
    WHERE sender_receiver_phone = ? AND store_id = ? AND created_at >= datetime('now', '-1 hour')
  `).get(customerPhone, storeId) as any)?.count || 0;

  let riskScore = 0;
  if (recentTxCount >= 5) riskScore += 50;
  if (recentTxCount >= 3) riskScore += 25;

  const id = `sal-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO suspicious_activity_log (id, store_id, customer_phone, activity_type, risk_score, transaction_ids, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, storeId, customerPhone, activityType, riskScore, transactionIds.join(','), description);

  return id;
}

// ========================================
// F7: إلزام الجرد الثلاثي لإغلاق الوردية
// ========================================
export function performTripleReconciliation(data: {
  shift_id: string;
  store_id: string;
  cash_drawer_balance: number;
  digital_wallet_balance: number;
  repair_devices_received: number;
}): string {
  const id = `tr-${uuidv4().substring(0, 8)}`;

  const shift = db.prepare('SELECT opening_cash FROM shifts WHERE id = ?').get(data.shift_id) as any;
  const openingCash = shift?.opening_cash || 0;

  const salesTotal = (db.prepare('SELECT SUM(total) as total FROM sales WHERE shift_id = ? AND status != "VOID"').get(data.shift_id) as any)?.total || 0;
  const expectedCash = openingCash + salesTotal;

  const totalExpected = expectedCash + data.digital_wallet_balance;
  const totalActual = data.cash_drawer_balance + data.digital_wallet_balance;
  const variance = totalActual - totalExpected;

  db.prepare(`
    INSERT INTO triple_reconciliation (id, shift_id, store_id, cash_drawer_balance, digital_wallet_balance, repair_devices_received, total_expected, total_actual, variance, reconciliation_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.shift_id, data.store_id, data.cash_drawer_balance, data.digital_wallet_balance, data.repair_devices_received, totalExpected, totalActual, variance, Math.abs(variance) < 1 ? 'BALANCED' : 'VARIANCE');

  return id;
}

// ========================================
// F8: تقفيل الشفت المشروط بموافقة المستلم (Cascading Handover Acceptance)
// ========================================
export function createShiftHandover(data: {
  shift_id: string;
  handed_by_user_id: string;
  cash_variance: number;
  digital_variance: number;
  repair_variance: number;
}): string {
  const id = `shl-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO shift_handover_log (id, shift_id, handed_by_user_id, handover_status, cash_variance, digital_variance, repair_variance)
    VALUES (?, ?, ?, 'PENDING', ?, ?, ?)
  `).run(id, data.shift_id, data.handed_by_user_id, data.cash_variance, data.digital_variance, data.repair_variance);

  return id;
}

export function acceptShiftHandover(handoverId: string, acceptedByUserId: string): { success: boolean; message: string } {
  const handover = db.prepare('SELECT * FROM shift_handover_log WHERE id = ?').get(handoverId) as any;
  if (!handover) return { success: false, message: 'Handover not found' };

  if (handover.cash_variance < 0) {
    db.prepare('UPDATE users SET commission_rate = commission_rate - 0.01 WHERE id = ?').run(handover.handed_by_user_id);
  }

  db.prepare('UPDATE shift_handover_log SET accepted_by_user_id = ?, handover_status = "ACCEPTED", accepted_at = datetime("now") WHERE id = ?').run(acceptedByUserId, handoverId);

  return { success: true, message: 'Handover accepted successfully' };
}

// ========================================
// F9: حساب صافي عائد تدوير الجنيه (Cash Velocity Return)
// ========================================
export function calculateCashVelocity(storeId: string, walletId: string): any {
  const wallet = db.prepare('SELECT * FROM fintech_wallets WHERE id = ?').get(walletId) as any;
  if (!wallet) return null;

  const weeklyStats = db.prepare(`
    SELECT COUNT(*) as total_transactions, SUM(amount) as total_volume, SUM(commission) as total_commissions
    FROM fintech_transactions
    WHERE wallet_id = ? AND store_id = ? AND created_at >= datetime('now', '-7 days')
  `).get(walletId, storeId) as any;

  const velocityRatio = wallet.current_balance > 0 ? (weeklyStats.total_volume || 0) / wallet.current_balance : 0;

  return {
    wallet_id: walletId,
    current_balance: wallet.current_balance,
    weekly_transactions: weeklyStats.total_transactions || 0,
    weekly_volume: weeklyStats.total_volume || 0,
    weekly_commissions: weeklyStats.total_commissions || 0,
    velocity_ratio: Math.round(velocityRatio * 100) / 100,
    annual_projected_commissions: Math.round((weeklyStats.total_commissions || 0) * 52)
  };
}

// ========================================
// F10: التنبيه باقتراب صلاحية خطوط المحافظ
// ========================================
export function getWalletLineExpiryAlerts(storeId: string): any[] {
  return db.prepare(`
    SELECT wle.*, fw.provider_name, fw.current_balance
    FROM wallet_line_expiry wle
    JOIN fintech_wallets fw ON wle.wallet_id = fw.id
    WHERE fw.store_id = ? AND wle.status = 'ACTIVE'
    ORDER BY wle.days_until_expiry ASC
  `).all(storeId);
}

// ========================================
// F11: تحليل أكثر الأرقام تعاملاً (Top Destination Numbers)
// ========================================
export function getTopDestinationNumbers(storeId: string, limit: number = 20): any[] {
  return db.prepare(`
    SELECT 
      sender_receiver_phone,
      COUNT(*) as transaction_count,
      SUM(amount) as total_volume,
      ROUND(AVG(amount), 2) as avg_transaction,
      MAX(created_at) as last_transaction_date
    FROM fintech_transactions
    WHERE store_id = ? AND created_at >= datetime('now', '-90 days')
    GROUP BY sender_receiver_phone
    ORDER BY transaction_count DESC
    LIMIT ?
  `).all(storeId, limit);
}

// ========================================
// F12: حساب تكلفة الفرصة البديلة للنقدية
// ========================================
export function calculateOpportunityCost(storeId: string): any {
  const wallets = db.prepare('SELECT SUM(current_balance) as total FROM fintech_wallets WHERE store_id = ? AND deleted_at IS NULL').get(storeId) as any;
  const inventory = db.prepare('SELECT SUM(stock_quantity * purchase_price) as total FROM items WHERE store_id = ? AND deleted_at IS NULL').get(storeId) as any;

  const cashInWallets = wallets?.total || 0;
  const cashInInventory = inventory?.total || 0;

  const avgCommissionRate = 0.02;
  const walletWeeklyReturn = cashInWallets * avgCommissionRate;
  const inventoryTurnoverDays = 30;
  const inventoryWeeklyReturn = (cashInInventory / inventoryTurnoverDays) * 7 * 0.15;

  return {
    cash_in_wallets: cashInWallets,
    cash_in_inventory: cashInInventory,
    wallet_weekly_return: Math.round(walletWeeklyReturn),
    inventory_weekly_return: Math.round(inventoryWeeklyReturn),
    best_allocation: walletWeeklyReturn > inventoryWeeklyReturn ? 'WALLETS' : 'INVENTORY',
    recommendation: walletWeeklyReturn > inventoryWeeklyReturn
      ? `Moving ${Math.round(cashInWallets * 0.1)} EGP from inventory to wallets could yield ${Math.round(cashInWallets * 0.1 * avgCommissionRate)} EGP weekly`
      : `Moving ${Math.round(cashInInventory * 0.05)} EGP from wallets to inventory could yield ${Math.round(cashInInventory * 0.05 * 0.15 / 30 * 7)} EGP weekly`
  };
}

// ========================================
// F13: الفصل التام بين درج الصيانة ودرج التحويلات
// ========================================
export function allocateCashDrawer(storeId: string, drawerType: string, amount: number): string {
  const id = `cda-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO cash_drawer_allocation (id, store_id, drawer_type, allocated_amount, current_balance)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, storeId, drawerType, amount, amount);

  return id;
}

// ========================================
// F14: احتساب رسوم التحويل الحكومية تلقائياً
// ========================================
export function calculateGovernmentFees(transactionType: string, amount: number): { fees: number; netAmount: number } {
  const rules = db.prepare('SELECT * FROM government_fee_rules WHERE transaction_type = ? AND is_active = 1').all(transactionType) as any[];

  let totalFees = 0;
  for (const rule of rules) {
    let fee = (amount * rule.rate_pct / 100) + rule.fixed_amount;
    fee = Math.max(rule.min_amount, Math.min(rule.max_amount || fee, fee));
    totalFees += fee;
  }

  return { fees: Math.round(totalFees * 100) / 100, netAmount: Math.round((amount - totalFees) * 100) / 100 };
}

// ========================================
// F15: مراقبة تسرب الفكة والكسور النقدية (Change Leakage Ledger)
// ========================================
export function logChangeLeakage(data: {
  store_id: string;
  shift_id?: string;
  transaction_type: string;
  expected_change: number;
  actual_change_given: number;
}): string {
  const id = `cll-${uuidv4().substring(0, 8)}`;
  const leakage = data.actual_change_given - data.expected_change;

  db.prepare(`
    INSERT INTO change_leakage_log (id, store_id, shift_id, transaction_type, expected_change, actual_change_given, leakage_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.shift_id || null, data.transaction_type, data.expected_change, data.actual_change_given, leakage);

  return id;
}

export function getChangeLeakageReport(storeId: string, days: number = 30): any {
  const total = db.prepare(`
    SELECT SUM(leakage_amount) as total_leakage, COUNT(*) as total_incidents
    FROM change_leakage_log
    WHERE store_id = ? AND recorded_at >= datetime('now', ?)
  `).get(storeId, `-${days} days`) as any;

  return { total_leakage: total?.total_leakage || 0, total_incidents: total?.total_incidents || 0 };
}

// ========================================
// F16: نظام القروض المصغرة للعملاء (Customer Micro-Ledger)
// ========================================
export function recordMicroLedgerEntry(data: {
  customer_id: string;
  store_id: string;
  transaction_type: string;
  amount: number;
  description?: string;
  related_sale_id?: string;
}): string {
  const id = `cml-${uuidv4().substring(0, 8)}`;
  const lastBalance = (db.prepare('SELECT running_balance FROM customer_micro_ledger WHERE customer_id = ? ORDER BY recorded_at DESC LIMIT 1').get(data.customer_id) as any)?.running_balance || 0;
  const newBalance = data.transaction_type === 'CREDIT' ? lastBalance + data.amount : lastBalance - data.amount;

  db.prepare(`
    INSERT INTO customer_micro_ledger (id, customer_id, store_id, transaction_type, amount, running_balance, description, related_sale_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.customer_id, data.store_id, data.transaction_type, data.amount, newBalance, data.description || '', data.related_sale_id || null);

  return id;
}

export function getCustomerMicroLedger(customerId: string): any[] {
  return db.prepare('SELECT * FROM customer_micro_ledger WHERE customer_id = ? ORDER BY recorded_at ASC').all(customerId);
}

// ========================================
// F17: حظر إجراء المعاملات من خارج الفرع
// ========================================
export function validateGeoFence(storeId: string, clientIp: string): { allowed: boolean; message: string } {
  const rules = db.prepare('SELECT * FROM geo_fence_rules WHERE store_id = ? AND is_active = 1').get(storeId) as any;
  if (!rules) return { allowed: true, message: 'No geo-fence rules configured' };

  const allowedIps = (rules.allowed_ip_addresses || '').split(',').map((ip: string) => ip.trim());
  if (allowedIps.length > 0 && !allowedIps.includes(clientIp)) {
    return { allowed: false, message: 'Transaction not allowed from this IP address' };
  }

  return { allowed: true, message: 'IP address verified' };
}

// ========================================
// F18: تتبع اشتراكات الدونجلات والبوكسات (Dongle ROI Tracker)
// ========================================
export function calculateToolROI(storeId: string): any[] {
  return db.prepare(`
    SELECT ts.*,
      CASE WHEN ts.usage_count > 0 THEN ROUND(ts.subscription_cost_yearly / ts.usage_count, 2) ELSE 0 END as cost_per_use,
      CASE WHEN ts.annual_usage_value > 0 THEN ROUND((ts.annual_usage_value - ts.subscription_cost_yearly) / ts.subscription_cost_yearly * 100, 2) ELSE 0 END as roi_pct
    FROM tool_subscriptions ts
    WHERE ts.store_id = ?
    ORDER BY roi_pct DESC
  `).all(storeId);
}

// ========================================
// F19: توليد إيصال تحويل رقمي عبر واتساب
// ========================================
export function generateDigitalReceipt(transactionId: string, customerPhone: string): string {
  const id = `dtr-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO digital_transfer_receipts (id, transaction_id, customer_phone, whatsapp_status)
    VALUES (?, ?, ?, 'PENDING')
  `).run(id, transactionId, customerPhone);

  return id;
}

// ========================================
// F20: حساب تكلفة السحب من الـ ATM
// ========================================
export function calculateATMWithdrawalCost(data: {
  store_id: string;
  amount_withdrawn: number;
  atm_fee: number;
  transportation_cost: number;
  staff_time_minutes: number;
}): string {
  const id = `atc-${uuidv4().substring(0, 8)}`;
  const totalCost = data.atm_fee + data.transportation_cost + (data.staff_time_minutes * 0.5);
  const costPerEgp = data.amount_withdrawn > 0 ? totalCost / data.amount_withdrawn : 0;

  db.prepare(`
    INSERT INTO atm_withdrawal_costs (id, store_id, withdrawal_date, amount_withdrawn, atm_fee, transportation_cost, staff_time_minutes, total_cost, cost_per_egp)
    VALUES (?, ?, date('now'), ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.amount_withdrawn, data.atm_fee, data.transportation_cost, data.staff_time_minutes, totalCost, Math.round(costPerEgp * 10000) / 10000);

  return id;
}

// ========================================
// F21: مؤشر ربحية أنواع الخدمات (Service Profitability Breakdown)
// ========================================
export function calculateServiceProfitability(storeId: string, periodMonth: string): any[] {
  return db.prepare(`
    SELECT service_type, period_month, total_revenue, total_cost, net_profit, profit_margin_pct, transaction_count
    FROM service_profitability
    WHERE store_id = ? AND period_month = ?
    ORDER BY profit_margin_pct DESC
  `).all(storeId, periodMonth);
}

// ========================================
// F22: سقف الرصيد النقدي في الدرج (Cash Drawer Threshold)
// ========================================
export function checkCashDrawerThreshold(storeId: string, drawerType: string, currentBalance: number): { exceeded: boolean; message: string; current_balance: number; max_threshold: number; usage_pct: number } {
  const threshold = db.prepare('SELECT * FROM cash_drawer_thresholds WHERE store_id = ? AND drawer_type = ? AND is_active = 1').get(storeId, drawerType) as any;
  if (!threshold) return { exceeded: false, message: 'No threshold configured', current_balance: currentBalance, max_threshold: 0, usage_pct: 0 };

  const exceeded = currentBalance > threshold.max_balance;
  const alertPct = threshold.max_balance > 0 ? (currentBalance / threshold.max_balance) * 100 : 0;

  return {
    exceeded,
    message: exceeded
      ? `Cash drawer balance (${currentBalance} EGP) exceeds maximum threshold (${threshold.max_balance} EGP). Transfer to main vault required.`
      : `Cash drawer balance (${currentBalance} EGP) is within threshold (${Math.round(alertPct)}% of max)`,
    current_balance: currentBalance,
    max_threshold: threshold.max_balance,
    usage_pct: Math.round(alertPct)
  };
}

// ========================================
// F23: كشف العمليات الوهمية الملغاة
// ========================================
export function monitorVoidTransactions(storeId: string, hours: number = 24): any[] {
  return db.prepare(`
    SELECT 
      user_id,
      u.name as user_name,
      transaction_type,
      COUNT(*) as void_count,
      SUM(amount) as total_voided_amount
    FROM fintech_transactions ft
    JOIN users u ON ft.created_by_user_id = u.id
    WHERE ft.store_id = ? 
      AND ft.status = 'VOID'
      AND ft.created_at >= datetime('now', ?)
    GROUP BY user_id, transaction_type
    HAVING void_count >= 3
    ORDER BY void_count DESC
  `).all(storeId, `-${hours} hours`);
}

// ========================================
// F24: متابعة خطوط الكاش متعددة الأسماء
// ========================================
export function getWalletLineRegistry(storeId: string): any[] {
  return db.prepare(`
    SELECT wlr.*, fw.provider_name, fw.current_balance
    FROM wallet_line_registry wlr
    JOIN fintech_wallets fw ON wlr.wallet_id = fw.id
    WHERE wlr.store_id = ?
    ORDER BY wlr.registration_status ASC, wlr.registered_name ASC
  `).all(storeId);
}

// ========================================
// F25: مؤشر زمن إنهاء عملية الكاش (Fintech Service Speed)
// ========================================
export function logTransactionSpeed(data: {
  store_id: string;
  cashier_user_id: string;
  transaction_type: string;
  start_time: string;
  end_time: string;
}): string {
  const id = `tsp-${uuidv4().substring(0, 8)}`;
  const startTime = new Date(data.start_time).getTime();
  const endTime = new Date(data.end_time).getTime();
  const durationSeconds = Math.round((endTime - startTime) / 1000);

  db.prepare(`
    INSERT INTO transaction_speed_log (id, store_id, cashier_user_id, transaction_type, start_time, end_time, duration_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.store_id, data.cashier_user_id, data.transaction_type, data.start_time, data.end_time, durationSeconds);

  return id;
}

export function getTransactionSpeedReport(storeId: string, days: number = 30): any[] {
  return db.prepare(`
    SELECT 
      cashier_user_id,
      u.name as cashier_name,
      transaction_type,
      COUNT(*) as total_transactions,
      ROUND(AVG(duration_seconds), 1) as avg_duration_seconds,
      MIN(duration_seconds) as fastest_seconds,
      MAX(duration_seconds) as slowest_seconds
    FROM transaction_speed_log tsl
    JOIN users u ON tsl.cashier_user_id = u.id
    WHERE tsl.store_id = ? AND tsl.recorded_at >= datetime('now', ?)
    GROUP BY cashier_user_id, transaction_type
    ORDER BY avg_duration_seconds ASC
  `).all(storeId, `-${days} days`);
}
