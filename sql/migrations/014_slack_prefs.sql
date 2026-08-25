-- 014_slack_prefs.sql
-- User Slack notification preferences, project↔channel links, Slack thread conversations

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS slack_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS slack_intensity VARCHAR(20) NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS quiet_hours_start SMALLINT NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS quiet_hours_end SMALLINT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS digest_morning_hour SMALLINT NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS digest_evening_hour SMALLINT NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS digests_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_slack_intensity_check;
ALTER TABLE users
  ADD CONSTRAINT users_slack_intensity_check
  CHECK (slack_intensity IN ('full', 'medium', 'light'));

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS slack_channel_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS slack_channel_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_projects_slack_channel
  ON projects (slack_channel_id)
  WHERE slack_channel_id IS NOT NULL;

ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS slack_thread_key VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_conversations_slack_thread
  ON ai_conversations (user_id, slack_thread_key)
  WHERE slack_thread_key IS NOT NULL;
