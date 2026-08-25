const { query } = require('../config/database');
const { buildTaskActionBlocks } = require('../utils/slackBlocks');

function resolveAppBase(userBaseUrl) {
  const raw = (userBaseUrl || process.env.FRONTEND_URL || 'http://localhost:5174').trim().replace(/\/+$/, '');
  if (!raw) return 'http://localhost:5174';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `http://${raw}`;
}

function taskOpenUrl(base, projectId, taskId) {
  const b = (base || '').replace(/\/+$/, '');
  if (!projectId) return `${b}/dashboard${taskId ? `?task=${taskId}` : ''}`;
  return `${b}/projects/${projectId}${taskId ? `?task=${taskId}` : ''}`;
}

async function slackApi(token, method, body) {
  if (!token) return { ok: false, error: 'no_token' };
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function getOwnerBotToken(userId) {
  const result = await query(
    'SELECT slack_bot_token, slack_user_id, app_base_url FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Post a task lifecycle update to the project's linked Slack channel (if any).
 */
async function postTaskToProjectChannel({ projectId, ownerUserId, text, taskId, event }) {
  try {
    const proj = await query(
      `SELECT id, title, slack_channel_id, slack_channel_name, user_id
       FROM projects WHERE id = $1`,
      [projectId]
    );
    const project = proj.rows[0];
    if (!project?.slack_channel_id) return null;

    const owner = await getOwnerBotToken(ownerUserId || project.user_id);
    if (!owner?.slack_bot_token) return null;

    const base = resolveAppBase(owner.app_base_url);
    const openUrl = taskId ? taskOpenUrl(base, project.id, taskId) : `${base}/projects/${project.id}`;
    const prefix = event ? `*${event}*` : '*Update*';
    const mrkdwn = `${prefix} — ${text}\n_Project: ${project.title}_`;

    // Done updates: no Done/Doing/Snooze buttons (Open only). Other events keep full actions.
    const isTerminal = event === 'Done';
    const body = {
      channel: project.slack_channel_id,
      text: mrkdwn.replace(/\*/g, ''),
      blocks: buildTaskActionBlocks({
        text: mrkdwn,
        taskId: taskId || null,
        openUrl,
        includeActions: !isTerminal
      })
    };

    return slackApi(owner.slack_bot_token, 'chat.postMessage', body);
  } catch (err) {
    console.error('postTaskToProjectChannel error:', err.message);
    return null;
  }
}

async function postSlackDM(userRow, text, blocks) {
  try {
    const payload = { text };
    if (blocks) payload.blocks = blocks;

    if (userRow.slack_bot_token && userRow.slack_user_id) {
      return slackApi(userRow.slack_bot_token, 'chat.postMessage', {
        channel: userRow.slack_user_id,
        ...payload
      });
    }
    if (userRow.slack_webhook_url) {
      const mention = userRow.slack_user_id ? `<@${userRow.slack_user_id}> ` : '';
      await fetch(userRow.slack_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${mention}${text}`,
          blocks: blocks || undefined
        })
      });
      return { ok: true };
    }
    return { ok: false, error: 'no_slack_config' };
  } catch (err) {
    console.error('postSlackDM error:', err.message);
    return { ok: false, error: err.message };
  }
}

/** Slack channel names: lowercase, no spaces, 1–80 chars. */
function slugifyChannelName(title) {
  const base = String(title || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 70);
  return base || 'project';
}

/**
 * Create a Slack channel for a MindSprint project and link it.
 * Skips Personal Tasks and projects that already have a channel.
 */
async function ensureSlackChannelForProject(project, userId) {
  try {
    if (!project?.id || !project.title) return project;
    if (project.slack_channel_id) return project;
    if (String(project.title).trim().toLowerCase() === 'personal tasks') return project;

    const owner = await getOwnerBotToken(userId || project.user_id);
    if (!owner?.slack_bot_token) return project;

    let name = slugifyChannelName(project.title);
    let created = await slackApi(owner.slack_bot_token, 'conversations.create', {
      name,
      is_private: false
    });

    // name_taken → try with short suffix
    if (!created.ok && created.error === 'name_taken') {
      name = `${name}-${String(project.id).replace(/-/g, '').slice(0, 6)}`.slice(0, 80);
      created = await slackApi(owner.slack_bot_token, 'conversations.create', {
        name,
        is_private: false
      });
    }

    if (!created.ok || !created.channel?.id) {
      console.error('conversations.create failed:', created.error || created);
      return project;
    }

    const channelId = created.channel.id;
    const channelName = created.channel.name || name;

    if (owner.slack_user_id) {
      await slackApi(owner.slack_bot_token, 'conversations.invite', {
        channel: channelId,
        users: owner.slack_user_id
      });
    }

    const base = resolveAppBase(owner.app_base_url);
    await slackApi(owner.slack_bot_token, 'chat.postMessage', {
      channel: channelId,
      text: `MindSprint project linked: ${project.title}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `*MindSprint project linked*\n` +
              `This channel is tied to *${project.title}*.\n` +
              `• @mention MindSprint for project-scoped help\n` +
              `• Task updates will post here\n` +
              `• <${base}/projects/${project.id}|Open in MindSprint>`
          }
        }
      ]
    });

    const updated = await query(
      `UPDATE projects
       SET slack_channel_id = $1, slack_channel_name = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [channelId, channelName, project.id]
    );
    return updated.rows[0] || project;
  } catch (err) {
    console.error('ensureSlackChannelForProject error:', err.message);
    return project;
  }
}

/**
 * When a Slack channel is created, create + link a MindSprint project for the creator.
 */
async function ensureProjectForSlackChannel({ channelId, channelName, creatorSlackUserId }) {
  if (!channelId || !creatorSlackUserId) return null;

  const existing = await query(
    'SELECT id FROM projects WHERE slack_channel_id = $1 LIMIT 1',
    [channelId]
  );
  if (existing.rows.length > 0) return null;

  const userResult = await query(
    `SELECT id, email, slack_bot_token, slack_user_id, app_base_url
     FROM users WHERE slack_user_id = $1 LIMIT 1`,
    [creatorSlackUserId]
  );
  const user = userResult.rows[0];
  if (!user) return null;

  const title = (channelName || 'Slack project').replace(/^#/, '').trim() || 'Slack project';

  // Avoid dupes if they already have a project with this exact title unlinked
  const sameTitle = await query(
    `SELECT id FROM projects
     WHERE user_id = $1 AND LOWER(title) = LOWER($2) AND slack_channel_id IS NULL
     LIMIT 1`,
    [user.id, title]
  );

  let project;
  if (sameTitle.rows[0]) {
    const updated = await query(
      `UPDATE projects
       SET slack_channel_id = $1, slack_channel_name = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [channelId, channelName || title, sameTitle.rows[0].id]
    );
    project = updated.rows[0];
  } else {
    const inserted = await query(
      `INSERT INTO projects (user_id, title, description, source_type, slack_channel_id, slack_channel_name)
       VALUES ($1, $2, $3, 'manual', $4, $5)
       RETURNING *`,
      [
        user.id,
        title,
        `Auto-created from Slack channel #${channelName || title}`,
        channelId,
        channelName || title
      ]
    );
    project = inserted.rows[0];
  }

  if (user.slack_bot_token) {
    const base = resolveAppBase(user.app_base_url);
    await slackApi(user.slack_bot_token, 'chat.postMessage', {
      channel: channelId,
      text: `Linked to MindSprint project: ${project.title}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `*Linked to MindSprint*\n` +
              `Created project *${project.title}* for this channel.\n` +
              `• @mention MindSprint for help\n` +
              `• <${base}/projects/${project.id}|Open in MindSprint>`
          }
        }
      ]
    });
  }

  return project;
}

module.exports = {
  resolveAppBase,
  taskOpenUrl,
  slackApi,
  getOwnerBotToken,
  postTaskToProjectChannel,
  postSlackDM,
  slugifyChannelName,
  ensureSlackChannelForProject,
  ensureProjectForSlackChannel
};
