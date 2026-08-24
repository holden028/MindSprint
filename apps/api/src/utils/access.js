const { query } = require('../config/database');

function taskVisibleSql(userParam = '$1') {
  return `(
    p.user_id = ${userParam}
    OR EXISTS (
      SELECT 1 FROM shares s
      WHERE s.status = 'accepted'
        AND s.invitee_user_id = ${userParam}
        AND s.task_id = t.id
    )
    OR (
      EXISTS (
        SELECT 1 FROM shares s
        WHERE s.status = 'accepted'
          AND s.invitee_user_id = ${userParam}
          AND s.project_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM shares s
        JOIN share_task_overrides o ON o.share_id = s.id AND o.task_id = t.id
        WHERE s.status = 'accepted'
          AND s.invitee_user_id = ${userParam}
          AND s.project_id = p.id
          AND o.role = 'hidden'
      )
    )
  )`;
}

function projectVisibleSql(userParam = '$1') {
  return `(
    p.user_id = ${userParam}
    OR EXISTS (
      SELECT 1 FROM shares s
      WHERE s.status = 'accepted'
        AND s.invitee_user_id = ${userParam}
        AND (
          s.project_id = p.id
          OR s.task_id IN (SELECT id FROM tasks WHERE project_id = p.id)
        )
    )
  )`;
}

function taskAccessSelectSql(userParam = '$1') {
  return `
    p.user_id as owner_id,
    owner.email as owner_email,
    (p.user_id != ${userParam}) as is_shared,
    (p.user_id = ${userParam}) as is_owner,
    (t.assignee_user_id = ${userParam}) as is_assigned_to_me,
    assignee.email as assignee_email,
    CASE
      WHEN p.user_id = ${userParam} THEN 'edit'
      ELSE COALESCE(
        (
          SELECT s.role FROM shares s
          WHERE s.status = 'accepted'
            AND s.invitee_user_id = ${userParam}
            AND s.task_id = t.id
          LIMIT 1
        ),
        (
          SELECT CASE
            WHEN o.role = 'hidden' THEN NULL
            ELSE COALESCE(o.role, s.role)
          END
          FROM shares s
          LEFT JOIN share_task_overrides o ON o.share_id = s.id AND o.task_id = t.id
          WHERE s.status = 'accepted'
            AND s.invitee_user_id = ${userParam}
            AND s.project_id = p.id
          LIMIT 1
        )
      )
    END as my_role
  `;
}

function withTaskAccessFlags(row) {
  if (!row) return row;
  const isOwner = !!row.is_owner;
  const myRole = row.my_role || (isOwner ? 'edit' : null);
  return {
    ...row,
    is_owner: isOwner,
    is_shared: !!row.is_shared,
    is_assigned_to_me: !!row.is_assigned_to_me,
    my_role: myRole,
    can_edit: isOwner || myRole === 'edit',
    can_delete: isOwner
  };
}

async function getTaskAccess(taskId, userId) {
  const result = await query(
    `SELECT t.id, t.project_id, t.assignee_user_id, t.due_at, t.est_minutes, t.title, t.status,
            ${taskAccessSelectSql('$2')}
     FROM tasks t
     JOIN projects p ON t.project_id = p.id
     JOIN users owner ON p.user_id = owner.id
     LEFT JOIN users assignee ON t.assignee_user_id = assignee.id
     WHERE t.id = $1 AND ${taskVisibleSql('$2')}`,
    [taskId, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return withTaskAccessFlags(row);
}

async function assertTaskAccess(res, taskId, userId, { requireOwner = false, requireEdit = false } = {}) {
  const access = await getTaskAccess(taskId, userId);
  if (!access) {
    res.status(404).json({ error: 'Task not found' });
    return null;
  }
  if (requireOwner && !access.is_owner) {
    res.status(403).json({ error: 'Only the owner can do that' });
    return null;
  }
  if (requireEdit && !access.can_edit) {
    res.status(403).json({ error: 'You have view-only access to this task' });
    return null;
  }
  return access;
}

async function getProjectAccess(projectId, userId) {
  const result = await query(
    `SELECT p.id, p.user_id as owner_id,
            (p.user_id = $2) as is_owner,
            EXISTS (
              SELECT 1 FROM shares s
              WHERE s.status = 'accepted'
                AND s.invitee_user_id = $2
                AND (
                  s.project_id = p.id
                  OR s.task_id IN (SELECT id FROM tasks WHERE project_id = p.id)
                )
            ) as is_collaborator
     FROM projects p
     WHERE p.id = $1`,
    [projectId, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!row.is_owner && !row.is_collaborator) return null;
  return {
    ...row,
    is_owner: !!row.is_owner,
    can_edit: !!row.is_owner,
    can_delete: !!row.is_owner
  };
}

async function bindSharesForUser(userId, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return 0;
  const result = await query(
    `UPDATE shares
     SET invitee_user_id = $1,
         status = 'accepted',
         accepted_at = COALESCE(accepted_at, NOW())
     WHERE lower(invitee_email) = $2
       AND status = 'pending'
     RETURNING id, task_id, is_assignment`,
    [userId, normalized]
  );

  const assignedTaskIds = result.rows
    .filter((row) => row.is_assignment && row.task_id)
    .map((row) => row.task_id);

  if (assignedTaskIds.length > 0) {
    await query(
      `UPDATE tasks
       SET assignee_user_id = $1, updated_at = NOW()
       WHERE id = ANY($2::uuid[])
         AND assignee_user_id IS NULL`,
      [userId, assignedTaskIds]
    );
    try {
      const { syncTaskReminders } = require('../services/reminders');
      for (const taskId of assignedTaskIds) {
        await syncTaskReminders(taskId);
      }
    } catch (err) {
      console.error('Failed to sync reminders after claiming assignment:', err.message);
    }
  }

  return result.rowCount;
}

module.exports = {
  taskVisibleSql,
  projectVisibleSql,
  taskAccessSelectSql,
  withTaskAccessFlags,
  getTaskAccess,
  assertTaskAccess,
  getProjectAccess,
  bindSharesForUser
};
