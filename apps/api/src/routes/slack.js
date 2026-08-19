const express = require('express');
const { query } = require('../config/database');

const router = express.Router();

// Slack sends form-urlencoded for slash commands
router.use(express.urlencoded({ extended: true }));

async function findUserBySlackToken(token) {
  if (!token || token !== process.env.SLACK_VERIFICATION_TOKEN) return null;
  return true; // token-level auth only; user resolved per command
}

async function findUserByWebhook(teamId) {
  // Find the user who has a slack webhook from this team
  // For simplicity, we use a slack_user_id column or fall back to first user with webhook
  const result = await query(
    `SELECT id, email FROM users WHERE slack_webhook_url IS NOT NULL LIMIT 1`
  );
  return result.rows[0] || null;
}

async function getUserBySlackUserId(slackUserId) {
  const result = await query(
    'SELECT id, email FROM users WHERE slack_user_id = $1',
    [slackUserId]
  );
  return result.rows[0] || null;
}

// POST /slack/commands — handles all slash commands
router.post('/commands', async (req, res) => {
  try {
    const { command, text, user_id: slackUserId, token, response_url } = req.body;

    if (process.env.SLACK_VERIFICATION_TOKEN && token !== process.env.SLACK_VERIFICATION_TOKEN) {
      return res.status(401).json({ text: 'Unauthorized' });
    }

    const user = await getUserBySlackUserId(slackUserId);
    if (!user) {
      return res.json({
        response_type: 'ephemeral',
        text: `You haven't linked your Slack account yet. Go to ${process.env.FRONTEND_URL || 'http://localhost:5174'}/settings and enter your Slack User ID: \`${slackUserId}\``
      });
    }

    const parts = (text || '').trim().split(/\s+/);
    const action = parts[0]?.toLowerCase();

    switch (action) {
      case 'add': {
        const title = parts.slice(1).join(' ');
        if (!title) return res.json({ response_type: 'ephemeral', text: 'Usage: `/task add Buy groceries`' });
        
        // Find or create Personal Tasks project
        let projectResult = await query(
          `SELECT id FROM projects WHERE user_id = $1 AND title = 'Personal Tasks' LIMIT 1`,
          [user.id]
        );
        if (projectResult.rows.length === 0) {
          projectResult = await query(
            `INSERT INTO projects (user_id, title, description) VALUES ($1, 'Personal Tasks', 'Personal tasks not assigned to a specific project') RETURNING id`,
            [user.id]
          );
        }
        const projectId = projectResult.rows[0].id;

        const taskResult = await query(
          `INSERT INTO tasks (project_id, title, priority, urgency, est_minutes, original_title) 
           VALUES ($1, $2, 3, 3, 30, $2) RETURNING id, title`,
          [projectId, title]
        );

        return res.json({
          response_type: 'ephemeral',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `*Task created:* ${title}` } },
            {
              type: 'actions',
              elements: [
                { type: 'button', text: { type: 'plain_text', text: 'Mark Done' }, action_id: 'task_done', value: taskResult.rows[0].id, style: 'primary' },
                { type: 'button', text: { type: 'plain_text', text: 'Open in App' }, action_id: 'open_app', url: `${process.env.FRONTEND_URL || 'http://localhost:5174'}/dashboard` }
              ]
            }
          ]
        });
      }

      case 'list': {
        const tasksResult = await query(
          `SELECT t.id, t.title, t.priority, t.urgency, t.status, t.est_minutes
           FROM tasks t JOIN projects p ON t.project_id = p.id
           WHERE p.user_id = $1 AND t.status != 'done'
           ORDER BY t.priority DESC, t.urgency DESC
           LIMIT 10`,
          [user.id]
        );

        if (tasksResult.rows.length === 0) {
          return res.json({ response_type: 'ephemeral', text: 'No open tasks. Use `/task add` to create one!' });
        }

        const taskBlocks = tasksResult.rows.map((t, i) => ({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${i + 1}. *${t.title}*  ·  P${t.priority} U${t.urgency}  ·  ${t.est_minutes}min  ·  _${t.status}_`
          },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: 'Done' },
            action_id: 'task_done',
            value: t.id,
            style: 'primary'
          }
        }));

        return res.json({
          response_type: 'ephemeral',
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: 'Your Open Tasks' } },
            ...taskBlocks
          ]
        });
      }

      case 'done': {
        const taskQuery = parts.slice(1).join(' ');
        if (!taskQuery) return res.json({ response_type: 'ephemeral', text: 'Usage: `/task done <task title or number from list>`' });

        let task;
        if (/^\d+$/.test(taskQuery)) {
          const offset = parseInt(taskQuery) - 1;
          const result = await query(
            `SELECT t.id, t.title FROM tasks t JOIN projects p ON t.project_id = p.id
             WHERE p.user_id = $1 AND t.status != 'done'
             ORDER BY t.priority DESC, t.urgency DESC
             LIMIT 1 OFFSET $2`,
            [user.id, offset]
          );
          task = result.rows[0];
        } else {
          const result = await query(
            `SELECT t.id, t.title FROM tasks t JOIN projects p ON t.project_id = p.id
             WHERE p.user_id = $1 AND t.status != 'done' AND LOWER(t.title) LIKE $2
             LIMIT 1`,
            [user.id, `%${taskQuery.toLowerCase()}%`]
          );
          task = result.rows[0];
        }

        if (!task) return res.json({ response_type: 'ephemeral', text: 'Task not found. Use `/task list` to see your tasks.' });

        await query(
          `UPDATE tasks SET status = 'done', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [task.id]
        );

        return res.json({
          response_type: 'ephemeral',
          text: `*Done!* ~~${task.title}~~ marked as complete.`
        });
      }

      case 'help':
      default:
        return res.json({
          response_type: 'ephemeral',
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: 'MindSprint Task Commands' } },
            { type: 'section', text: { type: 'mrkdwn', text: 
              '`/task add <title>` — Create a new task\n' +
              '`/task list` — Show your open tasks\n' +
              '`/task done <number or title>` — Complete a task\n' +
              '`/task help` — Show this help message'
            }},
            { type: 'context', elements: [{ type: 'mrkdwn', text: `<${process.env.FRONTEND_URL || 'http://localhost:5174'}/dashboard|Open MindSprint>` }] }
          ]
        });
    }
  } catch (error) {
    console.error('Slack command error:', error);
    res.json({ response_type: 'ephemeral', text: 'Something went wrong. Please try again.' });
  }
});

// POST /slack/interactions — handles button clicks from messages
router.post('/interactions', async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload || '{}');
    const { actions, user: slackUser } = payload;

    if (!actions || actions.length === 0) return res.send('');

    const action = actions[0];
    const dbUser = await getUserBySlackUserId(slackUser?.id);

    if (!dbUser) {
      return res.json({
        replace_original: false,
        response_type: 'ephemeral',
        text: 'Your Slack account is not linked to MindSprint. Go to Settings in the app to link it.'
      });
    }

    switch (action.action_id) {
      case 'task_done': {
        const taskId = action.value;

        const taskResult = await query(
          `SELECT t.id, t.title FROM tasks t JOIN projects p ON t.project_id = p.id
           WHERE t.id = $1 AND p.user_id = $2`,
          [taskId, dbUser.id]
        );

        if (taskResult.rows.length === 0) {
          return res.json({ replace_original: false, text: 'Task not found or already completed.' });
        }

        await query(
          `UPDATE tasks SET status = 'done', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [taskId]
        );

        return res.json({
          replace_original: false,
          response_type: 'ephemeral',
          text: `*Done!* ~~${taskResult.rows[0].title}~~ marked as complete.`
        });
      }

      case 'task_snooze': {
        const taskId = action.value;
        // Create a reminder for 1 hour from now
        await query(
          `INSERT INTO reminders (task_id, user_id, remind_at, channel)
           VALUES ($1, $2, NOW() + INTERVAL '1 hour', 'slack')`,
          [taskId, dbUser.id]
        );
        return res.json({ replace_original: false, text: 'Snoozed for 1 hour. You\'ll get a reminder.' });
      }

      default:
        return res.send('');
    }
  } catch (error) {
    console.error('Slack interaction error:', error);
    res.json({ text: 'Something went wrong processing your action.' });
  }
});

module.exports = router;
