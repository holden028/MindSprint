-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    source_type VARCHAR(50) DEFAULT 'manual' CHECK (source_type IN ('manual', 'email', 'screenshot', 'manager_api')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    tags TEXT[] DEFAULT '{}',
    ai_analysis JSONB
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
    priority INT DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    urgency INT DEFAULT 3 CHECK (urgency BETWEEN 1 AND 5),
    est_minutes INT DEFAULT 30,
    actual_minutes INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    tags TEXT[] DEFAULT '{}'
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    mode VARCHAR(20) DEFAULT 'pomodoro' CHECK (mode IN ('pomodoro', 'adhd')),
    duration_minutes INT DEFAULT 25,
    actual_duration_minutes INT,
    environment JSONB,
    self_rating INT CHECK (self_rating BETWEEN 1 AND 10),
    notes TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    completed BOOLEAN DEFAULT FALSE
);

-- Ingest table for AI processing
CREATE TABLE IF NOT EXISTS ingests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    content_type VARCHAR(50) DEFAULT 'text' CHECK (content_type IN ('text', 'screenshot')),
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'error')),
    result JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- User feedback table
CREATE TABLE IF NOT EXISTS user_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    rating INT CHECK (rating BETWEEN 1 AND 10),
    difficulty INT CHECK (difficulty BETWEEN 1 AND 10),
    enjoyment INT CHECK (enjoyment BETWEEN 1 AND 10),
    estimate_accuracy INT CHECK (estimate_accuracy BETWEEN 1 AND 5),
    needed_more_time BOOLEAN DEFAULT FALSE,
    additional_minutes INT DEFAULT 0,
    feedback_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_task_id ON sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_ingests_user_id ON ingests(user_id);
CREATE INDEX IF NOT EXISTS idx_ingests_status ON ingests(status);
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_task_id ON user_feedback(task_id);
