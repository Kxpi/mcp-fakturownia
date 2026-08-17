import { z } from 'zod';
import { nullishString, idField } from './common.js';

export const listProductsInputSchema = z.object({
  limit: z.number().int().positive().max(100).nullish().transform((val) => val ?? 100),
  page: z.number().int().positive().nullish().transform((val) => val ?? 1),
});

export const createProductInputSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  code: nullishString,
  price_net: z.number().positive().nullish().transform((val) => val ?? undefined),
  price_gross: z.number().positive().nullish().transform((val) => val ?? undefined),
  vat_rate: z.number().min(0).max(100).nullish().transform((val) => val ?? 23),
  unit: nullishString,
  description: nullishString,
});

export const updateProductInputSchema = z.object({
  id: idField,
  name: nullishString,
  code: nullishString,
  price_net: z.number().positive().nullish().transform((val) => val ?? undefined),
  price_gross: z.number().positive().nullish().transform((val) => val ?? undefined),
  vat_rate: z.number().min(0).max(100).nullish().transform((val) => val ?? undefined),
  unit: nullishString,
  description: nullishString,
});

export const deleteProductInputSchema = z.object({
  id: idField,
  confirm: z.boolean().refine((val) => val === true, {
    message: 'You must set confirm=true to delete a product',
  }),
});
