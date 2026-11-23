import { test, expect } from '@playwright/test';
import { AccountSchema, AccountListSchema, CustomerSchema } from '../../src/schemas/parabank.schema';

test.describe('ParaBank Transfer & Negative Practice Suite', () => {
  let fromAccountId: number;
  let toAccountId: number;

  test.beforeAll(async ({ request }) => {
    // Obtain valid accounts from demo customer
    const loginRes = await request.get('login/john/demo');
    expect(loginRes.status()).toBe(200);
    const customer = CustomerSchema.parse(await loginRes.json());

    const accountsRes = await request.get(`customers/${customer.id}/accounts`);
    expect(accountsRes.status()).toBe(200);
    const accounts = AccountListSchema.parse(await accountsRes.json());
    fromAccountId = accounts[0].id;
    toAccountId = accounts.length > 1 ? accounts[1].id : accounts[0].id;
  });

  test('fetch valid account details and transfer a small amount', async ({ request }) => {
    // 1. Fetch valid account details
    const accountRes = await request.get(`accounts/${fromAccountId}`);
    expect(accountRes.status()).toBe(200);

    const accountData = await accountRes.json();
    const validation = AccountSchema.safeParse(accountData);
    expect(validation.success, `Account schema validation failed: ${JSON.stringify(validation)}`).toBe(true);
    expect(validation.data!.id).toBe(fromAccountId);

    // 2. Execute transfer between accounts
    const transferRes = await request.post(
      `transfer?fromAccountId=${fromAccountId}&toAccountId=${toAccountId}&amount=10`
    );
    expect(transferRes.status()).toBe(200);
    const transferText = await transferRes.text();
    expect(transferText).toContain('Successfully transferred');
  });

  test('negative: invalid credentials returns 400', async ({ request }) => {
    const res = await request.get('login/invalid_user/wrong_pass');
    expect(res.status()).toBe(400);
  });

  test('negative: non-existent account ID returns 400', async ({ request }) => {
    const res = await request.get('accounts/999999999');
    expect(res.status()).toBe(400);
  });

  test('boundary: non-numeric account ID returns 400 or 404', async ({ request }) => {
    const res = await request.get('accounts/abc');
    expect([400, 404]).toContain(res.status());
  });
});
