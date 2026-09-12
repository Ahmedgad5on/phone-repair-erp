import db from './database';
import { migrations } from './migrations/index';

function addColumnIfNotExists(table: string, column: string, columnDef: string) {
  try {
    // 1. Strict SQL injection prevention: Validate table and column identifiers
    if (!/^[a-zA-Z0-9_]+$/.test(table) || !/^[a-zA-Z0-9_]+$/.test(column)) {
      throw new Error(`Invalid table or column identifier: ${table}.${column}`);
    }

    // 2. Parameterized query using pragma_table_info table-valued function
    const columns = db.prepare('SELECT name FROM pragma_table_info(?)').all(table) as { name: string }[];
    if (columns.length > 0 && !columns.some(col => col.name === column)) {
      db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${columnDef}`);
      console.log(`[Database] Added column ${column} to ${table}`);
    }
  } catch (err) {
    console.error(`Failed to add column ${column} to ${table}:`, err);
  }
}

export function runMigrations() {
  console.log('[Database] Running modular ERP schema migrations...');

  db.pragma('foreign_keys = ON');

  db.exec(`
    -- Schema Migrations Tracking
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 1. Stores / Tenants & Modular Flags
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      enable_repair INTEGER DEFAULT 1,
      enable_retail INTEGER DEFAULT 1,
      enable_spare_parts INTEGER DEFAULT 1,
      enable_fintech INTEGER DEFAULT 1,
      enable_accounting INTEGER DEFAULT 1,
      enable_inventory INTEGER DEFAULT 1,
      enable_hr INTEGER DEFAULT 1,
      enable_appointments INTEGER DEFAULT 1,
      receipt_header TEXT DEFAULT 'Mobile Tech Solutions & Repair Lab',
      receipt_footer TEXT DEFAULT 'Thank you for your business! Warranty: 30 Days',
      google_maps_url TEXT DEFAULT 'https://maps.google.com/?q=mobiletech',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    -- 2. RBAC Users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      role TEXT NOT NULL, -- SuperAdmin, Manager, Cashier, Salesperson, Receptionist, MaintenanceEngineer
      is_active INTEGER DEFAULT 1,
      commission_rate REAL DEFAULT 0.0,
      two_factor_secret TEXT,
      two_factor_enabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    -- 3. Shift Management & Cascading Handover
    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      opened_by_user_id TEXT REFERENCES users(id),
      closed_by_user_id TEXT REFERENCES users(id),
      opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      opening_cash REAL NOT NULL DEFAULT 0.0,
      expected_cash REAL DEFAULT 0.0,
      actual_cash REAL,
      cash_difference REAL,
      device_inventory_count INTEGER DEFAULT 0,
      handover_notes TEXT,
      status TEXT DEFAULT 'OPEN',
      accepted_by_user_id TEXT REFERENCES users(id),
      accepted_at TEXT,
      deleted_at TEXT
    );

    -- 4. Customer CRM & Profile Ledger
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      tag TEXT DEFAULT 'REGULAR', -- VIP, REGULAR, HIGH_RETURN, PROBLEMATIC
      total_spent REAL DEFAULT 0.0,
      loyalty_points INTEGER DEFAULT 0,
      loyalty_tier TEXT DEFAULT 'BRONZE',
      notes TEXT,
      google_review_prompted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    -- 5. Items (Retail, Phones, Accessories, Spare Parts)
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      sku TEXT UNIQUE NOT NULL,
      barcode TEXT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      quality_grade TEXT,
      purchase_price REAL NOT NULL DEFAULT 0.0,
      wholesale_price REAL NOT NULL DEFAULT 0.0,
      retail_price REAL NOT NULL DEFAULT 0.0,
      bulk_price REAL NOT NULL DEFAULT 0.0,
      stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
      reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
      min_limit INTEGER NOT NULL DEFAULT 2,
      warranty_days INTEGER DEFAULT 0,
      days_idle INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      CHECK (stock_quantity >= reserved_quantity)
    );

    -- 6. Strict IMEI Inventory Tracker
    CREATE TABLE IF NOT EXISTS imei_records (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
      imei TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'IN_STOCK',
      battery_health INTEGER DEFAULT 100,
      color TEXT,
      storage TEXT,
      condition TEXT DEFAULT 'Brand New Sealed',
      purchase_date TEXT DEFAULT CURRENT_TIMESTAMP,
      sold_sale_id TEXT,
      sold_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    -- 7. Repair Lab Tickets
    CREATE TABLE IF NOT EXISTS repair_tickets (
      id TEXT PRIMARY KEY,
      ticket_number INTEGER UNIQUE NOT NULL,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      customer_id TEXT REFERENCES customers(id),
      assigned_tech_id TEXT REFERENCES users(id),
      device_brand TEXT NOT NULL,
      device_model TEXT NOT NULL,
      imei_sn TEXT,
      passcode TEXT,
      pattern_code TEXT,
      physical_condition TEXT,
      checklist_json TEXT,
      reported_defects TEXT NOT NULL,
      intake_media_url TEXT,
      status TEXT DEFAULT 'INTAKE',
      priority TEXT DEFAULT 'NORMAL',
      estimated_cost REAL DEFAULT 0.0,
      labor_charge REAL DEFAULT 0.0,
      parts_cost REAL DEFAULT 0.0,
      tech_commission REAL DEFAULT 0.0,
      sla_deadline TEXT,
      tat_minutes INTEGER DEFAULT 0,
      release_otp TEXT NOT NULL,
      otp_verified INTEGER DEFAULT 0,
      customer_signature TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      delivered_at TEXT,
      deleted_at TEXT
    );

    -- 8. Scrap Donor Inventory
    CREATE TABLE IF NOT EXISTS scrap_warehouse (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      donor_device_model TEXT NOT NULL,
      donor_imei TEXT,
      part_name TEXT NOT NULL,
      condition_grade TEXT DEFAULT 'TESTED_WORKING',
      estimated_value REAL DEFAULT 0.0,
      barcode_label TEXT UNIQUE,
      is_harvested INTEGER DEFAULT 0,
      target_ticket_id TEXT REFERENCES repair_tickets(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    -- 9. Knowledge Base
    CREATE TABLE IF NOT EXISTS hardware_knowledge_base (
      id TEXT PRIMARY KEY,
      device_brand TEXT NOT NULL,
      device_model TEXT NOT NULL,
      symptom TEXT NOT NULL,
      schematic_component TEXT,
      standby_dc_ma REAL,
      diode_mode_drop REAL,
      solution_steps TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. Sales Transactions
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      invoice_number INTEGER UNIQUE NOT NULL,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      customer_id TEXT REFERENCES customers(id),
      salesperson_user_id TEXT REFERENCES users(id),
      cashier_user_id TEXT REFERENCES users(id),
      shift_id TEXT REFERENCES shifts(id),
      total REAL NOT NULL,
      tax REAL DEFAULT 0.0,
      discount REAL DEFAULT 0.0,
      discount_type TEXT DEFAULT 'FIXED',
      discount_reason TEXT,
      loyalty_points_used INTEGER DEFAULT 0,
      loyalty_points_earned INTEGER DEFAULT 0,
      payment_method TEXT DEFAULT 'CASH',
      status TEXT DEFAULT 'COMPLETED',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    -- 11. Sale Items
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
      item_id TEXT REFERENCES items(id),
      imei_id TEXT REFERENCES imei_records(id),
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 12. Missing Demand Log
    CREATE TABLE IF NOT EXISTS missing_demand_log (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      requested_item_name TEXT NOT NULL,
      customer_phone TEXT,
      request_count INTEGER DEFAULT 1,
      is_po_created INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 13. Spare Parts Cross-Model Compatibility
    CREATE TABLE IF NOT EXISTS spare_parts_compatibility (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
      target_brand TEXT NOT NULL,
      target_model TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 14. RMA Claims & Defective Returns
    CREATE TABLE IF NOT EXISTS rma_tickets (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      item_id TEXT REFERENCES items(id),
      vendor_name TEXT NOT NULL,
      security_sticker_intact INTEGER DEFAULT 1,
      soldering_trace_detected INTEGER DEFAULT 0,
      defect_reason TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      vendor_batch_code TEXT,
      credit_amount REAL DEFAULT 0.0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 15. Purchase Orders
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      po_number INTEGER UNIQUE NOT NULL,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      supplier_name TEXT NOT NULL,
      supplier_phone TEXT,
      status TEXT DEFAULT 'ORDERED',
      total_amount REAL DEFAULT 0.0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      received_at TEXT,
      approved_by TEXT,
      approved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      po_id TEXT REFERENCES purchase_orders(id) ON DELETE CASCADE,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      estimated_unit_cost REAL NOT NULL DEFAULT 0.0,
      received_quantity INTEGER DEFAULT 0
    );

    -- 16. Fintech Wallets
    CREATE TABLE IF NOT EXISTS fintech_wallets (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      provider_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      current_balance REAL NOT NULL DEFAULT 0.0,
      daily_limit REAL NOT NULL DEFAULT 60000.0,
      monthly_limit REAL NOT NULL DEFAULT 200000.0,
      daily_usage REAL NOT NULL DEFAULT 0.0,
      monthly_usage REAL NOT NULL DEFAULT 0.0,
      is_locked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS fintech_transactions (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      wallet_id TEXT REFERENCES fintech_wallets(id) ON DELETE CASCADE,
      wallet_provider TEXT NOT NULL,
      trans_type TEXT NOT NULL,
      amount REAL NOT NULL,
      commission REAL DEFAULT 0.0,
      sender_receiver_phone TEXT,
      reference_tx_id TEXT,
      national_id TEXT,
      status TEXT DEFAULT 'VERIFIED',
      created_by_user_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 17. WhatsApp Logs
    CREATE TABLE IF NOT EXISTS whatsapp_messages_log (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      customer_phone TEXT NOT NULL,
      message_type TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'SENT',
      sent_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 18. Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_values TEXT,
      new_values TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 19. Used Device 12-Point Inspections
    CREATE TABLE IF NOT EXISTS used_device_inspections (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      imei TEXT NOT NULL,
      screen_grade TEXT,
      battery_health INTEGER DEFAULT 100,
      face_touch_id INTEGER DEFAULT 1,
      cameras_functional INTEGER DEFAULT 1,
      charging_port INTEGER DEFAULT 1,
      truetone_active INTEGER DEFAULT 1,
      mic_speaker INTEGER DEFAULT 1,
      body_condition TEXT,
      water_damage INTEGER DEFAULT 0,
      icloud_google_unlocked INTEGER DEFAULT 1,
      imei_blacklist_clean INTEGER DEFAULT 1,
      estimated_buy_price REAL DEFAULT 0.0,
      offered_price REAL DEFAULT 0.0,
      inspector_user_id TEXT REFERENCES users(id),
      customer_name TEXT,
      customer_phone TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 20. Warranty Certificates
    CREATE TABLE IF NOT EXISTS warranty_certificates (
      id TEXT PRIMARY KEY,
      cert_number TEXT UNIQUE NOT NULL,
      ticket_id TEXT REFERENCES repair_tickets(id),
      sale_id TEXT REFERENCES sales(id),
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      device_info TEXT NOT NULL,
      serial_or_imei TEXT,
      warranty_type TEXT NOT NULL,
      warranty_days INTEGER NOT NULL,
      terms TEXT,
      start_date TEXT DEFAULT CURRENT_TIMESTAMP,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'ACTIVE',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- =========================================================================
    -- NEW ENTERPRISE MODULES (1-8)
    -- =========================================================================

    -- 21. Accounting: Chart of Accounts & General Ledger
    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL, -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
      balance REAL DEFAULT 0.0,
      currency TEXT DEFAULT 'EGP',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      entry_number INTEGER UNIQUE NOT NULL,
      entry_date TEXT DEFAULT CURRENT_TIMESTAMP,
      description TEXT NOT NULL,
      reference_type TEXT, -- SALE, PURCHASE, REPAIR, FINTECH, MANUAL
      reference_id TEXT,
      status TEXT DEFAULT 'POSTED', -- DRAFT, POSTED
      created_by_user_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id TEXT PRIMARY KEY,
      entry_id TEXT REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id TEXT REFERENCES chart_of_accounts(id),
      debit REAL DEFAULT 0.0,
      credit REAL DEFAULT 0.0,
      memo TEXT
    );

    -- 22. Advanced Multi-Warehouse Inventory
    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      location TEXT,
      is_default INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_transfers (
      id TEXT PRIMARY KEY,
      transfer_number INTEGER UNIQUE NOT NULL,
      from_warehouse_id TEXT REFERENCES warehouses(id),
      to_warehouse_id TEXT REFERENCES warehouses(id),
      status TEXT DEFAULT 'COMPLETED', -- PENDING, IN_TRANSIT, COMPLETED, CANCELLED
      notes TEXT,
      created_by_user_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_transfer_items (
      id TEXT PRIMARY KEY,
      transfer_id TEXT REFERENCES stock_transfers(id) ON DELETE CASCADE,
      item_id TEXT REFERENCES items(id),
      quantity INTEGER NOT NULL,
      received_quantity INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stock_counts (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT REFERENCES warehouses(id),
      count_date TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'COMPLETED', -- IN_PROGRESS, COMPLETED
      notes TEXT,
      created_by_user_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 23. Procurement Management
    CREATE TABLE IF NOT EXISTS purchase_requisitions (
      id TEXT PRIMARY KEY,
      pr_number INTEGER UNIQUE NOT NULL,
      department TEXT DEFAULT 'Maintenance Lab',
      requested_by_user_id TEXT REFERENCES users(id),
      status TEXT DEFAULT 'APPROVED', -- PENDING, APPROVED, REJECTED, ORDERED
      total_estimated_cost REAL DEFAULT 0.0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS goods_received_notes (
      id TEXT PRIMARY KEY,
      grn_number INTEGER UNIQUE NOT NULL,
      po_id TEXT REFERENCES purchase_orders(id),
      received_by_user_id TEXT REFERENCES users(id),
      status TEXT DEFAULT 'ACCEPTED', -- RECEIVED, INSPECTED, ACCEPTED, REJECTED
      inspection_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier_price_comparisons (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES items(id),
      supplier_name TEXT NOT NULL,
      quote_price REAL NOT NULL,
      delivery_days INTEGER DEFAULT 1,
      validity_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 24. HR & Employee Management
    CREATE TABLE IF NOT EXISTS employee_attendance (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      attendance_date TEXT NOT NULL,
      check_in TEXT,
      check_out TEXT,
      status TEXT DEFAULT 'PRESENT', -- PRESENT, LATE, ABSENT, EXCUSED
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employee_leaves (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      leave_type TEXT NOT NULL, -- ANNUAL, SICK, UNPAID, EMERGENCY
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'APPROVED', -- PENDING, APPROVED, REJECTED
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payroll_records (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      payroll_month TEXT NOT NULL, -- YYYY-MM
      base_salary REAL NOT NULL DEFAULT 0.0,
      commission_earned REAL DEFAULT 0.0,
      bonuses REAL DEFAULT 0.0,
      deductions REAL DEFAULT 0.0,
      net_salary REAL NOT NULL DEFAULT 0.0,
      status TEXT DEFAULT 'PAID', -- DRAFT, PAID
      paid_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 25. Project & Engineering Task Management
    CREATE TABLE IF NOT EXISTS repair_projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      customer_id TEXT REFERENCES customers(id),
      device_info TEXT,
      status TEXT DEFAULT 'IN_PROGRESS', -- PLANNING, IN_PROGRESS, COMPLETED, ON_HOLD
      start_date TEXT DEFAULT CURRENT_TIMESTAMP,
      target_date TEXT,
      budget REAL DEFAULT 0.0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES repair_projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      assigned_to_user_id TEXT REFERENCES users(id),
      status TEXT DEFAULT 'IN_PROGRESS', -- TODO, IN_PROGRESS, REVIEW, DONE
      priority TEXT DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, URGENT
      estimated_hours REAL DEFAULT 1.0,
      actual_hours REAL DEFAULT 0.0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS engineer_time_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES project_tasks(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id),
      hours REAL NOT NULL,
      log_date TEXT DEFAULT CURRENT_TIMESTAMP,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 26. Customer Loyalty Program
    CREATE TABLE IF NOT EXISTS loyalty_tiers (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      min_points INTEGER NOT NULL DEFAULT 0,
      multiplier REAL DEFAULT 1.0,
      discount_percentage REAL DEFAULT 0.0,
      perk_description TEXT
    );

    CREATE TABLE IF NOT EXISTS loyalty_rewards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      points_required INTEGER NOT NULL,
      reward_value REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS loyalty_redemptions (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES customers(id),
      reward_id TEXT REFERENCES loyalty_rewards(id),
      points_spent INTEGER NOT NULL,
      redeemed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 27. Appointment Booking System
    CREATE TABLE IF NOT EXISTS service_appointments (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      device_brand TEXT NOT NULL,
      device_model TEXT NOT NULL,
      issue_description TEXT,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      status TEXT DEFAULT 'CONFIRMED', -- CONFIRMED, COMPLETED, CANCELLED, NO_SHOW
      assigned_tech_id TEXT REFERENCES users(id),
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 28. Security: 2FA & Session Management & API Keys
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      is_revoked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'Integration',
      is_active INTEGER DEFAULT 1,
      last_used_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 35 New Proposals Tables
  db.exec(`
    -- 1. AI Demand Forecasts
    CREATE TABLE IF NOT EXISTS ai_demand_forecasts (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
      predicted_monthly_demand REAL NOT NULL,
      suggested_reorder_point REAL NOT NULL,
      confidence_score REAL DEFAULT 0.85,
      seasonality_factor REAL DEFAULT 1.0,
      generated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. AI Diagnostics Knowledge Base
    CREATE TABLE IF NOT EXISTS ai_diagnostic_kb (
      id TEXT PRIMARY KEY,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      symptom TEXT NOT NULL,
      fault_category TEXT NOT NULL,
      solution_steps TEXT NOT NULL,
      diode_readings TEXT,
      schematic_ref TEXT,
      video_guide_url TEXT,
      source TEXT DEFAULT 'GSMArena/iFixit',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. AI Financial Fraud Detection & Anomaly Alerts
    CREATE TABLE IF NOT EXISTS fraud_alerts (
      id TEXT PRIMARY KEY,
      transaction_type TEXT NOT NULL,
      reference_id TEXT,
      risk_score REAL NOT NULL,
      trigger_rule TEXT NOT NULL,
      details TEXT,
      status TEXT DEFAULT 'PENDING',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Customer Sentiment Analysis
    CREATE TABLE IF NOT EXISTS customer_sentiments (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      feedback_text TEXT NOT NULL,
      sentiment TEXT NOT NULL,
      sentiment_score REAL NOT NULL,
      action_taken TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. Payment Gateway Transactions
    CREATE TABLE IF NOT EXISTS payment_gateway_txs (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      gateway TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'EGP',
      gateway_ref_id TEXT,
      status TEXT DEFAULT 'PENDING',
      raw_payload TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. SMS Gateway Notification Logs
    CREATE TABLE IF NOT EXISTS sms_logs (
      id TEXT PRIMARY KEY,
      phone_number TEXT NOT NULL,
      message TEXT NOT NULL,
      provider TEXT DEFAULT 'LOCAL_GATEWAY',
      delivery_status TEXT DEFAULT 'DELIVERED',
      cost REAL DEFAULT 0.05,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. External Calendar Sync (Google & Outlook)
    CREATE TABLE IF NOT EXISTS external_calendar_sync (
      id TEXT PRIMARY KEY,
      appointment_id TEXT REFERENCES service_appointments(id) ON DELETE CASCADE,
      external_platform TEXT NOT NULL,
      external_event_id TEXT NOT NULL,
      sync_status TEXT DEFAULT 'SYNCED',
      last_synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 8. E-Commerce Platform Sync
    CREATE TABLE IF NOT EXISTS ecommerce_sync_logs (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      direction TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      status TEXT DEFAULT 'SUCCESS',
      payload TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 9. Egyptian Tax Authority (ETA) Electronic Invoices
    CREATE TABLE IF NOT EXISTS e_invoices (
      id TEXT PRIMARY KEY,
      sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
      uuid TEXT UNIQUE NOT NULL,
      submission_id TEXT,
      document_type TEXT DEFAULT 'INV',
      tax_amount REAL NOT NULL,
      total_amount REAL NOT NULL,
      qr_code_hash TEXT,
      eta_status TEXT DEFAULT 'Valid',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. Shipping & Courier Integration
    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      carrier TEXT NOT NULL,
      tracking_number TEXT UNIQUE NOT NULL,
      ticket_id TEXT REFERENCES repair_tickets(id),
      sale_id TEXT REFERENCES sales(id),
      customer_name TEXT NOT NULL,
      destination_address TEXT NOT NULL,
      status TEXT DEFAULT 'CREATED',
      estimated_delivery TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 11. Annual Maintenance Contracts (AMC)
    CREATE TABLE IF NOT EXISTS amc_contracts (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
      contract_title TEXT NOT NULL,
      contract_number TEXT UNIQUE NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      devices_count INTEGER DEFAULT 1,
      periodic_visits INTEGER DEFAULT 4,
      contract_value REAL NOT NULL,
      billing_cycle TEXT DEFAULT 'ANNUAL',
      status TEXT DEFAULT 'ACTIVE',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 12. Remote Self-Service Customer Booking Portal
    CREATE TABLE IF NOT EXISTS remote_bookings (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      device_model TEXT NOT NULL,
      issue_description TEXT NOT NULL,
      preferred_date TEXT NOT NULL,
      preferred_time TEXT NOT NULL,
      assigned_tech_id TEXT REFERENCES users(id),
      booking_status TEXT DEFAULT 'CONFIRMED',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 13. Outsourced Specialized Lab Repairs
    CREATE TABLE IF NOT EXISTS outsource_repairs (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES repair_tickets(id) ON DELETE CASCADE,
      external_workshop_name TEXT NOT NULL,
      contact_phone TEXT,
      tracking_reference TEXT,
      sent_date TEXT DEFAULT CURRENT_TIMESTAMP,
      expected_return_date TEXT,
      workshop_cost REAL DEFAULT 0,
      customer_charge REAL DEFAULT 0,
      status TEXT DEFAULT 'SENT',
      technician_notes TEXT
    );

    -- 14. Device Condition Photo Evidence
    CREATE TABLE IF NOT EXISTS device_photos (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES repair_tickets(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      photo_url TEXT NOT NULL,
      caption TEXT,
      taken_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 15. Automatic Reordering Rules
    CREATE TABLE IF NOT EXISTS auto_reorder_rules (
      id TEXT PRIMARY KEY,
      item_id TEXT UNIQUE REFERENCES items(id) ON DELETE CASCADE,
      min_threshold INTEGER NOT NULL,
      reorder_quantity INTEGER NOT NULL,
      supplier_name TEXT,
      auto_generate_po INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      last_triggered_at TEXT
    );

    -- 16. Barcode & Thermal Label Catalog
    CREATE TABLE IF NOT EXISTS barcodes (
      id TEXT PRIMARY KEY,
      barcode_number TEXT UNIQUE NOT NULL,
      barcode_type TEXT DEFAULT 'CODE128',
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      print_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 17. Multi-Unit Item Packaging Conversions
    CREATE TABLE IF NOT EXISTS item_units (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
      unit_name TEXT NOT NULL,
      conversion_factor REAL NOT NULL,
      retail_price REAL,
      wholesale_price REAL,
      barcode TEXT
    );

    -- 18. Product Complete Lifecycle & Warranty Provenance
    CREATE TABLE IF NOT EXISTS product_lifecycles (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
      serial_or_imei TEXT,
      lifecycle_event TEXT NOT NULL,
      event_description TEXT,
      actor_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 19. Advanced Loyalty Rules v2
    CREATE TABLE IF NOT EXISTS loyalty_rules (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      points_ratio REAL DEFAULT 0.01,
      min_spend REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1
    );

    -- 20. Email Marketing Campaigns
    CREATE TABLE IF NOT EXISTS email_campaigns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      content_html TEXT NOT NULL,
      target_segment TEXT DEFAULT 'ALL',
      sent_count INTEGER DEFAULT 0,
      open_rate REAL DEFAULT 0,
      status TEXT DEFAULT 'DRAFT',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 21. Automated Appointment & Maintenance Reminders
    CREATE TABLE IF NOT EXISTS appointment_reminders (
      id TEXT PRIMARY KEY,
      appointment_id TEXT REFERENCES service_appointments(id) ON DELETE CASCADE,
      channel TEXT DEFAULT 'WHATSAPP',
      scheduled_time TEXT NOT NULL,
      sent_at TEXT,
      status TEXT DEFAULT 'PENDING'
    );

    -- 22. Customer Technician Reviews & Quality Ratings
    CREATE TABLE IF NOT EXISTS technician_reviews (
      id TEXT PRIMARY KEY,
      ticket_id TEXT UNIQUE REFERENCES repair_tickets(id) ON DELETE CASCADE,
      technician_id TEXT REFERENCES users(id),
      customer_id TEXT REFERENCES customers(id),
      rating INTEGER CHECK (rating BETWEEN 1 AND 5),
      review_text TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 23. Granular RBAC Permissions Matrix
    CREATE TABLE IF NOT EXISTS permissions_matrix (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      resource TEXT NOT NULL,
      action TEXT NOT NULL,
      is_allowed INTEGER DEFAULT 1,
      UNIQUE(role, resource, action)
    );

    -- 24. Multi-Level Approval Workflows
    CREATE TABLE IF NOT EXISTS approval_workflows (
      id TEXT PRIMARY KEY,
      workflow_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      required_role TEXT NOT NULL,
      requested_by TEXT REFERENCES users(id),
      approved_by TEXT REFERENCES users(id),
      amount REAL,
      status TEXT DEFAULT 'PENDING',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 25. Departmental Budget Allocations
    CREATE TABLE IF NOT EXISTS department_budgets (
      id TEXT PRIMARY KEY,
      department_name TEXT NOT NULL,
      period_month TEXT NOT NULL,
      budget_allocated REAL NOT NULL,
      budget_spent REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(department_name, period_month)
    );

    -- 26. Custom Query & Report Builder Templates
    CREATE TABLE IF NOT EXISTS custom_reports (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      query_json TEXT NOT NULL,
      created_by TEXT REFERENCES users(id),
      is_favorite INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 27. Enhanced Digital KYC Identity Verification
    CREATE TABLE IF NOT EXISTS kyc_documents (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      id_number TEXT NOT NULL,
      photo_front TEXT,
      photo_back TEXT,
      verification_status TEXT DEFAULT 'VERIFIED',
      verified_by TEXT REFERENCES users(id),
      verified_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 28. Cryptographic Tamper-Evident Immutable Audit Log
    CREATE TABLE IF NOT EXISTS audit_trail_immutable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prev_hash TEXT NOT NULL,
      current_hash TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT,
      actor_ip TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      delta_payload TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Dynamically add columns to existing tables
  addColumnIfNotExists('stores', 'deleted_at', 'TEXT');
  addColumnIfNotExists('stores', 'enable_accounting', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('stores', 'enable_inventory', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('stores', 'enable_hr', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('stores', 'enable_appointments', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('stores', 'enable_ai', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('stores', 'enable_amc', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('stores', 'enable_ecommerce_sync', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('stores', 'enable_einvoice', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('users', 'password', "TEXT NOT NULL DEFAULT ''");
  addColumnIfNotExists('users', 'deleted_at', 'TEXT');
  addColumnIfNotExists('users', 'two_factor_secret', 'TEXT');
  addColumnIfNotExists('users', 'two_factor_enabled', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('users', 'must_change_password', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('users', 'permissions', "TEXT DEFAULT '[]'");
  addColumnIfNotExists('shifts', 'deleted_at', 'TEXT');
  addColumnIfNotExists('customers', 'loyalty_points', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('customers', 'loyalty_tier', "TEXT DEFAULT 'BRONZE'");
  addColumnIfNotExists('customers', 'deleted_at', 'TEXT');
  addColumnIfNotExists('items', 'deleted_at', 'TEXT');
  addColumnIfNotExists('items', 'warehouse_id', 'TEXT');
  addColumnIfNotExists('items', 'reorder_level', 'INTEGER DEFAULT 5');
  addColumnIfNotExists('items', 'reorder_qty', 'INTEGER DEFAULT 20');
  addColumnIfNotExists('items', 'unit_type', "TEXT DEFAULT 'PIECE'");
  addColumnIfNotExists('imei_records', 'deleted_at', 'TEXT');
  addColumnIfNotExists('repair_tickets', 'deleted_at', 'TEXT');
  addColumnIfNotExists('scrap_warehouse', 'deleted_at', 'TEXT');
  addColumnIfNotExists('sales', 'shift_id', 'TEXT');
  addColumnIfNotExists('sales', 'discount_type', "TEXT DEFAULT 'FIXED'");
  addColumnIfNotExists('sales', 'discount_reason', 'TEXT');
  addColumnIfNotExists('sales', 'loyalty_points_used', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('sales', 'loyalty_points_earned', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('sales', 'deleted_at', 'TEXT');
  addColumnIfNotExists('fintech_wallets', 'deleted_at', 'TEXT');

  // Performance Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON repair_tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_store ON repair_tickets(store_id);
    CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
    CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
    CREATE INDEX IF NOT EXISTS idx_imei_imei ON imei_records(imei);
    CREATE INDEX IF NOT EXISTS idx_imei_status ON imei_records(status);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_fintech_wallet ON fintech_transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_journal_ref ON journal_entries(reference_type, reference_id);
    CREATE INDEX IF NOT EXISTS idx_journal_lines_acc ON journal_entry_lines(account_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON service_appointments(appointment_date);
    CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON employee_attendance(user_id, attendance_date);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON shipments(tracking_number);
    CREATE INDEX IF NOT EXISTS idx_amc_customer ON amc_contracts(customer_id);
    CREATE INDEX IF NOT EXISTS idx_photos_ticket ON device_photos(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_fraud_risk ON fraud_alerts(risk_score);
    CREATE INDEX IF NOT EXISTS idx_immutable_audit_hash ON audit_trail_immutable(current_hash);
  `);

  // Seed default Chart of Accounts if empty
  const accountCount = db.prepare('SELECT COUNT(*) as cnt FROM chart_of_accounts').get() as { cnt: number };
  if (accountCount.cnt === 0) {
    const defaultAccounts = [
      { id: 'acc-1010', code: '1010', name: 'نقدية الصندوق والدرج (Cash on Hand)', type: 'ASSET', balance: 15000.0 },
      { id: 'acc-1020', code: '1020', name: 'المحافظ الإلكترونية (E-Wallets & Fintech)', type: 'ASSET', balance: 45000.0 },
      { id: 'acc-1030', code: '1030', name: 'مخزون الهواتف والإكسسوارات (Retail Inventory)', type: 'ASSET', balance: 120000.0 },
      { id: 'acc-1040', code: '1040', name: 'مخزون قطع الغيار والشاشات (Spare Parts Inventory)', type: 'ASSET', balance: 65000.0 },
      { id: 'acc-2010', code: '2010', name: 'حسابات الموردين والدائنين (Accounts Payable)', type: 'LIABILITY', balance: 25000.0 },
      { id: 'acc-3010', code: '3010', name: 'رأس المال المالي (Owner Equity)', type: 'EQUITY', balance: 200000.0 },
      { id: 'acc-4010', code: '4010', name: 'إيرادات مبيعات الهواتف (Phone Sales Revenue)', type: 'REVENUE', balance: 0.0 },
      { id: 'acc-4020', code: '4020', name: 'إيرادات خدمات معمل الصيانة (Repair Services Revenue)', type: 'REVENUE', balance: 0.0 },
      { id: 'acc-4030', code: '4030', name: 'عمولات تحويل الكاش (Fintech Commission Income)', type: 'REVENUE', balance: 0.0 },
      { id: 'acc-5010', code: '5010', name: 'تكلفة البضاعة المباعة (Cost of Goods Sold)', type: 'EXPENSE', balance: 0.0 },
      { id: 'acc-5020', code: '5020', name: 'عمولات ومصنعيات الفنيين (Technician Commissions Expense)', type: 'EXPENSE', balance: 0.0 },
      { id: 'acc-5030', code: '5030', name: 'مصاريف تشغيل وإيجار ومرافق (Operating Expenses)', type: 'EXPENSE', balance: 0.0 }
    ];

    const insertAcc = db.prepare(`
      INSERT INTO chart_of_accounts (id, code, name, account_type, balance)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const a of defaultAccounts) {
      insertAcc.run(a.id, a.code, a.name, a.type, a.balance);
    }
    console.log('[Database] Default Chart of Accounts initialized successfully.');
  }

  // Seed default warehouse if empty
  const warehouseCount = db.prepare('SELECT COUNT(*) as cnt FROM warehouses').get() as { cnt: number };
  if (warehouseCount.cnt === 0) {
    db.prepare(`
      INSERT INTO warehouses (id, name, code, location, is_default, is_active)
      VALUES ('wh-main', 'المستودع الرئيسي (Main Store & Lab)', 'WH-MAIN', 'فرع المهندسين الرئيسي', 1, 1),
             ('wh-wholesale', 'مستودع توزيع قطع الغيار (Wholesale Depot)', 'WH-PARTS', 'مخزن العتبة', 0, 1)
    `).run();
  }

  // Seed default loyalty tiers if empty
  const tierCount = db.prepare('SELECT COUNT(*) as cnt FROM loyalty_tiers').get() as { cnt: number };
  if (tierCount.cnt === 0) {
    db.prepare(`
      INSERT INTO loyalty_tiers (id, name, min_points, multiplier, discount_percentage, perk_description)
      VALUES ('tier-bronze', 'برونزي (Bronze)', 0, 1.0, 0.0, 'نقطة واحدة لكل 100 ج.م'),
             ('tier-silver', 'فضي (Silver)', 500, 1.25, 2.0, 'خصم 2% ونقاط إضافية 25%'),
             ('tier-gold', 'ذهبي (Gold)', 1500, 1.5, 5.0, 'خصم 5% ونقاط إضافية 50% + أولوية الصيانة VIP')
    `).run();
  }

  // Seed AI Diagnostic KB if empty
  const diagCount = db.prepare('SELECT COUNT(*) as cnt FROM ai_diagnostic_kb').get() as { cnt: number };
  if (diagCount.cnt === 0) {
    db.prepare(`
      INSERT INTO ai_diagnostic_kb (id, brand, model, symptom, fault_category, solution_steps, diode_readings, schematic_ref, video_guide_url)
      VALUES 
      ('diag-1', 'Apple', 'iPhone 15 Pro', 'No Power / 0.00A Current Draw', 'POWER_IC', '1. Check VDD_MAIN line for short to ground. 2. Verify PP_BATT_VCC 3.8V. 3. Reball or replace U1000 PMIC.', 'PP_VDD_MAIN: 0.385V, PP_GPU: 0.012V', 'Schematic Sheet 14 - PMIC BUCK1', 'https://youtu.be/repair-ip15p-nopower'),
      ('diag-2', 'Samsung', 'Galaxy S24 Ultra', 'No Display & Touch Unresponsive', 'OLED_CONNECTOR', '1. Inspect FPC pin 14 (MIPI_DSI). 2. Verify 1.8V IO and 3.3V AVDD. 3. Replace display flex or rework display connector.', 'Pin 14: 0.450V, Pin 16: 0.445V', 'Schematic Sheet 8 - DISPLAY_FPC', 'https://youtu.be/s24u-screen-fix'),
      ('diag-3', 'Xiaomi', 'Redmi Note 13', 'False Charging / Slow 0.4A Current', 'USB_SUB_BOARD', '1. Measure VBUS 5.0V at sub-board flex. 2. Replace charging port FPC. 3. Check OVP IC U301.', 'VBUS: 5.1V, CC1: 1.2V', 'Schematic Sheet 3 - SUB_CHARGER', 'https://youtu.be/redmi13-charging-fix')
    `).run();
  }

  // Seed default Permissions Matrix if empty
  const permCount = db.prepare('SELECT COUNT(*) as cnt FROM permissions_matrix').get() as { cnt: number };
  if (permCount.cnt === 0) {
    const roles = ['SuperAdmin', 'Manager', 'Cashier', 'Salesperson', 'Receptionist', 'MaintenanceEngineer'];
    const resources = ['pos', 'repair', 'inventory', 'accounting', 'fintech', 'hr', 'ai', 'integrations'];
    const insertPerm = db.prepare('INSERT OR IGNORE INTO permissions_matrix (id, role, resource, action, is_allowed) VALUES (?, ?, ?, ?, ?)');
    
    for (const r of roles) {
      for (const res of resources) {
        const isAllowed = r === 'SuperAdmin' || r === 'Manager' || 
          (r === 'Cashier' && ['pos', 'fintech'].includes(res)) ||
          (r === 'MaintenanceEngineer' && ['repair', 'ai'].includes(res)) ||
          (r === 'Salesperson' && ['pos', 'inventory'].includes(res)) ||
          (r === 'Receptionist' && ['repair', 'appointments'].includes(res));
        insertPerm.run(`perm-${r}-${res}`, r, res, 'access', isAllowed ? 1 : 0);
      }
    }
  }

  // Seed default Department Budgets if empty
  const budgetCount = db.prepare('SELECT COUNT(*) as cnt FROM department_budgets').get() as { cnt: number };
  if (budgetCount.cnt === 0) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    db.prepare(`
      INSERT INTO department_budgets (id, department_name, period_month, budget_allocated, budget_spent)
      VALUES 
      ('budg-1', 'LAB', ?, 35000.0, 12450.0),
      ('budg-2', 'RETAIL', ?, 80000.0, 41200.0),
      ('budg-3', 'SPARES', ?, 120000.0, 78000.0),
      ('budg-4', 'MARKETING', ?, 15000.0, 5000.0),
      ('budg-5', 'ADMIN', ?, 20000.0, 8900.0)
    `).run(currentMonth, currentMonth, currentMonth, currentMonth, currentMonth);
  }

  // ==========================================
  // BATCH 3: ENTERPRISE 70 PROPOSALS TABLES
  // ==========================================
  db.exec(`
    -- 1. Repair Surveys & Customer Responses (NPS & CSAT)
    CREATE TABLE IF NOT EXISTS repair_surveys (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      ticket_id TEXT NOT NULL REFERENCES repair_tickets(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      channel TEXT NOT NULL DEFAULT 'WHATSAPP',
      token TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'PENDING',
      service_type TEXT DEFAULT 'REPAIR',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS repair_survey_responses (
      id TEXT PRIMARY KEY,
      survey_id TEXT NOT NULL REFERENCES repair_surveys(id) ON DELETE CASCADE,
      csat_score INTEGER DEFAULT 5,
      nps_score INTEGER DEFAULT 10,
      feedback_category TEXT DEFAULT 'QUALITY',
      comment TEXT,
      routed_to_google INTEGER DEFAULT 0,
      is_escalated INTEGER DEFAULT 0,
      escalation_status TEXT DEFAULT 'NONE',
      resolution_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Insurance Carriers & Claims Integration
    CREATE TABLE IF NOT EXISTS insurance_carriers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_email TEXT,
      contact_phone TEXT,
      labor_rate_per_hour REAL DEFAULT 150.0,
      requires_preauth INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS insurance_claims (
      id TEXT PRIMARY KEY,
      ticket_id TEXT UNIQUE NOT NULL REFERENCES repair_tickets(id) ON DELETE CASCADE,
      carrier_id TEXT NOT NULL REFERENCES insurance_carriers(id),
      claim_number TEXT NOT NULL,
      policy_number TEXT NOT NULL,
      deductible_amount REAL NOT NULL DEFAULT 0.0,
      deductible_paid INTEGER DEFAULT 0,
      carrier_estimate_amount REAL NOT NULL DEFAULT 0.0,
      carrier_approved_amount REAL DEFAULT 0.0,
      claim_status TEXT DEFAULT 'SUBMITTED',
      denial_reason TEXT,
      telemetry_photos JSON,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Marketing Automations & Scheduled Triggers
    CREATE TABLE IF NOT EXISTS marketing_automations (
      id TEXT PRIMARY KEY,
      rule_name TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'WHATSAPP',
      message_template TEXT NOT NULL,
      discount_coupon TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS marketing_queue (
      id TEXT PRIMARY KEY,
      automation_id TEXT REFERENCES marketing_automations(id) ON DELETE CASCADE,
      customer_id TEXT REFERENCES customers(id),
      channel TEXT NOT NULL,
      target_phone TEXT NOT NULL,
      message_body TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      scheduled_for TEXT,
      sent_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. E-Commerce Online Web Storefront
    CREATE TABLE IF NOT EXISTS ecommerce_catalog (
      id TEXT PRIMARY KEY,
      item_id TEXT UNIQUE REFERENCES items(id) ON DELETE CASCADE,
      is_published INTEGER DEFAULT 1,
      featured INTEGER DEFAULT 0,
      online_title TEXT NOT NULL,
      online_description TEXT,
      online_price REAL NOT NULL,
      image_urls TEXT,
      slug TEXT UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ecommerce_cart_orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      shipping_address TEXT NOT NULL,
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      shipping_fee REAL DEFAULT 50.0,
      total_amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'FAWRY',
      payment_status TEXT DEFAULT 'PENDING',
      fulfillment_status TEXT DEFAULT 'NEW',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. Multi-Branch Operations & Inter-Branch Transfers
    CREATE TABLE IF NOT EXISTS branch_transfers (
      id TEXT PRIMARY KEY,
      transfer_number TEXT UNIQUE NOT NULL,
      from_warehouse_id TEXT NOT NULL,
      to_warehouse_id TEXT NOT NULL,
      item_id TEXT NOT NULL REFERENCES items(id),
      quantity INTEGER NOT NULL,
      shipping_cost REAL DEFAULT 0.0,
      status TEXT DEFAULT 'PENDING',
      initiated_by TEXT,
      received_by TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      received_at TEXT
    );

    -- 6. Digital Contracts & E-Signatures (Custody & Wholesale)
    CREATE TABLE IF NOT EXISTS custody_contracts (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES repair_tickets(id) ON DELETE CASCADE,
      contract_type TEXT NOT NULL DEFAULT 'INTAKE_CUSTODY',
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      device_model TEXT NOT NULL,
      imei_sn TEXT,
      terms_body TEXT NOT NULL,
      signature_png TEXT NOT NULL,
      cryptographic_hash TEXT NOT NULL,
      signed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      signer_ip TEXT DEFAULT '127.0.0.1',
      status TEXT DEFAULT 'VALID'
    );

    -- 7. Digital Queue Management
    CREATE TABLE IF NOT EXISTS digital_queue (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      queue_number INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      service_type TEXT NOT NULL DEFAULT 'REPAIR',
      status TEXT DEFAULT 'WAITING',
      assigned_counter TEXT DEFAULT 'Counter 1',
      estimated_wait_minutes INTEGER DEFAULT 15,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      called_at TEXT,
      completed_at TEXT
    );

    -- 8. Refurbished Devices 12-Point Pipeline
    CREATE TABLE IF NOT EXISTS refurb_devices (
      id TEXT PRIMARY KEY,
      imei TEXT UNIQUE NOT NULL,
      serial_number TEXT,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      storage_gb INTEGER DEFAULT 128,
      color TEXT DEFAULT 'Black',
      buyback_price REAL NOT NULL,
      parts_cost REAL DEFAULT 0.0,
      labor_cost REAL DEFAULT 0.0,
      target_retail_price REAL NOT NULL,
      grade TEXT DEFAULT 'GRADE_B',
      pipeline_stage TEXT DEFAULT 'INTAKE',
      certificate_number TEXT UNIQUE,
      warranty_days INTEGER DEFAULT 90,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS refurb_inspections (
      id TEXT PRIMARY KEY,
      refurb_id TEXT NOT NULL REFERENCES refurb_devices(id) ON DELETE CASCADE,
      inspector_id TEXT,
      display_touch INTEGER DEFAULT 1,
      truetone_sensors INTEGER DEFAULT 1,
      biometrics INTEGER DEFAULT 1,
      battery_health_pct INTEGER DEFAULT 95,
      cameras INTEGER DEFAULT 1,
      microphones INTEGER DEFAULT 1,
      speakers INTEGER DEFAULT 1,
      connectivity INTEGER DEFAULT 1,
      buttons_haptics INTEGER DEFAULT 1,
      charging_thermals INTEGER DEFAULT 1,
      housing_cosmetic_score INTEGER DEFAULT 8,
      find_my_cleared INTEGER DEFAULT 1,
      computed_grade TEXT NOT NULL,
      notes TEXT,
      inspected_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 9. Assembly & Kitting (Repair Bundles)
    CREATE TABLE IF NOT EXISTS repair_bundles (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      target_device_model TEXT,
      bundle_price REAL NOT NULL,
      discount_percentage REAL DEFAULT 15.0,
      barcode TEXT UNIQUE,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS repair_bundle_items (
      id TEXT PRIMARY KEY,
      bundle_id TEXT NOT NULL REFERENCES repair_bundles(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES items(id),
      quantity INTEGER DEFAULT 1,
      unit_cost REAL NOT NULL
    );

    -- 10. Business Rules Engine (IF-THEN)
    CREATE TABLE IF NOT EXISTS business_rules (
      id TEXT PRIMARY KEY,
      rule_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      condition_expression TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_payload TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      execution_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 11. Stolen Device Registry (GSMA IMEI Blacklist)
    CREATE TABLE IF NOT EXISTS stolen_device_registry (
      id TEXT PRIMARY KEY,
      imei TEXT UNIQUE NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      incident_number TEXT,
      reported_by TEXT NOT NULL,
      is_blacklisted INTEGER DEFAULT 1,
      report_date TEXT DEFAULT CURRENT_TIMESTAMP,
      notes TEXT
    );

    -- 12. Smart Pricing Rules & Estimates
    CREATE TABLE IF NOT EXISTS smart_pricing_rules (
      id TEXT PRIMARY KEY,
      device_brand TEXT NOT NULL,
      device_model TEXT NOT NULL,
      fault_category TEXT NOT NULL,
      base_labor_fee REAL NOT NULL,
      difficulty_multiplier REAL DEFAULT 1.0,
      suggested_markup_pct REAL DEFAULT 35.0,
      notes TEXT
    );

    -- 13. Historical Price Adjustments Audit
    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      old_price REAL NOT NULL,
      new_price REAL NOT NULL,
      changed_by TEXT,
      reason TEXT,
      changed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 14. Customer Loyalty Wallet Passes (Apple / Google Wallet)
    CREATE TABLE IF NOT EXISTS customer_loyalty_passes (
      id TEXT PRIMARY KEY,
      customer_id TEXT UNIQUE NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      pass_type TEXT DEFAULT 'APPLE_GOOGLE_WALLET',
      serial_number TEXT UNIQUE NOT NULL,
      auth_token TEXT NOT NULL,
      qr_payload TEXT NOT NULL,
      tier_name TEXT DEFAULT 'BRONZE',
      points_balance INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      last_synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Column additions for Batch 3
  addColumnIfNotExists('repair_tickets', 'branch_id', "TEXT DEFAULT 'WH-MAIN'");
  addColumnIfNotExists('repair_tickets', 'insurance_claim_id', 'TEXT');
  addColumnIfNotExists('repair_tickets', 'warranty_cert_code', 'TEXT');
  addColumnIfNotExists('customers', 'ltv_score', 'REAL DEFAULT 0.0');
  addColumnIfNotExists('customers', 'churn_risk', "TEXT DEFAULT 'LOW'");
  addColumnIfNotExists('stores', 'enable_surveys', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('stores', 'enable_insurance', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('stores', 'enable_refurbished', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('stores', 'enable_queue', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('stores', 'enable_kitting', 'INTEGER DEFAULT 1');

  // Performance Indexes for Batch 3
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_surveys_ticket ON repair_surveys(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_claims_ticket ON insurance_claims(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_ticket ON custody_contracts(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_refurb_imei ON refurb_devices(imei);
    CREATE INDEX IF NOT EXISTS idx_queue_status ON digital_queue(status);
    CREATE INDEX IF NOT EXISTS idx_bundles_sku ON repair_bundles(sku);
    CREATE INDEX IF NOT EXISTS idx_stolen_imei ON stolen_device_registry(imei);
    CREATE INDEX IF NOT EXISTS idx_price_history_item ON price_history(item_id);
  `);

  // Seed Default Insurance Carriers
  const carrierCount = db.prepare('SELECT COUNT(*) as cnt FROM insurance_carriers').get() as { cnt: number };
  if (carrierCount.cnt === 0) {
    db.prepare(`
      INSERT INTO insurance_carriers (id, name, contact_email, contact_phone, labor_rate_per_hour, requires_preauth, is_active)
      VALUES 
      ('carrier-1', 'AXA Insurance Egypt (أكسا للتأمين)', 'claims@axa-eg.com', '19999', 180.0, 1, 1),
      ('carrier-2', 'Misr Insurance Co (شركة مصر للتأمين)', 'support@misrins.com.eg', '16666', 150.0, 1, 1),
      ('carrier-3', 'Allianz Global Protection (أليانز)', 'devices@allianz.eg', '19909', 200.0, 0, 1)
    `).run();
  }

  // Seed Default Business Rules
  const rulesCount = db.prepare('SELECT COUNT(*) as cnt FROM business_rules').get() as { cnt: number };
  if (rulesCount.cnt === 0) {
    db.prepare(`
      INSERT INTO business_rules (id, rule_name, event_type, condition_expression, action_type, action_payload)
      VALUES
      ('rule-1', 'Auto-Escalate SLA Overdue', 'TICKET_SLA_BREACH', 'hours_remaining <= 0', 'ESCALATE_URGENT', '{"priority":"URGENT","notify":"lab_manager"}'),
      ('rule-2', 'Low Stock Alert Notification', 'STOCK_LOW', 'stock_quantity <= reorder_level', 'NOTIFY_MANAGER', '{"channel":"WHATSAPP","template":"LOW_STOCK_WARNING"}'),
      ('rule-3', 'VIP Customer Discount Trigger', 'SALE_COMPLETED', 'customer_tier == "GOLD" && total >= 3000', 'APPLY_DISCOUNT', '{"discount_pct":5}')
    `).run();
  }

  // Seed Default Stolen Device Blacklist Entries
  const stolenCount = db.prepare('SELECT COUNT(*) as cnt FROM stolen_device_registry').get() as { cnt: number };
  if (stolenCount.cnt === 0) {
    db.prepare(`
      INSERT INTO stolen_device_registry (id, imei, brand, model, incident_number, reported_by, notes)
      VALUES
      ('stolen-1', '359876543210987', 'Apple', 'iPhone 15 Pro Max', 'POLICE-2026-CAIRO-9921', 'POLICE_REPORT', 'Reported stolen in Nasr City transit on 2026-08-10'),
      ('stolen-2', '864209753124680', 'Samsung', 'Galaxy S24 Ultra', 'INC-ALEX-5541', 'CUSTOMER_FLAG', 'Lost in Alexandria shopping mall')
    `).run();
  }

  // =========================================================================
  // BATCH 4: 70 COMPREHENSIVE PROPOSALS (DEV & MAINTENANCE SUITE)
  // =========================================================================
  db.exec(`
    -- 1. Boot Amperage Curve Logger (Dev Proposal 1)
    CREATE TABLE IF NOT EXISTS boot_amperage_logs (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES repair_tickets(id) ON DELETE CASCADE,
      sample_ms INTEGER NOT NULL,
      current_ma REAL NOT NULL,
      voltage_v REAL NOT NULL,
      stage TEXT DEFAULT 'BOOTING',
      diagnosis_tag TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Diode Mode Readings Database (Dev Proposal 2)
    CREATE TABLE IF NOT EXISTS diode_readings (
      id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      connector_type TEXT NOT NULL,
      pin_number INTEGER NOT NULL,
      pin_name TEXT NOT NULL,
      expected_value REAL NOT NULL,
      tolerance_pct REAL DEFAULT 15.0,
      line_type TEXT DEFAULT 'SIGNAL',
      notes TEXT
    );

    -- 3. TrueTone & BMS Serializer Sync (Dev Proposal 3)
    CREATE TABLE IF NOT EXISTS serializer_sync_logs (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES repair_tickets(id) ON DELETE CASCADE,
      device_serial TEXT,
      screen_mt_sn TEXT,
      cover_code TEXT,
      bms_sn TEXT,
      cycle_count INTEGER DEFAULT 0,
      battery_health_pct INTEGER DEFAULT 100,
      programmer_model TEXT DEFAULT 'JCID-V1SE',
      sync_status TEXT DEFAULT 'SUCCESS',
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Thermal & Microscope Attachment Logs (Dev Proposal 4)
    CREATE TABLE IF NOT EXISTS thermal_inspection_logs (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES repair_tickets(id) ON DELETE CASCADE,
      media_url TEXT NOT NULL,
      media_type TEXT DEFAULT 'THERMAL',
      max_temp_c REAL NOT NULL,
      min_temp_c REAL,
      hot_spot_x REAL,
      hot_spot_y REAL,
      component_ref TEXT,
      notes TEXT,
      captured_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. Workstation Queue Dispatcher (Dev Proposal 5)
    CREATE TABLE IF NOT EXISTS workstation_queues (
      id TEXT PRIMARY KEY,
      workstation_code TEXT UNIQUE NOT NULL,
      workstation_name TEXT NOT NULL,
      station_type TEXT NOT NULL,
      assigned_tech_id TEXT REFERENCES users(id),
      current_ticket_id TEXT REFERENCES repair_tickets(id),
      status TEXT DEFAULT 'AVAILABLE',
      last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. Rapid 24-Point Digital Inspection (Dev Proposal 6)
    CREATE TABLE IF NOT EXISTS rapid_inspections (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES repair_tickets(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      checklist_json TEXT NOT NULL,
      pass_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      advisory_count INTEGER DEFAULT 0,
      inspector_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. Loaner Phones Management (Dev Proposal 13)
    CREATE TABLE IF NOT EXISTS loaner_phones (
      id TEXT PRIMARY KEY,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      imei TEXT UNIQUE NOT NULL,
      condition TEXT DEFAULT 'GOOD',
      deposit_amount REAL DEFAULT 2000.0,
      status TEXT DEFAULT 'AVAILABLE',
      current_ticket_id TEXT REFERENCES repair_tickets(id),
      loaned_to_customer_id TEXT REFERENCES customers(id),
      loaned_at TEXT,
      due_date TEXT,
      returned_at TEXT,
      notes TEXT
    );

    -- 8. 2.5D Bin/Drawer Micro-Locator (Dev Proposal 15)
    CREATE TABLE IF NOT EXISTS warehouse_locations (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT REFERENCES warehouses(id) ON DELETE CASCADE,
      zone TEXT DEFAULT 'A',
      rack TEXT NOT NULL,
      shelf TEXT NOT NULL,
      bin TEXT NOT NULL,
      drawer_code TEXT NOT NULL,
      full_code TEXT UNIQUE NOT NULL,
      capacity INTEGER DEFAULT 100,
      current_items_count INTEGER DEFAULT 0
    );

    -- 9. Serial & Batch Number Tracking (Dev Proposal 18)
    CREATE TABLE IF NOT EXISTS item_batches (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
      batch_number TEXT NOT NULL,
      lot_number TEXT,
      manufacture_date TEXT,
      expiry_date TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0.0,
      received_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. Cost Centers for Multi-Branches (Dev Proposal 25)
    CREATE TABLE IF NOT EXISTS cost_centers (
      id TEXT PRIMARY KEY,
      branch_id TEXT DEFAULT 'WH-MAIN',
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      budget_allocated REAL DEFAULT 0.0,
      budget_spent REAL DEFAULT 0.0,
      is_active INTEGER DEFAULT 1
    );

    -- 11. B2B Fleet Device Management (Dev Proposal 29)
    CREATE TABLE IF NOT EXISTS b2b_fleet_accounts (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      tax_id TEXT,
      contact_person TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      sla_level TEXT DEFAULT 'GOLD',
      monthly_billing_rate REAL DEFAULT 0.0,
      status TEXT DEFAULT 'ACTIVE',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS b2b_fleet_devices (
      id TEXT PRIMARY KEY,
      fleet_account_id TEXT REFERENCES b2b_fleet_accounts(id) ON DELETE CASCADE,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      imei_sn TEXT UNIQUE NOT NULL,
      asset_tag TEXT,
      user_assigned TEXT,
      warranty_end TEXT,
      status TEXT DEFAULT 'ACTIVE'
    );

    -- 12. Audio/Video Disclaimer Consent (Dev Proposal 32)
    CREATE TABLE IF NOT EXISTS repair_consents (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES repair_tickets(id) ON DELETE CASCADE,
      consent_type TEXT NOT NULL,
      media_url TEXT NOT NULL,
      transcription TEXT,
      customer_agreed INTEGER DEFAULT 1,
      recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 13. Manager Override Tokens (Maint Proposal 56)
    CREATE TABLE IF NOT EXISTS manager_override_tokens (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      reason TEXT NOT NULL,
      manager_id TEXT REFERENCES users(id),
      discount_pct REAL DEFAULT 0.0,
      max_uses INTEGER DEFAULT 1,
      uses_count INTEGER DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 14. Subnet & Device Whitelisting (Maint Proposal 58)
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id TEXT PRIMARY KEY,
      device_token TEXT UNIQUE NOT NULL,
      device_name TEXT NOT NULL,
      mac_or_fingerprint TEXT,
      ip_subnet TEXT,
      is_whitelisted INTEGER DEFAULT 1,
      registered_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Optimistic Concurrency Locking Columns (Maint Proposal 59)
  addColumnIfNotExists('repair_tickets', 'version', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('items', 'version', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('sales', 'version', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('items', 'location_id', 'TEXT');

  // Composite Performance Indexes (Maint Proposal 46)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status ON repair_tickets(assigned_tech_id, status);
    CREATE INDEX IF NOT EXISTS idx_items_category_stock ON items(category, stock_quantity);
    CREATE INDEX IF NOT EXISTS idx_sales_shift_created ON sales(shift_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_batches_item_expiry ON item_batches(item_id, expiry_date);
    CREATE INDEX IF NOT EXISTS idx_locations_wh_code ON warehouse_locations(warehouse_id, full_code);
    CREATE INDEX IF NOT EXISTS idx_boot_amp_ticket ON boot_amperage_logs(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_diode_model_conn ON diode_readings(model, connector_type);
    CREATE INDEX IF NOT EXISTS idx_loaner_status ON loaner_phones(status);
    CREATE INDEX IF NOT EXISTS idx_b2b_devices_fleet ON b2b_fleet_devices(fleet_account_id);
  `);

  // Seed Default Diode Mode Reference Database
  const diodeCount = db.prepare('SELECT COUNT(*) as cnt FROM diode_readings').get() as { cnt: number };
  if (diodeCount.cnt === 0) {
    db.prepare(`
      INSERT INTO diode_readings (id, model, connector_type, pin_number, pin_name, expected_value, tolerance_pct, line_type, notes)
      VALUES
      ('d-1', 'iPhone 15 Pro', 'USB_C', 1, 'GND', 0.000, 0.0, 'GROUND', 'System ground reference'),
      ('d-2', 'iPhone 15 Pro', 'USB_C', 2, 'TX1+', 0.385, 10.0, 'SIGNAL', 'SuperSpeed differential TX pair'),
      ('d-3', 'iPhone 15 Pro', 'USB_C', 3, 'TX1-', 0.385, 10.0, 'SIGNAL', 'SuperSpeed differential TX pair'),
      ('d-4', 'iPhone 15 Pro', 'USB_C', 4, 'VBUS', 0.520, 12.0, 'POWER', '5V-20V charging bus rail'),
      ('d-5', 'iPhone 15 Pro', 'USB_C', 5, 'CC1', 0.540, 10.0, 'SIGNAL', 'Configuration channel negotiation'),
      ('d-6', 'iPhone 15 Pro', 'USB_C', 6, 'DP1', 0.610, 10.0, 'SIGNAL', 'USB 2.0 High Speed D+ line'),
      ('d-7', 'iPhone 15 Pro', 'USB_C', 7, 'DN1', 0.610, 10.0, 'SIGNAL', 'USB 2.0 High Speed D- line'),
      ('d-8', 'iPhone 15 Pro', 'DISPLAY_FPC', 1, 'PP_VAR_BOOST', 0.460, 15.0, 'POWER', 'OLED Panel Boost Voltage'),
      ('d-9', 'iPhone 15 Pro', 'DISPLAY_FPC', 4, 'MIPI_DSI_CLK_P', 0.395, 10.0, 'SIGNAL', 'Display Serial Interface Clock'),
      ('d-10', 'iPhone 15 Pro', 'DISPLAY_FPC', 8, 'TOUCH_RESET_L', 0.510, 10.0, 'SIGNAL', 'Touch Controller Reset Active Low')
    `).run();
  }

  // Seed Default Workstations
  const wsCount = db.prepare('SELECT COUNT(*) as cnt FROM workstation_queues').get() as { cnt: number };
  if (wsCount.cnt === 0) {
    db.prepare(`
      INSERT INTO workstation_queues (id, workstation_code, workstation_name, station_type, status)
      VALUES
      ('ws-1', 'BENCH-01', 'منصة الميكروسكوب واللحام الدقيق (Micro-soldering Station 1)', 'MICROSOLDERING', 'AVAILABLE'),
      ('ws-2', 'BENCH-02', 'منصة استبدال الشاشات والبطاريات (Screen & Battery Lab 2)', 'SCREEN_BATTERY', 'AVAILABLE'),
      ('ws-3', 'BENCH-03', 'منصة التشخيص والفحص السريع (Diagnostics & Inspection 3)', 'DIAGNOSTICS', 'AVAILABLE')
    `).run();
  }

  // Seed Default Warehouse 2.5D Micro-Locations
  const locCount = db.prepare('SELECT COUNT(*) as cnt FROM warehouse_locations').get() as { cnt: number };
  if (locCount.cnt === 0) {
    db.prepare(`
      INSERT INTO warehouse_locations (id, warehouse_id, zone, rack, shelf, bin, drawer_code, full_code, capacity)
      VALUES
      ('loc-1', 'wh-main', 'A', 'R01', 'S01', 'B01', 'D-101', 'A-R01-S01-B01', 50),
      ('loc-2', 'wh-main', 'A', 'R01', 'S01', 'B02', 'D-102', 'A-R01-S01-B02', 50),
      ('loc-3', 'wh-main', 'A', 'R01', 'S02', 'B01', 'D-201', 'A-R01-S02-B01', 100),
      ('loc-4', 'wh-main', 'B', 'R02', 'S01', 'B01', 'D-301', 'B-R02-S01-B01', 80),
      ('loc-5', 'wh-main', 'B', 'R02', 'S02', 'B02', 'D-302', 'B-R02-S02-B02', 80)
    `).run();
  }

  // Seed Default Loaner Phones Fleet
  const loanerCount = db.prepare('SELECT COUNT(*) as cnt FROM loaner_phones').get() as { cnt: number };
  if (loanerCount.cnt === 0) {
    db.prepare(`
      INSERT INTO loaner_phones (id, brand, model, imei, condition, deposit_amount, status)
      VALUES
      ('ln-1', 'Apple', 'iPhone 11 64GB Black', '352948102938471', 'EXCELLENT', 1500.0, 'AVAILABLE'),
      ('ln-2', 'Samsung', 'Galaxy A54 5G 128GB', '867192039485712', 'GOOD', 1200.0, 'AVAILABLE'),
      ('ln-3', 'Xiaomi', 'Redmi Note 12 128GB', '864920193847261', 'GOOD', 800.0, 'AVAILABLE')
    `).run();
  }

  // Seed Default Cost Centers
  const ccCount = db.prepare('SELECT COUNT(*) as cnt FROM cost_centers').get() as { cnt: number };
  if (ccCount.cnt === 0) {
    db.prepare(`
      INSERT INTO cost_centers (id, branch_id, code, name, department, budget_allocated, budget_spent)
      VALUES
      ('cc-1', 'WH-MAIN', 'CC-LAB', 'مركز تكلفة معمل الصيانة (Lab Operations)', 'LAB', 45000.0, 12000.0),
      ('cc-2', 'WH-MAIN', 'CC-RETAIL', 'مركز تكلفة مبيعات الصالة (Retail Showroom)', 'RETAIL', 90000.0, 34000.0),
      ('cc-3', 'WH-PARTS', 'CC-PARTS', 'مركز تكلفة مبيعات الجملة (Wholesale Distribution)', 'SPARES', 150000.0, 68000.0)
    `).run();
  }

  // Seed Default B2B Fleet Account & Devices
  const b2bCount = db.prepare('SELECT COUNT(*) as cnt FROM b2b_fleet_accounts').get() as { cnt: number };
  if (b2bCount.cnt === 0) {
    db.prepare(`
      INSERT INTO b2b_fleet_accounts (id, company_name, tax_id, contact_person, phone, email, sla_level, monthly_billing_rate)
      VALUES
      ('fleet-1', 'شركة الدلتا للتوزيع والخدمات اللوجستية (Delta Logistics B2B)', '492-819-301', 'أ / مصطفى إبراهيم', '01011223344', 'it@deltalogistics.eg', 'PLATINUM', 8500.0)
    `).run();

    db.prepare(`
      INSERT INTO b2b_fleet_devices (id, fleet_account_id, brand, model, imei_sn, asset_tag, user_assigned, warranty_end, status)
      VALUES
      ('fdev-1', 'fleet-1', 'Samsung', 'Galaxy XCover 6 Pro Rugged', '359182736450192', 'DELTA-MBL-001', 'مندوب التوصيل 1', '2027-01-01', 'ACTIVE'),
      ('fdev-2', 'fleet-1', 'Samsung', 'Galaxy XCover 6 Pro Rugged', '359182736450193', 'DELTA-MBL-002', 'مندوب التوصيل 2', '2027-01-01', 'ACTIVE')
    `).run();
  }

  // Execute structured versioned migrations (001 to 006)
  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
  const appliedVersions = new Set(appliedRows.map(r => r.version));

  for (const m of migrations) {
    if (!appliedVersions.has(m.version)) {
      console.log(`[Database] Applying migration ${m.version}: ${m.name}...`);
      m.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name, executed_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(m.version, m.name);
      console.log(`[Database] Successfully applied migration ${m.version}: ${m.name}`);
    }
  }

  console.log('[Database] Migrations and schema enhancements executed successfully.');
}

