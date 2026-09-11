import crypto from 'crypto';

export class TwoFactorService {
  /**
   * Generate a random base32 secret for TOTP
   */
  static generateSecret(length: number = 20): string {
    const randomBytes = crypto.randomBytes(length);
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < randomBytes.length; i++) {
      secret += base32Chars[randomBytes[i] % 32];
    }
    return secret;
  }

  /**
   * Generate current TOTP 6-digit token from secret
   */
  static generateToken(secret: string, timeStepWindow: number = 0): string {
    const epoch = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(epoch / 30) + timeStepWindow;

    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(timeStep));

    const key = Buffer.from(secret, 'utf-8');
    const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();

    const offset = hmac[hmac.length - 1] & 0xf;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const token = (code % 1000000).toString().padStart(6, '0');
    return token;
  }

  /**
   * Verify token with a +/- 1 window tolerance
   */
  static verifyToken(secret: string, userToken: string): boolean {
    if (!secret || !userToken) return false;
    const cleanToken = userToken.trim();

    for (let window = -1; window <= 1; window++) {
      const expectedToken = this.generateToken(secret, window);
      if (expectedToken === cleanToken) {
        return true;
      }
    }
    return false;
  }
}
