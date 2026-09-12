import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../../services/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { verifyToken } from '../../middleware/auth';

export const sparePartsRouter = Router();

// Ensure inventory/spare-parts tables & columns are initialized
InventoryService.init();

// =========================================================================
// 1. Get Spare Parts Catalog with Quality Grades and 3-Tier Pricing
// =========================================================================
sparePartsRouter.get('/catalog', (req: Request, res: Response) => {
  const { q, grade } = req.query;
  let sql = `
    SELECT i.*, 
      (SELECT GROUP_CONCAT(COALESCE(c.device_brand, c2.target_brand) || ' ' || COALESCE(c.device_model, c2.target_model), ', ') 
       FROM item_compatibility c 
       LEFT JOIN spare_parts_compatibility c2 ON c2.item_id = i.id
       WHERE c.item_id = i.id) as compatible_models
    FROM items i
    WHERE i.category = 'SPARE_PART' AND i.deleted_at IS NULL
  `;
  const params: any[] = [];

  if (grade) {
    sql += ' AND i.quality_grade = ?';
    params.push(grade);
  }
  if (q) {
    sql += ` AND (i.name LIKE ? OR i.sku LIKE ? OR i.id IN (
      SELECT c.item_id FROM item_compatibility c 
      WHERE c.device_brand LIKE ? OR c.device_model LIKE ?
      UNION
      SELECT c2.item_id FROM spare_parts_compatibility c2 
      WHERE c2.target_brand LIKE ? OR c2.target_model LIKE ?
    ))`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += ' ORDER BY i.stock_quantity ASC, i.name ASC';
  const parts = db.prepare(sql).all(...params);
  res.json(parts);
});

// =========================================================================
// 2. FTS5 Search Endpoint (R3.6)
// =========================================================================
sparePartsRouter.get('/search', (req: Request, res: Response) => {
  const q = req.query.q as string;
  const items = InventoryService.searchItemsFts(q);
  res.json(items);
});

// =========================================================================
// 3. Dead Stock Identification Report (R3.2)
// =========================================================================
sparePartsRouter.get('/reports/dead-stock', (req: Request, res: Response) => {
  const days = Number(req.query.days) || 90;
  const report = InventoryService.getDeadStockReport(days);
  res.json(report);
});

sparePartsRouter.get('/dead-stock', (req: Request, res: Response) => {
  const days = Number(req.query.days) || 90;
  const report = InventoryService.getDeadStockReport(days);
  res.json(report);
});

// =========================================================================
// 4. Cross-Model Compatibility Map (R3.10)
// =========================================================================
sparePartsRouter.get('/compatibility', (req: Request, res: Response) => {
  const { model, item_id } = req.query;

  if (item_id) {
    const records = InventoryService.getItemCompatibility(item_id as string);
    return res.json(records);
  }

  let sql = `
    SELECT c.id, c.item_id, c.device_brand, c.device_model, c.notes, c.created_at,
           i.name as part_name, i.sku, i.quality_grade, i.wholesale_price, i.retail_price, i.bulk_price, i.stock_quantity
    FROM item_compatibility c
    JOIN items i ON c.item_id = i.id
    WHERE i.deleted_at IS NULL
  `;
  const params: any[] = [];

  if (model) {
    sql += ' AND (c.device_model LIKE ? OR c.device_brand LIKE ? OR i.name LIKE ?)';
    params.push(`%${model}%`, `%${model}%`, `%${model}%`);
  }

  const results = db.prepare(sql).all(...params);
  res.json(results);
});

sparePartsRouter.post('/compatibility', (req: Request, res: Response) => {
  const { item_id, target_brand, target_model, device_brand, device_model, notes } = req.body;
  const brand = device_brand || target_brand;
  const model = device_model || target_model;

  if (!item_id || !brand || !model) {
    return res.status(400).json({ error: 'item_id, brand (target_brand/device_brand), and model (target_model/device_model) are required' });
  }

  try {
    const created = InventoryService.addItemCompatibility(item_id, brand, model, notes);
    res.status(201).json({ success: true, compatibility: created, message: 'Compatibility mapping created' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

sparePartsRouter.get('/items/:id/compatibility', (req: Request, res: Response) => {
  const compats = InventoryService.getItemCompatibility(String(req.params.id));
  res.json(compats);
});

sparePartsRouter.post('/items/:id/compatibility', (req: Request, res: Response) => {
  const { device_brand, device_model, target_brand, target_model, notes } = req.body;
  const brand = device_brand || target_brand;
  const model = device_model || target_model;

  if (!brand || !model) {
    return res.status(400).json({ error: 'device_brand and device_model are required' });
  }

  try {
    const created = InventoryService.addItemCompatibility(String(req.params.id), brand, model, notes);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

sparePartsRouter.delete('/items/:id/compatibility/:compatId', (req: Request, res: Response) => {
  try {
    const result = InventoryService.deleteItemCompatibility(String(req.params.compatId));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

sparePartsRouter.delete('/compatibility/:compatId', (req: Request, res: Response) => {
  try {
    const result = InventoryService.deleteItemCompatibility(String(req.params.compatId));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// =========================================================================
// 5. RMA Tickets Workflow & Supplier Scorecard Updates (R3.4)
// =========================================================================
sparePartsRouter.get('/rma', (_req: Request, res: Response) => {
  const rmas = db.prepare(`
    SELECT r.*, i.name as item_name, i.sku as item_sku, i.quality_grade
    FROM rma_tickets r
    JOIN items i ON r.item_id = i.id
    ORDER BY r.created_at DESC
  `).all();
  res.json(rmas);
});

sparePartsRouter.post('/rma', (req: Request, res: Response) => {
  const {
    item_id, vendor_name, security_sticker_intact,
    soldering_trace_detected, defect_reason, vendor_batch_code
  } = req.body;
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string };

  const id = `rma-${uuidv4().substring(0, 8)}`;

  // Strict Policy: If security sticker is voided OR soldering traces found, reject directly
  let initialStatus = 'PENDING';
  if (!security_sticker_intact || soldering_trace_detected) {
    initialStatus = 'REJECTED';
  }

  db.prepare(`
    INSERT INTO rma_tickets (
      id, store_id, item_id, vendor_name, security_sticker_intact,
      soldering_trace_detected, defect_reason, status, vendor_batch_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, store.id, item_id, vendor_name,
    security_sticker_intact ? 1 : 0, soldering_trace_detected ? 1 : 0,
    defect_reason, initialStatus, vendor_batch_code || 'N/A'
  );

  // Update supplier scorecard on defect/return
  if (vendor_name) {
    InventoryService.updateSupplierScoreOnReturn(vendor_name);
  }

  logAudit({
    action: 'CREATE',
    entityType: 'RMA_TICKET',
    entityId: id,
    newValues: { item_id, vendor_name, status: initialStatus, defect_reason },
    ipAddress: req.ip
  });

  const created = db.prepare('SELECT * FROM rma_tickets WHERE id = ?').get(id);
  res.status(201).json({
    rma: created,
    policyAlert: initialStatus === 'REJECTED'
      ? 'AUTO-REJECTED by strict RMA policy: Void warranty sticker or unauthorized soldering detected.'
      : 'RMA logged and pending supplier return credit.'
  });
});

sparePartsRouter.get('/rma/analytics', (_req: Request, res: Response) => {
  const stats = db.prepare(`
    SELECT vendor_name,
           COUNT(*) as total_rma,
           SUM(CASE WHEN status = 'APPROVED' OR status = 'REFUNDED' THEN 1 ELSE 0 END) as accepted_rma,
           SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected_rma
    FROM rma_tickets
    GROUP BY vendor_name
    ORDER BY total_rma DESC
  `).all();
  res.json(stats);
});

sparePartsRouter.post('/rma/:id/status', (req: Request, res: Response) => {
  const { status } = req.body;
  const rma = db.prepare('SELECT * FROM rma_tickets WHERE id = ?').get(req.params.id) as any;
  if (!rma) return res.status(404).json({ error: 'RMA ticket not found' });

  db.prepare('UPDATE rma_tickets SET status = ? WHERE id = ?').run(status, req.params.id);

  if (status === 'APPROVED' || status === 'REFUNDED') {
    InventoryService.updateSupplierScoreOnReturn(rma.vendor_name);
  }

  logAudit({
    action: 'UPDATE',
    entityType: 'RMA_TICKET',
    entityId: req.params.id as string,
    newValues: { status },
    ipAddress: req.ip
  });

  res.json({ success: true, status });
});

// =========================================================================
// 6. Purchase Orders (PO) System & Goods Receipt (R3.7 & R3.4)
// =========================================================================
sparePartsRouter.get('/purchase-orders', (_req: Request, res: Response) => {
  const pos = db.prepare(`
    SELECT po.*,
      (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) as item_count
    FROM purchase_orders po
    ORDER BY po.created_at DESC
  `).all();
  res.json(pos);
});

sparePartsRouter.post('/purchase-orders', (req: Request, res: Response) => {
  const { supplier_name, supplier_phone, notes, items } = req.body;
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string };

  const maxPo = db.prepare('SELECT COALESCE(MAX(po_number), 7000) as maxNum FROM purchase_orders').get() as { maxNum: number };
  const poNumber = maxPo.maxNum + 1;
  const poId = `po-${uuidv4().substring(0, 8)}`;

  let totalAmount = 0;
  if (items && Array.isArray(items)) {
    for (const itm of items) {
      totalAmount += (Number(itm.estimated_unit_cost) || 0) * (Number(itm.quantity) || 1);
    }
  }

  const threshold = 10000; // 10,000 EGP ceiling per DEC-034
  const initialStatus = totalAmount > threshold ? 'PENDING_APPROVAL' : 'ORDERED';

  db.prepare(`
    INSERT INTO purchase_orders (id, po_number, store_id, supplier_name, supplier_phone, status, total_amount, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(poId, poNumber, store.id, supplier_name, supplier_phone || '', initialStatus, totalAmount, notes || '');

  if (items && Array.isArray(items)) {
    const insertPoItem = db.prepare(`
      INSERT INTO purchase_order_items (id, po_id, item_id, item_name, quantity, estimated_unit_cost)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const itm of items) {
      insertPoItem.run(
        `poi-${uuidv4().substring(0, 8)}`,
        poId,
        itm.item_id || null,
        itm.item_name,
        itm.quantity || 1,
        itm.estimated_unit_cost || 0.0
      );
    }
  }

  logAudit({
    action: 'CREATE',
    entityType: 'PURCHASE_ORDER',
    entityId: poId,
    newValues: { poNumber, supplier_name, totalAmount, status: initialStatus },
    ipAddress: req.ip
  });

  const created = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId);
  res.status(201).json(created);
});

sparePartsRouter.post('/purchase-orders/:id/approve', (req: Request, res: Response) => {
  let user = (req as any).user;
  if (!user && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    try {
      user = verifyToken(req.headers.authorization.split(' ')[1]);
    } catch (e) {}
  }

  const role = user?.role || req.body?.user_role;
  const approverId = user?.userId || req.body?.approved_by || 'usr-mgr-01';

  if (!role || !['SuperAdmin', 'Admin', 'Manager'].includes(role)) {
    return res.status(403).json({
      error: 'PO_APPROVAL_FORBIDDEN',
      message: `Forbidden. Role [${role || 'Unspecified'}] does not have permission to approve purchase orders (> 10,000 EGP ceiling per DEC-034).`
    });
  }

  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(String(req.params.id)) as any;
  if (!po) return res.status(404).json({ error: 'Purchase order not found' });

  if (po.status !== 'PENDING_APPROVAL') {
    return res.status(400).json({
      error: 'PO_NOT_PENDING_APPROVAL',
      message: `Purchase order #${po.po_number} is in status "${po.status}" and does not require approval.`
    });
  }

  db.prepare(`
    UPDATE purchase_orders
    SET status = 'ORDERED',
        approved_by = ?,
        approved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(approverId, po.id);

  logAudit({
    action: 'APPROVE',
    entityType: 'PURCHASE_ORDER',
    entityId: po.id,
    newValues: { status: 'ORDERED', approved_by: approverId, total_amount: po.total_amount },
    ipAddress: req.ip
  });

  const approvedPo = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(po.id);
  res.status(200).json({ success: true, message: 'Purchase order approved successfully', purchase_order: approvedPo });
});

sparePartsRouter.post('/purchase-orders/:id/receive', (req: Request, res: Response) => {
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(String(req.params.id)) as any;
  if (!po) return res.status(404).json({ error: 'Purchase order not found' });

  if (po.status === 'PENDING_APPROVAL') {
    return res.status(403).json({
      error: 'PO_APPROVAL_REQUIRED',
      message: 'Cannot receive purchase order pending management approval (> 10,000 EGP ceiling per DEC-034)'
    });
  }

  if (po.status === 'RECEIVED') {
    return res.status(400).json({ error: 'Purchase order is already received' });
  }

  const receiveTx = db.transaction(() => {
    // 1. Update PO status
    db.prepare("UPDATE purchase_orders SET status = 'RECEIVED', received_at = CURRENT_TIMESTAMP WHERE id = ?").run(po.id);

    // 2. Process items: increment stock and record FIFO cost history
    const poItems = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(po.id) as any[];
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

        // Record cost history (FIFO preservation)
        InventoryService.recordCostPriceHistory(itm.id, unitCost, qty, po.id);
      }
    }

    // 3. Create GRN entry if none exists
    const existingGrn = db.prepare('SELECT id FROM goods_received_notes WHERE po_id = ?').get(po.id);
    if (!existingGrn) {
      const maxGrn = db.prepare('SELECT COALESCE(MAX(grn_number), 200) as maxNum FROM goods_received_notes').get() as { maxNum: number };
      const grnNumber = maxGrn.maxNum + 1;
      const grnId = `grn-${uuidv4().substring(0, 8)}`;
      db.prepare(`
        INSERT INTO goods_received_notes (id, grn_number, po_id, received_by_user_id, status, inspection_notes)
        VALUES (?, ?, ?, 'usr-admin', 'ACCEPTED', 'Received via spare parts PO receive workflow.')
      `).run(grnId, grnNumber, po.id);
    }

    // 4. Update supplier scorecard
    InventoryService.updateSupplierScoreOnPoReceipt(po.supplier_name, true, true);
  });

  receiveTx.immediate();

  logAudit({
    action: 'UPDATE',
    entityType: 'PURCHASE_ORDER',
    entityId: po.id,
    newValues: { status: 'RECEIVED' },
    ipAddress: req.ip
  });

  res.json({ success: true, message: 'Purchase order received into warehouse stock, cost history preserved, and supplier scorecard updated.' });
});

// =========================================================================
// 7. Reorder Analysis & Supplier Scorecard Endpoints
// =========================================================================
sparePartsRouter.get('/items/:id/reorder-analysis', (req: Request, res: Response) => {
  try {
    const analysis = InventoryService.getReorderAnalysis(String(req.params.id));
    res.json(analysis);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

sparePartsRouter.get('/suppliers/scorecard', (_req: Request, res: Response) => {
  const scores = InventoryService.getSupplierScorecards();
  res.json(scores);
});

sparePartsRouter.get('/supplier-scores', (_req: Request, res: Response) => {
  const scores = InventoryService.getSupplierScorecards();
  res.json(scores);
});
