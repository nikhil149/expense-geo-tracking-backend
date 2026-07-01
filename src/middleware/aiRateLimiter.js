const { db } = require('../db/db');

/**
 * Middleware to limit AI API requests to a specified number per user per day.
 * Excludes background transaction processing by default (should only be applied to specific routes).
 */
const checkAILimit = async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const MAX_REQUESTS = 20;
  const userId = req.user.id;
  const today = new Date().toISOString().split('T')[0]; // UTC date YYYY-MM-DD

  try {
    let usage = await db('ai_usage_limits')
      .where({ user_id: userId, date: today })
      .first();

    if (!usage) {
      // First request of the day
      await db('ai_usage_limits').insert({
        user_id: userId,
        date: today,
        request_count: 1
      });
      return next();
    }

    if (usage.request_count >= MAX_REQUESTS) {
      return res.status(429).json({
        error: `You have reached your daily limit of ${MAX_REQUESTS} AI requests. Please try again tomorrow!`,
        code: 'AI_RATE_LIMIT'
      });
    }

    // Increment count
    await db('ai_usage_limits')
      .where({ id: usage.id })
      .update({ request_count: usage.request_count + 1, updated_at: db.fn.now() });

    next();
  } catch (error) {
    console.error('Error checking AI rate limit:', error);
    // Fail open or closed? Better to fail closed if DB is down, but we will return 500.
    res.status(500).json({ error: 'Internal server error while checking AI rate limit.' });
  }
};

module.exports = {
  checkAILimit
};
