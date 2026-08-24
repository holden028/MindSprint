const { Worker, Queue } = require('bullmq');
const { Pool } = require('pg');
const OpenAI = require('openai');
require('dotenv').config();

if (process.env.NODE_ENV === 'production' && !process.env.OPENAI_API_KEY) {
  console.error('Missing required environment variable: OPENAI_API_KEY');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  timeout: 30000,
  maxRetries: 1
});

function redisConnection() {
  const url = process.env.REDIS_URL || 'redis://redis:6379';
  try {
    const parsed = new URL(url);
    const config = {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      username: parsed.username || undefined
    };
    if (parsed.protocol === 'rediss:') {
      config.tls = {};
    }
    return config;
  } catch (err) {
    return { host: 'redis', port: 6379 };
  }
}

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://app:password@postgres:5432/focusflow',
  ssl: (() => {
    if (process.env.DATABASE_SSL === 'false') return false;
    if (process.env.DATABASE_SSL === 'true') return { rejectUnauthorized: false };
    const url = process.env.DATABASE_URL || '';
    if (/railway|neon|render|supabase|sslmode=require/i.test(url)) {
      return { rejectUnauthorized: false };
    }
    return false;
  })()
});

console.log('🤖 AI Worker starting...');

// Process ingest jobs
const worker = new Worker('ingest', async (job) => {
  console.log(`Processing job ${job.id}:`, job.data);
  
  let { ingestId, userId, content, contentType } = job.data;

  if (!content) {
    const ingestRow = await pool.query(
      'SELECT content, content_type FROM ingests WHERE id = $1',
      [ingestId]
    );
    if (ingestRow.rows.length === 0) {
      throw new Error(`Ingest ${ingestId} not found`);
    }
    content = ingestRow.rows[0].content;
    contentType = contentType || ingestRow.rows[0].content_type;
  }

  try {
    // Update status to processing
    await pool.query(
      'UPDATE ingests SET status = $1 WHERE id = $2',
      ['processing', ingestId]
    );

    let breakdown;

    if (contentType === 'text') {
      breakdown = await processTextBreakdown(content);
    } else if (contentType === 'screenshot') {
      breakdown = await processScreenshotBreakdown(content);
    } else {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    console.log('📋 Parsed breakdown:', breakdown);

    // Create project
    const projectResult = await pool.query(`
      INSERT INTO projects (user_id, title, description, source_type)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [userId, breakdown.projectTitle, breakdown.projectDescription || '', 'email']);

    const projectId = projectResult.rows[0].id;
    console.log(`✅ Created project: ${breakdown.projectTitle} (ID: ${projectId})`);

    // Create tasks
    for (const task of breakdown.tasks) {
      const taskResult = await pool.query(`
        INSERT INTO tasks (project_id, title, description, est_minutes, priority, urgency)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        projectId,
        task.title,
        task.description || '',
        task.estMinutes || 30,
        task.priority || 3,
        task.urgency || 3
      ]);
      console.log(`✅ Created task: ${task.title} (ID: ${taskResult.rows[0].id})`);
    }

    // Update ingest status to completed
    await pool.query(
      'UPDATE ingests SET status = $1, processed_at = NOW(), result = $2 WHERE id = $3',
      ['completed', JSON.stringify(breakdown), ingestId]
    );

    console.log(`Text breakdown completed for ingest ${ingestId}`);
    console.log(`Job ${job.id} completed successfully`);

  } catch (error) {
    console.error(`Error processing job ${job.id}:`, error);

    // Check if it's an invalid API key error
    if (error.message && error.message.includes('invalid_api_key')) {
      console.log('⚠️ Invalid OpenAI API key - using mock response');
      
      // Create a mock breakdown for testing
      const mockBreakdown = {
        projectTitle: "Mock Project - " + (contentType === 'text' ? 'Text Input' : 'Screenshot'),
        projectDescription: "This is a mock project created because the OpenAI API key is invalid",
        tasks: [
          {
            title: "Task 1: Review the content",
            description: "Review the provided content and understand requirements",
            estMinutes: 15,
            priority: 4,
            urgency: 4
          },
          {
            title: "Task 2: Plan approach",
            description: "Plan the approach to tackle this work",
            estMinutes: 20,
            priority: 3,
            urgency: 3
          },
          {
            title: "Task 3: Execute the work",
            description: "Execute the planned work",
            estMinutes: 30,
            priority: 5,
            urgency: 5
          }
        ]
      };

      // Create project with mock data
      const projectResult = await pool.query(`
        INSERT INTO projects (user_id, title, description, source_type)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [userId, mockBreakdown.projectTitle, mockBreakdown.projectDescription, 'email']);

      const projectId = projectResult.rows[0].id;

      // Create mock tasks
      for (const task of mockBreakdown.tasks) {
        await pool.query(`
          INSERT INTO tasks (project_id, title, description, est_minutes, priority, urgency)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [projectId, task.title, task.description, task.estMinutes, task.priority, task.urgency]);
      }

      // Mark as completed with mock data
      await pool.query(
        'UPDATE ingests SET status = $1, processed_at = NOW(), result = $2 WHERE id = $3',
        ['completed', JSON.stringify(mockBreakdown), ingestId]
      );

      console.log('✅ Created mock project and tasks');
      return;
    }

    // Update ingest status to error
    await pool.query(
      'UPDATE ingests SET status = $1, error_message = $2 WHERE id = $3',
      ['error', error.message, ingestId]
    );

    throw error;
  }
}, {
  connection: redisConnection(),
  concurrency: 2
});

// Process text breakdown
async function processTextBreakdown(text) {
  const prompt = `You are an expert task breakdown assistant. Break down the following text into actionable microtasks (5-20 minutes each).

Text:
${text}

Respond ONLY with valid JSON in this exact format:
{
  "projectTitle": "Brief project title",
  "projectDescription": "One sentence description",
  "tasks": [
    {
      "title": "Task title",
      "description": "Task description",
      "estMinutes": 15,
      "priority": 4,
      "urgency": 4
    }
  ]
}

Priority and Urgency scale: 1 (lowest) to 5 (highest)
Make tasks specific, actionable, and completable in 5-20 minutes.`;

  const completion = await openai.chat.completions.create({
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 2000
  });

  const content = completion.choices[0].message.content;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response');
  }

  return JSON.parse(jsonMatch[0]);
}

// Process screenshot breakdown
async function processScreenshotBreakdown(imageBase64) {
  const prompt = `Analyze this screenshot and break down any visible tasks, projects, or work into actionable microtasks (5-20 minutes each).

Respond ONLY with valid JSON in this exact format:
{
  "projectTitle": "Brief project title",
  "projectDescription": "One sentence description",
  "tasks": [
    {
      "title": "Task title",
      "description": "Task description",
      "estMinutes": 15,
      "priority": 4,
      "urgency": 4
    }
  ]
}

Priority and Urgency scale: 1 (lowest) to 5 (highest)`;

  const completion = await openai.chat.completions.create({
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
          }
        ]
      }
    ],
    temperature: 0.7,
    max_tokens: 2000
  });

  const content = completion.choices[0].message.content;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response');
  }

  return JSON.parse(jsonMatch[0]);
}

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

console.log('✅ AI Worker started and listening for jobs');

// --- Recurring tasks worker ---

function computeNextOccurrence(rule, fromDate = new Date()) {
  const { freq, interval = 1, days, day_of_month } = rule;
  const next = new Date(fromDate);
  switch (freq) {
    case 'daily':
      next.setDate(next.getDate() + interval);
      break;
    case 'weekly': {
      if (days && days.length > 0) {
        const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
        const targetDays = days.map(d => dayMap[d.toLowerCase()]).filter(d => d !== undefined).sort((a, b) => a - b);
        const currentDay = next.getDay();
        const nextDay = targetDays.find(d => d > currentDay);
        if (nextDay !== undefined) {
          next.setDate(next.getDate() + (nextDay - currentDay));
        } else {
          next.setDate(next.getDate() + (7 * (interval - 1)) + (targetDays[0] + 7 - currentDay));
        }
      } else {
        next.setDate(next.getDate() + 7 * interval);
      }
      break;
    }
    case 'monthly':
      if (day_of_month) {
        next.setMonth(next.getMonth() + interval);
        next.setDate(Math.min(day_of_month, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      } else {
        next.setMonth(next.getMonth() + interval);
      }
      break;
    default:
      next.setDate(next.getDate() + 1);
  }
  return next;
}

const recurringQueue = new Queue('recurring-tasks', { connection: redisConnection() });
const reminderQueue = new Queue('reminders', { connection: redisConnection() });

recurringQueue.add('process-recurring', {}, {
  repeat: { every: 5 * 60 * 1000 }
}).catch(err => console.error('Failed to schedule recurring job:', err));

reminderQueue.add('process-reminders', {}, {
  repeat: { every: 60 * 1000 }
}).catch(err => console.error('Failed to schedule reminder job:', err));

const recurringWorker = new Worker('recurring-tasks', async () => {
  console.log('⏰ Processing recurring tasks...');
  try {
    const dueTasks = await pool.query(
      `SELECT t.*, p.user_id
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE t.is_recurring = true
         AND t.next_occurrence <= NOW()
         AND t.status != 'done'`
    );

    for (const task of dueTasks.rows) {
      await pool.query(
        `INSERT INTO tasks (project_id, title, description, priority, urgency, est_minutes, parent_task_id, original_title, original_description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [task.project_id, task.title, task.description, task.priority, task.urgency, task.est_minutes, task.id, task.title, task.description]
      );

      const nextOccurrence = computeNextOccurrence(task.recurrence_rule, new Date(task.next_occurrence));
      await pool.query(
        'UPDATE tasks SET next_occurrence = $1 WHERE id = $2',
        [nextOccurrence, task.id]
      );

      console.log(`✅ Created recurring instance of "${task.title}", next: ${nextOccurrence.toISOString()}`);
    }
  } catch (error) {
    console.error('Recurring task processing error:', error);
  }
}, { connection: redisConnection() });

const reminderWorker = new Worker('reminders', async () => {
  console.log('🔔 Processing due reminders...');
  try {
    const dueReminders = await pool.query(
      `SELECT r.*, t.title as task_title, t.status as task_status, t.due_at, t.est_minutes,
              t.priority, t.urgency, t.project_id,
              u.slack_webhook_url, u.slack_user_id, u.slack_bot_token, u.app_base_url, u.timezone
       FROM reminders r
       JOIN tasks t ON r.task_id = t.id
       JOIN users u ON r.user_id = u.id
       WHERE r.remind_at <= NOW() AND r.sent = false
       ORDER BY r.remind_at ASC`
    );

    for (const reminder of dueReminders.rows) {
      // Skip if task already done
      if (reminder.task_status === 'done') {
        await pool.query('UPDATE reminders SET sent = true WHERE id = $1', [reminder.id]);
        continue;
      }

      const kind = reminder.kind || 'custom';
      const frontendUrl = resolveAppBase(reminder.app_base_url);
      const copy = buildReminderCopy(kind, reminder, frontendUrl);
      const quiet = isQuietHours(reminder.timezone || 'Europe/London');

      // Only create in-app notification once per logical event (prefer in_app row)
      if (reminder.channel === 'in_app') {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, task_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [reminder.user_id, copy.notifType, copy.title, copy.body, reminder.task_id]
        );
      }

      if (reminder.channel === 'slack') {
        // Quiet hours: keep in-app, skip Slack (morning digest will cover)
        if (quiet && kind !== 'deadline' && kind !== 'overdue') {
          await pool.query('UPDATE reminders SET sent = true WHERE id = $1', [reminder.id]);
          continue;
        }
        // Avoid stacking different kinds within 20 minutes (allow dual-channel same kind)
        const recent = await pool.query(
          `SELECT id FROM notifications
           WHERE user_id = $1 AND task_id = $2
             AND type LIKE 'reminder_%'
             AND type <> $3
             AND created_at > NOW() - INTERVAL '20 minutes'
           LIMIT 1`,
          [reminder.user_id, reminder.task_id, copy.notifType]
        );
        if (recent.rows.length > 0 && kind !== 'deadline' && kind !== 'overdue' && kind !== 'custom') {
          await pool.query('UPDATE reminders SET sent = true WHERE id = $1', [reminder.id]);
          continue;
        }

        await sendSlackDM(reminder, copy.slackText);
      }

      await pool.query('UPDATE reminders SET sent = true WHERE id = $1', [reminder.id]);
      console.log(`🔔 Sent ${kind}/${reminder.channel} for "${reminder.task_title}"`);
    }
  } catch (error) {
    console.error('Reminder processing error:', error);
  }
}, { connection: redisConnection() });

function resolveAppBase(userBaseUrl) {
  const raw = (userBaseUrl || process.env.FRONTEND_URL || 'http://localhost:5174').trim().replace(/\/+$/, '');
  if (!raw) return 'http://localhost:5174';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `http://${raw}`;
}

function taskLink(base, projectId, taskId) {
  const b = (base || '').replace(/\/+$/, '');
  if (!projectId) return `${b}/dashboard${taskId ? `?task=${taskId}` : ''}`;
  return `${b}/projects/${projectId}${taskId ? `?task=${taskId}` : ''}`;
}

function getHourInTimezone(timeZone = 'Europe/London', date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'Europe/London',
      hour: 'numeric',
      hourCycle: 'h23'
    }).formatToParts(date);
    return Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  } catch {
    return date.getHours();
  }
}

function isQuietHours(timeZone = 'Europe/London', date = new Date()) {
  const hour = getHourInTimezone(timeZone, date);
  return hour >= 22 || hour < 7;
}

function formatDue(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function buildReminderCopy(kind, reminder, frontendUrl) {
  const title = reminder.task_title;
  const due = formatDue(reminder.due_at);
  const est = reminder.est_minutes || 30;
  const link = taskLink(frontendUrl, reminder.project_id, reminder.task_id);
  const open = `<${link}|Open task> · <${frontendUrl.replace(/\/+$/, '')}/dashboard|Today>`;

  switch (kind) {
    case 'morning':
      return {
        notifType: 'reminder_morning',
        title: `Today: ${title}`,
        body: due ? `Due ${due} · ~${est} min` : `On today's list · ~${est} min`,
        slackText: `☀️ *Today:* ${title}\n${due ? `Due ${due} · ` : ''}~${est} min\n${open}`
      };
    case 'start_by':
      return {
        notifType: 'reminder_start_by',
        title: `Start now: ${title}`,
        body: due ? `Leave buffer before deadline (${due}) · ~${est} min` : `Time to start · ~${est} min`,
        slackText: `🟡 *Start now:* ${title}\n${due ? `Due ${due} · ` : ''}~${est} min — leave buffer before the deadline\n${open}`
      };
    case 'due_soon':
      return {
        notifType: 'reminder_due_soon',
        title: `Due soon: ${title}`,
        body: `Deadline in ~15 minutes${due ? ` (${due})` : ''}`,
        slackText: `🟠 *Due in 15 min:* ${title}\nStill open — start a focus session or move the deadline\n${open}`
      };
    case 'deadline':
      return {
        notifType: 'reminder_deadline',
        title: `Deadline now: ${title}`,
        body: `This was due ${due || 'now'} and is still open`,
        slackText: `🔴 *Deadline:* ${title}\nWas due ${due || 'now'} — still open\n${open}`
      };
    case 'overdue':
      return {
        notifType: 'reminder_overdue',
        title: `Overdue: ${title}`,
        body: `Still open past ${due || 'the deadline'}`,
        slackText: `🔴 *Overdue:* ${title}\nStill open past ${due || 'the deadline'}\n${open}`
      };
    case 'not_started':
      return {
        notifType: 'reminder_not_started',
        title: `Urgent & not started: ${title}`,
        body: `P${reminder.priority}/U${reminder.urgency}${due ? ` · due ${due}` : ''} · no focus session yet`,
        slackText: `⚡ *Urgent & not started:* ${title}\nP${reminder.priority}/U${reminder.urgency}${due ? ` · due ${due}` : ''} · 0 focus time logged today\n${open}`
      };
    case 'missing_due':
      return {
        notifType: 'reminder_missing_due',
        title: `No due date: ${title}`,
        body: reminder.project_title
          ? `"${title}" in ${reminder.project_title} has no due date`
          : `"${title}" has no due date`,
        slackText: `📅 *Missing due date:* ${title}\n${reminder.project_title ? `_Project: ${reminder.project_title}_\n` : ''}Add a deadline so MindSprint can remind you.\n${open}`
      };
    default:
      return {
        notifType: 'reminder_custom',
        title: `Reminder: ${title}`,
        body: `Your reminder for "${title}" is due.`,
        slackText: `🔔 *Reminder:* ${title}\n${open}`
      };
  }
}

async function sendSlackDM(userRow, text) {
  try {
    if (userRow.slack_bot_token && userRow.slack_user_id) {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userRow.slack_bot_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ channel: userRow.slack_user_id, text })
      });
    } else if (userRow.slack_webhook_url) {
      const mention = userRow.slack_user_id ? `<@${userRow.slack_user_id}> ` : '';
      await fetch(userRow.slack_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${mention}${text}` })
      });
    }
  } catch (err) {
    console.error('Slack DM failed:', err.message);
  }
}

async function recentlyNotified(userId, type, taskId, interval) {
  const result = await pool.query(
    `SELECT id FROM notifications
     WHERE user_id = $1 AND type = $2
       AND ($3::uuid IS NULL OR task_id = $3)
       AND created_at > NOW() - ($4)::interval
     LIMIT 1`,
    [userId, type, taskId || null, interval]
  );
  return result.rows.length > 0;
}

async function emitAlert({ userId, task, kind, userSlack, frontendUrl, timeZone }) {
  const copy = buildReminderCopy(kind, {
    task_title: task.title,
    due_at: task.due_at,
    est_minutes: task.est_minutes,
    priority: task.priority,
    urgency: task.urgency,
    task_id: task.id,
    project_id: task.project_id,
    project_title: task.project_title
  }, frontendUrl);

  await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, task_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, copy.notifType, copy.title, copy.body, task.id]
  );

  if (!isQuietHours(timeZone || 'Europe/London') || kind === 'overdue' || kind === 'missing_due') {
    await sendSlackDM(userSlack, copy.slackText);
  }
}

recurringWorker.on('failed', (job, err) => console.error('Recurring job failed:', err));
reminderWorker.on('failed', (job, err) => console.error('Reminder job failed:', err));

// --- Status alerts: overdue follow-ups + urgent not-started ---

const statusAlertQueue = new Queue('status-alerts', { connection: redisConnection() });
statusAlertQueue.add('check-status', {}, {
  repeat: { every: 5 * 60 * 1000 }
}).catch((err) => console.error('Failed to schedule status alerts:', err));

const statusAlertWorker = new Worker('status-alerts', async () => {
  console.log('🚨 Checking overdue / not-started / missing due dates...');
  const now = new Date();

  try {
    // Overdue follow-ups — no 24h cutoff; slower nudges as tasks get older
    const overdue = await pool.query(
      `SELECT t.*, p.user_id as owner_id, p.title as project_title,
              COALESCE(t.assignee_user_id, p.user_id) as alert_user_id,
              u.slack_bot_token, u.slack_user_id, u.slack_webhook_url, u.app_base_url, u.timezone
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       JOIN users u ON u.id = COALESCE(t.assignee_user_id, p.user_id)
       WHERE t.status != 'done'
         AND t.due_at IS NOT NULL
         AND t.due_at < NOW()`
    );

    for (const task of overdue.rows) {
      const minsPast = (now - new Date(task.due_at)) / 60000;
      if (minsPast < 25) continue;

      const daysPast = minsPast / (60 * 24);
      let interval = '4 hours';
      if (daysPast >= 7) interval = '12 hours';
      else if (minsPast < 90) interval = '90 minutes';

      const alertUserId = task.alert_user_id;
      if (await recentlyNotified(alertUserId, 'reminder_overdue', task.id, interval)) continue;
      if (await recentlyNotified(alertUserId, 'reminder_deadline', task.id, '25 minutes')) continue;

      await emitAlert({
        userId: alertUserId,
        task,
        kind: 'overdue',
        userSlack: task,
        frontendUrl: resolveAppBase(task.app_base_url),
        timeZone: task.timezone
      });
      console.log(`🔴 Overdue follow-up: ${task.title}`);
    }

    // Urgent & not started (no focus session today) — assignee if set, else owner
    const urgent = await pool.query(
      `SELECT t.*, p.user_id as owner_id, p.title as project_title,
              COALESCE(t.assignee_user_id, p.user_id) as alert_user_id,
              u.slack_bot_token, u.slack_user_id, u.slack_webhook_url, u.app_base_url, u.timezone
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       JOIN users u ON u.id = COALESCE(t.assignee_user_id, p.user_id)
       WHERE t.status = 'todo'
         AND (t.priority >= 4 OR t.urgency >= 4)
         AND (
           (t.due_at IS NOT NULL AND t.due_at::date <= CURRENT_DATE)
           OR (t.due_at IS NOT NULL AND t.due_at - (COALESCE(t.est_minutes, 30) + 30) * INTERVAL '1 minute' <= NOW())
         )
         AND NOT EXISTS (
           SELECT 1 FROM sessions s
           WHERE s.task_id = t.id AND s.user_id = COALESCE(t.assignee_user_id, p.user_id)
             AND s.started_at::date = CURRENT_DATE
         )`
    );

    for (const task of urgent.rows) {
      const alertUserId = task.alert_user_id || task.user_id;
      if (await recentlyNotified(alertUserId, 'reminder_not_started', task.id, '4 hours')) continue;
      await emitAlert({
        userId: alertUserId,
        task,
        kind: 'not_started',
        userSlack: task,
        frontendUrl: resolveAppBase(task.app_base_url),
        timeZone: task.timezone
      });
      console.log(`⚡ Not-started urgent: ${task.title}`);
    }

    // Open tasks missing a due date (nudge so AI scaffolding can schedule them)
    const missingDue = await pool.query(
      `SELECT t.*, p.user_id, p.title as project_title,
              u.slack_bot_token, u.slack_user_id, u.slack_webhook_url, u.app_base_url, u.timezone
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE t.status != 'done'
         AND t.due_at IS NULL
         AND (u.slack_bot_token IS NOT NULL OR u.slack_webhook_url IS NOT NULL)`
    );

    for (const task of missingDue.rows) {
      if (await recentlyNotified(task.user_id, 'reminder_missing_due', task.id, '24 hours')) continue;
      await emitAlert({
        userId: task.user_id,
        task,
        kind: 'missing_due',
        userSlack: task,
        frontendUrl: resolveAppBase(task.app_base_url),
        timeZone: task.timezone
      });
      console.log(`📅 Missing due date: ${task.title}`);
    }
  } catch (error) {
    console.error('Status alert error:', error);
  }
}, { connection: redisConnection() });

statusAlertWorker.on('failed', (job, err) => console.error('Status alert job failed:', err));

function bucketByDue(tasks, now = new Date()) {
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const overdue = [];
  const dueToday = [];
  const startToday = [];
  const inProgress = [];
  for (const t of tasks) {
    if (t.status === 'doing') inProgress.push(t);
    if (!t.due_at) continue;
    const due = new Date(t.due_at);
    const startBy = new Date(due.getTime() - ((t.est_minutes || 30) + 30) * 60000);
    if (due < now) overdue.push(t);
    else if (due <= todayEnd) dueToday.push(t);
    else if (startBy <= todayEnd) startToday.push(t);
  }
  return { overdue, dueToday, startToday, inProgress };
}

function pushTaskLines(lines, heading, tasks, extra) {
  if (!tasks.length) return;
  lines.push(heading);
  tasks.slice(0, 5).forEach((t) => {
    const who = extra ? extra(t) : '';
    lines.push(`• ${t.title}${who}`);
  });
}

async function loadOwnerRoundupData(userId) {
  const mine = await pool.query(
    `SELECT t.*
     FROM tasks t
     JOIN projects p ON t.project_id = p.id
     WHERE t.status != 'done'
       AND (
         (p.user_id = $1 AND t.assignee_user_id IS NULL)
         OR t.assignee_user_id = $1
       )
     ORDER BY t.due_at ASC NULLS LAST
     LIMIT 40`,
    [userId]
  );
  const assignedOut = await pool.query(
    `SELECT t.*, assignee.email as assignee_email
     FROM tasks t
     JOIN projects p ON t.project_id = p.id
     LEFT JOIN users assignee ON t.assignee_user_id = assignee.id
     WHERE p.user_id = $1
       AND t.assignee_user_id IS NOT NULL
       AND t.status != 'done'
     ORDER BY t.due_at ASC NULLS LAST
     LIMIT 40`,
    [userId]
  );
  return { mine: mine.rows, assignedOut: assignedOut.rows };
}

async function sendOwnerDigest(user, kind) {
  const frontendUrl = resolveAppBase(user.app_base_url);
  const now = new Date();
  const { mine, assignedOut } = await loadOwnerRoundupData(user.id);
  const myBuckets = bucketByDue(mine, now);
  const outBuckets = bucketByDue(assignedOut, now);
  const stuck = assignedOut.filter((t) => t.status === 'todo' && t.due_at && new Date(t.due_at) < now);

  const isEvening = kind === 'evening';
  const lines = [isEvening ? '🌙 *MindSprint — Evening roundup*' : '☀️ *MindSprint — Today*'];

  if (!isEvening) {
    pushTaskLines(lines, `🔴 *Overdue (${myBuckets.overdue.length})*`, myBuckets.overdue);
    pushTaskLines(lines, `🟠 *Due today (${myBuckets.dueToday.length})*`, myBuckets.dueToday, (t) => (
      ` (${new Date(t.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
    ));
    pushTaskLines(lines, `🟡 *Start today (${myBuckets.startToday.length})*`, myBuckets.startToday);
  } else {
    pushTaskLines(lines, `🔴 *Your unassigned overdue (${myBuckets.overdue.length})*`, myBuckets.overdue);
  }

  if (assignedOut.length) {
    lines.push(`👤 *Assigned out (${assignedOut.length})*`);
    pushTaskLines(lines, `  Overdue (${outBuckets.overdue.length})`, outBuckets.overdue, (t) => (
      t.assignee_email ? ` — ${t.assignee_email}` : ''
    ));
    pushTaskLines(lines, `  Due today (${outBuckets.dueToday.length})`, outBuckets.dueToday, (t) => (
      t.assignee_email ? ` — ${t.assignee_email}` : ''
    ));
    pushTaskLines(lines, `  In progress (${outBuckets.inProgress.length})`, outBuckets.inProgress, (t) => (
      t.assignee_email ? ` — ${t.assignee_email}` : ''
    ));
    if (stuck.length) {
      pushTaskLines(lines, `  Stuck / not started (${stuck.length})`, stuck, (t) => (
        t.assignee_email ? ` — ${t.assignee_email}` : ''
      ));
    }
  }

  const hasMine = isEvening
    ? myBuckets.overdue.length > 0
    : (myBuckets.overdue.length || myBuckets.dueToday.length || myBuckets.startToday.length);
  if (!hasMine && assignedOut.length === 0) return false;

  lines.push(`<${frontendUrl}/dashboard|Open Today plan>`);
  const text = lines.join('\n');
  const notifType = isEvening ? 'evening_roundup' : 'morning_digest';
  const title = isEvening ? 'Evening roundup' : 'Morning plan';
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, body)
     VALUES ($1, $2, $3, $4)`,
    [user.id, notifType, title, text.replace(/\*/g, '').slice(0, 800)]
  );
  await sendSlackDM(user, text);
  return true;
}

// --- Morning (~9) + evening (~18) owner roundups ---

const digestQueue = new Queue('morning-digest', { connection: redisConnection() });
digestQueue.add('daily-digest', {}, {
  repeat: { every: 15 * 60 * 1000 }
}).catch((err) => console.error('Failed to schedule morning digest:', err));

const digestWorker = new Worker('morning-digest', async () => {
  console.log('☀️ Checking owner roundups...');

  try {
    const users = await pool.query(
      `SELECT id, slack_bot_token, slack_user_id, slack_webhook_url, app_base_url, timezone FROM users`
    );

    for (const user of users.rows) {
      const tz = user.timezone || 'Europe/London';
      const hour = getHourInTimezone(tz);

      if (hour === 9) {
        if (await recentlyNotified(user.id, 'morning_digest', null, '20 hours')) continue;
        const sent = await sendOwnerDigest(user, 'morning');
        if (sent) console.log(`☀️ Morning roundup sent to user ${user.id}`);
      } else if (hour === 18) {
        if (await recentlyNotified(user.id, 'evening_roundup', null, '20 hours')) continue;
        const sent = await sendOwnerDigest(user, 'evening');
        if (sent) console.log(`🌙 Evening roundup sent to user ${user.id}`);
      }
    }
  } catch (error) {
    console.error('Owner roundup error:', error);
  }
}, { connection: redisConnection() });

digestWorker.on('failed', (job, err) => console.error('Digest job failed:', err));

// --- Schedule-check worker: warns when tasks can't fit before deadline ---

const scheduleCheckQueue = new Queue('schedule-check', { connection: redisConnection() });

scheduleCheckQueue.add('check-deadlines', {}, {
  repeat: { every: 30 * 60 * 1000 }
}).catch(err => console.error('Failed to schedule deadline check:', err));

function expandRecurringBlock(block, rangeStart, rangeEnd) {
  const rule = block.recurrence_rule;
  if (!rule || !rule.days || rule.days.length === 0) return [block];
  const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const targetDays = rule.days.map(d => dayMap[d.toLowerCase()]).filter(d => d !== undefined);
  const origStart = new Date(block.starts_at);
  const origEnd = new Date(block.ends_at);
  const durationMs = origEnd - origStart;
  const startHour = origStart.getHours();
  const startMin = origStart.getMinutes();
  const instances = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= rangeEnd) {
    if (targetDays.includes(cursor.getDay())) {
      const s = new Date(cursor);
      s.setHours(startHour, startMin, 0, 0);
      if (s >= rangeStart && s <= rangeEnd) {
        instances.push({ starts_at: s, ends_at: new Date(s.getTime() + durationMs) });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return instances;
}

async function getFreeMinutes(userId, fromDate, toDate) {
  const blocksResult = await pool.query(
    `SELECT * FROM time_blocks WHERE user_id = $1 AND (
      (starts_at >= $2 AND starts_at < $3) OR recurrence_rule IS NOT NULL
    )`, [userId, fromDate, toDate]
  );

  const busySlots = [];
  for (const block of blocksResult.rows) {
    if (!block.recurrence_rule) {
      busySlots.push({ start: new Date(block.starts_at), end: new Date(block.ends_at) });
    } else {
      for (const inst of expandRecurringBlock(block, fromDate, toDate)) {
        busySlots.push({ start: new Date(inst.starts_at), end: new Date(inst.ends_at) });
      }
    }
  }

  busySlots.sort((a, b) => a.start - b.start);

  // Compute free minutes between 7am-10pm each day
  let totalFree = 0;
  const cursor = new Date(fromDate);
  cursor.setHours(7, 0, 0, 0);
  if (cursor < fromDate) cursor.setTime(fromDate.getTime());

  const endTime = new Date(toDate);

  while (cursor < endTime) {
    const dayEnd = new Date(cursor);
    dayEnd.setHours(22, 0, 0, 0);
    if (dayEnd > endTime) dayEnd.setTime(endTime.getTime());

    let slotStart = new Date(cursor);
    for (const busy of busySlots) {
      if (busy.end <= slotStart || busy.start >= dayEnd) continue;
      if (busy.start > slotStart) {
        totalFree += (busy.start - slotStart) / 60000;
      }
      if (busy.end > slotStart) slotStart = busy.end;
    }
    if (slotStart < dayEnd) {
      totalFree += (dayEnd - slotStart) / 60000;
    }

    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(7, 0, 0, 0);
  }

  return totalFree;
}

const scheduleCheckWorker = new Worker('schedule-check', async () => {
  console.log('📅 Checking upcoming deadlines against availability...');
  try {
    const now = new Date();
    const horizon = new Date(now.getTime() + 48 * 3600000);

    const upcomingTasks = await pool.query(
      `SELECT t.*, p.user_id
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE t.due_at IS NOT NULL
         AND t.due_at <= $1
         AND t.due_at > $2
         AND t.status != 'done'
       ORDER BY t.due_at`,
      [horizon, now]
    );

    const userTasks = {};
    for (const task of upcomingTasks.rows) {
      if (!userTasks[task.user_id]) userTasks[task.user_id] = [];
      userTasks[task.user_id].push(task);
    }

    for (const [userId, tasks] of Object.entries(userTasks)) {
      const freeMinutes = await getFreeMinutes(userId, now, horizon);
      const totalNeeded = tasks.reduce((sum, t) => sum + (t.est_minutes || 30), 0);

      if (totalNeeded > freeMinutes) {
        const overflowTasks = [];
        let remaining = freeMinutes;
        for (const task of tasks) {
          const est = task.est_minutes || 30;
          if (est > remaining) {
            overflowTasks.push(task);
          }
          remaining -= est;
        }

        if (overflowTasks.length > 0) {
          const taskNames = overflowTasks.map(t => `"${t.title}"`).join(', ');
          const title = 'Schedule Warning';
          const body = `You may not have enough time to finish ${taskNames} before ${overflowTasks.length === 1 ? 'its' : 'their'} deadline. Consider starting now or rescheduling.`;

          // Check if we already sent this warning recently (last 2 hours)
          const existing = await pool.query(
            `SELECT id FROM notifications WHERE user_id = $1 AND type = 'schedule_warning' AND created_at > NOW() - INTERVAL '2 hours'`,
            [userId]
          );
          if (existing.rows.length === 0) {
            await pool.query(
              `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'schedule_warning', $2, $3)`,
              [userId, title, body]
            );

            // Also send via Slack if configured
            const user = await pool.query(
              'SELECT slack_bot_token, slack_user_id, slack_webhook_url FROM users WHERE id = $1',
              [userId]
            );
            const u = user.rows[0];
            if (u?.slack_bot_token && u?.slack_user_id) {
              try {
                await fetch('https://slack.com/api/chat.postMessage', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${u.slack_bot_token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ channel: u.slack_user_id, text: `⚠️ *${title}*\n${body}` })
                });
              } catch (e) { console.error('Slack schedule warning failed:', e.message); }
            }

            console.log(`⚠️ Schedule warning sent to user ${userId}: ${taskNames}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Schedule check error:', error);
  }
}, { connection: redisConnection() });

scheduleCheckWorker.on('failed', (job, err) => console.error('Schedule check job failed:', err));

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker...');
  await worker.close();
  await recurringWorker.close();
  await reminderWorker.close();
  await statusAlertWorker.close();
  await digestWorker.close();
  await scheduleCheckWorker.close();
  await pool.end();
  process.exit(0);
});
