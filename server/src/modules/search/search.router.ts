import { Router, Request, Response } from 'express';
import db from '../../db/database';

export const searchRouter = Router();

searchRouter.get('/global', (req: Request, res: Response) => {
  const q = ((req.query.q as string) || '').trim();
  if (!q || q.length < 2) {
    return res.json({ customers: [], items: [], tickets: [], imeis: [], purchaseOrders: [] });
  }

  const queryPattern = `%${q}%`;

  // 1. Search Customers
  const customers = db.prepare(`
    SELECT id, name, phone, tag, total_spent
    FROM customers
    WHERE deleted_at IS NULL AND (name LIKE ? OR phone LIKE ?)
    LIMIT 5
  `).all(queryPattern, queryPattern);

  // 2. Search Items
  const items = db.prepare(`
    SELECT id, name, sku, barcode, category, stock_quantity, retail_price
    FROM items
    WHERE deleted_at IS NULL AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?)
    LIMIT 5
  `).all(queryPattern, queryPattern, queryPattern);

  // 3. Search Repair Tickets
  const tickets = db.prepare(`
    SELECT t.id, t.ticket_number, t.device_brand, t.device_model, t.status, t.priority, c.name as customer_name
    FROM repair_tickets t
    LEFT JOIN customers c ON t.customer_id = c.id
    WHERE t.deleted_at IS NULL AND (
      t.ticket_number LIKE ? OR
      t.device_model LIKE ? OR
      t.device_brand LIKE ? OR
      t.imei_sn LIKE ?
    )
    LIMIT 5
  `).all(queryPattern, queryPattern, queryPattern, queryPattern);

  // 4. Search IMEIs
  const imeis = db.prepare(`
    SELECT r.id, r.imei, r.status, r.battery_health, i.name as item_name
    FROM imei_records r
    JOIN items i ON r.item_id = i.id
    WHERE r.deleted_at IS NULL AND r.imei LIKE ?
    LIMIT 5
  `).all(queryPattern);

  // 5. Search Purchase Orders
  const purchaseOrders = db.prepare(`
    SELECT id, po_number, supplier_name, status, total_amount
    FROM purchase_orders
    WHERE po_number LIKE ? OR supplier_name LIKE ?
    LIMIT 5
  `).all(queryPattern, queryPattern);

  res.json({
    query: q,
    customers,
    items,
    tickets,
    imeis,
    purchaseOrders
  });
});
