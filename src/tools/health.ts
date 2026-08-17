import type { FakturowniaApiClient } from '../api/fakturowniaClient.js';
import { logger } from '../logger.js';

export const healthCheckToolDef = {
  name: 'health_check',
  description:
    'Verify connectivity to the Fakturownia API. Use this to check if the API is reachable and the token is valid. Returns a success message or error details.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};

export async function handleHealthCheck(client: FakturowniaApiClient) {
  logger.info('Running health check');
  await client.healthCheck();
  return {
    status: 'ok',
    message: 'Successfully connected to Fakturownia API',
  };
}
