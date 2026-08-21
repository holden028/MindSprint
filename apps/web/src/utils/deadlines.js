export function formatDue(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((dueDay - today) / 86400000);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays === -1) return `Yesterday ${time}`;
  if (diffDays < -1) return `${Math.abs(diffDays)}d overdue · ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ` ${time}`;
}

export function deadlineBadge(task) {
  const bucket = task.urgency_bucket || inferBucket(task);
  if (bucket === 'overdue') {
    return { label: 'Overdue', className: 'bg-red-500/25 border-red-400/40 text-red-200' };
  }
  if (bucket === 'due_today') {
    return { label: 'Due today', className: 'bg-orange-500/25 border-orange-400/40 text-orange-200' };
  }
  if (bucket === 'start_today') {
    return { label: 'Start today', className: 'bg-amber-500/20 border-amber-400/30 text-amber-200' };
  }
  if (task.due_at) {
    return { label: formatDue(task.due_at), className: 'bg-white/10 border-white/15 text-white/60' };
  }
  return null;
}

export function inferBucket(task, now = new Date()) {
  if (!task.due_at || task.status === 'done') return 'later';
  const due = new Date(task.due_at);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const est = task.est_minutes || 30;
  const startBy = new Date(due.getTime() - (est + 30) * 60000);
  if (due < now) return 'overdue';
  if (due <= todayEnd) return 'due_today';
  if (startBy <= todayEnd) return 'start_today';
  return 'later';
}

export function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
