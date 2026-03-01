require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, getClient } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

app.use(express.json());

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
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Tasks CRUD (all require auth) ———

// List tasks (optional filters: assignee_id, status, creator_id)
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
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get one task
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
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update task
app.put('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
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
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete task
app.delete('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM tasks WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
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
      const taskCheck = await client.query('SELECT id FROM tasks WHERE id = $1', [taskId]);
      if (taskCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
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
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Time logs: list for task ———
app.get('/api/tasks/:id/time-logs', authMiddleware, async (req, res) => {
  try {
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

app.listen(PORT, () => {
  console.log(`TaskTime API listening on http://localhost:${PORT}`);
});
