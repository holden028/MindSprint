const { query } = require('../config/database');
const { buildHomeTaskBlocks } = require('./slackBlocks');
const {
  resolveAppBase,
  taskOpenUrl,
  getActiveFocusSession,
  focusEndsAt,
  formatClock,
  modeLabel
} = require('../services/slackNotify');
const { formatNowInTimezone } = require('./timezone');
const { getSuggestions } = require('../services/learning');
const { withWorkMode } = require('./taskWorkMode');
const { getTodayPlanForUser } = require('../services/todayPlan');
const {
  buildHeroImageBlock,
  buildAchievementStrip
} = require('./slackRichBlocks');

function intensityLabel(intensity) {
  switch (intensity) {
    case 'light': return 'Light';
    case 'medium': return 'Medium';
    default: return 'Full';
  }
}

function progressBar(ratio, width = 10) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
}

function greetingForHour(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

async function getHomeStats(userId, tz) {
  const [sessionsToday, tasksToday, focusMinutes, streakResult, openCount] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS n FROM sessions
       WHERE user_id = $1 AND completed = true
         AND (ended_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date`,
      [userId, tz]
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE p.user_id = $1 AND t.status = 'done'
         AND (t.completed_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date`,
      [userId, tz]
    ),
    query(
      `SELECT COALESCE(SUM(actual_duration_minutes), 0)::int AS m FROM sessions
       WHERE user_id = $1 AND completed = true
         AND (ended_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date`,
      [userId, tz]
    ),
    query(
      `WITH session_days AS (
         SELECT DISTINCT (started_at AT TIME ZONE $2)::date AS session_date
         FROM sessions WHERE user_id = $1 AND completed = true
       ),
       streak_calc AS (
         SELECT session_date,
           session_date - ROW_NUMBER() OVER (ORDER BY session_date DESC)::integer AS streak_group
         FROM session_days
       )
       SELECT COUNT(*)::int AS streak FROM streak_calc
       WHERE streak_group = (
         SELECT MAX(streak_group) FROM streak_calc WHERE session_date >= (NOW() AT TIME ZONE $2)::date - 1
       )`,
      [userId, tz]
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE p.user_id = $1 AND t.status != 'done'`,
      [userId]
    )
  ]);

  return {
    sessionsToday: sessionsToday.rows[0]?.n || 0,
    tasksDoneToday: tasksToday.rows[0]?.n || 0,
    focusMinutesToday: focusMinutes.rows[0]?.m || 0,
    streak: streakResult.rows[0]?.streak || 0,
    openTasks: openCount.rows[0]?.n || 0
  };
}

function scoreTaskForHome(task, now) {
  let score = (task.priority || 0) * 10 + (task.urgency || 0) * 5;
  if (task.status === 'doing') score += 100;
  if (task.due_at) {
    const due = new Date(task.due_at);
    if (due < now) score += 500;
    else if (due.toDateString() === now.toDateString()) score += 300;
  }
  if (task.work_mode === 'quick') score += 5;
  return score;
}

/**
 * Build App Home Tab Block Kit view for a linked MindSprint user.
 */
async function buildHomeView(user) {
  const frontend = resolveAppBase(user.app_base_url);
  const tz = user.timezone || 'Europe/London';
  const now = new Date();
  const nowLabel = formatNowInTimezone(tz, now);
  const hour = parseInt(
    now.toLocaleString('en-GB', { timeZone: tz, hour: 'numeric', hour12: false }),
    10
  );

  const [tasksResult, projectsResult, blocksResult, activeFocus, stats, suggestions, todayPlan, achievements] = await Promise.all([
    query(`
      SELECT t.id, t.title, t.description, t.status, t.due_at, t.est_minutes, t.priority, t.urgency,
             t.project_id, t.parent_task_id, t.ai_interpretations, p.title AS project_title
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE p.user_id = $1 AND t.status != 'done'
      ORDER BY
        CASE WHEN t.status = 'doing' THEN 0 ELSE 1 END,
        COALESCE(t.due_at, '2999-01-01') ASC,
        t.priority DESC,
        t.urgency DESC
      LIMIT 20
    `, [user.id]),
    query(`
      SELECT id, title, slack_channel_id, slack_channel_name
      FROM projects WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 6
    `, [user.id]),
    query(`
      SELECT title, starts_at, ends_at, recurrence_rule
      FROM time_blocks WHERE user_id = $1
      ORDER BY starts_at ASC LIMIT 4
    `, [user.id]),
    getActiveFocusSession(user.id),
    getHomeStats(user.id, tz),
    getSuggestions(user.id).catch(() => ({ tip: null, confidence: 'low' })),
    getTodayPlanForUser(user.id),
    query(`
      SELECT achievement_id, unlocked_at FROM user_achievements
      WHERE user_id = $1 ORDER BY unlocked_at DESC LIMIT 3
    `, [user.id]).then(async (recent) => {
      const total = await query(
        'SELECT COUNT(*)::int AS n FROM user_achievements WHERE user_id = $1',
        [user.id]
      );
      return { recent: recent.rows, total: total.rows[0]?.n || 0 };
    })
  ]);

  const annotated = tasksResult.rows
    .map((t) => ({ ...withWorkMode(t), _tz: tz }))
    .sort((a, b) => scoreTaskForHome(b, now) - scoreTaskForHome(a, now));

  const quickTasks = annotated.filter((t) => t.work_mode === 'quick').slice(0, 4);
  const focusTasks = annotated.filter((t) => t.work_mode === 'focus').slice(0, 5);
  const overdue = annotated.filter((t) => t.due_at && new Date(t.due_at) < now);

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🧠 MindSprint', emoji: true }
    }
  ];

  const hero = buildHeroImageBlock(frontend);
  if (hero) blocks.push(hero);

  blocks.push(
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${greetingForHour(hour)}, <@${user.slack_user_id || ''}> · *${nowLabel}* · ~${todayPlan.freeMinutes}m free today`
        }
      ]
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*✅ Done today*\n${stats.tasksDoneToday} tasks` },
        { type: 'mrkdwn', text: `*🍅 Focus today*\n${stats.sessionsToday} · ${stats.focusMinutesToday}m` },
        { type: 'mrkdwn', text: `*🔥 Streak*\n${stats.streak} day${stats.streak === 1 ? '' : 's'}` },
        { type: 'mrkdwn', text: `*📋 Queue*\n${stats.openTasks} · ${todayPlan.quickTasks.length} quick · ${todayPlan.focusTasks.length} focus` }
      ]
    }
  );

  if (suggestions?.tip) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `💡 *Learned for you*${suggestions.confidence && suggestions.confidence !== 'low' ? ` _(${suggestions.confidence} confidence)_` : ''}\n${suggestions.tip}`
      }
    });
  }

  blocks.push(...buildAchievementStrip({
    recent: achievements.recent,
    total: achievements.total,
    totalPossible: 12
  }));

  if (todayPlan.plan.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `📌 *Suggested plan* fits ~${todayPlan.planMinutes}m of your ${todayPlan.freeMinutes}m free · ${todayPlan.plan.slice(0, 3).map((t) => t.title).join(' → ')}`
      }]
    });
  }

  if (overdue.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `🔴 *${overdue.length} overdue* — ${overdue.slice(0, 2).map((t) => t.title).join(' · ')}${overdue.length > 2 ? '…' : ''}`
      }]
    });
  }

  if (activeFocus) {
    const ends = focusEndsAt(activeFocus.started_at, activeFocus.duration_minutes);
    const totalMs = (activeFocus.duration_minutes || 25) * 60000;
    const remainingMs = ends.getTime() - Date.now();
    const elapsed = Math.max(0, Math.min(1, 1 - remainingMs / totalMs));
    const remainingMin = Math.max(0, Math.ceil(remainingMs / 60000));
    const overdue = remainingMs < 0;
    const focusUrl = activeFocus.task_id
      ? `${frontend}/focus?taskId=${activeFocus.task_id}&taskTitle=${encodeURIComponent(activeFocus.task_title || 'Focus')}`
      : `${frontend}/focus`;

    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `🍅 *Focus ${overdue ? 'overdue' : 'live'}*\n` +
          `${activeFocus.task_title ? `*${activeFocus.task_title}*` : '_No task linked_'}\n` +
          `${modeLabel(activeFocus.mode)} · ${activeFocus.duration_minutes || 25}m · ` +
          (overdue
            ? `_Past ${formatClock(ends, tz)} — wrap up when ready_`
            : `~*${remainingMin}m* left · ends ~${formatClock(ends, tz)}`) +
          `\n\`${progressBar(elapsed, 12)}\` ${Math.round(elapsed * 100)}%`
      }
    });
    blocks.push({
      type: 'actions',
      block_id: 'home_focus_active',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Done focusing' },
          action_id: 'home_focus_done',
          value: String(activeFocus.id),
          style: 'primary'
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '+10 min' },
          action_id: 'home_focus_extend',
          value: String(activeFocus.id)
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open timer' },
          action_id: 'home_open_focus',
          url: focusUrl
        }
      ]
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    block_id: 'home_actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '✨ Plan my day', emoji: true },
        action_id: 'home_plan_day',
        style: activeFocus ? undefined : 'primary'
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '➕ New task', emoji: true },
        action_id: 'home_new_task'
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Open app' },
        action_id: 'home_open_app',
        url: `${frontend}/dashboard`
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Progress' },
        action_id: 'home_open_progress',
        url: `${frontend}/progress`
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '↻ Refresh' },
        action_id: 'home_refresh'
      }
    ]
  });

  blocks.push({ type: 'divider' });

  if (quickTasks.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⚡ Quick wins* · _tap Done — no timer needed_`
      }
    });
    for (const t of quickTasks) {
      blocks.push(...buildHomeTaskBlocks({
        task: t,
        openUrl: taskOpenUrl(frontend, t.project_id, t.id),
        uniqueIds: true
      }));
    }
    blocks.push({ type: 'divider' });
  }

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: focusTasks.length > 0
        ? `*🎯 Focus today* · _start a session for deep work_`
        : '*🎯 Focus today*'
    }
  });

  if (focusTasks.length === 0 && quickTasks.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '_Nothing queued — create a task or ask AI to plan your day._'
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'New task' },
        action_id: 'home_new_task_alt',
        value: 'new'
      }
    });
  } else if (focusTasks.length === 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '_All clear on focus tasks — quick wins above should cover it._' }]
    });
  } else {
    for (const t of focusTasks) {
      blocks.push(...buildHomeTaskBlocks({
        task: t,
        openUrl: taskOpenUrl(frontend, t.project_id, t.id),
        uniqueIds: true
      }));
    }
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: '*📅 Schedule*' }
  });

  if (blocksResult.rows.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_No blocked time yet — add your day structure in <${frontend}/settings|Settings>._`
      }
    });
  } else {
    const lines = blocksResult.rows.slice(0, 3).map((b) => {
      const start = new Date(b.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
      const end = new Date(b.ends_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
      const days = b.recurrence_rule?.days?.join(', ') || 'one-time';
      return `• *${b.title}* ${start}–${end} _(${days})_`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n') }
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: '*📁 Projects*' }
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
      return `• ${link} _· link channel with \`/sprint link\`_`;
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
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `🔔 *Nags:* ${enabled ? 'On' : 'Off'} · Intensity *${intensityLabel(intensity)}* · <${frontend}/settings|Settings>`
    }]
  });
  blocks.push({
    type: 'actions',
    block_id: 'home_nag_prefs',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: enabled ? 'Mute' : 'Unmute' },
        action_id: 'home_toggle_nags',
        value: enabled ? 'off' : 'on'
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Light' },
        action_id: 'home_intensity_light',
        value: 'light'
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Medium' },
        action_id: 'home_intensity_medium',
        value: 'medium'
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Full' },
        action_id: 'home_intensity_full',
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
