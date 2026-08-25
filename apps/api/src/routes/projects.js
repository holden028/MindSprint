const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { patchRow } = require('../utils/dbHelpers');
const { parseLimit, parseOffset } = require('../utils/pagination');
const { projectVisibleSql, getProjectAccess } = require('../utils/access');

const router = express.Router();

// Get all projects for user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const limit = parseLimit(req.query.limit, { defaultValue: 100, max: 200 });
    const offset = parseOffset(req.query.offset);

    const result = await query(`
      SELECT
        p.*,
        owner.email as owner_email,
        (p.user_id != $1) as is_shared,
        COUNT(t.id) as task_count,
        COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks
      FROM projects p
      JOIN users owner ON p.user_id = owner.id
      LEFT JOIN tasks t ON p.id = t.project_id
      WHERE ${projectVisibleSql('$1')}
      GROUP BY p.id, owner.email
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `, [user_id, limit, offset]);

    res.json({ projects: result.rows, limit, offset });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to load projects' });
  }
});

// Create new project
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { title, description, tags = [] } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await query(`
      INSERT INTO projects (user_id, title, description, tags)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [user_id, title, description, tags]);

    res.status(201).json({ project: result.rows[0] });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const access = await getProjectAccess(id, user_id);
    if (!access) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (!access.is_owner) {
      return res.status(403).json({ error: 'Only the owner can edit this project' });
    }

    const allowedFields = ['title', 'description', 'tags', 'ai_analysis', 'slack_channel_id', 'slack_channel_name'];
    const { updateFields, values, nextParam } = patchRow(updates, allowedFields);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updateFields.push('updated_at = NOW()');
    values.push(id);

    const result = await query(`
      UPDATE projects
      SET ${updateFields.join(', ')}
      WHERE id = $${nextParam}
      RETURNING *
    `, values);

    res.json({ project: result.rows[0] });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;

    const access = await getProjectAccess(id, user_id);
    if (!access) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (!access.is_owner) {
      return res.status(403).json({ error: 'Only the owner can delete this project' });
    }

    await query('DELETE FROM projects WHERE id = $1', [id]);

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

module.exports = router;
