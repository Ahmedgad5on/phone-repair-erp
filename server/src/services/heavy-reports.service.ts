import db from '../db/database';

export interface HeavyReportResult {
  period: string;
  totalSales: number;
  totalRepairs: number;
  totalPartsConsumed: number;
  grossRevenue: number;
  netProfit: number;
  salesCount: number;
  ticketsCount: number;
  processedBatches: number;
  executionTimeMs: number;
}

export class HeavyReportsService {
  /**
   * Async chunked aggregation for comprehensive annual/quarterly financial P&L
   * Processes large volumes of sales and repair records in non-blocking batches
   * preventing event loop lag (Maintenance Proposal 48)
   */
  static async generateAggregatedPnL(startDate: string, endDate: string, chunkSize: number = 200): Promise<HeavyReportResult> {
    const startTime = Date.now();

    // 1. Fetch total sales in batches using async yield
    let totalSalesRevenue = 0;
    let totalSalesCount = 0;
    let salesOffset = 0;
    let hasMoreSales = true;

    const salesBatchStmt = db.prepare(`
      SELECT total, discount, tax FROM sales
      WHERE created_at BETWEEN ? AND ? AND deleted_at IS NULL
      LIMIT ? OFFSET ?
    `);

    while (hasMoreSales) {
      const batch = salesBatchStmt.all(startDate, endDate, chunkSize, salesOffset) as Array<{ total: number; discount: number; tax: number }>;
      if (batch.length === 0) {
        hasMoreSales = false;
        break;
      }

      for (const s of batch) {
        totalSalesRevenue += (s.total || 0);
        totalSalesCount++;
      }

      salesOffset += batch.length;
      // Yield to event loop to allow other requests to process concurrently
      await new Promise(resolve => setImmediate(resolve));
    }

    // 2. Fetch repair tickets in batches
    let totalRepairRevenue = 0;
    let totalPartsCost = 0;
    let totalTicketsCount = 0;
    let ticketOffset = 0;
    let hasMoreTickets = true;

    const ticketBatchStmt = db.prepare(`
      SELECT estimated_cost, parts_cost, labor_charge FROM repair_tickets
      WHERE created_at BETWEEN ? AND ? AND deleted_at IS NULL
      LIMIT ? OFFSET ?
    `);

    while (hasMoreTickets) {
      const batch = ticketBatchStmt.all(startDate, endDate, chunkSize, ticketOffset) as Array<{ estimated_cost: number; parts_cost: number; labor_charge: number }>;
      if (batch.length === 0) {
        hasMoreTickets = false;
        break;
      }

      for (const t of batch) {
        totalRepairRevenue += (t.estimated_cost || 0);
        totalPartsCost += (t.parts_cost || 0);
        totalTicketsCount++;
      }

      ticketOffset += batch.length;
      await new Promise(resolve => setImmediate(resolve));
    }

    const grossRevenue = totalSalesRevenue + totalRepairRevenue;
    const netProfit = grossRevenue - totalPartsCost;
    const executionTimeMs = Date.now() - startTime;

    return {
      period: `${startDate} to ${endDate}`,
      totalSales: Number(totalSalesRevenue.toFixed(2)),
      totalRepairs: Number(totalRepairRevenue.toFixed(2)),
      totalPartsConsumed: Number(totalPartsCost.toFixed(2)),
      grossRevenue: Number(grossRevenue.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      salesCount: totalSalesCount,
      ticketsCount: totalTicketsCount,
      processedBatches: Math.ceil((totalSalesCount + totalTicketsCount) / chunkSize),
      executionTimeMs
    };
  }
}
