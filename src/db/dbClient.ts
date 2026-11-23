import 'dotenv/config';
import type { Order } from '../schemas/order.schema';

/**
 * Dialect-safe database repository.
 * Routes all operations based on DB_DIALECT env var ('mssql' | 'mysql').
 * Keeps dialect-specific SQL isolated — never executes T-SQL against MySQL or vice versa.
 */

const DIALECT = (process.env.DB_DIALECT || 'mssql').toLowerCase();

// ─── Shared Types ──────────────────────────────────────────────────────────

export interface DbUser {
  id: number;
  email: string;
  role: 'admin' | 'viewer';
  api_token: string;
}

export interface DbOrder {
  id: number;
  user_id: number;
  item_name: string;
  quantity: number;
  amount: number;
  status: string;
  created_at: Date | string;
}

export interface DbAuditLog {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  created_at: Date | string;
}

/**
 * Normalizes a database row into the strict API Order contract.
 */
export function formatOrderRow(row: DbOrder): Order {
  return {
    id: row.id,
    user_id: row.user_id,
    item_name: row.item_name,
    quantity: row.quantity,
    amount: Number(row.amount),
    status: row.status as Order['status'],
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

// ─── Health Check ──────────────────────────────────────────────────────────

export async function checkDbHealth(): Promise<boolean> {
  if (DIALECT === 'mysql') {
    const { executeMySqlQuery } = await import('./mysqlClient');
    await executeMySqlQuery('SELECT 1 AS ok');
    return true;
  }
  const { getPool } = await import('./sqlServerClient');
  const pool = await getPool();
  await pool.request().query('SELECT 1 AS ok');
  return true;
}

// ─── User Lookup ───────────────────────────────────────────────────────────

export async function findUserByToken(token: string): Promise<DbUser | null> {
  if (DIALECT === 'mysql') {
    const { executeMySqlQuery } = await import('./mysqlClient');
    const rows = await executeMySqlQuery<DbUser>(
      'SELECT id, email, role, api_token FROM users WHERE api_token = ? LIMIT 1',
      [token]
    );
    return rows.length > 0 ? rows[0] : null;
  }
  const { getPool, sql } = await import('./sqlServerClient');
  const pool = await getPool();
  const result = await pool
    .request()
    .input('token', sql.NVarChar(255), token)
    .query<DbUser>('SELECT TOP 1 id, email, role, api_token FROM dbo.users WHERE api_token = @token');
  return result.recordset.length > 0 ? result.recordset[0] : null;
}

// ─── Orders CRUD ───────────────────────────────────────────────────────────

export async function getAllOrders(): Promise<DbOrder[]> {
  if (DIALECT === 'mysql') {
    const { executeMySqlQuery } = await import('./mysqlClient');
    return executeMySqlQuery<DbOrder>(
      'SELECT id, user_id, item_name, quantity, amount, status, created_at FROM orders ORDER BY id DESC'
    );
  }
  const { getPool } = await import('./sqlServerClient');
  const pool = await getPool();
  const result = await pool.request().query(
    'SELECT id, user_id, item_name, quantity, amount, status, created_at FROM dbo.orders ORDER BY id DESC'
  );
  return result.recordset;
}

export async function getOrderById(id: number): Promise<DbOrder | null> {
  if (DIALECT === 'mysql') {
    const { executeMySqlQuery } = await import('./mysqlClient');
    const rows = await executeMySqlQuery<DbOrder>(
      'SELECT id, user_id, item_name, quantity, amount, status, created_at FROM orders WHERE id = ? LIMIT 1',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }
  const { getPool, sql } = await import('./sqlServerClient');
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query('SELECT TOP 1 id, user_id, item_name, quantity, amount, status, created_at FROM dbo.orders WHERE id = @id');
  return result.recordset.length > 0 ? result.recordset[0] : null;
}

export async function createOrderWithAudit(data: {
  user_id: number;
  item_name: string;
  quantity: number;
  amount: number;
}): Promise<DbOrder> {
  if (DIALECT === 'mysql') {
    const { executeMySqlMutation, executeMySqlQuery } = await import('./mysqlClient');
    const insertResult = await executeMySqlMutation(
      'INSERT INTO orders (user_id, item_name, quantity, amount, status) VALUES (?, ?, ?, ?, ?)',
      [data.user_id, data.item_name, data.quantity, data.amount, 'PENDING']
    );
    const orderId = insertResult.insertId;
    await executeMySqlMutation(
      'INSERT INTO audit_logs (entity_type, entity_id, action) VALUES (?, ?, ?)',
      ['ORDER', orderId, 'CREATED']
    );
    const rows = await executeMySqlQuery<DbOrder>(
      'SELECT id, user_id, item_name, quantity, amount, status, created_at FROM orders WHERE id = ?',
      [orderId]
    );
    return rows[0];
  }
  const { getPool, sql } = await import('./sqlServerClient');
  const pool = await getPool();
  const insertResult = await pool
    .request()
    .input('userId', sql.Int, data.user_id)
    .input('itemName', sql.NVarChar(150), data.item_name)
    .input('quantity', sql.Int, data.quantity)
    .input('amount', sql.Decimal(10, 2), data.amount)
    .query(
      `INSERT INTO dbo.orders (user_id, item_name, quantity, amount, status)
       OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.item_name, INSERTED.quantity, INSERTED.amount, INSERTED.status, INSERTED.created_at
       VALUES (@userId, @itemName, @quantity, @amount, 'PENDING');`
    );
  const createdOrder = insertResult.recordset[0];
  await pool
    .request()
    .input('entityType', sql.NVarChar(50), 'ORDER')
    .input('entityId', sql.Int, createdOrder.id)
    .input('action', sql.NVarChar(50), 'CREATED')
    .query('INSERT INTO dbo.audit_logs (entity_type, entity_id, action) VALUES (@entityType, @entityId, @action);');
  return createdOrder;
}

export async function updateOrderStatusWithAudit(id: number, status: string): Promise<DbOrder | null> {
  if (DIALECT === 'mysql') {
    const { executeMySqlMutation, executeMySqlQuery } = await import('./mysqlClient');
    const checkRows = await executeMySqlQuery<DbOrder>('SELECT id FROM orders WHERE id = ?', [id]);
    if (checkRows.length === 0) return null;
    await executeMySqlMutation('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    await executeMySqlMutation(
      'INSERT INTO audit_logs (entity_type, entity_id, action) VALUES (?, ?, ?)',
      ['ORDER', id, 'STATUS_UPDATED']
    );
    const rows = await executeMySqlQuery<DbOrder>(
      'SELECT id, user_id, item_name, quantity, amount, status, created_at FROM orders WHERE id = ?',
      [id]
    );
    return rows[0];
  }
  const { getPool, sql: mssql } = await import('./sqlServerClient');
  const pool = await getPool();
  const checkResult = await pool.request().input('id', mssql.Int, id).query('SELECT TOP 1 id FROM dbo.orders WHERE id = @id');
  if (checkResult.recordset.length === 0) return null;
  const updateResult = await pool
    .request()
    .input('id', mssql.Int, id)
    .input('status', mssql.NVarChar(30), status)
    .query(
      `UPDATE dbo.orders SET status = @status
       OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.item_name, INSERTED.quantity, INSERTED.amount, INSERTED.status, INSERTED.created_at
       WHERE id = @id;`
    );
  await pool
    .request()
    .input('entityType', mssql.NVarChar(50), 'ORDER')
    .input('entityId', mssql.Int, id)
    .input('action', mssql.NVarChar(50), 'STATUS_UPDATED')
    .query('INSERT INTO dbo.audit_logs (entity_type, entity_id, action) VALUES (@entityType, @entityId, @action);');
  return updateResult.recordset[0];
}

export async function deleteOrderById(id: number): Promise<boolean> {
  if (DIALECT === 'mysql') {
    const { executeMySqlMutation } = await import('./mysqlClient');
    const result = await executeMySqlMutation('DELETE FROM orders WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
  const { getPool, sql } = await import('./sqlServerClient');
  const pool = await getPool();
  const result = await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.orders WHERE id = @id');
  return result.rowsAffected[0] > 0;
}

// ─── Audit Logs ────────────────────────────────────────────────────────────

export async function getAuditLogsByOrderId(orderId: number): Promise<DbAuditLog[]> {
  if (DIALECT === 'mysql') {
    const { executeMySqlQuery } = await import('./mysqlClient');
    return executeMySqlQuery<DbAuditLog>(
      'SELECT id, entity_type, entity_id, action, created_at FROM audit_logs WHERE entity_type = ? AND entity_id = ?',
      ['ORDER', orderId]
    );
  }
  const { getPool, sql } = await import('./sqlServerClient');
  const pool = await getPool();
  const result = await pool
    .request()
    .input('entityType', sql.NVarChar(50), 'ORDER')
    .input('id', sql.Int, orderId)
    .query('SELECT id, entity_type, entity_id, action, created_at FROM dbo.audit_logs WHERE entity_type = @entityType AND entity_id = @id');
  return result.recordset;
}

// ─── Utility / Teardown ────────────────────────────────────────────────────

export async function countOrdersByItemName(itemName: string): Promise<number> {
  if (DIALECT === 'mysql') {
    const { executeMySqlQuery } = await import('./mysqlClient');
    const rows = await executeMySqlQuery<{ count: number }>(
      'SELECT COUNT(*) AS count FROM orders WHERE item_name = ?',
      [itemName]
    );
    return Number(rows[0].count);
  }
  const { executeQuery } = await import('./sqlServerClient');
  const rows = await executeQuery<{ count: number }>(
    'SELECT COUNT(*) AS count FROM dbo.orders WHERE item_name = @itemName',
    { itemName }
  );
  return rows[0].count;
}

export async function deleteOrdersByItemName(itemName: string): Promise<void> {
  if (DIALECT === 'mysql') {
    const { executeMySqlMutation } = await import('./mysqlClient');
    // Delete related audit_logs first, then orders
    await executeMySqlMutation(
      'DELETE FROM audit_logs WHERE entity_type = ? AND entity_id IN (SELECT id FROM orders WHERE item_name = ?)',
      ['ORDER', itemName]
    );
    await executeMySqlMutation('DELETE FROM orders WHERE item_name = ?', [itemName]);
    return;
  }
  const { executeQuery } = await import('./sqlServerClient');
  await executeQuery(
    'DELETE FROM dbo.audit_logs WHERE entity_type = @entityType AND entity_id IN (SELECT id FROM dbo.orders WHERE item_name = @itemName)',
    { entityType: 'ORDER', itemName }
  );
  await executeQuery('DELETE FROM dbo.orders WHERE item_name = @itemName', { itemName });
}

export async function closeDbPool(): Promise<void> {
  if (DIALECT === 'mysql') {
    const { closeMySqlPool } = await import('./mysqlClient');
    await closeMySqlPool();
    return;
  }
  const { closePool } = await import('./sqlServerClient');
  await closePool();
}
