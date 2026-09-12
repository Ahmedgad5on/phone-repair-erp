import db from './database';
import { runMigrations } from './migrations';
import bcrypt from 'bcryptjs';

export function seedDatabase() {
  runMigrations();
  console.log('[Database] Seeding initial store and modular ERP data...');

  const defaultPasswordHash = bcrypt.hashSync('admin123', 12);

  // Update existing users if password is empty
  try {
    db.prepare("UPDATE users SET password = ? WHERE password IS NULL OR password = ''").run(defaultPasswordHash);
  } catch (err) {
    // ignore
  }

  // Ensure master device exists in trusted_devices (DEC-043)
  try {
    const masterDevice = db.prepare('SELECT id FROM trusted_devices WHERE id = ?').get('dev-master-pos-01');
    if (!masterDevice) {
      const crypto = require('crypto');
      const masterRandomToken = crypto.randomBytes(32).toString('hex');
      db.prepare(`
        INSERT INTO trusted_devices (id, device_token, device_name, mac_or_fingerprint, ip_subnet, is_whitelisted)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run('dev-master-pos-01', masterRandomToken, 'master-pos-station-token', 'HOST-PRIMARY-TERMINAL', '127.0.0.1');
      console.log('[Security] Seeded master POS device (Label: master-pos-station-token, Token: cryptographically generated)');
    }
  } catch (err) {
    // ignore
  }

  const storeCount = db.prepare('SELECT COUNT(*) as count FROM stores').get() as { count: number };
  if (storeCount.count > 0) {
    console.log('[Database] Data already seeded.');
    return;
  }

  const storeId = 'store-main-001';
  db.prepare(`
    INSERT INTO stores (id, name, phone, address, enable_repair, enable_retail, enable_spare_parts, enable_fintech, receipt_header, receipt_footer, google_maps_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    storeId,
    'Alpha Mobile Hub & Lab (الفا موبايل)',
    '+201001234567',
    '15 Tech Street, Downtown Hub, Cairo',
    1, 1, 1, 1,
    'ALPHA MOBILE HUB & LAB\nSales • Repairs • Spare Parts • E-Wallets\nTax ID: 492-819-204 | Support: 01001234567',
    'Warranty: 30 Days on Repairs, 14 Days on Retail Accessories.\nGoods tested before delivery. Please keep this ticket.',
    'https://maps.google.com/?q=AlphaMobileHub'
  );

  // 2. Users with hashed passwords
  const users = [
    { id: 'usr-admin', username: 'admin', name: 'Ahmed Owner (المدير العام)', role: 'SuperAdmin', commission: 0.0 },
    { id: 'usr-tech-1', username: 'kareem_tech', name: 'Eng. Kareem (مهندس الصيانة)', role: 'MaintenanceEngineer', commission: 0.35 },
    { id: 'usr-tech-2', username: 'omar_tech', name: 'Eng. Omar Board Specialist', role: 'MaintenanceEngineer', commission: 0.40 },
    { id: 'usr-cashier', username: 'sara_cashier', name: 'Sara Cashier (كاشير)', role: 'Cashier', commission: 0.0 },
    { id: 'usr-sales', username: 'tarek_sales', name: 'Tarek Sales (مبيعات)', role: 'Salesperson', commission: 0.05 },
    { id: 'usr-reception', username: 'mona_recep', name: 'Mona Receptionist (استقبال)', role: 'Receptionist', commission: 0.0 }
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, store_id, username, password, name, role, is_active, commission_rate)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `);
  for (const u of users) {
    insertUser.run(u.id, storeId, u.username, defaultPasswordHash, u.name, u.role, u.commission);
  }

  // 3. Shift
  const shiftId = 'shift-cur-001';
  db.prepare(`
    INSERT INTO shifts (id, store_id, opened_by_user_id, opening_cash, expected_cash, actual_cash, device_inventory_count, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(shiftId, storeId, 'usr-cashier', 5000.0, 5000.0, null, 14, 'OPEN');

  // 4. Customers
  const customers = [
    { id: 'cust-01', name: 'Mahmoud Hassan', phone: '+201099887766', tag: 'VIP', spent: 48500.0, points: 480, notes: 'VIP Customer, corporate account' },
    { id: 'cust-02', name: 'Nour El-Din', phone: '+201122334455', tag: 'REGULAR', spent: 3200.0, points: 30, notes: 'Always replaces screen protector' },
    { id: 'cust-03', name: 'Youssef Kamal', phone: '+201288776655', tag: 'HIGH_RETURN', spent: 7500.0, points: 70, notes: 'Frequently claims subjective battery drains' },
    { id: 'cust-04', name: 'Tech Store Alex', phone: '+201011112222', tag: 'VIP', spent: 92000.0, points: 900, notes: 'Wholesale technician buyer' }
  ];

  const insertCustomer = db.prepare(`
    INSERT INTO customers (id, store_id, name, phone, tag, total_spent, loyalty_points, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of customers) {
    insertCustomer.run(c.id, storeId, c.name, c.phone, c.tag, c.spent, c.points, c.notes);
  }

  // 5. Items
  const items = [
    { id: 'itm-phone-15pm', sku: 'PH-IPH15PM-256', barcode: '195949012345', name: 'Apple iPhone 15 Pro Max 256GB Natural Titanium', category: 'PHONE', grade: null, purchase: 52000.0, ws: 56500.0, ret: 58900.0, bulk: 55800.0, qty: 3, min: 1, warranty: 365, sold: '2026-09-08' },
    { id: 'itm-phone-13', sku: 'PH-IPH13-128-BK', barcode: '194252701122', name: 'Apple iPhone 13 128GB Midnight (New Sealed)', category: 'PHONE', grade: null, purchase: 26000.0, ws: 28500.0, ret: 29900.0, bulk: 28000.0, qty: 5, min: 2, warranty: 365, sold: '2026-09-07' },
    { id: 'itm-phone-s24u', sku: 'PH-SAM-S24U-512', barcode: '880609530111', name: 'Samsung Galaxy S24 Ultra 512GB Titanium Gray', category: 'PHONE', grade: null, purchase: 49000.0, ws: 53000.0, ret: 55500.0, bulk: 52500.0, qty: 2, min: 1, warranty: 365, sold: '2026-09-05' },
    { id: 'itm-phone-ip12-used', sku: 'PH-IPH12-128-USED', barcode: '194252009988', name: 'Apple iPhone 12 128GB Blue (Used 87% Battery)', category: 'PHONE', grade: 'REFURBISHED', purchase: 15500.0, ws: 17200.0, ret: 18500.0, bulk: 16900.0, qty: 4, min: 1, warranty: 90, sold: '2026-09-01' },
    { id: 'itm-acc-anker20w', sku: 'ACC-ANK-20W-W', barcode: '848061058889', name: 'Anker PowerPort III 20W PD Wall Charger White', category: 'ACCESSORY', grade: null, purchase: 320.0, ws: 420.0, ret: 550.0, bulk: 390.0, qty: 45, min: 10, warranty: 180, sold: '2026-09-09' },
    { id: 'itm-acc-cable-c2l', sku: 'ACC-JOY-C2L-1M', barcode: '695611200331', name: 'Joyroom Braided Type-C to Lightning Cable 1.2M', category: 'ACCESSORY', grade: null, purchase: 75.0, ws: 110.0, ret: 180.0, bulk: 95.0, qty: 80, min: 15, warranty: 90, sold: '2026-09-09' },
    { id: 'itm-acc-case-15p', sku: 'ACC-CASE-MAG-15P', barcode: '772391004411', name: 'Magnetic Clear Hybrid Case iPhone 15 Pro', category: 'ACCESSORY', grade: null, purchase: 45.0, ws: 75.0, ret: 150.0, bulk: 65.0, qty: 35, min: 5, warranty: 30, sold: '2026-09-08' },
    { id: 'itm-sp-ip13-oled', sku: 'SP-IP13-DISP-OEM', barcode: '990100111222', name: 'iPhone 13 OLED Display Assembly (Service Pack OEM)', category: 'SPARE_PART', grade: 'SERVICE_PACK', purchase: 2800.0, ws: 3400.0, ret: 4200.0, bulk: 3200.0, qty: 12, min: 3, warranty: 90, sold: '2026-09-08' },
    { id: 'itm-sp-ip13-incell', sku: 'SP-IP13-DISP-INC', barcode: '990100111233', name: 'iPhone 13 Screen Incell JK/GX Quality', category: 'SPARE_PART', grade: 'INCELL', purchase: 1100.0, ws: 1450.0, ret: 1950.0, bulk: 1350.0, qty: 25, min: 5, warranty: 30, sold: '2026-09-09' },
    { id: 'itm-sp-s23-disp', sku: 'SP-SAM-S23-DISP', barcode: '990200333444', name: 'Samsung Galaxy S23 Dynamic AMOLED With Frame (Original Service Pack)', category: 'SPARE_PART', grade: 'SERVICE_PACK', purchase: 4600.0, ws: 5200.0, ret: 6200.0, bulk: 4950.0, qty: 6, min: 2, warranty: 90, sold: '2026-09-06' },
    { id: 'itm-sp-ip14-batt', sku: 'SP-IP14-BATT-TI', barcode: '990300555666', name: 'iPhone 14 Battery Original TI Gas Gauge 3279mAh', category: 'SPARE_PART', grade: 'ORIGINAL_PULL', purchase: 580.0, ws: 750.0, ret: 1100.0, bulk: 690.0, qty: 18, min: 4, warranty: 180, sold: '2026-09-08' },
    { id: 'itm-sp-a54-chg', sku: 'SP-SAM-A54-FLEX', barcode: '990400777888', name: 'Samsung A54 5G Charging Port Sub-PBA Original IC Board', category: 'SPARE_PART', grade: 'SERVICE_PACK', purchase: 180.0, ws: 250.0, ret: 400.0, bulk: 220.0, qty: 14, min: 3, warranty: 90, sold: '2026-09-07' }
  ];

  const insertItem = db.prepare(`
    INSERT INTO items (id, store_id, sku, barcode, name, category, quality_grade, purchase_price, wholesale_price, retail_price, bulk_price, stock_quantity, min_limit, warranty_days, last_sold_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const itm of items) {
    insertItem.run(itm.id, storeId, itm.sku, itm.barcode, itm.name, itm.category, itm.grade, itm.purchase, itm.ws, itm.ret, itm.bulk, itm.qty, itm.min, itm.warranty, itm.sold);
  }

  // 6. IMEI Records
  const imeiList = [
    { id: 'imei-01', itemId: 'itm-phone-15pm', imei: '358921102938471', color: 'Natural Titanium', storage: '256GB', cond: 'NEW', bh: 100 },
    { id: 'imei-02', itemId: 'itm-phone-15pm', imei: '358921102938472', color: 'Natural Titanium', storage: '256GB', cond: 'NEW', bh: 100 },
    { id: 'imei-03', itemId: 'itm-phone-15pm', imei: '358921102938473', color: 'Black Titanium', storage: '256GB', cond: 'NEW', bh: 100 },
    { id: 'imei-04', itemId: 'itm-phone-13', imei: '352109485736201', color: 'Midnight', storage: '128GB', cond: 'NEW', bh: 100 },
    { id: 'imei-05', itemId: 'itm-phone-13', imei: '352109485736202', color: 'Midnight', storage: '128GB', cond: 'NEW', bh: 100 },
    { id: 'imei-06', itemId: 'itm-phone-13', imei: '352109485736203', color: 'Starlight', storage: '128GB', cond: 'NEW', bh: 100 },
    { id: 'imei-07', itemId: 'itm-phone-ip12-used', imei: '357291048563820', color: 'Pacific Blue', storage: '128GB', cond: 'USED_GOOD', bh: 87 },
    { id: 'imei-08', itemId: 'itm-phone-ip12-used', imei: '357291048563821', color: 'Black', storage: '128GB', cond: 'USED_LIKE_NEW', bh: 91 }
  ];

  const insertImei = db.prepare(`
    INSERT INTO imei_records (id, item_id, imei, status, battery_health, color, storage, condition)
    VALUES (?, ?, ?, 'IN_STOCK', ?, ?, ?, ?)
  `);
  for (const im of imeiList) {
    insertImei.run(im.id, im.itemId, im.imei, im.bh, im.color, im.storage, im.cond);
  }

  // 7. Compatibility
  const compatibilities = [
    { id: 'cmp-01', itemId: 'itm-sp-ip13-oled', brand: 'Apple', model: 'iPhone 13', notes: 'Direct drop-in OEM assembly with TrueTone transfer' },
    { id: 'cmp-02', itemId: 'itm-sp-ip13-oled', brand: 'Apple', model: 'iPhone 14', notes: 'Panel compatible with pinout swap and earpiece flex adaptation' },
    { id: 'cmp-03', itemId: 'itm-sp-ip13-incell', brand: 'Apple', model: 'iPhone 13', notes: 'Budget Incell replacement, slightly thicker profile' },
    { id: 'cmp-04', itemId: 'itm-sp-s23-disp', brand: 'Samsung', model: 'Galaxy S23 (SM-S911B / SM-S911U)', notes: 'Original service pack with metal frame & power button flex' }
  ];

  const insertCompat = db.prepare(`
    INSERT INTO spare_parts_compatibility (id, item_id, target_brand, target_model, notes)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const comp of compatibilities) {
    insertCompat.run(comp.id, comp.itemId, comp.brand, comp.model, comp.notes);
  }

  // 8. Tickets
  const now = new Date();
  const slaUrgent = new Date(now.getTime() + 45 * 60000).toISOString();
  const slaNormal = new Date(now.getTime() + 180 * 60000).toISOString();
  const slaOverdue = new Date(now.getTime() - 20 * 60000).toISOString();

  const tickets = [
    {
      id: 'tkt-1001',
      ticketNum: 1001,
      custId: 'cust-01',
      techId: 'usr-tech-1',
      brand: 'Apple',
      model: 'iPhone 14 Pro',
      imei: '354892100482910',
      pass: '1470',
      pattern: '',
      cond: 'Deep corner dent, back glass intact, water indicator white',
      checklist: JSON.stringify({ power: true, screen: false, touch: false, frontCam: true, backCam: true, faceId: true, charging: true, speaker: true }),
      defects: 'Cracked screen after drop, touch not responding, OLED flickering green',
      media: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
      status: 'IN_REPAIR',
      priority: 'URGENT',
      estCost: 4500.0,
      labor: 700.0,
      partsCost: 3200.0,
      commission: 245.0,
      sla: slaUrgent,
      tat: 35,
      otp: '8492'
    },
    {
      id: 'tkt-1002',
      ticketNum: 1002,
      custId: 'cust-02',
      techId: 'usr-tech-2',
      brand: 'Samsung',
      model: 'Galaxy S23 Ultra',
      imei: '359920194820192',
      pass: '258025',
      pattern: '',
      cond: 'Mint condition body, device completely dead, no charging current',
      checklist: JSON.stringify({ power: false, screen: false, touch: false, frontCam: true, backCam: true, faceId: false, charging: false, speaker: false }),
      defects: 'Dead device after car charger surge. Draws 0.04A on DC power supply, VDD_MAIN shorted',
      media: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=400',
      status: 'DIAGNOSING',
      priority: 'NORMAL',
      estCost: 2800.0,
      labor: 1800.0,
      partsCost: 350.0,
      commission: 580.0,
      sla: slaNormal,
      tat: 110,
      otp: '3190'
    },
    {
      id: 'tkt-1003',
      ticketNum: 1003,
      custId: 'cust-03',
      techId: 'usr-tech-1',
      brand: 'Xiaomi',
      model: 'Redmi Note 12 Pro',
      imei: '864910293847561',
      pass: '9988',
      pattern: 'L-shape',
      cond: 'Rear camera lens shattered, dust inside sensor',
      checklist: JSON.stringify({ power: true, screen: true, touch: true, frontCam: true, backCam: false, faceId: true, charging: true, speaker: true }),
      defects: 'Replace 50MP main rear camera module and clear glass lens',
      media: '',
      status: 'READY',
      priority: 'NORMAL',
      estCost: 950.0,
      labor: 350.0,
      partsCost: 450.0,
      commission: 122.5,
      sla: slaOverdue,
      tat: 40,
      otp: '7721'
    }
  ];

  const insertTicket = db.prepare(`
    INSERT INTO repair_tickets (
      id, ticket_number, store_id, customer_id, assigned_tech_id, device_brand, device_model,
      imei_sn, passcode, pattern_code, physical_condition, checklist_json, reported_defects,
      intake_media_url, status, priority, estimated_cost, labor_charge, parts_cost, tech_commission,
      sla_deadline, tat_minutes, release_otp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of tickets) {
    insertTicket.run(
      t.id, t.ticketNum, storeId, t.custId, t.techId, t.brand, t.model,
      t.imei, t.pass, t.pattern, t.cond, t.checklist, t.defects,
      t.media, t.status, t.priority, t.estCost, t.labor, t.partsCost, t.commission,
      t.sla, t.tat, t.otp
    );
  }

  // 9. Scrap Parts
  const scrapParts = [
    { id: 'scrp-01', model: 'iPhone 12 Pro Max', imei: '357281094820194', part: 'Original Rear Camera Module Triple-Lens', grade: 'TESTED_WORKING', val: 1200.0, label: 'SCRP-12PM-CAM-01' },
    { id: 'scrp-02', model: 'iPhone 11', imei: '352940192847561', part: 'OEM TrueDepth Dot Projector & Infrared Cam', grade: 'TESTED_WORKING', val: 450.0, label: 'SCRP-11-FACE-02' },
    { id: 'scrp-03', model: 'Samsung S21 FE', imei: '351940294817263', part: 'Haptic Vibration Linear Motor & Antenna Flex', grade: 'TESTED_WORKING', val: 180.0, label: 'SCRP-S21-VIB-03' }
  ];

  const insertScrap = db.prepare(`
    INSERT INTO scrap_warehouse (id, store_id, donor_device_model, donor_imei, part_name, condition_grade, estimated_value, barcode_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of scrapParts) {
    insertScrap.run(s.id, storeId, s.model, s.imei, s.part, s.grade, s.val, s.label);
  }

  // 10. Knowledge Base
  const kbEntries = [
    {
      id: 'kb-01',
      brand: 'Apple',
      model: 'iPhone 13 / 13 Pro',
      symptom: 'White / Green Screen of Death (WSOD) after iOS update or drop',
      schematic: 'Display Flex Circuit / VCI & VDD lines',
      diode: 'Pin 12 (VDD_DISP): 0.425V, Pin 14 (VCI): 0.380V (If open: 0.00V or OL)',
      steps: '1. Inspect under microscope for flex fracture at lower fold.\n2. Locate the clock/data test pad behind the display shield.\n3. Run a micro-jumper wire (0.02mm insulated) from the VCI supply pad to the clock line resistor.\n4. Apply UV curable green solder mask and cure for 60s.\n5. Test display before reassembling.',
      hint: 'Diagnostic Path: If screen is uniform white or bright green without cracks, this is a known internal panel trace disconnect. A micro-jumper bypasses the broken line without replacing the costly OEM display.'
    },
    {
      id: 'kb-02',
      brand: 'Apple',
      model: 'iPhone X / XS / 11 Pro',
      symptom: 'Voice Memo greyed out, speaker button inactive, slow boot (Audio IC / Interposer)',
      schematic: 'U3100 (Audio Codec) / Interposer Pads (BB_CLK / I2S_AP_TO_CODEC)',
      diode: 'I2S bus lines on audio connector should read ~0.490V.',
      steps: '1. Check if boot time is > 2 minutes (kernel waiting for audio hardware acknowledgment).\n2. Separate middle sandwich board using 185C heating platform.\n3. Check interposer pads for torn solder joints.\n4. Reball lower and upper motherboard or replace U3100 audio codec with low-temp 138C flux/paste.\n5. Resolder sandwich on jig and verify sound recording.',
      hint: 'Classic sandwich separation fault caused by frame drop torsions.'
    },
    {
      id: 'kb-03',
      brand: 'Samsung',
      model: 'Galaxy A54 5G',
      symptom: 'Fake charging icon / yellow exclamation triangle (Moisture detected false alarm)',
      schematic: 'Sub-PBA Flex Connector / Moisture Sensor Thermistor TH3001',
      diode: 'Sub-to-main FPC connector pin 8: 0.520V',
      steps: '1. Inspect Sub-PBA charging port for lint or micro-corrosion.\n2. Measure resistance across thermistor TH3001 (should be 100kΩ at 25°C).\n3. If corroded or reading <40kΩ, replace complete Sub-PBA board.\n4. Clean main FPC cable connector with isopropyl 99%.',
      hint: 'Samsung A-series widely fails due to Sub-PBA thermistor degradation.'
    }
  ];

  const insertKb = db.prepare(`
    INSERT INTO diagnostics_kb (id, device_brand, device_model, symptom, schematic_reference, diode_readings, diagnostic_steps, ai_prompt_hint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const kb of kbEntries) {
    insertKb.run(kb.id, kb.brand, kb.model, kb.symptom, kb.schematic, kb.diode, kb.steps, kb.hint);
  }

  // 11. Missing Demand Log
  const missingDemands = [
    { id: 'md-01', query: 'Samsung S24 Ultra Original S-Pen Black', phone: '+201099887766', count: 4, notes: 'Customers asked 4 times this week' },
    { id: 'md-02', query: 'iPhone 15 Matte Privacy Screen Protector Green Lion', phone: '+201122334455', count: 7, notes: 'Hot item, distributor out of stock' },
    { id: 'md-03', query: 'Xiaomi Pad 6 Stylus Pen 2nd Gen', phone: '+201288776655', count: 3, notes: 'Suggested to order 5 units' }
  ];

  const insertMd = db.prepare(`
    INSERT INTO missing_demand_log (id, store_id, item_name_or_query, customer_phone, request_count, suggested_po_status, notes)
    VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
  `);
  for (const md of missingDemands) {
    insertMd.run(md.id, storeId, md.query, md.phone, md.count, md.notes);
  }

  // 12. RMA Tickets
  const rmaTickets = [
    { id: 'rma-01', itemId: 'itm-sp-ip13-incell', vendor: 'Shenzhen Apex Wholesale', sticker: 1, solder: 0, reason: 'Vertical lines on touch digitizer right after first boot', status: 'PENDING', batch: 'BATCH-2026-AUG-B12' },
    { id: 'rma-02', itemId: 'itm-sp-a54-chg', vendor: 'Cairo Tech Spares Co.', sticker: 1, solder: 0, reason: 'Microphone on Sub-PBA produces buzzing audio', status: 'APPROVED', batch: 'BATCH-CAI-771' }
  ];

  const insertRma = db.prepare(`
    INSERT INTO rma_tickets (id, store_id, item_id, vendor_name, security_sticker_intact, soldering_trace_detected, defect_reason, status, vendor_batch_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rmaTickets) {
    insertRma.run(r.id, storeId, r.itemId, r.vendor, r.sticker, r.solder, r.reason, r.status, r.batch);
  }

  // 13. Wallets
  const wallets = [
    { id: 'wlt-vodafone', provider: 'VODAFONE_CASH', num: '01012345678', bal: 42500.0, dLimit: 60000.0, dUsage: 48000.0, mLimit: 200000.0, mUsage: 145000.0, locked: 0 },
    { id: 'wlt-instapay', provider: 'INSTAPAY', num: 'alpha.tech@instapay', bal: 118400.0, dLimit: 120000.0, dUsage: 116000.0, mLimit: 400000.0, mUsage: 310000.0, locked: 1 },
    { id: 'wlt-fawry', provider: 'FAWRY', num: 'POS-POS-98124', bal: 16800.0, dLimit: 100000.0, dUsage: 32000.0, mLimit: 500000.0, mUsage: 180000.0, locked: 0 },
    { id: 'wlt-orange', provider: 'ORANGE_CASH', num: '01234567890', bal: 24000.0, dLimit: 60000.0, dUsage: 12000.0, mLimit: 200000.0, mUsage: 65000.0, locked: 0 }
  ];

  const insertWallet = db.prepare(`
    INSERT INTO fintech_wallets (id, store_id, provider_name, account_number, current_balance, daily_limit, daily_usage, monthly_limit, monthly_usage, is_locked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const w of wallets) {
    insertWallet.run(w.id, storeId, w.provider, w.num, w.bal, w.dLimit, w.dUsage, w.mLimit, w.mUsage, w.locked);
  }

  // 14. Fintech Transactions
  const fintechTx = [
    { id: 'ftx-01', walletId: 'wlt-vodafone', provider: 'VODAFONE_CASH', type: 'CASH_OUT', amt: 2500.0, comm: 25.0, phone: '01099887766', txRef: 'TX-VF-981204819', natId: '29801011234567', user: 'usr-cashier' },
    { id: 'ftx-02', walletId: 'wlt-instapay', provider: 'INSTAPAY', type: 'CASH_IN', amt: 8000.0, comm: 50.0, phone: '01122334455', txRef: 'IP-20260909-00918', natId: null, user: 'usr-cashier' },
    { id: 'ftx-03', walletId: 'wlt-fawry', provider: 'FAWRY', type: 'CASH_OUT', amt: 1200.0, comm: 15.0, phone: '01288776655', txRef: 'FW-88491029', natId: '29505051928374', user: 'usr-cashier' }
  ];

  const insertFtx = db.prepare(`
    INSERT INTO fintech_transactions (id, store_id, wallet_id, wallet_provider, trans_type, amount, commission, sender_receiver_phone, reference_tx_id, national_id, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const tx of fintechTx) {
    insertFtx.run(tx.id, storeId, tx.walletId, tx.provider, tx.type, tx.amt, tx.comm, tx.phone, tx.txRef, tx.natId, tx.user);
  }

  // 15. WhatsApp Demo
  const waMsgs = [
    { id: 'wa-01', phone: '+201099887766', type: 'INTAKE_RECEIPT', content: 'Dear Mahmoud Hassan, your iPhone 14 Pro ticket #1001 has been logged. Priority: URGENT. Track here: https://track.erp/t/1001', status: 'SENT' },
    { id: 'wa-02', phone: '+201288776655', type: 'READY_FOR_PICKUP', content: 'Dear Youssef Kamal, your Redmi Note 12 Pro ticket #1003 is READY for collection. Total: 950 EGP. Secret Release OTP: 7721', status: 'SENT' }
  ];

  const insertWa = db.prepare(`
    INSERT INTO whatsapp_messages_log (id, store_id, customer_phone, message_type, content, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const m of waMsgs) {
    insertWa.run(m.id, storeId, m.phone, m.type, m.content, m.status);
  }

  console.log('[Database] Realistic seed data populated successfully!');
}

if (require.main === module) {
  seedDatabase();
}
