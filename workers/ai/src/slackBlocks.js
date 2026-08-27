/** Confirmation message after Done / Doing / Snooze — text only, no action buttons. */
function buildStatusBlocks(text) {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: text || 'Updated.' }
    }
  ];
}

function taskActionSuffix(taskId, uniqueIds) {
  if (!uniqueIds || !taskId) return '';
  return `__${String(taskId).replace(/-/g, '').slice(0, 12)}`;
}

function aid(base, taskId, uniqueIds) {
  return `${base}${taskActionSuffix(taskId, uniqueIds)}`;
}

function formatTaskDue(task, tz) {
  if (!task.due_at) return '';
  const due = new Date(task.due_at);
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const label = due.toLocaleString('en-GB', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
  if (due < now) return ` · 🔴 *overdue* (${label})`;
  if (due <= todayEnd) return ` · 🟠 *due today* (${label})`;
  return ` · due ${label}`;
}

function buildHomeTaskBlocks({ task, openUrl, uniqueIds = true }) {
  const focus = task.work_mode === 'focus';
  const statusEmoji = task.status === 'doing' ? '🔄' : (focus ? '🎯' : '⚡');
  const modeLabel = focus ? '`focus session`' : '`quick win`';
  const dueLine = formatTaskDue(task, task._tz || 'Europe/London');

  const section = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text:
        `${statusEmoji} *${task.title}*\n` +
        `${modeLabel} · ~${task.est_minutes || 30}m · _${task.project_title || 'Personal'}_${dueLine}`
    }
  };

  if (focus) {
    return [
      section,
      {
        type: 'actions',
        block_id: `home_task_${String(task.id).slice(0, 8)}`,
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '🍅 Start focus', emoji: true },
            action_id: aid('home_task_focus', task.id, uniqueIds),
            value: String(task.id),
            style: 'primary'
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: "I'm on it" },
            action_id: aid('task_doing', task.id, uniqueIds),
            value: String(task.id)
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Done ✓' },
            action_id: aid('task_done', task.id, uniqueIds),
            value: String(task.id)
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open' },
            action_id: aid('open_task', task.id, uniqueIds),
            url: openUrl
          }
        ]
      },
      {
        type: 'actions',
        block_id: `home_snooze_${String(task.id).slice(0, 8)}`,
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Snooze 15m' },
            action_id: aid('task_snooze_15m', task.id, uniqueIds),
            value: `${task.id}|15m`
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Snooze 1h' },
            action_id: aid('task_snooze_1h', task.id, uniqueIds),
            value: `${task.id}|1h`
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Snooze tonight' },
            action_id: aid('task_snooze_tonight', task.id, uniqueIds),
            value: `${task.id}|tonight`
          }
        ]
      }
    ];
  }

  return [
    section,
    {
      type: 'actions',
      block_id: `home_task_${String(task.id).slice(0, 8)}`,
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Done ✓' },
          action_id: aid('task_done', task.id, uniqueIds),
          value: String(task.id),
          style: 'primary'
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open' },
          action_id: aid('open_task', task.id, uniqueIds),
          url: openUrl
        }
      ]
    }
  ];
}

function buildTaskActionBlocks({ text, taskId, openUrl, uniqueIds = false, includeActions = true, task = null }) {
  if (task) {
    return [
      { type: 'section', text: { type: 'mrkdwn', text: text || 'MindSprint reminder' } },
      ...buildHomeTaskBlocks({ task, openUrl, uniqueIds })
    ];
  }

  const section = {
    type: 'section',
    text: { type: 'mrkdwn', text: text || 'MindSprint reminder' }
  };

  if (!includeActions) {
    return [
      section,
      openUrl
        ? {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Open' },
                action_id: aid('open_task', taskId, uniqueIds),
                url: openUrl
              }
            ]
          }
        : null
    ].filter(Boolean);
  }

  if (!taskId) {
    return [
      section,
      openUrl
        ? {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Open MindSprint' },
                action_id: aid('open_app', null, uniqueIds),
                url: openUrl
              }
            ]
          }
        : null
    ].filter(Boolean);
  }

  return [
    section,
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: "I'm on it" },
          action_id: aid('task_doing', taskId, uniqueIds),
          value: String(taskId),
          style: 'primary'
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Done ✓' },
          action_id: aid('task_done', taskId, uniqueIds),
          value: String(taskId)
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open' },
          action_id: aid('open_task', taskId, uniqueIds),
          url: openUrl
        }
      ]
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Snooze 15m' },
          action_id: aid('task_snooze_15m', taskId, uniqueIds),
          value: `${taskId}|15m`
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Snooze 1h' },
          action_id: aid('task_snooze_1h', taskId, uniqueIds),
          value: `${taskId}|1h`
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Snooze tonight' },
          action_id: aid('task_snooze_tonight', taskId, uniqueIds),
          value: `${taskId}|tonight`
        }
      ]
    }
  ];
}

module.exports = {
  buildTaskActionBlocks,
  buildHomeTaskBlocks,
  buildStatusBlocks
};
