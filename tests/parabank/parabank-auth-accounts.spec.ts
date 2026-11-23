import { test, expect } from '@playwright/test';
import { CustomerSchema, AccountListSchema } from '../../src/schemas/parabank.schema';

test.describe('ParaBank Authentication & Accounts Practice Suite', () => {
  test('authenticate with demo credentials and retrieve customer accounts within latency limit', async ({ request }) => {
    // 1. Authenticate with demo credentials (with retry/warmup if needed for public network jitter)
    let loginRes = await request.get('login/john/demo');
    let startTime = performance.now();
    loginRes = await request.get('login/john/demo');
    const loginLatency = performance.now() - startTime;

    expect(loginRes.status()).toBe(200);
    const PARABANK_LATENCY = Number(process.env.PARABANK_LATENCY_THRESHOLD_MS || '5000');
    expect(loginLatency).toBeLessThan(PARABANK_LATENCY);

    const loginData = await loginRes.json();
    const customerValidation = CustomerSchema.safeParse(loginData);
    expect(customerValidation.success, `Customer schema validation failed: ${JSON.stringify(customerValidation)}`).toBe(true);

    const customer = customerValidation.data!;
    expect(customer.firstName).toBe('John');
    expect(customer.lastName).toBe('Smith');
    expect(customer.id).toBeGreaterThan(0);

    // 2. Fetch customer accounts using extracted customerId
    const accountsStart = performance.now();
    const accountsRes = await request.get(`customers/${customer.id}/accounts`);
    const accountsLatency = performance.now() - accountsStart;

    expect(accountsRes.status()).toBe(200);
    const PARABANK_ACCOUNTS_LATENCY = Number(process.env.PARABANK_LATENCY_THRESHOLD_MS || '5000');
    expect(accountsLatency).toBeLessThan(PARABANK_ACCOUNTS_LATENCY);

    const accountsData = await accountsRes.json();
    const accountsValidation = AccountListSchema.safeParse(accountsData);
    expect(accountsValidation.success, `Account list schema validation failed: ${JSON.stringify(accountsValidation)}`).toBe(true);

    const accounts = accountsValidation.data!;
    expect(accounts.length).toBeGreaterThan(0);
    for (const acc of accounts) {
      expect(acc.customerId).toBe(customer.id);
      expect(typeof acc.balance).toBe('number');
    }
  });
});
