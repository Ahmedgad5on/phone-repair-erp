import db from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { wsService } from '../services/ws.service';

export interface WarehouseLocation {
  id?: string;
  warehouse_id: string;
  zone: string;
  rack: string;
  shelf: string;
  bin: string;
  drawer_code: string;
  full_code: string;
  capacity?: number;
  current_items_count?: number;
}

export interface ItemBatch {
  id?: string;
  item_id: string;
  batch_number: string;
  lot_number?: string;
  manufacture_date?: string;
  expiry_date?: string;
  quantity: number;
  unit_cost: number;
}

export class InventoryRepository {
  // 2.5D Bin/Drawer Micro-Locator (Dev Proposal 15)
  static getLocations(warehouseId?: string) {
    let query = 'SELECT * FROM warehouse_locations WHERE 1=1';
    const params: any[] = [];
    if (warehouseId) {
      query += ' AND warehouse_id = ?';
      params.push(warehouseId);
    }
    query += ' ORDER BY zone ASC, rack ASC, shelf ASC, bin ASC';
    return db.prepare(query).all(...params);
  }

  static createLocation(data: WarehouseLocation): string {
    const id = data.id || `loc-${uuidv4().substring(0, 8)}`;
    const fullCode = data.full_code || `${data.zone}-${data.rack}-${data.shelf}-${data.bin}`;
    db.prepare(`
      INSERT INTO warehouse_locations (
        id, warehouse_id, zone, rack, shelf, bin, drawer_code, full_code, capacity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.warehouse_id, data.zone, data.rack, data.shelf, data.bin, data.drawer_code, fullCode, data.capacity || 100);
    return id;
  }

  // Pick-to-Light Integration (Dev Proposal 16)
  static triggerPickToLight(locationId: string, itemName: string, quantity: number, color: string = 'GREEN') {
    const loc = db.prepare('SELECT * FROM warehouse_locations WHERE id = ?').get(locationId) as WarehouseLocation;
    if (!loc) {
      throw new Error(`Location not found: ${locationId}`);
    }

    const payload = {
      locationId,
      drawerCode: loc.drawer_code,
      fullCode: loc.full_code,
      rack: loc.rack,
      shelf: loc.shelf,
      bin: loc.bin,
      itemName,
      quantity,
      lightColor: color,
      triggeredAt: new Date().toISOString(),
      pulseDurationSeconds: 15
    };

    // Broadcast pick light command to connected hardware / workstation screens
    wsService.broadcast('PICK_TO_LIGHT_TRIGGER', payload);

    return {
      success: true,
      message: `Pick-to-light LED activated on drawer ${loc.drawer_code} (${loc.full_code})`,
      ...payload
    };
  }

  // Serial & Batch Number Tracking (Dev Proposal 18)
  static addBatch(batch: ItemBatch): string {
    const id = batch.id || `batch-${uuidv4().substring(0, 8)}`;
    db.prepare(`
      INSERT INTO item_batches (
        id, item_id, batch_number, lot_number, manufacture_date, expiry_date, quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      batch.item_id,
      batch.batch_number,
      batch.lot_number || null,
      batch.manufacture_date || null,
      batch.expiry_date || null,
      batch.quantity,
      batch.unit_cost
    );

    // Increase total item quantity in items table
    db.prepare('UPDATE items SET stock_quantity = stock_quantity + ? WHERE id = ?').run(batch.quantity, batch.item_id);

    return id;
  }

  static getBatchesForItem(itemId: string) {
    return db.prepare(`
      SELECT * FROM item_batches
      WHERE item_id = ? AND quantity > 0
      ORDER BY COALESCE(expiry_date, '9999-12-31') ASC, received_at ASC
    `).all(itemId);
  }

  // Cycle Counting Variance & Reconciliation (Dev Proposal 19)
  static executeCycleCount(data: { warehouse_id: string; counts: Array<{ item_id: string; counted_quantity: number }>; counter_id?: string; notes?: string }) {
    const results = [];
    const updateStmt = db.prepare('UPDATE items SET stock_quantity = ? WHERE id = ?');
    const countLogStmt = db.prepare(`
      INSERT INTO stock_counts (id, warehouse_id, count_date, status, notes)
      VALUES (?, ?, CURRENT_TIMESTAMP, 'COMPLETED', ?)
    `);

    const countBatchId = `cnt-${uuidv4().substring(0, 8)}`;
    countLogStmt.run(countBatchId, data.warehouse_id, data.notes || 'Routine blind cycle count');

    for (const c of data.counts) {
      const currentItem = db.prepare('SELECT id, name, stock_quantity, purchase_price FROM items WHERE id = ?').get(c.item_id) as any;
      if (!currentItem) continue;

      const expected = currentItem.stock_quantity;
      const counted = c.counted_quantity;
      const variance = counted - expected;
      const discrepancyValue = variance * currentItem.purchase_price;

      // Adjust to actual counted physical stock
      updateStmt.run(counted, c.item_id);

      results.push({
        item_id: c.item_id,
        item_name: currentItem.name,
        expected,
        counted,
        variance,
        discrepancyValue,
        reconciled: true
      });
    }

    return {
      cycleCountId: countBatchId,
      itemsReconciled: results.length,
      details: results
    };
  }

  // Predictive Auto-Replenishment PO Engine (Dev Proposal 17)
  static calculatePredictiveReorder() {
    const lowStockItems = db.prepare(`
      SELECT id, sku, name, stock_quantity, min_limit, purchase_price
      FROM items
      WHERE stock_quantity <= min_limit AND deleted_at IS NULL
    `).all() as any[];

    return lowStockItems.map(item => {
      // Calculate suggested PO qty (safety stock multiplier)
      const suggestedQty = Math.max(item.min_limit * 3, 10);
      return {
        item_id: item.id,
        sku: item.sku,
        name: item.name,
        current_stock: item.stock_quantity,
        reorder_point: item.min_limit,
        suggested_reorder_qty: suggestedQty,
        estimated_po_cost: suggestedQty * item.purchase_price,
        urgency: item.stock_quantity === 0 ? 'CRITICAL_OUT_OF_STOCK' : 'LOW_STOCK'
      };
    });
  }

  // Supplier Price Matrix (Dev Proposal 21)
  static getSupplierPriceMatrix(itemId: string) {
    const comparisons = db.prepare(`
      SELECT s.*, i.name as item_name, i.sku
      FROM supplier_price_comparisons s
      JOIN items i ON s.item_id = i.id
      WHERE s.item_id = ?
      ORDER BY s.quoted_price ASC
    `).all(itemId) as any[];

    if (comparisons.length === 0) {
      return { item_id: itemId, quotes: [], bestQuote: null };
    }

    const bestQuote = comparisons[0];
    return {
      item_id: itemId,
      item_name: bestQuote.item_name,
      quotes: comparisons.map((q, idx) => ({
        ...q,
        isBestPrice: idx === 0,
        priceDifferenceVsBest: Number((q.quoted_price - bestQuote.quoted_price).toFixed(2))
      })),
      bestQuote
    };
  }
}
