const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { assertSecrets } = require('./config/secrets');
const { query } = require('./config/database');
const { applyMigrations } = require('./db/migrate');

assertSecrets();

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const taskRoutes = require('./routes/tasks');
const projectRoutes = require('./routes/projects');
const sessionRoutes = require('./routes/sessions');
const profileRoutes = require('./routes/profile');
const ingestRoutes = require('./routes/ingest');
const aiRoutes = require('./routes/ai');
const templateRoutes = require('./routes/templates');
const customEnvironmentRoutes = require('./routes/custom-environments');
const musicRoutes = require('./routes/music');
const adminRoutes = require('./routes/admin');
const reminderRoutes = require('./routes/reminders');
const notificationRoutes = require('./routes/notifications');
const slackRoutes = require('./routes/slack');
const scheduleRoutes = require('./routes/schedule');
const shareRoutes = require('./routes/shares');

const app = express();
const PORT = process.env.PORT || 8080;

// Caddy / reverse proxies set X-Forwarded-*; required for rate-limit + correct IPs
app.set('trust proxy', 1);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(helmet({
  // Allow the SPA to be framed/opened from LAN IPs without CSP blocking API calls
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(morgan('combined'));

function isAllowedOrigin(origin) {
  if (!origin) return true; // curl / same-origin / mobile webviews

  const defaults = [
    process.env.FRONTEND_URL,
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ].filter(Boolean);

  if (defaults.includes(origin)) return true;

  // Extra origins: CORS_ORIGINS=http://192.168.1.10:5174,https://app.example.com
  const extra = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (extra.includes(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    // Private LAN / localhost — needed when opening the UI via machine IP
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'OK', db: 'up', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ status: 'error', db: 'down', timestamp: new Date().toISOString() });
  }
});

app.use('/auth', authLimiter, authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/tasks', taskRoutes);
app.use('/projects', projectRoutes);
app.use('/sessions', sessionRoutes);
app.use('/profile', profileRoutes);
app.use('/ingest', ingestRoutes);
app.use('/ai', aiLimiter, aiRoutes);
app.use('/templates', templateRoutes);
app.use('/custom-environments', customEnvironmentRoutes);
app.use('/music', musicRoutes);
app.use('/admin', adminRoutes);
app.use('/reminders', reminderRoutes);
app.use('/notifications', notificationRoutes);
app.use('/slack', slackRoutes);
app.use('/schedule', scheduleRoutes);
app.use('/shares', shareRoutes);

app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

async function start() {
  try {
    await applyMigrations();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 API Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start API:', error);
    process.exit(1);
  }
}

start();
