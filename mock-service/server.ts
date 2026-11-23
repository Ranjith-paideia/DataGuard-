import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import {
  CreateOrderInputSchema,
  UpdateOrderStatusInputSchema,
  Order,
} from '../src/schemas/order.schema';
import {
  checkDbHealth,
  findUserByToken,
  getAllOrders,
  getOrderById,
  createOrderWithAudit,
  updateOrderStatusWithAudit,
  deleteOrderById,
  formatOrderRow,
  DbUser,
} from '../src/db/dbClient';

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
 * Queries users table using dialect-safe dbClient to find matching active user
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
    const user = await findUserByToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = user as AuthenticatedUser;
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

// ----------------------------------------------------------------------------
// Endpoints
// ----------------------------------------------------------------------------

/**
 * GET /health
 * Validates database connectivity with SELECT 1
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await checkDbHealth();
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
    const rows = await getAllOrders();
    const orders = rows.map(formatOrderRow);
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
    const row = await getOrderById(orderId);
    if (!row) {
      return res.status(404).json({ error: 'Order not found' });
    }
    return res.status(200).json(formatOrderRow(row));
  } catch (error) {
    console.error(`Failed to fetch order ${orderId}:`, error);
    return res.status(500).json({ error: 'Failed to retrieve order' });
  }
});

/**
 * POST /api/orders
 * Auth required + admin role. Validates body with Zod schema.
 * Atomically writes to orders and logs action in audit_logs.
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
      const createdOrder = await createOrderWithAudit({
        user_id: userId,
        item_name,
        quantity,
        amount,
      });
      return res.status(201).json(formatOrderRow(createdOrder));
    } catch (error) {
      console.error('Failed to create order:', error);
      return res.status(500).json({ error: 'Failed to create order' });
    }
  }
);

/**
 * PATCH /api/orders/:id/status
 * Auth required + admin role. Validates positive integer :id and status enum.
 * Updates order status and logs STATUS_UPDATED in audit_logs.
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
      const updatedOrder = await updateOrderStatusWithAudit(orderId, status);
      if (!updatedOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }
      return res.status(200).json(formatOrderRow(updatedOrder));
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
      const deleted = await deleteOrderById(orderId);
      if (!deleted) {
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
