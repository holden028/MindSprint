const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { assertTaskOwner, patchRow } = require('../utils/dbHelpers');
const { parseLimit, parseOffset } = require('../utils/pagination');
const { updatePriorities } = require('../services/priorities');

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

async function createAutoReminders(userId, taskId, dueDate, estMinutes = 30) {
  // Delete existing auto-reminders for this task before creating new ones
  await query('DELETE FROM reminders WHERE task_id = $1 AND user_id = $2', [taskId, userId]);

  const reminders = [];
  const now = new Date();

  // Reminder 1: "start by" time = due - est_minutes - 30min buffer
  const startBy = new Date(dueDate.getTime() - (estMinutes + 30) * 60000);
  if (startBy > now) {
    reminders.push(startBy);
  }

  // Reminder 2: 15 min before deadline
  const fifteenBefore = new Date(dueDate.getTime() - 15 * 60000);
  if (fifteenBefore > now && fifteenBefore.getTime() !== startBy.getTime()) {
    reminders.push(fifteenBefore);
  }

  // Reminder 3: morning of due day (9am) if due_at is tomorrow or later
  const dueDay9am = new Date(dueDate);
  dueDay9am.setHours(9, 0, 0, 0);
  if (dueDay9am > now && dueDay9am.getTime() !== startBy.getTime() && dueDay9am.getTime() !== fifteenBefore.getTime()) {
    reminders.push(dueDay9am);
  }

  for (const remindAt of reminders) {
    for (const channel of ['in_app', 'slack']) {
      await query(
        'INSERT INTO reminders (task_id, user_id, remind_at, channel) VALUES ($1, $2, $3, $4)',
        [taskId, userId, remindAt, channel]
      );
    }
  }
}

// Get tasks for user (optional project_id filter)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { project_id } = req.query;
    const limit = parseLimit(req.query.limit, { defaultValue: 100, max: 200 });
    const offset = parseOffset(req.query.offset);

    const params = [user_id];
    let where = 'WHERE p.user_id = $1';

    if (project_id) {
      params.push(project_id);
      where += ` AND t.project_id = $${params.length}`;
    }

    params.push(limit, offset);

    const result = await query(`
      SELECT
        t.*,
        p.title as project_title
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({ tasks: result.rows, limit, offset });
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
    res.status(201).json({ task });

    // Auto-create dual-channel reminders when due_at is set
    if (due_at) {
      createAutoReminders(user_id, task.id, new Date(due_at), est_minutes).catch(err =>
        console.error('Failed to create auto-reminders:', err)
      );
    }

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

    const owned = await assertTaskOwner(res, id, user_id);
    if (!owned) return;

    const allowedFields = ['title', 'description', 'status', 'priority', 'urgency', 'est_minutes', 'actual_minutes', 'actual_time_accuracy', 'due_at'];
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
    res.json({ task });

    // Re-create auto-reminders if due_at changed
    if (updates.due_at !== undefined) {
      const estMin = task.est_minutes || 30;
      if (updates.due_at) {
        createAutoReminders(user_id, id, new Date(updates.due_at), estMin).catch(err =>
          console.error('Failed to update auto-reminders:', err)
        );
      } else {
        query('DELETE FROM reminders WHERE task_id = $1 AND user_id = $2', [id, user_id]).catch(() => {});
      }
    }
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
}

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
