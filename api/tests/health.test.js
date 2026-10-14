import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import connectDB, { disconnectDB } from '../src/config/db.js';

describe('Health and Server Endpoints', () => {
  beforeAll(async () => {
    // Connect to test database if available
    try {
      await connectDB(process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/skinsentry_test', 2, 500);
    } catch {
      // Allow testing even if local DB is not currently connected
    }
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('GET /health returns 200 and database status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(['connected', 'disconnected']).toContain(res.body.db);
    expect(typeof res.body.uptime).toBe('number');
  });

  it('sets X-Request-ID header on all requests', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
  });
});
