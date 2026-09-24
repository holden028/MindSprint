const MULTI_STEP_PATTERNS = [
  /\b(and then|step \d|first[, ]|second[, ]|third[, ]|finally[, ]|multiple steps|multi-step)\b/i,
  /^\s*\d+[.)]\s/m,
  /\n\s*[-*•]\s/,
  /\b(research|implement|design|draft|write up|build out| refactor|debug|review and)\b/i,
];

/**
 * Soft classification only — a hint about how you might work, not a gate.
 * Every task can be marked done or worked with/without a timer.
 */
export function inferWorkMode(task) {
  const stored = task?.ai_interpretations?.work_mode;
  if (stored === 'quick' || stored === 'focus') {
    return {
      work_mode: stored,
      work_mode_reason: task.ai_interpretations?.work_mode_reason || 'Classified by AI',
    };
  }

  if (task?.work_mode === 'quick' || task?.work_mode === 'focus') {
    return { work_mode: task.work_mode, work_mode_reason: task.work_mode_reason || '' };
  }

  const est = Number(task?.est_minutes) || 30;
  const desc = task?.description || '';
  const title = task?.title || '';
  const combined = `${title}\n${desc}`;

  let focusScore = 0;
  if (est > 20) focusScore += 2;
  if (est > 45) focusScore += 3;
  if (MULTI_STEP_PATTERNS.some((pattern) => pattern.test(combined))) focusScore += 3;
  if (desc.length > 140) focusScore += 1;
  if (task?.parent_task_id) focusScore += 2;

  if (est <= 10 && desc.length < 80 && focusScore < 2) {
    return { work_mode: 'quick', work_mode_reason: 'Short, single-step task' };
  }

  if (focusScore >= 2) {
    return { work_mode: 'focus', work_mode_reason: 'May benefit from protected work time' };
  }

  return { work_mode: 'quick', work_mode_reason: 'Quick action item' };
}

/** @deprecated Prefer suggestsFocusHelp — focus is a suggestion, not a requirement */
export function needsFocusSession(task) {
  return suggestsFocusHelp(task);
}

export function suggestsFocusHelp(task) {
  return inferWorkMode(task).work_mode === 'focus';
}

export function isQuickWin(task) {
  return inferWorkMode(task).work_mode === 'quick';
}

/** Primary CTA copy: always "Do it" — timer is secondary */
export function doActionLabel(_task) {
  return 'Do it';
}

export function workModeBadge(task) {
  if (suggestsFocusHelp(task)) {
    return {
      label: 'Focus help',
      title: 'May benefit from protected work time — timer optional',
      className: 'border-sky-400/30 text-sky-200/80',
    };
  }
  return {
    label: 'Quick',
    title: 'Usually a quick mark-done',
    className: 'border-emerald-400/30 text-emerald-200/80',
  };
}
