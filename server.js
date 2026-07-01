require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./src/db/db');

// Import routes
const authRouter = require('./src/routes/auth');
const categoriesRouter = require('./src/routes/categories');
const transactionsRouter = require('./src/routes/transactions');
const goalsRouter = require('./src/routes/goals');
const analyticsRouter = require('./src/routes/analytics');
const smsRouter = require('./src/routes/sms');
const { requireAuth } = require('./src/middleware/auth');

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/categories', requireAuth, categoriesRouter);
app.use('/api/transactions', requireAuth, transactionsRouter);
app.use('/api/goals', requireAuth, goalsRouter);
app.use('/api/analytics', requireAuth, analyticsRouter);
app.use('/api/sms', requireAuth, smsRouter);

// Health Checks
app.get('/', (req, res) => res.send('OK'));
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Geo-Finance Tracker API' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

const serverless = require('serverless-http');

// Initialize database then start server (Local only)
async function startLocalServer() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(`  Geo-Finance API running on: http://localhost:${PORT}`);
      console.log(`=================================================`);
    });
  } catch (error) {
    console.error('CRITICAL: Database initialization failed. Server halting.', error);
    process.exit(1);
  }
}

// If running locally (not in AWS Lambda), start the server
if (process.env.NODE_ENV !== 'production' && !process.env.LAMBDA_TASK_ROOT) {
  startLocalServer();
}

// For AWS Lambda, we export the wrapped app.
let dbInitialized = false;
let dbInitError = null;
const wrappedApp = serverless(app);

// Diagnostic endpoint to check DB status from production
app.get('/api/debug/status', (req, res) => {
  res.json({
    dbInitialized,
    dbInitError: dbInitError ? dbInitError.message : null,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? '***SET***' : '***MISSING***',
      JWT_SECRET: process.env.JWT_SECRET ? '***SET***' : '***MISSING***',
      SMS_PROVIDER: process.env.SMS_PROVIDER || '***MISSING***',
    }
  });
});

module.exports.handler = async (event, context) => {
  if (!dbInitialized) {
    try {
      console.log('[Lambda] Cold start — initializing database...');
      await initDb();
      dbInitialized = true;
      console.log('[Lambda] Database initialized successfully.');
    } catch (err) {
      console.error('[Lambda] CRITICAL: initDb() failed:', err);
      dbInitError = err;
      // Still allow the request through so the debug endpoint works
    }
  }
  return wrappedApp(event, context);
};
