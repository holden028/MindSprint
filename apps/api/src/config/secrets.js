function missingSecrets() {
  const missing = [];
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  return missing;
}

function assertSecrets() {
  const missing = missingSecrets();
  if (missing.length === 0) return;

  const message = `Missing required environment variables: ${missing.join(', ')}`;
  if (process.env.NODE_ENV === 'production') {
    console.error(message);
    process.exit(1);
  }
  console.warn(`${message} — set them before using auth or AI features`);
}

module.exports = {
  missingSecrets,
  assertSecrets
};
