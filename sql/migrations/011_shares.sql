-- 011_shares.sql
-- Invite others to a task or a whole project. Invitees keep their own work.

CREATE TABLE IF NOT EXISTS shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_email VARCHAR(255) NOT NULL,
  invitee_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'edit',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  is_assignment BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  CONSTRAINT shares_target_chk CHECK (
    (task_id IS NOT NULL AND project_id IS NULL)
    OR (task_id IS NULL AND project_id IS NOT NULL)
  ),
  CONSTRAINT shares_status_chk CHECK (status IN ('pending', 'accepted', 'revoked')),
  CONSTRAINT shares_role_chk CHECK (role IN ('view', 'edit'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_task_email
  ON shares (owner_id, lower(invitee_email), task_id)
  WHERE task_id IS NOT NULL AND status != 'revoked';

CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_project_email
  ON shares (owner_id, lower(invitee_email), project_id)
  WHERE project_id IS NOT NULL AND status != 'revoked';

CREATE INDEX IF NOT EXISTS idx_shares_invitee_user
  ON shares (invitee_user_id, status)
  WHERE invitee_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shares_invitee_email
  ON shares (lower(invitee_email), status);

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
