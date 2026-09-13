import type { Database } from 'better-sqlite3';
import { Migration } from './001_initial_extensions';

function addColumnIfNotExists(db: Database, table: string, column: string, columnDef: string) {
  try {
    const columns = db.prepare('SELECT name FROM pragma_table_info(?)').all(table) as { name: string }[];
    if (columns.length > 0 && !columns.some(col => col.name === column)) {
      db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${columnDef}`);
      console.log(`[Migration 016] Added column ${column} to ${table}`);
    }
  } catch (err: any) {
    console.error(`[Migration 016] Failed to add column ${column} to ${table}:`, err.message);
    throw err;
  }
}

export const migration016: Migration = {
  version: 16,
  name: '016_profitability_and_collections',
  up: (db: Database) => {
    console.log('[Migration 016] Executing Profitability & Collections Wave Data Layer...');

    // -------------------------------------------------------------------------
    // 1. Feature 004: Installments Collections Command Center (TASK-4.1)
    // -------------------------------------------------------------------------
    addColumnIfNotExists(db, 'installment_payments', 'paid_amount_piastres', 'INTEGER DEFAULT 0');
    addColumnIfNotExists(db, 'installment_payments', 'remaining_amount_piastres', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfNotExists(db, 'installment_payments', 'escalation_status', "TEXT DEFAULT 'PENDING'");
    addColumnIfNotExists(db, 'installment_payments', 'escalation_notes', 'TEXT');
    addColumnIfNotExists(db, 'installment_payments', 'last_escalated_at', 'TEXT');
    addColumnIfNotExists(db, 'installment_payments', 'last_escalated_by', 'TEXT REFERENCES users(id)');

    // Backfill installment_payments piastres values for any existing records
    db.exec(`
      -- Backfill UNPAID installments
      UPDATE installment_payments
      SET remaining_amount_piastres = CAST(ROUND(amount * 100) AS INTEGER),
          paid_amount_piastres = 0,
          escalation_status = 'PENDING'
      WHERE status != 'PAID' AND remaining_amount_piastres = 0 AND amount > 0;

      -- Backfill PAID installments
      UPDATE installment_payments
      SET paid_amount_piastres = CAST(ROUND(amount * 100) AS INTEGER),
          remaining_amount_piastres = 0,
          escalation_status = 'PAID'
      WHERE status = 'PAID' AND paid_amount_piastres = 0 AND amount > 0;
    `);

    // Table: installment_collection_logs for auditable escalation & collection history
    db.exec(`
      CREATE TABLE IF NOT EXISTS installment_collection_logs (
        id TEXT PRIMARY KEY,
        payment_id TEXT NOT NULL REFERENCES installment_payments(id),
        plan_id TEXT NOT NULL REFERENCES installment_plans(id),
        action_type TEXT NOT NULL,
        notes TEXT NOT NULL,
        actor_id TEXT REFERENCES users(id),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Indexes for installments lookups & aging bucket performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_inst_payments_due_status ON installment_payments(status, due_date);
      CREATE INDEX IF NOT EXISTS idx_inst_payments_due_date ON installment_payments(due_date, status);
      CREATE INDEX IF NOT EXISTS idx_inst_payments_plan_id ON installment_payments(plan_id);
    `);

    // -------------------------------------------------------------------------
    // 2. Feature 005: Profitability & Margin Analytics Engine (TASK-5.1)
    // -------------------------------------------------------------------------
    // Indexes supporting reporting views & aggregations
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sale_items_item_id ON sale_items(item_id);
      CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sales_created_status ON sales(created_at, status);
      CREATE INDEX IF NOT EXISTS idx_repair_tickets_tech_status ON repair_tickets(assigned_tech_id, status);
      CREATE INDEX IF NOT EXISTS idx_repair_tickets_warranty_repair ON repair_tickets(is_warranty_repair, parent_ticket_id);
      CREATE INDEX IF NOT EXISTS idx_items_category_stock ON items(category, stock_quantity);
      CREATE INDEX IF NOT EXISTS idx_item_cost_history_item_effective ON item_cost_history(item_id, effective_from DESC);
    `);

    // View: view_sales_cogs_daily
    db.exec(`
      CREATE VIEW IF NOT EXISTS view_sales_cogs_daily AS
      SELECT 
        date(s.created_at) AS sale_date,
        i.category AS category,
        si.item_id AS item_id,
        si.item_name AS item_name,
        SUM(si.quantity) AS total_quantity_sold,
        CAST(ROUND(SUM(si.total_price * 100)) AS INTEGER) AS total_revenue_piastres,
        CAST(ROUND(SUM(si.quantity * COALESCE(
          (SELECT ich.cost_price FROM item_cost_history ich WHERE ich.item_id = si.item_id AND ich.effective_from <= s.created_at ORDER BY ich.effective_from DESC LIMIT 1),
          i.purchase_price,
          0
        ) * 100)) AS INTEGER) AS total_cogs_piastres,
        CAST(ROUND(SUM(si.total_price * 100) - SUM(si.quantity * COALESCE(
          (SELECT ich.cost_price FROM item_cost_history ich WHERE ich.item_id = si.item_id AND ich.effective_from <= s.created_at ORDER BY ich.effective_from DESC LIMIT 1),
          i.purchase_price,
          0
        ) * 100)) AS INTEGER) AS gross_margin_piastres
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN items i ON i.id = si.item_id
      WHERE s.status = 'COMPLETED' AND s.deleted_at IS NULL
      GROUP BY date(s.created_at), i.category, si.item_id, si.item_name;
    `);

    // View: view_technician_quality_summary
    db.exec(`
      CREATE VIEW IF NOT EXISTS view_technician_quality_summary AS
      SELECT 
        u.id AS technician_id,
        u.name AS technician_name,
        u.username AS technician_username,
        COUNT(CASE WHEN rt.status IN ('COMPLETED', 'DELIVERED') THEN 1 END) AS total_completed_repairs,
        COUNT(CASE WHEN rt.is_warranty_repair = 1 OR rt.parent_ticket_id IS NOT NULL THEN 1 END) AS total_warranty_reworks,
        CAST(ROUND(SUM(CASE WHEN rt.status IN ('COMPLETED', 'DELIVERED') THEN rt.labor_charge * 100 ELSE 0 END)) AS INTEGER) AS total_labor_revenue_piastres,
        CAST(ROUND(SUM(COALESCE(rt.warranty_cost_amount, 0))) AS INTEGER) AS total_warranty_expense_piastres,
        CAST(ROUND(
          SUM(CASE WHEN rt.status IN ('COMPLETED', 'DELIVERED') THEN rt.labor_charge * 100 ELSE 0 END) - 
          SUM(COALESCE(rt.warranty_cost_amount, 0))
        ) AS INTEGER) AS net_contribution_piastres
      FROM users u
      LEFT JOIN repair_tickets rt ON rt.assigned_tech_id = u.id AND rt.deleted_at IS NULL
      WHERE u.role IN ('Technician', 'TECHNICIAN', 'Manager', 'MANAGER', 'Admin', 'ADMIN')
      GROUP BY u.id, u.name, u.username;
    `);

    // View: view_dead_stock_candidates
    db.exec(`
      CREATE VIEW IF NOT EXISTS view_dead_stock_candidates AS
      SELECT 
        i.id AS item_id,
        i.sku,
        i.barcode,
        i.name AS item_name,
        i.category,
        i.stock_quantity,
        CAST(ROUND(i.purchase_price * 100) AS INTEGER) AS unit_cost_piastres,
        CAST(ROUND(i.stock_quantity * i.purchase_price * 100) AS INTEGER) AS total_capital_at_risk_piastres,
        i.last_sold_date,
        COALESCE(
          (SELECT MAX(s.created_at) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.item_id = i.id AND s.status = 'COMPLETED'),
          i.last_sold_date,
          i.created_at
        ) AS last_movement_date,
        CAST((julianday('now') - julianday(COALESCE(
          (SELECT MAX(s.created_at) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.item_id = i.id AND s.status = 'COMPLETED'),
          i.last_sold_date,
          i.created_at
        ))) AS INTEGER) AS days_unmoved
      FROM items i
      WHERE i.deleted_at IS NULL AND i.stock_quantity > 0;
    `);

    // -------------------------------------------------------------------------
    // 3. Feature 006: Customer Loyalty Tiers (TASK-6.1)
    // -------------------------------------------------------------------------
    // Loyalty columns on customers
    addColumnIfNotExists(db, 'customers', 'loyalty_tier', "TEXT DEFAULT 'BRONZE' CHECK (loyalty_tier IN ('BRONZE', 'SILVER', 'GOLD'))");
    addColumnIfNotExists(db, 'customers', 'lifetime_spend_piastres', 'INTEGER DEFAULT 0');
    addColumnIfNotExists(db, 'customers', 'tier_override', 'INTEGER DEFAULT 0');
    addColumnIfNotExists(db, 'customers', 'tier_override_reason', 'TEXT');
    addColumnIfNotExists(db, 'customers', 'tier_updated_at', 'TEXT');

    db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_loyalty_tier ON customers(loyalty_tier);`);

    // Settings table for dynamic configurations (NFR-010)
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed default settings for loyalty tiers & installment aging
    const seedStmt = db.prepare(`
      INSERT OR IGNORE INTO settings (key, value, description, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);

    seedStmt.run('loyalty_tier_silver_threshold_piastres', '500000', 'Spend threshold for SILVER tier in integer piastres (5,000 EGP)');
    seedStmt.run('loyalty_tier_gold_threshold_piastres', '2000000', 'Spend threshold for GOLD tier in integer piastres (20,000 EGP)');
    seedStmt.run('loyalty_tier_silver_bonus_pct', '3', 'Discount bonus percentage for SILVER tier (3%)');
    seedStmt.run('loyalty_tier_gold_bonus_pct', '7', 'Discount bonus percentage for GOLD tier (7%)');
    seedStmt.run('installments_reminder_days_before', '2', 'Days before due date to send reminder notification');
    seedStmt.run('installments_aging_bucket_a_days', '7', 'Days overdue threshold for Bucket A (Mild)');
    seedStmt.run('installments_aging_bucket_b_days', '30', 'Days overdue threshold for Bucket B (Moderate)');
    seedStmt.run('installments_aging_bucket_c_days', '60', 'Days overdue threshold for Bucket C (Severe)');

    console.log('[Migration 016] Successfully applied Profitability & Collections Wave Data Layer.');
  }
};

export default migration016;
