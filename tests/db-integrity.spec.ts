import { test, expect } from '@playwright/test';
import { ContractClient } from '../src/api/contractClient';
import { executeQuery, closePool } from '../src/db/sqlServerClient';
import { Order } from '../src/schemas/order.schema';

const ADMIN_TOKEN = 'valid-admin-token';

interface DbOrder {
  id: number;
  user_id: number;
  item_name: string;
  quantity: number;
  amount: number;
  status: string;
  created_at: Date;
}

interface DbAuditLog {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  created_at: Date;
}

test.describe('SQL Integrity & Full Lifecycle Verification Suite', () => {
  let client: ContractClient;
  const createdOrderIds: number[] = [];

  test.beforeEach(({ request }) => {
    client = new ContractClient(request);
  });

  test.afterEach(async () => {
    // Safety cleanup: Ensure all test artifacts in SQL are removed even if an assertion fails
    while (createdOrderIds.length > 0) {
      const orderId = createdOrderIds.pop();
      if (orderId) {
        try {
          await executeQuery('DELETE FROM dbo.audit_logs WHERE entity_type = @entityType AND entity_id = @id', {
            entityType: 'ORDER',
            id: orderId,
          });
          await executeQuery('DELETE FROM dbo.orders WHERE id = @id', { id: orderId });
        } catch (cleanupError) {
          console.error(`Cleanup failed for order ${orderId}:`, cleanupError);
        }
      }
    }
  });

  test.afterAll(async () => {
    await closePool();
  });

  test('Complete Lifecycle (POST -> GET -> PATCH -> DELETE) with SQL-level parity assertions', async () => {
    const testItemName = 'End-to-End Enterprise Firewall License';
    const testQuantity = 3;
    const testAmount = 599.97;

    // ------------------------------------------------------------------------
    // Step 1: POST /api/orders (Create Order)
    // ------------------------------------------------------------------------
    const postRes = await client.post<Order>('/api/orders', {
      token: ADMIN_TOKEN,
      data: {
        item_name: testItemName,
        quantity: testQuantity,
        amount: testAmount,
      },
    });

    expect(postRes.status).toBe(201);
    const createdOrder = postRes.body;
    expect(createdOrder.id).toBeGreaterThan(0);
    expect(createdOrder.item_name).toBe(testItemName);
    expect(createdOrder.quantity).toBe(testQuantity);
    expect(createdOrder.amount).toBe(testAmount);
    expect(createdOrder.status).toBe('PENDING');

    createdOrderIds.push(createdOrder.id);

    // Direct SQL Assertions for Step 1
    const dbOrdersAfterInsert = await executeQuery<DbOrder>(
      'SELECT id, user_id, item_name, quantity, amount, status, created_at FROM dbo.orders WHERE id = @id',
      { id: createdOrder.id }
    );
    expect(dbOrdersAfterInsert.length).toBe(1);
    const dbOrder = dbOrdersAfterInsert[0];
    expect(dbOrder.id).toBe(createdOrder.id);
    expect(dbOrder.item_name).toBe(testItemName);
    expect(dbOrder.quantity).toBe(testQuantity);
    expect(Number(dbOrder.amount)).toBe(testAmount);
    expect(dbOrder.status).toBe('PENDING');

    // Verify audit_log entry in SQL Server
    const auditLogsAfterInsert = await executeQuery<DbAuditLog>(
      'SELECT id, entity_type, entity_id, action FROM dbo.audit_logs WHERE entity_type = @entityType AND entity_id = @id AND action = @action',
      { entityType: 'ORDER', id: createdOrder.id, action: 'CREATED' }
    );
    expect(auditLogsAfterInsert.length).toBe(1);
    expect(auditLogsAfterInsert[0].action).toBe('CREATED');

    // ------------------------------------------------------------------------
    // Step 2: GET /api/orders/:id (Read Order)
    // ------------------------------------------------------------------------
    const getRes = await client.get<Order>(`/api/orders/${createdOrder.id}`, {
      token: ADMIN_TOKEN,
    });
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(createdOrder.id);
    expect(getRes.body.item_name).toBe(testItemName);
    expect(getRes.body.quantity).toBe(testQuantity);
    expect(getRes.body.amount).toBe(testAmount);
    expect(getRes.body.status).toBe('PENDING');

    // ------------------------------------------------------------------------
    // Step 3: PATCH /api/orders/:id/status (Update Status)
    // ------------------------------------------------------------------------
    const patchRes = await client.patch<Order>(`/api/orders/${createdOrder.id}/status`, {
      token: ADMIN_TOKEN,
      data: { status: 'CONFIRMED' },
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe('CONFIRMED');

    // Direct SQL Assertions for Step 3
    const dbOrdersAfterPatch = await executeQuery<DbOrder>(
      'SELECT id, status FROM dbo.orders WHERE id = @id',
      { id: createdOrder.id }
    );
    expect(dbOrdersAfterPatch.length).toBe(1);
    expect(dbOrdersAfterPatch[0].status).toBe('CONFIRMED');

    // Verify STATUS_UPDATED audit_log entry in SQL Server
    const auditLogsAfterPatch = await executeQuery<DbAuditLog>(
      'SELECT id, action FROM dbo.audit_logs WHERE entity_type = @entityType AND entity_id = @id AND action = @action',
      { entityType: 'ORDER', id: createdOrder.id, action: 'STATUS_UPDATED' }
    );
    expect(auditLogsAfterPatch.length).toBe(1);
    expect(auditLogsAfterPatch[0].action).toBe('STATUS_UPDATED');

    // ------------------------------------------------------------------------
    // Step 4: DELETE /api/orders/:id (Delete Order)
    // ------------------------------------------------------------------------
    const deleteRes = await client.delete<{ deleted: boolean; id: number }>(
      `/api/orders/${createdOrder.id}`,
      { token: ADMIN_TOKEN }
    );
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ deleted: true, id: createdOrder.id });

    // Direct SQL Assertions for Step 4
    const dbOrdersAfterDelete = await executeQuery<DbOrder>(
      'SELECT id FROM dbo.orders WHERE id = @id',
      { id: createdOrder.id }
    );
    expect(dbOrdersAfterDelete.length).toBe(0);

    // API should now return 404
    const verifyNotFoundRes = await client.get(`/api/orders/${createdOrder.id}`, {
      token: ADMIN_TOKEN,
    });
    expect(verifyNotFoundRes.status).toBe(404);
  });
});
