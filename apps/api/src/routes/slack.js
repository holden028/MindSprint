const express = require('express');
const { query } = require('../config/database');
const { buildTaskActionBlocks } = require('../utils/slackBlocks');

const router = express.Router();

router.use(express.urlencoded({ extended: true }));

async function getUserBySlackUserId(slackUserId) {
  const result = await query(
    'SELECT id, email FROM users WHERE slack_user_id = $1',
    [slackUserId]
  );
  return result.rows[0] || null;
}

async function findAccessibleTask(taskId, userId) {
  const result = await query(
    `SELECT t.id, t.title, t.status, p.user_id as owner_id
     FROM tasks t
     JOIN projects p ON t.project_id = p.id
     WHERE t.id = $1
       AND (
         p.user_id = $2
         OR t.assignee_user_id = $2
         OR EXISTS (
           SELECT 1 FROM shares s
           WHERE s.status = 'accepted'
             AND s.invitee_user_id = $2
             AND (s.task_id = t.id OR s.project_id = p.id)
         )
       )`,
    [taskId, userId]
  );
  return result.rows[0] || null;
}

function snoozeInterval(token) {
  switch (token) {
    case '15m':
      return { sql: `NOW() + INTERVAL '15 minutes'`, label: '15 minutes' };
    case 'tonight':
      // Next 20:00 local DB time is good enough for a snooze nudge
      return {
        sql: `(date_trunc('day', NOW()) + INTERVAL '20 hours') + CASE WHEN NOW()::time > time '20:00' THEN INTERVAL '1 day' ELSE INTERVAL '0' END`,
        label: 'tonight'
      };
    case '1h':
    default:
      return { sql: `NOW() + INTERVAL '1 hour'`, label: '1 hour' };
  }
}

// POST /slack/commands — handles all slash commands
router.post('/commands', async (req, res) => {
  try {
    const { command, text, user_id: slackUserId, token } = req.body;

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
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5174';

    switch (action) {
      case 'add': {
        const title = parts.slice(1).join(' ');
        if (!title) return res.json({ response_type: 'ephemeral', text: 'Usage: `/task add Buy groceries`' });

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
        const task = taskResult.rows[0];
        const openUrl = `${frontend}/dashboard?task=${task.id}`;

        return res.json({
          response_type: 'ephemeral',
          text: `Task created: ${title}`,
          blocks: buildTaskActionBlocks({
            text: `*Task created:* ${title}\nI'll nag you once it has a due date.`,
            taskId: task.id,
            openUrl
          })
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

        const taskBlocks = tasksResult.rows.flatMap((t, i) =>
          buildTaskActionBlocks({
            text: `${i + 1}. *${t.title}*  ·  P${t.priority} U${t.urgency}  ·  ${t.est_minutes}min  ·  _${t.status}_`,
            taskId: t.id,
            openUrl: `${frontend}/dashboard?task=${t.id}`
          })
        );

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
          const offset = parseInt(taskQuery, 10) - 1;
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
        await query(`UPDATE reminders SET sent = true WHERE task_id = $1 AND sent = false`, [task.id]);

        return res.json({
          response_type: 'ephemeral',
          text: `*Done!* ~~${task.title}~~ marked as complete. I'll leave you alone about this one.`
        });
      }

      case 'help':
      default:
        return res.json({
          response_type: 'ephemeral',
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: 'MindSprint Task Commands' } },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text:
                  '`/task add <title>` — Create a new task\n' +
                  '`/task list` — Show your open tasks\n' +
                  '`/task done <number or title>` — Complete a task\n' +
                  '`/task help` — Show this help message'
              }
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: `<${frontend}/dashboard|Open MindSprint>` }]
            }
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
        const task = await findAccessibleTask(action.value, dbUser.id);
        if (!task) {
          return res.json({ replace_original: false, text: 'Task not found or already completed.' });
        }

        await query(
          `UPDATE tasks SET status = 'done', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [task.id]
        );
        await query(`UPDATE reminders SET sent = true WHERE task_id = $1 AND sent = false`, [task.id]);

        return res.json({
          replace_original: true,
          text: `*Done!* ~~${task.title}~~ — finally. I'll stop nagging about this one.`
        });
      }

      case 'task_doing': {
        const task = await findAccessibleTask(action.value, dbUser.id);
        if (!task) {
          return res.json({ replace_original: false, text: 'Task not found.' });
        }

        await query(
          `UPDATE tasks SET status = 'doing', updated_at = NOW() WHERE id = $1 AND status != 'done'`,
          [task.id]
        );

        return res.json({
          replace_original: true,
          text: `*On it:* ${task.title}\nGood. Don't wander off — I'll check back if it stalls.`
        });
      }

      case 'task_snooze': {
        const raw = String(action.value || '');
        const [taskId, token = '1h'] = raw.includes('|') ? raw.split('|') : [raw, '1h'];
        const task = await findAccessibleTask(taskId, dbUser.id);
        if (!task) {
          return res.json({ replace_original: false, text: 'Task not found.' });
        }

        const snooze = snoozeInterval(token);
        await query(
          `INSERT INTO reminders (task_id, user_id, remind_at, channel, kind)
           VALUES ($1, $2, ${snooze.sql}, 'slack', 'custom')`,
          [taskId, dbUser.id]
        );
        await query(
          `INSERT INTO reminders (task_id, user_id, remind_at, channel, kind)
           VALUES ($1, $2, ${snooze.sql}, 'in_app', 'custom')`,
          [taskId, dbUser.id]
        );

        return res.json({
          replace_original: true,
          text: `*Snoozed* ${task.title} for ${snooze.label}. Don't think you're off the hook.`
        });
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
