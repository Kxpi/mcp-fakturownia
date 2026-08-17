#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { createMcpServer } from './server.js';

async function main() {
  logger.info(
    {
      baseUrl: config.fakturowniaBaseUrl,
      logLevel: config.logLevel,
      ceidgEnabled: !!config.ceidgApiToken,
    },
    'Starting Fakturownia MCP server (stdio)',
  );

  const server = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info('MCP server connected via stdio');
}

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  process.exit(1);
});

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start server');
  process.exit(1);
});
