/**
 * API Integration Tests
 * Tests for all API endpoints in server.js
 */

const request = require('supertest');
const express = require('express');

// Mock environment variables before requiring server
process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.AIRTABLE_API_KEY = 'test-airtable-key';
process.env.EXCHANGE_RATE_API_KEY = 'test-exchange-key';
process.env.YOCO_PUBLIC_KEY = 'test-yoco-public-key';
process.env.REDIS_URL = ''; // Disable Redis for tests

// Load server after setting env vars
let app;
let server;

beforeAll(() => {
  // Import server after env vars are set
  delete require.cache[require.resolve('../../server.js')];
  const serverModule = require('../../server.js');
  app = serverModule.app;
  
  if (!app) {
    throw new Error('Failed to load Express app from server.js');
  }
});

describe('Health Check Endpoint', () => {
  test('GET /health returns 200 with status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);
    
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
  });
});

describe('Create Checkout Endpoint', () => {
  test('POST /api/create-checkout requires amount and currency', async () => {
    const response = await request(app)
      .post('/api/create-checkout')
      .send({})
      .expect(400);
    
    expect(response.body).toHaveProperty('error');
  });

  test('POST /api/create-checkout validates amount', async () => {
    const response = await request(app)
      .post('/api/create-checkout')
      .send({ amount: -100, currency: 'ZAR' })
      .expect(400);
    
    expect(response.body.error).toHaveProperty('message');
  });

  test('POST /api/create-checkout validates currency', async () => {
    const response = await request(app)
      .post('/api/create-checkout')
      .send({ amount: 1000, currency: 'INVALID' })
      .expect(400);
    
    expect(response.body.error).toHaveProperty('message');
  });
});

describe('Login Endpoint', () => {
  test('POST /api/login requires password', async () => {
    const response = await request(app)
      .post('/api/login')
      .send({})
      .expect(400);
    
    expect(response.body).toHaveProperty('error');
  });

  test('POST /api/login rejects incorrect password', async () => {
    const response = await request(app)
      .post('/api/login')
      .send({ password: 'wrong-password' })
      .expect(401);
    
    expect(response.body).toHaveProperty('error');
  });
});

describe('Send Email Endpoint', () => {
  test('POST /api/send-email requires name, email, and message', async () => {
    const response = await request(app)
      .post('/api/send-email')
      .send({})
      .expect(400);
    
    expect(response.body).toHaveProperty('error');
  });

  test('POST /api/send-email validates email format', async () => {
    const response = await request(app)
      .post('/api/send-email')
      .send({
        name: 'Test',
        email: 'invalid-email',
        message: 'Test message'
      })
      .expect(400);
    
    expect(response.body.error).toHaveProperty('message');
  });
});

describe('Get Emails Endpoint', () => {
  test('GET /api/get-emails requires authentication', async () => {
    const response = await request(app)
      .get('/api/get-emails')
      .expect(401);
    
    expect(response.body).toHaveProperty('error');
  });

  test('GET /api/get-emails rejects invalid token', async () => {
    const response = await request(app)
      .get('/api/get-emails')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
    
    expect(response.body).toHaveProperty('error');
  });
});

describe('Airtable Endpoint', () => {
  test('GET /api/airtable requires base and table', async () => {
    const response = await request(app)
      .get('/api/airtable')
      .expect(400);
    
    expect(response.body).toHaveProperty('error');
  });
});

describe('Reports Endpoint', () => {
  test('POST /api/reports requires name, email, type, and message', async () => {
    const response = await request(app)
      .post('/api/reports')
      .send({})
      .expect(400);
    
    expect(response.body).toHaveProperty('error');
  });

  test('POST /api/reports validates report type', async () => {
    const response = await request(app)
      .post('/api/reports')
      .send({
        name: 'Test',
        email: 'test@example.com',
        type: 'invalid-type',
        message: 'Test message'
      })
      .expect(400);
    
    expect(response.body.error).toHaveProperty('message');
  });
});

describe('Convert Currency Endpoint', () => {
  test('POST /api/convert-currency requires amount, from, and to', async () => {
    const response = await request(app)
      .post('/api/convert-currency')
      .send({})
      .expect(400);
    
    expect(response.body).toHaveProperty('error');
  });

  test('POST /api/convert-currency validates currency codes', async () => {
    const response = await request(app)
      .post('/api/convert-currency')
      .send({
        amount: 1000,
        from: 'INVALID',
        to: 'ZAR'
      })
      .expect(400);
    
    expect(response.body.error).toHaveProperty('message');
  });
});

describe('Get Yoco Public Key Endpoint', () => {
  test('GET /api/get-yoco-public-key returns public key', async () => {
    const response = await request(app)
      .get('/api/get-yoco-public-key')
      .expect(200);
    
    expect(response.body).toHaveProperty('publicKey');
  });
});

describe('i18n Endpoints', () => {
  test('GET /api/i18n/:language validates language code', async () => {
    const response = await request(app)
      .get('/api/i18n/invalid-language-code-123')
      .expect(400);
    
    expect(response.body).toHaveProperty('error');
  });

  test('GET /api/i18n/:language accepts valid language code', async () => {
    const response = await request(app)
      .get('/api/i18n/en')
      .expect(200);
    
    expect(response.body).toHaveProperty('language');
  });
});

describe('404 Handler', () => {
  test('Unknown routes return 404', async () => {
    const response = await request(app)
      .get('/api/unknown-endpoint')
      .expect(404);
    
    expect(response.body).toHaveProperty('error');
  });
});

