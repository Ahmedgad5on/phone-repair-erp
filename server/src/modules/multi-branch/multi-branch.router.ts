import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { logAudit } from '../../services/audit.service';

export const multiBranchRouter = Router();

/**
 * 1. List Branches & Warehouses
 */
multiBranchRouter.get('/', (_req: Request, res: Response) => {
  try {
    const branches = db.prepare('SELECT * FROM warehouses ORDER BY is_default DESC, name ASC').all();
    res.json(branches);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. Comparative Multi-Branch KPI Performance Dashboard
 */
multiBranchRouter.get('/compare', (_req: Request, res: Response) => {
  try {
    const branches = db.prepare('SELECT id, name, code, location FROM warehouses').all() as any[];

    // Calculate comparative inventory metrics
    const inventoryValuation = db.prepare(`
      SELECT COALESCE(warehouse_id, 'wh-main') as warehouse_id, 
             COUNT(id) as total_items, 
             SUM(quantity_on_hand * cost_price) as total_asset_value,
             SUM(quantity_on_hand) as total_units
      FROM items
      WHERE deleted_at IS NULL
      GROUP BY warehouse_id
    `).all() as any[];

    // Calculate sales volume
    const salesVolume = db.prepare(`
      SELECT COALESCE(store_id, 'wh-main') as branch_id,
             COUNT(id) as transaction_count,
             COALESCE(SUM(total), 0) as total_revenue
      FROM sales
      WHERE deleted_at IS NULL
    `).all() as any[];

    const comparison = branches.map(b => {
      const inv = inventoryValuation.find(v => v.warehouse_id === b.id) || { total_items: 0, total_asset_value: 0, total_units: 0 };
      const sale = salesVolume.find(s => s.branch_id === b.id) || { transaction_count: 0, total_revenue: 0 };
      return {
        branchId: b.id,
        branchName: b.name,
        branchCode: b.code,
        location: b.location,
        totalItemsStocked: inv.total_items,
        totalUnitsInStock: inv.total_units || 0,
        inventoryAssetValue: inv.total_asset_value || 0,
        salesRevenue: sale.total_revenue || 0,
        transactionsCount: sale.transaction_count || 0
      };
    });

    res.json({
      timestamp: new Date().toISOString(),
      branchesCount: branches.length,
      comparison
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. List Inter-Branch Transfers
 */
multiBranchRouter.get('/transfers', (_req: Request, res: Response) => {
  try {
    const transfers = db.prepare(`
      SELECT bt.*, i.name as item_name, i.sku,
             w1.name as from_branch_name, w2.name as to_branch_name
      FROM branch_transfers bt
      JOIN items i ON bt.item_id = i.id
      JOIN warehouses w1 ON bt.from_warehouse_id = w1.id
      JOIN warehouses w2 ON bt.to_warehouse_id = w2.id
      ORDER BY bt.created_at DESC
    `).all();
    res.json(transfers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Initiate Inter-Branch Transfer
 */
multiBranchRouter.post('/transfers', (req: Request, res: Response) => {
  try {
    const { fromWarehouseId, toWarehouseId, itemId, quantity, shippingCost = 0.0, notes = '' } = req.body;
    if (!fromWarehouseId || !toWarehouseId || !itemId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Valid fromWarehouseId, toWarehouseId, itemId, and quantity are required' });
    }

    if (fromWarehouseId === toWarehouseId) {
      return res.status(400).json({ error: 'Origin and destination branch cannot be the same' });
    }

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as any;
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.quantity_on_hand < quantity) {
      return res.status(400).json({ error: `Insufficient inventory. Available: ${item.quantity_on_hand}, Requested: ${quantity}` });
    }

    const transferId = `trf-${Date.now()}`;
    const transferNumber = `TRF-${Date.now().toString().slice(-6)}`;

    // Decrement from origin warehouse
    db.prepare('UPDATE items SET quantity_on_hand = quantity_on_hand - ? WHERE id = ?').run(quantity, itemId);

    db.prepare(`
      INSERT INTO branch_transfers (id, transfer_number, from_warehouse_id, to_warehouse_id, item_id, quantity, shipping_cost, status, initiated_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'IN_TRANSIT', 'SuperAdmin', ?)
    `).run(transferId, transferNumber, fromWarehouseId, toWarehouseId, itemId, quantity, shippingCost, notes);

    logAudit({
      action: 'INITIATE_BRANCH_TRANSFER',
      entityType: 'BRANCH_TRANSFER',
      entityId: transferId,
      newValues: { transferNumber, fromWarehouseId, toWarehouseId, quantity }
    });

    res.status(201).json({
      transferId,
      transferNumber,
      status: 'IN_TRANSIT',
      quantity,
      message: 'Stock transfer initiated and deducted from origin branch'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. Receive and Confirm Inter-Branch Transfer
 */
multiBranchRouter.post('/transfers/:id/receive', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const transfer = db.prepare('SELECT * FROM branch_transfers WHERE id = ?').get(id) as any;
    if (!transfer) return res.status(404).json({ error: 'Transfer record not found' });
    if (transfer.status === 'RECEIVED') {
      return res.status(400).json({ error: 'Transfer has already been received' });
    }

    // Increment inventory at destination
    db.prepare('UPDATE items SET quantity_on_hand = quantity_on_hand + ? WHERE id = ?').run(transfer.quantity, transfer.item_id);

    db.prepare(`
      UPDATE branch_transfers
      SET status = 'RECEIVED', received_at = CURRENT_TIMESTAMP, received_by = 'BranchManager'
      WHERE id = ?
    `).run(id);

    logAudit({
      action: 'RECEIVE_BRANCH_TRANSFER',
      entityType: 'BRANCH_TRANSFER',
      entityId: id,
      newValues: { transferNumber: transfer.transfer_number, receivedAt: new Date().toISOString() }
    });

    res.json({ success: true, message: 'Transfer received and inventory replenished at destination branch' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
