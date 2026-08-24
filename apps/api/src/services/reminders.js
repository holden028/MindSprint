const { query } = require('../config/database');

const AUTO_KINDS = [
  'day_before',
  'morning',
  'start_by',
  'two_hours',
  'hour_before',
  'half_hour',
  'due_soon',
  'five_min',
  'deadline'
];

function roundMinute(date) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return d;
}

/**
 * Build a persistent ADHD reminder ladder (dual-channel in_app + slack).
 */
async function createAutoReminders(userId, taskId, dueDate, estMinutes = 30) {
  await query(
    `DELETE FROM reminders
     WHERE task_id = $1 AND user_id = $2
       AND kind = ANY($3::varchar[])
       AND sent = false`,
    [taskId, userId, AUTO_KINDS]
  );

  const now = new Date();
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  const ladder = [];
  const seen = new Set();

  const add = (at, kind) => {
    if (!(at instanceof Date) || Number.isNaN(at.getTime())) return;
    if (at <= now) return;
    const key = roundMinute(at).getTime();
    if (seen.has(key)) return;
    seen.add(key);
    ladder.push({ at: roundMinute(at), kind });
  };

  add(new Date(due.getTime() - 24 * 60 * 60000), 'day_before');

  const eveBefore = new Date(due);
  eveBefore.setDate(eveBefore.getDate() - 1);
  eveBefore.setHours(18, 0, 0, 0);
  add(eveBefore, 'day_before');

  const dueDay9am = new Date(due);
  dueDay9am.setHours(9, 0, 0, 0);
  add(dueDay9am, 'morning');

  add(new Date(due.getTime() - (estMinutes + 30) * 60000), 'start_by');
  add(new Date(due.getTime() - 2 * 60 * 60000), 'two_hours');
  add(new Date(due.getTime() - 60 * 60000), 'hour_before');
  add(new Date(due.getTime() - 30 * 60000), 'half_hour');
  add(new Date(due.getTime() - 15 * 60000), 'due_soon');
  add(new Date(due.getTime() - 5 * 60000), 'five_min');
  add(due, 'deadline');

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
         AND kind = ANY($3::varchar[])
         AND sent = false`,
      [taskId, userId, AUTO_KINDS]
    );
    return;
  }
  await query(
    `DELETE FROM reminders
     WHERE task_id = $1
       AND kind = ANY($2::varchar[])
       AND sent = false`,
    [taskId, AUTO_KINDS]
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
  AUTO_KINDS,
  createAutoReminders,
  refreshAllAutoReminders,
  syncTaskReminders,
  clearAutoReminders
};
