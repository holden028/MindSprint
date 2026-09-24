-- Allow untimed "free work" sessions (timer optional; Pomodoro is not required)
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_mode_check;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_mode_check
  CHECK (mode IN ('pomodoro', 'adhd', 'free'));
