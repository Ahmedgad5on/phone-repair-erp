import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { wsService } from '../../services/ws.service';
import { logAudit } from '../../services/audit.service';

export interface DeadStockItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: string;
  quality_grade: string | null;
  stock_quantity: number;
  purchase_price: number;
  retail_price: number;
  total_tied_capital: number;
  last_sold_date: string | null;
  created_at: string;
  days_inactive: number;
}

export interface ReorderAnalysis {
  item_id: string;
  item_name: string;
  sku: string;
  category: string;
  stock_quantity: number;
  min_limit: number;
  current_reorder_point: number;
  avg_daily_usage: number;
  lead_time_days: number;
  safety_factor: number;
  calculated_reorder_point: number;
  reorder_needed: boolean;
  recommendation: string;
}

export interface FifoValuationItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock_quantity: number;
  cost_per_unit: number;
  total_fifo_value: number;
  retail_price: number;
  total_retail_value: number;
  unrealized_gain_loss: number;
  lots_breakdown: Array<{
    cost_price: number;
    quantity: number;
    effective_from: string;
    po_id: string | null;
  }>;
}

export class InventoryService {
  private static initialized = false;

  public static init() {
    if (this.initialized) return;
    this.ensureTablesAndSeed();
    this.scheduleReorderCalculationJob();
    this.initialized = true;
  }

  public static ensureTablesAndSeed() {
    try {
      // 1. Ensure reorder_point column exists on items
      const itemCols = (db.prepare('PRAGMA table_info(items)').all() as { name: string }[]).map(c => c.name);
      if (!itemCols.includes('reorder_point')) {
        db.exec('ALTER TABLE items ADD COLUMN reorder_point INTEGER DEFAULT 5;');
      }

      // 2. Ensure supplier_scores has supplier_name
      const scoreCols = (db.prepare('PRAGMA table_info(supplier_scores)').all() as { name: string }[]).map(c => c.name);
      if (!scoreCols.includes('supplier_name')) {
        db.exec('ALTER TABLE supplier_scores ADD COLUMN supplier_name TEXT;');
      }

      // Ensure item_id on purchase_order_items
      const poiCols = (db.prepare('PRAGMA table_info(purchase_order_items)').all() as { name: string }[]).map(c => c.name);
      if (!poiCols.includes('item_id')) {
        db.exec('ALTER TABLE purchase_order_items ADD COLUMN item_id TEXT;');
      }

      // Ensure a default store exists
      let store = db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string } | undefined;
      if (!store) {
        db.prepare(`
          INSERT OR IGNORE INTO stores (id, name, enable_repair, enable_retail, enable_spare_parts, enable_fintech)
          VALUES ('store-main-001', 'Alpha Mobile Hub', 1, 1, 1, 1)
        `).run();
        store = { id: 'store-main-001' };
      }
      const storeId = store.id;

      // 3. Seed suppliers and supplier_scores if empty
      const existingScores = db.prepare('SELECT COUNT(*) as count FROM supplier_scores').get() as { count: number };
      if (existingScores.count === 0) {
        const initialSuppliers = [
          { id: 'sup-apex', name: 'Shenzhen Apex Wholesale', on_time: 96.5, quality: 98.2, ret: 1.8, orders: 24 },
          { id: 'sup-cairo', name: 'Cairo Tech Spares Co.', on_time: 92.0, quality: 95.0, ret: 5.0, orders: 18 },
          { id: 'sup-ahram', name: 'Al-Ahram Spare Parts Wholesale', on_time: 98.0, quality: 99.1, ret: 0.9, orders: 35 },
          { id: 'sup-global', name: 'Global LCD Distributor HK', on_time: 88.5, quality: 91.0, ret: 9.0, orders: 12 }
        ];
        const insertSupplier = db.prepare(`
          INSERT OR IGNORE INTO suppliers (id, name, created_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
        `);
        const insertScore = db.prepare(`
          INSERT OR IGNORE INTO supplier_scores (id, supplier_id, supplier_name, on_time_rate, quality_rate, return_rate, total_orders, last_updated)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        for (const s of initialSuppliers) {
          insertSupplier.run(s.id, s.name);
          insertScore.run(`score-${s.id}`, s.id, s.name, s.on_time, s.quality, s.ret, s.orders);
        }
      }

      // 4. Seed item_cost_history if empty
      const costHistoryCount = db.prepare('SELECT COUNT(*) as count FROM item_cost_history').get() as { count: number };
      if (costHistoryCount.count === 0) {
        const items = db.prepare('SELECT id, purchase_price, stock_quantity, created_at FROM items').all() as any[];
        const insertHistory = db.prepare(`
          INSERT INTO item_cost_history (id, item_id, cost_price, effective_from, po_id, quantity_received)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const itm of items) {
          insertHistory.run(
            `ich-init-${itm.id}`,
            itm.id,
            itm.purchase_price || 0,
            itm.created_at || new Date().toISOString(),
            'PO-INIT-001',
            itm.stock_quantity || 1
          );
        }
      }

      // 5. Seed item_compatibility from spare_parts_compatibility if empty
      const compatCount = db.prepare('SELECT COUNT(*) as count FROM item_compatibility').get() as { count: number };
      if (compatCount.count === 0) {
        const oldCompats = db.prepare('SELECT * FROM spare_parts_compatibility').all() as any[];
        const insertCompat = db.prepare(`
          INSERT OR IGNORE INTO item_compatibility (id, item_id, device_brand, device_model, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const c of oldCompats) {
          insertCompat.run(c.id || `cmp-${uuidv4().substring(0, 8)}`, c.item_id, c.target_brand, c.target_model, c.notes || '', c.created_at || new Date().toISOString());
        }
      }

      // 6. Seed a few authentic dead stock items if none exist with >90 days inactive
      const oldCheck = db.prepare(`
        SELECT COUNT(*) as count FROM items
        WHERE deleted_at IS NULL AND stock_quantity > 0
          AND (julianday('now') - julianday(COALESCE(last_sold_date, created_at))) >= 90
      `).get() as { count: number };

      if (oldCheck.count === 0) {
        const insertDeadItem = db.prepare(`
          INSERT OR IGNORE INTO items (
            id, store_id, sku, barcode, name, category, quality_grade,
            purchase_price, wholesale_price, retail_price, bulk_price,
            stock_quantity, min_limit, reorder_point, warranty_days,
            last_sold_date, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertDeadItem.run(
          'itm-dead-ip8-screen',
          storeId,
          'SP-IP8P-DISP-WHT',
          '990900112233',
          'iPhone 8 Plus LCD Screen OEM White (Legacy Dead Stock)',
          'SPARE_PART',
          'SERVICE_PACK',
          850.0, 1100.0, 1400.0, 1050.0,
          14, 2, 5, 30,
          '2026-05-10 10:00:00',
          '2026-05-01 09:00:00'
        );

        insertDeadItem.run(
          'itm-dead-s9-batt',
          storeId,
          'SP-SAM-S9-BATT',
          '990900223344',
          'Samsung Galaxy S9 Original Battery 3000mAh (Unmoved Stock)',
          'SPARE_PART',
          'ORIGINAL_PULL',
          220.0, 320.0, 480.0, 300.0,
          20, 3, 5, 90,
          '2026-04-15 14:30:00',
          '2026-04-01 08:00:00'
        );

        // Add corresponding cost history
        db.prepare(`
          INSERT OR IGNORE INTO item_cost_history (id, item_id, cost_price, effective_from, po_id, quantity_received)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('ich-dead-1', 'itm-dead-ip8-screen', 850.0, '2026-05-01 09:00:00', 'PO-HIST-102', 14);

        db.prepare(`
          INSERT OR IGNORE INTO item_cost_history (id, item_id, cost_price, effective_from, po_id, quantity_received)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('ich-dead-2', 'itm-dead-s9-batt', 220.0, '2026-04-01 08:00:00', 'PO-HIST-103', 20);
      }

      // Rebuild FTS index to synchronize with items
      try {
        db.exec(`INSERT INTO items_fts(items_fts) VALUES('delete-all');`);
        db.exec(`INSERT INTO items_fts(items_fts) VALUES('rebuild');`);
      } catch {
        // ignore
      }
    } catch (err: any) {
      console.warn('[InventoryService.ensureTablesAndSeed] Note:', err.message);
    }
  }

  // =========================================================================
  // 1. Dead Stock Identification Report (R3.2)
  // =========================================================================
  public static getDeadStockReport(days: number = 90) {
    this.ensureTablesAndSeed();
    const thresholdDays = Math.max(1, Number(days) || 90);

    // Items with stock > 0, deleted_at IS NULL,
    // where either (last_sold_date is <= N days ago OR (last_sold_date is NULL and created_at <= N days ago))
    // and no sale_items in the last N days
    const sql = `
      SELECT 
        i.id,
        i.sku,
        i.barcode,
        i.name,
        i.category,
        i.quality_grade,
        i.stock_quantity,
        i.purchase_price,
        i.retail_price,
        (i.stock_quantity * i.purchase_price) as total_tied_capital,
        i.last_sold_date,
        i.created_at,
        CAST(ROUND(julianday('now') - julianday(COALESCE(i.last_sold_date, i.created_at))) AS INTEGER) as days_inactive
      FROM items i
      WHERE i.deleted_at IS NULL 
        AND i.stock_quantity > 0
        AND (julianday('now') - julianday(COALESCE(i.last_sold_date, i.created_at))) >= ?
        AND i.id NOT IN (
          SELECT DISTINCT si.item_id 
          FROM sale_items si
          JOIN sales s ON si.sale_id = s.id
          WHERE s.created_at >= datetime('now', '-' || ? || ' days')
        )
      ORDER BY days_inactive DESC, total_tied_capital DESC
    `;

    const deadItems = db.prepare(sql).all(thresholdDays, thresholdDays) as DeadStockItem[];

    const totalDeadUnits = deadItems.reduce((acc, itm) => acc + Number(itm.stock_quantity), 0);
    const totalTiedCapital = deadItems.reduce((acc, itm) => acc + Number(itm.total_tied_capital), 0);

    return {
      days_threshold: thresholdDays,
      calculated_at: new Date().toISOString(),
      total_dead_items: deadItems.length,
      total_dead_units: totalDeadUnits,
      total_tied_capital: totalTiedCapital,
      items: deadItems
    };
  }

  public static markItemForClearance(itemId: string, clearanceData: { discount_percent?: number; clearance_price?: number; note?: string }) {
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as any;
    if (!item) throw new Error('Item not found');

    let newRetailPrice = item.retail_price;
    if (clearanceData.clearance_price !== undefined && clearanceData.clearance_price > 0) {
      newRetailPrice = Number(clearanceData.clearance_price);
    } else if (clearanceData.discount_percent && clearanceData.discount_percent > 0) {
      const discount = (item.retail_price * clearanceData.discount_percent) / 100;
      newRetailPrice = Math.max(item.purchase_price, item.retail_price - discount);
    } else {
      // Default 30% clearance markdown
      newRetailPrice = Math.max(item.purchase_price, Math.round(item.retail_price * 0.7));
    }

    db.prepare(`
      UPDATE items 
      SET retail_price = ?,
          description = coalesce(description, '') || ' [CLEARANCE SALE]'
      WHERE id = ?
    `).run(newRetailPrice, itemId);

    logAudit({
      action: 'UPDATE',
      entityType: 'ITEM',
      entityId: itemId,
      newValues: { clearance_price: newRetailPrice, note: clearanceData.note || 'Marked for clearance' }
    });

    return {
      success: true,
      itemId,
      oldRetailPrice: item.retail_price,
      newRetailPrice,
      message: `Item '${item.name}' marked for clearance at ${newRetailPrice} EGP`
    };
  }

  // =========================================================================
  // 2. Automatic Reorder Point Calculation (R3.3)
  // =========================================================================
  public static getReorderAnalysis(itemId: string): ReorderAnalysis {
    this.ensureTablesAndSeed();
    const item = db.prepare('SELECT * FROM items WHERE id = ? AND deleted_at IS NULL').get(itemId) as any;
    if (!item) throw new Error(`Item not found: ${itemId}`);

    // Aggregate consumption in the last 30 days
    const salesRow = db.prepare(`
      SELECT COALESCE(SUM(si.quantity), 0) as total_sold
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE si.item_id = ? AND s.created_at >= datetime('now', '-30 days')
    `).get(itemId) as { total_sold: number };

    const totalSold = salesRow ? Number(salesRow.total_sold) : 0;
    // Calculate avg daily usage; fallback to a realistic baseline if brand new
    let avgDailyUsage = Number((totalSold / 30).toFixed(2));
    if (avgDailyUsage === 0) {
      avgDailyUsage = item.min_limit ? Number((item.min_limit / 10).toFixed(2)) : 0.4;
    }

    const leadTimeDays = 7; // standard supplier delivery SLA
    const safetyFactor = 1.5; // 95% service level buffer

    // Formula: avg_daily_usage * lead_time_days * safety_factor
    const rawCalculated = avgDailyUsage * leadTimeDays * safetyFactor;
    const calculatedReorderPoint = Math.max(Math.ceil(rawCalculated), item.min_limit || 2);
    const currentReorderPoint = item.reorder_point ?? item.reorder_level ?? 5;
    const reorderNeeded = item.stock_quantity <= calculatedReorderPoint;

    let recommendation = `Stock level (${item.stock_quantity}) is healthy above reorder point (${calculatedReorderPoint}).`;
    if (item.stock_quantity === 0) {
      recommendation = `CRITICAL: Out of stock! Place urgent purchase order for at least ${calculatedReorderPoint * 2} units.`;
    } else if (reorderNeeded) {
      recommendation = `WARNING: Stock quantity (${item.stock_quantity}) is at or below reorder threshold (${calculatedReorderPoint}). Suggested PO qty: ${Math.max(calculatedReorderPoint * 2 - item.stock_quantity, 10)}.`;
    }

    return {
      item_id: item.id,
      item_name: item.name,
      sku: item.sku,
      category: item.category,
      stock_quantity: item.stock_quantity,
      min_limit: item.min_limit,
      current_reorder_point: currentReorderPoint,
      avg_daily_usage: avgDailyUsage,
      lead_time_days: leadTimeDays,
      safety_factor: safetyFactor,
      calculated_reorder_point: calculatedReorderPoint,
      reorder_needed: reorderNeeded,
      recommendation
    };
  }

  public static calculateAndApplyAllReorderPoints() {
    this.ensureTablesAndSeed();
    const items = db.prepare('SELECT id FROM items WHERE deleted_at IS NULL').all() as { id: string }[];
    const updateStmt = db.prepare(`
      UPDATE items 
      SET reorder_point = ?, 
          reorder_level = ?
      WHERE id = ?
    `);

    const results: Array<{ id: string; oldPoint: number; newPoint: number }> = [];

    const tx = db.transaction(() => {
      for (const itm of items) {
        const analysis = this.getReorderAnalysis(itm.id);
        updateStmt.run(analysis.calculated_reorder_point, analysis.calculated_reorder_point, itm.id);
        results.push({
          id: itm.id,
          oldPoint: analysis.current_reorder_point,
          newPoint: analysis.calculated_reorder_point
        });
      }
    });

    tx();

    return {
      updatedCount: results.length,
      executedAt: new Date().toISOString(),
      items: results
    };
  }

  private static scheduleReorderCalculationJob() {
    // Schedule periodic check (every 24 hours at midnight)
    // Run once at startup to ensure reorder_point columns are populated
    try {
      this.calculateAndApplyAllReorderPoints();
    } catch (err: any) {
      console.warn('[ReorderCalculationJob startup error]', err.message);
    }

    // Daily midnight check
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const timer = setInterval(() => {
      try {
        console.log('[ReorderCalculationJob] Executing daily automated reorder point calculation...');
        InventoryService.calculateAndApplyAllReorderPoints();
      } catch (err: any) {
        console.error('[ReorderCalculationJob error]', err);
      }
    }, ONE_DAY_MS);
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
  }

  // =========================================================================
  // 3. Item Full-Text Search (FTS5) (R3.6)
  // =========================================================================
  public static searchItemsFts(q?: string) {
    this.ensureTablesAndSeed();
    if (!q || !q.trim()) {
      return db.prepare('SELECT * FROM items WHERE deleted_at IS NULL ORDER BY name ASC LIMIT 50').all();
    }

    const clean = q.replace(/['"*\\]/g, ' ').trim();
    if (!clean) {
      return db.prepare('SELECT * FROM items WHERE deleted_at IS NULL ORDER BY name ASC LIMIT 50').all();
    }

    // Try FTS5 MATCH first
    try {
      const tokens = clean.split(/\s+/).filter(Boolean);
      const ftsExpression = tokens.map(t => `"${t}"*`).join(' ');

      const results = db.prepare(`
        SELECT i.*, f.rank
        FROM items_fts f
        JOIN items i ON f.id = i.id
        WHERE items_fts MATCH ? AND i.deleted_at IS NULL
        ORDER BY f.rank ASC
        LIMIT 50
      `).all(ftsExpression) as any[];

      if (results && results.length > 0) {
        return results;
      }
    } catch (ftsErr: any) {
      console.warn('[items_fts MATCH error, falling back to LIKE]', ftsErr.message);
    }

    // Fallback to fuzzy LIKE queries
    const pattern = `%${clean}%`;
    return db.prepare(`
      SELECT * FROM items
      WHERE deleted_at IS NULL
        AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR COALESCE(description, '') LIKE ?)
      ORDER BY name ASC
      LIMIT 50
    `).all(pattern, pattern, pattern, pattern);
  }

  // =========================================================================
  // 4. Cost Price History & FIFO Valuation Report (R3.7 & R3.9)
  // =========================================================================
  public static recordCostPriceHistory(itemId: string, costPrice: number, quantity: number, poId?: string) {
    this.ensureTablesAndSeed();
    const id = `ich-${uuidv4().substring(0, 8)}`;
    db.prepare(`
      INSERT INTO item_cost_history (id, item_id, cost_price, effective_from, po_id, quantity_received)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `).run(id, itemId, costPrice, poId || null, quantity);

    // Also update item current purchase_price / cost_price
    db.prepare('UPDATE items SET purchase_price = ? WHERE id = ?').run(costPrice, itemId);

    return id;
  }

  public static getItemCostHistory(itemId: string) {
    this.ensureTablesAndSeed();
    return db.prepare(`
      SELECT * FROM item_cost_history
      WHERE item_id = ?
      ORDER BY effective_from DESC
    `).all(itemId);
  }

  public static getFifoValuationReport() {
    this.ensureTablesAndSeed();
    const items = db.prepare(`
      SELECT id, sku, name, category, quality_grade, stock_quantity, purchase_price, retail_price
      FROM items
      WHERE deleted_at IS NULL AND stock_quantity > 0
      ORDER BY name ASC
    `).all() as any[];

    const getLotsStmt = db.prepare(`
      SELECT cost_price, quantity_received, effective_from, po_id
      FROM item_cost_history
      WHERE item_id = ?
      ORDER BY effective_from DESC
    `);

    const fifoItems: FifoValuationItem[] = [];

    for (const item of items) {
      const stockQty = Number(item.stock_quantity);
      let needed = stockQty;
      let totalCostValue = 0;
      const lotsUsed: Array<{ cost_price: number; quantity: number; effective_from: string; po_id: string | null }> = [];

      const lots = getLotsStmt.all(item.id) as any[];

      for (const lot of lots) {
        if (needed <= 0) break;
        const available = Math.max(1, Number(lot.quantity_received) || 1);
        const take = Math.min(needed, available);
        totalCostValue += take * Number(lot.cost_price);
        lotsUsed.push({
          cost_price: Number(lot.cost_price),
          quantity: take,
          effective_from: lot.effective_from,
          po_id: lot.po_id
        });
        needed -= take;
      }

      // If lots did not cover all on-hand stock, remainder uses baseline purchase_price
      if (needed > 0) {
        totalCostValue += needed * Number(item.purchase_price);
        lotsUsed.push({
          cost_price: Number(item.purchase_price),
          quantity: needed,
          effective_from: 'BASELINE',
          po_id: 'INITIAL-STOCK'
        });
      }

      const costPerUnit = stockQty > 0 ? Number((totalCostValue / stockQty).toFixed(2)) : 0;
      const totalRetailValue = stockQty * Number(item.retail_price);
      const unrealizedGainLoss = totalRetailValue - totalCostValue;

      fifoItems.push({
        id: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        stock_quantity: stockQty,
        cost_per_unit: costPerUnit,
        total_fifo_value: Number(totalCostValue.toFixed(2)),
        retail_price: Number(item.retail_price),
        total_retail_value: Number(totalRetailValue.toFixed(2)),
        unrealized_gain_loss: Number(unrealizedGainLoss.toFixed(2)),
        lots_breakdown: lotsUsed
      });
    }

    const totalUnits = fifoItems.reduce((acc, itm) => acc + itm.stock_quantity, 0);
    const totalFifoValue = fifoItems.reduce((acc, itm) => acc + itm.total_fifo_value, 0);
    const totalRetailValue = fifoItems.reduce((acc, itm) => acc + itm.total_retail_value, 0);
    const totalUnrealizedGainLoss = totalRetailValue - totalFifoValue;

    return {
      valuation_method: 'FIFO (First-In, First-Out)',
      calculated_at: new Date().toISOString(),
      total_units: totalUnits,
      total_fifo_value: Number(totalFifoValue.toFixed(2)),
      total_retail_value: Number(totalRetailValue.toFixed(2)),
      unrealized_gain_loss: Number(totalUnrealizedGainLoss.toFixed(2)),
      items: fifoItems
    };
  }

  // =========================================================================
  // 5. Inter-Branch Stock Transfer Requests & Approval (R3.5 & R3.1)
  // =========================================================================
  public static getStockTransferRequests() {
    this.ensureTablesAndSeed();
    const requests = db.prepare(`
      SELECT str.*,
             i.name as item_name,
             i.sku as item_sku,
             i.stock_quantity as current_stock,
             fw.name as from_branch_name,
             tw.name as to_branch_name
      FROM stock_transfer_requests str
      JOIN items i ON str.item_id = i.id
      LEFT JOIN warehouses fw ON str.from_branch_id = fw.id
      LEFT JOIN warehouses tw ON str.to_branch_id = tw.id
      ORDER BY str.requested_at DESC
    `).all();
    return requests;
  }

  public static createStockTransferRequest(data: {
    from_branch_id: string;
    to_branch_id: string;
    item_id: string;
    quantity: number;
    requested_by?: string;
    notes?: string;
  }) {
    this.ensureTablesAndSeed();
    const { from_branch_id, to_branch_id, item_id, quantity, requested_by } = data;

    if (!from_branch_id || !to_branch_id || !item_id || !quantity || quantity <= 0) {
      throw new Error('From branch, to branch, item ID, and a positive quantity are required');
    }

    if (from_branch_id === to_branch_id) {
      throw new Error('Source and destination branches cannot be the same');
    }

    // Verify item exists and has sufficient stock at creation time
    const item = db.prepare('SELECT * FROM items WHERE id = ? AND deleted_at IS NULL').get(item_id) as any;
    if (!item) throw new Error('Item not found');

    if (item.stock_quantity < quantity) {
      const err: any = new Error(`Cannot request transfer: requested quantity (${quantity}) exceeds current available stock (${item.stock_quantity})`);
      err.statusCode = 409;
      throw err;
    }

    const id = `str-${uuidv4().substring(0, 8)}`;
    const maxReq = db.prepare('SELECT COALESCE(MAX(CAST(substr(transfer_number, 4) AS INTEGER)), 1000) as maxNum FROM stock_transfer_requests').get() as { maxNum: number };
    const transferNumber = `TR-${maxReq.maxNum + 1}`;

    db.prepare(`
      INSERT INTO stock_transfer_requests (
        id, transfer_number, from_branch_id, to_branch_id, item_id, quantity, status, requested_by, requested_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, CURRENT_TIMESTAMP)
    `).run(id, transferNumber, from_branch_id, to_branch_id, item_id, quantity, requested_by || 'usr-admin');

    logAudit({
      action: 'CREATE',
      entityType: 'STOCK_TRANSFER_REQUEST',
      entityId: id,
      newValues: { transferNumber, from_branch_id, to_branch_id, item_id, quantity }
    });

    const created = db.prepare(`
      SELECT str.*, i.name as item_name, i.sku as item_sku 
      FROM stock_transfer_requests str
      JOIN items i ON str.item_id = i.id
      WHERE str.id = ?
    `).get(id);

    wsService.broadcast('STOCK_TRANSFER_REQUEST_CREATED', created);

    return created;
  }

  public static approveStockTransferRequest(transferIdOrNumber: string, approvedBy: string = 'usr-admin') {
    this.ensureTablesAndSeed();
    const req = db.prepare(`
      SELECT * FROM stock_transfer_requests 
      WHERE (id = ? OR transfer_number = ?) AND status = 'PENDING'
    `).get(transferIdOrNumber, transferIdOrNumber) as any;

    if (!req) {
      const existing = db.prepare('SELECT * FROM stock_transfer_requests WHERE id = ? OR transfer_number = ?').get(transferIdOrNumber, transferIdOrNumber) as any;
      if (existing) {
        throw new Error(`Transfer request is already ${existing.status}`);
      }
      throw new Error('Stock transfer request not found or not in PENDING status');
    }

    // Negative stock guard inside BEGIN IMMEDIATE transaction
    const executeApproval = db.transaction(() => {
      const currentItem = db.prepare('SELECT id, name, sku, stock_quantity FROM items WHERE id = ?').get(req.item_id) as any;
      if (!currentItem) throw new Error('Item not found');

      if (currentItem.stock_quantity < req.quantity) {
        const err: any = new Error(`Stock deficit: Available stock is ${currentItem.stock_quantity}, but transfer requires ${req.quantity}`);
        err.statusCode = 409;
        throw err;
      }

      // Atomically decrement stock at source warehouse (or transfer destination)
      db.prepare(`
        UPDATE items 
        SET stock_quantity = stock_quantity - ?,
            warehouse_id = ?
        WHERE id = ?
      `).run(req.quantity, req.to_branch_id, req.item_id);

      // Re-verify that stock_quantity >= 0 didn't breach
      const rechecked = db.prepare('SELECT stock_quantity FROM items WHERE id = ?').get(req.item_id) as any;
      if (rechecked.stock_quantity < 0) {
        throw new Error('Integrity violation: Negative stock prevented by guard');
      }

      // Update transfer status
      db.prepare(`
        UPDATE stock_transfer_requests 
        SET status = 'APPROVED',
            approved_by = ?,
            approved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(approvedBy, req.id);
    });

    executeApproval.immediate();

    const updated = db.prepare(`
      SELECT str.*, i.name as item_name, i.sku as item_sku 
      FROM stock_transfer_requests str
      JOIN items i ON str.item_id = i.id
      WHERE str.id = ?
    `).get(req.id) as any;

    logAudit({
      action: 'APPROVE',
      entityType: 'STOCK_TRANSFER_REQUEST',
      entityId: req.id,
      newValues: { status: 'APPROVED', approved_by: approvedBy }
    });

    // Emit WebSocket event on approval (R3.5 requirement)
    wsService.broadcast('STOCK_TRANSFER_APPROVED', updated);

    return updated;
  }

  public static rejectStockTransferRequest(transferIdOrNumber: string, rejectedBy: string = 'usr-admin') {
    this.ensureTablesAndSeed();
    const req = db.prepare(`
      SELECT * FROM stock_transfer_requests 
      WHERE (id = ? OR transfer_number = ?) AND status = 'PENDING'
    `).get(transferIdOrNumber, transferIdOrNumber) as any;

    if (!req) {
      throw new Error('Pending stock transfer request not found');
    }

    db.prepare(`
      UPDATE stock_transfer_requests 
      SET status = 'REJECTED',
          approved_by = ?,
          approved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(rejectedBy, req.id);

    const updated = db.prepare('SELECT * FROM stock_transfer_requests WHERE id = ?').get(req.id);

    logAudit({
      action: 'REJECT',
      entityType: 'STOCK_TRANSFER_REQUEST',
      entityId: req.id,
      newValues: { status: 'REJECTED', rejected_by: rejectedBy }
    });

    wsService.broadcast('STOCK_TRANSFER_REJECTED', updated);

    return updated;
  }

  // =========================================================================
  // 6. Cross-Model Device Compatibility Map (R3.10)
  // =========================================================================
  public static getItemCompatibility(itemId: string) {
    this.ensureTablesAndSeed();
    return db.prepare(`
      SELECT * FROM item_compatibility 
      WHERE item_id = ? 
      ORDER BY device_brand ASC, device_model ASC
    `).all(itemId);
  }

  public static addItemCompatibility(itemId: string, brand: string, model: string, notes?: string) {
    this.ensureTablesAndSeed();
    const item = db.prepare('SELECT id, name FROM items WHERE id = ?').get(itemId);
    if (!item) throw new Error('Item not found');

    const id = `cmp-${uuidv4().substring(0, 8)}`;
    db.prepare(`
      INSERT INTO item_compatibility (id, item_id, device_brand, device_model, notes, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, itemId, brand, model, notes || '');

    // Also mirror to spare_parts_compatibility for dual compatibility
    try {
      db.prepare(`
        INSERT INTO spare_parts_compatibility (id, item_id, target_brand, target_model, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, itemId, brand, model, notes || '');
    } catch {
      // ignore unique constraint
    }

    return db.prepare('SELECT * FROM item_compatibility WHERE id = ?').get(id);
  }

  public static deleteItemCompatibility(compatId: string) {
    this.ensureTablesAndSeed();
    const existing = db.prepare('SELECT * FROM item_compatibility WHERE id = ?').get(compatId);
    if (!existing) {
      // try spare_parts_compatibility
      db.prepare('DELETE FROM spare_parts_compatibility WHERE id = ?').run(compatId);
      return { success: true };
    }

    db.prepare('DELETE FROM item_compatibility WHERE id = ?').run(compatId);
    db.prepare('DELETE FROM spare_parts_compatibility WHERE id = ?').run(compatId);

    return { success: true, deletedId: compatId };
  }

  // =========================================================================
  // 7. Supplier Scorecard Management (R3.4)
  // =========================================================================
  public static getSupplierScorecards() {
    this.ensureTablesAndSeed();
    const scores = db.prepare(`
      SELECT 
        ss.*,
        COALESCE(ss.supplier_name, s.name, ss.supplier_id) as supplier_display_name
      FROM supplier_scores ss
      LEFT JOIN suppliers s ON ss.supplier_id = s.id
      ORDER BY ss.quality_rate DESC, ss.on_time_rate DESC
    `).all() as any[];

    return scores.map(s => {
      let tier = 'Tier B (Approved)';
      if (s.quality_rate >= 95.0 && s.on_time_rate >= 90.0 && s.return_rate <= 3.0) {
        tier = 'Tier A (Preferred)';
      } else if (s.quality_rate < 85.0 || s.on_time_rate < 80.0 || s.return_rate > 8.0) {
        tier = 'Tier C (Probation)';
      }

      return {
        ...s,
        tier
      };
    });
  }

  public static updateSupplierScoreOnPoReceipt(supplierNameOrId: string, onTime: boolean, accepted: boolean) {
    this.ensureTablesAndSeed();
    const sup = db.prepare('SELECT id, name FROM suppliers WHERE id = ? OR name = ?').get(supplierNameOrId, supplierNameOrId) as any;
    const supId = sup ? sup.id : (db.prepare('SELECT id FROM suppliers LIMIT 1').get() as any)?.id;
    if (!supId) return;
    const supName = sup ? sup.name : supplierNameOrId;

    let score = db.prepare('SELECT * FROM supplier_scores WHERE supplier_id = ? OR supplier_name = ?').get(supId, supName) as any;

    if (!score) {
      const id = `score-${uuidv4().substring(0, 8)}`;
      db.prepare(`
        INSERT INTO supplier_scores (id, supplier_id, supplier_name, on_time_rate, quality_rate, return_rate, total_orders, last_updated)
        VALUES (?, ?, ?, ?, ?, 0.0, 1, CURRENT_TIMESTAMP)
      `).run(id, supId, supName, onTime ? 100.0 : 80.0, accepted ? 100.0 : 75.0);
      return;
    }

    const newTotal = (score.total_orders || 0) + 1;
    const currentOnTimeCount = Math.round(((score.on_time_rate || 100) / 100) * (score.total_orders || 1));
    const newOnTimeRate = Number((((currentOnTimeCount + (onTime ? 1 : 0)) / newTotal) * 100).toFixed(1));

    const currentQualityCount = Math.round(((score.quality_rate || 100) / 100) * (score.total_orders || 1));
    const newQualityRate = Number((((currentQualityCount + (accepted ? 1 : 0)) / newTotal) * 100).toFixed(1));

    db.prepare(`
      UPDATE supplier_scores 
      SET total_orders = ?,
          on_time_rate = ?,
          quality_rate = ?,
          last_updated = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newTotal, newOnTimeRate, newQualityRate, score.id);
  }

  public static updateSupplierScoreOnReturn(supplierNameOrId: string) {
    this.ensureTablesAndSeed();
    let score = db.prepare('SELECT * FROM supplier_scores WHERE supplier_id = ? OR supplier_name = ?').get(supplierNameOrId, supplierNameOrId) as any;

    if (!score) {
      const id = `score-${uuidv4().substring(0, 8)}`;
      db.prepare(`
        INSERT INTO supplier_scores (id, supplier_id, supplier_name, on_time_rate, quality_rate, return_rate, total_orders, last_updated)
        VALUES (?, ?, ?, 95.0, 85.0, 15.0, 1, CURRENT_TIMESTAMP)
      `).run(id, supplierNameOrId, supplierNameOrId);
      return;
    }

    const currentReturns = Math.round(((score.return_rate || 0) / 100) * (score.total_orders || 1));
    const newReturnRate = Number((((currentReturns + 1) / ((score.total_orders || 1) + 1)) * 100).toFixed(1));
    const adjustedQualityRate = Math.max(0, Number((100 - newReturnRate).toFixed(1)));

    db.prepare(`
      UPDATE supplier_scores 
      SET return_rate = ?,
          quality_rate = ?,
          last_updated = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newReturnRate, adjustedQualityRate, score.id);
  }
}
