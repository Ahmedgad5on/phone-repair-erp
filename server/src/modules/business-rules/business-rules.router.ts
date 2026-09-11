import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { logAudit } from '../../services/audit.service';

export const businessRulesRouter = Router();

/**
 * 1. List Business Rules
 */
businessRulesRouter.get('/', (_req: Request, res: Response) => {
  try {
    const rules = db.prepare('SELECT * FROM business_rules ORDER BY created_at DESC').all();
    res.json(rules);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. Create Business Rule
 */
businessRulesRouter.post('/', (req: Request, res: Response) => {
  try {
    const { ruleName, eventType, conditionExpression, actionType, actionPayload } = req.body;
    if (!ruleName || !eventType || !conditionExpression || !actionType) {
      return res.status(400).json({ error: 'ruleName, eventType, conditionExpression, and actionType are required' });
    }

    const id = `rule-${Date.now()}`;
    db.prepare(`
      INSERT INTO business_rules (id, rule_name, event_type, condition_expression, action_type, action_payload, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, ruleName, eventType, conditionExpression, actionType, typeof actionPayload === 'object' ? JSON.stringify(actionPayload) : (actionPayload || '{}'));

    logAudit({
      action: 'CREATE_BUSINESS_RULE',
      entityType: 'BUSINESS_RULE',
      entityId: id,
      newValues: { ruleName, eventType, actionType }
    });

    res.status(201).json({ id, ruleName, eventType, actionType, is_active: 1 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. Evaluate Event Against Active Business Rules
 */
businessRulesRouter.post('/evaluate', (req: Request, res: Response) => {
  try {
    const { eventType, eventContext } = req.body;
    if (!eventType) return res.status(400).json({ error: 'eventType is required' });

    const activeRules = db.prepare('SELECT * FROM business_rules WHERE event_type = ? AND is_active = 1').all(eventType) as any[];

    const triggeredActions: any[] = [];

    for (const rule of activeRules) {
      let conditionMatched = false;
      try {
        // Safe evaluation heuristic based on event context
        if (eventType === 'TICKET_SLA_BREACH') {
          conditionMatched = (eventContext?.hoursRemaining !== undefined) ? eventContext.hoursRemaining <= 0 : true;
        } else if (eventType === 'STOCK_LOW') {
          conditionMatched = (eventContext?.stockQuantity !== undefined && eventContext?.reorderLevel !== undefined) 
            ? eventContext.stockQuantity <= eventContext.reorderLevel 
            : true;
        } else {
          conditionMatched = true;
        }
      } catch (e) {
        conditionMatched = false;
      }

      if (conditionMatched) {
        db.prepare('UPDATE business_rules SET execution_count = execution_count + 1 WHERE id = ?').run(rule.id);
        triggeredActions.push({
          ruleId: rule.id,
          ruleName: rule.rule_name,
          actionType: rule.action_type,
          actionPayload: JSON.parse(rule.action_payload || '{}')
        });
      }
    }

    res.json({
      evaluatedRulesCount: activeRules.length,
      triggeredActionsCount: triggeredActions.length,
      triggeredActions
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Toggle or Delete Rule
 */
businessRulesRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM business_rules WHERE id = ?').run(id);
    res.json({ success: true, message: 'Rule deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
