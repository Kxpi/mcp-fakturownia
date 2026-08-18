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
    .transform((val) => val || get30DaysAgo())
    .describe('Start date YYYY-MM-DD (default: 30 days ago)'),
  date_to: z
    .string()
    .nullish()
    .transform((val) => val || getToday())
    .describe('End date YYYY-MM-DD (default: today)'),
  status: nullishString.describe('Filter by status: issued, paid, rejected, cancelled'),
  accounting_kind: z
    .enum(ACCOUNTING_KINDS)
    .nullish()
    .transform((val) => val ?? undefined)
    .describe(
      'Filter by expense category: purchases, expenses, media, salary, incident, fuel0, fuel_expl75, fuel_expl100, fixed_assets, fixed_assets50, no_vat_deduction',
    ),
  page: z.number().int().positive().nullish().transform((val) => val ?? 1).describe('Page number (default: 1)'),
  per_page: z
    .number()
    .int()
    .positive()
    .max(100)
    .nullish()
    .transform((val) => val ?? 25)
    .describe('Results per page (1-100, default: 25)'),
});

export const getExpenseByIdInputSchema = z.object({
  id: idField,
});

export const createExpenseInputSchema = z.object({
  vendor_name: z
    .string()
    .min(1, 'Vendor name is required')
    .describe('Vendor/supplier name (REQUIRED — the company that issued the invoice)'),
  vendor_nip: nullishString.describe('Vendor NIP (tax ID)'),
  positions: z
    .array(invoicePositionSchema)
    .min(1, 'At least one position is required')
    .describe('Expense line items (REQUIRED, at least 1)'),
  accounting_kind: z
    .enum(ACCOUNTING_KINDS)
    .nullish()
    .transform((val) => val ?? undefined)
    .describe(
      'Expense category: purchases, expenses, media, salary, incident, fuel0, fuel_expl75, fuel_expl100, fixed_assets, fixed_assets50, no_vat_deduction',
    ),
  issue_date: z
    .string()
    .nullish()
    .transform((val) => val || getToday())
    .describe('Issue date YYYY-MM-DD (default: today)'),
  sell_date: dateString.describe('Sell/service date YYYY-MM-DD (default: issue_date)'),
  due_date: dateString.describe('Due date YYYY-MM-DD (default: issue_date + 14 days)'),
  delivery_date: dateString.describe('Delivery/receipt date YYYY-MM-DD (data wpłynięcia)'),
  payment_method: nullishString.describe('Payment method: transfer, cash, card, etc.'),
  currency: z
    .string()
    .nullish()
    .transform((val) => val || 'PLN')
    .describe('Currency code (default: PLN)'),
  notes: nullishString.describe('Notes on the expense'),
});

export const deleteExpenseInputSchema = z.object({
  id: idField,
  confirm: z.boolean().refine((val) => val === true, {
    message: 'You must set confirm=true to delete an expense',
  }).describe('Must be true to confirm (REQUIRED)'),
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
