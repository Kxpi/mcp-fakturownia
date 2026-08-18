import { z } from 'zod';
import { nullishString, idField, nullishNipField } from './common.js';
import { getToday, get30DaysAgo, addDays } from '../utils/dates.js';
import { calculateGrossFromNet } from '../utils/money.js';

export const invoicePositionSchema = z
  .object({
    name: z.string().min(1, 'Position name is required').describe('Item name (REQUIRED)'),
    quantity: z.number().positive().default(1).describe('Quantity (default: 1)'),
    unit: nullishString.describe('Unit (e.g., "szt.", "godz.", "usł.")'),
    vat_rate: z.number().min(0).max(100).default(23).describe('VAT rate % (default: 23)'),
    unit_price_net: z
      .number()
      .positive()
      .nullish()
      .transform((val) => val ?? undefined)
      .describe('Unit price net (provide this OR unit_price_gross)'),
    unit_price_gross: z
      .number()
      .positive()
      .nullish()
      .transform((val) => val ?? undefined)
      .describe('Unit price gross (provide this OR unit_price_net)'),
  })
  .refine((data) => data.unit_price_net !== undefined || data.unit_price_gross !== undefined, {
    message: 'Either unit_price_net or unit_price_gross is required',
  });

export type InvoicePosition = z.infer<typeof invoicePositionSchema>;

export const getInvoicesInputSchema = z.object({
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
  client_id: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((val) => {
      if (val === null || val === undefined) return undefined;
      return typeof val === 'string' ? parseInt(val, 10) : val;
    })
    .describe('Filter by client ID'),
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

export const getInvoiceByIdInputSchema = z.object({
  id: idField,
});

export const createInvoiceInputSchema = z.object({
  client_id: idField.describe('Client ID (REQUIRED — use get_all_clients to find)'),
  positions: z
    .array(invoicePositionSchema)
    .min(1, 'At least one position is required')
    .describe('Invoice line items (REQUIRED, at least 1)'),
  issue_date: z
    .string()
    .nullish()
    .transform((val) => val || getToday())
    .describe('Issue date YYYY-MM-DD (default: today)'),
  sell_date: nullishString.describe('Sell/service date YYYY-MM-DD (default: issue_date)'),
  due_date: nullishString.describe('Due date YYYY-MM-DD (default: issue_date + 14 days)'),
  payment_method: nullishString.describe('Payment method: transfer, cash, card, etc.'),
  currency: z
    .string()
    .nullish()
    .transform((val) => val || 'PLN')
    .describe('Currency code (default: PLN)'),
  notes: nullishString.describe('Notes on the invoice'),
  buyer_name: nullishString.describe('Override buyer name (otherwise taken from client)'),
  buyer_nip: nullishNipField,
  draft: z.boolean().nullish().transform((val) => val ?? false).describe('Create as draft (default: false)'),
});

export const updateInvoiceInputSchema = z.object({
  id: idField,
  buyer_name: nullishString.describe('Updated buyer name'),
  buyer_nip: nullishNipField,
  issue_date: nullishString.describe('Updated issue date YYYY-MM-DD'),
  sell_date: nullishString.describe('Updated sell date YYYY-MM-DD'),
  due_date: nullishString.describe('Updated due date YYYY-MM-DD'),
  payment_method: nullishString.describe('Updated payment method'),
  status: nullishString.describe('Updated status'),
  notes: nullishString.describe('Updated notes'),
  currency: nullishString.describe('Updated currency'),
});

export const deleteInvoiceInputSchema = z.object({
  id: idField,
  confirm: z.boolean().refine((val) => val === true, {
    message: 'You must set confirm=true to delete an invoice',
  }).describe('Must be true to confirm (REQUIRED)'),
});

export const cancelInvoiceInputSchema = z.object({
  id: idField,
});

export const sendInvoiceToKsefInputSchema = z.object({
  id: idField,
  confirm: z.boolean().refine((val) => val === true, {
    message: 'You must set confirm=true to send an invoice to KSeF',
  }).describe('Must be true to confirm sending to KSeF (REQUIRED)'),
});

export const markInvoiceAsPaidInputSchema = z.object({
  id: idField,
  payment_date: z
    .string()
    .nullish()
    .transform((val) => val || getToday())
    .describe('Payment date YYYY-MM-DD (default: today)'),
});

export const getClientInvoicesSummaryInputSchema = z.object({
  client_id: idField.describe('Client ID (REQUIRED)'),
  date_from: nullishString.describe('Start date YYYY-MM-DD'),
  date_to: nullishString.describe('End date YYYY-MM-DD'),
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

export function buildPositionPayload(pos: InvoicePosition): Record<string, unknown> {
  const unitGross =
    pos.unit_price_gross !== undefined
      ? pos.unit_price_gross
      : calculateGrossFromNet(pos.unit_price_net!, pos.vat_rate);

  const totalGross = Math.round(unitGross * pos.quantity * 100) / 100;

  const payload: Record<string, unknown> = {
    name: pos.name,
    quantity: pos.quantity,
    tax: pos.vat_rate,
    total_price_gross: totalGross,
  };
  if (pos.unit) payload.quantity_unit = pos.unit;
  return payload;
}
