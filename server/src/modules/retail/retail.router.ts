import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { ReceiptService } from '../../services/receipt.service';
import { WhatsAppService } from '../../services/whatsapp.service';
import { logAudit } from '../../services/audit.service';
import { SalesRepository } from '../../repositories/sales.repository';
import { CurrencyUtils } from './currency';
import { DiscountService } from './discount.service';
import { InstallmentsService } from './installments.service';
import { TradeInService } from './trade-in.service';
import { ReturnsService } from './returns.service';

export const retailRouter = Router();

// Ensure audit_log and invoice_payments tables exist
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      user_id TEXT,
      sale_id TEXT,
      reason TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      reference_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
} catch (e) {
  console.error('[Retail Router] Table initialization notice:', e);
}

// 1. Search Items by Barcode, SKU, or Name (Soft-delete protected)
retailRouter.get('/items', (req: Request, res: Response) => {
  const { q, category } = req.query;
  let sql = 'SELECT * FROM items WHERE deleted_at IS NULL';
  const params: any[] = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (q) {
    sql += ' AND (barcode = ? OR sku = ? OR name LIKE ?)';
    params.push(q, q, `%${q}%`);
  }

  sql += ' ORDER BY stock_quantity ASC, name ASC';
  const items = db.prepare(sql).all(...params);
  res.json(items);
});

// Alias for products
retailRouter.get('/products', (req: Request, res: Response) => {
  const { q, category } = req.query;
  let sql = 'SELECT * FROM items WHERE deleted_at IS NULL';
  const params: any[] = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (q) {
    sql += ' AND (barcode = ? OR sku = ? OR name LIKE ?)';
    params.push(q, q, `%${q}%`);
  }

  sql += ' ORDER BY stock_quantity ASC, name ASC';
  const items = db.prepare(sql).all(...params);
  res.json(items);
});

// 2. Get Available IMEIs for a Phone Item
retailRouter.get('/items/:id/imeis', (req: Request, res: Response) => {
  const imeis = db.prepare(`
    SELECT * FROM imei_records
    WHERE item_id = ? AND status = 'IN_STOCK' AND deleted_at IS NULL
    ORDER BY purchase_date ASC
  `).all(req.params.id);
  res.json(imeis);
});

retailRouter.get('/imei/:id', (req: Request, res: Response) => {
  const imeis = db.prepare(`
    SELECT * FROM imei_records
    WHERE item_id = ? AND status = 'IN_STOCK' AND deleted_at IS NULL
    ORDER BY purchase_date ASC
  `).all(req.params.id);
  res.json(imeis);
});

// 3. Draft or Complete Sale (Split Payments, Strict IMEI, Negative Stock Guard, Precision Currency)
retailRouter.post('/sales', (req: Request, res: Response) => {
  const {
    customer_id, customer_name, customer_phone,
    salesperson_id, cashier_id, payment_method, payments,
    items, discount, discount_type, discount_reason,
    loyalty_points_to_use, tax, is_draft,
    trade_in_id, trade_in_credit
  } = req.body;

  const store = (db.prepare('SELECT * FROM stores LIMIT 1').get() as any) || {
    id: 'store-1',
    name: 'Modular Mobile Tech Lab & POS',
    phone: '01012345678',
    address: 'Cairo, Egypt',
    receipt_header: 'Mobile Tech Solutions',
    receipt_footer: 'Thank you for your business!'
  };

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Sale must contain at least one item' });
  }

  const status = is_draft ? 'DRAFT' : 'COMPLETED';

  // Item validation, Negative Inventory check, and Strict IMEI validation
  const insufficientItems: Array<{
    item_id: string;
    name: string;
    requested: number;
    available: number;
    stock_quantity: number;
    reserved_quantity: number;
  }> = [];

  const frozenItems: Array<{
    item_id: string;
    name: string;
    requested: number;
  }> = [];

  for (const itm of items) {
    const dbItem = db.prepare('SELECT * FROM items WHERE id = ? AND deleted_at IS NULL').get(itm.item_id) as any;
    if (!dbItem) {
      return res.status(400).json({ error: `Item not found: ${itm.item_id}` });
    }

    const requestedQty = Math.max(1, Math.floor(itm.quantity || 1));

    // DEC-023 / DEC-030: Stocktake freeze detection
    if (status === 'COMPLETED' && dbItem.is_frozen === 1) {
      frozenItems.push({
        item_id: itm.item_id,
        name: dbItem.name,
        requested: requestedQty
      });
    }

    // Requirement 8 & DEC-036: Negative Inventory & Repair Stock Reservation Defense
    const reservedQty = Number(dbItem.reserved_quantity) || 0;
    const availableStock = Math.max(0, dbItem.stock_quantity - reservedQty);

    if (status === 'COMPLETED' && availableStock < requestedQty) {
      insufficientItems.push({
        item_id: itm.item_id,
        name: dbItem.name,
        requested: requestedQty,
        available: availableStock,
        stock_quantity: dbItem.stock_quantity,
        reserved_quantity: reservedQty
      });
    }

    // Requirement 10: Strict IMEI Stock Validation (R2.10)
    if (dbItem.category === 'PHONE' || itm.imei) {
      if (!itm.imei || typeof itm.imei !== 'string' || itm.imei.trim() === '') {
        return res.status(400).json({
          error: `STRICT IMEI ENFORCEMENT: Item "${dbItem.name}" requires an IMEI before checkout.`
        });
      }

      const imeiRec = db.prepare('SELECT * FROM imei_records WHERE imei = ? AND deleted_at IS NULL').get(itm.imei.trim()) as any;
      if (!imeiRec || imeiRec.status !== 'IN_STOCK') {
        return res.status(400).json({
          error: `IMEI "${itm.imei}" is not IN_STOCK (current status: ${imeiRec ? imeiRec.status : 'NOT_FOUND'}) for item "${dbItem.name}".`
        });
      }
    }
  }

  // Enforce Stocktake Freeze Guard (DEC-023 / DEC-030)
  let stocktakeOverrideResult: any = null;
  const overrideToken = req.body.manager_override_token || req.body.override_token;

  if (frozenItems.length > 0) {
    if (!overrideToken) {
      return res.status(409).json({
        error: 'ITEM_FROZEN_IN_STOCKTAKE',
        message: `Item "${frozenItems[0].name}" is currently frozen for active stocktake. Manager override required.`,
        item_id: frozenItems[0].item_id,
        frozen_items: frozenItems
      });
    }

    stocktakeOverrideResult = SalesRepository.validateAndConsumeOverrideToken(overrideToken);
    if (!stocktakeOverrideResult.valid) {
      return res.status(403).json({
        error: 'INVALID_OVERRIDE_TOKEN',
        message: stocktakeOverrideResult.error || 'Invalid or expired manager override token'
      });
    }
  }

  if (insufficientItems.length > 0) {
    return res.status(409).json({
      error: 'INSUFFICIENT_AVAILABLE_STOCK',
      message: 'Item has reserved stock allocated to active workshop repairs or insufficient inventory per DEC-036.',
      items: insufficientItems
    });
  }

  // Find or create customer
  let custId = customer_id;
  let customer: any = null;
  if (!custId && customer_phone) {
    const existing = db.prepare('SELECT * FROM customers WHERE phone = ? AND deleted_at IS NULL').get(customer_phone) as any;
    if (existing) {
      custId = existing.id;
      customer = existing;
    } else {
      custId = `cust-${uuidv4().substring(0, 8)}`;
      db.prepare(`
        INSERT INTO customers (id, store_id, name, phone, tag, loyalty_points)
        VALUES (?, ?, ?, ?, 'REGULAR', 0)
      `).run(custId, store.id, customer_name || 'Walk-in Customer', customer_phone);
      customer = { id: custId, name: customer_name, phone: customer_phone, loyalty_points: 0 };
    }
  } else if (custId) {
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(custId) as any;
  }

  // Requirement 6: Integer-Cent / Piastre Precision Calculations
  let subtotalPiastres = 0;
  for (const itm of items) {
    const qty = Math.max(1, Math.floor(itm.quantity || 1));
    subtotalPiastres += CurrencyUtils.lineTotalPiastres(itm.unit_price, qty);
  }

  const dType: 'FIXED' | 'PERCENTAGE' = discount_type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED';
  const discInput = Number(discount) || 0;
  const calculatedDiscountPiastres = CurrencyUtils.calculateDiscountPiastres(subtotalPiastres, dType, discInput);

  // Loyalty points discount (10 points = 1 EGP = 100 Piastres)
  let loyaltyPointsUsed = 0;
  let loyaltyDiscountPiastres = 0;
  if (loyalty_points_to_use && customer) {
    const requestedPoints = Math.min(Number(loyalty_points_to_use), customer.loyalty_points || 0);
    const egpDiscount = Math.floor(requestedPoints / 10);
    loyaltyPointsUsed = egpDiscount * 10;
    loyaltyDiscountPiastres = CurrencyUtils.toPiastres(egpDiscount);
  }

  // Trade-In Credit deduction (Requirement 3)
  const tradeInCreditPiastres = CurrencyUtils.toPiastres(trade_in_credit || 0);

  const totalDiscountPiastres = Math.min(
    subtotalPiastres,
    calculatedDiscountPiastres + loyaltyDiscountPiastres + tradeInCreditPiastres
  );

  const netSubtotalPiastres = Math.max(0, subtotalPiastres - totalDiscountPiastres);
  const taxPiastres = CurrencyUtils.toPiastres(tax || 0);
  const finalTotalPiastres = netSubtotalPiastres + taxPiastres;

  const totalEgp = CurrencyUtils.fromPiastres(finalTotalPiastres);
  const subtotalEgp = CurrencyUtils.fromPiastres(subtotalPiastres);
  const totalDiscountEgp = CurrencyUtils.fromPiastres(totalDiscountPiastres);
  const taxEgp = CurrencyUtils.fromPiastres(taxPiastres);

  // Loyalty points earned (1 point per 10 EGP spent)
  const loyaltyPointsEarned = Math.floor(totalEgp / 10);

  // Requirement 1: Split Payment Multi-Method Validation
  let finalPayments: Array<{ method: string; amount: number; reference_id?: string | null }> = [];
  if (payments && Array.isArray(payments) && payments.length > 0) {
    const validation = CurrencyUtils.validateSplitPaymentPiastres(finalTotalPiastres, payments);
    if (!validation.valid) {
      return res.status(422).json({
        error: 'Split payment total must equal invoice total',
        invoice_total: totalEgp,
        allocated_total: CurrencyUtils.fromPiastres(validation.totalAllocatedPiastres),
        difference: CurrencyUtils.fromPiastres(validation.differencePiastres)
      });
    }
    finalPayments = payments.map(p => ({
      method: p.method || 'CASH',
      amount: CurrencyUtils.fromPiastres(CurrencyUtils.toPiastres(p.amount)),
      reference_id: p.reference_id || null
    }));
  } else {
    // Single payment method
    finalPayments = [{
      method: payment_method || 'CASH',
      amount: totalEgp,
      reference_id: null
    }];
  }

  // Determine master payment method label
  const primaryMethod = finalPayments.length > 1
    ? `SPLIT (${finalPayments.map(p => p.method).join(' + ')})`
    : (finalPayments[0]?.method || payment_method || 'CASH');

  // Generate invoice number
  const maxInv = db.prepare('SELECT COALESCE(MAX(invoice_number), 5000) as maxNum FROM sales').get() as { maxNum: number };
  const invoiceNumber = maxInv.maxNum + 1;
  const saleId = `sale-${uuidv4().substring(0, 8)}`;

  // Atomic database transaction
  const insertSaleTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO sales (
        id, invoice_number, store_id, customer_id, salesperson_id, cashier_id,
        subtotal, discount, discount_type, discount_reason,
        loyalty_points_used, loyalty_points_earned, tax, total, payment_method, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      saleId, invoiceNumber, store.id, custId || null,
      salesperson_id || null, cashier_id || null,
      subtotalEgp, totalDiscountEgp, dType, discount_reason || null,
      loyaltyPointsUsed, loyaltyPointsEarned, taxEgp, totalEgp, primaryMethod, status
    );

    // Record payments in invoice_payments table
    const insertPaymentStmt = db.prepare(`
      INSERT INTO invoice_payments (id, invoice_id, method, amount, reference_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const p of finalPayments) {
      const payRecordId = `invpay-${uuidv4().substring(0, 8)}`;
      insertPaymentStmt.run(payRecordId, saleId, p.method, p.amount, p.reference_id || null);
    }

    // Link trade-in assessment if specified
    if (trade_in_id) {
      TradeInService.linkToInvoice(trade_in_id, saleId);
    }

    // Insert sale lines
    const insertSaleItem = db.prepare(`
      INSERT INTO sale_items (id, sale_id, item_id, item_name, imei, unit_price, quantity, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const itm of items) {
      const saleItemId = `sitm-${uuidv4().substring(0, 8)}`;
      const qty = Math.max(1, Math.floor(itm.quantity || 1));
      const lineTotalEgp = CurrencyUtils.fromPiastres(CurrencyUtils.lineTotalPiastres(itm.unit_price, qty));
      insertSaleItem.run(saleItemId, saleId, itm.item_id, itm.item_name, itm.imei || null, itm.unit_price, qty, lineTotalEgp);

      if (status === 'COMPLETED') {
        // Safe exact stock decrement
        db.prepare('UPDATE items SET stock_quantity = stock_quantity - ?, last_sold_date = CURRENT_TIMESTAMP WHERE id = ?').run(qty, itm.item_id);

        if (stocktakeOverrideResult && frozenItems.some(fi => fi.item_id === itm.item_id)) {
          db.prepare(`
            UPDATE stock_count_items
            SET override_sales_quantity = override_sales_quantity + ?
            WHERE item_id = ? AND status = 'FROZEN'
          `).run(qty, itm.item_id);
        }

        if (itm.imei) {
          db.prepare(`
            UPDATE imei_records
            SET status = 'SOLD', sold_date = CURRENT_TIMESTAMP, sold_sale_id = ?
            WHERE imei = ?
          `).run(saleId, itm.imei);
        }
      } else if (status === 'DRAFT' && itm.imei) {
        db.prepare("UPDATE imei_records SET status = 'DRAFT_SALE' WHERE imei = ?").run(itm.imei);
      }
    }

    if (status === 'COMPLETED' && custId) {
      db.prepare(`
        UPDATE customers
        SET total_spent = total_spent + ?,
            loyalty_points = MAX(0, loyalty_points - ? + ?)
        WHERE id = ?
      `).run(totalEgp, loyaltyPointsUsed, loyaltyPointsEarned, custId);
    }
  });

  insertSaleTx();

  if (stocktakeOverrideResult && frozenItems.length > 0) {
    for (const fi of frozenItems) {
      logAudit({
        userId: stocktakeOverrideResult.manager_id,
        action: 'STOCKTAKE_OVERRIDE_SALE',
        entityType: 'SALE',
        entityId: saleId,
        oldValues: { item_id: fi.item_id, is_frozen: 1 },
        newValues: {
          manager_id: stocktakeOverrideResult.manager_id,
          reason: stocktakeOverrideResult.reason,
          override_token: overrideToken,
          quantity_sold: fi.requested
        },
        ipAddress: req.ip
      });
    }
  }

  logAudit({
    action: 'CREATE',
    entityType: 'SALE',
    entityId: saleId,
    newValues: {
      invoiceNumber,
      total: totalEgp,
      paymentMethod: primaryMethod,
      payments: finalPayments,
      status,
      loyaltyPointsUsed,
      loyaltyPointsEarned,
      tradeInCredit: trade_in_credit || 0
    },
    ipAddress: req.ip
  });

  // Generate ESC/POS Thermal Receipt
  const receiptText = ReceiptService.generateEscPosText({
    storeName: store.name,
    storePhone: store.phone,
    storeAddress: store.address,
    receiptHeader: store.receipt_header,
    receiptFooter: store.receipt_footer,
    invoiceNumber,
    type: 'SALE',
    date: new Date().toISOString(),
    customerName: customer_name || 'Valued Customer',
    customerPhone: customer_phone || '-',
    items: items.map((i: any) => ({
      name: i.item_name,
      qty: i.quantity || 1,
      price: CurrencyUtils.fromPiastres(CurrencyUtils.lineTotalPiastres(i.unit_price, i.quantity || 1)),
      imei: i.imei
    })),
    subtotal: subtotalEgp,
    discount: totalDiscountEgp,
    tax: taxEgp,
    total: totalEgp,
    paymentMethod: primaryMethod,
    cashierName: 'Main Cashier',
    qrOrBarcodeData: `INV-${invoiceNumber}`
  });

  db.prepare('UPDATE sales SET escpos_receipt_text = ? WHERE id = ?').run(receiptText, saleId);

  if (status === 'COMPLETED' && customer_phone) {
    const waMsg = `Thank you for shopping at ${store.name}! Your invoice #${invoiceNumber} total is ${totalEgp.toFixed(2)} EGP (${primaryMethod}). View digital receipt: https://erp.local/inv/${invoiceNumber}`;
    WhatsAppService.sendNotification(store.id, customer_phone, 'SALE_INVOICE', waMsg);
  }

  res.status(201).json({
    saleId,
    invoiceNumber,
    status,
    total: totalEgp,
    subtotal: subtotalEgp,
    discount: totalDiscountEgp,
    tax: taxEgp,
    loyaltyPointsUsed,
    loyaltyPointsEarned,
    paymentMethod: primaryMethod,
    payments: finalPayments,
    receiptText
  });
});

// 4. Split Payments Query for an Invoice
retailRouter.get('/sales/:id/payments', (req: Request, res: Response) => {
  const payments = db.prepare('SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(payments);
});

// 5. Cashier Queue: Get Pending Draft Sales
retailRouter.get('/sales/drafts', (_req: Request, res: Response) => {
  const drafts = db.prepare(`
    SELECT s.*, u.name as salesperson_name, c.name as customer_name, c.phone as customer_phone
    FROM sales s
    LEFT JOIN users u ON s.salesperson_id = u.id
    LEFT JOIN customers c ON s.customer_id = c.id
    WHERE s.status = 'DRAFT' AND s.deleted_at IS NULL
    ORDER BY s.created_at DESC
  `).all();
  res.json(drafts);
});

// 6. Cashier Approves Draft Sale
retailRouter.post('/sales/:id/approve', (req: Request, res: Response) => {
  const { cashier_id, payment_method, manager_override_token, override_token } = req.body;
  const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as any;
  if (!sale) return res.status(404).json({ error: 'Draft sale not found' });
  if (sale.status !== 'DRAFT') return res.status(400).json({ error: 'Sale is not in DRAFT state' });

  const saleItems = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id) as any[];

  // DEC-023 / DEC-030: Stocktake freeze guard before approving draft
  const frozenDraftItems: any[] = [];
  for (const itm of saleItems) {
    const itemRow = db.prepare('SELECT id, name, is_frozen FROM items WHERE id = ?').get(itm.item_id) as any;
    if (itemRow && itemRow.is_frozen === 1) {
      frozenDraftItems.push({
        item_id: itm.item_id,
        name: itemRow.name,
        quantity: itm.quantity
      });
    }
  }

  let draftOverrideResult: any = null;
  const draftOverrideToken = manager_override_token || override_token;

  if (frozenDraftItems.length > 0) {
    if (!draftOverrideToken) {
      return res.status(409).json({
        error: 'ITEM_FROZEN_IN_STOCKTAKE',
        message: `Item "${frozenDraftItems[0].name}" is currently frozen for active stocktake. Manager override required.`,
        item_id: frozenDraftItems[0].item_id,
        frozen_items: frozenDraftItems
      });
    }

    draftOverrideResult = SalesRepository.validateAndConsumeOverrideToken(draftOverrideToken);
    if (!draftOverrideResult.valid) {
      return res.status(403).json({
        error: 'INVALID_OVERRIDE_TOKEN',
        message: draftOverrideResult.error || 'Invalid or expired manager override token'
      });
    }
  }

  // Negative stock and repair reservation guard before approving draft (DEC-036)
  const insufficient: any[] = [];
  for (const itm of saleItems) {
    const currentItem = db.prepare('SELECT stock_quantity, reserved_quantity, name FROM items WHERE id = ?').get(itm.item_id) as any;
    if (currentItem) {
      const reserved = Number(currentItem.reserved_quantity) || 0;
      const available = Math.max(0, currentItem.stock_quantity - reserved);
      if (available < itm.quantity) {
        insufficient.push({
          item_id: itm.item_id,
          name: currentItem.name,
          requested: itm.quantity,
          available,
          stock_quantity: currentItem.stock_quantity,
          reserved_quantity: reserved
        });
      }
    }
  }

  if (insufficient.length > 0) {
    return res.status(409).json({
      error: 'INSUFFICIENT_AVAILABLE_STOCK',
      message: 'Item has reserved stock allocated to active workshop repairs or insufficient inventory per DEC-036.',
      items: insufficient
    });
  }

  for (const itm of saleItems) {
    db.prepare('UPDATE items SET stock_quantity = stock_quantity - ?, last_sold_date = CURRENT_TIMESTAMP WHERE id = ?').run(itm.quantity, itm.item_id);

    if (draftOverrideResult && frozenDraftItems.some(fi => fi.item_id === itm.item_id)) {
      db.prepare(`
        UPDATE stock_count_items
        SET override_sales_quantity = override_sales_quantity + ?
        WHERE item_id = ? AND status = 'FROZEN'
      `).run(itm.quantity, itm.item_id);
    }

    if (itm.imei) {
      db.prepare("UPDATE imei_records SET status = 'SOLD', sold_date = CURRENT_TIMESTAMP, sold_sale_id = ? WHERE imei = ?").run(sale.id, itm.imei);
    }
  }

  db.prepare(`
    UPDATE sales
    SET status = 'COMPLETED',
        cashier_id = ?,
        payment_method = ?
    WHERE id = ?
  `).run(cashier_id || 'usr-cashier', payment_method || 'CASH', sale.id);

  if (sale.customer_id) {
    db.prepare(`
      UPDATE customers
      SET total_spent = total_spent + ?,
          loyalty_points = loyalty_points + ?
      WHERE id = ?
    `).run(sale.total, sale.loyalty_points_earned, sale.customer_id);
  }

  if (draftOverrideResult && frozenDraftItems.length > 0) {
    for (const fi of frozenDraftItems) {
      logAudit({
        userId: draftOverrideResult.manager_id,
        action: 'STOCKTAKE_OVERRIDE_SALE',
        entityType: 'SALE',
        entityId: sale.id,
        oldValues: { item_id: fi.item_id, is_frozen: 1 },
        newValues: {
          manager_id: draftOverrideResult.manager_id,
          reason: draftOverrideResult.reason,
          override_token: draftOverrideToken,
          quantity_sold: fi.quantity
        },
        ipAddress: req.ip
      });
    }
  }

  logAudit({
    action: 'UPDATE',
    entityType: 'SALE',
    entityId: sale.id,
    newValues: { status: 'COMPLETED', cashierId: cashier_id, paymentMethod: payment_method },
    ipAddress: req.ip
  });

  const updated = db.prepare('SELECT * FROM sales WHERE id = ?').get(sale.id);
  res.json({ message: 'Draft sale approved and completed by cashier', sale: updated });
});

// 7. Void / Soft-delete Sale (Requirement 7: Void Sale Audit Log)
const handleVoidSale = (req: Request, res: Response) => {
  const reason = (req.body?.reason || req.query?.reason || '') as string;

  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return res.status(400).json({ error: 'Reason required' });
  }

  const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL').get(req.params.id) as any;
  if (!sale) return res.status(404).json({ error: 'Sale not found' });

  const userId = req.body?.user_id || (req as any).user?.id || 'system';

  // Revert inventory and IMEIs
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id) as any[];
  for (const itm of items) {
    db.prepare('UPDATE items SET stock_quantity = stock_quantity + ? WHERE id = ?').run(itm.quantity, itm.item_id);
    if (itm.imei) {
      db.prepare("UPDATE imei_records SET status = 'IN_STOCK', sold_date = NULL, sold_sale_id = NULL WHERE imei = ?").run(itm.imei);
    }
  }

  // Revert customer spend
  if (sale.customer_id) {
    db.prepare('UPDATE customers SET total_spent = MAX(0, total_spent - ?), loyalty_points = MAX(0, loyalty_points - ?) WHERE id = ?').run(sale.total, sale.loyalty_points_earned, sale.customer_id);
  }

  db.prepare("UPDATE sales SET status = 'VOID', deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(sale.id);

  // Insert into audit_log table with exact action VOID_SALE
  try {
    db.prepare(`
      INSERT INTO audit_log (action, user_id, sale_id, reason, timestamp)
      VALUES ('VOID_SALE', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, sale.id, reason.trim());
  } catch (e) {
    console.error('[VoidSale] Error recording in audit_log:', e);
  }

  // Also log into standard audit_logs
  logAudit({
    userId,
    action: 'VOID_SALE',
    entityType: 'SALE',
    entityId: sale.id,
    newValues: { status: 'VOID', reason: reason.trim() },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: 'Sale voided and inventory restored successfully',
    saleId: sale.id,
    reason: reason.trim()
  });
};

retailRouter.delete('/sales/:id', handleVoidSale);
retailRouter.post('/sales/:id/void', handleVoidSale);

// 8. Return & Exchange Management (Requirement 5: R2.5)
retailRouter.post('/sales/:id/return', (req: Request, res: Response) => {
  try {
    const result = ReturnsService.processReturn({
      sale_id: req.params.id as string,
      items: req.body.items,
      reason: req.body.reason,
      created_by: req.body.created_by,
      ip_address: req.ip
    });
    res.status(201).json(result);
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

retailRouter.get('/sales/:id/returns', (req: Request, res: Response) => {
  const returns = ReturnsService.getSaleReturns(req.params.id as string);
  res.json(returns);
});

// 9. Installment Sales Engine (Requirement 2: R2.2)
retailRouter.post('/installments', (req: Request, res: Response) => {
  try {
    const plan = InstallmentsService.createPlan(req.body);
    res.status(201).json(plan);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

retailRouter.get('/installments/:id/schedule', (req: Request, res: Response) => {
  const data = InstallmentsService.getSchedule(req.params.id as string);
  if (!data) return res.status(404).json({ error: 'Installment plan not found' });
  res.json(data);
});

retailRouter.post('/installments/payments/:id/pay', (req: Request, res: Response) => {
  try {
    const result = InstallmentsService.payInstallment(req.params.id as string, req.body.receipt_id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

retailRouter.post('/installments/send-reminders', (_req: Request, res: Response) => {
  const result = InstallmentsService.sendDueReminders();
  res.json(result);
});

// 10. Trade-In Device Valuation (Requirement 3: R2.3)
retailRouter.post('/trade-in/assess', (req: Request, res: Response) => {
  try {
    const result = TradeInService.calculateValuation(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

retailRouter.post('/trade-in', (req: Request, res: Response) => {
  try {
    const assessment = TradeInService.recordAssessment(req.body);
    res.status(201).json(assessment);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

retailRouter.get('/trade-in', (_req: Request, res: Response) => {
  const assessments = db.prepare('SELECT * FROM trade_in_assessments ORDER BY assessed_at DESC').all();
  res.json(assessments);
});

// 11. Dynamic Discount Engine (Requirement 4: R2.4)
retailRouter.post('/cart/apply-discounts', (req: Request, res: Response) => {
  try {
    const result = DiscountService.evaluateCart(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

retailRouter.get('/discount-rules', (_req: Request, res: Response) => {
  DiscountService.initDefaultRules();
  const rules = db.prepare('SELECT * FROM discount_rules ORDER BY created_at DESC').all();
  res.json(rules);
});

retailRouter.post('/discount-rules', (req: Request, res: Response) => {
  const {
    name, condition_type, condition_value, min_qty,
    customer_tier, time_start, time_end, coupon_code,
    effect_type, effect_value, max_discount_pct
  } = req.body;

  if (!name || !condition_type || !effect_type || effect_value === undefined) {
    return res.status(400).json({ error: 'name, condition_type, effect_type, and effect_value are required' });
  }

  const id = `rule-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO discount_rules (
      id, name, condition_type, condition_value, min_qty, customer_tier,
      time_start, time_end, coupon_code, effect_type, effect_value, max_discount_pct, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id, name, condition_type, condition_value || null, min_qty || 0, customer_tier || null,
    time_start || null, time_end || null, coupon_code ? coupon_code.toUpperCase() : null,
    effect_type, effect_value, max_discount_pct || null
  );

  const created = db.prepare('SELECT * FROM discount_rules WHERE id = ?').get(id);
  res.status(201).json(created);
});

// 12. A4 Tax Invoice Payload
retailRouter.get('/sales/:id/a4-invoice', (req: Request, res: Response) => {
  const sale = db.prepare(`
    SELECT s.*, c.name as customer_name, c.phone as customer_phone, c.loyalty_points as customer_loyalty_points,
           u.name as cashier_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN users u ON s.cashier_id = u.id
    WHERE s.id = ?
  `).get(req.params.id) as any;

  if (!sale) return res.status(404).json({ error: 'Sale not found' });

  const store = db.prepare('SELECT * FROM stores LIMIT 1').get() as any;
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id);

  res.json({
    store,
    sale,
    items,
    qrData: `INV-${sale.invoice_number}|TOTAL-${sale.total}|TAX-${sale.tax}|DATE-${sale.created_at}`
  });
});

// 13. Used / Pre-owned Device Inspection Checklist
retailRouter.get('/used-inspections', (_req: Request, res: Response) => {
  const inspections = db.prepare('SELECT * FROM used_device_inspections ORDER BY created_at DESC').all();
  res.json(inspections);
});

retailRouter.post('/used-inspections', (req: Request, res: Response) => {
  const {
    device_model, imei, battery_health, screen_condition,
    face_touch_id, cameras_working, icloud_status, network_unlocked,
    speaker_mic_working, purchase_price, customer_name, customer_phone, notes
  } = req.body;

  const store = (db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string }) || { id: 'store-1' };
  const id = `insp-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO used_device_inspections (
      id, store_id, device_model, imei, battery_health, screen_condition,
      face_touch_id, cameras_working, icloud_status, network_unlocked,
      speaker_mic_working, purchase_price, customer_name, customer_phone, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, store.id, device_model || 'Unknown', imei || '', battery_health || null, screen_condition || 'GOOD',
    face_touch_id || 'WORKING', cameras_working !== undefined ? cameras_working : 1,
    icloud_status || 'CLEAN', network_unlocked !== undefined ? network_unlocked : 1,
    speaker_mic_working !== undefined ? speaker_mic_working : 1,
    purchase_price || 0.0, customer_name || '', customer_phone || '', notes || ''
  );

  const created = db.prepare('SELECT * FROM used_device_inspections WHERE id = ?').get(id);

  logAudit({
    action: 'CREATE',
    entityType: 'USED_DEVICE_INSPECTION',
    entityId: id,
    newValues: { device_model, imei, battery_health, purchase_price },
    ipAddress: req.ip
  });

  res.status(201).json(created);
});

// 14. Aging Inventory & Dead Stock Tracker
retailRouter.get('/inventory/aging', (_req: Request, res: Response) => {
  const agingItems = db.prepare(`
    SELECT *,
      CAST((julianday('now') - julianday(COALESCE(last_sold_date, created_at))) AS INT) as days_idle
    FROM items
    WHERE stock_quantity > 0 AND deleted_at IS NULL AND (julianday('now') - julianday(COALESCE(last_sold_date, created_at))) >= 30
    ORDER BY days_idle DESC
  `).all();
  res.json(agingItems);
});

retailRouter.get('/aging-stock', (_req: Request, res: Response) => {
  const agingItems = db.prepare(`
    SELECT *,
      CAST((julianday('now') - julianday(COALESCE(last_sold_date, created_at))) AS INT) as days_idle
    FROM items
    WHERE stock_quantity > 0 AND deleted_at IS NULL AND (julianday('now') - julianday(COALESCE(last_sold_date, created_at))) >= 30
    ORDER BY days_idle DESC
  `).all();
  res.json(agingItems);
});

// 15. Missing Demand Log
retailRouter.get('/missing-demand', (_req: Request, res: Response) => {
  const missing = db.prepare('SELECT * FROM missing_demand_log ORDER BY request_count DESC, last_requested_at DESC').all();
  res.json(missing);
});

retailRouter.post('/missing-demand', (req: Request, res: Response) => {
  const { item_name_or_query, customer_phone, notes } = req.body;
  const store = (db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string }) || { id: 'store-1' };

  const existing = db.prepare('SELECT * FROM missing_demand_log WHERE LOWER(item_name_or_query) = LOWER(?)').get(item_name_or_query) as any;

  if (existing) {
    db.prepare(`
      UPDATE missing_demand_log
      SET request_count = request_count + 1,
          customer_phone = COALESCE(?, customer_phone),
          last_requested_at = CURRENT_TIMESTAMP,
          notes = CASE WHEN ? != '' THEN notes || ' | ' || ? ELSE notes END
      WHERE id = ?
    `).run(customer_phone, notes || '', notes || '', existing.id);

    const updated = db.prepare('SELECT * FROM missing_demand_log WHERE id = ?').get(existing.id);
    return res.json({ message: 'Demand request count incremented', demand: updated });
  }

  const id = `md-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO missing_demand_log (id, store_id, item_name_or_query, customer_phone, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, store.id, item_name_or_query, customer_phone || null, notes || '');

  const created = db.prepare('SELECT * FROM missing_demand_log WHERE id = ?').get(id);
  res.status(201).json(created);
});

retailRouter.post('/missing-demand/:id/convert-po', (req: Request, res: Response) => {
  db.prepare("UPDATE missing_demand_log SET suggested_po_status = 'PO_CREATED' WHERE id = ?").run(req.params.id);
  res.json({ message: 'Demand item converted to Purchase Order suggestion.' });
});

retailRouter.post('/missing-demand/:id/convert-to-po', (req: Request, res: Response) => {
  db.prepare("UPDATE missing_demand_log SET suggested_po_status = 'PO_CREATED' WHERE id = ?").run(req.params.id);
  res.json({ message: 'Demand item converted to Purchase Order suggestion.' });
});

// 16. Dual-Screen Customer Facing Display (CFD) (Dev Proposal 8)
retailRouter.post('/cfd/cart', (req: Request, res: Response) => {
  const cartState = req.body;
  const updated = SalesRepository.updateCfdCart(cartState);
  res.json({ success: true, cfd: updated });
});

retailRouter.get('/cfd/cart', (_req: Request, res: Response) => {
  const cfd = SalesRepository.getCfdState();
  res.json(cfd);
});

// 17. Loaner Phones Management (Dev Proposal 13)
retailRouter.get('/loaners', (req: Request, res: Response) => {
  const { status } = req.query;
  const loaners = SalesRepository.getLoanerPhones(status as string);
  res.json(loaners);
});

retailRouter.post('/loaners/checkout', (req: Request, res: Response) => {
  const { loaner_id, ticket_id, customer_id, deposit_amount, due_date } = req.body;
  if (!loaner_id || !ticket_id || !customer_id) {
    return res.status(400).json({ error: 'loaner_id, ticket_id, and customer_id are required' });
  }

  try {
    const result = SalesRepository.checkoutLoaner(loaner_id, ticket_id, customer_id, Number(deposit_amount) || 0, due_date);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

retailRouter.post('/loaners/checkin', (req: Request, res: Response) => {
  const { loaner_id, condition, refund_deposit } = req.body;
  if (!loaner_id) {
    return res.status(400).json({ error: 'loaner_id is required' });
  }

  try {
    const result = SalesRepository.checkinLoaner(loaner_id, condition, refund_deposit !== false);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 18. OCR ID & Warranty Scanner (Dev Proposal 14)
retailRouter.post('/ocr-scan', (req: Request, res: Response) => {
  const { document_text_or_code } = req.body;
  if (!document_text_or_code) {
    return res.status(400).json({ error: 'document_text_or_code string is required' });
  }

  const parsed = SalesRepository.parseOcrDocument(document_text_or_code);
  res.json(parsed);
});

// 19. Smart Dynamic e-Receipts (Dev Proposal 12)
retailRouter.get('/e-receipt/:sale_id', (req: Request, res: Response) => {
  try {
    const receiptData = SalesRepository.generateDynamicReceipt(req.params.sale_id as string);
    res.json(receiptData);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// 20. Manager Override Token Engine (Maint Proposal 56)
retailRouter.post('/override-token', (req: Request, res: Response) => {
  const { manager_id, reason, discount_pct } = req.body;
  if (!manager_id || !reason) {
    return res.status(400).json({ error: 'manager_id and reason are required' });
  }

  const tokenData = SalesRepository.generateOverrideToken(manager_id, reason, Number(discount_pct) || 0);
  res.json(tokenData);
});

retailRouter.post('/verify-override-token', (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }

  const result = SalesRepository.validateAndConsumeOverrideToken(token);
  if (!result.valid) {
    return res.status(400).json(result);
  }
  res.json(result);
});
