const CLIENT_LIST_FIELDS = [
  'id', 'name', 'tax_no', 'street', 'city', 'post_code', 'country', 'email', 'phone',
] as const;

const CLIENT_DETAIL_FIELDS = [
  ...CLIENT_LIST_FIELDS,
  'shortcut', 'note', 'bank', 'bank_account', 'www', 'created_at',
] as const;

const INVOICE_LIST_FIELDS = [
  'id', 'number', 'issue_date', 'payment_to', 'status', 'kind',
  'price_net', 'price_gross', 'price_tax',
  'buyer_name', 'buyer_tax_no', 'currency',
  'gov_status', 'gov_id',
] as const;

const INVOICE_DETAIL_FIELDS = [
  ...INVOICE_LIST_FIELDS,
  'sell_date', 'payment_type', 'note', 'seller_name',
  'buyer_street', 'buyer_city', 'buyer_post_code',
  'positions', 'view_url', 'client_id',
] as const;

const INVOICE_CREATED_FIELDS = [
  'id', 'number', 'issue_date', 'payment_to', 'status',
  'price_net', 'price_gross', 'price_tax',
  'buyer_name', 'view_url', 'gov_status', 'gov_id',
] as const;

const POSITION_FIELDS = [
  'id', 'name', 'quantity', 'tax', 'total_price_gross', 'total_price_net',
  'quantity_unit',
] as const;

const EXPENSE_LIST_FIELDS = [
  'id', 'number', 'issue_date', 'payment_to', 'status', 'kind',
  'price_net', 'price_gross', 'price_tax',
  'buyer_name', 'buyer_tax_no', 'accounting_kind', 'currency',
] as const;

const EXPENSE_DETAIL_FIELDS = [
  ...EXPENSE_LIST_FIELDS,
  'sell_date', 'delivery_date', 'payment_type', 'note',
  'buyer_street', 'buyer_city', 'buyer_post_code',
  'positions', 'view_url',
] as const;

const EXPENSE_CREATED_FIELDS = [
  'id', 'number', 'issue_date', 'payment_to', 'status',
  'price_net', 'price_gross', 'price_tax',
  'buyer_name', 'accounting_kind', 'view_url',
] as const;

const PRODUCT_FIELDS = [
  'id', 'name', 'code', 'price_net', 'price_gross', 'tax',
  'quantity_unit', 'description', 'created_at',
] as const;

function pickFields<T extends Record<string, unknown>>(
  obj: T,
  fields: readonly string[],
): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = obj[field];
    if (value !== undefined && value !== null && value !== '') {
      result[field] = value;
    }
  }
  return result as Partial<T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

export function filterClientList(clients: AnyRecord[]): AnyRecord[] {
  return clients.map((c) => pickFields(c, CLIENT_LIST_FIELDS));
}

export function filterClientDetail(client: AnyRecord): AnyRecord {
  return pickFields(client, CLIENT_DETAIL_FIELDS);
}

export function filterInvoiceList(invoices: AnyRecord[]): AnyRecord[] {
  return invoices.map((inv) => pickFields(inv, INVOICE_LIST_FIELDS));
}

export function filterInvoiceDetail(invoice: AnyRecord): AnyRecord {
  const filtered = pickFields(invoice, INVOICE_DETAIL_FIELDS);
  if (Array.isArray(filtered.positions)) {
    filtered.positions = filtered.positions.map((p: AnyRecord) =>
      pickFields(p, POSITION_FIELDS),
    );
  }
  return filtered;
}

export function filterInvoiceCreated(invoice: AnyRecord): AnyRecord {
  return pickFields(invoice, INVOICE_CREATED_FIELDS);
}

export function filterExpenseList(expenses: AnyRecord[]): AnyRecord[] {
  return expenses.map((e) => pickFields(e, EXPENSE_LIST_FIELDS));
}

export function filterExpenseDetail(expense: AnyRecord): AnyRecord {
  const filtered = pickFields(expense, EXPENSE_DETAIL_FIELDS);
  if (Array.isArray(filtered.positions)) {
    filtered.positions = filtered.positions.map((p: AnyRecord) =>
      pickFields(p, POSITION_FIELDS),
    );
  }
  return filtered;
}

export function filterExpenseCreated(expense: AnyRecord): AnyRecord {
  return pickFields(expense, EXPENSE_CREATED_FIELDS);
}

export function filterProductList(products: AnyRecord[]): AnyRecord[] {
  return products.map((p) => pickFields(p, PRODUCT_FIELDS));
}

export function filterProductDetail(product: AnyRecord): AnyRecord {
  return pickFields(product, PRODUCT_FIELDS);
}
