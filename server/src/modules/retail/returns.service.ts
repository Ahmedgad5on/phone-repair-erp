import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { CurrencyUtils } from './currency';
import { logAudit } from '../../services/audit.service';

export interface ReturnItemInput {
  item_id: string;
  quantity: number;
  unit_price?: number;
  imei?: string;
}

export interface ProcessReturnParams {
  sale_id: string;
  items: ReturnItemInput[];
  reason: string;
  created_by?: string;
  ip_address?: string;
}

export class ReturnsService {
  /**
   * Process full or partial sale return, generate credit note, restore inventory
   */
  static processReturn(params: ProcessReturnParams) {
    const { sale_id, items, reason, created_by, ip_address } = params;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Return must contain at least one item');
    }
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      throw new Error('Reason required for return');
    }

    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(sale_id) as any;
    if (!sale) {
      throw new Error(`Sale not found: ${sale_id}`);
    }
    if (sale.status === 'VOID') {
      throw new Error('Cannot return items from a voided sale');
    }

    // 1. Fetch original sold items
    const originalItems = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale_id) as any[];
    const originalItemMap = new Map<string, any>();
    for (const oi of originalItems) {
      originalItemMap.set(oi.item_id, oi);
    }

    // 2. Fetch previously returned quantities for this sale
    const previousReturns = db.prepare(`
      SELECT sri.item_id, SUM(sri.quantity) as returned_qty
      FROM sale_return_items sri
      JOIN sale_returns sr ON sri.return_id = sr.id
      WHERE sr.sale_id = ?
      GROUP BY sri.item_id
    `).all(sale_id) as Array<{ item_id: string; returned_qty: number }>;

    const prevReturnedMap = new Map<string, number>();
    for (const pr of previousReturns) {
      prevReturnedMap.set(pr.item_id, pr.returned_qty);
    }

    // 3. Validate return items and prevent over-returning
    let totalRefundPiastres = 0;
    const validatedItems: Array<{
      item_id: string;
      quantity: number;
      unit_price: number;
      refund_amount: number;
      imei?: string;
    }> = [];

    for (const itm of items) {
      const orig = originalItemMap.get(itm.item_id);
      if (!orig) {
        throw new Error(`Item ${itm.item_id} was not purchased in sale #${sale.invoice_number}`);
      }

      const returnQty = Math.floor(itm.quantity || 1);
      if (returnQty <= 0) {
        throw new Error(`Invalid return quantity for item ${itm.item_id}: ${returnQty}`);
      }

      const prevReturned = prevReturnedMap.get(itm.item_id) || 0;
      const maxReturnable = orig.quantity - prevReturned;

      if (returnQty > maxReturnable) {
        throw new Error(
          `Cannot return ${returnQty} units of item "${orig.item_name}". Only ${maxReturnable} units remain eligible for return (Original: ${orig.quantity}, Previously returned: ${prevReturned}).`
        );
      }

      const unitPrice = itm.unit_price !== undefined ? itm.unit_price : orig.unit_price;
      const lineRefundPiastres = CurrencyUtils.lineTotalPiastres(unitPrice, returnQty);
      totalRefundPiastres += lineRefundPiastres;

      validatedItems.push({
        item_id: itm.item_id,
        quantity: returnQty,
        unit_price: unitPrice,
        refund_amount: CurrencyUtils.fromPiastres(lineRefundPiastres),
        imei: itm.imei || orig.imei
      });

      // Update in-memory tracker for duplicate line items
      prevReturnedMap.set(itm.item_id, prevReturned + returnQty);
    }

    const returnId = `ret-${uuidv4().substring(0, 8)}`;
    const creditNoteNumber = `CN-${sale.invoice_number}-${Math.floor(1000 + Math.random() * 9000)}`;
    const totalRefundEgp = CurrencyUtils.fromPiastres(totalRefundPiastres);

    // 4. Atomic Execution in SQLite transaction
    const executeReturnTx = db.transaction(() => {
      // Insert master return record
      db.prepare(`
        INSERT INTO sale_returns (
          id, sale_id, credit_note_number, total_refund_amount, reason, created_by
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        returnId,
        sale_id,
        creditNoteNumber,
        totalRefundEgp,
        reason.trim(),
        created_by || 'Main Cashier'
      );

      const insertReturnItem = db.prepare(`
        INSERT INTO sale_return_items (
          id, return_id, item_id, quantity, unit_price, refund_amount
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const vi of validatedItems) {
        const lineId = `reti-${uuidv4().substring(0, 8)}`;
        insertReturnItem.run(
          lineId,
          returnId,
          vi.item_id,
          vi.quantity,
          vi.unit_price,
          vi.refund_amount
        );

        // Restore inventory stock quantity
        db.prepare(`
          UPDATE items
          SET stock_quantity = stock_quantity + ?
          WHERE id = ?
        `).run(vi.quantity, vi.item_id);

        // Restore IMEI to IN_STOCK if applicable
        if (vi.imei) {
          db.prepare(`
            UPDATE imei_records
            SET status = 'IN_STOCK', sold_date = NULL, sold_sale_id = NULL
            WHERE imei = ?
          `).run(vi.imei);
        }
      }

      // Revert customer spend if applicable
      if (sale.customer_id) {
        db.prepare(`
          UPDATE customers
          SET total_spent = MAX(0, total_spent - ?)
          WHERE id = ?
        `).run(totalRefundEgp, sale.customer_id);
      }
    });

    executeReturnTx();

    logAudit({
      action: 'RETURN_SALE',
      entityType: 'SALE_RETURN',
      entityId: returnId,
      newValues: {
        saleId: sale_id,
        invoiceNumber: sale.invoice_number,
        creditNoteNumber,
        totalRefund: totalRefundEgp,
        reason
      },
      ipAddress: ip_address
    });

    return {
      return_id: returnId,
      sale_id,
      invoice_number: sale.invoice_number,
      credit_note_number: creditNoteNumber,
      total_refund_amount: totalRefundEgp,
      reason,
      items: validatedItems,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Get returns for a given sale
   */
  static getSaleReturns(saleId: string) {
    const returns = db.prepare(`
      SELECT * FROM sale_returns
      WHERE sale_id = ?
      ORDER BY created_at DESC
    `).all(saleId) as any[];

    for (const r of returns) {
      r.items = db.prepare(`
        SELECT sri.*, i.name as item_name, i.sku
        FROM sale_return_items sri
        JOIN items i ON sri.item_id = i.id
        WHERE sri.return_id = ?
      `).all(r.id);
    }

    return returns;
  }
}
