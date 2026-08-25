const { query } = require('../config/database');

const ACHIEVEMENT_IDS = [
  'first_session',
  'early_bird',
  'night_owl',
  'focus_master',
  'estimate_expert',
  'week_warrior',
  'month_master',
  'century_club',
  'distraction_destroyer',
  'energy_enthusiast',
  'task_terminator',
  'project_pro'
];

async function unlock(userId, achievementId) {
  const result = await query(
    `INSERT INTO user_achievements (user_id, achievement_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, achievement_id) DO NOTHING
     RETURNING achievement_id`,
    [userId, achievementId]
  );
  return result.rows[0]?.achievement_id || null;
}

async function currentStreakDays(userId) {
  const result = await query(
    `WITH daily_sessions AS (
       SELECT DISTINCT DATE(started_at) as session_date
       FROM sessions
       WHERE user_id = $1 AND completed = true
       ORDER BY session_date DESC
     ),
     streak_calc AS (
       SELECT
         session_date,
         session_date - ROW_NUMBER() OVER (ORDER BY session_date DESC)::integer as streak_group
       FROM daily_sessions
     )
     SELECT COUNT(*)::int as streak
     FROM streak_calc
     WHERE streak_group = (
       SELECT MAX(streak_group) FROM streak_calc WHERE session_date >= CURRENT_DATE - 1
     )`,
    [userId]
  );
  return result.rows[0]?.streak || 0;
}

/**
 * Evaluate and unlock achievements for a user.
 * Safe to call repeatedly — inserts use ON CONFLICT DO NOTHING.
 */
async function evaluateAchievements(userId) {
  const unlocked = [];

  const [sessionStats, estimateStats, taskStats, projectStats, streak] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE completed = true)::int as completed_sessions,
         COUNT(*) FILTER (
           WHERE completed = true
             AND EXTRACT(HOUR FROM started_at) < 9
         )::int as early_sessions,
         COUNT(*) FILTER (
           WHERE completed = true
             AND EXTRACT(HOUR FROM started_at) >= 22
         )::int as late_sessions,
         COUNT(*) FILTER (
           WHERE completed = true AND self_rating >= 8
         )::int as high_rating_sessions,
         COUNT(*) FILTER (
           WHERE completed = true
             AND (
               distractions IS NULL
               OR distractions = '[]'::jsonb
               OR (jsonb_typeof(distractions) = 'array' AND jsonb_array_length(distractions) = 0)
             )
         )::int as zero_distraction_sessions,
         COUNT(*) FILTER (
           WHERE completed = true AND energy_level = 5
         )::int as high_energy_sessions
       FROM sessions
       WHERE user_id = $1`,
      [userId]
    ),
    query(
      `SELECT COUNT(*)::int as accurate_estimates
       FROM task_estimate_accuracy
       WHERE user_id = $1 AND actual_accuracy = 'accurate'`,
      [userId]
    ),
    query(
      `SELECT COUNT(*)::int as completed_tasks
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE p.user_id = $1 AND t.status = 'done'`,
      [userId]
    ),
    query(
      `SELECT COUNT(DISTINCT t.project_id)::int as completed_projects
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE p.user_id = $1 AND t.status = 'done'`,
      [userId]
    ),
    currentStreakDays(userId)
  ]);

  const s = sessionStats.rows[0] || {};
  const accurateEstimates = estimateStats.rows[0]?.accurate_estimates || 0;
  const completedTasks = taskStats.rows[0]?.completed_tasks || 0;
  const completedProjects = projectStats.rows[0]?.completed_projects || 0;

  const checks = [
    [s.completed_sessions >= 1, 'first_session'],
    [s.early_sessions >= 5, 'early_bird'],
    [s.late_sessions >= 5, 'night_owl'],
    [s.high_rating_sessions >= 10, 'focus_master'],
    [accurateEstimates >= 10, 'estimate_expert'],
    [streak >= 7, 'week_warrior'],
    [streak >= 30, 'month_master'],
    [s.completed_sessions >= 100, 'century_club'],
    [s.zero_distraction_sessions >= 5, 'distraction_destroyer'],
    [s.high_energy_sessions >= 10, 'energy_enthusiast'],
    [completedTasks >= 50, 'task_terminator'],
    [completedProjects >= 5, 'project_pro']
  ];

  for (const [ok, id] of checks) {
    if (ok) {
      const newly = await unlock(userId, id);
      if (newly) unlocked.push(newly);
    }
  }

  return unlocked;
}

module.exports = {
  ACHIEVEMENT_IDS,
  evaluateAchievements,
  unlock
};
