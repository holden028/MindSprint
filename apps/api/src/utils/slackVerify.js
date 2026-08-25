const crypto = require('crypto');

/**
 * Verify Slack request signature (v0 HMAC-SHA256).
 * Requires req.rawBody (Buffer or string) set by Express verify middleware.
 */
function verifySlackSignature(req, signingSecret = process.env.SLACK_SIGNING_SECRET) {
  if (!signingSecret) {
    // Allow local/dev without secret; production should set SLACK_SIGNING_SECRET
    return process.env.NODE_ENV !== 'production';
  }

  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];
  if (!timestamp || !signature || !req.rawBody) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 60 * 5) return false;

  const raw = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : String(req.rawBody);
  const base = `v0:${timestamp}:${raw}`;
  const hmac = crypto.createHmac('sha256', signingSecret).update(base, 'utf8').digest('hex');
  const expected = `v0=${hmac}`;

  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function requireSlackSignature(req, res, next) {
  if (!verifySlackSignature(req)) {
    return res.status(401).send('Invalid Slack signature');
  }
  return next();
}

module.exports = { verifySlackSignature, requireSlackSignature };
