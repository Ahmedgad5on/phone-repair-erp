import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { logAudit } from '../../services/audit.service';

export const ecommerceStoreRouter = Router();

/**
 * 1. Public Storefront Catalog
 */
ecommerceStoreRouter.get('/catalog', (_req: Request, res: Response) => {
  try {
    const catalog = db.prepare(`
      SELECT ec.*, i.name as product_name, i.sku, i.category, i.quantity_on_hand
      FROM ecommerce_catalog ec
      JOIN items i ON ec.item_id = i.id
      WHERE ec.is_published = 1 AND (i.deleted_at IS NULL)
      ORDER BY ec.featured DESC, ec.created_at DESC
    `).all();
    res.json(catalog);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. Publish or Update Item in Online Catalog
 */
ecommerceStoreRouter.post('/catalog/publish', (req: Request, res: Response) => {
  try {
    const { itemId, onlineTitle, onlineDescription, onlinePrice, featured = 0, imageUrls = '' } = req.body;
    if (!itemId || !onlineTitle) {
      return res.status(400).json({ error: 'itemId and onlineTitle are required' });
    }

    const slug = onlineTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + `-${Date.now().toString().slice(-4)}`;
    const id = `cat-${Date.now()}`;

    db.prepare(`
      INSERT INTO ecommerce_catalog (id, item_id, is_published, featured, online_title, online_description, online_price, image_urls, slug)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(item_id) DO UPDATE SET
        online_title = excluded.online_title,
        online_description = excluded.online_description,
        online_price = excluded.online_price,
        featured = excluded.featured,
        image_urls = excluded.image_urls
    `).run(id, itemId, featured ? 1 : 0, onlineTitle, onlineDescription || '', onlinePrice, imageUrls, slug);

    res.json({ success: true, message: 'Item published to web storefront', slug });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. List Web Orders
 */
ecommerceStoreRouter.get('/orders', (_req: Request, res: Response) => {
  try {
    const orders = db.prepare('SELECT * FROM ecommerce_cart_orders ORDER BY created_at DESC').all();
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Online Checkout with Payment Integration (Fawry, Visa, InstaPay, COD)
 */
ecommerceStoreRouter.post('/orders/checkout', (req: Request, res: Response) => {
  try {
    const { customerName, customerPhone, shippingAddress, items, paymentMethod = 'FAWRY' } = req.body;
    if (!customerName || !customerPhone || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'customerName, customerPhone, and valid items array are required' });
    }

    let subtotal = 0;
    for (const itm of items) {
      subtotal += (itm.price || 0) * (itm.qty || 1);
    }
    const shippingFee = 50.0;
    const totalAmount = subtotal + shippingFee;

    const orderNumber = `ORD-WEB-${Date.now().toString().slice(-6)}`;
    const orderId = `ord-${Date.now()}`;

    db.prepare(`
      INSERT INTO ecommerce_cart_orders (id, order_number, customer_name, customer_phone, shipping_address, items_json, subtotal, shipping_fee, total_amount, payment_method, payment_status, fulfillment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'NEW')
    `).run(orderId, orderNumber, customerName, customerPhone, shippingAddress || 'Store Pickup', JSON.stringify(items), subtotal, shippingFee, totalAmount, paymentMethod);

    // Atomically decrement stock for purchased items
    for (const itm of items) {
      if (itm.itemId) {
        db.prepare('UPDATE items SET quantity_on_hand = MAX(0, quantity_on_hand - ?) WHERE id = ?').run(itm.qty || 1, itm.itemId);
      }
    }

    logAudit({
      action: 'ECOMMERCE_ORDER_PLACED',
      entityType: 'ECOMMERCE_ORDER',
      entityId: orderId,
      newValues: { orderNumber, totalAmount, paymentMethod }
    });

    res.status(201).json({
      success: true,
      orderId,
      orderNumber,
      totalAmount,
      paymentMethod,
      fulfillmentStatus: 'NEW',
      message: 'Order created successfully and inventory reserved'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. Update Order Fulfillment Status
 */
ecommerceStoreRouter.patch('/orders/:id/status', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus } = req.body;

    db.prepare(`
      UPDATE ecommerce_cart_orders
      SET fulfillment_status = COALESCE(?, fulfillment_status),
          payment_status = COALESCE(?, payment_status)
      WHERE id = ?
    `).run(status || null, paymentStatus || null, id);

    res.json({ success: true, message: 'Order status updated' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
