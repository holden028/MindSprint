const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { signToken } = require('../utils/jwt');
const { parseLimit, parseOffset } = require('../utils/pagination');

const router = express.Router();

const loginLimiter = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});

// Get all users
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, { defaultValue: 50, max: 100 });
    const offset = parseOffset(req.query.offset);

    const result = await query(`
      SELECT
        u.id,
        u.email,
        u.created_at,
        u.updated_at,
        COALESCE(pc.project_count, 0) AS project_count,
        COALESCE(sc.session_count, 0) AS session_count
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS project_count
        FROM projects
        GROUP BY user_id
      ) pc ON pc.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS session_count
        FROM sessions
        GROUP BY user_id
      ) sc ON sc.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({ users: result.rows, limit, offset });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// Reset user password
router.post('/users/:userId/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, userId]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Delete user
router.delete('/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    if (String(userId) === String(req.user.user_id)) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Admin login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await query(
      'SELECT id, email, password_hash, is_admin FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({
      user_id: user.id,
      email: user.email,
      is_admin: true
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        is_admin: true,
        isAdmin: true
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get platform analytics
router.get('/analytics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const revenue = {
      total: 0,
      monthly: 0,
      arpu: 0
    };

    const [userGrowth, engagement, usage, tasksCompleted, avgSessionsPerUser, retention] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as users_30d,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days') as users_prev_30d,
          COUNT(*) as total_users
        FROM users
      `),
      query(`
        SELECT
          COUNT(DISTINCT user_id) FILTER (WHERE started_at >= NOW() - INTERVAL '7 days') as active_users_7d,
          COUNT(DISTINCT user_id) as total_active_users,
          (SELECT COUNT(*) FROM users) as total_users
        FROM sessions
      `),
      query(`
        SELECT
          COUNT(*) as total_sessions,
          AVG(actual_duration_minutes) as avg_session_duration,
          COUNT(DISTINCT user_id) FILTER (WHERE started_at >= CURRENT_DATE) as dau,
          SUM(actual_duration_minutes) / 60.0 as total_focus_hours
        FROM sessions
        WHERE completed = true
      `),
      query(`
        SELECT COUNT(*) as count FROM tasks WHERE status = 'done'
      `),
      query(`
        SELECT AVG(session_count) as avg_sessions
        FROM (
          SELECT user_id, COUNT(*) as session_count
          FROM sessions
          WHERE completed = true
          GROUP BY user_id
        ) user_sessions
      `),
      query(`
        WITH first_sessions AS (
          SELECT user_id, MIN(started_at) as first_session
          FROM sessions
          GROUP BY user_id
        ),
        returned_users AS (
          SELECT DISTINCT fs.user_id
          FROM first_sessions fs
          JOIN sessions s ON fs.user_id = s.user_id
          WHERE s.started_at > fs.first_session + INTERVAL '7 days'
            AND fs.first_session < NOW() - INTERVAL '7 days'
        )
        SELECT
          COUNT(DISTINCT fs.user_id) as eligible_users,
          COUNT(DISTINCT ru.user_id) as returned_users
        FROM first_sessions fs
        LEFT JOIN returned_users ru ON fs.user_id = ru.user_id
        WHERE fs.first_session < NOW() - INTERVAL '7 days'
      `)
    ]);

    const growth30d = userGrowth.rows[0].users_prev_30d > 0
      ? (((userGrowth.rows[0].users_30d - userGrowth.rows[0].users_prev_30d) / userGrowth.rows[0].users_prev_30d) * 100).toFixed(1)
      : 0;

    const engagementRate = engagement.rows[0].total_users > 0
      ? ((engagement.rows[0].active_users_7d / engagement.rows[0].total_users) * 100).toFixed(1)
      : 0;

    const retentionRate = retention.rows[0].eligible_users > 0
      ? ((retention.rows[0].returned_users / retention.rows[0].eligible_users) * 100).toFixed(1)
      : 0;

    res.json({
      revenue,
      growth: {
        user_growth_30d: parseFloat(growth30d),
        revenue_growth_30d: 0
      },
      engagement: {
        active_users: parseInt(engagement.rows[0].active_users_7d),
        engagement_rate: parseFloat(engagementRate)
      },
      usage: {
        total_sessions: parseInt(usage.rows[0].total_sessions || 0),
        avg_session_duration: parseFloat(usage.rows[0].avg_session_duration || 0).toFixed(1),
        dau: parseInt(usage.rows[0].dau || 0),
        tasks_completed: parseInt(tasksCompleted.rows[0].count || 0),
        avg_sessions_per_user: parseFloat(avgSessionsPerUser.rows[0].avg_sessions || 0).toFixed(1),
        total_focus_hours: parseFloat(usage.rows[0].total_focus_hours || 0).toFixed(1)
      },
      retention: {
        rate: parseFloat(retentionRate)
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

module.exports = router;
