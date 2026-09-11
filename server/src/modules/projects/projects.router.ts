import { Router, Request, Response } from 'express';
import db from '../../db/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../../services/audit.service';

export const projectsRouter = Router();

// 1. Projects List
projectsRouter.get('/projects', (req: Request, res: Response) => {
  const projects = db.prepare(`
    SELECT p.*,
      c.name as customer_name,
      (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id) as total_tasks,
      (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id AND status = 'DONE') as completed_tasks
    FROM repair_projects p
    LEFT JOIN customers c ON p.customer_id = c.id
    ORDER BY p.created_at DESC
  `).all() as any[];

  const enriched = projects.map(p => ({
    ...p,
    progressPercentage: p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0
  }));

  res.json(enriched);
});

// 2. Create Project
projectsRouter.post('/projects', (req: Request, res: Response) => {
  const { title, customer_id, device_info, target_date, budget } = req.body;
  if (!title) return res.status(400).json({ error: 'Project title is required' });

  const id = `prj-${uuidv4().substring(0, 8)}`;
  db.prepare(`
    INSERT INTO repair_projects (id, title, customer_id, device_info, status, target_date, budget)
    VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, ?)
  `).run(id, title, customer_id || null, device_info || '', target_date || null, budget || 0.0);

  logAudit({
    action: 'CREATE',
    entityType: 'PROJECT',
    entityId: id,
    newValues: { title, budget },
    ipAddress: req.ip
  });

  const created = db.prepare('SELECT * FROM repair_projects WHERE id = ?').get(id);
  res.status(201).json(created);
});

// 3. Project Tasks
projectsRouter.get('/tasks', (req: Request, res: Response) => {
  const { project_id } = req.query;
  let sql = `
    SELECT t.*, u.name as assigned_engineer_name, p.title as project_title
    FROM project_tasks t
    LEFT JOIN users u ON t.assigned_to_user_id = u.id
    LEFT JOIN repair_projects p ON t.project_id = p.id
  `;
  const params: any[] = [];
  if (project_id) {
    sql += ' WHERE t.project_id = ?';
    params.push(project_id);
  }
  sql += ' ORDER BY t.created_at DESC';

  const tasks = db.prepare(sql).all(...params);
  res.json(tasks);
});

projectsRouter.post('/tasks', (req: Request, res: Response) => {
  const { project_id, title, assigned_to_user_id, priority, estimated_hours } = req.body;
  const id = `tsk-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO project_tasks (id, project_id, title, assigned_to_user_id, status, priority, estimated_hours)
    VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, ?)
  `).run(id, project_id, title, assigned_to_user_id || 'usr-tech-01', priority || 'MEDIUM', estimated_hours || 1.0);

  const created = db.prepare('SELECT * FROM project_tasks WHERE id = ?').get(id);
  res.status(201).json(created);
});

projectsRouter.patch('/tasks/:id/status', (req: Request, res: Response) => {
  const { status, actual_hours } = req.body;
  db.prepare('UPDATE project_tasks SET status = ?, actual_hours = COALESCE(?, actual_hours) WHERE id = ?')
    .run(status, actual_hours || null, req.params.id);
  res.json({ success: true, status });
});

// 4. Time Logs
projectsRouter.post('/tasks/:id/time-log', (req: Request, res: Response) => {
  const { user_id, hours, description } = req.body;
  const id = `tl-${uuidv4().substring(0, 8)}`;

  db.prepare(`
    INSERT INTO engineer_time_logs (id, task_id, user_id, hours, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.params.id, user_id || 'usr-tech-01', hours, description || 'Lab diagnosis and micro-soldering work');

  db.prepare('UPDATE project_tasks SET actual_hours = actual_hours + ? WHERE id = ?').run(hours, req.params.id);

  res.status(201).json({ id, message: 'Time logged successfully' });
});
