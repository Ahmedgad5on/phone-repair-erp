export interface ReceiptData {
  storeName: string;
  storePhone?: string;
  storeAddress?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  invoiceNumber: number | string;
  type: 'SALE' | 'REPAIR_INTAKE' | 'REPAIR_DELIVERY';
  date: string;
  customerName: string;
  customerPhone: string;
  items: Array<{
    name: string;
    qty?: number;
    price: number;
    imei?: string;
    notes?: string;
  }>;
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  paymentMethod?: string;
  cashierName?: string;
  technicianName?: string;
  otpCode?: string;
  slaDeadline?: string;
  qrOrBarcodeData?: string;
}

export class ReceiptService {
  /**
   * Generates a thermal receipt string formatted for standard ESC/POS 80mm/58mm thermal printers.
   * Uses ASCII borders, double-width title banners, and alignment tags.
   */
  static generateEscPosText(data: ReceiptData): string {
    const width = 42; // Standard 80mm column width in monospaced font
    const line = '='.repeat(width);
    const dash = '-'.repeat(width);

    const padCenter = (str: string, len: number = width) => {
      const p = Math.max(0, len - str.length);
      const left = Math.floor(p / 2);
      const right = p - left;
      return ' '.repeat(left) + str + ' '.repeat(right);
    };

    const padBetween = (left: string, right: string, len: number = width) => {
      const spaces = Math.max(1, len - (left.length + right.length));
      return left + ' '.repeat(spaces) + right;
    };

    const lines: string[] = [];

    // Header
    lines.push(line);
    lines.push(padCenter(data.storeName.toUpperCase()));
    if (data.receiptHeader) {
      data.receiptHeader.split('\n').forEach(h => lines.push(padCenter(h.trim())));
    }
    if (data.storePhone) lines.push(padCenter(`Tel: ${data.storePhone}`));
    if (data.storeAddress) lines.push(padCenter(data.storeAddress));
    lines.push(line);

    // Document Type & Metadata
    const typeLabel =
      data.type === 'SALE'
        ? 'TAX INVOICE / فاتورة مبيعات'
        : data.type === 'REPAIR_INTAKE'
        ? 'REPAIR INTAKE RECEIPT / إيصال استلام صيانة'
        : 'REPAIR COMPLETION / إيصال تسليم جهاز';

    lines.push(padCenter(`[ ${typeLabel} ]`));
    lines.push(padBetween(`Ref: #${data.invoiceNumber}`, `Date: ${data.date.substring(0, 16)}`));
    lines.push(padBetween(`Customer: ${data.customerName}`, `Tel: ${data.customerPhone}`));
    if (data.cashierName) lines.push(padBetween(`Staff: ${data.cashierName}`, `Pay: ${data.paymentMethod || 'CASH'}`));
    if (data.technicianName) lines.push(`Tech Assigned: ${data.technicianName}`);
    if (data.slaDeadline) lines.push(`Estimated Ready: ${data.slaDeadline.substring(0, 16)}`);

    lines.push(dash);

    // Items Section
    lines.push(padBetween('Description', 'Total'));
    lines.push(dash);

    for (const item of data.items) {
      const qtyStr = item.qty && item.qty > 1 ? ` (x${item.qty})` : '';
      const nameLine = `${item.name}${qtyStr}`;
      const priceStr = `${item.price.toFixed(2)} EGP`;

      if (nameLine.length + priceStr.length + 2 > width) {
        lines.push(nameLine);
        lines.push(padBetween('', priceStr));
      } else {
        lines.push(padBetween(nameLine, priceStr));
      }

      if (item.imei) {
        lines.push(`  * IMEI/SN: ${item.imei}`);
      }
      if (item.notes) {
        lines.push(`  * Note: ${item.notes}`);
      }
    }

    lines.push(dash);

    // Totals
    if (data.discount && data.discount > 0) {
      lines.push(padBetween('Subtotal:', `${data.subtotal.toFixed(2)} EGP`));
      lines.push(padBetween('Discount:', `-${data.discount.toFixed(2)} EGP`));
    }
    if (data.tax && data.tax > 0) {
      lines.push(padBetween('Tax:', `+${data.tax.toFixed(2)} EGP`));
    }
    lines.push(padBetween('TOTAL AMOUNT DUE:', `${data.total.toFixed(2)} EGP`));
    lines.push(line);

    // OTP / Security section for repairs
    if (data.otpCode) {
      lines.push(padCenter('*** SECRET RELEASE OTP / كود استلام الجهاز ***'));
      lines.push(padCenter(`[  ${data.otpCode}  ]`));
      lines.push(padCenter('(Required for collection if physical ticket is lost)'));
      lines.push(dash);
    }

    // Barcode emulation
    const barcode = data.qrOrBarcodeData || `TKT-${data.invoiceNumber}`;
    lines.push(padCenter(`||| | || |||| | ||| || ||| | ||`));
    lines.push(padCenter(`*${barcode}*`));
    lines.push(dash);

    // Footer & Disclaimer
    if (data.receiptFooter) {
      data.receiptFooter.split('\n').forEach(f => lines.push(padCenter(f.trim())));
    }
    lines.push(padCenter('Powered by Modular Mobile ERP'));
    lines.push(line);
    lines.push('\n\n\n'); // ESC/POS feed lines before paper cut command

    return lines.join('\n');
  }
}
