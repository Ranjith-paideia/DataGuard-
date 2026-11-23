import { test, expect } from '@playwright/test';
import { ContractClient } from '../src/api/contractClient';
import {
  getOrderById,
  getAuditLogsByOrderId,
  closeDbPool,
  formatOrderRow,
  DbOrder,
} from '../src/db/dbClient';
import { executeQuery } from '../src/db/sqlServerClient';
import { Order } from '../src/schemas/order.schema';

const ADMIN_TOKEN = 'valid-admin-token';

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
    await closeDbPool();
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
    const dbOrder = await getOrderById(createdOrder.id);
    expect(dbOrder).not.toBeNull();
    expect(dbOrder!.id).toBe(createdOrder.id);
    expect(dbOrder!.item_name).toBe(testItemName);
    expect(dbOrder!.quantity).toBe(testQuantity);
    expect(Number(dbOrder!.amount)).toBe(testAmount);
    expect(dbOrder!.status).toBe('PENDING');

    // Verify audit_log entry
    const auditLogsAfterInsert = await getAuditLogsByOrderId(createdOrder.id);
    const createdLog = auditLogsAfterInsert.find((l) => l.action === 'CREATED');
    expect(createdLog).toBeDefined();

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
    const dbOrderAfterPatch = await getOrderById(createdOrder.id);
    expect(dbOrderAfterPatch).not.toBeNull();
    expect(dbOrderAfterPatch!.status).toBe('CONFIRMED');

    // Verify STATUS_UPDATED audit_log entry
    const auditLogsAfterPatch = await getAuditLogsByOrderId(createdOrder.id);
    const updatedLog = auditLogsAfterPatch.find((l) => l.action === 'STATUS_UPDATED');
    expect(updatedLog).toBeDefined();

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
    const dbOrderAfterDelete = await getOrderById(createdOrder.id);
    expect(dbOrderAfterDelete).toBeNull();

    // API should now return 404
    const verifyNotFoundRes = await client.get(`/api/orders/${createdOrder.id}`, {
      token: ADMIN_TOKEN,
    });
    expect(verifyNotFoundRes.status).toBe(404);
  });
});
