-- TaskTime MVP schema

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: add is_blocked if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL DEFAULT 'task',
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  estimated_hours DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_logs (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creator_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_task ON time_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_user ON time_logs(user_id);

-- Audit log (ТЗ п. 9.6, ТР.19, ИБ.9): события для аудита и передачи в SIEM
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(100),
  level VARCHAR(20) NOT NULL DEFAULT 'info',
  details JSONB,
  ip VARCHAR(45),
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_level ON audit_log(level);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  -- Тип проекта: demo (синтетический/демо) или real (живой продуктовый проект)
  project_type VARCHAR(20) NOT NULL DEFAULT 'demo'
    CHECK (project_type IN ('demo','real')),
  business_goal TEXT,
  budget NUMERIC(15,2),
  planned_revenue NUMERIC(15,2),
  owner_id INTEGER REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product teams
CREATE TABLE IF NOT EXISTS product_teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  lead_id INTEGER REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_team_members (
  team_id INTEGER REFERENCES product_teams(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  PRIMARY KEY (team_id, user_id)
);

-- Business functions
CREATE TABLE IF NOT EXISTS business_functions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hierarchical task items (epic → story → subtask)
CREATE TABLE IF NOT EXISTS task_items (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER REFERENCES task_items(id) ON DELETE CASCADE,
  level VARCHAR(20) NOT NULL CHECK (level IN ('epic','story','subtask')),
  order_index INTEGER DEFAULT 0,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  acceptance_criteria TEXT,
  context_type VARCHAR(30) CHECK (context_type IN ('project','quick','product_team')),
  context_id INTEGER,
  type VARCHAR(50) DEFAULT 'task',
  priority VARCHAR(20) DEFAULT 'medium'
    CHECK (priority IN ('critical','high','medium','low')),
  status VARCHAR(30) DEFAULT 'open'
    CHECK (status IN ('open','in_progress','in_review','done','cancelled')),
  story_points INTEGER,
  estimated_hours NUMERIC(6,2),
  assignee_id INTEGER REFERENCES users(id),
  creator_id INTEGER REFERENCES users(id) NOT NULL,
  reviewer_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_items_parent ON task_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_task_items_context ON task_items(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_task_items_assignee ON task_items(assignee_id);
CREATE INDEX IF NOT EXISTS idx_task_items_status ON task_items(status);

-- Link time_logs to task_items (in addition to legacy tasks)
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS task_item_id INTEGER REFERENCES task_items(id);
