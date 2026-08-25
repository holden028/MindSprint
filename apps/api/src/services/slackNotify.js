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

    const body = {
      channel: project.slack_channel_id,
      text: mrkdwn.replace(/\*/g, ''),
      blocks: buildTaskActionBlocks({
        text: mrkdwn,
        taskId: taskId || null,
        openUrl
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

module.exports = {
  resolveAppBase,
  taskOpenUrl,
  slackApi,
  getOwnerBotToken,
  postTaskToProjectChannel,
  postSlackDM
};
