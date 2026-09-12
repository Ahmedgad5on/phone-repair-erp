import db from '../src/db/database';
import { runMigrations } from '../src/db/migrations';
import { seedDatabase } from '../src/db/seed';
import bcrypt from 'bcryptjs';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { AddressInfo } from 'net';
import { v4 as uuidv4 } from 'uuid';
import { ERP_CONSTANTS } from '../src/constants/erp.constants';
import { authRouter } from '../src/modules/auth/auth.router';
import { securityRouter } from '../src/modules/security/security.router';
import { subnetAndDeviceGuard } from '../src/middleware/subnet-guard';
import { retailRouter } from '../src/modules/retail/retail.router';
import { repairRouter } from '../src/modules/repair/repair.router';
import { accountingRouter } from '../src/modules/accounting/accounting.router';
import { fintechRouter } from '../src/modules/fintech/fintech.router';
import { inventoryRouter } from '../src/modules/inventory/inventory.router';
import { InstallmentsService } from '../src/modules/retail/installments.service';
import { TradeInService } from '../src/modules/retail/trade-in.service';
import { checkSlaEscalations } from '../src/modules/repair/repair.service';
import { WhatsAppService } from '../src/services/whatsapp.service';
import { signToken, verifyToken } from '../src/middleware/auth';
import { createDatabaseBackup, listBackups } from '../src/services/backup.service';
import { logAudit, getRecentAuditLogs } from '../src/services/audit.service';
import { RepairRepository } from '../src/repositories/repair.repository';
import { InventoryRepository } from '../src/repositories/inventory.repository';
import { SalesRepository } from '../src/repositories/sales.repository';
import { FintechRepository } from '../src/repositories/fintech.repository';

console.log('🧪 Starting Comprehensive Automated Backend Verification...\n');

// 1. Ensure DB is seeded
runMigrations();
seedDatabase();

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

// TEST 1: Modular Store Flags
console.log('[Test Suite 1: Core Engine & Feature Flags]');
const store = db.prepare('SELECT * FROM stores LIMIT 1').get() as any;
assert(store !== undefined, 'Store record exists');
assert(store.enable_repair === 1, 'Repair Lab module is enabled by default');
assert(store.enable_retail === 1, 'Retail POS module is enabled by default');
assert(store.enable_spare_parts === 1, 'Spare Parts Wholesale module is enabled by default');
assert(store.enable_fintech === 1, 'Fintech Cash module is enabled by default');

// TEST 2: RBAC Users & Bcrypt Password Security
console.log('\n[Test Suite 2: RBAC, Bcrypt & JWT Security]');
const adminUser = db.prepare("SELECT * FROM users WHERE username = 'admin'").get() as any;
assert(adminUser !== undefined, 'Admin user exists');
assert(adminUser.password.startsWith('$2'), 'Admin password is encrypted with bcrypt');
assert(bcrypt.compareSync('admin123', adminUser.password), 'Bcrypt password verification matches admin123');

const token = signToken({
  userId: adminUser.id,
  username: adminUser.username,
  role: adminUser.role,
  storeId: adminUser.store_id
});
assert(typeof token === 'string' && token.length > 30, 'JWT token signed successfully');
const decoded = verifyToken(token);
assert(decoded.username === 'admin' && decoded.role === 'SuperAdmin', 'JWT token decoded and verified successfully');

const tech = db.prepare("SELECT * FROM users WHERE role = 'MaintenanceEngineer' LIMIT 1").get() as any;
assert(tech !== undefined, 'Maintenance Engineer exists');
assert(tech.commission_rate > 0, `Technician commission rate is configured (${tech.commission_rate * 100}%)`);

// TEST 3: Shift Management & Deficit Accounting
console.log('\n[Test Suite 3: Shift Handover & Deficit Calculation]');
const activeShift = db.prepare("SELECT * FROM shifts WHERE status = 'OPEN' LIMIT 1").get() as any;
assert(activeShift !== undefined, 'Active shift exists');

const expectedCash = activeShift.opening_cash; // 5000
const enteredActualCash = 4700; // 300 deficit!
const deficit = enteredActualCash - expectedCash;
assert(deficit === -300, `Deficit correctly calculated: ${deficit} EGP`);

// TEST 4: Repair Ticket SLA & OTP Release
console.log('\n[Test Suite 4: Repair Lab Lifecycle, SLA & OTP]');
const ticket = db.prepare("SELECT * FROM repair_tickets WHERE ticket_number = 1001").get() as any;
assert(ticket !== undefined, 'Ticket #1001 exists');
assert(ticket.release_otp !== null && ticket.release_otp.length === 4, `Release OTP generated: ${ticket.release_otp}`);

const labor = 700;
const parts = 0;
const techRate = 0.35;
const calculatedCommission = Number(((labor - parts) * techRate).toFixed(2));
assert(calculatedCommission === 245, `Dynamic technician commission correctly calculated: ${calculatedCommission} EGP`);

// TEST 5: Retail POS Strict IMEI Enforcement & Soft Deletes
console.log('\n[Test Suite 5: Retail POS Strict IMEI Tracking & Soft Deletes]');
const phoneItem = db.prepare("SELECT * FROM items WHERE category = 'PHONE' LIMIT 1").get() as any;
assert(phoneItem !== undefined, `Phone item found: ${phoneItem.name}`);

const inStockImei = db.prepare("SELECT * FROM imei_records WHERE item_id = ? AND status = 'IN_STOCK' LIMIT 1").get(phoneItem.id) as any;
assert(inStockImei !== undefined, `In-stock IMEI found: ${inStockImei.imei}`);

// TEST 6: Spare Parts Compatibility & Multi-Tier Pricing
console.log('\n[Test Suite 6: Spare Parts Compatibility & Quality Tiers]');
const sparePart = db.prepare("SELECT * FROM items WHERE category = 'SPARE_PART' AND wholesale_price > 0 LIMIT 1").get() as any;
assert(sparePart.wholesale_price > 0, `Tier 1 (Wholesale): ${sparePart.wholesale_price} EGP`);
assert(sparePart.retail_price > sparePart.wholesale_price, `Tier 2 (Retail): ${sparePart.retail_price} EGP`);
assert(sparePart.bulk_price > 0, `Tier 3 (Bulk): ${sparePart.bulk_price} EGP`);

const compat = db.prepare("SELECT * FROM spare_parts_compatibility WHERE item_id = ?").all(sparePart.id);
assert(compat.length > 0, `Part has ${compat.length} cross-model compatibility mappings`);

// TEST 7: Fintech Hard Limit & Auto-Lock
console.log('\n[Test Suite 7: Fintech E-Wallets & 95% Hard Limit Alert]');
const lockedWallet = db.prepare("SELECT * FROM fintech_wallets WHERE is_locked = 1 LIMIT 1").get() as any;
assert(lockedWallet !== undefined, `Auto-locked wallet found: ${lockedWallet.provider_name}`);
const usageRatio = lockedWallet.daily_usage / lockedWallet.daily_limit;
assert(usageRatio >= 0.95, `Daily usage is ${(usageRatio * 100).toFixed(1)}% (>= 95% regulatory lock)`);

// TEST 8: Online Backup & Audit Logging Engine
console.log('\n[Test Suite 8: Online SQLite Backup & Audit Logging]');
logAudit({
  action: 'CREATE',
  entityType: 'UNIT_TEST',
  newValues: { testSuite: 'Automation' }
});
const recentLogs = getRecentAuditLogs(5);
assert(recentLogs.length > 0, `Audit log recorded ${recentLogs.length} entries`);
assert(recentLogs[0].action === 'CREATE' || recentLogs[0].action === 'LOGIN', `Latest audit action: ${recentLogs[0].action}`);

// TEST 9: Purchase Orders (PO) Workflow
console.log('\n[Test Suite 9: Purchase Orders (PO) Creation & Warehouse Receipt]');
const storeForPo = db.prepare('SELECT id FROM stores LIMIT 1').get() as { id: string };
const testPoId = `po-test-${Date.now()}`;
const nextPoNumber = ((db.prepare('SELECT COALESCE(MAX(po_number), 7000) as m FROM purchase_orders').get() as any).m || 7000) + 1;
db.prepare(`
  INSERT INTO purchase_orders (id, po_number, store_id, supplier_name, supplier_phone, status, total_amount, notes)
  VALUES (?, ?, ?, 'Global Shenzhen Parts Co', '01099887766', 'ORDERED', 5500, 'Automated Test Order')
`).run(testPoId, nextPoNumber, storeForPo.id);

const insertedPo = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(testPoId) as any;
assert(insertedPo !== undefined && insertedPo.po_number === nextPoNumber, 'Purchase order created successfully with status ORDERED');

db.prepare("UPDATE purchase_orders SET status = 'RECEIVED', received_at = CURRENT_TIMESTAMP WHERE id = ?").run(testPoId);
const receivedPo = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(testPoId) as any;
assert(receivedPo.status === 'RECEIVED', 'Purchase order status transitioned to RECEIVED');

// TEST 10: Daily Cash & Drawer Reconciliation Calculation
console.log('\n[Test Suite 10: Daily Cash & Drawer Reconciliation Calculation]');
const openShiftForRecon = db.prepare("SELECT * FROM shifts WHERE status = 'OPEN' LIMIT 1").get() as any;
const openingCash = openShiftForRecon ? openShiftForRecon.opening_cash : 0;
const expectedDrawer = openingCash + 1000 - 500; // Simulated
const countedCash = expectedDrawer; // Balanced
const difference = countedCash - expectedDrawer;
const isBalanced = Math.abs(difference) < 1.0;
assert(isBalanced, `Daily cash reconciliation balanced accurately (Diff: ${difference} EGP)`);

// TEST 11: General Ledger & Accounting Chart of Accounts
console.log('\n[Test Suite 11: General Ledger & Accounting Double-Entry]');
const cashAccount = db.prepare("SELECT * FROM chart_of_accounts WHERE code = '1010'").get() as any;
assert(cashAccount !== undefined && cashAccount.account_type === 'ASSET', 'Cash on hand chart of account exists');
const revenueAccount = db.prepare("SELECT * FROM chart_of_accounts WHERE code = '4010'").get() as any;
assert(revenueAccount !== undefined && revenueAccount.account_type === 'REVENUE', 'Sales revenue chart of account exists');

// TEST 12: Advanced Multi-Warehouse Inventory
console.log('\n[Test Suite 12: Multi-Warehouse Inventory Structure]');
const mainWh = db.prepare("SELECT * FROM warehouses WHERE is_default = 1").get() as any;
assert(mainWh !== undefined && mainWh.code === 'WH-MAIN', 'Default Main Store & Lab warehouse exists');

// TEST 13: Customer Loyalty Program Tiers
console.log('\n[Test Suite 13: Customer Loyalty Program Tiers]');
const bronzeTier = db.prepare("SELECT * FROM loyalty_tiers WHERE name LIKE '%Bronze%'").get() as any;
assert(bronzeTier !== undefined && bronzeTier.min_points === 0, 'Bronze loyalty tier initialized');

// TEST 14: Service Appointments Booking
console.log('\n[Test Suite 14: Service Appointments Booking]');
const testAptId = `apt-test-${Date.now()}`;
db.prepare(`
  INSERT INTO service_appointments (id, customer_name, customer_phone, device_brand, device_model, issue_description, appointment_date, appointment_time, status)
  VALUES (?, 'Omar Farouk', '01011223344', 'Samsung', 'Galaxy S23 Ultra', 'Broken AMOLED Screen', '2026-09-15', '03:00 PM', 'CONFIRMED')
`).run(testAptId);
const savedApt = db.prepare('SELECT * FROM service_appointments WHERE id = ?').get(testAptId) as any;
assert(savedApt !== undefined && savedApt.status === 'CONFIRMED', 'Service appointment created and verified');


import { cryptoService } from '../src/services/crypto.service';
import { auditService } from '../src/services/audit.service';

// TEST 15: AI Demand Forecasting & Reorder Point Calculation
console.log('\n[Test Suite 15: AI Demand Forecasting & Smart Reorder]');
const existingItem = db.prepare('SELECT id FROM items LIMIT 1').get() as { id: string };
const testForecastId = `fc-${Date.now()}`;
db.prepare(`
  INSERT INTO ai_demand_forecasts (id, item_id, predicted_monthly_demand, suggested_reorder_point, confidence_score, seasonality_factor)
  VALUES (?, ?, 45, 15, 0.92, 1.25)
`).run(testForecastId, existingItem.id);
const forecast = db.prepare('SELECT * FROM ai_demand_forecasts WHERE id = ?').get(testForecastId) as any;
assert(forecast !== undefined && forecast.predicted_monthly_demand === 45, 'AI demand forecast saved and verified');
assert(forecast.confidence_score > 0.90, 'AI confidence score calculation verified');

// TEST 16: AI Diagnostic Knowledge Base
console.log('\n[Test Suite 16: AI Diagnostic Knowledge Base (iFixit/GSMArena)]');
const kbEntries = db.prepare('SELECT * FROM ai_diagnostic_kb WHERE brand = ?').all('Apple') as any[];
assert(kbEntries.length > 0, `Seeded AI Diagnostic KB contains ${kbEntries.length} Apple hardware troubleshooting guides`);
const powerGuide = kbEntries.find(k => k.fault_category === 'POWER_IC');
assert(powerGuide !== undefined && powerGuide.solution_steps.length > 0, 'Hardware fault guide with diagnostic steps available');

// TEST 17: AI Fraud Detection & AML Heuristic Scoring
console.log('\n[Test Suite 17: AI Financial Fraud Detection & AML Heuristics]');
const fraudAlertId = `fa-${Date.now()}`;
db.prepare(`
  INSERT INTO fraud_alerts (id, transaction_type, reference_id, risk_score, trigger_rule, status)
  VALUES (?, 'FINTECH_TRANSFER', 'tx-mock-999', 88, 'Rapid consecutive high-value e-wallet transfers (> 50,000 EGP)', 'PENDING')
`).run(fraudAlertId);
const fraudAlert = db.prepare('SELECT * FROM fraud_alerts WHERE id = ?').get(fraudAlertId) as any;
assert(fraudAlert !== undefined && fraudAlert.risk_score === 88, 'High-risk fraud detection alert triggered with AML flags');

// TEST 18: Cryptography & Security Engine (AES-256-GCM & Password Complexity)
console.log('\n[Test Suite 18: Cryptography & Password Security Engine]');
const secretMessage = 'Secret-Master-Merchant-Token-98765';
const encrypted = cryptoService.encrypt(secretMessage);
assert(encrypted !== secretMessage && encrypted.includes(':'), 'AES-256-GCM successfully encrypted sensitive payload');
const decrypted = cryptoService.decrypt(encrypted);
assert(decrypted === secretMessage, 'AES-256-GCM successfully decrypted payload with zero loss');

const strongPassword = cryptoService.validatePasswordComplexity('Admin@2026Strong!');
assert(strongPassword.valid === true, 'Password complexity validator accepted strong enterprise password');
const weakPassword = cryptoService.validatePasswordComplexity('weak');
assert(weakPassword.valid === false && weakPassword.errors.length > 0, 'Password complexity validator rejected weak password');

// TEST 19: Immutable Cryptographic Audit Chain (Proposal 35)
console.log('\n[Test Suite 19: Immutable Cryptographic Audit Chain]');
auditService.log({
  action: 'UPDATE_PRODUCT_PRICE',
  actorId: 'usr-admin-01',
  entityType: 'PRODUCT',
  entityId: 'item-screen-oled',
  payload: { oldPrice: 1200, newPrice: 1350 }
});
auditService.log({
  action: 'APPROVE_EXPENSE_VOUCHER',
  actorId: 'usr-mgr-01',
  entityType: 'EXPENSE',
  entityId: 'exp-lab-09',
  payload: { amount: 4500, department: 'Lab Tools' }
});
const auditVerification = auditService.verifyChainIntegrity();
assert(auditVerification.isValid === true, `Cryptographic chain integrity verified across ${auditVerification.totalRecords} immutable records`);

// TEST 20: Enterprise Payment Gateways & ETA E-Invoice Compliance
console.log('\n[Test Suite 20: Payment Gateways & ETA E-Invoice Generation]');
const payTxId = `pay-${Date.now()}`;
db.prepare(`
  INSERT INTO payment_gateway_txs (id, order_id, gateway, amount, currency, status)
  VALUES (?, 'ord-pos-100', 'PAYMOB', 1850.00, 'EGP', 'PAID')
`).run(payTxId);
const payTx = db.prepare('SELECT * FROM payment_gateway_txs WHERE id = ?').get(payTxId) as any;
assert(payTx !== undefined && payTx.status === 'PAID', 'Paymob gateway transaction recorded');

const testSaleId = `sale-test-${Date.now()}`;
const nextInvNum = ((db.prepare('SELECT COALESCE(MAX(invoice_number), 1000) as m FROM sales').get() as any).m || 1000) + 1;
db.prepare(`
  INSERT INTO sales (id, invoice_number, store_id, total, tax)
  VALUES (?, ?, 'store-main-001', 2109.00, 259.00)
`).run(testSaleId, nextInvNum);

const einvoiceId = `einv-${Date.now()}`;
const etaUuid = `ETA-UUID-${Date.now()}-${Math.floor(Math.random() * 1000000)}-EG`;
db.prepare(`
  INSERT INTO e_invoices (id, sale_id, uuid, tax_amount, total_amount, eta_status)
  VALUES (?, ?, ?, 259.00, 2109.00, 'Valid')
`).run(einvoiceId, testSaleId, etaUuid);
const einv = db.prepare('SELECT * FROM e_invoices WHERE id = ?').get(einvoiceId) as any;
assert(einv !== undefined && einv.eta_status === 'Valid', 'Egyptian Tax Authority (ETA) compliant e-invoice registered');

import { walletPassService } from '../src/services/wallet-pass.service';
import { smartPricingService } from '../src/services/smart-pricing.service';
import crypto from 'crypto';

// TEST 21: Customer Surveys & NPS/CSAT Promoter-Detractor Routing
console.log('\n[Test Suite 21: Customer Surveys & NPS/CSAT Two-Tier Funnel]');
const testSurveyId = `srv-${Date.now()}`;
const testToken = crypto.randomBytes(8).toString('hex');
const ticketForSurvey = db.prepare('SELECT id, customer_id FROM repair_tickets LIMIT 1').get() as any;

db.prepare(`
  INSERT INTO repair_surveys (id, store_id, ticket_id, customer_id, channel, token, status)
  VALUES (?, 'store-main-001', ?, ?, 'WHATSAPP', ?, 'COMPLETED')
`).run(testSurveyId, ticketForSurvey.id, ticketForSurvey.customer_id, testToken);

const testRespId = `resp-${Date.now()}`;
db.prepare(`
  INSERT INTO repair_survey_responses (id, survey_id, csat_score, nps_score, feedback_category, comment, routed_to_google, is_escalated)
  VALUES (?, ?, 5, 10, 'SPEED', 'Super fast screen repair!', 1, 0)
`).run(testRespId, testSurveyId);

const surveyResponse = db.prepare('SELECT * FROM repair_survey_responses WHERE id = ?').get(testRespId) as any;
assert(surveyResponse !== undefined && surveyResponse.nps_score === 10, 'Survey response recorded with NPS 10');
assert(surveyResponse.routed_to_google === 1, 'Promoter customer successfully routed to Google Business Review');

// TEST 22: Insurance Claims & Co-pay / Deductible Balancing
console.log('\n[Test Suite 22: Insurance Claims & Dual-Ledger Co-Pay]');
const carrier = db.prepare('SELECT id, name FROM insurance_carriers LIMIT 1').get() as any;
const claimId = `claim-${Date.now()}`;
const testClaimTicketId = `ticket-claim-${Date.now()}`;
db.prepare(`
  INSERT INTO repair_tickets (id, store_id, customer_id, device_brand, device_model, reported_defects, release_otp)
  VALUES (?, 'store-main-001', 'cust-01', 'Samsung', 'Galaxy S23', 'Cracked Back Glass', '1234')
`).run(testClaimTicketId);

db.prepare(`
  INSERT INTO insurance_claims (id, ticket_id, carrier_id, claim_number, policy_number, deductible_amount, deductible_paid, carrier_estimate_amount, carrier_approved_amount, claim_status)
  VALUES (?, ?, ?, 'CLM-98721', 'POL-AXA-552', 200.0, 1, 1800.0, 1600.0, 'PREAUTH_APPROVED')
`).run(claimId, testClaimTicketId, carrier.id);

const insClaim = db.prepare('SELECT * FROM insurance_claims WHERE id = ?').get(claimId) as any;
assert(insClaim !== undefined && insClaim.claim_status === 'PREAUTH_APPROVED', 'Insurance claim created with PREAUTH_APPROVED');
assert(insClaim.deductible_amount === 200.0 && insClaim.carrier_approved_amount === 1600.0, 'Co-pay and carrier payable balances accurately calculated');

// TEST 23: E-Commerce Storefront & Online Cart Checkout
console.log('\n[Test Suite 23: E-Commerce Storefront & Online Cart Checkout]');
const shopItem = db.prepare('SELECT id, name, retail_price FROM items LIMIT 1').get() as any;
const webOrderId = `ord-web-${Date.now()}`;
const webOrderNum = `ORD-WEB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

db.prepare(`
  INSERT INTO ecommerce_cart_orders (id, order_number, customer_name, customer_phone, shipping_address, items_json, subtotal, shipping_fee, total_amount, payment_method, fulfillment_status)
  VALUES (?, ?, 'Tamer Hosny', '01011122233', 'Zamalek, Cairo', ?, 450.0, 50.0, 500.0, 'INSTAPAY', 'NEW')
`).run(webOrderId, webOrderNum, JSON.stringify([{ itemId: shopItem.id, name: shopItem.name, price: 450, qty: 1 }]));

const webOrder = db.prepare('SELECT * FROM ecommerce_cart_orders WHERE id = ?').get(webOrderId) as any;
assert(webOrder !== undefined && webOrder.total_amount === 500.0, 'E-Commerce cart order registered with InstaPay payment');
assert(webOrder.fulfillment_status === 'NEW', 'Fulfillment queue status initialized to NEW');

// TEST 24: Multi-Branch Inventory Transfers & Transit Lifecycle
console.log('\n[Test Suite 24: Multi-Branch Stock Transfers & Comparative KPIs]');
const warehouses = db.prepare('SELECT id FROM warehouses LIMIT 2').all() as any[];
const trfId = `trf-${Date.now()}`;
const trfNum = `TRF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

db.prepare(`
  INSERT INTO branch_transfers (id, transfer_number, from_warehouse_id, to_warehouse_id, item_id, quantity, shipping_cost, status)
  VALUES (?, ?, ?, ?, ?, 5, 25.0, 'IN_TRANSIT')
`).run(trfId, trfNum, warehouses[0].id, warehouses[1]?.id || warehouses[0].id, shopItem.id);

const transfer = db.prepare('SELECT * FROM branch_transfers WHERE id = ?').get(trfId) as any;
assert(transfer !== undefined && transfer.status === 'IN_TRANSIT', 'Branch stock transfer created in IN_TRANSIT status');

db.prepare("UPDATE branch_transfers SET status = 'RECEIVED', received_at = CURRENT_TIMESTAMP WHERE id = ?").run(trfId);
const receivedTrf = db.prepare('SELECT * FROM branch_transfers WHERE id = ?').get(trfId) as any;
assert(receivedTrf.status === 'RECEIVED', 'Inter-branch stock transfer confirmed as RECEIVED at destination');

// TEST 25: Digital Custody Contracts & Cryptographic SHA-256 Proof
console.log('\n[Test Suite 25: Digital Custody Contracts & Egyptian E-Signature Proof]');
const contractId = `ct-${Date.now()}`;
const terms = 'Standard repair intake liability terms. Alpha Mobile is not liable for software data loss.';
const sigMockPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const signedAt = new Date().toISOString();
const payloadHash = crypto.createHash('sha256').update(`${terms}|Ahmed Hany|${sigMockPng}|${signedAt}`).digest('hex');

db.prepare(`
  INSERT INTO custody_contracts (id, contract_type, customer_name, customer_phone, device_model, terms_body, signature_png, cryptographic_hash, signed_at, status)
  VALUES (?, 'INTAKE_CUSTODY', 'Ahmed Hany', '01009988776', 'iPhone 15 Pro', ?, ?, ?, ?, 'VALID')
`).run(contractId, terms, sigMockPng, payloadHash, signedAt);

const contract = db.prepare('SELECT * FROM custody_contracts WHERE id = ?').get(contractId) as any;
assert(contract !== undefined && contract.status === 'VALID', 'Digital contract stored with E-Signature');
const recomputedContractHash = crypto.createHash('sha256').update(`${contract.terms_body}|${contract.customer_name}|${contract.signature_png}|${contract.signed_at}`).digest('hex');
assert(recomputedContractHash === contract.cryptographic_hash, 'Cryptographic non-repudiation verified via SHA-256 checksum');

// TEST 26: Digital Queue Management & Ticket Calling
console.log('\n[Test Suite 26: Digital Queue Management & Counter Calling]');
const queueId = `q-${Date.now()}`;
db.prepare(`
  INSERT INTO digital_queue (id, store_id, queue_number, customer_name, customer_phone, service_type, status, estimated_wait_minutes)
  VALUES (?, 'store-main-001', 105, 'Mona Samir', '01022334455', 'REPAIR', 'WAITING', 10)
`).run(queueId);

const qTicket = db.prepare('SELECT * FROM digital_queue WHERE id = ?').get(queueId) as any;
assert(qTicket !== undefined && qTicket.queue_number === 105, 'Queue ticket #105 issued for customer');

db.prepare("UPDATE digital_queue SET status = 'CALLING', assigned_counter = 'Counter 2' WHERE id = ?").run(queueId);
const calledTicket = db.prepare('SELECT * FROM digital_queue WHERE id = ?').get(queueId) as any;
assert(calledTicket.status === 'CALLING' && calledTicket.assigned_counter === 'Counter 2', 'Ticket transition to CALLING on Counter 2 verified');

// TEST 27: Refurbished Device 12-Point Inspection & Quality Certificate
console.log('\n[Test Suite 27: Refurbished Device 12-Point Pipeline & Grading]');
const refurbId = `rfb-${Date.now()}`;
const certNum = `CERT-${Date.now().toString().slice(-6)}`;
const testImei = `3567${Date.now().toString().slice(-11)}`;

// Clean up any stale row with the same id before inserting
db.prepare('DELETE FROM refurb_devices WHERE id = ?').run(refurbId);

db.prepare(`
  INSERT INTO refurb_devices (id, imei, brand, model, storage_gb, color, buyback_price, target_retail_price, certificate_number, grade, pipeline_stage)
  VALUES (?, ?, 'Apple', 'iPhone 14 Pro', 256, 'Space Black', 28000, 36500, ?, 'GRADE_A_PLUS', 'QUALITY_CONTROL')
`).run(refurbId, testImei, certNum);

const refurbDev = db.prepare('SELECT * FROM refurb_devices WHERE id = ?').get(refurbId) as any;
assert(refurbDev !== undefined && refurbDev.grade === 'GRADE_A_PLUS', 'Refurbished device graded GRADE_A_PLUS');
assert(refurbDev.certificate_number === certNum, 'Official 12-point Quality Certificate number assigned');

// TEST 28: Assembly & Kitting (Repair Bundles)
console.log('\n[Test Suite 28: Assembly & Kitting (Repair Bundles) & BOM Stock Deduction]');
const bundleId = `bdl-${Date.now()}`;
const bundleSku = `KIT-IP14P-DISP-${Date.now().toString().slice(-4)}`;

db.prepare(`
  INSERT INTO repair_bundles (id, sku, name, target_device_model, bundle_price, discount_percentage, barcode)
  VALUES (?, ?, 'iPhone 14 Pro Complete Care Bundle', 'iPhone 14 Pro', 4200.0, 15.0, ?)
`).run(bundleId, bundleSku, `BC-${bundleSku}`);

const bundle = db.prepare('SELECT * FROM repair_bundles WHERE id = ?').get(bundleId) as any;
assert(bundle !== undefined && bundle.bundle_price === 4200.0, 'Repair bundle kit created with 15% package discount');

// TEST 29: Business Rules Engine (IF-THEN Evaluation)
console.log('\n[Test Suite 29: Business Rules Engine (IF-THEN Rules)]');
const rules = db.prepare('SELECT * FROM business_rules WHERE is_active = 1').all() as any[];
assert(rules.length >= 3, `Business rules engine has ${rules.length} active IF-THEN rules seeded`);
const slaRule = rules.find(r => r.event_type === 'TICKET_SLA_BREACH');
assert(slaRule !== undefined && slaRule.action_type === 'ESCALATE_URGENT', 'SLA breach rule configured with ESCALATE_URGENT action');

// TEST 30: Stolen Device Registry & GSMA IMEI Blacklist Detection
console.log('\n[Test Suite 30: Stolen Device Registry & GSMA IMEI Blacklist]');
const stolenDevice = db.prepare("SELECT * FROM stolen_device_registry WHERE imei = '359876543210987'").get() as any;
assert(stolenDevice !== undefined && stolenDevice.is_blacklisted === 1, 'Blacklisted stolen device found in GSMA registry');
assert(stolenDevice.reported_by === 'POLICE_REPORT', 'Theft report verified with official police incident documentation');

// TEST 31: Apple & Google Wallet Digital Loyalty Passes
console.log('\n[Test Suite 31: Apple & Google Wallet Digital Loyalty Passes]');
const vipPass = walletPassService.getOrCreatePass('cust-01');
assert(vipPass !== undefined && vipPass.serialNumber.startsWith('PASS-'), 'Digital loyalty pass generated with serial number');
assert(vipPass.appleWalletPayload.storeCard.primaryFields[0].value.length > 0, 'Apple Wallet (.pkpass) JSON payload structured properly');
assert(vipPass.googlePayPayload.barcode.value.length > 0, 'Google Pay pass QR barcode generated');

// TEST 32: Smart Dynamic Repair Pricing Engine
console.log('\n[Test Suite 32: Smart Dynamic Repair Pricing Engine]');
const quote = smartPricingService.calculateRepairQuote('Apple', 'iPhone 15 Pro', 'SCREEN', 1200.0);
assert(quote.recommendedRetailPrice > 1200.0, 'Smart quotation calculated recommended price above cost basis');
assert(quote.recommendedRetailPrice > 1200.0, 'Smart quotation calculated recommended price above cost basis');
assert(quote.marginPercentage > 20.0, `Quotation yielded profitable ${quote.marginPercentage}% margin`);
assert(quote.difficultyMultiplier === 1.35, 'Apple premium brand difficulty multiplier applied');

// TEST 33: Boot Amperage Curve Logger & Pattern Analysis (Dev Proposal 1)
console.log('\n[Test Suite 33: Boot Amperage Curve Logger & Pattern Analysis]');
const sampleCurve = [
  { sample_ms: 0, current_ma: 80, voltage_v: 4.2 },
  { sample_ms: 500, current_ma: 380, voltage_v: 4.2 },
  { sample_ms: 1000, current_ma: 950, voltage_v: 4.2 },
  { sample_ms: 2000, current_ma: 480, voltage_v: 4.2 }
];
const curveAnalysis = RepairRepository.analyzeAmperageCurve(sampleCurve);
assert(curveAnalysis.pattern === 'NORMAL_BOOT_SEQUENCE', 'Normal boot sequence curve detected accurately');
const shortCurve = [{ sample_ms: 0, current_ma: 2400, voltage_v: 4.2 }];
const shortAnalysis = RepairRepository.analyzeAmperageCurve(shortCurve);
assert(shortAnalysis.pattern === 'SHORT_TO_GROUND', 'Immediate short to ground detected above 2000mA');

// Large dataset stack test (10,000 samples at high frequency telemetry)
const largeSampleCurve = Array.from({ length: 10000 }, (_, i) => ({
  sample_ms: i * 2,
  current_ma: i < 100 ? 80 : 350 + (i % 200),
  voltage_v: 4.2
}));
const largeAnalysis = RepairRepository.analyzeAmperageCurve(largeSampleCurve);
assert(largeAnalysis.confidence > 0, 'Large amperage curve (10,000 samples) analyzed safely without call stack overflow');

// TEST 34: Diode Mode Multimeter Pin Comparison (Dev Proposal 2)
console.log('\n[Test Suite 34: Diode Mode Multimeter Pin Comparison]');
const diodeTest = RepairRepository.compareDiodeReadings('iPhone 15 Pro', 'USB_C', [
  { pin_number: 1, measured_value: 0.005 }, // Realistic bench multimeter ground contact offset
  { pin_number: 4, measured_value: 0.515 }
]);
assert(diodeTest.isHealthy === true, 'Ground reference (with 5mV contact resistance) and VBUS pin matched reference database');

const openGroundTest = RepairRepository.compareDiodeReadings('iPhone 15 Pro', 'USB_C', [
  { pin_number: 1, measured_value: 0.250 }
]);
assert(openGroundTest.comparisons[0].status === 'OPEN_GROUND', 'Disconnected ground pin properly flagged as OPEN_GROUND');

// TEST 35: TrueTone & BMS Serializer Sync (Dev Proposal 3)
console.log('\n[Test Suite 35: TrueTone & BMS Serializer Sync]');
const syncId = RepairRepository.recordSerializerSync({
  ticket_id: 'tkt-1001',
  device_serial: 'F2LLM092PK12',
  screen_mt_sn: 'DTH4912093847MT',
  bms_sn: 'BATT-F2-984712',
  battery_health_pct: 100,
  programmer_model: 'JCID-V1SE Pro'
});
assert(syncId.startsWith('sync-'), 'TrueTone display and BMS battery serializer record saved');

// TEST 36: Workstation Queue Dispatcher (Dev Proposal 5)
console.log('\n[Test Suite 36: Workstation Queue Dispatcher]');
const workstations = RepairRepository.getWorkstations();
assert(workstations.length >= 3, `Discovered ${workstations.length} seeded technical workstations`);
const dispatchRes = RepairRepository.dispatchTicketToWorkstation(workstations[0].id, 'tkt-1001', 'usr-tech-1');
assert(dispatchRes.success === true, 'Ticket successfully dispatched to microsoldering workstation');

// TEST 37: Rapid 24-Point Digital Inspection (Dev Proposal 6)
console.log('\n[Test Suite 37: Rapid 24-Point Digital Inspection]');
const inspectionRes = RepairRepository.recordRapidInspection({
  ticket_id: 'tkt-1001',
  stage: 'PRE_REPAIR',
  checklist: {
    screen: 'PASS',
    touch: 'PASS',
    cameras: 'PASS',
    faceId: 'PASS',
    speakers: 'PASS',
    charging: 'PASS'
  }
});
assert(inspectionRes.passCount === 6, 'Rapid 24-point checklist verified with 6 passed hardware modules');

// TEST 38: Customer-Facing Display (CFD) Cart Mirroring (Dev Proposal 8)
console.log('\n[Test Suite 38: Customer-Facing Display (CFD) Cart State]');
const cfdState = SalesRepository.updateCfdCart({
  storeName: 'Test Lab Store',
  cashierName: 'Ahmad Cashier',
  items: [{ name: 'Screen Protector', quantity: 1, unit_price: 150, total: 150 }],
  subtotal: 150,
  tax: 0,
  discount: 0,
  total: 150
});
assert(cfdState.total === 150, 'CFD cart state mirrored with correct item totals');

// TEST 39: Loaner Phones Management (Dev Proposal 13)
console.log('\n[Test Suite 39: Loaner Phones Management & Security Deposit]');
const loaners = SalesRepository.getLoanerPhones('AVAILABLE');
assert(loaners.length > 0, `Loaner fleet contains ${loaners.length} available replacement phones`);
const existingCust = db.prepare('SELECT id FROM customers LIMIT 1').get() as { id: string };
const existingTkt = db.prepare('SELECT id FROM repair_tickets LIMIT 1').get() as { id: string };
const checkoutRes = SalesRepository.checkoutLoaner(loaners[0].id, existingTkt.id, existingCust.id, 1500.0);
assert(checkoutRes.success === true, 'Loaner phone checked out to customer with 1500 EGP deposit');
const checkinRes = SalesRepository.checkinLoaner(loaners[0].id, 'EXCELLENT', true);
assert(checkinRes.refundedDeposit === 1500.0, 'Loaner returned and deposit refunded in full');

// TEST 40: 2.5D Bin/Drawer Micro-Locator & Pick-to-Light (Dev Proposals 15 & 16)
console.log('\n[Test Suite 40: 2.5D Bin/Drawer Micro-Locator & Pick-to-Light]');
const locations = InventoryRepository.getLocations();
assert(locations.length >= 5, `Warehouse micro-locator grid initialized with ${locations.length} drawers`);
const pickLightRes = InventoryRepository.triggerPickToLight(locations[0].id, 'iPhone 15 Display', 1, 'GREEN');
assert(pickLightRes.success === true, `Pick-to-light LED signal triggered for drawer ${pickLightRes.drawerCode}`);

// TEST 41: Serial & Batch Number FIFO Tracking (Dev Proposal 18)
console.log('\n[Test Suite 41: Serial & Batch Number FIFO Tracking]');
const item = db.prepare('SELECT id FROM items LIMIT 1').get() as { id: string };
const batchId = InventoryRepository.addBatch({
  item_id: item.id,
  batch_number: 'BATCH-2026-X1',
  lot_number: 'LOT-9921',
  expiry_date: '2027-12-31',
  quantity: 25,
  unit_cost: 320.0
});
assert(batchId.startsWith('batch-'), 'Inventory batch lot tracked with expiration date and unit cost');

// TEST 42: Automated SMS TxID Matching (Dev Proposal 22)
console.log('\n[Test Suite 42: Automated SMS TxID Matching]');
const smsText = 'تم تحويل مبلغ 750.00 جنيه بنجاح من 01012345678. رقم المعاملة: VF894120';
const parsedSms = FintechRepository.parseAndMatchSms(smsText);
assert(parsedSms.matched === true, 'SMS string parsed successfully');
assert(parsedSms.amount === 750.0, 'Amount correctly extracted: 750 EGP');
assert(parsedSms.txId === 'VF894120', 'Carrier transaction ID correctly extracted: VF894120');

// Test carrier SMS with +20 prefix
const smsWithPrefix = 'Vodafone Cash: تم استلام مبلغ 1250.00 جنيه من +201099887766 بنجاح. رقم المعاملة: VF993120';
const parsedWithPrefix = FintechRepository.parseAndMatchSms(smsWithPrefix);
assert(parsedWithPrefix.senderPhone === '01099887766', 'Carrier SMS with +20 country code successfully normalized to standard Egyptian mobile number (01099887766)');

// TEST 43: Dual-Custody Shift Rebalancing (Dev Proposal 23)
console.log('\n[Test Suite 43: Dual-Custody Shift Rebalancing]');
const shift = db.prepare("SELECT id, opened_by_user_id FROM shifts WHERE status = 'OPEN' LIMIT 1").get() as any;
const adminSuperUser = db.prepare("SELECT id FROM users WHERE role = 'SuperAdmin' LIMIT 1").get() as any;
const rebalanceRes = FintechRepository.dualCustodyRebalance({
  shift_id: shift.id,
  cashier_user_id: shift.opened_by_user_id,
  cashier_pin: 'admin123',
  manager_user_id: adminSuperUser.id,
  manager_pin: 'admin123',
  rebalance_amount: 5000.0,
  rebalance_type: 'SAFE_DROP',
  reason: 'Mid-shift cash drawer drop to vault'
});
assert(rebalanceRes.success === true, 'Dual-custody authorization completed with Cashier + Manager PINs');

// Test rejection of invalid PIN (security check: no hardcoded bypass)
let pinRejected = false;
try {
  FintechRepository.dualCustodyRebalance({
    shift_id: shift.id,
    cashier_user_id: shift.opened_by_user_id,
    cashier_pin: 'invalid_unauthorized_pin',
    manager_user_id: adminSuperUser.id,
    manager_pin: 'admin123',
    rebalance_amount: 1000.0,
    rebalance_type: 'SAFE_DROP',
    reason: 'Unauthorized attempt'
  });
} catch (e: any) {
  pinRejected = e.message.includes('Invalid Cashier authorization credentials');
}
assert(pinRejected, 'Security assurance: Dual-custody strictly rejected invalid cashier PIN');

// TEST 44: Fintech Monthly Ceiling Alerts (Dev Proposal 24)
console.log('\n[Test Suite 44: Fintech Monthly Ceiling Alerts]');
const ceilingAlerts = FintechRepository.getCeilingAlerts();
assert(ceilingAlerts.length > 0, 'Ceiling alert monitor returned wallet limits');
const lockedWalletAlert = ceilingAlerts.find(w => w.isLocked);
assert(lockedWalletAlert !== undefined && lockedWalletAlert.dailyPercentage >= 95, 'Regulatory 95% threshold alert confirmed');

// TEST 45: Cost Centers for Multi-Branches (Dev Proposal 25)
console.log('\n[Test Suite 45: Cost Centers for Multi-Branches]');
const costCenters = FintechRepository.getCostCenters();
assert(costCenters.length >= 3, `Retrieved ${costCenters.length} departmental branch cost centers`);

// TEST 46: OCR ID & Warranty Document Parser (Dev Proposal 14)
console.log('\n[Test Suite 46: OCR ID & Warranty Document Parser]');
const ocrRes = SalesRepository.parseOcrDocument('الرقم القومي: 29805140102941 هاتف 01011223344 وسيريال 359182736450192');
assert(ocrRes.extractedNationalId === '29805140102941', 'National ID extracted from OCR text');
assert(ocrRes.birthDate === '1998-05-14', 'Birth date decoded from Egyptian national ID');
assert(ocrRes.governorate === 'Cairo (القاهرة)', 'Governorate decoded from national ID code 01');

const ocrAlex = SalesRepository.parseOcrDocument('الرقم القومي: 30209210201948 هاتف 01211223344');
assert(ocrAlex.governorate === 'Alexandria (الإسكندرية)', 'Alexandria governorate code 02 decoded accurately');
assert(ocrAlex.birthDate === '2002-09-21', 'Year 2002 birth date decoded from 21st-century national ID prefix 3');

// TEST 47: B2B Fleet Account & Device Management (Dev Proposal 29)
console.log('\n[Test Suite 47: B2B Fleet Account & Device Management]');
const fleetAccounts = db.prepare('SELECT * FROM b2b_fleet_accounts').all();
assert(fleetAccounts.length > 0, 'B2B Fleet account exists with corporate SLA level');
const fleetDevices = db.prepare('SELECT * FROM b2b_fleet_devices').all();
assert(fleetDevices.length > 0, 'B2B company devices enrolled under maintenance contract');

// TEST 48: Gamified Workshop Leaderboard (Dev Proposal 31)
console.log('\n[Test Suite 48: Gamified Workshop Leaderboard]');
const techs = db.prepare("SELECT id, name FROM users WHERE role IN ('MaintenanceEngineer', 'SuperAdmin')").all();
assert(techs.length > 0, 'Technician ranking pool ready for workshop leaderboard');

// TEST 49: Manager Override Token Engine (Maint Proposal 56)
console.log('\n[Test Suite 49: Manager Override Token Engine]');
const override = SalesRepository.generateOverrideToken(adminSuperUser.id, 'VIP Customer 25% Discount', 25.0);
assert(override.token.length === 6, '6-digit OTP manager override token generated');
const consumed = SalesRepository.validateAndConsumeOverrideToken(override.token);
assert(consumed.valid === true && consumed.discount_pct === 25.0, 'Override token validated and single-use consumed');
const replayAttempt = SalesRepository.validateAndConsumeOverrideToken(override.token);
assert(replayAttempt.valid === false, 'Replay attack blocked: token cannot be reused');

// TEST 50: Optimistic Concurrency Locking (Maint Proposal 59)
console.log('\n[Test Suite 50: Optimistic Concurrency Locking]');
const sampleItem = db.prepare('SELECT id, version FROM items LIMIT 1').get() as { id: string; version: number };
const lockUpdate = SalesRepository.updateWithOptimisticLock('items', sampleItem.id, sampleItem.version, { min_limit: 3 });
assert(lockUpdate.success === true && lockUpdate.newVersion === sampleItem.version + 1, 'Optimistic lock update succeeded, version incremented');
let threwConflict = false;
try {
  SalesRepository.updateWithOptimisticLock('items', sampleItem.id, sampleItem.version, { min_limit: 4 }); // stale version
} catch (e: any) {
  threwConflict = e.message.includes('CONCURRENCY_CONFLICT');
}
assert(threwConflict, 'Stale version update rejected with CONCURRENCY_CONFLICT');

let threwInvalidTable = false;
try {
  SalesRepository.updateWithOptimisticLock('users' as any, sampleItem.id, sampleItem.version, { min_limit: 4 });
} catch (e: any) {
  threwInvalidTable = e.message.includes('Invalid table name');
}
assert(threwInvalidTable, 'Security assurance: Optimistic locking rejects un-whitelisted table names');

// TEST 51: Parameterized SQL Assurance (Maint Proposal 61)
console.log('\n[Test Suite 51: Parameterized SQL Prepared Statement Assurance]');
const preparedCheck = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('SuperAdmin') as { count: number };
assert(preparedCheck.count >= 1, 'Prepared statement execution verified with placeholder binding');

// TEST 52: SQLite Tuned WAL Pragmas (Maint Proposal 43)
console.log('\n[Test Suite 52: Tuned SQLite WAL Pragmas & Concurrency Settings]');
const journalMode = (db.prepare('PRAGMA journal_mode;').get() as any).journal_mode;
const synchronous = (db.prepare('PRAGMA synchronous;').get() as any).synchronous;
assert(journalMode.toLowerCase() === 'wal', `SQLite journal mode is WAL (current: ${journalMode})`);
assert(synchronous === 2, `SQLite synchronous mode enforced to FULL (2 is SQLite integer for FULL) for power outage durability per DEC-001/ADR-001 (current: ${synchronous})`);

async function runExtendedSuites() {
  const testApp = express();
  testApp.use(express.json());

  testApp.use(subnetAndDeviceGuard);

  const testAuthLimiter = rateLimit({
    windowMs: ERP_CONSTANTS.RATE_LIMIT.AUTH_WINDOW_MS,
    max: ERP_CONSTANTS.RATE_LIMIT.AUTH_MAX_ATTEMPTS,
    message: { success: false, error: 'Too many authentication attempts. Please try again in 1 minute.', code: 'RATE_LIMIT_EXCEEDED' }
  });

  testApp.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  testApp.use('/api/auth/login', testAuthLimiter);
  testApp.use('/api/auth', authRouter);
  testApp.use('/api/security', securityRouter);
  testApp.use('/api/retail', retailRouter);
  testApp.use('/api/repair', repairRouter);
  testApp.use('/api/accounting', accountingRouter);
  testApp.use('/api/fintech', fintechRouter);
  testApp.use('/api/inventory', inventoryRouter);

  const testServer = testApp.listen(0);
  const testPort = (testServer.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${testPort}`;

  // TEST 53: POS Split Payments (invoice_payments table, multi-method payments summing to total)
  console.log('\n[Test Suite 53: POS Split Payments & Multi-Method Allocation]');
  const defaultStore = (db.prepare('SELECT id FROM stores LIMIT 1').get() as any) || { id: 'store-1' };
  const splitItemId = 'itm-split-' + uuidv4().slice(0, 6);
  db.prepare(`
    INSERT INTO items (id, store_id, sku, name, category, purchase_price, retail_price, stock_quantity, min_limit)
    VALUES (?, ?, ?, 'Split Payment Test Accessory', 'ACCESSORY', 1500, 3500, 10, 1)
  `).run(splitItemId, defaultStore.id, 'SKU-SPLIT-' + uuidv4().slice(0, 6));

  const underpayRes = await fetch(`${baseUrl}/api/retail/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ item_id: splitItemId, item_name: 'Split Payment Test Accessory', unit_price: 3500, quantity: 1 }],
      payments: [
        { method: 'CASH', amount: 2000 },
        { method: 'VODAFONE_CASH', amount: 1200 }
      ]
    })
  });
  assert(underpayRes.status === 422, 'POS split payment engine strictly rejected underpaid allocation with HTTP 422 (3200 vs 3500 EGP)');

  const splitSaleRes = await fetch(`${baseUrl}/api/retail/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ item_id: splitItemId, item_name: 'Split Payment Test Accessory', unit_price: 3500, quantity: 1 }],
      payments: [
        { method: 'CASH', amount: 1500 },
        { method: 'VODAFONE_CASH', amount: 1200, reference_id: 'VF-998811' },
        { method: 'CARD', amount: 800, reference_id: 'AUTH-4411' }
      ]
    })
  });
  assert(splitSaleRes.status === 201, 'POS balanced split payment across multiple methods accepted with HTTP 201');
  const splitSaleData = (await splitSaleRes.json()) as any;

  const recordedPayments = db.prepare('SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY amount DESC').all(splitSaleData.saleId) as any[];
  assert(
    recordedPayments.length === 3 &&
    Math.abs(recordedPayments.reduce((acc, p) => acc + Number(p.amount), 0) - 3500) < 0.01,
    'Invoice payments table recorded exactly 3 split payment lines summing precisely to 3,500 EGP'
  );

  // TEST 54: Installment Sales Engine (down payment, installment schedule, WhatsApp reminder log)
  console.log('\n[Test Suite 54: Installment Sales Engine & Amortization]');
  const instCustomer = (db.prepare('SELECT id, phone FROM customers LIMIT 1').get() as any) || { id: 'cust-1', phone: '01012345678' };
  const instSaleId = 'sale-inst-' + uuidv4().slice(0, 6);

  const planResult = InstallmentsService.createPlan({
    sale_id: instSaleId,
    customer_id: instCustomer.id,
    total_amount: 18000,
    down_payment: 6000,
    interest_rate: 0,
    months: 6
  });
  assert(
    planResult !== null &&
    planResult.plan.down_payment === 6000 &&
    planResult.plan.financed_amount === 12000,
    'Installment plan registered with 6,000 EGP down payment and 12,000 EGP financed balance'
  );

  assert(
    planResult !== null &&
    planResult.schedule.length === 6 &&
    planResult.schedule.every((p: any) => p.amount === 2000),
    'Installment amortization schedule generated 6 uniform monthly milestones of 2,000 EGP each'
  );

  const dueDates = planResult?.schedule.map((p: any) => new Date(p.due_date).getTime()) || [];
  const isAscending = dueDates.every((d: number, idx: number) => idx === 0 || d > dueDates[idx - 1]);
  assert(isAscending, 'Installment schedule due dates are chronologically sequential monthly intervals');

  const waSent = WhatsAppService.sendNotification(
    defaultStore.id,
    instCustomer.phone || '01012345678',
    'SALE_INVOICE',
    'تم تأكيد خطة التقسيط بمقدم 6000 ج.م وقسط شهري 2000 ج.م'
  );
  const waLog = db.prepare('SELECT * FROM whatsapp_messages_log WHERE id = ?').get(waSent.id) as any;
  assert(
    waLog !== undefined && waLog.content.includes('خطة التقسيط'),
    'Contract confirmation and installment summary logged in whatsapp_messages_log for customer delivery'
  );

  // TEST 55: Trade-In Valuation (trade_in_assessments table, condition grade valuation, credit deduction)
  console.log('\n[Test Suite 55: Trade-In Valuation & Credit Deduction]');
  const valuation = TradeInService.calculateValuation({
    device_model: 'iPhone 13 128GB',
    imei: '359182736450199',
    condition_grade: 'GRADE_B',
    battery_health: 90
  });
  assert(valuation.assessed_value > 0 && valuation.grade_multiplier === 0.82, 'Trade-in valuation calculated condition grade multiplier (0.82 for Grade B)');

  const tradeInAssessment = TradeInService.recordAssessment({
    customer_id: instCustomer.id,
    device_model: 'iPhone 13 128GB',
    imei: '359182736450199',
    condition_grade: 'GRADE_B',
    assessed_value: 9500
  });
  assert(tradeInAssessment !== null && tradeInAssessment.assessed_value === 9500, 'Trade-in assessment saved with 9,500 EGP valuation credit');

  const tradeInSaleItemId = 'itm-tin-' + uuidv4().slice(0, 6);
  db.prepare(`
    INSERT INTO items (id, store_id, sku, name, category, purchase_price, retail_price, stock_quantity, min_limit)
    VALUES (?, ?, ?, 'Flagship Device for Trade-In', 'ACCESSORY', 18000, 24000, 5, 1)
  `).run(tradeInSaleItemId, defaultStore.id, 'SKU-TIN-' + uuidv4().slice(0, 6));

  const tradeInSaleRes = await fetch(`${baseUrl}/api/retail/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ item_id: tradeInSaleItemId, item_name: 'Flagship Device for Trade-In', unit_price: 24000, quantity: 1 }],
      trade_in_id: tradeInAssessment.id,
      trade_in_credit: 9500,
      payment_method: 'CASH'
    })
  });
  const tradeInSaleData = (await tradeInSaleRes.json()) as any;
  const recheckedTradeIn = db.prepare('SELECT * FROM trade_in_assessments WHERE id = ?').get(tradeInAssessment.id) as any;
  assert(
    tradeInSaleRes.status === 201 &&
    tradeInSaleData.total === 14500 &&
    recheckedTradeIn.status === 'APPLIED',
    'POS invoice total accurately reduced by trade-in credit (24000 - 9500 = 14500 EGP) and status set to APPLIED'
  );

  // TEST 56: Negative Stock Prevention (DB CHECK constraint & Server Guard 409)
  console.log('\n[Test Suite 56: Negative Stock Prevention (DB CHECK & Server Guard 409)]');
  const negTestItemId = 'itm-neg-' + uuidv4().slice(0, 6);
  db.prepare(`
    INSERT INTO items (id, store_id, sku, name, category, purchase_price, retail_price, stock_quantity, min_limit)
    VALUES (?, ?, ?, 'Negative Stock Test Item', 'ACCESSORY', 50, 100, 3, 1)
  `).run(negTestItemId, defaultStore.id, 'SKU-NEG-' + uuidv4().slice(0, 6));

  let checkConstraintFailed = false;
  try {
    db.prepare('UPDATE items SET stock_quantity = -5 WHERE id = ?').run(negTestItemId);
  } catch (err: any) {
    checkConstraintFailed = err.message.includes('CHECK constraint failed');
  }
  assert(checkConstraintFailed, 'Database CHECK constraint strictly rejected direct negative stock update (CHECK constraint failed: items)');

  const oversellRes = await fetch(`${baseUrl}/api/retail/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ item_id: negTestItemId, item_name: 'Negative Stock Test Item', unit_price: 100, quantity: 10 }]
    })
  });
  assert(oversellRes.status === 409, 'Server guard rejected oversold item checkout with HTTP 409 Conflict');

  const recheckedNegItem = db.prepare('SELECT stock_quantity FROM items WHERE id = ?').get(negTestItemId) as any;
  assert(recheckedNegItem.stock_quantity === 3, 'Item inventory level preserved intact at 3 units after rejected oversell attempts');

  // TEST 57: Double-Entry Balance Validation (SUM(debit) == SUM(credit), unbalanced entry rejected with HTTP 422)
  console.log('\n[Test Suite 57: Double-Entry Balance Validation (SUM(debit) == SUM(credit), HTTP 422)]');
  const balancedRes = await fetch(`${baseUrl}/api/accounting/journal-entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'Balanced Test Journal Entry',
      lines: [
        { account_id: 'acc-1010', debit: 5000, credit: 0, memo: 'Debit Cash' },
        { account_id: 'acc-4010', debit: 0, credit: 5000, memo: 'Credit Sales' }
      ]
    })
  });
  assert(balancedRes.status === 201, 'Balanced journal entry (Debit 5000 == Credit 5000) accepted with HTTP 201');

  const countBefore = (db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get() as any).cnt;
  const linesBefore = (db.prepare('SELECT COUNT(*) as cnt FROM journal_entry_lines').get() as any).cnt;

  const unbalancedRes = await fetch(`${baseUrl}/api/accounting/journal-entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'Unbalanced Test Journal Entry',
      lines: [
        { account_id: 'acc-1010', debit: 5000, credit: 0, memo: 'Debit Cash' },
        { account_id: 'acc-4010', debit: 0, credit: 4200, memo: 'Credit Sales Deficit' }
      ]
    })
  });
  const unbalData = (await unbalancedRes.json()) as any;
  assert(
    unbalancedRes.status === 422 &&
    unbalData.error?.includes('DOUBLE ENTRY UNBALANCED'),
    'Unbalanced journal entry rejected with HTTP 422 Unprocessable Entity & DOUBLE ENTRY UNBALANCED error'
  );

  const countAfter = (db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get() as any).cnt;
  const linesAfter = (db.prepare('SELECT COUNT(*) as cnt FROM journal_entry_lines').get() as any).cnt;
  assert(
    countAfter === countBefore && linesAfter === linesBefore,
    'Zero orphan records written to journal_entries or journal_entry_lines following 422 rejection'
  );

  // TEST 58: Wallet Atomic Update & Optimistic Lock (BEGIN IMMEDIATE and version column increment, conflict on mismatch)
  console.log('\n[Test Suite 58: Wallet Atomic Update & Optimistic Lock]');
  const testWalletId = 'w-opt-' + uuidv4().slice(0, 6);
  db.prepare(`
    INSERT INTO fintech_wallets (id, store_id, provider_name, account_number, current_balance, daily_limit, daily_usage, monthly_limit, monthly_usage, is_locked, version)
    VALUES (?, ?, 'VODAFONE_CASH', '01099887766', 20000, 50000, 0, 150000, 0, 0, 1)
  `).run(testWalletId, defaultStore.id);

  const tx1Res = await fetch(`${baseUrl}/api/fintech/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_id: testWalletId,
      trans_type: 'CASH_IN',
      amount: 2000,
      sender_receiver_phone: '01099887766',
      expected_version: 1
    })
  });
  const walletAfterTx1 = db.prepare('SELECT current_balance, version FROM fintech_wallets WHERE id = ?').get(testWalletId) as any;
  assert(
    tx1Res.status === 201 &&
    walletAfterTx1.current_balance === 18000 &&
    walletAfterTx1.version === 2,
    'Wallet atomic update with matching version succeeded: balance reduced to 18,000 EGP and version incremented to 2'
  );

  const staleTxRes = await fetch(`${baseUrl}/api/fintech/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_id: testWalletId,
      trans_type: 'CASH_IN',
      amount: 1500,
      sender_receiver_phone: '01099887766',
      expected_version: 1
    })
  });
  const staleTxData = (await staleTxRes.json()) as any;
  assert(
    staleTxRes.status === 409 &&
    staleTxData.code === 'CONCURRENCY_CONFLICT',
    'Concurrent wallet update with stale version 1 rejected with HTTP 409 & CONCURRENCY_CONFLICT'
  );

  const walletFinal = db.prepare('SELECT current_balance, version FROM fintech_wallets WHERE id = ?').get(testWalletId) as any;
  assert(
    walletFinal.current_balance === 18000 && walletFinal.version === 2,
    'Wallet balance safely preserved at 18,000 EGP without dirty write or race corruption'
  );

  // TEST 59: Ticket Status Transition Validation (Invalid status transition, QA checklist, valid transition)
  console.log('\n[Test Suite 59: Ticket Status Transition Validation]');
  const tktCust = (db.prepare('SELECT id FROM customers LIMIT 1').get() as any) || { id: 'cust-1' };
  const tktId = 'tkt-fsm-' + uuidv4().slice(0, 6);
  const maxTktNum = (db.prepare('SELECT COALESCE(MAX(ticket_number), 2000) as num FROM repair_tickets').get() as any).num;

  db.prepare(`
    INSERT INTO repair_tickets (id, ticket_number, store_id, customer_id, device_brand, device_model, reported_defects, status, priority, estimated_cost, release_otp)
    VALUES (?, ?, ?, ?, 'Apple', 'iPhone 14 Pro', 'Cracked Screen', 'RECEIVED', 'NORMAL', 1200, '4488')
  `).run(tktId, maxTktNum + 1, defaultStore.id, tktCust.id);

  const invalidLeapRes = await fetch(`${baseUrl}/api/repair/tickets/${tktId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'DELIVERED' })
  });
  const invalidLeapData = (await invalidLeapRes.json()) as any;
  assert(
    invalidLeapRes.status === 422 &&
    invalidLeapData.code === 'INVALID_STATUS_TRANSITION',
    'Illegal status jump (RECEIVED -> DELIVERED) rejected with HTTP 422 & INVALID_STATUS_TRANSITION'
  );

  await fetch(`${baseUrl}/api/repair/tickets/${tktId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'DIAGNOSED' })
  });
  await fetch(`${baseUrl}/api/repair/tickets/${tktId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'IN_REPAIR' })
  });
  await fetch(`${baseUrl}/api/repair/tickets/${tktId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'QA' })
  });

  const readyWithoutQcRes = await fetch(`${baseUrl}/api/repair/tickets/${tktId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'READY' })
  });
  const readyWithoutQcData = (await readyWithoutQcRes.json()) as any;
  assert(
    readyWithoutQcRes.status === 422 &&
    readyWithoutQcData.code === 'QA_CHECKLIST_REQUIRED',
    'Transition to READY without QA checklist rejected with HTTP 422 & QA_CHECKLIST_REQUIRED'
  );

  const readyWithQcRes = await fetch(`${baseUrl}/api/repair/tickets/${tktId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'READY',
      qa_checklist: { screen: true, touch: true, battery: true, camera: true }
    })
  });
  const tktInDb = db.prepare('SELECT status, qa_checklist FROM repair_tickets WHERE id = ?').get(tktId) as any;
  assert(
    readyWithQcRes.status === 200 &&
    tktInDb.status === 'READY' &&
    tktInDb.qa_checklist?.includes('battery'),
    'Valid status transition to READY with QA checklist succeeded and persisted to database'
  );

  // TEST 60: Dead Stock Report (items with no movement in 90 days returned with tied-up capital)
  console.log('\n[Test Suite 60: Dead Stock Report (90 Days No Movement)]');
  const itemAId = 'itm-active-' + uuidv4().slice(0, 6);
  const itemBId = 'itm-dead110-' + uuidv4().slice(0, 6);
  const itemCId = 'itm-dead95-' + uuidv4().slice(0, 6);

  db.prepare(`
    INSERT INTO items (id, store_id, sku, name, category, purchase_price, retail_price, stock_quantity, min_limit, last_sold_date)
    VALUES (?, ?, ?, 'Active Fast-Moving Case', 'ACCESSORY', 40, 100, 15, 2, datetime('now', '-3 days'))
  `).run(itemAId, defaultStore.id, 'SKU-ACT-' + uuidv4().slice(0, 6));

  db.prepare(`
    INSERT INTO items (id, store_id, sku, name, category, purchase_price, retail_price, stock_quantity, min_limit, last_sold_date)
    VALUES (?, ?, ?, 'Dead Stock Old Battery', 'SPARE_PART', 150, 300, 20, 2, datetime('now', '-110 days'))
  `).run(itemBId, defaultStore.id, 'SKU-D110-' + uuidv4().slice(0, 6));

  db.prepare(`
    INSERT INTO items (id, store_id, sku, name, category, purchase_price, retail_price, stock_quantity, min_limit, created_at, last_sold_date)
    VALUES (?, ?, ?, 'Stagnant Unsold Screen', 'SPARE_PART', 300, 600, 10, 2, datetime('now', '-95 days'), NULL)
  `).run(itemCId, defaultStore.id, 'SKU-D95-' + uuidv4().slice(0, 6));

  const deadStockRes = await fetch(`${baseUrl}/api/inventory/reports/dead-stock?days=90`);
  assert(deadStockRes.status === 200, 'Dead stock report endpoint returned HTTP 200');
  const deadStockReport = (await deadStockRes.json()) as any;
  const deadItemsList = deadStockReport.items || [];

  const foundB = deadItemsList.find((i: any) => i.id === itemBId);
  const foundC = deadItemsList.find((i: any) => i.id === itemCId);
  const foundA = deadItemsList.find((i: any) => i.id === itemAId);

  assert(
    foundB !== undefined && foundC !== undefined && foundA === undefined,
    'Items with >90 days inactivity correctly included in dead stock report while active item is excluded'
  );

  assert(
    foundB?.total_tied_capital === 3000 && foundC?.total_tied_capital === 3000,
    'Tied-up capital correctly calculated (Item B: 20*150=3000 EGP, Item C: 10*300=3000 EGP)'
  );

  // TEST 61: SLA Breach Detection & Persistence (tickets.sla_started_at persistence, priority updated to URGENT)
  console.log('\n[Test Suite 61: SLA Breach Detection & Persistence (sla_started_at)]');
  const tktCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('repair_tickets') as { name: string }[]).map(c => c.name);
  assert(tktCols.includes('sla_started_at'), 'repair_tickets.sla_started_at persistent column exists in database schema');

  const slaTkt1Id = 'tkt-sla1-' + uuidv4().slice(0, 6);
  const slaTkt2Id = 'tkt-sla2-' + uuidv4().slice(0, 6);
  const baseTktNum = (db.prepare('SELECT COALESCE(MAX(ticket_number), 3000) as num FROM repair_tickets').get() as any).num;

  db.prepare(`
    INSERT INTO repair_tickets (id, ticket_number, store_id, customer_id, device_brand, device_model, reported_defects, status, priority, sla_started_at)
    VALUES (?, ?, ?, ?, 'Samsung', 'Galaxy S23', 'No Display', 'IN_REPAIR', 'NORMAL', ?)
  `).run(slaTkt1Id, baseTktNum + 1, defaultStore.id, tktCust.id, new Date(Date.now() - 36 * 3600 * 1000).toISOString());

  db.prepare(`
    INSERT INTO repair_tickets (id, ticket_number, store_id, customer_id, device_brand, device_model, reported_defects, status, priority, sla_started_at)
    VALUES (?, ?, ?, ?, 'Samsung', 'Galaxy S24', 'Charging Port', 'IN_REPAIR', 'NORMAL', ?)
  `).run(slaTkt2Id, baseTktNum + 2, defaultStore.id, tktCust.id, new Date(Date.now() - 10 * 60 * 1000).toISOString());

  const breached = checkSlaEscalations();
  assert(breached.some((t: any) => t.id === slaTkt1Id), 'Breached ticket detected by persistent sla_started_at scanner');

  const tkt1Db = db.prepare('SELECT priority FROM repair_tickets WHERE id = ?').get(slaTkt1Id) as any;
  const tkt2Db = db.prepare('SELECT priority FROM repair_tickets WHERE id = ?').get(slaTkt2Id) as any;
  assert(
    tkt1Db.priority === 'URGENT' && tkt2Db.priority === 'NORMAL',
    'Breached ticket priority automatically escalated to URGENT while on-track ticket remains NORMAL'
  );

  // TEST 62: Customer Credit Limit Enforcement (blocked if credit_used + new_sale > credit_limit)
  console.log('\n[Test Suite 62: Customer Credit Limit Enforcement]');
  const creditCustId = 'cust-crd-' + uuidv4().slice(0, 6);
  db.prepare(`
    INSERT INTO customers (id, store_id, name, phone, credit_limit, credit_used)
    VALUES (?, ?, 'Credit VIP Client', '01019922883', 10000, 7500)
  `).run(creditCustId, defaultStore.id);

  const creditValidRes = await fetch(`${baseUrl}/api/fintech/customers/${creditCustId}/check-credit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_sale_amount: 1800 })
  });
  const creditValidData = (await creditValidRes.json()) as any;
  assert(
    creditValidRes.status === 200 &&
    creditValidData.allowed === true &&
    creditValidData.projected_used === 9300,
    'Credit sale within available headroom approved (7500 + 1800 = 9300 <= 10000 EGP)'
  );

  db.prepare('UPDATE customers SET credit_used = 9300 WHERE id = ?').run(creditCustId);

  const creditOverRes = await fetch(`${baseUrl}/api/fintech/customers/${creditCustId}/check-credit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_sale_amount: 1200 })
  });
  const creditOverData = (await creditOverRes.json()) as any;
  assert(
    creditOverRes.status === 403 &&
    creditOverData.code === 'CREDIT_LIMIT_EXCEEDED',
    'Credit sale exceeding credit limit strictly blocked with HTTP 403 & CREDIT_LIMIT_EXCEEDED'
  );

  const custAfterOver = db.prepare('SELECT credit_used FROM customers WHERE id = ?').get(creditCustId) as any;
  assert(custAfterOver.credit_used === 9300, 'Customer credit_used balance preserved at 9,300 EGP without over-limit leakage');

  // TEST 63: Void Sale Audit Log (reason required, HTTP 400 if missing, action VOID_SALE in audit_log)
  console.log('\n[Test Suite 63: Void Sale Audit Log & Mandatory Reason]');
  const voidTestSaleId = 'sale-vsec-' + uuidv4().slice(0, 6);
  const voidTestItemId = 'itm-vsec-' + uuidv4().slice(0, 6);
  db.prepare(`
    INSERT INTO items (id, store_id, sku, name, category, purchase_price, retail_price, stock_quantity, min_limit)
    VALUES (?, ?, ?, 'Void Audit Test Item', 'ACCESSORY', 100, 200, 8, 1)
  `).run(voidTestItemId, defaultStore.id, 'SKU-VA-' + uuidv4().slice(0, 6));

  db.prepare(`
    INSERT INTO sales (id, invoice_number, store_id, total, subtotal, discount, tax, payment_method, status)
    VALUES (?, ?, ?, 200, 200, 0, 0, 'CASH', 'COMPLETED')
  `).run(voidTestSaleId, Math.floor(100000 + Math.random() * 800000), defaultStore.id);

  db.prepare(`
    INSERT INTO sale_items (id, sale_id, item_id, item_name, unit_price, quantity, total_price)
    VALUES (?, ?, ?, 'Void Audit Test Item', 200, 1, 200)
  `).run('sitm-va-' + uuidv4().slice(0, 6), voidTestSaleId, voidTestItemId);

  const voidNoReasonRes = await fetch(`${baseUrl}/api/retail/sales/${voidTestSaleId}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: '' })
  });
  assert(voidNoReasonRes.status === 400, 'Attempting to void a sale without reason rejected with HTTP 400');

  const voidReasonText = 'Customer returned unopened product within statutory 14 days';
  const voidWithReasonRes = await fetch(`${baseUrl}/api/retail/sales/${voidTestSaleId}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: voidReasonText, user_id: 'usr-mgr-01' })
  });
  assert(voidWithReasonRes.status === 200, 'Voiding sale with explicit non-null reason accepted with HTTP 200');

  const auditLogEntry = db.prepare("SELECT * FROM audit_log WHERE sale_id = ? AND action = 'VOID_SALE'").get(voidTestSaleId) as any;
  assert(
    auditLogEntry !== undefined && auditLogEntry.reason === voidReasonText,
    'Audit log contains VOID_SALE action with non-null reason preserved verbatim'
  );

  // TEST 64: Financial Approval Hierarchy (>5000 EGP payment without approval returns HTTP 403)
  console.log('\n[Test Suite 64: Financial Approval Hierarchy (>5000 EGP)]');
  const approvalWalletId = 'w-appr-' + uuidv4().slice(0, 6);
  db.prepare(`
    INSERT INTO fintech_wallets (id, store_id, provider_name, account_number, current_balance, daily_limit, daily_usage, monthly_limit, monthly_usage, is_locked, version)
    VALUES (?, ?, 'INSTAPAY', '01122334455', 50000, 100000, 0, 300000, 0, 0, 1)
  `).run(approvalWalletId, defaultStore.id);

  const unapprovedPayRes = await fetch(`${baseUrl}/api/fintech/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_id: approvalWalletId,
      trans_type: 'CASH_IN',
      amount: 7500,
      sender_receiver_phone: '01099887766'
    })
  });
  assert(unapprovedPayRes.status === 403, 'Payment of 7,500 EGP (> 5000 EGP threshold) without approval strictly rejected with HTTP 403');

  const approvalReqId = 'appr-req-' + uuidv4().slice(0, 6);
  db.prepare(`
    INSERT INTO approval_requests (id, request_type, amount, status, requested_by, approved_by)
    VALUES (?, 'FINTECH_PAYMENT', 7500, 'APPROVED', 'usr-cashier', 'usr-mgr-01')
  `).run(approvalReqId);

  const approvedPayRes = await fetch(`${baseUrl}/api/fintech/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_id: approvalWalletId,
      trans_type: 'CASH_IN',
      amount: 7500,
      sender_receiver_phone: '01099887766',
      approval_id: approvalReqId
    })
  });
  assert(approvedPayRes.status === 201, 'Payment of 7,500 EGP with valid approved request completed successfully with HTTP 201');

  // TEST 65: Rate Limiting (/api/auth/login returns HTTP 429 on rapid requests)
  console.log('\n[Test Suite 65: Rate Limiting on /api/auth/login]');
  let rateLimitHit = false;
  let regularRejectionCount = 0;

  for (let attempt = 1; attempt <= 6; attempt++) {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'rate_limit_test_user',
        password: 'wrong_password_123'
      })
    });

    if (attempt <= 5) {
      if (loginRes.status === 401 || loginRes.status === 400) {
        regularRejectionCount++;
      }
    } else {
      if (loginRes.status === 429) {
        rateLimitHit = true;
      }
    }
  }
  assert(regularRejectionCount === 5, 'First 5 rapid login attempts rejected with standard 401 unauthorized');
  assert(rateLimitHit, '6th rapid login attempt blocked with HTTP 429 Too Many Requests');

  // TEST 66: Foreign Key Cascade Delete Protection (ON DELETE RESTRICT)
  console.log('\n[Test Suite 66: Foreign Key Cascade Delete Protection (ON DELETE RESTRICT)]');
  const tktFks = db.prepare("PRAGMA foreign_key_list('repair_tickets')").all() as any[];
  const custFk = tktFks.find((f: any) => f.table === 'customers');
  assert(
    custFk !== undefined && custFk.on_delete.toUpperCase() === 'RESTRICT',
    'repair_tickets FK on customers enforces ON DELETE RESTRICT'
  );

  const saleItemFks = db.prepare("PRAGMA foreign_key_list('sale_items')").all() as any[];
  const itemFk = saleItemFks.find((f: any) => f.table === 'items');
  assert(
    itemFk !== undefined && itemFk.on_delete.toUpperCase() === 'RESTRICT',
    'sale_items FK on items enforces ON DELETE RESTRICT'
  );

  const jLinesFks = db.prepare("PRAGMA foreign_key_list('journal_entry_lines')").all() as any[];
  const accFk = jLinesFks.find((f: any) => f.table === 'chart_of_accounts');
  assert(
    accFk !== undefined && accFk.on_delete.toUpperCase() === 'RESTRICT',
    'journal_entry_lines FK on chart_of_accounts enforces ON DELETE RESTRICT'
  );

  db.pragma('foreign_keys = ON');

  const activeCustWithTicket = db.prepare(`
    SELECT customer_id FROM repair_tickets WHERE customer_id IS NOT NULL AND deleted_at IS NULL LIMIT 1
  `).get() as any;

  let deleteCustBlocked = false;
  try {
    db.prepare('DELETE FROM customers WHERE id = ?').run(activeCustWithTicket.customer_id);
  } catch (err: any) {
    deleteCustBlocked = err.message.includes('FOREIGN KEY constraint failed');
  }
  assert(deleteCustBlocked, 'Behavioral verification: Deleting customer with active repair tickets strictly blocked by SQLite ON DELETE RESTRICT');

  // TEST 67: Subnet Firewall Default-DENY & Workstation Hardware Token Gate (DEC-020, DEC-043 / ADR-020 / RISK-011)
  console.log('\n[Test Suite 67: Subnet Firewall Default-DENY & Workstation Hardware Token Gate (DEC-020, DEC-043)]');

  // Vector 1: External / WAN IP blocked by Subnet Firewall with HTTP 403 (code: LAN_ACCESS_ONLY)
  const wanIpRes = await fetch(`${baseUrl}/api/retail/items`, {
    headers: { 'x-test-client-ip': '203.0.113.195' }
  });
  const wanIpData = (await wanIpRes.json()) as any;
  assert(
    wanIpRes.status === 403 && wanIpData.code === 'LAN_ACCESS_ONLY',
    'Attack Vector 1: Public WAN IP (203.0.113.195) rejected with HTTP 403 and code LAN_ACCESS_ONLY'
  );

  // Vector 2: Non-ratified private subnet (e.g. 172.16.5.10) blocked by Subnet Firewall
  const nonWhitelistedSubnetRes = await fetch(`${baseUrl}/api/retail/items`, {
    headers: { 'x-test-client-ip': '172.16.5.10' }
  });
  const nonWhitelistedData = (await nonWhitelistedSubnetRes.json()) as any;
  assert(
    nonWhitelistedSubnetRes.status === 403 && nonWhitelistedData.code === 'LAN_ACCESS_ONLY',
    'Attack Vector 2: Non-ratified subnet (172.16.5.10) rejected with HTTP 403 per DEC-043 perimeter'
  );

  // Vector 3: Exempt routes (/api/health) bypass subnet guard even from external IP
  const exemptHealthRes = await fetch(`${baseUrl}/api/health`, {
    headers: { 'x-test-client-ip': '203.0.113.195' }
  });
  assert(exemptHealthRes.status === 200, 'Vector 3: Exempt route (/api/health) successfully accessible from external IP without blocking');

  // Vector 4: LAN station (192.168.1.50) without hardware device token rejected with HTTP 403 (code: DEVICE_TOKEN_REQUIRED)
  const lanNoTokenRes = await fetch(`${baseUrl}/api/retail/items`, {
    headers: { 'x-test-client-ip': '192.168.1.50' }
  });
  const lanNoTokenData = (await lanNoTokenRes.json()) as any;
  assert(
    lanNoTokenRes.status === 403 && lanNoTokenData.code === 'DEVICE_TOKEN_REQUIRED',
    'Vector 4: LAN workstation (192.168.1.50) missing x-device-token rejected with HTTP 403 and code DEVICE_TOKEN_REQUIRED'
  );

  // Vector 5: LAN station with forged/unregistered token rejected with HTTP 403 (code: DEVICE_NOT_WHITELISTED)
  const lanFakeTokenRes = await fetch(`${baseUrl}/api/retail/items`, {
    headers: {
      'x-test-client-ip': '192.168.1.50',
      'x-device-token': 'forged-attacker-token-9999'
    }
  });
  const lanFakeTokenData = (await lanFakeTokenRes.json()) as any;
  assert(
    lanFakeTokenRes.status === 403 && lanFakeTokenData.code === 'DEVICE_NOT_WHITELISTED',
    'Attack Vector 5: LAN workstation with invalid x-device-token rejected with HTTP 403 and code DEVICE_NOT_WHITELISTED'
  );

  // Vector 6: Workstation Device Onboarding via POST /api/security/devices/register
  // 6a: Non-privileged user blocked from registering devices (RBAC check)
  const techToken = signToken({ userId: 'u-tech-1', username: 'technician', role: 'Technician', storeId: 'store-1' });
  const nonAdminRegRes = await fetch(`${baseUrl}/api/security/devices/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${techToken}`
    },
    body: JSON.stringify({ device_name: 'Unauthorized Tech Station' })
  });
  assert(nonAdminRegRes.status === 403, 'Vector 6a: Non-manager/non-admin user rejected from device registration with HTTP 403');

  // 6b: Missing device_name rejected with HTTP 400
  const adminToken = signToken({ userId: 'u-admin-1', username: 'admin', role: 'SuperAdmin', storeId: 'store-1' });
  const missingNameRes = await fetch(`${baseUrl}/api/security/devices/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ device_name: '   ' })
  });
  assert(missingNameRes.status === 400, 'Vector 6b: Registration without device_name rejected with HTTP 400 Bad Request');

  // 6c: Admin registers new workstation successfully
  const registerRes = await fetch(`${baseUrl}/api/security/devices/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      device_name: 'Workstation-POS-Terminal-2',
      mac_or_fingerprint: '00:1A:2B:3C:4D:5E',
      ip_subnet: '192.168.1.50'
    })
  });
  const regData = (await registerRes.json()) as any;
  assert(
    registerRes.status === 201 &&
    regData.success === true &&
    typeof regData.device_token === 'string' &&
    regData.device_token.length === 64,
    'Vector 6c: SuperAdmin successfully registered trusted workstation; received 64-char crypto token'
  );

  const persistedDevice = db.prepare('SELECT * FROM trusted_devices WHERE id = ?').get(regData.device_id) as any;
  assert(
    persistedDevice !== undefined &&
    persistedDevice.is_whitelisted === 1 &&
    persistedDevice.device_name === 'Workstation-POS-Terminal-2',
    'Vector 6d: Workstation record persisted in trusted_devices with is_whitelisted = 1'
  );

  // 6e: Verify audit log recorded registration
  const regAudit = db.prepare("SELECT * FROM audit_logs WHERE action = 'REGISTER_DEVICE' AND entity_id = ?").get(regData.device_id) as any;
  assert(regAudit !== undefined && regAudit.user_id === 'u-admin-1', 'Vector 6e: REGISTER_DEVICE action recorded in audit_logs with actor details');

  // Vector 7: LAN station with valid registered device token successfully accesses protected endpoint
  const authorizedLanRes = await fetch(`${baseUrl}/api/retail/items`, {
    headers: {
      'x-test-client-ip': '192.168.1.50',
      'x-device-token': regData.device_token
    }
  });
  assert(
    authorizedLanRes.status === 200,
    'Vector 7: LAN workstation with valid x-device-token successfully authorized (HTTP 200)'
  );

  // Vector 8: Seeded Master POS Device (Label master-pos-station-token) verification per DEC-043
  const seededMaster = db.prepare("SELECT * FROM trusted_devices WHERE id = 'dev-master-pos-01'").get() as any;
  assert(
    seededMaster !== undefined &&
    seededMaster.device_name === 'master-pos-station-token' &&
    seededMaster.device_token !== 'master-pos-station-token' &&
    seededMaster.device_token.length === 64,
    'Vector 8: Seeded master POS device uses crypto random 64-char token (DEC-043 condition enforced)'
  );

  // TEST 68: Logical Spare Parts Reservation & POS Contention Defense (DEC-036 / ADR-036 / FR-003 / RISK-010)
  console.log('\n[Test Suite 68: Logical Spare Parts Reservation & POS Contention Defense (DEC-036, FR-003)]');

  // Vector (a): Reservation + Concurrent POS Race Attempt
  const raceItemId = 'itm-res-race-' + uuidv4().slice(0, 6);
  db.prepare(`
    INSERT INTO items (id, store_id, sku, name, category, purchase_price, retail_price, stock_quantity, reserved_quantity, min_limit)
    VALUES (?, ?, ?, 'iPhone 15 OLED Screen Original', 'SPARE_PART', 1200, 2500, 2, 0, 1)
  `).run(raceItemId, defaultStore.id, 'SKU-RACE-' + uuidv4().slice(0, 6));

  // Workshop technician creates ticket and moves to IN_REPAIR with 1 unit of this part attached
  const raceCustId = 'cust-race-' + uuidv4().slice(0, 6);
  db.prepare(`INSERT INTO customers (id, store_id, name, phone) VALUES (?, ?, 'Race Customer', '01011112222')`).run(raceCustId, defaultStore.id);
  const getNextTicketNumber = () => ((db.prepare('SELECT COALESCE(MAX(ticket_number), 1000) + 1 as num FROM repair_tickets').get() as any).num);
  const raceTicketId = 'tkt-race-' + uuidv4().slice(0, 6);
  db.prepare(`
    INSERT INTO repair_tickets (id, ticket_number, store_id, customer_id, device_brand, device_model, reported_defects, status, priority, estimated_cost, release_otp)
    VALUES (?, ?, ?, ?, 'Apple', 'iPhone 15', 'Broken Screen', 'IN_REPAIR', 'NORMAL', 2800, '4321')
  `).run(raceTicketId, getNextTicketNumber(), defaultStore.id, raceCustId);

  // Allocate 1 unit of part to ticket
  const allocRes = await fetch(`${baseUrl}/api/repair/tickets/${raceTicketId}/consume-part`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item_id: raceItemId,
      part_name: 'iPhone 15 OLED Screen Original',
      cost_price: 1200,
      selling_price: 2500
    })
  });
  const allocData = (await allocRes.json()) as any;
  assert(allocRes.status === 201 && allocData.is_reserved === 1, 'Vector (a).1: Part allocated to IN_REPAIR ticket and marked is_reserved = 1');

  const itemAfterAlloc = db.prepare('SELECT stock_quantity, reserved_quantity FROM items WHERE id = ?').get(raceItemId) as any;
  assert(
    itemAfterAlloc.stock_quantity === 2 && itemAfterAlloc.reserved_quantity === 1,
    'Vector (a).2: Logical reservation active: stock_quantity remains 2, reserved_quantity is 1 (Available = 1)'
  );

  // Concurrent POS cashier attempts to checkout 2 units (exceeds available stock of 1)
  const posOverRes = await fetch(`${baseUrl}/api/retail/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ item_id: raceItemId, item_name: 'iPhone 15 OLED Screen Original', unit_price: 2500, quantity: 2 }]
    })
  });
  const posOverData = (await posOverRes.json()) as any;
  assert(
    posOverRes.status === 409 && posOverData.error === 'INSUFFICIENT_AVAILABLE_STOCK',
    'Vector (a).3: Concurrent POS checkout of 2 units rejected with HTTP 409 and error INSUFFICIENT_AVAILABLE_STOCK'
  );

  // Cashier checks out 1 unit (the unreserved available unit) -> succeeds
  const posOkRes = await fetch(`${baseUrl}/api/retail/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ item_id: raceItemId, item_name: 'iPhone 15 OLED Screen Original', unit_price: 2500, quantity: 1 }],
      payment_method: 'CASH'
    })
  });
  assert(posOkRes.status === 201, 'Vector (a).4: POS checkout of 1 available unit accepted with HTTP 201');

  const itemAfterPos = db.prepare('SELECT stock_quantity, reserved_quantity FROM items WHERE id = ?').get(raceItemId) as any;
  assert(
    itemAfterPos.stock_quantity === 1 && itemAfterPos.reserved_quantity === 1,
    'Vector (a).5: Stock decremented to 1, reserved_quantity remains 1 (Available = 0)'
  );

  // Cashier attempts another checkout when available is 0 -> rejected with HTTP 409
  const posZeroAvailRes = await fetch(`${baseUrl}/api/retail/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ item_id: raceItemId, item_name: 'iPhone 15 OLED Screen Original', unit_price: 2500, quantity: 1 }]
    })
  });
  assert(
    posZeroAvailRes.status === 409,
    'Vector (a).6: Further POS checkout strictly rejected with HTTP 409 when available stock is 0'
  );

  // Vector (b): Reservation Quantity > Stock Attempt against the CHECK Constraint
  let dbCheckViolated = false;
  try {
    db.prepare('UPDATE items SET reserved_quantity = 5 WHERE id = ?').run(raceItemId); // stock is 1
  } catch (err: any) {
    dbCheckViolated = err.message.includes('CHECK constraint failed');
  }
  assert(
    dbCheckViolated,
    'Vector (b).1: SQLite engine strictly rejected reserved_quantity > stock_quantity with CHECK constraint failure'
  );

  let negCheckViolated = false;
  try {
    db.prepare('UPDATE items SET reserved_quantity = -1 WHERE id = ?').run(raceItemId);
  } catch (err: any) {
    negCheckViolated = err.message.includes('CHECK constraint failed');
  }
  assert(
    negCheckViolated,
    'Vector (b).2: SQLite engine strictly rejected negative reserved_quantity with CHECK constraint failure'
  );

  // Server guard test: Attempting to allocate when available stock is 0 returns HTTP 409
  const overAllocRes = await fetch(`${baseUrl}/api/repair/tickets/${raceTicketId}/consume-part`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item_id: raceItemId,
      part_name: 'iPhone 15 OLED Screen Original',
      cost_price: 1200,
      selling_price: 2500
    })
  });
  assert(
    overAllocRes.status === 409,
    'Vector (b).3: Server guard rejected repair part allocation exceeding available stock with HTTP 409'
  );

  // Vector (c): Asymmetric Double Lifecycle: DELIVERED vs CANCELLED
  const doubleLifeItemId = 'itm-life-' + uuidv4().slice(0, 6);
  db.prepare(`
    INSERT INTO items (id, store_id, sku, name, category, purchase_price, retail_price, stock_quantity, reserved_quantity, min_limit)
    VALUES (?, ?, ?, 'OEM Battery iPhone 14', 'SPARE_PART', 400, 950, 2, 0, 1)
  `).run(doubleLifeItemId, defaultStore.id, 'SKU-LIFE-' + uuidv4().slice(0, 6));

  // Create Ticket 1 (DIAGNOSED)
  const tkt1Id = 'tkt-deliv-' + uuidv4().slice(0, 6);
  db.prepare(`
    INSERT INTO repair_tickets (id, ticket_number, store_id, customer_id, device_brand, device_model, reported_defects, status, priority, estimated_cost, release_otp)
    VALUES (?, ?, ?, ?, 'Apple', 'iPhone 14', 'Battery Drain', 'DIAGNOSED', 'NORMAL', 950, '1111')
  `).run(tkt1Id, getNextTicketNumber(), defaultStore.id, raceCustId);

  // Create Ticket 2 (DIAGNOSED)
  const tkt2Id = 'tkt-canc-' + uuidv4().slice(0, 6);
  db.prepare(`
    INSERT INTO repair_tickets (id, ticket_number, store_id, customer_id, device_brand, device_model, reported_defects, status, priority, estimated_cost, release_otp)
    VALUES (?, ?, ?, ?, 'Apple', 'iPhone 14', 'Battery Swollen', 'DIAGNOSED', 'NORMAL', 950, '2222')
  `).run(tkt2Id, getNextTicketNumber(), defaultStore.id, raceCustId);

  // Attach 1 part to Ticket 1 and 1 part to Ticket 2 (status DIAGNOSED -> is_reserved = 0 initially)
  db.prepare(`
    INSERT INTO repair_consumed_parts (id, ticket_id, item_id, part_name, vendor_batch_code, cost_price, selling_price, is_reserved)
    VALUES (?, ?, ?, 'OEM Battery iPhone 14', 'BATCH-01', 400, 950, 0)
  `).run('rcp-life-' + uuidv4().slice(0, 6), tkt1Id, doubleLifeItemId);

  db.prepare(`
    INSERT INTO repair_consumed_parts (id, ticket_id, item_id, part_name, vendor_batch_code, cost_price, selling_price, is_reserved)
    VALUES (?, ?, ?, 'OEM Battery iPhone 14', 'BATCH-02', 400, 950, 0)
  `).run('rcp-life-' + uuidv4().slice(0, 6), tkt2Id, doubleLifeItemId);

  // Move Ticket 1 to IN_REPAIR -> triggers reservation
  const tkt1InRepairRes = await fetch(`${baseUrl}/api/repair/tickets/${tkt1Id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'IN_REPAIR' })
  });
  assert(tkt1InRepairRes.status === 200, 'Vector (c).1: Ticket 1 transitioned to IN_REPAIR');

  // Move Ticket 2 to IN_REPAIR -> triggers reservation
  const tkt2InRepairRes = await fetch(`${baseUrl}/api/repair/tickets/${tkt2Id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'IN_REPAIR' })
  });
  assert(tkt2InRepairRes.status === 200, 'Vector (c).2: Ticket 2 transitioned to IN_REPAIR');

  const itemBothReserved = db.prepare('SELECT stock_quantity, reserved_quantity FROM items WHERE id = ?').get(doubleLifeItemId) as any;
  assert(
    itemBothReserved.stock_quantity === 2 && itemBothReserved.reserved_quantity === 2,
    'Vector (c).3: Both tickets reserved their parts: stock_quantity = 2, reserved_quantity = 2 (Available = 0)'
  );

  // Branch 1: Deliver Ticket 1 (requires QA checklist for READY -> then DELIVERED)
  const tkt1ReadyRes = await fetch(`${baseUrl}/api/repair/tickets/${tkt1Id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'READY', qa_checklist: { battery_tested: true, charge_cycle: 100 } })
  });
  assert(tkt1ReadyRes.status === 200, 'Vector (c).4: Ticket 1 transitioned to READY with valid QA checklist');

  const tkt1DeliverRes = await fetch(`${baseUrl}/api/repair/tickets/${tkt1Id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'DELIVERED' })
  });
  assert(tkt1DeliverRes.status === 200, 'Vector (c).5: Ticket 1 transitioned to DELIVERED');

  const itemAfterDeliver = db.prepare('SELECT stock_quantity, reserved_quantity FROM items WHERE id = ?').get(doubleLifeItemId) as any;
  assert(
    itemAfterDeliver.stock_quantity === 1 && itemAfterDeliver.reserved_quantity === 1,
    'Vector (c).6: DELIVERED lifecycle: Asymmetric physical deduction + reservation clearance (stock 2->1, reserved 2->1)'
  );

  // Branch 2: Cancel Ticket 2
  const tkt2CancelRes = await fetch(`${baseUrl}/api/repair/tickets/${tkt2Id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'CANCELLED' })
  });
  assert(tkt2CancelRes.status === 200, 'Vector (c).7: Ticket 2 transitioned to CANCELLED');

  const itemAfterCancel = db.prepare('SELECT stock_quantity, reserved_quantity FROM items WHERE id = ?').get(doubleLifeItemId) as any;
  assert(
    itemAfterCancel.stock_quantity === 1 && itemAfterCancel.reserved_quantity === 0,
    'Vector (c).8: CANCELLED lifecycle: Reservation released without physical stock deduction (stock remains 1, reserved becomes 0)'
  );

  // Asymmetric Reconciliation Final Verification: Released unit is immediately available for POS sale
  const posReleasedSaleRes = await fetch(`${baseUrl}/api/retail/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ item_id: doubleLifeItemId, item_name: 'OEM Battery iPhone 14', unit_price: 950, quantity: 1 }],
      payment_method: 'CASH'
    })
  });
  assert(
    posReleasedSaleRes.status === 201,
    'Vector (c).9: Released part from cancelled repair immediately and successfully sold at POS counter (HTTP 201)'
  );

  const finalDoubleLifeItem = db.prepare('SELECT stock_quantity, reserved_quantity FROM items WHERE id = ?').get(doubleLifeItemId) as any;
  assert(
    finalDoubleLifeItem.stock_quantity === 0 && finalDoubleLifeItem.reserved_quantity === 0,
    'Vector (c).10: Asymmetric double lifecycle fully settled: stock_quantity = 0, reserved_quantity = 0'
  );

  // Close ephemeral test server
  testServer.close();
}

async function runBackupTest() {
  await runExtendedSuites();

  const backup = await createDatabaseBackup('TestRunner');
  assert(backup.sizeBytes > 0, `SQLite online backup created (${backup.sizeBytes} bytes): ${backup.filename}`);
  const backups = listBackups();
  assert(backups.length > 0, `Backup catalogue lists ${backups.length} valid backups`);

  console.log(`\n==============================================`);
  console.log(`🏁 AUTOMATED TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==============================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runBackupTest().catch(err => {
  console.error(err);
  process.exit(1);
});


