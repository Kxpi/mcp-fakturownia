import type { FakturowniaApiClient } from '../api/fakturowniaClient.js';
import { logger } from '../logger.js';
import { calculateGrossFromNet, parseMoney, roundMoney } from '../utils/money.js';
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
  type InvoicePosition,
} from '../schemas/invoices.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function buildPositionPayload(pos: InvoicePosition): AnyRecord {
  let unitGross: number;
  if (pos.unit_price_gross !== undefined) {
    unitGross = pos.unit_price_gross;
  } else {
    unitGross = calculateGrossFromNet(pos.unit_price_net!, pos.vat_rate);
  }

  const totalGross = Math.round(unitGross * pos.quantity * 100) / 100;

  const payload: AnyRecord = {
    name: pos.name,
    quantity: pos.quantity,
    tax: pos.vat_rate,
    total_price_gross: totalGross,
  };
  if (pos.unit) payload.quantity_unit = pos.unit;
  return payload;
}

// --- Tool Definitions ---

export const getInvoicesToolDef = {
  name: 'get_invoices',
  description:
    'List invoices with optional filters. Defaults to the last 30 days. Returns: id, number, date, status, amounts, buyer info, gov_status, gov_id (KSeF). Use date_from/date_to (YYYY-MM-DD) to filter by date range.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      date_from: { type: 'string', description: 'Start date YYYY-MM-DD (default: 30 days ago)' },
      date_to: { type: 'string', description: 'End date YYYY-MM-DD (default: today)' },
      status: { type: 'string', description: 'Filter by status: issued, paid, rejected, cancelled' },
      client_id: { type: ['string', 'number'], description: 'Filter by client ID' },
      page: { type: 'number', description: 'Page number (default: 1)' },
      per_page: { type: 'number', description: 'Results per page (1-100, default: 25)' },
    },
  },
};

export const getInvoiceByIdToolDef = {
  name: 'get_invoice_by_id',
  description:
    'Get full invoice details including line items (positions). REQUIRES invoice ID. Returns all fields: dates, amounts, buyer/seller info, positions with prices, gov_status, gov_id (KSeF), and a direct view URL.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: ['string', 'number'], description: 'Invoice ID (REQUIRED)' },
    },
    required: ['id'],
  },
};

export const createInvoiceToolDef = {
  name: 'create_invoice',
  description:
    'Create a new invoice in Fakturownia. REQUIRES: client_id and at least one position. Each position needs: name, quantity, vat_rate (default 23%), and either unit_price_net or unit_price_gross. Dates default to today (issue) and +14 days (due). WORKFLOW: First find client ID using get_all_clients or get_client_by_nip, then create the invoice. Does NOT send to KSeF — sending is a separate explicit step via send_invoice_to_ksef.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      client_id: { type: ['string', 'number'], description: 'Client ID (REQUIRED — use get_all_clients to find)' },
      positions: {
        type: 'array',
        description: 'Invoice line items (REQUIRED, at least 1)',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Item name (REQUIRED)' },
            quantity: { type: 'number', description: 'Quantity (default: 1)' },
            unit: { type: 'string', description: 'Unit (e.g., "szt.", "godz.", "usł.")' },
            vat_rate: { type: 'number', description: 'VAT rate % (default: 23)' },
            unit_price_net: { type: 'number', description: 'Unit price net (provide this OR unit_price_gross)' },
            unit_price_gross: { type: 'number', description: 'Unit price gross (provide this OR unit_price_net)' },
          },
          required: ['name'],
        },
      },
      issue_date: { type: 'string', description: 'Issue date YYYY-MM-DD (default: today)' },
      sell_date: { type: 'string', description: 'Sell/service date YYYY-MM-DD (default: issue_date)' },
      due_date: { type: 'string', description: 'Due date YYYY-MM-DD (default: issue_date + 14 days)' },
      payment_method: { type: 'string', description: 'Payment method: transfer, cash, card, etc.' },
      currency: { type: 'string', description: 'Currency code (default: PLN)' },
      notes: { type: 'string', description: 'Notes on the invoice' },
      buyer_name: { type: 'string', description: 'Override buyer name (otherwise taken from client)' },
      buyer_nip: { type: 'string', description: 'Override buyer NIP' },
      draft: { type: 'boolean', description: 'Create as draft (default: false)' },
    },
    required: ['client_id', 'positions'],
  },
};

export const updateInvoiceToolDef = {
  name: 'update_invoice',
  description:
    'Update an existing invoice. REQUIRES invoice ID. Only provided fields are updated. Cannot change positions. Invoices already sent to KSeF cannot be edited — use mark_invoice_as_paid to record payment instead.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: ['string', 'number'], description: 'Invoice ID (REQUIRED)' },
      buyer_name: { type: 'string', description: 'Updated buyer name' },
      buyer_nip: { type: 'string', description: 'Updated buyer NIP' },
      issue_date: { type: 'string', description: 'Updated issue date YYYY-MM-DD' },
      sell_date: { type: 'string', description: 'Updated sell date YYYY-MM-DD' },
      due_date: { type: 'string', description: 'Updated due date YYYY-MM-DD' },
      payment_method: { type: 'string', description: 'Updated payment method' },
      status: { type: 'string', description: 'Updated status' },
      notes: { type: 'string', description: 'Updated notes' },
      currency: { type: 'string', description: 'Updated currency' },
    },
    required: ['id'],
  },
};

export const deleteInvoiceToolDef = {
  name: 'delete_invoice',
  description:
    'Permanently delete an invoice. This CANNOT be undone. REQUIRES invoice ID and confirm=true. Consider using cancel_invoice instead for a safer alternative.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: ['string', 'number'], description: 'Invoice ID (REQUIRED)' },
      confirm: { type: 'boolean', description: 'Must be true to confirm (REQUIRED)' },
    },
    required: ['id', 'confirm'],
  },
};

export const cancelInvoiceToolDef = {
  name: 'cancel_invoice',
  description:
    'Cancel an invoice (safer than deleting). Marks the invoice as cancelled without removing it. REQUIRES invoice ID.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: ['string', 'number'], description: 'Invoice ID (REQUIRED)' },
    },
    required: ['id'],
  },
};

export const sendInvoiceToKsefToolDef = {
  name: 'send_invoice_to_ksef',
  description:
    'Send an ALREADY CREATED invoice to KSeF. Does NOT create invoices. NEVER call this after create_invoice or as part of the create workflow. NEVER call unless the user explicitly asked to send this specific invoice to KSeF (or approved after you asked). REQUIRES invoice ID and confirm=true. IRREVERSIBLE: once gov_id is assigned the invoice cannot be edited, cancelled, or deleted. Returns gov_status and gov_id.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: ['string', 'number'], description: 'Invoice ID (REQUIRED)' },
      confirm: {
        type: 'boolean',
        description: 'Must be true to confirm sending to KSeF (REQUIRED)',
      },
    },
    required: ['id', 'confirm'],
  },
};

export const markInvoiceAsPaidToolDef = {
  name: 'mark_invoice_as_paid',
  description:
    'Record a payment against an invoice (works for KSeF-sent invoices that cannot be edited). Creates a banking payment for the unpaid balance. REQUIRES invoice ID. Optional payment_date (YYYY-MM-DD, default: today).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: ['string', 'number'], description: 'Invoice ID (REQUIRED)' },
      payment_date: { type: 'string', description: 'Payment date YYYY-MM-DD (default: today)' },
    },
    required: ['id'],
  },
};

export const getClientInvoicesSummaryToolDef = {
  name: 'get_client_invoices_summary',
  description:
    'Get aggregated invoice statistics for a client: total count, sum by status, totals net/gross. REQUIRES client_id. Optionally filter by date range.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      client_id: { type: ['string', 'number'], description: 'Client ID (REQUIRED)' },
      date_from: { type: 'string', description: 'Start date YYYY-MM-DD' },
      date_to: { type: 'string', description: 'End date YYYY-MM-DD' },
    },
    required: ['client_id'],
  },
};

// --- Handlers ---

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
