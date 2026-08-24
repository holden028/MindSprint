/**
 * Format "now" for AI prompts in the user's IANA timezone.
 */
function formatNowInTimezone(timeZone = 'Europe/London', date = new Date()) {
  const tz = normalizeTimezone(timeZone);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short'
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function getHourInTimezone(timeZone = 'Europe/London', date = new Date()) {
  const tz = normalizeTimezone(timeZone);
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: 'numeric',
      hourCycle: 'h23'
    }).formatToParts(date);
    return Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  } catch {
    return date.getUTCHours();
  }
}

function normalizeTimezone(input) {
  const tz = (input || 'Europe/London').trim();
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    throw new Error('Invalid timezone — pick a valid IANA zone like Europe/London or America/New_York');
  }
}

function isValidTimezone(input) {
  try {
    normalizeTimezone(input);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  formatNowInTimezone,
  getHourInTimezone,
  normalizeTimezone,
  isValidTimezone
};
