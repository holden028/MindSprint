const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { chatJson } = require('../config/openai');

const router = express.Router();

const ALLOWED_ICONS = [
  'Coffee', 'Library', 'Home', 'Trees', 'Waves', 'Moon', 'Sun', 'Music',
  'Headphones', 'BookOpen', 'Laptop', 'Dumbbell', 'Mountain', 'Flame',
  'Building2', 'Tent', 'Heart', 'Star', 'Zap', 'Target', 'Lamp', 'Sofa',
  'Palmtree', 'Snowflake', 'Settings'
];

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;

    const result = await query(`
      SELECT id, name, description, icon_name, created_at
      FROM custom_environments
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [user_id]);

    res.json({ environments: result.rows });
  } catch (error) {
    console.error('Get custom environments error:', error);
    res.status(500).json({ error: 'Failed to get custom environments' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { name, description } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Environment name is required' });
    }

    const sanitizedName = name.trim().substring(0, 100);
    const sanitizedDescription = description ? description.trim().substring(0, 500) : null;

    const maliciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i,
      /expression\s*\(/i,
      /url\s*\(/i
    ];
    if (maliciousPatterns.some((pattern) => pattern.test(sanitizedName) || (sanitizedDescription && pattern.test(sanitizedDescription)))) {
      return res.status(400).json({ error: 'Invalid characters detected in environment name or description' });
    }

    let iconName = 'Settings';

    try {
      const parsed = await chatJson({
        prompt: `Suggest one Lucide icon name for this focus environment.
Environment: "${sanitizedName}"
Description: "${sanitizedDescription || 'No description'}"
Choose ONLY from: ${ALLOWED_ICONS.join(', ')}
Return JSON: {"icon":"Coffee"}`,
        temperature: 0.3,
        max_tokens: 50
      });
      if (parsed && ALLOWED_ICONS.includes(parsed.icon)) {
        iconName = parsed.icon;
      }
    } catch (aiError) {
      console.error('AI icon generation failed:', aiError);
    }

    const existing = await query(
      'SELECT id FROM custom_environments WHERE user_id = $1 AND name = $2',
      [user_id, sanitizedName]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Environment with this name already exists' });
    }

    const result = await query(`
      INSERT INTO custom_environments (user_id, name, description, icon_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, description, icon_name, created_at
    `, [user_id, sanitizedName, sanitizedDescription, iconName]);

    res.json({ environment: result.rows[0] });
  } catch (error) {
    console.error('Create custom environment error:', error);
    res.status(500).json({ error: 'Failed to create custom environment' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;

    const result = await query(`
      DELETE FROM custom_environments
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [id, user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    res.json({ message: 'Environment deleted successfully' });
  } catch (error) {
    console.error('Delete custom environment error:', error);
    res.status(500).json({ error: 'Failed to delete custom environment' });
  }
});

module.exports = router;
