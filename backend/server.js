require('dotenv').config();
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, getClient } = require('./db');
const { audit } = require('./audit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const PIXEL_OFFICE_WEBHOOK_URL = process.env.PIXEL_OFFICE_WEBHOOK_URL || '';

app.use(express.json());

// ——— Task permission (ТЗ п. 9.4, ТР.1: CRUD по объекту) ———
// admin: full; manager: full; user: only if creator or assignee
function canReadTask(task, user) {
  if (user.role === 'admin' || user.role === 'manager') return true;
  return task.creator_id === user.id || task.assignee_id === user.id;
}
function canUpdateTask(task, user) {
  if (user.role === 'admin' || user.role === 'manager') return true;
  return task.creator_id === user.id || task.assignee_id === user.id;
}
function canDeleteTask(task, user) {
  if (user.role === 'admin' || user.role === 'manager') return true;
  return task.creator_id === user.id || task.assignee_id === user.id;
}

// ——— JWT middleware ———
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id, email: payload.email, role: payload.role };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ——— Auth: register ———
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, role = 'user' } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, name required' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, created_at`,
      [email, password_hash, name, role]
    );
    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token });
    await audit({ userId: user.id, action: 'auth.register', entityType: 'user', entityId: user.id, req: req });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

// ——— Auth: login ———
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }
    const result = await query(
      'SELECT id, email, name, role, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    await audit({ userId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, req: req });
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Users list (for assignee picker) ———
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, name, role FROM users ORDER BY name'
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Tasks CRUD (all require auth) ———

// List tasks (optional filters: assignee_id, status, creator_id). RBAC: user sees only own/assigned.
app.get('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const { assignee_id, status, creator_id } = req.query;
    let sql = `
      SELECT t.id, t.title, t.description, t.type, t.priority, t.status,
             t.assignee_id, t.creator_id, t.estimated_hours, t.created_at, t.updated_at,
             ua.name AS assignee_name, uc.name AS creator_name
      FROM tasks t
      LEFT JOIN users ua ON t.assignee_id = ua.id
      LEFT JOIN users uc ON t.creator_id = uc.id
      WHERE 1=1`;
    const params = [];
    let n = 1;
    if (req.user.role === 'user') {
      sql += ` AND (t.creator_id = $${n} OR t.assignee_id = $${n})`;
      params.push(req.user.id);
      n++;
    }
    if (assignee_id) { sql += ` AND t.assignee_id = $${n}`; params.push(assignee_id); n++; }
    if (status) { sql += ` AND t.status = $${n}`; params.push(status); n++; }
    if (creator_id) { sql += ` AND t.creator_id = $${n}`; params.push(creator_id); n++; }
    sql += ' ORDER BY t.updated_at DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create task
app.post('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const {
      title,
      description,
      type = 'task',
      priority = 'medium',
      status = 'open',
      assignee_id,
      estimated_hours,
    } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const result = await query(
      `INSERT INTO tasks (title, description, type, priority, status, assignee_id, creator_id, estimated_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, title, description, type, priority, status, assignee_id, creator_id, estimated_hours, created_at, updated_at`,
      [title, description || null, type, priority, status, assignee_id || null, req.user.id, estimated_hours || null]
    );
    const task = result.rows[0];
    await audit({ userId: req.user.id, action: 'task.create', entityType: 'task', entityId: task.id, req: req });
    if (PIXEL_OFFICE_WEBHOOK_URL && task) {
      fetch(PIXEL_OFFICE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'tasktime',
          event: 'task.created',
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            priority: task.priority,
            status: task.status,
            assignee_id: task.assignee_id,
            creator_id: task.creator_id,
            created_at: task.created_at,
          },
        }),
      }).catch((err) => console.error('Pixel Office webhook error:', err.message));
    }
    res.status(201).json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get one task (RBAC: user can read only if creator or assignee)
app.get('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT t.id, t.title, t.description, t.type, t.priority, t.status,
              t.assignee_id, t.creator_id, t.estimated_hours, t.created_at, t.updated_at,
              ua.name AS assignee_name, uc.name AS creator_name
       FROM tasks t
       LEFT JOIN users ua ON t.assignee_id = ua.id
       LEFT JOIN users uc ON t.creator_id = uc.id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = result.rows[0];
    if (!canReadTask(task, req.user)) return res.status(403).json({ error: 'Forbidden' });
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update task (RBAC: user can update only if creator or assignee)
app.put('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const check = await query('SELECT id, creator_id, assignee_id FROM tasks WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    if (!canUpdateTask(check.rows[0], req.user)) return res.status(403).json({ error: 'Forbidden' });
    const {
      title,
      description,
      type,
      priority,
      status,
      assignee_id,
      estimated_hours,
    } = req.body;
    const result = await query(
      `UPDATE tasks SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         type = COALESCE($4, type),
         priority = COALESCE($5, priority),
         status = COALESCE($6, status),
         assignee_id = $7,
         estimated_hours = COALESCE($8, estimated_hours),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, description, type, priority, status, assignee_id, creator_id, estimated_hours, created_at, updated_at`,
      [req.params.id, title, description, type, priority, status, assignee_id !== undefined ? assignee_id : null, estimated_hours]
    );
    const task = result.rows[0];
    await audit({ userId: req.user.id, action: 'task.update', entityType: 'task', entityId: task.id, req: req });
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete task (RBAC: user can delete only if creator or assignee)
app.delete('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const check = await query('SELECT id, creator_id, assignee_id FROM tasks WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    if (!canDeleteTask(check.rows[0], req.user)) return res.status(403).json({ error: 'Forbidden' });
    const taskId = req.params.id;
    await query('DELETE FROM tasks WHERE id = $1', [taskId]);
    await audit({ userId: req.user.id, action: 'task.delete', entityType: 'task', entityId: taskId, req: req });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Time logs: start timer ———
app.post('/api/tasks/:id/time/start', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user.id;
    const client = await getClient();
    try {
      const taskCheck = await client.query('SELECT id, creator_id, assignee_id FROM tasks WHERE id = $1', [taskId]);
      if (taskCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      if (!canReadTask(taskCheck.rows[0], req.user)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const open = await client.query(
        'SELECT id FROM time_logs WHERE task_id = $1 AND user_id = $2 AND ended_at IS NULL',
        [taskId, userId]
      );
      if (open.rows.length > 0) {
        return res.status(409).json({ error: 'Timer already running for this task' });
      }
      const started_at = new Date();
      const insert = await client.query(
        `INSERT INTO time_logs (task_id, user_id, started_at)
         VALUES ($1, $2, $3)
         RETURNING id, task_id, user_id, started_at, ended_at, duration_minutes`,
        [taskId, userId, started_at]
      );
      audit({ userId, action: 'time.start', entityType: 'time_log', entityId: insert.rows[0].id, details: { task_id: taskId }, req }).catch(() => {});
      res.status(201).json(insert.rows[0]);
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Time logs: stop timer ———
app.post('/api/tasks/:id/time/stop', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user.id;
    const ended_at = new Date();
    const result = await query(
      `UPDATE time_logs SET ended_at = $3, duration_minutes = ROUND(EXTRACT(EPOCH FROM ($3 - started_at)) / 60)::INTEGER, updated_at = NOW()
       WHERE task_id = $1 AND user_id = $2 AND ended_at IS NULL
       RETURNING id, task_id, user_id, started_at, ended_at, duration_minutes`,
      [taskId, userId, ended_at]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active timer found for this task' });
    }
    audit({ userId: req.user.id, action: 'time.stop', entityType: 'time_log', entityId: result.rows[0].id, details: { task_id: taskId, duration_minutes: result.rows[0].duration_minutes }, req }).catch(() => {});
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Time logs: list for task (RBAC: only if user can read task) ———
app.get('/api/tasks/:id/time-logs', authMiddleware, async (req, res) => {
  try {
    const taskRow = await query('SELECT id, creator_id, assignee_id FROM tasks WHERE id = $1', [req.params.id]);
    if (taskRow.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    if (!canReadTask(taskRow.rows[0], req.user)) return res.status(403).json({ error: 'Forbidden' });
    const result = await query(
      `SELECT tl.id, tl.task_id, tl.user_id, tl.started_at, tl.ended_at, tl.duration_minutes, u.name AS user_name
       FROM time_logs tl
       JOIN users u ON tl.user_id = u.id
       WHERE tl.task_id = $1
       ORDER BY tl.started_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Time logs: list my logs (optional task_id filter) ———
app.get('/api/time-logs', authMiddleware, async (req, res) => {
  try {
    const { task_id } = req.query;
    let sql = `
      SELECT tl.id, tl.task_id, tl.user_id, tl.started_at, tl.ended_at, tl.duration_minutes, t.title AS task_title
      FROM time_logs tl
      JOIN tasks t ON tl.task_id = t.id
      WHERE tl.user_id = $1`;
    const params = [req.user.id];
    if (task_id) { sql += ' AND tl.task_id = $2'; params.push(task_id); }
    sql += ' ORDER BY tl.started_at DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Static frontend (постановка задач, мобильный интерфейс)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.listen(PORT, () => {
  console.log(`TaskTime API listening on http://localhost:${PORT}`);
});
