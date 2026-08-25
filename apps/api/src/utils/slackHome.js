const { query } = require('../config/database');
const { buildTaskActionBlocks } = require('./slackBlocks');
const { resolveAppBase, taskOpenUrl } = require('../services/slackNotify');
const { formatNowInTimezone } = require('./timezone');

function intensityLabel(intensity) {
  switch (intensity) {
    case 'light': return 'Light';
    case 'medium': return 'Medium';
    default: return 'Full';
  }
}

/**
 * Build App Home Tab Block Kit view for a linked MindSprint user.
 */
async function buildHomeView(user) {
  const frontend = resolveAppBase(user.app_base_url);
  const tz = user.timezone || 'Europe/London';
  const nowLabel = formatNowInTimezone(tz, new Date());

  const [tasksResult, projectsResult, blocksResult] = await Promise.all([
    query(`
      SELECT t.id, t.title, t.status, t.due_at, t.est_minutes, t.priority, t.project_id, p.title as project_title
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE p.user_id = $1 AND t.status != 'done'
        AND (
          t.due_at IS NULL
          OR t.due_at::date <= (NOW() AT TIME ZONE $2)::date + 1
          OR t.status = 'doing'
        )
      ORDER BY
        CASE WHEN t.status = 'doing' THEN 0 ELSE 1 END,
        COALESCE(t.due_at, '2999-01-01') ASC,
        t.priority DESC
      LIMIT 5
    `, [user.id, tz]),
    query(`
      SELECT id, title, slack_channel_id, slack_channel_name
      FROM projects WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 8
    `, [user.id]),
    query(`
      SELECT title, starts_at, ends_at, recurrence_rule
      FROM time_blocks WHERE user_id = $1
      ORDER BY starts_at ASC LIMIT 5
    `, [user.id])
  ]);

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'MindSprint', emoji: true }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Hey <@${user.slack_user_id || ''}> — local time *${nowLabel}*.\nWhat do you want to tackle?`
      }
    },
    {
      type: 'actions',
      block_id: 'home_actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Plan my day', emoji: true },
          action_id: 'home_plan_day',
          style: 'primary'
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'New task', emoji: true },
          action_id: 'home_new_task'
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open MindSprint' },
          action_id: 'home_open_app',
          url: `${frontend}/dashboard`
        }
      ]
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Today*' }
    }
  ];

  if (tasksResult.rows.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No open tasks for today. Create one or plan your day._' }
    });
  } else {
    for (const t of tasksResult.rows) {
      const due = t.due_at
        ? new Date(t.due_at).toLocaleString('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit' })
        : 'no due';
      const openUrl = taskOpenUrl(frontend, t.project_id, t.id);
      blocks.push(...buildTaskActionBlocks({
        text: `• *${t.title}*  ·  ${t.status}  ·  ${due}  ·  ~${t.est_minutes || 30}m\n_${t.project_title}_`,
        taskId: t.id,
        openUrl
      }));
    }
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: '*Schedule*' }
  });

  if (blocksResult.rows.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_No time blocks yet. Add them in <${frontend}/settings|Settings> so planning respects your day._`
      }
    });
  } else {
    const lines = blocksResult.rows.slice(0, 3).map((b) => {
      const start = new Date(b.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
      const end = new Date(b.ends_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
      const days = b.recurrence_rule?.days?.join(', ') || 'one-time';
      return `• *${b.title}* ${start}–${end} (${days})`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n') }
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: '*Projects*' }
  });

  if (projectsResult.rows.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No projects yet._' }
    });
  } else {
    const lines = projectsResult.rows.map((p) => {
      const link = `<${frontend}/projects/${p.id}|${p.title}>`;
      if (p.slack_channel_id) {
        const name = p.slack_channel_name ? `#${p.slack_channel_name.replace(/^#/, '')}` : `<#${p.slack_channel_id}>`;
        return `• ${link} → ${name}`;
      }
      return `• ${link} — _not linked_ (use \`/task link\` in a channel)`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n') }
    });
  }

  const enabled = user.slack_enabled !== false;
  const intensity = user.slack_intensity || 'full';

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Slack nags:* ${enabled ? 'On' : 'Off'} · Intensity: *${intensityLabel(intensity)}*\n_Full quiet hours & digests: <${frontend}/settings|web Settings>_`
    }
  });
  blocks.push({
    type: 'actions',
    block_id: 'home_nag_prefs',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: enabled ? 'Mute nags' : 'Unmute nags' },
        action_id: 'home_toggle_nags',
        value: enabled ? 'off' : 'on'
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Intensity: Light' },
        action_id: 'home_set_intensity',
        value: 'light'
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Medium' },
        action_id: 'home_set_intensity',
        value: 'medium'
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Full' },
        action_id: 'home_set_intensity',
        value: 'full'
      }
    ]
  });

  return {
    type: 'home',
    blocks
  };
}

function buildCreateTaskModal({ projects = [], preselectProjectId = null, channelId = null } = {}) {
  const options = (projects.length > 0 ? projects : [{ id: 'personal', title: 'Personal Tasks' }]).map((p) => ({
    text: { type: 'plain_text', text: (p.title || 'Project').slice(0, 75) },
    value: String(p.id)
  }));

  let initialOption = options[0];
  if (preselectProjectId) {
    const match = options.find((o) => o.value === String(preselectProjectId));
    if (match) initialOption = match;
  }

  const privateMeta = JSON.stringify({
    channel_id: channelId || null,
    project_id: preselectProjectId || null
  });

  return {
    type: 'modal',
    callback_id: 'create_task_modal',
    private_metadata: privateMeta,
    title: { type: 'plain_text', text: 'New MindSprint task' },
    submit: { type: 'plain_text', text: 'Create' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'title_block',
        label: { type: 'plain_text', text: 'Title' },
        element: {
          type: 'plain_text_input',
          action_id: 'title',
          placeholder: { type: 'plain_text', text: 'What needs doing?' }
        }
      },
      {
        type: 'input',
        block_id: 'desc_block',
        optional: true,
        label: { type: 'plain_text', text: 'Description' },
        element: {
          type: 'plain_text_input',
          action_id: 'description',
          multiline: true
        }
      },
      {
        type: 'input',
        block_id: 'due_block',
        optional: true,
        label: { type: 'plain_text', text: 'Due date' },
        element: {
          type: 'datepicker',
          action_id: 'due_date'
        }
      },
      {
        type: 'input',
        block_id: 'est_block',
        optional: true,
        label: { type: 'plain_text', text: 'Estimate (minutes)' },
        element: {
          type: 'plain_text_input',
          action_id: 'est_minutes',
          initial_value: '30',
          placeholder: { type: 'plain_text', text: '30' }
        }
      },
      {
        type: 'input',
        block_id: 'priority_block',
        optional: true,
        label: { type: 'plain_text', text: 'Priority (1–5)' },
        element: {
          type: 'static_select',
          action_id: 'priority',
          initial_option: { text: { type: 'plain_text', text: '3' }, value: '3' },
          options: [1, 2, 3, 4, 5].map((n) => ({
            text: { type: 'plain_text', text: String(n) },
            value: String(n)
          }))
        }
      },
      {
        type: 'input',
        block_id: 'project_block',
        label: { type: 'plain_text', text: 'Project' },
        element: {
          type: 'static_select',
          action_id: 'project',
          initial_option: initialOption,
          options
        }
      }
    ]
  };
}

module.exports = { buildHomeView, buildCreateTaskModal };
