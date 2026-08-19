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
  ssl: process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false'
    ? { rejectUnauthorized: false }
    : false
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
      `SELECT r.*, t.title as task_title, u.slack_webhook_url, u.slack_user_id, u.slack_bot_token
       FROM reminders r
       JOIN tasks t ON r.task_id = t.id
       JOIN users u ON r.user_id = u.id
       WHERE r.remind_at <= NOW() AND r.sent = false`
    );

    for (const reminder of dueReminders.rows) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, task_id)
         VALUES ($1, 'reminder', $2, $3, $4)`,
        [
          reminder.user_id,
          `Reminder: ${reminder.task_title}`,
          `Your reminder for "${reminder.task_title}" is due.`,
          reminder.task_id
        ]
      );

      if (reminder.channel === 'slack') {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
        const msg = `🔔 *Reminder: ${reminder.task_title}*\n<${frontendUrl}/dashboard|Open MindSprint>`;

        try {
          if (reminder.slack_bot_token && reminder.slack_user_id) {
            await fetch('https://slack.com/api/chat.postMessage', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${reminder.slack_bot_token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ channel: reminder.slack_user_id, text: msg })
            });
          } else if (reminder.slack_webhook_url) {
            const mention = reminder.slack_user_id ? `<@${reminder.slack_user_id}> ` : '';
            await fetch(reminder.slack_webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: `${mention}${msg}` })
            });
          }
        } catch (slackErr) {
          console.error('Slack notification failed:', slackErr.message);
        }
      }

      await pool.query('UPDATE reminders SET sent = true WHERE id = $1', [reminder.id]);
      console.log(`🔔 Sent reminder for "${reminder.task_title}"`);
    }
  } catch (error) {
    console.error('Reminder processing error:', error);
  }
}, { connection: redisConnection() });

recurringWorker.on('failed', (job, err) => console.error('Recurring job failed:', err));
reminderWorker.on('failed', (job, err) => console.error('Reminder job failed:', err));

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
  await scheduleCheckWorker.close();
  await pool.end();
  process.exit(0);
});
