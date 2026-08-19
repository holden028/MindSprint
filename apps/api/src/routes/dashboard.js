const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get dashboard data
router.get('/today', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;

    const [tasksResult, projectsResult] = await Promise.all([
      query(`
        SELECT
          t.*,
          p.title as project_title,
          p.description as project_description
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE p.user_id = $1
        ORDER BY
          CASE t.status
            WHEN 'todo' THEN 1
            WHEN 'doing' THEN 2
            WHEN 'done' THEN 3
          END,
          t.priority DESC,
          t.created_at ASC
        LIMIT 20
      `, [user_id]),
      query(`
        SELECT
          p.*,
          COUNT(t.id) as task_count,
          COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id
        WHERE p.user_id = $1
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `, [user_id])
    ]);

    res.json({
      tasks: tasksResult.rows,
      projects: projectsResult.rows
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// Get specific project
router.get('/projects/:projectId', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { projectId } = req.params;

    const result = await query(`
      SELECT
        p.*,
        COUNT(t.id) as task_count,
        COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id
      WHERE p.id = $1 AND p.user_id = $2
      GROUP BY p.id
    `, [projectId, user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ project: result.rows[0] });
  } catch (error) {
    console.error('Project error:', error);
    res.status(500).json({ error: 'Failed to load project' });
  }
});

module.exports = router;
