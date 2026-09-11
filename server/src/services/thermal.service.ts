import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export interface ReceiptData {
  storeName: string;
  storePhone: string;
  storeAddress: string;
  receiptNumber: string;
  date: string;
  customerName: string;
  customerPhone?: string;
  deviceInfo?: string;
  items: Array<{
    name: string;
    qty: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  barcodeValue: string;
  footerNote?: string;
}

export class ThermalPrinterService {
  /**
   * Generates a 80mm thermal receipt PDF buffer (approx 226pt width)
   */
  static async generateThermalReceiptPDF(data: ReceiptData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // 80mm width = ~226.77 points. Height can expand dynamically
      const doc = new PDFDocument({
        size: [226.77, 800],
        margin: 10
      });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', reject);

      // Header
      doc.fontSize(12).font('Helvetica-Bold').text(data.storeName, { align: 'center' });
      doc.fontSize(8).font('Helvetica').text(data.storeAddress, { align: 'center' });
      doc.text(`Tel: ${data.storePhone}`, { align: 'center' });
      doc.moveDown(0.5);

      // Divider line
      doc.text('------------------------------------------------', { align: 'center' });
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text(`Receipt #: ${data.receiptNumber}`);
      doc.font('Helvetica').text(`Date: ${data.date}`);
      doc.text(`Customer: ${data.customerName}`);
      if (data.deviceInfo) {
        doc.text(`Device: ${data.deviceInfo}`);
      }
      doc.text('------------------------------------------------', { align: 'center' });

      // Items table
      doc.font('Helvetica-Bold');
      doc.text('Item                  Qty   Price   Total');
      doc.font('Helvetica');

      data.items.forEach(item => {
        const itemLine = `${item.name.slice(0, 18).padEnd(18)}  ${item.qty.toString().padStart(2)}  ${item.price.toFixed(0).padStart(5)}  ${item.total.toFixed(0).padStart(5)}`;
        doc.text(itemLine);
      });

      doc.text('------------------------------------------------', { align: 'center' });

      // Financials
      doc.font('Helvetica-Bold');
      doc.text(`Subtotal: ${data.subtotal.toFixed(2)} EGP`, { align: 'right' });
      if (data.discount > 0) {
        doc.text(`Discount: -${data.discount.toFixed(2)} EGP`, { align: 'right' });
      }
      if (data.tax > 0) {
        doc.text(`VAT (14%): ${data.tax.toFixed(2)} EGP`, { align: 'right' });
      }
      doc.fontSize(10).text(`TOTAL: ${data.total.toFixed(2)} EGP`, { align: 'right' });
      doc.fontSize(8).font('Helvetica').text(`Payment: ${data.paymentMethod}`, { align: 'right' });

      doc.moveDown(1);
      doc.text(`* ${data.barcodeValue} *`, { align: 'center' });

      if (data.footerNote) {
        doc.moveDown(0.5);
        doc.fontSize(7).text(data.footerNote, { align: 'center' });
      }

      doc.moveDown(0.5);
      doc.fontSize(7).text('Powered by Alpha Mobile ERP', { align: 'center' });

      doc.end();
    });
  }

  /**
   * Generates standard ESC/POS raw bytes for direct network/serial thermal printers
   */
  static generateRawEscPosReceipt(data: ReceiptData): Buffer {
    const commands: number[] = [];

    // ESC @: Initialize printer
    commands.push(0x1b, 0x40);

    // ESC a 1: Center justification
    commands.push(0x1b, 0x61, 0x01);
    commands.push(...Buffer.from(`${data.storeName}\n`, 'ascii'));
    commands.push(...Buffer.from(`${data.storeAddress}\n`, 'ascii'));
    commands.push(...Buffer.from(`Tel: ${data.storePhone}\n\n`, 'ascii'));

    // ESC a 0: Left justification
    commands.push(0x1b, 0x61, 0x00);
    commands.push(...Buffer.from(`Receipt: ${data.receiptNumber}\n`, 'ascii'));
    commands.push(...Buffer.from(`Date: ${data.date}\n`, 'ascii'));
    commands.push(...Buffer.from(`Customer: ${data.customerName}\n`, 'ascii'));
    commands.push(...Buffer.from('--------------------------------\n', 'ascii'));

    data.items.forEach(item => {
      commands.push(...Buffer.from(`${item.name.slice(0, 16)} x${item.qty} = ${item.total} EGP\n`, 'ascii'));
    });

    commands.push(...Buffer.from('--------------------------------\n', 'ascii'));
    // ESC a 2: Right justification
    commands.push(0x1b, 0x61, 0x02);
    commands.push(...Buffer.from(`TOTAL: ${data.total.toFixed(2)} EGP\n\n`, 'ascii'));

    // ESC a 1: Center
    commands.push(0x1b, 0x61, 0x01);
    commands.push(...Buffer.from(`* ${data.barcodeValue} *\n`, 'ascii'));
    commands.push(...Buffer.from('Thank you for your business!\n\n\n', 'ascii'));

    // GS V 0: Paper Cut
    commands.push(0x1d, 0x56, 0x00);

    return Buffer.from(commands);
  }
}
