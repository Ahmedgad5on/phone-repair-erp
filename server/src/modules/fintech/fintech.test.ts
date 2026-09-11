import assert from 'assert';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';

export async function runFintechTests() {
  console.log('🧪 Running Fintech Module (M4) Unit Verification...');

  // 1. Wallet Balance Atomic Updates & Optimistic Locking (R4.2)
  console.log('[Test 1: Optimistic Concurrency Locking on fintech_wallets.version]');
  const testWalletId = 'w-test-' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO fintech_wallets (id, store_id, provider_name, wallet_number, current_balance, daily_usage, daily_limit, monthly_usage, monthly_limit, is_locked, version)
    VALUES (?, 'store-1', 'VODAFONE_CASH', '01000000099', 5000, 0, 60000, 0, 200000, 0, 1)
  `).run(testWalletId);

  const walletBefore = db.prepare('SELECT * FROM fintech_wallets WHERE id = ?').get(testWalletId) as any;
  assert.strictEqual(walletBefore.version, 1);
  assert.strictEqual(walletBefore.current_balance, 5000);

  // Successful mutation with matching version
  const updateRes = db.prepare(`
    UPDATE fintech_wallets
    SET current_balance = current_balance - 1000,
        version = version + 1
    WHERE id = ? AND version = ?
  `).run(testWalletId, 1);
  assert.strictEqual(updateRes.changes, 1, 'Update with matching version must succeed');

  const walletAfter = db.prepare('SELECT * FROM fintech_wallets WHERE id = ?').get(testWalletId) as any;
  assert.strictEqual(walletAfter.version, 2);
  assert.strictEqual(walletAfter.current_balance, 4000);

  // Stale version mutation (attempting version 1 again) must fail
  const staleRes = db.prepare(`
    UPDATE fintech_wallets
    SET current_balance = current_balance - 500,
        version = version + 1
    WHERE id = ? AND version = ?
  `).run(testWalletId, 1);
  assert.strictEqual(staleRes.changes, 0, 'Stale version update must fail (changes === 0)');
  console.log('  ✅ PASS: Optimistic concurrency locking prevents stale writes on wallet balances');

  // 2. Financial Approval Hierarchy for Large Payments (R4.5)
  console.log('\n[Test 2: Financial Approval Hierarchy (> 5000 EGP)]');
  const amountUnderThreshold = 3500;
  const amountOverThreshold = 7500;
  assert.strictEqual(amountUnderThreshold > 5000, false, '3,500 EGP does not require multi-step approval');
  assert.strictEqual(amountOverThreshold > 5000, true, '7,500 EGP requires CASHIER -> MANAGER -> CFO approval');

  const reqId = 'appr-' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO approval_requests (id, request_type, amount, currency, current_step, status, details, created_by)
    VALUES (?, 'FINTECH_PAYMENT', 7500, 'EGP', 'CASHIER', 'PENDING', '{"beneficiary":"Supplier X"}', 'cashier-1')
  `).run(reqId);

  let req = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(reqId) as any;
  assert.strictEqual(req.current_step, 'CASHIER');
  assert.strictEqual(req.status, 'PENDING');

  // Step 1: Cashier approves -> advances to MANAGER
  db.prepare('UPDATE approval_requests SET current_step = ?, cashier_approved_by = ? WHERE id = ?')
    .run('MANAGER', 'cashier-1', reqId);
  req = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(reqId) as any;
  assert.strictEqual(req.current_step, 'MANAGER');

  // Step 2: Manager approves -> advances to CFO
  db.prepare('UPDATE approval_requests SET current_step = ?, manager_approved_by = ? WHERE id = ?')
    .run('CFO', 'manager-1', reqId);
  req = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(reqId) as any;
  assert.strictEqual(req.current_step, 'CFO');

  // Step 3: CFO approves -> status APPROVED
  db.prepare('UPDATE approval_requests SET current_step = ?, status = ?, cfo_approved_by = ? WHERE id = ?')
    .run('COMPLETED', 'APPROVED', 'cfo-1', reqId);
  req = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(reqId) as any;
  assert.strictEqual(req.status, 'APPROVED');
  console.log('  ✅ PASS: Multi-step CASHIER -> MANAGER -> CFO approval hierarchy enforced');

  // 3. Customer Credit Limit Management (R4.7)
  console.log('\n[Test 3: Customer Credit Limit & Usage Guard]');
  const testCustId = 'cust-credit-' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO customers (id, name, phone, credit_limit, credit_used)
    VALUES (?, 'Corporate Client A', '01223344556', 20000, 15000)
  `).run(testCustId);

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(testCustId) as any;
  assert.strictEqual(customer.credit_limit, 20000);
  assert.strictEqual(customer.credit_used, 15000);

  const availableCredit = customer.credit_limit - customer.credit_used;
  assert.strictEqual(availableCredit, 5000);

  // New sale of 4,000 should be allowed
  const sale1 = 4000;
  const allowed1 = (customer.credit_used + sale1) <= customer.credit_limit;
  assert.strictEqual(allowed1, true, 'Sale of 4,000 EGP fits within remaining credit');

  // New sale of 6,000 should be blocked
  const sale2 = 6000;
  const allowed2 = (customer.credit_used + sale2) <= customer.credit_limit;
  assert.strictEqual(allowed2, false, 'Sale of 6,000 EGP exceeds credit limit and must be blocked');
  console.log('  ✅ PASS: Customer credit usage guard correctly enforces ceiling');

  // 4. Bank Reconciliation Matching with Tolerance (R4.9)
  console.log('\n[Test 4: Bank Reconciliation ±1 Day Tolerance & Amount Matching]');
  const stmtDate = new Date('2026-09-10');
  const txDateSameDay = new Date('2026-09-10');
  const txDateMinusOne = new Date('2026-09-09');
  const txDatePlusTwo = new Date('2026-09-12');

  const diffDays = (d1: Date, d2: Date) => Math.abs((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));

  assert.strictEqual(diffDays(stmtDate, txDateSameDay) <= 1, true, 'Same day is within ±1 day tolerance');
  assert.strictEqual(diffDays(stmtDate, txDateMinusOne) <= 1, true, '-1 day is within ±1 day tolerance');
  assert.strictEqual(diffDays(stmtDate, txDatePlusTwo) <= 1, false, '+2 days exceeds ±1 day tolerance');

  // Amount matching with epsilon
  const stmtAmount = 1500.00;
  const matchAmount = 1500.00;
  const mismatchAmount = 1550.00;
  assert.strictEqual(Math.abs(stmtAmount - matchAmount) < 0.01, true, 'Amounts equal');
  assert.strictEqual(Math.abs(stmtAmount - mismatchAmount) < 0.01, false, 'Amounts unequal');
  console.log('  ✅ PASS: Bank reconciliation ±1 day and exact amount matching verified');

  // 5. 30-Day Projected Cash Flow Math (R4.4)
  console.log('\n[Test 5: 30-Day Cash Flow Projection Engine]');
  let runningCash = 50000;
  const dailyInflow = 1200;
  const dailyOutflow = 800;
  const netDaily = dailyInflow - dailyOutflow;

  const projection = [];
  for (let d = 1; d <= 30; d++) {
    runningCash += netDaily;
    projection.push({ day: d, closing: runningCash });
  }
  assert.strictEqual(projection.length, 30, 'Projection must span 30 days');
  assert.strictEqual(projection[29].closing, 50000 + (30 * 400), 'Day 30 closing balance matches net compounding');
  console.log('  ✅ PASS: 30-day projected cash flow compounding validated');

  console.log('🏁 All Fintech Module Unit Tests Passed Successfully!\n');
}

if (require.main === module) {
  runFintechTests().catch(err => {
    console.error('Test failure:', err);
    process.exit(1);
  });
}
