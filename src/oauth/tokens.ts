import { SignJWT, jwtVerify } from 'jose';
import type { Config } from '../config.js';

const textEncoder = new TextEncoder();

function getSecretKey(config: Config) {
  if (!config.oauthJwtSecret) {
    throw new Error('OAuth JWT secret is not configured');
  }
  return textEncoder.encode(config.oauthJwtSecret);
}

export async function issueAccessToken(config: Config): Promise<string> {
  if (!config.mcpPublicUrl || !config.mcpResourceUri) {
    throw new Error('OAuth public URL is not configured');
  }

  return new SignJWT({ sub: 'owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.mcpPublicUrl)
    .setAudience(config.mcpResourceUri)
    .setIssuedAt()
    .setExpirationTime(`${config.oauthAccessTokenTtlSeconds}s`)
    .sign(getSecretKey(config));
}

export async function verifyAccessToken(token: string, config: Config): Promise<boolean> {
  if (!config.oauthEnabled || !config.mcpResourceUri || !config.mcpPublicUrl) {
    return false;
  }

  try {
    await jwtVerify(token, getSecretKey(config), {
      issuer: config.mcpPublicUrl,
      audience: config.mcpResourceUri,
    });
    return true;
  } catch {
    return false;
  }
}
