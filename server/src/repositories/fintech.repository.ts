import db from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

export class FintechRepository {
  // Automated SMS TxID Matching (Dev Proposal 22)
  static parseAndMatchSms(smsBody: string, expectedInvoiceOrTicketId?: string) {
    // Regex patterns for Egyptian payment gateways and E-Wallets
    // Examples:
    // Vodafone Cash: "تم تحويل 500.00 جنيه إلى 01012345678 بنجاح. رقم المعاملة: 98124501"
    // InstaPay: "Successful transfer of EGP 1,200.00 to account ... Ref: IP74829103"
    // Orange Cash: "تم استلام مبلغ 350.00 ج.م من 012... كود التحويل 445210"

    let amount = 0;
    let txId = '';
    let senderPhone = '';
    let provider = 'UNKNOWN';

    // Match amount
    const amtMatch = smsBody.match(/(?:EGP|جنيه|مبلغ|ج\.م)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:EGP|جنيه|ج\.م)/i);
    if (amtMatch) {
      const rawAmt = (amtMatch[1] || amtMatch[2]).replace(/,/g, '');
      amount = parseFloat(rawAmt);
    }

    // Match transaction reference ID
    const refMatch = smsBody.match(/(?:Ref|رقم المعاملة|كود التحويل|TxID|رقم العملية)[:\s#]*([A-Z0-9]{6,16})/i);
    if (refMatch) {
      txId = refMatch[1].trim();
    }

    // Match phone (support 010... as well as 2010... or +2010...)
    const phoneMatch = smsBody.match(/(?:\+?20|0)?(10|11|12|15)\d{8}\b/);
    if (phoneMatch) {
      // Normalize to 01xxxxxxxxx
      const fullDigits = phoneMatch[0].replace(/^\+?20/, '0');
      senderPhone = fullDigits.startsWith('0') ? fullDigits : `0${fullDigits}`;
    }

    // Detect provider
    if (smsBody.includes('فودافون') || smsBody.includes('Vodafone') || senderPhone.startsWith('010')) {
      provider = 'VODAFONE_CASH';
    } else if (smsBody.includes('انستاباي') || smsBody.includes('InstaPay') || smsBody.includes('IP')) {
      provider = 'INSTAPAY';
    } else if (smsBody.includes('أورنج') || smsBody.includes('Orange') || senderPhone.startsWith('012')) {
      provider = 'ORANGE_CASH';
    } else if (smsBody.includes('اتصالات') || smsBody.includes('Etisalat') || senderPhone.startsWith('011')) {
      provider = 'ETISALAT_CASH';
    }

    // Check if duplicate transaction
    const existingTx = txId ? db.prepare('SELECT id FROM fintech_transactions WHERE reference_tx_id = ?').get(txId) : null;
    if (existingTx) {
      return {
        matched: false,
        error: `DUPLICATE_TXID: Transaction ID ${txId} was already claimed and settled previously.`,
        provider,
        amount,
        txId
      };
    }

    // Attempt matching against pending sale or ticket
    let matchedEntity = null;
    if (expectedInvoiceOrTicketId) {
      const sale = db.prepare('SELECT id, invoice_number, total FROM sales WHERE id = ? OR CAST(invoice_number AS TEXT) = ?').get(expectedInvoiceOrTicketId, expectedInvoiceOrTicketId) as any;
      if (sale) {
        const diff = Math.abs(sale.total - amount);
        matchedEntity = { type: 'SALE', id: sale.id, invoice: sale.invoice_number, amountDue: sale.total, difference: diff, isExact: diff < 0.01 };
      } else {
        const ticket = db.prepare('SELECT id, ticket_number, estimated_cost FROM repair_tickets WHERE id = ? OR CAST(ticket_number AS TEXT) = ?').get(expectedInvoiceOrTicketId, expectedInvoiceOrTicketId) as any;
        if (ticket) {
          const diff = Math.abs(ticket.estimated_cost - amount);
          matchedEntity = { type: 'REPAIR_TICKET', id: ticket.id, ticketNumber: ticket.ticket_number, amountDue: ticket.estimated_cost, difference: diff, isExact: diff < 0.01 };
        }
      }
    }

    return {
      matched: Boolean(txId && amount > 0),
      provider,
      amount,
      txId,
      senderPhone,
      matchedEntity,
      verifiedAt: new Date().toISOString()
    };
  }

  // Dual-Custody Shift Rebalancing (Dev Proposal 23)
  static dualCustodyRebalance(data: {
    shift_id: string;
    cashier_user_id: string;
    cashier_pin: string;
    manager_user_id: string;
    manager_pin: string;
    rebalance_amount: number;
    rebalance_type: 'SAFE_DROP' | 'DRAWER_REPLENISH';
    reason: string;
  }) {
    // 1. Verify Cashier Credentials
    const cashier = db.prepare('SELECT * FROM users WHERE id = ?').get(data.cashier_user_id) as any;
    if (!cashier) throw new Error('Cashier user not found');
    const cashierMatch = cashier.password.startsWith('$2')
      ? bcrypt.compareSync(data.cashier_pin, cashier.password)
      : cashier.password === data.cashier_pin;
    if (!cashierMatch) throw new Error('Invalid Cashier authorization credentials');

    // 2. Verify Manager Credentials
    const manager = db.prepare('SELECT * FROM users WHERE id = ?').get(data.manager_user_id) as any;
    if (!manager || !['SuperAdmin', 'Manager'].includes(manager.role)) {
      throw new Error('Manager authorization required. Provided user lacks supervisory privileges.');
    }
    const managerMatch = manager.password.startsWith('$2')
      ? bcrypt.compareSync(data.manager_pin, manager.password)
      : manager.password === data.manager_pin;
    if (!managerMatch) throw new Error('Invalid Manager supervisor credentials');

    // 3. Update Shift Cash
    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(data.shift_id) as any;
    if (!shift) throw new Error('Active shift not found');

    const amountDelta = data.rebalance_type === 'SAFE_DROP' ? -data.rebalance_amount : data.rebalance_amount;
    db.prepare(`
      UPDATE shifts
      SET expected_cash = expected_cash + ?,
          handover_notes = COALESCE(handover_notes, '') || ?
      WHERE id = ?
    `).run(
      amountDelta,
      `\n[DUAL-CUSTODY REBALANCE] ${data.rebalance_type} of ${data.rebalance_amount} EGP authorized by Cashier ${cashier.name} and Manager ${manager.name}. Reason: ${data.reason}`,
      data.shift_id
    );

    return {
      success: true,
      message: `Dual-custody ${data.rebalance_type} of ${data.rebalance_amount} EGP confirmed.`,
      shiftId: data.shift_id,
      authorizedBy: { cashier: cashier.name, manager: manager.name }
    };
  }

  // Fintech Monthly Ceiling Alerts (Dev Proposal 24)
  static getCeilingAlerts() {
    const wallets = db.prepare('SELECT * FROM fintech_wallets WHERE deleted_at IS NULL').all() as any[];

    return wallets.map(w => {
      const dailyRatio = w.daily_usage / (w.daily_limit || 1);
      const monthlyRatio = w.monthly_usage / (w.monthly_limit || 1);
      const isDailyExceeded = dailyRatio >= 0.95;
      const isMonthlyExceeded = monthlyRatio >= 0.95;

      return {
        id: w.id,
        provider_name: w.provider_name,
        wallet_number: w.wallet_number,
        current_balance: w.current_balance,
        daily_usage: w.daily_usage,
        daily_limit: w.daily_limit,
        dailyPercentage: Number((dailyRatio * 100).toFixed(1)),
        monthly_usage: w.monthly_usage,
        monthly_limit: w.monthly_limit,
        monthlyPercentage: Number((monthlyRatio * 100).toFixed(1)),
        isLocked: Boolean(w.is_locked),
        alertSeverity: (isDailyExceeded || isMonthlyExceeded) ? 'CRITICAL_HARD_LOCK' : (dailyRatio >= 0.85 || monthlyRatio >= 0.85) ? 'WARNING_HIGH' : 'NORMAL'
      };
    });
  }

  // Cost Centers for Multi-Branches (Dev Proposal 25)
  static getCostCenters(branchId?: string) {
    let query = 'SELECT * FROM cost_centers WHERE is_active = 1';
    const params: any[] = [];
    if (branchId) {
      query += ' AND branch_id = ?';
      params.push(branchId);
    }
    return db.prepare(query).all(...params);
  }

  static createCostCenter(data: { branch_id?: string; code: string; name: string; department: string; budget_allocated: number }) {
    const id = `cc-${uuidv4().substring(0, 8)}`;
    db.prepare(`
      INSERT INTO cost_centers (id, branch_id, code, name, department, budget_allocated, budget_spent)
      VALUES (?, ?, ?, ?, ?, ?, 0.0)
    `).run(id, data.branch_id || 'WH-MAIN', data.code, data.name, data.department, data.budget_allocated);
    return id;
  }
}
