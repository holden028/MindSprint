-- 009_app_base_url.sql
-- Per-user public app URL (domain or IP) for Slack deep links

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS app_base_url TEXT;
