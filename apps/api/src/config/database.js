const { Pool } = require('pg');

const SLOW_MS = 100;

function dbSslConfig() {
  // Explicit override for local Docker / non-TLS Postgres
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') return { rejectUnauthorized: false };
  const url = process.env.DATABASE_URL || '';
  // Railway/Neon/etc typically need TLS; docker hostnames do not
  if (/railway|neon|render|supabase|sslmode=require/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return false;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://app:password@postgres:5432/focusflow',
  ssl: dbSslConfig(),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > SLOW_MS) {
      console.warn('Slow query', { text, duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

const getClient = async () => {
  return await pool.connect();
};

module.exports = {
  query,
  getClient,
  pool: () => pool
};
