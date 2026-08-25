const express = require('express');
const { query, getClient } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { patchRow } = require('../utils/dbHelpers');

const router = express.Router();

const WEEKDAY_INDEX = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6
};

function normalizeTaskTemplatePayload(body = {}) {
  return {
    name: body.name,
    title: body.title || null,
    description: body.description || null,
    est_minutes: Number.isInteger(body.est_minutes) ? body.est_minutes : 30,
    priority: Number.isInteger(body.priority) ? body.priority : 3,
    urgency: Number.isInteger(body.urgency) ? body.urgency : 3,
    tags: Array.isArray(body.tags) ? body.tags : [],
    recurrence_rule: body.recurrence_rule || null,
    ai_generated: body.ai_generated === true
  };
}

function normalizeProjectTemplatePayload(body = {}) {
  return {
    name: body.name,
    description: body.description || null,
    icon: body.icon || null,
    ai_generated: body.ai_generated === true,
    tasks: Array.isArray(body.tasks) ? body.tasks : []
  };
}

function normalizeProjectTemplateTask(task = {}, index = 0) {
  return {
    title: task.title,
    description: task.description || null,
    est_minutes: Number.isInteger(task.est_minutes) ? task.est_minutes : 30,
    priority: Number.isInteger(task.priority) ? task.priority : 3,
    urgency: Number.isInteger(task.urgency) ? task.urgency : 3,
    sort_order: Number.isInteger(task.sort_order) ? task.sort_order : index
  };
}

function validateTaskTemplatePayload(payload, res) {
  if (!payload.name) {
    res.status(400).json({ error: 'Name is required' });
    return false;
  }

  if (!payload.title) {
    res.status(400).json({ error: 'Title is required' });
    return false;
  }

  return true;
}

function validateProjectTemplatePayload(payload, res) {
  if (!payload.name) {
    res.status(400).json({ error: 'Name is required' });
    return false;
  }

  for (let index = 0; index < payload.tasks.length; index += 1) {
    if (!payload.tasks[index]?.title) {
      res.status(400).json({ error: `Task ${index + 1} title is required` });
      return false;
    }
  }

  return true;
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function computeNextOccurrence(rule, fromDate = new Date()) {
  if (!rule || typeof rule !== 'object' || !rule.freq) {
    return null;
  }

  const base = new Date(fromDate);
  const interval = Math.max(1, Number.parseInt(rule.interval, 10) || 1);

  if (rule.freq === 'daily') {
    const next = new Date(base);
    next.setDate(next.getDate() + interval);
    return next;
  }

  if (rule.freq === 'weekly') {
    const requestedDays = Array.isArray(rule.days) && rule.days.length > 0
      ? rule.days.map((day) => WEEKDAY_INDEX[String(day).toLowerCase()]).filter((day) => day !== undefined)
      : [base.getDay()];
    const startWeek = startOfWeek(base);

    for (let offset = 1; offset <= 366 * 3; offset += 1) {
      const candidate = new Date(base);
      candidate.setDate(candidate.getDate() + offset);

      if (!requestedDays.includes(candidate.getDay())) {
        continue;
      }

      const candidateWeek = startOfWeek(candidate);
      const weekDiff = Math.floor((candidateWeek.getTime() - startWeek.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weekDiff % interval === 0) {
        return candidate;
      }
    }

    return null;
  }

  if (rule.freq === 'monthly') {
    const desiredDay = Math.max(1, Math.min(31, Number.parseInt(rule.day_of_month, 10) || base.getDate()));
    const next = new Date(base);

    for (let step = 0; step < 36; step += interval) {
      const candidate = new Date(base);
      candidate.setMonth(candidate.getMonth() + step);
      candidate.setDate(1);
      candidate.setDate(Math.min(desiredDay, new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()));

      if (candidate > base) {
        return candidate;
      }
    }

    return null;
  }

  if (rule.freq === 'yearly') {
    const targetMonth = Math.max(0, Math.min(11, Number.parseInt(rule.month, 10) - 1 || base.getMonth()));
    const targetDay = Math.max(1, Math.min(31, Number.parseInt(rule.day_of_month, 10) || base.getDate()));

    for (let step = 0; step <= interval * 5; step += interval) {
      const candidate = new Date(base);
      candidate.setFullYear(base.getFullYear() + step);
      candidate.setMonth(targetMonth, 1);
      candidate.setDate(Math.min(targetDay, new Date(candidate.getFullYear(), targetMonth + 1, 0).getDate()));
      if (candidate > base) {
        return candidate;
      }
    }

    return null;
  }

  return null;
}

async function ensurePersonalProject(userId) {
  const personalProject = await query(
    'SELECT id FROM projects WHERE user_id = $1 AND title = $2',
    [userId, 'Personal Tasks']
  );

  if (personalProject.rows.length > 0) {
    return personalProject.rows[0].id;
  }

  const created = await query(
    'INSERT INTO projects (user_id, title, description) VALUES ($1, $2, $3) RETURNING id',
    [userId, 'Personal Tasks', 'Personal tasks not assigned to a specific project']
  );

  return created.rows[0].id;
}

async function getTaskTemplate(userId, templateId) {
  const result = await query(
    'SELECT * FROM task_templates WHERE id = $1 AND user_id = $2',
    [templateId, userId]
  );
  return result.rows[0] || null;
}

async function getProjectTemplate(userId, templateId) {
  const result = await query(`
    SELECT *
    FROM project_templates
    WHERE id = $1 AND user_id = $2
  `, [templateId, userId]);
  return result.rows[0] || null;
}

async function getProjectTemplateTasks(client, templateId) {
  const result = await client.query(`
    SELECT *
    FROM project_template_tasks
    WHERE project_template_id = $1
    ORDER BY sort_order ASC, id ASC
  `, [templateId]);
  return result.rows;
}

router.get('/tasks', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT *
      FROM task_templates
      WHERE user_id = $1
      ORDER BY updated_at DESC, created_at DESC
    `, [req.user.user_id]);

    res.json({ templates: result.rows });
  } catch (error) {
    console.error('Get task templates error:', error);
    res.status(500).json({ error: 'Failed to load task templates' });
  }
});

router.post('/tasks', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const payload = normalizeTaskTemplatePayload(req.body);

    if (!validateTaskTemplatePayload(payload, res)) {
      return;
    }

    const result = await query(`
      INSERT INTO task_templates (
        user_id, name, title, description, est_minutes, priority, urgency, tags, recurrence_rule, ai_generated
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      user_id,
      payload.name,
      payload.title,
      payload.description,
      payload.est_minutes,
      payload.priority,
      payload.urgency,
      payload.tags,
      payload.recurrence_rule,
      payload.ai_generated
    ]);

    res.status(201).json({ template: result.rows[0] });
  } catch (error) {
    console.error('Create task template error:', error);
    res.status(500).json({ error: 'Failed to create task template' });
  }
});

router.put('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;
    const existing = await getTaskTemplate(user_id, id);

    if (!existing) {
      return res.status(404).json({ error: 'Task template not found' });
    }

    const updates = req.body || {};
    const allowedFields = ['name', 'title', 'description', 'est_minutes', 'priority', 'urgency', 'tags', 'recurrence_rule', 'ai_generated'];
    const { updateFields, values, nextParam } = patchRow(updates, allowedFields);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'name') && !updates.name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'title') && !updates.title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    updateFields.push('updated_at = NOW()');
    values.push(id, user_id);

    const result = await query(`
      UPDATE task_templates
      SET ${updateFields.join(', ')}
      WHERE id = $${nextParam} AND user_id = $${nextParam + 1}
      RETURNING *
    `, values);

    res.json({ template: result.rows[0] });
  } catch (error) {
    console.error('Update task template error:', error);
    res.status(500).json({ error: 'Failed to update task template' });
  }
});

router.delete('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const template = await getTaskTemplate(req.user.user_id, req.params.id);

    if (!template) {
      return res.status(404).json({ error: 'Task template not found' });
    }

    await query('DELETE FROM task_templates WHERE id = $1 AND user_id = $2', [req.params.id, req.user.user_id]);
    res.json({ message: 'Task template deleted successfully' });
  } catch (error) {
    console.error('Delete task template error:', error);
    res.status(500).json({ error: 'Failed to delete task template' });
  }
});

router.post('/tasks/:id/use', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const template = await getTaskTemplate(user_id, req.params.id);

    if (!template) {
      return res.status(404).json({ error: 'Task template not found' });
    }

    let projectId = req.body?.project_id || null;

    if (!projectId) {
      projectId = await ensurePersonalProject(user_id);
    } else {
      const projectCheck = await query(
        'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
        [projectId, user_id]
      );

      if (projectCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Project not found or access denied' });
      }
    }

    const recurrenceRule = template.recurrence_rule || null;
    const isRecurring = !!recurrenceRule;
    const nextOccurrence = isRecurring ? computeNextOccurrence(recurrenceRule) : null;

    const result = await query(`
      INSERT INTO tasks (
        project_id, title, description, priority, urgency, est_minutes,
        original_title, original_description, tags, recurrence_rule, is_recurring, next_occurrence
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      projectId,
      template.title,
      template.description,
      template.priority,
      template.urgency,
      template.est_minutes,
      template.title,
      template.description,
      template.tags || [],
      recurrenceRule,
      isRecurring,
      nextOccurrence ? nextOccurrence.toISOString() : null
    ]);

    res.status(201).json({ task: result.rows[0] });
  } catch (error) {
    console.error('Use task template error:', error);
    res.status(500).json({ error: 'Failed to create task from template' });
  }
});

router.get('/projects', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        pt.*,
        COUNT(ptt.id)::int AS task_count
      FROM project_templates pt
      LEFT JOIN project_template_tasks ptt ON ptt.project_template_id = pt.id
      WHERE pt.user_id = $1
      GROUP BY pt.id
      ORDER BY pt.updated_at DESC, pt.created_at DESC
    `, [req.user.user_id]);

    res.json({ templates: result.rows });
  } catch (error) {
    console.error('Get project templates error:', error);
    res.status(500).json({ error: 'Failed to load project templates' });
  }
});

router.post('/projects', authenticateToken, async (req, res) => {
  const client = await getClient();

  try {
    const { user_id } = req.user;
    const payload = normalizeProjectTemplatePayload(req.body);

    if (!validateProjectTemplatePayload(payload, res)) {
      return;
    }

    await client.query('BEGIN');

    const templateResult = await client.query(`
      INSERT INTO project_templates (user_id, name, description, icon, ai_generated)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [user_id, payload.name, payload.description, payload.icon, payload.ai_generated]);

    const template = templateResult.rows[0];
    const createdTasks = [];

    for (let index = 0; index < payload.tasks.length; index += 1) {
      const task = normalizeProjectTemplateTask(payload.tasks[index], index);
      const taskResult = await client.query(`
        INSERT INTO project_template_tasks (
          project_template_id, title, description, est_minutes, priority, urgency, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        template.id,
        task.title,
        task.description,
        task.est_minutes,
        task.priority,
        task.urgency,
        task.sort_order
      ]);
      createdTasks.push(taskResult.rows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({ template: { ...template, tasks: createdTasks, task_count: createdTasks.length } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create project template error:', error);
    res.status(500).json({ error: 'Failed to create project template' });
  } finally {
    client.release();
  }
});

router.put('/projects/:id', authenticateToken, async (req, res) => {
  const client = await getClient();

  try {
    const { user_id } = req.user;
    const { id } = req.params;
    const payload = normalizeProjectTemplatePayload(req.body);

    if (!validateProjectTemplatePayload(payload, res)) {
      return;
    }

    await client.query('BEGIN');

    const templateCheck = await client.query(
      'SELECT * FROM project_templates WHERE id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (templateCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project template not found' });
    }

    const templateResult = await client.query(`
      UPDATE project_templates
      SET name = $1, description = $2, icon = $3, ai_generated = $4, updated_at = NOW()
      WHERE id = $5 AND user_id = $6
      RETURNING *
    `, [payload.name, payload.description, payload.icon, payload.ai_generated, id, user_id]);

    await client.query('DELETE FROM project_template_tasks WHERE project_template_id = $1', [id]);

    const createdTasks = [];
    for (let index = 0; index < payload.tasks.length; index += 1) {
      const task = normalizeProjectTemplateTask(payload.tasks[index], index);
      const taskResult = await client.query(`
        INSERT INTO project_template_tasks (
          project_template_id, title, description, est_minutes, priority, urgency, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        id,
        task.title,
        task.description,
        task.est_minutes,
        task.priority,
        task.urgency,
        task.sort_order
      ]);
      createdTasks.push(taskResult.rows[0]);
    }

    await client.query('COMMIT');
    res.json({ template: { ...templateResult.rows[0], tasks: createdTasks, task_count: createdTasks.length } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update project template error:', error);
    res.status(500).json({ error: 'Failed to update project template' });
  } finally {
    client.release();
  }
});

router.delete('/projects/:id', authenticateToken, async (req, res) => {
  try {
    const template = await getProjectTemplate(req.user.user_id, req.params.id);

    if (!template) {
      return res.status(404).json({ error: 'Project template not found' });
    }

    await query('DELETE FROM project_templates WHERE id = $1 AND user_id = $2', [req.params.id, req.user.user_id]);
    res.json({ message: 'Project template deleted successfully' });
  } catch (error) {
    console.error('Delete project template error:', error);
    res.status(500).json({ error: 'Failed to delete project template' });
  }
});

router.post('/projects/:id/use', authenticateToken, async (req, res) => {
  const client = await getClient();

  try {
    const { user_id } = req.user;
    const { id } = req.params;

    await client.query('BEGIN');

    const templateResult = await client.query(
      'SELECT * FROM project_templates WHERE id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (templateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project template not found' });
    }

    const template = templateResult.rows[0];
    const templateTasks = await getProjectTemplateTasks(client, id);

    const projectResult = await client.query(`
      INSERT INTO projects (user_id, title, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [user_id, template.name, template.description]);

    const project = projectResult.rows[0];
    const createdTasks = [];

    for (const templateTask of templateTasks) {
      const taskResult = await client.query(`
        INSERT INTO tasks (
          project_id, title, description, priority, urgency, est_minutes, original_title, original_description
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        project.id,
        templateTask.title,
        templateTask.description,
        templateTask.priority,
        templateTask.urgency,
        templateTask.est_minutes,
        templateTask.title,
        templateTask.description
      ]);
      createdTasks.push(taskResult.rows[0]);
    }

    await client.query('COMMIT');

    let linkedProject = project;
    try {
      const { ensureSlackChannelForProject } = require('../services/slackNotify');
      linkedProject = await ensureSlackChannelForProject(project, user_id);
    } catch (err) {
      console.error('Slack channel for template project failed:', err.message);
    }

    res.status(201).json({ project: linkedProject, tasks: createdTasks });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Use project template error:', error);
    res.status(500).json({ error: 'Failed to create project from template' });
  } finally {
    client.release();
  }
});

module.exports = router;
