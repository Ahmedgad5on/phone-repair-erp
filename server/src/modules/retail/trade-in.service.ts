import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { CurrencyUtils } from './currency';

export interface DeviceAssessmentInput {
  device_model: string;
  imei: string;
  brand?: string;
  condition_grade: 'GRADE_A' | 'GRADE_B' | 'GRADE_C' | 'GRADE_D' | 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  battery_health?: number;
  screen_condition?: 'INTACT' | 'SCRATCHED' | 'CRACKED';
  functional_defects?: string[];
  base_market_price?: number;
}

export interface SaveAssessmentParams extends DeviceAssessmentInput {
  customer_id: string;
  assessed_value: number;
  applied_credit?: number;
  invoice_id?: string;
  assessed_by?: string;
  status?: string;
}

export class TradeInService {
  /**
   * Estimate valuation algorithmically based on device model, condition, and defects
   */
  static calculateValuation(input: DeviceAssessmentInput): {
    assessed_value: number;
    base_price: number;
    deductions: Array<{ reason: string; amount: number }>;
    grade_multiplier: number;
  } {
    // Determine baseline market price
    let basePrice = input.base_market_price || 0;
    if (basePrice <= 0) {
      const modelLower = (input.device_model || '').toLowerCase();
      if (modelLower.includes('iphone 15 pro')) basePrice = 36000;
      else if (modelLower.includes('iphone 15')) basePrice = 28000;
      else if (modelLower.includes('iphone 14 pro')) basePrice = 29000;
      else if (modelLower.includes('iphone 14')) basePrice = 22000;
      else if (modelLower.includes('iphone 13 pro')) basePrice = 24000;
      else if (modelLower.includes('iphone 13')) basePrice = 18000;
      else if (modelLower.includes('iphone 12')) basePrice = 14000;
      else if (modelLower.includes('s24')) basePrice = 32000;
      else if (modelLower.includes('s23')) basePrice = 24000;
      else if (modelLower.includes('s22')) basePrice = 17000;
      else basePrice = 8000; // Default baseline for mid-range smart phones
    }

    let gradeMult = 1.0;
    const grade = (input.condition_grade || 'GRADE_B').toUpperCase();
    if (grade === 'GRADE_A' || grade === 'EXCELLENT') {
      gradeMult = 0.95; // 5% trade-in margin
    } else if (grade === 'GRADE_B' || grade === 'GOOD') {
      gradeMult = 0.82;
    } else if (grade === 'GRADE_C' || grade === 'FAIR') {
      gradeMult = 0.68;
    } else {
      gradeMult = 0.45;
    }

    let runningPiastres = CurrencyUtils.toPiastres(basePrice * gradeMult);
    const deductions: Array<{ reason: string; amount: number }> = [];

    // Battery health deduction
    const battery = input.battery_health !== undefined ? input.battery_health : 100;
    if (battery < 80) {
      const battDeductionPiastres = Math.round(runningPiastres * 0.10);
      runningPiastres = Math.max(0, runningPiastres - battDeductionPiastres);
      deductions.push({
        reason: `صحة البطارية منخفضة (${battery}%)`,
        amount: CurrencyUtils.fromPiastres(battDeductionPiastres)
      });
    }

    // Screen condition deduction
    if (input.screen_condition === 'CRACKED') {
      const screenDeductionPiastres = Math.round(runningPiastres * 0.25);
      runningPiastres = Math.max(0, runningPiastres - screenDeductionPiastres);
      deductions.push({
        reason: 'كسر أو شروخ بالشاشة الخارجية',
        amount: CurrencyUtils.fromPiastres(screenDeductionPiastres)
      });
    }

    // Functional defects
    if (input.functional_defects && input.functional_defects.length > 0) {
      for (const defect of input.functional_defects) {
        const defectPiastres = Math.round(runningPiastres * 0.08);
        runningPiastres = Math.max(0, runningPiastres - defectPiastres);
        deductions.push({
          reason: `عطل فني: ${defect}`,
          amount: CurrencyUtils.fromPiastres(defectPiastres)
        });
      }
    }

    const assessedValue = CurrencyUtils.fromPiastres(runningPiastres);

    return {
      assessed_value: assessedValue,
      base_price: basePrice,
      deductions,
      grade_multiplier: gradeMult
    };
  }

  /**
   * Record trade-in assessment in database
   */
  static recordAssessment(params: SaveAssessmentParams) {
    const id = `trade-${uuidv4().substring(0, 8)}`;
    const assessedValue = CurrencyUtils.fromPiastres(CurrencyUtils.toPiastres(params.assessed_value));
    const appliedCredit = CurrencyUtils.fromPiastres(CurrencyUtils.toPiastres(params.applied_credit || params.assessed_value));

    db.prepare(`
      INSERT INTO trade_in_assessments (
        id, invoice_id, customer_id, device_model, imei, condition_grade,
        assessed_value, applied_credit, status, assessed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.invoice_id || null,
      params.customer_id,
      params.device_model,
      params.imei,
      params.condition_grade,
      assessedValue,
      appliedCredit,
      params.status || 'APPLIED',
      params.assessed_by || 'Main Cashier'
    );

    return db.prepare('SELECT * FROM trade_in_assessments WHERE id = ?').get(id);
  }

  /**
   * Link trade-in assessment to a completed sale invoice
   */
  static linkToInvoice(assessmentId: string, invoiceId: string) {
    db.prepare(`
      UPDATE trade_in_assessments
      SET invoice_id = ?, status = 'APPLIED'
      WHERE id = ?
    `).run(invoiceId, assessmentId);
  }
}
