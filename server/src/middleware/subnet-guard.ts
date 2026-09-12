import { Request, Response, NextFunction } from 'express';
import db from '../db/database';

function isLoopbackIp(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === '1' || ip.startsWith('127.');
}

function isRatifiedLanIp(ip: string): boolean {
  // DEC-043: 192.168.1.0/24 and 10.0.0.0/8
  return ip.startsWith('192.168.1.') || ip.startsWith('10.');
}

function isExemptRoute(path: string): boolean {
  if (path === '/api/health' || path === '/health') return true;
  if (path.startsWith('/api/docs')) return true;
  if (path === '/api/security/devices/register') return true;
  return false;
}

export function subnetAndDeviceGuard(req: Request, res: Response, next: NextFunction) {
  // 1. Determine client IP with test override support in non-production
  let clientIp = '';
  if (process.env.NODE_ENV !== 'production' && req.headers['x-test-client-ip']) {
    clientIp = String(req.headers['x-test-client-ip']).trim();
  } else {
    clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').trim();
  }

  // Strip IPv4-mapped IPv6 prefix (::ffff:)
  if (clientIp.startsWith('::ffff:')) {
    clientIp = clientIp.substring(7);
  }

  // 2. Check Route Exemptions (Liveness, Swagger Docs, Workstation Registration)
  // Per DEC-043 / plan.md: Exempt paths bypass perimeter checks (monitoring, bootstrapping)
  if (isExemptRoute(req.path)) {
    return next();
  }

  // 3. Strict Subnet Firewall (DEC-020, DEC-043): Reject public / non-whitelisted IPs
  const loopback = isLoopbackIp(clientIp);
  const lan = isRatifiedLanIp(clientIp);

  if (!loopback && !lan) {
    return res.status(403).json({
      error: 'SECURITY_ALERT: External IP access denied. Local shop LAN only per DEC-020/DEC-043.',
      code: 'LAN_ACCESS_ONLY'
    });
  }

  // 4. Host node loopback access is permitted
  if (loopback) {
    return next();
  }

  // 5. Workstation Device Token Gate for LAN Stations (DEC-020, DEC-043)
  const deviceToken = req.headers['x-device-token'] as string | undefined;
  if (!deviceToken) {
    return res.status(403).json({
      error: 'SECURITY_ALERT: Device token required for LAN workstation access per DEC-020/DEC-043.',
      code: 'DEVICE_TOKEN_REQUIRED'
    });
  }

  const trusted = db.prepare('SELECT is_whitelisted FROM trusted_devices WHERE device_token = ?').get(deviceToken) as { is_whitelisted: number } | undefined;
  if (!trusted || trusted.is_whitelisted !== 1) {
    return res.status(403).json({
      error: 'SECURITY_ALERT: Workstation device token is not registered or whitelisted.',
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
