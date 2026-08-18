export const ENDPOINTS = {
  clients: {
    list: '/clients.json',
    get: (id: number) => `/clients/${id}.json`,
    create: '/clients.json',
    update: (id: number) => `/clients/${id}.json`,
    delete: (id: number) => `/clients/${id}.json`,
  },
  invoices: {
    list: '/invoices.json',
    get: (id: number) => `/invoices/${id}.json`,
    create: '/invoices.json',
    update: (id: number) => `/invoices/${id}.json`,
    delete: (id: number) => `/invoices/${id}.json`,
    cancel: (id: number) => `/invoices/${id}/cancel.json`,
  },
  payments: {
    create: '/banking/payments.json',
  },
  products: {
    list: '/products.json',
    create: '/products.json',
    update: (id: number) => `/products/${id}.json`,
    delete: (id: number) => `/products/${id}.json`,
  },
} as const;

export function buildQueryParams(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number | boolean] => entry[1] !== undefined,
  );
  if (entries.length === 0) return '';
  const searchParams = new URLSearchParams();
  for (const [key, value] of entries) {
    searchParams.set(key, String(value));
  }
  return `?${searchParams.toString()}`;
}
