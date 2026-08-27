const { query } = require('../config/database');
const { withWorkMode } = require('../utils/taskWorkMode');

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function expandRecurringBlock(block, rangeStart, rangeEnd) {
  const rule = block.recurrence_rule;
  if (!rule || !rule.days || rule.days.length === 0) return [block];

  const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const targetDays = rule.days.map((d) => dayMap[d.toLowerCase()]).filter((d) => d !== undefined);
  const origStart = new Date(block.starts_at);
  const origEnd = new Date(block.ends_at);
  const durationMs = origEnd - origStart;
  const startHour = origStart.getHours();
  const startMin = origStart.getMinutes();
  const instances = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= rangeEnd) {
    if (targetDays.includes(cursor.getDay())) {
      const s = new Date(cursor);
      s.setHours(startHour, startMin, 0, 0);
      if (s >= rangeStart && s <= rangeEnd) {
        instances.push({
          ...block,
          starts_at: s.toISOString(),
          ends_at: new Date(s.getTime() + durationMs).toISOString()
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return instances;
}

async function getTodayFreeMinutes(userId) {
  const dayStart = startOfDay();
  const dayEnd = endOfDay();
  const dateStr = dayStart.toISOString().slice(0, 10);

  const blocksResult = await query(
    `SELECT * FROM time_blocks WHERE user_id = $1 AND (
      (starts_at >= $2 AND starts_at < $3) OR recurrence_rule IS NOT NULL
    )`,
    [userId, dayStart, dayEnd]
  );

  const busy = [];
  for (const block of blocksResult.rows) {
    if (!block.recurrence_rule) {
      busy.push({ start: new Date(block.starts_at), end: new Date(block.ends_at) });
    } else {
      for (const inst of expandRecurringBlock(block, dayStart, dayEnd)) {
        busy.push({ start: new Date(inst.starts_at), end: new Date(inst.ends_at) });
      }
    }
  }
  busy.sort((a, b) => a.start - b.start);

  const wakeStart = new Date(`${dateStr}T07:00:00`);
  const wakeEnd = new Date(`${dateStr}T22:00:00`);
  const now = new Date();
  let cursor = now > wakeStart ? now : wakeStart;
  let free = 0;

  for (const slot of busy) {
    if (slot.end <= cursor || slot.start >= wakeEnd) continue;
    if (slot.start > cursor) free += (slot.start - cursor) / 60000;
    if (slot.end > cursor) cursor = slot.end;
  }
  if (cursor < wakeEnd) free += (wakeEnd - cursor) / 60000;
  return Math.max(0, Math.round(free));
}

function annotateUrgency(task, now = new Date()) {
  const due = task.due_at ? new Date(task.due_at) : null;
  const est = task.est_minutes || 30;
  const startBy = due ? new Date(due.getTime() - (est + 30) * 60000) : null;
  const todayEnd = endOfDay(now);

  let urgency_bucket = 'later';
  if (due) {
    if (due < now && task.status !== 'done') urgency_bucket = 'overdue';
    else if (due <= todayEnd) urgency_bucket = 'due_today';
    else if (startBy && startBy <= todayEnd) urgency_bucket = 'start_today';
  }
  return { ...task, urgency_bucket };
}

function scoreForToday(task, freeMinutes) {
  const bucketScore = { overdue: 1000, due_today: 800, start_today: 600, later: 0 };
  let score = (bucketScore[task.urgency_bucket] || 0) + (task.priority || 0) * 10 + (task.urgency || 0) * 5;
  if ((task.est_minutes || 30) <= freeMinutes) score += 20;
  if (task.status === 'doing') score += 50;
  return score;
}

async function getTodayPlanForUser(userId) {
  const now = new Date();
  const [tasksResult, freeMinutes] = await Promise.all([
    query(`
      SELECT t.*, p.title AS project_title
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE p.user_id = $1 AND t.status != 'done'
      ORDER BY
        CASE WHEN t.status = 'doing' THEN 0 ELSE 1 END,
        COALESCE(t.due_at, '2999-01-01') ASC,
        t.priority DESC,
        t.urgency DESC
      LIMIT 40
    `, [userId]),
    getTodayFreeMinutes(userId)
  ]);

  const annotated = tasksResult.rows
    .map((t) => withWorkMode(annotateUrgency(t, now)))
    .sort((a, b) => scoreForToday(b, freeMinutes) - scoreForToday(a, freeMinutes));

  const plan = [];
  let remaining = freeMinutes;
  for (const task of annotated) {
    const est = task.est_minutes || 30;
    if (plan.length === 0 || est <= remaining || task.urgency_bucket === 'overdue' || task.urgency_bucket === 'due_today') {
      plan.push(task);
      remaining -= est;
    }
    if (plan.length >= 8) break;
  }

  return {
    freeMinutes,
    planMinutes: plan.reduce((s, t) => s + (t.est_minutes || 30), 0),
    plan,
    quickTasks: annotated.filter((t) => t.work_mode === 'quick'),
    focusTasks: annotated.filter((t) => t.work_mode === 'focus'),
    overdue: annotated.filter((t) => t.urgency_bucket === 'overdue'),
    dueToday: annotated.filter((t) => t.urgency_bucket === 'due_today'),
    allOpen: annotated
  };
}

module.exports = {
  getTodayFreeMinutes,
  getTodayPlanForUser
};
