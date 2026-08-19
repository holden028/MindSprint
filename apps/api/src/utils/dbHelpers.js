const { query } = require('../config/database');

async function assertTaskOwner(res, taskId, userId) {
  const result = await query(`
    SELECT t.id FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.id = $1 AND p.user_id = $2
  `, [taskId, userId]);

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Task not found' });
    return null;
  }

  return result.rows[0];
}

function patchRow(updates, allowedFields) {
  const updateFields = [];
  const values = [];
  let nextParam = 1;

  for (const [key, value] of Object.entries(updates || {})) {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = $${nextParam}`);
      values.push(value);
      nextParam++;
    }
  }

  return { updateFields, values, nextParam };
}

module.exports = {
  assertTaskOwner,
  patchRow
};
