const { query } = require('../config/database');
const { assertTaskAccess } = require('./access');

/** Owner-only (delete, share). */
async function assertTaskOwner(res, taskId, userId) {
  return assertTaskAccess(res, taskId, userId, { requireOwner: true });
}

function patchRow(updates, allowedFields) {
  const updateFields = [];
  const values = [];
  let nextParam = 1;

  for (const [key, value] of Object.entries(updates || {})) {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = $${nextParam}`);
      values.push(value);
      nextParam += 1;
    }
  }

  return { updateFields, values, nextParam };
}

module.exports = {
  assertTaskOwner,
  assertTaskAccess,
  patchRow
};
