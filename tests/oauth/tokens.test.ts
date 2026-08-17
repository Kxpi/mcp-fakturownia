import { describe, expect, it } from 'vitest';
import type { Config } from '../../src/config.js';
import { issueAccessToken, verifyAccessToken } from '../../src/oauth/tokens.js';

const oauthConfig = {
  oauthEnabled: true,
  mcpPublicUrl: 'https://mcp.example.com',
  mcpResourceUri: 'https://mcp.example.com/mcp',
  oauthJwtSecret: '01234567890123456789012345678901',
  oauthAccessTokenTtlSeconds: 3600,
  oauthCodeTtlSeconds: 600,
} as Config;

describe('tokens', () => {
  it('issues and verifies a JWT access token', async () => {
    const token = await issueAccessToken(oauthConfig);
    expect(await verifyAccessToken(token, oauthConfig)).toBe(true);
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await issueAccessToken(oauthConfig);
    const wrongAudienceConfig = {
      ...oauthConfig,
      mcpResourceUri: 'https://other.example.com/mcp',
    } as Config;

    expect(await verifyAccessToken(token, wrongAudienceConfig)).toBe(false);
  });

  it('rejects tampered tokens', async () => {
    const token = await issueAccessToken(oauthConfig);
    expect(await verifyAccessToken(`${token}x`, oauthConfig)).toBe(false);
  });
});
