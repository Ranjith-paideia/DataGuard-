import { z } from 'zod';

export const OrderStatusEnum = z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']);
export type OrderStatus = z.infer<typeof OrderStatusEnum>;

/**
 * Strict schema matching the API response for an individual Order.
 */
export const OrderSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  item_name: z.string(),
  quantity: z.number().int(),
  amount: z.number(),
  status: OrderStatusEnum,
  created_at: z.string(),
});
export type Order = z.infer<typeof OrderSchema>;

/**
 * Strict schema matching an array of Orders.
 */
export const OrderListSchema = z.array(OrderSchema);
export type OrderList = z.infer<typeof OrderListSchema>;

/**
 * Standard error response schema.
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Validation schema for creating a new Order via POST /api/orders.
 */
export const CreateOrderInputSchema = z.object({
  item_name: z
    .string()
    .trim()
    .min(1, 'item_name cannot be empty')
    .max(150, 'item_name must be at most 150 characters'),
  quantity: z
    .number()
    .int('quantity must be an integer')
    .min(1, 'quantity must be at least 1')
    .max(1000, 'quantity cannot exceed 1000'),
  amount: z
    .number()
    .positive('amount must be greater than 0')
    .max(100000, 'amount cannot exceed 100000'),
});
export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;

/**
 * Validation schema for updating Order status via PATCH /api/orders/:id/status.
 */
export const UpdateOrderStatusInputSchema = z.object({
  status: OrderStatusEnum,
});
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusInputSchema>;
