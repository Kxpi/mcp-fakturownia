import { z } from 'zod';
import type { FakturowniaApiClient } from '../api/fakturowniaClient.js';
import { logger } from '../logger.js';
import { defineTool } from './defineTool.js';

const healthCheckInputSchema = z.object({});

export const healthCheckToolDef = defineTool(
  'health_check',
  'Verify connectivity to the Fakturownia API. Use this to check if the API is reachable and the token is valid. Returns a success message or error details.',
  healthCheckInputSchema,
);

export async function handleHealthCheck(client: FakturowniaApiClient) {
  logger.info('Running health check');
  await client.healthCheck();
  return {
    status: 'ok',
    message: 'Successfully connected to Fakturownia API',
  };
}
