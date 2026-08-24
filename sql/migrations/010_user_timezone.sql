-- 010_user_timezone.sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/London';
