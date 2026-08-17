import type { Config } from '../config.js';

export function getProtectedResourceMetadata(config: Config) {
  if (!config.mcpPublicUrl || !config.mcpResourceUri) {
    throw new Error('OAuth is not configured');
  }

  return {
    resource: config.mcpResourceUri,
    authorization_servers: [config.mcpPublicUrl],
    bearer_methods_supported: ['header'],
  };
}

export function getAuthorizationServerMetadata(config: Config) {
  if (!config.mcpPublicUrl) {
    throw new Error('OAuth is not configured');
  }

  return {
    issuer: config.mcpPublicUrl,
    authorization_endpoint: `${config.mcpPublicUrl}/oauth/authorize`,
    token_endpoint: `${config.mcpPublicUrl}/oauth/token`,
    registration_endpoint: `${config.mcpPublicUrl}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  };
}
