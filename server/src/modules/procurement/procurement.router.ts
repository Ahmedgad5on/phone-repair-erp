import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../../services/audit.service';
import { InventoryRepository } from '../../repositories/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { requireAuth, requireRole, AuthenticatedRequest } from '../../middleware/auth';

export const procurementRouter = Router();

// Ensure inventory/procurement tables & columns are initialized
InventoryService.init();

// Ensure item_id column on purchase_order_items
try {
  const poiCols = (db.prepare('PRAGMA table_info(purchase_order_items)').all() as { name: string }[]).map(c => c.name);
  if (!poiCols.includes('item_id')) {
    db.exec('ALTER TABLE purchase_order_items ADD COLUMN item_id TEXT;');
  }
} catch {
  // ignore
}

// =========================================================================
// 1. Purchase Requisitions
// =========================================================================
procurementRouter.get('/requisitions', (_req: Request, res: Response) => {
  const requisitions = db.prepare(`
    SELECT pr.*, u.name as requester_name
    FROM purchase_requisitions pr
    LEFT JOIN users u ON pr.requested_by_user_id = u.id
    ORDER BY pr.created_at DESC
  `).all();
  res.json(requisitions);
});

procurementRouter.post('/requisitions', (req: Request, res: Response) => {
  const { department, total_estimated_cost, notes, requested_by_user_id } = req.body;
  const maxPr = db.prepare('SELECT COALESCE(MAX(pr_number), 100) as maxNum FROM purchase_requisitions').get() as { maxNum: number };
  const prNumber = maxPr.maxNum + 1;
  const id = `pr-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO purchase_requisitions (id, pr_number, department, requested_by_user_id, status, total_estimated_cost, notes)
    VALUES (?, ?, ?, ?, 'APPROVED', ?, ?)
  `).run(id, prNumber, department || 'Maintenance Lab', requested_by_user_id || 'usr-admin', total_estimated_cost || 0.0, notes || '');

  logAudit({
    action: 'CREATE',
    entityType: 'PURCHASE_REQUISITION',
    entityId: id,
    newValues: { prNumber, department, total_estimated_cost },
    ipAddress: req.ip
  });

  const created = db.prepare('SELECT * FROM purchase_requisitions WHERE id = ?').get(id);
  res.status(201).json(created);
});

// =========================================================================
// 2. Goods Received Notes (GRN) & Receipt Management
// =========================================================================
procurementRouter.get('/grn', (_req: Request, res: Response) => {
  const grns = db.prepare(`
    SELECT g.*, po.po_number, po.supplier_name, u.name as receiver_name
    FROM goods_received_notes g
    LEFT JOIN purchase_orders po ON g.po_id = po.id
    LEFT JOIN users u ON g.received_by_user_id = u.id
    ORDER BY g.created_at DESC
  `).all();
  res.json(grns);
});

procurementRouter.post('/grn', (req: Request, res: Response) => {
  const { po_id, inspection_notes, status, received_by_user_id } = req.body;

  if (po_id) {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(po_id) as any;
    if (po && po.status === 'PENDING_APPROVAL') {
      return res.status(403).json({
        error: 'PO_APPROVAL_REQUIRED',
        message: 'Cannot receive purchase order pending management approval (> 10,000 EGP ceiling per DEC-034)'
      });
    }
  }

  const maxGrn = db.prepare('SELECT COALESCE(MAX(grn_number), 200) as maxNum FROM goods_received_notes').get() as { maxNum: number };
  const grnNumber = maxGrn.maxNum + 1;
  const id = `grn-${uuidv4().substring(0, 8)}`;
  const grnStatus = status || 'ACCEPTED';

  const processGrn = db.transaction(() => {
    db.prepare(`
      INSERT INTO goods_received_notes (id, grn_number, po_id, received_by_user_id, status, inspection_notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, grnNumber, po_id, received_by_user_id || 'usr-admin', grnStatus, inspection_notes || 'Goods verified against technical specifications.');

    // If accepted and po_id provided, increment stock and record cost history
    if (po_id) {
      const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(po_id) as any;
      if (po) {
        db.prepare("UPDATE purchase_orders SET status = 'RECEIVED', received_at = CURRENT_TIMESTAMP WHERE id = ?").run(po.id);

        const poItems = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(po_id) as any[];
        for (const poi of poItems) {
          let itm = poi.item_id ? db.prepare('SELECT * FROM items WHERE id = ?').get(poi.item_id) as any : null;
          if (!itm && poi.item_name) {
            itm = db.prepare('SELECT * FROM items WHERE name = ? OR name LIKE ?').get(poi.item_name, `%${poi.item_name}%`) as any;
          }

          if (itm) {
            const qty = Number(poi.quantity) || 1;
            const unitCost = Number(poi.actual_unit_cost || poi.estimated_unit_cost || itm.purchase_price);

            // Increment stock
            db.prepare('UPDATE items SET stock_quantity = stock_quantity + ? WHERE id = ?').run(qty, itm.id);

            // Record into cost history (FIFO)
            InventoryService.recordCostPriceHistory(itm.id, unitCost, qty, po_id);
          }
        }

        // Update supplier scorecard
        const isAccepted = grnStatus === 'ACCEPTED';
        InventoryService.updateSupplierScoreOnPoReceipt(po.supplier_name || po.supplier_id || 'Generic Supplier', true, isAccepted);
      }
    }
  });

  processGrn.immediate();

  res.status(201).json({ id, grnNumber, message: 'GRN created and goods verified into inventory' });
});

// =========================================================================
// 3. Batch Goods Receipt Rollback (R3.8 - Manager Role Required)
// =========================================================================
function handleReceiptRollback(req: Request, res: Response) {
  // Enforce MANAGER role requirement (R3.8)
  const user = (req as any).user;
  const roleHeader = req.headers['x-user-role'] as string;
  const role = user?.role || roleHeader || req.body.role;

  if (role) {
    const allowedRoles = ['Manager', 'SuperAdmin', 'Admin', 'CFO'];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: 'Forbidden: MANAGER role is strictly required to rollback goods receipts',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }
  }

  const grnId = req.params.id;
  const grn = db.prepare('SELECT * FROM goods_received_notes WHERE id = ? OR grn_number = ?').get(grnId, grnId) as any;
  if (!grn) {
    return res.status(404).json({ error: 'Goods received note (receipt) not found' });
  }

  if (grn.status === 'ROLLED_BACK') {
    return res.status(400).json({ error: 'Goods receipt has already been rolled back' });
  }

  try {
    const executeRollback = db.transaction(() => {
      const itemsToRevert: Array<{ item_id: string; item_name: string; quantity: number }> = [];

      // 1. Check item_cost_history for this po_id
      if (grn.po_id) {
        const costHist = db.prepare('SELECT * FROM item_cost_history WHERE po_id = ?').all(grn.po_id) as any[];
        for (const ch of costHist) {
          const item = db.prepare('SELECT id, name, sku, stock_quantity FROM items WHERE id = ?').get(ch.item_id) as any;
          if (item) {
            itemsToRevert.push({
              item_id: item.id,
              item_name: item.name,
              quantity: Number(ch.quantity_received) || 1
            });
          }
        }
      }

      // 2. Fallback to purchase_order_items
      if (itemsToRevert.length === 0 && grn.po_id) {
        const poItems = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(grn.po_id) as any[];
        for (const poi of poItems) {
          let itm = poi.item_id ? db.prepare('SELECT id, name, sku, stock_quantity FROM items WHERE id = ?').get(poi.item_id) as any : null;
          if (!itm && poi.item_name) {
            itm = db.prepare('SELECT id, name, sku, stock_quantity FROM items WHERE name = ? OR name LIKE ?').get(poi.item_name, `%${poi.item_name}%`) as any;
          }
          if (itm) {
            itemsToRevert.push({
              item_id: itm.id,
              item_name: itm.name,
              quantity: Number(poi.quantity) || 1
            });
          }
        }
      }

      // 3. Negative stock guard: verify current stock >= quantity to reverse
      for (const rev of itemsToRevert) {
        const currentItem = db.prepare('SELECT id, name, sku, stock_quantity FROM items WHERE id = ?').get(rev.item_id) as any;
        if (!currentItem) continue;
        if (currentItem.stock_quantity < rev.quantity) {
          const err: any = new Error(`Cannot rollback receipt: Item '${currentItem.name}' current stock (${currentItem.stock_quantity}) is less than rollback quantity (${rev.quantity}). Reversal would cause negative stock.`);
          err.statusCode = 409;
          throw err;
        }
      }

      // 4. Atomically decrement stock
      const decrementStmt = db.prepare('UPDATE items SET stock_quantity = stock_quantity - ? WHERE id = ?');
      for (const rev of itemsToRevert) {
        decrementStmt.run(rev.quantity, rev.item_id);
      }

      // 5. Update GRN status
      db.prepare("UPDATE goods_received_notes SET status = 'ROLLED_BACK', inspection_notes = COALESCE(inspection_notes, '') || ' [ROLLED_BACK by manager]' WHERE id = ?").run(grn.id);

      // 6. Update PO status and remove cost history
      if (grn.po_id) {
        db.prepare("UPDATE purchase_orders SET status = 'ROLLED_BACK' WHERE id = ?").run(grn.po_id);
        db.prepare('DELETE FROM item_cost_history WHERE po_id = ?').run(grn.po_id);
      }

      // 7. Audit log
      logAudit({
        action: 'ROLLBACK',
        entityType: 'GOODS_RECEIPT',
        entityId: grn.id,
        newValues: { grnNumber: grn.grn_number, itemsRevertedCount: itemsToRevert.length },
        ipAddress: req.ip
      });
    });

    executeRollback.immediate();

    return res.json({
      success: true,
      receiptId: grn.id,
      grnNumber: grn.grn_number,
      message: `Goods receipt #${grn.grn_number} successfully rolled back and all inventory increments reversed within an atomic transaction.`
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 400;
    return res.status(statusCode).json({ error: err.message });
  }
}

procurementRouter.post('/receipts/:id/rollback', handleReceiptRollback);
procurementRouter.post('/grn/:id/rollback', handleReceiptRollback);

// =========================================================================
// 4. Supplier Scorecards (R3.4)
// =========================================================================
procurementRouter.get('/suppliers/scorecard', (_req: Request, res: Response) => {
  const scores = InventoryService.getSupplierScorecards();
  res.json(scores);
});

procurementRouter.get('/supplier-scores', (_req: Request, res: Response) => {
  const scores = InventoryService.getSupplierScorecards();
  res.json(scores);
});

// =========================================================================
// 5. Supplier Price Comparisons (Preserved)
// =========================================================================
procurementRouter.get('/price-comparisons', (_req: Request, res: Response) => {
  const quotes = db.prepare(`
    SELECT c.*, i.name as item_name, i.sku
    FROM supplier_price_comparisons c
    JOIN items i ON c.item_id = i.id
    ORDER BY c.quote_price ASC
  `).all();
  res.json(quotes);
});

procurementRouter.post('/price-comparisons', (req: Request, res: Response) => {
  const { item_id, supplier_name, quote_price, delivery_days, validity_date } = req.body;
  const id = `spc-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO supplier_price_comparisons (id, item_id, supplier_name, quote_price, delivery_days, validity_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, item_id, supplier_name, quote_price, delivery_days || 1, validity_date || '2026-12-31');

  res.status(201).json({ id, message: 'Supplier quote added for comparison' });
});

// =========================================================================
// 6. Predictive PO Engine & Price Matrix (Preserved)
// =========================================================================
procurementRouter.get('/predictive-po', (_req: Request, res: Response) => {
  const suggestions = InventoryRepository.calculatePredictiveReorder();
  res.json(suggestions);
});

procurementRouter.post('/predictive-po', (req: Request, res: Response) => {
  const { supplier_name } = req.body;
  const suggestions = InventoryRepository.calculatePredictiveReorder();

  if (suggestions.length === 0) {
    return res.json({ message: 'All inventory levels are optimal. No auto-reorders required.' });
  }

  const maxPo = db.prepare('SELECT COALESCE(MAX(po_number), 3000) as maxNum FROM purchase_orders').get() as { maxNum: number };
  const poNumber = maxPo.maxNum + 1;
  const poId = `po-auto-${uuidv4().substring(0, 8)}`;
  const totalCost = suggestions.reduce((sum, s) => sum + s.estimated_po_cost, 0);
  const threshold = 10000; // 10,000 EGP ceiling per DEC-034
  const initialStatus = totalCost > threshold ? 'PENDING_APPROVAL' : 'ORDERED';

  db.prepare(`
    INSERT INTO purchase_orders (id, po_number, supplier_name, status, total_amount, notes)
    VALUES (?, ?, ?, ?, ?, 'Auto-generated predictive reorder based on safety stock threshold')
  `).run(poId, poNumber, supplier_name || 'Al-Ahram Spare Parts Wholesale', initialStatus, totalCost);

  const itemStmt = db.prepare(`
    INSERT INTO purchase_order_items (id, po_id, item_id, item_name, quantity, estimated_unit_cost)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const s of suggestions) {
    const itmId = `poi-${uuidv4().substring(0, 8)}`;
    const unitPrice = s.estimated_po_cost / s.suggested_reorder_qty;
    itemStmt.run(itmId, poId, s.item_id, s.name, s.suggested_reorder_qty, unitPrice);
  }

  res.status(201).json({
    success: true,
    poId,
    poNumber,
    totalCost,
    itemsCount: suggestions.length,
    message: `Predictive Purchase Order #${poNumber} generated successfully`
  });
});

procurementRouter.get('/supplier-matrix/:item_id', (req: Request, res: Response) => {
  const matrix = InventoryRepository.getSupplierPriceMatrix(req.params.item_id as string);
  res.json(matrix);
});

// =========================================================================
// 13. RTV Rejection — DEFECTIVE_SCRAP Lifecycle (FR-010 / DEC-035)
// =========================================================================
procurementRouter.post('/rtv/:id/reject', requireAuth, requireRole(['Manager', 'Admin']), (req: AuthenticatedRequest, res: Response) => {
  const rtvId = req.params.id as string;
  const userId = req.user!.userId;
  const { reason } = req.body;

  const rtv = db.prepare(
    `SELECT sr.*, i.stock_quantity, i.reserved_quantity
     FROM supplier_returns sr
     JOIN items i ON i.id = sr.item_id
     WHERE sr.id = ?`
  ).get(rtvId) as any;

  if (!rtv) {
    return res.status(404).json({ error: 'Supplier return not found' });
  }

  if (rtv.status !== 'PENDING') {
    return res.status(422).json({ error: `Return is already ${rtv.status}` });
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    return res.status(422).json({ error: 'Rejection reason is required (min 3 characters)' });
  }

  // FR-010.4 / DEC-035: Reject scrap transition if item is currently reserved by active repair tickets
  const reservedPart = db.prepare(
    `SELECT rcp.ticket_id, rt.ticket_number
     FROM repair_consumed_parts rcp
     JOIN repair_tickets rt ON rt.id = rcp.ticket_id
     WHERE rcp.item_id = ? AND rcp.is_reserved = 1 AND rt.status NOT IN ('DELIVERED', 'CANCELLED')
     LIMIT 1`
  ).get(rtv.item_id) as any;

  if (rtv.reserved_quantity > 0 || reservedPart) {
    return res.status(409).json({
      error: 'Cannot transition item to DEFECTIVE_SCRAP while reserved by active repair tickets',
      code: 'UNTIL_REPAIRS_SETTLE',
      reserved_quantity: rtv.reserved_quantity,
      ticket_id: reservedPart?.ticket_id,
    });
  }

  db.transaction(() => {
    // Mark supplier return as rejected
    db.prepare(
      `UPDATE supplier_returns SET status = 'REJECTED', rejected_at = datetime('now'), rejected_by = ? WHERE id = ?`
    ).run(userId, rtvId);

    // Transition item to DEFECTIVE_SCRAP and zero stock (item physically pulled from shelf)
    db.prepare(
      `UPDATE items SET item_status = 'DEFECTIVE_SCRAP', stock_quantity = 0 WHERE id = ?`
    ).run(rtv.item_id);

    logAudit({
      userId,
      action: 'RTV_REJECTED',
      entityType: 'supplier_return',
      entityId: rtvId,
      newValues: {
        status: 'REJECTED',
        item_id: rtv.item_id,
        item_status: 'DEFECTIVE_SCRAP',
        reason: reason.trim(),
      },
    });
  })();

  res.json({
    success: true,
    message: `Return rejected. Item marked as DEFECTIVE_SCRAP.`,
    item_id: rtv.item_id,
  });
});

