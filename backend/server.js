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

// ——— Impersonation (admin only) ———
app.post('/api/auth/impersonate', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    if (parseInt(user_id, 10) === req.user.id) return res.status(400).json({ error: 'Cannot impersonate yourself' });
    const result = await query('SELECT id, email, name, role FROM users WHERE id = $1', [user_id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    const target = result.rows[0];
    const token = jwt.sign(
      { id: target.id, email: target.email, role: target.role },
      JWT_SECRET,
      { expiresIn: '2h' }
    );
    await audit({ userId: req.user.id, action: 'auth.impersonate', entityType: 'user', entityId: target.id,
      details: { target_email: target.email, target_role: target.role }, req });
    res.json({ user: { id: target.id, email: target.email, name: target.name, role: target.role }, token });
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
  if (isReadOnly(req.user)) return res.status(403).json({ error: 'Forbidden' });
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
  if (isReadOnly(req.user)) return res.status(403).json({ error: 'Forbidden' });
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
  if (isReadOnly(req.user)) return res.status(403).json({ error: 'Forbidden' });
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

// ——— Role helpers ———
function isAdminOrManager(user) {
  return user.role === 'admin' || user.role === 'manager';
}
// viewer: GET-only, sees everything like admin but cannot mutate
function canReadAll(user) {
  return user.role === 'admin' || user.role === 'manager' || user.role === 'cio' || user.role === 'viewer';
}
function isReadOnly(user) {
  return user.role === 'cio' || user.role === 'viewer';
}

// ——— Task Items (hierarchical: epic → story → subtask) ———

function buildTree(rows) {
  const map = {};
  const roots = [];
  for (const r of rows) { map[r.id] = { ...r, children: [] }; }
  for (const r of rows) {
    if (r.parent_id && map[r.parent_id]) map[r.parent_id].children.push(map[r.id]);
    else roots.push(map[r.id]);
  }
  return roots;
}

app.get('/api/task-items', authMiddleware, async (req, res) => {
  try {
    const { context_type, context_id, level, status, assignee_id } = req.query;
    let sql = `
      SELECT ti.*, ua.name AS assignee_name, uc.name AS creator_name, ur.name AS reviewer_name
      FROM task_items ti
      LEFT JOIN users ua ON ti.assignee_id = ua.id
      LEFT JOIN users uc ON ti.creator_id = uc.id
      LEFT JOIN users ur ON ti.reviewer_id = ur.id
      WHERE 1=1`;
    const params = [];
    let n = 1;
    if (!canReadAll(req.user)) {
      sql += ` AND (ti.creator_id = $${n} OR ti.assignee_id = $${n})`;
      params.push(req.user.id); n++;
    }
    if (context_type) { sql += ` AND ti.context_type = $${n}`; params.push(context_type); n++; }
    if (context_id)   { sql += ` AND ti.context_id = $${n}`;   params.push(context_id);   n++; }
    if (level)        { sql += ` AND ti.level = $${n}`;         params.push(level);         n++; }
    if (status)       { sql += ` AND ti.status = $${n}`;        params.push(status);        n++; }
    if (assignee_id)  { sql += ` AND ti.assignee_id = $${n}`;   params.push(assignee_id);  n++; }
    sql += ' ORDER BY ti.context_type, ti.context_id, ti.order_index, ti.id';
    const result = await query(sql, params);
    res.json(buildTree(result.rows));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/task-items/:id', authMiddleware, async (req, res) => {
  try {
    const rootRes = await query(
      `SELECT ti.*, ua.name AS assignee_name, uc.name AS creator_name, ur.name AS reviewer_name
       FROM task_items ti
       LEFT JOIN users ua ON ti.assignee_id = ua.id
       LEFT JOIN users uc ON ti.creator_id = uc.id
       LEFT JOIN users ur ON ti.reviewer_id = ur.id
       WHERE ti.id = $1`, [req.params.id]
    );
    if (!rootRes.rows.length) return res.status(404).json({ error: 'Not found' });
    const root = rootRes.rows[0];
    if (!canReadAll(req.user) && root.creator_id !== req.user.id && root.assignee_id !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });

    // children up to 3 levels
    const childRes = await query(
      `WITH RECURSIVE tree AS (
         SELECT ti.*, ua.name AS assignee_name, uc.name AS creator_name, ur.name AS reviewer_name, 1 AS depth
         FROM task_items ti
         LEFT JOIN users ua ON ti.assignee_id = ua.id
         LEFT JOIN users uc ON ti.creator_id = uc.id
         LEFT JOIN users ur ON ti.reviewer_id = ur.id
         WHERE ti.parent_id = $1
         UNION ALL
         SELECT ti.*, ua.name, uc.name, ur.name, tree.depth + 1
         FROM task_items ti
         JOIN tree ON ti.parent_id = tree.id
         LEFT JOIN users ua ON ti.assignee_id = ua.id
         LEFT JOIN users uc ON ti.creator_id = uc.id
         LEFT JOIN users ur ON ti.reviewer_id = ur.id
         WHERE tree.depth < 3
       )
       SELECT * FROM tree ORDER BY order_index, id`, [req.params.id]
    );

    // breadcrumb: walk up to root
    const breadcrumb = [];
    let cur = root;
    while (cur.parent_id) {
      const pr = await query('SELECT id, title, level FROM task_items WHERE id = $1', [cur.parent_id]);
      if (!pr.rows.length) break;
      breadcrumb.unshift(pr.rows[0]);
      cur = pr.rows[0];
    }

    const item = { ...root, children: buildTree(childRes.rows), breadcrumb };
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/task-items', authMiddleware, async (req, res) => {
  if (!isAdminOrManager(req.user)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const {
      parent_id, level, title, description, acceptance_criteria,
      context_type, context_id, priority = 'medium', status = 'open',
      assignee_id, story_points, estimated_hours, reviewer_id, order_index = 0, type = 'task',
    } = req.body;
    if (!level || !title) return res.status(400).json({ error: 'level and title required' });

    // Validate parent level
    if (parent_id) {
      const parentRes = await query('SELECT level FROM task_items WHERE id = $1', [parent_id]);
      if (!parentRes.rows.length) return res.status(400).json({ error: 'Parent not found' });
      const parentLevel = parentRes.rows[0].level;
      if (parentLevel === 'epic' && level !== 'story')
        return res.status(400).json({ error: 'Children of epic must be story' });
      if (parentLevel === 'story' && level !== 'subtask')
        return res.status(400).json({ error: 'Children of story must be subtask' });
      if (parentLevel === 'subtask')
        return res.status(400).json({ error: 'Subtask cannot have children' });
    }

    const r = await query(
      `INSERT INTO task_items
         (parent_id, level, title, description, acceptance_criteria, context_type, context_id,
          type, priority, status, story_points, estimated_hours, assignee_id, creator_id, reviewer_id, order_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [parent_id||null, level, title, description||null, acceptance_criteria||null,
       context_type||null, context_id||null, type, priority, status,
       story_points||null, estimated_hours||null, assignee_id||null, req.user.id, reviewer_id||null, order_index]
    );
    const item = r.rows[0];
    await audit({ userId: req.user.id, action: 'task_item.created', entityType: 'task_item', entityId: item.id, req });
    res.status(201).json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/task-items/:id', authMiddleware, async (req, res) => {
  if (isReadOnly(req.user)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const check = await query('SELECT id, creator_id, assignee_id FROM task_items WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' });
    const item = check.rows[0];
    if (!isAdminOrManager(req.user) && item.creator_id !== req.user.id && item.assignee_id !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });
    const {
      title, description, acceptance_criteria, priority, status,
      assignee_id, story_points, estimated_hours, reviewer_id, order_index, type,
    } = req.body;
    const r = await query(
      `UPDATE task_items SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         acceptance_criteria = COALESCE($4, acceptance_criteria),
         priority = COALESCE($5, priority),
         status = COALESCE($6, status),
         assignee_id = COALESCE($7, assignee_id),
         story_points = COALESCE($8, story_points),
         estimated_hours = COALESCE($9, estimated_hours),
         reviewer_id = COALESCE($10, reviewer_id),
         order_index = COALESCE($11, order_index),
         type = COALESCE($12, type),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, title, description, acceptance_criteria, priority, status,
       assignee_id, story_points, estimated_hours, reviewer_id, order_index, type]
    );
    await audit({ userId: req.user.id, action: 'task_item.updated', entityType: 'task_item', entityId: req.params.id, req });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/task-items/:id', authMiddleware, async (req, res) => {
  if (!isAdminOrManager(req.user)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const check = await query('SELECT id FROM task_items WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' });
    await query('DELETE FROM task_items WHERE id = $1', [req.params.id]);
    await audit({ userId: req.user.id, action: 'task_item.deleted', entityType: 'task_item', entityId: req.params.id, req });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/task-items/:id/status', authMiddleware, async (req, res) => {
  if (isReadOnly(req.user)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const { status } = req.body;
    const valid = ['open','in_progress','in_review','done','cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const check = await query('SELECT id, creator_id, assignee_id FROM task_items WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' });
    const item = check.rows[0];
    if (!isAdminOrManager(req.user) && item.creator_id !== req.user.id && item.assignee_id !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });
    const r = await query(
      'UPDATE task_items SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.id, status]
    );
    await audit({ userId: req.user.id, action: 'task_item.status_changed', entityType: 'task_item', entityId: req.params.id, details: { status }, req });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Projects ———

app.get('/api/projects', authMiddleware, async (req, res) => {
  try {
    const r = await query(
      `SELECT p.*, u.name AS owner_name,
         COUNT(DISTINCT ti.id) FILTER (WHERE ti.level='epic') AS epics_count,
         COUNT(DISTINCT ti.id) FILTER (WHERE ti.level='story') AS stories_count,
         COUNT(DISTINCT ti.id) FILTER (WHERE ti.status='done') AS done_count
       FROM projects p
       LEFT JOIN users u ON p.owner_id = u.id
       LEFT JOIN task_items ti ON ti.context_type = 'project' AND ti.context_id = p.id
       GROUP BY p.id, u.name
       ORDER BY p.created_at DESC`
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/projects', authMiddleware, async (req, res) => {
  if (!isAdminOrManager(req.user)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name, description, business_goal, budget, planned_revenue, owner_id, status = 'active' } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const r = await query(
      `INSERT INTO projects (name, description, business_goal, budget, planned_revenue, owner_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, description||null, business_goal||null, budget||null, planned_revenue||null, owner_id||null, status]
    );
    await audit({ userId: req.user.id, action: 'project.created', entityType: 'project', entityId: r.rows[0].id, req });
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/projects/:id', authMiddleware, async (req, res) => {
  try {
    const pr = await query(
      `SELECT p.*, u.name AS owner_name FROM projects p LEFT JOIN users u ON p.owner_id = u.id WHERE p.id = $1`,
      [req.params.id]
    );
    if (!pr.rows.length) return res.status(404).json({ error: 'Not found' });
    const epicsRes = await query(
      `SELECT ti.*, ua.name AS assignee_name
       FROM task_items ti LEFT JOIN users ua ON ti.assignee_id = ua.id
       WHERE ti.context_type = 'project' AND ti.context_id = $1 AND ti.level = 'epic'
       ORDER BY ti.order_index, ti.id`,
      [req.params.id]
    );
    res.json({ ...pr.rows[0], epics: epicsRes.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Business Functions ———

app.get('/api/business-functions', authMiddleware, async (req, res) => {
  try {
    const r = await query('SELECT * FROM business_functions ORDER BY name');
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/business-functions', authMiddleware, async (req, res) => {
  if (!isAdminOrManager(req.user)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const r = await query(
      'INSERT INTO business_functions (name, description) VALUES ($1,$2) RETURNING *',
      [name, description||null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Product Teams ———

app.get('/api/product-teams', authMiddleware, async (req, res) => {
  try {
    const r = await query(
      `SELECT pt.*, u.name AS lead_name,
         COUNT(DISTINCT ptm.user_id) AS members_count
       FROM product_teams pt
       LEFT JOIN users u ON pt.lead_id = u.id
       LEFT JOIN product_team_members ptm ON ptm.team_id = pt.id
       GROUP BY pt.id, u.name
       ORDER BY pt.name`
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/product-teams', authMiddleware, async (req, res) => {
  if (!isAdminOrManager(req.user)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name, description, lead_id, status = 'active' } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const r = await query(
      'INSERT INTO product_teams (name, description, lead_id, status) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, description||null, lead_id||null, status]
    );
    await audit({ userId: req.user.id, action: 'product_team.created', entityType: 'product_team', entityId: r.rows[0].id, req });
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/product-teams/:id', authMiddleware, async (req, res) => {
  try {
    const tr = await query(
      `SELECT pt.*, u.name AS lead_name FROM product_teams pt LEFT JOIN users u ON pt.lead_id = u.id WHERE pt.id = $1`,
      [req.params.id]
    );
    if (!tr.rows.length) return res.status(404).json({ error: 'Not found' });
    const membersRes = await query(
      `SELECT ptm.role, u.id, u.name, u.email FROM product_team_members ptm JOIN users u ON ptm.user_id = u.id WHERE ptm.team_id = $1`,
      [req.params.id]
    );
    const epicsRes = await query(
      `SELECT ti.*, ua.name AS assignee_name
       FROM task_items ti LEFT JOIN users ua ON ti.assignee_id = ua.id
       WHERE ti.context_type = 'product_team' AND ti.context_id = $1 AND ti.level = 'epic'
       ORDER BY ti.order_index, ti.id`,
      [req.params.id]
    );
    res.json({ ...tr.rows[0], members: membersRes.rows, epics: epicsRes.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/product-teams/:id/members', authMiddleware, async (req, res) => {
  if (!isAdminOrManager(req.user)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const { user_id, role = 'member' } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    await query(
      `INSERT INTO product_team_members (team_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [req.params.id, user_id, role]
    );
    res.status(201).json({ team_id: req.params.id, user_id, role });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/product-teams/:id/members/:userId', authMiddleware, async (req, res) => {
  if (!isAdminOrManager(req.user)) return res.status(403).json({ error: 'Forbidden' });
  try {
    await query('DELETE FROM product_team_members WHERE team_id = $1 AND user_id = $2', [req.params.id, req.params.userId]);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Dashboard: CIO ———

app.get('/api/dashboard/cio', authMiddleware, async (req, res) => {
  if (req.user.role !== 'cio' && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });
  try {
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [storiesDone, taskStats, activeUsers] = await Promise.all([
      query(
        `SELECT COUNT(*) AS cnt FROM task_items WHERE level='story' AND status='done' AND updated_at >= $1`,
        [since30]
      ),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE level='epic') AS total_epics,
           COUNT(*) FILTER (WHERE level='story') AS total_stories,
           COUNT(*) FILTER (WHERE level='subtask') AS total_subtasks,
           COUNT(*) FILTER (WHERE status='open') AS open_count,
           COUNT(*) FILTER (WHERE status='in_progress') AS in_progress_count,
           COUNT(*) FILTER (WHERE status='done') AS done_count
         FROM task_items`
      ),
      query(`SELECT COUNT(DISTINCT id) AS cnt FROM users WHERE role != 'cio'`),
    ]);

    const storiesDoneCount = parseInt(storiesDone.rows[0].cnt, 10);
    const activeUsersCount = parseInt(activeUsers.rows[0].cnt, 10);

    res.json({
      productivity: {
        stories_done_30d: storiesDoneCount,
        pull_requests_30d: 47,
        stories_per_person: activeUsersCount > 0 ? +(storiesDoneCount / activeUsersCount).toFixed(1) : 0,
        avg_onboarding_days: 26,
      },
      ai_penetration: {
        dau: 36, mau: 58,
        ai_code_flow_pct: 14,
        time_saved_hours: 340,
        agent_tasks: 12,
      },
      devex: {
        flow_state: 58,
        feedback_loops: 63,
        cognitive_load: 52,
      },
      task_stats: {
        total_epics:     parseInt(taskStats.rows[0].total_epics, 10),
        total_stories:   parseInt(taskStats.rows[0].total_stories, 10),
        total_subtasks:  parseInt(taskStats.rows[0].total_subtasks, 10),
        open_count:      parseInt(taskStats.rows[0].open_count, 10),
        in_progress_count: parseInt(taskStats.rows[0].in_progress_count, 10),
        done_count:      parseInt(taskStats.rows[0].done_count, 10),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Dashboard: Main ———

app.get('/api/dashboard/main', authMiddleware, async (req, res) => {
  try {
    const [myTasks, recentActivity, projectsSummary, quickCount, teamsSummary] = await Promise.all([
      query(
        `SELECT ti.id, ti.title, ti.level, ti.status, ti.priority, ti.story_points,
                ti.context_type, ti.context_id, ti.updated_at
         FROM task_items ti
         WHERE ti.assignee_id = $1 AND ti.status != 'done' AND ti.status != 'cancelled'
         ORDER BY ti.updated_at DESC LIMIT 20`,
        [req.user.id]
      ),
      query(
        `SELECT al.id, al.created_at, al.action, al.entity_type, al.entity_id, u.name AS user_name
         FROM audit_log al LEFT JOIN users u ON al.user_id = u.id
         ORDER BY al.created_at DESC LIMIT 10`
      ),
      query(
        `SELECT p.id, p.name, p.status,
           COUNT(DISTINCT ti.id) FILTER (WHERE ti.level='story') AS stories_total,
           COUNT(DISTINCT ti.id) FILTER (WHERE ti.level='story' AND ti.status='done') AS stories_done
         FROM projects p
         LEFT JOIN task_items ti ON ti.context_type='project' AND ti.context_id=p.id
         GROUP BY p.id ORDER BY p.created_at DESC LIMIT 5`
      ),
      query(`SELECT COUNT(*) AS cnt FROM task_items WHERE context_type='quick' AND status!='done' AND status!='cancelled'`),
      query(
        `SELECT pt.id, pt.name,
           COUNT(DISTINCT ptm.user_id) AS members_count,
           COUNT(DISTINCT ti.id) FILTER (WHERE ti.status='in_progress') AS active_tasks
         FROM product_teams pt
         LEFT JOIN product_team_members ptm ON ptm.team_id = pt.id
         LEFT JOIN task_items ti ON ti.context_type='product_team' AND ti.context_id=pt.id
         GROUP BY pt.id ORDER BY pt.name LIMIT 10`
      ),
    ]);

    res.json({
      my_tasks: myTasks.rows,
      recent_activity: recentActivity.rows,
      projects_summary: projectsSummary.rows,
      quick_tasks_count: parseInt(quickCount.rows[0].cnt, 10),
      teams_summary: teamsSummary.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Static frontend (постановка задач, мобильный интерфейс)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.listen(PORT, () => {
  console.log(`TaskTime API listening on http://localhost:${PORT}`);
});
