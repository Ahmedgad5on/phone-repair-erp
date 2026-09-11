import type { Database } from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

export const migration008: Migration = {
  version: 8,
  name: '008_retail_pos_25_ideas',
  up: (db: Database) => {
    // ========================================
    // F1: كاشف تكلفة ركود الرف (Holding Cost Calculator)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS holding_cost_rules (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        category TEXT,
        daily_holding_cost_pct REAL DEFAULT 0.01,
        max_hold_days INTEGER DEFAULT 60,
        auto_discount_pct REAL DEFAULT 10,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );

      CREATE TABLE IF NOT EXISTS holding_cost_log (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        days_held INTEGER DEFAULT 0,
        holding_cost REAL DEFAULT 0,
        suggested_discount_pct REAL DEFAULT 0,
        calculated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F2: سجل النواقص التلقائي التراكمي (Lost Sales Logger)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS lost_sales_log (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        item_category TEXT,
        customer_phone TEXT,
        customer_name TEXT,
        request_count INTEGER DEFAULT 1,
        last_requested_at TEXT DEFAULT (datetime('now')),
        is_po_created INTEGER DEFAULT 0,
        po_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
      CREATE INDEX IF NOT EXISTS idx_lost_sales_item ON lost_sales_log(item_name);
    `);

    // ========================================
    // F3: البيع الإجباري عبر التحقق المزدوج (IMEI-Enforced Checkout)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS imei_checkout_log (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        imei_scanned TEXT NOT NULL,
        scanned_by_user_id TEXT,
        checkout_status TEXT DEFAULT 'VERIFIED',
        scanned_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F4: عقد البيع المستعمل المؤتمت (Auto-Generated Used Phone Contract)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS used_phone_contracts (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        sale_id TEXT,
        customer_id TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        customer_id_number TEXT,
        device_brand TEXT,
        device_model TEXT,
        device_imei TEXT,
        device_condition TEXT,
        sale_price REAL DEFAULT 0,
        warranty_days INTEGER DEFAULT 0,
        contract_terms TEXT,
        customer_signature_url TEXT,
        contract_hash TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
    `);

    // ========================================
    // F5: سقف الائتمان للآجل (Dynamic Credit Limit)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        sale_id TEXT,
        amount REAL NOT NULL,
        transaction_type TEXT NOT NULL,
        balance_after REAL DEFAULT 0,
        recorded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (sale_id) REFERENCES sales(id)
      );
    `);

    // ========================================
    // F6: إعادة الطلب الذكية متعددة المتغيرات (Smart Reorder Point)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS smart_reorder_rules (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL UNIQUE,
        avg_daily_sales REAL DEFAULT 0,
        lead_time_days INTEGER DEFAULT 7,
        safety_stock_days INTEGER DEFAULT 3,
        reorder_point REAL DEFAULT 0,
        reorder_quantity REAL DEFAULT 0,
        last_calculated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F7: كشف المنتجات التكميلية (Cross-Selling Engine)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS cross_sell_rules (
        id TEXT PRIMARY KEY,
        source_category TEXT NOT NULL,
        source_model TEXT,
        target_item_id TEXT NOT NULL,
        target_item_name TEXT,
        relevance_score REAL DEFAULT 0.8,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (target_item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F8: نظام سلة الطلب المعلقة (Draft Order Handover)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS draft_orders (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        salesperson_user_id TEXT,
        items_json TEXT NOT NULL,
        subtotal REAL DEFAULT 0,
        status TEXT DEFAULT 'DRAFT',
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (salesperson_user_id) REFERENCES users(id)
      );
    `);

    // ========================================
    // F9: معدل استرجاع العلامات التجارية (Brand Failure Ratio)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS brand_return_stats (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        brand_name TEXT NOT NULL,
        total_sold INTEGER DEFAULT 0,
        total_returned INTEGER DEFAULT 0,
        return_ratio REAL DEFAULT 0,
        avg_return_reason TEXT,
        last_updated TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F10: تحليل حركة المبيعات بالساعة (Hourly Sales Footfall)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS hourly_sales_footfall (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        sale_date TEXT NOT NULL,
        sale_hour INTEGER NOT NULL,
        transaction_count INTEGER DEFAULT 0,
        total_revenue REAL DEFAULT 0,
        avg_transaction_value REAL DEFAULT 0,
        calculated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
      CREATE INDEX IF NOT EXISTS idx_hourly_footfall_date ON hourly_sales_footfall(store_id, sale_date);
    `);

    // ========================================
    // F11: التسعير المرن بحسب حجم الشراء (Tiered Quantity Discounts)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS quantity_discount_tiers (
        id TEXT PRIMARY KEY,
        item_id TEXT,
        category TEXT,
        min_quantity INTEGER NOT NULL,
        max_quantity INTEGER,
        discount_pct REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F12: سجل تتبع أداء البائعين (Salesperson Conversion Rate)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS salesperson_performance (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        period_date TEXT NOT NULL,
        total_invoices INTEGER DEFAULT 0,
        total_revenue REAL DEFAULT 0,
        avg_invoice_value REAL DEFAULT 0,
        items_sold INTEGER DEFAULT 0,
        conversion_rate REAL DEFAULT 0,
        calculated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // ========================================
    // F13: تحويل مرتجعات الصيانة لمبيعات (Upselling Dead Devices)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS upsell_opportunities (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        ticket_id TEXT,
        customer_id TEXT,
        original_device TEXT,
        repair_cost REAL DEFAULT 0,
        device_value REAL DEFAULT 0,
        suggested_replacement_id TEXT,
        suggested_price REAL DEFAULT 0,
        upsell_status TEXT DEFAULT 'SUGGESTED',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
    `);

    // ========================================
    // F14: تتبع تواريخ انتهاء صلاحية البطاريات (Battery Shelf-Life Alert)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS battery_shelf_life (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        batch_number TEXT,
        manufacture_date TEXT,
        shelf_life_days INTEGER DEFAULT 365,
        last_charge_date TEXT,
        charge_cycles INTEGER DEFAULT 0,
        health_status TEXT DEFAULT 'GOOD',
        alert_sent INTEGER DEFAULT 0,
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F15: جرد الفئات السريع (Spot-Check Cycle Counting)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS spot_check_counts (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        expected_quantity INTEGER NOT NULL,
        actual_quantity INTEGER,
        variance INTEGER DEFAULT 0,
        variance_pct REAL DEFAULT 0,
        counted_by_user_id TEXT,
        count_date TEXT DEFAULT (datetime('now')),
        notes TEXT,
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (counted_by_user_id) REFERENCES users(id)
      );
    `);

    // ========================================
    // F16: حساب ربحية المتر المربع للواجهات
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS display_zone_performance (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        zone_name TEXT NOT NULL,
        zone_type TEXT,
        items_displayed INTEGER DEFAULT 0,
        period_revenue REAL DEFAULT 0,
        period_profit REAL DEFAULT 0,
        revenue_per_sqm REAL DEFAULT 0,
        period_month TEXT NOT NULL,
        calculated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F17: حماية التخفيضات (Discount Authority Matrix)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS discount_authority_matrix (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL UNIQUE,
        max_discount_pct REAL NOT NULL DEFAULT 5,
        requires_approval_above_pct REAL DEFAULT 10,
        max_daily_discount_amount REAL DEFAULT 1000,
        is_active INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // ========================================
    // F18: ربط الشواحن بمواصفات وات الهواتف
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS charger_device_compatibility (
        id TEXT PRIMARY KEY,
        charger_item_id TEXT NOT NULL,
        charger_wattage REAL NOT NULL,
        charger_voltage TEXT,
        compatible_brands TEXT,
        compatible_models TEXT,
        incompatible_models TEXT,
        notes TEXT,
        FOREIGN KEY (charger_item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F19: تقييم العملاء الائتماني (Customer Trust Score)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS customer_trust_scores (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL UNIQUE,
        total_transactions INTEGER DEFAULT 0,
        on_time_payments INTEGER DEFAULT 0,
        late_payments INTEGER DEFAULT 0,
        returns_count INTEGER DEFAULT 0,
        trust_score REAL DEFAULT 50,
        risk_level TEXT DEFAULT 'STANDARD',
        last_calculated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
    `);

    // ========================================
    // F20: حصر النثريات والهدايا الترويجية
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS promotional_giveaways (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        sale_id TEXT,
        item_id TEXT,
        item_name TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        unit_cost REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        campaign_name TEXT,
        given_to_customer TEXT,
        given_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (sale_id) REFERENCES sales(id)
      );
    `);

    // ========================================
    // F21: مراقبة هامش الربح الحدي (Margin Erosion Alert)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS margin_alerts (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_name TEXT,
        original_price REAL DEFAULT 0,
        final_sale_price REAL DEFAULT 0,
        purchase_price REAL DEFAULT 0,
        margin_pct REAL DEFAULT 0,
        alert_level TEXT DEFAULT 'WARNING',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    // ========================================
    // F22: تتبع البضاعة المعارة للتجربة
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS loaner_items (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        loaned_to_customer_id TEXT,
        loaned_to_name TEXT,
        loaned_to_phone TEXT,
        loaned_at TEXT DEFAULT (datetime('now')),
        due_date TEXT,
        returned_at TEXT,
        deposit_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'OUT',
        notes TEXT,
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (loaned_to_customer_id) REFERENCES customers(id)
      );
    `);

    // ========================================
    // F23: توليد عروض التصفية التلقائية
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS clearance_rules (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        trigger_condition TEXT NOT NULL,
        days_without_sale INTEGER DEFAULT 90,
        auto_discount_pct REAL DEFAULT 20,
        max_discount_pct REAL DEFAULT 50,
        is_active INTEGER DEFAULT 1,
        last_run_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F24: إدارة الشحنات الجزئية للموردين
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS partial_shipments (
        id TEXT PRIMARY KEY,
        po_id TEXT NOT NULL,
        supplier_name TEXT NOT NULL,
        shipment_number TEXT,
        items_json TEXT NOT NULL,
        expected_quantity INTEGER DEFAULT 0,
        received_quantity INTEGER DEFAULT 0,
        shipment_status TEXT DEFAULT 'PARTIAL',
        received_at TEXT DEFAULT (datetime('now')),
        notes TEXT,
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
      );
    `);

    // ========================================
    // F25: مزامنة أسعار السوق المتقلبة
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_price_adjustments (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        category TEXT,
        adjustment_pct REAL NOT NULL DEFAULT 0,
        applied_items_count INTEGER DEFAULT 0,
        reason TEXT,
        applied_by_user_id TEXT,
        applied_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    console.log('[Migration 008] Retail POS 25 Ideas tables created successfully');
  }
};
