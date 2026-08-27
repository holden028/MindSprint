const { buildHomeTaskBlocks } = require('./slackBlocks');
const { taskOpenUrl } = require('../services/slackNotify');

function progressBar(ratio, width = 12) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
}

function achievementLabel(id) {
  const labels = {
    first_session: '🎯 First session',
    early_bird: '🌅 Early bird',
    night_owl: '🦉 Night owl',
    focus_master: '🧠 Focus master',
    estimate_expert: '⏱️ Estimate expert',
    week_warrior: '🔥 Week warrior',
    month_master: '🏆 Month master',
    century_club: '💯 Century club',
    distraction_destroyer: '🛡️ Distraction destroyer',
    energy_enthusiast: '⚡ Energy enthusiast',
    task_terminator: '✅ Task terminator',
    project_pro: '📁 Project pro'
  };
  return labels[id] || id;
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

function buildAchievementStrip({ recent = [], total = 0, totalPossible = 12 }) {
  const blocks = [];
  const pct = totalPossible ? Math.round((total / totalPossible) * 100) : 0;
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*🏅 Achievements* · ${total}/${totalPossible} unlocked\n\`${progressBar(total / totalPossible, 14)}\` ${pct}%`
    }
  });
  if (recent.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `Latest: ${recent.map((a) => achievementLabel(a.achievement_id)).join(' · ')}`
      }]
    });
  }
  return blocks;
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
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Open*\n${stats.openTasks ?? '—'}` },
        { type: 'mrkdwn', text: `*Done today*\n${stats.tasksDoneToday ?? 0}` },
        { type: 'mrkdwn', text: `*Focus today*\n${stats.sessionsToday ?? 0} · ${stats.focusMinutesToday ?? 0}m` },
        { type: 'mrkdwn', text: `*Streak*\n${stats.streak ?? 0}🔥` }
      ]
    }
  ];

  const hero = buildHeroImageBlock(frontend);
  if (hero) blocks.splice(1, 0, hero);

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
        text: `🟠 *Due today (${dueToday.length})*\n${dueToday.slice(0, 5).map((t) => {
          const time = t.due_at
            ? new Date(t.due_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            : '';
          return `• ${t.title}${time ? ` _(${time})_` : ''}`;
        }).join('\n')}`
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
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*⚡ Quick wins — one tap Done*' }
    });
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
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*🎯 Needs focus*' }
    });
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

function buildPlanDayBlocks({ aiText, frontend, stats = {}, quickTasks = [], focusTasks = [] }) {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '✨ Your plan for today', emoji: true }
    }
  ];

  const hero = buildHeroImageBlock(frontend);
  if (hero) blocks.push(hero);

  blocks.push({
    type: 'section',
    fields: [
      { type: 'mrkdwn', text: `*Free to work*\n~${stats.freeMinutes ?? '—'}m` },
      { type: 'mrkdwn', text: `*Suggested*\n${stats.planMinutes ?? '—'}m` },
      { type: 'mrkdwn', text: `*Quick*\n${quickTasks.length}` },
      { type: 'mrkdwn', text: `*Focus*\n${focusTasks.length}` }
    ]
  });

  if (aiText) {
    const trimmed = String(aiText).slice(0, 2800);
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: trimmed }
    });
  }

  if (quickTasks.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*⚡ Knock these out first*' } });
    for (const t of quickTasks.slice(0, 4)) {
      blocks.push(...buildHomeTaskBlocks({
        task: t,
        openUrl: taskOpenUrl(frontend, t.project_id, t.id),
        uniqueIds: false
      }));
    }
  }

  if (focusTasks.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*🎯 Block focus time for*' } });
    for (const t of focusTasks.slice(0, 4)) {
      blocks.push(...buildHomeTaskBlocks({
        task: t,
        openUrl: taskOpenUrl(frontend, t.project_id, t.id),
        uniqueIds: false
      }));
    }
  }

  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `<${frontend}/dashboard|Open dashboard> · <${frontend}/focus|Start focus> · Reply in DM to refine the plan`
    }]
  });

  return blocks;
}

module.exports = {
  progressBar,
  achievementLabel,
  buildHeroImageBlock,
  buildAchievementStrip,
  buildDigestBlocks,
  buildPlanDayBlocks
};
