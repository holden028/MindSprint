const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { chatJson } = require('../config/openai');
const { updatePriorities } = require('../services/priorities');

const router = express.Router();
const AUTO_TAG_CAP = 40;

function tagPrompt(kind, title, description) {
  return `Analyze this ${kind} and generate 3-5 relevant tags.

${kind === 'task' ? 'Task' : 'Project'}: ${title}
Description: ${description || 'No description'}

Generate tags that categorize this by type, domain, and characteristics.
Return ONLY a JSON array of 3-5 lowercase tag strings:
["tag1", "tag2", "tag3"]`;
}

async function batchTag(items, kind) {
  if (items.length === 0) return [];

  const prompt = `Generate 3-5 lowercase tags for each ${kind} below.
Return ONLY JSON: {"items":[{"id":"...","tags":["tag1","tag2"]}]}

${items.map((item) => `id=${item.id}
title=${item.title}
description=${item.description || 'No description'}`).join('\n\n')}`;

  const parsed = await chatJson({ prompt, temperature: 0.5, max_tokens: 2000 });
  const tagged = Array.isArray(parsed?.items) ? parsed.items : [];
  const byId = new Map(items.map((item) => [String(item.id), item]));
  return tagged.filter((row) => row && byId.has(String(row.id)) && Array.isArray(row.tags));
}

router.post('/generate-tags', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { entity_type, entity_id, title, description } = req.body;

    if (!entity_type || !entity_id || !title) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (entity_type !== 'task' && entity_type !== 'project') {
      return res.status(400).json({ error: 'Invalid entity_type' });
    }

    const tags = await chatJson({
      prompt: tagPrompt(entity_type, title, description),
      temperature: 0.5,
      max_tokens: 200
    });

    if (!Array.isArray(tags)) {
      return res.status(500).json({ error: 'Failed to generate tags' });
    }

    const table = entity_type === 'task' ? 'tasks' : 'projects';
    const condition = entity_type === 'task'
      ? 'id = $1 AND project_id IN (SELECT id FROM projects WHERE user_id = $2)'
      : 'id = $1 AND user_id = $2';

    await query(`
      UPDATE ${table}
      SET tags = $3, updated_at = NOW()
      WHERE ${condition}
    `, [entity_id, user_id, tags]);

    res.json({ tags, message: 'Tags generated successfully' });
  } catch (error) {
    console.error('Generate tags error:', error);
    res.status(500).json({ error: 'Failed to generate tags' });
  }
});

router.post('/auto-tag-all', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;

    const [projectsResult, tasksResult] = await Promise.all([
      query(`
        SELECT id, title, description FROM projects WHERE user_id = $1
        ORDER BY created_at DESC LIMIT $2
      `, [user_id, AUTO_TAG_CAP]),
      query(`
        SELECT t.id, t.title, t.description
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE p.user_id = $1
        ORDER BY t.created_at DESC LIMIT $2
      `, [user_id, AUTO_TAG_CAP])
    ]);

    const [taggedProjects, taggedTasks] = await Promise.all([
      batchTag(projectsResult.rows, 'project'),
      batchTag(tasksResult.rows, 'task')
    ]);

    await Promise.all([
      ...taggedProjects.map((row) => query(
        'UPDATE projects SET tags = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
        [row.tags, row.id, user_id]
      )),
      ...taggedTasks.map((row) => query(`
        UPDATE tasks SET tags = $1, updated_at = NOW()
        WHERE id = $2 AND project_id IN (SELECT id FROM projects WHERE user_id = $3)
      `, [row.tags, row.id, user_id]))
    ]);

    res.json({
      message: 'Auto-tagging completed',
      projects_tagged: taggedProjects.length,
      tasks_tagged: taggedTasks.length,
      projects: taggedProjects,
      tasks: taggedTasks
    });
  } catch (error) {
    console.error('Auto-tag-all error:', error);
    res.status(500).json({ error: 'Failed to auto-tag items' });
  }
});

router.post('/analyze-projects', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;

    const projectsResult = await query(`
      SELECT
        p.id, p.title, p.description,
        json_agg(json_build_object('title', t.title, 'description', t.description)) as tasks
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id
      WHERE p.user_id = $1
      GROUP BY p.id
      LIMIT 30
    `, [user_id]);

    const projects = projectsResult.rows;

    if (projects.length < 2) {
      return res.json({
        relationships: [],
        message: 'Need at least 2 projects to analyze relationships'
      });
    }

    const prompt = `Analyze these projects and identify relationships, dependencies, and common themes:

${projects.map((p) => `
Project: ${p.title}
Description: ${p.description || 'No description'}
Tasks: ${JSON.stringify(p.tasks)}
`).join('\n')}

Provide analysis in JSON format:
{
  "relationships": [
    {"project1": "Project Name", "project2": "Project Name", "type": "related|dependent|similar", "description": "How they relate"}
  ],
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}`;

    const analysis = await chatJson({ prompt, temperature: 0.7, max_tokens: 1500 });
    res.json({
      relationships: Array.isArray(analysis.relationships) ? analysis.relationships : [],
      recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : []
    });
  } catch (error) {
    console.error('Analyze projects error:', error);
    res.status(500).json({ error: 'Failed to analyze projects' });
  }
});

router.post('/update-priorities', authenticateToken, async (req, res) => {
  try {
    const result = await updatePriorities(req.user.user_id, req.body || {});
    res.json(result);
  } catch (error) {
    console.error('Update priorities error:', error);
    res.status(500).json({ error: 'Failed to update priorities' });
  }
});

async function getUserContext(user_id, project_id) {
  let projectContext = '';
  if (project_id) {
    const projectResult = await query(`
      SELECT p.title, p.description,
             json_agg(json_build_object('title', t.title, 'priority', t.priority, 'urgency', t.urgency)) as existing_tasks
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id AND t.status != 'done'
      WHERE p.id = $1 AND p.user_id = $2
      GROUP BY p.id
    `, [project_id, user_id]);

    if (projectResult.rows.length > 0) {
      const project = projectResult.rows[0];
      projectContext = `\nProject Context:\n- Title: ${project.title}\n- Description: ${project.description || 'No description'}\n- Existing Tasks: ${(project.existing_tasks || []).filter((t) => t.title).map((t) => `${t.title} (P${t.priority}, U${t.urgency})`).join(', ')}`;
    }
  }

  const recentTasksResult = await query(`
    SELECT t.title, t.priority, t.urgency, t.est_minutes, p.title as project_title
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE p.user_id = $1 AND t.status != 'done'
    ORDER BY t.created_at DESC
    LIMIT 10
  `, [user_id]);

  const recentTasks = recentTasksResult.rows.map((t) =>
    `${t.title} (P${t.priority}, U${t.urgency}, ${t.est_minutes}min${t.project_title ? ` – ${t.project_title}` : ''})`
  ).join('; ');

  return { projectContext, recentTasks };
}

function inferTemplateType(template) {
  return Array.isArray(template?.tasks) ? 'project' : 'task';
}

function buildTemplateContext(recentTasks) {
  return `Recent tasks: ${recentTasks || 'None yet'}`;
}

router.post('/analyze-task', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { title, description, project_id, est_minutes, priority, urgency } = req.body;
    const { projectContext, recentTasks } = await getUserContext(user_id, project_id);

    const prompt = `You are a smart task assistant for an ADHD productivity app. Analyze this task and suggest improvements. Learn from the user's existing tasks to understand their work patterns — never ask them to describe themselves or their job.

Task: "${title}"
Description: "${description || ''}"
Time estimate: ${est_minutes}min | Priority: ${priority}/5 | Urgency: ${urgency}/5
${projectContext}
Recent tasks: ${recentTasks || 'None yet'}

Return JSON with 1-3 questions max. Each question MUST have 2-4 predefined "options" the user can tap to agree with. Only ask questions that would meaningfully improve the task — skip if the task is already clear.

{
  "questions": [
    {
      "question": "Short question text",
      "options": [
        {"label": "Best guess answer", "value": "the value to apply"},
        {"label": "Another option", "value": "another value"},
        {"label": "Skip this", "value": null}
      ],
      "field": "description|est_minutes|priority|urgency|title"
    }
  ],
  "refined_task": {
    "title": "Improved title if needed, otherwise same",
    "description": "Better description incorporating context",
    "est_minutes": 30,
    "priority": 3,
    "urgency": 3
  }
}

Rules:
- If the task is clear, return empty questions array and just the refined_task
- Options should be smart guesses based on the task + user's patterns
- Always include a "Skip this" option with null value
- "field" tells the frontend which task field this question refines
- Keep questions practical: break-down, time, scope — not personal identity questions`;

    const analysis = await chatJson({ prompt, temperature: 0.3, max_tokens: 1200 });
    if (!Array.isArray(analysis.questions)) analysis.questions = [];

    res.json(analysis);
  } catch (error) {
    console.error('Analyze task error:', error);
    res.status(500).json({ error: 'Failed to analyze task' });
  }
});

router.post('/refine-task', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { task, answered_questions } = req.body;
    const { projectContext, recentTasks } = await getUserContext(user_id, task.project_id);

    const prompt = `You are a smart task assistant. The user answered some follow-up questions about their task. Apply their answers and return an improved version.

Original task: "${task.title}"
Description: "${task.description || ''}"
Time: ${task.est_minutes}min | Priority: ${task.priority}/5 | Urgency: ${task.urgency}/5
${projectContext}
Recent tasks: ${recentTasks || 'None yet'}

User's answers:
${answered_questions.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')}

Return JSON — the final refined task incorporating the user's answers:
{
  "refined_task": {
    "title": "...",
    "description": "...",
    "est_minutes": 30,
    "priority": 3,
    "urgency": 3
  },
  "follow_up_questions": []
}

Rules:
- Apply answers to improve title, description, estimates
- Only add follow_up_questions (same format as before with options) if genuinely needed — usually return empty array
- Never ask personal/identity questions`;

    const result = await chatJson({ prompt, temperature: 0.3, max_tokens: 800 });
    res.json(result);
  } catch (error) {
    console.error('Refine task error:', error);
    res.status(500).json({ error: 'Failed to refine task' });
  }
});

router.post('/generate-template', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { type, description } = req.body;

    if (type !== 'task' && type !== 'project') {
      return res.status(400).json({ error: 'Type must be task or project' });
    }

    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    const { recentTasks } = await getUserContext(user_id);

    const prompt = type === 'task'
      ? `You are designing a reusable task template for an ADHD-friendly productivity app.

User request: "${description}"
${buildTemplateContext(recentTasks)}

Return ONLY JSON for a task template draft. Do not save anything or include explanations.
{
  "name": "Short template name",
  "title": "Specific task title",
  "description": "Helpful details for when this template is used",
  "est_minutes": 30,
  "priority": 3,
  "urgency": 3,
  "tags": ["tag1", "tag2"],
  "recurrence_rule": null,
  "ai_generated": true
}

Rules:
- Keep name short and reusable
- est_minutes, priority, and urgency should be practical defaults
- tags should be a small lowercase array
- Set recurrence_rule to null unless the request clearly implies repetition
- If recurrence_rule is needed, use JSON like {"freq":"weekly","interval":1,"days":["mon"]}
- Return valid JSON only`
      : `You are designing a reusable project template for an ADHD-friendly productivity app.

User request: "${description}"
${buildTemplateContext(recentTasks)}

Return ONLY JSON for a project template draft. Do not save anything or include explanations.
{
  "name": "Project template name",
  "description": "What this template is for",
  "icon": "Folder",
  "ai_generated": true,
  "tasks": [
    {
      "title": "First task",
      "description": "Helpful details",
      "est_minutes": 30,
      "priority": 3,
      "urgency": 3,
      "sort_order": 0
    }
  ]
}

Rules:
- Create 3-8 tasks unless the request clearly needs fewer
- Order tasks logically using sort_order starting at 0
- Keep tasks concrete and actionable
- Use a simple icon name string
- Return valid JSON only`;

    const template = await chatJson({ prompt, temperature: 0.5, max_tokens: 1800 });
    res.json({ template });
  } catch (error) {
    console.error('Generate template error:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

router.post('/refine-template', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { template, instruction } = req.body;

    if (!template || typeof template !== 'object') {
      return res.status(400).json({ error: 'Template is required' });
    }

    if (!instruction) {
      return res.status(400).json({ error: 'Instruction is required' });
    }

    const type = inferTemplateType(template);
    const { recentTasks } = await getUserContext(user_id);

    const prompt = type === 'task'
      ? `You are refining a task template draft for an ADHD-friendly productivity app.

Current template:
${JSON.stringify(template, null, 2)}

User instruction: "${instruction}"
${buildTemplateContext(recentTasks)}

Return ONLY valid JSON for the updated task template using this shape:
{
  "name": "Short template name",
  "title": "Specific task title",
  "description": "Helpful details",
  "est_minutes": 30,
  "priority": 3,
  "urgency": 3,
  "tags": ["tag1", "tag2"],
  "recurrence_rule": null,
  "ai_generated": true
}

Rules:
- Apply the user's instruction while preserving useful existing details
- Keep recurrence_rule as valid JSON or null
- Return JSON only`
      : `You are refining a project template draft for an ADHD-friendly productivity app.

Current template:
${JSON.stringify(template, null, 2)}

User instruction: "${instruction}"
${buildTemplateContext(recentTasks)}

Return ONLY valid JSON for the updated project template using this shape:
{
  "name": "Project template name",
  "description": "What this template is for",
  "icon": "Folder",
  "ai_generated": true,
  "tasks": [
    {
      "title": "First task",
      "description": "Helpful details",
      "est_minutes": 30,
      "priority": 3,
      "urgency": 3,
      "sort_order": 0
    }
  ]
}

Rules:
- Apply the user's instruction while preserving the intent of the template
- Keep tasks ordered logically with sort_order
- Return JSON only`;

    const refined = await chatJson({ prompt, temperature: 0.4, max_tokens: 1800 });
    res.json({ template: refined });
  } catch (error) {
    console.error('Refine template error:', error);
    res.status(500).json({ error: 'Failed to refine template' });
  }
});

// --- AI Chat Assistant ---

async function getFullUserContext(userId) {
  const [tasksResult, projectsResult, blocksResult, sessionsResult] = await Promise.all([
    query(`
      SELECT t.id, t.title, t.description, t.status, t.priority, t.urgency, t.est_minutes, t.due_at, p.title as project_title
      FROM tasks t JOIN projects p ON t.project_id = p.id
      WHERE p.user_id = $1 AND t.status != 'done'
      ORDER BY COALESCE(t.due_at, '2999-01-01') ASC, t.priority DESC, t.urgency DESC
      LIMIT 30
    `, [userId]),
    query('SELECT id, title, description FROM projects WHERE user_id = $1 ORDER BY created_at DESC LIMIT 15', [userId]),
    query(`SELECT title, starts_at, ends_at, recurrence_rule FROM time_blocks WHERE user_id = $1`, [userId]),
    query(`
      SELECT s.duration_minutes, s.actual_duration_minutes, s.self_rating, s.started_at, t.title as task_title
      FROM sessions s LEFT JOIN tasks t ON s.task_id = t.id
      WHERE s.user_id = $1 AND s.completed = true
      ORDER BY s.started_at DESC LIMIT 10
    `, [userId])
  ]);

  const now = new Date();
  const taskList = tasksResult.rows.map(t => {
    const due = t.due_at ? `due ${new Date(t.due_at).toLocaleString()}` : 'no deadline';
    return `- [${t.status}] "${t.title}" (P${t.priority}/U${t.urgency}, ${t.est_minutes}min, ${due}, project: ${t.project_title})`;
  }).join('\n');

  const projectList = projectsResult.rows.map(p => `- "${p.title}": ${p.description || 'No description'}`).join('\n');

  const scheduleList = blocksResult.rows.map(b => {
    const rule = b.recurrence_rule;
    const days = rule?.days ? rule.days.join(', ') : 'one-time';
    const start = new Date(b.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const end = new Date(b.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `- "${b.title}" ${start}-${end} (${days})`;
  }).join('\n');

  const sessionHistory = sessionsResult.rows.map(s =>
    `- ${s.task_title || 'Unnamed'}: planned ${s.duration_minutes}min, actual ${s.actual_duration_minutes || '?'}min, rating ${s.self_rating || '?'}/10`
  ).join('\n');

  return { taskList, projectList, scheduleList, sessionHistory, now: now.toISOString(), projects: projectsResult.rows };
}

router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { message, conversation_id } = req.body;

    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

    const { taskList, projectList, scheduleList, sessionHistory, now, projects } = await getFullUserContext(user_id);

    // Load or create conversation
    let conversation;
    if (conversation_id) {
      const convResult = await query('SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2', [conversation_id, user_id]);
      conversation = convResult.rows[0];
    }

    const prevMessages = conversation?.messages || [];
    const historyContext = prevMessages.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n');

    const systemPrompt = `You are MindSprint AI — a smart productivity assistant for an ADHD-friendly task management app. Today is ${now}.

CURRENT TASKS:
${taskList || 'No tasks yet.'}

PROJECTS:
${projectList || 'No projects yet.'}

SCHEDULE (blocked time):
${scheduleList || 'No blocked time set.'}

RECENT SESSIONS:
${sessionHistory || 'No session history.'}

${historyContext ? `CONVERSATION HISTORY:\n${historyContext}\n` : ''}

You can perform ACTIONS by including a JSON block in your response wrapped in <action>...</action> tags. Available actions:

1. Create a task:
<action>{"type":"create_task","title":"...","description":"...","est_minutes":30,"priority":3,"urgency":3,"due_at":"ISO date or null","project_title":"existing project name or null"}</action>

2. Update a task:
<action>{"type":"update_task","task_title":"exact existing task title","updates":{"status":"done","priority":4,"due_at":"ISO date"}}</action>

3. Block out time on the schedule:
<action>{"type":"create_time_block","title":"...","date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","recurrence_days":["mon","wed","fri"] or null}</action>

4. Plan the day — suggest an ordered schedule of tasks to work on:
<action>{"type":"plan_day"}</action>

RULES:
- Be concise and helpful. Use short paragraphs, not walls of text.
- When the user asks to create a task, extract all details and create it. Confirm what you created.
- When asked "what should I work on" or "plan my day", consider deadlines, priority, urgency, estimated time, blocked time, and recent session patterns.
- For day planning, account for the user's blocked time and suggest realistic scheduling.
- Tasks can be interleaved (pomodoro style) — the user can work on bits of tasks, so you don't need contiguous time blocks.
- You can include multiple <action> tags in one response.
- If unsure about details, make reasonable assumptions and note them.
- Never ask the user personal/identity questions. Learn from their data.`;

    const { getOpenAI } = require('../config/openai');
    const completion = await getOpenAI().chat.completions.create({
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.5,
      max_tokens: 2000
    });

    const aiResponse = completion.choices[0].message.content;

    // Execute any actions
    const actionMatches = aiResponse.match(/<action>([\s\S]*?)<\/action>/g) || [];
    const executedActions = [];

    for (const match of actionMatches) {
      try {
        const json = match.replace(/<\/?action>/g, '').trim();
        const action = JSON.parse(json);

        if (action.type === 'create_task') {
          let projectId = null;
          if (action.project_title) {
            const proj = projects.find(p => p.title.toLowerCase() === action.project_title.toLowerCase());
            if (proj) projectId = proj.id;
          }
          if (!projectId) {
            const personal = await query("SELECT id FROM projects WHERE user_id = $1 AND title = 'Personal Tasks'", [user_id]);
            if (personal.rows.length > 0) {
              projectId = personal.rows[0].id;
            } else {
              const np = await query("INSERT INTO projects (user_id, title, description) VALUES ($1, 'Personal Tasks', 'Personal tasks') RETURNING id", [user_id]);
              projectId = np.rows[0].id;
            }
          }

          const taskResult = await query(`
            INSERT INTO tasks (project_id, title, description, priority, urgency, est_minutes, due_at, original_title, original_description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
          `, [
            projectId, action.title, action.description || '', action.priority || 3, action.urgency || 3,
            action.est_minutes || 30, action.due_at || null, action.title, action.description || ''
          ]);

          const task = taskResult.rows[0];

          // Auto-create reminders if due_at set
          if (action.due_at) {
            const dueDate = new Date(action.due_at);
            const estMin = action.est_minutes || 30;
            const reminders = [];
            const nowD = new Date();
            const startBy = new Date(dueDate.getTime() - (estMin + 30) * 60000);
            if (startBy > nowD) reminders.push(startBy);
            const fifteenBefore = new Date(dueDate.getTime() - 15 * 60000);
            if (fifteenBefore > nowD && fifteenBefore.getTime() !== startBy.getTime()) reminders.push(fifteenBefore);

            for (const remindAt of reminders) {
              for (const channel of ['in_app', 'slack']) {
                await query('INSERT INTO reminders (task_id, user_id, remind_at, channel) VALUES ($1, $2, $3, $4)',
                  [task.id, user_id, remindAt, channel]);
              }
            }
          }

          executedActions.push({ type: 'create_task', task });
        } else if (action.type === 'update_task') {
          if (action.task_title) {
            const taskMatch = await query(`
              SELECT t.id FROM tasks t JOIN projects p ON t.project_id = p.id
              WHERE p.user_id = $1 AND LOWER(t.title) = LOWER($2) AND t.status != 'done' LIMIT 1
            `, [user_id, action.task_title]);

            if (taskMatch.rows.length > 0) {
              const updates = action.updates || {};
              const fields = [];
              const vals = [];
              let idx = 1;
              for (const [key, val] of Object.entries(updates)) {
                if (['status', 'priority', 'urgency', 'est_minutes', 'due_at', 'title', 'description'].includes(key)) {
                  fields.push(`${key} = $${idx++}`);
                  vals.push(val);
                }
              }
              if (fields.length > 0) {
                fields.push('updated_at = NOW()');
                vals.push(taskMatch.rows[0].id);
                await query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx}`, vals);
                executedActions.push({ type: 'update_task', task_id: taskMatch.rows[0].id });
              }
            }
          }
        } else if (action.type === 'create_time_block') {
          const date = action.date || new Date().toISOString().slice(0, 10);
          const startsAt = `${date}T${action.start_time || '09:00'}:00`;
          const endsAt = `${date}T${action.end_time || '17:00'}:00`;
          const recRule = action.recurrence_days?.length > 0
            ? JSON.stringify({ freq: 'weekly', interval: 1, days: action.recurrence_days })
            : null;

          const blockResult = await query(
            `INSERT INTO time_blocks (user_id, title, starts_at, ends_at, recurrence_rule)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [user_id, action.title || 'Busy', startsAt, endsAt, recRule]
          );
          executedActions.push({ type: 'create_time_block', block: blockResult.rows[0] });
        } else if (action.type === 'plan_day') {
          executedActions.push({ type: 'plan_day' });
        }
      } catch (actionErr) {
        console.error('Action execution error:', actionErr);
      }
    }

    // Clean response text (strip action tags for display)
    const cleanResponse = aiResponse.replace(/<action>[\s\S]*?<\/action>/g, '').trim();

    // Save conversation
    const newMessages = [
      ...prevMessages,
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'assistant', content: cleanResponse, actions: executedActions, timestamp: new Date().toISOString() }
    ];

    let convId;
    if (conversation) {
      await query('UPDATE ai_conversations SET messages = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(newMessages), conversation.id]);
      convId = conversation.id;
    } else {
      const convResult = await query(
        'INSERT INTO ai_conversations (user_id, title, messages) VALUES ($1, $2, $3) RETURNING id',
        [user_id, message.slice(0, 100), JSON.stringify(newMessages)]
      );
      convId = convResult.rows[0].id;
    }

    res.json({
      response: cleanResponse,
      actions: executedActions,
      conversation_id: convId
    });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// Get conversation history
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const result = await query(
      'SELECT id, title, created_at, updated_at FROM ai_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20',
      [user_id]
    );
    res.json({ conversations: result.rows });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

router.get('/conversations/:id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const result = await query('SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2', [req.params.id, user_id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

module.exports = router;
