import db from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { wsService } from '../services/ws.service';

export interface CfdCartState {
  storeName: string;
  cashierName: string;
  customerName?: string;
  items: Array<{
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod?: string;
  instaPayQrUrl?: string;
  loyaltyPointsEarned?: number;
  promotionalBanner?: string;
}

export interface LoanerPhone {
  id?: string;
  brand: string;
  model: string;
  imei: string;
  condition?: string;
  deposit_amount?: number;
  status?: string;
  current_ticket_id?: string;
  loaned_to_customer_id?: string;
  loaned_at?: string;
  due_date?: string;
  returned_at?: string;
  notes?: string;
}

// In-memory CFD state buffer
let currentCfdState: CfdCartState = {
  storeName: 'Mobile Tech Lab & POS',
  cashierName: 'Main Cashier',
  items: [],
  subtotal: 0,
  tax: 0,
  discount: 0,
  total: 0,
  promotionalBanner: 'Welcome to our Lab! 30-Day Limited Warranty on all repairs.'
};

export class SalesRepository {
  // Dual-Screen Customer Facing Display (CFD) (Dev Proposal 8)
  static updateCfdCart(cartState: CfdCartState) {
    currentCfdState = { ...cartState };
    wsService.broadcast('CFD_CART_UPDATE', currentCfdState);
    return currentCfdState;
  }

  static getCfdState() {
    return currentCfdState;
  }

  // Loaner Phones Management (Dev Proposal 13)
  static getLoanerPhones(status?: string) {
    let query = `
      SELECT l.*, c.name as customer_name, c.phone as customer_phone, t.ticket_number
      FROM loaner_phones l
      LEFT JOIN customers c ON l.loaned_to_customer_id = c.id
      LEFT JOIN repair_tickets t ON l.current_ticket_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (status) {
      query += ' AND l.status = ?';
      params.push(status);
    }
    query += ' ORDER BY l.brand ASC, l.model ASC';
    return db.prepare(query).all(...params);
  }

  static checkoutLoaner(loanerId: string, ticketId: string, customerId: string, depositAmount: number, dueDate?: string) {
    const loaner = db.prepare('SELECT * FROM loaner_phones WHERE id = ?').get(loanerId) as any;
    if (!loaner || loaner.status !== 'AVAILABLE') {
      throw new Error('Loaner phone is not available for checkout');
    }

    const loanedAt = new Date().toISOString();
    const defaultDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE loaner_phones
      SET status = 'LOANED',
          current_ticket_id = ?,
          loaned_to_customer_id = ?,
          deposit_amount = ?,
          loaned_at = ?,
          due_date = ?,
          returned_at = NULL
      WHERE id = ?
    `).run(ticketId, customerId, depositAmount, loanedAt, dueDate || defaultDue, loanerId);

    return { success: true, message: 'Loaner device handed over to customer', loanerId };
  }

  static checkinLoaner(loanerId: string, returnCondition?: string, refundDeposit: boolean = true) {
    const loaner = db.prepare('SELECT * FROM loaner_phones WHERE id = ?').get(loanerId) as any;
    if (!loaner) throw new Error('Loaner phone not found');

    const returnedAt = new Date().toISOString();

    db.prepare(`
      UPDATE loaner_phones
      SET status = 'AVAILABLE',
          condition = COALESCE(?, condition),
          returned_at = ?,
          current_ticket_id = NULL,
          loaned_to_customer_id = NULL
      WHERE id = ?
    `).run(returnCondition || null, returnedAt, loanerId);

    return {
      success: true,
      message: 'Loaner phone returned and verified',
      refundedDeposit: refundDeposit ? loaner.deposit_amount : 0
    };
  }

  // Simulated OCR ID & Warranty Scanner (Dev Proposal 14)
  static parseOcrDocument(rawTextOrImageTag: string) {
    // Simulated high-accuracy OCR parser for Egyptian National IDs and Warranty cards
    const nationalIdMatch = rawTextOrImageTag.match(/\b(2|3)\d{13}\b/);
    const imeiMatch = rawTextOrImageTag.match(/\b\d{15}\b/);
    const phoneMatch = rawTextOrImageTag.match(/\b(010|011|012|015)\d{8}\b/);

    const nationalId = nationalIdMatch ? nationalIdMatch[0] : null;
    let birthDate = null;
    let governorate = null;

    if (nationalId && nationalId.length === 14) {
      const century = nationalId[0] === '2' ? '19' : '20';
      const year = century + nationalId.substring(1, 3);
      const month = nationalId.substring(3, 5);
      const day = nationalId.substring(5, 7);
      birthDate = `${year}-${month}-${day}`;

      const govCode = nationalId.substring(7, 9);
      const govMap: Record<string, string> = {
        '01': 'Cairo (القاهرة)',
        '02': 'Alexandria (الإسكندرية)',
        '03': 'Port Said (بورسعيد)',
        '04': 'Suez (السويس)',
        '11': 'Damietta (دمياط)',
        '12': 'Dakahlia (الدقهلية)',
        '13': 'Ash Sharqia (الشرقية)',
        '14': 'Qalyubia (القليوبية)',
        '15': 'Kafr El Sheikh (كفر الشيخ)',
        '16': 'Gharbia (الغربية)',
        '17': 'Monufia (المنوفية)',
        '18': 'Beheira (البحيرة)',
        '19': 'Ismailia (الإسماعيلية)',
        '21': 'Giza (الجيزة)',
        '22': 'Beni Suef (بني سويف)',
        '23': 'Faiyum (الفيوم)',
        '24': 'Minya (المنيا)',
        '25': 'Asyut (أسيوط)',
        '26': 'Sohag (سوهاج)',
        '27': 'Qena (قنا)',
        '28': 'Aswan (أسوان)',
        '29': 'Luxor (الأقصر)',
        '31': 'Red Sea (البحر الأحمر)',
        '32': 'New Valley (الوادي الجديد)',
        '33': 'Matrouh (مطروح)',
        '34': 'North Sinai (شمال سيناء)',
        '35': 'South Sinai (جنوب سيناء)',
        '88': 'Born Abroad (الخارج)'
      };
      governorate = govMap[govCode] || 'Other Governorates (المحافظات الأخرى)';
    }

    return {
      extractedNationalId: nationalId,
      birthDate,
      governorate,
      extractedImei: imeiMatch ? imeiMatch[0] : null,
      extractedPhone: phoneMatch ? phoneMatch[0] : null,
      confidenceScore: nationalId || imeiMatch ? 0.98 : 0.45
    };
  }

  // Smart Dynamic e-Receipt Builder (Dev Proposal 12)
  static generateDynamicReceipt(saleId: string) {
    const sale = db.prepare(`
      SELECT s.*, c.name as customer_name, c.phone as customer_phone, u.name as cashier_name, st.name as store_name, st.phone as store_phone, st.address as store_address
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.cashier_user_id = u.id
      CROSS JOIN stores st
      WHERE s.id = ?
    `).get(saleId) as any;

    if (!sale) throw new Error(`Sale not found: ${saleId}`);

    const items = db.prepare(`
      SELECT si.*, i.name as item_name, i.sku, im.imei
      FROM sale_items si
      JOIN items i ON si.item_id = i.id
      LEFT JOIN imei_records im ON si.imei_id = im.id
      WHERE si.sale_id = ?
    `).all(saleId);

    const liveTrackerUrl = `https://erp.local/track/receipt/${sale.invoice_number}`;
    const qrPayload = `INVOICE:${sale.invoice_number}|AMT:${sale.total}|DATE:${sale.created_at}`;

    return {
      sale,
      items,
      liveTrackerUrl,
      qrPayload,
      shareLinks: {
        whatsapp: `https://wa.me/${sale.customer_phone?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Dear ${sale.customer_name}, thank you for visiting ${sale.store_name}. View your digital receipt here: ${liveTrackerUrl}`)}`
      }
    };
  }

  // Manager Override Token (Maint Proposal 56)
  static generateOverrideToken(managerId: string, reason: string, discountPct: number = 0) {
    const token = crypto.randomInt(100000, 999999).toString();
    const id = `ovr-${uuidv4().substring(0, 8)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15-minute expiry

    db.prepare(`
      INSERT INTO manager_override_tokens (id, token, reason, manager_id, discount_pct, max_uses, uses_count, expires_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?)
    `).run(id, token, reason, managerId, discountPct, expiresAt);

    return { token, expiresAt, reason };
  }

  static validateAndConsumeOverrideToken(token: string) {
    const record = db.prepare(`
      SELECT * FROM manager_override_tokens
      WHERE token = ? AND uses_count < max_uses
    `).get(token) as any;

    if (!record) {
      return { valid: false, error: 'Invalid or expired manager override token' };
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return { valid: false, error: 'Override token has expired' };
    }

    db.prepare('UPDATE manager_override_tokens SET uses_count = uses_count + 1 WHERE id = ?').run(record.id);

    return {
      valid: true,
      reason: record.reason,
      discount_pct: record.discount_pct,
      manager_id: record.manager_id
    };
  }

  // Optimistic Concurrency Locking (Maint Proposal 59)
  static updateWithOptimisticLock(table: 'repair_tickets' | 'items' | 'sales', id: string, expectedVersion: number, updates: Record<string, any>) {
    const allowedTables = ['repair_tickets', 'items', 'sales'];
    if (!allowedTables.includes(table)) {
      throw new Error(`Invalid table name for optimistic lock: ${table}`);
    }

    const current = db.prepare(`SELECT version FROM "${table}" WHERE id = ?`).get(id) as { version: number } | undefined;
    if (!current) {
      throw new Error(`Record not found in ${table}`);
    }

    if (current.version !== expectedVersion) {
      throw new Error(`CONCURRENCY_CONFLICT: Record in ${table} was modified by another user. Expected v${expectedVersion}, found v${current.version}. Please refresh.`);
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const [col, val] of Object.entries(updates)) {
      // Exclude version and id from explicit caller updates to prevent collisions
      if (col === 'version' || col === 'id') continue;
      // Sanitize column identifier
      if (!/^[a-zA-Z0-9_]+$/.test(col)) {
        throw new Error(`Invalid column identifier: ${col}`);
      }
      setClauses.push(`"${col}" = ?`);
      params.push(val);
    }

    setClauses.push('"version" = "version" + 1');
    params.push(id, expectedVersion);

    const result = db.prepare(`
      UPDATE "${table}"
      SET ${setClauses.join(', ')}
      WHERE id = ? AND version = ?
    `).run(...params);

    if (result.changes === 0) {
      throw new Error('Optimistic lock update failed. Concurrent transaction detected.');
    }

    return { success: true, newVersion: expectedVersion + 1 };
  }
}
