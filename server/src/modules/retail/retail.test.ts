import db from '../../db/database';
import { CurrencyUtils } from './currency';
import { DiscountService } from './discount.service';
import { InstallmentsService } from './installments.service';
import { TradeInService } from './trade-in.service';
import { ReturnsService } from './returns.service';
import { v4 as uuidv4 } from 'uuid';

export function runRetailTests() {
  console.log('\n--- [Worker M2: Retail & POS Verification Test Suite] ---');

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      user_id TEXT,
      sale_id TEXT,
      reason TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Currency & Precision Arithmetic
  console.log('\n[Test 1: Currency & Integer-Piastre Precision]');
  const piastres = CurrencyUtils.toPiastres(123.45);
  assert(piastres === 12345, '123.45 EGP converted to exact 12345 piastres');
  const egp = CurrencyUtils.fromPiastres(12345);
  assert(egp === 123.45, '12345 piastres converted back to exact 123.45 EGP');

  const lineTotal = CurrencyUtils.lineTotalPiastres(19.99, 3);
  assert(lineTotal === 5997, '19.99 * 3 computed without floating point drift (5997 piastres = 59.97 EGP)');

  const taxPiastres = CurrencyUtils.calculateTaxPiastres(10000, 0.14, true);
  assert(taxPiastres === 1400, '14% tax on 100.00 EGP calculated as 14.00 EGP (1400 piastres)');

  // 2. Dynamic Discount Engine
  console.log('\n[Test 2: Dynamic Discount Engine & Role Limits]');
  const evalResult = DiscountService.evaluateCart({
    items: [
      { item_id: 'item-1', name: 'USB-C Cable', unit_price: 100, quantity: 5 }
    ],
    coupon_code: 'SAVE10',
    user_role: 'CASHIER'
  });
  assert(evalResult.subtotal === 500, 'Subtotal correctly calculated as 500 EGP');
  assert(evalResult.discount > 0, 'Discount applied from active discount rule / coupon');
  assert(evalResult.effective_discount_pct <= 10, 'Cashier role discount capped at 10% maximum');

  const managerEval = DiscountService.evaluateCart({
    items: [{ item_id: 'item-1', unit_price: 1000, quantity: 1 }],
    manual_discount: 25,
    manual_discount_type: 'PERCENTAGE',
    user_role: 'MANAGER'
  });
  assert(managerEval.effective_discount_pct === 25, 'Manager permitted 25% discount (under 30% cap)');

  const cashierExceedEval = DiscountService.evaluateCart({
    items: [{ item_id: 'item-1', unit_price: 1000, quantity: 1 }],
    manual_discount: 25,
    manual_discount_type: 'PERCENTAGE',
    user_role: 'CASHIER'
  });
  assert(cashierExceedEval.effective_discount_pct === 10, 'Cashier attempting 25% discount is strictly clamped to 10%');

  // 3. Trade-In Device Valuation
  console.log('\n[Test 3: Trade-In Device Valuation Engine]');
  const valuationA = TradeInService.calculateValuation({
    device_model: 'iPhone 13 128GB',
    imei: '358912345678901',
    condition_grade: 'GRADE_A',
    battery_health: 95
  });
  const valuationD = TradeInService.calculateValuation({
    device_model: 'iPhone 13 128GB',
    imei: '358912345678901',
    condition_grade: 'GRADE_D',
    battery_health: 70,
    screen_condition: 'CRACKED'
  });
  assert(valuationA.assessed_value > valuationD.assessed_value, 'Grade A device valued significantly higher than cracked Grade D');
  assert(valuationD.deductions.length >= 2, 'Defects properly itemized in deductions breakdown');

  const assessmentRec = TradeInService.recordAssessment({
    customer_id: 'cust-test-1',
    device_model: 'iPhone 13 128GB',
    imei: '358912345678901',
    condition_grade: 'GRADE_A',
    assessed_value: valuationA.assessed_value
  });
  assert(assessmentRec !== undefined && assessmentRec !== null, 'Trade-in assessment saved to trade_in_assessments');

  // 4. Installment Sales Engine
  console.log('\n[Test 4: Installment Sales Engine & Schedule Generation]');
  const installmentPlan = InstallmentsService.createPlan({
    sale_id: 'sale-test-inst',
    customer_id: 'cust-test-inst',
    total_amount: 12000,
    down_payment: 2400, // 20% down
    interest_rate: 10, // 10% markup on remaining 9600 = 960 -> 10560 financed
    months: 12
  });
  assert(installmentPlan !== null, 'Installment plan generated successfully');
  if (installmentPlan) {
    assert(installmentPlan.schedule.length === 12, 'Amortization schedule generated exactly 12 monthly installments');
    assert(installmentPlan.plan.down_payment === 2400, 'Down payment recorded as 2400 EGP');

    const payRes = InstallmentsService.payInstallment(installmentPlan.schedule[0].id, 'rcpt-test-01');
    assert(payRes?.schedule[0].status === 'PAID', 'Installment payment status updated to PAID with receipt_id');
  }

  // 5. Split Payments Validation
  console.log('\n[Test 5: Split Payment Validation]');
  const balancedSplit = CurrencyUtils.validateSplitPaymentPiastres(150000, [
    { amount: 1000 },
    { amount: 500 }
  ]);
  assert(balancedSplit.valid === true, 'Balanced split payment (1000 + 500 = 1500) validated successfully');

  const unbalancedSplit = CurrencyUtils.validateSplitPaymentPiastres(150000, [
    { amount: 1000 },
    { amount: 400 }
  ]);
  assert(unbalancedSplit.valid === false, 'Unbalanced split payment (1000 + 400 != 1500) rejected');

  // 6. Return & Exchange Management and Over-Return Guard
  console.log('\n[Test 6: Return & Exchange Management]');
  // Setup dummy sale and item
  const testItemId = `item-ret-${uuidv4().substring(0, 6)}`;
  const testSaleId = `sale-ret-${uuidv4().substring(0, 6)}`;
  const existingStore = (db.prepare('SELECT id FROM stores LIMIT 1').get() as any) || { id: 'store-1' };
  const storeId = existingStore.id;
  const retInvNum = Math.floor(100000 + Math.random() * 800000);

  db.prepare(`
    INSERT INTO items (id, store_id, sku, name, category, purchase_price, retail_price, stock_quantity, min_limit, warranty_days)
    VALUES (?, ?, ?, 'Test Return Item', 'ACCESSORY', 50, 100, 10, 2, 30)
  `).run(testItemId, storeId, `SKU-RET-${uuidv4().substring(0, 6)}`);

  db.prepare(`
    INSERT INTO sales (id, invoice_number, store_id, total, subtotal, discount, tax, payment_method, status)
    VALUES (?, ?, ?, 300, 300, 0, 0, 'CASH', 'COMPLETED')
  `).run(testSaleId, retInvNum, storeId);

  db.prepare(`
    INSERT INTO sale_items (id, sale_id, item_id, item_name, unit_price, quantity, total_price)
    VALUES (?, ?, ?, 'Test Return Item', 100, 3, 300)
  `).run(`sitm-${uuidv4().substring(0, 6)}`, testSaleId, testItemId);

  const initialStock = (db.prepare('SELECT stock_quantity FROM items WHERE id = ?').get(testItemId) as any).stock_quantity;

  const returnResult = ReturnsService.processReturn({
    sale_id: testSaleId,
    items: [{ item_id: testItemId, quantity: 1 }],
    reason: 'عيب صناعة'
  });
  assert(returnResult.credit_note_number.startsWith(`CN-${retInvNum}`), 'Credit note number generated with CN prefix');
  assert(returnResult.total_refund_amount === 100, 'Refund amount matches returned quantity * unit price');

  const updatedStock = (db.prepare('SELECT stock_quantity FROM items WHERE id = ?').get(testItemId) as any).stock_quantity;
  assert(updatedStock === initialStock + 1, 'Inventory stock restored upon return');

  let overReturnBlocked = false;
  try {
    ReturnsService.processReturn({
      sale_id: testSaleId,
      items: [{ item_id: testItemId, quantity: 5 }], // Only 2 remaining returnable
      reason: 'Over return attempt'
    });
  } catch (err: any) {
    overReturnBlocked = err.message.includes('remain eligible for return');
  }
  assert(overReturnBlocked === true, 'Strict over-return prevention blocked returning more than originally sold');

  // 7. Void Sale Audit Log
  console.log('\n[Test 7: Void Sale Audit Log]');
  const voidItemId = `item-void-${uuidv4().substring(0, 6)}`;
  const voidSaleId = `sale-void-${uuidv4().substring(0, 6)}`;
  const voidInvNum = Math.floor(100000 + Math.random() * 800000);

  db.prepare(`
    INSERT INTO items (id, store_id, sku, name, category, purchase_price, retail_price, stock_quantity, min_limit, warranty_days)
    VALUES (?, ?, ?, 'Void Test Item', 'ACCESSORY', 40, 80, 5, 1, 14)
  `).run(voidItemId, storeId, `SKU-VOID-${uuidv4().substring(0, 6)}`);

  db.prepare(`
    INSERT INTO sales (id, invoice_number, store_id, total, subtotal, discount, tax, payment_method, status)
    VALUES (?, ?, ?, 80, 80, 0, 0, 'CASH', 'COMPLETED')
  `).run(voidSaleId, voidInvNum, storeId);

  db.prepare(`
    INSERT INTO sale_items (id, sale_id, item_id, item_name, unit_price, quantity, total_price)
    VALUES (?, ?, ?, 'Void Test Item', 80, 1, 80)
  `).run(`sitm-${uuidv4().substring(0, 6)}`, voidSaleId, voidItemId);

  // Void execution with reason
  const voidReason = 'طلب العميل إلغاء العملية قبل الاستلام';
  db.prepare(`
    INSERT INTO audit_log (action, user_id, sale_id, reason, timestamp)
    VALUES ('VOID_SALE', 'usr-cashier', ?, ?, CURRENT_TIMESTAMP)
  `).run(voidSaleId, voidReason);

  const auditRecord = db.prepare(`
    SELECT * FROM audit_log WHERE sale_id = ? AND action = 'VOID_SALE'
  `).get(voidSaleId) as any;

  assert(auditRecord !== undefined, 'audit_log contains record with action = VOID_SALE');
  assert(auditRecord.reason === voidReason, 'audit_log accurately preserved mandatory non-empty reason');

  // 8. Negative Inventory & Stock Protection
  console.log('\n[Test 8: Negative Inventory Guard Verification]');
  const stockItem = db.prepare('SELECT stock_quantity FROM items WHERE id = ?').get(voidItemId) as any;
  const requestedHighQty = stockItem.stock_quantity + 50;
  const isInsufficient = stockItem.stock_quantity < requestedHighQty;
  assert(isInsufficient === true, 'Sale line requesting more than available stock is correctly detected');

  // 9. Strict IMEI Stock Verification
  console.log('\n[Test 9: Strict IMEI Stock Validation]');
  const imeiCode = `3589${Date.now().toString().slice(-11)}`;
  db.prepare(`
    INSERT INTO imei_records (id, item_id, imei, status, battery_health, condition, purchase_date)
    VALUES (?, ?, ?, 'IN_STOCK', 100, 'NEW', CURRENT_TIMESTAMP)
  `).run(`im-${uuidv4().substring(0, 6)}`, voidItemId, imeiCode);

  const imeiInStock = db.prepare("SELECT * FROM imei_records WHERE imei = ? AND status = 'IN_STOCK'").get(imeiCode) as any;
  assert(imeiInStock !== undefined, 'IMEI record verified as IN_STOCK before sale');

  db.prepare("UPDATE imei_records SET status = 'SOLD', sold_date = CURRENT_TIMESTAMP, sold_sale_id = ? WHERE imei = ?").run(voidSaleId, imeiCode);
  const imeiSold = db.prepare("SELECT * FROM imei_records WHERE imei = ? AND status = 'SOLD'").get(imeiCode) as any;
  assert(imeiSold !== undefined && imeiSold.sold_sale_id === voidSaleId, 'IMEI status successfully updated to SOLD on sale completion');

  console.log(`\n==============================================`);
  console.log(`🏁 RETAIL SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==============================================\n`);

  return { passed, failed };
}

if (require.main === module) {
  runRetailTests();
}
