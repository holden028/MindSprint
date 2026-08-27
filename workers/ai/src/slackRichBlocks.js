const { buildHomeTaskBlocks } = require('./slackBlocks');

function taskOpenUrl(base, projectId, taskId) {
  const b = String(base || '').replace(/\/+$/, '');
  if (!projectId) return `${b}/dashboard${taskId ? `?task=${taskId}` : ''}`;
  return `${b}/projects/${projectId}${taskId ? `?task=${taskId}` : ''}`;
}

function buildHeroImageBlock(frontend) {
  const base = String(frontend || '').replace(/\/+$/, '');
  if (!base.startsWith('http')) return null;
  return {
    type: 'image',
    image_url: `${base}/icons/icon-512.svg`,
    alt_text: 'MindSprint'
  };
}

function buildDigestBlocks({
  kind = 'morning',
  frontend,
  stats = {},
  quickTasks = [],
  focusTasks = [],
  overdue = [],
  dueToday = [],
  assignedSummary = null
}) {
  const isEvening = kind === 'evening';
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: isEvening ? '🌙 Evening roundup' : '☀️ Good morning',
        emoji: true
      }
    }
  ];

  const hero = buildHeroImageBlock(frontend);
  if (hero) blocks.push(hero);

  blocks.push({
    type: 'section',
    fields: [
      { type: 'mrkdwn', text: `*Open*\n${stats.openTasks ?? '—'}` },
      { type: 'mrkdwn', text: `*Done today*\n${stats.tasksDoneToday ?? 0}` },
      { type: 'mrkdwn', text: `*Focus today*\n${stats.sessionsToday ?? 0} · ${stats.focusMinutesToday ?? 0}m` },
      { type: 'mrkdwn', text: `*Streak*\n${stats.streak ?? 0}🔥` }
    ]
  });

  if (overdue.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🔴 *Overdue (${overdue.length})*\n${overdue.slice(0, 5).map((t) => `• ${t.title}`).join('\n')}`
      }
    });
  }

  if (!isEvening && dueToday.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🟠 *Due today (${dueToday.length})*\n${dueToday.slice(0, 5).map((t) => `• ${t.title}`).join('\n')}`
      }
    });
  }

  if (assignedSummary) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: assignedSummary }]
    });
  }

  if (quickTasks.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*⚡ Quick wins — one tap Done*' } });
    for (const t of quickTasks.slice(0, 3)) {
      blocks.push(...buildHomeTaskBlocks({
        task: t,
        openUrl: taskOpenUrl(frontend, t.project_id, t.id),
        uniqueIds: false
      }));
    }
  }

  if (focusTasks.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*🎯 Needs focus*' } });
    for (const t of focusTasks.slice(0, 3)) {
      blocks.push(...buildHomeTaskBlocks({
        task: t,
        openUrl: taskOpenUrl(frontend, t.project_id, t.id),
        uniqueIds: false
      }));
    }
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Open Today plan' },
        action_id: 'open_dashboard_digest',
        url: `${frontend}/dashboard`,
        style: 'primary'
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Progress' },
        action_id: 'open_progress_digest',
        url: `${frontend}/progress`
      }
    ]
  });

  return blocks;
}

module.exports = { buildDigestBlocks, taskOpenUrl };
