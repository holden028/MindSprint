-- Missing columns/tables used by the API, plus indexes matching real filters.

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS original_title VARCHAR(255),
ADD COLUMN IF NOT EXISTS original_description TEXT,
ADD COLUMN IF NOT EXISTS ai_interpretations JSONB,
ADD COLUMN IF NOT EXISTS ai_questions_asked JSONB;

CREATE TABLE IF NOT EXISTS custom_environments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_name VARCHAR(100) DEFAULT 'Settings',
    icon_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_custom_environments_user_id ON custom_environments(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user_started_at ON sessions(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_user_completed ON sessions(user_id) WHERE completed = true;

CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
