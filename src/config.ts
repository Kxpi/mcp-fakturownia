import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const configSchema = z.object({
  fakturowniaBaseUrl: z
    .string()
    .url('FAKTUROWNIA_BASE_URL must be a valid URL')
    .transform((url) => url.replace(/\/+$/, '')),
  fakturowniaApiToken: z.string().min(1, 'FAKTUROWNIA_API_TOKEN is required'),
  ceidgApiToken: z.string().optional(),
  mcpAccessApiKey: z.string().min(16).optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  requestTimeoutMs: z.coerce.number().positive().default(20000),
  maxPageSize: z.coerce.number().positive().default(50),
});

export type Config = z.infer<typeof configSchema>;

function parseConfig(): Config {
  const result = configSchema.safeParse({
    fakturowniaBaseUrl: process.env.FAKTUROWNIA_BASE_URL,
    fakturowniaApiToken: process.env.FAKTUROWNIA_API_TOKEN,
    ceidgApiToken: process.env.CEIDG_API_TOKEN || undefined,
    mcpAccessApiKey: process.env.MCP_ACCESS_API_KEY || undefined,
    logLevel: process.env.LOG_LEVEL || 'info',
    requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS || 20000,
    maxPageSize: process.env.MAX_PAGE_SIZE || 50,
  });

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Configuration error:\n${errors}`);
    process.exit(1);
  }

  return result.data;
}

export const config = parseConfig();
