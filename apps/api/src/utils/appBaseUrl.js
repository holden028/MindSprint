/**
 * Normalize and validate a public app base URL (domain or IP, optional port/protocol).
 * Returns canonical origin without trailing slash, e.g. http://192.168.1.5:5174
 */
function normalizeAppBaseUrl(input) {
  if (input === null || input === undefined || input === '') return null;

  let s = String(input).trim().replace(/\/+$/, '');
  if (!s) return null;
  if (/\s/.test(s)) {
    throw new Error('App URL cannot contain spaces');
  }

  if (!/^https?:\/\//i.test(s)) {
    s = `http://${s}`;
  }

  let url;
  try {
    url = new URL(s);
  } catch {
    throw new Error('Invalid URL — use a domain or IP, e.g. app.example.com or 192.168.1.10:5174');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL must use http or https');
  }

  const host = url.hostname;
  if (!host) throw new Error('Missing hostname');

  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)
    && host.split('.').every((o) => Number(o) >= 0 && Number(o) <= 255);
  const isIpv6 = host.includes(':'); // URL hostname strips brackets for IPv6
  const isLocal = host === 'localhost';
  const isDomain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host);

  if (!isIpv4 && !isIpv6 && !isLocal && !isDomain) {
    throw new Error('Hostname must be a domain, localhost, or IP address');
  }

  return `${url.protocol}//${url.host}`;
}

function resolveAppBaseUrl(userBaseUrl, envFallback) {
  try {
    if (userBaseUrl) return normalizeAppBaseUrl(userBaseUrl);
  } catch {
    // fall through
  }
  return (envFallback || 'http://localhost:5174').replace(/\/+$/, '');
}

function taskDeepLink(baseUrl, { projectId, taskId }) {
  const base = (baseUrl || '').replace(/\/+$/, '');
  if (!projectId) {
    return taskId ? `${base}/dashboard?task=${taskId}` : `${base}/dashboard`;
  }
  const path = `${base}/projects/${projectId}`;
  return taskId ? `${path}?task=${taskId}` : path;
}

module.exports = { normalizeAppBaseUrl, resolveAppBaseUrl, taskDeepLink };
