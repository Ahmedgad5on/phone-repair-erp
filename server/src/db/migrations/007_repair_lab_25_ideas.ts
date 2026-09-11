import type { Database } from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

export const migration007: Migration = {
  version: 7,
  name: '007_repair_lab_25_ideas',
  up: (db: Database) => {
    // ========================================
    // F1: مؤشر العائد على الدقيقة الفنية (Labor Yield Per Minute)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS technician_labor_metrics (
        id TEXT PRIMARY KEY,
        technician_id TEXT NOT NULL,
        ticket_id TEXT NOT NULL,
        device_brand TEXT,
        device_model TEXT,
        repair_category TEXT,
        minutes_spent REAL NOT NULL DEFAULT 0,
        labor_revenue REAL NOT NULL DEFAULT 0,
        parts_cost REAL NOT NULL DEFAULT 0,
        net_profit REAL NOT NULL DEFAULT 0,
        yield_per_minute REAL NOT NULL DEFAULT 0,
        recorded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (technician_id) REFERENCES users(id),
        FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tech_labor_metrics_tech ON technician_labor_metrics(technician_id);
      CREATE INDEX IF NOT EXISTS idx_tech_labor_metrics_date ON technician_labor_metrics(recorded_at);
    `);

    // ========================================
    // F2: التوجيه التلقائي للمهام (Smart Task Dispatcher)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_dispatch_rules (
        id TEXT PRIMARY KEY,
        repair_category TEXT NOT NULL,
        preferred_tech_id TEXT,
        priority_level TEXT DEFAULT 'NORMAL',
        max_concurrent_tickets INTEGER DEFAULT 3,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (preferred_tech_id) REFERENCES users(id)
      );
    `);

    // ========================================
    // F5: مقياس إهلاك أدوات الصيانة (Tooling Lifecycle & Consumables)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS tooling_consumables (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        item_category TEXT,
        unit_cost REAL DEFAULT 0,
        current_stock REAL DEFAULT 0,
        min_stock REAL DEFAULT 0,
        usage_per_repair REAL DEFAULT 0,
        total_consumed REAL DEFAULT 0,
        last_restocked_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );

      CREATE TABLE IF NOT EXISTS tooling_usage_log (
        id TEXT PRIMARY KEY,
        consumable_id TEXT NOT NULL,
        ticket_id TEXT,
        technician_id TEXT,
        quantity_used REAL NOT NULL DEFAULT 0,
        recorded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (consumable_id) REFERENCES tooling_consumables(id),
        FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id),
        FOREIGN KEY (technician_id) REFERENCES users(id)
      );
    `);

    // ========================================
    // F6: خوارزمية تسعير التفكيك (Algorithmic Scrap Pricing)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS scrap_pricing_rules (
        id TEXT PRIMARY KEY,
        part_name TEXT NOT NULL,
        device_brand TEXT,
        base_market_value REAL DEFAULT 0,
        condition_depreciation_pct REAL DEFAULT 0.3,
        harvest_cost_factor REAL DEFAULT 0.1,
        is_active INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // ========================================
    // F8: سجل المقايسات المرفوضة الذكي (Dead Quote Intelligence)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS dead_quotes (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        ticket_id TEXT,
        customer_id TEXT,
        device_brand TEXT,
        device_model TEXT,
        quoted_amount REAL DEFAULT 0,
        rejection_reason TEXT,
        rejection_category TEXT,
        competitor_price REAL,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
    `);

    // ========================================
    // F9: حساب الضمان المتدرج (Component-Level Warranty Rules)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS warranty_tiers (
        id TEXT PRIMARY KEY,
        service_category TEXT NOT NULL UNIQUE,
        warranty_days INTEGER NOT NULL DEFAULT 30,
        warranty_terms TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // ========================================
    // F12: حظر تسليم العهدة دون كود تحقق (OTP Custody Release)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS custody_releases (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        device_imei TEXT,
        released_to_name TEXT,
        released_to_phone TEXT,
        released_to_id_number TEXT,
        otp_code TEXT NOT NULL,
        otp_verified INTEGER DEFAULT 0,
        released_by_user_id TEXT,
        released_at TEXT,
        id_photo_url TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id),
        FOREIGN KEY (released_by_user_id) REFERENCES users(id)
      );
    `);

    // ========================================
    // F13: أرشفة سيريالات الهاردوير (Serial Number Archiving)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS hardware_serial_archive (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        device_brand TEXT,
        device_model TEXT,
        original_screen_serial TEXT,
        current_screen_serial TEXT,
        original_bms_serial TEXT,
        current_bms_serial TEXT,
        programmer_used TEXT,
        sync_status TEXT DEFAULT 'PENDING',
        recorded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id)
      );
    `);

    // ========================================
    // F14: نظام استهلاك الخامات المشتركة (Shared Consumables Pool)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS shared_consumables (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        material_name TEXT NOT NULL,
        material_type TEXT,
        unit_cost REAL DEFAULT 0,
        current_stock REAL DEFAULT 0,
        consumption_per_close REAL DEFAULT 0,
        total_consumed REAL DEFAULT 0,
        last_restocked_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );

      CREATE TABLE IF NOT EXISTS consumable_usage_log (
        id TEXT PRIMARY KEY,
        consumable_id TEXT NOT NULL,
        ticket_id TEXT,
        quantity_used REAL NOT NULL DEFAULT 0,
        recorded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (consumable_id) REFERENCES shared_consumables(id),
        FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id)
      );
    `);

    // ========================================
    // F17: كاشف عيوب الموديلات الشائعة (Model Fault Hotspots)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS model_fault_hotspots (
        id TEXT PRIMARY KEY,
        device_brand TEXT NOT NULL,
        device_model TEXT NOT NULL,
        fault_category TEXT NOT NULL,
        occurrence_count INTEGER DEFAULT 1,
        avg_repair_cost REAL DEFAULT 0,
        avg_repair_minutes REAL DEFAULT 0,
        common_parts TEXT,
        last_updated TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_model_faults_brand_model ON model_fault_hotspots(device_brand, device_model);
    `);

    // ========================================
    // F19: إغلاق الحساب عند الشغل الخارجي (Subcontracting Ledger)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS outsource_ledger (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        ticket_id TEXT NOT NULL,
        external_workshop_name TEXT NOT NULL,
        workshop_contact TEXT,
        board_description TEXT,
        workshop_quote REAL DEFAULT 0,
        customer_charge REAL DEFAULT 0,
        internal_margin REAL DEFAULT 0,
        status TEXT DEFAULT 'SENT',
        sent_at TEXT,
        received_at TEXT,
        tracking_reference TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id)
      );
    `);

    // ========================================
    // F20: استرجاع التوالف للموردين (Vendor Defect Return Flow)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS vendor_defect_returns (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        vendor_name TEXT NOT NULL,
        invoice_reference TEXT,
        defect_description TEXT,
        defect_photo_url TEXT,
        return_barcode TEXT,
        credit_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'IDENTIFIED',
        identified_at TEXT DEFAULT (datetime('now')),
        returned_at TEXT,
        credit_received_at TEXT,
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F21: كشف الأجهزة المكررة (Repeat Device Detection)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS device_visit_history (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        device_imei TEXT NOT NULL,
        customer_id TEXT,
        visit_type TEXT,
        ticket_id TEXT,
        sale_id TEXT,
        visit_date TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
      CREATE INDEX IF NOT EXISTS idx_device_visit_imei ON device_visit_history(device_imei);
    `);

    // ========================================
    // F22: التسعير الديناميكي بناءً على ضغط العمل (Dynamic Labor Surge)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS labor_surge_rules (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        active_tickets_threshold INTEGER DEFAULT 5,
        surge_multiplier REAL DEFAULT 1.5,
        express_window_minutes INTEGER DEFAULT 30,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F23: مكتبة الممانعات والجهود التفاعلية
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS resistance_reference_db (
        id TEXT PRIMARY KEY,
        device_brand TEXT NOT NULL,
        device_model TEXT NOT NULL,
        line_name TEXT NOT NULL,
        connector_type TEXT,
        expected_resistance_ohms REAL,
        tolerance_pct REAL DEFAULT 10,
        reading_type TEXT DEFAULT 'DIODE_MODE',
        reported_by_tech_id TEXT,
        verified_count INTEGER DEFAULT 1,
        last_verified_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (reported_by_tech_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_resistance_model ON resistance_reference_db(device_brand, device_model);
    `);

    // ========================================
    // F24: التأمين على الأجهزة الحساسة (Risk-Assessment Score)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS device_risk_assessments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        customer_id TEXT,
        risk_score INTEGER DEFAULT 0,
        has_bent_frame INTEGER DEFAULT 0,
        has_liquid_damage INTEGER DEFAULT 0,
        has_previous_repair INTEGER DEFAULT 0,
        board_condition_notes TEXT,
        customer_disclaimer_signed INTEGER DEFAULT 0,
        disclaimer_photo_url TEXT,
        assessed_by_user_id TEXT,
        assessed_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (assessed_by_user_id) REFERENCES users(id)
      );
    `);

    // ========================================
    // F25: تتبع ملحقات الأجهزة المهملة
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS abandoned_accessories (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        accessory_type TEXT NOT NULL,
        brand TEXT,
        model_compatibility TEXT,
        serial_or_barcode TEXT,
        customer_id TEXT,
        customer_phone TEXT,
        deposit_date TEXT DEFAULT (datetime('now')),
        last_reminder_sent TEXT,
        status TEXT DEFAULT 'STORED',
        disposal_date TEXT,
        notes TEXT,
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
    `);

    console.log('[Migration 007] Repair Lab 25 Ideas tables created successfully');
  }
};
