-- 006_slack_bot_token.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_bot_token VARCHAR(255);
