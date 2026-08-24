const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { normalizeAppBaseUrl } = require('../utils/appBaseUrl');
const { normalizeTimezone } = require('../utils/timezone');

const router = express.Router();

// Get user stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;

    const [sessionStats, taskStats] = await Promise.all([
      query(`
        SELECT
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN completed = true THEN 1 END) as completed_sessions,
          AVG(self_rating) as avg_rating,
          SUM(actual_duration_minutes) as total_minutes
        FROM sessions
        WHERE user_id = $1
      `, [user_id]),
      query(`
        SELECT
          COUNT(*) as total_tasks,
          COUNT(CASE WHEN status = 'done' THEN 1 END) as completed_tasks,
          AVG(actual_minutes) as avg_actual_minutes,
          AVG(est_minutes) as avg_est_minutes
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE p.user_id = $1
      `, [user_id])
    ]);

    res.json({
      sessions: sessionStats.rows[0],
      tasks: taskStats.rows[0]
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to load statistics' });
  }
});

// Get AI recommendations
router.get('/recommendations', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;

    const recentSessions = await query(`
      SELECT mode, environment, self_rating
      FROM sessions
      WHERE user_id = $1 AND completed = true
      ORDER BY started_at DESC
      LIMIT 20
    `, [user_id]);

    const recommendations = [];

    if (recentSessions.rows.length > 0) {
      const avgRating = recentSessions.rows.reduce((sum, s) => sum + (s.self_rating || 0), 0) / recentSessions.rows.length;

      if (avgRating < 5) {
        recommendations.push({
          type: 'environment',
          message: 'Try adjusting your environment settings for better focus'
        });
      }

      recommendations.push({
        type: 'general',
        message: 'Keep up the great work! You\'ve completed ' + recentSessions.rows.length + ' sessions'
      });
    }

    res.json({ recommendations });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Failed to load recommendations' });
  }
});

// Get productivity insights
router.get('/insights', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;

    const [hourlyPerf, envPerf, avgMetrics, distractions] = await Promise.all([
      query(`
        SELECT
          EXTRACT(HOUR FROM started_at) as hour,
          AVG(self_rating) as avg_rating,
          COUNT(*) as sessions
        FROM sessions
        WHERE user_id = $1 AND self_rating IS NOT NULL AND completed = true
        GROUP BY EXTRACT(HOUR FROM started_at)
        ORDER BY hour
      `, [user_id]),
      query(`
        SELECT
          environment::text as environment,
          AVG(self_rating) as avg_rating,
          COUNT(*) as sessions
        FROM sessions
        WHERE user_id = $1 AND self_rating IS NOT NULL AND completed = true AND environment IS NOT NULL
        GROUP BY environment
        ORDER BY avg_rating DESC
      `, [user_id]),
      query(`
        SELECT
          AVG(energy_level) as avg_energy,
          AVG(focus_quality) as avg_focus
        FROM sessions
        WHERE user_id = $1 AND completed = true
      `, [user_id]),
      query(`
        SELECT
          jsonb_array_elements_text(distractions) as type,
          COUNT(*) as count
        FROM sessions
        WHERE user_id = $1 AND jsonb_typeof(distractions) = 'array' AND completed = true
        GROUP BY type
        ORDER BY count DESC
      `, [user_id])
    ]);

    const bestTime = hourlyPerf.rows.length > 0
      ? hourlyPerf.rows.reduce((best, curr) =>
          parseFloat(curr.avg_rating) > parseFloat(best.avg_rating) ? curr : best
        )
      : { hour: 14, avg_rating: 0, sessions: 0 };

    const totalDistractions = distractions.rows.reduce((sum, d) => sum + parseInt(d.count), 0);
    const distractionAnalysis = distractions.rows.map(d => ({
      type: d.type,
      count: parseInt(d.count),
      percentage: totalDistractions > 0 ? (parseInt(d.count) / totalDistractions * 100).toFixed(1) : 0
    }));

    const recommendations = [];
    if (bestTime.sessions > 5) {
      recommendations.push(`Your most productive time is ${bestTime.hour}:00-${parseInt(bestTime.hour) + 1}:00. Schedule important tasks then!`);
    }
    if (envPerf.rows.length > 0) {
      recommendations.push(`You work best in: ${envPerf.rows[0].environment}. Try to replicate this environment!`);
    }
    if (avgMetrics.rows[0]?.avg_energy < 3) {
      recommendations.push(`Your energy levels are low. Consider taking more breaks and getting better sleep.`);
    }
    if (distractionAnalysis.length > 0) {
      recommendations.push(`${distractionAnalysis[0].type} is your top distraction. Try removing it during focus sessions.`);
    }

    res.json({
      hourlyPerformance: hourlyPerf.rows.map(r => ({
        hour: parseInt(r.hour),
        avgRating: parseFloat(r.avg_rating),
        sessions: parseInt(r.sessions)
      })),
      bestTimeOfDay: {
        hour: parseInt(bestTime.hour),
        sessions: parseInt(bestTime.sessions)
      },
      environmentPerformance: envPerf.rows.map(r => ({
        environment: r.environment,
        avgRating: parseFloat(r.avg_rating),
        sessions: parseInt(r.sessions)
      })),
      avgEnergy: parseFloat(avgMetrics.rows[0]?.avg_energy || 3),
      avgFocus: parseFloat(avgMetrics.rows[0]?.avg_focus || 3),
      distractionAnalysis,
      topDistraction: distractionAnalysis[0] || { type: 'None', count: 0 },
      recommendations
    });
  } catch (error) {
    console.error('Get insights error:', error);
    res.status(500).json({ error: 'Failed to load insights' });
  }
});

// Get gamification data
router.get('/gamification', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;

    const [userStats, streakResult, longestStreakResult, achievements] = await Promise.all([
      query(`
        SELECT
          COALESCE(SUM(
            CASE
              WHEN completed = true THEN 10
              ELSE 0
            END +
            CASE
              WHEN self_rating >= 8 THEN 5
              ELSE 0
            END
          ), 0) as xp
        FROM sessions
        WHERE user_id = $1
      `, [user_id]),
      query(`
        WITH daily_sessions AS (
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
        SELECT COUNT(*) as streak
        FROM streak_calc
        WHERE streak_group = (SELECT MAX(streak_group) FROM streak_calc WHERE session_date >= CURRENT_DATE - 1)
      `, [user_id]),
      query(`
        WITH daily_sessions AS (
          SELECT DISTINCT DATE(started_at) as session_date
          FROM sessions
          WHERE user_id = $1 AND completed = true
          ORDER BY session_date
        ),
        streak_groups AS (
          SELECT
            session_date,
            session_date - ROW_NUMBER() OVER (ORDER BY session_date)::integer as streak_group
          FROM daily_sessions
        ),
        streak_counts AS (
          SELECT streak_group, COUNT(*) as streak_length
          FROM streak_groups
          GROUP BY streak_group
        )
        SELECT COALESCE(MAX(streak_length), 0) as longest_streak
        FROM streak_counts
      `, [user_id]),
      query(`
        SELECT achievement_id, unlocked_at
        FROM user_achievements
        WHERE user_id = $1
        ORDER BY unlocked_at DESC
      `, [user_id])
    ]);

    const xp = parseInt(userStats.rows[0]?.xp || 0);
    const level = Math.floor(xp / 100) + 1;

    res.json({
      level,
      xp,
      xpForNextLevel: 100,
      streak: parseInt(streakResult.rows[0]?.streak || 0),
      longestStreak: parseInt(longestStreakResult.rows[0]?.longest_streak || 0),
      achievements: achievements.rows
    });
  } catch (error) {
    console.error('Get gamification error:', error);
    res.status(500).json({ error: 'Failed to load gamification data' });
  }
});

// Get user settings
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const result = await query(
      'SELECT slack_webhook_url, slack_user_id, slack_bot_token, app_base_url, timezone FROM users WHERE id = $1',
      [user_id]
    );
    res.json(result.rows[0] || {});
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// Update user profile
router.put('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { slack_webhook_url, slack_user_id, slack_bot_token, app_base_url, timezone } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (slack_webhook_url !== undefined) {
      fields.push(`slack_webhook_url = $${idx++}`);
      values.push(slack_webhook_url);
    }
    if (slack_user_id !== undefined) {
      fields.push(`slack_user_id = $${idx++}`);
      values.push(slack_user_id);
    }
    if (slack_bot_token !== undefined) {
      fields.push(`slack_bot_token = $${idx++}`);
      values.push(slack_bot_token);
    }
    if (app_base_url !== undefined) {
      let normalized = null;
      try {
        normalized = normalizeAppBaseUrl(app_base_url);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
      fields.push(`app_base_url = $${idx++}`);
      values.push(normalized);
    }
    if (timezone !== undefined) {
      let tz;
      try {
        tz = normalizeTimezone(timezone || 'Europe/London');
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
      fields.push(`timezone = $${idx++}`);
      values.push(tz);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(user_id);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, email, slack_webhook_url, app_base_url, timezone`,
      values
    );

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
