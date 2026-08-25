-- Per-user focus learning profile (aggregated from completed sessions)
CREATE TABLE IF NOT EXISTS focus_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sample_count INT NOT NULL DEFAULT 0,
  avg_rating NUMERIC(5, 2) NOT NULL DEFAULT 0,
  avg_focus NUMERIC(5, 2) NOT NULL DEFAULT 0,
  avg_energy NUMERIC(5, 2) NOT NULL DEFAULT 0,
  env_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  hour_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  distraction_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimate_bias JSONB NOT NULL DEFAULT '{"less":0,"accurate":0,"more":0}'::jsonb,
  best_tip TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_focus_profiles_updated ON focus_profiles(updated_at DESC);
