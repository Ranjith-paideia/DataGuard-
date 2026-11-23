import { z } from 'zod';

export const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
});

export const CustomerSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  address: AddressSchema,
  phoneNumber: z.string(),
  ssn: z.string(),
});

export const AccountSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  type: z.string(),
  balance: z.number(),
});

export const AccountListSchema = z.array(AccountSchema);

export type Customer = z.infer<typeof CustomerSchema>;
export type Account = z.infer<typeof AccountSchema>;
export type AccountList = z.infer<typeof AccountListSchema>;
