const MULTI_STEP_PATTERNS = [
  /\b(and then|step \d|first[, ]|second[, ]|third[, ]|finally[, ]|multiple steps|multi-step)\b/i,
  /^\s*\d+[.)]\s/m,
  /\n\s*[-*•]\s/,
  /\b(research|implement|design|draft|write up|build out| refactor|debug|review and)\b/i,
];

/**
 * Infer whether a task needs a full focus session or a quick yes/no completion.
 * Uses stored AI classification when present, otherwise heuristics.
 */
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
  const title = task.title || '';
  const combined = `${title}\n${desc}`;

  let focusScore = 0;
  if (est > 20) focusScore += 2;
  if (est > 45) focusScore += 3;
  if (MULTI_STEP_PATTERNS.some((pattern) => pattern.test(combined))) focusScore += 3;
  if (desc.length > 140) focusScore += 1;
  if (task.parent_task_id) focusScore += 2;
  if (task.status === 'doing' && est > 15) focusScore += 1;

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

function normalizeAiWorkMode(value) {
  if (value === 'quick' || value === 'focus') return value;
  if (value === true || value === 'true' || value === 'yes') return 'focus';
  if (value === false || value === 'false' || value === 'no') return 'quick';
  return null;
}

function workModeFromAiFields(taskLike) {
  const direct = normalizeAiWorkMode(taskLike?.work_mode ?? taskLike?.workMode ?? taskLike?.needs_focus_session);
  if (direct) return direct;

  const est = Number(taskLike?.est_minutes ?? taskLike?.estMinutes) || 30;
  const desc = `${taskLike?.title || ''}\n${taskLike?.description || ''}`;
  let focusScore = 0;
  if (est > 20) focusScore += 2;
  if (MULTI_STEP_PATTERNS.some((pattern) => pattern.test(desc))) focusScore += 2;
  return focusScore >= 2 ? 'focus' : 'quick';
}

function buildAiInterpretations(existing, taskLike, reason) {
  const work_mode = workModeFromAiFields(taskLike);
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    work_mode,
    work_mode_reason: reason || (work_mode === 'focus'
      ? 'AI: needs focus session'
      : 'AI: quick completion'),
  };
}

module.exports = {
  inferWorkMode,
  withWorkMode,
  workModeFromAiFields,
  buildAiInterpretations,
};
