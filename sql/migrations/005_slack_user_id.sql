-- 005_slack_user_id.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_user_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_users_slack_user_id ON users (slack_user_id) WHERE slack_user_id IS NOT NULL;
