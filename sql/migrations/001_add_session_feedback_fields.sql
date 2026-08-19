-- Add new feedback fields to sessions table
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS energy_level INT CHECK (energy_level BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS focus_quality INT CHECK (focus_quality BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS distractions JSONB;

-- Create task estimate accuracy tracking table
CREATE TABLE IF NOT EXISTS task_estimate_accuracy (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    estimated_minutes INT NOT NULL,
    actual_accuracy VARCHAR(20) CHECK (actual_accuracy IN ('less', 'accurate', 'more')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for accuracy tracking
CREATE INDEX IF NOT EXISTS idx_task_estimate_accuracy_task_id ON task_estimate_accuracy(task_id);
CREATE INDEX IF NOT EXISTS idx_task_estimate_accuracy_user_id ON task_estimate_accuracy(user_id);

-- Add actual_time_accuracy column to tasks table
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS actual_time_accuracy VARCHAR(20) CHECK (actual_time_accuracy IN ('less', 'accurate', 'more'));

