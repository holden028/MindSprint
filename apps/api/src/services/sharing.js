const { query } = require('../config/database');
const { syncTaskReminders, clearAutoReminders } = require('./reminders');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function findUserByEmail(email) {
  const result = await query(
    'SELECT id, email FROM users WHERE lower(email) = $1',
    [normalizeEmail(email)]
  );
  return result.rows[0] || null;
}

async function notifyInvitee(userId, title, body, taskId) {
  if (!userId) return;
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, body, task_id)
       VALUES ($1, 'share_invite', $2, $3, $4)`,
      [userId, title, body, taskId || null]
    );
  } catch (err) {
    console.error('Share notification failed:', err.message);
  }
}

async function loadShareById(id) {
  const result = await query('SELECT * FROM shares WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function upsertShare({
  ownerId,
  inviteeEmail,
  taskId = null,
  projectId = null,
  role = 'edit',
  isAssignment = false
}) {
  const email = normalizeEmail(inviteeEmail);
  const existingUser = await findUserByEmail(email);
  const inviteeUserId = existingUser?.id || null;
  const status = inviteeUserId ? 'accepted' : 'pending';
  const acceptedAt = inviteeUserId ? new Date() : null;

  const existing = await query(
    `SELECT * FROM shares
     WHERE owner_id = $1 AND lower(invitee_email) = $2
       AND COALESCE(task_id::text, '') = COALESCE($3::text, '')
       AND COALESCE(project_id::text, '') = COALESCE($4::text, '')
     ORDER BY CASE WHEN status = 'revoked' THEN 1 ELSE 0 END, created_at DESC
     LIMIT 1`,
    [ownerId, email, taskId || null, projectId || null]
  );

  let share = existing.rows[0];
  if (share && share.status !== 'revoked') {
    const result = await query(
      `UPDATE shares
       SET role = $1,
           is_assignment = CASE WHEN $2 THEN TRUE ELSE is_assignment END,
           invitee_user_id = COALESCE(invitee_user_id, $3),
           status = CASE WHEN $3::uuid IS NOT NULL THEN 'accepted' ELSE status END,
           accepted_at = CASE
             WHEN $3::uuid IS NOT NULL THEN COALESCE(accepted_at, NOW())
             ELSE accepted_at
           END
       WHERE id = $4
       RETURNING *`,
      [role, !!isAssignment, inviteeUserId, share.id]
    );
    return { share: result.rows[0], created: false, inviteeUserId };
  }

  if (share && share.status === 'revoked') {
    const result = await query(
      `UPDATE shares
       SET role = $1,
           is_assignment = $2,
           invitee_user_id = $3,
           status = $4,
           accepted_at = $5
       WHERE id = $6
       RETURNING *`,
      [role, !!isAssignment, inviteeUserId, status, acceptedAt, share.id]
    );
    return { share: result.rows[0], created: true, inviteeUserId };
  }

  const result = await query(
    `INSERT INTO shares (
       owner_id, invitee_email, invitee_user_id, task_id, project_id,
       role, status, is_assignment, accepted_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      ownerId,
      email,
      inviteeUserId,
      taskId || null,
      projectId || null,
      role,
      status,
      !!isAssignment,
      acceptedAt
    ]
  );
  return { share: result.rows[0], created: true, inviteeUserId };
}

async function ensureEditShareForTask({ ownerId, ownerEmail, taskId, projectId, inviteeEmail, isAssignment = false }) {
  const email = normalizeEmail(inviteeEmail);

  const projectShare = await query(
    `SELECT * FROM shares
     WHERE owner_id = $1 AND lower(invitee_email) = $2
       AND project_id = $3 AND status != 'revoked'
     LIMIT 1`,
    [ownerId, email, projectId]
  );

  if (projectShare.rows[0]) {
    const share = projectShare.rows[0];
    await query(
      `INSERT INTO share_task_overrides (share_id, task_id, role)
       VALUES ($1, $2, 'edit')
       ON CONFLICT (share_id, task_id) DO UPDATE SET role = 'edit'`,
      [share.id, taskId]
    );
    const { share: taskShare } = await upsertShare({
      ownerId,
      inviteeEmail: email,
      taskId,
      role: 'edit',
      isAssignment
    });
    return taskShare;
  }

  const { share, created, inviteeUserId } = await upsertShare({
    ownerId,
    inviteeEmail: email,
    taskId,
    role: 'edit',
    isAssignment
  });

  if (created) {
    await notifyInvitee(
      inviteeUserId,
      isAssignment ? 'A task was assigned to you' : 'Something was shared with you',
      isAssignment
        ? `${ownerEmail || 'Someone'} assigned a task to you.`
        : `${ownerEmail || 'Someone'} shared a task with you.`,
      taskId
    );
  }

  return share;
}

async function assignTask({ ownerId, ownerEmail, taskId, projectId, email }) {
  const previous = await query(
    'SELECT assignee_user_id, due_at FROM tasks WHERE id = $1',
    [taskId]
  );
  const prevAssignee = previous.rows[0]?.assignee_user_id || null;

  if (!email) {
    await query(
      `UPDATE tasks SET assignee_user_id = NULL, updated_at = NOW() WHERE id = $1`,
      [taskId]
    );
    await query(
      `UPDATE shares SET is_assignment = FALSE
       WHERE owner_id = $1 AND task_id = $2 AND is_assignment = TRUE AND status != 'revoked'`,
      [ownerId, taskId]
    );
    if (prevAssignee) await clearAutoReminders(taskId, prevAssignee);
    await syncTaskReminders(taskId);
    const task = await query(
      `SELECT t.*, assignee.email as assignee_email
       FROM tasks t
       LEFT JOIN users assignee ON t.assignee_user_id = assignee.id
       WHERE t.id = $1`,
      [taskId]
    );
    return { task: task.rows[0], share: null, pending: false };
  }

  const share = await ensureEditShareForTask({
    ownerId,
    ownerEmail,
    taskId,
    projectId,
    inviteeEmail: email,
    isAssignment: true
  });

  const inviteeUserId = share.invitee_user_id || null;
  await query(
    `UPDATE tasks SET assignee_user_id = $1, updated_at = NOW() WHERE id = $2`,
    [inviteeUserId, taskId]
  );

  if (prevAssignee && prevAssignee !== inviteeUserId) {
    await clearAutoReminders(taskId, prevAssignee);
  }
  await syncTaskReminders(taskId);

  const task = await query(
    `SELECT t.*, assignee.email as assignee_email
     FROM tasks t
     LEFT JOIN users assignee ON t.assignee_user_id = assignee.id
     WHERE t.id = $1`,
    [taskId]
  );
  return {
    task: task.rows[0],
    share,
    pending: !inviteeUserId
  };
}

async function loadOverrides(shareId) {
  const result = await query(
    `SELECT o.task_id, o.role, t.title as task_title
     FROM share_task_overrides o
     JOIN tasks t ON t.id = o.task_id
     WHERE o.share_id = $1
     ORDER BY t.created_at`,
    [shareId]
  );
  return result.rows;
}

module.exports = {
  normalizeEmail,
  findUserByEmail,
  notifyInvitee,
  loadShareById,
  upsertShare,
  ensureEditShareForTask,
  assignTask,
  loadOverrides
};
