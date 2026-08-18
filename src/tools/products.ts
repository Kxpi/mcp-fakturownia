import type { FakturowniaApiClient } from '../api/fakturowniaClient.js';
import { filterProductList, filterProductDetail } from '../utils/responseFilter.js';
import {
  listProductsInputSchema,
  createProductInputSchema,
  updateProductInputSchema,
  deleteProductInputSchema,
} from '../schemas/products.js';
import { defineTool } from './defineTool.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

export const listProductsToolDef = defineTool(
  'list_products',
  'List products from the Fakturownia catalog. Returns: id, name, code, prices, VAT rate, unit. Default limit: 100.',
  listProductsInputSchema,
);

export const createProductToolDef = defineTool(
  'create_product',
  'Add a new product to the Fakturownia catalog. REQUIRES a name. Optionally set price_net or price_gross, VAT rate (default 23%), unit, code, description.',
  createProductInputSchema,
);

export const updateProductToolDef = defineTool(
  'update_product',
  'Update an existing product in the Fakturownia catalog. REQUIRES product ID. Only provided fields are updated. Note: net price is recalculated from gross price and VAT rate by the API.',
  updateProductInputSchema,
);

export const deleteProductToolDef = defineTool(
  'delete_product',
  'Delete a product from the Fakturownia catalog. REQUIRES product ID and confirm=true.',
  deleteProductInputSchema,
);

export async function handleListProducts(client: FakturowniaApiClient, args: unknown) {
  const input = listProductsInputSchema.parse(args);
  const products = await client.listProducts({
    per_page: input.limit,
    page: input.page,
  });
  const filtered = filterProductList(products as AnyRecord[]);
  return { data: filtered, count: filtered.length, message: `Found ${filtered.length} product(s)` };
}

export async function handleCreateProduct(client: FakturowniaApiClient, args: unknown) {
  const input = createProductInputSchema.parse(args);
  const payload: AnyRecord = { name: input.name };
  if (input.code) payload.code = input.code;
  if (input.price_net !== undefined) payload.price_net = input.price_net;
  if (input.price_gross !== undefined) payload.price_gross = input.price_gross;
  if (input.vat_rate !== undefined) payload.tax = input.vat_rate;
  if (input.unit) payload.quantity_unit = input.unit;
  if (input.description) payload.description = input.description;

  const result = await client.createProduct(payload);
  return { data: filterProductDetail(result as AnyRecord), message: 'Product created successfully' };
}

export async function handleUpdateProduct(client: FakturowniaApiClient, args: unknown) {
  const input = updateProductInputSchema.parse(args);
  const payload: AnyRecord = {};
  if (input.name) payload.name = input.name;
  if (input.code) payload.code = input.code;
  if (input.price_net !== undefined) payload.price_net = input.price_net;
  if (input.price_gross !== undefined) payload.price_gross = input.price_gross;
  if (input.vat_rate !== undefined) payload.tax = input.vat_rate;
  if (input.unit) payload.quantity_unit = input.unit;
  if (input.description) payload.description = input.description;

  const result = await client.updateProduct(input.id, payload);
  return { data: filterProductDetail(result as AnyRecord), message: 'Product updated successfully' };
}

export async function handleDeleteProduct(client: FakturowniaApiClient, args: unknown) {
  const input = deleteProductInputSchema.parse(args);
  await client.deleteProduct(input.id);
  return { message: `Product ${input.id} deleted successfully` };
}
