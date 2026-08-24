-- 012_share_overrides_assignee.sql
-- Additive if 011 was applied before overrides / assignee existed.

ALTER TABLE shares
  ADD COLUMN IF NOT EXISTS is_assignment BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS share_task_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  share_id UUID NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT share_task_overrides_role_chk CHECK (role IN ('view', 'edit', 'hidden')),
  CONSTRAINT share_task_overrides_unique UNIQUE (share_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_share_task_overrides_task
  ON share_task_overrides (task_id);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS assignee_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_user
  ON tasks (assignee_user_id)
  WHERE assignee_user_id IS NOT NULL;
