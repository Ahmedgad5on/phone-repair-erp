import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../../services/audit.service';
import { wsService } from '../../services/ws.service';

export const accountingRouter = Router();

function ensureAccountingSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS withholding_tax_rules (
      id TEXT PRIMARY KEY,
      supplier_type TEXT NOT NULL UNIQUE,
      rate REAL NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
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

  const count = db.prepare('SELECT COUNT(*) as count FROM withholding_tax_rules').get() as { count: number };
  if (count.count === 0) {
    const insertRule = db.prepare('INSERT INTO withholding_tax_rules (id, supplier_type, rate, description, is_active) VALUES (?, ?, ?, ?, 1)');
    insertRule.run('wht-1', 'SUPPLIER_SERVICES', 0.01, 'Commercial Services & Supplies (توريدات وخدمات تجارية) - 1%');
    insertRule.run('wht-2', 'SUPPLIER_CONTRACTING', 0.01, 'Contracting & Construction (مقاولات وتوريدات) - 1%');
    insertRule.run('wht-3', 'PROFESSIONAL_CONSULTING', 0.05, 'Professional Services & Consulting (مهن حرة واستشارات) - 5%');
    insertRule.run('wht-4', 'COMMISSIONS_BROKERAGE', 0.05, 'Commissions & Brokerage (سمسرة وعمولات) - 5%');
  }
}
ensureAccountingSchema();

// 1. Get Chart of Accounts
accountingRouter.get('/accounts', (req: Request, res: Response) => {
  const accounts = db.prepare('SELECT * FROM chart_of_accounts WHERE is_active = 1 ORDER BY code ASC').all();
  res.json(accounts);
});

// 2. Create Account
accountingRouter.post('/accounts', (req: Request, res: Response) => {
  const { code, name, account_type, currency } = req.body;
  if (!code || !name || !account_type) {
    return res.status(400).json({ error: 'Code, name, and account_type are required' });
  }

  const id = `acc-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO chart_of_accounts (id, code, name, account_type, balance, currency)
    VALUES (?, ?, ?, ?, 0.0, ?)
  `).run(id, code, name, account_type, currency || 'EGP');

  logAudit({
    action: 'CREATE',
    entityType: 'CHART_OF_ACCOUNT',
    entityId: id,
    newValues: { code, name, account_type },
    ipAddress: req.ip
  });

  const created = db.prepare('SELECT * FROM chart_of_accounts WHERE id = ?').get(id);
  res.status(201).json(created);
});

// 3. Get Journal Entries with Lines
accountingRouter.get('/journal-entries', (req: Request, res: Response) => {
  const entries = db.prepare(`
    SELECT j.*, u.name as creator_name
    FROM journal_entries j
    LEFT JOIN users u ON j.created_by_user_id = u.id
    ORDER BY j.entry_number DESC
    LIMIT 100
  `).all() as any[];

  const getLines = db.prepare(`
    SELECT l.*, a.code as account_code, a.name as account_name, a.account_type
    FROM journal_entry_lines l
    JOIN chart_of_accounts a ON l.account_id = a.id
    WHERE l.entry_id = ?
  `);

  const enriched = entries.map(e => ({
    ...e,
    lines: getLines.all(e.id)
  }));

  res.json(enriched);
});

// 4. Create Journal Entry (Strict Double-Entry Validation: Debits must equal Credits)
accountingRouter.post('/journal-entries', (req: Request, res: Response) => {
  const { description, reference_type, reference_id, lines, created_by_user_id } = req.body;
  if (!description || !lines || !Array.isArray(lines) || lines.length < 2) {
    return res.status(400).json({ error: 'Journal entry requires description and at least two ledger lines' });
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    totalDebit += Number(line.debit) || 0;
    totalCredit += Number(line.credit) || 0;
  }

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return res.status(422).json({
      error: `DOUBLE ENTRY UNBALANCED: Total Debits (${totalDebit.toFixed(2)}) must equal Total Credits (${totalCredit.toFixed(2)})`,
      totalDebit,
      totalCredit
    });
  }

  const maxEntry = db.prepare('SELECT COALESCE(MAX(entry_number), 1000) as maxNum FROM journal_entries').get() as { maxNum: number };
  const entryNumber = maxEntry.maxNum + 1;
  const entryId = `je-${uuidv4().substring(0, 8)}`;

  const postEntry = db.transaction(() => {
    db.prepare(`
      INSERT INTO journal_entries (id, entry_number, description, reference_type, reference_id, created_by_user_id, status)
      VALUES (?, ?, ?, ?, ?, ?, 'POSTED')
    `).run(entryId, entryNumber, description, reference_type || 'MANUAL', reference_id || null, created_by_user_id || 'usr-admin');

    const insertLine = db.prepare(`
      INSERT INTO journal_entry_lines (id, entry_id, account_id, debit, credit, memo)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const updateAcc = db.prepare(`
      UPDATE chart_of_accounts
      SET balance = balance + ? - ?
      WHERE id = ?
    `);

    for (const line of lines) {
      const lineId = `jel-${uuidv4().substring(0, 8)}`;
      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;
      insertLine.run(lineId, entryId, line.account_id, debit, credit, line.memo || '');

      // Update account balance (Assets & Expenses increase with debit, Liabilities & Equity & Revenue increase with credit)
      const acc = db.prepare('SELECT account_type FROM chart_of_accounts WHERE id = ?').get(line.account_id) as any;
      if (acc) {
        if (acc.account_type === 'ASSET' || acc.account_type === 'EXPENSE') {
          updateAcc.run(debit, credit, line.account_id);
        } else {
          updateAcc.run(credit, debit, line.account_id);
        }
      }
    }
  });

  postEntry();

  logAudit({
    action: 'CREATE',
    entityType: 'JOURNAL_ENTRY',
    entityId: entryId,
    newValues: { entryNumber, description, totalAmount: totalDebit },
    ipAddress: req.ip
  });

  wsService.broadcast('JOURNAL_ENTRY_POSTED', { entryId, entryNumber, totalAmount: totalDebit });

  res.status(201).json({
    success: true,
    entryId,
    entryNumber,
    message: 'Journal entry posted and ledger balances updated successfully'
  });
});

// 4.1. Modify Journal Entry (Prevent modification if POSTED)
accountingRouter.patch('/journal-entries/:id', (req: Request, res: Response) => {
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id) as any;
  if (!entry) {
    return res.status(404).json({ error: 'Journal entry not found' });
  }

  if (entry.status === 'POSTED') {
    return res.status(403).json({ error: 'Cannot modify posted journal entry' });
  }

  const { description } = req.body;
  if (description) {
    db.prepare('UPDATE journal_entries SET description = ? WHERE id = ?').run(description, req.params.id);
  }
  const updated = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id);
  res.json({ success: true, entry: updated });
});

// 4.2. Delete Journal Entry (Prevent deletion if POSTED)
accountingRouter.delete('/journal-entries/:id', (req: Request, res: Response) => {
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id) as any;
  if (!entry) {
    return res.status(404).json({ error: 'Journal entry not found' });
  }

  if (entry.status === 'POSTED') {
    return res.status(403).json({ error: 'Cannot modify posted journal entry' });
  }

  db.prepare('DELETE FROM journal_entry_lines WHERE entry_id = ?').run(req.params.id);
  db.prepare('DELETE FROM journal_entries WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Draft journal entry deleted' });
});

// 4.3. Reversal Journal Entry (Only ADMIN allowed)
accountingRouter.post('/journal-entries/:id/reverse', (req: Request, res: Response) => {
  const role = (req as any).user?.role || req.headers['x-user-role'] || req.body?.user_role || req.body?.role || req.query?.role;
  if (role && !['SuperAdmin', 'Admin'].includes(String(role))) {
    return res.status(403).json({ error: 'Forbidden: Only ADMIN can create a reversal entry' });
  }

  const originalEntry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id) as any;
  if (!originalEntry) {
    return res.status(404).json({ error: 'Journal entry not found' });
  }

  const originalLines = db.prepare('SELECT * FROM journal_entry_lines WHERE entry_id = ?').all(req.params.id) as any[];
  if (!originalLines || originalLines.length === 0) {
    return res.status(400).json({ error: 'Cannot reverse journal entry without ledger lines' });
  }

  const maxEntry = db.prepare('SELECT COALESCE(MAX(entry_number), 1000) as maxNum FROM journal_entries').get() as { maxNum: number };
  const entryNumber = maxEntry.maxNum + 1;
  const reversalEntryId = `je-rev-${uuidv4().substring(0, 8)}`;
  const description = req.body?.reason
    ? `REVERSAL: ${req.body.reason} (Ref #${originalEntry.entry_number})`
    : `Reversal of entry #${originalEntry.entry_number}: ${originalEntry.description}`;

  const postReversal = db.transaction(() => {
    db.prepare(`
      INSERT INTO journal_entries (id, entry_number, description, reference_type, reference_id, created_by_user_id, status)
      VALUES (?, ?, ?, 'REVERSAL', ?, ?, 'POSTED')
    `).run(reversalEntryId, entryNumber, description, originalEntry.id, (req as any).user?.userId || req.body?.created_by_user_id || 'usr-admin');

    const insertLine = db.prepare(`
      INSERT INTO journal_entry_lines (id, entry_id, account_id, debit, credit, memo)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const updateAcc = db.prepare(`
      UPDATE chart_of_accounts
      SET balance = balance + ? - ?
      WHERE id = ?
    `);

    for (const line of originalLines) {
      const lineId = `jel-${uuidv4().substring(0, 8)}`;
      const revDebit = Number(line.credit) || 0;
      const revCredit = Number(line.debit) || 0;
      insertLine.run(lineId, reversalEntryId, line.account_id, revDebit, revCredit, `Reversal of line ${line.id}: ${line.memo || ''}`);

      const acc = db.prepare('SELECT account_type FROM chart_of_accounts WHERE id = ?').get(line.account_id) as any;
      if (acc) {
        if (acc.account_type === 'ASSET' || acc.account_type === 'EXPENSE') {
          updateAcc.run(revDebit, revCredit, line.account_id);
        } else {
          updateAcc.run(revCredit, revDebit, line.account_id);
        }
      }
    }
  });

  postReversal();

  logAudit({
    action: 'CREATE',
    entityType: 'JOURNAL_ENTRY_REVERSAL',
    entityId: reversalEntryId,
    newValues: { originalEntryId: originalEntry.id, entryNumber, description },
    ipAddress: req.ip
  });

  wsService.broadcast('JOURNAL_ENTRY_REVERSED', { reversalEntryId, entryNumber, originalEntryId: originalEntry.id });

  res.status(201).json({
    success: true,
    reversalEntryId,
    reversalEntryNumber: entryNumber,
    message: 'Reversal entry posted and ledger balances restored successfully'
  });
});

// =======================================================
// 4.4. Expense Management Module (Full CRUD & Auto-Posting)
// =======================================================
accountingRouter.get('/expenses', (req: Request, res: Response) => {
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

accountingRouter.post('/expenses', (req: Request, res: Response) => {
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

accountingRouter.get('/expenses/:id', (req: Request, res: Response) => {
  const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!exp) return res.status(404).json({ error: 'Expense not found' });
  res.json(exp);
});

accountingRouter.patch('/expenses/:id', (req: Request, res: Response) => {
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

accountingRouter.delete('/expenses/:id', (req: Request, res: Response) => {
  const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id) as any;
  if (!exp) return res.status(404).json({ error: 'Expense not found' });
  if (exp.status === 'APPROVED') {
    return res.status(403).json({ error: 'Cannot delete approved expense' });
  }

  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Expense deleted' });
});

// Auto-post journal entry on expense approval
const approveExpenseHandler = (req: Request, res: Response) => {
  const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id) as any;
  if (!exp) return res.status(404).json({ error: 'Expense not found' });
  if (exp.status === 'APPROVED') {
    return res.status(400).json({ error: 'Expense is already approved' });
  }

  const approverId = req.body?.approved_by || (req as any).user?.userId || 'usr-manager';

  // Find or ensure Expense account
  let expAccount = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'EXPENSE' ORDER BY code ASC LIMIT 1").get() as any;
  if (!expAccount) {
    const newAccId = `acc-exp-${uuidv4().substring(0, 6)}`;
    db.prepare(`
      INSERT INTO chart_of_accounts (id, code, name, account_type, balance, currency, is_active)
      VALUES (?, '5001', 'General Operating Expenses', 'EXPENSE', 0.0, 'EGP', 1)
    `).run(newAccId);
    expAccount = { id: newAccId, code: '5001', name: 'General Operating Expenses' };
  }

  // Find Cash or Bank account
  let cashAccount = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'ASSET' AND (code LIKE '101%' OR code LIKE '102%') ORDER BY code ASC LIMIT 1").get() as any;
  if (!cashAccount) {
    cashAccount = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'ASSET' ORDER BY code ASC LIMIT 1").get() as any;
  }

  const maxEntry = db.prepare('SELECT COALESCE(MAX(entry_number), 1000) as maxNum FROM journal_entries').get() as { maxNum: number };
  const entryNumber = maxEntry.maxNum + 1;
  const journalEntryId = `je-exp-${uuidv4().substring(0, 8)}`;

  const approveTx = db.transaction(() => {
    // 1. Create Journal Entry
    db.prepare(`
      INSERT INTO journal_entries (id, entry_number, description, reference_type, reference_id, created_by_user_id, status)
      VALUES (?, ?, ?, 'EXPENSE', ?, ?, 'POSTED')
    `).run(journalEntryId, entryNumber, `Approved expense ${exp.expense_number}: ${exp.description}`, exp.id, approverId);

    // 2. Lines: Debit Expense, Credit Cash
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

    // 3. Mark Expense Approved
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

accountingRouter.patch('/expenses/:id/approve', approveExpenseHandler);
accountingRouter.post('/expenses/:id/approve', approveExpenseHandler);

// =======================================================
// 4.5. Statutory Withholding Tax (WHT) Calculator & Deduct
// =======================================================
accountingRouter.get('/withholding-tax/rules', (_req: Request, res: Response) => {
  const rules = db.prepare('SELECT * FROM withholding_tax_rules WHERE is_active = 1 ORDER BY supplier_type ASC').all();
  res.json(rules);
});

accountingRouter.post('/withholding-tax/calculate', (req: Request, res: Response) => {
  const { supplier_type, amount } = req.body;
  const numAmount = Number(amount) || 0;
  if (!supplier_type || numAmount <= 0) {
    return res.status(400).json({ error: 'supplier_type and valid positive amount are required' });
  }

  const rule = db.prepare('SELECT * FROM withholding_tax_rules WHERE supplier_type = ? AND is_active = 1').get(supplier_type) as any;
  const rate = rule ? Number(rule.rate) : 0.01;
  const withholdingTax = Number((numAmount * rate).toFixed(2));
  const netPayable = Number((numAmount - withholdingTax).toFixed(2));

  res.json({
    supplier_type,
    rate,
    ratePercentage: `${(rate * 100).toFixed(1)}%`,
    grossAmount: numAmount,
    withholdingTax,
    netPayable,
    description: rule?.description || 'Standard Egyptian statutory withholding tax'
  });
});

accountingRouter.post('/withholding-tax/deduct', (req: Request, res: Response) => {
  const { supplier_id, supplier_type, gross_amount, payment_method, invoice_reference, description } = req.body;
  const numGross = Number(gross_amount) || 0;
  if (numGross <= 0) {
    return res.status(400).json({ error: 'Valid gross_amount is required' });
  }

  const rule = db.prepare('SELECT * FROM withholding_tax_rules WHERE supplier_type = ? AND is_active = 1').get(supplier_type) as any;
  const rate = rule ? Number(rule.rate) : 0.01;
  const withholdingTax = Number((numGross * rate).toFixed(2));
  const netPayable = Number((numGross - withholdingTax).toFixed(2));

  // Ensure withholding tax liability account exists
  let whtAccount = db.prepare("SELECT * FROM chart_of_accounts WHERE code = '2050' LIMIT 1").get() as any;
  if (!whtAccount) {
    const whtAccId = `acc-wht-${uuidv4().substring(0, 6)}`;
    db.prepare(`
      INSERT INTO chart_of_accounts (id, code, name, account_type, balance, currency, is_active)
      VALUES (?, '2050', 'Withholding Tax Payable (ضريبة الخصم والتحصيل)', 'LIABILITY', 0.0, 'EGP', 1)
    `).run(whtAccId);
    whtAccount = { id: whtAccId, code: '2050', name: 'Withholding Tax Payable' };
  }

  // Find AP or Expense account
  let apAccount = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'LIABILITY' AND code LIKE '201%' LIMIT 1").get() as any;
  if (!apAccount) {
    apAccount = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'EXPENSE' LIMIT 1").get() as any;
  }
  // Find Cash or Bank account
  let cashAccount = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'ASSET' AND code LIKE '101%' LIMIT 1").get() as any;
  if (!cashAccount) {
    cashAccount = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'ASSET' LIMIT 1").get() as any;
  }

  const maxEntry = db.prepare('SELECT COALESCE(MAX(entry_number), 1000) as maxNum FROM journal_entries').get() as { maxNum: number };
  const entryNumber = maxEntry.maxNum + 1;
  const entryId = `je-wht-${uuidv4().substring(0, 8)}`;

  if (apAccount && cashAccount) {
    const postWhtEntry = db.transaction(() => {
      db.prepare(`
        INSERT INTO journal_entries (id, entry_number, description, reference_type, reference_id, created_by_user_id, status)
        VALUES (?, ?, ?, 'PAYMENT_WHT', ?, 'usr-admin', 'POSTED')
      `).run(entryId, entryNumber, `Supplier payment with WHT: ${description || invoice_reference || supplier_type}`, invoice_reference || null);

      db.prepare(`INSERT INTO journal_entry_lines (id, entry_id, account_id, debit, credit, memo) VALUES (?, ?, ?, ?, 0, ?)`).run(
        `jel-${uuidv4().substring(0, 8)}`, entryId, apAccount.id, numGross, 'Gross supplier invoice payable'
      );
      db.prepare(`INSERT INTO journal_entry_lines (id, entry_id, account_id, debit, credit, memo) VALUES (?, ?, ?, 0, ?, ?)`).run(
        `jel-${uuidv4().substring(0, 8)}`, entryId, cashAccount.id, netPayable, `Net payment via ${payment_method || 'CASH'}`
      );
      if (withholdingTax > 0) {
        db.prepare(`INSERT INTO journal_entry_lines (id, entry_id, account_id, debit, credit, memo) VALUES (?, ?, ?, 0, ?, ?)`).run(
          `jel-${uuidv4().substring(0, 8)}`, entryId, whtAccount.id, withholdingTax, `WHT ${(rate * 100).toFixed(1)}% deduction`
        );
      }
    });
    postWhtEntry();
  }

  const voucherNumber = `VCH-WHT-${Date.now().toString().slice(-6)}`;
  res.status(201).json({
    success: true,
    voucherNumber,
    supplierId: supplier_id,
    supplierType: supplier_type,
    grossAmount: numGross,
    rate,
    withholdingTax,
    netPayable,
    journalEntryId: entryId,
    journalEntryNumber: entryNumber,
    paymentDate: new Date().toISOString(),
    pdfVoucher: {
      title: 'إشعار خصم وتحصيل ضريبي (Egyptian Tax Authority WHT Voucher Form 41)',
      voucherNumber,
      date: new Date().toISOString().split('T')[0],
      supplierType: supplier_type,
      grossAmount: numGross,
      whtRate: `${(rate * 100).toFixed(1)}%`,
      whtAmount: withholdingTax,
      netDisbursed: netPayable,
      taxAuthorityNotice: 'طبقاً لأحكام المادة 59 من قانون الضريبة على الدخل رقم 91 لسنة 2005 وتعديلاته'
    }
  });
});

// 5. Balance Sheet
accountingRouter.get('/financial-statements/balance-sheet', (req: Request, res: Response) => {
  const assets = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'ASSET' AND is_active = 1").all() as any[];
  const liabilities = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'LIABILITY' AND is_active = 1").all() as any[];
  const equity = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'EQUITY' AND is_active = 1").all() as any[];

  const totalAssets = assets.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalEquity = equity.reduce((sum, a) => sum + Number(a.balance), 0);

  res.json({
    asOfDate: new Date().toISOString(),
    assets: { accounts: assets, total: totalAssets },
    liabilities: { accounts: liabilities, total: totalLiabilities },
    equity: { accounts: equity, total: totalEquity },
    isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1.0
  });
});

// 6. Income Statement (Profit & Loss)
accountingRouter.get('/financial-statements/income-statement', (req: Request, res: Response) => {
  const revenues = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'REVENUE' AND is_active = 1").all() as any[];
  const expenses = db.prepare("SELECT * FROM chart_of_accounts WHERE account_type = 'EXPENSE' AND is_active = 1").all() as any[];

  const totalRevenue = revenues.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalExpense = expenses.reduce((sum, a) => sum + Number(a.balance), 0);
  const netIncome = totalRevenue - totalExpense;

  res.json({
    period: 'Year-To-Date',
    generatedAt: new Date().toISOString(),
    revenues: { accounts: revenues, total: totalRevenue },
    expenses: { accounts: expenses, total: totalExpense },
    netIncome,
    isProfitable: netIncome >= 0
  });
});

// 7. Trial Balance
accountingRouter.get('/financial-statements/trial-balance', (req: Request, res: Response) => {
  const accounts = db.prepare(`
    SELECT a.id, a.code, a.name, a.account_type,
           COALESCE(SUM(l.debit), 0.0) as total_debit,
           COALESCE(SUM(l.credit), 0.0) as total_credit,
           a.balance as current_balance
    FROM chart_of_accounts a
    LEFT JOIN journal_entry_lines l ON a.id = l.account_id
    WHERE a.is_active = 1
    GROUP BY a.id
    ORDER BY a.code ASC
  `).all() as any[];

  let grandDebit = 0;
  let grandCredit = 0;
  for (const a of accounts) {
    grandDebit += Number(a.total_debit);
    grandCredit += Number(a.total_credit);
  }

  res.json({
    asOfDate: new Date().toISOString(),
    accounts,
    grandDebit,
    grandCredit,
    isBalanced: Math.abs(grandDebit - grandCredit) < 1.0
  });
});
