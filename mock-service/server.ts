import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { getPool, sql } from '../src/db/sqlServerClient';
import {
  CreateOrderInputSchema,
  UpdateOrderStatusInputSchema,
  Order,
} from '../src/schemas/order.schema';

export interface AuthenticatedUser {
  id: number;
  email: string;
  role: 'admin' | 'viewer';
  api_token: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Parse JSON bodies
app.use(express.json());

// JSON syntax error handler returning exact contract specification
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload' });
  }
  next(err);
});

/**
 * Extracts and validates a positive integer route parameter
 */
function parseIdParam(param: string | string[] | undefined): number | null {
  const val = Array.isArray(param) ? param[0] : param;
  if (!val || !/^\d+$/.test(val)) {
    return null;
  }
  const parsed = parseInt(val, 10);
  return parsed > 0 ? parsed : null;
}

/**
 * Authentication Middleware:
 * Inspects Authorization: Bearer <token>
 * Queries dbo.users using parameterized T-SQL to find matching active user
 */
async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('token', sql.NVarChar(255), token)
      .query<AuthenticatedUser>(
        'SELECT TOP 1 id, email, role, api_token FROM dbo.users WHERE api_token = @token'
      );

    if (result.recordset.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = result.recordset[0];
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Authorization Middleware:
 * Requires user to have admin role
 */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

/**
 * Normalizes SQL Server order record to match strict Order contract
 */
function formatOrder(row: any): Order {
  return {
    id: row.id,
    user_id: row.user_id,
    item_name: row.item_name,
    quantity: row.quantity,
    amount: Number(row.amount),
    status: row.status,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

// ----------------------------------------------------------------------------
// Endpoints
// ----------------------------------------------------------------------------

/**
 * GET /health
 * Validates database connectivity with SELECT 1
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    return res.status(200).json({ status: 'ok', db: 'connected' });
  } catch (error) {
    console.error('Database health check failed:', error);
    return res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

/**
 * GET /api/orders
 * Auth required (admin or viewer). Returns list of orders ordered by id DESC.
 */
app.get('/api/orders', authenticate, async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query(
        'SELECT id, user_id, item_name, quantity, amount, status, created_at FROM dbo.orders ORDER BY id DESC'
      );

    const orders = result.recordset.map(formatOrder);
    return res.status(200).json(orders);
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return res.status(500).json({ error: 'Failed to retrieve orders' });
  }
});

/**
 * GET /api/orders/:id
 * Auth required. Validates positive integer :id.
 */
app.get('/api/orders/:id', authenticate, async (req: Request, res: Response) => {
  const orderId = parseIdParam(req.params.id);
  if (orderId === null) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, orderId)
      .query(
        'SELECT TOP 1 id, user_id, item_name, quantity, amount, status, created_at FROM dbo.orders WHERE id = @id'
      );

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.status(200).json(formatOrder(result.recordset[0]));
  } catch (error) {
    console.error(`Failed to fetch order ${orderId}:`, error);
    return res.status(500).json({ error: 'Failed to retrieve order' });
  }
});

/**
 * POST /api/orders
 * Auth required + admin role. Validates body with Zod schema.
 * Atomically writes to dbo.orders and logs action in dbo.audit_logs.
 */
app.post(
  '/api/orders',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response) => {
    const validation = CreateOrderInputSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(422).json({
        error: 'Validation failed',
        details: validation.error.flatten(),
      });
    }

    const { item_name, quantity, amount } = validation.data;
    const userId = req.user!.id;

    try {
      const pool = await getPool();

      // Parameterized insert with OUTPUT clause for atomic record creation
      const insertResult = await pool
        .request()
        .input('userId', sql.Int, userId)
        .input('itemName', sql.NVarChar(150), item_name)
        .input('quantity', sql.Int, quantity)
        .input('amount', sql.Decimal(10, 2), amount)
        .query(
          `INSERT INTO dbo.orders (user_id, item_name, quantity, amount, status)
           OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.item_name, INSERTED.quantity, INSERTED.amount, INSERTED.status, INSERTED.created_at
           VALUES (@userId, @itemName, @quantity, @amount, 'PENDING');`
        );

      const createdOrder = insertResult.recordset[0];

      // Audit log entry
      await pool
        .request()
        .input('entityType', sql.NVarChar(50), 'ORDER')
        .input('entityId', sql.Int, createdOrder.id)
        .input('action', sql.NVarChar(50), 'CREATED')
        .query(
          `INSERT INTO dbo.audit_logs (entity_type, entity_id, action)
           VALUES (@entityType, @entityId, @action);`
        );

      return res.status(201).json(formatOrder(createdOrder));
    } catch (error) {
      console.error('Failed to create order:', error);
      return res.status(500).json({ error: 'Failed to create order' });
    }
  }
);

/**
 * PATCH /api/orders/:id/status
 * Auth required + admin role. Validates positive integer :id and status enum.
 * Updates order status and logs STATUS_UPDATED in dbo.audit_logs.
 */
app.patch(
  '/api/orders/:id/status',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response) => {
    const orderId = parseIdParam(req.params.id);
    if (orderId === null) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const validation = UpdateOrderStatusInputSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(422).json({
        error: 'Validation failed',
        details: validation.error.flatten(),
      });
    }

    const { status } = validation.data;

    try {
      const pool = await getPool();

      // Check if order exists first
      const checkResult = await pool
        .request()
        .input('id', sql.Int, orderId)
        .query('SELECT TOP 1 id FROM dbo.orders WHERE id = @id');

      if (checkResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Update status and return updated record
      const updateResult = await pool
        .request()
        .input('id', sql.Int, orderId)
        .input('status', sql.NVarChar(30), status)
        .query(
          `UPDATE dbo.orders
           SET status = @status
           OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.item_name, INSERTED.quantity, INSERTED.amount, INSERTED.status, INSERTED.created_at
           WHERE id = @id;`
        );

      // Audit log entry
      await pool
        .request()
        .input('entityType', sql.NVarChar(50), 'ORDER')
        .input('entityId', sql.Int, orderId)
        .input('action', sql.NVarChar(50), 'STATUS_UPDATED')
        .query(
          `INSERT INTO dbo.audit_logs (entity_type, entity_id, action)
           VALUES (@entityType, @entityId, @action);`
        );

      return res.status(200).json(formatOrder(updateResult.recordset[0]));
    } catch (error) {
      console.error(`Failed to update order ${orderId}:`, error);
      return res.status(500).json({ error: 'Failed to update order status' });
    }
  }
);

/**
 * DELETE /api/orders/:id
 * Auth required + admin role. Deletes specified order.
 */
app.delete(
  '/api/orders/:id',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response) => {
    const orderId = parseIdParam(req.params.id);
    if (orderId === null) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    try {
      const pool = await getPool();
      const deleteResult = await pool
        .request()
        .input('id', sql.Int, orderId)
        .query('DELETE FROM dbo.orders WHERE id = @id');

      if (deleteResult.rowsAffected[0] === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }

      return res.status(200).json({ deleted: true, id: orderId });
    } catch (error) {
      console.error(`Failed to delete order ${orderId}:`, error);
      return res.status(500).json({ error: 'Failed to delete order' });
    }
  }
);

// Fallback for undefined routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

export const server = app.listen(PORT, () => {
  console.log(`[DataGuard Mock Service] Listening on http://localhost:${PORT}`);
});

export { app };
