import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
// Derives 32-byte key from JWT_SECRET or master encryption key
const MASTER_SECRET = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'antigravity-erp-super-master-key-32-chars!!';
const KEY = crypto.createHash('sha256').update(MASTER_SECRET).digest();

export const cryptoService = {
  /**
   * Encrypt sensitive string data (API keys, PII) using AES-256-GCM with IV and Auth Tag
   */
  encrypt(plaintext: string): string {
    if (!plaintext) return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  },

  /**
   * Decrypt AES-256-GCM ciphertext bundle
   */
  decrypt(bundle: string): string {
    if (!bundle || !bundle.includes(':')) return bundle;
    try {
      const [ivHex, authTagHex, encryptedHex] = bundle.split(':');
      if (!ivHex || !authTagHex || !encryptedHex) return bundle;

      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      console.error('[CryptoService] Decryption failed, returning raw string');
      return bundle;
    }
  },

  /**
   * Password complexity validator (Maintenance proposal 5)
   * Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 digit, 1 special character
   */
  validatePasswordComplexity(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!password || password.length < 8) {
      errors.push('Password must be at least 8 characters long (يجب أن تتكون كلمة المرور من 8 أحرف على الأقل)');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter (حرف كبير واحد على الأقل)');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter (حرف صغير واحد على الأقل)');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number (رقم واحد على الأقل)');
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      errors.push('Password must contain at least one special character (رمز خاص واحد على الأقل)');
    }
    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Cryptographic Hash Chain for Immutable Audit Trail (Maintenance proposal 35)
   */
  generateChainedHash(prevHash: string, action: string, actorId: string, payload: any, timestamp: string): string {
    const content = `${prevHash}|${action}|${actorId}|${JSON.stringify(payload)}|${timestamp}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }
};
