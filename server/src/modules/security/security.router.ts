import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { TwoFactorService } from '../../services/two-factor.service';
import { logAudit } from '../../services/audit.service';

export const securityRouter = Router();

// 1. Two-Factor Authentication Setup
securityRouter.post('/2fa/setup', (req: Request, res: Response) => {
  const { user_id } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });

  const secret = TwoFactorService.generateSecret();
  db.prepare('UPDATE users SET two_factor_secret = ? WHERE id = ?').run(secret, user.id);

  res.json({
    secret,
    otpauthUrl: `otpauth://totp/ModularMobileERP:${user.username}?secret=${secret}&issuer=ModularMobileERP`
  });
});

securityRouter.post('/2fa/verify', (req: Request, res: Response) => {
  const { user_id, token } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id) as any;
  if (!user || !user.two_factor_secret) {
    return res.status(400).json({ error: '2FA has not been initiated for this account' });
  }

  const isValid = TwoFactorService.verifyToken(user.two_factor_secret, token);
  if (!isValid) {
    return res.status(400).json({ success: false, error: 'Invalid 2FA verification token' });
  }

  db.prepare('UPDATE users SET two_factor_enabled = 1 WHERE id = ?').run(user.id);

  logAudit({
    action: 'UPDATE',
    entityType: 'SECURITY_2FA',
    entityId: user.id,
    newValues: { two_factor_enabled: 1 },
    ipAddress: req.ip
  });

  res.json({ success: true, message: 'Two-factor authentication verified and enabled successfully.' });
});

// 2. Active User Sessions
securityRouter.get('/sessions', (req: Request, res: Response) => {
  const { user_id } = req.query;
  let sql = `
    SELECT s.*, u.name as user_name, u.username
    FROM user_sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.is_revoked = 0
  `;
  const params: any[] = [];
  if (user_id) {
    sql += ' AND s.user_id = ?';
    params.push(user_id);
  }
  sql += ' ORDER BY s.created_at DESC';

  const sessions = db.prepare(sql).all(...params);
  res.json(sessions);
});

securityRouter.post('/sessions/:id/revoke', (req: Request, res: Response) => {
  db.prepare('UPDATE user_sessions SET is_revoked = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Session revoked successfully.' });
});

// 3. API Keys for External Integrations
securityRouter.get('/api-keys', (req: Request, res: Response) => {
  const keys = db.prepare('SELECT id, name, role, is_active, last_used_at, created_at FROM api_keys ORDER BY created_at DESC').all();
  res.json(keys);
});

securityRouter.post('/api-keys', (req: Request, res: Response) => {
  const { name, role } = req.body;
  if (!name) return res.status(400).json({ error: 'Key name is required' });

  const rawKey = `ak_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const id = `key-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO api_keys (id, key_hash, name, role, is_active)
    VALUES (?, ?, ?, ?, 1)
  `).run(id, keyHash, name, role || 'Integration');

  logAudit({
    action: 'CREATE',
    entityType: 'API_KEY',
    entityId: id,
    newValues: { name, role },
    ipAddress: req.ip
  });

  res.status(201).json({
    id,
    name,
    apiKey: rawKey,
    message: 'Save this API key securely. It will not be shown again.'
  });
});
