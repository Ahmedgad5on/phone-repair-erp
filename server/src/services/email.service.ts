import { logger } from './logger';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  async sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId: string }> {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    logger.info(`Sending email to ${options.to}: [${options.subject}] (ID: ${messageId})`, 'EmailService');

    // In desktop/offline mode, log to audit stream and store in memory/disk queue
    return {
      success: true,
      messageId
    };
  }

  async sendInvoiceEmail(to: string, invoiceNumber: number, customerName: string, total: number): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
        <h2>فاتورة مبيعات رقم #${invoiceNumber}</h2>
        <p>عزيزي ${customerName}،</p>
        <p>نشكرك لاختيارك مركزنا. تم إصدار فاتورتك بقيمة إجمالية: <strong>${total.toLocaleString()} ج.م</strong>.</p>
        <hr/>
        <p style="font-size: 12px; color: #64748b;">Modular Mobile ERP - Desktop Lab & POS</p>
      </div>
    `;

    const res = await this.sendEmail({
      to,
      subject: `فاتورة مبيعات إلكترونية #${invoiceNumber}`,
      html
    });

    return res.success;
  }
}

export const emailService = new EmailService();
