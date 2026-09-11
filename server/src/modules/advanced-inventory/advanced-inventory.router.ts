import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { auditService } from '../../services/audit.service';

export const advancedInventoryRouter = Router();

// ==========================================
// 16. Automatic Reordering Rules (Proposal 16)
// ==========================================
advancedInventoryRouter.get('/auto-reorder', (_req: Request, res: Response) => {
  const rules = db.prepare(`
    SELECT r.*, i.name as item_name, i.stock_quantity as current_stock
    FROM auto_reorder_rules r
    JOIN items i ON r.item_id = i.id
    WHERE i.deleted_at IS NULL
  `).all();
  res.json(rules);
});

advancedInventoryRouter.post('/auto-reorder', (req: Request, res: Response) => {
  const { item_id, min_threshold, reorder_quantity, supplier_name } = req.body;
  if (!item_id || min_threshold === undefined || !reorder_quantity) {
    return res.status(400).json({ error: 'item_id, min_threshold, and reorder_quantity are required' });
  }

  const id = `arr-${uuidv4().slice(0, 8)}`;
  db.prepare(`
    INSERT OR REPLACE INTO auto_reorder_rules (id, item_id, min_threshold, reorder_quantity, supplier_name, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(id, item_id, Number(min_threshold), Number(reorder_quantity), supplier_name || 'Primary Supplier');

  res.status(201).json({ message: 'Auto-reorder rule configured', id });
});

// ==========================================
// 17. Barcode & Thermal Label Generator (Proposal 17)
// ==========================================
advancedInventoryRouter.post('/barcodes/generate', (req: Request, res: Response) => {
  const { entity_type, entity_id, format } = req.body;
  if (!entity_type || !entity_id) {
    return res.status(400).json({ error: 'entity_type and entity_id are required' });
  }

  const barcodeNumber = `${entity_type.slice(0, 3).toUpperCase()}${Date.now().toString().slice(-9)}`;
  const id = `bar-${uuidv4().slice(0, 8)}`;

  db.prepare(`
    INSERT INTO barcodes (id, barcode_number, barcode_type, entity_type, entity_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, barcodeNumber, format || 'CODE128', entity_type, entity_id);

  res.status(201).json({
    id,
    barcode: barcodeNumber,
    format: format || 'CODE128',
    printable_svg_mock: `<svg data-barcode="${barcodeNumber}"></svg>`
  });
});

// ==========================================
// 18. Handheld Scanner Audit (Scan Cycle Count) (Proposal 18)
// ==========================================
advancedInventoryRouter.post('/scan-audit/scan', (req: Request, res: Response) => {
  const { barcode, warehouse_id } = req.body;
  if (!barcode) return res.status(400).json({ error: 'barcode is required' });

  // Lookup by barcode or SKU or IMEI
  const item = db.prepare(`
    SELECT i.*, 
           (SELECT COUNT(*) FROM imei_records WHERE item_id = i.id AND status = 'IN_STOCK') as imei_in_stock
    FROM items i 
    WHERE (i.barcode = ? OR i.sku = ?) AND i.deleted_at IS NULL
  `).get(barcode, barcode) as any;

  if (!item) {
    // Check IMEI records directly
    const imei = db.prepare('SELECT * FROM imei_records WHERE imei = ?').get(barcode) as any;
    if (imei) {
      const parentItem = db.prepare('SELECT * FROM items WHERE id = ?').get(imei.item_id);
      return res.json({
        found: true,
        type: 'SERIALIZED_IMEI',
        imei: imei.imei,
        item: parentItem,
        status: imei.status
      });
    }
    return res.status(404).json({ found: false, message: 'No item or IMEI matches scanned code' });
  }

  res.json({
    found: true,
    type: 'STANDARD_ITEM',
    item,
    expected_qty: item.stock_quantity
  });
});

// ==========================================
// 19. Multi-Unit Item Packaging (Proposal 19)
// ==========================================
advancedInventoryRouter.get('/units/:item_id', (req: Request, res: Response) => {
  const itemId = req.params.item_id as string;
  const units = db.prepare('SELECT * FROM item_units WHERE item_id = ?').all(itemId);
  res.json(units);
});

advancedInventoryRouter.post('/units', (req: Request, res: Response) => {
  const { item_id, unit_name, conversion_factor, retail_price, wholesale_price, barcode } = req.body;
  if (!item_id || !unit_name || !conversion_factor) {
    return res.status(400).json({ error: 'item_id, unit_name, and conversion_factor are required' });
  }

  const id = `unt-${uuidv4().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO item_units (id, item_id, unit_name, conversion_factor, retail_price, wholesale_price, barcode)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, item_id, unit_name, Number(conversion_factor), Number(retail_price) || null, Number(wholesale_price) || null, barcode || null);

  res.status(201).json({ message: 'Packaging unit added successfully', id });
});

// ==========================================
// 20. Product Complete Lifecycle & Warranty Provenance (Proposal 20)
// ==========================================
advancedInventoryRouter.get('/lifecycle/:item_id', (req: Request, res: Response) => {
  const itemId = req.params.item_id as string;
  const history = db.prepare(`
    SELECT pl.*, u.name as actor_name
    FROM product_lifecycles pl
    LEFT JOIN users u ON pl.actor_id = u.id
    WHERE pl.item_id = ?
    ORDER BY pl.created_at DESC
  `).all(itemId);

  res.json(history);
});

advancedInventoryRouter.post('/lifecycle', (req: Request, res: Response) => {
  const { item_id, serial_or_imei, lifecycle_event, event_description, actor_id } = req.body;
  if (!item_id || !lifecycle_event) {
    return res.status(400).json({ error: 'item_id and lifecycle_event are required' });
  }

  const id = `lfc-${uuidv4().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO product_lifecycles (id, item_id, serial_or_imei, lifecycle_event, event_description, actor_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, item_id, serial_or_imei || null, lifecycle_event, event_description || null, actor_id || null);

  res.status(201).json({ message: 'Lifecycle event appended', id });
});
