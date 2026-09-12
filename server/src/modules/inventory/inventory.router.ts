import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../../services/audit.service';
import { wsService } from '../../services/ws.service';
import { InventoryRepository } from '../../repositories/inventory.repository';
import { InventoryService } from './inventory.service';
import { requireAuth, requireRole, AuthenticatedRequest } from '../../middleware/auth';

export const inventoryRouter = Router();

// Initialize service tables, columns and initial seed
InventoryService.init();

function getWacValuation() {
  const items = db.prepare(`
    SELECT id, name, sku, category, quality_grade, stock_quantity, purchase_price, wholesale_price, retail_price,
           (stock_quantity * purchase_price) as total_cost_value,
           (stock_quantity * retail_price) as total_retail_value
    FROM items
    WHERE deleted_at IS NULL AND stock_quantity > 0
    ORDER BY total_cost_value DESC
  `).all() as any[];

  const totalCostValue = items.reduce((acc, itm) => acc + Number(itm.total_cost_value), 0);
  const totalRetailValue = items.reduce((acc, itm) => acc + Number(itm.total_retail_value), 0);
  const totalUnits = items.reduce((acc, itm) => acc + Number(itm.stock_quantity), 0);
  const potentialProfit = totalRetailValue - totalCostValue;

  return {
    valuationMethod: 'Weighted Average Cost (WAC)',
    calculatedAt: new Date().toISOString(),
    totalUnits,
    totalCostValue,
    totalRetailValue,
    potentialProfit,
    items
  };
}

// =========================================================================
// 1. Warehouses CRUD
// =========================================================================
inventoryRouter.get('/warehouses', (_req: Request, res: Response) => {
  const warehouses = db.prepare(`
    SELECT w.*,
      (SELECT COUNT(*) FROM items i WHERE i.warehouse_id = w.id AND i.deleted_at IS NULL) as items_count,
      (SELECT COALESCE(SUM(stock_quantity), 0) FROM items i WHERE (i.warehouse_id = w.id OR (w.is_default = 1 AND i.warehouse_id IS NULL)) AND i.deleted_at IS NULL) as total_units
    FROM warehouses w
    WHERE w.is_active = 1
    ORDER BY w.is_default DESC, w.name ASC
  `).all();
  res.json(warehouses);
});

inventoryRouter.post('/warehouses', (req: Request, res: Response) => {
  const { name, code, location } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });

  const id = `wh-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO warehouses (id, name, code, location, is_default, is_active)
    VALUES (?, ?, ?, ?, 0, 1)
  `).run(id, name, code, location || '');

  logAudit({
    action: 'CREATE',
    entityType: 'WAREHOUSE',
    entityId: id,
    newValues: { name, code, location },
    ipAddress: req.ip
  });

  const created = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id);
  res.status(201).json(created);
});

// =========================================================================
// 2. Stock Transfers & Two-Phase Approval (R3.5 & R3.1)
// =========================================================================
inventoryRouter.get('/transfers', (_req: Request, res: Response) => {
  // 1. Fetch completed transfers
  const completedTransfers = db.prepare(`
    SELECT t.*,
           fw.name as from_warehouse_name,
           tw.name as to_warehouse_name,
           u.name as creator_name,
           (SELECT COUNT(*) FROM stock_transfer_items WHERE transfer_id = t.id) as items_count
    FROM stock_transfers t
    LEFT JOIN warehouses fw ON t.from_warehouse_id = fw.id
    LEFT JOIN warehouses tw ON t.to_warehouse_id = tw.id
    LEFT JOIN users u ON t.created_by_user_id = u.id
    ORDER BY t.created_at DESC
  `).all() as any[];

  const getItems = db.prepare(`
    SELECT ti.*, i.name as item_name, i.sku
    FROM stock_transfer_items ti
    JOIN items i ON ti.item_id = i.id
    WHERE ti.transfer_id = ?
  `);

  const enrichedCompleted = completedTransfers.map(t => ({
    ...t,
    items: getItems.all(t.id)
  }));

  // 2. Fetch transfer requests
  const requests = InventoryService.getStockTransferRequests();

  // Return combined list with requests mapped appropriately
  const mappedRequests = (requests as any[]).map(r => ({
    id: r.id,
    transfer_number: r.transfer_number,
    from_warehouse_id: r.from_branch_id,
    to_warehouse_id: r.to_branch_id,
    from_warehouse_name: r.from_branch_name || r.from_branch_id,
    to_warehouse_name: r.to_branch_name || r.to_branch_id,
    status: r.status,
    notes: `Item: ${r.item_name} (${r.item_sku}) - Qty: ${r.quantity}`,
    created_by_user_id: r.requested_by,
    creator_name: r.requested_by,
    created_at: r.requested_at,
    approved_by: r.approved_by,
    approved_at: r.approved_at,
    item_id: r.item_id,
    item_name: r.item_name,
    item_sku: r.item_sku,
    quantity: r.quantity,
    current_stock: r.current_stock,
    is_request: true,
    items_count: 1,
    items: [
      {
        id: `tri-${r.id}`,
        transfer_id: r.id,
        item_id: r.item_id,
        quantity: r.quantity,
        received_quantity: r.status === 'APPROVED' ? r.quantity : 0,
        item_name: r.item_name,
        sku: r.item_sku
      }
    ]
  }));

  res.json([...mappedRequests, ...enrichedCompleted]);
});

inventoryRouter.get('/transfers/requests', (_req: Request, res: Response) => {
  const requests = InventoryService.getStockTransferRequests();
  res.json(requests);
});

inventoryRouter.post('/transfers', (req: Request, res: Response) => {
  // Single-item transfer request support (R3.5: from_branch_id, to_branch_id, item_id, quantity)
  if (req.body.item_id && req.body.quantity !== undefined) {
    try {
      const fromBranch = req.body.from_branch_id || req.body.from_warehouse_id;
      const toBranch = req.body.to_branch_id || req.body.to_warehouse_id;
      const requestedBy = req.body.requested_by || req.body.created_by_user_id || 'usr-admin';

      const transfer = InventoryService.createStockTransferRequest({
        from_branch_id: fromBranch,
        to_branch_id: toBranch,
        item_id: req.body.item_id,
        quantity: Number(req.body.quantity),
        requested_by: requestedBy,
        notes: req.body.notes
      });

      return res.status(201).json({
        success: true,
        transfer,
        message: 'Inter-branch stock transfer request created successfully in PENDING status'
      });
    } catch (err: any) {
      const statusCode = err.statusCode || (err.message.includes('exceeds') ? 409 : 400);
      return res.status(statusCode).json({ error: err.message });
    }
  }

  // Multi-item transfer batch (with Negative Stock Check)
  const { from_warehouse_id, to_warehouse_id, items, notes, created_by_user_id } = req.body;
  if (!from_warehouse_id || !to_warehouse_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Source, destination, and at least one transfer item are required' });
  }

  const maxTransfer = db.prepare('SELECT COALESCE(MAX(transfer_number), 5000) as maxNum FROM stock_transfers').get() as { maxNum: number };
  const transferNumber = maxTransfer.maxNum + 1;
  const transferId = `st-${uuidv4().substring(0, 8)}`;

  try {
    const processTransfer = db.transaction(() => {
      // 1. Pre-check negative stock guard
      for (const itm of items) {
        const itemRow = db.prepare('SELECT id, name, sku, stock_quantity FROM items WHERE id = ?').get(itm.item_id) as any;
        if (!itemRow) throw new Error(`Item ${itm.item_id} not found`);
        if (itemRow.stock_quantity < itm.quantity) {
          const err: any = new Error(`Stock deficit: Item ${itemRow.name} (${itemRow.sku}) only has ${itemRow.stock_quantity} available, requested transfer: ${itm.quantity}`);
          err.statusCode = 409;
          throw err;
        }
      }

      db.prepare(`
        INSERT INTO stock_transfers (id, transfer_number, from_warehouse_id, to_warehouse_id, status, notes, created_by_user_id)
        VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?)
      `).run(transferId, transferNumber, from_warehouse_id, to_warehouse_id, notes || '', created_by_user_id || 'usr-admin');

      const insertItem = db.prepare(`
        INSERT INTO stock_transfer_items (id, transfer_id, item_id, quantity, received_quantity)
        VALUES (?, ?, ?, ?, ?)
      `);

      const updateItemWarehouse = db.prepare(`
        UPDATE items SET warehouse_id = ? WHERE id = ?
      `);

      for (const itm of items) {
        const lineId = `sti-${uuidv4().substring(0, 8)}`;
        insertItem.run(lineId, transferId, itm.item_id, itm.quantity, itm.quantity);
        updateItemWarehouse.run(to_warehouse_id, itm.item_id);
      }
    });

    processTransfer.immediate();

    logAudit({
      action: 'CREATE',
      entityType: 'STOCK_TRANSFER',
      entityId: transferId,
      newValues: { transferNumber, from_warehouse_id, to_warehouse_id, itemCount: items.length },
      ipAddress: req.ip
    });

    wsService.broadcast('STOCK_TRANSFER_COMPLETED', { transferId, transferNumber });

    res.status(201).json({
      success: true,
      transferId,
      transferNumber,
      message: 'Stock transfer executed successfully between warehouses'
    });
  } catch (err: any) {
    const statusCode = err.statusCode || (err.message.includes('deficit') ? 409 : 400);
    res.status(statusCode).json({ error: err.message });
  }
});

inventoryRouter.patch('/transfers/:id/approve', (req: Request, res: Response) => {
  try {
    const approvedBy = (req.body && req.body.approved_by) || (req as any).user?.username || 'usr-admin';
    const approved = InventoryService.approveStockTransferRequest(String(req.params.id), approvedBy);
    res.json({
      success: true,
      transfer: approved,
      message: 'Stock transfer request approved and inventory updated atomically'
    });
  } catch (err: any) {
    const statusCode = err.statusCode || (err.message.includes('deficit') || err.message.includes('Insufficient') ? 409 : 400);
    res.status(statusCode).json({ error: err.message });
  }
});

inventoryRouter.patch('/transfers/:id/reject', (req: Request, res: Response) => {
  try {
    const rejectedBy = (req.body && req.body.rejected_by) || (req as any).user?.username || 'usr-admin';
    const rejected = InventoryService.rejectStockTransferRequest(String(req.params.id), rejectedBy);
    res.json({
      success: true,
      transfer: rejected,
      message: 'Stock transfer request rejected'
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// =========================================================================
// 3. Dead Stock Identification Report (R3.2)
// =========================================================================
inventoryRouter.get('/reports/dead-stock', (req: Request, res: Response) => {
  const days = Number(req.query.days) || 90;
  const report = InventoryService.getDeadStockReport(days);
  res.json(report);
});

inventoryRouter.get('/dead-stock', (req: Request, res: Response) => {
  const days = Number(req.query.days) || 90;
  const report = InventoryService.getDeadStockReport(days);
  res.json(report);
});

inventoryRouter.post('/items/:id/clearance', (req: Request, res: Response) => {
  try {
    const result = InventoryService.markItemForClearance(String(req.params.id), req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// =========================================================================
// 4. Automatic Reorder Point Calculation (R3.3)
// =========================================================================
inventoryRouter.get('/items/:id/reorder-analysis', (req: Request, res: Response) => {
  try {
    const analysis = InventoryService.getReorderAnalysis(String(req.params.id));
    res.json(analysis);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

inventoryRouter.post('/reorder-calculation/run', (_req: Request, res: Response) => {
  try {
    const results = InventoryService.calculateAndApplyAllReorderPoints();
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Lightweight stock status check for repair tickets and POS
inventoryRouter.get('/items/:id/stock', (req: Request, res: Response) => {
  const item = db.prepare('SELECT id, name, sku, stock_quantity, min_limit, reorder_point FROM items WHERE id = ?').get(String(req.params.id)) as any;
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const reorderPoint = item.reorder_point ?? item.min_limit ?? 5;
  res.json({
    id: item.id,
    name: item.name,
    sku: item.sku,
    stock_quantity: item.stock_quantity,
    reorder_point: reorderPoint,
    isLowStock: item.stock_quantity <= reorderPoint,
    isOutOfStock: item.stock_quantity === 0
  });
});

// =========================================================================
// 5. Item Full-Text Search (FTS5) (R3.6)
// =========================================================================
inventoryRouter.get('/items/search', (req: Request, res: Response) => {
  const q = req.query.q as string;
  const items = InventoryService.searchItemsFts(q);
  res.json(items);
});

// =========================================================================
// 6. Inventory Valuation (WAC & FIFO) (R3.9)
// =========================================================================
inventoryRouter.get('/reports/valuation', (req: Request, res: Response) => {
  const method = (req.query.method as string)?.toLowerCase();
  if (method === 'fifo') {
    return res.json(InventoryService.getFifoValuationReport());
  }
  res.json(getWacValuation());
});

inventoryRouter.get('/valuation', (req: Request, res: Response) => {
  const method = (req.query.method as string)?.toLowerCase();
  if (method === 'fifo') {
    return res.json(InventoryService.getFifoValuationReport());
  }
  res.json(getWacValuation());
});

inventoryRouter.get('/wac-valuation', (_req: Request, res: Response) => {
  res.json(getWacValuation());
});

// =========================================================================
// 7. Cost Price History Preservation (FIFO) (R3.7)
// =========================================================================
inventoryRouter.get('/items/:id/cost-history', (req: Request, res: Response) => {
  const history = InventoryService.getItemCostHistory(String(req.params.id));
  res.json(history);
});

inventoryRouter.post('/items/:id/cost-history', (req: Request, res: Response) => {
  const { cost_price, quantity_received, po_id } = req.body;
  if (cost_price === undefined) {
    return res.status(400).json({ error: 'cost_price is required' });
  }

  const id = InventoryService.recordCostPriceHistory(
    String(req.params.id),
    Number(cost_price),
    Number(quantity_received) || 1,
    po_id
  );

  res.status(201).json({ success: true, id, message: 'Item cost history recorded' });
});

// =========================================================================
// 8. Part Cross-Model Compatibility Map (R3.10)
// =========================================================================
inventoryRouter.get('/items/:id/compatibility', (req: Request, res: Response) => {
  const compats = InventoryService.getItemCompatibility(String(req.params.id));
  res.json(compats);
});

inventoryRouter.post('/items/:id/compatibility', (req: Request, res: Response) => {
  const { device_brand, device_model, notes } = req.body;
  if (!device_brand || !device_model) {
    return res.status(400).json({ error: 'device_brand and device_model are required' });
  }

  try {
    const created = InventoryService.addItemCompatibility(
      String(req.params.id),
      device_brand,
      device_model,
      notes
    );
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

inventoryRouter.delete('/items/:id/compatibility/:compatId', (req: Request, res: Response) => {
  try {
    const result = InventoryService.deleteItemCompatibility(String(req.params.compatId));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

inventoryRouter.delete('/compatibility/:compatId', (req: Request, res: Response) => {
  try {
    const result = InventoryService.deleteItemCompatibility(String(req.params.compatId));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// =========================================================================
// 9. Supplier Scorecards (R3.4)
// =========================================================================
inventoryRouter.get('/suppliers/scorecard', (_req: Request, res: Response) => {
  const scores = InventoryService.getSupplierScorecards();
  res.json(scores);
});

inventoryRouter.get('/supplier-scores', (_req: Request, res: Response) => {
  const scores = InventoryService.getSupplierScorecards();
  res.json(scores);
});

// =========================================================================
// 10. Cycle Counts & Locations (Preserved)
// =========================================================================
inventoryRouter.get('/cycle-counts', (_req: Request, res: Response) => {
  const counts = db.prepare(`
    SELECT c.*, w.name as warehouse_name, u.name as counter_name
    FROM stock_counts c
    JOIN warehouses w ON c.warehouse_id = w.id
    LEFT JOIN users u ON c.created_by_user_id = u.id
    ORDER BY c.count_date DESC
  `).all();
  res.json(counts);
});

inventoryRouter.post('/cycle-counts', (req: Request, res: Response) => {
  const { warehouse_id, notes, created_by_user_id } = req.body;
  const id = `sc-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO stock_counts (id, warehouse_id, count_date, status, notes, created_by_user_id)
    VALUES (?, ?, CURRENT_TIMESTAMP, 'COMPLETED', ?, ?)
  `).run(id, warehouse_id, notes || 'Periodic cycle count', created_by_user_id || 'usr-admin');

  res.status(201).json({ id, message: 'Stock cycle count logged successfully' });
});

inventoryRouter.get('/locations', (req: Request, res: Response) => {
  const { warehouse_id } = req.query;
  const locations = InventoryRepository.getLocations(warehouse_id as string);
  res.json(locations);
});

inventoryRouter.post('/locations', (req: Request, res: Response) => {
  const { warehouse_id, zone, rack, shelf, bin, drawer_code, full_code, capacity } = req.body;
  if (!warehouse_id || !rack || !shelf || !bin) {
    return res.status(400).json({ error: 'warehouse_id, rack, shelf, and bin are required' });
  }

  const id = InventoryRepository.createLocation({
    warehouse_id,
    zone: zone || 'A',
    rack,
    shelf,
    bin,
    drawer_code: drawer_code || `D-${rack}${shelf}`,
    full_code: full_code || `${zone || 'A'}-${rack}-${shelf}-${bin}`,
    capacity: Number(capacity) || 100
  });

  res.status(201).json({ success: true, id });
});

inventoryRouter.post('/pick-to-light/trigger', (req: Request, res: Response) => {
  const { location_id, item_name, quantity, color } = req.body;
  if (!location_id) {
    return res.status(400).json({ error: 'location_id is required' });
  }

  try {
    const result = InventoryRepository.triggerPickToLight(
      location_id,
      item_name || 'Item',
      Number(quantity) || 1,
      color || 'GREEN'
    );
    res.json(result);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

inventoryRouter.get('/batches/:item_id', (req: Request, res: Response) => {
  const batches = InventoryRepository.getBatchesForItem(String(req.params.item_id));
  res.json(batches);
});

inventoryRouter.post('/batches', (req: Request, res: Response) => {
  const { item_id, batch_number, lot_number, manufacture_date, expiry_date, quantity, unit_cost } = req.body;
  if (!item_id || !batch_number || quantity === undefined) {
    return res.status(400).json({ error: 'item_id, batch_number, and quantity are required' });
  }

  const id = InventoryRepository.addBatch({
    item_id,
    batch_number,
    lot_number,
    manufacture_date,
    expiry_date,
    quantity: Number(quantity),
    unit_cost: Number(unit_cost) || 0
  });

  // Also record into item_cost_history for FIFO
  InventoryService.recordCostPriceHistory(
    item_id,
    Number(unit_cost) || 0,
    Number(quantity),
    `BATCH-${batch_number}`
  );

  res.status(201).json({ success: true, id, message: 'Stock batch added successfully' });
});

inventoryRouter.post('/cycle-counts/start', (req: Request, res: Response) => {
  const { warehouse_id, item_ids, counter_id, notes } = req.body;
  if (!warehouse_id || !Array.isArray(item_ids) || item_ids.length === 0) {
    return res.status(400).json({ error: 'warehouse_id and item_ids array are required' });
  }

  const result = InventoryRepository.startCycleCount({
    warehouse_id,
    item_ids,
    counter_id,
    notes
  });

  res.status(201).json(result);
});

inventoryRouter.post('/cycle-count-reconcile', (req: Request, res: Response) => {
  const { warehouse_id, cycle_count_id, counts, notes, counter_id } = req.body;
  if (!warehouse_id || !Array.isArray(counts) || counts.length === 0) {
    return res.status(400).json({ error: 'warehouse_id and counts array are required' });
  }

  const result = InventoryRepository.executeCycleCount({
    warehouse_id,
    cycle_count_id,
    counts,
    counter_id,
    notes
  });

  res.status(201).json(result);
});

// =========================================================================
// 21. Liquidation — DEFECTIVE_SCRAP Sale (FR-010 / DEC-035)
// =========================================================================
inventoryRouter.post('/scrap/liquidate', requireAuth, requireRole(['Manager']), (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const { item_id, sale_amount, buyer_name, notes } = req.body;

  if (!item_id || typeof item_id !== 'string') {
    return res.status(422).json({ error: 'item_id is required' });
  }
  if (typeof sale_amount !== 'number' || sale_amount < 0) {
    return res.status(422).json({ error: 'sale_amount must be a non-negative number' });
  }

  const item = db.prepare(
    `SELECT * FROM items WHERE id = ? AND deleted_at IS NULL`
  ).get(item_id) as any;

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  if (item.item_status !== 'DEFECTIVE_SCRAP') {
    return res.status(422).json({ error: `Item is not DEFECTIVE_SCRAP (current status: ${item.item_status || 'ACTIVE'})` });
  }
  if (item.stock_quantity !== 0) {
    return res.status(422).json({ error: 'Item stock_quantity must be 0 before liquidation' });
  }

  try {
    db.transaction(() => {
      // Mark item as LIQUIDATED
      db.prepare(
        `UPDATE items SET item_status = 'LIQUIDATED' WHERE id = ?`
      ).run(item_id);

    // Record the liquidation in supplier_returns (reuse as liquidation record)
    // SQLite doesn't support ORDER BY in UPDATE, so use a subquery
    const rtvUpdate = db.prepare(
      `UPDATE supplier_returns
       SET status = 'LIQUIDATED', liquidated_at = datetime('now'), liquidated_by = ?, liquidation_amount = ?
       WHERE id = (
         SELECT id FROM supplier_returns
         WHERE item_id = ? AND status = 'REJECTED'
         ORDER BY created_at DESC LIMIT 1
       )`
    ).run(userId, sale_amount, item_id);

    if (rtvUpdate.changes === 0) {
      throw new Error('No rejected supplier return found for this item');
    }

    logAudit({
      userId,
      action: 'SCRAP_LIQUIDATED',
      entityType: 'item',
      entityId: item_id,
      newValues: {
        item_status: 'LIQUIDATED',
        sale_amount,
        buyer_name: buyer_name || null,
        notes: notes || null,
      },
    });
  })();

  res.json({
    success: true,
    message: `Item liquidated successfully`,
    item_id,
    sale_amount,
  });
  } catch (err: any) {
    return res.status(422).json({ error: err.message || 'Liquidation failed' });
  }
});
