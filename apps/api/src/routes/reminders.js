const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { refreshAllAutoReminders } = require('../services/reminders');

const router = express.Router();

router.post('/refresh-ladders', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const refreshed = await refreshAllAutoReminders(user_id);
    res.json({ refreshed, message: `Rebuilt reminder ladders for ${refreshed} task(s)` });
  } catch (error) {
    console.error('Refresh ladders error:', error);
    res.status(500).json({ error: 'Failed to refresh reminder ladders' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { task_id, remind_at, channel = 'in_app', kind = 'custom' } = req.body;

    if (!task_id || !remind_at) {
      return res.status(400).json({ error: 'task_id and remind_at are required' });
    }

    const validChannels = ['in_app', 'slack'];
    if (!validChannels.includes(channel)) {
      return res.status(400).json({ error: `channel must be one of: ${validChannels.join(', ')}` });
    }

    const taskCheck = await query(
      `SELECT t.id FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE t.id = $1 AND p.user_id = $2`,
      [task_id, user_id]
    );
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    const result = await query(
      `INSERT INTO reminders (task_id, user_id, remind_at, channel, kind)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [task_id, user_id, remind_at, channel, kind || 'custom']
    );

    res.status(201).json({ reminder: result.rows[0] });
  } catch (error) {
    console.error('Create reminder error:', error);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;

    const result = await query(
      `SELECT r.*, t.title as task_title
       FROM reminders r
       JOIN tasks t ON r.task_id = t.id
       WHERE r.user_id = $1 AND r.sent = false
       ORDER BY r.remind_at ASC`,
      [user_id]
    );

    res.json({ reminders: result.rows });
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({ error: 'Failed to load reminders' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM reminders WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.json({ message: 'Reminder cancelled' });
  } catch (error) {
    console.error('Delete reminder error:', error);
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

module.exports = router;
