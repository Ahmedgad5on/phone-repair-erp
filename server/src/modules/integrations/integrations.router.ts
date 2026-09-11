import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { wsService } from '../../services/ws.service';
import { auditService } from '../../services/audit.service';

export const integrationsRouter = Router();

// ==========================================
// 5. Payment Gateway Integration (Paymob, Fawry, Cards) (Proposal 5)
// ==========================================
integrationsRouter.post('/payments/checkout', (req: Request, res: Response) => {
  const { order_id, gateway, amount } = req.body;
  if (!order_id || !amount) {
    return res.status(400).json({ error: 'order_id and amount are required.' });
  }

  const selectedGateway = (gateway || 'PAYMOB').toUpperCase();
  const txId = `pg-tx-${uuidv4().slice(0, 8)}`;
  const gatewayRefId = `${selectedGateway}-REF-${Date.now().toString().slice(-6)}`;

  db.prepare(`
    INSERT INTO payment_gateway_txs (id, order_id, gateway, amount, currency, gateway_ref_id, status, raw_payload)
    VALUES (?, ?, ?, ?, 'EGP', ?, 'PENDING', ?)
  `).run(txId, order_id, selectedGateway, Number(amount), gatewayRefId, JSON.stringify(req.body));

  res.json({
    transaction_id: txId,
    gateway: selectedGateway,
    amount: Number(amount),
    gateway_reference: gatewayRefId,
    checkout_url: `https://checkout.${selectedGateway.toLowerCase()}.com/pay/${gatewayRefId}`,
    status: 'PENDING'
  });
});

integrationsRouter.post('/payments/webhook', (req: Request, res: Response) => {
  const { transaction_id, status } = req.body;
  if (!transaction_id) return res.status(400).json({ error: 'transaction_id is required' });

  const finalStatus = status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
  db.prepare(`
    UPDATE payment_gateway_txs SET status = ? WHERE id = ?
  `).run(finalStatus, transaction_id);

  wsService.broadcast('PAYMENT_STATUS_UPDATE', {
    transaction_id,
    status: finalStatus
  });

  res.json({ message: 'Payment webhook processed successfully', status: finalStatus });
});

// ==========================================
// 6. SMS Gateway Integration (Proposal 6)
// ==========================================
integrationsRouter.post('/sms/send', (req: Request, res: Response) => {
  const { phone_number, message } = req.body;
  if (!phone_number || !message) {
    return res.status(400).json({ error: 'phone_number and message are required.' });
  }

  const id = `sms-${uuidv4().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO sms_logs (id, phone_number, message, provider, delivery_status, cost)
    VALUES (?, ?, ?, 'TELECOM_EGYPT_GATEWAY', 'DELIVERED', 0.05)
  `).run(id, phone_number, message);

  res.json({
    message_id: id,
    status: 'DELIVERED',
    recipient: phone_number,
    credits_remaining: 4850
  });
});

integrationsRouter.get('/sms/logs', (_req: Request, res: Response) => {
  const logs = db.prepare('SELECT * FROM sms_logs ORDER BY created_at DESC LIMIT 50').all();
  res.json(logs);
});

// ==========================================
// 7. Google Calendar & Outlook Sync (Proposal 7)
// ==========================================
integrationsRouter.get('/calendar/feed.ics', (_req: Request, res: Response) => {
  const appointments = db.prepare(`
    SELECT sa.*, c.name as customer_name
    FROM service_appointments sa
    LEFT JOIN customers c ON sa.customer_id = c.id
    WHERE sa.status != 'CANCELLED'
  `).all() as any[];

  // Generate standard RFC 5545 iCalendar stream
  let ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Alpha Mobile ERP//EN\r\nCALSCALE:GREGORIAN\r\n`;
  for (const app of appointments) {
    const cleanDate = (app.appointment_date || '2026-09-10').replace(/-/g, '');
    const cleanTime = (app.start_time || '10:00').replace(/:/g, '') + '00';
    ics += `BEGIN:VEVENT\r\n`;
    ics += `UID:${app.id}@alphamobile.local\r\n`;
    ics += `SUMMARY:Repair Appointment: ${app.customer_name || 'Customer'}\r\n`;
    ics += `DESCRIPTION:Device: ${app.device_model || 'Phone'} - Issue: ${app.issue_description || 'Maintenance'}\r\n`;
    ics += `DTSTART:${cleanDate}T${cleanTime}Z\r\n`;
    ics += `STATUS:CONFIRMED\r\n`;
    ics += `END:VEVENT\r\n`;
  }
  ics += `END:VCALENDAR\r\n`;

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="erp-appointments.ics"');
  res.send(ics);
});

// ==========================================
// 8. E-Commerce Platform Sync (Shopify / WooCommerce) (Proposal 8)
// ==========================================
integrationsRouter.post('/ecommerce/sync', (req: Request, res: Response) => {
  const { platform } = req.body;
  const targetPlatform = platform || 'SHOPIFY';

  const items = db.prepare('SELECT id, name, sku, stock_quantity, retail_price FROM items WHERE deleted_at IS NULL LIMIT 20').all() as any[];

  const syncId = `sync-${uuidv4().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO ecommerce_sync_logs (id, platform, direction, entity_type, entity_id, status, payload)
    VALUES (?, ?, 'OUTBOUND', 'STOCK_LEVELS', 'ALL', 'SUCCESS', ?)
  `).run(syncId, targetPlatform, JSON.stringify({ items_synced: items.length }));

  res.json({
    sync_id: syncId,
    platform: targetPlatform,
    synced_items_count: items.length,
    status: 'SUCCESS',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// 9. Egyptian E-Invoice (ETA Compliance) (Proposal 9)
// ==========================================
integrationsRouter.post('/e-invoice/generate', (req: Request, res: Response) => {
  const { sale_id } = req.body;
  if (!sale_id) return res.status(400).json({ error: 'sale_id is required' });

  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(sale_id) as any;
  if (!sale) return res.status(404).json({ error: 'Sale record not found' });

  const invoiceUuid = uuidv4();
  const taxAmount = Number(((sale.total || 0) * 0.14).toFixed(2)); // Egyptian 14% VAT
  const totalWithTax = Number(((sale.total || 0) + taxAmount).toFixed(2));
  const etaHash = `ETA-EGY-${Date.now()}-${uuidv4().slice(0, 12)}`;

  db.prepare(`
    INSERT INTO e_invoices (id, sale_id, uuid, submission_id, document_type, tax_amount, total_amount, qr_code_hash, eta_status)
    VALUES (?, ?, ?, ?, 'INV', ?, ?, ?, 'Valid')
  `).run(`einv-${uuidv4().slice(0, 8)}`, sale_id, invoiceUuid, `SUB-${Date.now()}`, taxAmount, totalWithTax, etaHash);

  res.json({
    uuid: invoiceUuid,
    eta_status: 'Valid',
    tax_authority_hash: etaHash,
    tax_amount: taxAmount,
    total_amount: totalWithTax,
    qr_code_payload: `Seller: Alpha Mobile ERP | VAT: 100293847 | UUID: ${invoiceUuid} | Total: ${totalWithTax} EGP`
  });
});

// ==========================================
// 10. Shipping & Courier Integration (Aramex & Bosta) (Proposal 10)
// ==========================================
integrationsRouter.post('/shipping/create', (req: Request, res: Response) => {
  const { carrier, customer_name, destination_address, ticket_id, sale_id } = req.body;
  if (!customer_name || !destination_address) {
    return res.status(400).json({ error: 'customer_name and destination_address are required' });
  }

  const selectedCarrier = (carrier || 'BOSTA').toUpperCase();
  const trackingNumber = `${selectedCarrier}-${Date.now().toString().slice(-8)}`;
  const shipmentId = `shp-${uuidv4().slice(0, 8)}`;

  db.prepare(`
    INSERT INTO shipments (id, carrier, tracking_number, ticket_id, sale_id, customer_name, destination_address, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATED')
  `).run(shipmentId, selectedCarrier, trackingNumber, ticket_id || null, sale_id || null, customer_name, destination_address);

  res.status(201).json({
    shipment_id: shipmentId,
    carrier: selectedCarrier,
    tracking_number: trackingNumber,
    airway_bill_url: `https://track.${selectedCarrier.toLowerCase()}.com/awb/${trackingNumber}`,
    status: 'CREATED'
  });
});

integrationsRouter.get('/shipping/track/:tracking_number', (req: Request, res: Response) => {
  const trackingNumber = req.params.tracking_number as string;
  const shipment = db.prepare('SELECT * FROM shipments WHERE tracking_number = ?').get(trackingNumber);

  if (!shipment) {
    return res.status(404).json({ error: 'Shipment tracking number not found' });
  }

  res.json(shipment);
});

// ==========================================
// 11. Hardware ESC/POS & Thermal PDF Endpoint
// ==========================================
integrationsRouter.post('/hardware/receipt/pdf', async (req: Request, res: Response) => {
  try {
    const { ThermalPrinterService } = await import('../../services/thermal.service');
    const data = req.body;
    if (!data.storeName || !data.receiptNumber || !data.items) {
      return res.status(400).json({ error: 'storeName, receiptNumber, and items are required.' });
    }
    const pdfBuffer = await ThermalPrinterService.generateThermalReceiptPDF(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${data.receiptNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate thermal PDF', details: err.message });
  }
});

integrationsRouter.post('/hardware/receipt/escpos', async (req: Request, res: Response) => {
  try {
    const { ThermalPrinterService } = await import('../../services/thermal.service');
    const data = req.body;
    if (!data.storeName || !data.receiptNumber || !data.items) {
      return res.status(400).json({ error: 'storeName, receiptNumber, and items are required.' });
    }
    const escposBytes = ThermalPrinterService.generateRawEscPosReceipt(data);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(escposBytes);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate raw ESC/POS bytes', details: err.message });
  }
});
