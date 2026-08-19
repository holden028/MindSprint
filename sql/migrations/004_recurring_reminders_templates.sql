-- 004_recurring_reminders_templates.sql

-- Recurring task columns on tasks
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence_rule JSONB,
  ADD COLUMN IF NOT EXISTS next_occurrence TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tasks_recurring
  ON tasks (is_recurring, next_occurrence)
  WHERE is_recurring = true;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id
  ON tasks (parent_task_id)
  WHERE parent_task_id IS NOT NULL;

-- Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'in_app',
  sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_due
  ON reminders (remind_at)
  WHERE sent = false;

CREATE INDEX IF NOT EXISTS idx_reminders_user_id
  ON reminders (user_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  read BOOLEAN DEFAULT false,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, created_at DESC)
  WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON notifications (user_id, created_at DESC);

-- Task templates
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  est_minutes INTEGER,
  priority INTEGER DEFAULT 3,
  urgency INTEGER DEFAULT 3,
  tags TEXT[],
  recurrence_rule JSONB,
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_templates_user_id
  ON task_templates (user_id);

-- Project templates
CREATE TABLE IF NOT EXISTS project_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_templates_user_id
  ON project_templates (user_id);

-- Project template tasks
CREATE TABLE IF NOT EXISTS project_template_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_template_id UUID NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  est_minutes INTEGER,
  priority INTEGER DEFAULT 3,
  urgency INTEGER DEFAULT 3,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_project_template_tasks_template
  ON project_template_tasks (project_template_id, sort_order);

-- Slack webhook on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT;
