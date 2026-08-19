const fs = require('fs');
const path = require('path');
const { query, getClient } = require('../config/database');

function resolveMigrationsDir() {
  if (process.env.MIGRATIONS_DIR && fs.existsSync(process.env.MIGRATIONS_DIR)) {
    return process.env.MIGRATIONS_DIR;
  }

  const candidates = [
    path.resolve(__dirname, '../../../../sql/migrations'),
    path.resolve(process.cwd(), '../../sql/migrations'),
    path.resolve(process.cwd(), 'sql/migrations'),
    '/sql/migrations'
  ];

  return candidates.find((dir) => fs.existsSync(dir));
}

async function applyMigrations() {
  const dir = resolveMigrationsDir();
  if (!dir) {
    console.warn('⚠️  No SQL migrations directory found; skipping schema migrations');
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
  const applied = await query('SELECT filename FROM schema_migrations');
  const appliedSet = new Set(applied.rows.map((row) => row.filename));

  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`✅ Applied migration ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Failed migration ${file}:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { applyMigrations };
