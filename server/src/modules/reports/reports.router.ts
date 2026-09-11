import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { emailService } from '../../services/email.service';

export const reportsRouter = Router();

// 1. Comprehensive Analytics Overview for Charts
reportsRouter.get('/overview', (req: Request, res: Response) => {
  // Sales trend by last 7 days
  const dailySales = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count, COALESCE(SUM(total), 0) as revenue
    FROM sales
    WHERE status = 'COMPLETED' AND created_at >= datetime('now', '-7 days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all();

  // Category distribution
  const categorySales = db.prepare(`
    SELECT i.category, COUNT(si.id) as units_sold, COALESCE(SUM(si.subtotal), 0) as revenue
    FROM sale_items si
    JOIN items i ON si.item_id = i.id
    GROUP BY i.category
  `).all();

  // Repair Tickets by status
  const repairStatusStats = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM repair_tickets
    WHERE deleted_at IS NULL
    GROUP BY status
  `).all();

  // Top repaired phone models
  const topModels = db.prepare(`
    SELECT device_brand || ' ' || device_model as model, COUNT(*) as repair_count
    FROM repair_tickets
    GROUP BY device_brand, device_model
    ORDER BY repair_count DESC
    LIMIT 5
  `).all();

  // Tech TAT and revenue
  const techStats = db.prepare(`
    SELECT u.name, COUNT(t.id) as completed_tickets, COALESCE(SUM(t.labor_charge), 0) as labor_revenue
    FROM users u
    LEFT JOIN repair_tickets t ON t.assigned_tech_id = u.id AND t.status = 'DELIVERED'
    WHERE u.role = 'MaintenanceEngineer'
    GROUP BY u.id
  `).all();

  res.json({
    dailySales,
    categorySales,
    repairStatusStats,
    topModels,
    techStats,
    generatedAt: new Date().toISOString()
  });
});

// 2. Export Summary Data for PDF Generation
reportsRouter.get('/export-summary', (req: Request, res: Response) => {
  const store = db.prepare('SELECT * FROM stores LIMIT 1').get() as any;
  const totalRevenue = (db.prepare("SELECT COALESCE(SUM(total), 0.0) as rev FROM sales WHERE status = 'COMPLETED'").get() as any).rev;
  const totalRepairs = (db.prepare("SELECT COUNT(*) as cnt FROM repair_tickets WHERE status = 'DELIVERED'").get() as any).cnt;
  const totalInventoryValue = (db.prepare("SELECT COALESCE(SUM(stock_quantity * purchase_price), 0.0) as val FROM items WHERE deleted_at IS NULL").get() as any).val;

  res.json({
    storeName: store?.name || 'Mobile Tech Solutions',
    date: new Date().toISOString(),
    metrics: {
      totalRevenue,
      totalRepairs,
      totalInventoryValue
    }
  });
});

// 3. Email Scheduled Report
reportsRouter.post('/schedule-email', async (req: Request, res: Response) => {
  const { recipient_email } = req.body;
  if (!recipient_email) return res.status(400).json({ error: 'recipient_email is required' });

  const store = db.prepare('SELECT name FROM stores LIMIT 1').get() as any;
  const totalSalesToday = (db.prepare("SELECT COALESCE(SUM(total), 0.0) as total FROM sales WHERE date(created_at) = date('now')").get() as any).total;

  const html = `
    <h2>تقرير المبيعات والتشغيل اليومي - ${store?.name || 'الفرع الرئيسي'}</h2>
    <p>تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}</p>
    <p>إجمالي المبيعات اليومية: <strong>${totalSalesToday.toLocaleString()} ج.م</strong></p>
    <p>النظام يعمل بنجاح - Modular Mobile ERP</p>
  `;

  const result = await emailService.sendEmail({
    to: recipient_email,
    subject: `التقرير اليومي الآلي - ${store?.name || 'مركز الصيانة'}`,
    html
  });

  res.json({ success: true, message: `Report dispatched to ${recipient_email}`, messageId: result.messageId });
});

// ==========================================
// 4. Heavy Reports Async Chunked Aggregation (Maint Proposal 48)
// ==========================================
reportsRouter.get('/heavy-pnl', async (req: Request, res: Response) => {
  const startDate = (req.query.startDate as string) || '2020-01-01';
  const endDate = (req.query.endDate as string) || new Date().toISOString();

  try {
    const { HeavyReportsService } = await import('../../services/heavy-reports.service');
    const result = await HeavyReportsService.generateAggregatedPnL(startDate, endDate);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
