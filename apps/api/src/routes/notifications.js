const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { parseLimit, parseOffset } = require('../utils/pagination');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const limit = parseLimit(req.query.limit, { defaultValue: 20, max: 100 });
    const offset = parseOffset(req.query.offset);

    const result = await query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY read ASC, created_at DESC
       LIMIT $2 OFFSET $3`,
      [user_id, limit, offset]
    );

    res.json({ notifications: result.rows, limit, offset });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;

    const result = await query(
      'SELECT COUNT(*)::int as count FROM notifications WHERE user_id = $1 AND read = false',
      [user_id]
    );

    res.json({ count: result.rows[0].count });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;

    const result = await query(
      'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ notification: result.rows[0] });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.post('/read-all', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;

    await query(
      'UPDATE notifications SET read = true WHERE user_id = $1 AND read = false',
      [user_id]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// Test Slack webhook
router.post('/test-slack', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;

    const userResult = await query(
      'SELECT slack_webhook_url, slack_user_id, slack_bot_token FROM users WHERE id = $1',
      [user_id]
    );

    const { slack_webhook_url, slack_user_id, slack_bot_token } = userResult.rows[0] || {};
    const msg = '✅ MindSprint test notification — your Slack integration is working!';

    if (slack_bot_token && slack_user_id) {
      const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${slack_bot_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: slack_user_id, text: msg })
      });
      const data = await slackRes.json();
      if (!data.ok) return res.status(502).json({ error: `Slack error: ${data.error}` });
    } else if (slack_webhook_url) {
      const mention = slack_user_id ? `<@${slack_user_id}> ` : '';
      const slackRes = await fetch(slack_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${mention}${msg}` })
      });
      if (!slackRes.ok) return res.status(502).json({ error: 'Slack webhook returned an error' });
    } else {
      return res.status(400).json({ error: 'No Slack integration configured' });
    }

    res.json({ message: 'Test message sent successfully' });
  } catch (error) {
    console.error('Test Slack error:', error);
    res.status(500).json({ error: 'Failed to send test message' });
  }
});

module.exports = router;
