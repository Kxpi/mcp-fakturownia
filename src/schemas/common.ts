import { z } from 'zod';

export const nullishString = z
  .string()
  .nullish()
  .transform((val) => val || undefined);

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .nullish()
  .transform((val) => val || undefined);

export const idField = z
  .union([z.string(), z.number()])
  .describe('Resource ID (REQUIRED)')
  .transform((val) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num <= 0) throw new Error('ID must be a positive number');
    return num;
  });
