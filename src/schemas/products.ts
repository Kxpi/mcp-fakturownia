import { z } from 'zod';
import { nullishString, idField } from './common.js';

export const listProductsInputSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .nullish()
    .transform((val) => val ?? 100)
    .describe('Max products to return (1-100, default: 100)'),
  page: z.number().int().positive().nullish().transform((val) => val ?? 1).describe('Page number (default: 1)'),
});

export const createProductInputSchema = z.object({
  name: z.string().min(1, 'Product name is required').describe('Product name (REQUIRED)'),
  code: nullishString.describe('Product code/SKU'),
  price_net: z.number().positive().nullish().transform((val) => val ?? undefined).describe('Net price'),
  price_gross: z.number().positive().nullish().transform((val) => val ?? undefined).describe('Gross price'),
  vat_rate: z.number().min(0).max(100).nullish().transform((val) => val ?? 23).describe('VAT rate % (default: 23)'),
  unit: nullishString.describe('Unit (e.g., "szt.", "godz.")'),
  description: nullishString.describe('Product description'),
});

export const updateProductInputSchema = z.object({
  id: idField,
  name: nullishString.describe('Updated product name'),
  code: nullishString.describe('Updated product code/SKU'),
  price_net: z.number().positive().nullish().transform((val) => val ?? undefined).describe('Updated net price'),
  price_gross: z.number().positive().nullish().transform((val) => val ?? undefined).describe('Updated gross price'),
  vat_rate: z.number().min(0).max(100).nullish().transform((val) => val ?? undefined).describe('Updated VAT rate %'),
  unit: nullishString.describe('Updated unit (e.g., "szt.", "godz.")'),
  description: nullishString.describe('Updated description'),
});

export const deleteProductInputSchema = z.object({
  id: idField,
  confirm: z.boolean().refine((val) => val === true, {
    message: 'You must set confirm=true to delete a product',
  }).describe('Must be true to confirm (REQUIRED)'),
});
