const { query } = require('../config/database');
const { chatJson } = require('../config/openai');

const MAX_TASKS = 40;

function clampScore(value, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(5, Math.max(1, n));
}

async function applyPriorityUpdates(userId, updates) {
  if (!updates.length) return;

  const valueRows = updates.map((_, i) => {
    const base = i * 3;
    return `($${base + 1}::uuid, $${base + 2}::int, $${base + 3}::int)`;
  }).join(', ');

  const params = [];
  for (const update of updates) {
    params.push(
      update.task_id,
      clampScore(update.new_priority, 3),
      clampScore(update.new_urgency, 3)
    );
  }
  params.push(userId);

  await query(`
    UPDATE tasks t
    SET priority = v.priority,
        urgency = v.urgency,
        updated_at = NOW()
    FROM (VALUES ${valueRows}) AS v(id, priority, urgency)
    WHERE t.id = v.id
      AND t.project_id IN (SELECT id FROM projects WHERE user_id = $${params.length})
  `, params);
}

async function updatePriorities(userId, { trigger_type, trigger_data } = {}) {
  const tasksResult = await query(`
    SELECT t.id, t.title, t.description, t.priority, t.urgency, t.est_minutes,
           t.status, p.title as project_title
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE p.user_id = $1 AND t.status != 'done'
    ORDER BY t.priority DESC, t.urgency DESC, t.created_at ASC
    LIMIT $2
  `, [userId, MAX_TASKS]);

  const tasks = tasksResult.rows;
  if (tasks.length === 0) {
    return {
      message: 'No tasks to update',
      updates_applied: 0,
      insights: [],
      recommendations: []
    };
  }

  const prompt = `As an intelligent task manager, analyze these tasks and suggest priority/urgency updates based on the context.

Current tasks:
${tasks.map((t) => `
- id=${t.id} ${t.title} (P${t.priority}, U${t.urgency}, ${t.est_minutes}min) - ${t.project_title}
  ${t.description || 'No description'}
`).join('')}

Trigger: ${trigger_type || 'manual'} - ${JSON.stringify(trigger_data || {})}

Consider:
1. Task dependencies and relationships
2. Time estimates and deadlines
3. Project importance and urgency
4. Workload balance
5. Quick wins vs. deep work

Respond with JSON:
{
  "updates": [
    {"task_id": "id", "new_priority": 1-5, "new_urgency": 1-5, "reason": "explanation"}
  ],
  "insights": ["insight1"],
  "recommendations": ["recommendation1"]
}`;

  const analysis = await chatJson({ prompt, temperature: 0.3, max_tokens: 2000 });
  const allowedIds = new Set(tasks.map((t) => t.id));
  const updates = Array.isArray(analysis.updates)
    ? analysis.updates.filter((u) => u && allowedIds.has(u.task_id))
    : [];

  await applyPriorityUpdates(userId, updates);

  return {
    message: 'Priorities updated successfully',
    updates_applied: updates.length,
    insights: Array.isArray(analysis.insights) ? analysis.insights : [],
    recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : []
  };
}

module.exports = { updatePriorities };
