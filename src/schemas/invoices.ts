import { z } from 'zod';
import { nullishString, idField, dateString } from './common.js';
import { getToday, get30DaysAgo, addDays } from '../utils/dates.js';

export const invoicePositionSchema = z
  .object({
    name: z.string().min(1, 'Position name is required'),
    quantity: z.number().positive().default(1),
    unit: nullishString,
    vat_rate: z.number().min(0).max(100).default(23),
    unit_price_net: z.number().positive().nullish().transform((val) => val ?? undefined),
    unit_price_gross: z.number().positive().nullish().transform((val) => val ?? undefined),
  })
  .refine((data) => data.unit_price_net !== undefined || data.unit_price_gross !== undefined, {
    message: 'Either unit_price_net or unit_price_gross is required',
  });

export type InvoicePosition = z.infer<typeof invoicePositionSchema>;

export const getInvoicesInputSchema = z.object({
  date_from: z
    .string()
    .nullish()
    .transform((val) => val || get30DaysAgo()),
  date_to: z
    .string()
    .nullish()
    .transform((val) => val || getToday()),
  status: nullishString,
  client_id: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => {
      if (val === null || val === undefined) return undefined;
      return typeof val === 'string' ? parseInt(val, 10) : val;
    }),
  page: z.number().int().positive().nullish().transform((val) => val ?? 1),
  per_page: z.number().int().positive().max(100).nullish().transform((val) => val ?? 25),
});

export const getInvoiceByIdInputSchema = z.object({
  id: idField,
});

export const createInvoiceInputSchema = z.object({
  client_id: idField,
  positions: z.array(invoicePositionSchema).min(1, 'At least one position is required'),
  issue_date: z
    .string()
    .nullish()
    .transform((val) => val || getToday()),
  sell_date: dateString,
  due_date: dateString,
  payment_method: nullishString,
  currency: z
    .string()
    .nullish()
    .transform((val) => val || 'PLN'),
  notes: nullishString,
  buyer_name: nullishString,
  buyer_nip: nullishString,
  draft: z.boolean().nullish().transform((val) => val ?? false),
});

export const updateInvoiceInputSchema = z.object({
  id: idField,
  buyer_name: nullishString,
  buyer_nip: nullishString,
  issue_date: dateString,
  sell_date: dateString,
  due_date: dateString,
  payment_method: nullishString,
  status: nullishString,
  notes: nullishString,
  currency: nullishString,
});

export const deleteInvoiceInputSchema = z.object({
  id: idField,
  confirm: z.boolean().refine((val) => val === true, {
    message: 'You must set confirm=true to delete an invoice',
  }),
});

export const cancelInvoiceInputSchema = z.object({
  id: idField,
});

export const sendInvoiceToKsefInputSchema = z.object({
  id: idField,
  confirm: z.boolean().refine((val) => val === true, {
    message: 'You must set confirm=true to send an invoice to KSeF',
  }),
});

export const markInvoiceAsPaidInputSchema = z.object({
  id: idField,
  payment_date: z
    .string()
    .nullish()
    .transform((val) => val || getToday()),
});

export const getClientInvoicesSummaryInputSchema = z.object({
  client_id: idField,
  date_from: dateString,
  date_to: dateString,
});

export function resolveInvoiceDates(input: {
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
