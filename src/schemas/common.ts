import { z } from 'zod';
import { cleanNIP, isValidNIP } from '../utils/nip.js';

export const nullishString = z
  .string()
  .nullish()
  .transform((val) => val || undefined);

/** LLMs often send NIP as a number — coerce before checksum validation. */
const nipCoerced = z
  .union([z.string(), z.number()])
  .transform((val) => cleanNIP(String(val)));

export const nipField = (description: string) =>
  nipCoerced
    .refine((val) => val.length > 0, 'NIP is required')
    .refine((val) => isValidNIP(val), 'Invalid NIP checksum')
    .describe(description);

export const nullishNipField = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((val) => (val == null || val === '' ? undefined : cleanNIP(String(val))))
  .refine((val) => val === undefined || isValidNIP(val), 'Invalid NIP checksum')
  .describe('Polish NIP tax number (string or number)');

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
