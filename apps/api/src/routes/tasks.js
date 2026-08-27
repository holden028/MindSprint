const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { assertTaskOwner, patchRow } = require('../utils/dbHelpers');
const { assertTaskAccess, taskVisibleSql, taskAccessSelectSql, withTaskAccessFlags } = require('../utils/access');
const { parseLimit, parseOffset } = require('../utils/pagination');
const { updatePriorities } = require('../services/priorities');
const { createAutoReminders, syncTaskReminders } = require('../services/reminders');
const { normalizeEmail, assignTask } = require('../services/sharing');
const { postTaskToProjectChannel } = require('../services/slackNotify');
const { evaluateAchievements } = require('../services/achievements');
const { withWorkMode, buildAiInterpretations } = require('../utils/taskWorkMode');

const router = express.Router();

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

// Get tasks for user (optional project_id filter)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { project_id } = req.query;
    const limit = parseLimit(req.query.limit, { defaultValue: 100, max: 200 });
    const offset = parseOffset(req.query.offset);

    const params = [user_id];
    let where = `WHERE ${taskVisibleSql('$1')}`;

    if (project_id) {
      params.push(project_id);
      where += ` AND t.project_id = $${params.length}`;
    }

    params.push(limit, offset);

    const result = await query(`
      SELECT
        t.*,
        p.title as project_title,
        ${taskAccessSelectSql('$1')}
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN users owner ON p.user_id = owner.id
      LEFT JOIN users assignee ON t.assignee_user_id = assignee.id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({ tasks: result.rows.map((row) => withWorkMode(withTaskAccessFlags(row))), limit, offset });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

// Create new task
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { title, description, project_id, priority = 3, urgency = 3, est_minutes = 30, recurrence_rule, is_recurring, due_at } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    let projectId = project_id;

    if (!projectId) {
      const personalProject = await query(
        'SELECT id FROM projects WHERE user_id = $1 AND title = $2',
        [user_id, 'Personal Tasks']
      );

      if (personalProject.rows.length === 0) {
        const newProject = await query(
          'INSERT INTO projects (user_id, title, description) VALUES ($1, $2, $3) RETURNING id',
          [user_id, 'Personal Tasks', 'Personal tasks not assigned to a specific project']
        );
        projectId = newProject.rows[0].id;
      } else {
        projectId = personalProject.rows[0].id;
      }
    }

    const projectCheck = await query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, user_id]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Project not found or access denied' });
    }

    let nextOccurrence = null;
    if (is_recurring && recurrence_rule) {
      nextOccurrence = computeNextOccurrence(recurrence_rule);
    }

    const result = await query(`
      INSERT INTO tasks (project_id, title, description, priority, urgency, est_minutes, original_title, original_description, recurrence_rule, is_recurring, next_occurrence, due_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [projectId, title, description, priority, urgency, est_minutes, title, description, recurrence_rule ? JSON.stringify(recurrence_rule) : null, !!is_recurring, nextOccurrence, due_at || null]);

    const task = result.rows[0];
    const aiInterpretations = buildAiInterpretations(task.ai_interpretations, task);
    if (!task.ai_interpretations) {
      await query(
        'UPDATE tasks SET ai_interpretations = $1 WHERE id = $2',
        [JSON.stringify(aiInterpretations), task.id]
      );
      task.ai_interpretations = aiInterpretations;
    }
    res.status(201).json({ task: withWorkMode(task) });

    // Auto-create dual-channel reminders when due_at is set
    if (due_at) {
      createAutoReminders(user_id, task.id, new Date(due_at), est_minutes).catch(err =>
        console.error('Failed to create auto-reminders:', err)
      );
    }

    postTaskToProjectChannel({
      projectId,
      ownerUserId: user_id,
      text: `New task: *${task.title}*${due_at ? ` · due ${new Date(due_at).toLocaleString()}` : ''}`,
      taskId: task.id,
      event: 'Created'
    }).catch(() => {});

    updatePriorities(user_id, {
      trigger_type: 'task_added',
      trigger_data: { task_id: task.id, title: task.title }
    }).catch((error) => {
      console.error('Failed to trigger priority update:', error);
    });
  } catch (error) {
    console.error('Create task error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create task' });
    }
  }
});

async function updateTask(req, res) {
  try {
    const { user_id } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const access = await assertTaskAccess(res, id, user_id, { requireEdit: true });
    if (!access) return;

    if (updates.assignee_email !== undefined) {
      if (!access.is_owner) {
        return res.status(403).json({ error: 'Only the owner can assign this task' });
      }
      const email = updates.assignee_email ? normalizeEmail(updates.assignee_email) : null;
      if (email && !email.includes('@')) {
        return res.status(400).json({ error: 'A valid assignee email is required' });
      }
      const assigned = await assignTask({
        ownerId: user_id,
        ownerEmail: req.user.email,
        taskId: id,
        projectId: access.project_id,
        email
      });
      delete updates.assignee_email;
      if (Object.keys(updates).length === 0) {
        return res.json({
          task: assigned.task,
          pending: assigned.pending,
          message: assigned.pending
            ? 'Assigned. They will get reminders after they sign up.'
            : 'Assigned.'
        });
      }
    }

    const allowedFields = [
      'title', 'description', 'status', 'priority', 'urgency', 'est_minutes',
      'actual_minutes', 'actual_time_accuracy', 'due_at', 'is_recurring', 'recurrence_rule'
    ];

    // Compute next_occurrence when recurrence changes
    if (updates.is_recurring && updates.recurrence_rule) {
      updates.next_occurrence = computeNextOccurrence(
        typeof updates.recurrence_rule === 'string'
          ? JSON.parse(updates.recurrence_rule)
          : updates.recurrence_rule
      );
      allowedFields.push('next_occurrence');
    } else if (updates.is_recurring === false) {
      updates.next_occurrence = null;
      updates.recurrence_rule = null;
      allowedFields.push('next_occurrence');
    }

    if (updates.recurrence_rule && typeof updates.recurrence_rule === 'object') {
      updates.recurrence_rule = JSON.stringify(updates.recurrence_rule);
    }

    const { updateFields, values, nextParam } = patchRow(updates, allowedFields);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updateFields.push('updated_at = NOW()');
    values.push(id);

    const result = await query(`
      UPDATE tasks
      SET ${updateFields.join(', ')}
      WHERE id = $${nextParam}
      RETURNING *
    `, values);

    const task = result.rows[0];
    res.json({ task: withWorkMode(task) });

    if (updates.due_at !== undefined) {
      syncTaskReminders(id).catch((err) =>
        console.error('Failed to update auto-reminders:', err)
      );
      if (updates.due_at) {
        postTaskToProjectChannel({
          projectId: task.project_id,
          ownerUserId: access.owner_id || user_id,
          text: `Due updated: *${task.title}* → ${new Date(updates.due_at).toLocaleString()}`,
          taskId: task.id,
          event: 'Due'
        }).catch(() => {});
      }
    }

    if (updates.status === 'done') {
      evaluateAchievements(user_id).catch((err) =>
        console.error('Achievement evaluation failed:', err.message)
      );
      postTaskToProjectChannel({
        projectId: task.project_id,
        ownerUserId: access.owner_id || user_id,
        text: `Done: ~~${task.title}~~`,
        taskId: task.id,
        event: 'Done'
      }).catch(() => {});
    } else if (updates.status === 'doing') {
      postTaskToProjectChannel({
        projectId: task.project_id,
        ownerUserId: access.owner_id || user_id,
        text: `In progress: *${task.title}*`,
        taskId: task.id,
        event: 'Doing'
      }).catch(() => {});
    }
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
}

router.post('/:id/assign', authenticateToken, async (req, res) => {
  try {
    const { user_id, email: ownerEmail } = req.user;
    const { id } = req.params;
    const access = await assertTaskOwner(res, id, user_id);
    if (!access) return;

    const raw = req.body?.email ?? req.body?.assignee_email;
    const email = raw ? normalizeEmail(raw) : null;
    if (email && !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (email && ownerEmail && email === normalizeEmail(ownerEmail)) {
      return res.status(400).json({ error: 'Assign someone else — you already own this task' });
    }

    const assigned = await assignTask({
      ownerId: user_id,
      ownerEmail,
      taskId: id,
      projectId: access.project_id,
      email
    });

    res.json({
      task: {
        ...assigned.task,
        assignee_email: assigned.task.assignee_email || assigned.share?.invitee_email || null,
        is_owner: true,
        can_edit: true,
        can_delete: true,
        is_shared: false
      },
      share: assigned.share,
      pending: assigned.pending,
      message: email
        ? (assigned.pending
          ? `Assigned. They will get reminders after they sign up with ${email}.`
          : 'Assigned. They get the reminder ladder; you get morning and evening roundups.')
        : 'Assignee cleared.'
    });
  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({ error: 'Failed to assign task' });
  }
});

router.patch('/:id', authenticateToken, updateTask);
router.put('/:id', authenticateToken, updateTask);

// Delete task
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;

    const owned = await assertTaskOwner(res, id, user_id);
    if (!owned) return;

    await query('DELETE FROM tasks WHERE id = $1', [id]);

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Update task estimate accuracy (for learning)
router.post('/update-estimate-accuracy', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { task_id, estimated_minutes, actual_accuracy } = req.body;

    const owned = await assertTaskOwner(res, task_id, user_id);
    if (!owned) return;

    await query(`
      INSERT INTO task_estimate_accuracy (task_id, estimated_minutes, actual_accuracy, user_id)
      VALUES ($1, $2, $3, $4)
    `, [task_id, estimated_minutes, actual_accuracy, user_id]);

    res.json({ message: 'Estimate accuracy recorded' });
  } catch (error) {
    console.error('Update estimate accuracy error:', error);
    res.status(500).json({ error: 'Failed to update estimate accuracy' });
  }
});

module.exports = router;
