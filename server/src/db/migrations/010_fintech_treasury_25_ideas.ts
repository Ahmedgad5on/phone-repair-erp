import type { Database } from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

export const migration010: Migration = {
  version: 10,
  name: '010_fintech_treasury_25_ideas',
  up: (db: Database) => {
    // ========================================
    // F1: التنبؤ بالعجز النقدي في المحافظ (Liquidity Forecasting)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS liquidity_forecasts (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        forecast_date TEXT NOT NULL,
        projected_balance REAL DEFAULT 0,
        projected_deficit REAL DEFAULT 0,
        payroll_due_date TEXT,
        payroll_amount REAL DEFAULT 0,
        alert_level TEXT DEFAULT 'NORMAL',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F2: شريط استهلاك الليمت التفاعلي (Dynamic Limit Progress Bar)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS wallet_limit_usage (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        usage_date TEXT NOT NULL,
        daily_usage REAL DEFAULT 0,
        monthly_usage REAL DEFAULT 0,
        daily_limit REAL DEFAULT 0,
        monthly_limit REAL DEFAULT 0,
        daily_pct REAL DEFAULT 0,
        monthly_pct REAL DEFAULT 0,
        is_locked INTEGER DEFAULT 0,
        recorded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (wallet_id) REFERENCES fintech_wallets(id)
      );
    `);

    // ========================================
    // F3: منع السحب بدون كود المعاملة (Reference TxID Enforcement)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS transaction_reference_log (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        reference_tx_id TEXT NOT NULL,
        reference_type TEXT,
        verified INTEGER DEFAULT 0,
        verified_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (transaction_id) REFERENCES fintech_transactions(id)
      );
    `);

    // ========================================
    // F4: المطابقة الآلية لكشوف الحساب (Instant Statement Reconciliation)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS statement_reconciliation (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        statement_date TEXT NOT NULL,
        total_entries INTEGER DEFAULT 0,
        matched_entries INTEGER DEFAULT 0,
        unmatched_entries INTEGER DEFAULT 0,
        match_rate_pct REAL DEFAULT 0,
        reconciliation_status TEXT DEFAULT 'PENDING',
        reconciled_by_user_id TEXT,
        reconciled_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );

      CREATE TABLE IF NOT EXISTS statement_entries (
        id TEXT PRIMARY KEY,
        reconciliation_id TEXT NOT NULL,
        entry_date TEXT,
        reference TEXT,
        description TEXT,
        amount REAL DEFAULT 0,
        matched_transaction_id TEXT,
        match_status TEXT DEFAULT 'UNMATCHED',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (reconciliation_id) REFERENCES statement_reconciliation(id)
      );
    `);

    // ========================================
    // F5: جرد ماكينات الدفع الموحد
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_terminal_reconciliation (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        terminal_name TEXT,
        shift_id TEXT,
        opening_balance REAL DEFAULT 0,
        closing_balance REAL DEFAULT 0,
        expected_sales REAL DEFAULT 0,
        actual_sales REAL DEFAULT 0,
        variance REAL DEFAULT 0,
        commission_earned REAL DEFAULT 0,
        reconciliation_status TEXT DEFAULT 'PENDING',
        reconciled_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (shift_id) REFERENCES shifts(id)
      );
    `);

    // ========================================
    // F6: مؤشر العملاء ذوي العمليات المشبوهة (AML & Fraud Flag)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS suspicious_activity_log (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        customer_phone TEXT,
        customer_id TEXT,
        activity_type TEXT NOT NULL,
        risk_score INTEGER DEFAULT 0,
        transaction_ids TEXT,
        description TEXT,
        flagged_at TEXT DEFAULT (datetime('now')),
        reviewed INTEGER DEFAULT 0,
        reviewed_by_user_id TEXT,
        reviewed_at TEXT,
        resolution TEXT,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F7: إلزام الجرد الثلاثي لإغلاق الوردية
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS triple_reconciliation (
        id TEXT PRIMARY KEY,
        shift_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        cash_drawer_balance REAL DEFAULT 0,
        digital_wallet_balance REAL DEFAULT 0,
        repair_devices_received INTEGER DEFAULT 0,
        total_expected REAL DEFAULT 0,
        total_actual REAL DEFAULT 0,
        variance REAL DEFAULT 0,
        reconciliation_status TEXT DEFAULT 'PENDING',
        reconciled_by_user_id TEXT,
        reconciled_at TEXT,
        FOREIGN KEY (shift_id) REFERENCES shifts(id),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F8: تقفيل الشفت المشروط بموافقة المستلم (Cascading Handover Acceptance)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS shift_handover_log (
        id TEXT PRIMARY KEY,
        shift_id TEXT NOT NULL,
        handed_by_user_id TEXT NOT NULL,
        accepted_by_user_id TEXT,
        handover_status TEXT DEFAULT 'PENDING',
        cash_variance REAL DEFAULT 0,
        digital_variance REAL DEFAULT 0,
        repair_variance INTEGER DEFAULT 0,
        deficit_transferred_to_user_id TEXT,
        accepted_at TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (shift_id) REFERENCES shifts(id),
        FOREIGN KEY (handed_by_user_id) REFERENCES users(id),
        FOREIGN KEY (accepted_by_user_id) REFERENCES users(id)
      );
    `);

    // ========================================
    // F9: حساب صافي عائد تدوير الجنيه (Cash Velocity Return)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_velocity_log (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        wallet_id TEXT NOT NULL,
        week_start_date TEXT NOT NULL,
        capital_deployed REAL DEFAULT 0,
        total_transactions INTEGER DEFAULT 0,
        total_volume REAL DEFAULT 0,
        total_commissions_earned REAL DEFAULT 0,
        velocity_ratio REAL DEFAULT 0,
        calculated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (wallet_id) REFERENCES fintech_wallets(id)
      );
    `);

    // ========================================
    // F10: التنبيه باقتراب صلاحية خطوط المحافظ
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS wallet_line_expiry (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        line_number TEXT NOT NULL,
        provider TEXT NOT NULL,
        activation_date TEXT,
        expiry_date TEXT,
        days_until_expiry INTEGER DEFAULT 0,
        alert_sent INTEGER DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        FOREIGN KEY (wallet_id) REFERENCES fintech_wallets(id)
      );
    `);

    // ========================================
    // F11: تحليل أكثر الأرقام تعاملاً (Top Destination Numbers)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS frequent_destination_numbers (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        destination_phone TEXT NOT NULL,
        customer_name TEXT,
        transaction_count INTEGER DEFAULT 0,
        total_volume REAL DEFAULT 0,
        avg_transaction REAL DEFAULT 0,
        last_transaction_date TEXT,
        risk_flag INTEGER DEFAULT 0,
        calculated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F12: حساب تكلفة الفرصة البديلة للنقدية
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS opportunity_cost_analysis (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        analysis_date TEXT NOT NULL,
        cash_in_wallets REAL DEFAULT 0,
        cash_in_inventory REAL DEFAULT 0,
        wallet_commission_rate REAL DEFAULT 0,
        inventory_turnover_days INTEGER DEFAULT 30,
        wallet_weekly_return REAL DEFAULT 0,
        inventory_weekly_return REAL DEFAULT 0,
        best_allocation TEXT,
        calculated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F13: الفصل التام بين درج الصيانة ودرج التحويلات
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_drawer_allocation (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        drawer_type TEXT NOT NULL,
        allocated_amount REAL DEFAULT 0,
        current_balance REAL DEFAULT 0,
        last_reconciled_at TEXT,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F14: احتساب رسوم التحويل الحكومية تلقائياً
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS government_fee_rules (
        id TEXT PRIMARY KEY,
        transaction_type TEXT NOT NULL,
        fee_type TEXT NOT NULL,
        rate_pct REAL DEFAULT 0,
        fixed_amount REAL DEFAULT 0,
        min_amount REAL DEFAULT 0,
        max_amount REAL DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        effective_from TEXT,
        effective_to TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // ========================================
    // F15: مراقبة تسرب الفكة والكسور النقدية (Change Leakage Ledger)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS change_leakage_log (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        shift_id TEXT,
        transaction_type TEXT,
        expected_change REAL DEFAULT 0,
        actual_change_given REAL DEFAULT 0,
        leakage_amount REAL DEFAULT 0,
        recorded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (shift_id) REFERENCES shifts(id)
      );
    `);

    // ========================================
    // F16: نظام القروض المصغرة للعملاء (Customer Micro-Ledger)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS customer_micro_ledger (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount REAL NOT NULL,
        running_balance REAL DEFAULT 0,
        description TEXT,
        related_sale_id TEXT,
        recorded_at TEXT DEFAULT (datetime('now')),
        settled INTEGER DEFAULT 0,
        settled_at TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F17: حظر إجراء المعاملات من خارج الفرع
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS geo_fence_rules (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        allowed_ip_addresses TEXT,
        allowed_mac_addresses TEXT,
        geo_latitude REAL,
        geo_longitude REAL,
        radius_meters INTEGER DEFAULT 100,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F18: تتبع اشتراكات الدونجلات والبوكسات (Dongle ROI Tracker)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_subscriptions (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        tool_type TEXT,
        subscription_cost_yearly REAL DEFAULT 0,
        usage_count INTEGER DEFAULT 0,
        last_used_at TEXT,
        annual_usage_value REAL DEFAULT 0,
        roi_pct REAL DEFAULT 0,
        renewal_date TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F19: توليد إيصال تحويل رقمي عبر واتساب
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS digital_transfer_receipts (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        receipt_data TEXT,
        whatsapp_status TEXT DEFAULT 'PENDING',
        sent_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (transaction_id) REFERENCES fintech_transactions(id)
      );
    `);

    // ========================================
    // F20: حساب تكلفة السحب من الـ ATM
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS atm_withdrawal_costs (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        withdrawal_date TEXT NOT NULL,
        amount_withdrawn REAL DEFAULT 0,
        atm_fee REAL DEFAULT 0,
        transportation_cost REAL DEFAULT 0,
        staff_time_minutes INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0,
        cost_per_egp REAL DEFAULT 0,
        recorded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F21: مؤشر ربحية أنواع الخدمات (Service Profitability Breakdown)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS service_profitability (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        service_type TEXT NOT NULL,
        period_month TEXT NOT NULL,
        total_revenue REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        net_profit REAL DEFAULT 0,
        profit_margin_pct REAL DEFAULT 0,
        transaction_count INTEGER DEFAULT 0,
        calculated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F22: سقف الرصيد النقدي في الدرج (Cash Drawer Threshold)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_drawer_thresholds (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        drawer_type TEXT NOT NULL,
        max_balance REAL DEFAULT 10000,
        alert_threshold_pct REAL DEFAULT 80,
        auto_transfer INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
    `);

    // ========================================
    // F23: كشف العمليات الوهمية الملغاة
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS void_transaction_monitor (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        transaction_type TEXT,
        void_count INTEGER DEFAULT 0,
        total_voided_amount REAL DEFAULT 0,
        time_window_hours INTEGER DEFAULT 24,
        alert_triggered INTEGER DEFAULT 0,
        flagged_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // ========================================
    // F24: متابعة خطوط الكاش متعددة الأسماء
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS wallet_line_registry (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        wallet_id TEXT NOT NULL,
        line_number TEXT NOT NULL,
        registered_name TEXT NOT NULL,
        national_id TEXT,
        phone_number TEXT,
        registration_status TEXT DEFAULT 'ACTIVE',
        last_verified_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (wallet_id) REFERENCES fintech_wallets(id)
      );
    `);

    // ========================================
    // F25: مؤشر زمن إنهاء عملية الكاش (Fintech Service Speed)
    // ========================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS transaction_speed_log (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        cashier_user_id TEXT NOT NULL,
        transaction_type TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_seconds INTEGER DEFAULT 0,
        recorded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id),
        FOREIGN KEY (cashier_user_id) REFERENCES users(id)
      );
    `);

    console.log('[Migration 010] Fintech Treasury 25 Ideas tables created successfully');
  }
};
