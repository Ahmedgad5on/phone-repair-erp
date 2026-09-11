import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../../services/audit.service';

export const loyaltyRouter = Router();

// 1. Get Loyalty Tiers & Customers Status
loyaltyRouter.get('/tiers', (req: Request, res: Response) => {
  const tiers = db.prepare('SELECT * FROM loyalty_tiers ORDER BY min_points ASC').all();
  res.json(tiers);
});

// 2. Get Loyalty Rewards Catalog
loyaltyRouter.get('/rewards', (req: Request, res: Response) => {
  const rewards = db.prepare('SELECT * FROM loyalty_rewards WHERE is_active = 1 ORDER BY points_required ASC').all();
  res.json(rewards);
});

// 3. Create Reward
loyaltyRouter.post('/rewards', (req: Request, res: Response) => {
  const { title, points_required, reward_value } = req.body;
  const id = `rew-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO loyalty_rewards (id, title, points_required, reward_value)
    VALUES (?, ?, ?, ?)
  `).run(id, title, points_required, reward_value);

  res.status(201).json({ id, message: 'Loyalty reward created' });
});

// 4. Redeem Reward
loyaltyRouter.post('/redeem', (req: Request, res: Response) => {
  const { customer_id, reward_id } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id) as any;
  const reward = db.prepare('SELECT * FROM loyalty_rewards WHERE id = ?').get(reward_id) as any;

  if (!customer || !reward) {
    return res.status(404).json({ error: 'Customer or reward not found' });
  }

  if (customer.loyalty_points < reward.points_required) {
    return res.status(400).json({
      error: `INSUFFICIENT POINTS: Customer has ${customer.loyalty_points} points, but ${reward.points_required} required.`
    });
  }

  const redemptionId = `red-${uuidv4().substring(0, 8)}`;

  const processRedeem = db.transaction(() => {
    db.prepare('UPDATE customers SET loyalty_points = loyalty_points - ? WHERE id = ?')
      .run(reward.points_required, customer.id);

    db.prepare(`
      INSERT INTO loyalty_redemptions (id, customer_id, reward_id, points_spent)
      VALUES (?, ?, ?, ?)
    `).run(redemptionId, customer.id, reward.id, reward.points_required);
  });

  processRedeem();

  logAudit({
    action: 'CREATE',
    entityType: 'LOYALTY_REDEMPTION',
    entityId: redemptionId,
    newValues: { customerName: customer.name, reward: reward.title, pointsSpent: reward.points_required },
    ipAddress: req.ip
  });

  res.status(201).json({
    success: true,
    redemptionId,
    remainingPoints: customer.loyalty_points - reward.points_required,
    message: `Successfully redeemed [${reward.title}] for ${customer.name}`
  });
});
