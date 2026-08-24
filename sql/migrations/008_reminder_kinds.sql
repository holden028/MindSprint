-- 008_reminder_kinds.sql
-- Typed reminder ladder for ADHD scaffolding (start_by, due_soon, deadline, etc.)

ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS kind VARCHAR(40) NOT NULL DEFAULT 'custom';

CREATE INDEX IF NOT EXISTS idx_reminders_kind_sent
  ON reminders (kind, sent, remind_at)
  WHERE sent = false;

-- Track digest / escalation sends via notifications.type uniqueness window
-- (no schema change needed — uses notifications.type values:
--  reminder_start_by, reminder_due_soon, reminder_deadline, reminder_overdue,
--  reminder_not_started, reminder_custom, morning_digest)
