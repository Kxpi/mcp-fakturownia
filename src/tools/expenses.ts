import type { FakturowniaApiClient } from '../api/fakturowniaClient.js';
import { logger } from '../logger.js';
import { calculateGrossFromNet } from '../utils/money.js';
import {
  filterExpenseList,
  filterExpenseDetail,
  filterExpenseCreated,
} from '../utils/responseFilter.js';
import {
  getExpensesInputSchema,
  getExpenseByIdInputSchema,
  createExpenseInputSchema,
  deleteExpenseInputSchema,
  resolveExpenseDates,
} from '../schemas/expenses.js';
import type { InvoicePosition } from '../schemas/invoices.js';

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

export const getExpensesToolDef = {
  name: 'get_expenses',
  description:
    'List expense invoices (faktury kosztowe / wydatki). These are cost/purchase invoices received from vendors. Defaults to last 30 days. Returns: id, number, date, status, amounts, vendor name (buyer_name field), accounting category. Use date_from/date_to (YYYY-MM-DD) to filter. Optionally filter by accounting_kind: purchases, expenses, media, salary, incident, fuel0, fuel_expl75, fuel_expl100, fixed_assets, fixed_assets50, no_vat_deduction.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      date_from: { type: 'string', description: 'Start date YYYY-MM-DD (default: 30 days ago)' },
      date_to: { type: 'string', description: 'End date YYYY-MM-DD (default: today)' },
      status: { type: 'string', description: 'Filter by status: issued, paid, rejected, cancelled' },
      accounting_kind: {
        type: 'string',
        description: 'Filter by expense category: purchases, expenses, media, salary, incident, fuel0, fuel_expl75, fuel_expl100, fixed_assets, fixed_assets50, no_vat_deduction',
      },
      page: { type: 'number', description: 'Page number (default: 1)' },
      per_page: { type: 'number', description: 'Results per page (1-100, default: 25)' },
    },
  },
};

export const getExpenseByIdToolDef = {
  name: 'get_expense_by_id',
  description:
    'Get full expense details including line items (positions). REQUIRES expense ID. Returns all fields: dates, amounts, vendor info, positions with prices, accounting category, delivery date, and a direct view URL.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: ['string', 'number'], description: 'Expense ID (REQUIRED)' },
    },
    required: ['id'],
  },
};

export const createExpenseToolDef = {
  name: 'create_expense',
  description:
    'Create a new expense invoice (faktura kosztowa) in Fakturownia. This records an invoice received from a vendor/supplier. REQUIRES: vendor_name and at least one position. Each position needs: name, quantity, vat_rate (default 23%), and either unit_price_net or unit_price_gross. IMPORTANT: vendor_name and vendor_nip refer to the company that issued the invoice to you (the seller/supplier). Optionally set accounting_kind to categorize the expense: purchases (goods/materials), expenses (operating), media (telecom), salary, incident (incidental costs), fuel0/fuel_expl75/fuel_expl100 (fuel), fixed_assets/fixed_assets50 (fixed assets), no_vat_deduction.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      vendor_name: { type: 'string', description: 'Vendor/supplier name (REQUIRED — the company that issued the invoice)' },
      vendor_nip: { type: 'string', description: 'Vendor NIP (tax ID)' },
      positions: {
        type: 'array',
        description: 'Expense line items (REQUIRED, at least 1)',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Item/service name (REQUIRED)' },
            quantity: { type: 'number', description: 'Quantity (default: 1)' },
            unit: { type: 'string', description: 'Unit (e.g., "szt.", "godz.", "usł.")' },
            vat_rate: { type: 'number', description: 'VAT rate % (default: 23)' },
            unit_price_net: { type: 'number', description: 'Unit price net (provide this OR unit_price_gross)' },
            unit_price_gross: { type: 'number', description: 'Unit price gross (provide this OR unit_price_net)' },
          },
          required: ['name'],
        },
      },
      accounting_kind: {
        type: 'string',
        description: 'Expense category: purchases, expenses, media, salary, incident, fuel0, fuel_expl75, fuel_expl100, fixed_assets, fixed_assets50, no_vat_deduction',
      },
      issue_date: { type: 'string', description: 'Issue date YYYY-MM-DD (default: today)' },
      sell_date: { type: 'string', description: 'Sell/service date YYYY-MM-DD (default: issue_date)' },
      due_date: { type: 'string', description: 'Due date YYYY-MM-DD (default: issue_date + 14 days)' },
      delivery_date: { type: 'string', description: 'Delivery/receipt date YYYY-MM-DD (data wpłynięcia)' },
      payment_method: { type: 'string', description: 'Payment method: transfer, cash, card, etc.' },
      currency: { type: 'string', description: 'Currency code (default: PLN)' },
      notes: { type: 'string', description: 'Notes on the expense' },
    },
    required: ['vendor_name', 'positions'],
  },
};

export const deleteExpenseToolDef = {
  name: 'delete_expense',
  description:
    'Permanently delete an expense invoice. This CANNOT be undone. REQUIRES expense ID and confirm=true.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: ['string', 'number'], description: 'Expense ID (REQUIRED)' },
      confirm: { type: 'boolean', description: 'Must be true to confirm (REQUIRED)' },
    },
    required: ['id', 'confirm'],
  },
};

// --- Handlers ---

export async function handleGetExpenses(client: FakturowniaApiClient, args: unknown) {
  const input = getExpensesInputSchema.parse(args);

  const query: AnyRecord = {
    income: 'no',
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
  if (input.accounting_kind) query.accounting_kind = input.accounting_kind;

  const expenses = await client.listInvoices(query);
  const filtered = filterExpenseList(expenses as AnyRecord[]);
  return { data: filtered, count: filtered.length, message: `Found ${filtered.length} expense(s)` };
}

export async function handleGetExpenseById(client: FakturowniaApiClient, args: unknown) {
  const input = getExpenseByIdInputSchema.parse(args);
  const expense = await client.getInvoice(input.id);
  return { data: filterExpenseDetail(expense as AnyRecord), message: 'Expense details retrieved' };
}

export async function handleCreateExpense(client: FakturowniaApiClient, args: unknown) {
  const input = createExpenseInputSchema.parse(args);
  const dates = resolveExpenseDates(input);

  const positions = input.positions.map((pos) => buildPositionPayload(pos));

  const payload: AnyRecord = {
    kind: 'vat',
    income: '0',
    issue_date: dates.issue_date,
    sell_date: dates.sell_date,
    payment_to: dates.due_date,
    buyer_name: input.vendor_name,
    positions,
  };

  if (input.vendor_nip) payload.buyer_tax_no = input.vendor_nip;
  if (input.accounting_kind) payload.accounting_kind = input.accounting_kind;
  if (input.delivery_date) payload.delivery_date = input.delivery_date;
  if (input.payment_method) payload.payment_type = input.payment_method;
  if (input.currency) payload.currency = input.currency;
  if (input.notes) payload.note = input.notes;

  logger.info({ vendorName: input.vendor_name, positionCount: positions.length }, 'Creating expense');
  const result = await client.createInvoice(payload);
  return {
    data: filterExpenseCreated(result as AnyRecord),
    message: 'Expense created successfully',
  };
}

export async function handleDeleteExpense(client: FakturowniaApiClient, args: unknown) {
  const input = deleteExpenseInputSchema.parse(args);
  await client.deleteInvoice(input.id);
  return { message: `Expense ${input.id} deleted permanently` };
}
