import http from 'node:http';
import { config } from './config.js';
import { safeEqual } from './http-utils.js';
import { verifyAccessToken } from './oauth/tokens.js';

export async function isMcpAuthorized(req: http.IncomingMessage): Promise<boolean> {
  const authConfigured = !!config.mcpAccessApiKey || config.oauthEnabled;
  if (!authConfigured) {
    return true;
  }

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return false;
  }

  const token = auth.slice(7);

  if (config.mcpAccessApiKey && safeEqual(token, config.mcpAccessApiKey)) {
    return true;
  }

  if (config.oauthEnabled) {
    return verifyAccessToken(token, config);
  }

  return false;
}

export function sendMcpUnauthorized(res: http.ServerResponse) {
  if (config.oauthEnabled && config.protectedResourceMetadataUrl) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${config.protectedResourceMetadataUrl}"`,
    });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
}
