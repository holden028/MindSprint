const express = require('express');
const multer = require('multer');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { getTaskAccess, assertTaskAccess, getProjectAccess } = require('../utils/access');
const { saveFile, deleteFile, getAbsolutePath, MAX_UPLOAD_BYTES } = require('../services/storage');
const { summarizeAttachment } = require('../services/attachmentSummaries');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES }
});

function attachmentRow(row) {
  return {
    id: row.id,
    filename: row.filename,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes),
    task_id: row.task_id,
    project_id: row.project_id,
    ai_summary: row.ai_summary,
    created_at: row.created_at
  };
}

async function assertAttachmentAccess(userId, attachment) {
  if (attachment.user_id === userId) return { can_view: true, can_edit: true, can_delete: true };

  if (attachment.task_id) {
    const access = await getTaskAccess(attachment.task_id, userId);
    if (access) {
      return {
        can_view: true,
        can_edit: access.can_edit,
        can_delete: access.can_delete
      };
    }
  }

  if (attachment.project_id) {
    const access = await getProjectAccess(attachment.project_id, userId);
    if (access) {
      return {
        can_view: true,
        can_edit: access.can_edit,
        can_delete: access.can_delete
      };
    }
  }

  return null;
}

async function getAttachmentById(id) {
  const result = await query('SELECT * FROM attachments WHERE id = $1', [id]);
  return result.rows[0] || null;
}

router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { user_id } = req.user;
    const { task_id, project_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    if (task_id && project_id) {
      return res.status(400).json({ error: 'Attach to either a task or a project, not both' });
    }

    if (task_id) {
      const access = await assertTaskAccess(res, task_id, user_id, { requireEdit: true });
      if (!access) return;
    }

    if (project_id) {
      const access = await getProjectAccess(project_id, user_id);
      if (!access) {
        return res.status(404).json({ error: 'Project not found' });
      }
      if (!access.can_edit) {
        return res.status(403).json({ error: 'You cannot add attachments to this project' });
      }
    }

    const saved = saveFile(req.file, user_id);

    const insert = await query(`
      INSERT INTO attachments (user_id, task_id, project_id, filename, mime_type, size_bytes, storage_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      user_id,
      task_id || null,
      project_id || null,
      saved.filename,
      saved.mimeType,
      saved.sizeBytes,
      saved.storageKey
    ]);

    let attachment = insert.rows[0];

    try {
      const aiSummary = await summarizeAttachment({
        mimeType: attachment.mime_type,
        filename: attachment.filename,
        storageKey: attachment.storage_key
      });
      const updated = await query(
        'UPDATE attachments SET ai_summary = $1 WHERE id = $2 RETURNING *',
        [aiSummary, attachment.id]
      );
      attachment = updated.rows[0];
    } catch (err) {
      console.error('Attachment AI summary failed:', err.message);
    }

    res.status(201).json({ attachment: attachmentRow(attachment) });
  } catch (error) {
    console.error('Upload attachment error:', error);
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { task_id, project_id } = req.query;

    if (!task_id && !project_id) {
      return res.status(400).json({ error: 'task_id or project_id is required' });
    }

    if (task_id) {
      const access = await assertTaskAccess(res, task_id, user_id);
      if (!access) return;
    }

    if (project_id) {
      const access = await getProjectAccess(project_id, user_id);
      if (!access) {
        return res.status(404).json({ error: 'Project not found' });
      }
    }

    const params = [];
    let where = '1=1';

    if (task_id) {
      params.push(task_id);
      where += ` AND a.task_id = $${params.length}`;
    }

    if (project_id) {
      params.push(project_id);
      where += ` AND a.project_id = $${params.length}`;
    }

    const result = await query(`
      SELECT a.*
      FROM attachments a
      WHERE ${where}
      ORDER BY a.created_at DESC
    `, params);

    res.json({ attachments: result.rows.map(attachmentRow) });
  } catch (error) {
    console.error('List attachments error:', error);
    res.status(500).json({ error: 'Failed to list attachments' });
  }
});

router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const attachment = await getAttachmentById(req.params.id);

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const access = await assertAttachmentAccess(user_id, attachment);
    if (!access?.can_view) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const absolutePath = getAbsolutePath(attachment.storage_key);
    res.download(absolutePath, attachment.filename, (err) => {
      if (err && !res.headersSent) {
        console.error('Download attachment error:', err);
        res.status(500).json({ error: 'Failed to download attachment' });
      }
    });
  } catch (error) {
    console.error('Download attachment error:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { task_id, project_id } = req.body;
    const attachment = await getAttachmentById(req.params.id);

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (attachment.user_id !== user_id) {
      return res.status(403).json({ error: 'Only the uploader can re-link attachments' });
    }

    if (task_id && project_id) {
      return res.status(400).json({ error: 'Link to either a task or a project, not both' });
    }

    if (task_id) {
      const access = await assertTaskAccess(res, task_id, user_id, { requireEdit: true });
      if (!access) return;
    }

    if (project_id) {
      const access = await getProjectAccess(project_id, user_id);
      if (!access?.can_edit) {
        return res.status(403).json({ error: 'You cannot attach files to this project' });
      }
    }

    const updated = await query(`
      UPDATE attachments
      SET task_id = $1, project_id = $2
      WHERE id = $3 AND user_id = $4
      RETURNING *
    `, [task_id || null, project_id || null, attachment.id, user_id]);

    res.json({ attachment: attachmentRow(updated.rows[0]) });
  } catch (error) {
    console.error('Update attachment error:', error);
    res.status(500).json({ error: 'Failed to update attachment' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const attachment = await getAttachmentById(req.params.id);

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const access = await assertAttachmentAccess(user_id, attachment);
    const isOwner = attachment.user_id === user_id;
    if (!isOwner && !access?.can_delete) {
      return res.status(403).json({ error: 'You cannot delete this attachment' });
    }

    deleteFile(attachment.storage_key);
    await query('DELETE FROM attachments WHERE id = $1', [attachment.id]);

    res.json({ message: 'Attachment deleted' });
  } catch (error) {
    console.error('Delete attachment error:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

module.exports = router;
