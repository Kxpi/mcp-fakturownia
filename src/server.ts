import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { FakturowniaApiClient } from './api/fakturowniaClient.js';
import { CeidgClient } from './api/ceidgClient.js';
import { FakturowniaError } from './utils/errors.js';

import { healthCheckToolDef, handleHealthCheck } from './tools/health.js';
import {
  getAllClientsToolDef,
  getClientByNipToolDef,
  getClientByNameToolDef,
  createClientToolDef,
  createClientByNipToolDef,
  updateClientToolDef,
  deleteClientToolDef,
  handleGetAllClients,
  handleGetClientByNip,
  handleGetClientByName,
  handleCreateClient,
  handleCreateClientByNip,
  handleUpdateClient,
  handleDeleteClient,
} from './tools/clients.js';
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
  handleGetInvoices,
  handleGetInvoiceById,
  handleCreateInvoice,
  handleUpdateInvoice,
  handleDeleteInvoice,
  handleCancelInvoice,
  handleSendInvoiceToKsef,
  handleMarkInvoiceAsPaid,
  handleGetClientInvoicesSummary,
} from './tools/invoices.js';
import {
  listProductsToolDef,
  createProductToolDef,
  updateProductToolDef,
  deleteProductToolDef,
  handleListProducts,
  handleCreateProduct,
  handleUpdateProduct,
  handleDeleteProduct,
} from './tools/products.js';
import {
  getExpensesToolDef,
  getExpenseByIdToolDef,
  createExpenseToolDef,
  deleteExpenseToolDef,
  handleGetExpenses,
  handleGetExpenseById,
  handleCreateExpense,
  handleDeleteExpense,
} from './tools/expenses.js';

const ALL_TOOLS = [
  healthCheckToolDef,
  getAllClientsToolDef,
  getClientByNipToolDef,
  getClientByNameToolDef,
  createClientToolDef,
  createClientByNipToolDef,
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

export function createMcpServer(): Server {
  const apiClient = new FakturowniaApiClient();
  const ceidgClient = new CeidgClient(config.ceidgApiToken);

  const server = new Server(
    { name: 'fakturownia-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info({ tool: name }, 'Tool called');

    try {
      let result: unknown;

      switch (name) {
        case 'health_check':
          result = await handleHealthCheck(apiClient);
          break;
        case 'get_all_clients':
          result = await handleGetAllClients(apiClient, args);
          break;
        case 'get_client_by_nip':
          result = await handleGetClientByNip(apiClient, args);
          break;
        case 'get_client_by_name':
          result = await handleGetClientByName(apiClient, args);
          break;
        case 'create_client':
          result = await handleCreateClient(apiClient, args);
          break;
        case 'create_client_by_nip':
          result = await handleCreateClientByNip(apiClient, ceidgClient, args);
          break;
        case 'update_client':
          result = await handleUpdateClient(apiClient, args);
          break;
        case 'delete_client':
          result = await handleDeleteClient(apiClient, args);
          break;
        case 'get_invoices':
          result = await handleGetInvoices(apiClient, args);
          break;
        case 'get_invoice_by_id':
          result = await handleGetInvoiceById(apiClient, args);
          break;
        case 'create_invoice':
          result = await handleCreateInvoice(apiClient, args);
          break;
        case 'update_invoice':
          result = await handleUpdateInvoice(apiClient, args);
          break;
        case 'delete_invoice':
          result = await handleDeleteInvoice(apiClient, args);
          break;
        case 'cancel_invoice':
          result = await handleCancelInvoice(apiClient, args);
          break;
        case 'send_invoice_to_ksef':
          result = await handleSendInvoiceToKsef(apiClient, args);
          break;
        case 'mark_invoice_as_paid':
          result = await handleMarkInvoiceAsPaid(apiClient, args);
          break;
        case 'get_client_invoices_summary':
          result = await handleGetClientInvoicesSummary(apiClient, args);
          break;
        case 'list_products':
          result = await handleListProducts(apiClient, args);
          break;
        case 'create_product':
          result = await handleCreateProduct(apiClient, args);
          break;
        case 'update_product':
          result = await handleUpdateProduct(apiClient, args);
          break;
        case 'delete_product':
          result = await handleDeleteProduct(apiClient, args);
          break;
        case 'get_expenses':
          result = await handleGetExpenses(apiClient, args);
          break;
        case 'get_expense_by_id':
          result = await handleGetExpenseById(apiClient, args);
          break;
        case 'create_expense':
          result = await handleCreateExpense(apiClient, args);
          break;
        case 'delete_expense':
          result = await handleDeleteExpense(apiClient, args);
          break;
        default:
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error({ tool: name, error }, 'Tool execution failed');

      if (error instanceof FakturowniaError) {
        return {
          content: [{ type: 'text', text: JSON.stringify(error.toJSON(), null, 2) }],
          isError: true,
        };
      }

      const message =
        error instanceof Error ? error.message : 'An unexpected error occurred';
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  return server;
}
