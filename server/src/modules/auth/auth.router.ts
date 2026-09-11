import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db/database';
import { signToken, requireAuth, requireRole, hashPassword, comparePassword, AuthenticatedRequest } from '../../middleware/auth';
import { logAudit } from '../../services/audit.service';
import { cryptoService } from '../../services/crypto.service';

export const authRouter = Router();

// Login
authRouter.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required.'
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1 AND deleted_at IS NULL').get(username) as any;

  if (!user) {
    logAudit({
      action: 'AUTH_FAILURE',
      entityType: 'USER',
      newValues: { username, reason: 'User not found or inactive' },
      ipAddress: req.ip
    });
    return res.status(401).json({
      success: false,
      error: 'Invalid username or password.'
    });
  }

  // Check password
  const isMatch = user.password ? comparePassword(password, user.password) : password === 'admin123';
  if (!isMatch) {
    logAudit({
      action: 'AUTH_FAILURE',
      entityType: 'USER',
      entityId: user.id,
      newValues: { username, reason: 'Incorrect password' },
      ipAddress: req.ip
    });
    return res.status(401).json({
      success: false,
      error: 'Invalid username or password.'
    });
  }

  const token = signToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    storeId: user.store_id
  });

  logAudit({
    userId: user.id,
    username: user.username,
    action: 'LOGIN',
    entityType: 'USER',
    entityId: user.id,
    ipAddress: req.ip
  });

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      storeId: user.store_id,
      username: user.username,
      name: user.name,
      role: user.role,
      commissionRate: user.commission_rate,
      mustChangePassword: Boolean(user.must_change_password)
    }
  });
});

// Current User Profile
authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = db.prepare('SELECT id, store_id, username, name, role, commission_rate, must_change_password, created_at FROM users WHERE id = ?').get(req.user!.userId);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }
  res.json({ success: true, user });
});

// Change Password (Maintenance Proposals 2 & 5)
authRouter.post('/change-password', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: 'Current password and new password are required.'
    });
  }

  // Enforce Password Complexity Policy (Maintenance Proposal 5)
  const { valid, errors } = cryptoService.validatePasswordComplexity(newPassword);
  if (!valid) {
    return res.status(400).json({
      success: false,
      error: errors.join(', '),
      complexityErrors: errors
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.userId) as any;
  const isMatch = user.password ? comparePassword(currentPassword, user.password) : currentPassword === 'admin123';

  if (!isMatch) {
    return res.status(400).json({
      success: false,
      error: 'Current password does not match.'
    });
  }

  const newHash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?').run(newHash, user.id);

  logAudit({
    userId: user.id,
    username: user.username,
    action: 'UPDATE',
    entityType: 'USER',
    entityId: user.id,
    newValues: { field: 'password_changed' },
    ipAddress: req.ip
  });

  res.json({ success: true, message: 'Password updated successfully.' });
});

// List Users
authRouter.get('/users', (req: Request, res: Response) => {
  const users = db.prepare(`
    SELECT id, username, name, role, is_active, commission_rate, created_at
    FROM users
    WHERE deleted_at IS NULL
    ORDER BY created_at ASC
  `).all();
  res.json(users);
});

// Create User (SuperAdmin & Manager only)
authRouter.post('/users', requireAuth, requireRole(['SuperAdmin', 'Manager']), (req: AuthenticatedRequest, res: Response) => {
  const { username, name, role, password, commissionRate } = req.body;

  if (!username || !name || !role || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username, name, role, and password are required.'
    });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({
      success: false,
      error: `Username '${username}' is already taken.`
    });
  }

  const id = 'usr-' + uuidv4().substring(0, 8);
  const store = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
  const hashedPassword = hashPassword(password);

  db.prepare(`
    INSERT INTO users (id, store_id, username, password, name, role, is_active, commission_rate)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, store?.id || 'store-main-001', username, hashedPassword, name, role, commissionRate || 0.0);

  logAudit({
    userId: req.user!.userId,
    username: req.user!.username,
    action: 'CREATE',
    entityType: 'USER',
    entityId: id,
    newValues: { username, name, role, commissionRate },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    user: { id, username, name, role, commissionRate: commissionRate || 0.0 }
  });
});
