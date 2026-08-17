#!/usr/bin/env node

import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { createMcpServer } from './server.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const transports: Record<string, StreamableHTTPServerTransport> = {};

function setCorsHeaders(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Mcp-Session-Id, Last-Event-Id, Mcp-Protocol-Version',
  );
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Mcp-Session-Id, Mcp-Protocol-Version',
  );
}

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function isAuthorized(req: http.IncomingMessage): boolean {
  if (!config.mcpAccessApiKey) return true;
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  return safeEqual(auth.slice(7), config.mcpAccessApiKey);
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (url.pathname === '/' && req.method === 'GET') {
    sendJson(res, 200, {
      name: 'fakturownia-mcp',
      version: '1.0.0',
      transport: 'streamable-http',
      activeSessions: Object.keys(transports).length,
    });
    return;
  }

  if (url.pathname === '/health' && req.method === 'GET') {
    sendJson(res, 200, {
      status: 'ok',
      activeSessions: Object.keys(transports).length,
    });
    return;
  }

  if (url.pathname === '/mcp') {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (req.method === 'POST') {
      try {
        const bodyText = await readBody(req);
        const body = JSON.parse(bodyText);

        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId]!;
        } else if (!sessionId && isInitializeRequest(body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              logger.info({ sessionId: sid }, 'New MCP session initialized');
              transports[sid] = transport;
            },
          });

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              logger.info({ sessionId: sid }, 'Transport closed, cleaning up');
              delete transports[sid];
            }
          };

          const mcpServer = createMcpServer();
          await mcpServer.connect(transport);

          await transport.handleRequest(req, res, body);
          return;
        } else {
          sendJson(res, 400, {
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
            id: null,
          });
          return;
        }

        await transport.handleRequest(req, res, body);
      } catch (error) {
        logger.error({ error }, 'Error handling MCP POST request');
        if (!res.headersSent) {
          sendJson(res, 500, {
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      }
      return;
    }

    if (req.method === 'GET') {
      if (!sessionId || !transports[sessionId]) {
        res.writeHead(400);
        res.end('Invalid or missing session ID');
        return;
      }
      const transport = transports[sessionId]!;
      await transport.handleRequest(req, res);
      return;
    }

    if (req.method === 'DELETE') {
      if (!sessionId || !transports[sessionId]) {
        res.writeHead(400);
        res.end('Invalid or missing session ID');
        return;
      }
      const transport = transports[sessionId]!;
      await transport.handleRequest(req, res);
      return;
    }

    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      baseUrl: config.fakturowniaBaseUrl,
      ceidgEnabled: !!config.ceidgApiToken,
      mcpAuthEnabled: !!config.mcpAccessApiKey,
    },
    `Fakturownia MCP HTTP server listening on port ${PORT}`,
  );
});

async function shutdown() {
  logger.info('Shutting down HTTP server...');

  for (const sessionId of Object.keys(transports)) {
    try {
      logger.info({ sessionId }, 'Closing transport');
      await transports[sessionId]!.close();
      delete transports[sessionId];
    } catch (error) {
      logger.error({ sessionId, error }, 'Error closing transport');
    }
  }

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn('Forcing shutdown after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  process.exit(1);
});
