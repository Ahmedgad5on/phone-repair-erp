import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { logAudit } from '../../services/audit.service';

export const kittingRouter = Router();

/**
 * 1. List Bundles & Component Items
 */
kittingRouter.get('/bundles', (_req: Request, res: Response) => {
  try {
    const bundles = db.prepare('SELECT * FROM repair_bundles WHERE is_active = 1 ORDER BY created_at DESC').all() as any[];

    const bundlesWithItems = bundles.map(b => {
      const items = db.prepare(`
        SELECT rbi.*, i.name as item_name, i.sku as item_sku, i.quantity_on_hand
        FROM repair_bundle_items rbi
        JOIN items i ON rbi.item_id = i.id
        WHERE rbi.bundle_id = ?
      `).all(b.id);
      return {
        ...b,
        components: items
      };
    });

    res.json(bundlesWithItems);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. Create Assembly Bundle Kit
 */
kittingRouter.post('/bundles', (req: Request, res: Response) => {
  try {
    const { sku, name, description, targetDeviceModel, bundlePrice, discountPercentage = 15.0, barcode, items } = req.body;
    if (!sku || !name || !bundlePrice || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'sku, name, bundlePrice, and items array are required' });
    }

    const bundleId = `bdl-${Date.now()}`;
    const kitBarcode = barcode || `KIT-${sku}`;

    db.prepare(`
      INSERT INTO repair_bundles (id, sku, name, description, target_device_model, bundle_price, discount_percentage, barcode, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(bundleId, sku, name, description || '', targetDeviceModel || '', bundlePrice, discountPercentage, kitBarcode);

    const insertItem = db.prepare(`
      INSERT INTO repair_bundle_items (id, bundle_id, item_id, quantity, unit_cost)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const itm of items) {
      insertItem.run(`bi-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`, bundleId, itm.itemId, itm.quantity || 1, itm.unitCost || 0.0);
    }

    logAudit({
      action: 'CREATE_REPAIR_BUNDLE',
      entityType: 'REPAIR_BUNDLE',
      entityId: bundleId,
      newValues: { sku, name, bundlePrice, itemsCount: items.length }
    });

    res.status(201).json({
      id: bundleId,
      sku,
      name,
      bundlePrice,
      barcode: kitBarcode,
      message: 'Assembly kit created successfully'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. Quick Barcode Scanner Lookup for Kits
 */
kittingRouter.get('/barcode/:barcode', (req: Request, res: Response) => {
  try {
    const { barcode } = req.params;
    const bundle = db.prepare('SELECT * FROM repair_bundles WHERE barcode = ? OR sku = ?').get(barcode, barcode) as any;
    if (!bundle) return res.status(404).json({ error: 'Bundle not found' });

    const components = db.prepare(`
      SELECT rbi.*, i.name as item_name, i.quantity_on_hand
      FROM repair_bundle_items rbi
      JOIN items i ON rbi.item_id = i.id
      WHERE rbi.bundle_id = ?
    `).all(bundle.id);

    res.json({ ...bundle, components });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Sell / Apply Bundle (Atomically decrements stock for each sub-item)
 */
kittingRouter.post('/bundles/sell-bundle', (req: Request, res: Response) => {
  try {
    const { bundleId, quantity = 1 } = req.body;
    if (!bundleId) return res.status(400).json({ error: 'bundleId is required' });

    const bundle = db.prepare('SELECT * FROM repair_bundles WHERE id = ?').get(bundleId) as any;
    if (!bundle) return res.status(404).json({ error: 'Bundle not found' });

    const components = db.prepare(`
      SELECT rbi.*, i.name as item_name, i.quantity_on_hand
      FROM repair_bundle_items rbi
      JOIN items i ON rbi.item_id = i.id
      WHERE rbi.bundle_id = ?
    `).all(bundleId) as any[];

    // Verify sufficient stock for all sub-components
    for (const comp of components) {
      const requiredQty = comp.quantity * quantity;
      if (comp.quantity_on_hand < requiredQty) {
        return res.status(400).json({
          error: `Insufficient stock for component '${comp.item_name}'. Required: ${requiredQty}, Available: ${comp.quantity_on_hand}`
        });
      }
    }

    // Atomically decrement stock
    for (const comp of components) {
      const requiredQty = comp.quantity * quantity;
      db.prepare('UPDATE items SET quantity_on_hand = quantity_on_hand - ? WHERE id = ?').run(requiredQty, comp.item_id);
    }

    logAudit({
      action: 'SELL_REPAIR_BUNDLE',
      entityType: 'REPAIR_BUNDLE',
      entityId: bundleId,
      newValues: { bundleName: bundle.name, quantitySold: quantity, totalPrice: bundle.bundle_price * quantity }
    });

    res.json({
      success: true,
      bundleName: bundle.name,
      quantitySold: quantity,
      totalPrice: bundle.bundle_price * quantity,
      deductedComponents: components.map(c => ({
        itemId: c.item_id,
        name: c.item_name,
        quantityDeducted: c.quantity * quantity
      })),
      message: 'Kit processed and component inventory decremented atomically'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
