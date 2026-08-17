import { z } from 'zod';
import { nullishString, idField, dateString } from './common.js';
import { invoicePositionSchema } from './invoices.js';
import { getToday, get30DaysAgo, addDays } from '../utils/dates.js';

const ACCOUNTING_KINDS = [
  'purchases',
  'expenses',
  'media',
  'salary',
  'incident',
  'fuel0',
  'fuel_expl75',
  'fuel_expl100',
  'fixed_assets',
  'fixed_assets50',
  'no_vat_deduction',
] as const;

export const getExpensesInputSchema = z.object({
  date_from: z
    .string()
    .nullish()
    .transform((val) => val || get30DaysAgo()),
  date_to: z
    .string()
    .nullish()
    .transform((val) => val || getToday()),
  status: nullishString,
  accounting_kind: z
    .enum(ACCOUNTING_KINDS)
    .nullish()
    .transform((val) => val ?? undefined),
  page: z.number().int().positive().nullish().transform((val) => val ?? 1),
  per_page: z.number().int().positive().max(100).nullish().transform((val) => val ?? 25),
});

export const getExpenseByIdInputSchema = z.object({
  id: idField,
});

export const createExpenseInputSchema = z.object({
  vendor_name: z.string().min(1, 'Vendor name is required'),
  vendor_nip: nullishString,
  positions: z.array(invoicePositionSchema).min(1, 'At least one position is required'),
  accounting_kind: z
    .enum(ACCOUNTING_KINDS)
    .nullish()
    .transform((val) => val ?? undefined),
  issue_date: z
    .string()
    .nullish()
    .transform((val) => val || getToday()),
  sell_date: dateString,
  due_date: dateString,
  delivery_date: dateString,
  payment_method: nullishString,
  currency: z
    .string()
    .nullish()
    .transform((val) => val || 'PLN'),
  notes: nullishString,
});

export const deleteExpenseInputSchema = z.object({
  id: idField,
  confirm: z.boolean().refine((val) => val === true, {
    message: 'You must set confirm=true to delete an expense',
  }),
});

export function resolveExpenseDates(input: {
  issue_date?: string;
  sell_date?: string;
  due_date?: string;
}) {
  const issueDate = input.issue_date || getToday();
  return {
    issue_date: issueDate,
    sell_date: input.sell_date || issueDate,
    due_date: input.due_date || addDays(issueDate, 14),
  };
}
