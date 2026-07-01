const { parseSmsWithAI } = require('../services/aiSmsService');
const { db, initDb } = require('../db/db');

// Ensure database is connected for warm starts
let dbInitialized = false;

module.exports.handler = async (event) => {
  console.log('[AI_SMS_WORKER] Received SQS Event with', event.Records.length, 'records');

  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }

  for (const record of event.Records) {
    try {
      const payload = JSON.parse(record.body);
      console.log(`[AI_SMS_WORKER] Processing SMS for user ${payload.userId}`);

      const parsed = await parseSmsWithAI(payload.raw_text);
      
      if (!parsed || !parsed.isValid) {
        console.log('[AI_SMS_WORKER] AI determined SMS is invalid/not a transaction. Skipping.');
        continue;
      }

      // Auto-assign category
      let categoryId = null;
      try {
        const categories = await db('categories').where({ user_id: payload.userId }).orWhereNull('user_id');
        let matchedCat = null;
        if (parsed.aiCategory && parsed.aiCategory !== 'Other') {
          matchedCat = categories.find(c => c.name.toLowerCase() === parsed.aiCategory.toLowerCase());
        }
        categoryId = matchedCat ? matchedCat.id : categories[0].id;
      } catch (err) {
        console.warn('[AI_SMS_WORKER] Could not auto-assign category', err);
      }

      const tx = {
        user_id: payload.userId,
        title: parsed.merchantName || 'Unknown Merchant',
        amount: parsed.amount || 0,
        type: parsed.type || 'expense',
        date: payload.timestamp || new Date().toISOString(),
        category_id: categoryId,
        latitude: payload.latitude || null,
        longitude: payload.longitude || null,
        location_name: payload.location_name || null,
        notes: `AI Parsed. Payment: ${parsed.paymentMethod || 'unknown'}. Card: ${parsed.cardName || 'N/A'}. Raw Text: "${payload.raw_text}"`,
      };

      await db('transactions').insert(tx);
      console.log('[AI_SMS_WORKER] Successfully logged transaction via SQS.');
    } catch (err) {
      console.error('[AI_SMS_WORKER] Failed to process SQS record:', err);
      // Throwing error puts it back in the queue or sends it to DLQ (if configured)
      throw err;
    }
  }
};
