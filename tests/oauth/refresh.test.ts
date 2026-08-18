import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../../src/config.js';
import { verifyPkceS256 } from '../../src/oauth/pkce.js';
import {
  consumeAuthCode,
  createAuthCode,
  issueRefreshToken,
  registerClient,
  resetOAuthStore,
  rotateRefreshToken,
} from '../../src/oauth/store.js';
import { issueAccessToken, verifyAccessToken } from '../../src/oauth/tokens.js';

const oauthConfig = {
  oauthEnabled: true,
  mcpPublicUrl: 'https://mcp.example.com',
  mcpResourceUri: 'https://mcp.example.com/mcp',
  oauthJwtSecret: '01234567890123456789012345678901',
  oauthAccessTokenTtlSeconds: 3600,
  oauthCodeTtlSeconds: 600,
  oauthRefreshTokenTtlSeconds: 7776000,
} as Config;

function createPkceChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest().toString('base64url');
}

describe('oauth refresh tokens', () => {
  beforeEach(() => {
    process.env.OAUTH_DATA_DIR = path.join(
      os.tmpdir(),
      `oauth-refresh-${Date.now()}-${Math.random()}`,
    );
    resetOAuthStore();
  });

  afterEach(() => {
    resetOAuthStore();
    delete process.env.OAUTH_DATA_DIR;
  });

  it('issues a refresh token with authorization code exchange flow pieces', async () => {
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

    const consumed = consumeAuthCode(authCode.code);
    expect(consumed).toBeDefined();
    expect(verifyPkceS256(codeVerifier, consumed!.codeChallenge)).toBe(true);

    const refreshToken = issueRefreshToken(client.clientId, oauthConfig.oauthRefreshTokenTtlSeconds * 1000);
    const accessToken = await issueAccessToken(oauthConfig);

    expect(refreshToken.clientId).toBe(client.clientId);
    expect(await verifyAccessToken(accessToken, oauthConfig)).toBe(true);
  });

  it('rotates refresh tokens and rejects the old one', () => {
    const client = registerClient({
      redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
    });
    const original = issueRefreshToken(client.clientId, oauthConfig.oauthRefreshTokenTtlSeconds * 1000);

    const rotated = rotateRefreshToken(original.token, oauthConfig.oauthRefreshTokenTtlSeconds * 1000);
    expect(rotated?.token).not.toBe(original.token);
    expect(rotateRefreshToken(original.token, oauthConfig.oauthRefreshTokenTtlSeconds * 1000)).toBeUndefined();
  });

  it('rejects unknown refresh tokens', () => {
    expect(rotateRefreshToken('missing-token', oauthConfig.oauthRefreshTokenTtlSeconds * 1000)).toBeUndefined();
  });
});
