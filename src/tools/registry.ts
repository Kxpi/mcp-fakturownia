import { healthCheckToolDef } from './health.js';
import {
  getAllClientsToolDef,
  getClientByNipToolDef,
  getClientByNameToolDef,
  lookupCompanyByNipToolDef,
  createClientToolDef,
  updateClientToolDef,
  deleteClientToolDef,
} from './clients.js';
import {
  getInvoicesToolDef,
  getInvoiceByIdToolDef,
  createInvoiceToolDef,
  updateInvoiceToolDef,
  deleteInvoiceToolDef,
  cancelInvoiceToolDef,
  sendInvoiceToKsefToolDef,
  markInvoiceAsPaidToolDef,
  getClientInvoicesSummaryToolDef,
} from './invoices.js';
import {
  listProductsToolDef,
  createProductToolDef,
  updateProductToolDef,
  deleteProductToolDef,
} from './products.js';
import {
  getExpensesToolDef,
  getExpenseByIdToolDef,
  createExpenseToolDef,
  deleteExpenseToolDef,
} from './expenses.js';

export const ALL_TOOL_DEFS = [
  healthCheckToolDef,
  getAllClientsToolDef,
  getClientByNipToolDef,
  getClientByNameToolDef,
  lookupCompanyByNipToolDef,
  createClientToolDef,
  updateClientToolDef,
  deleteClientToolDef,
  getInvoicesToolDef,
  getInvoiceByIdToolDef,
  createInvoiceToolDef,
  updateInvoiceToolDef,
  deleteInvoiceToolDef,
  cancelInvoiceToolDef,
  sendInvoiceToKsefToolDef,
  markInvoiceAsPaidToolDef,
  getClientInvoicesSummaryToolDef,
  listProductsToolDef,
  createProductToolDef,
  updateProductToolDef,
  deleteProductToolDef,
  getExpensesToolDef,
  getExpenseByIdToolDef,
  createExpenseToolDef,
  deleteExpenseToolDef,
];
