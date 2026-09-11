import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { CurrencyUtils } from './currency';

export interface CartItem {
  item_id: string;
  name?: string;
  unit_price: number;
  quantity: number;
}

export interface DiscountEvaluationRequest {
  items: CartItem[];
  customer_id?: string;
  customer_tier?: string;
  coupon_code?: string;
  user_role?: string;
  manual_discount?: number;
  manual_discount_type?: 'FIXED' | 'PERCENTAGE';
}

export interface AppliedRule {
  id: string;
  name: string;
  effect_type: 'PERCENTAGE' | 'FIXED';
  effect_value: number;
  discount_amount: number;
  reason: string;
}

export class DiscountService {
  /**
   * Seed default rules if table is empty
   */
  static initDefaultRules() {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS discount_rules (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          condition_type TEXT NOT NULL,
          condition_value TEXT,
          min_qty INTEGER DEFAULT 0,
          customer_tier TEXT,
          time_start TEXT,
          time_end TEXT,
          coupon_code TEXT,
          effect_type TEXT NOT NULL,
          effect_value REAL NOT NULL,
          max_discount_pct REAL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const count = db.prepare('SELECT COUNT(*) as cnt FROM discount_rules').get() as { cnt: number };
      if (count.cnt === 0) {
        const insert = db.prepare(`
          INSERT INTO discount_rules (
            id, name, condition_type, condition_value, min_qty, customer_tier,
            time_start, time_end, coupon_code, effect_type, effect_value, max_discount_pct, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `);

        insert.run('rule-vip', 'خصم العملاء المميزين (VIP Tier)', 'TIER', 'VIP', 0, 'VIP', null, null, null, 'PERCENTAGE', 10, 15);
        insert.run('rule-bulk', 'خصم الكميات (5 قطع فأكثر)', 'QTY', '5', 5, null, null, null, null, 'PERCENTAGE', 7, 10);
        insert.run('rule-coupon-save10', 'كوبون الخصم الترحيبي (SAVE10)', 'COUPON', 'SAVE10', 0, null, null, null, 'SAVE10', 'PERCENTAGE', 10, 10);
        insert.run('rule-coupon-summer', 'عرض الصيف (SUMMER2026)', 'COUPON', 'SUMMER2026', 0, null, null, null, 'SUMMER2026', 'FIXED', 100, 20);
      }
    } catch (e) {
      console.error('[DiscountService] Error initializing default rules:', e);
    }
  }

  /**
   * Get maximum allowed discount percentage for a role
   */
  static getRoleMaxDiscountPct(role?: string): number {
    const r = (role || 'CASHIER').toUpperCase();
    if (r === 'ADMIN' || r === 'SUPERADMIN' || r === 'OWNER') {
      return 100; // Unlimited
    }
    if (r === 'MANAGER' || r === 'SUPERVISOR') {
      return 30; // 30% max
    }
    // Default to Cashier limit
    return 10; // 10% max
  }

  /**
   * Evaluate discount rules for cart and enforce role limits
   */
  static evaluateCart(req: DiscountEvaluationRequest) {
    this.initDefaultRules();

    const items = req.items || [];
    let subtotalPiastres = 0;
    let totalQuantity = 0;

    for (const itm of items) {
      const qty = Math.max(0, itm.quantity || 1);
      totalQuantity += qty;
      subtotalPiastres += CurrencyUtils.lineTotalPiastres(itm.unit_price, qty);
    }

    const subtotal = CurrencyUtils.fromPiastres(subtotalPiastres);
    if (subtotal <= 0) {
      return {
        subtotal: 0,
        discount: 0,
        final_total: 0,
        effective_discount_pct: 0,
        applied_rules: [],
        role_limit_applied: false,
        max_allowed_pct: this.getRoleMaxDiscountPct(req.user_role)
      };
    }

    // Determine customer tier from DB if customer_id provided
    let customerTier = req.customer_tier;
    if (!customerTier && req.customer_id) {
      try {
        const cust = db.prepare('SELECT tag FROM customers WHERE id = ?').get(req.customer_id) as any;
        if (cust?.tag) customerTier = cust.tag;
      } catch (e) {
        // ignore
      }
    }

    // Fetch active rules
    const rules = db.prepare('SELECT * FROM discount_rules WHERE is_active = 1').all() as any[];
    const appliedRules: AppliedRule[] = [];
    let ruleDiscountPiastres = 0;

    const now = new Date();
    const currentHour = now.getHours();

    for (const rule of rules) {
      let isMatch = true;
      let matchReason = '';

      // 1. Min Qty Check
      if (rule.min_qty > 0) {
        if (totalQuantity < rule.min_qty) {
          isMatch = false;
        } else {
          matchReason += `الكمية الإجمالية (${totalQuantity}) تطابق الحد الأدنى (${rule.min_qty}). `;
        }
      }

      // 2. Customer Tier Check
      if (isMatch && rule.customer_tier) {
        if (!customerTier || customerTier.toUpperCase() !== rule.customer_tier.toUpperCase()) {
          isMatch = false;
        } else {
          matchReason += `فئة العميل (${customerTier}) مطابقة. `;
        }
      }

      // 3. Time Window Check (e.g. '10:00', '14:00' or ISO)
      if (isMatch && rule.time_start && rule.time_end) {
        try {
          const startHour = parseInt(rule.time_start.split(':')[0], 10);
          const endHour = parseInt(rule.time_end.split(':')[0], 10);
          if (currentHour < startHour || currentHour >= endHour) {
            isMatch = false;
          } else {
            matchReason += `الوقت الحالي (${currentHour}:00) داخل فترة العرض. `;
          }
        } catch {
          // ignore time parse error
        }
      }

      // 4. Coupon Code Check
      if (isMatch && rule.coupon_code) {
        if (!req.coupon_code || req.coupon_code.trim().toUpperCase() !== rule.coupon_code.toUpperCase()) {
          isMatch = false;
        } else {
          matchReason += `كود الخصم (${req.coupon_code}) صحيح. `;
        }
      }

      // If condition_type is COUPON and no coupon code was entered, do not match
      if (rule.condition_type === 'COUPON' && !rule.coupon_code) {
        isMatch = false;
      }

      if (isMatch) {
        let discPiastres = 0;
        if (rule.effect_type === 'PERCENTAGE') {
          discPiastres = CurrencyUtils.calculateDiscountPiastres(subtotalPiastres, 'PERCENTAGE', rule.effect_value);
        } else {
          discPiastres = CurrencyUtils.toPiastres(rule.effect_value);
        }

        // Cap rule discount if max_discount_pct is defined
        if (rule.max_discount_pct && rule.max_discount_pct > 0) {
          const maxPiastres = Math.round((subtotalPiastres * rule.max_discount_pct) / 100);
          discPiastres = Math.min(discPiastres, maxPiastres);
        }

        discPiastres = Math.min(discPiastres, subtotalPiastres - ruleDiscountPiastres);
        if (discPiastres > 0) {
          ruleDiscountPiastres += discPiastres;
          appliedRules.push({
            id: rule.id,
            name: rule.name,
            effect_type: rule.effect_type,
            effect_value: rule.effect_value,
            discount_amount: CurrencyUtils.fromPiastres(discPiastres),
            reason: matchReason.trim()
          });
        }
      }
    }

    // Manual discount input
    let manualDiscountPiastres = 0;
    if (req.manual_discount && req.manual_discount > 0) {
      if (req.manual_discount_type === 'PERCENTAGE') {
        manualDiscountPiastres = CurrencyUtils.calculateDiscountPiastres(subtotalPiastres, 'PERCENTAGE', req.manual_discount);
      } else {
        manualDiscountPiastres = CurrencyUtils.toPiastres(req.manual_discount);
      }
    }

    let totalDiscountPiastres = ruleDiscountPiastres + manualDiscountPiastres;

    // Enforce role limits
    const maxAllowedPct = this.getRoleMaxDiscountPct(req.user_role);
    const maxAllowedPiastres = Math.round((subtotalPiastres * maxAllowedPct) / 100);
    let roleLimitApplied = false;

    if (totalDiscountPiastres > maxAllowedPiastres) {
      totalDiscountPiastres = maxAllowedPiastres;
      roleLimitApplied = true;
    }

    totalDiscountPiastres = Math.min(subtotalPiastres, Math.max(0, totalDiscountPiastres));
    const finalTotalPiastres = subtotalPiastres - totalDiscountPiastres;

    const discountAmount = CurrencyUtils.fromPiastres(totalDiscountPiastres);
    const finalTotal = CurrencyUtils.fromPiastres(finalTotalPiastres);
    const effectivePct = subtotal > 0 ? Math.round((discountAmount / subtotal) * 10000) / 100 : 0;

    return {
      subtotal,
      discount: discountAmount,
      final_total: finalTotal,
      effective_discount_pct: effectivePct,
      applied_rules: appliedRules,
      role_limit_applied: roleLimitApplied,
      max_allowed_pct: maxAllowedPct
    };
  }
}
