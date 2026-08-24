const { query } = require('../config/database');

/**
 * Build the ADHD reminder ladder for a task with a due date.
 * Creates dual-channel (in_app + slack) rows for each step.
 */
async function createAutoReminders(userId, taskId, dueDate, estMinutes = 30) {
  await query(
    `DELETE FROM reminders
     WHERE task_id = $1 AND user_id = $2
       AND kind IN ('morning', 'start_by', 'due_soon', 'deadline')
       AND sent = false`,
    [taskId, userId]
  );

  const now = new Date();
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  const ladder = [];

  const startBy = new Date(due.getTime() - (estMinutes + 30) * 60000);
  if (startBy > now) ladder.push({ at: startBy, kind: 'start_by' });

  const dueSoon = new Date(due.getTime() - 15 * 60000);
  if (dueSoon > now && dueSoon.getTime() !== startBy.getTime()) {
    ladder.push({ at: dueSoon, kind: 'due_soon' });
  }

  if (due > now) {
    ladder.push({ at: due, kind: 'deadline' });
  }

  const dueDay9am = new Date(due);
  dueDay9am.setHours(9, 0, 0, 0);
  const already = new Set(ladder.map((r) => r.at.getTime()));
  if (dueDay9am > now && !already.has(dueDay9am.getTime()) && dueDay9am.getTime() < due.getTime()) {
    ladder.push({ at: dueDay9am, kind: 'morning' });
  }

  for (const item of ladder) {
    for (const channel of ['in_app', 'slack']) {
      await query(
        `INSERT INTO reminders (task_id, user_id, remind_at, channel, kind)
         VALUES ($1, $2, $3, $4, $5)`,
        [taskId, userId, item.at, channel, item.kind]
      );
    }
  }

  return ladder.length;
}

async function clearAutoReminders(taskId, userId = null) {
  if (userId) {
    await query(
      `DELETE FROM reminders
       WHERE task_id = $1 AND user_id = $2
         AND kind IN ('morning', 'start_by', 'due_soon', 'deadline')
         AND sent = false`,
      [taskId, userId]
    );
    return;
  }
  await query(
    `DELETE FROM reminders
     WHERE task_id = $1
       AND kind IN ('morning', 'start_by', 'due_soon', 'deadline')
       AND sent = false`,
    [taskId]
  );
}

/** Owner keeps the ladder unless the task is assigned; then only the assignee does. */
async function syncTaskReminders(taskId) {
  const result = await query(
    `SELECT t.id, t.due_at, t.est_minutes, t.assignee_user_id, p.user_id as owner_id
     FROM tasks t
     JOIN projects p ON t.project_id = p.id
     WHERE t.id = $1`,
    [taskId]
  );
  const row = result.rows[0];
  if (!row) return 0;

  await clearAutoReminders(taskId);

  if (!row.due_at) return 0;
  const recipient = row.assignee_user_id || row.owner_id;
  return createAutoReminders(recipient, taskId, new Date(row.due_at), row.est_minutes || 30);
}

/** Rebuild typed ladders for every open task that has due_at (optionally one user). */
async function refreshAllAutoReminders(userId = null) {
  const params = [];
  let where = `WHERE t.status != 'done' AND t.due_at IS NOT NULL`;
  if (userId) {
    params.push(userId);
    where += ` AND (p.user_id = $1 OR t.assignee_user_id = $1)`;
  }

  const result = await query(
    `SELECT t.id
     FROM tasks t
     JOIN projects p ON t.project_id = p.id
     ${where}`,
    params
  );

  let refreshed = 0;
  for (const row of result.rows) {
    await syncTaskReminders(row.id);
    refreshed += 1;
  }
  return refreshed;
}

module.exports = {
  createAutoReminders,
  refreshAllAutoReminders,
  syncTaskReminders,
  clearAutoReminders
};
