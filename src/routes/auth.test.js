
const request = require('supertest');
const express = require('express');
const authRouter = require('./auth');
const { db, initDb } = require('../db/db');

// Define the Vertical Slice we are testing
// Vertical Slice: Phone Authentication Flow (Send OTP -> Verify OTP -> Get JWT)

const app = express();
app.use(express.json());
app.use('/auth', authRouter);

describe('Auth Routes (Phone + OTP)', () => {
  beforeAll(async () => {
    // We are running in 'test' environment hopefully, but SQLite handles creation
    await initDb();
  });

  afterAll(async () => {
    // Cleanup users and otps
    await db('users').del();
    if (await db.schema.hasTable('otps')) {
      await db('otps').del();
    }
  });

  it('POST /auth/send-otp should fail if phone_number is missing', async () => {
    const res = await request(app).post('/auth/send-otp').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('POST /auth/send-otp should generate OTP for a valid phone number', async () => {
    const res = await request(app).post('/auth/send-otp').send({ phone_number: '+1234567890' });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('OTP sent successfully.');
  });

  it('POST /auth/verify-otp should fail with invalid OTP', async () => {
    const res = await request(app).post('/auth/verify-otp').send({
      phone_number: '+1234567890',
      otp_code: '000000'
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid or expired OTP.');
  });

  it('POST /auth/verify-otp should create a user and return JWT if valid (Register)', async () => {
    // We mock the DB to have an OTP for this since we don't know the generated one
    await db('otps').insert({
      phone_number: '+1999999999',
      otp_code: '123456',
      expires_at: new Date(Date.now() + 10 * 60 * 1000) // 10 mins future
    });

    const res = await request(app).post('/auth/verify-otp').send({
      phone_number: '+1999999999',
      otp_code: '123456',
      name: 'Test User'
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.phone_number).toBe('+1999999999');
    expect(res.body.user.name).toBe('Test User');
  });
});
