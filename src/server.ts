import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { FakturowniaApiClient } from './api/fakturowniaClient.js';
import { CeidgClient } from './api/ceidgClient.js';
import { VatWhitelistClient } from './api/vatWhitelistClient.js';
import { FakturowniaError } from './utils/errors.js';

import { healthCheckToolDef, handleHealthCheck } from './tools/health.js';
import {
  getAllClientsToolDef,
  getClientByNipToolDef,
  getClientByNameToolDef,
  lookupCompanyByNipToolDef,
  createClientToolDef,
  updateClientToolDef,
  deleteClientToolDef,
  handleGetAllClients,
  handleGetClientByNip,
  handleGetClientByName,
  handleLookupCompanyByNip,
  handleCreateClient,
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

type ToolHandler = (args: unknown) => Promise<unknown>;

export function createMcpServer(): Server {
  const apiClient = new FakturowniaApiClient();
  const vatClient = new VatWhitelistClient();
  const ceidgClient = new CeidgClient(config.ceidgApiToken);

  const tools: Array<{
    def: { name: string; description: string; inputSchema: unknown };
    handle: ToolHandler;
  }> = [
    { def: healthCheckToolDef, handle: () => handleHealthCheck(apiClient) },
    { def: getAllClientsToolDef, handle: (args) => handleGetAllClients(apiClient, args) },
    { def: getClientByNipToolDef, handle: (args) => handleGetClientByNip(apiClient, args) },
    { def: getClientByNameToolDef, handle: (args) => handleGetClientByName(apiClient, args) },
    {
      def: lookupCompanyByNipToolDef,
      handle: (args) => handleLookupCompanyByNip(vatClient, ceidgClient, args),
    },
    { def: createClientToolDef, handle: (args) => handleCreateClient(apiClient, args) },
    { def: updateClientToolDef, handle: (args) => handleUpdateClient(apiClient, args) },
    { def: deleteClientToolDef, handle: (args) => handleDeleteClient(apiClient, args) },
    { def: getInvoicesToolDef, handle: (args) => handleGetInvoices(apiClient, args) },
    { def: getInvoiceByIdToolDef, handle: (args) => handleGetInvoiceById(apiClient, args) },
    { def: createInvoiceToolDef, handle: (args) => handleCreateInvoice(apiClient, args) },
    { def: updateInvoiceToolDef, handle: (args) => handleUpdateInvoice(apiClient, args) },
    { def: deleteInvoiceToolDef, handle: (args) => handleDeleteInvoice(apiClient, args) },
    { def: cancelInvoiceToolDef, handle: (args) => handleCancelInvoice(apiClient, args) },
    { def: sendInvoiceToKsefToolDef, handle: (args) => handleSendInvoiceToKsef(apiClient, args) },
    { def: markInvoiceAsPaidToolDef, handle: (args) => handleMarkInvoiceAsPaid(apiClient, args) },
    {
      def: getClientInvoicesSummaryToolDef,
      handle: (args) => handleGetClientInvoicesSummary(apiClient, args),
    },
    { def: listProductsToolDef, handle: (args) => handleListProducts(apiClient, args) },
    { def: createProductToolDef, handle: (args) => handleCreateProduct(apiClient, args) },
    { def: updateProductToolDef, handle: (args) => handleUpdateProduct(apiClient, args) },
    { def: deleteProductToolDef, handle: (args) => handleDeleteProduct(apiClient, args) },
    { def: getExpensesToolDef, handle: (args) => handleGetExpenses(apiClient, args) },
    { def: getExpenseByIdToolDef, handle: (args) => handleGetExpenseById(apiClient, args) },
    { def: createExpenseToolDef, handle: (args) => handleCreateExpense(apiClient, args) },
    { def: deleteExpenseToolDef, handle: (args) => handleDeleteExpense(apiClient, args) },
  ];

  const byName = new Map(tools.map((tool) => [tool.def.name, tool]));

  const server = new Server(
    { name: 'fakturownia-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => tool.def),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info({ tool: name }, 'Tool called');

    const tool = byName.get(name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
        isError: true,
      };
    }

    try {
      const result = await tool.handle(args);
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

      const message = error instanceof Error ? error.message : 'An unexpected error occurred';
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  return server;
}

export { ALL_TOOL_DEFS } from './tools/registry.js';
