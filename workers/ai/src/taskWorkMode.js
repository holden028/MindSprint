const MULTI_STEP_PATTERNS = [
  /\b(and then|step \d|first[, ]|second[, ]|third[, ]|finally[, ]|multiple steps|multi-step)\b/i,
  /^\s*\d+[.)]\s/m,
  /\n\s*[-*•]\s/,
  /\b(research|implement|design|draft|write up|build out| refactor|debug|review and)\b/i,
];

function inferWorkMode(task) {
  const stored = task.ai_interpretations?.work_mode;
  if (stored === 'quick' || stored === 'focus') {
    return {
      work_mode: stored,
      work_mode_reason: task.ai_interpretations?.work_mode_reason || 'Classified by AI',
    };
  }

  const est = Number(task.est_minutes) || 30;
  const desc = task.description || '';
  const title = task.title || task.task_title || '';
  const combined = `${title}\n${desc}`;

  let focusScore = 0;
  if (est > 20) focusScore += 2;
  if (est > 45) focusScore += 3;
  if (MULTI_STEP_PATTERNS.some((pattern) => pattern.test(combined))) focusScore += 3;
  if (desc.length > 140) focusScore += 1;
  if (task.parent_task_id) focusScore += 2;

  if (est <= 10 && desc.length < 80 && focusScore < 2) {
    return { work_mode: 'quick', work_mode_reason: 'Short, single-step task' };
  }
  if (focusScore >= 2) {
    return { work_mode: 'focus', work_mode_reason: 'Needs sustained focus or multiple steps' };
  }
  return { work_mode: 'quick', work_mode_reason: 'Quick action item' };
}

function withWorkMode(task) {
  const { work_mode, work_mode_reason } = inferWorkMode(task);
  return { ...task, work_mode, work_mode_reason };
}

module.exports = { inferWorkMode, withWorkMode };
