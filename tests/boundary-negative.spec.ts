import { test, expect } from '@playwright/test';
import { ContractClient } from '../src/api/contractClient';
import { executeQuery, closePool } from '../src/db/sqlServerClient';

const ADMIN_TOKEN = 'valid-admin-token';

test.describe('Boundary & Negative Test Suite with SQL Integrity Guard', () => {
  let client: ContractClient;

  test.beforeEach(({ request }) => {
    client = new ContractClient(request);
  });

  test.afterAll(async () => {
    await closePool();
  });

  test('POST /api/orders boundary validation: empty item_name returns 422', async () => {
    const res = await client.post('/api/orders', {
      token: ADMIN_TOKEN,
      data: { item_name: '   ', quantity: 1, amount: 10.0 },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
  });

  test('POST /api/orders boundary validation: 151-char item_name returns 422', async () => {
    const tooLongName = 'A'.repeat(151);
    const res = await client.post('/api/orders', {
      token: ADMIN_TOKEN,
      data: { item_name: tooLongName, quantity: 1, amount: 10.0 },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
  });

  test('POST /api/orders boundary validation: quantity = 0 returns 422', async () => {
    const res = await client.post('/api/orders', {
      token: ADMIN_TOKEN,
      data: { item_name: 'Zero Quantity Item', quantity: 0, amount: 10.0 },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
  });

  test('POST /api/orders boundary validation: quantity = -5 returns 422', async () => {
    const res = await client.post('/api/orders', {
      token: ADMIN_TOKEN,
      data: { item_name: 'Negative Quantity Item', quantity: -5, amount: 10.0 },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
  });

  test('POST /api/orders boundary validation: quantity = 1001 returns 422', async () => {
    const res = await client.post('/api/orders', {
      token: ADMIN_TOKEN,
      data: { item_name: 'Excess Quantity Item', quantity: 1001, amount: 10.0 },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
  });

  test('POST /api/orders boundary validation: amount = 0 returns 422', async () => {
    const res = await client.post('/api/orders', {
      token: ADMIN_TOKEN,
      data: { item_name: 'Zero Amount Item', quantity: 1, amount: 0 },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
  });

  test('POST /api/orders boundary validation: amount = -10 returns 422', async () => {
    const res = await client.post('/api/orders', {
      token: ADMIN_TOKEN,
      data: { item_name: 'Negative Amount Item', quantity: 1, amount: -10 },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
  });

  test('POST /api/orders boundary validation: missing required fields returns 422', async () => {
    const res = await client.post('/api/orders', {
      token: ADMIN_TOKEN,
      data: {},
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
  });

  test('GET /api/orders/:id invalid format (non-numeric "abc") returns 400', async () => {
    const res = await client.get('/api/orders/abc', {
      token: ADMIN_TOKEN,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid order ID' });
  });

  test('GET /api/orders/:id non-existent ID (999999) returns 404', async () => {
    const res = await client.get('/api/orders/999999', {
      token: ADMIN_TOKEN,
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Order not found' });
  });

  test('SQL Integrity Verification: Proves zero dirty/invalid rows were written to SQL Server', async () => {
    // Query directly in database for any items with known negative test markers
    const dirtyRows = await executeQuery<{ count: number }>(
      `SELECT COUNT(*) AS count 
       FROM dbo.orders 
       WHERE quantity <= 0 
          OR quantity > 1000 
          OR amount <= 0 
          OR item_name = '   ' 
          OR LEN(item_name) > 150`
    );

    expect(dirtyRows[0].count).toBe(0);
  });
});
