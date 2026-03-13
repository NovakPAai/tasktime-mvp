import { afterEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('Health API', () => {
  it('GET /api/health - returns basic liveness payload', async () => {
    const { createApp } = await import('../src/app.js');
    const request = supertest(createApp());

    const response = await request.get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toBeTypeOf('string');
  });

  it('GET /api/ready - returns 200 when dependencies are ready', async () => {
    vi.doMock('../src/shared/health.js', () => ({
      getReadinessStatus: vi.fn().mockResolvedValue({
        status: 'ok',
        timestamp: '2026-03-12T00:00:00.000Z',
        checks: {
          database: 'up',
          redis: 'disabled',
        },
      }),
    }));

    const { createApp } = await import('../src/app.js');
    const request = supertest(createApp());

    const response = await request.get('/api/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      timestamp: '2026-03-12T00:00:00.000Z',
      checks: {
        database: 'up',
        redis: 'disabled',
      },
    });
  });

  it('GET /api/ready - returns 503 when dependencies are not ready', async () => {
    vi.doMock('../src/shared/health.js', () => ({
      getReadinessStatus: vi.fn().mockResolvedValue({
        status: 'error',
        timestamp: '2026-03-12T00:00:00.000Z',
        checks: {
          database: 'down',
          redis: 'down',
        },
      }),
    }));

    const { createApp } = await import('../src/app.js');
    const request = supertest(createApp());

    const response = await request.get('/api/ready');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('error');
    expect(response.body.checks).toEqual({
      database: 'down',
      redis: 'down',
    });
  });

});
