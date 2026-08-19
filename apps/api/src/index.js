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

const app = express();
const PORT = process.env.PORT || 8080;

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

app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5174',
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
