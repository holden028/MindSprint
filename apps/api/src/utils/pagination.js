function parseLimit(value, { defaultValue = 50, max = 100 } = {}) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 1) return defaultValue;
  return Math.min(n, max);
}

function parseOffset(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

module.exports = {
  parseLimit,
  parseOffset
};
