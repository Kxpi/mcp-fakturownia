import type { FakturowniaApiClient } from '../api/fakturowniaClient.js';
import { logger } from '../logger.js';
import { parseMoney, roundMoney } from '../utils/money.js';
import {
  filterInvoiceList,
  filterInvoiceDetail,
  filterInvoiceCreated,
} from '../utils/responseFilter.js';
import {
  getInvoicesInputSchema,
  getInvoiceByIdInputSchema,
  createInvoiceInputSchema,
  updateInvoiceInputSchema,
  deleteInvoiceInputSchema,
  cancelInvoiceInputSchema,
  sendInvoiceToKsefInputSchema,
  markInvoiceAsPaidInputSchema,
  getClientInvoicesSummaryInputSchema,
  resolveInvoiceDates,
  buildPositionPayload,
} from '../schemas/invoices.js';
import { defineTool } from './defineTool.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

export const getInvoicesToolDef = defineTool(
  'get_invoices',
  'List invoices with optional filters. Defaults to the last 30 days. Returns: id, number, date, status, amounts, buyer info, gov_status, gov_id (KSeF). Use date_from/date_to (YYYY-MM-DD) to filter by date range.',
  getInvoicesInputSchema,
);

export const getInvoiceByIdToolDef = defineTool(
  'get_invoice_by_id',
  'Get full invoice details including line items (positions). REQUIRES invoice ID. Returns all fields: dates, amounts, buyer/seller info, positions with prices, gov_status, gov_id (KSeF), and a direct view URL.',
  getInvoiceByIdInputSchema,
);

export const createInvoiceToolDef = defineTool(
  'create_invoice',
  'Create a new invoice in Fakturownia. REQUIRES: client_id and at least one position. Each position needs: name, quantity, vat_rate (default 23%), and either unit_price_net or unit_price_gross. Dates default to today (issue) and +14 days (due). WORKFLOW: First find client ID using get_all_clients or get_client_by_nip, then create the invoice. Does NOT send to KSeF — sending is a separate explicit step via send_invoice_to_ksef.',
  createInvoiceInputSchema,
);

export const updateInvoiceToolDef = defineTool(
  'update_invoice',
  'Update an existing invoice. REQUIRES invoice ID. Only provided fields are updated. Cannot change positions. Invoices already sent to KSeF cannot be edited — use mark_invoice_as_paid to record payment instead.',
  updateInvoiceInputSchema,
);

export const deleteInvoiceToolDef = defineTool(
  'delete_invoice',
  'Permanently delete an invoice. This CANNOT be undone. REQUIRES invoice ID and confirm=true. Consider using cancel_invoice instead for a safer alternative.',
  deleteInvoiceInputSchema,
);

export const cancelInvoiceToolDef = defineTool(
  'cancel_invoice',
  'Cancel an invoice (safer than deleting). Marks the invoice as cancelled without removing it. REQUIRES invoice ID.',
  cancelInvoiceInputSchema,
);

export const sendInvoiceToKsefToolDef = defineTool(
  'send_invoice_to_ksef',
  'Send an ALREADY CREATED invoice to KSeF. Does NOT create invoices. NEVER call this after create_invoice or as part of the create workflow. NEVER call unless the user explicitly asked to send this specific invoice to KSeF (or approved after you asked). REQUIRES invoice ID and confirm=true. IRREVERSIBLE: once gov_id is assigned the invoice cannot be edited, cancelled, or deleted. Returns gov_status and gov_id.',
  sendInvoiceToKsefInputSchema,
);

export const markInvoiceAsPaidToolDef = defineTool(
  'mark_invoice_as_paid',
  'Record a payment against an invoice (works for KSeF-sent invoices that cannot be edited). Creates a banking payment for the unpaid balance. REQUIRES invoice ID. Optional payment_date (YYYY-MM-DD, default: today).',
  markInvoiceAsPaidInputSchema,
);

export const getClientInvoicesSummaryToolDef = defineTool(
  'get_client_invoices_summary',
  'Get aggregated invoice statistics for a client: total count, sum by status, totals net/gross. REQUIRES client_id. Optionally filter by date range.',
  getClientInvoicesSummaryInputSchema,
);

export async function handleGetInvoices(client: FakturowniaApiClient, args: unknown) {
  const input = getInvoicesInputSchema.parse(args);

  const query: AnyRecord = {
    page: input.page,
    per_page: input.per_page,
  };

  if (input.date_from || input.date_to) {
    query.period = 'more';
    query.search_date_type = 'issue_date';
    if (input.date_from) query.date_from = input.date_from;
    if (input.date_to) query.date_to = input.date_to;
  }

  if (input.status) query.status = input.status;
  if (input.client_id) query.client_id = input.client_id;

  const invoices = await client.listInvoices(query);
  const filtered = filterInvoiceList(invoices as AnyRecord[]);
  return { data: filtered, count: filtered.length, message: `Found ${filtered.length} invoice(s)` };
}

export async function handleGetInvoiceById(client: FakturowniaApiClient, args: unknown) {
  const input = getInvoiceByIdInputSchema.parse(args);
  const invoice = await client.getInvoice(input.id);
  return { data: filterInvoiceDetail(invoice as AnyRecord), message: 'Invoice details retrieved' };
}

export async function handleCreateInvoice(client: FakturowniaApiClient, args: unknown) {
  const input = createInvoiceInputSchema.parse(args);
  const dates = resolveInvoiceDates(input);

  const positions = input.positions.map((pos) => buildPositionPayload(pos));

  const payload: AnyRecord = {
    client_id: input.client_id,
    issue_date: dates.issue_date,
    sell_date: dates.sell_date,
    payment_to: dates.due_date,
    positions,
  };

  if (input.payment_method) payload.payment_type = input.payment_method;
  if (input.currency) payload.currency = input.currency;
  if (input.notes) payload.note = input.notes;
  if (input.buyer_name) payload.buyer_name = input.buyer_name;
  if (input.buyer_nip) payload.buyer_tax_no = input.buyer_nip;
  if (input.draft) payload.kind = 'estimate';

  logger.info({ clientId: input.client_id, positionCount: positions.length }, 'Creating invoice');
  const result = await client.createInvoice(payload);
  return {
    data: filterInvoiceCreated(result as AnyRecord),
    message: 'Invoice created successfully',
  };
}

export async function handleUpdateInvoice(client: FakturowniaApiClient, args: unknown) {
  const input = updateInvoiceInputSchema.parse(args);
  const payload: AnyRecord = {};

  if (input.buyer_name) payload.buyer_name = input.buyer_name;
  if (input.buyer_nip) payload.buyer_tax_no = input.buyer_nip;
  if (input.issue_date) payload.issue_date = input.issue_date;
  if (input.sell_date) payload.sell_date = input.sell_date;
  if (input.due_date) payload.payment_to = input.due_date;
  if (input.payment_method) payload.payment_type = input.payment_method;
  if (input.status) payload.status = input.status;
  if (input.notes) payload.note = input.notes;
  if (input.currency) payload.currency = input.currency;

  const result = await client.updateInvoice(input.id, payload);
  return { data: filterInvoiceDetail(result as AnyRecord), message: 'Invoice updated successfully' };
}

export async function handleDeleteInvoice(client: FakturowniaApiClient, args: unknown) {
  const input = deleteInvoiceInputSchema.parse(args);
  await client.deleteInvoice(input.id);
  return { message: `Invoice ${input.id} deleted permanently` };
}

export async function handleCancelInvoice(client: FakturowniaApiClient, args: unknown) {
  const input = cancelInvoiceInputSchema.parse(args);
  await client.cancelInvoice(input.id);
  return { message: `Invoice ${input.id} cancelled successfully` };
}

export async function handleSendInvoiceToKsef(client: FakturowniaApiClient, args: unknown) {
  const input = sendInvoiceToKsefInputSchema.parse(args);
  logger.info({ invoiceId: input.id }, 'Sending invoice to KSeF');
  const result = await client.sendInvoiceToKsef(input.id);
  return {
    data: filterInvoiceDetail(result as AnyRecord),
    message: `Invoice ${input.id} submitted to KSeF (check gov_status for processing result)`,
  };
}

export async function handleMarkInvoiceAsPaid(client: FakturowniaApiClient, args: unknown) {
  const input = markInvoiceAsPaidInputSchema.parse(args);
  const invoice = (await client.getInvoice(input.id)) as AnyRecord;
  const remaining = roundMoney(parseMoney(invoice.price_gross) - parseMoney(invoice.paid));

  if (remaining <= 0) {
    return {
      data: filterInvoiceDetail(invoice),
      message: `Invoice ${input.id} is already fully paid`,
    };
  }

  logger.info({ invoiceId: input.id, remaining }, 'Recording invoice payment');
  await client.createPayment({
    name: `Payment for invoice ${invoice.number ?? input.id}`,
    price: remaining,
    invoice_ids: [input.id],
    paid: true,
    kind: 'api',
    paid_date: input.payment_date,
  });

  const updated = (await client.getInvoice(input.id)) as AnyRecord;
  return {
    data: filterInvoiceDetail(updated),
    message: `Invoice ${input.id} marked as paid`,
  };
}

export async function handleGetClientInvoicesSummary(
  client: FakturowniaApiClient,
  args: unknown,
) {
  const input = getClientInvoicesSummaryInputSchema.parse(args);

  const query: AnyRecord = {
    client_id: input.client_id,
    per_page: 100,
    page: 1,
  };

  if (input.date_from || input.date_to) {
    query.period = 'more';
    query.search_date_type = 'issue_date';
    if (input.date_from) query.date_from = input.date_from;
    if (input.date_to) query.date_to = input.date_to;
  }

  const invoices = (await client.listInvoices(query)) as AnyRecord[];

  const summary = {
    total_count: invoices.length,
    total_net: 0,
    total_gross: 0,
    total_tax: 0,
    by_status: {} as Record<string, { count: number; gross: number }>,
  };

  for (const inv of invoices) {
    const net = Number(inv.price_net) || 0;
    const gross = Number(inv.price_gross) || 0;
    const tax = Number(inv.price_tax) || 0;
    summary.total_net += net;
    summary.total_gross += gross;
    summary.total_tax += tax;

    const status = String(inv.status || 'unknown');
    if (!summary.by_status[status]) {
      summary.by_status[status] = { count: 0, gross: 0 };
    }
    summary.by_status[status]!.count++;
    summary.by_status[status]!.gross += gross;
  }

  summary.total_net = Math.round(summary.total_net * 100) / 100;
  summary.total_gross = Math.round(summary.total_gross * 100) / 100;
  summary.total_tax = Math.round(summary.total_tax * 100) / 100;

  for (const s of Object.values(summary.by_status)) {
    s.gross = Math.round(s.gross * 100) / 100;
  }

  return { data: summary, message: `Summary for client ${input.client_id}: ${invoices.length} invoice(s)` };
}
