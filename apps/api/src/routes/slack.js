const express = require('express');
const { query } = require('../config/database');
const { buildTaskActionBlocks, parseActionId } = require('../utils/slackBlocks');
const { requireSlackSignature } = require('../utils/slackVerify');
const { buildHomeView, buildCreateTaskModal } = require('../utils/slackHome');
const { runAssistantChat } = require('../services/aiChat');
const { createAutoReminders } = require('../services/reminders');
const {
  resolveAppBase,
  taskOpenUrl,
  slackApi,
  postTaskToProjectChannel,
  postSlackDM,
  ensureProjectForSlackChannel
} = require('../services/slackNotify');

const router = express.Router();

router.use(express.urlencoded({ extended: true }));

// Capture raw body for signature verification when this router sees JSON
router.use((req, res, next) => {
  if (req.rawBody) return next();
  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body;
    try {
      req.body = JSON.parse(req.body.toString('utf8'));
    } catch {
      req.body = {};
    }
  }
  return next();
});

async function getUserBySlackUserId(slackUserId) {
  const result = await query(
    `SELECT id, email, slack_user_id, slack_bot_token, slack_webhook_url, app_base_url, timezone,
            slack_enabled, slack_intensity, quiet_hours_start, quiet_hours_end,
            digests_enabled, digest_morning_hour, digest_evening_hour
     FROM users WHERE slack_user_id = $1`,
    [slackUserId]
  );
  return result.rows[0] || null;
}

async function findAccessibleTask(taskId, userId) {
  const result = await query(
    `SELECT t.id, t.title, t.status, t.project_id, p.user_id as owner_id
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
      return {
        sql: `(date_trunc('day', NOW()) + INTERVAL '20 hours') + CASE WHEN NOW()::time > time '20:00' THEN INTERVAL '1 day' ELSE INTERVAL '0' END`,
        label: 'tonight'
      };
    case '1h':
    default:
      return { sql: `NOW() + INTERVAL '1 hour'`, label: '1 hour' };
  }
}

function linkPrompt(slackUserId) {
  const frontend = process.env.FRONTEND_URL || 'http://localhost:5174';
  return {
    response_type: 'ephemeral',
    text: `You haven't linked your Slack account yet. Go to ${frontend}/settings and enter your Slack User ID: \`${slackUserId}\``
  };
}

async function publishHome(user) {
  if (!user?.slack_bot_token || !user?.slack_user_id) return { ok: false, error: 'missing_slack' };
  try {
    const view = await buildHomeView(user);
    const result = await slackApi(user.slack_bot_token, 'views.publish', {
      user_id: user.slack_user_id,
      view
    });
    if (!result.ok) {
      console.error('views.publish failed:', result.error, result.response_metadata?.messages);
    }
    return result;
  } catch (err) {
    console.error('publishHome error:', err.message);
    return { ok: false, error: err.message };
  }
}

async function openCreateTaskModal(user, triggerId, { channelId = null, projectId = null } = {}) {
  const projects = await query(
    'SELECT id, title FROM projects WHERE user_id = $1 ORDER BY title ASC LIMIT 90',
    [user.id]
  );

  let preselect = projectId;
  if (!preselect && channelId) {
    const linked = await query(
      'SELECT id FROM projects WHERE user_id = $1 AND slack_channel_id = $2 LIMIT 1',
      [user.id, channelId]
    );
    preselect = linked.rows[0]?.id || null;
  }

  const view = buildCreateTaskModal({
    projects: projects.rows,
    preselectProjectId: preselect,
    channelId
  });

  return slackApi(user.slack_bot_token, 'views.open', {
    trigger_id: triggerId,
    view
  });
}

async function ensurePersonalProject(userId) {
  let projectResult = await query(
    `SELECT id FROM projects WHERE user_id = $1 AND title = 'Personal Tasks' LIMIT 1`,
    [userId]
  );
  if (projectResult.rows.length === 0) {
    projectResult = await query(
      `INSERT INTO projects (user_id, title, description) VALUES ($1, 'Personal Tasks', 'Personal tasks not assigned to a specific project') RETURNING id`,
      [userId]
    );
  }
  return projectResult.rows[0].id;
}

async function createTaskForUser(user, {
  title,
  description = '',
  projectId = null,
  dueAt = null,
  estMinutes = 30,
  priority = 3,
  urgency = 3
}) {
  let resolvedProjectId = projectId;
  if (!resolvedProjectId) {
    resolvedProjectId = await ensurePersonalProject(user.id);
  } else {
    const ok = await query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [resolvedProjectId, user.id]
    );
    if (ok.rows.length === 0) {
      resolvedProjectId = await ensurePersonalProject(user.id);
    }
  }

  const taskResult = await query(
    `INSERT INTO tasks (project_id, title, description, priority, urgency, est_minutes, due_at, original_title, original_description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      resolvedProjectId, title, description || '', priority, urgency,
      estMinutes, dueAt, title, description || ''
    ]
  );
  const task = taskResult.rows[0];

  if (dueAt) {
    await createAutoReminders(user.id, task.id, new Date(dueAt), estMinutes);
  }

  postTaskToProjectChannel({
    projectId: resolvedProjectId,
    ownerUserId: user.id,
    text: `New task: *${task.title}*${dueAt ? ` · due ${new Date(dueAt).toLocaleString()}` : ''}`,
    taskId: task.id,
    event: 'Created'
  }).catch(() => {});

  return task;
}

function stripMention(text = '') {
  return String(text).replace(/<@[^>]+>/g, '').trim();
}

async function replyInSlack({ token, channel, threadTs, text }) {
  if (!token || !channel) return;
  // Slack mrkdwn limit — keep responses reasonable
  const chunks = [];
  let remaining = text || '(no reply)';
  while (remaining.length > 2800) {
    chunks.push(remaining.slice(0, 2800));
    remaining = remaining.slice(2800);
  }
  chunks.push(remaining);
  for (const chunk of chunks) {
    await slackApi(token, 'chat.postMessage', {
      channel,
      thread_ts: threadTs || undefined,
      text: chunk
    });
  }
}

async function handleAiMessage({ user, channel, threadTs, text, projectId = null }) {
  const threadKey = `slack:${channel}:${threadTs || 'root'}`;
  try {
    const result = await runAssistantChat({
      userId: user.id,
      message: text,
      projectId,
      slackThreadKey: threadKey
    });
    await replyInSlack({
      token: user.slack_bot_token,
      channel,
      threadTs,
      text: result.response || 'Done.'
    });
  } catch (err) {
    console.error('Slack AI reply error:', err);
    await replyInSlack({
      token: user.slack_bot_token,
      channel,
      threadTs,
      text: 'Sorry — I hit an error processing that. Try again in a moment.'
    });
  }
}

// --- Events API ---

router.post('/events', requireSlackSignature, async (req, res) => {
  try {
    const body = req.body || {};

    if (body.type === 'url_verification') {
      return res.json({ challenge: body.challenge });
    }

    // Ack fast; process async
    res.sendStatus(200);

    const event = body.event;
    if (!event || event.bot_id || event.subtype === 'bot_message') return;

    setImmediate(async () => {
      try {
        if (event.type === 'app_home_opened') {
          const user = await getUserBySlackUserId(event.user);
          if (user) {
            await publishHome(user);
          } else {
            console.warn('app_home_opened for unlinked Slack user', event.user);
          }
          return;
        }

        // Public channel created → auto project (private channels have no Events API equivalent)
        if (event.type === 'channel_created') {
          const ch = event.channel || {};
          const channelId = ch.id;
          const channelName = ch.name;
          const creator = ch.creator || event.user;
          if (channelId && creator) {
            await ensureProjectForSlackChannel({
              channelId,
              channelName,
              creatorSlackUserId: creator
            });
          }
          return;
        }

        if (event.type === 'message' && event.channel_type === 'im' && event.text) {
          if (event.subtype) return;
          const user = await getUserBySlackUserId(event.user);
          if (!user?.slack_bot_token) return;
          await handleAiMessage({
            user,
            channel: event.channel,
            threadTs: event.thread_ts || event.ts,
            text: event.text
          });
          return;
        }

        if (event.type === 'app_mention' && event.text) {
          const user = await getUserBySlackUserId(event.user);
          if (!user?.slack_bot_token) return;
          const text = stripMention(event.text);
          if (!text) {
            await replyInSlack({
              token: user.slack_bot_token,
              channel: event.channel,
              threadTs: event.ts,
              text: 'Ask me anything about your tasks — or use `/sprint add` to create one.'
            });
            return;
          }
          let projectId = null;
          const linked = await query(
            'SELECT id FROM projects WHERE user_id = $1 AND slack_channel_id = $2 LIMIT 1',
            [user.id, event.channel]
          );
          projectId = linked.rows[0]?.id || null;
          await handleAiMessage({
            user,
            channel: event.channel,
            threadTs: event.thread_ts || event.ts,
            text,
            projectId
          });
          return;
        }

        // Linked-channel messages: only reply when @mentioned (handled above) or in a bot thread
        if (event.type === 'message' && event.channel && event.thread_ts && event.text && !event.subtype) {
          const user = await getUserBySlackUserId(event.user);
          if (!user?.slack_bot_token) return;
          const linked = await query(
            'SELECT id FROM projects WHERE user_id = $1 AND slack_channel_id = $2 LIMIT 1',
            [user.id, event.channel]
          );
          if (linked.rows.length === 0) return;

          // Only continue threads that already have a MindSprint conversation key
          const threadKey = `slack:${event.channel}:${event.thread_ts}`;
          const conv = await query(
            'SELECT id FROM ai_conversations WHERE user_id = $1 AND slack_thread_key = $2',
            [user.id, threadKey]
          );
          if (conv.rows.length === 0) return;

          await handleAiMessage({
            user,
            channel: event.channel,
            threadTs: event.thread_ts,
            text: stripMention(event.text),
            projectId: linked.rows[0].id
          });
        }
      } catch (err) {
        console.error('Slack event handler error:', err);
      }
    });
  } catch (error) {
    console.error('Slack events error:', error);
    if (!res.headersSent) res.sendStatus(500);
  }
});

// --- Slash commands ---

router.post('/commands', requireSlackSignature, async (req, res) => {
  try {
    const {
      command, text, user_id: slackUserId, token, trigger_id: triggerId,
      channel_id: channelId, channel_name: channelName
    } = req.body;

    if (process.env.SLACK_VERIFICATION_TOKEN && token && token !== process.env.SLACK_VERIFICATION_TOKEN) {
      return res.status(401).json({ text: 'Unauthorized' });
    }

    const user = await getUserBySlackUserId(slackUserId);
    if (!user) return res.json(linkPrompt(slackUserId));

    const parts = (text || '').trim().split(/\s+/).filter(Boolean);
    const action = (parts[0] || '').toLowerCase();
    const frontend = resolveAppBase(user.app_base_url);

    switch (action) {
      case 'add': {
        const title = parts.slice(1).join(' ');
        if (!title) {
          // Open modal when no title
          if (triggerId && user.slack_bot_token) {
            res.json({ response_type: 'ephemeral', text: 'Opening create-task form…' });
            openCreateTaskModal(user, triggerId, { channelId }).catch((err) =>
              console.error('Open task modal error:', err)
            );
            return;
          }
          return res.json({ response_type: 'ephemeral', text: 'Usage: `/sprint add Buy groceries` (or `/sprint add` alone for the form)' });
        }

        const task = await createTaskForUser(user, { title });
        const openUrl = taskOpenUrl(frontend, task.project_id, task.id);
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
          `SELECT t.id, t.title, t.priority, t.urgency, t.status, t.est_minutes, t.project_id
           FROM tasks t JOIN projects p ON t.project_id = p.id
           WHERE p.user_id = $1 AND t.status != 'done'
           ORDER BY t.priority DESC, t.urgency DESC
           LIMIT 10`,
          [user.id]
        );

        if (tasksResult.rows.length === 0) {
          return res.json({ response_type: 'ephemeral', text: 'No open tasks. Use `/sprint add` to create one!' });
        }

        const taskBlocks = tasksResult.rows.flatMap((t, i) =>
          buildTaskActionBlocks({
            text: `${i + 1}. *${t.title}*  ·  P${t.priority} U${t.urgency}  ·  ${t.est_minutes}min  ·  _${t.status}_`,
            taskId: t.id,
            openUrl: taskOpenUrl(frontend, t.project_id, t.id)
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
        if (!taskQuery) return res.json({ response_type: 'ephemeral', text: 'Usage: `/sprint done <task title or number from list>`' });

        let task;
        if (/^\d+$/.test(taskQuery)) {
          const offset = parseInt(taskQuery, 10) - 1;
          const result = await query(
            `SELECT t.id, t.title, t.project_id FROM tasks t JOIN projects p ON t.project_id = p.id
             WHERE p.user_id = $1 AND t.status != 'done'
             ORDER BY t.priority DESC, t.urgency DESC
             LIMIT 1 OFFSET $2`,
            [user.id, offset]
          );
          task = result.rows[0];
        } else {
          const result = await query(
            `SELECT t.id, t.title, t.project_id FROM tasks t JOIN projects p ON t.project_id = p.id
             WHERE p.user_id = $1 AND t.status != 'done' AND LOWER(t.title) LIKE $2
             LIMIT 1`,
            [user.id, `%${taskQuery.toLowerCase()}%`]
          );
          task = result.rows[0];
        }

        if (!task) return res.json({ response_type: 'ephemeral', text: 'Task not found. Use `/sprint list` to see your tasks.' });

        await query(
          `UPDATE tasks SET status = 'done', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [task.id]
        );
        await query(`UPDATE reminders SET sent = true WHERE task_id = $1 AND sent = false`, [task.id]);
        postTaskToProjectChannel({
          projectId: task.project_id,
          ownerUserId: user.id,
          text: `Done: ~~${task.title}~~`,
          taskId: task.id,
          event: 'Done'
        }).catch(() => {});

        return res.json({
          response_type: 'ephemeral',
          text: `*Done!* ~~${task.title}~~ marked as complete. I'll leave you alone about this one.`
        });
      }

      case 'ask': {
        const question = parts.slice(1).join(' ').trim();
        if (!question) {
          return res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/sprint ask what should I work on next?` — or just DM MindSprint.'
          });
        }
        res.json({ response_type: 'ephemeral', text: 'Thinking…' });
        setImmediate(async () => {
          let projectId = null;
          if (channelId) {
            const linked = await query(
              'SELECT id FROM projects WHERE user_id = $1 AND slack_channel_id = $2 LIMIT 1',
              [user.id, channelId]
            );
            projectId = linked.rows[0]?.id || null;
          }
          try {
            const result = await runAssistantChat({
              userId: user.id,
              message: question,
              projectId,
              slackThreadKey: `slash:${user.id}:${Date.now()}`
            });
            await postSlackDM(user, result.response || 'Done.');
          } catch (err) {
            console.error('/sprint ask error:', err);
            await postSlackDM(user, 'Sorry — I could not answer that just now.');
          }
        });
        return;
      }

      case 'due': {
        const rest = parts.slice(1).join(' ').trim();
        // /sprint due <title> <YYYY-MM-DD or natural>
        if (!rest) {
          return res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/sprint due <task title> YYYY-MM-DD` or `/sprint due 1 YYYY-MM-DD` (number from `/sprint list`)'
          });
        }

        const dueMatch = rest.match(/(\d{4}-\d{2}-\d{2})(?:[T\s]\d{2}:\d{2})?$/);
        if (!dueMatch) {
          return res.json({
            response_type: 'ephemeral',
            text: 'Include a date like `2026-08-26` at the end. Example: `/sprint due Buy milk 2026-08-26`'
          });
        }
        const dueStr = dueMatch[1];
        const titlePart = rest.slice(0, dueMatch.index).trim();
        const dueAt = new Date(`${dueStr}T17:00:00`);

        let task;
        if (/^\d+$/.test(titlePart)) {
          const offset = parseInt(titlePart, 10) - 1;
          const result = await query(
            `SELECT t.id, t.title, t.project_id, t.est_minutes FROM tasks t JOIN projects p ON t.project_id = p.id
             WHERE p.user_id = $1 AND t.status != 'done'
             ORDER BY t.priority DESC, t.urgency DESC
             LIMIT 1 OFFSET $2`,
            [user.id, offset]
          );
          task = result.rows[0];
        } else {
          const result = await query(
            `SELECT t.id, t.title, t.project_id, t.est_minutes FROM tasks t JOIN projects p ON t.project_id = p.id
             WHERE p.user_id = $1 AND t.status != 'done' AND LOWER(t.title) LIKE $2
             LIMIT 1`,
            [user.id, `%${titlePart.toLowerCase()}%`]
          );
          task = result.rows[0];
        }

        if (!task) {
          return res.json({ response_type: 'ephemeral', text: 'Task not found.' });
        }

        await query(
          `UPDATE tasks SET due_at = $1, updated_at = NOW() WHERE id = $2`,
          [dueAt, task.id]
        );
        await createAutoReminders(user.id, task.id, dueAt, task.est_minutes || 30);
        postTaskToProjectChannel({
          projectId: task.project_id,
          ownerUserId: user.id,
          text: `Due set: *${task.title}* → ${dueAt.toLocaleString()}`,
          taskId: task.id,
          event: 'Due'
        }).catch(() => {});

        return res.json({
          response_type: 'ephemeral',
          text: `*Due set* for ${task.title}: ${dueStr} (default 17:00). Reminder ladder rebuilt.`
        });
      }

      case 'link': {
        if (!channelId || channelId.startsWith('D')) {
          return res.json({
            response_type: 'ephemeral',
            text: 'Run `/sprint link <project name>` inside a public/private channel (not a DM).'
          });
        }
        const projectQuery = parts.slice(1).join(' ').trim();
        if (!projectQuery) {
          return res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/sprint link <project name>` — links this channel to that MindSprint project.'
          });
        }
        const proj = await query(
          `SELECT id, title FROM projects WHERE user_id = $1 AND LOWER(title) LIKE $2 LIMIT 1`,
          [user.id, `%${projectQuery.toLowerCase()}%`]
        );
        if (proj.rows.length === 0) {
          return res.json({ response_type: 'ephemeral', text: `No project matching "${projectQuery}".` });
        }
        const name = (channelName || '').replace(/^#/, '') || null;
        await query(
          `UPDATE projects SET slack_channel_id = $1, slack_channel_name = $2, updated_at = NOW() WHERE id = $3`,
          [channelId, name, proj.rows[0].id]
        );
        return res.json({
          response_type: 'in_channel',
          text: `Linked *${proj.rows[0].title}* to this channel. @mention MindSprint here for project-scoped help; task updates will post here.`
        });
      }

      case 'help':
      default: {
        if (!action) {
          // bare /sprint → open modal
          if (triggerId && user.slack_bot_token) {
            res.json({ response_type: 'ephemeral', text: 'Opening create-task form…' });
            openCreateTaskModal(user, triggerId, { channelId }).catch((err) =>
              console.error('Open task modal error:', err)
            );
            return;
          }
        }
        return res.json({
          response_type: 'ephemeral',
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: 'MindSprint Task Commands' } },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text:
                  '`/sprint add [title]` — Create a task (no title opens form)\n' +
                  '`/sprint list` — Show your open tasks\n' +
                  '`/sprint done <number or title>` — Complete a task\n' +
                  '`/sprint ask <question>` — Ask the AI (reply via DM)\n' +
                  '`/sprint due <title|#> YYYY-MM-DD` — Set a due date\n' +
                  '`/sprint link <project>` — Link this channel to a project\n' +
                  '`/sprint help` — Show this help\n' +
                  '_Or DM MindSprint for a full AI chat._'
              }
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: `<${frontend}/dashboard|Open MindSprint>` }]
            }
          ]
        });
      }
    }
  } catch (error) {
    console.error('Slack command error:', error);
    res.json({ response_type: 'ephemeral', text: 'Something went wrong. Please try again.' });
  }
});

// --- Interactivity (buttons, modals, shortcuts) ---

router.post('/interactions', requireSlackSignature, async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload || '{}');
    const { type, actions, user: slackUser, view, trigger_id: triggerId, callback_id: callbackId } = payload;

    const dbUser = await getUserBySlackUserId(slackUser?.id);
    if (!dbUser) {
      return res.json({
        replace_original: false,
        response_type: 'ephemeral',
        text: 'Your Slack account is not linked to MindSprint. Go to Settings in the app to link it.'
      });
    }

    // Global shortcut: New MindSprint task
    if (type === 'shortcut' && (callbackId === 'new_mindsprint_task' || payload.callback_id === 'new_mindsprint_task')) {
      res.send('');
      openCreateTaskModal(dbUser, triggerId).catch((err) => console.error('Shortcut modal error:', err));
      return;
    }

    // Modal submit
    if (type === 'view_submission' && view?.callback_id === 'create_task_modal') {
      const values = view.state?.values || {};
      const title = values.title_block?.title?.value?.trim();
      if (!title) {
        return res.json({
          response_action: 'errors',
          errors: { title_block: 'Title is required' }
        });
      }

      const description = values.desc_block?.description?.value || '';
      const dueDate = values.due_block?.due_date?.selected_date || null;
      const estRaw = values.est_block?.est_minutes?.value;
      const estMinutes = Math.max(5, parseInt(estRaw, 10) || 30);
      const priority = parseInt(values.priority_block?.priority?.selected_option?.value || '3', 10) || 3;
      let projectId = values.project_block?.project?.selected_option?.value || null;
      if (projectId === 'personal') projectId = null;

      let meta = {};
      try {
        meta = JSON.parse(view.private_metadata || '{}');
      } catch { /* ignore */ }

      if (!projectId && meta.project_id) projectId = meta.project_id;

      const dueAt = dueDate ? new Date(`${dueDate}T17:00:00`) : null;
      const task = await createTaskForUser(dbUser, {
        title,
        description,
        projectId,
        dueAt,
        estMinutes,
        priority
      });

      // Ack modal close; optionally notify
      res.json({ response_action: 'clear' });

      const frontend = resolveAppBase(dbUser.app_base_url);
      const openUrl = taskOpenUrl(frontend, task.project_id, task.id);
      postSlackDM(
        dbUser,
        `Task created: *${title}*`,
        buildTaskActionBlocks({
          text: `*Task created:* ${title}${dueAt ? `\nDue ${dueDate}` : ''}`,
          taskId: task.id,
          openUrl
        })
      ).catch(() => {});
      publishHome(dbUser).catch(() => {});
      return;
    }

    if (!actions || actions.length === 0) return res.send('');

    const action = actions[0];

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
        postTaskToProjectChannel({
          projectId: task.project_id,
          ownerUserId: task.owner_id,
          text: `Done: ~~${task.title}~~`,
          taskId: task.id,
          event: 'Done'
        }).catch(() => {});

        res.json({
          replace_original: true,
          text: `*Done!* ~~${task.title}~~ — finally. I'll stop nagging about this one.`
        });
        publishHome(dbUser).catch(() => {});
        return;
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
        postTaskToProjectChannel({
          projectId: task.project_id,
          ownerUserId: task.owner_id,
          text: `In progress: *${task.title}*`,
          taskId: task.id,
          event: 'Doing'
        }).catch(() => {});

        res.json({
          replace_original: true,
          text: `*On it:* ${task.title}\nGood. Don't wander off — I'll check back if it stalls.`
        });
        publishHome(dbUser).catch(() => {});
        return;
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

      case 'home_new_task': {
        res.send('');
        openCreateTaskModal(dbUser, triggerId || payload.trigger_id).catch((err) =>
          console.error('Home new task modal error:', err)
        );
        return;
      }

      case 'home_plan_day': {
        res.send('');
        setImmediate(async () => {
          try {
            const result = await runAssistantChat({
              userId: dbUser.id,
              message: 'Plan my day — what should I work on and in what order?',
              slackThreadKey: `home-plan:${dbUser.id}:${new Date().toISOString().slice(0, 10)}`
            });
            await postSlackDM(dbUser, result.response || 'Here is a plan for today.');
            await publishHome(dbUser);
          } catch (err) {
            console.error('home_plan_day error:', err);
            await postSlackDM(dbUser, 'Could not plan your day just now — try again or open the app.');
          }
        });
        return;
      }

      case 'home_toggle_nags': {
        const enable = action.value === 'on';
        await query('UPDATE users SET slack_enabled = $1 WHERE id = $2', [enable, dbUser.id]);
        dbUser.slack_enabled = enable;
        res.send('');
        publishHome(dbUser).catch(() => {});
        return;
      }

      case 'home_set_intensity': {
        const intensity = ['full', 'medium', 'light'].includes(action.value) ? action.value : 'full';
        await query('UPDATE users SET slack_intensity = $1 WHERE id = $2', [intensity, dbUser.id]);
        dbUser.slack_intensity = intensity;
        res.send('');
        publishHome(dbUser).catch(() => {});
        return;
      }

      default:
        return res.send('');
    }
  } catch (error) {
    console.error('Slack interaction error:', error);
    if (!res.headersSent) res.json({ text: 'Something went wrong processing your action.' });
  }
});

// --- Workflow Builder webhook ---

router.post('/workflows/create-task', async (req, res) => {
  try {
    const secret = process.env.SLACK_WORKFLOW_SECRET;
    const headerSecret = req.headers['x-mindsprint-workflow-secret'] || req.headers['x-workflow-secret'];
    const bodySecret = req.body?.secret;
    if (!secret || (headerSecret !== secret && bodySecret !== secret)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      title,
      description = '',
      project_id: projectId,
      channel_id: channelId,
      slack_user_id: slackUserId,
      due_at: dueAt,
      est_minutes: estMinutes = 30,
      priority = 3
    } = req.body || {};

    if (!title?.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    let user = null;
    if (slackUserId) {
      user = await getUserBySlackUserId(slackUserId);
    }
    if (!user && projectId) {
      const owner = await query(
        `SELECT u.* FROM projects p JOIN users u ON p.user_id = u.id WHERE p.id = $1`,
        [projectId]
      );
      user = owner.rows[0] || null;
    }
    if (!user && channelId) {
      const owner = await query(
        `SELECT u.* FROM projects p JOIN users u ON p.user_id = u.id WHERE p.slack_channel_id = $1 LIMIT 1`,
        [channelId]
      );
      user = owner.rows[0] || null;
    }
    if (!user) {
      return res.status(400).json({ error: 'Could not resolve MindSprint user (pass slack_user_id, project_id, or linked channel_id)' });
    }

    let resolvedProjectId = projectId || null;
    if (!resolvedProjectId && channelId) {
      const linked = await query(
        'SELECT id FROM projects WHERE user_id = $1 AND slack_channel_id = $2 LIMIT 1',
        [user.id, channelId]
      );
      resolvedProjectId = linked.rows[0]?.id || null;
    }

    const task = await createTaskForUser(user, {
      title: title.trim(),
      description,
      projectId: resolvedProjectId,
      dueAt: dueAt ? new Date(dueAt) : null,
      estMinutes: Number(estMinutes) || 30,
      priority: Number(priority) || 3
    });

    res.status(201).json({
      ok: true,
      task: { id: task.id, title: task.title, project_id: task.project_id, due_at: task.due_at }
    });
  } catch (error) {
    console.error('Workflow create-task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

module.exports = router;
