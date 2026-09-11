import type { Database } from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

export const migration009: Migration = {
  version: 9,
  name: '009_spare_parts_wholesale_25_ideas',
  up: (db: Database) => {
    // ========================================
    // F1: مصفوفة الجودات المتعددة (Quality Matrix per SKU)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS quality_matrix (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        quality_grade TEXT NOT NULL,
        grade_label TEXT NOT NULL,
        purchase_price REAL DEFAULT 0,
        wholesale_price REAL DEFAULT 0,
        retail_price REAL DEFAULT 0,
        bulk_price REAL DEFAULT 0,
        warranty_days INTEGER DEFAULT 30,
        supplier_name TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
      CREATE INDEX IF NOT EXISTS idx_quality_matrix_item ON quality_matrix(item_id);
    `);

    // ========================================
    // F2: محرك التوافق التبادلي (Cross-Model Compatibility Engine)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS cross_model_compatibility (
        id TEXT PRIMARY KEY,
        source_item_id TEXT NOT NULL,
        source_brand TEXT NOT NULL,
        source_model TEXT NOT NULL,
        target_brand TEXT NOT NULL,
        target_model TEXT NOT NULL,
        compatibility_notes TEXT,
        verified INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (source_item_id) REFERENCES items(id)
      );
      CREATE INDEX IF NOT EXISTS idx_compatibility_source ON cross_model_compatibility(source_item_id);
      CREATE INDEX IF NOT EXISTS idx_compatibility_models ON cross_model_compatibility(source_brand, source_model, target_brand, target_model);
    `);

    // ========================================
    // F3: توليد باركود الحماية المضاد للغش (Security Tamper Barcode)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS security_barcodes (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        ticket_id TEXT,
        serial_number TEXT NOT NULL UNIQUE,
        barcode_type TEXT DEFAULT 'SECURITY_SEAL',
        printed_at TEXT DEFAULT (datetime('now')),
        printed_by_user_id TEXT,
        is_voided INTEGER DEFAULT 0,
        voided_at TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F4: التسعير الطبقي الآلي (Multi-Tier Wholesale Rules)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS wholesale_pricing_tiers (
        id TEXT PRIMARY KEY,
        item_id TEXT,
        category TEXT,
        account_type TEXT NOT NULL,
        tier_name TEXT NOT NULL,
        price_multiplier REAL DEFAULT 1.0,
        min_quantity INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F5: مؤشر جودة الموردين (Vendor Defect Rating)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS vendor_quality_scores (
        id TEXT PRIMARY KEY,
        vendor_name TEXT NOT NULL,
        store_id TEXT NOT NULL,
        total_shipments INTEGER DEFAULT 0,
        defect_shipments INTEGER DEFAULT 0,
        defect_rate_pct REAL DEFAULT 0,
        avg_defect_severity REAL DEFAULT 0,
        total_credit_issued REAL DEFAULT 0,
        quality_rating TEXT DEFAULT 'UNRATED',
        last_updated TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F6: إدارة مرحلة اختبار الفنيين (Testing Window RMA)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS testing_window_rma (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        ticket_id TEXT,
        tech_user_id TEXT NOT NULL,
        testing_start_at TEXT DEFAULT (datetime('now')),
        testing_end_at TEXT,
        testing_window_hours INTEGER DEFAULT 48,
        seal_intact INTEGER DEFAULT 1,
        no_soldering_detected INTEGER DEFAULT 1,
        rma_status TEXT DEFAULT 'IN_TESTING',
        rma_notes TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id),
        FOREIGN KEY (tech_user_id) REFERENCES users(id)
      );
    `);

    // ========================================
    // F7: كشف مطابقة الباتش للموردين
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS batch_tracking (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        batch_number TEXT NOT NULL,
        vendor_name TEXT NOT NULL,
        purchase_order_id TEXT,
        quantity_received INTEGER DEFAULT 0,
        received_at TEXT DEFAULT (datetime('now')),
        warranty_batch_expiry TEXT,
        notes TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
      CREATE INDEX IF NOT EXISTS idx_batch_tracking_item ON batch_tracking(item_id);
    `);

    // ========================================
    // F8: إدارة مخزون الباغات والتجديد (Refurbishing Supply Ledger)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS refurbishing_supplies (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        supply_type TEXT NOT NULL,
        supply_name TEXT NOT NULL,
        sku TEXT,
        current_stock INTEGER DEFAULT 0,
        min_stock INTEGER DEFAULT 5,
        unit_cost REAL DEFAULT 0,
        usage_per_refurb REAL DEFAULT 1,
        total_consumed INTEGER DEFAULT 0,
        last_restocked_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F9: حجز القطع المؤقت لمهندسي الصيانة
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS item_holds (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        tech_user_id TEXT NOT NULL,
        ticket_id TEXT,
        hold_quantity INTEGER DEFAULT 1,
        hold_start_at TEXT DEFAULT (datetime('now')),
        hold_expires_at TEXT,
        hold_status TEXT DEFAULT 'ACTIVE',
        released_at TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (tech_user_id) REFERENCES users(id)
      );
    `);

    // ========================================
    // F10: حساب أرباح وزن السكراب النحاسي والذهب
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS scrap_metal_weights (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        metal_type TEXT NOT NULL,
        weight_grams REAL DEFAULT 0,
        purity_pct REAL DEFAULT 0,
        market_price_per_gram REAL DEFAULT 0,
        estimated_value REAL DEFAULT 0,
        boarded_ticket_ids TEXT,
        status TEXT DEFAULT 'COLLECTING',
        sold_at TEXT,
        sold_price REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F11: حد التوريد الأدنى لورش الصيانة
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS wholesale_minimum_order (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        customer_type TEXT NOT NULL,
        min_order_amount REAL DEFAULT 500,
        min_order_items INTEGER DEFAULT 5,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F12: تتبع القطع سريعة التلف أثناء النقل
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS transit_damage_log (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        delivery_method TEXT,
        driver_name TEXT,
        damage_description TEXT,
        damage_photo_url TEXT,
        estimated_loss REAL DEFAULT 0,
        reported_at TEXT DEFAULT (datetime('now')),
        resolved INTEGER DEFAULT 0,
        resolution_notes TEXT,
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F13: حساب تعويضات فحص القطع التالفة
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS vendor_compensation_claims (
        id TEXT PRIMARY KEY,
        vendor_name TEXT NOT NULL,
        batch_id TEXT,
        total_items_claimed INTEGER DEFAULT 0,
        total_defect_value REAL DEFAULT 0,
        compensation_amount REAL DEFAULT 0,
        claim_status TEXT DEFAULT 'SUBMITTED',
        submitted_at TEXT DEFAULT (datetime('now')),
        resolved_at TEXT,
        notes TEXT
      );
    `);

    // ========================================
    // F14: جدولة طلبات القطع النادرة (Rare Parts Pre-Order)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS rare_parts_preorders (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        customer_id TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        item_description TEXT NOT NULL,
        device_brand TEXT,
        device_model TEXT,
        estimated_price REAL DEFAULT 0,
        deposit_amount REAL DEFAULT 0,
        deposit_paid INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PENDING',
        expected_arrival TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
    `);

    // ========================================
    // F15: مؤشر تغير أسعار شاشات الفئات العليا
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS screen_price_history (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        quality_grade TEXT,
        old_price REAL DEFAULT 0,
        new_price REAL DEFAULT 0,
        change_pct REAL DEFAULT 0,
        market_reference TEXT,
        recorded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F16: إلزام إرفاق صورة العيب المصنعي
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS manufacturer_defect_photos (
        id TEXT PRIMARY KEY,
        rma_ticket_id TEXT NOT NULL,
        photo_url TEXT NOT NULL,
        defect_type TEXT,
        description TEXT,
        uploaded_by_user_id TEXT,
        uploaded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (rma_ticket_id) REFERENCES rma_tickets(id)
      );
    `);

    // ========================================
    // F17: حساب نسبة كسر الباغات بالفحص
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS inspection_breakage_log (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        inspector_user_id TEXT NOT NULL,
        item_id TEXT,
        breakage_type TEXT,
        breakage_description TEXT,
        estimated_cost REAL DEFAULT 0,
        occurred_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (inspector_user_id) REFERENCES users(id)
      );
    `);

    // ========================================
    // F18: تسجيل هوالك الصيانة الداخلية
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS internal_repair_waste (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        ticket_id TEXT,
        technician_id TEXT,
        item_id TEXT,
        damage_description TEXT,
        estimated_cost REAL DEFAULT 0,
        fault_category TEXT,
        recorded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id),
        FOREIGN KEY (technician_id) REFERENCES users(id)
      );
    `);

    // ========================================
    // F19: لوحة المقارنة التقنية للشاشات
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS screen_technical_specs (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        screen_type TEXT,
        resolution TEXT,
        brightness_nits INTEGER DEFAULT 0,
        refresh_rate_hz INTEGER DEFAULT 60,
        touch_sampling_hz INTEGER DEFAULT 0,
        color_gamut TEXT,
        panel_manufacturer TEXT,
        price_comparison_notes TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F20: إدارة خطوط الائتمان الدوارة لمراكز الصيانة
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS revolving_credit_accounts (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        credit_limit REAL DEFAULT 0,
        current_balance REAL DEFAULT 0,
        billing_cycle_days INTEGER DEFAULT 30,
        last_billing_date TEXT,
        payment_due_date TEXT,
        status TEXT DEFAULT 'ACTIVE',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F21: تكويد الآيسيهات والدوائر الدقيقة (IC & Component Indexing)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS ic_component_index (
        id TEXT PRIMARY KEY,
        ic_part_number TEXT NOT NULL,
        ic_name TEXT NOT NULL,
        manufacturer TEXT,
        category TEXT,
        compatible_devices TEXT,
        schematic_location TEXT,
        price REAL DEFAULT 0,
        stock_quantity INTEGER DEFAULT 0,
        datasheet_url TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_ic_part_number ON ic_component_index(ic_part_number);
    `);

    // ========================================
    // F22: جرد مخزن الخلع المنفصل
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS harvest_inventory (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        donor_device_brand TEXT,
        donor_device_model TEXT,
        donor_imei TEXT,
        harvest_date TEXT DEFAULT (datetime('now')),
        condition_grade TEXT DEFAULT 'TESTED_WORKING',
        is_sold INTEGER DEFAULT 0,
        sold_to_ticket_id TEXT,
        sold_at TEXT,
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F23: تنبيه نقص القطع المرتبطة (Paired Components Alert)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS paired_component_rules (
        id TEXT PRIMARY KEY,
        primary_item_id TEXT NOT NULL,
        paired_item_id TEXT NOT NULL,
        pairing_ratio REAL DEFAULT 1.0,
        notes TEXT,
        FOREIGN KEY (primary_item_id) REFERENCES items(id),
        FOREIGN KEY (paired_item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F24: معدل استهلاك البطاريات الموسمي
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS seasonal_consumption_stats (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        item_category TEXT NOT NULL,
        season TEXT NOT NULL,
        avg_monthly_demand REAL DEFAULT 0,
        peak_month TEXT,
        recommended_stock_level REAL DEFAULT 0,
        last_calculated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F25: تتبع حركة مسامير وشاسيهات التثبيت
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS fastener_tracking (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_name TEXT,
        screw_type TEXT,
        compatible_devices TEXT,
        current_stock INTEGER DEFAULT 0,
        unit_cost REAL DEFAULT 0,
        daily_consumption REAL DEFAULT 0,
        last_restocked_at TEXT,
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    console.log('[Migration 009] Spare Parts Wholesale 25 Ideas tables created successfully');
  }
};
