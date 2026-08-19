-- 007_smart_scheduling.sql

-- Hard deadline on tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks (due_at) WHERE due_at IS NOT NULL;

-- Time blocks for schedule management
CREATE TABLE IF NOT EXISTS time_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  recurrence_rule JSONB,
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_time_blocks_user ON time_blocks (user_id, starts_at);

-- AI chat conversation history
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations (user_id, updated_at DESC);

-- Google Calendar placeholder
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_token JSONB;
