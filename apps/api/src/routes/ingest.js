const express = require('express');
const multer = require('multer');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { addIngestJob } = require('../services/queue');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

router.post('/text', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const result = await query(`
      INSERT INTO ingests (user_id, content, content_type, status)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, content_type, status, created_at
    `, [user_id, content, 'text', 'queued']);

    const ingest = result.rows[0];

    await addIngestJob({
      ingestId: ingest.id,
      userId: user_id,
      contentType: 'text'
    });

    res.status(201).json({
      ingest,
      message: 'Text queued for processing'
    });
  } catch (error) {
    console.error('Ingest text error:', error);
    res.status(500).json({ error: 'Failed to queue text for processing' });
  }
});

router.post('/screenshot', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { user_id } = req.user;

    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const imageBase64 = req.file.buffer.toString('base64');

    const result = await query(`
      INSERT INTO ingests (user_id, content, content_type, status)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, content_type, status, created_at
    `, [user_id, imageBase64, 'screenshot', 'queued']);

    const ingest = result.rows[0];

    await addIngestJob({
      ingestId: ingest.id,
      userId: user_id,
      contentType: 'screenshot'
    });

    res.status(201).json({
      ingest,
      message: 'Screenshot queued for processing'
    });
  } catch (error) {
    console.error('Ingest screenshot error:', error);
    res.status(500).json({ error: 'Failed to queue screenshot for processing' });
  }
});

router.get('/status/:id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;

    const result = await query(
      `SELECT id, user_id, content_type, status, result, error_message, created_at, processed_at
       FROM ingests WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ingest not found' });
    }

    res.json({ ingest: result.rows[0] });
  } catch (error) {
    console.error('Get ingest status error:', error);
    res.status(500).json({ error: 'Failed to get ingest status' });
  }
});

module.exports = router;
