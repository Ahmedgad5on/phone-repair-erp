import crypto from 'crypto';
import db from '../db/database';

export interface WalletPassData {
  passId: string;
  serialNumber: string;
  customerName: string;
  tierName: string;
  pointsBalance: number;
  qrPayload: string;
  appleWalletPayload: any;
  googlePayPayload: any;
}

export const walletPassService = {
  /**
   * Generates or retrieves an Apple / Google Wallet Digital Pass for a Customer
   */
  getOrCreatePass(customerId: string): WalletPassData {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found`);
    }

    let pass = db.prepare('SELECT * FROM customer_loyalty_passes WHERE customer_id = ?').get(customerId) as any;

    if (!pass) {
      const passId = `pass-${Date.now()}`;
      const serialNumber = `PASS-${Date.now().toString().slice(-6)}-${customer.phone.slice(-4)}`;
      const authToken = crypto.randomBytes(16).toString('hex');
      const qrPayload = `ALPHA-PASS:${serialNumber}:${customer.id}`;

      db.prepare(`
        INSERT INTO customer_loyalty_passes (id, customer_id, serial_number, auth_token, qr_payload, tier_name, points_balance, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(passId, customerId, serialNumber, authToken, qrPayload, customer.loyalty_tier || 'BRONZE', customer.loyalty_points || 0);

      pass = {
        id: passId,
        customer_id: customerId,
        serial_number: serialNumber,
        qr_payload: qrPayload,
        tier_name: customer.loyalty_tier || 'BRONZE',
        points_balance: customer.loyalty_points || 0
      };
    }

    // Standard Apple Wallet (.pkpass) JSON structure
    const appleWalletPayload = {
      formatVersion: 1,
      passTypeIdentifier: 'pass.com.alphamobile.loyalty',
      serialNumber: pass.serial_number,
      teamIdentifier: 'ALPHA98765',
      organizationName: 'Alpha Mobile Hub & Lab',
      description: 'Alpha Mobile VIP Customer Loyalty Pass',
      logoText: 'Alpha Mobile',
      foregroundColor: 'rgb(255, 255, 255)',
      backgroundColor: pass.tier_name === 'GOLD' ? 'rgb(212, 175, 55)' : pass.tier_name === 'SILVER' ? 'rgb(192, 192, 192)' : 'rgb(30, 41, 59)',
      storeCard: {
        primaryFields: [
          { key: 'tier', label: 'MEMBERSHIP TIER', value: pass.tier_name }
        ],
        secondaryFields: [
          { key: 'customer', label: 'CARDHOLDER', value: customer.name },
          { key: 'points', label: 'POINTS BALANCE', value: `${pass.points_balance} PTS` }
        ],
        auxiliaryFields: [
          { key: 'phone', label: 'PHONE', value: customer.phone }
        ]
      },
      barcode: {
        format: 'PKBarcodeFormatQR',
        message: pass.qr_payload,
        messageEncoding: 'iso-8859-1'
      }
    };

    // Google Pay Passes Class & Object structure
    const googlePayPayload = {
      id: `3388000000022224444.${pass.serial_number}`,
      classId: '3388000000022224444.alpha_loyalty_class',
      state: 'ACTIVE',
      accountId: customer.id,
      accountName: customer.name,
      loyaltyPoints: {
        balance: { string: `${pass.points_balance}` },
        label: 'Points'
      },
      barcode: {
        type: 'QR_CODE',
        value: pass.qr_payload
      }
    };

    return {
      passId: pass.id,
      serialNumber: pass.serial_number,
      customerName: customer.name,
      tierName: pass.tier_name,
      pointsBalance: pass.points_balance,
      qrPayload: pass.qr_payload,
      appleWalletPayload,
      googlePayPayload
    };
  }
};
