const PRIORITY_COLORS = {
  1: 'bg-gray-500/20 text-gray-200',
  2: 'bg-blue-500/20 text-blue-200',
  3: 'bg-yellow-500/20 text-yellow-200',
  4: 'bg-orange-500/20 text-orange-200',
  5: 'bg-red-500/20 text-red-200',
};

const SCALE_COLORS = {
  1: 'text-green-400 bg-green-500/20 border-green-400/30',
  2: 'text-blue-400 bg-blue-500/20 border-blue-400/30',
  3: 'text-yellow-400 bg-yellow-500/20 border-yellow-400/30',
  4: 'text-orange-400 bg-orange-500/20 border-orange-400/30',
  5: 'text-red-400 bg-red-500/20 border-red-400/30',
};

export function getPriorityColor(priority) {
  return PRIORITY_COLORS[priority] || PRIORITY_COLORS[3];
}

export function getUrgencyColor(urgency) {
  return SCALE_COLORS[urgency] || SCALE_COLORS[3];
}

export const COLUMN_DOT_COLORS = {
  blue: 'bg-blue-400',
  yellow: 'bg-yellow-400',
  green: 'bg-green-400',
};
