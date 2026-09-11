import { Request, Response, NextFunction } from 'express';
import db from '../db/database';

export function subnetAndDeviceGuard(req: Request, res: Response, next: NextFunction) {
  // Check if trusted devices table has any registered whitelists
  const deviceToken = req.headers['x-device-token'] as string | undefined;
  const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');

  // Localhost is always permitted
  if (clientIp === '1' || clientIp === '127.0.0.1' || clientIp === 'localhost' || process.env.NODE_ENV === 'test') {
    return next();
  }

  // If a device token header is sent, verify whitelist status
  if (deviceToken) {
    const trusted = db.prepare('SELECT is_whitelisted FROM trusted_devices WHERE device_token = ?').get(deviceToken) as { is_whitelisted: number } | undefined;
    if (trusted && trusted.is_whitelisted === 1) {
      return next();
    }
  }

  // Check IP whitelist if configured
  const ipRule = db.prepare('SELECT is_whitelisted FROM trusted_devices WHERE ip_subnet = ?').get(clientIp) as { is_whitelisted: number } | undefined;
  if (ipRule && ipRule.is_whitelisted === 0) {
    return res.status(403).json({
      error: 'SECURITY_ALERT: Client IP or hardware device is not whitelisted for ERP access.',
      code: 'DEVICE_NOT_WHITELISTED'
    });
  }

  next();
}

// Customer PII Masking Helper (Maintenance Proposal 60)
export function maskCustomerPii(customer: any, userRole?: string) {
  if (!customer) return customer;
  if (['SuperAdmin', 'Manager'].includes(userRole || '')) {
    return customer; // Managers see unmasked PII
  }

  const masked = { ...customer };
  if (masked.phone && typeof masked.phone === 'string' && masked.phone.length > 7) {
    masked.phone = masked.phone.slice(0, 4) + '****' + masked.phone.slice(-3);
  }
  if (masked.national_id && typeof masked.national_id === 'string') {
    masked.national_id = masked.national_id.slice(0, 3) + '********' + masked.national_id.slice(-3);
  }
  return masked;
}
