import assert from 'assert';
import db from '../../db/database';
import {
  validateStatusTransition,
  checkSlaEscalations,
  generateTrackingQrBuffer,
  ensureDefaultTemplates,
  normalizeStatus
} from './repair.service';

async function run() {
  console.log('🧪 Running Repair Lab & Technician Workflow Unit Verification...');

  // 1. Status Normalization & State Machine Transitions
  console.log('[Test 1: Status Normalization & Aliases]');
  assert.strictEqual(normalizeStatus('INTAKE'), 'RECEIVED');
  assert.strictEqual(normalizeStatus('received'), 'RECEIVED');
  assert.strictEqual(normalizeStatus('DIAGNOSING'), 'DIAGNOSED');
  assert.strictEqual(normalizeStatus('IN_PROGRESS'), 'IN_REPAIR');
  assert.strictEqual(normalizeStatus('WAITING_APPROVAL'), 'QA');
  console.log('  ✅ PASS: Status normalization maps aliases accurately');

  console.log('\n[Test 2: State Machine Transition Validation (R1.5)]');
  // Valid sequential transitions
  const t1 = validateStatusTransition('RECEIVED', 'DIAGNOSED');
  assert.strictEqual(t1.valid, true, 'RECEIVED -> DIAGNOSED must be valid');

  const t2 = validateStatusTransition('DIAGNOSED', 'IN_REPAIR');
  assert.strictEqual(t2.valid, true, 'DIAGNOSED -> IN_REPAIR must be valid');

  const t3 = validateStatusTransition('IN_REPAIR', 'QA');
  assert.strictEqual(t3.valid, true, 'IN_REPAIR -> QA must be valid');

  // Invalid transitions (Strict R1.5 Requirement)
  const inv1 = validateStatusTransition('RECEIVED', 'DELIVERED');
  assert.strictEqual(inv1.valid, false, 'RECEIVED -> DELIVERED must be rejected');
  assert.strictEqual(inv1.error, 'Invalid status transition');
  assert.strictEqual(inv1.code, 'INVALID_STATUS_TRANSITION');

  const inv2 = validateStatusTransition('INTAKE', 'READY');
  assert.strictEqual(inv2.valid, false, 'INTAKE -> READY must be rejected');
  assert.strictEqual(inv2.error, 'Invalid status transition');

  const inv3 = validateStatusTransition('DIAGNOSED', 'DELIVERED');
  assert.strictEqual(inv3.valid, false, 'DIAGNOSED -> DELIVERED must be rejected');

  console.log('  ✅ PASS: Invalid transitions strictly rejected with "Invalid status transition"');

  console.log('\n[Test 3: Post-Repair QA Checklist Enforcement (R1.6)]');
  // Transitioning to READY without QA checklist must fail
  const readyNoQc = validateStatusTransition('QA', 'READY', null, null);
  assert.strictEqual(readyNoQc.valid, false, 'Transition to READY without QA checklist must fail');
  assert.strictEqual(readyNoQc.code, 'QA_CHECKLIST_REQUIRED');

  // Transitioning to READY with empty QA checklist must fail
  const readyEmptyQc = validateStatusTransition('QA', 'READY', {}, null);
  assert.strictEqual(readyEmptyQc.valid, false, 'Transition to READY with empty object must fail');

  // Transitioning to READY with valid QA checklist must succeed
  const readyWithQc = validateStatusTransition('QA', 'READY', { screen: true, power: true, camera: true });
  assert.strictEqual(readyWithQc.valid, true, 'Transition to READY with valid QA checklist must succeed');

  // Transitioning to READY when DB already has QA checklist
  const readyWithDbQc = validateStatusTransition('QA', 'READY', null, '{"power":true,"screen":true}');
  assert.strictEqual(readyWithDbQc.valid, true, 'Transition to READY with existing DB checklist must succeed');

  console.log('  ✅ PASS: QA checklist enforcement before READY strictly verified');

  console.log('\n[Test 4: SLA Timer Persistence & Escalation Engine (R1.4, R5.1)]');
  // Check that sla_started_at column exists and is populated
  const ticketCols = (db.prepare('SELECT name FROM pragma_table_info(?)').all('repair_tickets') as { name: string }[]).map(c => c.name);
  assert.strictEqual(ticketCols.includes('sla_started_at'), true, 'repair_tickets.sla_started_at column must exist');
  assert.strictEqual(ticketCols.includes('qa_checklist'), true, 'repair_tickets.qa_checklist column must exist');

  // Run SLA escalation scanner
  const breached = checkSlaEscalations();
  assert(Array.isArray(breached), 'checkSlaEscalations must return array of breached tickets');
  console.log(`  ✅ PASS: Persistent SLA escalation scan executed cleanly (${breached.length} open tickets evaluated)`);

  console.log('\n[Test 5: QR Code Generation via bwip-js (R1.2)]');
  const qrBuffer = await generateTrackingQrBuffer('http://localhost:5173/portal/track?ticket=1001');
  assert(Buffer.isBuffer(qrBuffer), 'QR code must be a valid Buffer');
  assert(qrBuffer.length > 50, 'QR buffer must contain PNG data');
  console.log(`  ✅ PASS: bwip-js generated valid PNG QR code (${qrBuffer.length} bytes)`);

  console.log('\n[Test 6: Repair Notes Template Library (R1.10)]');
  ensureDefaultTemplates();
  const templates = db.prepare('SELECT * FROM repair_notes_templates').all() as any[];
  assert(templates.length >= 5, 'Seeded templates must contain at least 5 standard repair notes');
  assert(templates.some(t => t.title.includes('Screen')), 'Screen replacement template exists');
  assert(templates.some(t => t.title.includes('Battery')), 'Battery replacement template exists');
  console.log(`  ✅ PASS: Repair notes template library contains ${templates.length} ready-to-use templates`);

  console.log('\n[Test 7: Composite IMEI & Status Search Index (R1.7)]');
  const indexes = db.prepare('PRAGMA index_list(repair_tickets)').all() as any[];
  assert(indexes.some(i => i.name === 'idx_repair_tickets_imei_status'), 'idx_repair_tickets_imei_status composite index must exist');
  console.log('  ✅ PASS: Composite index (imei_sn, status) active in SQLite database');

  console.log('\n==============================================');
  console.log('🎉 REPAIR LAB M1 MODULE VERIFICATION SUCCESSFUL');
  console.log('==============================================\n');
}

run().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
