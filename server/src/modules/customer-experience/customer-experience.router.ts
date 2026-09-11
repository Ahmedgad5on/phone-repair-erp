import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { logAudit } from '../../services/audit.service';
import crypto from 'crypto';

export const customerExperienceRouter = Router();

/**
 * 1. Queue a new customer survey post-delivery (NPS & CSAT)
 */
customerExperienceRouter.post('/surveys', (req: Request, res: Response) => {
  try {
    const { ticketId, customerId, channel = 'WHATSAPP', serviceType = 'REPAIR' } = req.body;
    if (!ticketId || !customerId) {
      return res.status(400).json({ error: 'ticketId and customerId are required' });
    }

    const surveyId = `srv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const token = crypto.randomBytes(16).toString('hex');

    db.prepare(`
      INSERT INTO repair_surveys (id, store_id, ticket_id, customer_id, channel, token, service_type, status)
      VALUES (?, 'store-main-001', ?, ?, ?, ?, ?, 'PENDING')
    `).run(surveyId, ticketId, customerId, channel, token, serviceType);

    logAudit({
      action: 'CREATE_SURVEY',
      entityType: 'SURVEY',
      entityId: surveyId,
      newValues: { ticketId, channel }
    });

    res.status(201).json({
      surveyId,
      token,
      surveyUrl: `/survey/${token}`,
      message: 'Survey queued successfully'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. Public endpoint: Fetch survey context by token
 */
customerExperienceRouter.get('/surveys/public/:token', (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const survey = db.prepare(`
      SELECT s.*, c.name as customer_name, t.device_brand, t.device_model, t.reported_defects
      FROM repair_surveys s
      JOIN customers c ON s.customer_id = c.id
      JOIN repair_tickets t ON s.ticket_id = t.id
      WHERE s.token = ?
    `).get(token) as any;

    if (!survey) {
      return res.status(404).json({ error: 'Survey not found or expired' });
    }

    res.json(survey);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. Submit survey response with 2-tier Promoter / Detractor funnel
 */
customerExperienceRouter.post('/surveys/public/:token/submit', (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { csatScore = 5, npsScore = 10, feedbackCategory = 'QUALITY', comment = '' } = req.body;

    const survey = db.prepare('SELECT id, status FROM repair_surveys WHERE token = ?').get(token) as any;
    if (!survey) {
      return res.status(404).json({ error: 'Invalid survey token' });
    }

    const responseId = `resp-${Date.now()}`;
    const isPromoter = npsScore >= 9 || csatScore >= 4;
    const isDetractor = npsScore <= 6 || csatScore <= 2;
    const routedToGoogle = isPromoter ? 1 : 0;
    const isEscalated = isDetractor ? 1 : 0;
    const escalationStatus = isDetractor ? 'OPEN' : 'NONE';

    db.prepare(`
      INSERT INTO repair_survey_responses (id, survey_id, csat_score, nps_score, feedback_category, comment, routed_to_google, is_escalated, escalation_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(responseId, survey.id, csatScore, npsScore, feedbackCategory, comment, routedToGoogle, isEscalated, escalationStatus);

    db.prepare("UPDATE repair_surveys SET status = 'COMPLETED' WHERE id = ?").run(survey.id);

    res.json({
      success: true,
      isPromoter,
      isDetractor,
      googleReviewUrl: isPromoter ? 'https://g.page/r/AlphaMobileHub/review' : null,
      message: isPromoter 
        ? 'Thank you! Would you mind leaving us a quick Google Review?' 
        : 'Thank you for your feedback. Our Lab Manager will contact you promptly to resolve any issues.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Aggregated NPS & CSAT Analytics Dashboard
 */
customerExperienceRouter.get('/nps-summary', (_req: Request, res: Response) => {
  try {
    const responses = db.prepare(`
      SELECT r.*, s.service_type, s.created_at as survey_date
      FROM repair_survey_responses r
      JOIN repair_surveys s ON r.survey_id = s.id
      ORDER BY r.created_at DESC
    `).all() as any[];

    const total = responses.length;
    let promoters = 0;
    let passives = 0;
    let detractors = 0;
    let csatSum = 0;

    for (const r of responses) {
      csatSum += r.csat_score;
      if (r.nps_score >= 9) promoters++;
      else if (r.nps_score >= 7) passives++;
      else detractors++;
    }

    const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 100;
    const averageCsat = total > 0 ? Number((csatSum / total).toFixed(2)) : 5.0;
    const activeEscalations = responses.filter(r => r.is_escalated === 1 && r.escalation_status === 'OPEN');

    res.json({
      totalResponses: total,
      npsScore,
      averageCsat,
      promoters,
      passives,
      detractors,
      activeEscalationsCount: activeEscalations.length,
      recentResponses: responses.slice(0, 10)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. Resolve Customer Escalation
 */
customerExperienceRouter.patch('/escalations/:id/resolve', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolutionNotes = 'Resolved via phone support' } = req.body;

    db.prepare(`
      UPDATE repair_survey_responses
      SET escalation_status = 'RESOLVED', resolution_notes = ?
      WHERE id = ?
    `).run(resolutionNotes, id);

    res.json({ success: true, message: 'Escalation marked as resolved' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =======================================================
// DIGITAL STORE QUEUE MANAGEMENT
// =======================================================

/**
 * 6. Issue a new digital queue ticket
 */
customerExperienceRouter.post('/queue/ticket', (req: Request, res: Response) => {
  try {
    const { customerName, customerPhone, serviceType = 'REPAIR' } = req.body;
    if (!customerName) {
      return res.status(400).json({ error: 'customerName is required' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const maxNumber = db.prepare(`
      SELECT COALESCE(MAX(queue_number), 100) as maxNum 
      FROM digital_queue 
      WHERE created_at >= ?
    `).get(today) as { maxNum: number };

    const nextQueueNum = (maxNumber?.maxNum || 100) + 1;
    const ticketId = `q-${Date.now()}`;

    db.prepare(`
      INSERT INTO digital_queue (id, store_id, queue_number, customer_name, customer_phone, service_type, status, estimated_wait_minutes)
      VALUES (?, 'store-main-001', ?, ?, ?, ?, 'WAITING', 12)
    `).run(ticketId, nextQueueNum, customerName, customerPhone || '', serviceType);

    res.status(201).json({
      id: ticketId,
      queueNumber: nextQueueNum,
      customerName,
      serviceType,
      estimatedWaitMinutes: 12,
      status: 'WAITING'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. Get digital queue public display board data
 */
customerExperienceRouter.get('/queue/board', (_req: Request, res: Response) => {
  try {
    const waiting = db.prepare(`
      SELECT * FROM digital_queue
      WHERE status = 'WAITING'
      ORDER BY queue_number ASC
      LIMIT 15
    `).all() as any[];

    const currentlyCalling = db.prepare(`
      SELECT * FROM digital_queue
      WHERE status = 'CALLING'
      ORDER BY called_at DESC
      LIMIT 3
    `).all() as any[];

    res.json({
      currentlyCalling,
      waitingQueue: waiting,
      totalWaiting: waiting.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 8. Call Next Queue Ticket
 */
customerExperienceRouter.post('/queue/call-next', (req: Request, res: Response) => {
  try {
    const { counter = 'Counter 1' } = req.body;
    const nextTicket = db.prepare(`
      SELECT * FROM digital_queue
      WHERE status = 'WAITING'
      ORDER BY queue_number ASC
      LIMIT 1
    `).get() as any;

    if (!nextTicket) {
      return res.status(404).json({ message: 'No waiting tickets in queue' });
    }

    const calledAt = new Date().toISOString();
    db.prepare(`
      UPDATE digital_queue
      SET status = 'CALLING', assigned_counter = ?, called_at = ?
      WHERE id = ?
    `).run(counter, calledAt, nextTicket.id);

    res.json({
      success: true,
      ticket: {
        ...nextTicket,
        status: 'CALLING',
        assigned_counter: counter,
        called_at: calledAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 9. Complete Queue Ticket
 */
customerExperienceRouter.post('/queue/:id/complete', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    db.prepare(`
      UPDATE digital_queue
      SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    res.json({ success: true, message: 'Ticket marked as completed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
