-- Track Slack presence messages for active focus sessions
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS slack_focus_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS slack_focus_ts TEXT;
