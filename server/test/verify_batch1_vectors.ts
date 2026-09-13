import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { execSync } from 'child_process';
import { runMigrations } from '../src/db/migrations';

console.log('================================================================================');
console.log('BATCH 1 VERIFICATION VECTORS EXECUTION (MIGRATION 016 - UNIFIED DATA LAYER)');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// VECTOR A: Fresh DB + Existing DB both migrate clean
// -----------------------------------------------------------------------------
console.log('>>> VECTOR A: MIGRATION 016 RUNS CLEANLY ON EXISTING AND FRESH DBS');

// 1. Existing DB Migration
console.log('\n--- 1. Running on Existing DB (data/erp.db) ---');
const existingDbPath = path.resolve(__dirname, '../data/erp.db');
runMigrations();
const existingDb = new Database(existingDbPath);
const latestMigExisting = existingDb.prepare('SELECT version, name, executed_at FROM schema_migrations ORDER BY version DESC LIMIT 3').all() as any[];
console.log('Existing DB schema_migrations tail:');
console.log(JSON.stringify(latestMigExisting, null, 2));
assert(latestMigExisting.length > 0, 'Existing DB must have migrations');
assert(latestMigExisting[0].version === 16, `Existing DB top migration must be 16 (actual: ${latestMigExisting[0].version})`);
assert(latestMigExisting[0].name === '016_profitability_and_collections', 'Migration 16 name must match');

// 2. Fresh DB Migration (Isolated Child Process via DB_PATH)
console.log('\n--- 2. Running on Fresh DB (data/test_fresh_batch1.db) ---');
const freshDbPath = path.resolve(__dirname, '../data/test_fresh_batch1.db');
if (fs.existsSync(freshDbPath)) {
  try { fs.unlinkSync(freshDbPath); } catch {}
}

const freshRunnerCode = `
  process.env.DB_PATH = ${JSON.stringify(freshDbPath)};
  const { runMigrations } = require('./src/db/migrations');
  const Database = require('better-sqlite3');
  const assert = require('assert');
  runMigrations();
  const db = new Database(process.env.DB_PATH);
  const rows = db.prepare('SELECT version, name, executed_at FROM schema_migrations ORDER BY version DESC LIMIT 3').all();
  console.log('Fresh DB schema_migrations tail:');
  console.log(JSON.stringify(rows, null, 2));
  assert(rows[0].version === 16, 'Fresh DB migration version must be 16');
  assert(rows[0].name === '016_profitability_and_collections', 'Fresh DB migration name must match');
  db.close();
`;

const freshOutput = execSync(`npx tsx -e "${freshRunnerCode.replace(/"/g, '\\"')}"`, {
  cwd: path.resolve(__dirname, '..'),
  encoding: 'utf8'
});
console.log(freshOutput.trim());

// Clean up fresh test db
if (fs.existsSync(freshDbPath)) {
  try { fs.unlinkSync(freshDbPath); } catch {}
}
const freshWal = `${freshDbPath}-wal`;
if (fs.existsSync(freshWal)) {
  try { fs.unlinkSync(freshWal); } catch {}
}
const freshShm = `${freshDbPath}-shm`;
if (fs.existsSync(freshShm)) {
  try { fs.unlinkSync(freshShm); } catch {}
}

console.log('VECTOR A RESULT: PASS (Both existing and fresh databases migrated cleanly to version 16)\n');

// -----------------------------------------------------------------------------
// VECTOR B: Both views queryable (SELECT 1 row from each)
// -----------------------------------------------------------------------------
console.log('>>> VECTOR B: BOTH VIEWS EXIST AND ARE QUERYABLE');

const sampleCogs = existingDb.prepare('SELECT * FROM view_sales_cogs_daily LIMIT 1').get() as any;
console.log('\nSELECT 1 row from view_sales_cogs_daily:');
console.log(JSON.stringify(sampleCogs || { status: 'EMPTY_VIEW_QUERY_SUCCESS' }, null, 2));
// Verify view columns exist and can be queried
const cogsCols = existingDb.prepare('PRAGMA table_info(view_sales_cogs_daily)').all() as any[];
const cogsColNames = cogsCols.map(c => c.name);
assert(cogsColNames.includes('sale_date'), 'view_sales_cogs_daily must include sale_date');
assert(cogsColNames.includes('category'), 'view_sales_cogs_daily must include category');
assert(cogsColNames.includes('total_revenue_piastres'), 'view_sales_cogs_daily must include total_revenue_piastres');
assert(cogsColNames.includes('total_cogs_piastres'), 'view_sales_cogs_daily must include total_cogs_piastres');
assert(cogsColNames.includes('gross_margin_piastres'), 'view_sales_cogs_daily must include gross_margin_piastres');

const sampleTech = existingDb.prepare('SELECT * FROM view_technician_quality_summary LIMIT 1').get() as any;
console.log('\nSELECT 1 row from view_technician_quality_summary:');
console.log(JSON.stringify(sampleTech || { status: 'EMPTY_VIEW_QUERY_SUCCESS' }, null, 2));
const techCols = existingDb.prepare('PRAGMA table_info(view_technician_quality_summary)').all() as any[];
const techColNames = techCols.map(c => c.name);
assert(techColNames.includes('technician_id'), 'view_technician_quality_summary must include technician_id');
assert(techColNames.includes('total_completed_repairs'), 'view_technician_quality_summary must include total_completed_repairs');
assert(techColNames.includes('total_warranty_reworks'), 'view_technician_quality_summary must include total_warranty_reworks');
assert(techColNames.includes('total_labor_revenue_piastres'), 'view_technician_quality_summary must include total_labor_revenue_piastres');
assert(techColNames.includes('net_contribution_piastres'), 'view_technician_quality_summary must include net_contribution_piastres');

const sampleDead = existingDb.prepare('SELECT * FROM view_dead_stock_candidates LIMIT 1').get() as any;
console.log('\nSELECT 1 row from view_dead_stock_candidates:');
console.log(JSON.stringify(sampleDead || { status: 'EMPTY_VIEW_QUERY_SUCCESS' }, null, 2));
const deadCols = existingDb.prepare('PRAGMA table_info(view_dead_stock_candidates)').all() as any[];
const deadColNames = deadCols.map(c => c.name);
assert(deadColNames.includes('item_id'), 'view_dead_stock_candidates must include item_id');
assert(deadColNames.includes('unit_cost_piastres'), 'view_dead_stock_candidates must include unit_cost_piastres');
assert(deadColNames.includes('total_capital_at_risk_piastres'), 'view_dead_stock_candidates must include total_capital_at_risk_piastres');
assert(deadColNames.includes('days_unmoved'), 'view_dead_stock_candidates must include days_unmoved');

console.log('VECTOR B RESULT: PASS (All analytics views compiled and verified programmatically)\n');

// -----------------------------------------------------------------------------
// VECTOR C: Column definitions from pragma_table_info
// -----------------------------------------------------------------------------
console.log('>>> VECTOR C: COLUMN DEFINITIONS FROM PRAGMA_TABLE_INFO');

const instCols = existingDb.prepare("PRAGMA table_info(installment_payments)").all() as any[];
const filteredInstCols = instCols.filter(c => [
  'paid_amount_piastres',
  'remaining_amount_piastres',
  'escalation_status',
  'escalation_notes',
  'last_escalated_at',
  'last_escalated_by'
].includes(c.name));
console.log('\ninstallment_payments new columns (pragma_table_info):');
console.log(JSON.stringify(filteredInstCols, null, 2));

assert(filteredInstCols.length === 6, `installment_payments must have 6 new columns (actual: ${filteredInstCols.length})`);
const remCol = filteredInstCols.find(c => c.name === 'remaining_amount_piastres');
assert(remCol && remCol.type === 'INTEGER' && remCol.notnull === 1, 'remaining_amount_piastres must be INTEGER NOT NULL');
const paidCol = filteredInstCols.find(c => c.name === 'paid_amount_piastres');
assert(paidCol && paidCol.type === 'INTEGER', 'paid_amount_piastres must be INTEGER');
const escCol = filteredInstCols.find(c => c.name === 'escalation_status');
assert(escCol && escCol.dflt_value === "'PENDING'", 'escalation_status default must be PENDING');

const custCols = existingDb.prepare("PRAGMA table_info(customers)").all() as any[];
const filteredCustCols = custCols.filter(c => [
  'loyalty_tier',
  'lifetime_spend_piastres',
  'tier_override',
  'tier_override_reason',
  'tier_updated_at'
].includes(c.name));
console.log('\ncustomers new columns (pragma_table_info):');
console.log(JSON.stringify(filteredCustCols, null, 2));

assert(filteredCustCols.length === 5, `customers must have 5 loyalty columns (actual: ${filteredCustCols.length})`);
const tierCol = filteredCustCols.find(c => c.name === 'loyalty_tier');
assert(tierCol && tierCol.dflt_value === "'BRONZE'", 'loyalty_tier default must be BRONZE');
const spendCol = filteredCustCols.find(c => c.name === 'lifetime_spend_piastres');
assert(spendCol && spendCol.type === 'INTEGER', 'lifetime_spend_piastres must be INTEGER');

const logsCols = existingDb.prepare("PRAGMA table_info(installment_collection_logs)").all() as any[];
console.log('\ninstallment_collection_logs table columns (pragma_table_info):');
console.log(JSON.stringify(logsCols, null, 2));
assert(logsCols.length === 7, `installment_collection_logs must have 7 columns (actual: ${logsCols.length})`);

console.log('VECTOR C RESULT: PASS (All required columns and tables verified programmatically)\n');

// -----------------------------------------------------------------------------
// VECTOR D: Settings table rows for loyalty/aging defaults
// -----------------------------------------------------------------------------
console.log('>>> VECTOR D: SETTINGS TABLE ROWS FOR LOYALTY/AGING DEFAULTS');

const settingsRows = existingDb.prepare("SELECT key, value, description FROM settings ORDER BY key").all() as any[];
console.log('\nsettings rows:');
console.log(JSON.stringify(settingsRows, null, 2));

assert(settingsRows.length >= 8, `settings table must contain at least 8 default rows (actual: ${settingsRows.length})`);
const settingsMap = new Map(settingsRows.map(r => [r.key, r.value]));
assert(settingsMap.get('loyalty_tier_silver_threshold_piastres') === '500000', 'Silver threshold must be 500,000');
assert(settingsMap.get('loyalty_tier_gold_threshold_piastres') === '2000000', 'Gold threshold must be 2,000,000');
assert(settingsMap.get('loyalty_tier_silver_bonus_pct') === '3', 'Silver bonus must be 3%');
assert(settingsMap.get('loyalty_tier_gold_bonus_pct') === '7', 'Gold bonus must be 7%');
assert(settingsMap.get('installments_reminder_days_before') === '2', 'Reminder offset must be 2 days');
assert(settingsMap.get('installments_aging_bucket_a_days') === '7', 'Bucket A must be 7 days');
assert(settingsMap.get('installments_aging_bucket_b_days') === '30', 'Bucket B must be 30 days');
assert(settingsMap.get('installments_aging_bucket_c_days') === '60', 'Bucket C must be 60 days');

console.log('VECTOR D RESULT: PASS (All 8 dynamic settings rows verified programmatically)\n');

// -----------------------------------------------------------------------------
// VECTOR E: EXPLAIN QUERY PLAN for report queries
// -----------------------------------------------------------------------------
console.log('>>> VECTOR E: EXPLAIN QUERY PLAN FOR INTENDED INDEX USAGE');

console.log('\n1a. Plan: Installments due date range query (idx_inst_payments_due_date):');
const plan1a = existingDb.prepare("EXPLAIN QUERY PLAN SELECT * FROM installment_payments WHERE due_date < date('now') AND status != 'PAID'").all() as any[];
console.log(JSON.stringify(plan1a, null, 2));
assert(plan1a.some(p => p.detail.includes('idx_inst_payments_due_date')), 'Plan 1a must utilize idx_inst_payments_due_date');

console.log('\n1b. Plan: Installments status & due date query (idx_inst_payments_due_status):');
const plan1b = existingDb.prepare("EXPLAIN QUERY PLAN SELECT * FROM installment_payments WHERE status = 'PENDING' AND due_date < date('now')").all() as any[];
console.log(JSON.stringify(plan1b, null, 2));
assert(plan1b.some(p => p.detail.includes('idx_inst_payments_due_status')), 'Plan 1b must utilize idx_inst_payments_due_status');

console.log('\n2. Plan: Sales items by item_id query (idx_sale_items_item_id):');
const plan2 = existingDb.prepare("EXPLAIN QUERY PLAN SELECT * FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.item_id = 'item-sample'").all() as any[];
console.log(JSON.stringify(plan2, null, 2));
assert(plan2.some(p => p.detail.includes('idx_sale_items_item_id')), 'Plan 2 must utilize idx_sale_items_item_id');

console.log('\n3. Plan: Repair tickets by tech and status query (idx_repair_tickets_tech_status):');
const plan3 = existingDb.prepare("EXPLAIN QUERY PLAN SELECT * FROM repair_tickets WHERE assigned_tech_id = 'tech-sample' AND status = 'COMPLETED'").all() as any[];
console.log(JSON.stringify(plan3, null, 2));
assert(plan3.some(p => p.detail.includes('idx_repair_tickets_tech_status')), 'Plan 3 must utilize idx_repair_tickets_tech_status');

console.log('\n4. Plan: Customers by loyalty tier query (idx_customers_loyalty_tier):');
const plan4 = existingDb.prepare("EXPLAIN QUERY PLAN SELECT * FROM customers WHERE loyalty_tier = 'GOLD'").all() as any[];
console.log(JSON.stringify(plan4, null, 2));
assert(plan4.some(p => p.detail.includes('idx_customers_loyalty_tier')), 'Plan 4 must utilize idx_customers_loyalty_tier');

console.log('\n5. Plan: Items by category and stock query (idx_items_category_stock):');
const plan5 = existingDb.prepare("EXPLAIN QUERY PLAN SELECT * FROM items WHERE category = 'SCREENS' AND stock_quantity > 0").all() as any[];
console.log(JSON.stringify(plan5, null, 2));
assert(plan5.some(p => p.detail.includes('idx_items_category_stock')), 'Plan 5 must utilize idx_items_category_stock');

console.log('\n6. Plan: Item cost history FIFO lookup query (idx_item_cost_history_item_effective):');
const plan6 = existingDb.prepare("EXPLAIN QUERY PLAN SELECT cost_price FROM item_cost_history WHERE item_id = 'item-sample' AND effective_from <= '2026-09-13' ORDER BY effective_from DESC LIMIT 1").all() as any[];
console.log(JSON.stringify(plan6, null, 2));
assert(plan6.some(p => p.detail.includes('idx_item_cost_history_item_effective')), 'Plan 6 must utilize idx_item_cost_history_item_effective');

console.log('VECTOR E RESULT: PASS (All query plans programmatically asserted to utilize composite indexes)\n');

existingDb.close();
console.log('================================================================================');
console.log('BATCH 1 VECTORS A-E: ALL 5 ASSERTED AND PASSED PROGRAMMATICALLY');
console.log('================================================================================');
