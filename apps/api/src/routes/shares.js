const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { getTaskAccess, getProjectAccess, bindSharesForUser } = require('../utils/access');
const {
  normalizeEmail,
  notifyInvitee,
  upsertShare,
  loadShareById,
  loadOverrides
} = require('../services/sharing');

const router = express.Router();

async function attachOverrides(shares) {
  const projectShares = shares.filter((s) => s.project_id);
  if (projectShares.length === 0) {
    return shares.map((s) => ({ ...s, overrides: [] }));
  }
  const ids = projectShares.map((s) => s.id);
  const result = await query(
    `SELECT o.share_id, o.task_id, o.role, t.title as task_title
     FROM share_task_overrides o
     JOIN tasks t ON t.id = o.task_id
     WHERE o.share_id = ANY($1::uuid[])`,
    [ids]
  );
  const byShare = {};
  for (const row of result.rows) {
    if (!byShare[row.share_id]) byShare[row.share_id] = [];
    byShare[row.share_id].push({
      task_id: row.task_id,
      role: row.role,
      task_title: row.task_title
    });
  }
  return shares.map((s) => ({ ...s, overrides: byShare[s.id] || [] }));
}

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { task_id, project_id } = req.query;

    let outgoingWhere = 's.owner_id = $1 AND s.status != \'revoked\'';
    const outgoingParams = [user_id];
    if (task_id) {
      outgoingParams.push(task_id);
      outgoingWhere += ` AND s.task_id = $${outgoingParams.length}`;
    }
    if (project_id) {
      outgoingParams.push(project_id);
      outgoingWhere += ` AND s.project_id = $${outgoingParams.length}`;
    }

    const outgoing = await query(
      `SELECT s.*, t.title as task_title, p.title as project_title,
              u.email as invitee_account_email
       FROM shares s
       LEFT JOIN tasks t ON s.task_id = t.id
       LEFT JOIN projects p ON COALESCE(s.project_id, t.project_id) = p.id
       LEFT JOIN users u ON s.invitee_user_id = u.id
       WHERE ${outgoingWhere}
       ORDER BY s.created_at DESC`,
      outgoingParams
    );
    const incoming = await query(
      `SELECT s.*, t.title as task_title, p.title as project_title,
              owner.email as owner_email
       FROM shares s
       LEFT JOIN tasks t ON s.task_id = t.id
       LEFT JOIN projects p ON COALESCE(s.project_id, t.project_id) = p.id
       JOIN users owner ON s.owner_id = owner.id
       WHERE s.invitee_user_id = $1 AND s.status = 'accepted'
       ORDER BY s.created_at DESC`,
      [user_id]
    );
    res.json({
      outgoing: await attachOverrides(outgoing.rows),
      incoming: await attachOverrides(incoming.rows)
    });
  } catch (error) {
    console.error('List shares error:', error);
    res.status(500).json({ error: 'Failed to load shares' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { user_id, email: ownerEmail } = req.user;
    const { email, task_id, project_id, role = 'edit' } = req.body;
    const inviteeEmail = normalizeEmail(email);

    if (!inviteeEmail || !inviteeEmail.includes('@')) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (ownerEmail && normalizeEmail(ownerEmail) === inviteeEmail) {
      return res.status(400).json({ error: 'You cannot share with yourself' });
    }
    if ((!task_id && !project_id) || (task_id && project_id)) {
      return res.status(400).json({ error: 'Share either a task or a project' });
    }
    if (!['view', 'edit'].includes(role)) {
      return res.status(400).json({ error: 'Role must be view or edit' });
    }

    if (task_id) {
      const access = await getTaskAccess(task_id, user_id);
      if (!access?.is_owner) {
        return res.status(403).json({ error: 'Only the owner can share this task' });
      }
    } else {
      const access = await getProjectAccess(project_id, user_id);
      if (!access?.is_owner) {
        return res.status(403).json({ error: 'Only the owner can share this project' });
      }
    }

    const { share, created, inviteeUserId } = await upsertShare({
      ownerId: user_id,
      inviteeEmail,
      taskId: task_id || null,
      projectId: project_id || null,
      role
    });

    if (created) {
      const label = task_id ? 'a task' : 'a project';
      await notifyInvitee(
        inviteeUserId,
        'Something was shared with you',
        `${ownerEmail || 'Someone'} shared ${label} with you.`,
        task_id || null
      );
    }

    const withOverrides = (await attachOverrides([share]))[0];
    res.status(created ? 201 : 200).json({
      share: withOverrides,
      message: inviteeUserId
        ? `Shared. They can see it when they next open MindSprint.`
        : `Invite saved. They will see it after they sign up with ${inviteeEmail}.`
    });
  } catch (error) {
    console.error('Create share error:', error);
    res.status(500).json({ error: 'Failed to share' });
  }
});

router.put('/:id/overrides', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;
    const overrides = Array.isArray(req.body?.overrides) ? req.body.overrides : null;
    if (!overrides) {
      return res.status(400).json({ error: 'overrides array is required' });
    }

    const share = await loadShareById(id);
    if (!share || share.owner_id !== user_id || share.status === 'revoked') {
      return res.status(404).json({ error: 'Share not found' });
    }
    if (!share.project_id) {
      return res.status(400).json({ error: 'Overrides only apply to project shares' });
    }

    const tasks = await query(
      'SELECT id FROM tasks WHERE project_id = $1',
      [share.project_id]
    );
    const allowed = new Set(tasks.rows.map((t) => t.id));

    for (const item of overrides) {
      const role = item.role;
      const taskId = item.task_id;
      if (!taskId || !allowed.has(taskId)) {
        return res.status(400).json({ error: 'Override task must belong to this project' });
      }
      if (!['view', 'edit', 'hidden'].includes(role)) {
        return res.status(400).json({ error: 'Override role must be view, edit, or hidden' });
      }
      await query(
        `INSERT INTO share_task_overrides (share_id, task_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (share_id, task_id) DO UPDATE SET role = EXCLUDED.role`,
        [id, taskId, role]
      );
    }

    res.json({ overrides: await loadOverrides(id) });
  } catch (error) {
    console.error('Update overrides error:', error);
    res.status(500).json({ error: 'Failed to update overrides' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;

    const share = await loadShareById(id);
    if (!share || (share.owner_id !== user_id && share.invitee_user_id !== user_id)) {
      return res.status(404).json({ error: 'Share not found' });
    }

    await query(`UPDATE shares SET status = 'revoked' WHERE id = $1`, [id]);

    if (share.is_assignment && share.task_id && share.invitee_user_id) {
      await query(
        `UPDATE tasks SET assignee_user_id = NULL, updated_at = NOW()
         WHERE id = $1 AND assignee_user_id = $2`,
        [share.task_id, share.invitee_user_id]
      );
      const { syncTaskReminders } = require('../services/reminders');
      await syncTaskReminders(share.task_id);
    }

    res.json({ message: 'Share removed' });
  } catch (error) {
    console.error('Revoke share error:', error);
    res.status(500).json({ error: 'Failed to remove share' });
  }
});

router.post('/claim', authenticateToken, async (req, res) => {
  try {
    const { user_id, email } = req.user;
    const claimed = await bindSharesForUser(user_id, email);
    res.json({ claimed });
  } catch (error) {
    console.error('Claim shares error:', error);
    res.status(500).json({ error: 'Failed to claim invites' });
  }
});

module.exports = router;
