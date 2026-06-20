const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'geo-finance-super-secret-key-123!';

// POST /register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required.' });
  }

  try {
    // Check if email already exists
    const existingUser = await db('users').where('email', email.toLowerCase()).first();
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email address already exists.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const insertedUser = await db('users').insert({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      name
    }).returning('id');

    const userId = typeof insertedUser[0] === 'object' ? insertedUser[0].id : insertedUser[0];

    // Generate JWT token
    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      token,
      user: {
        id: userId,
        email: email.toLowerCase(),
        name
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // Find user
    const user = await db('users').where('email', email.toLowerCase()).first();
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Compare password hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /me (In-app deletion)
router.delete('/me', requireAuth, async (req, res) => {
  try {
    // ON DELETE CASCADE handles related data
    await db('users').where('id', req.user.id).del();
    res.json({ success: true, message: 'Account and all associated data permanently deleted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /delete-account (Web-based form for Google Play Compliance)
router.get('/delete-account', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Delete Account - Geo-Finance Tracker</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0B0F19; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .card { background-color: #1F2937; padding: 32px; border-radius: 12px; width: 100%; max-width: 400px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3); }
        h2 { color: #EF4444; margin-top: 0; }
        p { color: #9CA3AF; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
        .input-group { margin-bottom: 16px; }
        label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; color: #D1D5DB; }
        input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #374151; background-color: #111827; color: #fff; box-sizing: border-box; }
        button { width: 100%; padding: 14px; background-color: #EF4444; color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer; margin-top: 8px; }
        button:hover { background-color: #DC2626; }
        .alert { padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; display: none; }
        .alert.error { background-color: rgba(239, 68, 68, 0.2); color: #FCA5A5; border: 1px solid rgba(239, 68, 68, 0.3); display: block; }
        .alert.success { background-color: rgba(16, 185, 129, 0.2); color: #6EE7B7; border: 1px solid rgba(16, 185, 129, 0.3); display: block; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Delete Account</h2>
        <p>Warning: This action is irreversible. All your transactions, categories, and goals will be permanently erased.</p>
        
        <div id="messageBox" class="alert"></div>

        <form id="deleteForm">
          <div class="input-group">
            <label>Email Address</label>
            <input type="email" id="email" required placeholder="you@example.com">
          </div>
          <div class="input-group">
            <label>Password</label>
            <input type="password" id="password" required placeholder="••••••••">
          </div>
          <button type="submit" id="submitBtn">Permanently Delete Account</button>
        </form>
      </div>

      <script>
        document.getElementById('deleteForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const email = document.getElementById('email').value;
          const password = document.getElementById('password').value;
          const msgBox = document.getElementById('messageBox');
          const btn = document.getElementById('submitBtn');

          btn.disabled = true;
          btn.innerText = 'Processing...';
          msgBox.className = 'alert';
          
          try {
            const res = await fetch('/api/auth/delete-account', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            
            if (res.ok) {
              msgBox.innerText = data.message;
              msgBox.className = 'alert success';
              document.getElementById('deleteForm').reset();
              btn.style.display = 'none';
            } else {
              msgBox.innerText = data.error || 'Failed to delete account.';
              msgBox.className = 'alert error';
              btn.disabled = false;
              btn.innerText = 'Permanently Delete Account';
            }
          } catch (err) {
            msgBox.innerText = 'A network error occurred.';
            msgBox.className = 'alert error';
            btn.disabled = false;
            btn.innerText = 'Permanently Delete Account';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// POST /delete-account (Web-based form submission)
router.post('/delete-account', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await db('users').where('email', email.toLowerCase()).first();
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials or account does not exist.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    // ON DELETE CASCADE handles related data
    await db('users').where('id', user.id).del();
    
    res.json({ success: true, message: 'Your account and all associated data have been permanently deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'An internal error occurred while trying to delete the account.' });
  }
});

// POST /forgot-password (Send 6-digit verification code via email)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  try {
    const user = await db('users').where('email', email.toLowerCase()).first();
    if (!user) {
      // Don't reveal if email exists for security
      return res.json({ success: true, message: 'If this email exists, a verification code has been sent.' });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Invalidate any existing codes for this email
    await db('password_resets').where('email', email.toLowerCase()).update({ used: true });

    // Store the new code
    await db('password_resets').insert({
      email: email.toLowerCase(),
      code,
      expires_at: expiresAt,
      used: false,
    });

    // Send email using Resend if API key is configured, otherwise log it for dev
    if (process.env.RESEND_API_KEY) {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);

      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email.toLowerCase(),
        subject: 'Password Reset Code - Geo-Finance Tracker',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #1F2937; color: #fff; border-radius: 12px;">
            <h2 style="color: #8B5CF6; margin-top: 0;">Password Reset</h2>
            <p style="color: #D1D5DB;">You requested a password reset for your Geo-Finance Tracker account. Use the code below to verify your identity:</p>
            <div style="background: #111827; padding: 20px; border-radius: 8px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #8B5CF6;">${code}</span>
            </div>
            <p style="color: #9CA3AF; font-size: 13px;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
          </div>
        `,
      });
    } else {
      console.log(`\n======================================================`);
      console.log(`[DEV MODE] Forgot Password Code for ${email}: ${code}`);
      console.log(`======================================================\n`);
    }

    res.json({ success: true, message: 'If this email exists, a verification code has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
  }
});

// POST /verify-code (Verify the 6-digit code)
router.post('/verify-code', async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required.' });
  }

  try {
    const resetEntry = await db('password_resets')
      .where('email', email.toLowerCase())
      .where('code', code)
      .where('used', false)
      .orderBy('created_at', 'desc')
      .first();

    if (!resetEntry) {
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }

    // Check expiry
    if (new Date(resetEntry.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    res.json({ success: true, message: 'Code verified successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /reset-password (Set a new password after code verification)
router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'Email, code, and new password are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    // Re-verify the code
    const resetEntry = await db('password_resets')
      .where('email', email.toLowerCase())
      .where('code', code)
      .where('used', false)
      .orderBy('created_at', 'desc')
      .first();

    if (!resetEntry || new Date(resetEntry.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user password
    await db('users').where('email', email.toLowerCase()).update({ password_hash: passwordHash });

    // Mark code as used
    await db('password_resets').where('id', resetEntry.id).update({ used: true });

    res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
