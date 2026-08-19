function redisConnection() {
  const url = process.env.REDIS_URL || 'redis://redis:6379';
  try {
    const parsed = new URL(url);
    const config = {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      username: parsed.username || undefined
    };
    if (parsed.protocol === 'rediss:') {
      config.tls = {};
    }
    return config;
  } catch (err) {
    return { host: 'redis', port: 6379 };
  }
}

module.exports = { redisConnection };
