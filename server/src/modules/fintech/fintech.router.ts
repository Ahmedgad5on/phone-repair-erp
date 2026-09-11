import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../../services/audit.service';
import { FintechRepository } from '../../repositories/fintech.repository';

export const fintechRouter = Router();

function ensureFintechSchema() {
  try {
    const cols = db.prepare('SELECT name FROM pragma_table_info(?)').all('fintech_wallets') as { name: string }[];
    if (cols.length > 0 && !cols.some(c => c.name === 'version')) {
      db.exec('ALTER TABLE fintech_wallets ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
    }
  } catch (e) {}

  try {
    const custCols = db.prepare('SELECT name FROM pragma_table_info(?)').all('customers') as { name: string }[];
    if (custCols.length > 0 && !custCols.some(c => c.name === 'credit_limit')) {
      db.exec('ALTER TABLE customers ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0');
    }
    if (custCols.length > 0 && !custCols.some(c => c.name === 'credit_used')) {
      db.exec('ALTER TABLE customers ADD COLUMN credit_used REAL NOT NULL DEFAULT 0');
    }
  } catch (e) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      request_type TEXT NOT NULL,
      reference_id TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EGP',
      status TEXT NOT NULL DEFAULT 'PENDING',
      current_level TEXT NOT NULL DEFAULT 'CASHIER',
      requested_by TEXT NOT NULL,
      approved_by TEXT,
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS bank_statement_entries (
      id TEXT PRIMARY KEY,
      statement_date TEXT NOT NULL,
      reference TEXT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      matched_transaction_id TEXT,
      match_status TEXT NOT NULL DEFAULT 'UNMATCHED',
      imported_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      expense_number TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      tax_amount REAL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'EGP',
      payment_method TEXT NOT NULL,
      receipt_url TEXT,
      description TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      approved_by TEXT,
      journal_entry_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
ensureFintechSchema();

// 1. Get All Wallets & Balance Status with Limit Gauges
fintechRouter.get('/wallets', (req: Request, res: Response) => {
  const wallets = db.prepare('SELECT * FROM fintech_wallets WHERE deleted_at IS NULL ORDER BY provider_name ASC').all() as any[];

  // Update lock state dynamically based on 95% threshold
  const enriched = wallets.map(w => {
    const dailyRatio = w.daily_usage / (w.daily_limit || 1);
    const monthlyRatio = w.monthly_usage / (w.monthly_limit || 1);
    const reachesThreshold = dailyRatio >= 0.95 || monthlyRatio >= 0.95;

    if (reachesThreshold && !w.is_locked) {
      db.prepare('UPDATE fintech_wallets SET is_locked = 1 WHERE id = ?').run(w.id);
      w.is_locked = 1;
    }

    return {
      ...w,
      dailyPercentage: Number((dailyRatio * 100).toFixed(1)),
      monthlyPercentage: Number((monthlyRatio * 100).toFixed(1)),
      nearLimit: reachesThreshold
    };
  });

  res.json(enriched);
});

// 2. Unlock Wallet Manually (Supervisor / Manager action)
fintechRouter.post('/wallets/:id/unlock', (req: Request, res: Response) => {
  db.prepare('UPDATE fintech_wallets SET is_locked = 0 WHERE id = ?').run(req.params.id);
  const updated = db.prepare('SELECT * FROM fintech_wallets WHERE id = ?').get(req.params.id);

  logAudit({
    action: 'UPDATE',
    entityType: 'FINTECH_WALLET',
    entityId: req.params.id as string,
    newValues: { is_locked: 0, reason: 'Manual supervisor unlock' },
    ipAddress: req.ip
  });

  res.json({ message: 'Wallet manually unlocked by authorized supervisor', wallet: updated });
});

// 3. Process Transaction with Anti-Fraud Validation
fintechRouter.post('/transactions', (req: Request, res: Response) => {
  const {
    wallet_id, trans_type, amount, commission,
    sender_receiver_phone, reference_tx_id, national_id, created_by_user_id
  } = req.body;

  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string };
  const wallet = db.prepare('SELECT * FROM fintech_wallets WHERE id = ? AND deleted_at IS NULL').get(wallet_id) as any;

  if (!wallet) return res.status(404).json({ error: 'Fintech wallet not found' });

  // Anti-fraud validation for Cash-Out
  if (trans_type === 'CASH_OUT') {
    if (!reference_tx_id || reference_tx_id.trim().length < 6) {
      return res.status(400).json({
        error: 'FRAUD PREVENTION: Cash-out requires a validated carrier reference Transaction ID (min 6 characters).'
      });
    }
    if (!sender_receiver_phone || sender_receiver_phone.trim().length < 10) {
      return res.status(400).json({
        error: 'FRAUD PREVENTION: Sender mobile number is mandatory for cash-out authorization.'
      });
    }
  }

  // Check if wallet is locked
  if (wallet.is_locked) {
    return res.status(403).json({
      error: `WALLET LOCKED: ${wallet.provider_name} has reached its regulatory limit threshold (>95%). Transactions are blocked.`
    });
  }

  const numAmount = parseFloat(amount);
  const numComm = parseFloat(commission || '0.0');

  // Multi-step approval hierarchy check (> 5000 EGP)
  if (numAmount > 5000) {
    const approvalId = req.body?.approval_request_id || req.body?.approval_id;
    const approval = approvalId
      ? db.prepare("SELECT * FROM approval_requests WHERE id = ? AND status = 'APPROVED'").get(approvalId) as any
      : null;
    if (!approval) {
      return res.status(403).json({ error: "Approval required for payments over 5000 EGP" });
    }
  }

  // Check limits
  const newDailyUsage = wallet.daily_usage + numAmount;
  const newMonthlyUsage = wallet.monthly_usage + numAmount;

  if (newDailyUsage > wallet.daily_limit) {
    return res.status(400).json({
      error: `LIMIT EXCEEDED: Transaction exceeds remaining daily cap for ${wallet.provider_name}. Max allowed today: ${wallet.daily_limit - wallet.daily_usage} EGP.`
    });
  }

  // Update balances
  let newBalance = wallet.current_balance;
  if (trans_type === 'CASH_IN') {
    if (wallet.current_balance < numAmount) {
      return res.status(400).json({ error: `INSUFFICIENT E-BALANCE: Wallet has ${wallet.current_balance} EGP but transaction requires ${numAmount} EGP.` });
    }
    newBalance -= numAmount;
  } else if (trans_type === 'CASH_OUT') {
    newBalance += numAmount;
  }

  const willLock = (newDailyUsage / wallet.daily_limit >= 0.95) || (newMonthlyUsage / wallet.monthly_limit >= 0.95);
  const txId = `ftx-${uuidv4().substring(0, 8)}`;

  // Suspicious flag: high value > 15,000 EGP
  const isSuspicious = numAmount >= 15000;

  // Optimistic concurrency locking on wallet version & BEGIN IMMEDIATE transaction
  const expectedVersion = req.body?.expected_version !== undefined
    ? Number(req.body.expected_version)
    : (wallet.version !== undefined ? Number(wallet.version) : 1);

  try {
    const processTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO fintech_transactions (
          id, store_id, wallet_id, wallet_provider, trans_type, amount,
          commission, sender_receiver_phone, reference_tx_id, national_id, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        txId, store.id, wallet.id, wallet.provider_name, trans_type, numAmount,
        numComm, sender_receiver_phone, reference_tx_id || '', national_id || null, created_by_user_id || 'usr-cashier'
      );

      const updateRes = db.prepare(`
        UPDATE fintech_wallets
        SET current_balance = ?,
            daily_usage = ?,
            monthly_usage = ?,
            is_locked = ?,
            version = version + 1
        WHERE id = ? AND version = ?
      `).run(newBalance, newDailyUsage, newMonthlyUsage, willLock ? 1 : 0, wallet.id, expectedVersion);

      if (updateRes.changes === 0) {
        throw new Error('CONCURRENCY_CONFLICT: Wallet version mismatch or concurrent update');
      }
    });

    processTx.immediate();
  } catch (err: any) {
    if (err.message && err.message.includes('CONCURRENCY_CONFLICT')) {
      return res.status(409).json({
        error: 'CONCURRENCY_CONFLICT: Wallet was modified by another concurrent transaction. Please retry.',
        code: 'CONCURRENCY_CONFLICT'
      });
    }
    throw err;
  }

  logAudit({
    action: 'CREATE',
    entityType: 'FINTECH_TRANSACTION',
    entityId: txId,
    newValues: { provider: wallet.provider_name, type: trans_type, amount: numAmount, commission: numComm, isSuspicious },
    ipAddress: req.ip
  });

  const createdTx = db.prepare('SELECT * FROM fintech_transactions WHERE id = ?').get(txId);
  res.status(201).json({
    transaction: createdTx,
    updatedBalance: newBalance,
    autoLocked: willLock,
    suspiciousAlert: isSuspicious ? 'High-value transaction flagged for AML review.' : null
  });
});

// 4. Get Transactions History & Summary
fintechRouter.get('/transactions', (req: Request, res: Response) => {
  const { wallet_id, limit } = req.query;
  let sql = 'SELECT * FROM fintech_transactions WHERE 1=1';
  const params: any[] = [];

  if (wallet_id) {
    sql += ' AND wallet_id = ?';
    params.push(wallet_id);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit as string) || 50);

  const txs = db.prepare(sql).all(...params);
  res.json(txs);
});

// 5. Daily Cash & Wallet Reconciliation
fintechRouter.post('/reconcile-daily', (req: Request, res: Response) => {
  const { physical_cash_count, wallet_counts, user_id, notes } = req.body;

  // Calculate drawer expected cash from open shift
  const openShift = db.prepare("SELECT * FROM shifts WHERE status = 'OPEN' AND deleted_at IS NULL LIMIT 1").get() as any;
  const openingCash = openShift ? openShift.opening_cash : 0.0;

  // Sum sales today
  const salesCash = (db.prepare(`
    SELECT COALESCE(SUM(total), 0.0) as cash_total
    FROM sales
    WHERE payment_method = 'CASH' AND status = 'COMPLETED' AND date(created_at) = date('now')
  `).get() as any).cash_total;

  // Sum fintech cash in/out impact on physical drawer
  // CASH_IN brings physical cash into drawer (+)
  // CASH_OUT takes physical cash out of drawer (-)
  const fintechCashIn = (db.prepare(`
    SELECT COALESCE(SUM(amount + commission), 0.0) as total
    FROM fintech_transactions
    WHERE trans_type = 'CASH_IN' AND date(created_at) = date('now')
  `).get() as any).total;

  const fintechCashOut = (db.prepare(`
    SELECT COALESCE(SUM(amount - commission), 0.0) as total
    FROM fintech_transactions
    WHERE trans_type = 'CASH_OUT' AND date(created_at) = date('now')
  `).get() as any).total;

  const expectedDrawerCash = openingCash + salesCash + fintechCashIn - fintechCashOut;
  const actualDrawerCash = parseFloat(physical_cash_count) || 0.0;
  const cashDifference = actualDrawerCash - expectedDrawerCash;

  // Compare wallets
  const wallets = db.prepare('SELECT id, provider_name, current_balance FROM fintech_wallets WHERE deleted_at IS NULL').all() as any[];
  const walletReconciliation = wallets.map(w => {
    const counted = wallet_counts && wallet_counts[w.id] !== undefined ? parseFloat(wallet_counts[w.id]) : w.current_balance;
    const diff = counted - w.current_balance;
    return {
      walletId: w.id,
      provider: w.provider_name,
      ledgerBalance: w.current_balance,
      physicalReported: counted,
      difference: diff,
      isDiscrepancy: Math.abs(diff) > 0.01
    };
  });

  const reconciliationReport = {
    date: new Date().toISOString(),
    reconciledBy: user_id || 'Cashier / Supervisor',
    drawer: {
      openingCash,
      salesCash,
      fintechCashIn,
      fintechCashOut,
      expectedDrawerCash,
      actualDrawerCash,
      cashDifference,
      status: Math.abs(cashDifference) < 1.0 ? 'BALANCED' : cashDifference > 0 ? 'SURPLUS' : 'DEFICIT'
    },
    wallets: walletReconciliation,
    notes: notes || ''
  };

  logAudit({
    action: 'CREATE',
    entityType: 'DAILY_RECONCILIATION',
    newValues: { cashDifference, status: reconciliationReport.drawer.status },
    ipAddress: req.ip
  });

  res.json(reconciliationReport);
});

// 6. AML Frequency & Top High-Value Numbers
fintechRouter.get('/aml-top', (req: Request, res: Response) => {
  const aml = db.prepare(`
    SELECT sender_receiver_phone, COUNT(*) as tx_count, SUM(amount) as total_volume
    FROM fintech_transactions
    WHERE sender_receiver_phone IS NOT NULL AND sender_receiver_phone != ''
    GROUP BY sender_receiver_phone
    HAVING tx_count >= 1
    ORDER BY total_volume DESC
    LIMIT 10
  `).all();
  res.json(aml);
});

// 7. Statement Reconciliation (CSV / pasted logs)
fintechRouter.post('/reconcile-statement', (req: Request, res: Response) => {
  const { entries } = req.body;
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: 'entries must be an array' });
  }

  let matchedCount = 0;
  const missingInErp: any[] = [];

  for (const entry of entries) {
    const tx = db.prepare('SELECT * FROM fintech_transactions WHERE reference_tx_id = ?').get(entry.tx_id);
    if (tx) {
      matchedCount++;
    } else {
      missingInErp.push(entry);
    }
  }

  res.json({
    totalProcessed: entries.length,
    matchedCount,
    unmatchedCount: missingInErp.length,
    missingInErp
  });
});

// ==========================================
// 8. Automated SMS TxID Matching (Dev Proposal 22)
// ==========================================
fintechRouter.post('/sms-match', (req: Request, res: Response) => {
  const { sms_body, invoice_or_ticket_id } = req.body;
  if (!sms_body) {
    return res.status(400).json({ error: 'sms_body text string is required' });
  }

  const result = FintechRepository.parseAndMatchSms(sms_body, invoice_or_ticket_id);
  res.json(result);
});

// ==========================================
// 9. Fintech Monthly Ceiling Alerts (Dev Proposal 24)
// ==========================================
fintechRouter.get('/ceiling-alerts', (_req: Request, res: Response) => {
  const alerts = FintechRepository.getCeilingAlerts();
  res.json(alerts);
});

// ==========================================
// 10. Cost Centers for Multi-Branches (Dev Proposal 25)
// ==========================================
fintechRouter.get('/cost-centers', (req: Request, res: Response) => {
  const { branch_id } = req.query;
  const centers = FintechRepository.getCostCenters(branch_id as string);
  res.json(centers);
});

fintechRouter.post('/cost-centers', (req: Request, res: Response) => {
  const { branch_id, code, name, department, budget_allocated } = req.body;
  if (!code || !name || !department) {
    return res.status(400).json({ error: 'code, name, and department are required' });
  }

  const id = FintechRepository.createCostCenter({
    branch_id,
    code,
    name,
    department,
    budget_allocated: Number(budget_allocated) || 0
  });

  res.status(201).json({ success: true, id, message: 'Cost center created' });
});

// =======================================================
// 11. 30-Day Projected Cash Flow Engine (R4.4)
// =======================================================
fintechRouter.get('/cashflow/projection', (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;

  // Current liquid balances
  const walletTotalRow = db.prepare('SELECT COALESCE(SUM(current_balance), 0.0) as total FROM fintech_wallets WHERE deleted_at IS NULL').get() as { total: number };
  let cashOnHand = walletTotalRow.total;
  try {
    const coaRow = db.prepare("SELECT COALESCE(SUM(balance), 0.0) as total FROM chart_of_accounts WHERE account_type = 'ASSET' AND is_active = 1 AND (code LIKE '101%' OR code LIKE '102%')").get() as { total: number };
    if (coaRow && coaRow.total > 0) {
      cashOnHand += coaRow.total;
    }
  } catch (e) {}

  // Baseline averages
  let avgDailySales = 2500;
  try {
    const salesAvg = db.prepare(`
      SELECT COALESCE(AVG(daily_sum), 2500.0) as avg_sales
      FROM (
        SELECT SUM(total) as daily_sum
        FROM sales
        WHERE status = 'COMPLETED' AND date(created_at) >= date('now', '-30 days')
        GROUP BY date(created_at)
      )
    `).get() as { avg_sales: number };
    if (salesAvg && salesAvg.avg_sales > 0) avgDailySales = Math.round(salesAvg.avg_sales);
  } catch (e) {}

  let avgDailyExpenses = 850;
  try {
    const expAvg = db.prepare(`
      SELECT COALESCE(AVG(daily_sum), 850.0) as avg_exp
      FROM (
        SELECT SUM(amount) as daily_sum
        FROM expenses
        WHERE status = 'APPROVED' AND date(created_at) >= date('now', '-30 days')
        GROUP BY date(created_at)
      )
    `).get() as { avg_exp: number };
    if (expAvg && expAvg.avg_exp > 0) avgDailyExpenses = Math.round(expAvg.avg_exp);
  } catch (e) {}

  const projection: any[] = [];
  let runningBalance = cashOnHand;
  let totalInflows = 0;
  let totalOutflows = 0;
  let minProjectedBalance = runningBalance;

  const hasInstallments = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='installment_payments'").get());
  const hasPOs = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='purchase_orders'").get());

  const today = new Date();

  for (let i = 1; i <= days; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + i);
    const dateStr = targetDate.toISOString().split('T')[0];

    // Installments due
    let installmentsDue = 0;
    if (hasInstallments) {
      try {
        const instRow = db.prepare("SELECT COALESCE(SUM(amount - paid_amount), 0.0) as sumDue FROM installment_payments WHERE status = 'PENDING' AND date(due_date) = date(?)").get(dateStr) as { sumDue: number };
        installmentsDue = instRow?.sumDue || 0;
      } catch (e) {}
    }

    // Payables due
    let payablesDue = 0;
    if (hasPOs) {
      try {
        const poRow = db.prepare("SELECT COALESCE(SUM(total_amount), 0.0) as poDue FROM purchase_orders WHERE status IN ('PENDING', 'ORDERED') AND date(delivery_date) = date(?)").get(dateStr) as { poDue: number };
        payablesDue = poRow?.poDue || 0;
      } catch (e) {}
    }

    // Weekly variation
    const dayOfWeek = targetDate.getDay();
    const isWeekend = dayOfWeek === 5; // Friday
    const dailySales = isWeekend ? avgDailySales * 1.3 : avgDailySales;
    const dailyExp = isWeekend ? avgDailyExpenses * 0.6 : avgDailyExpenses;

    const dayInflows = Number((installmentsDue + dailySales).toFixed(2));
    const dayOutflows = Number((payablesDue + dailyExp).toFixed(2));
    const netDay = Number((dayInflows - dayOutflows).toFixed(2));

    runningBalance = Number((runningBalance + netDay).toFixed(2));
    if (runningBalance < minProjectedBalance) {
      minProjectedBalance = runningBalance;
    }

    totalInflows += dayInflows;
    totalOutflows += dayOutflows;

    projection.push({
      day: i,
      date: dateStr,
      inflows: dayInflows,
      outflows: dayOutflows,
      net: netDay,
      projectedBalance: runningBalance,
      installmentsInflow: installmentsDue,
      salesInflow: Number(dailySales.toFixed(2)),
      expensesOutflow: Number(dailyExp.toFixed(2)),
      payablesOutflow: payablesDue
    });
  }

  res.json({
    currentBalance: Number(cashOnHand.toFixed(2)),
    projectedEndBalance: Number(runningBalance.toFixed(2)),
    minProjectedBalance: Number(minProjectedBalance.toFixed(2)),
    totalInflows: Number(totalInflows.toFixed(2)),
    totalOutflows: Number(totalOutflows.toFixed(2)),
    netCashFlow: Number((totalInflows - totalOutflows).toFixed(2)),
    days,
    projection
  });
});

// =======================================================
// 12. Financial Approval Hierarchy for Large Payments (R4.5)
// =======================================================
fintechRouter.get('/approval-requests', (req: Request, res: Response) => {
  const { status, current_level } = req.query;
  let sql = 'SELECT * FROM approval_requests WHERE 1=1';
  const params: any[] = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (current_level) { sql += ' AND current_level = ?'; params.push(current_level); }
  sql += ' ORDER BY created_at DESC LIMIT 50';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

fintechRouter.get('/approval-requests/pending', (_req: Request, res: Response) => {
  const pending = db.prepare("SELECT * FROM approval_requests WHERE status = 'PENDING' ORDER BY created_at DESC").all();
  res.json({ count: pending.length, requests: pending });
});

fintechRouter.post('/approval-requests', (req: Request, res: Response) => {
  const { request_type, amount, reference_id, reason, requested_by } = req.body;
  const numAmount = Number(amount) || 0;
  if (!request_type || numAmount <= 0) {
    return res.status(400).json({ error: 'request_type and valid positive amount are required' });
  }

  const id = `apr-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO approval_requests (
      id, request_type, reference_id, amount, currency, status,
      current_level, requested_by, reason, created_at
    ) VALUES (?, ?, ?, ?, 'EGP', 'PENDING', 'CASHIER', ?, ?, CURRENT_TIMESTAMP)
  `).run(id, request_type, reference_id || null, numAmount, requested_by || 'usr-cashier', reason || 'High-value transaction authorization');

  const created = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id);
  res.status(201).json({ success: true, approvalRequest: created });
});

fintechRouter.patch('/approval-requests/:id/approve', (req: Request, res: Response) => {
  const reqItem = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(req.params.id) as any;
  if (!reqItem) return res.status(404).json({ error: 'Approval request not found' });
  if (reqItem.status === 'APPROVED') return res.status(400).json({ error: 'Request is already fully approved' });

  const approverId = req.body?.approved_by || (req as any).user?.userId || 'usr-manager';
  const role = req.body?.role || (req as any).user?.role || 'Manager';

  // Multi-step hierarchy: CASHIER -> MANAGER -> CFO -> APPROVED
  let nextLevel = reqItem.current_level;
  let nextStatus = 'PENDING';

  if (role === 'SuperAdmin' || role === 'CFO') {
    nextLevel = 'CFO';
    nextStatus = 'APPROVED';
  } else if (reqItem.current_level === 'CASHIER') {
    nextLevel = 'MANAGER';
    nextStatus = 'PENDING';
  } else if (reqItem.current_level === 'MANAGER') {
    nextLevel = 'CFO';
    nextStatus = 'PENDING';
  } else if (reqItem.current_level === 'CFO') {
    nextStatus = 'APPROVED';
  }

  db.prepare(`
    UPDATE approval_requests
    SET current_level = ?,
        status = ?,
        approved_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nextLevel, nextStatus, approverId, req.params.id);

  const updated = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(req.params.id);
  res.json({
    success: true,
    approvalRequest: updated,
    message: nextStatus === 'APPROVED' ? 'Final payment approval granted' : `Approved and advanced to ${nextLevel}`
  });
});

fintechRouter.patch('/approval-requests/:id/reject', (req: Request, res: Response) => {
  const reqItem = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(req.params.id) as any;
  if (!reqItem) return res.status(404).json({ error: 'Approval request not found' });

  const rejectReason = req.body?.reason || 'Rejected by financial supervisor';
  db.prepare(`
    UPDATE approval_requests
    SET status = 'REJECTED',
        reason = COALESCE(reason || ' | ', '') || ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(`REJECTED: ${rejectReason}`, req.params.id);

  const updated = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(req.params.id);
  res.json({ success: true, approvalRequest: updated });
});

// =======================================================
// 13. Customer Credit Limit Management (R4.7)
// =======================================================
fintechRouter.get('/customers/:id/credit', (req: Request, res: Response) => {
  const cust = db.prepare('SELECT id, name, phone, credit_limit, credit_used FROM customers WHERE id = ?').get(req.params.id) as any;
  if (!cust) return res.status(404).json({ error: 'Customer not found' });

  const limit = Number(cust.credit_limit) || 0;
  const used = Number(cust.credit_used) || 0;
  const available = Math.max(0, limit - used);
  const usagePercent = limit > 0 ? Number(((used / limit) * 100).toFixed(1)) : 0;

  res.json({
    customerId: cust.id,
    customerName: cust.name,
    phone: cust.phone,
    credit_limit: limit,
    credit_used: used,
    available_credit: available,
    usage_percentage: usagePercent,
    isLimitReached: used >= limit
  });
});

fintechRouter.patch('/customers/:id/credit-limit', (req: Request, res: Response) => {
  const { credit_limit } = req.body;
  const numLimit = Number(credit_limit);
  if (isNaN(numLimit) || numLimit < 0) {
    return res.status(400).json({ error: 'Valid positive credit_limit is required' });
  }

  const cust = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
  if (!cust) return res.status(404).json({ error: 'Customer not found' });

  db.prepare('UPDATE customers SET credit_limit = ? WHERE id = ?').run(numLimit, req.params.id);
  const updated = db.prepare('SELECT id, name, credit_limit, credit_used FROM customers WHERE id = ?').get(req.params.id);
  res.json({ success: true, customer: updated });
});

fintechRouter.post('/customers/:id/check-credit', (req: Request, res: Response) => {
  const { new_sale_amount } = req.body;
  const saleAmt = Number(new_sale_amount) || 0;
  if (saleAmt <= 0) {
    return res.status(400).json({ error: 'new_sale_amount must be greater than 0' });
  }

  const cust = db.prepare('SELECT id, name, credit_limit, credit_used FROM customers WHERE id = ?').get(req.params.id) as any;
  if (!cust) return res.status(404).json({ error: 'Customer not found' });

  const limit = Number(cust.credit_limit) || 0;
  const used = Number(cust.credit_used) || 0;
  const projectedUsed = used + saleAmt;

  if (limit <= 0) {
    return res.status(403).json({
      error: `Customer ${cust.name} has no credit facility configured (credit_limit = 0). On-credit sale blocked.`,
      code: 'CREDIT_LIMIT_ZERO',
      credit_limit: limit,
      credit_used: used,
      requested: saleAmt
    });
  }

  if (projectedUsed > limit) {
    return res.status(403).json({
      error: `Credit limit exceeded: credit_used (${used.toFixed(2)}) + new_sale (${saleAmt.toFixed(2)}) > credit_limit (${limit.toFixed(2)})`,
      code: 'CREDIT_LIMIT_EXCEEDED',
      credit_limit: limit,
      credit_used: used,
      requested: saleAmt,
      available: Math.max(0, limit - used),
      excess: projectedUsed - limit
    });
  }

  res.json({
    allowed: true,
    credit_limit: limit,
    current_used: used,
    requested: saleAmt,
    projected_used: projectedUsed,
    remaining_credit: limit - projectedUsed
  });
});

// =======================================================
// 14. Bank Statement Reconciliation Module (R4.9)
// =======================================================
fintechRouter.post('/bank/import-csv', (req: Request, res: Response) => {
  const { csv_content } = req.body;
  if (!csv_content || typeof csv_content !== 'string') {
    return res.status(400).json({ error: 'csv_content string is required' });
  }

  const lines = csv_content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    return res.status(400).json({ error: 'CSV file is empty' });
  }

  const importedEntries: any[] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;

  const startIndex = lines[0].toLowerCase().includes('date') || lines[0].toLowerCase().includes('amount') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < 2) continue;

    let dateStr = cols[0];
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
    }

    let description = 'Bank Transaction';
    let ref = '';
    let amount = 0;

    if (cols.length >= 3) {
      description = cols[1];
      amount = Math.abs(parseFloat(cols[2].replace(/[^0-9.-]/g, '')) || 0);
      if (cols.length >= 4) ref = cols[3];
    } else {
      amount = Math.abs(parseFloat(cols[1].replace(/[^0-9.-]/g, '')) || 0);
    }

    if (amount <= 0) continue;

    const entryId = `bse-${uuidv4().substring(0, 8)}`;

    // Matching against fintech_transactions: amount equality & date within ±1 day
    const matchedTx = db.prepare(`
      SELECT id, reference_tx_id, amount, trans_type, created_at
      FROM fintech_transactions
      WHERE ABS(amount - ?) < 0.01
        AND ABS(julianday(date(created_at)) - julianday(date(?))) <= 1.0
      ORDER BY ABS(julianday(date(created_at)) - julianday(date(?))) ASC
      LIMIT 1
    `).get(amount, dateStr, dateStr) as any;

    const matchStatus = matchedTx ? 'MATCHED' : 'UNMATCHED';
    if (matchedTx) matchedCount++;
    else unmatchedCount++;

    db.prepare(`
      INSERT INTO bank_statement_entries (
        id, statement_date, reference, description, amount,
        matched_transaction_id, match_status, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(entryId, dateStr, ref || (matchedTx ? matchedTx.reference_tx_id : null), description, amount, matchedTx ? matchedTx.id : null, matchStatus);

    importedEntries.push({
      id: entryId,
      date: dateStr,
      description,
      amount,
      reference: ref,
      matchStatus,
      matchedTransactionId: matchedTx ? matchedTx.id : null
    });
  }

  res.json({
    success: true,
    totalImported: importedEntries.length,
    matchedCount,
    unmatchedCount,
    matchPercentage: importedEntries.length > 0 ? Number(((matchedCount / importedEntries.length) * 100).toFixed(1)) : 0,
    entries: importedEntries
  });
});

fintechRouter.get('/bank/reconciliation-status', (_req: Request, res: Response) => {
  const entries = db.prepare('SELECT * FROM bank_statement_entries ORDER BY statement_date DESC LIMIT 100').all() as any[];
  const matchedCount = entries.filter(e => e.match_status === 'MATCHED').length;
  const unmatchedCount = entries.filter(e => e.match_status === 'UNMATCHED').length;
  const matchedVolume = entries.filter(e => e.match_status === 'MATCHED').reduce((sum, e) => sum + Number(e.amount), 0);
  const unmatchedVolume = entries.filter(e => e.match_status === 'UNMATCHED').reduce((sum, e) => sum + Number(e.amount), 0);

  res.json({
    totalEntries: entries.length,
    matchedCount,
    unmatchedCount,
    matchedVolume: Number(matchedVolume.toFixed(2)),
    unmatchedVolume: Number(unmatchedVolume.toFixed(2)),
    matchRate: entries.length > 0 ? Number(((matchedCount / entries.length) * 100).toFixed(1)) : 0,
    entries
  });
});

fintechRouter.get('/bank/entries', (_req: Request, res: Response) => {
  const entries = db.prepare('SELECT * FROM bank_statement_entries ORDER BY statement_date DESC LIMIT 100').all();
  res.json(entries);
});

// =======================================================
// 15. Operational Expenses on Fintech Module (R4.6)
// =======================================================
fintechRouter.get('/expenses', (req: Request, res: Response) => {
  const { category, status, branch_id } = req.query;
  let sql = 'SELECT * FROM expenses WHERE 1=1';
  const params: any[] = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (branch_id) { sql += ' AND branch_id = ?'; params.push(branch_id); }
  sql += ' ORDER BY created_at DESC LIMIT 100';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

fintechRouter.post('/expenses', (req: Request, res: Response) => {
  const { category, amount, description, payment_method, branch_id, receipt_url, created_by, tax_amount } = req.body;
  if (!category || !amount || !description) {
    return res.status(400).json({ error: 'category, amount, and description are required' });
  }

  const id = `exp-${uuidv4().substring(0, 8)}`;
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM expenses').get() as { cnt: number };
  const expense_number = `EXP-${1000 + countRow.cnt + 1}`;

  db.prepare(`
    INSERT INTO expenses (
      id, expense_number, category, amount, tax_amount, currency,
      payment_method, receipt_url, description, branch_id, status,
      created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, 'EGP', ?, ?, ?, ?, 'PENDING', ?, CURRENT_TIMESTAMP)
  `).run(
    id, expense_number, category, Number(amount), Number(tax_amount) || 0,
    payment_method || 'CASH', receipt_url || null, description, branch_id || 'WH-MAIN',
    created_by || (req as any).user?.userId || 'usr-cashier'
  );

  const created = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  res.status(201).json(created);
});

fintechRouter.get('/expenses/:id', (req: Request, res: Response) => {
  const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!exp) return res.status(404).json({ error: 'Expense not found' });
  res.json(exp);
});

fintechRouter.patch('/expenses/:id', (req: Request, res: Response) => {
  const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id) as any;
  if (!exp) return res.status(404).json({ error: 'Expense not found' });
  if (exp.status === 'APPROVED') {
    return res.status(403).json({ error: 'Cannot modify approved expense' });
  }

  const { category, amount, description, payment_method, receipt_url } = req.body;
  db.prepare(`
    UPDATE expenses
    SET category = COALESCE(?, category),
        amount = COALESCE(?, amount),
        description = COALESCE(?, description),
        payment_method = COALESCE(?, payment_method),
        receipt_url = COALESCE(?, receipt_url)
    WHERE id = ?
  `).run(
    category || null,
    amount !== undefined ? Number(amount) : null,
    description || null,
    payment_method || null,
    receipt_url || null,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  res.json(updated);
});

fintechRouter.delete('/expenses/:id', (req: Request, res: Response) => {
  const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id) as any;
  if (!exp) return res.status(404).json({ error: 'Expense not found' });
  if (exp.status === 'APPROVED') {
    return res.status(403).json({ error: 'Cannot delete approved expense' });
  }

  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Expense deleted' });
});

const approveFintechExpenseHandler = (req: Request, res: Response) => {
  const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id) as any;
  if (!exp) return res.status(404).json({ error: 'Expense not found' });
  if (exp.status === 'APPROVED') {
    return res.status(400).json({ error: 'Expense is already approved' });
  }

  const approverId = req.body?.approved_by || (req as any).user?.userId || 'usr-manager';

  let expAccount = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'EXPENSE' ORDER BY code ASC LIMIT 1").get() as any;
  if (!expAccount) {
    const newAccId = `acc-exp-${uuidv4().substring(0, 6)}`;
    db.prepare(`
      INSERT INTO chart_of_accounts (id, code, name, account_type, balance, currency, is_active)
      VALUES (?, '5001', 'General Operating Expenses', 'EXPENSE', 0.0, 'EGP', 1)
    `).run(newAccId);
    expAccount = { id: newAccId, code: '5001', name: 'General Operating Expenses' };
  }

  let cashAccount = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'ASSET' AND (code LIKE '101%' OR code LIKE '102%') ORDER BY code ASC LIMIT 1").get() as any;
  if (!cashAccount) {
    cashAccount = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'ASSET' ORDER BY code ASC LIMIT 1").get() as any;
  }

  const maxEntry = db.prepare('SELECT COALESCE(MAX(entry_number), 1000) as maxNum FROM journal_entries').get() as { maxNum: number };
  const entryNumber = maxEntry.maxNum + 1;
  const journalEntryId = `je-exp-${uuidv4().substring(0, 8)}`;

  const approveTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO journal_entries (id, entry_number, description, reference_type, reference_id, created_by_user_id, status)
      VALUES (?, ?, ?, 'EXPENSE', ?, ?, 'POSTED')
    `).run(journalEntryId, entryNumber, `Approved expense ${exp.expense_number}: ${exp.description}`, exp.id, approverId);

    db.prepare(`
      INSERT INTO journal_entry_lines (id, entry_id, account_id, debit, credit, memo)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(`jel-${uuidv4().substring(0, 8)}`, journalEntryId, expAccount.id, exp.amount, `Category: ${exp.category}`);

    if (cashAccount) {
      db.prepare(`
        INSERT INTO journal_entry_lines (id, entry_id, account_id, debit, credit, memo)
        VALUES (?, ?, ?, 0, ?, ?)
      `).run(`jel-${uuidv4().substring(0, 8)}`, journalEntryId, cashAccount.id, exp.amount, `Method: ${exp.payment_method}`);

      db.prepare('UPDATE chart_of_accounts SET balance = balance - ? WHERE id = ?').run(exp.amount, cashAccount.id);
    }

    db.prepare('UPDATE chart_of_accounts SET balance = balance + ? WHERE id = ?').run(exp.amount, expAccount.id);

    db.prepare(`
      UPDATE expenses
      SET status = 'APPROVED',
          approved_by = ?,
          journal_entry_id = ?
      WHERE id = ?
    `).run(approverId, journalEntryId, exp.id);
  });

  approveTx();

  const updatedExp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(exp.id);
  res.json({
    success: true,
    message: 'Expense approved and journal entry automatically posted to general ledger',
    expense: updatedExp,
    journalEntryId,
    journalEntryNumber: entryNumber
  });
};

fintechRouter.patch('/expenses/:id/approve', approveFintechExpenseHandler);
fintechRouter.post('/expenses/:id/approve', approveFintechExpenseHandler);

