/** Confirmation message after Done / Doing / Snooze — text only, no action buttons. */
function buildStatusBlocks(text) {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: text || 'Updated.' }
    }
  ];
}

function buildTaskActionBlocks({ text, taskId, openUrl, uniqueIds = false, includeActions = true }) {
  const section = {
    type: 'section',
    text: { type: 'mrkdwn', text: text || 'MindSprint reminder' }
  };

  const aid = (base) => {
    if (!uniqueIds || !taskId) return base;
    // Home Tab requires unique action_ids across the entire view
    const short = String(taskId).replace(/-/g, '').slice(0, 12);
    return `${base}__${short}`;
  };

  // Status updates (Done etc.) — optional Open link only, no Done/Doing/Snooze
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
                action_id: aid('open_task'),
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
                action_id: aid('open_app'),
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
          action_id: aid('task_doing'),
          value: String(taskId),
          style: 'primary'
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Done ✓' },
          action_id: aid('task_done'),
          value: String(taskId)
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open' },
          action_id: aid('open_task'),
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
          action_id: aid('task_snooze_15m'),
          value: `${taskId}|15m`
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Snooze 1h' },
          action_id: aid('task_snooze_1h'),
          value: `${taskId}|1h`
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Snooze tonight' },
          action_id: aid('task_snooze_tonight'),
          value: `${taskId}|tonight`
        }
      ]
    }
  ];
}

/** Normalize Slack action_id that may include a unique suffix (Home Tab). */
function parseActionId(actionId) {
  const raw = String(actionId || '');
  if (raw.startsWith('task_snooze')) return 'task_snooze';
  if (raw.startsWith('task_done')) return 'task_done';
  if (raw.startsWith('task_doing')) return 'task_doing';
  if (raw.startsWith('home_intensity_')) return 'home_set_intensity';
  if (raw.includes('__')) return raw.split('__')[0];
  return raw;
}

module.exports = { buildTaskActionBlocks, buildStatusBlocks, parseActionId };
