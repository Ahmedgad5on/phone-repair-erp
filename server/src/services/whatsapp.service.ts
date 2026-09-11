import db from '../db/database';
import { v4 as uuidv4 } from 'uuid';

export class WhatsAppService {
  /**
   * Dispatches or queues a WhatsApp notification for the customer.
   * Simulates WhatsApp Cloud API / Webhook integration and stores audit log.
   */
  static sendNotification(
    storeId: string,
    phone: string,
    type: 'INTAKE_RECEIPT' | 'READY_FOR_PICKUP' | 'SALE_INVOICE' | 'GOOGLE_REVIEW_FOLLOWUP',
    content: string,
    scheduledAt?: string
  ) {
    const id = `wa-${uuidv4().substring(0, 8)}`;
    const stmt = db.prepare(`
      INSERT INTO whatsapp_messages_log (id, store_id, customer_phone, message_type, content, status, scheduled_at, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const status = scheduledAt ? 'QUEUED' : 'SENT';
    const sentAt = scheduledAt ? null : new Date().toISOString();

    stmt.run(id, storeId, phone, type, content, status, scheduledAt, sentAt);

    console.log(`[WhatsApp Engine] Notification [${type}] to ${phone} -> Status: ${status}`);
    return { id, status, sentAt };
  }

  /**
   * Schedules a Google Review prompt 45 minutes post-transaction.
   */
  static scheduleGoogleReviewPrompt(storeId: string, customerPhone: string, customerName: string, googleUrl?: string) {
    const targetUrl = googleUrl || 'https://maps.google.com/?q=mobiletech';
    const sendTime = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const message = `Hello ${customerName}! Thank you for visiting us today. We would love to hear your feedback. Please take 30 seconds to rate your experience: ${targetUrl}`;
    
    return this.sendNotification(storeId, customerPhone, 'GOOGLE_REVIEW_FOLLOWUP', message, sendTime);
  }
}
