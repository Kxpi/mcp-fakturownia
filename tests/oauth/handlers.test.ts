import { describe, expect, it } from 'vitest';
import type { Config } from '../../src/config.js';
import { verifyPkceS256, createPkceChallenge } from '../../src/oauth/pkce.js';
import {
  consumeAuthCode,
  createAuthCode,
  getClient,
  registerClient,
  resetOAuthStore,
} from '../../src/oauth/store.js';
import { issueAccessToken, verifyAccessToken } from '../../src/oauth/tokens.js';

const oauthConfig = {
  oauthEnabled: true,
  mcpPublicUrl: 'https://mcp.example.com',
  mcpResourceUri: 'https://mcp.example.com/mcp',
  oauthJwtSecret: '01234567890123456789012345678901',
  oauthAccessTokenTtlSeconds: 3600,
  oauthCodeTtlSeconds: 600,
} as Config;

describe('oauth token exchange flow', () => {
  it('exchanges an authorization code for a JWT after PKCE verification', async () => {
    resetOAuthStore();

    const redirectUri = 'https://claude.ai/api/mcp/auth_callback';
    const client = registerClient({ redirectUris: [redirectUri] });
    const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const codeChallenge = createPkceChallenge(codeVerifier);

    const authCode = createAuthCode(
      {
        clientId: client.clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod: 'S256',
      },
      oauthConfig.oauthCodeTtlSeconds * 1000,
    );

    expect(getClient(client.clientId)).toBeDefined();

    const consumed = consumeAuthCode(authCode.code);
    expect(consumed).toBeDefined();
    expect(consumed?.clientId).toBe(client.clientId);
    expect(verifyPkceS256(codeVerifier, consumed!.codeChallenge)).toBe(true);
    expect(consumeAuthCode(authCode.code)).toBeUndefined();

    const accessToken = await issueAccessToken(oauthConfig);
    expect(await verifyAccessToken(accessToken, oauthConfig)).toBe(true);
  });
});
