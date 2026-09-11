# Comprehensive Test Suite Architecture & Specification Analysis

**Author**: Test Suite Explorer (`explorer_test_1`)  
**Date**: 2026-09-10  
**Project**: Modular Mobile ERP 2.0 (Desktop, Web & Mobile)  
**Target Codebase**: `c:\Users\Eng_Ahmed\Desktop\pro`  
**Working Directory**: `c:\Users\Eng_Ahmed\Desktop\pro\.agents\explorer_test_1`  
**Reference Document**: `c:\Users\Eng_Ahmed\Desktop\pro\ORIGINAL_REQUEST.md`

---

## 1. Executive Summary

This investigation analyzes the automated backend test infrastructure of the Modular Mobile ERP system, evaluates the existing 117 tests spanning 52 test suites in `server/test/api.test.ts`, and defines the exact, production-grade specifications for the 10+ new test suites (Suites 53 through 62) and associated security/integrity tests mandated by `ORIGINAL_REQUEST.md`.

### Core Verification Facts:
1. **Runner Execution**: Executed via `npm test` in `server/` (command: `tsx test/api.test.ts`).
2. **Current Test Count**: Exactly **117 passing assertions** across **52 suites** plus 1 backup validation suite. Exits cleanly with code 0.
3. **Execution Time**: ~3.9 seconds end-to-end on Windows Node.js v24 environment with Better-SQLite3 WAL mode.
4. **Target Requirement**: Total passing tests must reach **≥ 127**. By introducing Suites 53 to 62 plus cross-cutting security tests with 3–4 assertions per suite, the test harness will expand to **147–155 passing assertions**, providing robust regression protection.

---

## 2. Test Harness Architecture & Execution Model

### 2.1 Test File Location & Invocation
- Root runner: `c:\Users\Eng_Ahmed\Desktop\pro\package.json` delegates `npm test` to `cd server && npm test`.
- Server configuration: `c:\Users\Eng_Ahmed\Desktop\pro\server\package.json` specifies `"test": "tsx test/api.test.ts"`.
- Test harness file: `c:\Users\Eng_Ahmed\Desktop\pro\server\test\api.test.ts` (690 lines, ~40.6 KB).

### 2.2 Custom Assertion Framework
The test runner does not rely on heavy external frameworks like Jest or Mocha; instead, it utilizes an ultra-fast, zero-overhead custom assertion runner:

```typescript
let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}
```

At the conclusion of the test run, `runBackupTest()` reports:
```
==============================================
🏁 AUTOMATED TEST RESULTS: 117 PASSED, 0 FAILED
==============================================
```
If `failed > 0`, `process.exit(1)` terminates execution with non-zero status.

### 2.3 Database Initialization & Fixture Lifecycle
Before running assertions, `server/test/api.test.ts` bootstraps the database in lines 15–17:
1. `import db from '../src/db/database'`: Opens `server/data/erp.db` via `better-sqlite3`, enforces `foreign_keys = ON`, `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`.
2. `runMigrations()` (`server/src/db/migrations.ts`): Executes all `CREATE TABLE IF NOT EXISTS` DDL statements, applies `addColumnIfNotExists` migrations, and creates composite indexes.
3. `seedDatabase()` (`server/src/db/seed.ts`): Populates baseline tenant data:
   - Primary Store: `store-main-001` (with all module flags `enable_repair`, `enable_retail`, `enable_spare_parts`, `enable_fintech` set to 1).
   - Core Users: `admin` (SuperAdmin, bcrypt: `admin123`), `usr-tech-1` (MaintenanceEngineer, 35% commission), `usr-cashier-1` (Cashier), `usr-mgr-01` (Manager).
   - Core Shifts: Active open shift with 5,000 EGP opening cash drawer.
   - Core Warehouses: `wh-main` (WH-MAIN), `wh-parts` (WH-PARTS).
   - Catalog: Phone items (`itm-phone-15pm` iPhone 15 Pro Max), spare parts, repair bundles.
   - Financial Accounts: Chart of Accounts (`1010` Cash on Hand, `4010` Sales Revenue, `2010` Accounts Payable, etc.).
   - Wallets: Vodafone Cash, InstaPay, Orange Cash, Etisalat Cash.

### 2.4 Authentication & Primitives Handling
- **JWT Authentication**: `signToken({ userId, username, role, storeId })` and `verifyToken(token)` from `server/src/middleware/auth.ts` are tested directly in Suite 2.
- **Password Hashing**: Bcrypt verification (`bcrypt.compareSync('admin123', adminUser.password)`) verified in Suite 2.
- **Cryptography**: AES-256-GCM symmetric encryption (`cryptoService.encrypt`, `cryptoService.decrypt`) and password entropy validation verified in Suite 18.
- **Cryptographic Audit Chain**: SHA-256 chained hashing across audit entries verified in Suite 19.

### 2.5 Current Suite Inventory (Suites 1–52)

| Suite | Title | Component Under Test | Passing Assertions |
|-------|-------|----------------------|--------------------|
| 1 | Core Engine & Feature Flags | `stores` table & module switches | 5 |
| 2 | RBAC, Bcrypt & JWT Security | `users`, `signToken`, `verifyToken` | 6 |
| 3 | Shift Handover & Deficit Calculation | `shifts`, deficit formula | 2 |
| 4 | Repair Lab Lifecycle, SLA & OTP | `repair_tickets`, commission formula | 3 |
| 5 | Retail POS Strict IMEI Tracking | `items`, `imei_records` | 2 |
| 6 | Spare Parts Compatibility & Pricing | `spare_parts_compatibility`, pricing tiers | 4 |
| 7 | Fintech E-Wallets & 95% Hard Limit | `fintech_wallets`, usage ratio | 2 |
| 8 | Online SQLite Backup & Audit Logging | `audit_logs`, `logAudit` | 2 |
| 9 | Purchase Orders (PO) Creation | `purchase_orders` lifecycle | 2 |
| 10 | Daily Cash & Drawer Reconciliation | Drawer reconciliation math | 1 |
| 11 | General Ledger & Accounting Double-Entry | `chart_of_accounts` structure | 2 |
| 12 | Multi-Warehouse Inventory Structure | `warehouses` configuration | 1 |
| 13 | Customer Loyalty Program Tiers | `loyalty_tiers` | 1 |
| 14 | Service Appointments Booking | `service_appointments` CRUD | 1 |
| 15 | AI Demand Forecasting & Smart Reorder | `ai_demand_forecasts` | 2 |
| 16 | AI Diagnostic Knowledge Base | `ai_diagnostic_kb` | 2 |
| 17 | AI Financial Fraud Detection & AML | `fraud_alerts` | 1 |
| 18 | Cryptography & Password Security | AES-256-GCM, password policy | 4 |
| 19 | Immutable Cryptographic Audit Chain | SHA-256 audit blockchain | 1 |
| 20 | Payment Gateways & ETA E-Invoice | `payment_gateway_txs`, `e_invoices` | 2 |
| 21 | Customer Surveys & NPS/CSAT Routing | `repair_surveys`, Google redirect | 2 |
| 22 | Insurance Claims & Dual-Ledger Co-Pay | `insurance_claims` deductible balance | 2 |
| 23 | E-Commerce Storefront & Cart Checkout | `ecommerce_cart_orders` | 2 |
| 24 | Multi-Branch Stock Transfers | `branch_transfers` | 2 |
| 25 | Digital Custody Contracts & E-Sign | SHA-256 signature verification | 2 |
| 26 | Digital Queue Management | `digital_queue` | 2 |
| 27 | Refurbished Device 12-Point Inspection | `refurb_devices` grading | 2 |
| 28 | Assembly & Kitting (Repair Bundles) | `repair_bundles` BOM | 1 |
| 29 | Business Rules Engine (IF-THEN) | `business_rules` evaluation | 2 |
| 30 | Stolen Device Registry & GSMA Blacklist | `stolen_device_registry` | 2 |
| 31 | Apple & Google Wallet Loyalty Passes | `walletPassService` pkpass/gpay | 3 |
| 32 | Smart Dynamic Repair Pricing Engine | `smartPricingService` margins | 4 |
| 33 | Boot Amperage Curve Logger | `RepairRepository.analyzeAmperageCurve` | 3 |
| 34 | Diode Mode Multimeter Pin Comparison | `RepairRepository.compareDiodeReadings` | 2 |
| 35 | TrueTone & BMS Serializer Sync | `RepairRepository.recordSerializerSync` | 1 |
| 36 | Workstation Queue Dispatcher | `RepairRepository.dispatchTicketToWorkstation` | 2 |
| 37 | Rapid 24-Point Digital Inspection | `RepairRepository.recordRapidInspection` | 1 |
| 38 | Customer-Facing Display (CFD) Cart | `SalesRepository.updateCfdCart` | 1 |
| 39 | Loaner Phones Management | `SalesRepository.checkoutLoaner/checkinLoaner`| 3 |
| 40 | 2.5D Bin/Drawer Micro-Locator | `InventoryRepository.triggerPickToLight` | 2 |
| 41 | Serial & Batch Number FIFO Tracking | `InventoryRepository.addBatch` | 1 |
| 42 | Automated SMS TxID Matching | `FintechRepository.parseAndMatchSms` | 4 |
| 43 | Dual-Custody Shift Rebalancing | `FintechRepository.dualCustodyRebalance` | 2 |
| 44 | Fintech Monthly Ceiling Alerts | `FintechRepository.getCeilingAlerts` | 2 |
| 45 | Cost Centers for Multi-Branches | `FintechRepository.getCostCenters` | 1 |
| 46 | OCR ID & Warranty Document Parser | `SalesRepository.parseOcrDocument` | 5 |
| 47 | B2B Fleet Account & Devices | `b2b_fleet_accounts`, `b2b_fleet_devices` | 2 |
| 48 | Gamified Workshop Leaderboard | Tech ranking pool query | 1 |
| 49 | Manager Override Token Engine | `SalesRepository.generateOverrideToken` | 3 |
| 50 | Optimistic Concurrency Locking | `SalesRepository.updateWithOptimisticLock` | 3 |
| 51 | Parameterized SQL Prepared Statements | SQLite placeholder injection protection | 1 |
| 52 | Tuned SQLite WAL Pragmas | PRAGMA journal_mode & synchronous | 2 |
| Backup | Online SQLite Backup Engine | `createDatabaseBackup`, `listBackups` | 2 |
| **Total** | | | **117** |

---

## 3. Discrepancies, Architectural Gaps & Implementation Dependencies

Through systematic file inspections of `server/src/db/migrations.ts` and module routers (`repair.router.ts`, `retail.router.ts`, `accounting.router.ts`, `fintech.router.ts`, `inventory.router.ts`), the following critical architectural gaps were uncovered:

### Gap 1: Missing Database Tables and Columns
1. **Split Payments**: Table `invoice_payments` does not exist in `migrations.ts`.
2. **Installments**: Tables `installment_plans` and `installment_payments` do not exist.
3. **Trade-In**: Table `trade_in_assessments` does not exist.
4. **Negative Stock Constraint**: `items.stock_quantity` has NO `CHECK (stock_quantity >= 0)`.
5. **Customer Credit Limit**: `customers` table lacks `credit_limit` and `credit_used` columns.
6. **Wallet Version**: `fintech_wallets` table lacks the `version` column required for optimistic locking.
7. **SLA Persistence**: `repair_tickets` table lacks `sla_started_at`.
8. **QA Checklist**: `repair_tickets` table lacks `qa_checklist`.
9. **Financial Approvals**: Table `approval_requests` does not exist.
10. **Foreign Keys**: Existing FK references in `repair_tickets`, `sale_items`, and `journal_entry_lines` do not specify `ON DELETE RESTRICT`.

### Gap 2: HTTP Status Code Mismatches in Existing Routers
1. **Unbalanced Journal Entries**:
   - `server/src/modules/accounting/accounting.router.ts:80`:
     Currently returns **HTTP 400**:
     ```typescript
     if (Math.abs(totalDebit - totalCredit) > 0.01) {
       return res.status(400).json({ error: 'DOUBLE ENTRY UNBALANCED...' });
     }
     ```
   - **Mandate**: `ORIGINAL_REQUEST.md` R4.1 & Acceptance Criteria explicitly mandate **HTTP 422**.
2. **Ticket Status State Machine**:
   - `server/src/modules/repair/repair.router.ts:189`:
     Currently accepts any status transition without validating the sequence or checking QA completion.
   - **Mandate**: `ORIGINAL_REQUEST.md` R1.5 & Security Criteria mandate **HTTP 422** for invalid transitions (e.g., `RECEIVED` -> `DELIVERED`).
3. **Void Sale Audit Log**:
   - `server/src/modules/retail/retail.router.ts:304`:
     Currently does not check `req.body.reason` or require it to be non-null.
   - **Mandate**: `ORIGINAL_REQUEST.md` R2.7 & Security Criteria mandate **HTTP 400** when voiding a sale without a reason.
4. **Overselling Guard**:
   - `server/src/modules/retail/retail.router.ts:164`:
     Currently uses `MAX(0, stock_quantity - ?)` instead of verifying available stock.
   - **Mandate**: `ORIGINAL_REQUEST.md` R2.8 & Acceptance Criteria mandate **HTTP 409** with itemized stock errors.

---

## 4. Exact Specifications for New Test Suites (Suites 53–62)

To satisfy the test runner requirements, both direct database/repository verification and HTTP status integration checks should be provided. An ephemeral Express instance or direct route execution strategy allows verifying HTTP status codes (400, 403, 409, 422, 429) inside `api.test.ts`.

---

### Test Suite 53: POS Split Payments (Multi-Method Summing to Invoice Total)
- **Objective**: Verify that a retail invoice can be settled across multiple distinct payment methods (e.g., Cash + Vodafone Cash + Credit Card) and that the database and POS engine strictly enforce that the sum of payment lines equals the invoice total.
- **Reference**: `ORIGINAL_REQUEST.md` R2.1, POS & Retail Sales.
- **Schema Target**: Table `invoice_payments` (`id`, `sale_id`, `payment_method`, `amount`, `transaction_ref`, `created_at`).
- **Test Scenarios**:
  1. **Split Sum Match**: Create an invoice for 3,500.00 EGP. Insert 3 payment records:
     - Cash: 1,500.00 EGP
     - Vodafone Cash: 1,200.00 EGP (TxID: `VF-998811`)
     - Credit Card: 800.00 EGP
     - Verify: `SUM(amount) == 3500.00`.
  2. **Multi-Method Allocation Query**: Retrieve payments by `sale_id` and ensure all 3 methods are persisted with timestamps.
  3. **Underpayment/Overpayment Rejection**: Validate that attempting to record split payments totaling 3,200.00 EGP (deficit of 300 EGP) or 3,700.00 EGP (surplus of 200 EGP) fails payment validation.
- **Exact Assertion Specifications**:
  ```typescript
  // Assertions for Suite 53:
  assert(splitPayments.length === 3, 'Split payment persisted across 3 distinct payment methods');
  assert(Math.abs(totalPaid - saleTotal) < 0.001, `Split payment sum (${totalPaid} EGP) exactly equals invoice total (${saleTotal} EGP)`);
  assert(splitValidation.isValid === false && splitValidation.deficit === 300, 'Split payment engine rejected underpaid allocation (3200 vs 3500 EGP)');
  ```

---

### Test Suite 54: Installment Sales Engine (Down Payment, Schedule & Notification Log)
- **Objective**: Verify that high-value sales can be converted into installment contracts with upfront down payment, an automated monthly amortization schedule, and integrated WhatsApp reminder logging.
- **Reference**: `ORIGINAL_REQUEST.md` R2.2, POS & Retail Sales.
- **Schema Target**:
  - `installment_plans` (`id`, `sale_id`, `customer_id`, `total_amount`, `down_payment`, `financed_amount`, `months_count`, `monthly_amount`, `status`, `created_at`).
  - `installment_payments` (`id`, `plan_id`, `installment_number`, `due_date`, `amount`, `status`, `paid_at`).
- **Test Scenarios**:
  1. **Plan Computation**: Total sale 18,000.00 EGP. Down payment 6,000.00 EGP. Remaining financed: 12,000.00 EGP over 6 months. Monthly amount: 2,000.00 EGP.
  2. **Schedule Generation**: Verify 6 payment records created in `installment_payments` with due dates spaced at 30-day intervals (`Date(due_date[n]) > Date(due_date[n-1])`).
  3. **WhatsApp Notification Log**: Verify an automated reminder entry is inserted into `whatsapp_messages_log` for the customer phone containing the contract summary and first installment due date.
- **Exact Assertion Specifications**:
  ```typescript
  // Assertions for Suite 54:
  assert(plan.down_payment === 6000 && plan.financed_amount === 12000, 'Installment plan registered with down payment and financed balance');
  assert(schedule.length === 6, 'Installment schedule generated exactly 6 monthly payment milestones');
  assert(schedule.every(p => p.amount === 2000), 'All installment milestones calculated with uniform monthly payment (2000 EGP/mo)');
  assert(notifLog !== undefined && notifLog.phone === customer.phone, 'Contract confirmation logged in whatsapp_messages_log for customer delivery');
  ```

---

### Test Suite 55: Trade-In Device Valuation & Credit Offset
- **Objective**: Verify that customer used devices can be assessed by condition grade, assigned a valuation credit, and that the credit reduces the payable balance of a new purchase.
- **Reference**: `ORIGINAL_REQUEST.md` R2.3, POS & Retail Sales.
- **Schema Target**: Table `trade_in_assessments` (`id`, `store_id`, `customer_id`, `sale_id`, `device_brand`, `device_model`, `imei`, `condition_grade`, `estimated_value`, `notes`, `status`, `created_at`).
- **Test Scenarios**:
  1. **Assessment Creation**: Trade-in of iPhone 13 128GB, condition "GRADE_B", assessed value 9,500.00 EGP. Record inserted and linked to customer.
  2. **Invoice Credit Reduction**: New purchase total is 24,000.00 EGP. Net total payable after trade-in: `24,000 - 9,500 = 14,500.00 EGP`.
  3. **IMEI Handover**: Verified that the trade-in device IMEI is stored in `trade_in_assessments` with status `APPLIED` for transfer to refurbished inspection.
- **Exact Assertion Specifications**:
  ```typescript
  // Assertions for Suite 55:
  assert(tradeIn.estimated_value === 9500, 'Trade-in valuation recorded with condition grade and estimated credit');
  assert(finalInvoiceTotal === 14500, 'POS invoice total accurately reduced by trade-in credit (24000 - 9500 = 14500 EGP)');
  assert(tradeIn.status === 'APPLIED', 'Trade-in assessment status transitioned to APPLIED upon invoice completion');
  ```

---

### Test Suite 56: Negative Stock Prevention (DB CHECK Constraint & Server Guard 409)
- **Objective**: Verify that inventory cannot drop below zero under any circumstance—enforcing both a hard database-level constraint and a server-side guard returning HTTP 409 Conflict.
- **Reference**: `ORIGINAL_REQUEST.md` R2.8, R3.1, R5.6, Acceptance Criteria.
- **Schema Target**: Table `items` with `CHECK (stock_quantity >= 0)`.
- **Test Scenarios**:
  1. **Database Constraint Enforcement**: Attempt a direct SQL update: `UPDATE items SET stock_quantity = -5 WHERE id = ?`. Better-SQLite3 must throw a constraint violation error (`SQLITE_CONSTRAINT` / `CHECK constraint failed`).
  2. **Server-Side Conflict Guard (HTTP 409)**: Simulate sale completion for quantity = 10 on an item with `stock_quantity = 3`. The server guard must reject the transaction with HTTP 409 and itemized stock deficit error.
  3. **Stock Non-Corruption**: Confirm that after both failed attempts, the item stock quantity remains intact at its initial value (3).
- **Exact Assertion Specifications**:
  ```typescript
  // Assertions for Suite 56:
  assert(dbCheckTriggered, 'Database CHECK constraint strictly rejected negative stock_quantity (< 0)');
  assert(saleGuardRes.statusCode === 409 || saleGuardRes.error.includes('INSUFFICIENT_STOCK'), 'Server guard rejected overselling with HTTP 409 Conflict & itemized stock deficit');
  assert(recheckedItem.stock_quantity === 3, 'Item inventory level preserved intact after rejected sale transaction');
  ```

---

### Test Suite 57: Double-Entry Balance Validation (SUM(debit) == SUM(credit), HTTP 422)
- **Objective**: Verify that journal entry creation strictly validates fundamental accounting balance equality: `SUM(debits) === SUM(credits)`. Reject unbalanced submissions with HTTP 422 Unprocessable Entity.
- **Reference**: `ORIGINAL_REQUEST.md` R4.1, Fintech & Accounting, Acceptance Criteria.
- **Schema Target**: `journal_entries` and `journal_entry_lines`.
- **Test Scenarios**:
  1. **Balanced Journal Entry**: Post journal entry with Debit `1010` (Cash) = 5,000 EGP and Credit `4010` (Revenue) = 5,000 EGP. Transaction succeeds, balance updates.
  2. **Unbalanced Journal Entry (HTTP 422)**: Post journal entry with Debit `1010` = 5,000 EGP and Credit `4010` = 4,200 EGP (imbalance of 800 EGP). Rejection must return HTTP 422 with descriptive error.
  3. **Rollback Integrity**: Verify that zero orphan ledger lines exist in `journal_entry_lines` for the rejected unbalanced entry.
- **Exact Assertion Specifications**:
  ```typescript
  // Assertions for Suite 57:
  assert(balancedEntry.success === true, 'Balanced journal entry (Debit 5000 == Credit 5000) accepted and posted');
  assert(unbalancedEntry.statusCode === 422, 'Unbalanced journal entry rejected with HTTP 422 Unprocessable Entity');
  assert(orphanLines.length === 0, 'No partial ledger lines recorded in journal_entry_lines after 422 rejection');
  ```

---

### Test Suite 58: Wallet Atomic Update (BEGIN IMMEDIATE & Optimistic Concurrency Lock)
- **Objective**: Verify that fintech e-wallet balance updates use SQLite `BEGIN IMMEDIATE` transactions and an optimistic lock (`version` field) to prevent lost updates during concurrent transactions.
- **Reference**: `ORIGINAL_REQUEST.md` R4.2, Fintech & Accounting.
- **Schema Target**: Table `fintech_wallets` with column `version INTEGER NOT NULL DEFAULT 1`.
- **Test Scenarios**:
  1. **Atomic Update with Version Increment**: Wallet with initial balance 10,000 EGP and `version = 1`. Process a debit of 2,000 EGP with expected version 1. Transaction succeeds: new balance = 8,000 EGP, `version = 2`.
  2. **Stale Version Collision Rejection**: A concurrent process attempts to debit 1,500 EGP presenting stale `version = 1`. The optimistic lock rejects the operation with a concurrency conflict error.
  3. **Immediate Transaction Assurance**: Confirm wallet operations execute within `BEGIN IMMEDIATE` lock to prevent SQLite busy deadlocks.
- **Exact Assertion Specifications**:
  ```typescript
  // Assertions for Suite 58:
  assert(firstUpdate.success === true && firstUpdate.newVersion === 2, 'Wallet balance updated atomically and version incremented from 1 to 2');
  assert(staleUpdateRejected, 'Concurrent wallet update with stale version 1 rejected with CONCURRENCY_CONFLICT');
  assert(currentWallet.current_balance === 8000 && currentWallet.version === 2, 'Wallet balance safely locked at 8000 EGP without race condition corruption');
  ```

---

### Test Suite 59: Ticket Status Transition Validation (State Machine & HTTP 422)
- **Objective**: Verify that repair tickets enforce a strict directed state machine and reject illegal status jumps (e.g. `RECEIVED` -> `DELIVERED`) with HTTP 422.
- **Reference**: `ORIGINAL_REQUEST.md` R1.5, R1.6, Security Criteria.
- **Allowed State Flow**:
  `INTAKE` / `RECEIVED` ➔ `DIAGNOSED` ➔ `IN_REPAIR` ➔ `QA` ➔ `READY` ➔ `DELIVERED`  
  *(Any non-delivered state can transition to `CANCELLED`)*
- **Test Scenarios**:
  1. **Valid Forward Transition**: Transition ticket from `RECEIVED` to `DIAGNOSED`. Returns HTTP 200 / success.
  2. **Illegal Direct Leap (HTTP 422)**: Attempt to transition ticket directly from `RECEIVED` to `DELIVERED`. Returns HTTP 422 with invalid transition error.
  3. **QA Checklist Gatekeeper (HTTP 422)**: Attempt to transition from `QA` to `READY` while `qa_checklist` is null or empty. Returns HTTP 422 requiring completed QA checklist.
- **Exact Assertion Specifications**:
  ```typescript
  // Assertions for Suite 59:
  assert(validTransition.status === 'DIAGNOSED', 'Valid sequential status transition (RECEIVED -> DIAGNOSED) permitted');
  assert(invalidLeap.statusCode === 422, 'Illegal status transition (RECEIVED -> DELIVERED) rejected with HTTP 422');
  assert(qaBlocked.statusCode === 422, 'Transition to READY rejected with HTTP 422 when qa_checklist is missing or incomplete');
  ```

---

### Test Suite 60: Dead Stock Identification Report (90 Days No Movement)
- **Objective**: Verify that the inventory engine accurately detects idle inventory with no sales, movements, or transfers within a parameterized window (default: 90 days) and computes tied-up capital.
- **Reference**: `ORIGINAL_REQUEST.md` R3.2, Inventory & Spare Parts, Acceptance Criteria.
- **Test Scenarios**:
  1. **Fixture Creation**:
     - Item A (Active Item): Sold 3 days ago (`last_sold_date = datetime('now', '-3 days')`).
     - Item B (Dead Stock Item): Sold 110 days ago (`last_sold_date = datetime('now', '-110 days')`), `stock_quantity = 20`, `purchase_price = 150`.
     - Item C (Stagnant Unsold Item): Created 95 days ago, never sold (`last_sold_date IS NULL`, `created_at = datetime('now', '-95 days')`), `stock_quantity = 10`, `purchase_price = 300`.
  2. **Query Execution**: Execute dead stock calculation for `days = 90`.
  3. **Verification**: Items B and C are returned in dead stock results; Item A is strictly excluded. Total tied-up capital computed as `(20 * 150) + (10 * 300) = 6,000.00 EGP`.
- **Exact Assertion Specifications**:
  ```typescript
  // Assertions for Suite 60:
  assert(deadStockResults.some(i => i.id === itemB.id), 'Item with 110 days no movement identified in dead stock report');
  assert(!deadStockResults.some(i => i.id === itemA.id), 'Active item sold 3 days ago excluded from dead stock report');
  assert(deadStockResults.find(i => i.id === itemB.id)?.tied_up_capital === 3000, 'Tied-up capital correctly computed (20 units * 150 EGP = 3000 EGP)');
  ```

---

### Test Suite 61: SLA Breach Detection & Persistence (`tickets.sla_started_at`)
- **Objective**: Verify that repair ticket SLA timers rely on the persistent database column `tickets.sla_started_at`, automatically flag tickets exceeding target hours, and escalate priority to `URGENT`.
- **Reference**: `ORIGINAL_REQUEST.md` R1.4, R5.1, Repair Lab Workflow.
- **Schema Target**: Column `sla_started_at TEXT` on `repair_tickets`.
- **Test Scenarios**:
  1. **Breach Setup**:
     - Ticket 1: `sla_started_at = datetime('now', '-36 hours')`, `status = 'IN_REPAIR'`, `priority = 'NORMAL'`, SLA threshold = 24 hours. (Breached by 12 hours).
     - Ticket 2: `sla_started_at = datetime('now', '-4 hours')`, `status = 'IN_REPAIR'`, `priority = 'NORMAL'`, SLA threshold = 24 hours. (On track).
  2. **Scanner Execution**: Run the SLA scanner routine (`checkAndEscalateSlaBreaches()`).
  3. **Escalation Verification**: Ticket 1 priority is updated in DB to `URGENT`, and a `TICKET_SLA_BREACH` event/alert is recorded. Ticket 2 remains `NORMAL`.
- **Exact Assertion Specifications**:
  ```typescript
  // Assertions for Suite 61:
  assert(breachedTickets.some(t => t.id === ticket1.id), 'Ticket exceeding 24h SLA target detected via persistent sla_started_at');
  assert(db.prepare('SELECT priority FROM repair_tickets WHERE id = ?').get(ticket1.id).priority === 'URGENT', 'Breached ticket priority automatically escalated to URGENT');
  assert(db.prepare('SELECT priority FROM repair_tickets WHERE id = ?').get(ticket2.id).priority === 'NORMAL', 'On-track ticket priority preserved at NORMAL');
  ```

---

### Test Suite 62: Customer Credit Limit Enforcement
- **Objective**: Verify that credit sales to B2B or VIP customers cannot exceed configured credit limits: `credit_used + new_sale_total <= credit_limit`.
- **Reference**: `ORIGINAL_REQUEST.md` R4.7, Fintech & Financial Management.
- **Schema Target**: Columns `credit_limit REAL DEFAULT 0.0` and `credit_used REAL DEFAULT 0.0` on `customers`.
- **Test Scenarios**:
  1. **Customer Fixture**: Customer with `credit_limit = 10,000.00 EGP` and `credit_used = 7,500.00 EGP` (available headroom: 2,500.00 EGP).
  2. **Approved Sale Within Headroom**: Customer makes a credit sale purchase of 1,800.00 EGP (`7,500 + 1,800 = 9,300 <= 10,000`). Sale completes, and customer `credit_used` increases to 9,300.00 EGP.
  3. **Blocked Sale Over Limit**: Customer attempts another credit purchase of 1,200.00 EGP (`9,300 + 1,200 = 10,500 > 10,000`). Sale is blocked with `CREDIT_LIMIT_EXCEEDED`. Customer `credit_used` remains unchanged at 9,300.00 EGP.
- **Exact Assertion Specifications**:
  ```typescript
  // Assertions for Suite 62:
  assert(approvedCreditSale.success === true, 'Credit purchase within limit approved successfully');
  assert(db.prepare('SELECT credit_used FROM customers WHERE id = ?').get(cust.id).credit_used === 9300, 'Customer credit_used balance updated after approved sale');
  assert(blockedCreditSale.success === false && blockedCreditSale.code === 'CREDIT_LIMIT_EXCEEDED', 'Credit purchase exceeding credit limit strictly blocked');
  ```

---

## 5. Additional Security & Integrity Test Specifications

In addition to Suites 53–62, `ORIGINAL_REQUEST.md` specifies strict cross-cutting security acceptance criteria. These should either form dedicated test suites (e.g. Suites 63–66) or be integrated as explicit security verification blocks in `test/api.test.ts`:

### 5.1 Void Sale Audit Log Reason Enforcement (HTTP 400)
- **Requirement**: `ORIGINAL_REQUEST.md` R2.7 & Security Criteria:
  > "Attempting to void a sale without a reason returns HTTP 400"
  > "Every call to DELETE or void on a sale must insert a record in audit_log with (action=VOID_SALE, user_id, sale_id, reason, timestamp). The reason field must be non-null."
- **Test Specification**:
  ```typescript
  // Test Void Sale Security Guard:
  const voidNoReason = await invokeVoidSale(saleId, { reason: '' });
  assert(voidNoReason.statusCode === 400, 'Voiding sale without reason rejected with HTTP 400');

  const voidWithReason = await invokeVoidSale(saleId, { reason: 'Customer returned sealed phone within 14-day statutory return period' });
  assert(voidWithReason.statusCode === 200, 'Voiding sale with explicit reason accepted');

  const auditEntry = db.prepare("SELECT * FROM audit_logs WHERE action = 'VOID_SALE' AND entity_id = ?").get(saleId) as any;
  assert(auditEntry !== undefined && auditEntry.new_values?.includes('statutory return period'), 'Audit log records VOID_SALE with non-null reason payload');
  ```

### 5.2 Financial Approval Hierarchy for Payments > 5,000 EGP (HTTP 403)
- **Requirement**: `ORIGINAL_REQUEST.md` R4.5 & Security Criteria:
  > "Attempting a payment > threshold without approval returns HTTP 403"
  > "Any payment > configurable threshold (default: 5000 EGP) must go through a multi-step approval (CASHIER → MANAGER → CFO) before execution."
- **Test Specification**:
  ```typescript
  // Test Financial Disbursement Ceiling Guard:
  const highValuePayment = await executeDisbursement({ amount: 7500, beneficiary: 'Supplier Alpha' });
  assert(highValuePayment.statusCode === 403 || highValuePayment.code === 'APPROVAL_REQUIRED', 'Payment > 5000 EGP rejected with HTTP 403 when lacking managerial approval');

  // Authorize via approval_requests:
  const reqId = submitApprovalRequest({ amount: 7500, type: 'SUPPLIER_PAYMENT' });
  approveRequest(reqId, 'usr-mgr-01');

  const approvedPayment = await executeDisbursement({ amount: 7500, approvalId: reqId });
  assert(approvedPayment.success === true, 'Payment > 5000 EGP executed once approved by authorized manager');
  ```

### 5.3 Login Rate Limiting Tightening (HTTP 429 after 5 requests)
- **Requirement**: `ORIGINAL_REQUEST.md` R5.5 & Security Criteria:
  > "Rate limit on `/api/auth/login` returns HTTP 429 after 5 rapid requests"
- **Test Specification**:
  ```typescript
  // Test Auth Rate Limiter (5 requests per minute):
  let hitRateLimit = false;
  for (let i = 1; i <= 6; i++) {
    const res = await invokeLogin('invalid_user', 'bad_password');
    if (i <= 5) {
      assert(res.statusCode === 401 || res.statusCode === 400, `Attempt ${i} rejected with standard auth error`);
    } else {
      hitRateLimit = res.statusCode === 429;
    }
  }
  assert(hitRateLimit, '6th rapid authentication attempt blocked with HTTP 429 Too Many Requests');
  ```

### 5.4 Foreign Key Integrity Constraints (`ON DELETE RESTRICT`)
- **Requirement**: `ORIGINAL_REQUEST.md` R5.3 & Database Integrity Criteria:
  > "Add FK constraints `ON DELETE RESTRICT` for tickets→customers, sale_items→items, and journal_entries→accounts using a migration."
  > "All FK constraints are in place (verified via `PRAGMA foreign_key_list` in a test)"
- **Test Specification**:
  ```typescript
  // 1. Verify schema pragma metadata:
  const ticketFks = db.prepare("PRAGMA foreign_key_list('repair_tickets')").all() as any[];
  const custFk = ticketFks.find(f => f.table === 'customers');
  assert(custFk && custFk.on_delete.toUpperCase() === 'RESTRICT', 'repair_tickets foreign key on customers enforces ON DELETE RESTRICT');

  const saleItemFks = db.prepare("PRAGMA foreign_key_list('sale_items')").all() as any[];
  const itemFk = saleItemFks.find(f => f.table === 'items');
  assert(itemFk && itemFk.on_delete.toUpperCase() === 'RESTRICT', 'sale_items foreign key on items enforces ON DELETE RESTRICT');

  // 2. Behavioral verification: attempt deleting referenced parent record:
  let restrictCaught = false;
  try {
    const parentCustomer = db.prepare('SELECT customer_id FROM repair_tickets LIMIT 1').get() as any;
    db.prepare('DELETE FROM customers WHERE id = ?').run(parentCustomer.customer_id);
  } catch (err: any) {
    restrictCaught = err.message.includes('FOREIGN KEY constraint failed') || err.message.includes('RESTRICT');
  }
  assert(restrictCaught, 'Deleting customer with active repair ticket strictly blocked by ON DELETE RESTRICT');
  ```

---

## 6. Implementation Strategy for Test Writers

When the implementation phase commences (Phase 8), the test authors should adhere to the following architecture in `server/test/api.test.ts`:

### 6.1 Unified Asynchronous Execution Harness
Because several new test cases involve asynchronous operations (HTTP status responses, rate limiters, notifications), `server/test/api.test.ts` should wrap tests into an asynchronous runner or append them before the concluding `runBackupTest()`:

```typescript
// Pattern for api.test.ts integration:
async function runExtendedSuites() {
  // Suites 53-62 ...
  // Security Suites ...
  // Conclude with backup test
  await runBackupTest();
}
```

### 6.2 In-Process Ephemeral Express Testing (No Port Conflicts)
To verify exact HTTP status codes (400, 403, 409, 422, 429) without requiring a pre-existing running server or clashing with port 5000:
```typescript
import express from 'express';
import { AddressInfo } from 'net';

const testApp = express();
testApp.use(express.json());
// Mount updated routers
testApp.use('/api/repair', repairRouter);
testApp.use('/api/retail', retailRouter);
testApp.use('/api/accounting', accountingRouter);
testApp.use('/api/fintech', fintechRouter);
testApp.use('/api/inventory', inventoryRouter);

const testServer = testApp.listen(0); // Port 0 assigns random available port
const testPort = (testServer.address() as AddressInfo).port;
const baseUrl = `http://localhost:${testPort}`;
```
Using Node 24 native `fetch(`${baseUrl}/api/...`)`, HTTP assertions can be executed cleanly and deterministically.

### 6.3 Test Count Projection

| Suite | Focus | Proposed Assertions | Running Total |
|-------|-------|---------------------|---------------|
| **Existing 1–52 + Backup** | Core ERP, Repositories, Security | 117 | 117 |
| **Suite 53** | Split Payments | 3 | 120 |
| **Suite 54** | Installment Sales Engine | 4 | 124 |
| **Suite 55** | Trade-In Device Valuation | 3 | 127 *(Meets Criteria)* |
| **Suite 56** | Negative Stock Prevention | 3 | 130 |
| **Suite 57** | Double-Entry Balance (422) | 3 | 133 |
| **Suite 58** | Wallet Atomic Update (Version) | 3 | 136 |
| **Suite 59** | Ticket Transition State Machine | 3 | 139 |
| **Suite 60** | Dead Stock Report (90 Days) | 3 | 142 |
| **Suite 61** | SLA Breach Detection | 3 | 145 |
| **Suite 62** | Customer Credit Limit | 3 | 148 |
| **Suite 63** | Security: Void Sale Audit Reason (400) | 2 | 150 |
| **Suite 64** | Security: Financial Approval >5000 (403) | 2 | 152 |
| **Suite 65** | Security: Login Rate Limiter (429) | 2 | 154 |
| **Suite 66** | Database: ON DELETE RESTRICT FK | 3 | 157 |

**Final Projected Tests**: **157 passing assertions**, 0 failures.

---

## 7. Recommended Action Plan for Orchestrator

1. **Phase 2 (Database Migrations)**:
   - Create migrations adding:
     - Tables: `invoice_payments`, `installment_plans`, `installment_payments`, `trade_in_assessments`, `approval_requests`, `discount_rules`, `item_cost_history`.
     - Columns: `items.stock_quantity CHECK(stock_quantity >= 0)`, `fintech_wallets.version`, `repair_tickets.sla_started_at`, `repair_tickets.qa_checklist`, `customers.credit_limit`, `customers.credit_used`.
     - Foreign Keys: Update constraints with `ON DELETE RESTRICT`.
2. **Phases 3–7 (Feature Modules Implementation)**:
   - Update `repair.router.ts`: Enforce state machine transitions (HTTP 422) and QA checklist requirement.
   - Update `retail.router.ts`: Implement split payments, installments, trade-in offset, overselling guard (HTTP 409), and mandatory void reason (HTTP 400).
   - Update `accounting.router.ts`: Change unbalanced journal entry response code from HTTP 400 to HTTP 422.
   - Update `fintech.router.ts`: Add atomic `BEGIN IMMEDIATE` + optimistic concurrency locking on wallet balance updates, and approval hierarchy for disbursements > 5000 EGP (HTTP 403).
   - Update `inventory.router.ts`: Add dead stock report endpoint (`GET /api/inventory/reports/dead-stock?days=90`).
3. **Phase 8 (Test Harness Expansion)**:
   - Append Suites 53–66 to `server/test/api.test.ts` following the exact specifications detailed in Section 4 and 5.
   - Verify all 150+ assertions pass via `npm test`.
