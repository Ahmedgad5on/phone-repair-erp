/**
 * Raw ESC/POS Command Generator & Web Serial Direct Printer (Hardware Proposals 50 & 52)
 */

export const ESC = '\x1B';
export const GS = '\x1D';

export class EscPosDirect {
  // Command bytes
  static INIT = `${ESC}@`; // Initialize printer
  static CUT_FULL = `${GS}V\x00`; // Full cut
  static CUT_PARTIAL = `${GS}V\x01`; // Partial cut
  static DRAWER_KICK = `${ESC}p\x00\x19\xFA`; // Standard 24V cash drawer pulse (pin 2, 50ms)
  static ALIGN_CENTER = `${ESC}a\x01`;
  static ALIGN_LEFT = `${ESC}a\x00`;
  static ALIGN_RIGHT = `${ESC}a\x02`;
  static BOLD_ON = `${ESC}E\x01`;
  static BOLD_OFF = `${ESC}E\x00`;
  static DOUBLE_HEIGHT = `${GS}!\x01`;
  static NORMAL_TEXT = `${GS}!\x00`;

  /**
   * Kick Cash Drawer directly via ESC/POS command
   */
  static kickDrawerCommand(): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(this.DRAWER_KICK);
  }

  /**
   * Generates Dual-label Print Commands (Proposal 52)
   * 1) 50x25mm Jewelry/Parts Barcode Sticker
   * 2) 40x30mm Ticket Intake Label
   */
  static generateJewelryPartsLabel(sku: string, name: string, price: number): string {
    return [
      `^XA`, // ZPL / TSPL label header
      `^PW400`,
      `^LL200`,
      `^FO20,20^A0N,25,25^FD${name.substring(0, 22)}^FS`,
      `^FO20,55^BY2,2,40^BCN,40,Y,N,N^FD${sku}^FS`,
      `^FO20,135^A0N,30,30^FDPrice: ${price} EGP^FS`,
      `^XZ`
    ].join('\n');
  }

  static generateIntakeDeviceLabel(ticketNumber: number, device: string, customerPhone: string, otp: string): string {
    return [
      `^XA`,
      `^PW480`,
      `^LL240`,
      `^FO20,20^A0N,35,35^FD#${ticketNumber} - ${device.substring(0, 18)}^FS`,
      `^FO20,65^A0N,25,25^FDTel: ${customerPhone}^FS`,
      `^FO20,95^BY2,2,50^BCN,50,Y,N,N^FDTKT-${ticketNumber}^FS`,
      `^FO300,160^A0N,30,30^FDOTP: ${otp}^FS`,
      `^XZ`
    ].join('\n');
  }

  /**
   * Web Serial API Direct Printer Communication
   */
  static async printDirectToSerial(data: Uint8Array | string): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      console.warn('Web Serial API not supported in this browser. Falling back to browser print.');
      return false;
    }

    try {
      const serial = (navigator as any).serial;
      const port = await serial.requestPort();
      await port.open({ baudRate: 9600 });

      const writer = port.writable.getWriter();
      const payload = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      await writer.write(payload);
      writer.releaseLock();
      await port.close();
      return true;
    } catch (e: any) {
      console.error('Direct serial print failed:', e);
      return false;
    }
  }
}
