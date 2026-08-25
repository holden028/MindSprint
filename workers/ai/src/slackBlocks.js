function buildTaskActionBlocks({ text, taskId, openUrl, uniqueIds = false }) {
  const section = {
    type: 'section',
    text: { type: 'mrkdwn', text: text || 'MindSprint reminder' }
  };

  const aid = (base) => {
    if (!uniqueIds || !taskId) return base;
    const short = String(taskId).replace(/-/g, '').slice(0, 12);
    return `${base}__${short}`;
  };

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

module.exports = { buildTaskActionBlocks };
