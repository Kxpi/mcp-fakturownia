import { z } from 'zod';

export const nullishString = z
  .string()
  .nullish()
  .transform((val) => val || undefined);

export const nullishNumber = z
  .number()
  .nullish()
  .transform((val) => val ?? undefined);

export const positiveNumber = z.number().positive();

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .nullish()
  .transform((val) => val || undefined);

export const emailSchema = z
  .string()
  .email()
  .nullish()
  .transform((val) => val || undefined);

export const idField = z.union([z.string(), z.number()]).transform((val) => {
  const num = typeof val === 'string' ? parseInt(val, 10) : val;
  if (isNaN(num) || num <= 0) throw new Error('ID must be a positive number');
  return num;
});

export const paginationSchema = z.object({
  page: z.number().int().positive().nullish().transform((val) => val ?? 1),
  per_page: z.number().int().positive().max(100).nullish().transform((val) => val ?? undefined),
});
