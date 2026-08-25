const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { assertTaskAccess } = require('../utils/access');
const { normalizeAppBaseUrl } = require('../utils/appBaseUrl');
const { normalizeTimezone } = require('../utils/timezone');
const {
  getRecommendations,
  getLearningInsights,
  getSuggestions,
  rebuildProfile
} = require('../services/learning');
const { evaluateAchievements } = require('../services/achievements');

const router = express.Router();

function mapFeedbackEstimateToAccuracy(estimateAccuracy) {
  const n = Number(estimateAccuracy);
  if (!Number.isFinite(n)) return null;
  if (n <= 2) return 'more';
  if (n >= 4) return 'less';
  if (n === 3) return 'accurate';
  return null;
}

// Submit task feedback
router.post('/feedback', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const {
      task_id,
      session_id,
      rating,
      difficulty,
      enjoyment,
      estimate_accuracy,
      needed_more_time,
      additional_minutes,
      feedback_text
    } = req.body;

    if (!task_id) {
      return res.status(400).json({ error: 'task_id is required' });
    }

    const access = await assertTaskAccess(res, task_id, user_id);
    if (!access) return;

    const result = await query(
      `INSERT INTO user_feedback (
         user_id, task_id, session_id, rating, difficulty, enjoyment,
         estimate_accuracy, needed_more_time, additional_minutes, feedback_text
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        user_id,
        task_id,
        session_id || null,
        rating ?? null,
        difficulty ?? null,
        enjoyment ?? null,
        estimate_accuracy ?? null,
        !!needed_more_time,
        additional_minutes || 0,
        feedback_text || null
      ]
    );

    const actualAccuracy = mapFeedbackEstimateToAccuracy(estimate_accuracy);
    if (actualAccuracy) {
      const taskRow = await query(
        'SELECT est_minutes FROM tasks WHERE id = $1',
        [task_id]
      );
      const estimatedMinutes = taskRow.rows[0]?.est_minutes;
      if (estimatedMinutes != null) {
        await query(
          `INSERT INTO task_estimate_accuracy (task_id, estimated_minutes, actual_accuracy, user_id)
           VALUES ($1, $2, $3, $4)`,
          [task_id, estimatedMinutes, actualAccuracy, user_id]
        );
      }
    }

    evaluateAchievements(user_id).catch((err) =>
      console.error('Achievement evaluation failed:', err.message)
    );

    res.status(201).json({ feedback: result.rows[0] });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

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

// Get learning recommendations
router.get('/recommendations', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const data = await getRecommendations(user_id);
    res.json(data);
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Failed to load recommendations' });
  }
});

// Suggested environment toggles for next focus session
router.get('/suggestions', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const estMinutes = req.query.est_minutes ? parseInt(req.query.est_minutes, 10) : undefined;
    const suggestions = await getSuggestions(user_id, { estMinutes });
    res.json(suggestions);
  } catch (error) {
    console.error('Get suggestions error:', error);
    res.status(500).json({ error: 'Failed to load suggestions' });
  }
});

// Rebuild learning profile from all past sessions
router.post('/learning/rebuild', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const profile = await rebuildProfile(user_id);
    res.json({
      tip: profile.best_tip,
      sampleCount: profile.sample_count,
      message: 'Focus profile rebuilt from your session history'
    });
  } catch (error) {
    console.error('Rebuild learning error:', error);
    res.status(500).json({ error: 'Failed to rebuild learning profile' });
  }
});

// Get productivity insights (learning engine)
router.get('/insights', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const insights = await getLearningInsights(user_id);
    res.json(insights);
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
      achievements: achievements.rows.map((row) => ({
        id: row.achievement_id,
        unlocked_at: row.unlocked_at
      }))
    });
  } catch (error) {
    console.error('Get gamification error:', error);
    res.status(500).json({ error: 'Failed to load gamification data' });
  }
});

const SLACK_INTENSITIES = new Set(['full', 'medium', 'light']);

function clampHour(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(23, Math.max(0, Math.round(n)));
}

function secretLast4(value) {
  const s = String(value || '');
  if (!s) return null;
  return s.slice(-4);
}

/** Only update secrets when a new non-empty value is sent; empty string clears. */
function shouldUpdateSecret(value) {
  if (value === undefined || value === null) return false;
  return true; // '' clears; non-empty replaces
}

function normalizeSecretValue(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// Get user settings
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const [settingsResult, channelResult] = await Promise.all([
      query(
        `SELECT slack_webhook_url, slack_user_id, slack_bot_token, app_base_url, timezone,
                slack_enabled, slack_intensity, quiet_hours_start, quiet_hours_end,
                digest_morning_hour, digest_evening_hour, digests_enabled
         FROM users WHERE id = $1`,
        [user_id]
      ),
      query(
        `SELECT EXISTS(
           SELECT 1 FROM projects
           WHERE user_id = $1
             AND slack_channel_id IS NOT NULL
             AND slack_channel_id != ''
         ) AS linked`,
        [user_id]
      )
    ]);

    const row = settingsResult.rows[0] || {};
    const webhook = row.slack_webhook_url || '';
    const token = row.slack_bot_token || '';

    res.json({
      slack_user_id: row.slack_user_id || null,
      app_base_url: row.app_base_url || null,
      timezone: row.timezone || null,
      slack_enabled: row.slack_enabled,
      slack_intensity: row.slack_intensity,
      quiet_hours_start: row.quiet_hours_start,
      quiet_hours_end: row.quiet_hours_end,
      digest_morning_hour: row.digest_morning_hour,
      digest_evening_hour: row.digest_evening_hour,
      digests_enabled: row.digests_enabled,
      slack_bot_token_set: Boolean(token),
      slack_webhook_set: Boolean(webhook),
      slack_bot_token_last4: secretLast4(token),
      slack_webhook_last4: secretLast4(webhook),
      slack_project_channel_linked: Boolean(channelResult.rows[0]?.linked)
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// Update user profile
router.put('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const {
      slack_webhook_url, slack_user_id, slack_bot_token, app_base_url, timezone,
      slack_enabled, slack_intensity, quiet_hours_start, quiet_hours_end,
      digest_morning_hour, digest_evening_hour, digests_enabled
    } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (shouldUpdateSecret(slack_webhook_url)) {
      fields.push(`slack_webhook_url = $${idx++}`);
      values.push(normalizeSecretValue(slack_webhook_url));
    }
    if (slack_user_id !== undefined) {
      fields.push(`slack_user_id = $${idx++}`);
      values.push(slack_user_id);
    }
    if (shouldUpdateSecret(slack_bot_token)) {
      fields.push(`slack_bot_token = $${idx++}`);
      values.push(normalizeSecretValue(slack_bot_token));
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
    if (slack_enabled !== undefined) {
      fields.push(`slack_enabled = $${idx++}`);
      values.push(!!slack_enabled);
    }
    if (slack_intensity !== undefined) {
      if (!SLACK_INTENSITIES.has(slack_intensity)) {
        return res.status(400).json({ error: 'slack_intensity must be full, medium, or light' });
      }
      fields.push(`slack_intensity = $${idx++}`);
      values.push(slack_intensity);
    }
    if (quiet_hours_start !== undefined) {
      fields.push(`quiet_hours_start = $${idx++}`);
      values.push(clampHour(quiet_hours_start, 22));
    }
    if (quiet_hours_end !== undefined) {
      fields.push(`quiet_hours_end = $${idx++}`);
      values.push(clampHour(quiet_hours_end, 7));
    }
    if (digest_morning_hour !== undefined) {
      fields.push(`digest_morning_hour = $${idx++}`);
      values.push(clampHour(digest_morning_hour, 9));
    }
    if (digest_evening_hour !== undefined) {
      fields.push(`digest_evening_hour = $${idx++}`);
      values.push(clampHour(digest_evening_hour, 18));
    }
    if (digests_enabled !== undefined) {
      fields.push(`digests_enabled = $${idx++}`);
      values.push(!!digests_enabled);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(user_id);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, email, app_base_url, timezone, slack_user_id,
                 slack_webhook_url, slack_bot_token,
                 slack_enabled, slack_intensity, quiet_hours_start, quiet_hours_end,
                 digest_morning_hour, digest_evening_hour, digests_enabled`,
      values
    );

    const user = result.rows[0] || {};
    const webhook = user.slack_webhook_url || '';
    const token = user.slack_bot_token || '';
    res.json({
      user: {
        id: user.id,
        email: user.email,
        app_base_url: user.app_base_url,
        timezone: user.timezone,
        slack_user_id: user.slack_user_id,
        slack_enabled: user.slack_enabled,
        slack_intensity: user.slack_intensity,
        quiet_hours_start: user.quiet_hours_start,
        quiet_hours_end: user.quiet_hours_end,
        digest_morning_hour: user.digest_morning_hour,
        digest_evening_hour: user.digest_evening_hour,
        digests_enabled: user.digests_enabled,
        slack_bot_token_set: Boolean(token),
        slack_webhook_set: Boolean(webhook),
        slack_bot_token_last4: secretLast4(token),
        slack_webhook_last4: secretLast4(webhook)
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
