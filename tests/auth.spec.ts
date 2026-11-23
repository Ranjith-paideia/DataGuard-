import { test, expect } from '@playwright/test';
import { ContractClient } from '../src/api/contractClient';
import { closePool } from '../src/db/sqlServerClient';

const ADMIN_TOKEN = 'valid-admin-token';
const VIEWER_TOKEN = 'valid-viewer-token';
const INVALID_TOKEN = 'completely-invalid-token';

test.describe('Authentication & Authorization Suite', () => {
  let client: ContractClient;

  test.beforeEach(({ request }) => {
    client = new ContractClient(request);
  });

  test.afterAll(async () => {
    await closePool();
  });

  test('Missing Authorization header returns 401 Unauthorized', async () => {
    const res = await client.get('/api/orders');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test('Invalid Bearer token returns 401 Unauthorized', async () => {
    const res = await client.get('/api/orders', { token: INVALID_TOKEN });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test('Malformed Authorization header (no Bearer prefix) returns 401 Unauthorized', async () => {
    const res = await client.get('/api/orders', {
      headers: { Authorization: `Basic ${ADMIN_TOKEN}` },
    });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test('Viewer token can read orders (GET /api/orders returns 200)', async () => {
    const res = await client.get('/api/orders', { token: VIEWER_TOKEN });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('Viewer token cannot create order (POST /api/orders returns 403 Forbidden)', async () => {
    const res = await client.post('/api/orders', {
      token: VIEWER_TOKEN,
      data: {
        item_name: 'Unauthorized Viewer Order',
        quantity: 1,
        amount: 50.0,
      },
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test('Admin token can access GET /api/orders with 200 OK', async () => {
    const res = await client.get('/api/orders', { token: ADMIN_TOKEN });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
