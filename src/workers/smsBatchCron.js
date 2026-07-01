const cron = require('node-cron');
const { db } = require('../db/db');
const { parseBulkSmsWithAI } = require('../services/aiSmsService');

/**
 * Processes pending SMS messages for all users in batches.
 */
async function processPendingSms() {
  console.log('[SMS_BATCH_CRON] Starting batch processing of pending SMS...');
  try {
    // 1. Fetch all pending SMS
    const pendingSmsList = await db('pending_sms').where({ processed: false });
    
    if (pendingSmsList.length === 0) {
      console.log('[SMS_BATCH_CRON] No pending SMS to process.');
      return;
    }

    // 2. Group by user_id
    const userGroups = {};
    for (const sms of pendingSmsList) {
      if (!userGroups[sms.user_id]) userGroups[sms.user_id] = [];
      userGroups[sms.user_id].push(sms);
    }

    // 3. Process each user's SMS in batches of 20
    for (const [userIdStr, smsArray] of Object.entries(userGroups)) {
      const userId = parseInt(userIdStr, 10);
      const BATCH_SIZE = 20;

      for (let i = 0; i < smsArray.length; i += BATCH_SIZE) {
        const batch = smsArray.slice(i, i + BATCH_SIZE);
        
        // Format for Gemini bulk parsing
        const promptInput = batch.map(sms => ({ id: sms.id, text: sms.raw_text }));
        
        console.log(`[SMS_BATCH_CRON] User ${userId}: Parsing batch of ${batch.length} SMS...`);
        
        try {
          const parsedResults = await parseBulkSmsWithAI(promptInput);
          
          for (const result of parsedResults) {
            const originalSms = batch.find(sms => sms.id === result.id);
            if (!originalSms) continue;

            // If valid, insert into transactions
            if (result.isValid && result.amount) {
              // Attempt to map category
              let categoryId = null;
              try {
                const categories = await db('categories').where({ user_id: userId }).orWhereNull('user_id');
                let matchedCat = null;
                if (result.aiCategory && result.aiCategory !== 'Other') {
                  matchedCat = categories.find(c => c.name.toLowerCase() === result.aiCategory.toLowerCase());
                }
                categoryId = matchedCat ? matchedCat.id : categories[0].id;
              } catch (err) {
                console.warn('Could not auto-assign category in batch', err);
              }

              const newTransaction = {
                title: result.merchantName || 'Unknown Merchant',
                amount: result.amount,
                type: result.type,
                date: originalSms.created_at || new Date().toISOString(),
                category_id: categoryId,
                user_id: userId,
                latitude: originalSms.latitude,
                longitude: originalSms.longitude,
                location_name: originalSms.location_name
              };
              
              await db('transactions').insert(newTransaction);
              console.log(`[SMS_BATCH_CRON] Inserted transaction for SMS ID ${originalSms.id}`);
            }

            // Mark SMS as processed
            await db('pending_sms').where({ id: originalSms.id }).update({ processed: true });
          }
        } catch (aiErr) {
          console.error(`[SMS_BATCH_CRON] Failed to parse batch for user ${userId}:`, aiErr);
          // If a batch fails (e.g. 503 or limit), we leave them unprocessed so they are picked up next cron run.
        }
      }
    }
    
    console.log('[SMS_BATCH_CRON] Batch processing complete.');
  } catch (err) {
    console.error('[SMS_BATCH_CRON] Error during batch processing:', err);
  }
}

/**
 * Initializes the cron jobs for SMS batch parsing.
 */
function initSmsCronJobs() {
  console.log('[CRON] Initializing SMS Batch Cron Jobs (Runs at 3:00 PM and 9:00 PM)');
  
  // Schedule at 15:00 (3 PM)
  cron.schedule('0 15 * * *', () => {
    processPendingSms();
  });

  // Schedule at 21:00 (9 PM)
  cron.schedule('0 21 * * *', () => {
    processPendingSms();
  });
}

// AWS Lambda Scheduled Event Handler
const handler = async (event, context) => {
  console.log('[AWS_LAMBDA] Running scheduled SMS batch processing...');
  // Ensure DB connection is established for AWS Lambda environments
  const { initDb } = require('../db/db');
  await initDb();
  await processPendingSms();
};

module.exports = {
  initSmsCronJobs,
  processPendingSms, // exported for manual triggering/testing
  handler
};
