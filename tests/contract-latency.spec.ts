import { test, expect } from '@playwright/test';
import { ContractClient } from '../src/api/contractClient';
import { closeDbPool, getAuditLogsByOrderId, deleteOrdersByItemName } from '../src/db/dbClient';
import {
  OrderSchema,
  OrderListSchema,
  ErrorResponseSchema,
} from '../src/schemas/order.schema';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import orderJsonSchema from '../contracts/order.schema.json';
import orderListJsonSchema from '../contracts/order-list.schema.json';

const ADMIN_TOKEN = 'valid-admin-token';
const LATENCY_THRESHOLD_MS = parseInt(
  process.env.API_LATENCY_THRESHOLD_MS || '500',
  10
);

// Compile JSON Schema validators using Ajv
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateOrder = ajv.compile(orderJsonSchema);
const validateOrderList = ajv.compile(orderListJsonSchema);

test.describe('Contract & Latency Benchmark Suite', () => {
  let client: ContractClient;
  const createdOrderIds: number[] = [];

  test.beforeEach(({ request }) => {
    client = new ContractClient(request);
  });

  test.afterEach(async () => {
    // Clean up any test orders and their audit_log entries
    while (createdOrderIds.length > 0) {
      const id = createdOrderIds.pop();
      if (id) {
        await deleteOrdersByItemName('Latency & Contract Benchmark Item');
      }
    }
  });

  test.afterAll(async () => {
    await closeDbPool();
  });

  test('GET /api/orders complies with OrderListSchema, JSON Schema, and satisfies latency threshold', async () => {
    const response = await client.get('/api/orders', { token: ADMIN_TOKEN });

    // Assert status and latency
    expect(response.status).toBe(200);
    expect(response.latencyMs).toBeLessThanOrEqual(LATENCY_THRESHOLD_MS);

    // Validate payload against Zod contract
    const parseResult = OrderListSchema.safeParse(response.body);
    expect(parseResult.success).toBe(true);

    // Validate payload against JSON Schema contract
    const jsonSchemaValid = validateOrderList(response.body);
    expect(jsonSchemaValid, `JSON Schema errors: ${JSON.stringify(validateOrderList.errors)}`).toBe(true);
  });

  test('POST /api/orders complies with OrderSchema, JSON Schema, and satisfies latency threshold', async () => {
    const payload = {
      item_name: 'Latency & Contract Benchmark Item',
      quantity: 5,
      amount: 125.5,
    };

    const response = await client.post('/api/orders', {
      token: ADMIN_TOKEN,
      data: payload,
    });

    expect(response.status).toBe(201);
    expect(response.latencyMs).toBeLessThanOrEqual(LATENCY_THRESHOLD_MS);

    // Validate created order against Zod
    const parseResult = OrderSchema.safeParse(response.body);
    expect(parseResult.success).toBe(true);

    // Validate created order against JSON Schema
    const jsonSchemaValid = validateOrder(response.body);
    expect(jsonSchemaValid, `JSON Schema errors: ${JSON.stringify(validateOrder.errors)}`).toBe(true);

    if (parseResult.success) {
      createdOrderIds.push(parseResult.data.id);
      expect(parseResult.data.item_name).toBe(payload.item_name);
      expect(parseResult.data.quantity).toBe(payload.quantity);
      expect(parseResult.data.amount).toBe(payload.amount);
      expect(parseResult.data.status).toBe('PENDING');
    }
  });

  test('Error responses comply strictly with ErrorResponseSchema', async () => {
    // 1. 404 Not Found error contract
    const notFoundRes = await client.get('/api/orders/999999', {
      token: ADMIN_TOKEN,
    });
    expect(notFoundRes.status).toBe(404);
    const notFoundParsed = ErrorResponseSchema.safeParse(notFoundRes.body);
    expect(notFoundParsed.success).toBe(true);

    // 2. 401 Unauthorized error contract
    const unauthRes = await client.get('/api/orders');
    expect(unauthRes.status).toBe(401);
    const unauthParsed = ErrorResponseSchema.safeParse(unauthRes.body);
    expect(unauthParsed.success).toBe(true);

    // 3. 422 Validation error contract
    const validationRes = await client.post('/api/orders', {
      token: ADMIN_TOKEN,
      data: { item_name: '', quantity: 0, amount: -10 },
    });
    expect(validationRes.status).toBe(422);
    const validationParsed = ErrorResponseSchema.safeParse(validationRes.body);
    expect(validationParsed.success).toBe(true);
  });
});
