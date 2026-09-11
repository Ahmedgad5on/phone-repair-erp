import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { CurrencyUtils } from './currency';
import { WhatsAppService } from '../../services/whatsapp.service';

export interface CreateInstallmentPlanParams {
  sale_id: string;
  customer_id: string;
  total_amount: number;
  down_payment: number;
  interest_rate?: number;
  months: number;
  start_date?: string;
}

export class InstallmentsService {
  /**
   * Create an installment plan and amortized payment schedule
   */
  static createPlan(params: CreateInstallmentPlanParams) {
    const months = Math.max(1, Math.min(60, Math.floor(params.months || 12)));
    const interestRate = Math.max(0, params.interest_rate || 0);

    const totalPiastres = CurrencyUtils.toPiastres(params.total_amount);
    const downPaymentPiastres = Math.min(totalPiastres, CurrencyUtils.toPiastres(params.down_payment));
    const principalPiastres = Math.max(0, totalPiastres - downPaymentPiastres);

    // Financed amount includes markup/interest
    const interestPiastres = Math.round((principalPiastres * interestRate) / 100);
    const financedPiastres = principalPiastres + interestPiastres;
    const baseMonthlyPiastres = Math.floor(financedPiastres / months);

    const planId = `plan-${uuidv4().substring(0, 8)}`;
    const totalAmountEgp = CurrencyUtils.fromPiastres(totalPiastres);
    const downPaymentEgp = CurrencyUtils.fromPiastres(downPaymentPiastres);
    const financedAmountEgp = CurrencyUtils.fromPiastres(financedPiastres);
    const monthlyAmountEgp = CurrencyUtils.fromPiastres(baseMonthlyPiastres);

    const startDate = params.start_date ? new Date(params.start_date) : new Date();

    const insertTx = db.transaction(() => {
      // 1. Insert Plan
      db.prepare(`
        INSERT INTO installment_plans (
          id, sale_id, customer_id, total_amount, down_payment,
          financed_amount, interest_rate, months, monthly_amount, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
      `).run(
        planId,
        params.sale_id,
        params.customer_id,
        totalAmountEgp,
        downPaymentEgp,
        financedAmountEgp,
        interestRate,
        months,
        monthlyAmountEgp
      );

      // 2. Generate Schedule in installment_payments
      const insertPayment = db.prepare(`
        INSERT INTO installment_payments (
          id, plan_id, installment_no, due_date, amount, status
        ) VALUES (?, ?, ?, ?, ?, 'PENDING')
      `);

      let allocatedPiastres = 0;
      for (let i = 1; i <= months; i++) {
        const payId = `pay-${uuidv4().substring(0, 8)}`;
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        const dueDateStr = dueDate.toISOString().substring(0, 10);

        // Account for fractional cents on final installment
        let currentMonthPiastres = baseMonthlyPiastres;
        if (i === months) {
          currentMonthPiastres = financedPiastres - allocatedPiastres;
        } else {
          allocatedPiastres += currentMonthPiastres;
        }

        insertPayment.run(
          payId,
          planId,
          i,
          dueDateStr,
          CurrencyUtils.fromPiastres(currentMonthPiastres)
        );
      }
    });

    insertTx();

    return this.getSchedule(planId);
  }

  /**
   * Get installment schedule by planId or saleId
   */
  static getSchedule(id: string) {
    let plan = db.prepare('SELECT * FROM installment_plans WHERE id = ?').get(id) as any;
    if (!plan) {
      plan = db.prepare('SELECT * FROM installment_plans WHERE sale_id = ?').get(id) as any;
    }
    if (!plan) return null;

    const schedule = db.prepare(`
      SELECT * FROM installment_payments
      WHERE plan_id = ?
      ORDER BY installment_no ASC
    `).all(plan.id) as any[];

    const customer = db.prepare('SELECT id, name, phone FROM customers WHERE id = ?').get(plan.customer_id) as any;

    return {
      plan,
      customer,
      schedule
    };
  }

  /**
   * Record payment of an installment installment
   */
  static payInstallment(paymentId: string, receiptId?: string) {
    const payment = db.prepare('SELECT * FROM installment_payments WHERE id = ?').get(paymentId) as any;
    if (!payment) throw new Error(`Installment payment not found: ${paymentId}`);

    db.prepare(`
      UPDATE installment_payments
      SET status = 'PAID', paid_at = CURRENT_TIMESTAMP, receipt_id = ?
      WHERE id = ?
    `).run(receiptId || null, paymentId);

    // Check if plan is completed
    const pendingCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM installment_payments
      WHERE plan_id = ? AND status = 'PENDING'
    `).get(payment.plan_id) as { cnt: number };

    if (pendingCount.cnt === 0) {
      db.prepare("UPDATE installment_plans SET status = 'COMPLETED' WHERE id = ?").run(payment.plan_id);
    }

    return this.getSchedule(payment.plan_id);
  }

  /**
   * Send WhatsApp reminders for installments due in 2 days
   */
  static sendDueReminders(storeId?: string) {
    const actualStoreId = storeId || (db.prepare('SELECT id FROM stores LIMIT 1').get() as any)?.id || 'store-1';

    // Find payments due in 2 days that are still PENDING
    const duePayments = db.prepare(`
      SELECT ip.*, p.customer_id, p.sale_id, c.name as customer_name, c.phone as customer_phone,
             s.invoice_number
      FROM installment_payments ip
      JOIN installment_plans p ON ip.plan_id = p.id
      JOIN customers c ON p.customer_id = c.id
      LEFT JOIN sales s ON p.sale_id = s.id
      WHERE ip.status = 'PENDING'
        AND date(ip.due_date) <= date('now', '+2 days')
        AND date(ip.due_date) >= date('now')
    `).all() as any[];

    const results = [];

    for (const item of duePayments) {
      if (item.customer_phone) {
        const message = `تذكير بموعد القسط: عميلنا العزيز ${item.customer_name}، نود تذكيركم بميعاد سداد القسط رقم (${item.installment_no}) بقيمة ${item.amount} ج.م المستحق بتاريخ ${item.due_date} الخاص بالفاتورة #${item.invoice_number || ''}. شكراً لاختياركم متجرنا.`;
        try {
          const sent = WhatsAppService.sendNotification(
            actualStoreId,
            item.customer_phone,
            'SALE_INVOICE' as any,
            message
          );
          results.push({
            paymentId: item.id,
            customer: item.customer_name,
            phone: item.customer_phone,
            amount: item.amount,
            dueDate: item.due_date,
            notificationId: sent.id
          });
        } catch (err: any) {
          console.error('[InstallmentReminders] Error sending reminder:', err);
        }
      }
    }

    return {
      sentCount: results.length,
      reminders: results
    };
  }
}
