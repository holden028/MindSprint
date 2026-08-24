function buildTaskActionBlocks({ text, taskId, openUrl }) {
  const section = {
    type: 'section',
    text: { type: 'mrkdwn', text: text || 'MindSprint reminder' }
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
                action_id: 'open_app',
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
          action_id: 'task_doing',
          value: String(taskId),
          style: 'primary'
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Done ✓' },
          action_id: 'task_done',
          value: String(taskId)
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open' },
          action_id: 'open_task',
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
          action_id: 'task_snooze',
          value: `${taskId}|15m`
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Snooze 1h' },
          action_id: 'task_snooze',
          value: `${taskId}|1h`
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Snooze tonight' },
          action_id: 'task_snooze',
          value: `${taskId}|tonight`
        }
      ]
    }
  ];
}

module.exports = { buildTaskActionBlocks };
