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

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Geo-Finance Tracker API' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Initialize database then start server
async function startServer() {
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

startServer();
