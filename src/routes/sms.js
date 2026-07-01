const express = require('express');
const router = express.Router();
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { parseSmsWithAI } = require('../services/aiSmsService');
const { db } = require('../db/db');

// Initialize SQS Client
const sqs = new SQSClient({ region: process.env.AWS_REGION || 'ap-south-1' });

/**
 * POST /api/sms/raw
 * Ingestion endpoint for raw SMS strings from the mobile app.
 * In production, it pushes to SQS for async processing.
 * In development, it processes synchronously for easy testing.
 */
router.post('/raw', async (req, res) => {
  const { raw_text, source_app, latitude, longitude, location_name } = req.body;
  const userId = req.user.id;

  if (!raw_text) {
    return res.status(400).json({ error: 'Missing raw_text' });
  }

  const payload = {
    userId,
    raw_text,
    source_app,
    latitude,
    longitude,
    location_name,
    timestamp: new Date().toISOString()
  };

  // If local dev environment, process immediately without SQS
  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('[SMS_API] Local environment detected. Processing SMS synchronously via AI...');
      const parsed = await parseSmsWithAI(raw_text);
      
      if (!parsed || !parsed.isValid) {
        console.log('[SMS_API] AI determined this is not a valid transaction SMS.');
        return res.status(202).json({ message: 'Processed locally (ignored by AI)' });
      }
      
      // Attempt to map the AI's category to a DB category
      let categoryId = null;
      try {
        const categories = await db('categories').where({ user_id: userId }).orWhereNull('user_id');
        
        // Find exact match from AI
        let matchedCat = null;
        if (parsed.aiCategory && parsed.aiCategory !== 'Other') {
          matchedCat = categories.find(c => c.name.toLowerCase() === parsed.aiCategory.toLowerCase());
        }
        
        // If no match, fallback to the first category (usually Food & Dining)
        categoryId = matchedCat ? matchedCat.id : categories[0].id;
      } catch (err) {
        console.warn('Could not auto-assign category', err);
      }

      const tx = {
        user_id: userId,
        title: parsed.merchantName || 'Unknown Merchant',
        amount: parsed.amount || 0,
        type: parsed.type || 'expense',
        date: new Date().toISOString(),
        category_id: categoryId,
        latitude: latitude || null,
        longitude: longitude || null,
        location_name: location_name || null,
        notes: `AI Parsed. Payment: ${parsed.paymentMethod || 'unknown'}. Card: ${parsed.cardName || 'N/A'}. Raw Text: "${raw_text}"`,
      };

      await db('transactions').insert(tx);
      console.log('[SMS_API] Successfully logged AI-parsed transaction locally.');
      
      return res.status(200).json({ message: 'Processed locally and saved' });
    } catch (error) {
      console.error('[SMS_API] Error during local sync processing:', error);
      return res.status(500).json({ error: 'Local processing failed', details: error.message });
    }
  }

  // Production environment: Push to SQS Queue
  try {
    const queueUrl = process.env.SQS_SMS_QUEUE_URL;
    
    if (!queueUrl) {
      console.error('[SMS_API] Missing SQS_SMS_QUEUE_URL');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload)
    });

    await sqs.send(command);
    console.log('[SMS_API] SMS queued to SQS successfully.');
    
    // Return 202 Accepted immediately so mobile app can sleep
    return res.status(202).json({ message: 'Accepted and queued' });
  } catch (error) {
    console.error('[SMS_API] Failed to queue to SQS:', error);
    return res.status(500).json({ error: 'Failed to queue message' });
  }
});

module.exports = router;
