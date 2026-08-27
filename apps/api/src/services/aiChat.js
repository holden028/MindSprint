const { query } = require('../config/database');
const { createAutoReminders } = require('./reminders');
const { formatNowInTimezone } = require('../utils/timezone');
const { postTaskToProjectChannel } = require('./slackNotify');
const { buildAiInterpretations, withWorkMode } = require('../utils/taskWorkMode');

async function getFullUserContext(userId, projectId = null) {
  const taskParams = projectId ? [userId, projectId] : [userId];
  const taskWhere = projectId
    ? 'WHERE p.user_id = $1 AND t.project_id = $2 AND t.status != \'done\''
    : 'WHERE p.user_id = $1 AND t.status != \'done\'';

  const projectParams = projectId ? [userId, projectId] : [userId];
  const projectWhere = projectId
    ? 'WHERE user_id = $1 AND id = $2'
    : 'WHERE user_id = $1';

  const [tasksResult, projectsResult, blocksResult, sessionsResult, userResult, attachmentsResult] = await Promise.all([
    query(`
      SELECT t.id, t.title, t.description, t.status, t.priority, t.urgency, t.est_minutes, t.due_at, p.title as project_title, p.id as project_id
      FROM tasks t JOIN projects p ON t.project_id = p.id
      ${taskWhere}
      ORDER BY COALESCE(t.due_at, '2999-01-01') ASC, t.priority DESC, t.urgency DESC
      LIMIT 30
    `, taskParams),
    query(
      `SELECT id, title, description FROM projects ${projectWhere} ORDER BY created_at DESC LIMIT 15`,
      projectParams
    ),
    query(`SELECT title, starts_at, ends_at, recurrence_rule FROM time_blocks WHERE user_id = $1`, [userId]),
    query(`
      SELECT s.duration_minutes, s.actual_duration_minutes, s.self_rating, s.started_at, t.title as task_title
      FROM sessions s LEFT JOIN tasks t ON s.task_id = t.id
      WHERE s.user_id = $1 AND s.completed = true
      ORDER BY s.started_at DESC LIMIT 10
    `, [userId]),
    query('SELECT timezone FROM users WHERE id = $1', [userId]),
    query(`
      SELECT a.id, a.filename, a.mime_type, a.ai_summary, t.title as task_title, p.title as project_title
      FROM attachments a
      LEFT JOIN tasks t ON a.task_id = t.id
      LEFT JOIN projects p ON a.project_id = p.id
      WHERE a.user_id = $1
        ${projectId ? 'AND (a.project_id = $2 OR t.project_id = $2 OR a.project_id IS NULL)' : ''}
      ORDER BY a.created_at DESC
      LIMIT 25
    `, projectId ? [userId, projectId] : [userId])
  ]);

  const timeZone = userResult.rows[0]?.timezone || 'Europe/London';
  const nowDate = new Date();
  const nowLabel = formatNowInTimezone(timeZone, nowDate);

  const taskList = tasksResult.rows.map((t) => {
    const due = t.due_at
      ? `due ${new Date(t.due_at).toLocaleString('en-GB', { timeZone })}`
      : 'no deadline';
    return `- [${t.status}] "${t.title}" (P${t.priority}/U${t.urgency}, ${t.est_minutes}min, ${due}, project: ${t.project_title})`;
  }).join('\n');

  const projectList = projectsResult.rows.map((p) => `- "${p.title}": ${p.description || 'No description'}`).join('\n');

  const scheduleList = blocksResult.rows.map((b) => {
    const rule = b.recurrence_rule;
    const days = rule?.days ? rule.days.join(', ') : 'one-time';
    const start = new Date(b.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
    const end = new Date(b.ends_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
    return `- "${b.title}" ${start}-${end} (${days})`;
  }).join('\n');

  const sessionHistory = sessionsResult.rows.map((s) =>
    `- ${s.task_title || 'Unnamed'}: planned ${s.duration_minutes}min, actual ${s.actual_duration_minutes || '?'}min, rating ${s.self_rating || '?'}/10`
  ).join('\n');

  const attachmentList = attachmentsResult.rows.map((a) => {
    const linked = a.task_title
      ? `task: ${a.task_title}`
      : a.project_title
        ? `project: ${a.project_title}`
        : 'unlinked';
    const summary = a.ai_summary ? `\n  Content: ${a.ai_summary.slice(0, 500)}` : '';
    return `- [${a.id.slice(0, 8)}] "${a.filename}" (${a.mime_type}, ${linked})${summary}`;
  }).join('\n');

  return {
    taskList,
    projectList,
    scheduleList,
    sessionHistory,
    attachmentList,
    now: nowLabel,
    timezone: timeZone,
    projects: projectsResult.rows,
    scopedProjectId: projectId || null,
    scopedProjectTitle: projectsResult.rows[0]?.title || null
  };
}

/**
 * Shared assistant chat used by web /ai/chat and Slack DM / mentions.
 */
async function runAssistantChat({
  userId,
  message,
  conversationId = null,
  projectId = null,
  attachmentIds = [],
  slackThreadKey = null
}) {
  if (!message?.trim() && (!Array.isArray(attachmentIds) || attachmentIds.length === 0)) {
    const err = new Error('Message or attachment is required');
    err.status = 400;
    throw err;
  }

  const userMessage = message?.trim() || 'Please review the attached file(s).';

  let scopedProjectId = projectId || null;
  if (scopedProjectId) {
    const ok = await query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [scopedProjectId, userId]
    );
    if (ok.rows.length === 0) scopedProjectId = null;
  }

  const {
    taskList, projectList, scheduleList, sessionHistory, attachmentList,
    now, timezone, projects, scopedProjectTitle
  } = await getFullUserContext(userId, scopedProjectId);

  let chatAttachments = [];
  if (Array.isArray(attachmentIds) && attachmentIds.length > 0) {
    const attResult = await query(
      `SELECT id, filename, mime_type, ai_summary, task_id, project_id
       FROM attachments
       WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [userId, attachmentIds]
    );
    chatAttachments = attResult.rows;
  }

  const chatAttachmentContext = chatAttachments.length > 0
    ? `\nATTACHMENTS IN THIS MESSAGE:\n${chatAttachments.map((a) =>
        `- "${a.filename}" (${a.mime_type})${a.ai_summary ? `\n  ${a.ai_summary}` : ''}`
      ).join('\n')}\n`
    : '';

  let conversation = null;
  if (conversationId) {
    const convResult = await query(
      'SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    conversation = convResult.rows[0] || null;
  } else if (slackThreadKey) {
    const convResult = await query(
      'SELECT * FROM ai_conversations WHERE user_id = $1 AND slack_thread_key = $2',
      [userId, slackThreadKey]
    );
    conversation = convResult.rows[0] || null;
  }

  const prevMessages = conversation?.messages || [];
  const historyContext = prevMessages.slice(-10).map((m) => `${m.role}: ${m.content}`).join('\n');

  const scopeNote = scopedProjectId
    ? `\nPROJECT SCOPE: You are helping inside project "${scopedProjectTitle}". Prefer creating tasks in this project (use project_title="${scopedProjectTitle}"). Focus answers on this project's tasks unless the user asks otherwise.\n`
    : '';

  const systemPrompt = `You are MindSprint AI — a smart productivity assistant for an ADHD-friendly task management app. The user's local time is ${now} (timezone: ${timezone}). Always answer time/date questions using this local time — never UTC unless they ask for UTC.
${scopeNote}
CURRENT TASKS:
${taskList || 'No tasks yet.'}

PROJECTS:
${projectList || 'No projects yet.'}

SCHEDULE (blocked time):
${scheduleList || 'No blocked time set.'}

RECENT SESSIONS:
${sessionHistory || 'No session history.'}

ATTACHMENTS (files the user has uploaded — use their content when relevant):
${attachmentList || 'No attachments yet.'}
${chatAttachmentContext}
${historyContext ? `CONVERSATION HISTORY:\n${historyContext}\n` : ''}
You can perform ACTIONS by including a JSON block in your response wrapped in <action>...</action> tags. Available actions:

1. Create a task:
<action>{"type":"create_task","title":"...","description":"...","est_minutes":30,"priority":3,"urgency":3,"due_at":"ISO date or null","project_title":"existing project name or null","attachment_ids":["uuid"],"work_mode":"quick|focus"}</action>
- Set work_mode to "focus" for multi-step or long tasks that need a timed focus session.
- Set work_mode to "quick" for simple one-step tasks the user can mark done with yes/no (under ~15 min, single action).

2. Update a task:
<action>{"type":"update_task","task_title":"exact existing task title","updates":{"status":"done","priority":4,"due_at":"ISO date"}}</action>

IMPORTANT — DUE DATES:
- Prefer always setting due_at when creating tasks (ask the user for a deadline if unclear).
- If CURRENT TASKS shows "no deadline", proactively mention those tasks by name and offer to set due dates via update_task.
- A background system also Slack-pings the user when open tasks lack due dates; reinforce that in chat when relevant.

3. Block out time on the schedule:
<action>{"type":"create_time_block","title":"...","date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","recurrence_days":["mon","wed","fri"] or null}</action>

4. Plan the day — suggest an ordered schedule of tasks to work on:
<action>{"type":"plan_day"}</action>

5. Link attachments to an existing task:
<action>{"type":"attach_to_task","task_title":"exact task title","attachment_ids":["uuid"]}</action>

RULES:
- When the user shares attachments, read their summaries and reference them in your answer.
- When creating a task from an attached file, include attachment_ids from the message.
- When the user asks to create a task, extract all details and create it. Confirm what you created.
- When asked "what should I work on" or "plan my day", consider deadlines, priority, urgency, estimated time, blocked time, and recent session patterns.
- For day planning, account for the user's blocked time and suggest realistic scheduling.
- Tasks can be interleaved (pomodoro style) — the user can work on bits of tasks, so you don't need contiguous time blocks.
- You can include multiple <action> tags in one response.
- If unsure about details, make reasonable assumptions and note them.
- Keep replies concise when chatting in Slack (a few short paragraphs max unless asked for detail).
- Never ask the user personal/identity questions. Learn from their data.`;

  const { getOpenAI } = require('../config/openai');
  const completion = await getOpenAI().chat.completions.create({
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.5,
    max_tokens: 2000
  });

  const aiResponse = completion.choices[0].message.content;

  const actionMatches = aiResponse.match(/<action>([\s\S]*?)<\/action>/g) || [];
  const executedActions = [];

  for (const match of actionMatches) {
    try {
      const json = match.replace(/<\/?action>/g, '').trim();
      const action = JSON.parse(json);

      if (action.type === 'create_task') {
        let resolvedProjectId = scopedProjectId || null;
        if (!resolvedProjectId && action.project_title) {
          const proj = projects.find((p) => p.title.toLowerCase() === action.project_title.toLowerCase());
          if (proj) resolvedProjectId = proj.id;
        }
        if (!resolvedProjectId) {
          const personal = await query(
            "SELECT id FROM projects WHERE user_id = $1 AND title = 'Personal Tasks'",
            [userId]
          );
          if (personal.rows.length > 0) {
            resolvedProjectId = personal.rows[0].id;
          } else {
            const np = await query(
              "INSERT INTO projects (user_id, title, description) VALUES ($1, 'Personal Tasks', 'Personal tasks') RETURNING id",
              [userId]
            );
            resolvedProjectId = np.rows[0].id;
          }
        }

        const taskResult = await query(`
          INSERT INTO tasks (project_id, title, description, priority, urgency, est_minutes, due_at, original_title, original_description, ai_interpretations)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
        `, [
          resolvedProjectId, action.title, action.description || '', action.priority || 3, action.urgency || 3,
          action.est_minutes || 30, action.due_at || null, action.title, action.description || '',
          JSON.stringify(buildAiInterpretations(null, action, 'Classified when created in chat'))
        ]);

        const task = withWorkMode(taskResult.rows[0]);

        if (Array.isArray(action.attachment_ids) && action.attachment_ids.length > 0) {
          await query(
            `UPDATE attachments SET task_id = $1, project_id = NULL
             WHERE user_id = $2 AND id = ANY($3::uuid[])`,
            [task.id, userId, action.attachment_ids]
          );
        } else if (chatAttachments.length > 0) {
          await query(
            `UPDATE attachments SET task_id = $1, project_id = NULL
             WHERE user_id = $2 AND id = ANY($3::uuid[])`,
            [task.id, userId, chatAttachments.map((a) => a.id)]
          );
        }

        if (action.due_at) {
          await createAutoReminders(userId, task.id, new Date(action.due_at), action.est_minutes || 30);
        }

        postTaskToProjectChannel({
          projectId: resolvedProjectId,
          ownerUserId: userId,
          text: `New task: *${task.title}*${task.due_at ? ` · due ${new Date(task.due_at).toLocaleString()}` : ''}`,
          taskId: task.id,
          event: 'Created'
        }).catch(() => {});

        executedActions.push({ type: 'create_task', task });
      } else if (action.type === 'update_task') {
        if (action.task_title) {
          const taskMatch = await query(`
            SELECT t.id, t.project_id, t.title FROM tasks t JOIN projects p ON t.project_id = p.id
            WHERE p.user_id = $1 AND LOWER(t.title) = LOWER($2) AND t.status != 'done'
              ${scopedProjectId ? 'AND t.project_id = $3' : ''}
            LIMIT 1
          `, scopedProjectId ? [userId, action.task_title, scopedProjectId] : [userId, action.task_title]);

          if (taskMatch.rows.length > 0) {
            const updates = action.updates || {};
            const fields = [];
            const vals = [];
            let idx = 1;
            for (const [key, val] of Object.entries(updates)) {
              if (['status', 'priority', 'urgency', 'est_minutes', 'due_at', 'title', 'description'].includes(key)) {
                fields.push(`${key} = $${idx++}`);
                vals.push(val);
              }
            }
            if (fields.length > 0) {
              fields.push('updated_at = NOW()');
              if (updates.status === 'done') {
                fields.push('completed_at = NOW()');
              }
              vals.push(taskMatch.rows[0].id);
              await query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx}`, vals);
              executedActions.push({ type: 'update_task', task_id: taskMatch.rows[0].id });

              if (updates.status === 'done') {
                postTaskToProjectChannel({
                  projectId: taskMatch.rows[0].project_id,
                  ownerUserId: userId,
                  text: `Done: ~~${taskMatch.rows[0].title}~~`,
                  taskId: taskMatch.rows[0].id,
                  event: 'Done'
                }).catch(() => {});
              } else if (updates.status === 'doing') {
                postTaskToProjectChannel({
                  projectId: taskMatch.rows[0].project_id,
                  ownerUserId: userId,
                  text: `In progress: *${taskMatch.rows[0].title}*`,
                  taskId: taskMatch.rows[0].id,
                  event: 'Doing'
                }).catch(() => {});
              } else if (updates.due_at) {
                postTaskToProjectChannel({
                  projectId: taskMatch.rows[0].project_id,
                  ownerUserId: userId,
                  text: `Due updated: *${taskMatch.rows[0].title}* → ${new Date(updates.due_at).toLocaleString()}`,
                  taskId: taskMatch.rows[0].id,
                  event: 'Due'
                }).catch(() => {});
              }
            }
          }
        }
      } else if (action.type === 'create_time_block') {
        const date = action.date || new Date().toISOString().slice(0, 10);
        const startsAt = `${date}T${action.start_time || '09:00'}:00`;
        const endsAt = `${date}T${action.end_time || '17:00'}:00`;
        const recRule = action.recurrence_days?.length > 0
          ? JSON.stringify({ freq: 'weekly', interval: 1, days: action.recurrence_days })
          : null;

        const blockResult = await query(
          `INSERT INTO time_blocks (user_id, title, starts_at, ends_at, recurrence_rule)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [userId, action.title || 'Busy', startsAt, endsAt, recRule]
        );
        executedActions.push({ type: 'create_time_block', block: blockResult.rows[0] });
      } else if (action.type === 'plan_day') {
        executedActions.push({ type: 'plan_day' });
      } else if (action.type === 'attach_to_task' && action.task_title) {
        const taskMatch = await query(`
          SELECT t.id FROM tasks t JOIN projects p ON t.project_id = p.id
          WHERE p.user_id = $1 AND LOWER(t.title) = LOWER($2) LIMIT 1
        `, [userId, action.task_title]);

        if (taskMatch.rows.length > 0 && Array.isArray(action.attachment_ids) && action.attachment_ids.length > 0) {
          await query(
            `UPDATE attachments SET task_id = $1, project_id = NULL
             WHERE user_id = $2 AND id = ANY($3::uuid[])`,
            [taskMatch.rows[0].id, userId, action.attachment_ids]
          );
          executedActions.push({ type: 'attach_to_task', task_id: taskMatch.rows[0].id });
        }
      }
    } catch (actionErr) {
      console.error('Action execution error:', actionErr);
    }
  }

  const cleanResponse = aiResponse.replace(/<action>[\s\S]*?<\/action>/g, '').trim();

  const newMessages = [
    ...prevMessages,
    { role: 'user', content: userMessage, attachment_ids: chatAttachments.map((a) => a.id), timestamp: new Date().toISOString() },
    { role: 'assistant', content: cleanResponse, actions: executedActions, timestamp: new Date().toISOString() }
  ];

  let convId;
  if (conversation) {
    await query(
      'UPDATE ai_conversations SET messages = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(newMessages), conversation.id]
    );
    convId = conversation.id;
  } else {
    const convResult = await query(
      `INSERT INTO ai_conversations (user_id, title, messages, slack_thread_key)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, userMessage.slice(0, 100), JSON.stringify(newMessages), slackThreadKey || null]
    );
    convId = convResult.rows[0].id;
  }

  return {
    response: cleanResponse,
    actions: executedActions,
    conversation_id: convId
  };
}

module.exports = { runAssistantChat, getFullUserContext };
