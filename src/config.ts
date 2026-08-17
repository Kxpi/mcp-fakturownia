import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const baseConfigSchema = z.object({
  fakturowniaBaseUrl: z
    .string()
    .url('FAKTUROWNIA_BASE_URL must be a valid URL')
    .transform((url) => url.replace(/\/+$/, '')),
  fakturowniaApiToken: z.string().min(1, 'FAKTUROWNIA_API_TOKEN is required'),
  ceidgApiToken: z.string().optional(),
  mcpAccessApiKey: z.string().min(16).optional(),
  mcpPublicUrl: z
    .string()
    .url('MCP_PUBLIC_URL must be a valid URL')
    .transform((url) => url.replace(/\/+$/, ''))
    .optional(),
  oauthJwtSecret: z.string().min(32).optional(),
  oauthConsentPassword: z.string().min(1).optional(),
  oauthAccessTokenTtlSeconds: z.coerce.number().positive().default(86400),
  oauthCodeTtlSeconds: z.coerce.number().positive().default(600),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  requestTimeoutMs: z.coerce.number().positive().default(20000),
});

export type Config = z.infer<typeof baseConfigSchema> & {
  oauthEnabled: boolean;
  mcpResourceUri?: string;
  protectedResourceMetadataUrl?: string;
};

function parseConfig(): Config {
  const result = baseConfigSchema.safeParse({
    fakturowniaBaseUrl: process.env.FAKTUROWNIA_BASE_URL,
    fakturowniaApiToken: process.env.FAKTUROWNIA_API_TOKEN,
    ceidgApiToken: process.env.CEIDG_API_TOKEN || undefined,
    mcpAccessApiKey: process.env.MCP_ACCESS_API_KEY || undefined,
    mcpPublicUrl: process.env.MCP_PUBLIC_URL || undefined,
    oauthJwtSecret: process.env.OAUTH_JWT_SECRET || undefined,
    oauthConsentPassword: process.env.OAUTH_CONSENT_PASSWORD || undefined,
    oauthAccessTokenTtlSeconds: process.env.OAUTH_ACCESS_TOKEN_TTL_SECONDS || 86400,
    oauthCodeTtlSeconds: process.env.OAUTH_CODE_TTL_SECONDS || 600,
    logLevel: process.env.LOG_LEVEL || 'info',
    requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS || 20000,
  });

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Configuration error:\n${errors}`);
    process.exit(1);
  }

  const data = result.data;
  const hasPublicUrl = !!data.mcpPublicUrl;
  const hasJwtSecret = !!data.oauthJwtSecret;
  const hasConsentPassword = !!data.oauthConsentPassword;
  const oauthEnabled = hasPublicUrl && hasJwtSecret;

  if (hasPublicUrl !== hasJwtSecret) {
    console.error(
      'Configuration error:\n  - MCP_PUBLIC_URL and OAUTH_JWT_SECRET must both be set to enable OAuth',
    );
    process.exit(1);
  }

  if (oauthEnabled && !hasConsentPassword) {
    console.error(
      'Configuration error:\n  - OAUTH_CONSENT_PASSWORD is required when OAuth is enabled',
    );
    process.exit(1);
  }

  if (hasConsentPassword && !oauthEnabled) {
    console.error(
      'Configuration error:\n  - OAUTH_CONSENT_PASSWORD requires MCP_PUBLIC_URL and OAUTH_JWT_SECRET',
    );
    process.exit(1);
  }

  return {
    ...data,
    oauthEnabled,
    mcpResourceUri: data.mcpPublicUrl ? `${data.mcpPublicUrl}/mcp` : undefined,
    protectedResourceMetadataUrl: data.mcpPublicUrl
      ? `${data.mcpPublicUrl}/.well-known/oauth-protected-resource`
      : undefined,
  };
}

export const config = parseConfig();
