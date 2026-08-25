const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { assertTaskAccess } = require('../utils/access');
const { parseLimit, parseOffset } = require('../utils/pagination');
const { recordSessionEnd } = require('../services/learning');
const {
  announceFocusStart,
  announceFocusEnd,
  abandonOpenFocusSessions,
  slackApi
} = require('../services/slackNotify');

const router = express.Router();

async function refreshSlackHome(userId) {
  try {
    const full = await query(
      `SELECT id, email, slack_user_id, slack_bot_token, slack_webhook_url, app_base_url, timezone,
              slack_enabled, slack_intensity, quiet_hours_start, quiet_hours_end,
              digests_enabled, digest_morning_hour, digest_evening_hour
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = full.rows[0];
    if (!user?.slack_bot_token || !user?.slack_user_id) return;
    const { buildHomeView } = require('../utils/slackHome');
    const home = await buildHomeView(user);
    await slackApi(user.slack_bot_token, 'views.publish', {
      user_id: user.slack_user_id,
      view: home
    });
  } catch (err) {
    console.error('refreshSlackHome error:', err.message);
  }
}

// Start a focus session
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { task_id, mode = 'pomodoro', duration_minutes = 25, environment = {} } = req.body;

    if (task_id) {
      const access = await assertTaskAccess(res, task_id, user_id, { requireEdit: true });
      if (!access) return;
    }

    await abandonOpenFocusSessions(user_id);

    const result = await query(`
      INSERT INTO sessions (user_id, task_id, mode, duration_minutes, environment)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [user_id, task_id, mode, duration_minutes, environment]);

    const session = result.rows[0];
    announceFocusStart(session.id, user_id)
      .then(() => refreshSlackHome(user_id))
      .catch((err) => console.error('Focus Slack announce error:', err.message));

    res.status(201).json({ session });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// End a focus session
router.post('/end', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const {
      session_id,
      self_rating,
      notes,
      energy_level,
      focus_quality,
      distractions,
      actual_duration_minutes
    } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const sessionResult = await query(
      'SELECT id, started_at FROM sessions WHERE id = $1 AND user_id = $2',
      [session_id, user_id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];
    const calculatedDuration = actual_duration_minutes || Math.floor((Date.now() - new Date(session.started_at).getTime()) / 60000);

    await query(`
      UPDATE sessions
      SET
        ended_at = NOW(),
        actual_duration_minutes = $1,
        self_rating = $2,
        notes = $3,
        energy_level = $4,
        focus_quality = $5,
        distractions = $6,
        completed = true
      WHERE id = $7
    `, [
      calculatedDuration,
      self_rating,
      notes,
      energy_level || null,
      focus_quality || null,
      distractions || null,
      session_id
    ]);

    let learning = null;
    try {
      learning = await recordSessionEnd(user_id, session_id);
    } catch (err) {
      console.error('Learning profile update failed:', err.message);
    }

    announceFocusEnd(session_id, user_id)
      .then(() => refreshSlackHome(user_id))
      .catch((err) => console.error('Focus Slack end announce error:', err.message));

    res.json({
      message: 'Session ended successfully',
      learning: learning
        ? { tip: learning.best_tip, sampleCount: learning.sample_count }
        : null
    });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Complete task early
router.delete('/complete-task', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { task_id } = req.body;

    if (!task_id) {
      return res.status(400).json({ error: 'Task ID is required' });
    }

    const access = await assertTaskAccess(res, task_id, user_id, { requireEdit: true });
    if (!access) return;

    await query(`
      UPDATE tasks
      SET status = 'done', completed_at = NOW()
      WHERE id = $1
    `, [task_id]);

    res.json({ message: 'Task completed successfully' });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

// Get session history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const limit = parseLimit(req.query.limit, { defaultValue: 50, max: 100 });
    const offset = parseOffset(req.query.offset);

    const result = await query(`
      SELECT
        s.id, s.user_id, s.task_id, s.mode, s.duration_minutes, s.actual_duration_minutes,
        s.environment, s.self_rating, s.notes, s.started_at, s.ended_at, s.completed,
        s.energy_level, s.focus_quality, s.distractions,
        t.title as task_title,
        p.title as project_title
      FROM sessions s
      LEFT JOIN tasks t ON s.task_id = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE s.user_id = $1
      ORDER BY s.started_at DESC
      LIMIT $2 OFFSET $3
    `, [user_id, limit, offset]);

    res.json({ sessions: result.rows, limit, offset });
  } catch (error) {
    console.error('Get session history error:', error);
    res.status(500).json({ error: 'Failed to load session history' });
  }
});

module.exports = router;
