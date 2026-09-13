import { Request, Response, NextFunction } from 'express';

/**
 * Custom-Header & Token based CSRF defense (OWASP Recommended for REST APIs)
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Safe read-only HTTP methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Exempt public webhooks and public auth endpoints
  if (
    req.path.startsWith('/api/integrations/payments/webhook') ||
    req.path.startsWith('/api/integrations/shipping/webhook') ||
    req.path === '/api/auth/login' ||
    req.path === '/auth/login'
  ) {
    return next();
  }

  // Bearer Authorization or Custom Application Header
  const hasAuthHeader = Boolean(req.headers.authorization && req.headers.authorization.startsWith('Bearer '));
  const hasApiKey = Boolean(req.headers['x-api-key']);
  const hasCustomHeader = req.headers['x-requested-with'] === 'XMLHttpRequest' || req.headers['x-erp-client'] === 'desktop';

  if (hasAuthHeader || hasApiKey || hasCustomHeader) {
    return next();
  }

  // If none present, block request with 403 Forbidden
  return res.status(403).json({
    error: 'CSRF validation failed. Missing authorization token or X-Requested-With header.'
  });
}

/**
 * HTTPS Enforcement middleware for production (Maintenance Proposal 7)
 */
export function enforceHttps(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'production') {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    if (!isHttps) {
      const host = req.headers.host || 'localhost';
      return res.redirect(301, `https://${host}${req.url}`);
    }
  }
  next();
}
